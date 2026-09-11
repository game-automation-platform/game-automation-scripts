---
title: Commands
description: Every npm script in the package, and the ones that are not here.
---

# Commands

Run from `app.gap.Tsum/`.

| Command | Does |
|:--|:--|
| `npm run typecheck` | All three compilations. `typecheck:game`, `typecheck:settings`, `typecheck:quickbar` for one. |
| `npm run build` | Compile both halves, regenerate `PAGE_DISPATCH.md` and `EVENTS.md`, run the traces and checks, inline the pages into `dist/`, write the channel's archive and its `.sha256`. `-- --channel Beta` picks the channel; `npm run build:ps` is the PowerShell wrapper. |
| `npm run buildAndAdb` | Build, then push to the device. |
| `npm run adb` | Push an existing `dist/` to the script's folder on the device. |
| `npm run pages:docs` | Regenerate `PAGE_DISPATCH.md`. `pages:docs:check` fails if it is stale. |
| `npm run events:docs` | Regenerate `EVENTS.md` from the `emitEvent` call sites. `events:docs:check` fails if it is stale, and reports an emit outside `Emit` or one event with two payload shapes. |
| `npm run dispatch:eval` | The dispatch queue and the scheduler against their golden traces; exit 1 on a changed row or a broken invariant. `-- -v`, `-- --only X`, `-- --dispatch` / `--scheduler`, `-- --strict`. |
| `npm run dispatch:update` | Rewrite the goldens from the bundle as it stands. The diff is the review. |
| `npm run map:check` | Verify `CODEMAP.md` against the tree. |
| `npm run i18n:check` | What each language is missing; a `data-i18n` naming no key. |
| `npm run live:check` | Every setting a preset carries says when it reaches a running script, and the value survives the round trip. |
| `npm run release:alpha` | Build the Alpha channel and publish it to the catalogue; `release:beta`, `release:production` likewise. `-- --dry-run` shows the entry without writing; `-- --yes` skips the note review. |

`npm run build` runs `pages:docs`, `events:docs`, `dispatch:eval` and
`map:check` as *optional* steps that print findings and never block, and
`live:check` as a required one.

## Not in this package

Source comments cite a second set of commands by name — `pages:eval`,
`pages:calibrate`, `pages:audit`, `pages:selftest`, `chain:bench`,
`report:open` and others. Those belong to the **development toolkit**, a
separate private repository that runs against this one's build. None of them
is an `npm run` script here; read any command this `package.json` does not
define as one of the toolkit's, and treat its result (a threshold, a
timing) as the measurement behind the number in the source.

## The site's own commands

The documentation site under `website/` has its own scripts — `start`,
`build`, `sync`, `refs:check` — described in `website/README.md`.
