---
title: Conventions
description: The rules that are silent when broken.
---

# Conventions

Almost every rule here fails **silently** when broken: a file the bundle never
loads, a method the compiler cannot see, a setting that renders and does
nothing, a document that is now a lie. The build catches some; the rest are
held by review.

## The code

1. **No imports, no modules.** Every `src/*.ts` is concatenated into one
   bundle sharing one global scope. Order in `tsconfig.json` matters for
   load-time work; duplicate names silently overwrite. [The bundle](../architecture/the-bundle).
2. **Adding a `Tsum` method means adding its signature to `interface Tsum`**
   in `globals.d.ts`, under the header for the implementing file. Prototype
   assignments carry no annotations of their own — `this` and the parameters
   come from the interface.
3. **Three compilations.** The game bundle (`strict`, ES2023), the settings
   page and the Quick Bar page (ES5, for the WebView). They share only the
   `.d.ts` vocabularies and the files listed in both page configs. `npm run
   typecheck` runs all three.
4. **A setting is named by `SettingKey`, never by a literal.** The enum keys
   `interface Settings`, the schema row, the share slot and the read in
   `buildRun`. Misspelling one is a build error; *forgetting* the read is not.
5. **String vocabularies are `const enum`s** — `PageName`, `SkillType`,
   `SettingKey`, `RecordKey`, `Log`, `Emit`, `UiText`. Use the member, not the
   literal. A string used twice is a member, not a repeated literal.
6. **`PAGE_DISPATCH.md` and `EVENTS.md` are generated.** Change the source and
   rebuild; a hand edit is lost at the next build.
7. **Some oddities are deliberate.** The script's behaviour was held identical
   to a working original for a long time, so a value or ordering that looks
   arbitrary may be load-bearing. Prefer a measurement to a tidy-up; the drag
   timing in `link` (10/10/10 ms) and the `minMs` floor on `settleBoard` are
   two that bite.
8. **The version lives in `package.json` and nowhere else.** The pages carry a
   `$VERSION` placeholder substituted at build time, and so does the bundle.
9. **Robotmon is gone on purpose.** ES2023, quality-100 captures, no
   `BOOTCLASSPATH`, no guards around optional natives — every documented
   native is present. Do not reintroduce a fallback for a host that no longer
   exists.
10. **The settings page is a WebView in an overlay.** No native popups (a
    `<select>` does nothing when tapped), no `location.reload()` (it navigates
    to the script directory). Redraw with `renderPage()`.
11. **A log line is one JSON record, not a sentence.** Everything goes through
    `logInfo` and friends, values go in *fields*, and nothing new belongs at
    the top level of the record. [Logging and events](../guides/logging-and-events).
12. **Every timestamp is UTC.** `Date.now()`, `toISOString()`, and the stats
    CSV's `getUTC*` getters. A local-time reading makes files from two devices
    unmergeable.
13. **`async`/`await` buys nothing.** The host has no timers and no workers;
    every native call is synchronous and blocking. Script-side JavaScript is
    about 1 % of a detection sweep; the cost is captures and native image
    work.
14. **`index.ts` stays thin.** It is concatenated near the end, so anything
    living there can quietly overwrite anything.
15. **Bubble taps go through the Bubble Strategy, or say why not** —
    `sweepsBubbles` or `claimsBubbles` on the skill. A new bubble tap that
    reads neither undoes the player's setting.
16. **A subscription's band is a contract.** `observe` takes no captures and
    taps nothing; `record` may capture but not tap; the rest may tap; `notify`
    decides nothing. Nothing checks this.
17. **A mode of a screen is not a page.** Read it from its own probe table,
    never from the matched key.

## The comments

Every source file opens with a header comment that says what the file owns
and why it is shaped the way it is — the long form of the code map's one
clause. Keep that pattern for a new file. Inline comments say *why*, concisely,
at the level a junior developer can follow; the reasoning behind a number
belongs beside the number, not in a document elsewhere.

## The documents

- **`CODEMAP.md` is the index and is read before anything is searched**, so a
  row there is one clause, never a paragraph. `map:check` holds it to the
  tree.
- **`CHANGELOG.md`** is filed under the version in `package.json`; `###
  Summary` is the release note, one line per player-visible feature; the rest
  goes below. Keep it succinct.
- **`README.md`** is the user's document: the settings table, the Quick Bar,
  presets, sharing, reporting.
- **The header comments** are where a decision and its reasoning are kept
  together. When a file's job changes, its header and its code-map row change
  with it.

## What must not be in the tree

The tree is public. It may not name the private toolkit repository, describe
what it holds beyond "the development toolkit", or carry anything of the
game's — screenshots, art, the readers of its data files. Comments cite the
toolkit's commands by name and stop there. Nothing from the host app's code
is copied here; its behaviour is described in prose and its natives are
declared, not implemented.
