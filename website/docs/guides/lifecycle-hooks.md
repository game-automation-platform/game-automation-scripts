---
title: Lifecycle hooks
description: Where to put code that should run when something happens.
---

# Lifecycle hooks

The script has no event bus. Each "when X happens" has one place that
already decides it, and that is where a reaction goes. This page is the map.

| I want to run code when… | Hook into | Notes |
|:--|:--|:--|
| a run starts | `buildRun` in `index.ts` | After `ts` exists and before the scheduler starts. Reset per-run state here (`gFever.reset()`, `lorcanaReset()` are the models). |
| a run ends | `endRun` in `index.ts` | The only place that dismantles the world; runs on the thread that owns it. |
| a stop is requested | `ts.isRunning` | Not a hook: long loops poll it, `sleep` returns early on it, the touch wrappers refuse on it. A task body that wants the run to end calls `requestStop()`. |
| a round is about to start | `openRound` in `play.ts` | Called from the pre-round screen with the items set; `round.start` goes out here with the frozen `roundSettings`. |
| the whistle — the last moment a setting can shape this round | `quickBarApplyPending` in `quickbar.ts` | Held-back settings land; the walk to the board follows. |
| the round is over | `watchRoundEnd` in `play.ts` | Stamps `roundEndedAt` and emits `round.over`. |
| the tally has been read | after `finishRoundStats` in `taskPlayGameQuick` | `round.end` goes out with the figures. |
| a screen is recognised | `gPages.subscribe({...})` in `pageHandlers.ts` | [Handle a page](handle-a-page). Every reaction to a page is one of these; pick the band carefully. |
| a fever starts or ends | `gFever.subscribe({...})` | Below. |
| the Lorcana transformation happens | `gLorcana` in `lorcana.ts` | The watcher is modelled on `fever.ts`; the skill file reads `gLorcana.transformed`. |
| a skill is about to fire / has fired | `beforeActivate` / `afterActivate` on the handler | [Add a skill](add-a-skill). `orderPaths` is the one hook that runs while the skill is *not* activating. |
| a chain was just linked | `popBubblesAfterChain` on the handler | Only for a skill that claims the bubbles. |
| a setting changes on a running script | a `case` in `quickBarApplyOne` | [Add a setting](add-a-setting). Both pages go through it. |
| the run is paused from the strip | `onPause()` in `quickbar.ts` | Evaluated by the host *after* it parks the engine. The only hook allowed to tap while paused. |
| the game app has restarted | `awaitAppUp` in `appLifecycle.ts`, then `observe.startupPhase` | The root warning is the first page after a restart; the observe handler flips `isStartupPhase`. |
| a scheduled interval elapses | a row in `runTaskTable` | [Add a scheduled task](add-a-task). |
| a failure should collect an issue report | `ReportTriggers` in `report.ts` | Keyed by the `Log` event the failure already writes. [Logging and events](logging-and-events). |

## Run start and end

```ts reference title="app.gap.Tsum/src/index.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/index.ts#L329-L355
```

Anything created per run — a watcher's state, a counter, a cached reading —
is reset in `buildRun`, not lazily on first use, so the round that just ended
has nothing to say about the next run. Anything that must be *undone* goes in
`endRun`, in the order the parts can safely go: flags, then `ts.isRunning`,
then the scheduler, then the router, then `ts` itself.

## Stop

`requestStop()` raises every flag and returns; `stop()` calls it and then
waits for the run to hand back. A task body may call `requestStop()` — the Max
Round Duration cap does — and must not call `stop()`, which would wait for
itself.

```ts reference title="app.gap.Tsum/src/index.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/index.ts#L366-L411
```

## Round start and end

```ts reference title="app.gap.Tsum/src/play.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/play.ts#L467-L490
```

`openRound` is gated so that one round is announced once: the pre-round
screen's handler calls it with the items in frame, and `taskPlayGameQuick`
calls it again once the board is up for the round that never passed that
screen. If you need per-round state, initialise it just after `openRound()`
in `taskPlayGameQuick` (the loop's locals are the model) and read it off
`roundSettings` if it depends on a setting — that copy is frozen at the
whistle, so a mid-round Quick Bar change is the *next* round's news.

## Fever

`fever.ts` reads the fever off its own probes, debounces two agreeing readings
before the state flips, and refuses an unreadable frame as evidence for up to
two seconds (a burst animation covers the HUD; a fever underneath runs on).
Subscribe with an `id`, a `what` and a handler:

```ts
gFever.subscribe({
  id: 'mySkill.feverEdge',
  what: 'Re-arm the choreography when a fever ends.',
  handler: function(event) {
    // event.active: true at a start, false at an end
    // event.lastedMs: how long the state it replaced had been up
    // event.page: the page the change was seen on
    // this: the Tsum
  }
});
```

```ts reference title="app.gap.Tsum/src/globals.d.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/globals.d.ts#L502-L521
```

Subscriptions are registrable at load time (the watcher is a global like
`gPages`), run one at a time in registration order, and a subscriber that
throws does not cost the others their turn. Readings arrive from
`record.feverTime` in `pageHandlers.ts` on every look the router makes, which
is what makes the events fire on their own during a round.

For a one-off look, `ts.isFeverTime()` answers with no memory; pass it a frame
you already hold and it costs only the probe read.

<ImagePlaceholder id="fever-gauge" alt="The board during fever time: the gauge turned into a glowing timer and the lights turned down" />

## Skill activation

`useSkill` in `skillCore.ts` is the one caller: gauge read, fever hold-off,
the activation tap(s), then the handler's `afterActivate`. The play loop runs
it in a `while` after each link batch, so a skill that is ready is never made
to wait behind a blind sweep. `maybeAutoTapSkill` is the cheaper path inside
a link batch for skills that declare `bareTapActivates` or `overloadProbe`.

## Adding a new kind of watcher

For a **mode** of the board rather than a screen — fever is the worked
example, Formal Beast's gauge the second — the pattern is: a probe table in
`data.ts`, a watcher modelled on `fever.ts`, and whatever feeds it readings: a
`record` subscription in `pageHandlers.ts` when everything has to know, or the
one caller when only one does. Types go in `globals.d.ts`. Then prove it
offline by driving the built bundle over a real frame under the
`tools/runtime/` shim.
