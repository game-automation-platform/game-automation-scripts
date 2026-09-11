---
title: Add a scheduled task
description: A chore that runs on its own clock, between rounds.
---

# Add a scheduled task

A **task** is a job the scheduler runs on an interval — the mailbox, the
hearts, the level-cap sweep, the box buying, the round itself. Each is a
`Tsum` method in its own file, registered from one table in `runPlan.ts`
that both the game bundle and the settings page's Run order card read, so the
card cannot drift from what runs.

## What a change has to touch

| # | File | What |
|:--|:--|:--|
| 1 | `src/runPlan.ts` | A `TaskName` member, a distinct `JobPriority`, and a row in `runTaskTable`. |
| 2 | `src/<chore>.ts` | The method: `Tsum.prototype.taskX = function() {...}`. |
| 3 | `src/globals.d.ts` | Its signature in `interface Tsum`, under the file's `// --- <file>.ts ---` header. |
| 4 | `src/index.ts` | A `case` in `taskBody` binding the name to the method. |
| 5 | `src/settings.ts` | A `case` in `taskLabel` and `taskDetail` — what the Run order card calls it (a `UiText` each). |
| 6 | `tools/dispatchEval/presets/` | A preset, if the job changes who goes first. |
| 7 | `CODEMAP.md` | A row in the source map if it is a new file. |

The two switches are exhaustive over `TaskName`, so a name without a body or
a label is a build error. Then `npm run typecheck` and `npm run
dispatch:update`, and read the scheduler diff.

## 1. The table

```ts reference title="app.gap.Tsum/src/runPlan.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/runPlan.ts#L15-L60
```

A `TaskSpec` is a name, a priority, an interval and whether it is due on the
loop's first pass or only after a whole interval. The rows are built from the
settings, so a job that has a switch registers only when it is on:

```ts reference title="app.gap.Tsum/src/runPlan.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/runPlan.ts#L88-L133
```

**Priorities are distinct on purpose.** When several jobs are due at once the
loop takes the lowest number, then the name; the scheduler throws on two jobs
at one priority. Put the new job where it belongs in the order the comment
above `JobPriority` describes: sweeps asked for with a Now button first, the
app restart, the coin-spending sweeps, the mailbox and hearts, the round last.

## 2. The method

A task is a method on `Tsum` that runs to completion and returns. It has the
whole world: `gPages.navigate` to get somewhere, `gPages.detect` / `peek` to
ask where it is, `this.tap`, `this.settleScreen`, the loggers. The mailbox
chore is a short one:

```ts reference title="app.gap.Tsum/src/mail.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/mail.ts#L19-L46
```

Three habits every chore keeps:

- **Return early when the run is stopping.** `this.isRunning` goes false on
  Stop; loops inside a task check it, and `this.sleep` returns early when it
  drops. `this.mayContinue()` is the one-call form.
- **Navigate rather than tap-and-hope.** `gPages.navigate(PageName.X)` polls
  and acts until the fingerprint confirms arrival; a bare `tap` + `sleep` is
  a guess that is right only on the device it was tuned on. Where a screen has
  no entry yet, use `settleScreen` after the tap as a budget, not a rest.
- **Log what happened, with fields.** Open with the chore's `Log.X.Start`,
  close with what it did; a wait that can time out says what it saw
  ([Logging and events](logging-and-events)).

Flows that walk several screens have their own rules — [Driving screens](driving-screens).

## 3. The declaration

Every `Tsum.prototype.x` needs its line in `interface Tsum`, grouped under the
implementing file; the compiler tells you immediately when you forget.

## 4. The binding

```ts reference title="app.gap.Tsum/src/index.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/index.ts#L308-L320
```

## 5. The Run order card

The card at the top of the General tab lists every job the run will register,
in order, with a detail line (the interval, what it will do). Add the job's
label and detail in `settings.ts`, each as a `UiText` with English in
`uiEn.ts`.

<ImagePlaceholder id="settings-run-order-card" alt="The Run order card listing the registered jobs in scheduler order with a detail line each" />

## A job with a Now button

The level-cap sweep and the box buying have a **Now** button beside their
schedule that runs one sweep ahead of everything else — including when the
schedule is 0. That is a one-shot task queued at a lower priority
(`JobPriority.UnlockNow`), reached from the settings page through a global the
page evaluates by name (`unlockLevelsNow`, `buyBoxesNow` in `index.ts`). A
round in progress finishes first; a chore hands over at its next step through
`yieldAsked`. Model a new one on those two.

## Testing it

`npm run dispatch:update` rewrites the scheduler golden in
`tools/dispatchEval/golden/`; the diff is the review. The scheduler half drives
`tick()` under a fake clock over each preset in `tools/dispatchEval/presets/`
and pins the order the jobs really come in — so a new job that should run
before the round, and does not, fails there before a device ever sees it.
