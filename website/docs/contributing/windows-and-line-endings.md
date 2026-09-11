---
title: Windows and line endings
description: The tree is LF everywhere; here is what puts CRLF back, and how not to.
---

# Windows and line endings

Line endings are **LF, everywhere**, fixed by two files at the repository
root:

- `.gitattributes` — `* text=auto eol=lf`, with `*.png`, `*.jpg`, `*.zip`,
  `*.mp4`, `*.webp`, `*.mkv` marked binary and `*.dat` as LF text.
- `.editorconfig` — `end_of_line = lf`, `charset = utf-8`,
  `insert_final_newline = true`.

Set `git config core.autocrlf false` in your clone. Note that `text=auto`
will not renormalise a file whose committed blob already has CRLF — that is
git's anti-churn guard — so a file that arrives with CRLF has to be converted
by hand before it is committed.

## What puts CRLF back

Both shells on Windows will, in different ways, so file work is best done
with an editor or a tool that writes exactly the bytes it is given:

- **PowerShell**: `Set-Content`, `Out-File`, `>` and here-strings all
  terminate lines with CRLF. `[IO.File]::WriteAllText` preserves what it is
  given. The package's own `build.ps1` goes through the Node build for
  exactly this reason — it used to write CRLF into `dist/*.html`.
- **Git Bash** writes LF, but a Windows path is a string of escapes there
  (`d:\Projects\...` arrives as `d:Projects...`), and a carriage return
  written as `$'\r'` silently vanishes inside `$( )` — so
  `c=$(grep -c $'\r' "$f")` runs `grep -c ''`, matches every line, and reports
  a pure-LF file as fully CRLF. Other escapes survive; that one does not.

Check a file rather than trusting a command that printed nothing:

```bash
git ls-files --eol app.gap.Tsum/src | grep -v 'i/lf'     # empty means all LF in the index
```

## Building on Windows

`npm run build` is the same Node build on every platform; `build.ps1` and
`build.sh` only translate flags. `debug_deploy.ps1` is the Windows debug loop
onto an emulator. adb from Git Bash needs `MSYS_NO_PATHCONV=1` (or quoting)
for any argument starting with `/sdcard/…`, or the shell rewrites it into a
Windows path before adb sees it.

The emulator's WebView is Chromium 110, which lays out flex containers
differently from desktop Chrome — see [Test without a device](../guides/test-without-a-device)
before trusting a layout change to the desktop browser.
