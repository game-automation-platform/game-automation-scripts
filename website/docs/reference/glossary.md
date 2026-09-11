---
title: Glossary
description: The words the code and the docs use, in one place.
---

# Glossary

**Anchor** — a named button position on a `Page` entry (`back`, `next`,
`tsums`, `store`, `mail`, `home`). A subscription taps an anchor of the entry
that matched, never a coordinate, because variants of a page put the same
button in different places.

**Band** — one of the six groups a page subscription can join: `observe`,
`record`, `guard`, `dismiss`, `navigate`, `notify`, run in that order. Which
band a subscription joins is a contract about whether it may capture or tap.

**Bubble** — what some skills and long chains leave on the board. Popped
inside a chain it clears a bigger area, so the play loop hoards bubbles and
the **Bubble Strategy** setting says how many a chain may spend.

**Bundle** — `build/index.js` (readable) or `dist/index.js` (whitespace
stripped): every `src/*.ts` concatenated in `tsconfig.json` order into one
classic script with one global scope.

**Catalogue** — a JSON index of scripts the app can download, and the public
repository that builds the official one. A **source** is a catalogue URL added
in the app.

**Chain** — a run of adjacent same-colour tsums drawn as one drag. Its length
is capped by the *Maximum Chain Number* setting or the skill's own limits.

**Channel** — Alpha, Beta or Production: a release identity in `config.json`
with its own archive name, catalogue folder and the lowest `ReleaseStatus` it
offers.

**Chore** — a scheduled task other than the round: the mailbox, the hearts,
the level-cap sweep, the box buying.

**Fever** — a mode of the board (lights down, the gauge turned into a timer),
not a page. Read off its own probes by `fever.ts` and broadcast through
`gFever`.

**Fingerprint** — a `Page` entry's list of probe pixels. A screen is
recognised when enough of them read the expected colour within threshold.

**Gauge** — the ring round the skill button that fills as chains clear;
`useSkill` fires when it is full.

**Goal** — the destination a look is made with. Only `gPages.navigate()`
passes one, and only a look with a goal lets the `navigate` band act.

**Host** — the Game Automation Platform app: the natives (capture, colour
reads, taps, shell), the WebViews, the floating bar, the installer.

**Look** — one detection: capture, sweep, broadcast. `detect` runs the queue
over it; `peek` does not.

**Mode** — a state of a screen that is not a screen of its own: fever, Formal
Beast's twin gauge, the Lorcana transformation. Read by a watcher, never from
the matched page key.

**Page** — a screen the script recognises, named by `PageName`. One name can
have several `Page` entries (variants).

**Permanent / transient** — whether a page waits for a tap or dismisses
itself after a window measured in frames. Declared per page in
`PageProfiles`.

**Preset** — a named configuration: the settings a share code carries, stored
as values. Matched, not remembered.

**Probe** — one pixel of a fingerprint: a coordinate, an expected colour and a
threshold.

**Report** — the folder the script writes when something goes wrong: the
screen, the screens before it, the settings and the last few hundred log
records. Sent in from the app's Run History.

**Ring** — the last 300 log records held in memory whether or not they were
written out; what a report carries.

**Round** — one game, from the whistle to the tally. Has its own `roundId`
and a frozen copy of the settings it was played under.

**Run** — one `start()`…`stop()`. Has its own `runId` and owns a world.

**Settle** — wait for the screen (or the play square) to stop moving, up to a
budget. The alternative to a fixed sleep, because the game animates in
frames.

**Share code / share slot** — the one-line encoding of how a round is played,
and a setting's fixed position in it.

**Skill** — what happens when a tsum's gauge fills: the activation tap and a
choreography, one file per skill under `src/skills/`.

**Subscription** — a registered reaction to a page (`gPages.subscribe`) or to
a fever (`gFever.subscribe`): an id, a sentence saying what it does, the
pages it fires on, and a list of steps.

**Toolkit** — the development toolkit: a separate private repository holding
the game's screenshots, the fingerprint studio and the detection regression.
Its commands (`pages:eval`, `chain:bench`, …) are cited in source comments
and are not scripts in this package.

**Tsum** — a game piece on the board; also `Tsum`, the object that is the
world one run is played in, and `ts`, the global that holds it.

**Whistle** — the moment a round starts, where held-back settings land and
the `roundId` opens.

**World** — everything a run owns: `ts`, the router's binding, the scheduler
and its jobs. Built by `buildRun`, dismantled by `endRun`.
