// The log message registry: which sentence table a run writes its lines from.
//
// The sentences themselves are one file per language -- `src/logsEn.ts` and
// `src/logsZhTw.ts` -- and each registers itself here as it loads. Adding a
// language is therefore additive: write one `src/logs<Tag>.ts`, list it in
// `tsconfig.json` after this file, and `start()` finds it by tag with nothing
// else touched.
//
// ## Keyed by event, not by wording
//
// Both tables are keyed by the `Log` constants (`src/logEvents.ts`), which stand
// for the stable, dotted, language-independent id that goes out on the `event`
// field of every record -- see `src/logging.ts`. That is the whole point of
// keying them this way: `event` is what a filter in Logdy matches on and what
// survives a reworded sentence, and `message` is what a person reads. Change the
// wording freely; changing a key is changing an interface.
//
// The keys are computed and a `const enum` member holds a literal, so the
// inferred type of `LogsEn` is still the exact key set -- which is what makes
// `logInfo(Log.Play.GameStart)` resolve to a sentence and an event with none
// fail there instead.
//
// ## English is the reference; a translation may be incomplete
//
// `LogsEn` is complete by construction -- it is the type every other table is
// checked against, so a translation cannot invent a key. A translation may
// *omit* one, and `logStringsFor` fills the gap from English rather than
// emitting a record with no `message`. Forcing every language to be finished
// before it compiles is what stops one being added at all; `npm run i18n:check`
// is where the gaps are reported.
//
// Not every event is here. An event with no sentence worth translating carries
// its English inline (`logInfo(event, 'text', fields)`) and simply comes out
// with no `message` field in another language -- which is better than a
// fabricated translation, and better than the untranslated English these lines
// used to be.
//
// Numbers do not belong in these strings. They were spliced in as trailing
// arguments once; they are fields now, so a sentence that used to end "Receive
// 12 hearts" is "Hearts received from this sender today" plus `count: 12`.

/** A complete table: the English one's exact key set, every key answered. */
type LogCatalogue = typeof LogsEn;

/** A translation: any subset of those keys, and nothing else. */
type LogCataloguePartial = { [K in keyof LogCatalogue]?: string };

/** Every registered language's table, by locale tag. */
var gLogCatalogues: { [tag: string]: LogCataloguePartial } = {};

/** Adds one language's sentences. Called by each table file as it loads. */
function logRegisterStrings(tag: Locale, strings: LogCataloguePartial): void {
  gLogCatalogues[tag] = strings;
}

/**
 * The complete table for `tag`: its own sentences, English wherever it has none.
 *
 * Merged once here, at the top of a run, rather than checked on every record --
 * so `logMessageFor` stays one lookup no matter how partial a translation is.
 * An unknown or absent tag is English, which is also what a settings page too
 * old to send one produces.
 */
function logStringsFor(tag: Locale | undefined): LogCatalogue {
  const translated = tag !== undefined ? gLogCatalogues[tag] : undefined;
  if (translated === undefined || translated === LogsEn) {
    return LogsEn;
  }
  const merged: { [key: string]: string } = {};
  const english: { [key: string]: string } = LogsEn;
  for (const key in english) {
    merged[key] = english[key];
  }
  const overlay: { [key: string]: string | undefined } = translated;
  for (const key in overlay) {
    const sentence = overlay[key];
    if (typeof sentence === 'string') {
      merged[key] = sentence;
    }
  }
  return merged as LogCatalogue;
}
