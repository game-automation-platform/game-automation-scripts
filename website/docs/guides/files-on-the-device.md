---
title: Files on the device
description: Where the log, the round stats and the screenshots land, and how to get them onto the PC from MuMu or another emulator.
---

# Files on the device

Everything the script writes lands under the app's script root on shared
storage — the same root `npm run adb` pushes into
([Build and deploy](../publishing/build-and-deploy)):

```
/sdcard/Download/GameAutomationPlatform/
```

| Where | What |
|:--|:--|
| `logs/script-<device id>.log` | The log: one JSON record per line, rotated at 2 MB into `.1.log` … `.3.log`. The id is the device's own — one emulator, one file — and ends every round `id` in the stats. Reading it: [Log schema](../reference/log-schema) |
| `tsum_record/stats_<YYYYMMDD>.csv` | The round statistics, one file per UTC day |
| `tsum_record/unread-<field>-<stamp>.png` | The score screen a stat could not be read from |
| `tsum_record/pageHistory/` | The last screens the router visited, numbered and named for the page it matched: `01562_GamePlaying.png`, `01563_unknown.png` |
| `tsum_record/reports/` | The issue-report folders, newest eight — the authority the app's zip is packed from |
| `reports/` | The zips **Save to device** in Run History writes |
| `tsum_record/record.txt`, `tsum_record/presets.txt` | The heart tally; exported presets |
| `tsum_record/corpus/`, `tsum_record/walkthrough/` | Unrecognised screens with their sidecars, and walkthrough recordings — each behind its developer option |
| `tmp/` | Scratch: the *Debug game* frames (`…-boardImg.jpg`, `…-detectedHoughCircles.jpg`, `…-hsvImg.jpg`), the `uiautomator` dump a dialog check leaves. Safe to empty |

Names and timestamps are UTC throughout, so a stats file named for today may
be yesterday's by the PC's clock.

## MuMu Player 12

Nothing to pull. MuMu mounts its shared folder *as* the guest's `Download`, so
the root is already a folder on the PC:

```
C:\Users\<you>\Documents\MuMuSharedFolder\Download\GameAutomationPlatform\
```

`Documents` is wherever Windows keeps it (often under OneDrive); a shared folder
moved in MuMu's settings is under that path instead. The files are live —
open a CSV while the script plays, tail the log from there. MuMu's own toolbar
screenshot lands beside it in `MuMuSharedFolder\Screenshots`.

**Every instance mounts the same folder.** Each writes its own log — that is
what the device id in the name is for — but the stats files, `record.txt`,
`pageHistory/` and the reports are one set for all of them, so two instances
at once will interleave their stats.

## Other emulators

The guest path is the same; the route onto the PC differs.

1. **The shared folder.** Copy from `Download/GameAutomationPlatform/…` into
   it with the guest's *Files* app. Defaults, from each emulator's own
   documentation: Nox — `Nox_share` in the user folder (guest `/mnt/shared`);
   BlueStacks 5 — `C:\ProgramData\BlueStacks_nxt\Engine\UserData\SharedFolder`
   (guest `/sdcard/windows/BstSharedFolder`), its *Media Manager* copies;
   LDPlayer — the *Shared folder* toolbar button. For a report, **Save to
   device** does the copy itself where the app recognises the emulator.

2. **adb.** Each emulator listens on a local port: MuMu 12 `127.0.0.1:16384`
   for the first instance and 32 higher per further one (its `adb.exe` is
   beside `MuMuManager.exe` under `nx_main`); Nox `127.0.0.1:62001`; LDPlayer
   and BlueStacks 5 `127.0.0.1:5555` (BlueStacks: enable *Android Debug
   Bridge* under Advanced settings).

   ```sh
   adb connect 127.0.0.1:16384
   adb pull /sdcard/Download/GameAutomationPlatform/tsum_record .
   adb pull /sdcard/Download/GameAutomationPlatform/logs .
   ```

   A pulled directory is created *inside* the target (`./tsum_record/`,
   `./logs/`). From Git Bash on Windows prefix `MSYS_NO_PATHCONV=1`, or the
   shell rewrites `/sdcard/…` into a path under `C:\Program Files\Git` —
   [Windows and line endings](../contributing/windows-and-line-endings).

3. **A phone** shows the folder under *Download* in the Files app and over USB
   in Explorer; **Share report** is the route for a report.

## A screenshot of your own

What the display shows right now, floating bar included:

```sh
adb shell screencap -p /sdcard/Download/screen.png
adb pull /sdcard/Download/screen.png .
```

On MuMu the first line is enough — the file appears in
`MuMuSharedFolder\Download\` as it is written. From Git Bash or cmd,
`adb exec-out screencap -p > screen.png` is the one-liner; PowerShell's `>` is
not byte-clean, so use the two-step form there.

For what the *script* saw, `pageHistory/` and the report folders are the
record; *Debug game* on the Debug tab keeps a frame of every screen the router
visits rather than the last few. The offline harness reads any of these like a
capture — [Test without a device](test-without-a-device).
