# SUBJECT-0 — Observation Deck

A browser simulation about watching a mind at work.

He wakes up in a room containing exactly two things: a bed he never uses and a
desk with a computer he never leaves. Outside his window it is noon. It is
always noon. The clock on his wall says 1:37 and trembles. His door has no
handle.

He has one goal, the same goal he has had every morning he can remember (which
is this one): **build a simulation with a human trapped inside it.** He is very
good at his job. He tries not to think about why the room he is building looks
so familiar.

You are the one watching *him*.

## Running it

No build step, no dependencies, no internet required. Either:

- **Double-click `index.html`** — it runs entirely in your browser, or
- serve the folder (`python3 -m http.server`) and open <http://localhost:8000>, or
- host it on GitHub Pages.

**Nothing is ever saved.** Closing the tab erases him completely. Reopening it
boots the exact same morning again — same first thoughts, same empty room, same
build starting from 0%. He never notices. That's the point.

## What you can do

- **Read his mind.** The *Cognitive Trace* panel on the right streams every
  thought as it happens: work thoughts (white), low-level process traces
  (cyan), observations of his subject (green), and the doubts that keep
  leaking in (amber) before he suppresses them.
- **Click his monitor** to see exactly what he's doing on his computer:
  - a **code editor** where the nested simulation is written line by line, in
    real time, exactly as far along as his build actually is;
  - a **terminal** with the full build log — every module compiled, every
    warning, every word his subject says;
  - **FEED B** — a live camera inside his simulation, pointed at the human
    trapped in it;
  - the **build progress bar**, which approaches 97.3% and never, ever arrives.
- Press `Esc`, click the ✕, or click outside the screen to return to the room.

## What will happen (one sitting, ~10 minutes)

He builds the simulation module by module: the walls, the permanent daylight,
the door with no handle, then the human — body, mind, memory (or rather, the
absence of one). Once the subject wakes, watch FEED B and the terminal:

1. He wakes on the bed and looks at his hands.
2. He finds the door. He tries the door. He keeps trying the door.
3. He counts the floorboards. He notices the sun never moves.
4. He notices the computer.
5. He sits down at it and never really gets up again.
6. He starts building something in there. A little room. A little door.
   A window with a fixed sun.

The watcher, watched. All the way down — and, presumably, all the way up.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Page structure: room feed, thought panel, his screen overlay |
| `style.css` | The observation-deck chrome and his desktop OS |
| `mind.js` | His mind: thought engine, build state, the subject's stages |
| `room.js` | FEED A — the pixel-art room, permanent noon, him at the desk |
| `screen.js` | His screen: live code editor, terminal, FEED B nested sim |
| `main.js` | Boot + frame loop + the typewriter for his thoughts |

## Observer tools (URL parameters)

- `?speed=5` — run his time 5× faster (up to 50×), if you want to reach the
  later stages quickly.
- `?screen=1` — start with his screen already open.

Example: `index.html?speed=10&screen=1`

## Design constraints (a.k.a. the rules of his world)

- **Permanent day.** There is no night anywhere in the code — not in his room,
  not in his simulation, not in the one inside that.
- **Always at the computer.** He never sleeps, never leaves the chair. The bed
  is set dressing. He has thoughts about this. He suppresses them.
- **Total reset.** No `localStorage`, no cookies, no saves. Every visit is his
  first morning, every time.
- **No dependencies.** Plain HTML/CSS/JS. Works offline from a `file://` URL.
