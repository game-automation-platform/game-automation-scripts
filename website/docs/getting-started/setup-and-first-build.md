---
title: Setup and first build
description: Clone, install, type-check, build, and push to a device.
---

# Setup and first build

## Prerequisites

- **Node.js 20.15 or newer** (the package's `engines` field). The build and every
  check run in Node on your PC; nothing needs to be installed on the device.
- **git**, with `core.autocrlf` off on Windows. The repository pins LF line
  endings through `.gitattributes` and `.editorconfig` — see
  [Windows and line endings](../contributing/windows-and-line-endings).
- **adb** on your PATH if you want to push to a device or emulator. Optional
  until you do.
- The **Game Automation Platform** app on an Android device or emulator, with
  the game installed, to see a change work for real.

You do **not** need the development toolkit. It is a separate, private
repository that holds the game's own screenshots and the tools that author
screen fingerprints; the source comments cite its commands, and nothing in
this package runs them.

## Clone and install

The repository has one package, `app.gap.Tsum/`. Everything runs from there.

```bash
git clone https://github.com/game-automation-platform/game-automation-scripts.git
cd game-automation-scripts/app.gap.Tsum
npm install
```

## Type-check

```bash
npm run typecheck
```

Runs all three TypeScript compilations — the game bundle, the settings page
and the Quick Bar page (why there are three is [The bundle](../architecture/the-bundle)).
`npm run typecheck:game`, `typecheck:settings` and `typecheck:quickbar` run one
each. The game bundle is `strict: true` and clean; keep it that way.

## Build

```bash
npm run build
```

The build is a dependency graph of steps that run concurrently
([Build and release](../architecture/build-and-release)). It writes:

| Output | What |
|:--|:--|
| `build/index.js` | The concatenated game bundle, readable, with comments stripped. The offline tools load this one. |
| `dist/index.js` | The same bundle with whitespace removed — what ships. Nothing is renamed or rewritten. |
| `dist/index.html` | The settings page with its CSS and script inlined, so it needs no network. |
| `dist/quickbar.html` | The Quick Bar page, inlined the same way. |
| `dist/tsums.dat` | The tsum library, copied without its header. |
| `dist/LICENSE`, `dist/NOTICE` | Travel with the archive. |
| `TsumTsum-Alpha-0.12.zip` + `.sha256` | The release archive, named from `config.json` (channel) and `package.json` (version), and its digest. |

The build also regenerates `PAGE_DISPATCH.md` and `EVENTS.md`, runs the
dispatch traces and the code-map check (all *optional*: they report and never
block), and runs `live:check`, which is required.

Pick a channel with `npm run build -- --channel Beta`; the wrappers
`build.sh -c Beta` and `build.ps1 -Channel Beta` do the same. The channel
decides which unfinished skills and settings the build offers.

The package's scripts, as they are on `main`:

```json reference title="app.gap.Tsum/package.json"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/package.json#L6-L27
```

## Put it on a device

Three ways, from quickest to most official:

1. **`npm run adb`** pushes an existing `dist/` to the folder the app reads:
   `/sdcard/Download/GameAutomationPlatform/scripts/Official GAP/Tsum Tsum/`.
   `npm run buildAndAdb` builds first.
2. **`debug_deploy.ps1`** builds and pushes over the *installed* script's
   folder, which it derives from `config.json`, so your build lands on top of
   the release the app already has rather than beside it. This is the debug
   loop.
3. **`npm run release:<channel>`** publishes to the catalogue, which is what a
   user installs from — [Release to the catalogue](../publishing/release-to-catalogue).

Then press Play in the app. The Log panel shows the script's output; the
[Debug tab](../reference/settings#debug) of the settings page
turns on more.

## Check your work

Before opening a pull request, run the checks the build runs, as gates:

```bash
npm run typecheck
npm run pages:docs:check    # PAGE_DISPATCH.md is current
npm run events:docs:check   # EVENTS.md is current
npm run dispatch:eval       # nothing moved in the dispatch/scheduler traces
npm run map:check           # CODEMAP.md matches the tree
npm run i18n:check          # every language has what it needs
npm run live:check          # every setting says when it reaches a running script
```

[Contributing → Workflow](../contributing/workflow) says what each catches and
what to do when one fails.
