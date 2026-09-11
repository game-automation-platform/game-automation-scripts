---
title: The bundle
description: No modules, one global scope, and the three things that follow from it.
---

# The bundle

## There are no imports

Every `.ts` file under `src/` is concatenated, in the order listed in
`tsconfig.json`, into a single `build/index.js` that the host loads. All files
share **one global scope**: a `function` or `var` declared in `data.ts` is
simply visible in `play.ts`, with no `import` anywhere.

```mermaid
flowchart LR
  src["src/*.ts<br/>in tsconfig.json order"]
  tsc["tsc<br/>module: none, outFile"]
  build["build/index.js<br/>readable, comments stripped"]
  min["terser<br/>whitespace only"]
  dist["dist/index.js<br/>what ships"]
  src --> tsc --> build --> min --> dist
```

Two consequences to internalise:

- **Order in `tsconfig.json` matters — for load-time work only.** Anything that
  *executes as the bundle evaluates* (a top-level `var SkillHandlers = {}`, the
  `registerSkill(...)` calls in every skill file, `var gPages = new
  PageRouter()`) must be listed after what it depends on. Function declarations
  hoist across the whole bundle, so calls made *at runtime* are order-independent.
- **Name collisions are silent.** Two files declaring the same symbol will not
  error; the later one wins. This has bitten the project: a bad merge restored
  an old monolithic `index.ts` beside the split files, and because `index.ts`
  is concatenated near the end, its duplicates quietly overwrote everything.
  Which is why `index.ts` is kept thin.

The file list, with the comments that say why each slot is where it is:

```jsonc reference title="app.gap.Tsum/tsconfig.json"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/tsconfig.json#L31-L143
```

## `Tsum` is typed by declaration merging

`Tsum` is a `class` in `tsum.ts`, but **every one of its methods is attached
from outside the class body** as `Tsum.prototype.name = function ...`, spread
over twenty-odd files. With no modules a class cannot be reopened, and
splitting the object across files is the whole reason the package is not one
enormous file.

The two halves are joined by declaration merging: `interface Tsum` in
`globals.d.ts` declares every method, and TypeScript merges the interface into
the class of the same name. That buys:

- `ts.foo()` and `this.foo()` are checked, completed and find-referenced across
  the bundle;
- inside each `Tsum.prototype.name = function (...)`, `this` and the parameters
  are typed from the interface — which is why those assignments carry no
  annotations of their own and should not grow any;
- `Tsum.prototype.typo = ...` is an error, so a method cannot be defined under
  a name nothing calls.

**Adding a method to `Tsum` therefore means adding its signature to
`interface Tsum` as well.** The interface is grouped by the file that
implements each member:

```ts reference title="app.gap.Tsum/src/globals.d.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/globals.d.ts#L1077-L1093
```

The file that declares the class says the same thing from its side:

```ts reference title="app.gap.Tsum/src/tsum.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/tsum.ts#L1-L31
```

The same idea one level down is why `Button`, `Page` and the log tables carry
**no type annotation**: `{[k: string]: any}` would erase the key set, and with
it go-to-definition on `Button.gameSkill1` and any chance of catching
`Button.gameSkil1`. `Page` uses `satisfies PageMap`, which validates each entry
without losing its keys.

## The string vocabularies are `const enum`s

Several values are passed around as bare strings and are what most branching
tests. Each set is a `const enum`, and code refers to members, never to the
string:

| Enum | Declared in | Names |
|:--|:--|:--|
| `PageName` | `data.ts`, above the `Page` table | every screen the router can report |
| `SkillType` | `shared.d.ts` | every entry in the Skill Type dropdown |
| `SettingKey` | `shared.d.ts` | every setting; `interface Settings` is keyed from it, so the enum and the object that crosses the bridge are one list |
| `RecordKey`, `Locale` | `shared.d.ts` | the keys of `record.txt`; the language tags |
| `Log` | `logEvents.ts` | every log event name, one enum per component inside a namespace |
| `Emit` | `scriptEvents.ts` | every event broadcast to outside tooling |
| `SkillReadiness`, `KeyCode` | `globals.d.ts` | the gauge read's answer; the host's key codes |

A const enum is erased at compile time: `page === PageName.GamePlaying` emits
`page === "GamePlaying"`. That costs nothing at runtime, gives each name one
definition to jump to and rename, and — the reason it matters here — is the
only kind of shared constant that *can* span the three compilations, since
they share no memory.

What it does and does not prevent: a **misspelt** name is an error everywhere
(`Did you mean 'GamePlaying'?`). A **correctly spelled raw string** still
compiles, because TypeScript allows comparing a string enum against a literal
of the same value. The rule is a convention the reviewers hold: use the member.

`Log` is the same trick one level out: const enums cannot nest, so the
components are separate enums inside a namespace that is erased with them.
`Log.Skill.TiaraNoDream` is `'skill.tiara.noDream'`.

## Three compilations

| Config | Output | Target | Shares |
|:--|:--|:--|:--|
| `tsconfig.json` | `build/index.js` — the game bundle | ES2023, `strict` | `shared.d.ts`, `logEvents.ts` |
| `tsconfig.settings.json` | `build/settings.js` — the settings page | ES5 (the WebView), looser | the above plus `settings.d.ts`, `strings.d.ts`, `i18n.ts`, the `ui*` catalogues, `skillOptions.ts`, `bubbleOptions.ts`, `presets.ts`, `releaseStatus.ts`, `runPlan.ts` |
| `tsconfig.quickbar.json` | `build/quickbar.js` — the Quick Bar page | ES5, `strict` | the same page-side files |

Only the first has a name an editor discovers automatically, so `settings.ts`
opens with `/// <reference>` lines that exist purely so a TypeScript language
server checks it against the right files. `npm run typecheck` runs all three.

## What ships is compacted, and only in ways that cannot change it

`tools/minify/minify.js` runs terser over both outputs with **`compress:
false` and `mangle: false`**: it parses and reprints without the formatting.
Nothing is renamed, inlined, folded or dropped. The whole set of
behaviour-changing transforms was measured at about 23 K on a 157 K bundle,
and a script that runs unattended for hours on a phone, with no source map and
an error handler that logs `String(e)`, does not buy a misplay for 10 %.
`build/index.js` is left alone entirely so the offline tools and a stack
trace stay readable.

TypeScript is pinned to 6.x on purpose: 7 removes `outFile` and `module:
none`, and the no-imports design depends on both. Moving would mean a bundler
that emits a single IIFE and preserves global scope — a build migration, not a
config edit.
