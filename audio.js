/* ============================================================
   audio.js — the sound of the room
   Everything is synthesized live with WebAudio: no files, no
   network. Off by default; the observer opts in. The room hums,
   the keys click, the door knocks, the build chimes.
   ============================================================ */

(function () {
  "use strict";

  var ctx = null;
  var master = null;
  var enabled = false;
  var humGain = null;
  var humSrc = null;
  var humOsc = null;
  var noiseBuf = null;
  var lastType = 0;

  function ensure() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.6;
      master.connect(ctx.destination);

      // one second of white noise, reused for everything percussive
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      var data = noiseBuf.getChannelData(0);
      for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
    return true;
  }

  function startHum() {
    if (humGain) return;
    // low filtered noise + a faint mains-adjacent tone: a building pretending to be a building
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    var lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 110;
    humGain = ctx.createGain();
    humGain.gain.value = 0.03;
    src.connect(lp).connect(humGain).connect(master);
    src.start();
    humSrc = src;

    var osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 55;
    var og = ctx.createGain();
    og.gain.value = 0.012;
    osc.connect(og).connect(humGain);
    osc.start();
    humOsc = osc;
  }

  function stopHum() {
    if (!humGain) return;
    try { humSrc.stop(); } catch (e) {}
    try { humOsc.stop(); } catch (e) {}
    humGain.disconnect();
    humGain = null;
    humSrc = null;
    humOsc = null;
  }

  function type() {
    if (!enabled || !ctx) return;
    var now = ctx.currentTime;
    if (now - lastType < 0.045) return;
    lastType = now;
    if (Math.random() < 0.25) return;   // fingers lift sometimes

    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 0.9 + Math.random() * 0.3;
    var bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2200 + Math.random() * 2000;
    bp.Q.value = 1.4;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.06 + Math.random() * 0.05, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    src.connect(bp);
    bp.connect(g);
    g.connect(master);
    src.start(now, Math.random() * 0.5, 0.05);
  }

  function knock() {
    if (!enabled || !ctx) return;
    var now = ctx.currentTime;
    for (var i = 0; i < 2; i++) {
      var at = now + i * 0.22;
      var osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(95, at);
      osc.frequency.exponentialRampToValueAtTime(55, at + 0.1);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.5, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.16);
      osc.connect(g);
      g.connect(master);
      osc.start(at);
      osc.stop(at + 0.18);

      var th = ctx.createBufferSource();
      th.buffer = noiseBuf;
      var lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 500;
      var ng = ctx.createGain();
      ng.gain.setValueAtTime(0.25, at);
      ng.gain.exponentialRampToValueAtTime(0.001, at + 0.08);
      th.connect(lp);
      lp.connect(ng);
      ng.connect(master);
      th.start(at, Math.random() * 0.5, 0.09);
    }
  }

  function chime() {
    if (!enabled || !ctx) return;
    var now = ctx.currentTime;
    var notes = [660, 880];
    for (var i = 0; i < notes.length; i++) {
      var at = now + i * 0.12;
      var osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = notes[i];
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.05, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.35);
      osc.connect(g);
      g.connect(master);
      osc.start(at);
      osc.stop(at + 0.4);
    }
  }

  function toggle() {
    if (!enabled) {
      if (!ensure()) return false;
      enabled = true;
      // any knock/chime tails frozen by the last suspend die silently first
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(0, ctx.currentTime);
      master.gain.setValueAtTime(0.6, ctx.currentTime + 0.45);
      startHum();
    } else {
      enabled = false;
      stopHum();
      if (ctx) {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(0, ctx.currentTime);
        if (ctx.state === "running") ctx.suspend();
      }
    }
    return enabled;
  }

  function init() {
    window.MIND.on("knock", function () { knock(); });
    window.MIND.on("module-done", function () { chime(); });
  }

  window.SOUND = { init: init, toggle: toggle, type: type, isOn: function () { return enabled; } };
})();
