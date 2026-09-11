// Structured logging.
//
// Every line this script writes is one JSON object on one line -- JSONL, which
// is what Logdy (and every other log viewer worth pointing at an overnight run)
// can filter and column without a custom parser. `LOGGING.md` is the schema and
// the vocabulary; this file is the machinery.
//
// The shape, in the order the keys are written:
//
//   {"timestamp":"2026-08-22T14:30:00.123Z","level":"info","component":"play",
//    "event":"play.gameStart","message":"Game Start","runId":"lz4k9c2","roundId":7,
//    "data":{"chains":63,"hudLostMs":1840}}
//
// **A fixed envelope, and one `data` bag.** Every record has the same top-level
// keys whatever it is about; everything a particular call site had to say lives
// under `data`. That split is worth having for three reasons: the top level is a
// schema you can assert rather than a sentence in a document, a field named
// `level` or `event` can no longer collide with the record's own, and the two
// renderers that turn a record back into a human line need no list of "keys that
// are not payload" to keep in sync.
//
// Four things earn their place on every record:
//
//   `event`     a stable, dotted, language-independent key. This is the field
//               you filter on. It never changes when the wording does, and it
//               is the same string whichever language the run is set to.
//   `message`   the human sentence, in the run's language -- one catalogue per
//               language under `src/logs*.ts`, keyed by the event and merged
//               over English by `logStringsFor`. Absent when an event has no
//               catalogue entry at all.
//   `component` the first segment of the event, so `play.gameStart` is
//               `play`. Free, and it is the coarse filter you reach for first.
//   `runId`     one id per start()..stop(), stamped on everything in between.
//               Overnight runs restart the game app and re-enter tasks all
//               night; without this there is no way to tell one run's lines
//               from the next one's in a rotated file.
//
// `roundId` joins them once a game is in progress -- the inner correlation
// scope, so "show me everything that happened in round 40" is one filter.
//
// Context is injected here rather than at the call sites, which is the only way
// it stays on every line it belongs on instead of the lines somebody remembered
// to add it to. The ids go in the envelope because they are true of any log line
// anywhere; the heart tally goes in `data`, and only on `hearts.*` records,
// because a running total means nothing next to a board scan.
//
// Values keep their types: a count is a number, not a number spliced into a
// sentence. That is the whole reason to do this -- `chainLength > 20` is a
// filter you can type, and `"Chain lengths 21,14,9"` is not.

/** Severity. These four are exactly what the host's console bridge maps. */
const enum LogLevel {
  Debug = 'debug',
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
}

/**
 * The context fields on one record.
 *
 * Keys are camelCase, by convention and without exception -- a viewer that has
 * to know whether this line said `roundId` or `round_id` is a viewer you cannot
 * filter. A function value is a thunk: it is called only if the record is
 * really emitted, which is what makes an expensive debug field free when debug
 * logs are off. An `undefined` value drops the key rather than writing `null`.
 */
type LogFields = { [key: string]: any };

/**
 * Every event name in the vocabulary -- `src/logEvents.ts`, widened from the
 * enums to the strings they stand for, so a constant and its literal are both
 * accepted and both complete as you type.
 *
 * Listing the components by hand is the one seam: a group left out of this
 * union makes every call site using it fail to compile, which is loud rather
 * than silent, so it cannot rot into a hole.
 */
type LogEvent = `${Log.Run | Log.Task | Log.App | Log.Screen | Log.Page | Log.Nav
  | Log.Forecast
  | Log.Board | Log.Bubble | Log.Play | Log.Tsums | Log.Skill | Log.Fever
  | Log.Lorcana
  | Log.Hearts | Log.Gifts | Log.Unlock | Log.Box | Log.Stats | Log.Dialog
  | Log.Stall | Log.Corpus | Log.Report | Log.Walk | Log.Assist | Log.Log
  | Log.Settings | Log.QuickBar}`;

/**
 * The subset with a sentence to show -- the keys of the message table.
 *
 * Typing the one-argument shape against this is what makes an uncatalogued
 * event fail there rather than emit a record with no `message`.
 */
type LogCataloguedEvent = keyof LogCatalogue;

/** A catalogue key that is not a declared event name is a build error. */
type LogAssert<T extends true> = T;
type LogCatalogueIsNamed = LogAssert<LogCataloguedEvent extends LogEvent ? true : false>;

/**
 * The current run's correlation id, and the round inside it.
 *
 * `var` rather than `let` deliberately: the bundle is one concatenated script,
 * and a `let` here would sit in its temporal dead zone until this file's slot
 * in that script is evaluated. Nothing logs at load time today, but a `var` is
 * what makes that a fact about the code rather than a fact about the file
 * order in tsconfig.json.
 */
