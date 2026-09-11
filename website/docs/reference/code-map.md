---
title: Code map
description: Which file owns what, condensed from the repository's CODEMAP.md.
---

# Code map

A condensed copy of [`CODEMAP.md`](https://github.com/game-automation-platform/game-automation-scripts/blob/main/CODEMAP.md),
which is the authority: it is checked against the tree by `npm run map:check`
and also carries the "what a change has to touch" table and the rules the
[conventions page](../contributing/conventions) summarises. Paths are under
`app.gap.Tsum/`. The long form of every row is the file's own header comment.

## Source — `src/`

In bundle order.

| File | Owns |
|:--|:--|
| `shared.d.ts` | Types in all three compilations: `SettingKey`, `Settings`, `SkillType`, `BubbleStrategy`, `RecordKey`, `Locale`. |
| `globals.d.ts` | The host API declarations, the shared value shapes, and `interface Tsum` — every prototype method's signature. |
| `settings.d.ts` | The settings page schema (`SettingSpec`, `GroupSpec`, `TabSpec`, `RowKey`), `Preset`, `PageMessage`. Both page compilations. |
| `strings.d.ts` | `UiText`, and `UiStrings` mapped over it. Both page compilations. |
| `i18n.ts` | The page-side i18n runtime; resolves at render time. |
| `uiEn.ts`, `uiZhTw.ts` | One language each, keyed by `UiText`. English must be complete. |
| `taskController.ts` | `TsumTaskController`, the cooperative scheduler. Five consecutive throws from one job restart the app. |
| `runPlan.ts` | The run's task table, in the game and settings compilations, so the Run order card lists exactly what runs. |
| `state.ts` | The two script-wide globals: `ts`, `gTaskController`. |
| `utils.ts` | `isSameColor`, `absColor`, `channelDiff`. |
| `data.ts` | Every coordinate and tuning constant, no logic: the page fingerprints, the navigation plans, one table per screen a chore walks. Shared tables only. |
| `logEvents.ts` | `Log` — the log event vocabulary, one `const enum` per component. |
| `scriptEvents.ts` | `Emit` — the emitted event vocabulary. |
| `logs.ts`, `logsEn.ts`, `logsZhTw.ts` | The log sentence registry and one table per language. |
| `logging.ts` | The structured logger: the JSONL record, the correlation ids, the flood guard, the ring of recent records a report carries. |
| `pathfinding.ts` | Board reading and chain planning, no tapping: circle detection, clustering, `calculatePaths`, the chroma colour model. |
| `pages.ts` | `PageRouter` and `gPages`: score, `observe`, `react`, `detect`, `peek`, `navigate`, the page sets, and `perform`. |
| `tsum.ts` | The `Tsum` object: the fields, the geometry, the capture and touch wrappers, the coordinate conversions. Reopened by most files below. |
| `waits.ts` | `sleep`, `sleepUntil`, `settleScreen`, `settleBoard`, `mayContinue`. |
| `appLifecycle.ts` | Is the game in front, getting it there, and the waits either side of a restart. |
| `board.ts` | `scanBoardQuick`, `link`, and what the Bubble Strategy setting comes to. |
| `play.ts` | One round, start to finish: proving game over, the dead-scan block, the Max Round Duration cap. |
| `mail.ts` | The mailbox chore. |
| `hearts.ts` | The send-hearts sweep and the sent/received tally. |
| `levelCap.ts` | The level-cap sweep. `awaitPage` is shared with `boxes.ts`. |
| `boxes.ts` | The Box Buying chore. |
| `fever.ts` | Fever time: one look with no memory, plus `gFever`, the debounced state and its start/end broadcast. |
| `lorcana.ts` | The Lorcana transformation: the medallion reader, the state with hysteresis, the ink-stone bubbles. |
| `skills/` | One file per skill plus `skillCore.ts` — the table below. |
| `clickAssist.ts` | Manual-play mode: draw a chain where the user taps. |
| `dialogs.ts` | Android system dialogs, and the `checkStall` watchdog. |
| `corpus.ts` | Capture of unrecognised screens, rate-limited. |
| `report.ts` | The issue-report folder a player sends in, and `ReportTriggers`. |
| `walkthrough.ts` | The walkthrough recorder: watches rather than plays; feeds `docs/transitions.json`. |
| `roundStats.ts` | The per-round CSV, template digit reading, the row id minted at the whistle. |
| `tsums.dat` | Generated, not part of the bundle: the tsum library, deployed beside it. |
| `forecast.ts` | What the script is about to do, without doing it. Read forward only. |
| `pageHandlers.ts` | Every reaction to a page, one subscription each; reading it top to bottom is the dispatch order. |
| `index.ts` | The entry point: `start()` / `stop()` / `requestStop()`, the run lifecycle, the globals the settings page evaluates by name. Kept thin. |
| `quickbar.ts` | The engine half of the Quick Bar, and `LiveSettings`. |
| `settings.ts` | The settings page: the `tabs` schema, rendering, persistence, share codes, the Run order card, presets. |
| `index.html`, `index.css` | The settings page shell, one `<template>` per piece of structure. |
| `releaseStatus.ts` | `ReleaseStatus` and the channel floor: what this build may offer. |
| `skillOptions.ts`, `bubbleOptions.ts` | The two dropdown lists, written once for both pages. |
| `presets.ts` | Named configurations, and the store both pages read them from. |
| `qrCode.ts` | A QR encoder for the share code. Settings compilation only. |
| `quickbarPage.ts` | The Quick Bar's page script: wiring only, by `data-key`. |
| `quickbar.html`, `quickbar.css` | The Quick Bar's whole appearance. |

## Skills — `src/skills/`

| File | `SkillType` | What makes it unlike the others |
|:--|:--|:--|
| `skillCore.ts` | — | The registry and everything shared: gauge read, fever hold-off, activation taps, `useSkill`, auto-tap, and the declarations a skill makes about the play loop. |
| `burst.ts` | `Burst`, `BurstBubbles` | A bare tap activates, so the play loop may fire these blind between chains. |
| `pairTsum.ts` | `PairTsum` | Two-button activation. |
| `donald.ts` | `Donald`, `HolidayDonald` | |
| `lukeJ.ts` | `JediLuke` | Aimed taps. |
| `marie.ts` | `Marie`, `MissBunny`, `Rabbit` | |
| `moana.ts` | `Moana` | The smallest. |
| `mickeyH2015.ts` | `HornHatMickey` | |
| `snowWhite.ts` | `SnowWhite` | |
| `cinderella.ts` | `Cinderella` | Its own `useCinderellaSkill`. |
| `woody2.ts` | `SheriffWoody` | A drag choreography. |
| `cabbageMickey.ts` | `CabbageMickey` | Face-colour probe. |
| `cptLy.ts` | `CptLightyear`, `CptLightyear120` | Timing tables, one per frame rate. |
| `lightningMcQueenPlus.ts` | `LightningMcQueenPlus` | |
| `formalBeast.ts` | `FormalBeast` | Steers the play loop: reads his twin gauge and picks chains by colour. |
| `tiaraMinniePlus.ts` | `TiaraMinniePlus` | The largest: board signature, cloud sampling, candidate scoring. |
| `coronationElsa.ts` | `CoronationElsa` | The only choreography that plays: a timed freeze window planned off one capture. |
| `lorcanaAurora.ts` | `LorcanaAurora` | Two skills with one gauge; after the card, the bubbles become a standing claim. |
| `gaston.ts` | `Gaston` | One snake down the pile from a top corner; ignores the chain settings. |
| `rapunzelPlus.ts` | `RapunzelPlus` | The one chain that ignores colour, with its own paced drag. |

## Tooling — `tools/`

| Directory | What | Entry point |
|:--|:--|:--|
| `runtime/` | The Node stand-in for the host: `load.js`, `host.js`, `imageio.js`, `matcher.js`, `transitions.js`. | required by the rest |
| `pageDocs/` | Renders `PAGE_DISPATCH.md` from the compiled router. | `pages:docs`, `pages:docs:check` |
| `eventDocs/` | Renders `EVENTS.md` from the `emitEvent` call sites; reads the TypeScript program. | `events:docs`, `events:docs:check` |
| `dispatchEval/` | Golden traces for the dispatch queue and the scheduler. | `dispatch:eval`, `dispatch:update` |
| `codemap/` | Checks `CODEMAP.md` against the tree; `symbols.js` is the reusable symbol extractor. | `map:check` |
| `i18n/` | What each language is missing. | `i18n:check` |
| `liveSettings/` | When each setting reaches a run in progress, by driving the bundle. | `live:check` |
| `release/` | Cuts a release into the catalogue; `review.js` is the note gate. | `release:alpha`, `release:beta`, `release:production` |
| `build/` | The build as a dependency graph; `zip.js` the deterministic archive writer. | `build`, `buildAndAdb` |
| `inline/`, `minify/` | Fold the pages into single files; whitespace-only terser. | by the build |

## Where a name lives

A prefix usually settles it; `map:check` enforces every row.

| Name | Defined in |
|:--|:--|
| `Tsum#*` — any `ts.foo()` method | the file that owns the behaviour; every signature also in `globals.d.ts` |
| `Tsum#task*` — the scheduled jobs | `play.ts`, `mail.ts`, `hearts.ts`, `levelCap.ts`, `boxes.ts`, `appLifecycle.ts`, `clickAssist.ts`, `walkthrough.ts` |
| `TaskName`, `JobPriority`, `TaskSpec`, `runTaskTable` | `runPlan.ts` |
| `Config`, `Button`, `Page`, `PageName`, `PageProfiles`, `NavPlans`, `PageAnchor`, `PageRoutes` | `data.ts` |
| `PageRouter#*`, `PageKind`, `PageRole`, `PageCategory*`, `gPages` | `pages.ts` |
| `PageDef`, `PageSubscription`, `PageEvent`, `PageStep`, `PageRoute` | `globals.d.ts` |
| `Fever*`, `gFever` | `fever.ts` |
| `skill*`, `Skill*` | `skills/skillCore.ts`, `tsum.ts`, `globals.d.ts`, `shared.d.ts`, `skillOptions.ts` |
| `quickBar*`, `onPause`, `LiveSettings` | `quickbar.ts` |
| `qb*`, `onGapState` | `quickbarPage.ts` |
| `applyLiveSettings` / `pushLiveSettings`, `pullLiveSettings` | `index.ts` / `settings.ts` |
| `preset*`, `Preset*` | `presets.ts`, `settings.ts`, `settings.d.ts` |
| `stats*`, `myTsum*` | `roundStats.ts` |
| `maxRound*`, `RoundCoast*`, `watchRoundEnd` | `play.ts` |
| `Box*`, `buyBox*` | `boxes.ts`, `shared.d.ts`, `data.ts` |
| `dialog*`, `Stall*` | `dialogs.ts` |
| `report*`, `Report*` | `report.ts` |
| `Log`, `Emit` | `logEvents.ts`, `scriptEvents.ts` |
| `logInfo`, `logWarn`, `logError`, `logDebug`, `LogEvent`, `LogFields` | `logging.ts` (the settings page has its own small `logInfo` family) |
| `SHARE_*`, `share*`, `tabs`, `SettingSpec` | `settings.ts`, `settings.d.ts` |
| `qr*`, `QR_*` | `qrCode.ts` |
| `UiText`, `UiStrings`, `i18n*` | `strings.d.ts`, `i18n.ts` |

Two that are not where they sound like they are: page subscriptions live in
`pageHandlers.ts`, never in `pages.ts`; and a skill's tuning tables live in
its own file under a "Tuning data" heading, not in `data.ts`.
