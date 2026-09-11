# dispatchEval

**Whether a change to one page changed what happens on another.** Golden
traces for the two things that decide what the script does on a frame: the
dispatch queue (`PageRouter.react`, src/pages.ts) and the scheduler
(`TsumTaskController.tick`, src/taskController.ts). Runs on the PC against the
built bundle, in a few seconds, with no device.

```
npm run dispatch:eval             compare against golden/; exit 1 on any change
npm run dispatch:update           rewrite golden/ from the current bundle
npm run dispatch:eval -- -v       every changed row and every finding, in full
npm run dispatch:eval -- --only StartPage     rows (or presets) whose id contains this
npm run dispatch:eval -- --dispatch | --scheduler
npm run dispatch:eval -- --strict every invariant is a gate
```

## Why

Every change made to support one page kept changing behaviour on other pages:
a handler moved between bands stopped being reached by the play loop; a
fingerprint that aliased the friends page had the blind "tap back" press the
Card button for ever; a new post-round page had to be added to a hand list or
the round was written with no score. None of it was visible until a device
showed it. This makes the whole surface visible at once, so the diff a change
produces is the review.

## What a dispatch row is

One row per **`Page` entry** (keys, not names: variants differ in where `back`
is) times **navigate goal** (`-` for none, then each `NavPlans` destination)
times **look** (`changed`: the page just turned over; `repeat`: another look at
the same page) times **age** (transient pages only: inside the window, and just
after it). The `Unknown` page is one more entry with no `Page` def.

Each row sets that state on the real router, builds the event the router would
build, and runs the real queue over a `Tsum` whose leaves are replaced
(`fake.js`): a tap writes `["tap", x, y]` in logical coordinates, a sleep
writes `["sleep", ms]` and moves the clock, a settle writes `["settle", maxMs]`
and moves nothing, a reader that would need pixels writes `["call", name]`.
Every subscription's steps run through the real `PageRouter.perform` over those
leaves, which is also where the harness records what ran -- one wrapper rather
than one per row.

What the row pins:

| field | meaning |
|:--|:--|
| `queue` | the subscription ids `plan()` put on the queue, in order |
| `ran` | the ids the dispatch reached, and what each did: `stop` (an acting band, so the queue ended there), `continue`, or `declined` when its `acts` said no and its steps were not run |
| `stoppedBy` | the id that ended the acting part of the queue, or `''` |
| `predicted` | the id the forecast (`forecastSteps`, src/forecast.ts) expected to act |
| `trace` | every tap, keycode, sleep, settle and call, in order |
| `elapsedMs` | how far the fake clock moved: the blind sleeps, and nothing else -- the logger's flood guard drops rather than sleeps, so it no longer shows here |

## What a scheduler row is

One row per preset in `presets/` (`base.json` is what every preset starts
from). The real `buildRun` (src/index.ts) builds the run off the preset's
settings -- the task table, the Now sweeps -- and the loop is driven one
`tick()` at a time under the fake clock, each job's body swapped for one that
only advances the clock by that job's duration (`durationsMs`). The Now sweeps
keep their real bodies; what they call on the run is stubbed, and `standAside`
says how many times that stub reports a round in the way before the sweep goes.

`order` is the sequence the jobs first ran in; `picks` is every pick, with the
clock offset.

## Invariants

Checked on every row, whatever the golden says:

- no image handle left open;
- no dispatch re-entered from a subscription;
- no navigate-band subscription ran with no goal set;
- nothing but the notify band ran after one acted;
- no tap on a transient page with window still to run;
- the forecast's pick agrees with the subscription that acted (both read the
  same `acts` and the same `ForecastActingBands`, so a disagreement is a bug in
  one of them).

One more is reported as a finding until the change that makes it true ships,
and is a gate under `--strict`:

- every subscription that ran declares the page it ran on (no wildcards).

## The clock

The bundle has its own realm, so `Date.now` is patched *inside* it
(`clock.js`) and the host's `sleep` becomes "move the counter". Nothing here
waits on real time, which is what makes a 1000-row run take seconds and a
deadline loop terminate.

## Updating a golden

`dispatch:update` overwrites both files from the bundle as it stands. Read the
diff before committing it: a row that changed for a page the change was not
about is exactly what this tool exists to catch.