var gLogRunId = '';
var gLogRoundId = 0;

/**
 * The message table the run was started in, or undefined outside a run.
 *
 * Held here rather than read off `ts.logs` because the lines that most need to
 * be in the user's language are the ones logged when there is no `ts`:
 * `start()` announces itself before it builds one, and `stop()` reports after
 * it has gone.
 */
var gLogMessages: LogCatalogue | undefined;

/** Picks the language for the rest of the run. Call it before anything logs. */
function logSetMessages(messages: LogCatalogue): void {
  gLogMessages = messages;
}

/**
 * The flood guard: a burst of `LogBurst` lines goes out untouched, and the
 * allowance comes back at one line per `LogMinSpacingMs` -- so a loop that
 * never stops logging settles at 100 lines a second, which is what the host
 * can drain (logcat, the floating window, the settings page's onLog and the
 * rotating file, for every line).
 *
 * **It never blocks.** Past the burst a line is dropped and counted, and the
 * next line out carries the count (`dropped`, LOGGING.md). It used to `sleep()`
 * between two lines inside 10ms instead, and that was a deadlock: `sleep()` is
 * the host's pause gate, and the pages evaluate `quickBarApply` and
 * `applyLiveSettings` *while the run is paused*, on the service thread that
 * also reads the Resume. The second of two lines parked that thread on a gate
 * only it could open. A flood is repeats, and one count is a better record of
 * it than the repeats were; a `warn` or `error` is never dropped.
 */
const LogMinSpacingMs = 10;
const LogBurst = 100;
/** Lines the guard will still accept, and the clock reading it was last refilled at. */
var gLogAllowance = LogBurst;
var gLogLastAt = 0;
/** Lines dropped since the last one that went out. */
var gLogDropped = 0;

/**
 * The ring: the last `LogRingMax` records, whether or not they were written out.
 *
 * This is what an issue report carries (`src/report.ts`), and its whole reason
 * for existing is the *debug* record. Those never reach `script.log` unless the
 * player turned "Debug logs" on, and by the time somebody hits a bug the lines
 * that would explain it are hours gone -- so with the setting off they are
 * still built and kept here, and only the writing out is skipped
 * (`gLogRingOnly`, set by `logDebug`).
 *
 * That costs one `JSON.stringify` of a small object per debug line, a few
 * microseconds against the ~1% of a sweep all of this script's JavaScript
 * comes to. The two thunk fields in the project are `board.pathDone`'s chain
 * lengths, which is a map over a handful of paths, and `forecast.state`, which
 * `src/forecast.ts` refuses to log at all without the setting -- so nothing
 * expensive is resolved for a record nobody will read.
 *
 * A circular buffer rather than a shifted array: this is written from the
 * hottest path in the project, and the answer is only ever read when a report
 * is being written.
 */
const LogRingMax = 300;
var gLogRing: string[] = [];
/** Everything ever pushed; `count % max` is the next write slot. */
var gLogRingCount = 0;
/** Set by `logDebug` with debug logs off: keep the record, write nothing out. */
var gLogRingOnly = false;

/** The ring in the order it was written, oldest first. */
function logRingLines(): string[] {
  if (gLogRingCount <= LogRingMax) {
    return gLogRing.slice(0, gLogRingCount);
  }
  const at = gLogRingCount % LogRingMax;
  return gLogRing.slice(at).concat(gLogRing.slice(0, at));
}

/** Drops the previous run's records, so a report quotes one run only. */
function logRingClear(): void {
  gLogRing = [];
  gLogRingCount = 0;
}

/**
 * Takes one line's allowance, or refuses it.
 *
 * A clock that went backwards -- a device being set, or the dispatch harness
 * resetting its own per row -- refills rather than starving the guard until it
 * catches up.
 */
function logAllow(now: number): boolean {
  gLogAllowance = now < gLogLastAt ? LogBurst
    : Math.min(LogBurst, gLogAllowance + (now - gLogLastAt) / LogMinSpacingMs);
  gLogLastAt = now;
  if (gLogAllowance < 1) {
    gLogDropped++;
    return false;
  }
  gLogAllowance -= 1;
  return true;
}

/** A fresh correlation id for the run that is starting, and a full allowance for its first lines. */
function logBeginRun(): void {
  gLogRunId = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  gLogRoundId = 0;
  gLogAllowance = LogBurst;
  // A report taken in this run must not quote the last one's lines at it.
  logRingClear();
}

