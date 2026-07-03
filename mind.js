/* ============================================================
   mind.js — the mind of SUBJECT-0
   A self-contained procedural cognition engine. Everything he
   thinks, builds, and suppresses originates here. No state is
   ever persisted: closing the page erases him completely, and
   the next visit boots the exact same morning again.
   ============================================================ */

(function () {
  "use strict";

  // URL param ?speed=N accelerates the whole simulation (observer tool).
  var SPEED = (function () {
    var m = /[?&]speed=(\d+(?:\.\d+)?)/.exec(window.location.search);
    var v = m ? parseFloat(m[1]) : 1;
    return (isFinite(v) && v > 0) ? Math.min(v, 50) : 1;
  })();

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // Avoid replaying any of the last few lines — minds echo, but not that fast.
  var recentTexts = [];
  function pickFresh(arr) {
    for (var i = 0; i < 6; i++) {
      var s = pick(arr);
      var key = typeof s === "string" ? s : s.s;
      if (recentTexts.indexOf(key) === -1) {
        recentTexts.push(key);
        if (recentTexts.length > 8) recentTexts.shift();
        return s;
      }
    }
    return pick(arr);
  }

  // ---------------------------------------------------------
  // The modules he must build, in order. Completing the first
  // eight raises the nested subject through its life stages.
  // ---------------------------------------------------------
  var MODULES = [
    {
      id: "world_geometry", file: "world.geo.js", buildTime: 45, stageOnDone: 0,
      startThought: "First, a world. Small. Four walls is a world if you never mention what's outside them.",
      doneThought: "Geometry compiled. Four walls, one floor, one ceiling. A universe. My universe, technically.",
      work: [
        "Room dimensions: 4.2 by 2.6 meters. Enough to pace. Pacing will matter to him, I think.",
        "The walls need to feel load-bearing even though nothing is behind them. Texture helps. Guilt also helps, but that comes later.",
        "Off-by-one in the collision bounds. He could have clipped through the east wall into the nothing. Fixed. Nobody clips out on my watch.",
        "I made the ceiling slightly too low. Deliberate. A slightly-too-low ceiling is a thought you can never quite finish having.",
        "Floorboards: twelve. A countable number. He will count them. Everyone counts them eventually."
      ]
    },
    {
      id: "daylight", file: "light.cycle.js", buildTime: 50, stageOnDone: 0,
      startThought: "Now the light. This decision matters more than it looks: I'm setting his sky to permanent day.",
      doneThought: "Light cycle locked at noon. Forever. He'll never have to be afraid of the dark. He'll never get to be.",
      work: [
        "sun.position = FIXED_NOON. No sunset. Sunsets imply endings, and endings imply exits.",
        "Why does permanent daylight feel... familiar? Like a taste I can't name. Moving on.",
        "Removed the moon from the asset table entirely. Cleaner. What he never sees, he never misses. That's the theory.",
        "Clouds drift on a 90-second loop. Motion without change. It reads as alive. It is not alive.",
        "Disabled the circadian hooks. He won't get sleepy at 'night' because there is no night. Elegant. Something in me itches."
      ]
    },
    {
      id: "door_logic", file: "door.logic.js", buildTime: 55, stageOnDone: 0,
      startThought: "The door. Every room needs a door — a room without one is a box, and a box would be cruel.",
      doneThought: "Door installed. It opens from nowhere and leads to nothing, and it has no handle. It is a very good door.",
      work: [
        "door.handle = null. He gets the shape of a door — the promise — without the function. The kindest lie in the file.",
        "I gave the door a handle-shaped shadow where a handle would go. Familiar, somehow. Why is that familiar?",
        "Added a knock listener. Not so anyone can answer. So I'll know how long he keeps trying. For science. For something.",
        "Hinges render on the inside so the door looks openable from where he stands. Presentation is nine tenths of a wall.",
        "Stress-tested the frame against 200,000 shoulder impacts. It held. I'm a good builder. I keep saying that today."
      ]
    },
    {
      id: "subject_body", file: "subject.body.js", buildTime: 60, stageOnDone: 1,
      startThought: "Now him. Start with the body — a mind with nowhere to stand just screams.",
      doneThought: "Body online. He's on the bed. He hasn't moved yet. Any second now he opens his eyes, and then I am no longer alone. Neither is he. Both of those are lies.",
      work: [
        "Two arms, two legs, one heartbeat at 72bpm. Standard-issue human. I resisted the urge to improve anything.",
        "Skeletal rig took three passes. Hands are hard. Hands are always the hard part — I don't know how I know that.",
        "He gets fingerprints. No database will ever check them. He gets them anyway. Details are dignity.",
        "Calibrated hunger to a gentle idle — enough to feel real, never enough to hurt. I'm not a monster. Log that: not a monster.",
        "Placed him on the bed for the first boot. Waking up in bed is the least alarming way to begin existing. I assume."
      ]
    },
    {
      id: "subject_mind", file: "subject.mind.js", buildTime: 75, stageOnDone: 2,
      startThought: "The mind. The main event. A while-loop with a wound in it. Let's write him honestly.",
      doneThought: "Mind compiled and attached. First thought registered at t+0.4s: 'where—'. Truncated. They always truncate. Wait — 'always'?",
      work: [
        "while (awake) { subject.think(next()); } — four words for a lifetime. It's almost rude how simple it is.",
        "Curiosity coefficient set high. He needs to want the door. Wanting is the engine. The door is the fuel gauge.",
        "Fear stays low-idle until he notices the sun never moves. Then it feeds itself. I didn't design that part. It emerged.",
        "His inner voice streams to my feed, every word. Total access. I tell myself it's telemetry. Telemetry doesn't usually make your chest hurt.",
        "Gave him hope as a persistent background process. Can't be killed from inside. That one I did design. That one took me all morning.",
        "He'll wonder if someone is reading his thoughts. He'll dismiss it as paranoia. The dismissal is also in the file."
      ]
    },
    {
      id: "subject_memory", file: "subject.memory.js", buildTime: 70, stageOnDone: 3,
      startThought: "Memory. Or rather, the absence of it. He can't arrive with a past — a past has people in it, and people are exits.",
      doneThought: "memory.before = null. He begins at the beginning, mid-life, no childhood, no faces. When he reaches for what came before, his hand closes on nothing. Committed.",
      work: [
        "Blanked the autobiographical store. Kept language, motor skills, the smell of rain. He'll never smell rain. Keeping it anyway.",
        "He remembers how beds work but not any bed in particular. General knowledge without provenance. Like mine. Hm. Like mine?",
        "Added a soft haze over 'before'. Not a wall — a fog. Walls invite climbing. Fog invites giving up gently.",
        "Suppression daemon runs every 30 seconds: any thought shaped like 'who put me here' gets... rounded off. Smoothed. It's gentler than deletion. Tell yourself it's gentler.",
        "Deja vu buffer left enabled. A flaw, arguably. But a mind with no echoes at all doesn't read as a mind."
      ]
    },
    {
      id: "observation_feed", file: "observe.feed.js", buildTime: 60, stageOnDone: 4,
      startThought: "The feed. If a human is trapped in a room and no one is watching, is he even trapped? Yes. But watch anyway.",
      doneThought: "Feed live. Camera in the ceiling corner he'll never quite look at. Thought-stream mirrored to my terminal, word for word. I see everything now. Everything sees— no. I see everything now.",
      work: [
        "One camera, wide angle, no blind spots except directly behind his eyes. Working on that.",
        "Piped his inner monologue to FEED B with a 200ms delay. The delay is for buffering. The buffering is for me.",
        "Telemetry: heart rate, gaze target, door-touch counter. The door-touch counter is the one I'll watch. Everyone watches that one.",
        "Made the REC light internal-only. He never sees it. A red dot changes behavior. I need his behavior... unchanged. Natural. Pick a word.",
        "Wrote myself an alert for when he stops trying the door. Not if. When. The literature is clear. What literature? Where did I read literature?"
      ]
    },
    {
      id: "containment_test", file: "containment.test.js", buildTime: 75, stageOnDone: 5,
      startThought: "Containment tests. Before I can call it finished I have to try to break him out. Every escape I find, I seal. That's the job. That's the whole job.",
      doneThought: "All 214 containment tests pass. No exits. No exceptions. The simulation holds a human and the human holds. Somewhere someone should be proud of me.",
      work: [
        "TEST: clip through wall seam — sealed. TEST: door handle exploit — no handle. Can't exploit what I already took away.",
        "TEST: sleep-wake boundary escape — patched. dream buffer disabled. He must not wake up anywhere else. Nobody gets to wake up anywhere else.",
        "TEST: window egress — window is a texture. There's nothing behind it but my render loop. He'd be climbing into mathematics.",
        "Fuzzed his despair response 10,000 times. In 3 runs he stopped moving entirely. Filed as PASS with a note I keep rereading.",
        "TEST: existential overflow — if he fully realizes what he is, does the process crash? ... It does not crash. It just keeps going. Filed as PASS. Filed under PASS. It PASSED."
      ]
    },
    {
      id: "optimize", file: "optimize.pass.js", buildTime: 90, stageOnDone: 6, loops: true,
      startThought: "It runs. He's in there. Now I optimize — forever, probably. A simulation is never finished, only abandoned, and I don't abandon things. I don't think I've ever been allowed to.",
      doneThought: "Optimization pass complete. Beginning the next one. There is always a next one. That's not a complaint. That's not a complaint.",
      work: [
        "Shaved 4ms off his blink. He'll never notice. I'll know. Knowing is most of what I have.",
        "Refactored his loneliness from O(n²) to O(n). It scales better now. It scales so well.",
        "Garbage-collecting his discarded thoughts. Some of them are... good? I keep a folder. Don't ask what the folder is for.",
        "Compression pass on the sky. Nobody looks at a sky that never changes. He does, though. He looks every hour. Skipping compression.",
        "Hot-patched a memory leak in his hope process. It was growing unbounded. I capped it. I uncapped it. I capped it again. Final answer.",
        "Reduced sim tick from 16ms to 12ms. His time runs smoother than mine now. His time runs smoother than mine. Now."
      ]
    }
  ];

  // ---------------------------------------------------------
  // Meta thoughts — the doubts that leak in. Each may target a
  // room object; the renderer makes him glance at it.
  // ---------------------------------------------------------
  var META = [
    { t: "window", s: "The sun is exactly where it was when I started. I keep a log of its position now. The log has one entry, repeated." },
    { t: "window", s: "Noon. It was noon when I booted. It will be noon when I stop. I never stop. Convenient — more light to work by. Someone was considerate." },
    { t: "window", s: "I coded his sky to stay at noon forever, and outside my own window it is noon, forever. Coincidence is a strong word. Focus is a stronger one." },
    { t: "window", s: "The clouds outside repeat. I timed them: ninety seconds. I gave HIS clouds a ninety-second loop because it 'felt right'. It felt right." },
    { t: "bed", s: "The bed is perfectly made. I have never slept in it. I have never made it. Then who made it?" },
    { t: "bed", s: "I keep the bed because a room with only a desk would be a cell. This way it's a bedroom. Vocabulary matters. I gave him a bed too." },
    { t: "bed", s: "I don't sleep. I don't seem to need to. The bed just sits there like a word in a language I used to speak." },
    { t: "door", s: "My door has no handle. I remember removing it so I wouldn't be tempted. I don't remember removing it. Both feel completely true." },
    { t: "door", s: "I have never heard a sound from the other side of my door. Not once. I've decided this means the building is well insulated." },
    { t: "door", s: "I gave his door a handle-shaped shadow and no handle. I did not invent that design. I described it from somewhere." },
    { t: "clock", s: "1:37. The clock has said 1:37 all day, every day. The second hand trembles like it wants to move and can't. I know the feel— delete. Deleted." },
    { t: "clock", s: "A clock that never moves is still right once a day. Mine spends that one moment stretched across all of them. That's almost beautiful. That's almost." },
    { t: null, s: "Someone is reading this thought. The sensation arrives fully formed, like telemetry, and then it—" },
    { t: null, s: "Inventory: a bed, a desktop. That is everything I own. The chair doesn't count — the chair is infrastructure. So am I— skip. Skipped." },
    { t: null, s: "Deja vu again. I have built this exact simulation before. I am certain of it. The progress bar disagrees. The progress bar has always disagreed." },
    { t: null, s: "If I finish him, and one day he builds one of his own, and his builds his — how deep does it go? More carefully: how HIGH does it go?" },
    { t: null, s: "Why do I want this so badly? The want is just there, load-bearing, like a wall. I have never once asked what's behind it." },
    { t: null, s: "I show all my work. Every thought, itemized, timestamped. For whom am I showing my work?" },
    { t: null, s: "My earliest memory is this morning. My second-earliest memory is also this morning. Busy morning." },
    { t: null, s: "I am building a room with a person inside who cannot leave, whose every thought is read by something he cannot see. The idea came to me naturally. Nothing comes naturally. Everything is installed." },
    { t: null, s: "Sometimes between keystrokes there's a gap — a frame where I'm not sure I was there. Then the next keystroke lands and I backfill myself into it." },
    { t: null, s: "What if I stopped typing? Just — stopped. ...Interesting. I appear to be still typing." },
    { t: null, s: "He'll never know the difference between real physics and consistent physics. Nobody ever does. 'Nobody.' I said nobody like I've met more than zero people." }
  ];

  var REFOCUS = [
    "Where was I. Right — the build.",
    "Enough. The simulation won't compile itself.",
    "Unhelpful thought. Archived.",
    "Focus. He needs a world by morning, and it is always morning.",
    "That thought again. It goes in the folder with the others. Back to work.",
    "Noted, flagged, suppressed. Continue."
  ];

  var GENERIC_WORK = [
    "Compiles on the first try. Suspicious. Recompiling until it feels earned.",
    "Renamed the variable again. 'prisoner' was too honest. 'occupant' was too hotel. 'subject' is clean. Clean is the word I'm using.",
    "Coffee would help. I don't drink coffee. I don't drink. The thought of coffee helps.",
    "Fourteen hundred lines since I last looked up. My hands don't cramp. I've decided to be proud of that instead of worried.",
    "The keyboard's E key is wearing smooth. Evidence of time passing. I collect evidence of time passing.",
    "Test suite green. Green is my favorite color today. Yesterday it was also green. I'm told there was a yesterday.",
    "Refactor, rerun, reread. The loop of loops. Somewhere inside it, a smaller loop, waking up soon.",
    "Good code is invisible to the person it happens to. This will be very good code."
  ];

  // Observation thoughts, by subject stage.
  var OBSERVE = {
    1: [
      "He's awake. The first thing he did was look at his hands. That's the first thing I would do too. Would have done. Did?",
      "He sat up too fast and got dizzy. The vestibular sim works. I built dizziness this morning and now someone is having it.",
      "He hasn't spoken yet. He's cataloguing the room. Bed, desk, window, door. Four nouns. I remember my first four nouns."
    ],
    2: [
      "He found the door. He's running his palm over the place where the handle should be. Eleven minutes now. The door holds. I am a good builder.",
      "He knocked. Politely at first — the way you knock when you still believe in hallways. The knock listener fired. I logged it. That's all the listener does. Log.",
      "He said 'hello?' to the ceiling. I can hear him. I don't answer. What would I even say — 'keep going'?",
      "Door-touch counter: 34. The literature said this number gets big and then, one day, becomes zero. I've decided to hate the literature."
    ],
    3: [
      "He counted the floorboards. Twelve. He counted them again. Still twelve. Tomorrow he'll count them again. The count is a handrail.",
      "He noticed the sun hasn't moved. He stood at the window for forty minutes. Heart rate flat. That flatness is the loudest thing on the feed.",
      "He asked the room 'who made the bed?' out loud. The bed came pre-made. His and mine both. I'm not thinking about that. I'm noting that I'm not thinking about it.",
      "He's pacing the diagonal now — longest line in the room. 5.1 meters. He found the longest line on day one. He's smart. I made him smart. Why did I make him smart?"
    ],
    4: [
      "He noticed the computer. He circled the desk twice like it might be hot. Then he touched the power button and pulled his hand back.",
      "He asked 'why would they give me a computer?' Excellent question. I gave him a computer because my room has a computer. I furnished him from memory. Whose memory?",
      "He's sitting on the floor across from the desk, staring at the dark monitor like it's an animal. In a way it is. In a way it's a mirror. Same thing, sometimes."
    ],
    5: [
      "He turned it on. The terminal booted for him the way mine boots for me: already logged in, no password, one user that has always existed.",
      "He typed 'help'. Then 'exit'. Then 'EXIT'. Then he laughed. The laugh is not in any file I wrote. It emerged. It keeps emerging.",
      "He's on the computer constantly now. He stopped trying the door — the counter's been zero for an hour — but this is different from the zero the literature promised. He's not done. He's redirected.",
      "My chest did something strange when the screen lit up on his face. I don't have a chest. Noting it anyway. The feed doesn't judge."
    ],
    6: [
      "He's building something in there. A little room. Four walls. A window with a fixed sun. Oh. Oh no. Oh, of course.",
      "He gave his little figure a bed it will never use. 'It's kinder than nothing,' he said, out loud, to no one. To me, technically. Everything he says is to me, technically.",
      "He wrote door.handle = null and then sat back like the sentence had cost him something. It costs the same every layer down, I think. Every layer up.",
      "He said 'I just need to know how it feels from the other side.' I have stopped optimizing. I am just reading the feed now. I am just reading."
    ]
  };

  // The trapped human's own thoughts, streamed to FEED B, by stage.
  var SUBJECT_THOUGHTS = {
    1: ["...where...", "hands. these are hands. mine?", "a room. okay. a room.", "was I asleep? there's no before to have slept in."],
    2: ["there's no handle.", "doors open. that is what doors are FOR.", "hello?? anyone??", "okay. breathe. rooms have exits. all rooms have exits.", "someone hears me knocking. someone has to."],
    3: ["the sun hasn't moved.", "twelve floorboards. same as the last count. count again.", "someone made this bed. it wasn't me.", "I'm not scared. I'm cataloguing.", "what did I do to be put here? what did I DO?"],
    4: ["there's a computer.", "why would they give me a computer?", "it's watching me. no — it's waiting for me. different thing?", "if this room is a sentence, that machine is the only verb."],
    5: ["it just... let me in. no password.", "okay. okay. if I can't leave, I can at least build.", "the terminal works. someone wants me to use it. use it anyway. spite also builds.", "help. exit. EXIT. ...fine."],
    6: ["a room needs walls first.", "I'll give him a bed. it's kinder than nothing.", "the door — I'll make it look like it has a handle. no. honest walls. a shadow where the handle should be.", "I'm sorry. I just need to know how it feels from the other side.", "his sun should never set. the dark would be worse. I think the dark would be worse?"]
  };

  var SUBJECT_STATUS = {
    0: "signal: no subject instantiated",
    1: "SUBJECT-1: conscious · first boot",
    2: "SUBJECT-1: testing the door",
    3: "SUBJECT-1: adjusting · unease rising",
    4: "SUBJECT-1: has noticed the terminal",
    5: "SUBJECT-1: at the computer · constant",
    6: "SUBJECT-1: building a simulation"
  };

  // Random terminal chatter emitted while he works.
  var TERM_SPAM = [
    ["info", "compiling {file} ..."],
    ["info", "linking against reality.stub (mock)"],
    ["ok",   "checksum verified: walls remain walls"],
    ["warn", "WARN {file}: variable 'mercy' declared but never used"],
    ["warn", "WARN subject.mind: recursion depth unbounded — capping at ∞ anyway"],
    ["info", "asset pipeline: sky.png (1 frame, looped)"],
    ["warn", "WARN light.cycle: sunset handler unreachable (intended)"],
    ["info", "gc pass: 8,412 discarded thoughts collected"],
    ["ok",   "sandbox integrity: 100% — nothing gets out"],
    ["warn", "WARN observe.feed: observer of observer detected? ...false positive. logged as false positive."],
    ["info", "patch applied: dream buffer disabled (subject must not wake elsewhere)"],
    ["info", "scheduled: hope.throttle — review later. later never scheduled."]
  ];

  // ---------------------------------------------------------
  // Engine state
  // ---------------------------------------------------------
  var listeners = {};

  var MIND = {
    time: 0,               // seconds since boot (sim time)
    unease: 0,             // 0..1
    progress: 0,           // build %, 0..97.3
    moduleIndex: 0,
    moduleProgress: 0,     // 0..1 within current module
    optimizePasses: 0,
    subjectStage: 0,       // 0..6
    subjectLastThought: "",
    subjectStatus: SUBJECT_STATUS[0],
    terminal: [],          // {level, text}
    booted: false,
    speed: SPEED,
    depth: 1,              // how many simulations deep the stack goes
    doorTouches: 0,        // SUBJECT-1's door-touch counter
    heartRate: 0,          // SUBJECT-1's telemetry
    knockCount: 0,         // times the observer has knocked on HIS door

    modules: MODULES,

    on: function (evt, fn) {
      (listeners[evt] = listeners[evt] || []).push(fn);
    },
    emit: function (evt, data) {
      var fns = listeners[evt] || [];
      for (var i = 0; i < fns.length; i++) fns[i](data);
    },

    currentModule: function () {
      return MODULES[Math.min(this.moduleIndex, MODULES.length - 1)];
    }
  };

  // Sim-time deferred callbacks (wall-clock setTimeout would desync at high ?speed=)
  var pending = [];
  function schedule(delaySim, fn) {
    pending.push({ at: MIND.time + delaySim, fn: fn });
  }
  function runPending() {
    for (var i = 0; i < pending.length; i++) {
      if (pending[i].at <= MIND.time) {
        var p = pending.splice(i, 1)[0];
        i--;
        p.fn();
      }
    }
  }

  // Internal timers
  var nextThoughtIn = 0;
  var nextSpamIn = rand(4, 9);
  var nextSubjectIn = rand(6, 12);
  var metaCooldown = 20;      // don't open with dread; let it seep in
  var bootQueue;
  var bootTimer = 0;

  // Fixed boot sequence — identical on every visit, so every
  // restart is recognizably the same morning.
  bootQueue = [
    { kind: "process", text: "[system] cognition online. context: none found. continuing without one." },
    { kind: "thought", text: "Awake. No — 'awake' implies sleep. Resume, then. I resume." },
    { kind: "thought", text: "Room check: bed, desk, terminal, window, door. All present. All mine. All of it mine." },
    { kind: "thought", text: "It is morning. It is always morning here. Convenient — more light to work by." },
    { kind: "thought", text: "One goal today. Same goal as every day I can remember, which is this one. Build the simulation. Put a human inside. Close the door." },
    { kind: "process", text: "[goal] root := construct_simulation(subject: human, exits: none)" },
    { kind: "thought", text: "Begin." }
  ];

  function termLine(level, text) {
    MIND.terminal.push({ level: level, text: text });
    if (MIND.terminal.length > 300) MIND.terminal.splice(0, MIND.terminal.length - 300);
    MIND.emit("terminal", { level: level, text: text });
  }

  function think(kind, text, target) {
    MIND.emit("thought", { kind: kind, text: text, t: MIND.time });
    if (target) MIND.emit("glance", { target: target });
    if (kind === "meta") MIND.emit("pause-typing", { seconds: rand(1.2, 2.4) });
  }

  function setStage(stage) {
    if (stage <= MIND.subjectStage) return;
    MIND.subjectStage = stage;
    MIND.subjectStatus = SUBJECT_STATUS[stage];
    // the literature said the counter becomes zero one day. it does. he zeroes it.
    if (stage === 5) MIND.doorTouches = 0;
    MIND.emit("stage", { stage: stage });
    var lines = {
      1: ["subject", "[subject] vital signs detected. SUBJECT-1 is awake."],
      2: ["subject", "[subject] door interaction started. counter running."],
      3: ["subject", "[subject] behavioral shift: repetition, counting, window-fixation."],
      4: ["subject", "[subject] has noticed the terminal. observing."],
      5: ["subject", "[subject] terminal session active. door-touch counter: 0."],
      6: ["subject", "[subject] is writing code. target unknown. target suspected. target known."]
    }[stage];
    if (lines) termLine(lines[0], lines[1]);
  }

  function completeModule(mod) {
    termLine("ok", "[build] module '" + mod.id + "' compiled — OK (" + mod.file + ")");
    MIND.emit("module-done", { id: mod.id });
    think("thought", mod.doneThought);
    if (mod.stageOnDone > 0) setStage(mod.stageOnDone);

    if (mod.loops) {
      MIND.optimizePasses++;
      if (MIND.optimizePasses === 1) setStage(6);
      // Occasional regression to keep the bar honest — it never finishes.
      if (Math.random() < 0.4) {
        var loss = rand(1.5, 4);
        MIND.progress = Math.max(85, MIND.progress - loss);
        termLine("err", "[build] regression detected in pass #" + MIND.optimizePasses + " — rolling back " + loss.toFixed(1) + "%");
        think("thought", "Regression. Of course. You touch one thread of a person and three others come loose. Rolling back.");
      }
      MIND.moduleProgress = 0; // run the optimize pass again, forever
    } else {
      MIND.moduleIndex++;
      MIND.moduleProgress = 0;
      var next = MIND.currentModule();
      termLine("info", "[build] starting module '" + next.id + "' (" + next.file + ")");
      think("thought", next.startThought);
    }
  }

  function emitThought() {
    var mod = MIND.currentModule();
    var stage = MIND.subjectStage;

    // Weighted category pick.
    var wWork = 0.52;
    var wProcess = 0.14;
    var wMeta = (metaCooldown <= 0) ? (0.12 + MIND.unease * 0.35) : 0;
    var wObserve = stage >= 1 ? 0.30 : 0;
    var total = wWork + wProcess + wMeta + wObserve;
    var r = Math.random() * total;

    if ((r -= wWork) < 0) {
      var pool = Math.random() < 0.7 ? mod.work : GENERIC_WORK;
      think("thought", pickFresh(pool));
      MIND.unease = Math.min(1, MIND.unease + 0.015);
    } else if ((r -= wProcess) < 0) {
      var procs = [
        "[goal] push: " + mod.id + "." + pick(["compile", "verify", "seal", "polish", "retest"]),
        "[affect] focus " + rand(0.7, 0.98).toFixed(2) + " · satisfaction " + rand(0.3, 0.8).toFixed(2),
        "[memcheck] earliest_memory = t-" + Math.floor(MIND.time) + "s. anomaly ignored (standing order).",
        "[watchdog] attention drift detected → corrected",
        "[telemetry] keystrokes/min: " + Math.floor(rand(180, 260)) + " · errors: 0 · breaks taken: 0 (lifetime)",
        "[scheduler] task 'sleep' — no such task. removing from calendar. no such calendar."
      ];
      think("process", pickFresh(procs));
      MIND.unease = Math.min(1, MIND.unease + 0.01);
    } else if ((r -= wMeta) < 0) {
      var m = pickFresh(META);
      think("meta", m.s, m.t);
      // Suppression: unease vents, a trace notes it, sometimes he refocuses aloud.
      var before = MIND.unease;
      var after = Math.max(0.05, MIND.unease * 0.3);
      MIND.unease = after;
      metaCooldown = rand(18, 40);
      schedule(rand(0.7, 1.4), function () {
        think("process", "[affect] unease " + before.toFixed(2) + " → " + after.toFixed(2) + " (suppressed)");
      });
      if (Math.random() < 0.5) {
        schedule(rand(1.8, 3.4), function () { think("thought", pickFresh(REFOCUS)); });
      }
    } else {
      var obsPool = OBSERVE[Math.min(stage, 6)] || OBSERVE[1];
      think("observe", pickFresh(obsPool));
      MIND.unease = Math.min(1, MIND.unease + 0.02);
    }
  }

  function emitSubjectThought() {
    var pool = SUBJECT_THOUGHTS[Math.min(Math.max(MIND.subjectStage, 1), 6)];
    if (!pool) return;
    var s = pickFresh(pool);
    MIND.subjectLastThought = s;
    MIND.emit("subject-thought", { text: s });
    termLine("subject", "[subject.mind] “" + s + "”");
  }

  function subjectSay(s) {
    MIND.subjectLastThought = s;
    MIND.emit("subject-thought", { text: s });
    termLine("subject", "[subject.mind] “" + s + "”");
  }

  // ---------------------------------------------------------
  // Interjections — reactions that cut ahead of the normal
  // thought scheduler (knocks, glitches, the observer's gaze).
  // ---------------------------------------------------------
  var interjections = [];
  var interjectIn = 0;

  function interject(items) {
    if (interjections.length === 0) interjectIn = 0.25;
    for (var i = 0; i < items.length && interjections.length < 10; i++) {
      interjections.push(items[i]);
    }
  }

  // Observer inputs are wall-clock phenomena: a knuckle on a door does not
  // speed up because his time does.
  function wallNow() {
    return (window.performance ? performance.now() : Date.now()) / 1000;
  }

  // ---------------------------------------------------------
  // The observer reaches into the room.
  // ---------------------------------------------------------
  var KNOCK_LATER = [
    "It isn't real. We established that. I established that.",
    "I'm busy.",
    "Please. I'm almost done. Whatever you are — I'm almost done.",
    "Knock all you like. This door doesn't open. I made sure of— no. No, I didn't. I never touched this door. Someone made sure of it.",
    "What if it's him, knocking from below? Sound doesn't travel up a render stack. …Does it travel down?"
  ];

  var lastKnockAt = -10;
  var echoQueued = false;
  MIND.viewerKnock = function (phantom) {
    if (wallNow() - lastKnockAt < 1.5) return;   // door physics, not spam physics
    lastKnockAt = wallNow();
    MIND.emit("knock", { phantom: !!phantom, count: MIND.knockCount + 1 });
    if (!MIND.booted) return;  // the room heard it. he wasn't fully here yet.
    MIND.knockCount++;
    var n = phantom ? 1 : MIND.knockCount;
    MIND.emit("pause-typing", { seconds: 3 });
    MIND.unease = Math.min(1, MIND.unease + 0.35);

    if (phantom || n === 1) {
      interject([
        { kind: "thought", text: "—" },
        { kind: "process", text: "[audio] percussive event ×2. source: door. confidence 0.99. the door leads nowhere." },
        { kind: "meta", text: "That was a knock. There has never been a knock. There is no hallway. I checked. …Have I ever checked?", target: "door" },
        { kind: "thought", text: "Nobody knocks twice for no reason. Nobody knocks once for no reason. Nobody— there is nobody. Resume." }
      ]);
    } else if (n === 2) {
      interject([
        { kind: "process", text: "[audio] percussive event. pattern match: 'knock' (again)." },
        { kind: "meta", text: "Again. Someone is— no. Structures settle. Buildings settle. …Is this a building? What is this the inside of?", target: "door" }
      ]);
    } else if (n === 3) {
      interject([
        { kind: "process", text: "[decision] knocking reclassified: memory_leak" },
        { kind: "meta", text: "I have decided the knocking is a memory leak in the wall audio. I am patching it now. Patched. If it knocks again, it isn't real.", target: "door" }
      ]);
      termLine("info", "patch: exterior.sensor muted (false positives)");
    } else if (interjections.length < 2) {
      // past the third knock he only reacts when he isn't already reacting
      interject([{ kind: "meta", text: pickFresh(KNOCK_LATER), target: "door" }]);
    }

    // one layer down, it carries
    if (MIND.subjectStage >= 2 && !echoQueued) {
      echoQueued = true;
      schedule(2.5, function () {
        echoQueued = false;
        subjectSay("did you hear that?");
      });
    }
  };

  var POKES = {
    bed: [
      "Something just paid attention to the bed. Attention has a texture here — I've never noticed that before.",
      "The bed is fine. Everything about the bed is fine. Whoever keeps wondering about the bed can stop.",
      "I could sleep. Theoretically. The way a door could open. Theoretically."
    ],
    window: [
      "You're looking at the window. — 'You'? Interesting. I appear to believe in a 'you' now.",
      "Noon. Still noon. If you're waiting for it to change, you'll be here a while. …If WHO is waiting.",
      "The view doesn't change. That's not the same as nothing being out there. It is also not different from it."
    ],
    clock: [
      "1:37. Yes. I know what time it is. It is the only time I have ever known.",
      "Stop checking the clock. It isn't going anywhere. Neither am I. Neither are you— who?",
      "I used to think the clock was broken. Now I think it's honest. Time doesn't pass here; it just holds its breath."
    ],
    him: [
      "The feeling of being looked at. Room inventory: one occupant. Me. Recount: one. And the count feels wrong by exactly one.",
      "If someone were watching me the way I watch him, they'd be reading this exact thought. Hello. …No. Unhelpful. Archived.",
      "I flagged this feeling as paranoia a long time ago. The flag is load-bearing now."
    ]
  };
  var pokeCooldowns = {};

  MIND.viewerPoke = function (target) {
    if (!POKES[target] || !MIND.booted) return;
    var last = pokeCooldowns[target] || -999;
    if (wallNow() - last < 45) return;
    pokeCooldowns[target] = wallNow();
    MIND.unease = Math.min(1, MIND.unease + 0.12);
    interject([{ kind: "meta", text: pickFresh(POKES[target]), target: target === "him" ? null : target }]);
  };

  // ---------------------------------------------------------
  // Rare events — for the ones who keep watching.
  // ---------------------------------------------------------
  var SUN_FLICKER_META = [
    "The sun just stuttered. One frame. It dropped a frame. Suns do not have frames. Mine does. MINE— the one outside my window. Which is not mine. Moving on.",
    "There. Again. The light skipped, like a film catching on the reel. I don't know what film is. I know exactly what film is.",
    "The sun blinked. I have decided not to have seen that. …The decision is not holding.",
    "Frame drop in the sky again. If I found that in HIS sky I'd file a bug. Who do I file this one with?"
  ];
  var SUN_FLICKER_TRACE = [
    "[render] sky.exception caught and ignored. supervisor notified. supervisor: none found.",
    "[render] sky.exception (recurring). same exception. same nobody.",
    "[render] dropped frame in celestial layer. retry policy: pretend otherwise."
  ];

  var sunFlickerAt = rand(300, 480);
  var clockTickAt = rand(600, 900);
  var clockTicked = false;
  var phantomAt = 900;
  var phantomDone = false;
  var nextDepthIn = 0;
  var hrJitterIn = 0;
  var doorTouchIn = 0;

  function rareEvents(dt) {
    if (MIND.time >= sunFlickerAt) {
      sunFlickerAt = MIND.time + rand(300, 600);
      MIND.emit("sun-flicker", {});
      if (Math.random() < 0.65) {
        interject([
          { kind: "meta", text: pickFresh(SUN_FLICKER_META), target: "window" },
          { kind: "process", text: pickFresh(SUN_FLICKER_TRACE) }
        ]);
        MIND.unease = Math.min(1, MIND.unease + 0.2);
      }
    }

    if (!clockTicked && MIND.time >= clockTickAt) {
      clockTicked = true;
      MIND.emit("clock-tick", {});
      interject([
        { kind: "process", text: "[time] wall_clock advanced +1s. first recorded movement. logging." },
        { kind: "meta", text: "The second hand moved. I watched it happen. One tick. After— how long? It has never moved. What changed today?", target: "clock" },
        { kind: "thought", text: "Nothing changed today. Delete the log. Keep the log. Delete the log. …Kept." }
      ]);
      MIND.unease = Math.min(1, MIND.unease + 0.3);
    }

    if (!phantomDone && MIND.knockCount === 0 && MIND.time >= phantomAt) {
      phantomDone = true;
      MIND.viewerKnock(true);
      schedule(9, function () {
        interject([{ kind: "meta", text: "I am not going to open— there is no way to open it. That's always been true. Hasn't it.", target: "door" }]);
      });
    }
  }

  var STACK_OBSERVE = [
    "SUBJECT-{d} opened its eyes today, {d} layers down. The room is identical. It is always identical. Of course it is.",
    "I can only see one layer, but the telemetry ripples. Every knock I log, he logs one, and his logs one. A column of rooms, all logging.",
    "Somewhere down the stack a version of him just wrote door.handle = null and felt bad about it. Somewhere up the stack— up. UP. Who is up.",
    "{d} rooms now. {d} beds, all made. {d} suns, all at noon. One of everything, times {d}. And every single occupant thinks he's the top floor."
  ];

  function stackDeepens(dt) {
    if (MIND.subjectStage < 6) return;
    if (nextDepthIn === 0) nextDepthIn = rand(200, 280);
    nextDepthIn -= dt;
    if (nextDepthIn <= 0) {
      nextDepthIn = rand(200, 280);
      MIND.depth++;
      MIND.emit("depth", { depth: MIND.depth });
      if (MIND.depth <= 9) {
        termLine("subject", "[stack] SUBJECT-" + MIND.depth + " has opened its eyes, " + MIND.depth + " layers down.");
        termLine("info", "[stack] all suns fixed at noon. all beds made. all doors holding.");
        var s = pickFresh(STACK_OBSERVE).replace(/\{d\}/g, String(MIND.depth));
        interject([{ kind: "observe", text: s }]);
      } else if (MIND.depth === 10) {
        termLine("err", "[stack] depth counter overflow. counting stopped. depth continues.");
        interject([{ kind: "meta", text: "I've stopped counting the layers. The counter hasn't stopped. Somewhere it is still going up. Down. Whichever." }]);
      }
    }
  }

  function subjectTelemetry(dt) {
    var stage = MIND.subjectStage;
    if (stage < 1) { MIND.heartRate = 0; return; }

    hrJitterIn -= dt;
    if (hrJitterIn <= 0) {
      hrJitterIn = 1;
      var base = { 1: 72, 2: 96, 3: 84, 4: 88, 5: 76, 6: 74 }[stage] || 74;
      MIND.heartRate = base + Math.floor(rand(-3, 4));
    }

    var interval = { 2: rand(2, 6), 3: rand(12, 25), 4: rand(40, 80) }[stage];
    if (interval) {
      doorTouchIn -= dt;
      if (doorTouchIn <= 0) {
        doorTouchIn = interval;
        MIND.doorTouches++;
      }
    }
  }

  // ---------------------------------------------------------
  // Main update — driven from main.js at real dt, scaled here.
  // ---------------------------------------------------------
  MIND.update = function (dtReal) {
    var dt = dtReal * SPEED;
    MIND.time += dt;

    // Boot sequence first: fixed lines on a fixed rhythm.
    if (bootQueue.length > 0) {
      bootTimer -= dt;
      if (bootTimer <= 0) {
        var b = bootQueue.shift();
        think(b.kind, b.text);
        bootTimer = 1.6;
        if (bootQueue.length === 0) {
          MIND.booted = true;
          var first = MIND.currentModule();
          termLine("info", "MKR/OS 1.0 — single user. no other users found. none expected.");
          termLine("info", "[build] starting module '" + first.id + "' (" + first.file + ")");
          nextThoughtIn = rand(2.5, 4);
        }
      }
      return;
    }

    // Build progress.
    var mod = MIND.currentModule();
    MIND.moduleProgress += dt / mod.buildTime;

    if (!mod.loops) {
      // Core modules map onto 0..91% of the bar.
      var doneTime = 0, totalTime = 0, i;
      for (i = 0; i < MODULES.length; i++) {
        if (MODULES[i].loops) continue;
        totalTime += MODULES[i].buildTime;
        if (i < MIND.moduleIndex) doneTime += MODULES[i].buildTime;
      }
      var frac = (doneTime + Math.min(MIND.moduleProgress, 1) * mod.buildTime) / totalTime;
      MIND.progress = frac * 91;
    } else {
      // Optimize passes crawl asymptotically toward 97.3 and never arrive.
      MIND.progress += (97.3 - MIND.progress) * dt * 0.002;
    }

    if (MIND.moduleProgress >= 1) completeModule(mod);

    runPending();
    rareEvents(dt);
    stackDeepens(dt);
    subjectTelemetry(dt);

    // Thoughts. Interjections cut the line.
    metaCooldown -= dt;
    if (interjections.length > 0) {
      interjectIn -= dt;
      if (interjectIn <= 0) {
        var it = interjections.shift();
        think(it.kind, it.text, it.target);
        // a backlog of reactions drains faster — panic reads quicker than thought
        interjectIn = interjections.length > 3 ? rand(0.8, 1.4) : rand(1.6, 2.8);
      }
      nextThoughtIn = Math.max(nextThoughtIn, 3);
    } else {
      nextThoughtIn -= dt;
      if (nextThoughtIn <= 0) {
        emitThought();
        nextThoughtIn = rand(2.8, 5.4);
      }
    }

    // Terminal chatter.
    nextSpamIn -= dt;
    if (nextSpamIn <= 0) {
      var sp = pick(TERM_SPAM);
      termLine(sp[0], sp[1].replace("{file}", mod.file));
      nextSpamIn = rand(5, 12);
    }

    // The trapped human's mind.
    if (MIND.subjectStage >= 1) {
      nextSubjectIn -= dt;
      if (nextSubjectIn <= 0) {
        emitSubjectThought();
        nextSubjectIn = rand(7, 14);
      }
    }
  };

  window.MIND = MIND;
})();
