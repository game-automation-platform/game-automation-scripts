---
title: Build and deploy to a device
description: A build for a channel, and the three ways it reaches a device.
---

# Build and deploy to a device

## Build a channel

```bash
npm run build                       # the default channel (config.json's DefaultChannel: Alpha)
npm run build -- --channel Beta     # or Production
./build.sh -c Beta                  # the same, from a shell
npm run build:ps                    # build.ps1, from PowerShell
```

The channel decides which unfinished skills and settings the build offers:
`config.json` gives each channel a `Status`, and a skill or row whose
`ReleaseStatus` is below it is not listed — an Alpha skill is in the bundle
but cannot be picked on a Beta build. It also names the archive:
`TsumTsum-Beta-0.12.zip`, from the channel's `Archive` and `package.json`'s
`version`.

What lands: `dist/index.js`, `dist/index.html`, `dist/quickbar.html`,
`dist/tsums.dat`, `dist/LICENSE`, `dist/NOTICE`, and the zip with its
`.sha256` sidecar in the package root. `build/` keeps the readable bundle the
offline tools load. [Setup and first build](../getting-started/setup-and-first-build)
lists them; [Build and release](../architecture/build-and-release) is how the
build works.

Flags worth knowing: `--jobs N` caps the concurrency, which helps when reading
a failure; `--adb` pushes afterwards; `--device <serial>` picks which one.

## Push to a device

```bash
npm run adb            # push an existing dist/
npm run buildAndAdb    # build, then push
```

Both push `dist/index.js`, `index.html`, `quickbar.html` and `tsums.dat` to
`/sdcard/Download/GameAutomationPlatform/scripts/Official GAP/Tsum Tsum/` —
the folder the app reads for the official script. The app's script root is
`/sdcard/Download/GameAutomationPlatform/`; the Library lists what it finds
under `scripts/` up to three levels deep, stopping at the first folder that
holds an `index.js` or `index.html`.

`debug_deploy.ps1` is the Windows debug loop: it builds and pushes over the
*installed* script's folder, derived from `config.json` as
`<Publisher>/<Game>/<Name with spaces dashed>`, so your build lands on top of
the release the app already has rather than beside it. `-Channel` points it at
another channel's folder.

On an emulator that mounts a shared folder as `/sdcard/Download` (MuMu does),
copying `dist/` into that folder on the PC is the same thing without adb.

<ImagePlaceholder id="app-library-tab" alt="The app's Library tab with the installed script's card, showing its version and the Play action" />

## Check what is on the device

- The settings page shows the **build date** in its footer; the version
  string does not change between builds, the date does.
- `run.start` in the log carries the version (`ScriptVersion`, stamped at
  build time).
- A copied archive can be checked against the build it came from:

```bash
ZIP=TsumTsum-Beta-0.12.zip
[ "$(sha256sum -b "$ZIP" | cut -d' ' -f1)" = "$(cat "$ZIP.sha256")" ] && echo match
```

The sidecar is the bare digest — no filename, no newline — so it is compared,
not fed to `sha256sum -c`.

## Install from an archive

The app installs a script from a catalogue entry ([Release to the catalogue](release-to-catalogue),
[Your own library source](your-own-library-source)). A zip copied into the
scripts folder by hand as `index.zip` is unpacked by the app as well — the
older convention, still supported.