/** Drops the run context, so anything logged after a stop is not attributed to it. */
function logEndRun(): void {
  gLogRunId = '';
  gLogRoundId = 0;
  gLogMessages = undefined;
}

/** Opens the next round's correlation scope, and returns its id. */
function logBeginRound(): number {
  gLogRoundId++;
  return gLogRoundId;
}

/** `play.gameStart` -> `play`. An event with no dot is its own component. */
function logComponentOf(event: string): string {
  const dot = event.indexOf('.');
  return dot === -1 ? event : event.substring(0, dot);
}

/** The localised sentence for an event, or undefined when it has none. */
function logMessageFor(event: LogEvent): string | undefined {
  const table: LogFields = gLogMessages !== undefined ? gLogMessages : LogsEn;
  const message = table[event];
  return typeof message === 'string' ? message : undefined;
}

/**
 * The correlation ids, on every line while a run is up.
 *
 * These belong in the envelope rather than in `data` because they say nothing
 * about Tsum Tsum: they are true of any log line anywhere, which is exactly the
 * test for whether something is envelope or payload.
 */
function logAddRunContext(record: LogFields): void {
  if (gLogRunId !== '') {
    record.runId = gLogRunId;
  }
  if (gLogRoundId > 0) {
    record.roundId = gLogRoundId;
  }
}

/**
 * The heart tally, on `hearts.*` records only.
 *
 * This used to be a `[R:3 S:5/12]` prefix glued onto the front of every message,
 * and then -- briefly -- three fields on every record. Both were the same
 * mistake: a running total that is only ever interesting next to a heart being
 * sent or received, repeated onto every line about the board, the store and the
 * page router. `runId` is what ties a run's lines together now, so the tally can
 * sit where it means something.
 *
 * Injected here rather than at the ~25 hearts call sites, which is the only way
 * it stays on all of them.
 */
function logAddHeartTally(component: string, data: LogFields): void {
  if (component !== 'hearts') {
    return;
  }
  if (ts === undefined || ts.record === undefined) {
    return;
  }
  const counts = ts.record[RecordKey.HeartsCount];
  if (counts === undefined) {
    return;
  }
  data.heartsReceived = counts.receivedCount;
  data.heartsSent = counts.sentCount;
  if (gTaskController === undefined || gTaskController.tasks === undefined) {
    return;
  }
  const sendTask = gTaskController.tasks['sendHearts'];
  if (sendTask !== undefined) {
    // Minutes until the send task is next due; negative while it is overdue.
    // Zero before it has ever run, which is what the old `/0` meant.
    data.heartsSendDueMin = sendTask.lastRunTime === 0
      ? 0
      : +((Date.now() - (sendTask.lastRunTime + sendTask.interval)) / 60000).toFixed(0);
  }
}

/** Builds the record and hands it to the host, on the console channel matching its level. */
function logEmit(level: LogLevel, event: string, message: string | undefined, fields: LogFields | undefined): void {
  const now = Date.now();
  // A ring-only record spends no allowance: it is not going out, so it cannot
  // flood anything, and taking a line's worth would make the guard drop the
  // `info` lines that *are* going out whenever debug lines were busy.
  if (!gLogRingOnly && level !== LogLevel.Warn && level !== LogLevel.Error
      && !logAllow(now)) {
    return;
  }

  // Insertion order is the key order JSON.stringify writes, and that order is
  // what a human tailing the raw file reads. Identity first, then the sentence,
  // then correlation, then the payload.
  const component = logComponentOf(event);
  const record: LogFields = {
    timestamp: new Date(now).toISOString(),
    level: level,
    component: component,
    event: event,
  };
  if (message !== undefined) {
    record.message = message;
  }
  logAddRunContext(record);
  if (gLogDropped > 0) {
    record.dropped = gLogDropped;
    gLogDropped = 0;
  }

  // Always present, even when empty: a `data` that is sometimes missing is a
  // reader's special case, and the point of the envelope is not having any.
  const data: LogFields = {};
  logAddHeartTally(component, data);
  if (fields !== undefined) {
    for (const key in fields) {
      const value = fields[key];
      const resolved = typeof value === 'function' ? value() : value;
      if (resolved !== undefined) {
        data[key] = resolved;
      }
    }
  }
  record.data = data;

  // A record that will not stringify -- a cycle, most likely, from logging a
  // live object rather than a reading taken off it -- must not take the run
  // down: the point of a log line is that it is the cheapest thing in the
  // system. It goes out as an error, on the error channel, whatever level the
  // record that failed was going to be.
  let line: string;
  try {
    line = JSON.stringify(record);
  } catch (e) {
    level = LogLevel.Error;
    line = JSON.stringify({
      timestamp: record.timestamp,
      level: LogLevel.Error,
      component: 'log',
      event: Log.Log.Unserializable,
      message: 'A log record could not be serialised',
      runId: record.runId,
      data: { failedEvent: record.event, errorText: '' + e },
    });
  }
  // Kept before it is written, and kept whether or not it is: this is what an
  // issue report carries, and the record that explains a wedge is often one
  // `script.log` never saw.
  gLogRing[gLogRingCount % LogRingMax] = line;
  gLogRingCount++;
  if (gLogRingOnly) {
    return;
  }

  if (level === LogLevel.Debug) {
    console.debug(line);
  } else if (level === LogLevel.Warn) {
    console.warn(line);
  } else if (level === LogLevel.Error) {
    console.error(line);
  } else {
    console.log(line);
  }

  // Last, and only for a record that really went out: a handful of events mean
  // the run has failed, and each of those writes an issue report of its own.
  // The list is `ReportTriggers` (src/report.ts) and the check is here rather
  // than at those call sites, because a failure path is exactly where a call
  // somebody has to remember gets forgotten.
  reportOnLogged(event);
}

