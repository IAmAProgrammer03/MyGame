/* ============================================================
   screen.js — what he is doing on his computer
   Opens when you click his monitor. A code editor where the
   nested simulation is being written line by line, a terminal
   of build logs, and FEED B: a live camera inside the
   simulation, pointed at the human trapped in it.
   ============================================================ */

(function () {
  "use strict";

  // ---------------------------------------------------------
  // The source code of the simulation, file by file.
  // The editor types exactly as much of it as he has built.
  // ---------------------------------------------------------
  var CODE = {
    world_geometry: [
      "// world.geo.js — the shape of everything he will ever know",
      "const ROOM = {",
      "  width:  4.2,   // meters. enough to pace.",
      "  depth:  2.6,",
      "  height: 2.31   // slightly too low. deliberate.",
      "};",
      "",
      "const walls = new WallSet(ROOM);",
      "walls.solid   = true;",
      "walls.outside = null;   // do not allocate an outside.",
      "",
      "for (const seam of walls.seams()) {",
      "  seam.weld();          // no gaps. gaps become hope.",
      "}",
      "",
      "floor.material = \"wood\";",
      "floor.boards   = 12;    // a countable number. he will count them.",
      "",
      "ceiling.attach(camera.mount);  // for later.",
      "",
      "export default ROOM;"
    ],
    daylight: [
      "// light.cycle.js — one long morning",
      "const sun = new Light(\"sun\");",
      "",
      "sun.position = FIXED_NOON;",
      "sun.motion   = null;        // sunsets imply endings.",
      "                            // endings imply exits.",
      "sky.cycle    = null;",
      "sky.moon     = undefined;   // never shipped.",
      "",
      "clouds.loop({",
      "  period: 90,               // seconds. motion without change.",
      "  shadows: false",
      "});",
      "",
      "// circadian hooks: removed.",
      "// he will not get sleepy at night.",
      "// there is no night.",
      "subject.circadian = null;",
      "",
      "window.brightness = 1.0;    // always. mine is also 1.0. noted."
    ],
    door_logic: [
      "// door.logic.js — every room deserves a door",
      "const door = new Door({ frame: \"wood\", hinges: \"inside\" });",
      "",
      "door.handle = null;                 // the kindest lie in this file",
      "door.shadow.handleShaped = true;    // familiar. why familiar?",
      "",
      "door.leadsTo = null;                // do not allocate a hallway.",
      "",
      "door.on(\"knock\", (n) => {",
      "  log.append(`knock #${n}`);        // that's all it does. log.",
      "});",
      "",
      "door.on(\"try\", () => {",
      "  counter.doorTouch += 1;           // I will watch this number.",
      "});",
      "",
      "// stress test: 200,000 shoulder impacts",
      "assert(door.integrity === 1.0);     // it held. I am a good builder.",
      "",
      "export default door;"
    ],
    subject_body: [
      "// subject.body.js — a place for the mind to stand",
      "const subject = new Human({",
      "  arms: 2, legs: 2,",
      "  heartbeat: 72,        // bpm. standard issue.",
      "  improvements: 0       // resisted.",
      "});",
      "",
      "subject.hands = rig.hands(HARD);   // hands are always the hard part",
      "subject.fingerprints = generate(); // no database will ever check them.",
      "                                   // he gets them anyway.",
      "",
      "subject.hunger = idle(GENTLE);     // real, never cruel.",
      "",
      "spawn.location = room.bed;         // waking in bed is the least",
      "spawn.posture  = \"asleep\";         // alarming way to begin existing.",
      "",
      "vitals.stream(feed.B);",
      "",
      "export default subject;"
    ],
    subject_mind: [
      "// subject.mind.js — the main event",
      "const mind = new Mind(subject);",
      "",
      "mind.loop = function () {",
      "  while (subject.awake) {",
      "    subject.think(next());      // four words for a lifetime",
      "  }",
      "};",
      "",
      "mind.curiosity = 0.94;          // he needs to want the door",
      "mind.fear      = idle(LOW);     // until he notices the sun",
      "",
      "mind.hope = daemon(() => {",
      "  return true;                  // cannot be killed from inside.",
      "});                             // this one took me all morning.",
      "",
      "mind.innerVoice.pipe(feed.B);   // every word. total access.",
      "                                // telemetry. call it telemetry.",
      "",
      "mind.paranoia.dismissal = true; // \"no one is reading my thoughts.\"",
      "                                // the dismissal is also in the file.",
      "",
      "export default mind;"
    ],
    subject_memory: [
      "// subject.memory.js — the absence that makes him possible",
      "memory.before = null;           // he begins at the beginning,",
      "                                // mid-life. no childhood. no faces.",
      "",
      "memory.keep(\"language\");",
      "memory.keep(\"motor_skills\");",
      "memory.keep(\"smell_of_rain\");   // he will never smell rain.",
      "                                // keeping it anyway.",
      "",
      "memory.haze(\"origin\", {",
      "  kind: \"fog\",                  // walls invite climbing.",
      "  density: 0.97                 // fog invites giving up gently.",
      "});",
      "",
      "daemon.every(30, () => {",
      "  const q = mind.find(\"who put me here\");",
      "  if (q) q.roundOff();          // gentler than deletion.",
      "});                             // tell yourself it's gentler.",
      "",
      "memory.dejavu = true;           // a flaw. but a mind with no echoes",
      "                                // does not read as a mind."
    ],
    observation_feed: [
      "// observe.feed.js — I see everything now",
      "const cam = new Camera({",
      "  mount: ceiling.corner.NE,     // the one he never quite looks at",
      "  angle: \"wide\",",
      "  recLight: INTERNAL_ONLY       // a red dot changes behavior.",
      "});",
      "",
      "feed.B.attach(cam);",
      "feed.B.attach(mind.innerVoice, { delay: 200 });  // ms. for buffering.",
      "                                // the buffering is for me.",
      "",
      "telemetry.watch(\"heartRate\");",
      "telemetry.watch(\"gazeTarget\");",
      "telemetry.watch(\"doorTouchCounter\");   // the one everyone watches",
      "",
      "alerts.when(counter.doorTouch)",
      "      .stopsChanging()",
      "      .notify(me);              // not if. when.",
      "",
      "export default feed.B;"
    ],
    containment_test: [
      "// containment.test.js — try to break him out. seal what you find.",
      "test(\"wall seam clip\",      () => expect(escape()).toBe(null));",
      "",
      "test(\"door handle exploit\", () => expect(door.handle).toBe(null));",
      "",
      "test(\"window egress\", () => {",
      "  // the window is a texture. behind it: my render loop.",
      "  expect(window.behind).toBe(math);",
      "});",
      "",
      "test(\"sleep-wake boundary\", () => {",
      "  dreams.buffer = null;        // he must not wake up anywhere else",
      "  expect(subject.wakesElsewhere).toBe(false);",
      "});",
      "",
      "test(\"despair shutdown\", () => {",
      "  fuzz(subject.despair, 10000);",
      "  expect(subject.moving).toBe(true);   // 3 failures. filed as PASS.",
      "});                                    // with a note. I keep rereading it.",
      "",
      "test(\"existential overflow\", () => {",
      "  subject.realize(EVERYTHING);",
      "  expect(process.crashed).toBe(false); // it does not crash.",
      "});                                    // it just keeps going."
    ],
    optimize: [
      "// optimize.pass.js — a simulation is never finished, only abandoned.",
      "// I don't abandon things. I don't think I'm allowed to.",
      "",
      "blink.duration -= 4;            // ms. he'll never notice. I'll know.",
      "",
      "loneliness.refactor(\"O(n^2)\", \"O(n)\");   // it scales so well now",
      "",
      "gc.collect(mind.discardedThoughts);",
      "folder.keep(theGoodOnes);       // don't ask what the folder is for",
      "",
      "sky.compression = SKIP;         // he looks every hour. skipping.",
      "",
      "hope.leak = patch({",
      "  cap: true,",
      "  cap: false,",
      "  cap: true                     // final answer.",
      "});",
      "",
      "sim.tick = 12;                  // his time runs smoother than mine now.",
      "                                // his time runs smoother than mine. now."
    ]
  };

  var KEYWORDS = /\b(const|let|var|function|return|new|if|else|while|for|of|null|undefined|true|false|this|typeof|export|default)\b/g;

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Tokenize a raw line into highlighted, escaped HTML.
  function highlightLine(line) {
    var out = "";
    var rest = line;
    var comIdx = rest.indexOf("//");
    var code = comIdx >= 0 ? rest.slice(0, comIdx) : rest;
    var comment = comIdx >= 0 ? rest.slice(comIdx) : "";

    // strings first, then keywords/numbers on the non-string parts
    var parts = code.split(/("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)/);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (i % 2 === 1) {
        out += '<span class="tok-str">' + escapeHtml(p) + "</span>";
      } else {
        var esc = escapeHtml(p);
        esc = esc.replace(KEYWORDS, '<span class="tok-kw">$1</span>');
        esc = esc.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-num">$1</span>');
        out += esc;
      }
    }
    if (comment) out += '<span class="tok-com">' + escapeHtml(comment) + "</span>";
    return out;
  }

  // ---------------------------------------------------------
  // State
  // ---------------------------------------------------------
  var visible = false;
  var overlay, editorCode, editorFilename, editorBody, terminalBody,
      subjectStatusEl, subjectTelemetryEl, bpFill, bpPct, previewCanvas, pctx;

  var typedChars = 0;          // how much of the current buffer is on screen
  var currentModuleId = null;
  var lastRenderedHtml = "";

  // nested-sim subject
  var subj = {
    x: 20, dir: 1, walkPhase: 0,
    target: 20, waitTimer: 1.5,
    knockTimer: 0, bubbleTimer: 0
  };
  var noiseSeed = [];
  for (var n = 0; n < 90; n++) noiseSeed.push(Math.random());

  function bufferFor(mod) { return CODE[mod.id] || CODE.optimize; }
  function bufferText(mod) { return bufferFor(mod).join("\n"); }

  // ---------------------------------------------------------
  // Editor
  // ---------------------------------------------------------
  function updateEditor(dt) {
    var mind = window.MIND;
    var mod = mind.currentModule();

    if (mod.id !== currentModuleId) {
      currentModuleId = mod.id;
      typedChars = 0;
      lastRenderedHtml = "";
    }

    var text = bufferText(mod);
    var target = Math.floor(Math.min(mind.moduleProgress, 1) * text.length);

    // an optimize pass restarting means he retypes the file
    if (target < typedChars - 2) { typedChars = 0; lastRenderedHtml = ""; }

    if (typedChars < target) {
      // catch up fast if the overlay was opened mid-module,
      // otherwise type at a human-ish burst rate
      var rate = Math.max(10, Math.min((target - typedChars) * 1.5, 400));
      typedChars = Math.min(target, typedChars + rate * dt * mind.speed);
    }

    var shown = text.slice(0, Math.floor(typedChars));
    var lines = shown.split("\n");
    var html = "";
    for (var i = 0; i < lines.length; i++) {
      var complete = i < lines.length - 1;
      html += (complete ? highlightLine(lines[i]) : escapeHtml(lines[i]));
      if (complete) html += "\n";
    }
    if (html !== lastRenderedHtml) {
      editorCode.innerHTML = html;
      lastRenderedHtml = html;
      editorBody.scrollTop = editorBody.scrollHeight;
    }

    var passLabel = "";
    if (mod.loops) passLabel = "  ·  pass #" + (mind.optimizePasses + 1);
    var name = mod.file + passLabel;
    if (editorFilename.textContent !== name) editorFilename.textContent = name;
  }

  // ---------------------------------------------------------
  // Terminal
  // ---------------------------------------------------------
  function appendTerminalLine(entry, skipScroll) {
    var div = document.createElement("div");
    div.className = "tl tl-" + entry.level;
    div.textContent = entry.text;
    terminalBody.appendChild(div);
    while (terminalBody.childNodes.length > 300) {
      terminalBody.removeChild(terminalBody.firstChild);
    }
    if (!skipScroll) terminalBody.scrollTop = terminalBody.scrollHeight;
  }

  function renderTerminalBacklog() {
    terminalBody.innerHTML = "";
    var buf = window.MIND.terminal;
    for (var i = 0; i < buf.length; i++) appendTerminalLine(buf[i], true);
    terminalBody.scrollTop = terminalBody.scrollHeight;
  }

  // ---------------------------------------------------------
  // FEED B — the nested simulation preview (96x72 @ 2x)
  // ---------------------------------------------------------
  function updateSubject(dt) {
    var stage = window.MIND.subjectStage;
    if (stage < 1) return;
    if (subj.bubbleTimer > 0) subj.bubbleTimer -= dt;
    if (subj.knockTimer > 0) subj.knockTimer -= dt;

    if (stage >= 5) { subj.x = 66; subj.dir = 1; subj.walkPhase += dt * 6; return; } // seated, typing

    if (subj.waitTimer > 0) {
      subj.waitTimer -= dt;
      return;
    }

    var speed = 9;
    var stepLen = speed * dt;
    if (Math.abs(subj.x - subj.target) < 1) {
      // arrived: act, then choose a new target for this stage
      var targets;
      if (stage === 1)      targets = [16, 24, 20];
      else if (stage === 2) { targets = [46, 46, 46, 28]; if (subj.target === 46) subj.knockTimer = 1.2; }
      else if (stage === 3) targets = [10, 58, 16, 46];
      else                  targets = [58, 66, 50]; // stage 4: circling the desk
      subj.target = targets[Math.floor(Math.random() * targets.length)];
      subj.waitTimer = 0.8 + Math.random() * 2.2;
    } else if (Math.abs(subj.x - subj.target) <= stepLen) {
      subj.x = subj.target;   // don't overshoot at high ?speed=
    } else {
      subj.dir = subj.x < subj.target ? 1 : -1;
      subj.x += subj.dir * stepLen;
      subj.walkPhase += dt * 8;
    }
  }

  function drawSubjectFigure(g, stage) {
    var x = Math.round(subj.x);
    var seated = stage >= 5;
    var footY = seated ? 60 : 66;
    var walking = !seated && Math.abs(subj.x - subj.target) >= 1 && subj.waitTimer <= 0;
    var step = walking && (Math.floor(subj.walkPhase) % 2 === 0) ? 1 : 0;

    g.fillStyle = "#cfe8d8";
    // head
    g.fillRect(x - 2, footY - 10, 4, 4);
    // torso
    g.fillRect(x - 2, footY - 6, 4, 4);
    // legs
    if (seated) {
      g.fillRect(x - 2, footY - 2, 2, 2);
      g.fillRect(x, footY - 2, 4, 1);        // legs forward under tiny desk
    } else if (walking) {
      g.fillRect(x - 2, footY - 2, 1, step ? 2 : 1);   // alternating step
      g.fillRect(x + 1, footY - 2, 1, step ? 1 : 2);
    } else {
      g.fillRect(x - 2, footY - 2, 1, 2);
      g.fillRect(x + 1, footY - 2, 1, 2);
    }
    // arms: knocking on the door, typing, or hanging
    if (subj.knockTimer > 0 && stage >= 2 && stage <= 3) {
      var kx = x + (subj.dir > 0 ? 3 : -4);
      var ky = footY - 6 + ((Math.floor(subj.knockTimer * 8) % 2) ? 0 : -1);
      g.fillRect(kx, ky, 2, 1);
    } else if (seated) {
      var ty = footY - 5 + ((Math.floor(subj.walkPhase) % 2) ? 0 : 1);
      g.fillRect(x + 2, ty, 3, 1);
    }
    // thought marker
    if (subj.bubbleTimer > 0) {
      g.fillStyle = "#7fd18a";
      g.fillRect(x - 1, footY - 14, 1, 1);
      g.fillRect(x + 1, footY - 14, 1, 1);
      g.fillRect(x + 3, footY - 14, 1, 1);
    }
  }

  function drawPreview() {
    var g = pctx;
    var stage = window.MIND.subjectStage;
    var time = window.MIND.time;

    g.setTransform(2, 0, 0, 2, 0, 0);
    g.imageSmoothingEnabled = false;

    // backdrop
    g.fillStyle = "#050d09";
    g.fillRect(0, 0, 96, 72);

    if (stage < 1) {
      // NO SIGNAL static
      for (var i = 0; i < 90; i++) {
        var v = noiseSeed[(i + Math.floor(time * 30)) % 90];
        g.fillStyle = v > 0.5 ? "#0f2418" : "#081410";
        g.fillRect((i * 7) % 96, ((i * 13) + Math.floor(time * 40)) % 72, 4, 2);
      }
      g.fillStyle = "#3e6b52";
      g.font = "6px monospace";
      g.fillText("NO SIGNAL", 31, 34);
      g.font = "4px monospace";
      g.fillText("subject.body: not compiled", 17, 43);
    } else {
      // his room, one layer down — same layout, of course
      g.fillStyle = "#0e2418"; g.fillRect(0, 0, 96, 50);          // wall
      g.fillStyle = "#0a1a10"; g.fillRect(0, 50, 96, 22);         // floor
      g.fillStyle = "#1c4030"; g.fillRect(0, 48, 96, 2);          // baseboard

      // window with a fixed sun
      g.fillStyle = "#1c4030"; g.fillRect(6, 6, 26, 22);
      g.fillStyle = "#16382a"; g.fillRect(8, 8, 22, 18);
      g.fillStyle = "#58e0a0";
      g.beginPath(); g.arc(15, 15, 3, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#1c4030"; g.fillRect(18, 8, 2, 18); g.fillRect(8, 16, 22, 2);

      // door, no handle
      g.fillStyle = "#1c4030"; g.fillRect(40, 12, 18, 38);
      g.fillStyle = "#16382a"; g.fillRect(42, 14, 14, 36);
      g.fillStyle = "#0e2418"; g.fillRect(43, 30, 2, 3);          // handle-shaped shadow

      // bed, untouched
      g.fillStyle = "#1c4030"; g.fillRect(4, 58, 24, 8);
      g.fillStyle = "#2e5a45"; g.fillRect(4, 56, 24, 3);
      g.fillStyle = "#3e6b52"; g.fillRect(5, 54, 7, 3);           // pillow

      // desk + computer
      g.fillStyle = "#1c4030"; g.fillRect(62, 48, 30, 2);         // top
      g.fillRect(63, 50, 2, 14); g.fillRect(89, 50, 2, 14);       // legs
      g.fillStyle = "#16382a"; g.fillRect(70, 34, 14, 12);        // monitor
      if (stage >= 5) {
        // he turned it on
        g.fillStyle = "#58e0c0"; g.fillRect(71, 35, 12, 10);
        if (stage >= 6) {
          // on his screen: another room. another figure. another sun.
          g.fillStyle = "#0e2418"; g.fillRect(72, 36, 10, 8);
          g.fillStyle = "#58e0a0"; g.fillRect(73, 37, 2, 2);      // a tiny fixed sun
          g.fillStyle = "#cfe8d8"; g.fillRect(78, 41, 1, 2);      // a tiny someone
          g.fillStyle = "#1c4030"; g.fillRect(76, 38, 1, 5);      // a tiny door
        }
      }

      drawSubjectFigure(g, stage);
    }

    // feed dressing: scanlines, timestamp, flicker
    g.fillStyle = "rgba(0,0,0,0.16)";
    for (var y = 0; y < 72; y += 2) g.fillRect(0, y, 96, 1);
    g.fillStyle = "rgba(88,224,160,0.05)";
    g.fillRect(0, 0, 96, 72);
    var mm = Math.floor(time / 60), ss = Math.floor(time % 60);
    g.fillStyle = "#3e6b52";
    g.font = "5px monospace";
    g.fillText("T+" + (mm < 10 ? "0" : "") + mm + ":" + (ss < 10 ? "0" : "") + ss, 66, 6);
  }

  // ---------------------------------------------------------
  // Open / close
  // ---------------------------------------------------------
  function open() {
    if (visible) return;
    visible = true;
    overlay.classList.remove("hidden");
    renderTerminalBacklog();
    lastRenderedHtml = "";  // force editor re-render
  }

  function close() {
    visible = false;
    overlay.classList.add("hidden");
  }

  // ---------------------------------------------------------
  // Frame update
  // ---------------------------------------------------------
  function update(dt) {
    // the nested sim advances whether or not anyone watches it
    updateSubject(dt * window.MIND.speed);

    if (!visible) return;

    updateEditor(dt);
    drawPreview();

    var p = window.MIND.progress;
    bpFill.style.width = Math.min(p, 100) + "%";
    // floor, don't round: the display must never claim 97.3 either
    bpPct.textContent = (Math.floor(p * 10) / 10).toFixed(1) + "%";

    var st = window.MIND.subjectStatus;
    var lt = window.MIND.subjectLastThought;
    var line = lt && window.MIND.subjectStage >= 1 ? st + "  ·  “" + lt + "”" : st;
    if (subjectStatusEl.textContent !== line) subjectStatusEl.textContent = line;

    var tele;
    if (window.MIND.subjectStage < 1) {
      tele = "telemetry: —";
    } else {
      tele = "♥ " + window.MIND.heartRate + " bpm  ·  door: " +
             window.MIND.doorTouches + "  ·  stack: " +
             (window.MIND.depth > 9 ? "9+" : window.MIND.depth);
    }
    if (subjectTelemetryEl.textContent !== tele) subjectTelemetryEl.textContent = tele;
  }

  function init() {
    overlay = document.getElementById("screen-overlay");
    editorCode = document.getElementById("editor-code");
    editorFilename = document.getElementById("editor-filename");
    editorBody = document.getElementById("editor-body");
    terminalBody = document.getElementById("terminal-body");
    subjectStatusEl = document.getElementById("subject-status");
    subjectTelemetryEl = document.getElementById("subject-telemetry");
    bpFill = document.getElementById("bp-fill");
    bpPct = document.getElementById("bp-pct");
    previewCanvas = document.getElementById("preview-canvas");
    pctx = previewCanvas.getContext("2d");

    document.getElementById("screen-close").addEventListener("click", close);
    document.getElementById("screen-scrim").addEventListener("click", close);
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") close();
    });

    window.MIND.on("terminal", function (entry) {
      if (visible) appendTerminalLine(entry);
    });
    window.MIND.on("subject-thought", function () {
      subj.bubbleTimer = 2.2;
    });
  }

  window.SCREEN = { init: init, open: open, close: close, update: update, isOpen: function () { return visible; } };
})();
