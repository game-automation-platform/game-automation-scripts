---
title: Log schema
description: The JSONL record, its field conventions, the components, and how to read a run.
---

# Log schema

Every line the script writes is **one JSON object on one line**. That is the
whole design; the rest is detail. [Logging and events](../guides/logging-and-events)
is how to write one.

```json
{"timestamp":"2026-08-22T14:30:00.123Z","level":"info","component":"play","event":"play.gameOver","message":"Game Over","runId":"mt4uenqrug","roundId":7,"data":{"chains":63,"hudLostMs":1840}}
```

## The record

Keys are written in this order.

| Field | Always | What |
|:--|:--|:--|
| `timestamp` | yes | ISO 8601 with milliseconds, UTC. |
| `level` | yes | `debug` · `info` · `warn` · `error`. |
| `component` | yes | The event's first segment (`play`). The coarse filter you reach for first. |
| `event` | yes | The stable, dotted, language-independent id. **This is what you filter on.** It never changes when the wording does, and it is the same string whichever language the run was started in. |
| `message` | when the event has one | The human sentence, in the run's language. Absent on debug events with no catalogue entry. |
| `runId` | inside a run | One id per `start()`…`stop()`. Injected by the logger, which is the only way it ends up on *every* line. What makes a rotated overnight file readable. |
| `roundId` | inside a round | Counts from 1 within a run. |
| `dropped` | after a flood | How many lines the flood guard dropped since the line before. A burst of 100 goes out untouched; past it the guard keeps 100 lines a second. Never a `warn` or `error`. |
| `data` | yes, `{}` when empty | Everything the call site said. Nothing else is ever at the top level. |

The envelope holds only what would be true of a log line in any program;
anything about *this* program is payload. That is the test when adding
something, and it is why the correlation ids are up top and the heart tally
is not. `data` being fixed is what makes the top level assertable: a field
called `level` is just `data.level`.

## Field conventions

They are conventions, not suggestions: a viewer that has to know whether a
line said `roundId` or `round_id` is a viewer you cannot filter.

- **camelCase**, always.
- **Values keep their types.** A count is a number, a flag a boolean, a list
  an array. Round floats at the call site with `+x.toFixed(2)`.
- **Durations name their unit**: `durationMs`, `scanCostMs`, `waitedSec`.
- **Exceptions go in `errorText`**, as `'' + e`.
- **An `undefined` value drops its key**; a real `null` means "looked, found
  nothing" — the stats CSV writes those deliberately.
- **No name is reserved** inside `data`. Prefer the clearer name anyway
  (`skillLevel`) for the reader.

## Components

`run` · `task` · `app` · `screen` · `page` · `nav` · `forecast` · `board` ·
`bubble` · `play` · `tsums` · `skill` · `fever` · `lorcana` · `hearts` ·
`gifts` · `unlock` · `box` · `stats` · `dialog` · `stall` · `corpus` ·
`report` · `walk` · `assist` · `log` · `settings` · `host` (the host app's
own lines).

One `const enum` per component in `logEvents.ts`, and the enums are the only
place an event name is spelled out: `Log.Play.GameOver` is `'play.gameOver'`.
A third segment folds into the member name (`Log.Skill.TiaraNoDream`).

## `forecast.state`, the fat one

One record per change in what the script is about to do, written by
`forecast.ts` from the notify band. The only record that carries arrays of
objects, and the one written for a viewer rather than a filter:

| Field | Is |
|:--|:--|
| `page`, `previous`, `goal` | where it is, where it came from, where `navigate()` is heading |
| `actor` | the subscription expected to touch this frame |
| `stoppedBy` | the one that really did — beside the prediction on purpose, so a record where they differ is an `acts` that has drifted |
| `nextVia`, `nextPage` | the button about to be pressed, and where the route graph says it leads |
| `steps[]` | the whole dispatch queue, each entry `acts` / `passes` / `skipped` |
| `tasks[]` | the scheduler, due-first, with `dueInMs` per task |
| `routes[]`, `intent` | every way off this screen, and which one is being taken |
| `path[]` | the screens between here and `goal` |

Debug only, and suppressed while the answer is unchanged.

## Where the records go

| Sink | Gets |
|:--|:--|
| `<script root>/logs/script-<device id>.log` | The record, verbatim. Pure JSONL, rotated at 2 MB × 4. **The file to point a viewer at.** The id is the device's, because emulator instances on one PC can share the root. |
| The floating log bar | Rendered back to `14:30:00.123 [info] [R:3 S:5/12] play.gameStart Game Start roundId=7`. |
| The settings page's `onLog` | The same rendered line. |
| The ring | The last 300 records, written out or not; what an issue report carries. Cleared at every run start. |

The heart tally (`heartsReceived` / `heartsSent` / `heartsSendDueMin`) rides in
`data` on `hearts.*` records and nowhere else; the bar renders it as the
`[R:3 S:5/12]` prefix.

## Reading a run

Logdy auto-detects JSON lines. Off the file, which survives a service restart:

```sh
adb shell "tail -f /sdcard/Download/GameAutomationPlatform/logs/script-<id>.log" | logdy
```

Use `-f`, not `-F` — the device's `tail` has no `-F`. Quote the remote
command: Git Bash on Windows rewrites a bare `/sdcard/…` into a Windows path
before `adb` sees it. The service prints the resolved log path at every start.

Columns worth adding: `level`, `component`, `event`, `message`, `roundId`.
Payload fields need a column of their own (`line.json_content.data.scanCostMs`).

| Question | Filter |
|:--|:--|
| What did this run do? | `runId = …` |
| What happened in round 40? | `roundId = 40` |
| Everything the skill did | `component = skill` |
| Only the trouble | `level in (warn, error)` |
| Slow board reads | `event = board.recognitionTime`, `data.durationMs > 200` |
| Slow page detection | `event = page.matched`, `data.durationMs > 300` — then `captureMs` against `scoreMs` says which cost it |
| A board the game stopped taking chains from | `event = board.stalled` |
| Why a round ended | the record before `event = play.gameOver`: `play.gameOverConfirmed` names the screen, `play.gameOverAssumed` means nothing fingerprinted within the grace window |
| What a run collected to send in | `event = report.saved` — `data.reason` is the trigger, `data.dir` the folder |

Or `jq`:

```sh
jq -r 'select(.level=="error") | "\(.timestamp) \(.roundId) \(.event) \(.message)"' script.log
```

<ImagePlaceholder id="logdy-view" alt="Logdy with a run's log loaded: the level, component, event and roundId columns, and a row drawer open on a data payload" />
