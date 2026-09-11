---
title: Repository tour
description: What is where, in one read.
---

# Repository tour

```
game-automation-scripts/
├── CODEMAP.md             the index: which file owns what, which document answers what
├── CONTRIBUTING.md        the short version of this site
├── LICENSE · NOTICE       Apache-2.0, and what was inherited from where
├── .github/workflows/     builds and publishes this site
├── website/               this site (Docusaurus)
└── app.gap.Tsum/          the only package: the Disney Tsum Tsum script
    ├── src/               the script -- concatenated into one bundle, no imports
    │   └── skills/        one file per skill, plus the shared core
    ├── tools/             the build and what runs inside it, the checks, the release
    ├── docs/              data the generated documents are built from
    ├── build/ · dist/     build output, git-ignored
    ├── config.json        release identity: the game, one entry per channel
    ├── package.json       the version lives here and nowhere else
    ├── tsconfig*.json     three compilations (game, settings page, Quick Bar page)
    └── build.sh · build.ps1 · debug_deploy.ps1
```

## `CODEMAP.md` first

The repository's own rule is **read `CODEMAP.md` before searching the tree**.
It is a set of tables: one row per source file, one per skill, one per tool
directory, one per name family (`Tsum#*`, `Page*`, `skill*`…), then the rules
that are silent when broken and a table of *what a change has to touch*. Every
row is checked against the tree by `npm run map:check`, so it is current. This
site's [code map](../reference/code-map) is a condensed copy; the original is
the authority.

## `src/` in five groups

The bundle is one global scope, so files are best understood by what they own
rather than by what they import (they import nothing). In load order:

| Group | Files | Owns |
|:--|:--|:--|
| **Types and vocabularies** | `shared.d.ts`, `globals.d.ts`, `settings.d.ts`, `strings.d.ts`, `logEvents.ts`, `scriptEvents.ts` | The host API declarations, `interface Tsum`, and every `const enum` the code names things by: `SettingKey`, `SkillType`, `PageName`, `Log`, `Emit`. |
| **The run** | `index.ts`, `runPlan.ts`, `taskController.ts`, `state.ts` | `start()` / `stop()`, the table of scheduled jobs, the cooperative scheduler, the two globals `ts` and `gTaskController`. |
| **Seeing the screen** | `data.ts`, `pages.ts`, `pageHandlers.ts`, `forecast.ts`, `dialogs.ts`, `corpus.ts`, `walkthrough.ts` | Every coordinate and fingerprint (`data.ts`), the router that decides which screen is up (`pages.ts`), every reaction to one (`pageHandlers.ts`), and the odd cases: system dialogs, unknown screens, the recorder. |
| **Playing** | `tsum.ts`, `waits.ts`, `appLifecycle.ts`, `board.ts`, `pathfinding.ts`, `play.ts`, `fever.ts`, `lorcana.ts`, `skills/`, `clickAssist.ts`, `roundStats.ts`, `mail.ts`, `hearts.ts`, `levelCap.ts`, `boxes.ts` | The `Tsum` object (the world one run is played in), the waits, reading the board and drawing chains, one round start to finish, the skills, and the chores. |
| **The two pages** | `settings.ts`, `index.html`, `index.css`, `quickbar.ts`, `quickbarPage.ts`, `quickbar.html`, `quickbar.css`, `presets.ts`, `skillOptions.ts`, `bubbleOptions.ts`, `releaseStatus.ts`, `i18n.ts`, `uiEn.ts`, `uiZhTw.ts`, `qrCode.ts`, `logs.ts`, `logsEn.ts`, `logsZhTw.ts`, `logging.ts`, `report.ts`, `utils.ts` | The settings page and the Quick Bar (separate compilations), the lists both share, translations, the logger, and the issue report. |

The entry point is deliberately thin. Its header comment says why:

```ts reference title="app.gap.Tsum/src/index.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/index.ts#L1-L22
```

## `tools/`

Everything here runs in Node on the PC against the **built** bundle, never on
the device.

| Directory | What it does | Run with |
|:--|:--|:--|
| `tools/build/` | The build, as a dependency graph of steps | `npm run build` |
| `tools/runtime/` | A Node stand-in for the host: loads `build/index.js` in a vm and shims the ~15 natives under it. Every offline tool goes through this, so the code under test is the production code | required by the others |
| `tools/pageDocs/` | Renders `PAGE_DISPATCH.md` by asking the compiled router for its real dispatch order | `npm run pages:docs` |
| `tools/eventDocs/` | Renders `EVENTS.md` from the `emitEvent` call sites | `npm run events:docs` |
| `tools/dispatchEval/` | Golden traces for the dispatch queue and the scheduler: a change for page A that moved page B's trace fails here | `npm run dispatch:eval` |
| `tools/liveSettings/` | When each setting reaches a run in progress, checked by driving the bundle | `npm run live:check` |
| `tools/codemap/` | Checks `CODEMAP.md` against the tree | `npm run map:check` |
| `tools/i18n/` | What each language is missing | `npm run i18n:check` |
| `tools/inline/`, `tools/minify/` | Fold the pages into single files; strip whitespace from what ships | by the build |
| `tools/release/` | Cut a release into the catalogue | `npm run release:<channel>` |

## `docs/`

Not documentation — data. `transitions.json` is the observed page graph (which
screen followed which, recorded by the walkthrough mode) and `media.json` a
clip library. `PAGE_DISPATCH.md`'s sitemap is drawn from the first.
