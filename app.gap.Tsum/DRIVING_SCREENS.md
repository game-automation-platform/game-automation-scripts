# Driving screens

How to write a task that walks the game through a flow — navigating to a screen,
waiting for one, tapping something that changes what is under it, and reading a
list while changing it.

`PAGE_DISPATCH.md` says what each recognised screen *is* and what happens on it.
This says how to be the thing doing the walking, and every rule below was paid
for by a bug rather than reasoned out in advance.

**A section states its rule, then marks its instance.** The rule is written in
neutral terms and is the part to lift; a paragraph headed *In the collection* is
the level-cap sweep (`Tsum.taskAutoUnlockLevel`, `src/levelCap.ts`), which is where
all eleven of these were learned. It is an example, not a template. Sections whose
subject is the shared machinery itself — §§ 1–3 — have no such paragraph, because
there is nothing collection-specific in them to set aside.

- **Recognising a screen** — `DEVELOPMENT.md` § Page dispatch, § How a match is chosen.
- **Writing a fingerprint, and whether it is any good** — the detection suite
  and its studio, `DEVELOPMENT.md` § Development tooling outside this repo.

## What is shared, and what you have to write

Worth knowing before you start, because half of it looks more general than it is.

| | Shared, use it | Yours to write, per flow |
|:--|:--|:--|
| **Which screen is up** | `gPages` — `sweep` / `detect` / `peek` / `matches`; the `Page` table and `PageProfiles` | a `PageDef` per new screen, and a corpus frame for it |
| **Getting to a screen** | `PageRouter.navigate`, the `PageDef` anchors, `AnchorRoutes` | a `NavPlans` entry if your destination is a *navigable* one, and a `pageHandlers.ts` subscription for the tap that reaches it |
| **Leaving a screen** | the router: `navigate` plus the `Dismiss` band | nothing, if the screen has an edge in the graph |
| **Anything inside a screen** — a grid, a list, a row, a badge, a chevron | **nothing** | all of it |

That last row is the one to take seriously. There is no shared list or grid
abstraction and deliberately so: `CollectionGrid` (`src/data.ts`) is the tsum
collection's own table — its eight card centres, its padlock badges, its page
chevrons — read by `Tsum.taskAutoUnlockLevel` and nothing else, the way
`HeartColumn` / `FriendListSample` / `HeartScrollPath` belong to the heart sweep.
A second list means a second table. §§ 6 and 7 are about how to *read and walk*
such a table; they are not about `CollectionGrid` specifically, and the rules in
them are what transfers.

The dividing line is the screen boundary: **the router owns which screen you are
on and how to get between them; you own everything drawn inside one.**

---

## 1. There are two different questions, and two different answers

`PageRouter` answers "what is on screen?" and "is *this* on screen?" with
different code and different tolerances, and a probe list is not automatically
right for both.

| | `sweep()` / `detect()` / `peek()` | `matches(name)` |
|:--|:--|:--|
| Scores | every entry not marked `targeted` | only entries with that `name` |
| Compares | `absColor` — the **sum** of three channel deltas | `isSameColor` — the **worst single channel** |
| Against | each probe's own `threshold` (30–80) | a hardcoded **20**, thresholds ignored |
| Decides | best entry by probe count, then slack, then `Config.pageMinMargin` | all probes pass, or no |

The divergence is deliberate and `pages.ts` explains why unifying them is not the
loosening it looks like — JPEG error spreads across all three channels, so
`(15,15,15)` passes the per-channel rule and fails a sum-of-45 threshold.

**What it means for you.** If a page is only ever asked about by `matches()` —
every `targeted` page is — then the thresholds you wrote in its entry are dead
text, and 20-per-channel with **no shift tolerance** is the real rule. So put its
probes on flat colour and prove it:

```
    ( 440, 530)  threshold  40   exact   0   worst of the 8 neighbours   4
```

Every probe on `RaiseLevelCap` and `LevelCapRaised` costs at most **8 of the 20**
under a full pixel of drift. That is the number to check when authoring one; a
probe on an edge blows the budget from a single pixel of movement and gives you
an intermittent failure that looks like a timing bug.

## 2. Aliasing runs both ways, and the second way is the one that bites

`targeted` (`PageDef`, `src/globals.d.ts`) stops an entry winning a sweep it has
no business winning. It does **not** stop some *other* entry answering with your
page's screen, and nothing was checking that.

