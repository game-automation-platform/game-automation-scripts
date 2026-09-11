---
title: UI text and languages
description: Where every piece of page text and every log sentence lives, and how a language is added.
---

# UI text and languages

There are two catalogues, because there are two kinds of text:

| Text | Vocabulary | English | Other languages |
|:--|:--|:--|:--|
| Settings page and Quick Bar | `UiText` in `strings.d.ts` | `uiEn.ts` — **must be complete** | `uiZhTw.ts` — partial, falls back key by key |
| Log sentences | `Log` in `logEvents.ts` | `logsEn.ts` — **must be complete** for catalogued events | `logsZhTw.ts` — partial, falls back key by key |

In both, **the key is the interface, not the sentence**: wording changes
freely and nothing else has to know.

## Page text

Never a literal in `settings.ts` or the markup. Every string the pages show
is a `UiText` member, dotted and grouped by where it appears (`tab.*`,
`group.*`, `setting.*`, `skill.*`, `qb.*`):

```ts reference title="app.gap.Tsum/src/strings.d.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/strings.d.ts#L18-L40
```

English is typed `UiStrings` — the full mapping — so a new member fails the
build until it has text:

```ts reference title="app.gap.Tsum/src/uiEn.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/uiEn.ts#L1-L30
```

A value may carry `{named}` placeholders (`'Waits {min} min between rounds.'`),
filled by `tf()` in `i18n.ts`. Named rather than positional, because word
order is the first thing a translation changes.

Text is resolved at **render** time, never at load: the language can change
while the page is up, and the page redraws rather than reloads (there is no
URL to reload — [Three worlds](../architecture/three-worlds)). A string that
has to sit in a data structure is wrapped in `i18nThunk` so it resolves when
drawn.

In the markup, a static element names its key with `data-i18n="qb.scan"`.
`npm run i18n:check` fails on a `data-i18n` that names no key — the one thing
the compiler cannot see.

### Adding a string

1. A `UiText` member in `strings.d.ts`, in the group it belongs to.
2. English in `uiEn.ts` — required.
3. The same key in `uiZhTw.ts` and any other language, or it falls back.
4. `npm run typecheck`, `npm run i18n:check`.

## Log sentences

The same shape one level down. A log event is a `Log` constant; if a person
should read the line, `logsEn.ts` has its sentence keyed by that constant,
and the two-argument `logInfo(event, fields)` will only accept an event that
has one. Translations may omit keys — `logStringsFor` fills a gap from English
rather than writing a record with no `message`. Debug events need no sentence
at all. [Logging and events](logging-and-events).

## Adding a language

Additive, by design — nothing existing changes:

1. A `Locale` member in `shared.d.ts`.
2. A page catalogue beside `uiEn.ts` (`ui<Tag>.ts`) calling `i18nRegister`
   with the locale, its display name and a `UiStringsPartial`.
3. A log catalogue beside `logsEn.ts` (`logs<Tag>.ts`) calling
   `logRegisterStrings`.
4. The new files listed in the two page tsconfigs (`tsconfig.settings.json`,
   `tsconfig.quickbar.json`), in `tsconfig.json`, and in both build scripts.
5. A `<script>` tag for the compiled catalogue in `src/index.html` and
   `src/quickbar.html`.

The picker, the fallback and the `start()` payload need no edit: languages
register themselves as they load, in load order, and English loads first so
it is the fallback. `npm run i18n:check` then lists what the new language is
still missing.

## Share codes are language-agnostic

A dropdown entry encodes its `key` (a `SkillType`, a `BubbleStrategy`), never
its label, and a share code names a skill by its one-character `share` field.
That is what lets a code pasted from a Chinese settings page apply on an
English one. Never introduce a label into anything that crosses the bridge or
the wire.
