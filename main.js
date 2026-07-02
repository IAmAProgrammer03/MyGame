/* ============================================================
   main.js — boots the observation deck and runs the loop.
   Nothing here saves anything, ever. Closing the tab is the
   end of this him; opening it again is the same morning,
   starting over, none the wiser.
   ============================================================ */

(function () {
  "use strict";

  var thoughtsEl, srThoughtsEl, affectEl, clockEl, hintEl;

  // announce a finished thought to assistive tech, once, whole
  function announce(text) {
    var div = document.createElement("div");
    div.textContent = text;
    srThoughtsEl.appendChild(div);
    while (srThoughtsEl.childNodes.length > 30) {
      srThoughtsEl.removeChild(srThoughtsEl.firstChild);
    }
  }

  // --- typewriter queue for the cognitive trace ---
  var queue = [];
  var current = null; // { el, bodyEl, text, shown }

  function fmtT(sec) {
    var mm = Math.floor(sec / 60), ss = Math.floor(sec % 60);
    return "T+" + (mm < 10 ? "0" : "") + mm + ":" + (ss < 10 ? "0" : "") + ss;
  }

  function nearBottom() {
    return thoughtsEl.scrollHeight - thoughtsEl.scrollTop - thoughtsEl.clientHeight < 48;
  }

  function beginThought(item) {
    var el = document.createElement("div");
    el.className = "thought kind-" + item.kind;

    var ts = document.createElement("span");
    ts.className = "ts";
    ts.textContent = fmtT(item.t) + (item.kind === "process" ? "  · trace" : "");
    el.appendChild(ts);

    var body = document.createElement("span");
    body.className = "body";
    el.appendChild(body);

    var caret = document.createElement("span");
    caret.className = "caret";
    caret.innerHTML = "&nbsp;";
    el.appendChild(caret);

    thoughtsEl.appendChild(el);
    while (thoughtsEl.childNodes.length > 90) {
      thoughtsEl.removeChild(thoughtsEl.firstChild);
    }
    current = { el: el, bodyEl: body, caretEl: caret, text: item.text, shown: 0 };
  }

  function updateThoughts(dt) {
    var stick = nearBottom();

    if (!current && queue.length > 0) beginThought(queue.shift());

    if (current) {
      // type at a readable pace; dump instantly if we're falling behind
      var cps = 45 * Math.min(window.MIND.speed, 4);
      if (queue.length > 2) cps = 2000;
      current.shown = Math.min(current.text.length, current.shown + cps * dt);
      current.bodyEl.textContent = current.text.slice(0, Math.floor(current.shown));
      if (current.shown >= current.text.length) {
        current.el.removeChild(current.caretEl);
        announce(current.text);
        current = null;
      }
    }

    if (stick) thoughtsEl.scrollTop = thoughtsEl.scrollHeight;
  }

  // --- boot ---
  function init() {
    thoughtsEl = document.getElementById("thoughts");
    srThoughtsEl = document.getElementById("sr-thoughts");
    affectEl = document.getElementById("affect-readout");
    clockEl = document.getElementById("session-clock");
    hintEl = document.getElementById("hint");

    window.ROOM.init();
    window.SCREEN.init();

    window.MIND.on("thought", function (d) { queue.push(d); });
    window.MIND.on("monitor-click", function () {
      window.SCREEN.open();
      hintEl.classList.add("hidden");
    });

    // observer tool: ?screen=1 opens his screen immediately
    if (/[?&]screen=1/.test(window.location.search)) {
      window.SCREEN.open();
      hintEl.classList.add("hidden");
    }

    var last = performance.now();
    function frame(now) {
      var dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      window.MIND.update(dt);
      window.ROOM.update(dt);
      window.ROOM.draw();
      window.SCREEN.update(dt);
      updateThoughts(dt);

      clockEl.textContent = fmtT(window.MIND.time);
      affectEl.textContent = "unease " + window.MIND.unease.toFixed(2);
      affectEl.classList.toggle("uneasy", window.MIND.unease > 0.5);

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
