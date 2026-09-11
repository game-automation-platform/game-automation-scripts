---
title: Logging and events
description: Write a log record that can be filtered, and broadcast an event tooling can react to.
---

# Logging and events

Two different things with the same shape:

- A **log record** is for a person reading a run afterwards. One JSON object
  per line, filtered by `event`, never by sentence.
- An **emitted event** is an interface another program reacts to *as the run
  happens* — a recorder that starts on `round.start` and stops on `round.end`.
  Renaming a log event costs a grep; renaming an emitted one breaks somebody's
  tooling.

## Log records

Every line the script writes is one JSON object — JSONL:

```json
{"timestamp":"2026-08-22T14:30:00.123Z","level":"info","component":"play","event":"play.gameOver","message":"Game Over","runId":"mt4uenqrug","roundId":7,"data":{"chains":63,"hudLostMs":1840}}
```

The top level is a **fixed envelope** — `timestamp`, `level`, `component`,
`event`, `message`, `runId`, `roundId`, `dropped`, `data` — and everything a
call site has to say lives under `data`. The envelope holds only what would be
true of a log line in any program; anything about *this* program is payload.
[Log schema](../reference/log-schema) has the field table.

Why: a run is unattended and overnight, and the question afterwards is
*"which rounds did the Tiara skill give up on, and what were the scan timings
when it did?"* That is a filter over fields (`event = skill.tiara.unsure`,
`data.scanCostMs > 40`) and it is not answerable against a sentence with the
numbers spliced in.

### The four functions, two shapes each

```ts
logInfo(Log.Play.GameStart);                                    // message from the catalogue
logInfo(Log.Play.GameOver, { chains: 63 });                     // …plus context
logWarn(Log.Unlock.SlotColor, 'Slot colour did not settle', { slot: slot });   // its own English
logError(Log.Task.Threw, 'Task threw', { task: name, errorText: '' + e });
logDebug(Log.Board.PathDone, { paths: paths.length, durationMs: Date.now() - t0 });
```

```ts reference title="app.gap.Tsum/src/logging.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/logging.ts#L417-L435
```

The **two-argument shape** (`event, fields`) accepts only a *catalogued* event —
one with a sentence in `logsEn.ts` — so a user-visible line cannot go out
without its message. The **three-argument shape** (`event, message, fields`)
carries its own English, for lines that were never translated. `logDebug`
takes either; debug lines are never shown to a user, so their event name is
their whole description.

| Level | When |
|:--|:--|
| `error` | Something failed: a task threw, a file would not write, a dialog would not go. Carry `errorText: '' + e`. |
| `warn` | Recovered, but not as intended: a restart, a retry, a fallback, a reading given up on. |
| `info` | The run's narrative — what a person watching the bar wants to see. |
| `debug` | Developer detail. Not *written* unless *Debug logs* is on, but always built and kept in the ring (below). |

### Fields, never sentences with numbers in

- **camelCase**, always.
- **Values keep their types**: a count is a number, a flag a boolean, a list
  an array. `chainLength > 20` is a filter you can type; `"Chain lengths
  21,14,9"` is not. Round floats at the call site with `+x.toFixed(2)`.
- **Durations name their unit**: `durationMs`, `scanCostMs`, `waitedSec`.
- **An `undefined` value drops its key**; a real `null` means "looked, found
  nothing".
- **Any field may be a function** — a thunk called only when the record is
  built. Keep thunks cheap: with the ring, every debug record is built.

### Adding an event

1. A member in `logEvents.ts`, in its component's enum. An event not declared
   there is not an event; the loggers will not take it.
2. If the line is user-visible, a catalogue entry in `logsEn.ts` keyed by that
   constant. English is required (`LogCatalogue` is `typeof LogsEn`, so a
   missing sentence is a build error at the call site); the same key in
   `logsZhTw.ts` is wanted, and `npm run i18n:check` lists the gaps.
3. Name it `component.thing.happened`: past tense for things that happened
   (`unlock.unlocked`), plain for things being done (`hearts.sendStart`). The
   component prefix is not decoration — the record's `component` field is
   derived from it.

```ts reference title="app.gap.Tsum/src/logEvents.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/logEvents.ts#L19-L39
```

A new component needs its enum added to the `LogEvent` union in `logging.ts`,
which is deliberate: leaving one out makes every call site using it fail to
compile, loudly.

### The ring, and issue reports

The last 300 records are held in memory **whether or not they were written
out**. That is what an issue report carries (`report.ts`): the records that
explain a wedge are almost all debug ones, and by the time somebody has hit
the bug it is too late to turn the setting on. So `logDebug` always builds the
record; *Debug logs* only opens the sinks.

A failure that should collect a report on its own is **one entry in
`ReportTriggers`**, keyed by the `Log` constant the failure already writes —
nothing at the call site, because the logger checks the list. It has to be
genuinely rare; the per-run cap is a backstop, not the design.

```ts reference title="app.gap.Tsum/src/report.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/report.ts#L63-L76
```

<ImagePlaceholder id="run-history-report-buttons" alt="A run card in the app's Run History with its Share report and Save to device buttons" />

### Where the records go

One call fans out to the log file (`<script root>/logs/script-<device id>.log`,
pure JSONL, rotated at 2 MB × 4), the floating log bar (rendered back to a
human line), the settings page's `onLog`, and the ring. The file is what to
point a viewer at: Logdy auto-detects JSON lines, and `runId`, `roundId`,
`component` and `event` are the columns worth adding.

<ImagePlaceholder id="logdy-view" alt="Logdy showing a run's JSONL log with level, component, event and roundId columns" />

The settings page is a separate compilation and carries its own small
implementation of the same schema (`settingsLog` at the bottom of
`settings.ts`), so nothing on the stream is a plain-text line a reader can
choke on.

## Emitted events

Names live in `scriptEvents.ts`, one `const enum` per component in a
namespace, exactly like `Log`:

```ts reference title="app.gap.Tsum/src/scriptEvents.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/scriptEvents.ts
```

Emit with `this.emit(Emit.X.Y, {...})` from a `Tsum` method, or
`emitScriptEvent(...)` where there is no `ts` yet (`start()` does, for
`run.started`). The one guard on the host native lives in `tsum.ts`:

```ts reference title="app.gap.Tsum/src/play.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/play.ts#L365-L371
```

Adding one is: a member with a line of JSDoc (`EVENTS.md` prints it), the
emit, nothing else. **`EVENTS.md` is generated** from the call sites by `npm
run events:docs` — the file and line, and each payload field's type — and
`events:docs:check` fails the build if it is stale. It also reports a name
outside `Emit`, one not known at compile time, and an event emitted with two
payload shapes.

The payload is the interface: emit the same shape from every site, and treat
a field's removal as a breaking change. [Emitted events](../reference/generated/events)
is the current list.
