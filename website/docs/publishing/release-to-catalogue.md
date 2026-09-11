---
title: Release to the catalogue
description: Cut a channel release and publish it where the app downloads from.
---

# Release to the catalogue

A release is a build of one channel, written into the sibling
`game-automation-catalogue` checkout as the files the app's index is built
from. Three commands, one per channel:

```bash
npm run release:alpha
npm run release:beta
npm run release:production
npm run release:alpha -- --dry-run   # show the entry, write nothing
npm run release:alpha -- --yes       # skip the note review (for scripts; needs no terminal)
```

## Before you start

1. **`package.json` carries the version.** Bump it (`npm version 0.13
   --no-git-tag-version`, or edit it) — it is the one place the version lives.
2. **`CHANGELOG.md` has a `## [<that version>]` section with a `### Summary`
   block.** There is no `[Unreleased]`: the section named for the version is
   the one that ships, and a missing section or an empty Summary fails the
   release before anything is built. The Summary is the player-facing note —
   one line per *feature*, not per change, and only what a player sees. Later
   work on a feature folds into its existing line.
3. The catalogue checkout is beside this repository, at the path
   `config.json`'s `Catalogue` names (`../../game-automation-catalogue/Official/LineTsumTsum`).

## What `config.json` says

| Field | Meaning |
|:--|:--|
| `Game` | Copied into every entry. |
| `Publisher` | The catalogue this ships under, and the first segment of the on-device folder. |
| `Catalogue` | Where a release is written, relative to the package. |
| `Channels.<name>` | `Name` (what the app shows), `Archive` (the zip's base name), `Directory` (under `Catalogue`), `Note` (appended to every release note on that channel), `Status` (the lowest `ReleaseStatus` the channel offers: 0 Alpha, 1 Beta, 2 Production). |
| `MessageMaxChars` | The note is read on a phone; over this, the release refuses. |
| `HistoryLimit` | How many builds stay installable (5); older archives are deleted from the catalogue on the next release. |

```json reference title="app.gap.Tsum/config.json"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/config.json
```

## What happens

1. **The note is proposed, not taken.** The release prints the Summary bullets
   exactly as the app will render them — a numbered list, the channel's note,
   the character count — and waits: `a` approve, `e` edit in `$VISUAL` /
   `$EDITOR`, `d` deny (nothing is built). A note over the limit or with no
   bullets cannot be approved; edit it until it can. An approved edit is
   offered back to `CHANGELOG.md`, so what shipped and what the repo says
   shipped stay the same text.
2. **The channel is built.**
3. **Four things are written** into `<Catalogue>/<Directory>/`:

   ```
   ../game-automation-catalogue/Official/LineTsumTsum/Beta/
   ├── TsumTsum-Beta-0.12.zip     the build
   ├── TsumTsum-Beta-0.11.zip     and the ones before it, up to HistoryLimit
   ├── metadata.json              describes the newest build and lists the rest
   └── CHANGELOG.md               every release cut on this channel, newest first
   ```

   `metadata.json`'s top-level fields describe this build — `Game`, `Name`,
   `Version`, `Date`, `Hash` (taken from the bytes just written, so the entry
   cannot describe a different build), `File`, `Message` — and its `Versions`
   array lists this build and the ones before it, so a player can roll back
   from the script's card in the app. Re-publishing a version replaces its
   row and its changelog section rather than adding a second. Archives past
   `HistoryLimit` are deleted; stage those deletions when you commit.
4. **The release tells you what to do next**: run the catalogue's own
   `build-official` script there and commit.

```js reference title="app.gap.Tsum/tools/release/release.js"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/tools/release/release.js#L39-L68
```

## Finish in the catalogue

```bash
cd ../../game-automation-catalogue
bash build-official.sh        # or build-official.ps1; regenerates official.json locally
git add -A && git commit -m "Tsum Tsum Beta 0.12" && git push
```

`official.json` itself is git-ignored there: the catalogue's GitHub Actions
workflow rebuilds it on every push that touches a `metadata.json` and
publishes it to GitHub Pages, which is the URL the app fetches. Running the
script locally is a check that the entry folds in cleanly, not the publish.

Within a few minutes the app's Library shows the new version — with an
**UPDATE** badge on devices that have an older one installed, unless that
install was *pinned* by choosing its version by name.

## Two paths onto a device, and they are not the same

- `npm run release:*` publishes an archive for the app to **install** from
  the catalogue. This is what a user gets.
- `debug_deploy.ps1` and `npm run adb` push `dist/` straight over the
  installed script's folder, skipping the catalogue. This is the debug loop.
