---
title: Driving screens
description: Writing a task that walks the game through a flow — the rules, each paid for by a bug.
---

# Driving screens

[Handle a page](handle-a-page) is about reacting to one screen. This is about
being the thing doing the walking: a task that navigates to a screen, waits
for one, taps something that changes what is under it, and reads a list while
changing it. Every rule here was paid for by a bug rather than reasoned out in
advance; the level-cap sweep (`levelCap.ts`) is where most were learned.

## What is shared, and what you write

| | Shared — use it | Yours to write, per flow |
|:--|:--|:--|
| **Which screen is up** | `gPages` — `sweep` / `detect` / `peek` / `matches`; the `Page` table and `PageProfiles` | a `PageDef` per new screen, and a corpus frame for it |
| **Getting to a screen** | `gPages.navigate`, the `PageDef` anchors, `AnchorRoutes` | a `NavPlans` entry if the destination is a navigable one, and a `pageHandlers.ts` subscription for the tap that reaches it |
| **Leaving a screen** | the router: `navigate` plus the `dismiss` band | nothing, if the screen has an edge in the graph |
| **Anything inside a screen** — a grid, a list, a row, a badge | **nothing** | all of it |

The last row is the one to take seriously. There is no shared list or grid
abstraction, and deliberately so: the collection's grid, the mailbox's rows
and the friend list's heart column are each their own table, read by one flow.
A second list means a second table. **The router owns which screen you are on
and how to get between them; you own everything drawn inside one.**

## The rules

### 1. "What is on screen?" and "is *this* on screen?" are different questions

`sweep` / `detect` / `peek` score every entry with a sum-of-channels colour
distance against each probe's own threshold and take the best. `matches(name)`
scores only that page's entries, with the worst single channel against a fixed
20, thresholds ignored. If a page is only ever asked about by `matches()` —
every `targeted` page is — the thresholds in its entry are dead text, and
20-per-channel with no shift tolerance is the real rule. Put its probes on flat
colour, and check each one costs at most 8 of the 20 under a pixel of drift.

### 2. Aliasing runs both ways

`targeted` stops an entry winning a sweep it has no business winning. It does
**not** stop some *other* entry answering with your page's screen. A device
log saying a flow "saw" a page it could not possibly have navigated to is
usually an alias, not a wrong turn — the level-cap toast sweeps as `Received`
because three probes of that entry land on the same chrome. Usually leave it:
ask instead whether the claiming page's taps are ones the real screen
tolerates. Retuning the claiming entry needs a corpus frame of *its* page.

### 3. Navigation is a loop with a budget

`navigate()`'s cost is a plan in `NavPlans`: per pass, `times` captures, then
on a hit a hold spent *looking*, a settle and a confirming look; on a miss the
whole timeout. Three rules came out of a 13-hour run that paid 3.9 s on all 50
arrivals at the hub:

- **Do not hop when you are already there, or one tap from it.** A look taken
  then and there beats a stale `this.page`.
- **A waypoint is not an arrival.** A screen you tap straight off again needs
  no settle, no rest and no second look; the outer loop confirms the real goal.
- **A budget is spent looking, never sleeping.** A wait that is protecting
  against something has to be watching for it, or it is only a delay.

And: **`peek`, not `detect`, for "where am I?"** anywhere outside the drive
loop — a guard, a diagnostic. `detect` broadcasts, and a handler may tap, so
the question changes the screen.

### 4. A screen that waits for a tap can swallow one

A toast with no button waits for a tap anywhere — but a tap landing while it
is still animating in is swallowed by the animation. `tap` followed by a
passive wait is a coin flip you lose occasionally. The pattern that works:

```
until the deadline:
  is the destination up?      -> done
  is the blocking screen up?  -> tap it
  rest
still here?                   -> gPages.navigate(destination)
```

On a screen you are *staying on*, the answer is a **read-back**: tap, ask the
screen what it now says, tap again if it did not change. A fingerprint is
chosen from the parts that identify a page, and those are painted first — the
sort dialog's eight probes all pass 130 ms before its Close button is drawn.

