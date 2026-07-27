/* ============================================================
   BeatForge Studio — Audio Engine
   Web Audio synthesis: instruments, drums, effects, WAV encode
   ============================================================ */
'use strict';

const Engine = (() => {

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  let ctx = null;
  let live = null; // live mix graph (master, buses)

  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function midiName(m) { return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }

  /* ---------------- context ---------------- */

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      live = buildGraph(ctx);
    }
    return ctx;
  }

  function resume() {
    ensure();
    if (ctx.state === 'suspended') ctx.resume();
  }

  /* ---------------- mix graph ---------------- */

  function makeImpulse(c, seconds, decay) {
    const rate = c.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = c.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  const noiseCache = new WeakMap();
  function noiseBuffer(c) {
    let b = noiseCache.get(c);
    if (!b) {
      const len = Math.floor(c.sampleRate * 2);
      b = c.createBuffer(1, len, c.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      noiseCache.set(c, b);
    }
    return b;
  }

  // Build master chain + shared effect buses. Works for live and offline contexts.
  function buildGraph(c) {
    const master = c.createGain();
    master.gain.value = 0.9;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 24;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    master.connect(comp);
    comp.connect(c.destination);

    // Reverb send bus
    const reverbBus = c.createGain();
    const conv = c.createConvolver();
    conv.buffer = makeImpulse(c, 2.4, 2.6);
    const revReturn = c.createGain();
    revReturn.gain.value = 0.9;
    reverbBus.connect(conv);
    conv.connect(revReturn);
    revReturn.connect(master);

    // Tempo-synced delay send bus (dotted eighth)
    const delayBus = c.createGain();
    const delay = c.createDelay(2.0);
    delay.delayTime.value = 0.4;
    const fb = c.createGain();
    fb.gain.value = 0.35;
    const dampen = c.createBiquadFilter();
    dampen.type = 'lowpass';
    dampen.frequency.value = 3500;
    const dlyReturn = c.createGain();
    dlyReturn.gain.value = 0.9;
    delayBus.connect(delay);
    delay.connect(dampen);
    dampen.connect(fb);
    fb.connect(delay);
    dampen.connect(dlyReturn);
    dlyReturn.connect(master);

    return {
      ctx: c, master, comp, reverbBus, delayBus,
      setBpm(bpm) { delay.delayTime.value = Math.min(1.9, (60 / bpm) * 0.75); }
    };
  }

  // Per-track chain: input -> volume -> pan -> master, with reverb/delay sends.
  function makeTrackChain(c, graph) {
    const input = c.createGain();
    const vol = c.createGain();
    const pan = c.createStereoPanner();
    const sendR = c.createGain();
    const sendD = c.createGain();
    sendR.gain.value = 0;
    sendD.gain.value = 0;
    input.connect(vol);
    vol.connect(pan);
    pan.connect(graph.master);
    vol.connect(sendR);
    sendR.connect(graph.reverbBus);
    vol.connect(sendD);
    sendD.connect(graph.delayBus);
    return {
      input, vol, pan, sendR, sendD,
      apply(track, effectiveGain, smooth) {
        const t = c.currentTime;
        if (smooth) {
          vol.gain.setTargetAtTime(effectiveGain, t, 0.02);
          pan.pan.setTargetAtTime(track.pan, t, 0.02);
          sendR.gain.setTargetAtTime(track.reverb, t, 0.02);
          sendD.gain.setTargetAtTime(track.delay, t, 0.02);
        } else {
          vol.gain.value = effectiveGain;
          pan.pan.value = track.pan;
          sendR.gain.value = track.reverb;
          sendD.gain.value = track.delay;
        }
      },
      dispose() {
        try {
          input.disconnect(); vol.disconnect(); pan.disconnect();
          sendR.disconnect(); sendD.disconnect();
        } catch (e) { /* already gone */ }
      }
    };
  }

  /* ---------------- instruments ---------------- */

  const INSTRUMENTS = {
    piano:   { name: 'Grand Piano',
      filter: { freq: 5200, q: 0.4, track: 0.5 },
      env: { attack: 0.003, mode: 'perc', tau: 0.85, peak: 0.5, release: 0.25 },
      oscs: [ { type: 'triangle', gain: 0.7 }, { type: 'sine', ratio: 2, gain: 0.16 },
              { type: 'triangle', gain: 0.4, detune: 4 } ] },
    epiano:  { name: 'E-Piano',
      env: { attack: 0.004, mode: 'perc', tau: 0.7, peak: 0.45, release: 0.2 },
      trem: { rate: 5.2, depth: 0.28 },
      oscs: [ { type: 'sine', gain: 0.7 }, { type: 'sine', ratio: 3, gain: 0.07 },
              { type: 'sine', ratio: 7.1, gain: 0.015 } ] },
    organ:   { name: 'Organ',
      env: { attack: 0.02, decay: 0.05, sustain: 0.9, peak: 0.32, release: 0.12 },
      vib: { rate: 5.6, cents: 4 },
      oscs: [ { type: 'sine', gain: 0.55 }, { type: 'sine', ratio: 2, gain: 0.3 },
              { type: 'sine', ratio: 3, gain: 0.14 }, { type: 'sine', ratio: 4, gain: 0.08 } ] },
    lead:    { name: 'Synth Lead',
      filter: { freq: 3200, q: 1.2, track: 0.4 },
      env: { attack: 0.012, decay: 0.15, sustain: 0.7, peak: 0.32, release: 0.18 },
      vib: { rate: 5.2, cents: 7 },
      oscs: [ { type: 'sawtooth', gain: 0.5, detune: -6 }, { type: 'sawtooth', gain: 0.5, detune: 6 } ] },
    pad:     { name: 'Warm Pad',
      filter: { freq: 1300, q: 0.5 },
      env: { attack: 0.5, decay: 0.3, sustain: 0.85, peak: 0.3, release: 1.1 },
      oscs: [ { type: 'sawtooth', gain: 0.4, detune: -9 }, { type: 'sawtooth', gain: 0.4, detune: 9 },
              { type: 'triangle', gain: 0.3 } ] },
    strings: { name: 'Strings',
      filter: { freq: 2800, q: 0.5 },
      env: { attack: 0.26, decay: 0.2, sustain: 0.9, peak: 0.3, release: 0.8 },
      vib: { rate: 5.0, cents: 5 },
      oscs: [ { type: 'sawtooth', gain: 0.45, detune: -5 }, { type: 'sawtooth', gain: 0.45, detune: 5 } ] },
    bass:    { name: 'Deep Bass',
      filter: { freq: 560, q: 1.0 },
      env: { attack: 0.008, decay: 0.2, sustain: 0.8, peak: 0.5, release: 0.12 },
      oscs: [ { type: 'sawtooth', gain: 0.5 }, { type: 'sine', ratio: 0.5, gain: 0.6 } ] },
    pluck:   { name: 'Pluck',
      filter: { freq: 2400, q: 0.7, track: 0.6 },
      env: { attack: 0.003, mode: 'perc', tau: 0.18, peak: 0.5, release: 0.12 },
      oscs: [ { type: 'triangle', gain: 0.7 }, { type: 'square', gain: 0.18 } ] },
    bell:    { name: 'Bells',
      env: { attack: 0.003, mode: 'perc', tau: 1.1, peak: 0.32, release: 0.4 },
      fm: { ratio: 3.51, depth: 2.2, tau: 0.45 },
      oscs: [ { type: 'sine', gain: 0.6 }, { type: 'sine', ratio: 2.76, gain: 0.12 } ] }
  };

  function synthVoice(c, dest, t, freq, vel, cfg) {
    vel = Math.min(1, Math.max(0.05, vel));
    const out = c.createGain();
    out.gain.value = 0;
    let tail = out;
    let filter = null;
    if (cfg.filter) {
      filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      const trackMul = cfg.filter.track ? Math.pow(freq / 261.63, cfg.filter.track) : 1;
      filter.frequency.value = Math.min(12000, Math.max(120, cfg.filter.freq * trackMul));
      filter.Q.value = cfg.filter.q || 0.7;
      out.connect(filter);
      filter.connect(dest);
    } else {
      out.connect(dest);
    }

    const stops = [];
    const oscs = [];
    for (const o of cfg.oscs) {
      const osc = c.createOscillator();
      osc.type = o.type;
      osc.frequency.value = freq * (o.ratio || 1);
      if (o.detune) osc.detune.value = o.detune;
      const og = c.createGain();
      og.gain.value = o.gain == null ? 1 : o.gain;
      osc.connect(og);
      og.connect(out);
      osc.start(t);
      oscs.push(osc);
      stops.push(osc);
    }

    if (cfg.fm) {
      const mod = c.createOscillator();
      mod.frequency.value = freq * cfg.fm.ratio;
      const mg = c.createGain();
      mg.gain.setValueAtTime(freq * cfg.fm.depth, t);
      mg.gain.setTargetAtTime(0.0001, t, cfg.fm.tau || 0.4);
      mod.connect(mg);
      for (const osc of oscs) mg.connect(osc.frequency);
      mod.start(t);
      stops.push(mod);
    }

    const e = cfg.env;
    const peak = (e.peak || 0.3) * vel;

    if (cfg.trem) {
      const lfo = c.createOscillator();
      lfo.frequency.value = cfg.trem.rate;
      const lg = c.createGain();
      lg.gain.value = peak * cfg.trem.depth;
      lfo.connect(lg);
      lg.connect(out.gain);
      lfo.start(t);
      stops.push(lfo);
    }
    if (cfg.vib) {
      const lfo = c.createOscillator();
      lfo.frequency.value = cfg.vib.rate;
      const lg = c.createGain();
      lg.gain.value = freq * cfg.vib.cents * 0.000578; // cents -> Hz (approx)
      lfo.connect(lg);
      for (const osc of oscs) lg.connect(osc.frequency);
      lfo.start(t);
      stops.push(lfo);
    }

    const g = out.gain;
    const att = Math.max(e.attack || 0.005, 0.002);
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(peak, t + att);
    if (e.mode === 'perc') {
      g.setTargetAtTime(0.0001, t + att, e.tau || 0.5);
    } else {
      g.setTargetAtTime(Math.max(peak * (e.sustain == null ? 1 : e.sustain), 0.0001),
        t + att, Math.max(e.decay || 0.08, 0.01));
    }

    stops[0].onended = () => {
      try { out.disconnect(); if (filter) filter.disconnect(); } catch (err) { /* ok */ }
    };

    let released = false;
    function release(when) {
      if (released) return;
      released = true;
      const w = Math.max(when, t + att + 0.01);
      const rel = e.release || 0.15;
      g.setTargetAtTime(0.0001, w, Math.max(rel / 3, 0.02));
      const stopAt = w + Math.max(0.5, rel * 5);
      for (const s of stops) { try { s.stop(stopAt); } catch (err) { /* ok */ } }
    }
    return { release };
  }

  function playNote(c, dest, instId, t, midi, vel) {
    const cfg = INSTRUMENTS[instId] || INSTRUMENTS.piano;
    midi = Math.min(108, Math.max(12, Math.round(midi)));
    return synthVoice(c, dest, t, midiToFreq(midi), vel == null ? 0.85 : vel, cfg);
  }

  /* ---------------- drums ---------------- */

  const DRUMS = [
    { id: 'kick',  name: 'Kick' },
    { id: 'snare', name: 'Snare' },
    { id: 'clap',  name: 'Clap' },
    { id: 'hatC',  name: 'Hi-Hat' },
    { id: 'hatO',  name: 'Open Hat' },
    { id: 'tomL',  name: 'Low Tom' },
    { id: 'tomH',  name: 'High Tom' },
    { id: 'ride',  name: 'Ride' },
    { id: 'crash', name: 'Crash' }
  ];

  function noiseHit(c, dest, t, { dur, filterType, freq, q, peak }) {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q || 0.7;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t);
    src.stop(t + dur + 0.05);
    src.onended = () => { try { g.disconnect(); f.disconnect(); } catch (e) { /* ok */ } };
    return g;
  }

  function tone(c, dest, t, { type, f0, f1, slide, dur, peak }) {
    const o = c.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + (slide || dur));
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    o.onended = () => { try { g.disconnect(); } catch (e) { /* ok */ } };
  }

  const DRUM_SOUNDS = {
    kick(c, d, t, v) {
      tone(c, d, t, { type: 'sine', f0: 160, f1: 44, slide: 0.11, dur: 0.4, peak: 0.9 * v });
      noiseHit(c, d, t, { dur: 0.02, filterType: 'highpass', freq: 1800, peak: 0.25 * v });
    },
    snare(c, d, t, v) {
      noiseHit(c, d, t, { dur: 0.19, filterType: 'highpass', freq: 1400, peak: 0.5 * v });
      tone(c, d, t, { type: 'triangle', f0: 195, f1: 150, slide: 0.08, dur: 0.12, peak: 0.4 * v });
    },
    clap(c, d, t, v) {
      for (let i = 0; i < 3; i++) {
        noiseHit(c, d, t + i * 0.022, { dur: 0.03, filterType: 'bandpass', freq: 1200, q: 1.2, peak: 0.4 * v });
      }
      noiseHit(c, d, t + 0.066, { dur: 0.22, filterType: 'bandpass', freq: 1200, q: 1.0, peak: 0.45 * v });
    },
    hatC(c, d, t, v) {
      noiseHit(c, d, t, { dur: 0.05, filterType: 'highpass', freq: 7500, peak: 0.32 * v });
    },
    hatO(c, d, t, v) {
      noiseHit(c, d, t, { dur: 0.38, filterType: 'highpass', freq: 7000, peak: 0.3 * v });
    },
    tomL(c, d, t, v) {
      tone(c, d, t, { type: 'sine', f0: 150, f1: 85, slide: 0.2, dur: 0.35, peak: 0.6 * v });
      noiseHit(c, d, t, { dur: 0.02, filterType: 'highpass', freq: 2500, peak: 0.12 * v });
    },
    tomH(c, d, t, v) {
      tone(c, d, t, { type: 'sine', f0: 240, f1: 140, slide: 0.16, dur: 0.28, peak: 0.55 * v });
      noiseHit(c, d, t, { dur: 0.02, filterType: 'highpass', freq: 3000, peak: 0.12 * v });
    },
    ride(c, d, t, v) {
      noiseHit(c, d, t, { dur: 0.5, filterType: 'highpass', freq: 6500, peak: 0.2 * v });
      tone(c, d, t, { type: 'square', f0: 5200, dur: 0.12, peak: 0.03 * v });
    },
    crash(c, d, t, v) {
      noiseHit(c, d, t, { dur: 1.1, filterType: 'highpass', freq: 3800, peak: 0.42 * v });
    }
  };

  function playDrum(c, dest, idx, t, vel) {
    const drum = DRUMS[idx];
    if (!drum) return;
    DRUM_SOUNDS[drum.id](c, dest, t, vel == null ? 0.9 : Math.min(1, Math.max(0.05, vel)));
  }

  function click(c, dest, t, accent) {
    tone(c, dest, t, { type: 'sine', f0: accent ? 1320 : 880, dur: 0.05, peak: accent ? 0.35 : 0.22 });
  }

  /* ---------------- WAV encode / base64 ---------------- */

  function bufferToWav(abuf) {
    const numCh = Math.min(2, abuf.numberOfChannels);
    const sr = abuf.sampleRate;
    const len = abuf.length;
    const bytes = 44 + len * numCh * 2;
    const ab = new ArrayBuffer(bytes);
    const view = new DataView(ab);
    const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
    writeStr(0, 'RIFF');
    view.setUint32(4, bytes - 8, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numCh, true);
    view.setUint32(24, sr, true);
    view.setUint32(28, sr * numCh * 2, true);
    view.setUint16(32, numCh * 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, len * numCh * 2, true);
    const chans = [];
    for (let ch = 0; ch < numCh; ch++) chans.push(abuf.getChannelData(ch));
    let off = 44;
    for (let i = 0; i < len; i++) {
      for (let ch = 0; ch < numCh; ch++) {
        let s = Math.max(-1, Math.min(1, chans[ch][i]));
        view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        off += 2;
      }
    }
    return ab;
  }

  function abToB64(ab) {
    const u8 = new Uint8Array(ab);
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }

  function b64ToAb(b64) {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8.buffer;
  }

  /* ---------------- public API ---------------- */

  return {
    ensure, resume,
    get ctx() { return ctx; },
    get live() { return live; },
    buildGraph, makeTrackChain,
    INSTRUMENTS, DRUMS,
    playNote, playDrum, click,
    midiToFreq, midiName, NOTE_NAMES,
    bufferToWav, abToB64, b64ToAb
  };
})();
