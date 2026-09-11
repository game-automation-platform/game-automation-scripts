---
title: Test without a device
description: The Node stand-in for the host, the golden traces, and the checks the build runs.
---

# Test without a device

Almost everything about *what the script decides* can be checked on the PC in
seconds, because the built bundle is a classic script with everything at
global scope, and `tools/runtime/` can load it into a Node vm with the host's
natives shimmed underneath. What runs under test is the production code, not a
copy of it.

## The host shim

`tools/runtime/load.js` evaluates `build/index.js` in a vm; `host.js` shims
the ~15 host primitives under it — captures off a PNG, colour reads, template
matching, taps that record rather than tap — faithful to the app's own
semantics. Every offline tool, here and in the development toolkit, goes
through this pair.

```js reference title="app.gap.Tsum/tools/runtime/load.js"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/tools/runtime/load.js#L82-L143
```

Driving anything is a few lines: `createRuntime()` gives you the context and
the host, `createTsum(ctx, host, frame, meta)` a `Tsum` positioned for one
captured frame (a PNG plus an optional geometry sidecar). From there
`ctx.gPages.sweep(...)`, `ts.isFeverTime()`, `ts.scanBoardQuick()` or a
watcher you are writing run against the real frame with the real code.

The shim rebuilds the bundle when a source file is newer than it, so a test
run needs no separate build step.

## The dispatch and scheduler traces

`npm run dispatch:eval` answers **whether a change to one page changed what
happens on another**. For every `Page` entry × navigate goal × kind of look,
it sets the router's state, builds the event and runs the real queue over a
`Tsum` whose leaves are replaced: a tap records `["tap", x, y]`, a sleep
records and moves a fake clock, a settle records and moves nothing. The
scheduler half builds a run off each preset in `tools/dispatchEval/presets/`
with the real `buildRun` and drives `tick()` under the fake clock. Both traces
are pinned in `tools/dispatchEval/golden/`.

```bash
npm run dispatch:eval                      # compare; exit 1 on any changed row
npm run dispatch:eval -- -v                # every changed row, in full
npm run dispatch:eval -- --only StartPage  # rows whose id contains this
npm run dispatch:eval -- --dispatch        # or --scheduler, for one half
npm run dispatch:update                    # rewrite the goldens, then read the diff
```

Invariants are checked on every row whatever the golden says: no image
handle left open, no dispatch re-entered from a subscription, no navigate
handler run without a goal, nothing but `notify` after something acted, no
tap on a transient page with its window still to run, and the forecast's pick
agreeing with the subscription that acted.

**The diff `dispatch:update` produces is the review.** A row that moved for a
page the change was not about is exactly the failure the tool exists for.

## The checks the build runs

| Command | Catches |
|:--|:--|
| `npm run typecheck` | A method not declared in `interface Tsum`, a `UiText` with no English, a `TaskName` without a body or a label, a misspelt enum member. |
| `npm run pages:docs:check` | `PAGE_DISPATCH.md` is stale; also a page no handler can leave and an `after` naming nothing. |
| `npm run events:docs:check` | `EVENTS.md` is stale; an emit outside `Emit`; one event with two payload shapes. |
| `npm run dispatch:eval` | A dispatch or scheduler row changed. |
| `npm run live:check` | A setting a preset carries with no `LiveSettings` answer, an answer with no `case`, a value that does not survive the round trip, a held key that writes the world anyway. Drives the built bundle rather than reading it. |
| `npm run map:check` | `CODEMAP.md` names a path that does not exist, a source file or tool nobody listed, a name family that escaped its file, a script not in the command table. |
| `npm run i18n:check` | What each language is missing; a `data-i18n` naming no key. |
| `npm run build -- --verify bundle` | The shipped `dist/index.js` still has every name the bridge reaches by name, evaluated under the shim. |

`npm run build` runs the doc and check steps as *optional* — findings are
printed and never block — except `live:check`, which is required.

## The pages in a desktop browser

`build/index.html` (the settings page before inlining) opens in any browser
from `file://`; without the host bridge the clipboard falls back to the share
box and the live-settings poll finds nothing, which is what the
feature-detection is for. The Quick Bar has a staged preview the development
toolkit can produce, with a stand-in engine behind it.

The desktop browser is not the device's engine. The emulator's WebView is
**Chromium 110**, and it measures a flex container's intrinsic width from what
its items contain: a bare `flex-basis` counts for nothing, and a percentage
`max-width` inside a content-sized box resolves to nothing. A strip that fits
on the desktop can come out with its buttons clipped on the device. Give a
fixed-size flex item a `width`, and when a layout change matters, check it
under that engine — a Win64 snapshot of 110 run headless with `--screenshot
--window-size=360,62` draws the strip the way the device does.

## What needs a device

Anything about **pixels the shim has not seen**: a new fingerprint against
frames the corpus does not hold, a colour threshold, an animation's real
duration, a drag the game refuses when drawn too fast. The development toolkit
holds the corpus and the detection regression (`pages:eval`, `pages:calibrate`,
`pages:audit`); a fingerprint change is not finished until that has run, and
it is the only place a probe threshold should be raised.

On the device, the tools you have are the log (*Debug logs* on), the annotated
screenshots and page-history frames *Debug game* saves under `tsum_record/`,
*Collect unknown screens* for a screen nothing fingerprinted, and the issue
report — the screen, the screens before it, the settings and the last few
hundred records, debug ones included. Press **Report** on the Debug tab or the
Quick Bar, or let the script write one itself when it gives up.

<ImagePlaceholder id="report-folder" alt="The contents of one report folder under tsum_record/reports: the screen, the trail frames, the manifest and the log excerpt" />

Before believing a behaviour report, confirm what is on the device: which
build (`ScriptVersion` in the log's `run.start`), which settings (the
`round.start` payload), and which screen (the page-history frames). A
"doesn't work" is nearly always a different build, a different setting, or a
screen the script has never seen.
