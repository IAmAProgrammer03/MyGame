/* ============================================================
   BeatForge Studio — Application
   Tracks, transport, arrangement, piano roll, drum machine,
   virtual keys, mic recording, loops, mixing, save/export.
   ============================================================ */
'use strict';

(() => {

  /* ---------------- helpers ---------------- */

  const $ = (sel) => document.querySelector(sel);
  const EPS = 1e-6;
  const ROW_H = 84;
  const COLORS = ['#f2695c', '#f5a742', '#e8d44d', '#63c76a', '#4fc3f7', '#7a7ff2', '#c678dd', '#ef7fb1'];
  const uid = () => Math.random().toString(36).slice(2, 10);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  const actx = Engine.ensure();

  /* ---------------- state ---------------- */

  let project = {
    name: 'Untitled Song',
    bpm: 110,
    tracks: []
  };

  const state = {
    metronome: false,
    loopOn: false,
    loopStart: 0,
    loopEnd: 16,
    grid: 0.25,
    recording: false,
    recStartBeat: 0,
    micMode: 'notes',
    selectedTrackId: null,
    selectedClipId: null,
    activeTab: 'editor',
    kbdBase: 48 // C3; typing row roots at kbdBase + 12
  };

  const trans = {
    playing: false,
    startCtxTime: 0,
    startBeat: 0,
    lastScheduled: 0,
    pausedBeat: 0,
    playOrigin: 0,
    timer: null
  };

  const audioStore = new Map();   // bufferId -> AudioBuffer
  const chains = new Map();       // trackId -> track mix chain
  const activeAudio = new Set();  // playing AudioBufferSourceNodes
  const takeClips = {};           // trackId -> clip being recorded into
  const kbdVoices = new Map();    // midi -> { voice, startBeat, track }
  const heldCompKeys = new Set();

  let editor = { kind: null, trackId: null, clipId: null };
  let prSelNote = null;
  let uiDirty = true;
  let prDirty = true;

  /* ---------------- tiny utils ---------------- */

  function bps() { return project.bpm / 60; }
  function snapB(b) { return state.grid ? Math.round(b / state.grid) * state.grid : b; }
  function snapFloor(b) { return state.grid ? Math.floor(b / state.grid + EPS) * state.grid : b; }
  function selectedTrack() { return project.tracks.find(t => t.id === state.selectedTrackId) || null; }
  function trackById(id) { return project.tracks.find(t => t.id === id) || null; }
  function clipById(track, id) { return track ? track.clips.find(c => c.id === id) || null : null; }
  function editorTrack() { return trackById(editor.trackId); }
  function editorClip() { return clipById(editorTrack(), editor.clipId); }

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 2800);
  }

  function requestDraw() { uiDirty = true; prDirty = true; }

  /* ---------------- undo / redo ---------------- */

  const undoStack = [], redoStack = [];

  function cleanClip(c) {
    if (c.type === 'audio') {
      return { id: c.id, type: 'audio', name: c.name, start: c.start, length: c.length, bufferId: c.bufferId };
    }
    return {
      id: c.id, name: c.name, start: c.start, length: c.length,
      notes: c.notes.map(n => ({ pitch: n.pitch, start: n.start, length: n.length, vel: n.vel }))
    };
  }

  function snapshot() {
    return JSON.stringify({
      name: project.name, bpm: project.bpm,
      loopOn: state.loopOn, loopStart: state.loopStart, loopEnd: state.loopEnd,
      tracks: project.tracks.map(t => ({
        id: t.id, name: t.name, kind: t.kind, instrument: t.instrument,
        volume: t.volume, pan: t.pan, mute: t.mute, solo: t.solo, armed: t.armed,
        reverb: t.reverb, delay: t.delay, color: t.color,
        clips: t.clips.map(cleanClip)
      }))
    });
  }

  function pushUndo() {
    undoStack.push(snapshot());
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
  }

  function restore(s) {
    const d = JSON.parse(s);
    closeEditor();
    prSelNote = null;
    project.name = d.name;
    project.bpm = d.bpm;
    project.tracks = d.tracks;
    state.loopOn = d.loopOn;
    state.loopStart = d.loopStart;
    state.loopEnd = d.loopEnd;
    for (const [, chain] of chains) chain.dispose();
    chains.clear();
    state.selectedClipId = null;
    if (!trackById(state.selectedTrackId)) state.selectedTrackId = project.tracks[0] ? project.tracks[0].id : null;
    $('#bpm').value = project.bpm;
    $('#project-name').value = project.name;
    Engine.live.setBpm(project.bpm);
    rebuildHeaders();
    applyMix(false);
    updateToggleUI();
    requestDraw();
  }

  function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); }
  function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); }

  /* ---------------- tracks & mixing ---------------- */

  function getChain(track) {
    let ch = chains.get(track.id);
    if (!ch) {
      ch = Engine.makeTrackChain(actx, Engine.live);
      ch.apply(track, effectiveGain(track), false);
      chains.set(track.id, ch);
    }
    return ch;
  }

  function effectiveGain(track) {
    const anySolo = project.tracks.some(t => t.solo);
    return (track.mute || (anySolo && !track.solo)) ? 0 : track.volume;
  }

  function applyMix(smooth) {
    for (const track of project.tracks) getChain(track).apply(track, effectiveGain(track), smooth);
  }

  function createTrack(kind, opts = {}) {
    const n = project.tracks.length;
    const names = { inst: 'Piano', drum: 'Drums', audio: 'Audio' };
    const track = {
      id: uid(),
      name: opts.name || (opts.instrument ? Engine.INSTRUMENTS[opts.instrument].name : names[kind]),
      kind,
      instrument: kind === 'inst' ? (opts.instrument || 'piano') : null,
      volume: 0.8, pan: 0, mute: false, solo: false, armed: false,
      reverb: kind === 'drum' ? 0.08 : 0.16, delay: 0,
      color: COLORS[n % COLORS.length],
      clips: []
    };
    project.tracks.push(track);
    state.selectedTrackId = track.id;
    return track;
  }

  function deleteTrack(track) {
    pushUndo();
    const ch = chains.get(track.id);
    if (ch) { ch.dispose(); chains.delete(track.id); }
    project.tracks = project.tracks.filter(t => t !== track);
    if (editor.trackId === track.id) closeEditor();
    if (state.selectedTrackId === track.id) {
      state.selectedTrackId = project.tracks[0] ? project.tracks[0].id : null;
      state.selectedClipId = null;
    }
    rebuildHeaders();
    requestDraw();
  }

  /* ---------------- track headers UI ---------------- */

  const headersInner = $('#headers-inner');

  function miniBtn(label, title, cls, on) {
    const b = document.createElement('button');
    b.className = 'mini ' + cls;
    b.textContent = label;
    b.title = title;
    b.addEventListener('click', (e) => { e.stopPropagation(); on(b); });
    return b;
  }

  function sliderRow(items) {
    const row = document.createElement('div');
    row.className = 'th-sliders';
    for (const [label, min, max, step, val, cls, on] of items) {
      const lab = document.createElement('label');
      if (cls === 'rev' || cls === 'dly') lab.className = 'fxr';
      lab.append(label);
      const inp = document.createElement('input');
      inp.type = 'range';
      inp.min = min; inp.max = max; inp.step = step; inp.value = val;
      inp.className = cls;
      inp.addEventListener('input', () => on(parseFloat(inp.value)));
      inp.addEventListener('pointerdown', e => e.stopPropagation());
      lab.append(inp);
      row.append(lab);
    }
    return row;
  }

  function buildHeader(track) {
    const el = document.createElement('div');
    el.className = 'track-header' + (track.id === state.selectedTrackId ? ' selected' : '');
    el.addEventListener('click', () => {
      if (state.selectedTrackId !== track.id) {
        state.selectedTrackId = track.id;
        rebuildHeaders();
        requestDraw();
      }
    });

    const r1 = document.createElement('div');
    r1.className = 'th-row';
    const dot = document.createElement('span');
    dot.className = 'color-dot';
    dot.style.background = track.color;
    const name = document.createElement('input');
    name.className = 'tname';
    name.value = track.name;
    name.spellcheck = false;
    name.addEventListener('change', () => { track.name = name.value || 'Track'; updateMicTargetLabel(); requestDraw(); });
    name.addEventListener('keydown', e => e.stopPropagation());
    r1.append(dot, name);
    r1.append(miniBtn('⏺', 'Arm for recording', 'arm' + (track.armed ? ' on' : ''), () => {
      const was = track.armed;
      for (const t of project.tracks) t.armed = false;
      track.armed = !was;
      rebuildHeaders();
      updateMicTargetLabel();
    }));
    r1.append(miniBtn('✕', 'Delete track', 'del', () => deleteTrack(track)));
    el.append(r1);

    const r2 = document.createElement('div');
    r2.className = 'th-row';
    if (track.kind === 'inst') {
      const sel = document.createElement('select');
      sel.className = 'inst-sel';
      for (const [id, cfg] of Object.entries(Engine.INSTRUMENTS)) {
        const o = document.createElement('option');
        o.value = id; o.textContent = cfg.name;
        if (id === track.instrument) o.selected = true;
        sel.append(o);
      }
      sel.addEventListener('change', () => { track.instrument = sel.value; });
      sel.addEventListener('click', e => e.stopPropagation());
      r2.append(sel);
    } else {
      const tag = document.createElement('span');
      tag.className = 'kind-tag';
      tag.textContent = track.kind === 'drum' ? '🥁 Drum Kit' : '🎤 Audio';
      r2.append(tag);
    }
    r2.append(miniBtn('M', 'Mute', 'mute' + (track.mute ? ' on' : ''), (b) => {
      track.mute = !track.mute; b.classList.toggle('on', track.mute); applyMix(true);
    }));
    r2.append(miniBtn('S', 'Solo', 'solo' + (track.solo ? ' on' : ''), (b) => {
      track.solo = !track.solo; b.classList.toggle('on', track.solo); applyMix(true);
    }));
    el.append(r2);

    el.append(sliderRow([
      ['Vol', 0, 1, 0.01, track.volume, 'vol', v => { track.volume = v; applyMix(true); }],
      ['Pan', -1, 1, 0.01, track.pan, 'pan', v => { track.pan = v; applyMix(true); }]
    ]));
    el.append(sliderRow([
      ['Rev', 0, 1, 0.01, track.reverb, 'rev', v => { track.reverb = v; applyMix(true); }],
      ['Dly', 0, 1, 0.01, track.delay, 'dly', v => { track.delay = v; applyMix(true); }]
    ]));

    return el;
  }

  function rebuildHeaders() {
    headersInner.innerHTML = '';
    for (const track of project.tracks) headersInner.append(buildHeader(track));
    layoutArrange();
    updateMicTargetLabel();
  }

  /* ---------------- transport & scheduler ---------------- */

  const LOOKAHEAD = 0.16;

  function beatToTime(beat) { return trans.startCtxTime + (beat - trans.startBeat) / bps(); }

  function currentBeat() {
    if (!trans.playing) return trans.pausedBeat;
    let b = trans.startBeat + (actx.currentTime - trans.startCtxTime) * bps();
    // Anchors wrap slightly ahead of real time when looping; show the tail end.
    if (b < trans.startBeat - 1e-4 && state.loopOn && state.loopEnd > state.loopStart) {
      b += state.loopEnd - state.loopStart;
    }
    return Math.max(0, b);
  }

  function getPlayheadBeat() { return trans.playing ? currentBeat() : trans.pausedBeat; }

  function scheduleRange(a, b) {
    for (const track of project.tracks) {
      const chain = getChain(track);
      for (const clip of track.clips) {
        if (clip.type === 'audio') {
          if (clip.start >= a - EPS && clip.start < b - EPS) {
            startAudioClip(track, clip, beatToTime(clip.start), 0);
          }
          continue;
        }
        for (const n of clip.notes) {
          if (n.start >= clip.length - EPS) continue;
          const abs = clip.start + n.start;
          if (abs >= a - EPS && abs < b - EPS) {
            const when = beatToTime(abs);
            if (track.kind === 'drum') {
              Engine.playDrum(actx, chain.input, n.pitch, when, n.vel);
            } else {
              const lenB = Math.min(n.length, clip.length - n.start);
              const h = Engine.playNote(actx, chain.input, track.instrument, when, n.pitch, n.vel);
              h.release(when + Math.max(0.06, lenB / bps() * 0.98));
            }
          }
        }
      }
    }
    if (state.metronome || state.recording) {
      for (let k = Math.ceil(a - EPS); k < b - EPS; k++) {
        Engine.click(actx, Engine.live.master, beatToTime(k), k % 4 === 0);
      }
    }
  }

  function schedulerTick() {
    const targetTime = actx.currentTime + LOOKAHEAD;
    let guard = 0;
    while (guard++ < 10) {
      const targetBeat = trans.startBeat + (targetTime - trans.startCtxTime) * bps();
      const looping = state.loopOn && state.loopEnd > state.loopStart + 1e-3 &&
        trans.lastScheduled <= state.loopEnd + EPS;
      let end = targetBeat;
      if (looping && end > state.loopEnd) end = state.loopEnd;
      if (end > trans.lastScheduled) {
        scheduleRange(trans.lastScheduled, end);
        trans.lastScheduled = end;
      }
      if (looping && targetBeat >= state.loopEnd - EPS) {
        const wrapTime = trans.startCtxTime + (state.loopEnd - trans.startBeat) / bps();
        trans.startCtxTime = wrapTime;
        trans.startBeat = state.loopStart;
        trans.lastScheduled = state.loopStart;
        continue;
      }
      break;
    }
  }

  function startAudioClip(track, clip, when, offsetBeats) {
    const buffer = audioStore.get(clip.bufferId);
    if (!buffer) return;
    const offSec = offsetBeats / bps();
    if (offSec >= buffer.duration) return;
    const durSec = Math.min(buffer.duration - offSec, (clip.length - offsetBeats) / bps());
    if (durSec <= 0) return;
    const src = actx.createBufferSource();
    src.buffer = buffer;
    src.connect(getChain(track).input);
    src.start(Math.max(when, actx.currentTime), offSec, durSec);
    activeAudio.add(src);
    src.onended = () => activeAudio.delete(src);
  }

  function stopActiveAudio() {
    for (const src of activeAudio) { try { src.stop(); } catch (e) { /* ok */ } }
    activeAudio.clear();
  }

  function startPlayback(fromBeat) {
    Engine.resume();
    stopActiveAudio();
    trans.playing = true;
    trans.playOrigin = fromBeat;
    trans.startCtxTime = actx.currentTime + 0.08;
    trans.startBeat = fromBeat;
    trans.lastScheduled = fromBeat;
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        if (clip.type === 'audio' && clip.start < fromBeat - EPS && clip.start + clip.length > fromBeat + EPS) {
          startAudioClip(track, clip, trans.startCtxTime, fromBeat - clip.start);
        }
      }
    }
    schedulerTick();
    trans.timer = setInterval(schedulerTick, 25);
    updateTransportUI();
  }

  function haltTransport(atBeat) {
    // finalize while the transport still knows the true position,
    // so in-progress takes get their real end beat
    if (state.recording) finalizeRecording();
    if (trans.playing) trans.pausedBeat = atBeat != null ? atBeat : currentBeat();
    trans.playing = false;
    if (trans.timer) { clearInterval(trans.timer); trans.timer = null; }
    stopActiveAudio();
    updateTransportUI();
    updatePosDisplay();
    requestDraw();
  }

  function togglePlay() {
    if (trans.playing) haltTransport();
    else startPlayback(trans.pausedBeat);
  }

  function stopBtn() {
    if (trans.playing) haltTransport(trans.playOrigin);
    else { trans.pausedBeat = 0; updatePosDisplay(); requestDraw(); }
  }

  function seek(beat) {
    beat = Math.max(0, beat);
    if (trans.playing) {
      stopActiveAudio();
      trans.startCtxTime = actx.currentTime + 0.05;
      trans.startBeat = beat;
      trans.lastScheduled = beat;
      trans.playOrigin = beat;
      for (const track of project.tracks) {
        for (const clip of track.clips) {
          if (clip.type === 'audio' && clip.start < beat - EPS && clip.start + clip.length > beat + EPS) {
            startAudioClip(track, clip, trans.startCtxTime, beat - clip.start);
          }
        }
      }
    } else {
      trans.pausedBeat = beat;
    }
    updatePosDisplay();
    requestDraw();
  }

  function updateTransportUI() {
    $('#btn-play').textContent = trans.playing ? '⏸' : '▶';
    $('#btn-play').classList.toggle('playing', trans.playing);
    $('#btn-record').classList.toggle('on', state.recording);
  }

  function updateToggleUI() {
    $('#btn-metronome').classList.toggle('on', state.metronome);
    $('#btn-loop').classList.toggle('on', state.loopOn);
  }

  function updatePosDisplay() {
    const beat = getPlayheadBeat();
    const bar = Math.floor(beat / 4) + 1;
    const b = Math.floor(beat % 4) + 1;
    const six = Math.floor((beat * 4) % 4) + 1;
    $('#pos-display').textContent = `${bar}.${b}.${six}`;
    const sec = beat / bps();
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toFixed(1).padStart(4, '0');
    $('#time-display').textContent = `${m}:${s}`;
  }

  /* ---------------- recording ---------------- */

  function targetInstTrack() {
    const armed = project.tracks.find(t => t.armed);
    if (armed && armed.kind === 'inst') return armed;
    const sel = selectedTrack();
    if (sel && sel.kind === 'inst') return sel;
    return project.tracks.find(t => t.kind === 'inst') || null;
  }

  function micAudioTrack() {
    const armed = project.tracks.find(t => t.armed);
    if (armed && armed.kind === 'audio') return armed;
    return project.tracks.find(t => t.kind === 'audio') || null;
  }

  function ensureTakeClip(track, absBeat) {
    let clip = takeClips[track.id];
    if (!clip) {
      const start = Math.max(0, Math.floor(absBeat / 4) * 4);
      clip = { id: uid(), name: 'Take', start, length: 4, notes: [] };
      track.clips.push(clip);
      takeClips[track.id] = clip;
    }
    const endRel = absBeat - clip.start;
    if (endRel > clip.length - 0.25) clip.length = Math.ceil((endRel + 0.3) / 4) * 4;
    return clip;
  }

  function recordNote(track, midi, absStart, lenBeats) {
    if (!track || track.kind !== 'inst') return;
    midi = clamp(Math.round(midi), 24, 96);
    const clip = ensureTakeClip(track, absStart);
    let rel = Math.max(0, snapB(absStart - clip.start));
    const len = Math.max(0.125, state.grid ? Math.round(lenBeats / state.grid) * state.grid || state.grid : lenBeats);
    clip.notes.push({ pitch: midi, start: rel, length: len, vel: 0.85 });
    const endRel = rel + len;
    if (endRel > clip.length) clip.length = Math.ceil(endRel / 4) * 4;
    requestDraw();
  }

  async function toggleRecord() {
    if (state.recording) {
      finalizeRecording();
      updateTransportUI();
      return;
    }
    if (!project.tracks.length) { toast('Add a track first'); return; }
    let armed = project.tracks.find(t => t.armed);
    if (!armed) {
      const sel = selectedTrack() || project.tracks[0];
      sel.armed = true;
      armed = sel;
      rebuildHeaders();
    }
    pushUndo();
    if (state.micMode === 'audio') {
      let tr = micAudioTrack();
      if (!tr) {
        tr = createTrack('audio');
        for (const t of project.tracks) t.armed = false;
        tr.armed = true;
        rebuildHeaders();
      }
      if (!Pitch.running) {
        const r = await Pitch.start();
        if (!r.ok) toast(r.error);
        else $('#btn-mic-enable').classList.add('on');
        updateMicStatus();
      }
    }
    state.recording = true;
    state.recStartBeat = trans.playing ? currentBeat() : trans.pausedBeat;
    if (state.micMode === 'audio' && Pitch.running && micAudioTrack()) Pitch.beginCapture();
    if (!trans.playing) startPlayback(trans.pausedBeat);
    updateTransportUI();
    toast(state.micMode === 'audio' && micAudioTrack()
      ? 'Recording audio — play or sing!'
      : 'Recording — play the keys or your instrument!');
  }

  function finalizeRecording() {
    state.recording = false;
    // finish a held mic note
    if (micCap.active) endMicNote(currentBeat());
    micCap.active = null;
    micCap.candidate = null;
    // finish held keyboard notes
    for (const [midi, v] of kbdVoices) {
      if (v.startBeat != null && v.track) {
        recordNote(v.track, midi, v.startBeat, Math.max(0.125, currentBeat() - v.startBeat));
        v.startBeat = null;
      }
    }
    // audio take
    if (Pitch.capturing) {
      const buffer = Pitch.endCapture();
      const tr = micAudioTrack();
      if (buffer && tr && buffer.duration > 0.2) {
        const id = uid();
        audioStore.set(id, buffer);
        const lenB = Math.max(1, Math.ceil(buffer.duration * bps() * 4) / 4);
        tr.clips.push({
          id: uid(), type: 'audio', name: 'Take ' + (tr.clips.length + 1),
          start: Math.max(0, snapB(state.recStartBeat)), length: lenB, bufferId: id
        });
        toast('Audio take recorded ✓');
      }
    }
    for (const k of Object.keys(takeClips)) delete takeClips[k];
    updateTransportUI();
    requestDraw();
  }

  /* ---------------- mic: tuner + note capture ---------------- */

  const micCap = { candidate: null, active: null, silence: 0 };

  function endMicNote(endBeat) {
    const a = micCap.active;
    micCap.active = null;
    if (!a) return;
    const len = endBeat - a.startBeat;
    if (len < 0.09) return;
    recordNote(a.track, a.midi, a.startBeat, len);
  }

  function handleMicCapture(d) {
    if (!(state.recording && trans.playing && state.micMode === 'notes')) {
      micCap.active = null;
      micCap.candidate = null;
      micCap.silence = 0;
      return;
    }
    const track = targetInstTrack();
    if (!track) return;
    const beat = currentBeat();
    if (d.freq > 0 && d.midi >= 24 && d.midi <= 96) {
      micCap.silence = 0;
      if (micCap.candidate && micCap.candidate.midi === d.midi) micCap.candidate.frames++;
      else micCap.candidate = { midi: d.midi, frames: 1, beat };
      if (!micCap.active && micCap.candidate.frames >= 3) {
        micCap.active = { midi: d.midi, startBeat: micCap.candidate.beat, track };
      } else if (micCap.active && d.midi !== micCap.active.midi && micCap.candidate.frames >= 3) {
        endMicNote(micCap.candidate.beat);
        micCap.active = { midi: d.midi, startBeat: micCap.candidate.beat, track };
      }
    } else {
      micCap.silence++;
      if (micCap.silence >= 5) {
        if (micCap.active) endMicNote(beat);
        micCap.candidate = null;
      }
    }
  }

  Pitch.onFrame = (d) => {
    $('#mic-meter-fill').style.width = Math.min(100, d.rms * 420) + '%';
    const noteEl = $('#tuner-note');
    if (d.freq > 0) {
      noteEl.textContent = Engine.midiName(d.midi);
      noteEl.classList.toggle('in-tune', Math.abs(d.cents) <= 8);
      const px = clamp(d.cents / 50, -1, 1) * 124;
      $('#tuner-cents-needle').style.left = `calc(50% - 3px + ${px}px)`;
      $('#tuner-freq').textContent = `${d.freq.toFixed(1)} Hz · ${d.cents >= 0 ? '+' : ''}${d.cents}¢`;
    } else {
      noteEl.textContent = '—';
      noteEl.classList.remove('in-tune');
      $('#tuner-freq').textContent = 'listening…';
    }
    handleMicCapture(d);
  };

  function updateMicStatus() {
    $('#mic-status').textContent = Pitch.running
      ? 'Mic is live — the tuner shows what it hears'
      : 'Mic is off';
    $('#btn-mic-enable').textContent = Pitch.running ? '🎤 Microphone On' : '🎤 Enable Microphone';
    $('#btn-mic-enable').classList.toggle('on', Pitch.running);
  }

  function updateMicTargetLabel() {
    const el = $('#mic-target');
    if (state.micMode === 'notes') {
      const t = targetInstTrack();
      el.textContent = t
        ? `Notes will be recorded to “${t.name}” (${Engine.INSTRUMENTS[t.instrument].name})`
        : 'Add an instrument track to record notes into.';
    } else {
      const t = micAudioTrack();
      el.textContent = t
        ? `Audio will be recorded to “${t.name}”`
        : 'An Audio track will be created when you record.';
    }
  }

  /* ---------------- arrangement view ---------------- */

  const arrScroll = $('#arrange-scroll');
  const arrCanvas = $('#arrange');
  const rulerCanvas = $('#ruler');
  const arr = { ppb: 32, drag: null };

  function songBeats() {
    let end = 32;
    for (const t of project.tracks) for (const c of t.clips) end = Math.max(end, c.start + c.length);
    return Math.ceil((end + 16) / 4) * 4;
  }

  function sizeCanvas(cv, w, h) {
    const dpr = window.devicePixelRatio || 1;
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    cv.width = Math.max(1, Math.round(w * dpr));
    cv.height = Math.max(1, Math.round(h * dpr));
    cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function layoutArrange() {
    const beats = songBeats();
    const w = Math.max(beats * arr.ppb, arrScroll.clientWidth);
    const h = Math.max(project.tracks.length * ROW_H + 40, arrScroll.clientHeight);
    sizeCanvas(arrCanvas, w, h);
    sizeCanvas(rulerCanvas, w, 30);
    requestDraw();
  }

  function getPeaks(clip) {
    if (clip._peaks) return clip._peaks;
    const buffer = audioStore.get(clip.bufferId);
    if (!buffer) return null;
    const d = buffer.getChannelData(0);
    const N = 240;
    const peaks = new Float32Array(N);
    const step = Math.max(1, Math.floor(d.length / N));
    for (let i = 0; i < N; i++) {
      let m = 0;
      const base = i * step;
      for (let j = 0; j < step; j += 16) m = Math.max(m, Math.abs(d[base + j] || 0));
      peaks[i] = m;
    }
    clip._peaks = peaks;
    return peaks;
  }

  function drawClip(g, track, clip, x, y, w, h) {
    const sel = clip.id === state.selectedClipId;
    g.fillStyle = track.color + (sel ? 'e8' : '99');
    g.strokeStyle = sel ? '#ffffff' : track.color;
    g.lineWidth = sel ? 1.6 : 1;
    roundRect(g, x, y, Math.max(w, 3), h, 4);
    g.fill();
    g.stroke();
    // name strip
    g.fillStyle = 'rgba(0,0,0,0.35)';
    roundRectTop(g, x, y, Math.max(w, 3), 13, 4);
    g.fill();
    g.fillStyle = '#fff';
    g.font = '9px sans-serif';
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    g.fillText(clip.name || 'Clip', x + 4, y + 10);
    // content preview
    if (clip.type === 'audio') {
      const peaks = getPeaks(clip);
      if (peaks) {
        g.strokeStyle = 'rgba(255,255,255,0.75)';
        g.lineWidth = 1;
        g.beginPath();
        const mid = y + 13 + (h - 13) / 2;
        const amp = (h - 17) / 2;
        for (let i = 0; i < peaks.length; i++) {
          const px = x + (i / peaks.length) * w;
          g.moveTo(px, mid - peaks[i] * amp);
          g.lineTo(px, mid + peaks[i] * amp + 0.5);
        }
        g.stroke();
      }
    } else if (clip.notes && clip.notes.length) {
      let lo = 127, hi = 0;
      const isDrum = track.kind === 'drum';
      if (isDrum) { lo = 0; hi = Engine.DRUMS.length - 1; }
      else {
        for (const n of clip.notes) { lo = Math.min(lo, n.pitch); hi = Math.max(hi, n.pitch); }
        if (hi - lo < 8) { const mid = (hi + lo) / 2; lo = mid - 4; hi = mid + 4; }
      }
      g.fillStyle = 'rgba(255,255,255,0.85)';
      const innerH = h - 17;
      for (const n of clip.notes) {
        if (n.start >= clip.length) continue;
        const nx = x + (n.start / clip.length) * w;
        const nw = Math.max(2, (Math.min(n.length, clip.length - n.start) / clip.length) * w);
        const frac = (n.pitch - lo) / Math.max(1, hi - lo);
        const ny = y + 14 + (1 - frac) * (innerH - 3);
        g.fillRect(nx, ny, nw, 2.4);
      }
    }
    g.restore();
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function roundRectTop(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.lineTo(x + w, y + h);
    g.lineTo(x, y + h);
    g.lineTo(x, y + r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function drawArrange() {
    const g = arrCanvas.getContext('2d');
    const w = parseFloat(arrCanvas.style.width);
    const h = parseFloat(arrCanvas.style.height);
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#10141c';
    g.fillRect(0, 0, w, h);

    // lanes
    project.tracks.forEach((track, i) => {
      const y = i * ROW_H;
      g.fillStyle = i % 2 ? '#131826' : '#121623';
      if (track.id === state.selectedTrackId) g.fillStyle = '#18202f';
      g.fillRect(0, y, w, ROW_H);
      g.strokeStyle = '#1e2534';
      g.beginPath();
      g.moveTo(0, y + ROW_H - 0.5);
      g.lineTo(w, y + ROW_H - 0.5);
      g.stroke();
    });

    // grid lines
    const beats = songBeats();
    for (let b = 0; b <= beats; b++) {
      const x = b * arr.ppb;
      if (b % 4 === 0) { g.strokeStyle = '#2a3242'; }
      else { if (arr.ppb < 14) continue; g.strokeStyle = '#1b2130'; }
      g.beginPath();
      g.moveTo(x + 0.5, 0);
      g.lineTo(x + 0.5, h);
      g.stroke();
    }

    // clips
    project.tracks.forEach((track, i) => {
      const y = i * ROW_H;
      for (const clip of track.clips) {
        drawClip(g, track, clip, clip.start * arr.ppb, y + 4, clip.length * arr.ppb, ROW_H - 10);
      }
    });

    // playhead
    const px = getPlayheadBeat() * arr.ppb;
    g.strokeStyle = '#ff5252';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(px, 0);
    g.lineTo(px, h);
    g.stroke();
    g.lineWidth = 1;
  }

  function drawRuler() {
    const g = rulerCanvas.getContext('2d');
    const w = parseFloat(rulerCanvas.style.width);
    g.clearRect(0, 0, w, 30);
    g.fillStyle = '#161b26';
    g.fillRect(0, 0, w, 30);
    if (state.loopOn || rulerDrag) {
      g.fillStyle = 'rgba(79,195,247,0.25)';
      g.fillRect(state.loopStart * arr.ppb, 0, (state.loopEnd - state.loopStart) * arr.ppb, 30);
    }
    const beats = songBeats();
    g.fillStyle = '#8b96ab';
    g.font = '10px sans-serif';
    for (let b = 0; b <= beats; b += 4) {
      const x = b * arr.ppb;
      g.strokeStyle = '#2a3242';
      g.beginPath();
      g.moveTo(x + 0.5, 14);
      g.lineTo(x + 0.5, 30);
      g.stroke();
      g.fillText(String(b / 4 + 1), x + 3, 12);
    }
    const px = getPlayheadBeat() * arr.ppb;
    g.fillStyle = '#ff5252';
    g.beginPath();
    g.moveTo(px - 5, 0);
    g.lineTo(px + 5, 0);
    g.lineTo(px, 9);
    g.closePath();
    g.fill();
  }

  /* --- arrangement interactions --- */

  function clipAt(track, beat) {
    for (let i = track.clips.length - 1; i >= 0; i--) {
      const c = track.clips[i];
      if (beat >= c.start && beat <= c.start + c.length) return c;
    }
    return null;
  }

  arrCanvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    Engine.resume();
    const beat = e.offsetX / arr.ppb;
    const row = Math.floor(e.offsetY / ROW_H);
    const track = project.tracks[row];
    if (!track) { state.selectedClipId = null; requestDraw(); return; }
    state.selectedTrackId = track.id;
    const clip = clipAt(track, beat);
    if (clip) {
      state.selectedClipId = clip.id;
      const endX = (clip.start + clip.length) * arr.ppb;
      pushUndo();
      if (e.offsetX > endX - 7) {
        arr.drag = { mode: 'resize', trackId: track.id, clipId: clip.id };
      } else {
        arr.drag = { mode: 'move', trackId: track.id, clipId: clip.id, grabOffset: beat - clip.start };
      }
    } else {
      state.selectedClipId = null;
    }
    rebuildHeadersSelectionOnly();
    requestDraw();
  });

  // cheap selected-state refresh without full rebuild
  function rebuildHeadersSelectionOnly() {
    const els = headersInner.children;
    project.tracks.forEach((t, i) => {
      if (els[i]) els[i].classList.toggle('selected', t.id === state.selectedTrackId);
    });
  }

  arrCanvas.addEventListener('mousemove', (e) => {
    if (!arr.drag) {
      const row = Math.floor(e.offsetY / ROW_H);
      const track = project.tracks[row];
      const clip = track && clipAt(track, e.offsetX / arr.ppb);
      arrCanvas.style.cursor = clip && e.offsetX > (clip.start + clip.length) * arr.ppb - 7
        ? 'ew-resize' : (clip ? 'grab' : 'default');
      return;
    }
    const d = arr.drag;
    const track = trackById(d.trackId);
    const clip = clipById(track, d.clipId);
    if (!clip) return;
    const beat = e.offsetX / arr.ppb;
    if (d.mode === 'move') {
      clip.start = Math.max(0, snapB(beat - d.grabOffset));
      // vertical move to a compatible lane
      const row = clamp(Math.floor(e.offsetY / ROW_H), 0, project.tracks.length - 1);
      const target = project.tracks[row];
      if (target && target !== track && target.kind === track.kind) {
        track.clips = track.clips.filter(c => c !== clip);
        target.clips.push(clip);
        d.trackId = target.id;
        state.selectedTrackId = target.id;
        if (editor.clipId === clip.id) editor.trackId = target.id;
        rebuildHeadersSelectionOnly();
      }
    } else if (d.mode === 'resize') {
      clip.length = Math.max(state.grid || 0.25, snapB(beat - clip.start));
    }
    requestDraw();
  });

  window.addEventListener('mouseup', () => {
    if (arr.drag) { arr.drag = null; layoutArrange(); }
    rulerDrag = null;
    dgPaint = null;
    prDrag = null;
  });

  arrCanvas.addEventListener('dblclick', (e) => {
    const beat = e.offsetX / arr.ppb;
    const row = Math.floor(e.offsetY / ROW_H);
    const track = project.tracks[row];
    if (!track) return;
    const clip = clipAt(track, beat);
    if (clip) { openEditor(track, clip); return; }
    if (track.kind === 'audio') { toast('Audio clips are recorded with the mic (🎤 tab, Audio mode)'); return; }
    pushUndo();
    const start = Math.max(0, Math.floor(beat));
    const nc = { id: uid(), name: track.kind === 'drum' ? 'Beat' : 'Clip', start, length: 4, notes: [] };
    track.clips.push(nc);
    state.selectedClipId = nc.id;
    openEditor(track, nc);
    layoutArrange();
  });

  arrCanvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const beat = e.offsetX / arr.ppb;
    const row = Math.floor(e.offsetY / ROW_H);
    const track = project.tracks[row];
    if (!track) return;
    const clip = clipAt(track, beat);
    if (!clip) return;
    pushUndo();
    track.clips = track.clips.filter(c => c !== clip);
    if (editor.clipId === clip.id) closeEditor();
    if (state.selectedClipId === clip.id) state.selectedClipId = null;
    requestDraw();
  });

  /* ruler: click to seek, drag for loop region */
  let rulerDrag = null;

  rulerCanvas.addEventListener('mousedown', (e) => {
    const beat = e.offsetX / arr.ppb;
    rulerDrag = { startBeat: beat, moved: false };
  });
  rulerCanvas.addEventListener('mousemove', (e) => {
    if (!rulerDrag) return;
    const beat = e.offsetX / arr.ppb;
    if (Math.abs(beat - rulerDrag.startBeat) * arr.ppb > 5) {
      rulerDrag.moved = true;
      state.loopStart = Math.max(0, Math.round(Math.min(beat, rulerDrag.startBeat)));
      state.loopEnd = Math.round(Math.max(beat, rulerDrag.startBeat));
      requestDraw();
    }
  });
  rulerCanvas.addEventListener('mouseup', (e) => {
    if (!rulerDrag) return;
    if (rulerDrag.moved) {
      if (state.loopEnd - state.loopStart >= 1) state.loopOn = true;
      updateToggleUI();
    } else {
      seek(snapB(e.offsetX / arr.ppb));
    }
    rulerDrag = null;
    requestDraw();
  });

  arrScroll.addEventListener('scroll', () => {
    rulerCanvas.style.left = -arrScroll.scrollLeft + 'px';
    headersInner.style.transform = `translateY(${-arrScroll.scrollTop}px)`;
  });

  /* ---------------- editor panel (piano roll / drums / audio) ---------------- */

  function setTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll('#bottom-tabs button').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    $('#panel-' + tab).classList.add('active');
  }
  document.querySelectorAll('#bottom-tabs button').forEach(b =>
    b.addEventListener('click', () => setTab(b.dataset.tab)));

  function openEditor(track, clip) {
    editor = {
      kind: track.kind === 'drum' ? 'drum' : (clip.type === 'audio' ? 'audio' : 'pr'),
      trackId: track.id,
      clipId: clip.id
    };
    prSelNote = null;
    setTab('editor');
    $('#editor-empty').style.display = 'none';
    $('#pianoroll-wrap').hidden = editor.kind !== 'pr';
    $('#drumgrid-wrap').hidden = editor.kind !== 'drum';
    $('#audio-wrap').hidden = editor.kind !== 'audio';
    if (editor.kind === 'pr') {
      $('#pr-title').textContent = `${track.name} · ${clip.name}`;
      layoutPR();
      const target = (96 - 72) * PR_ROW - $('#pr-scroll').clientHeight / 2;
      $('#pr-scroll').scrollTop = Math.max(0, target);
    } else if (editor.kind === 'drum') {
      $('#dg-title').textContent = `${track.name} · ${clip.name}`;
      buildDrumGrid();
    } else {
      $('#au-title').textContent = `${track.name} · ${clip.name}`;
      const buffer = audioStore.get(clip.bufferId);
      $('#audio-info').textContent = buffer
        ? `Recorded audio — ${buffer.duration.toFixed(2)}s at ${buffer.sampleRate} Hz. Drag the clip to move it; drag its right edge to trim. Right-click it in the arrangement to delete.`
        : 'The audio for this clip is missing (it may not have been saved with the project).';
    }
    requestDraw();
  }

  function closeEditor() {
    editor = { kind: null, trackId: null, clipId: null };
    prSelNote = null;
    $('#editor-empty').style.display = '';
    $('#pianoroll-wrap').hidden = true;
    $('#drumgrid-wrap').hidden = true;
    $('#audio-wrap').hidden = true;
  }

  $('#pr-close').addEventListener('click', closeEditor);
  $('#dg-close').addEventListener('click', closeEditor);
  $('#au-close').addEventListener('click', closeEditor);

  /* --- piano roll --- */

  const PR_TOP = 96, PR_LOW = 24, PR_ROW = 14, PR_KEY_W = 44, PR_PPB = 96;
  const prCanvas = $('#pianoroll');
  let prDrag = null;

  function layoutPR() {
    const clip = editorClip();
    if (!clip) return;
    const w = PR_KEY_W + clip.length * PR_PPB + 40;
    const h = (PR_TOP - PR_LOW + 1) * PR_ROW;
    sizeCanvas(prCanvas, Math.max(w, $('#pr-scroll').clientWidth), h);
    prDirty = true;
  }

  function drawPR() {
    const clip = editorClip();
    const track = editorTrack();
    if (!clip || !track) return;
    const g = prCanvas.getContext('2d');
    const w = parseFloat(prCanvas.style.width);
    const h = parseFloat(prCanvas.style.height);
    g.clearRect(0, 0, w, h);

    const blacks = [1, 3, 6, 8, 10];
    for (let m = PR_TOP; m >= PR_LOW; m--) {
      const y = (PR_TOP - m) * PR_ROW;
      g.fillStyle = blacks.includes(m % 12) ? '#12161f' : '#161b26';
      g.fillRect(PR_KEY_W, y, w - PR_KEY_W, PR_ROW);
      g.strokeStyle = m % 12 === 0 ? '#2a3242' : '#1c2230';
      g.beginPath();
      g.moveTo(PR_KEY_W, y + PR_ROW - 0.5);
      g.lineTo(w, y + PR_ROW - 0.5);
      g.stroke();
    }
    // beat lines
    for (let b = 0; b <= clip.length + EPS; b += (state.grid || 0.25)) {
      const x = PR_KEY_W + b * PR_PPB;
      const isBeat = Math.abs(b - Math.round(b)) < EPS;
      const isBar = isBeat && Math.round(b) % 4 === 0;
      g.strokeStyle = isBar ? '#39445c' : (isBeat ? '#242c3d' : '#1a202e');
      g.beginPath();
      g.moveTo(x + 0.5, 0);
      g.lineTo(x + 0.5, h);
      g.stroke();
    }
    // clip end shade
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(PR_KEY_W + clip.length * PR_PPB, 0, w, h);

    // notes
    for (const n of clip.notes) {
      const y = (PR_TOP - n.pitch) * PR_ROW;
      const x = PR_KEY_W + n.start * PR_PPB;
      const nw = Math.max(4, n.length * PR_PPB - 1);
      g.fillStyle = n === prSelNote ? '#8fd8fc' : editorTrack().color;
      roundRect(g, x, y + 1.5, nw, PR_ROW - 3, 3);
      g.fill();
      g.strokeStyle = n === prSelNote ? '#ffffff' : 'rgba(0,0,0,0.5)';
      g.stroke();
    }

    // playhead
    if (trans.playing) {
      const pb = currentBeat();
      if (pb >= clip.start && pb <= clip.start + clip.length) {
        const x = PR_KEY_W + (pb - clip.start) * PR_PPB;
        g.strokeStyle = '#ff5252';
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, h);
        g.stroke();
      }
    }

    // keys column (drawn last, on top)
    for (let m = PR_TOP; m >= PR_LOW; m--) {
      const y = (PR_TOP - m) * PR_ROW;
      const isBlack = blacks.includes(m % 12);
      g.fillStyle = isBlack ? '#1a1f2b' : '#e8ecf4';
      g.fillRect(0, y, PR_KEY_W, PR_ROW);
      g.strokeStyle = '#3a4152';
      g.strokeRect(0.5, y + 0.5, PR_KEY_W - 1, PR_ROW);
      if (m % 12 === 0) {
        g.fillStyle = isBlack ? '#aab' : '#333';
        g.font = '9px sans-serif';
        g.fillText('C' + (Math.floor(m / 12) - 1), 4, y + 10);
      }
    }
  }

  function prPreview(midi) {
    const track = editorTrack();
    if (!track) return;
    const h = Engine.playNote(actx, getChain(track).input, track.instrument, actx.currentTime, midi, 0.8);
    h.release(actx.currentTime + 0.25);
  }

  prCanvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    Engine.resume();
    const clip = editorClip();
    if (!clip) return;
    const midi = PR_TOP - Math.floor(e.offsetY / PR_ROW);
    if (e.offsetX < PR_KEY_W) { prPreview(midi); return; }
    const beat = (e.offsetX - PR_KEY_W) / PR_PPB;
    let hit = null;
    for (let i = clip.notes.length - 1; i >= 0; i--) {
      const n = clip.notes[i];
      if (n.pitch === midi && beat >= n.start - EPS && beat <= n.start + n.length + EPS) { hit = n; break; }
    }
    pushUndo();
    if (hit) {
      prSelNote = hit;
      const endX = PR_KEY_W + (hit.start + hit.length) * PR_PPB;
      if (e.offsetX > endX - 6) prDrag = { mode: 'resize', note: hit };
      else { prDrag = { mode: 'move', note: hit, grabOffset: beat - hit.start }; prPreview(midi); }
    } else {
      if (beat > clip.length) return;
      const n = { pitch: midi, start: snapFloor(beat), length: state.grid || 0.25, vel: 0.85 };
      clip.notes.push(n);
      prSelNote = n;
      prDrag = { mode: 'resize', note: n };
      prPreview(midi);
    }
    prDirty = true;
    requestDraw();
  });

  prCanvas.addEventListener('mousemove', (e) => {
    const clip = editorClip();
    if (!clip) return;
    if (!prDrag) {
      const midi = PR_TOP - Math.floor(e.offsetY / PR_ROW);
      const beat = (e.offsetX - PR_KEY_W) / PR_PPB;
      let cur = 'default';
      for (const n of clip.notes) {
        if (n.pitch === midi && beat >= n.start && beat <= n.start + n.length) {
          const endX = PR_KEY_W + (n.start + n.length) * PR_PPB;
          cur = e.offsetX > endX - 6 ? 'ew-resize' : 'grab';
          break;
        }
      }
      prCanvas.style.cursor = e.offsetX < PR_KEY_W ? 'pointer' : cur;
      return;
    }
    const n = prDrag.note;
    const beat = (e.offsetX - PR_KEY_W) / PR_PPB;
    if (prDrag.mode === 'move') {
      const midi = clamp(PR_TOP - Math.floor(e.offsetY / PR_ROW), PR_LOW, PR_TOP);
      if (midi !== n.pitch) { n.pitch = midi; prPreview(midi); }
      n.start = clamp(snapB(beat - prDrag.grabOffset), 0, Math.max(0, clip.length - 0.125));
    } else {
      n.length = Math.max(0.125, snapB(beat - n.start) || (state.grid || 0.25));
    }
    prDirty = true;
    requestDraw();
  });

  prCanvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const clip = editorClip();
    if (!clip) return;
    const midi = PR_TOP - Math.floor(e.offsetY / PR_ROW);
    const beat = (e.offsetX - PR_KEY_W) / PR_PPB;
    const idx = clip.notes.findIndex(n =>
      n.pitch === midi && beat >= n.start && beat <= n.start + n.length);
    if (idx >= 0) {
      pushUndo();
      if (clip.notes[idx] === prSelNote) prSelNote = null;
      clip.notes.splice(idx, 1);
      prDirty = true;
      requestDraw();
    }
  });

  /* --- drum grid --- */

  const dgEl = $('#drum-grid');
  let dgPaint = null;
  let dgCells = [];
  let dgPlayCol = -1;

  function buildDrumGrid() {
    const clip = editorClip();
    const track = editorTrack();
    if (!clip || !track) return;
    const steps = Math.min(64, Math.max(4, Math.round(clip.length * 4)));
    dgEl.style.gridTemplateColumns = `92px repeat(${steps}, minmax(18px, 1fr))`;
    dgEl.innerHTML = '';
    dgCells = [];
    const has = new Set(clip.notes.map(n => `${n.pitch}:${Math.round(n.start * 4)}`));
    Engine.DRUMS.forEach((drum, di) => {
      const nameEl = document.createElement('div');
      nameEl.className = 'dg-name';
      nameEl.textContent = drum.name;
      nameEl.title = 'Preview';
      nameEl.addEventListener('mousedown', () => {
        Engine.resume();
        Engine.playDrum(actx, getChain(track).input, di, actx.currentTime, 0.9);
      });
      dgEl.append(nameEl);
      const rowCells = [];
      for (let s = 0; s < steps; s++) {
        const cell = document.createElement('div');
        cell.className = 'cell' + (s % 4 === 0 ? ' beat1' : '') + (has.has(`${di}:${s}`) ? ' on' : '');
        cell.addEventListener('mousedown', (e) => {
          e.preventDefault();
          Engine.resume();
          pushUndo();
          const to = !cell.classList.contains('on');
          dgPaint = { to };
          setDrumCell(di, s, cell, to);
        });
        cell.addEventListener('mouseenter', () => {
          if (dgPaint) setDrumCell(di, s, cell, dgPaint.to);
        });
        dgEl.append(cell);
        rowCells.push(cell);
      }
      dgCells.push(rowCells);
    });
    dgPlayCol = -1;
  }

  function setDrumCell(di, step, cell, on) {
    const clip = editorClip();
    if (!clip) return;
    const start = step * 0.25;
    const idx = clip.notes.findIndex(n => n.pitch === di && Math.abs(n.start - start) < 0.01);
    if (on && idx < 0) {
      clip.notes.push({
        pitch: di, start, length: 0.25,
        vel: di === 3 ? 0.65 : (di === 4 ? 0.6 : 0.9)
      });
      const track = editorTrack();
      if (track && !trans.playing) Engine.playDrum(actx, getChain(track).input, di, actx.currentTime, 0.8);
    } else if (!on && idx >= 0) {
      clip.notes.splice(idx, 1);
    }
    cell.classList.toggle('on', on);
    requestDraw();
  }

  function updateDrumPlayCol() {
    const clip = editorClip();
    if (!clip || editor.kind !== 'drum') return;
    let col = -1;
    if (trans.playing) {
      const pb = currentBeat();
      if (pb >= clip.start && pb < clip.start + clip.length) {
        col = Math.floor((pb - clip.start) * 4);
      }
    }
    if (col === dgPlayCol) return;
    for (const row of dgCells) {
      if (row[dgPlayCol]) row[dgPlayCol].classList.remove('playing-col');
      if (row[col]) row[col].classList.add('playing-col');
    }
    dgPlayCol = col;
  }

  $('#dg-clear').addEventListener('click', () => {
    const clip = editorClip();
    if (!clip) return;
    pushUndo();
    clip.notes = [];
    buildDrumGrid();
    requestDraw();
  });

  /* ---------------- virtual keyboard ---------------- */

  const KEYMAP = {
    a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8,
    h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16
  };
  const kbdEl = $('#kbd');
  const kbdKeyEls = new Map();
  let kbdMouseDown = false;

  function buildKbd() {
    kbdEl.innerHTML = '';
    kbdKeyEls.clear();
    const base = state.kbdBase;
    const whites = [];
    for (let m = base; m < base + 36; m++) {
      if (![1, 3, 6, 8, 10].includes(m % 12)) whites.push(m);
    }
    const wW = 100 / whites.length;
    whites.forEach((m) => {
      const k = document.createElement('div');
      k.className = 'wkey';
      if (m % 12 === 0) {
        const lab = document.createElement('span');
        lab.className = 'klabel';
        lab.textContent = 'C' + (Math.floor(m / 12) - 1);
        k.append(lab);
      }
      hookKey(k, m);
      kbdEl.append(k);
      kbdKeyEls.set(m, k);
    });
    for (let m = base; m < base + 36; m++) {
      if (![1, 3, 6, 8, 10].includes(m % 12)) continue;
      const k = document.createElement('div');
      k.className = 'bkey';
      const wIdx = whites.filter(x => x < m).length;
      const bw = wW * 0.6;
      k.style.left = `calc(${wIdx * wW}% - ${bw / 2}%)`;
      k.style.width = bw + '%';
      hookKey(k, m);
      kbdEl.append(k);
      kbdKeyEls.set(m, k);
    }
    $('#oct-label').textContent = 'C' + (Math.floor((state.kbdBase + 12) / 12) - 1);
  }

  function hookKey(el, midi) {
    el.addEventListener('mousedown', (e) => { e.preventDefault(); kbdMouseDown = true; kbNoteOn(midi); });
    el.addEventListener('mouseenter', () => { if (kbdMouseDown) kbNoteOn(midi); });
    el.addEventListener('mouseup', () => kbNoteOff(midi));
    el.addEventListener('mouseleave', () => kbNoteOff(midi));
  }
  window.addEventListener('mouseup', () => {
    kbdMouseDown = false;
    for (const midi of [...kbdVoices.keys()]) kbNoteOff(midi);
  });

  function kbNoteOn(midi) {
    if (kbdVoices.has(midi)) return;
    Engine.resume();
    const track = targetInstTrack();
    const dest = track ? getChain(track).input : Engine.live.master;
    const inst = track ? track.instrument : 'piano';
    const voice = Engine.playNote(actx, dest, inst, actx.currentTime, midi, 0.9);
    kbdVoices.set(midi, {
      voice, track,
      startBeat: (state.recording && trans.playing) ? currentBeat() : null
    });
    const el = kbdKeyEls.get(midi);
    if (el) el.classList.add('held');
  }

  function kbNoteOff(midi) {
    const v = kbdVoices.get(midi);
    if (!v) return;
    kbdVoices.delete(midi);
    v.voice.release(actx.currentTime);
    if (v.startBeat != null && state.recording && trans.playing && v.track) {
      recordNote(v.track, midi, v.startBeat, Math.max(0.125, currentBeat() - v.startBeat));
    }
    const el = kbdKeyEls.get(midi);
    if (el) el.classList.remove('held');
  }

  function shiftOctave(dir) {
    state.kbdBase = clamp(state.kbdBase + dir * 12, 24, 72);
    for (const midi of [...kbdVoices.keys()]) kbNoteOff(midi);
    buildKbd();
  }
  $('#oct-down').addEventListener('click', () => shiftOctave(-1));
  $('#oct-up').addEventListener('click', () => shiftOctave(1));

  /* ---------------- loops library ---------------- */

  const DRUM_IDX = Object.fromEntries(Engine.DRUMS.map((d, i) => [d.id, i]));

  function drumLoop(map, bars) {
    const notes = [];
    for (let b = 0; b < bars; b++) {
      for (const k in map) {
        for (const s of map[k]) {
          notes.push({
            pitch: DRUM_IDX[k], start: b * 4 + s * 0.25, length: 0.25,
            vel: k === 'hatC' ? 0.6 : (k === 'hatO' ? 0.55 : 0.9)
          });
        }
      }
    }
    return { kind: 'drum', len: bars * 4, notes };
  }

  const QUALITIES = {
    maj: [0, 4, 7, 12], min: [0, 3, 7, 12],
    maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10]
  };

  function chordLoop(prog, inst, style) {
    const notes = [];
    prog.forEach(([r, q], i) => {
      const iv = QUALITIES[q] || QUALITIES.maj;
      const start = i * 4;
      if (style === 'pad') {
        for (const v of iv) notes.push({ pitch: r + v, start, length: 3.9, vel: 0.7 });
      } else if (style === 'pump') {
        for (let s = 0; s < 8; s++) {
          for (const v of iv.slice(0, 3)) {
            notes.push({ pitch: r + v, start: start + s * 0.5, length: 0.42, vel: s % 2 ? 0.55 : 0.75 });
          }
        }
      } else if (style === 'arp') {
        for (let s = 0; s < 16; s++) {
          notes.push({ pitch: r + iv[s % 4], start: start + s * 0.25, length: 0.22, vel: 0.7 });
        }
      }
    });
    return { kind: 'inst', inst, len: prog.length * 4, notes };
  }

  function bassLoop(prog, pattern) {
    const notes = [];
    prog.forEach(([r], i) => {
      for (const [o, l, dg] of pattern) {
        notes.push({ pitch: r - 24 + (dg || 0), start: i * 4 + o, length: l, vel: 0.85 });
      }
    });
    return { kind: 'inst', inst: 'bass', len: prog.length * 4, notes };
  }

  const POP = [[60, 'maj'], [55, 'maj'], [57, 'min'], [53, 'maj']];
  const LOFI = [[53, 'maj7'], [52, 'min7'], [50, 'min7'], [48, 'maj7']];
  const EPIC = [[57, 'min'], [53, 'maj'], [60, 'maj'], [55, 'maj']];

  const SUNRISE = [
    [72, 0, 1], [76, 1, 0.5], [79, 1.5, 1.5], [76, 3, 1],
    [71, 4, 1], [74, 5, 0.5], [79, 5.5, 1.5], [74, 7, 1],
    [69, 8, 1], [72, 9, 0.5], [76, 9.5, 1.5], [72, 11, 1],
    [69, 12, 0.5], [72, 12.5, 0.5], [77, 13, 1], [76, 14, 2]
  ];

  function melodyLoop(arr2, inst, len) {
    return {
      kind: 'inst', inst, len,
      notes: arr2.map(([p, s, l]) => ({ pitch: p, start: s, length: l, vel: 0.85 }))
    };
  }

  const LOOP_LIB = [
    { cat: '🥁 Drum Beats', items: [
      ['Basic Rock', () => drumLoop({ kick: [0, 8], snare: [4, 12], hatC: [0, 2, 4, 6, 8, 10, 12, 14] }, 2)],
      ['Hip-Hop', () => drumLoop({ kick: [0, 3, 10], snare: [4, 12], hatC: [0, 2, 4, 6, 8, 10, 12, 14, 15] }, 2)],
      ['Four on the Floor', () => drumLoop({ kick: [0, 4, 8, 12], clap: [4, 12], hatO: [2, 6, 10, 14] }, 2)],
      ['Funk', () => drumLoop({ kick: [0, 6, 10], snare: [4, 12, 15], hatC: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] }, 2)],
      ['Half-Time', () => drumLoop({ kick: [0, 10], snare: [8], hatC: [0, 2, 4, 6, 8, 10, 12, 14], hatO: [15] }, 2)]
    ] },
    { cat: '🎸 Bass Lines', items: [
      ['Long Roots', () => bassLoop(POP, [[0, 3.5, 0]])],
      ['Pumping 8ths', () => bassLoop(POP, Array.from({ length: 8 }, (_, i) => [i * 0.5, 0.45, 0]))],
      ['Root & Fifth', () => bassLoop(POP, [[0, 1, 0], [1, 0.5, 0], [2, 1, 7], [3, 0.5, 0], [3.5, 0.5, 7]])]
    ] },
    { cat: '🎹 Chords', items: [
      ['Pop Pads', () => chordLoop(POP, 'pad', 'pad')],
      ['Lo-fi Keys', () => chordLoop(LOFI, 'epiano', 'pad')],
      ['Epic Strings', () => chordLoop(EPIC, 'strings', 'pad')],
      ['Piano Pump', () => chordLoop(POP, 'piano', 'pump')]
    ] },
    { cat: '✨ Melodies & Arps', items: [
      ['Sunrise Lead', () => melodyLoop(SUNRISE, 'lead', 16)],
      ['Music Box', () => chordLoop([[72, 'maj'], [67, 'maj'], [69, 'min'], [65, 'maj']], 'bell', 'arp')],
      ['Synth Arp', () => chordLoop(POP.map(([r, q]) => [r + 12, q]), 'pluck', 'arp')]
    ] }
  ];

  function insertLoop(name, make) {
    pushUndo();
    const data = make();
    let track;
    if (data.kind === 'drum') {
      track = project.tracks.find(t => t.kind === 'drum') || createTrack('drum');
    } else {
      track = createTrack('inst', { instrument: data.inst });
    }
    const start = Math.max(0, Math.floor(getPlayheadBeat() / 4) * 4);
    const clip = { id: uid(), name, start, length: data.len, notes: data.notes.map(n => ({ ...n })) };
    track.clips.push(clip);
    state.selectedTrackId = track.id;
    state.selectedClipId = clip.id;
    rebuildHeaders();
    requestDraw();
    toast(`Added “${name}” at bar ${Math.floor(start / 4) + 1}`);
  }

  function buildLoopsList() {
    const list = $('#loops-list');
    list.innerHTML = '';
    for (const cat of LOOP_LIB) {
      const div = document.createElement('div');
      div.className = 'loop-cat';
      const h = document.createElement('h4');
      h.textContent = cat.cat;
      const items = document.createElement('div');
      items.className = 'loop-items';
      for (const [name, make] of cat.items) {
        const b = document.createElement('button');
        b.textContent = name;
        b.addEventListener('click', () => { insertLoop(name, make); closeModals(); });
        items.append(b);
      }
      div.append(h, items);
      list.append(div);
    }
  }

  /* ---------------- demo song ---------------- */

  function buildDemo() {
    const hasContent = project.tracks.some(t => t.clips.length);
    if (hasContent && !window.confirm('Replace the current project with the demo song?')) return;
    pushUndo();
    project.name = 'Demo Song';
    project.bpm = 112;
    $('#bpm').value = 112;
    $('#project-name').value = project.name;
    Engine.live.setBpm(112);
    for (const [, ch] of chains) ch.dispose();
    chains.clear();
    project.tracks = [];

    const drums = createTrack('drum', { name: 'Drums' });
    const rock = drumLoop({ kick: [0, 8], snare: [4, 12], hatC: [0, 2, 4, 6, 8, 10, 12, 14] }, 2);
    const floor4 = drumLoop({ kick: [0, 4, 8, 12], clap: [4, 12], hatO: [2, 6, 10, 14] }, 2);
    for (let s = 0; s < 32; s += 8) {
      const pat = s < 16 ? rock : floor4;
      drums.clips.push({ id: uid(), name: 'Beat', start: s, length: 8, notes: pat.notes.map(n => ({ ...n })) });
    }

    const bass = createTrack('inst', { instrument: 'bass', name: 'Bass' });
    const bl = bassLoop(POP, Array.from({ length: 8 }, (_, i) => [i * 0.5, 0.45, 0]));
    bass.clips.push({ id: uid(), name: 'Bassline', start: 0, length: 16, notes: bl.notes.map(n => ({ ...n })) });
    bass.clips.push({ id: uid(), name: 'Bassline', start: 16, length: 16, notes: bl.notes.map(n => ({ ...n })) });

    const pad = createTrack('inst', { instrument: 'pad', name: 'Pads' });
    const ch1 = chordLoop(POP, 'pad', 'pad');
    pad.clips.push({ id: uid(), name: 'Pop Pads', start: 0, length: 16, notes: ch1.notes.map(n => ({ ...n })) });
    pad.clips.push({ id: uid(), name: 'Pop Pads', start: 16, length: 16, notes: ch1.notes.map(n => ({ ...n })) });
    pad.reverb = 0.3;

    const keys = createTrack('inst', { instrument: 'piano', name: 'Piano' });
    const pump = chordLoop(POP, 'piano', 'pump');
    keys.clips.push({ id: uid(), name: 'Piano Pump', start: 16, length: 16, notes: pump.notes.map(n => ({ ...n })) });

    const lead = createTrack('inst', { instrument: 'lead', name: 'Lead' });
    const mel = melodyLoop(SUNRISE, 'lead', 16);
    lead.clips.push({ id: uid(), name: 'Sunrise', start: 16, length: 16, notes: mel.notes.map(n => ({ ...n })) });
    lead.delay = 0.25;
    lead.reverb = 0.2;

    state.selectedTrackId = drums.id;
    state.selectedClipId = null;
    state.loopOn = false;
    trans.pausedBeat = 0;
    closeEditor();
    rebuildHeaders();
    applyMix(false);
    updateToggleUI();
    requestDraw();
    toast('Demo song loaded — press Space to play!');
  }

  /* ---------------- save / load / export ---------------- */

  const LS_KEY = 'beatforge.project';

  function serializeProject() {
    return {
      v: 1,
      name: project.name, bpm: project.bpm,
      loopOn: state.loopOn, loopStart: state.loopStart, loopEnd: state.loopEnd,
      tracks: project.tracks.map(t => ({
        id: t.id, name: t.name, kind: t.kind, instrument: t.instrument,
        volume: t.volume, pan: t.pan, mute: t.mute, solo: t.solo,
        reverb: t.reverb, delay: t.delay, color: t.color,
        clips: t.clips.map(c => {
          if (c.type === 'audio') {
            const buffer = audioStore.get(c.bufferId);
            return {
              id: c.id, type: 'audio', name: c.name, start: c.start, length: c.length,
              wav: buffer ? Engine.abToB64(Engine.bufferToWav(buffer)) : null
            };
          }
          return {
            id: c.id, name: c.name, start: c.start, length: c.length,
            notes: c.notes.map(n => ({ pitch: n.pitch, start: n.start, length: n.length, vel: n.vel }))
          };
        })
      }))
    };
  }

  async function loadSerialized(data) {
    haltTransport(0);
    closeEditor();
    for (const [, ch] of chains) ch.dispose();
    chains.clear();
    audioStore.clear();
    const tracks = [];
    for (const t of (data.tracks || [])) {
      const clips = [];
      for (const c of (t.clips || [])) {
        if (c.type === 'audio') {
          let bufferId = null;
          if (c.wav) {
            try {
              const buffer = await actx.decodeAudioData(Engine.b64ToAb(c.wav));
              bufferId = uid();
              audioStore.set(bufferId, buffer);
            } catch (e) { /* corrupt audio, keep silent clip */ }
          }
          clips.push({ id: c.id || uid(), type: 'audio', name: c.name || 'Audio', start: c.start, length: c.length, bufferId });
        } else {
          clips.push({
            id: c.id || uid(), name: c.name || 'Clip', start: c.start, length: c.length,
            notes: (c.notes || []).map(n => ({ pitch: n.pitch, start: n.start, length: n.length, vel: n.vel == null ? 0.85 : n.vel }))
          });
        }
      }
      tracks.push({
        id: t.id || uid(), name: t.name || 'Track', kind: t.kind || 'inst',
        instrument: t.instrument || (t.kind === 'inst' ? 'piano' : null),
        volume: t.volume == null ? 0.8 : t.volume, pan: t.pan || 0,
        mute: !!t.mute, solo: !!t.solo, armed: false,
        reverb: t.reverb == null ? 0.15 : t.reverb, delay: t.delay || 0,
        color: t.color || COLORS[tracks.length % COLORS.length],
        clips
      });
    }
    project = { name: data.name || 'Untitled Song', bpm: clamp(data.bpm || 110, 40, 240), tracks };
    state.loopOn = !!data.loopOn;
    state.loopStart = data.loopStart || 0;
    state.loopEnd = data.loopEnd || 16;
    state.selectedTrackId = tracks[0] ? tracks[0].id : null;
    state.selectedClipId = null;
    trans.pausedBeat = 0;
    $('#bpm').value = project.bpm;
    $('#project-name').value = project.name;
    Engine.live.setBpm(project.bpm);
    undoStack.length = 0;
    redoStack.length = 0;
    rebuildHeaders();
    applyMix(false);
    updateToggleUI();
    updatePosDisplay();
    requestDraw();
  }

  function saveLocal(silent) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(serializeProject()));
      if (!silent) toast('Project saved in this browser ✓');
    } catch (e) {
      if (!silent) toast('Save failed (project too large for browser storage) — use 📤 to download it instead');
    }
  }

  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  async function exportWav() {
    let endBeat = 0;
    for (const t of project.tracks) for (const c of t.clips) endBeat = Math.max(endBeat, c.start + c.length);
    if (endBeat <= 0) { toast('Nothing to export yet — add some clips first'); return; }
    if (trans.playing) haltTransport();
    toast('Rendering your song…');
    const sr = 44100;
    const dur = endBeat / bps() + 2;
    const octx = new OfflineAudioContext(2, Math.ceil(dur * sr), sr);
    const graph = Engine.buildGraph(octx);
    graph.setBpm(project.bpm);
    const anySolo = project.tracks.some(t => t.solo);
    for (const track of project.tracks) {
      const chain = Engine.makeTrackChain(octx, graph);
      chain.apply(track, (track.mute || (anySolo && !track.solo)) ? 0 : track.volume, false);
      for (const clip of track.clips) {
        if (clip.type === 'audio') {
          const buffer = audioStore.get(clip.bufferId);
          if (!buffer) continue;
          const src = octx.createBufferSource();
          src.buffer = buffer;
          src.connect(chain.input);
          src.start(clip.start / bps(), 0, Math.min(buffer.duration, clip.length / bps()));
          continue;
        }
        for (const n of clip.notes) {
          if (n.start >= clip.length) continue;
          const when = (clip.start + n.start) / bps();
          if (track.kind === 'drum') {
            Engine.playDrum(octx, chain.input, n.pitch, when, n.vel);
          } else {
            const h = Engine.playNote(octx, chain.input, track.instrument, when, n.pitch, n.vel);
            h.release(when + Math.max(0.06, Math.min(n.length, clip.length - n.start) / bps() * 0.98));
          }
        }
      }
    }
    const rendered = await octx.startRendering();
    downloadBlob(new Blob([Engine.bufferToWav(rendered)], { type: 'audio/wav' }),
      (project.name || 'song').replace(/[^\w\- ]+/g, '') + '.wav');
    toast('WAV exported ✓');
  }

  /* ---------------- modals ---------------- */

  function openModal(id) {
    $('#modal-overlay').hidden = false;
    document.querySelectorAll('.modal').forEach(m => { m.hidden = m.id !== id; });
  }
  function closeModals() {
    $('#modal-overlay').hidden = true;
  }
  $('#modal-overlay').addEventListener('mousedown', (e) => {
    if (e.target === $('#modal-overlay')) closeModals();
  });
  document.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', closeModals));

  /* ---------------- top bar wiring ---------------- */

  $('#btn-play').addEventListener('click', togglePlay);
  $('#btn-stop').addEventListener('click', stopBtn);
  $('#btn-goto-start').addEventListener('click', () => seek(0));
  $('#btn-record').addEventListener('click', toggleRecord);
  $('#btn-metronome').addEventListener('click', () => { state.metronome = !state.metronome; updateToggleUI(); });
  $('#btn-loop').addEventListener('click', () => { state.loopOn = !state.loopOn; updateToggleUI(); requestDraw(); });
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-redo').addEventListener('click', redo);
  $('#btn-loops').addEventListener('click', () => { buildLoopsList(); openModal('modal-loops'); });
  $('#btn-help').addEventListener('click', () => openModal('modal-help'));
  $('#btn-demo').addEventListener('click', buildDemo);
  $('#btn-save').addEventListener('click', () => saveLocal(false));
  $('#btn-export').addEventListener('click', exportWav);
  $('#btn-zoom-in').addEventListener('click', () => { arr.ppb = clamp(arr.ppb * 1.3, 10, 120); layoutArrange(); });
  $('#btn-zoom-out').addEventListener('click', () => { arr.ppb = clamp(arr.ppb / 1.3, 10, 120); layoutArrange(); });

  $('#btn-new').addEventListener('click', () => {
    if (!window.confirm('Start a new empty project? (Unsaved changes are lost)')) return;
    loadSerialized({ name: 'Untitled Song', bpm: 110, tracks: [] }).then(() => {
      pushStarterTracks();
      rebuildHeaders();
      toast('New project');
    });
  });

  $('#btn-download').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(serializeProject())], { type: 'application/json' });
    downloadBlob(blob, (project.name || 'song').replace(/[^\w\- ]+/g, '') + '.beatforge.json');
  });
  $('#btn-open').addEventListener('click', () => $('#file-open').click());
  $('#file-open').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      await loadSerialized(data);
      toast('Project loaded ✓');
    } catch (err) {
      toast('Could not read that file — is it a .beatforge.json project?');
    }
  });

  $('#bpm').addEventListener('change', () => {
    const v = clamp(parseFloat($('#bpm').value) || 110, 40, 240);
    $('#bpm').value = v;
    if (trans.playing) {
      const b = currentBeat();
      trans.startCtxTime = actx.currentTime;
      trans.startBeat = b;
    }
    project.bpm = v;
    Engine.live.setBpm(v);
    updatePosDisplay();
  });

  $('#project-name').addEventListener('change', () => {
    project.name = $('#project-name').value || 'Untitled Song';
  });
  $('#grid-select').addEventListener('change', () => {
    state.grid = parseFloat($('#grid-select').value);
  });

  $('#btn-add-inst').addEventListener('click', () => { pushUndo(); createTrack('inst'); rebuildHeaders(); requestDraw(); });
  $('#btn-add-drum').addEventListener('click', () => { pushUndo(); createTrack('drum'); rebuildHeaders(); requestDraw(); });
  $('#btn-add-audio').addEventListener('click', () => { pushUndo(); createTrack('audio'); rebuildHeaders(); requestDraw(); });

  /* mic panel wiring */
  $('#btn-mic-enable').addEventListener('click', async () => {
    if (Pitch.running) {
      Pitch.stop();
      $('#mic-meter-fill').style.width = '0%';
      $('#tuner-note').textContent = '—';
      $('#tuner-freq').textContent = 'Mic is off';
    } else {
      const r = await Pitch.start();
      if (!r.ok) { toast(r.error); return; }
      $('#mic-monitor').checked = false;
    }
    updateMicStatus();
  });
  $('#mic-monitor').addEventListener('change', (e) => Pitch.setMonitor(e.target.checked));
  document.querySelectorAll('input[name="mic-mode"]').forEach(r =>
    r.addEventListener('change', () => { state.micMode = r.value; updateMicTargetLabel(); }));

  /* ---------------- global keyboard ---------------- */

  window.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    const key = e.key.toLowerCase();

    if (e.code === 'Space') { e.preventDefault(); togglePlay(); return; }
    if ((e.ctrlKey || e.metaKey) && key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if ((e.ctrlKey || e.metaKey) && key === 'y') { e.preventDefault(); redo(); return; }
    if ((e.ctrlKey || e.metaKey) && key === 'd') {
      e.preventDefault();
      const track = selectedTrack();
      const clip = clipById(track, state.selectedClipId);
      if (track && clip) {
        pushUndo();
        const copy = JSON.parse(JSON.stringify(cleanClip(clip)));
        copy.id = uid();
        copy.start = clip.start + clip.length;
        if (clip.type === 'audio') copy.bufferId = clip.bufferId;
        track.clips.push(copy);
        state.selectedClipId = copy.id;
        layoutArrange();
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && key === 's') { e.preventDefault(); saveLocal(false); return; }
    if (e.ctrlKey || e.metaKey) return;

    if (key === 'delete' || key === 'backspace') {
      if (editor.kind === 'pr' && prSelNote) {
        const clip = editorClip();
        if (clip) {
          pushUndo();
          clip.notes = clip.notes.filter(n => n !== prSelNote);
          prSelNote = null;
          requestDraw();
        }
        return;
      }
      const track = selectedTrack();
      const clip = clipById(track, state.selectedClipId);
      if (track && clip) {
        pushUndo();
        track.clips = track.clips.filter(c => c !== clip);
        state.selectedClipId = null;
        if (editor.clipId === clip.id) closeEditor();
        requestDraw();
      }
      return;
    }

    if (key === 'r' && !e.repeat) { toggleRecord(); return; }
    if (key === 'm' && !e.repeat) { state.metronome = !state.metronome; updateToggleUI(); return; }

    const keysActive = state.activeTab === 'keys';
    if (!keysActive && key === 'l' && !e.repeat) {
      state.loopOn = !state.loopOn;
      updateToggleUI();
      requestDraw();
      return;
    }
    if (keysActive) {
      if (key === 'z' && !e.repeat) { shiftOctave(-1); return; }
      if (key === 'x' && !e.repeat) { shiftOctave(1); return; }
      if (key in KEYMAP && !e.repeat && !heldCompKeys.has(key)) {
        heldCompKeys.add(key);
        kbNoteOn(state.kbdBase + 12 + KEYMAP[key]);
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (heldCompKeys.has(key)) {
      heldCompKeys.delete(key);
      kbNoteOff(state.kbdBase + 12 + KEYMAP[key]);
    }
  });

  window.addEventListener('pointerdown', () => Engine.resume(), { once: true });
  window.addEventListener('resize', layoutArrange);
  window.addEventListener('beforeunload', () => saveLocal(true));
  setInterval(() => saveLocal(true), 30000);

  /* ---------------- render loop ---------------- */

  function frame() {
    requestAnimationFrame(frame);
    if (trans.playing || uiDirty) {
      drawArrange();
      drawRuler();
      uiDirty = false;
    }
    if (trans.playing) {
      updatePosDisplay();
      if (editor.kind === 'pr') drawPR();
      if (editor.kind === 'drum') updateDrumPlayCol();
      // keep playhead in view
      const px = getPlayheadBeat() * arr.ppb;
      if (px > arrScroll.scrollLeft + arrScroll.clientWidth - 40) {
        arrScroll.scrollLeft = px - 80;
      }
    } else if (prDirty && editor.kind === 'pr') {
      drawPR();
      prDirty = false;
    }
  }

  /* ---------------- boot ---------------- */

  function pushStarterTracks() {
    const drums = createTrack('drum', { name: 'Drums' });
    const beat = drumLoop({ kick: [0, 8], snare: [4, 12], hatC: [0, 4, 8, 12] }, 2);
    drums.clips.push({ id: uid(), name: 'Beat', start: 0, length: 8, notes: beat.notes });
    const piano = createTrack('inst', { instrument: 'piano', name: 'Piano' });
    piano.clips.push({
      id: uid(), name: 'Chords', start: 0, length: 8,
      notes: [
        { pitch: 60, start: 0, length: 2, vel: 0.8 }, { pitch: 64, start: 0, length: 2, vel: 0.7 }, { pitch: 67, start: 0, length: 2, vel: 0.7 },
        { pitch: 57, start: 2, length: 2, vel: 0.8 }, { pitch: 60, start: 2, length: 2, vel: 0.7 }, { pitch: 64, start: 2, length: 2, vel: 0.7 },
        { pitch: 65, start: 4, length: 2, vel: 0.8 }, { pitch: 69, start: 4, length: 2, vel: 0.7 }, { pitch: 72, start: 4, length: 2, vel: 0.7 },
        { pitch: 67, start: 6, length: 2, vel: 0.8 }, { pitch: 71, start: 6, length: 2, vel: 0.7 }, { pitch: 74, start: 6, length: 2, vel: 0.7 }
      ]
    });
    state.selectedTrackId = drums.id;
  }

  async function boot() {
    buildKbd();
    updateMicStatus();
    let loaded = false;
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) {
        await loadSerialized(JSON.parse(saved));
        loaded = true;
      }
    } catch (e) { /* fall through to starter */ }
    if (!loaded) {
      pushStarterTracks();
      rebuildHeaders();
      applyMix(false);
    }
    updateMicTargetLabel();
    updatePosDisplay();
    layoutArrange();
    frame();
  }

  boot();

  // exposed for testing / debugging
  window.__DAW = {
    get project() { return project; },
    state, trans,
    currentBeat: getPlayheadBeat,
    exportWav, buildDemo
  };

})();
