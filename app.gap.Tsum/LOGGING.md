# Logging

Every line this script writes is **one JSON object on one line** — JSONL. That
is the whole design; everything below is detail.

```json
{"timestamp":"2026-08-22T14:30:00.123Z","level":"info","component":"play","event":"play.gameOver","message":"Game Over","runId":"mt4uenqrug","roundId":7,"data":{"chains":63,"hudLostMs":1840}}
```

**A fixed envelope, and one `data` bag.** The top level is the same eight keys
whatever the line is about; everything a particular call site had to say lives
under `data`.

The reason is the shape of the job. A run is unattended and overnight; what you
have afterwards is a few megabytes of file and a question like *"which rounds
did the Tiara skill give up on, and what were the scan timings when it did?"*.
That question is a filter over fields (`event = skill.tiara.unsure`,
`scanCostMs > 40`) and it is not answerable at all against
`[Tiara] No present matched confidently, stopping 14 scans scan ~38ms readable for 610ms`.

- **Reading these logs** — [With Logdy](#with-logdy), below.
- **Writing a log line** — [Writing a record](#writing-a-record).
- **The machinery** — [`src/logging.ts`](src/logging.ts); the event names are
  [`src/logEvents.ts`](src/logEvents.ts) and the message catalogue
  [`src/logs.ts`](src/logs.ts).

## The record

Keys are written in this order, and it is the order you read them in when
tailing the raw file.

| Field | Always | What |
|:--|:--|:--|
| `timestamp` | yes | ISO 8601 with milliseconds, UTC (`2026-08-22T14:30:00.123Z`) |
| `level` | yes | `debug` · `info` · `warn` · `error` |
| `component` | yes | The event's first segment, e.g. `play`. Free, and it is the coarse filter you reach for first |
| `event` | yes | The stable, dotted, language-independent id. **This is what you filter on** |
| `message` | when the event has one | The human sentence, in the run's language. Absent on debug events with no catalogue entry — nothing else lacks it |
| `runId` | inside a run | One id per `start()`…`stop()` |
| `roundId` | inside a round | Counts from 1 within a run |
| `dropped` | after a flood | How many lines the flood guard dropped since the line before this one. A burst of 100 goes out untouched; past it the guard keeps 100 lines a second and counts the rest. Never a `warn` or `error` |
| `data` | yes, `{}` when empty | Everything the call site said. Nothing outside this list is ever at the top level |

The envelope holds only things that would be true of a log line in any program;
anything that is about *this* program is payload. That is the test to apply when
adding something, and it is why the correlation ids are up top and the heart
tally is not.

Three of those earn their keep in ways that are easy to miss:

- **`event` is not the message.** It never changes when the wording does, and it
  is the same string whichever language the run was started in. A filter written
  against it keeps working across a translation, a reword, and a version bump —
  which is why the message catalogue is *keyed* by it.
- **`runId` is the thing that makes a rotated file readable.** An overnight run
  restarts the game app, re-enters every task and rolls the file over; without a
  correlation id there is no way to tell one run's lines from the next one's.
  It is injected by the logger, not by call sites, which is the only way it ends
  up on *every* line rather than the ones somebody remembered.
- **`data` being fixed is what makes the top level assertable.** A field called
  `level` or `event` is just `data.level`, so it cannot collide with the record's
  own; and the two renderers that turn a record back into a human line read the
  envelope by name and walk `data`, with no list of "keys that are not payload"
  to keep in sync between them.

### Field conventions

They are conventions and not suggestions: a viewer that has to know whether this
line said `roundId` or `round_id` is a viewer you cannot filter.

- **camelCase**, always.
- **Values keep their types.** A count is a number, a flag is a boolean, a list
  is an array. `chainLength > 20` is a filter you can type; `"Chain lengths
  21,14,9"` is not. Round floats at the call site with `+x.toFixed(2)` — the
  leading `+` is what keeps it a number.
- **Durations name their unit**: `durationMs`, `scanCostMs`, `waitedSec`. Never
  a bare `duration`.
- **Exceptions go in `errorText`**, as `'' + e`.
- **An `undefined` value drops its key** rather than writing `null`. A real
  `null` means "looked, found nothing" — the stats CSV writes those deliberately.
- **No name is reserved.** Everything a call site passes lands in `data`, so a
  field may be called `level` or `event` without disturbing anything. Prefer the
  clearer name anyway (`skillLevel`), for the reader rather than the parser.

### Components

`run` · `task` · `app` · `screen` · `page` · `nav` · `forecast` · `board` ·
`bubble` · `play` · `tsums` · `skill` · `fever` · `hearts` · `gifts` ·
`unlock` · `box` (buying boxes in the store) · `stats` · `dialog` · `stall` ·
`corpus` · `report` (the folder a player sends in) · `walk` · `assist` · `log` ·
`settings` (the settings page) · `host` (the host app's own lines).

One `const enum` per component in [`src/logEvents.ts`](src/logEvents.ts), in
this order, and the enums are the only place an event name is spelled out:
`Log.Play.GameOver` is `'play.gameOver'`. The namespace is erased at compile
time along with them, so a record still carries the bare string — what the
constants buy is autocompletion, go-to-definition and rename, and an event that
cannot be misspelt at a call site. A third segment folds into the member name
(`Log.Skill.TiaraNoDream`), because a `const enum` cannot nest.

### `forecast.state`, the fat one

One record per change in what the script is about to do, written by
[`src/forecast.ts`](src/forecast.ts) from the notify band. It is the only record
that carries arrays of objects, and it is the one thing here that is written for
a viewer rather than for a filter — the development tools' state view draws it.

| Field | Is |
|:--|:--|
| `page`, `previous`, `goal` | where it is, where it came from, where `navigate()` is heading |
| `actor` | the subscription expected to touch this frame |
| `stoppedBy` | the one that really did. **Beside the prediction on purpose**: a record where they differ is an `acts` that has drifted from its handler |
| `nextVia`, `nextPage` | the button about to be pressed, and where the route graph says it leads |
| `steps[]` | the whole dispatch queue, each entry `acts` / `passes` / `skipped` |
| `tasks[]` | the scheduler, due-first, with `dueInMs` per task |
| `routes[]`, `intent` | every way off this screen, and which one is being taken |
| `path[]` | the screens between here and `goal`, or empty when no route is declared |

Debug only, and suppressed while the answer is unchanged — the play loop asks
what is on screen several times a second, and a record per look would drown the
file it is meant to explain. `debug` and the dedupe are both checked before
anything is built, and every array above is a thunk, so a run without debug logs
pays one boolean per page change.

## Writing a record

Four functions, in [`src/logging.ts`](src/logging.ts). Two call shapes each.

```ts
logInfo(Log.Play.GameStart);                              // message from the catalogue
logInfo(Log.Play.GameOver, { chains: 63 });               // …plus context
logWarn(Log.Unlock.SlotColor, 'Slot colour did not settle',
        { slot: slot });                                  // its own English
logError(Log.Task.Threw, 'Task threw', { task: name, errorText: '' + e });
logDebug(Log.Board.PathDone, { paths: paths.length, durationMs: Date.now() - t0 });
```

**The first shape only accepts a catalogued event**, so an event with no
sentence fails there rather than emitting a record with no `message`. The second
takes any declared event and carries its own English — that is for the lines
that were never translated, and inventing translations for them would be worse
than leaving them.

Both shapes take a `Log` constant or the literal string it stands for; the
constant is what completes as you type and what *find references* answers on, so
new code uses it.

`logDebug` returns before it builds anything unless `debugLogs` is on. That is
what makes a **thunk field** free:

```ts
logDebug('board.pathDone', {
  chainLengths: function() { ... return lens; },   // only called if the record goes out
});
```

Any field may be a function; it is called only when the record is really
emitted, and a `undefined` return drops the key.

### Which level

| | |
|:--|:--|
| `error` | Something failed. A task threw; a file would not write; a dialog would not go away |
| `warn` | Recovered, but not as intended. A restart, a retry, a fallback path, a reading given up on |
| `info` | The run's narrative — what a person watching the bar wants to see |
| `debug` | Developer detail. Not *written* unless `debugLogs` is on, and **never translated** — the event name is all the description it gets, so name it accordingly. It is still built and kept, though: see [The ring](#the-ring) |

### Adding an event

A member in [`src/logEvents.ts`](src/logEvents.ts) first, in its component's
enum — an event that is not declared there is not an event, and the four loggers
will not take it.

Then, if the line is user-visible, a catalogue entry in `LogsEn`
([`src/logsEn.ts`](src/logsEn.ts)), keyed by that constant. English is the
reference — `LogCatalogue` is `typeof LogsEn`, so a sentence missing there is a
build error at the call site. The same key in each translation
([`src/logsZhTw.ts`](src/logsZhTw.ts) and any language added beside it) is
wanted but not required: `logStringsFor` fills a gap from English rather than
writing a record with no `message`, and `npm run i18n:check` lists the gaps. A
debug line needs nothing further — its name is its whole description.

Name it `component.thing.happened`, past tense for things that happened
(`unlock.unlocked`) and plain for things being done (`hearts.sendStart`). The
component prefix is not decoration — `component` is derived from it.

## Where the records go

One call fans out to four places, and each gets what it can use:

| Sink | Gets |
|:--|:--|
| **`<script root>/logs/script-<device id>.log`** | The record, verbatim. Pure JSONL, rotated at 2 MB × 4. **This is the file to point a viewer at.** The id is the host's `getDeviceId()` — the same twelve hex digits that end every round id — because emulator instances on one PC can share the whole root, and did all write one `script.log` |
| **The floating log bar** | Rendered back to `14:30:00.123 [info] [R:3 S:5/12] play.gameStart Game Start roundId=7` — nobody reads JSON off a two-line HUD |
| **The settings page** `onLog` | The same rendered line |
| **`gap-cli logs`** | Rendered, or the raw record with `--raw` |

A fifth is not a sink but a buffer, and is [The ring](#the-ring) below.

The heart tally (`heartsReceived` / `heartsSent` / `heartsSendDueMin`) is
injected into `data` on `hearts.*` records and nowhere else, and the bar renders
it as the `[R:3 S:5/12]` prefix it has always shown. It used to ride on every
line; `runId` is what ties a run together now, so a running total can sit where
it means something instead of next to every board scan.

The rendering lives in the host app, in
`app/src/main/java/com/gameautomation/platform/service/ScriptLogRecord.kt`,
and is mirrored in its `tools/gap-cli.js`. Plain text the host
logs itself is wrapped into a `host.message` record on the way to the file, so
the file has no line a reader can choke on.

The settings page writes onto the same stream, from a second small
implementation of this schema at the bottom of [`src/settings.ts`](src/settings.ts)
— it is a separate ES5 compilation that shares nothing with the bundle.

## The ring

The last 300 records, held in memory, **whether or not they were written out**.
It is what an issue report carries ([`src/report.ts`](src/report.ts)), and it
exists for one reason: the records that explain a wedge are almost all `debug`
ones, and by the time somebody has hit the bug it is too late to turn the
setting on.

So `logDebug` no longer returns before building anything. With `debugLogs` off
it builds the record, keeps it here, and skips the four sinks — which is what
lets a report carry the last couple of minutes of a busy play loop while the
log file stays the readable overnight file it is. Turning the setting on adds
nothing to the ring; it only opens the sinks.

Three consequences worth knowing:

- **A ring-only record spends no allowance.** The flood guard is skipped for it
  entirely, because it is not going out and so cannot flood anything — and
  taking a line's worth would make the guard drop `info` lines whenever debug
  lines were busy.
- **A thunk field is no longer free.** Any `function()` value is called on every
  debug line now. There are two in the project: `board.pathDone`'s chain
  lengths, which maps over a handful of paths, and `forecast.state`, which
  [`src/forecast.ts`](src/forecast.ts) refuses to build at all without the
  setting — so nothing expensive is resolved for a record nobody will read. Keep
  it that way when adding one.
- **It is cleared at every `logBeginRun`**, so a report quotes one run.

## With Logdy

Logdy auto-detects JSON lines, so there is no parser to configure. Two routes:

**Over the CLI** — includes the buffered history, then follows:

```sh
node ../../game-automation-app/tools/gap-cli.js logs --raw | logdy
```

**Off the file** — survives a service restart, and reaches back further than the
in-memory ring buffer does:

```sh
adb shell "cat /data/local/tmp/gap/service.log" | grep 'log file'
adb shell "tail -f /sdcard/Download/GameAutomationPlatform/logs/script-<id>.log" | logdy
```

Three things about that command that are easy to get wrong:

- **`-f`, not `-F`.** The device's `tail` is toybox's, which has no `-F` and
  reads it as a filename: one `tail: -F: No such file or directory`, one dump of
  the file, and an exit that looks like the stream simply stopping. The cost of
  `-f` is that it does not survive the 2 MB rotation, so a long watch needs the
  command re-run.
- **The path is `<script root>/logs/script-<device id>.log`**, and the id is
  the device's to derive, so ask rather than guess: the service prints the
  resolved path as `[gap] log file: …` into `/data/local/tmp/gap/service.log`
  at every start, and `gap-cli status` reports it as `logFile`. The root is
  `/sdcard/Download/GameAutomationPlatform` — where the starter installs and
  `npm run adb` pushes, per `CLAUDE.md`. On MuMu that folder is a **host-shared
  mount, one Windows folder for every instance** — which is the reason for the
  id in the name, and also why `script*.log` there lists every instance's file.
  Where that folder is on the PC, for MuMu and for the other emulators, is
  `README.md` § Getting logs, stats and screenshots off the device.
- **Quote the remote command.** Git Bash on Windows rewrites a bare `/sdcard/…`
  argument into `C:/Program Files/Git/sdcard/…` before `adb` ever sees it, and
  the failure names a path you never typed. The quotes stop that; so does
  `MSYS_NO_PATHCONV=1` for `adb pull`.

**`gap-cli` needs a forwarded port that is off by default.** `node
tools/gap-cli.js logs --raw` talks to the engine on `127.0.0.1:21024`, and
nothing listens there unless the service was started with `--listen-tcp` — which
is also what puts the `adb forward` in place. `error: connect ECONNREFUSED
127.0.0.1:21024` is that and only that; the fix is
`tools/start-service.sh --tcp 21024` in `../../game-automation-app`. Tailing the
file needs none of it.

By default Logdy follows from the end, so a file that still holds pre-JSONL
lines from an older build is not a problem unless you pass `--full-read`.

Then open `http://localhost:8080`. Useful first moves:

- Columns worth adding: `level`, `component`, `event`, `message`, `roundId` —
  autogenerate picks these up, since they are the top level.
- Payload fields need a column of their own, because they are one level down:
  a column's value is arbitrary TypeScript, so `line.json_content.data.scanCostMs`
  is all it takes. Worth it for the two or three you are actually chasing;
  everything in `data` is visible in the row drawer regardless.
- `--append-to-file=session.jsonl` keeps a copy of what you watched.
- `--config=<path>` persists the column layout between sessions.

Filters that pay for themselves, given the fields above:

| Question | Filter |
|:--|:--|
| What did this run do? | `runId = …` — pick one off any line |
| What happened in round 40? | `roundId = 40` |
| Everything the skill did | `component = skill` |
| Only the trouble | `level in (warn, error)` |
| Rounds where the board would not settle | `event = skill.tiara.busy` |
| Slow board reads | `event = board.recognitionTime`, `data.durationMs > 200` |
| Slow page detection | `event = page.matched`, `data.durationMs > 300` — then `data.captureMs` against `data.scoreMs` says whether the captures or the scoring cost it. `event = page.unmatched` is the negative answer, which is where a timeout is spent |
| A device drawing pages a pixel off the table | `event = page.matched`, `data.shift > 0` — the matcher's one-pixel tolerance carried the match. Always `0` unless `Config.pageShiftTolerance` is on, which it is not |
| A board the game stopped taking chains from | `event = board.stalled` — the play loop fanned it loose. `data.deadScans` is how many scans running drew a chain and found it still standing; `event = board.deadScan` is each of those, debug only |
| Why a round ended | the record just before `event = play.gameOver`: `play.gameOverConfirmed` names the screen it ended on, `play.gameOverAssumed` means nothing fingerprinted within the grace window |
| What a run collected to send in | `event = report.saved` — `data.report` is the id, `data.reason` is the event that triggered it or the button that was pressed, and `data.dir` is the folder. That record is also how the app attributes a report to a run |

Nothing about the file needs Logdy, of course:

```sh
# every error, and the round it happened in
jq -r 'select(.level=="error") | "\(.timestamp) \(.roundId) \(.event) \(.message)"' script.log

# one run's tiara timings, as a table
jq -r 'select(.event=="skill.tiara.picked") | [.roundId, .data.scans, .data.scanCostMs] | @tsv' script.log
```

## Reading the log without any of this

`script.log` is still text, and a record still reads left to right: timestamp,
level, component, event, sentence, then the numbers. The gain over the old
format is that the numbers now have names.
