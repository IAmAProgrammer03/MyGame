/* ============================================================
   BeatForge Studio — Pitch Detection & Microphone Capture
   Listens to your real instrument (guitar, voice, keys, sax…),
   detects the pitch via autocorrelation (ACF2+), and can also
   record the raw audio.
   ============================================================ */
'use strict';

const Pitch = (() => {

  let stream = null, source = null, analyser = null, proc = null;
  let monitorGain = null, silentSink = null;
  let buf = null;
  let running = false;
  let rafId = 0;
  let capturing = false;
  let chunks = [];
  let onFrame = null; // set by app: ({freq, midi, cents, rms}) => {}

  /* ACF2+ autocorrelation (classic, robust for monophonic sources). */
  function autoCorrelate(b, sampleRate) {
    let SIZE = b.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) { const v = b[i]; rms += v * v; }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.012) return { freq: -1, rms };

    // Trim leading/trailing low-signal edges for a cleaner correlation
    let r1 = 0, r2 = SIZE - 1;
    const thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) if (Math.abs(b[i]) < thres) { r1 = i; break; }
    for (let i = 1; i < SIZE / 2; i++) if (Math.abs(b[SIZE - i]) < thres) { r2 = SIZE - i; break; }
    const sl = b.slice(r1, r2);
    SIZE = sl.length;
    if (SIZE < 64) return { freq: -1, rms };

    const c = new Float32Array(SIZE);
    for (let i = 0; i < SIZE; i++) {
      let sum = 0;
      for (let j = 0; j < SIZE - i; j++) sum += sl[j] * sl[j + i];
      c[i] = sum;
    }
    let d = 0;
    while (d < SIZE - 1 && c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < SIZE; i++) {
      if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
    }
    if (maxpos <= 0) return { freq: -1, rms };
    let T0 = maxpos;
    // Parabolic interpolation for sub-sample accuracy
    if (T0 > 0 && T0 < SIZE - 1) {
      const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
      const a = (x1 + x3 - 2 * x2) / 2;
      const bb = (x3 - x1) / 2;
      if (a) T0 = T0 - bb / (2 * a);
    }
    const freq = sampleRate / T0;
    if (freq < 40 || freq > 2200) return { freq: -1, rms };
    return { freq, rms };
  }

  function loop() {
    rafId = requestAnimationFrame(loop);
    if (!analyser) return;
    analyser.getFloatTimeDomainData(buf);
    const { freq, rms } = autoCorrelate(buf, Engine.ctx.sampleRate);
    let midi = -1, cents = 0;
    if (freq > 0) {
      const exact = 69 + 12 * Math.log2(freq / 440);
      midi = Math.round(exact);
      cents = Math.round((exact - midi) * 100);
    }
    if (onFrame) onFrame({ freq, midi, cents, rms });
  }

  async function start() {
    if (running) return { ok: true };
    const ctx = Engine.ensure();
    Engine.resume();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { ok: false, error: 'Microphone not available. Serve this app over http://localhost or https for mic access.' };
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
    } catch (e) {
      return { ok: false, error: 'Microphone permission denied (' + e.message + ')' };
    }
    source = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    buf = new Float32Array(analyser.fftSize);
    source.connect(analyser);

    // Raw-audio capture path (ScriptProcessor needs a destination connection to run)
    proc = ctx.createScriptProcessor(4096, 1, 1);
    silentSink = ctx.createGain();
    silentSink.gain.value = 0;
    source.connect(proc);
    proc.connect(silentSink);
    silentSink.connect(ctx.destination);
    proc.onaudioprocess = (e) => {
      if (capturing) chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };

    // Optional self-monitoring (off by default to avoid feedback)
    monitorGain = ctx.createGain();
    monitorGain.gain.value = 0;
    source.connect(monitorGain);
    monitorGain.connect(Engine.live.master);

    running = true;
    loop();
    return { ok: true };
  }

  function stop() {
    if (!running) return;
    cancelAnimationFrame(rafId);
    capturing = false;
    chunks = [];
    try {
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (source) source.disconnect();
      if (proc) { proc.onaudioprocess = null; proc.disconnect(); }
      if (silentSink) silentSink.disconnect();
      if (monitorGain) monitorGain.disconnect();
    } catch (e) { /* ok */ }
    stream = source = analyser = proc = monitorGain = silentSink = null;
    running = false;
  }

  function setMonitor(on) {
    if (monitorGain) monitorGain.gain.value = on ? 0.9 : 0;
  }

  function beginCapture() {
    chunks = [];
    capturing = true;
  }

  function endCapture() {
    capturing = false;
    if (!chunks.length) return null;
    const ctx = Engine.ctx;
    let total = 0;
    for (const c of chunks) total += c.length;
    const out = ctx.createBuffer(1, total, ctx.sampleRate);
    const d = out.getChannelData(0);
    let off = 0;
    for (const c of chunks) { d.set(c, off); off += c.length; }
    chunks = [];
    return out;
  }

  return {
    start, stop, setMonitor, beginCapture, endCapture,
    get running() { return running; },
    get capturing() { return capturing; },
    set onFrame(fn) { onFrame = fn; }
  };
})();
