**Start at [CODEMAP.md](CODEMAP.md), before searching the tree.** It is the
index: which file owns what, which document already answers a question, where a
given name is defined, and what the invariants are. One read of it replaces most
of a scan, and it is checked against the tree by `npm run map:check`, so it is
current. Anything it does not cover is worth adding to it once found.

These scripts target **Game Automation Platform** (source at `../game-automation-app`),
and only that. Feel free to perform updates in that folder as needed.

**The development toolkit is a private sibling checkout, not part of this
tree.** Comments and docs here cite its commands by name — `pages:eval`,
`chain:bench`, `report:open` and the rest — and none of them is an `npm run`
script in this package. When a task needs one, look for that checkout beside
this repository (it carries its own `DEVELOPMENT.md`) and run it from there,
against this repository's **built** bundle. This tree is public: nothing in it
may name that repository or describe what it holds beyond "the development
toolkit"; `DEVELOPMENT.md` § The development toolkit is the extent of it.

**The break with Robotmon is complete.** This package was forked from
`r2-studio/robotmon-scripts` (`scripts/com.r2studio.Tsum`) and tracked that
upstream for a while; it no longer does. There is no porting document, no port
tooling and no upstream checkout to compare against — do not go looking for one,
and do not reintroduce a behaviour on the grounds that upstream has it. Anything
still shared with that original is now simply this project's code.

The compatibility that went with it, so it does not get reintroduced. There is no
need to gate features on host detection or to keep an ES5-compatible fallback
path:

- The engine is QuickJS-ng, so `tsconfig.json` targets `ES2023`.
- Every one of the 52 documented raw APIs is present, so guards around optional
  natives are not needed for new code. `checkFunction()` is gone; the one native
  newer than the rest, `publishStats`, is reached behind a plain
  `typeof publishStats === 'function'`.
- `Tsum.screenshot()` captures at quality 100. It was on 80 only because
  Robotmon compressed there, and that compression was moving colour probes by
  far more than their thresholds allowed.
- There is no hardcoded `BOOTCLASSPATH` prefix on shell commands. The host's
  shell environment already carries a correct one, and the old hardcoded value
  named jars modern Android no longer ships — which made `uiautomator dump`
  abort every time.

Deploy targets **`sdcard/Download/GameAutomationPlatform/scripts/...`**. That is the one
folder Game Automation Platform reads; it used to cross six parent directories
with `Robotmon`, `AutoGameAssistance` and `GameAutomationPlatform`, and no longer
does. A tree somewhere else is reachable only by starting its service with
`--root=`.

One thing that looks like a Robotmon leftover but is not, so leave it alone:

- **`getScreenshotModify`'s JPEG round-trip** still exists in the host and is
  still wanted by anything matching against templates captured through it. Only
  the colour-probe path was moved off it.

Performance note, so it does not get re-litigated: `async`/`await` buys nothing
here. The host has no timers, no workers, and every native call is synchronous
and blocking — there is nothing to await. Script-side JavaScript is around 1% of
a detection sweep; the cost is in captures and native image work.

**This is a Windows checkout, so do file work with the Read/Edit/Write/Grep
tools, not with `cat`, `sed`, heredocs or `grep` through Bash.** Those tools
talk to the filesystem directly, with no shell quoting layer in between. Three
things bite otherwise, all verified here:

- Git Bash drops a carriage return written as `$'\r'` inside `$( )`. So
  `c=$(grep -c $'\r' "$f")` silently runs `grep -c ''`, which matches every
  line and reports a pure-LF file as fully CRLF. Other escapes (`\t`, `\x41`,
  sed backreferences) survive; this one does not.
- A Windows path is a string of shell escapes: `d:\Projects\...` arrives as
  `d:Projects...`, and a regex backslash has to survive both the shell and sed.
- Reaching for PowerShell instead is the wrong fix. It handles paths natively,
  but `Set-Content`, `Out-File`, `>` and here-strings all terminate lines with
  CRLF -- straight back into a tree pinned to LF. Only
  `[IO.File]::WriteAllText` writes what it is given.

Line endings are LF, fixed by `.gitattributes` (`* text=auto eol=lf`) and
`.editorconfig`, with `core.autocrlf` off locally. Note that `text=auto` will
not renormalize a file whose committed blob already has CRLF — that is git's
anti-churn guard, and clearing it needs the working tree converted by hand.

Automatically commit changed files with a succinct message.
Update the CODEMAP.md whenever it makes sense to. Such as when architectural updates are made, or new features, etc.
Don't run the build process if it's not necessary.
Comments by Claude should not be so verbose. It should be concise with enough information that a junior developer should be able to understand.
Keep CHANGELOG.md very succinct and easier to read without losing the main points.
File every entry under `## [<the version in package.json>]` — there is no
`[Unreleased]`, and a version bump is what opens the next section. That section's
`### Summary` block is the user-facing changelog and is what ships as the release
note: one line per *feature* — not per change — and only what a player sees or
interacts with. A new skill is "Coronation Day Elsa skill added"; later work on
it folds into that same line as "Coronation Day Elsa skill improved by making
clears faster". Implementation detail, refactors, tooling, docs and build
machinery all go in the sections below it.