### 5. An animation is measured in frames, so never wait a fixed number of milliseconds for one

The game animates on a frame counter. A panel that slides in over sixty frames
takes 1 s at 60 fps and half that at 120, so `sleep(800)` after a tap is a
guess bound to the device it was measured on — wasted on a faster one,
expired mid-animation on a slower one, where the next tap is swallowed.

**Watch the screen instead of the clock.** `ts.settleScreen(maxMs)` samples a
coarse grid twice and returns as soon as almost nothing moved. `maxMs` is a
ceiling, not a cost. Four caveats:

- The board never goes still; `settleScreen` over one can only time out. Use
  `ts.settleBoard`, which watches the play square alone, and keep its `minMs`
  floor — a cut-in can hold the board motionless before the clear.
- Small perpetual motion is not an animation: "still" allows a few moving
  points, so a pulsing badge does not hold the gate.
- **Still is not the same as ready.** A screen whose contents are still
  loading is motionless behind its fingerprint. The store fingerprints itself
  1.5 s before its boxes arrive and draws three empty placeholders — which read
  as a real three-box row. Read for the content itself, in a poll with its own
  budget, and give "not there yet" an answer of its own.
- Put the settle in the shared wait (`awaitPage`, `drive`), not at each call
  site.

```ts reference title="app.gap.Tsum/src/waits.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/waits.ts#L1-L19
```

### 6. Re-read a list you are changing

If what you do to slot *i* can move what is in slot *i+1*, do not read the
viewport once and walk it. Re-read after every action and take **the first
slot that still qualifies**: if the game reorders, the next item slid into
slot 0; if it does not, slot 0 no longer qualifies and you take slot 1. One
rule, correct under both, and you never have to know which game you are in.
"Viewport done" versus "list done" is the same trick: when nothing qualifies,
move on by one and look again.

### 7. A list is not where you left it

Opening and closing a dialog over a list can scroll it — to keep the
*selected* item in view, which is wherever the player last was. **Read your
position off a control's absence, rewind to a known end unconditionally, and
bound the rewind by the real length of the list.** Burst the taps and look
once (the capture is the expensive half of a page turn); overshooting is free
only when the control is drawn just while it applies — check that first.

### 8. One hiccup should not end a flow

A dialog that opened a beat late is not a disagreement between two readings.
Give a flow a small **miss budget** with a re-grounding step between tries and
a loud stop when it is spent — and a separate **runaway guard** for the
opposite failure, because "repeat until you find X" is unbounded on the day X
never comes, and each turn may spend something the player owns.

### 9. Every wait that can time out must say what it saw

```ts
const seen = gPages.peek(1, 500);
logWarn(Log.Unlock.PageMissed, 'Waited for a screen that did not come',
  {want: page, saw: seen === null ? 'nothing' : seen.name, waitedMs: timeoutMs});
```

Put it in the *wait*, not at each call site. One such line named `Received`
and two of the rules above followed from it within the hour.

### 10. Test the flow offline

Load the built bundle under the shim, make a `Tsum` with real methods and
stubbed leaves, and drive the task:

```js
const { ctx, host } = load.createRuntime();      // rebuilds if src/ is newer
const ts = Object.create(ctx.Tsum.prototype);    // real methods, stubbed leaves
ts.tap = ...; ts.sleep = ...; ts.readCappedCards = ...;
ts.taskAutoUnlockLevel();
```

Stub only the leaves — `tap`, `sleep`, whatever reads pixels — and let the
loop, the counters and the give-up conditions be the real ones. Model the
game's behaviour as a parameter (re-sorts or not; swallows *n* taps) and
assert the flow is right for every value. The bundle has its own realm, so
patch `Date.now` *inside* it with `vm.runInContext`, or a deadline test spins
against the real clock. [Test without a device](test-without-a-device).

### 11. Before believing a behaviour report, confirm what is on the device

Half a round trip once went into re-deriving a bug that was fixed on disk and
not installed. The version string does not change between builds; the **build
date does**, and the settings page shows it. `build/index.js` is what the
offline tools read; `dist/index.js` is what ships. Only the second is deployed.