The level-cap toast is `HeartSent`'s sprite. Marking `LevelCapRaised` targeted
kept it out of sweeps — and a sweep of its frame still answers `Received`,
because `Received2`'s three probes land on the same three-band chrome and pass
with errors of **16, 6 and 24** against a threshold of 80.

This is worth internalising because of how it shows up: **a device log saying the
flow "saw" a page it could not possibly have navigated to is usually an alias,
not a wrong turn.** Ours read

```json
{"event":"unlock.pageMissed","data":{"want":"TsumsPage","saw":"Received","waitedMs":6000}}
```

during a level-cap raise, on a device whose mailbox nothing had opened.

**Checking it.** The detection suite's `pages:eval` names the claim on the
targeted row:

```
LevelCapRaised/level_cap_raised_daisy.png
  LevelCapRaised      matches() said yes, but a sweep of this frame answers Received  (Received2)
```

**Fixing it, or not.** Usually not. Ask instead whether the claiming page's
`back` / `next` are taps the real screen tolerates — for a toast that swallows a
tap anywhere, they are, and the alias is harmless. Retuning the *claiming* entry
needs a corpus frame of its own page, or you are trading a known-benign alias for
an unmeasured guess at a page the mail flow depends on. File the frame first.

## 3. What navigation actually costs

`navigate()` is a loop, and its cost is a plan in `NavPlans` (`src/data.ts`), not
a constant. Per iteration:

```
detect(plan.times, plan.timeout)     times captures, PageSweepSpacingMs (100ms) between them
  matched the goal   ->  holdGoal(plan.holdMs)  +  settleScreen(plan.settleMaxMs)  +  a confirming detect(1, 500)
  did not           ->  checkStall  +  sleep(plan.restMs)
```

A **hit** returns as soon as its round of captures finishes. A **miss** burns the
whole `timeout` — that is where a detection's budget goes, and it is why
`Log.Page.Unmatched` carries `durationMs` / `captureMs` / `scoreMs` / `passes`.

`FriendPage`'s plan is `holdMs: 3000`, `restMs: 1000`, `startupWaitMs: 5000`,
because it is where a new event window flies in from. Every plan that declares a
`via` declares `FriendPage`. That arithmetic — two passes home, the arrival, a 1s
rest, then the collection's own loop — is exactly the **11–12 seconds** a run
reported for reaching the collection.

Three rules came out of it.

### Do not hop when you are already there, or one tap from it

The `via` hop used to be unconditional, on the reasoning that `this.page` is only
as fresh as the last detection and may be minutes and an app restart old. True —
and a look taken *then and there* is not that reading. `PageRouter.oneTapFrom()`
peeks once and skips the hop when the screen is the goal, or carries an anchor
whose `AnchorRoutes` entry leads to it. The collection is one tap from the friend
page the play loop sits on, so this is the common case, not the corner.

### A waypoint is not an arrival

`drive(goal, waypoint)` runs a hop without the settle, the rest, or the second
look. Those three exist so an **arrival** is not believed off a frame caught
mid-transition — but a waypoint is a screen you tap straight off again, and
whether that tap landed is settled by the outer loop confirming the real goal. A
wrong belief costs one missed tap and another pass; the ceremony cost four
seconds every time.

### A budget is spent looking, never sleeping

`holdMs` was `sleep(plan.settleMs)`: three seconds on the friend page, and the
log says it was paid in full on all **50** arrivals of a 13-hour run — a flat
3.92s each, 205 seconds, every one of them ending in the mail chore's first step.
It bought nothing, because what it was insuring against is an event window flying
in, and a sleeping script cannot see one; the window was found, if at all, by the
confirming look *after* the three seconds.

`PageRouter.holdGoal()` spends the same budget on looks. A window that lands
inside it is seen, so the dismiss band presses it away where the sleep ignored
it, and an arrival nothing lands on ends at the second agreeing look — two
captures, ~0.4s. The rule generalises: **a wait that is protecting against
something has to be watching for it**, or the budget is only a delay. `settleMs`
in a choreography is the same mistake wherever the thing being waited out has a
fingerprint (§ 5).

### `peek`, not `detect`, for "where am I?"

