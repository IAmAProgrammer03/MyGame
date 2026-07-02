/* ============================================================
   room.js — FEED A: the habitat
   A 320x200 pixel-art room rendered onto a scaled canvas.
   Permanent noon. A bed he never uses. A desk he never leaves.
   A clock that never moves. A door with no handle.
   ============================================================ */

(function () {
  "use strict";

  var VW = 320, VH = 200;

  var canvas, ctx, scale = 1;

  // --- animation state ---
  var t = 0;
  var typingPhase = 0;
  var typingPaused = 0;       // seconds left of a thinking-pause
  var glanceTimer = 0;        // seconds left of a glance
  var glanceTarget = null;
  var ledPhase = 0;
  var flickerTimer = 0;
  var flickerNext = 3;
  var hoverMonitor = false;

  // Clouds inside the window (virtual coords, clipped to the glass).
  var clouds = [
    { x: 30, y: 34, s: 1.6, w: 22 },
    { x: 72, y: 52, s: 1.1, w: 16 }
  ];

  // Scrolling "code" on his monitor.
  var codeLines = [];
  var codeScroll = 0;
  (function seedCode() {
    for (var i = 0; i < 9; i++) codeLines.push(makeCodeLine());
  })();
  function makeCodeLine() {
    var segs = [];
    var n = 1 + Math.floor(Math.random() * 3);
    var x = 2 + Math.floor(Math.random() * 6);
    for (var i = 0; i < n; i++) {
      var w = 4 + Math.floor(Math.random() * 12);
      segs.push({ x: x, w: w, c: Math.random() < 0.3 ? "#58e0c0" : "#3aa8d8" });
      x += w + 3;
      if (x > 38) break;
    }
    return segs;
  }

  // Regions (virtual coords)
  var HIT_COMPUTER = { x: 208, y: 62, w: 106, h: 108 }; // desk + monitor + tower

  function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

  // ---------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------
  function drawWallFloor() {
    rect(0, 0, VW, 140, "#e5d5ae");            // wall, daylight-warm
    rect(0, 0, VW, 6, "#d8c69c");              // ceiling shadow line
    rect(0, 132, VW, 8, "#c9b58c");            // baseboard
    rect(0, 140, VW, 60, "#b07a45");           // floor
    // plank seams
    ctx.fillStyle = "#9a6a3a";
    for (var y = 152; y < 200; y += 12) ctx.fillRect(0, y, VW, 1);
    var offs = [14, 62, 38, 90, 20];
    for (var r = 0; r < 5; r++) {
      for (var x = offs[r]; x < VW; x += 96) {
        ctx.fillRect(x, 140 + r * 12, 1, 12);
      }
    }
  }

  function drawWindow() {
    // frame
    rect(22, 20, 92, 74, "#7a5230");
    // glass
    var gx = 26, gy = 24, gw = 84, gh = 66;
    ctx.save();
    ctx.beginPath();
    ctx.rect(gx, gy, gw, gh);
    ctx.clip();
    // sky — fixed noon, forever
    rect(gx, gy, gw, gh, "#8fd4f2");
    rect(gx, gy + 40, gw, gh - 40, "#a5e0f8");
    // sun: never moves
    ctx.fillStyle = "#ffe98a";
    ctx.beginPath(); ctx.arc(48, 44, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffd94a";
    ctx.beginPath(); ctx.arc(48, 44, 9, 0, Math.PI * 2); ctx.fill();
    // rays
    ctx.fillStyle = "#ffe98a";
    ctx.fillRect(46, 26, 4, 5); ctx.fillRect(46, 57, 4, 5);
    ctx.fillRect(30, 42, 5, 4); ctx.fillRect(61, 42, 5, 4);
    // clouds: motion without change
    ctx.fillStyle = "#ffffff";
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      ctx.fillRect(c.x, c.y, c.w, 5);
      ctx.fillRect(c.x + 4, c.y - 3, c.w - 8, 4);
    }
    ctx.restore();
    // cross bars
    rect(66, 20, 4, 74, "#7a5230");
    rect(22, 54, 92, 4, "#7a5230");
    // sill
    rect(20, 92, 96, 4, "#6b4527");
  }

  function drawClock() {
    var cx = 136, cy = 34;
    ctx.fillStyle = "#4a3520";
    ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f5f0e0";
    ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#3a2a18";
    ctx.lineWidth = 1.5;
    // 1:37 — always. hour hand
    var ha = -Math.PI / 2 + ((1 + 37 / 60) / 12) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ha) * 4.5, cy + Math.sin(ha) * 4.5); ctx.stroke();
    // minute hand
    var ma = -Math.PI / 2 + (37 / 60) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ma) * 7, cy + Math.sin(ma) * 7); ctx.stroke();
    // second hand: trembles, never advances
    var tremble = Math.sin(t * 22) * 0.06;
    var sa = -Math.PI / 2 + tremble;
    ctx.strokeStyle = "#c0392b";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sa) * 8, cy + Math.sin(sa) * 8); ctx.stroke();
  }

  function drawDoor() {
    rect(146, 40, 46, 100, "#7a5230");          // frame
    rect(150, 44, 38, 96, "#9a6a3a");           // door
    rect(155, 52, 28, 34, "#8a5c32");           // upper panel
    rect(155, 94, 28, 38, "#8a5c32");           // lower panel
    // the shadow where a handle should be
    rect(153, 88, 5, 7, "#7a4e28");
    rect(154, 89, 3, 5, "#6e4522");
  }

  function drawSunray() {
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#ffe98a";
    ctx.beginPath();
    ctx.moveTo(28, 92);
    ctx.lineTo(110, 92);
    ctx.lineTo(150, 168);
    ctx.lineTo(52, 168);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawBed() {
    // headboard
    rect(14, 128, 8, 54, "#7a5230");
    // frame + legs
    rect(20, 162, 74, 8, "#8a5a33");
    rect(22, 170, 5, 12, "#6b4527");
    rect(86, 170, 5, 12, "#6b4527");
    // mattress — flat. always flat. nobody has ever slept here.
    rect(20, 150, 74, 12, "#f2ede2");
    // pillow
    rect(23, 144, 17, 8, "#ffffff");
    rect(23, 151, 17, 2, "#e2ddd2");
    // blanket, tucked with machine precision
    rect(44, 146, 50, 14, "#5a8fb8");
    rect(44, 146, 50, 3, "#4a7ca3");
    rect(44, 158, 50, 2, "#4a7ca3");
  }

  function drawDeskAndComputer() {
    // tower under the desk
    rect(286, 128, 18, 40, "#3a4048");
    rect(288, 132, 14, 2, "#2a2f36");
    rect(288, 160, 14, 1, "#2a2f36");
    rect(288, 162, 14, 1, "#2a2f36");
    // power LED
    rect(290, 136, 3, 3, ledPhase < 0.5 ? "#58e07a" : "#25402c");

    // desk legs + top
    rect(210, 124, 5, 44, "#6b4527");
    rect(306, 124, 5, 44, "#6b4527");
    rect(206, 118, 108, 7, "#8a5f38");
    rect(206, 118, 108, 2, "#9c6f45");

    // monitor glow on the wall behind it
    ctx.save();
    ctx.globalAlpha = 0.10 + (flickerTimer > 0 ? 0.08 : 0);
    ctx.fillStyle = "#7fdce8";
    ctx.fillRect(224, 62, 68, 56);
    ctx.restore();

    // monitor stand + bezel
    rect(254, 108, 6, 10, "#2a2f38");
    rect(246, 115, 22, 3, "#2a2f38");
    rect(232, 70, 52, 38, "#2a2f38");
    // screen
    rect(236, 74, 44, 30, "#0e2b38");

    // scrolling code
    ctx.save();
    ctx.beginPath(); ctx.rect(236, 74, 44, 30); ctx.clip();
    for (var i = 0; i < codeLines.length; i++) {
      var y = 74 + i * 4 - codeScroll;
      var segs = codeLines[i];
      for (var j = 0; j < segs.length; j++) {
        ctx.fillStyle = segs[j].c;
        ctx.fillRect(236 + segs[j].x, y, Math.min(segs[j].w, 42 - segs[j].x), 2);
      }
    }
    // flicker
    if (flickerTimer > 0) {
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(236, 74, 44, 30);
    }
    ctx.restore();

    // keyboard
    rect(216, 113, 30, 5, "#d8d3c8");
    rect(217, 114, 28, 1, "#b8b3a8");

    // hover outline: you can look at his screen
    if (hoverMonitor) {
      ctx.strokeStyle = "rgba(255, 180, 84, 0.85)";
      ctx.lineWidth = 1;
      ctx.strokeRect(231, 69, 54, 40);
    }
  }

  function drawChairAndHim() {
    // chair
    rect(176, 106, 6, 38, "#4a4f58");           // backrest
    rect(178, 140, 28, 5, "#4a4f58");           // seat
    rect(190, 145, 4, 16, "#3a3f48");           // pole
    rect(182, 161, 20, 4, "#3a3f48");           // base

    var bob = (Math.floor(t * 1.2) % 2 === 0) ? 0 : 1;   // slow breathing
    var glancing = glanceTimer > 0;

    // legs, tucked toward the desk
    rect(196, 132, 16, 6, "#3a4048");
    rect(208, 132, 6, 20, "#3a4048");
    rect(206, 150, 10, 4, "#2b2620");           // shoe

    // torso
    rect(182, 104 + bob, 20, 38, "#607890");
    rect(182, 104 + bob, 20, 4, "#54697e");     // collar shading

    // arm reaching to the keyboard; hands type unless he's thinking
    var handDrop = (!glancing && typingPaused <= 0 && typingPhase < 0.5) ? 0 : 1;
    rect(196, 110 + bob, 22, 5, "#607890");                 // sleeve
    rect(214, 111 + bob + handDrop, 8, 4, "#d8a878");       // hand over keys

    // head
    var hy = 88 + bob;
    rect(184, hy, 16, 16, "#d8a878");
    // hair
    rect(184, hy - 2, 16, 5, "#2b2620");
    rect(182, hy, 4, 12, "#2b2620");
    // face: looks at the screen — unless something made him glance away
    if (glancing) {
      rect(186, hy + 6, 2, 2, "#2b2620");       // eye, turned left/back
      rect(196, hy - 2, 4, 6, "#2b2620");       // hair sweep as head turns
    } else {
      rect(196, hy + 6, 2, 2, "#2b2620");       // eye on the monitor
      rect(197, hy + 11, 2, 1, "#b08858");      // mouth, set
    }
  }

  function drawVignette() {
    ctx.save();
    ctx.globalAlpha = 0.18;
    var g = ctx.createRadialGradient(VW / 2, VH / 2, 90, VW / 2, VH / 2, 210);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
    ctx.restore();
  }

  // ---------------------------------------------------------
  // Update & render
  // ---------------------------------------------------------
  function update(dt) {
    t += dt;
    ledPhase = (ledPhase + dt * 0.8) % 1;

    // clouds drift on their loop — motion without change
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      c.x += c.s * dt;
      if (c.x > 112) c.x = 24 - c.w;
    }

    // typing rhythm with human-ish pauses
    if (typingPaused > 0) typingPaused -= dt;
    else typingPhase = (typingPhase + dt * 7) % 1;

    if (glanceTimer > 0) glanceTimer -= dt;

    // screen flicker
    if (flickerTimer > 0) flickerTimer -= dt;
    flickerNext -= dt;
    if (flickerNext <= 0) {
      flickerTimer = 0.1;
      flickerNext = 2.5 + Math.random() * 4;
    }

    // monitor code scroll
    codeScroll += dt * 5;
    while (codeScroll >= 4) {
      codeScroll -= 4;
      codeLines.shift();
      codeLines.push(makeCodeLine());
    }
  }

  function draw() {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    drawWallFloor();
    drawWindow();
    drawClock();
    drawDoor();
    drawSunray();
    drawBed();
    drawDeskAndComputer();
    drawChairAndHim();
    drawVignette();
  }

  // ---------------------------------------------------------
  // Sizing & input
  // ---------------------------------------------------------
  function resize() {
    var host = canvas.parentElement;
    var availW = host.clientWidth - 32;
    var availH = host.clientHeight - 48;
    scale = Math.max(1, Math.floor(Math.min(availW / VW, availH / VH)));
    canvas.width = VW * scale;
    canvas.height = VH * scale;
    canvas.style.width = (VW * scale) + "px";
    canvas.style.height = (VH * scale) + "px";
  }

  function toVirtual(ev) {
    var r = canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - r.left) / scale,
      y: (ev.clientY - r.top) / scale
    };
  }

  function inComputer(p) {
    return p.x >= HIT_COMPUTER.x && p.x <= HIT_COMPUTER.x + HIT_COMPUTER.w &&
           p.y >= HIT_COMPUTER.y && p.y <= HIT_COMPUTER.y + HIT_COMPUTER.h;
  }

  function init() {
    canvas = document.getElementById("room-canvas");
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);

    canvas.addEventListener("mousemove", function (ev) {
      hoverMonitor = inComputer(toVirtual(ev));
      canvas.classList.toggle("pointer", hoverMonitor);
    });
    canvas.addEventListener("mouseleave", function () {
      hoverMonitor = false;
      canvas.classList.remove("pointer");
    });
    canvas.addEventListener("click", function (ev) {
      if (inComputer(toVirtual(ev))) window.MIND.emit("monitor-click", {});
    });

    // his mind reaches into the room
    window.MIND.on("glance", function (d) {
      glanceTarget = d.target;
      glanceTimer = 1.8;
    });
    window.MIND.on("pause-typing", function (d) {
      typingPaused = d.seconds;
    });
  }

  window.ROOM = { init: init, update: update, draw: draw, resize: resize };
})();