/** Splits the two call shapes: `(event, fields)` and `(event, message, fields)`. */
function logDispatch(level: LogLevel, event: LogEvent, a: string | LogFields | undefined, b: LogFields | undefined): void {
  if (typeof a === 'string') {
    logEmit(level, event, a, b);
  } else {
    logEmit(level, event, logMessageFor(event), a);
  }
}

/**
 * The four you call.
 *
 * Two shapes each. `logInfo(event, fields?)` takes a catalogued event and
 * looks its sentence up, which is how a user-visible line stays translated;
 * `logInfo(event, message, fields?)` carries its own English, for the lines
 * that were never translated and are not worth inventing a translation for.
 * The overloads are what make the first shape reject an event with no entry in
 * `LogsEn`, so a record cannot go out missing the `message` it implied.
 *
 * Both take a `Log` constant or the literal it stands for. New code uses the
 * constant: it completes as you type, and an undeclared event is a build error
 * either way.
 */
function logInfo(event: LogCataloguedEvent, fields?: LogFields): void;
function logInfo(event: LogEvent, message: string, fields?: LogFields): void;
function logInfo(event: LogEvent, a?: string | LogFields, b?: LogFields): void {
  logDispatch(LogLevel.Info, event, a, b);
}

/** Something recoverable that the run worked around. */
function logWarn(event: LogCataloguedEvent, fields?: LogFields): void;
function logWarn(event: LogEvent, message: string, fields?: LogFields): void;
function logWarn(event: LogEvent, a?: string | LogFields, b?: LogFields): void {
  logDispatch(LogLevel.Warn, event, a, b);
}

/** Something that failed. Carry an `errorText` field when there is an exception. */
function logError(event: LogCataloguedEvent, fields?: LogFields): void;
function logError(event: LogEvent, message: string, fields?: LogFields): void;
function logError(event: LogEvent, a?: string | LogFields, b?: LogFields): void {
  logDispatch(LogLevel.Error, event, a, b);
}

/**
 * Developer detail. Written out only with `debugLogs` on; kept for a report
 * either way.
 *
 * The event is a free string here rather than a catalogue key: debug lines are
 * never shown to a user and so are never translated, which means the event name
 * is all the description they get -- name them accordingly.
 *
 * This used to return before building anything, which made a thunk field free
 * with the setting off. It no longer does, and that is deliberate: the records
 * that explain a wedge are almost all debug ones, a player who has just hit a
 * bug will not have had the setting on, and turning it on by default would flood
 * the 2 MB rotation and lose the very hours worth keeping. So the record is
 * built and ringed (`gLogRing`), and nothing is written out. See `LogRingMax`
 * for what that costs.
 */
function logDebug(event: LogEvent, fields?: LogFields): void;
function logDebug(event: LogEvent, message: string, fields?: LogFields): void;
function logDebug(event: LogEvent, a?: string | LogFields, b?: LogFields): void {
  if (Config.debugLogs) {
    logDispatch(LogLevel.Debug, event, a, b);
    return;
  }
  gLogRingOnly = true;
  try {
    logDispatch(LogLevel.Debug, event, a, b);
  } finally {
    gLogRingOnly = false;
  }
}