`detect()` broadcasts, and a subscribed handler may tap. Inside the drive loop
that is the point. Anywhere else — a guard deciding whether to hop, a diagnostic
line explaining a timeout — it means your question changed the screen. Use
`peek()`, which sweeps and returns without observing or dispatching.

## 4. A screen that waits for a tap can swallow one

A toast with no button — `HeartSent`, `LevelCapRaised` — does not clear itself
and does not time out. It waits for a tap anywhere. `PageProfiles` calls it
`Permanent` for exactly that reason: left alone it is still there.

The trap is that a tap landing while it is still animating in is swallowed **by
the animation**, not by the toast. So `tap(...)` followed by a passive wait is a
coin flip you lose occasionally.

The pattern that works:

```
until the deadline:
  is the destination up?      -> done
  is the blocking screen up?  -> tap it
  rest
still here?                   -> gPages.navigate(destination)
```

Three things earn their place. Checking the **destination first** means a tap is
never spent on whatever is behind the toast. Checking the **blocker** before
re-tapping means you stop as soon as it is gone rather than drumming on the next
screen. And handing the remainder to the **router** covers the case you did not
think of — a mission reward the action earned, an interstitial — because knowing
how to leave an arbitrary screen is the router's whole job, not yours.

> **In the collection.** `Tsum.leaveLevelCapToast` is that loop, over
> `LevelCapRaised` towards `TsumsPage`. A device log caught the old single tap
> after seven clean raises 4.04s apart, failing on the eighth — and the diagnostic
> it left is § 2's worked example, since the sweep reported the undismissed toast
> as `Received`.

This bites a screen you are **staying on** as well, and there the answer is not
a loop towards a destination but a **read-back**: tap, then ask the screen what
it now says, and tap again if it did not change. Waiting to *see* a screen is not
the same as waiting for it to be live — a fingerprint is chosen from the parts
that identify a page, and those are painted first.

> **In the collection.** `Tsum.sortCollection` picks Level Lock on the Change
> Order dialog and confirms it with `readCollectionSort`. Measured off a device
> recording of the failure: the eight fingerprint probes all pass 130ms before
> the dialog's own Close button is even drawn, and a tap in that window is
> swallowed. It cost a whole 58-second sweep, which walked forty pages in the
> player's order and raised nothing — so a pick that will not confirm now
> returns null and stops the sweep rather than running it on a false premise.

How long that window lasts is § 5's subject, and it is not a constant.

## 5. An animation is measured in frames, so never wait a fixed number of milliseconds for one

The game animates on a frame counter rather than a clock. A panel that slides in
over sixty frames is on the move for **1s at 60fps and half that at 120**, and
the same is already known elsewhere in the tree: `PageProfiles` quotes every
transient window at `PageBaselineFps` and `PageRouter.durationOf` scales it.

So `sleep(800)` after a tap is not a duration, it is a guess bound to the device
the stopwatch was held against — and it fails asymmetrically. On a faster device
it is merely wasted. On a **slower** one it expires mid-animation, and the tap
that follows is swallowed by § 4's mechanism rather than taken by the screen
under it. Tuned at 120fps and run at 60, every such rest is half the length it
needs to be, which shows up as "it works on my phone and drops taps on yours".

**Watch the screen instead of the clock.** `Tsum.settleScreen(maxMs)` samples a
coarse grid (`ScreenSettle`, `src/data.ts`), samples it again, and returns as
soon as almost nothing moved between the two. It is watching the very animation
the next tap has to wait for, so it needs no frame rate to be configured and no
constant to be re-measured per device.

Four things to know before using it.

- **`maxMs` is a ceiling, not a cost.** The call returns the moment the screen
  holds still, so a generous budget is free on a fast device and is exactly what
  a slow one needs. Sizing it at the old rest keeps the old bug.
- **Not every wait can be gated by the screen.** A board animates from the first
  frame of a round to the last, so it never goes still and `settleScreen` over
  one can only time out; `NavPlans.GamePlaying` deliberately declares no
  `settleMaxMs`. What a board has instead is `Tsum.settleBoard` (`BoardSettle`,
  `src/data.ts`): the play square alone, read coarse, still once the tsums have
  stopped falling. The wait after a skill fires runs on it with the "Skill
  Waiting time" setting as the budget, and `Tsum.awaitRoundStart` runs on it
  once the new board has fingerprinted, in place of the flat five seconds
  `nav.move.startToGame` used to sleep. Its floor (`minMs`) is deliberate: a
  cut-in can hold the board motionless before the clear, and that is not the
  stillness wanted. `dismiss.resumeGame` keeps its blind sleep, because a
  count-in is neither a screen nor a fall.
- **Small perpetual motion is not an animation.** A pulsing badge or a looping
  banner never stops, so "still" is *at most `ScreenSettle.maxMoved` of the
  sixty points moved* rather than none. A panel sliding or fading moves twenty.
- **Still is not the same as ready.** A screen whose contents are still being
  fetched is motionless behind its own fingerprint, so the gate passes at once
  and the reading that follows describes an empty frame. Nothing watching for
  movement can see this; only reading for the content itself can. Read for it in
  a poll with its own budget, and give "not there yet" an answer of its own —
  the failure is not that the reading is late, it is that a placeholder reads as
  a real layout.

> **In the store.** The Tsum Tsum Store fingerprints as itself about 1.5s before
> its boxes arrive, and until then draws three empty placeholder slots. Three is
> also how many tabs the store has when no limited-time box is running, so
> `readBoxTabCount` read the placeholders as a real three-box row and reported
> the Select Box — the fourth tab, the whole point of the sweep — as not offered.
> Its replacement, `Tsum.readBoxTabs`, returns null unless exactly one tab is
> gold, which a drawn row always has and a loading one never does.

Where it goes is wherever a fixed rest used to be: after a tap that changes the
screen, after a wait that has *seen* a page and is about to act on it, and before
a reading that a mid-transition frame would answer wrongly. Putting it in the
shared wait rather than at each call site is § 9's rule again — `Tsum.awaitPage`
carries one, so all five hops of the level-cap sweep got it at once, and
`PageRouter.drive` carries one for every arrival whose plan declares a budget.

> **In the collection.** The sweep's rests were 500, 600, 700 and 1200ms,
> measured at 120fps, and at 60 they were each half of what the same animations
> take — which is what "Level Lock misses taps" was. They are budgets now. The
> one thing that stayed a blind rest is the rewind's burst cadence
> (`UnlockRewindTapMs`), because bursting is the whole point of § 7's second
> rule: a settle per tap costs the capture the burst exists to avoid. Instead
> `UnlockRewindMaxPages` counts *taps* and is sized for a device that swallows
> three in four, and the burst settles once before each reading.

## 6. Re-read a list you are changing

Do not read a viewport of items once and then walk slots `0..n` through it, if
what you do to slot `i` can move what is in slot `i+1`.

Whether the game reorders a list when you act on one of its items is a question
about the game that the tree cannot answer — and **you do not have to answer it**.
Re-read after every action and take *the first slot that still qualifies*:

- it reorders → the next qualifying item has slid into slot 0, and slot 0 is what
  you take;
- it does not → slot 0 is the one you just did and no longer qualifies, so you
  take slot 1.

One rule, correct under both. It costs one capture per action, which is nothing
against a flow where each action is seconds of taps and waits.

**Telling "viewport done" from "list done"** is the same trick: when nothing in
the viewport qualifies, move on by one and look again. If the game reorders you
never move on until the run is genuinely over; if it does not you move on once
per viewport. One wasted page turn at the end buys you not having to know which
game you are in.

> **In the collection.** The list is sorted by Level Lock, and raising a cap
> takes that tsum out of the locked group the sort is keyed on — so the eight
> cards can shift under the sweep. It reads `CollectionGrid.lockBadges` afresh
> each time round and raises the first card still wearing a padlock. The version
> that walked `0..7` off a single reading skipped every other card and then
> tapped an uncapped one, which is what "it stops after a few" turned out to be.

## 7. A list is not where you left it

**Read your position off a control's absence, rewind to a known end
unconditionally, and bound the rewind by the real length of the list.**

Opening and closing a dialog over a list can scroll it — often to keep the
*selected* item in view, which is wherever the player last was, not where your
flow wants to start. Checking once and deciding not to rewind is how a sweep
starts in the middle; a bound that merely felt generous is how it stops there.

Two things make an unconditional rewind cheap enough to always do:

- **Burst the taps.** The capture is the expensive half of a page turn, so tap
  several times, then look. Ninety pages becomes ~23 captures, not 90.
- **Overshooting is free** *when the control is only drawn while it applies* —
  the tap then lands on inert background. Check that this is true of your control
  before relying on it; it is a property of the screen, not a general licence.

Confirm arrival after the slide, not during it: a reading taken mid-animation is
not evidence.

> **In the collection.** Closing the sort dialog leaves the grid on the selected
> tsum's page, and that is usually a MyTsum at MAX, which Level Lock order puts
> near the end of ~97 pages. `collectionAtFirstPage()` reads the absence of the
> left chevron at `CollectionGrid.prevPage` — five points, majority rule —
> and `rewindCollection()` taps in bursts of four until it is gone. The bound was
> 12 pages: it walked back twelve, read eight uncapped cards and reported the job
> done, which is what "it finishes as soon as it arrives" turned out to be.

## 8. One hiccup should not end a flow

Ending a flow on the first failure is defensible for a disagreement between two
readings, and wrong for a dialog that opened a beat late. The difference between
the two is whether it happens twice.

So give a flow a small **miss budget**, a re-grounding step between tries, and a
loud stop when the budget is gone. Then give it a separate **runaway guard** for
the opposite failure: a stop condition phrased as "repeat until you find X" is an
unbounded loop on the day X never comes, and if each turn of it spends something
the player owns, that bound is not optional.

> **In the collection.** `UnlockMaxMisses = 3` failed raises in a row, each
> retried after re-taking the collection page; `UnlockMaxRaises = 200` caps, which
> only bites if the whole collection is capped — every one of them costs coins.

## 9. Every wait that can time out must say what it saw

A wait that logs only that it timed out has thrown away the one fact worth
having. Name the screen that was there instead — with `peek`, so the diagnostic
does not change what it is reporting on:

```ts
const seen = gPages.peek(1, 500);
logWarn(Log.Unlock.PageMissed, 'Waited for a screen that did not come',
  {want: page, saw: seen === null ? 'nothing' : seen.name, waitedMs: timeoutMs});
```

Put it in the *wait*, not at each call site: one place, and every way the flow
can give up runs through it.

> **In the collection.** `Tsum.awaitPage` carries it, so all five hops of the
> sweep report the same way. Before that line, three rounds of plausible theories
> about why the sweep stopped early; after it, one log line named `Received` and
> §§ 2 and 4 both followed from it within the hour.

## 10. Testing this without a device

`tools/runtime/load.js` loads the **built bundle** into a Node vm wired to the
host shim, so a test drives production control flow rather than a copy of it:

```js
const { ctx, host } = load.createRuntime();      // rebuilds if src/ is newer
const ts = Object.create(ctx.Tsum.prototype);    // real methods, stubbed leaves
ts.tap = ...; ts.sleep = ...; ts.readCappedCards = ...;
ts.taskAutoUnlockLevel();
```

- **Stub only the leaves** — `tap`, `sleep`, and whatever reads pixels. Let the
  loop, the counters and the give-up conditions be the real ones.
- **Model the game's behaviour as a parameter**, then assert the flow is right
  for every value of it: re-sorts or not, follows the changed item or not,
  swallows *n* taps. That is how "correct either way" got proved instead of
  assumed.
- **The bundle has its own realm.** Patching `Date.now` from the test file does
  nothing to it, and the context object does not expose built-ins. Use
  `vm.runInContext('var __realNow = Date.now; Date.now = __fakeNow;', ctx)` with
  the fake published as `ctx.__fakeNow` — otherwise a deadline test spins against
  the real clock and taps thousands of times.
- **`gPages.owner` / `attach`** points the router at your fake `Tsum`.

Frame-level checks belong in the detection suite's corpus; flow-level checks
belong in a script like this. Neither substitutes for the other.

## 11. Before believing a behaviour report, confirm what is on the device

Half a round trip went into re-deriving a bug that was fixed on disk and not
installed.

- The version string does not change between builds. The **build date does**, and
  the settings page shows it — that is the check.
- `npm run build` used to shell out to `zip`, which is not on every machine
  here; when it was missing the archive was left stale **and the `.sha256`
  sidecar was written for it anyway**. `tools/build/zip.js` writes the archive
  now, so there is nothing to be missing — but a stale archive is still the
  first thing to suspect when a fix does not appear on the device.
- `build/index.js` is what the offline harnesses read. `dist/index.js` is what
  ships. They are not the same file, and only the second one is deployed.
