# Development Guide

Orientation for anyone touching the source. For what the script *does* and what
each setting means, see [README.md](README.md); for the one-page index of the
whole repo -- which file owns what, and which document answers which question
-- see [CODEMAP.md](../CODEMAP.md).

## Where this came from

This package was forked from `com.r2studio.Tsum`, a Robotmon script, and its
behaviour was held identical to that original's for a long time so the two
could be run side by side. **That relationship is over**: there is no upstream
checkout, no port tooling and no parity ledger any more, and nothing here is
owed to what that project does now. What is left is the reason a few values
look arbitrary — they were measured against a working script rather than
derived — so prefer a measurement to a tidy-up.

Two of those are worth naming, because both are tempting to adjust and neither
has its reasoning anywhere near the code that would be changed:

- **The drag timings in `linkTsums` (10/10/10 ms).** A chain is drawn as a
  touch-down, a run of moves and a touch-up, and the game drops tsums out of a
  chain that is drawn too fast. `DRIVING_SCREENS.md` § 5 is the general form of
  the problem.
- **`taskTsumAppRestart` inlines its restart** rather than calling
  `forceRestartApp()` (`dialogs.ts`). The two are not the same job: the helper
  is the stall-recovery path, gated on "Auto launch app" and always
  relaunching, while the task is a scheduled restart that navigates to a known
  screen at both ends.
## The one thing to understand first

**There are no imports and no modules.** Every `.ts` file under `src/` is
concatenated, in the order listed in `tsconfig.json`, into a single
`build/index.js` that the host app loads and runs. All files therefore share one
global scope: a `function` or `var` declared in `data.ts` is simply visible in
`play.ts`, with no import statement anywhere.

Two consequences worth internalising:

- **Order in `tsconfig.json` matters.** Anything that *executes at load time*
  (top-level assignments like `var SkillHandlers = {}`, or the `registerSkill`
  calls in the skill files) must be listed after what it depends on. Function
  declarations hoist across the whole bundle, so *calls made at runtime* are
  order-independent — only load-time work is sensitive.
- **Name collisions are silent.** Two files declaring the same symbol will not
  error; the later one just wins. This has bitten the project before: a bad
  merge restored an old monolithic `index.ts` alongside the split files, and
  because `index.ts` is concatenated last, its duplicate definitions silently
  overwrote everything else. Which is why `index.ts` is kept thin — it is
  concatenated last, so anything living there can quietly overwrite anything.

## The second thing: how `Tsum` is typed

`Tsum` is a `class` in `tsum.ts`, but **every one of its methods is attached
from outside the class body** as `Tsum.prototype.NAME = function ...`, spread
over twenty-odd files. That is forced by the point above: with no modules, a
class cannot be reopened, and splitting the object across files is the whole
reason the package is not one enormous file -- `tsum.ts` itself was that file
until the chores moved out into `play.ts`, `mail.ts`, `hearts.ts`, `levelCap.ts`
and `boxes.ts`.

The two halves are joined by **declaration merging**: `interface Tsum` in
`globals.d.ts` declares every one of those methods, and TypeScript merges the
interface into the class of the same name. What that buys:

- `ts.foo()` and `this.foo()` are checked, completed and find-referenced across
  the whole bundle. Before this, `ts` was `any` and none of that worked.
- Inside each `Tsum.prototype.NAME = function (...)`, **`this` and the
  parameters are contextually typed from the interface** — which is why those
  97 assignments carry no annotations of their own and should not grow any.
- `Tsum.prototype.typo = ...` is an error, so a method cannot be defined under a
  name that nothing calls.

**Adding a method to `Tsum` therefore means adding its signature to
`interface Tsum` as well.** That is the one piece of bookkeeping the arrangement
costs, and the compiler tells you immediately when you forget it.

The same idea, one level down, is why `Button`, `Page` and `Logs` in `data.ts` /
`logs.ts` carry **no type annotation**: an annotation like `{[k: string]: any}`
erases the key set, and with it `Button.gameSkill1`'s go-to-definition and any
chance of catching `Button.gameSkil1`. Inferring the object literal keeps both.
`Page` uses `satisfies PageMap` so each entry is still validated against
`PageDef` without losing its keys, and the loops that walk the table by string
key cast to `PageMap` for an index signature.

## The third thing: the string vocabularies are `const enum`s

Object keys are only half the story. Several *values* are passed around as bare
strings and are what most of the branching actually tests. Each set is a
`const enum`, and the code refers to members rather than writing the string:

| Enum | Declared in | Ties together |
|:--|:--|:--|
| `PageName` | `data.ts`, directly above the `Page` table | `PageDef.name`, the keys of `PageProfiles` and `NavPlans`, `gPages.detect()`'s return, `gPages.matches()`, every subscription's `pages` / `goals` list, `checkStall()`, and the ~33 `page === PageName.X` comparisons |
| `SkillType` | `shared.d.ts` (both compilations need it) | the Skill Type dropdown in `settings.ts`, `Settings.skillType`, `ts.skillType`, every `registerSkill({types: [...]})`, and the play-loop comparisons |
| `SkillReadiness` | `globals.d.ts` | `checkSkillReadiness()`'s return and its three callers |
| `KeyCode` | `globals.d.ts` | the `keycode()` host call |
| `SettingKey` | `shared.d.ts` (both compilations need it) | every name a setting has: the `key` of a row in `settings.ts`, its slot in `SHARE_SLOTS`, the lookups the Run order card does, its column heading in the round-stats CSV, and the field `start()` reads. `interface Settings` is *keyed by* these members, so the enum and the shape that crosses the bridge are one list, not two |
| `RowKey`, `Locale` | `settings.d.ts` (settings UI only) | the rows that hold no value — Run order, the share buttons, the build stamp — and the two language tags stored under `LANG_KEY` |
| `RecordKey` | `shared.d.ts` | the keys of record.txt, read on both sides |
| `Log` | `logEvents.ts` (both compilations need it) | every `event` name written by either program: the four loggers' first argument, the keys of the log catalogues (`logsEn.ts` and the translations beside it), and `LOGGING.md` § Components. A namespace of `const enum`s, one per component, so it reads `Log.Play.GameOver` |

**Why `const enum` and not a `const` object.** A const enum is erased at compile
time: `page === PageName.GamePlaying` emits `page === "GamePlaying"`, so this
costs nothing at runtime -- no object, no property read -- while giving each
name one definition to jump to, find references on, and rename. It is also the
only kind of shared constant that *can* span the two compilations: the settings
WebView and the device script are separate JavaScript runtimes that share no
memory, so a runtime object in `shared.d.ts` would have to be duplicated into
each bundle. A compile-time-only one does not exist at runtime at all.

**What this does and does not prevent.** A misspelt name is an error everywhere:
on the enum (`Property 'GamePlayng' does not exist ... Did you mean
'GamePlaying'?`), in a `Page` entry, and in a comparison against a raw string
(`types 'PageName' and '"GamePlayng"' have no overlap`). What it does *not* do
is forbid a **correctly spelled** raw string -- TypeScript deliberately allows
comparing a string enum against a literal of the same value, so
`page === 'GamePlaying'` still compiles. The enum makes wrong strings
impossible, not raw strings. Banning the raw form outright would be a lint rule
(`no-restricted-syntax`), not a type.

`Log` is the same trick one level out: `const enum`s cannot nest, so the
components are separate enums inside a namespace, and the namespace is erased
along with them. A third segment folds into the member name --
`Log.Skill.TiaraNoDream` is `'skill.tiara.noDream'`.

Adding a page, a skill or a log event means adding a member; the compiler says
so immediately, and `Did you mean ...?` usually names the fix.

Several `PageName`s map to more than one `Page` entry -- alternative colour
fingerprints for the same screen (regional, emulator and dpi variants).
`RootDetection` has eight. That is why the enum is written by hand rather than
derived from the table's keys: the keys are fingerprints, the names are screens.

`PageName.Unknown` and `SkillType.Unset` are the two members with nothing behind
them: the first is what `findPage()` reports when nothing fingerprinted, the
second is what the `Tsum` constructor holds until `start()` reads the setting.

> **If the build ever moves off `tsc`** (see [Building](#building)): ambient
> const enums declared in a `.d.ts` are the one construct a transpile-only
> bundler such as esbuild cannot inline, because it never reads the `.d.ts`.
> `PageName` and `Log` live in `.ts` files and are fine; `SkillType`,
> `RecordKey`, `SkillReadiness` and `KeyCode` would need moving into a `.ts`
> file (or becoming `as const` objects) as part of that migration.

## How it runs on a device

```
The host loads the script folder
        │
        ├── index.html ──► settings.js   (the settings UI, a WebView page)
        │                      │
        │                      │  user taps ▶ Play
        │                      │  onEvent('OnPlayClick') builds a settings object
        │                      │  and calls JavaScriptInterface.runScript(...)
        │                      ▼
        │              start({ jpVersion: false, skillType: 'burst', ... })
        │
        └── index.js ──────► start() in index.ts
                                 │
                                 ├─ new Tsum(...)              the game-playing object
                                 ├─ new TsumTaskController()   the scheduler
                                 ├─ gTaskController.register(...) per row of runTaskTable()
                                 └─ gTaskController.start()    ──► blocking loop
```

The settings UI and the game script are **two separate JavaScript worlds**. They
never share memory; the only channel between them is
`JavaScriptInterface.runScript(<source string>)`. That is why `start()` receives
its whole configuration as one JSON-serialised argument rather than reading it
from anywhere.

Once `gTaskController.start()` is called, `loop()` runs until stopped: on each
`tick()` it takes the first job that is due -- lowest `JobPriority`, then the
name, and every job's priority is distinct, so the order among due jobs is the
table's and nothing else's -- and runs it to completion. Tasks are cooperative
— a long one like `taskPlayGameQuick` blocks the loop for the whole game, so
nothing else runs meanwhile. Which jobs there are is `runTaskTable`
(`src/runPlan.ts`), one table the settings page's Run order card reads as
well; `npm run dispatch:eval` drives `tick()` over it under a fake clock and
pins the order the jobs really come in.

Tapping ⏹ Stop calls `stop()`, which clears `ts.isRunning` and drains the
controller. Because tasks are cooperative, that takes effect at the next task
boundary — a game already in progress plays on until its loop notices.

Opening the settings panel no longer does: `OnSettingClick` is a no-op in
`settings.ts`, and the host pauses the run instead. A paused engine parks
`sleep()` and every touch injector, so the script cannot tap the panel drawn over
the game, and closing the panel resumes exactly where it was. Play with the panel
open is what ends the run — it sends `start()` with the settings on screen, and
`start()` winds the old run down itself.

### The two threads, and who owns the world

`start()` does not return while the script runs, so **every `stop()` runs on a
second thread while `start()` is still on the stack.** The host dispatches each
`runScript` eval on its own pool thread, and the engine hands the interpreter
lock over at every `sleep()`, so the two interleave at every sleep boundary —
including the ones inside a task.

That is why `stop()` tears nothing down. It sets `ts.isRunning = false`, drains
the controller, and then *waits* (up to `StopWaitMs`) for the run to say it has
finished; the run dismantles its own world in `start()`'s `finally`, through
`endRun()`. `gRunActive` is the flag they hand back and forth, and
`gStopRequested` covers the gap where a stop arrives while a run is still being
assembled — the controller it flagged is not the one being built.

The version before this one cleared `ts` and detached `gPages` from inside
`stop()`, which pulled the world out from under a loop that was still using it:
the running task's next detect threw "PageRouter is not attached", and when the
loop finally handed back, `start()` finished on what is now
`logInfo('task.loopStopped')` -- then `log(ts.logs.TaskControllerStop)` -- with
`TypeError: cannot read property 'logs' of undefined`. Pressing Play then
built a second world over the wreckage of the first, which is what made a
changed setting look like it needed the whole script reloaded.

## File map

Which file owns what is
[CODEMAP.md § Source map](../CODEMAP.md#source-map--src), checked against the
tree by `npm run map:check`; the depth behind any one row is that file's own
header comment. This section used to hold a second copy of that table and
drifted out of date against it — it still placed `TiaraLayouts` in `data.ts` a
release after that table moved into `skills/tiaraMinniePlus.ts` — so there is
one table now. Skills are covered in
[the skills section](#skills--srcskills) below.

Non-TypeScript files: `index.html` / `index.css` (the settings page shell and
its `<template>` library) and `quickbar.html` / `quickbar.css` (the Quick Bar's
whole appearance), all four inlined at build time; `build.sh` / `build.ps1`
(wrappers over `tools/build/`), `debug_deploy.ps1`, and `config.json` (the
release identity — see [Releasing](#releasing)).

### The settings page

Three levels, and each is a piece of the layout: a **tab** is one button in the
tab bar, a **group** is one card in its panel, and a **row** is one setting. Only
rows carry state, and `settings.ts` flattens the tabs into a `settings`
(group → row) array that everything else — persistence, share codes,
`genStartCommand` — works from. **Moving a row between tabs is therefore
cosmetic**; what is not is its `key`, which is the contract with `start()`, and
its position in `SHARE_SLOTS`, which is the contract with every share code in
circulation.

`settings.ts` opens with `/// <reference>` lines that exist only for editors: a
TypeScript server finds `tsconfig.json`, which *excludes* this file, so without
them it checks `settings.ts` as a single-file project and flags every shared
type as undefined. The build never needs them.

The last tab is **Debug**: build date, `debugLogs`, `debugGame`,
`collectUnknownScreens`, `pageHistoryDepth`, and the reset button, which
`selectTab` shows on this tab and no other. These were `dev_mode` rows, hidden
until the build-date row had been tapped ten times — a gesture nobody could
discover, gating the rows you want *because* a run has already gone wrong. The
flag is gone; a pasted code still cannot switch on someone else's logging,
because a code carries `SHARE_SLOTS` and no debug row is on it. `neverShared`
survives as the assertion rather than the mechanism — `checkShareSlots` reports
a slot that names one, and on a shared tab it is the row saying it was left off
on purpose.

Structure lives in `index.html` as one `<template>` per piece, and `settings.ts`
clones one and sets `textContent`. Nothing builds an HTML string, so a title
cannot be read as markup. The contract between the two halves is the class names
(`.row-title`, `.row-control`, `.step`, `.share-code`, …), looked up with
`querySelector` rather than by position, so re-nesting anything inside a template
is safe.

Styling is [Pico CSS](https://picocss.com), copied out of `node_modules` at build
time and inlined — **never a CDN**: the page is opened from `file://` on a device
that is often offline, so an asset it has to fetch is an asset it does not get.
`tools/inline/inline.js` is what folds `pico.css`, `index.css` and `settings.js`
into the single `dist/index.html`. The theme is Pico's `data-theme` on the root
element: the page opens in whatever `prefers-color-scheme` says, keeps following
the device, and stops following it the moment the toggle in the app bar is used.

#### The page runs in an overlay, which costs it two browser habits

The host shows this page in a WebView inside a `TYPE_APPLICATION_OVERLAY`
window, owned by a Service. There is no Activity behind it and the document has
no URL of its own, and both of those take away something a page normally has:

- **No native popup can open.** Chromium asks its `WindowAndroid` for an
  Activity before it will show a `<select>` dropdown, gets `null`, and returns
  without a word — no exception, no console message, nothing in logcat. A
  `<select>` therefore renders perfectly and does nothing at all when tapped,
  which is why `buildSelect` builds a button and a list of its own instead. The
  same is true of `alert`, `confirm` and any other native picker: do not add
  one.
- **`location.reload()` navigates away.** The page arrives through
  `WebView.loadDataWithBaseURL`, whose base URL is the *script directory*, so
  that is the document's address. Reloading it loads the directory — a file
  listing whose helper script is not injected here, which is to say a blank
  white page and three `Uncaught ReferenceError: addRow is not defined` in the
  log. This is why changing the language calls `renderPage()`: there is nothing
  to reload, because the page is the whole application. Anything that wants the
  page redrawn should redraw it.

`renderPage` is safe to call at any time precisely because rows keep their live
value in `setting.default` — every control writes it on change — so rebuilding
the DOM loses nothing. What it does not rebuild is the app bar and the footer,
which are static; `localiseChrome` re-labels those.

#### Recording a change waits; making one does not

A change is cheap to make and expensive to record: writing reads every control on
the page, rewrites the whole stored object and rebuilds the Run order card, and a
stepper held down fires one change per tap. So `saveSettings` only *schedules* —
`flushSettings` is what writes, 300ms after the last change, or after
`SAVE_MAX_WAIT_MS` (2s) if the taps keep coming, so a long burst still lands
something on the way through.

Only the recording waits. `setting.default` is the live value and the control
writes it itself, so a share code, a start command and a `renderPage()` all see
the change straight away — which is also why `startSettings` reading the controls
rather than the store means a run started mid-wait is started on the right
values. What the wait must not outlive is the panel: Play, `askUnlockLevelsNow`,
`askBuyBoxesNow` and the page being hidden all call `flushSettings` first, and
`resetSettings` *cancels* it, since a pending write is a write of the values
being thrown away.

#### Three copies of a setting, and how they stay one

While a run is on, a setting is written down in three places: this form, the
world the script is playing under, and the Quick Bar's strip, which draws from
that world. They used to drift the moment either page was touched, because
nothing read anything back — this page reads `localStorage` once, at load, and
is never reloaded, since the host hides and shows one long-lived WebView. So a
value changed in the strip stayed invisible here, and Play then started the next
run on what this form was still showing, quietly undoing it.

They are kept in step through the running world, the one thing both can see:

- `flushSettings` hands the whole saved form to `applyLiveSettings`
  (`src/index.ts`) — see below;
- `pullLiveSettings` reads `quickBarState()` back, on the nudge below, on the
  way onto the screen (`visibilitychange`) and every `LIVE_POLL_MS` while there,
  because the strip and this panel can be up together — the strip is live
  exactly when this page is, since both need the run paused. `onLiveSettings`
  hands what comes back to `takeSettingValues`, which moves the rows it names
  and writes the store, and is what makes the three converge rather than take
  turns.

Every reason *not* to read is inside `pullLiveSettings` — no bridge, nobody
looking, or a save of this page's own still waiting, which is newer than any
answer it would get. `onLiveSettings` additionally leaves alone whatever control
has focus, so a field being typed into is never overwritten under the hand.

**Nobody looking is a reason to skip the poll and not the nudge**, which is why
`pullLiveSettings` takes a `force`. The strip is worked with this panel closed —
that is what a strip on the screen's edge is *for* — so the panel is hidden in
exactly the case the nudge exists to serve, and dropping it for want of an
audience left the form showing the pre-strip values until something else brought
it back on screen. Play then started the next run on those, which is the drift
above arriving by a second route.

**And when the run has gone, the store is the copy that survives.** The strip
patches `StorageKey.Settings` as it applies (`qbRemember`), so a change made in
the strip and then stopped lives on there and nowhere else — this page read that
entry once, at load. `onLiveSettings` therefore falls back to `takeStoredSettings`
whenever the answer says `active: false`, which is the same `takeSettingValues`
over the store instead of over the world. Without it, a change made in the strip
and then Stopped is thrown away at the next Play: `genStartCommand` builds its
command from the controls, and the controls never heard.

`takeSettingValues` writes the store itself (`recordSettings`) rather than going
through the debounced `saveSettings`, and does not push what it wrote back at the
run. Both follow from where the values came from: the run and the store are the
two things that can be *newer* than this form, so there is nothing to tell the
engine — and a save left pending is precisely what `pullLiveSettings` refuses to
read over, so scheduling one would drop the next nudge on the floor and then
write this form over the store the strip had just patched.

##### The nudge, and why the poll is still there

The two WebViews *can* reach each other, through the host: both are in the app
process, each with an `evaluateJavascript` target of its own, so
`JavaScriptInterface.broadcast(topic)` is the host handing one page's message to
the other as `onGapMessage(topic)`. A page never receives its own.

That is what decides *when* the read above happens. Whichever page has just had
a change confirmed sends `PageMessage.LiveSettings`, and the other reads the
world at once instead of up to `LIVE_POLL_MS` later. Both ends are one line:
`onLiveSettingsApplied` here, `qbNudgePages` on the strip.

Three things about it are deliberate:

- **It carries no values.** The engine is the authority on what a setting is set
  to — it clamps, and a skill can hold another setting off — so a page that
  hears one re-reads `quickBarState()` rather than believing what arrived
  sideways. A message carrying values would be a fourth copy to keep in step
  with the three above, which is the problem, not the fix.
- **It is sent after the engine confirms, not beside the write.** The host
  dispatches `runScript` onto a pool and returns, while `runScriptCallback` is
  answered when the evaluation is done, so only the second orders a nudge behind
  the write that caused it. `pushLiveSettings` therefore switches to the
  answered call when a `broadcast` is there to follow it, and the strip nudges
  from `onQuickBarApplied` once `qbInFlight` reaches 0 rather than from
  `qbFlushApplies`. Nudging beside the write lets the read overtake it and draw
  the value it was already showing — the original bug, arriving intermittently.
- **The poll stays, as the floor rather than the mechanism.** The nudge is the
  host's, so a desktop browser and the Quick Bar preview have none and fall back
  on it; and the engine moves settings nobody tapped — a clamp, a skill holding
  "Link MyTsum first" off — with no way to announce it. Every caller
  feature-detects `broadcast` for the same reason the clipboard pair is
  feature-detected.

There is a second topic, and it exists because one of the three copies can move
without the run. `PageMessage.Presets` means *a preset was saved, deleted or
loaded* — and a preset is a whole form, most of which no run can take live, so
what it moved is the **store**. The settings page therefore answers it with
`takeStoredSettings()` before `pullLiveSettings(true)`: the store for everything,
then the run for the rows it clamps. `LiveSettings` alone would have the panel
push its own stale values back over half the preset at the next save. See
*The one control that is not a setting*, below.

There is no socket and no port in any of this. Everything it needs was already
there — two WebViews in one process, a bridge object each — so the host side is
a fan-out that skips the sender (`broadcastToPages`, `FloatingWindowService`).

**The engine owns the list of what is live.** `applyLiveSettings` is handed the
whole form and takes only the keys `quickBarApplyOne` (`src/quickbar.ts`) knows
— the same switch the strip's own changes go through — ignoring the rest in
silence, which is most of the form: a run reads it once in `buildRun` and only a
fresh `start()` can change it. Nothing on the page keeps a second list to fall
behind that one. It also applies only what *differs* from `ts.settings`, because
re-applying is not free: picking a skill lifts the previous skill's hold on
"Link MyTsum first", and setting the between-rounds delay re-bases a rest
already running.

**Most of what it takes lands at the next round, and that is the default.** The
strip is opened over a round that is *paused*, not one that has ended, so a
setting the round was **set up** under cannot be changed halfway through it —
only decided again for the next one. Written straight onto a board already dealt
it does not switch the round over; it leaves the play loop reading that board
under rules it was never dealt under, which is a round that goes wrong rather
than a round that changed — a scan short of a colour finds no chain worth
linking.

So `LiveWhen.NextRound` is what a setting gets unless it argues otherwise:
`quickBarApplyOne` sets it aside in `ts.pendingSettings` and
`quickBarApplyPending` empties that at the whistle, before the walk that opens
the pre-round screen. `LiveWhen.Now` is earned by being **read fresh, during
play, by the pass that wants it** — so a board already dealt is not being
reinterpreted, it is simply played differently from the next scan on. Of the
twenty-three rows a preset carries:

| | Rows | Why |
|:--|:--|:--|
| `Now` (11) | `maxChain`, `maxChainsPerScan`, `linkReachPercent`, `prioritizeMyTsum`, `useFan`, `bubbleStrategy`, `skillWaitingTime`, `skillAutoTap`, `noSkillLastFeverSec`, `skillLevel`, `roundDelayMinutes` | each has a read site inside the play loop, per scan or per activation. `LiveSettings` names them one by one. `roundDelayMinutes` is the odd one — it governs the gap, so there is no round to be halfway through, and `quickBarSetRoundDelay` deliberately re-bases a rest already running |
| `NextRound` (10) | `skillType`, `lorcanaCard`, `bonus5to4`, the five other bonus items, `trackRoundStats` | the round committed to all of them before it began. The items are read only by `openRound`'s item screen, which is the next round's; `skillType` and `lorcanaCard` are the tsum on the board; `bonus5to4` is an item *and* `uniqueTsumCount`; and a stats row is opened at the whistle, so flipping the flag mid-round writes a partial row or drops a begun one |
| `Restart` (2) | `autoPlayGame`, `clickAssist` | they decide which tasks a run registers |

The three Box Buying rows are `Now` and are not preset rows: the sweep re-reads
them when it runs, which is between rounds by definition.

Two consequences worth knowing:

- **The pages still draw the new value straight away.** `quickBarState` reads
  every held-back key through `quickBarAsked`, so what a page shows is what was
  asked for rather than what the round is still playing under. The engine also
  banners *"Applies at the next round"*, because otherwise a round carrying on
  under the old skill looks like the pick having been dropped.
- **The value is recorded on `ts.settings` when it is set aside**, not when it
  lands. Both directions need that: the settings page pushes its whole form at
  every save and skips a row already at the run's value, so without it the same
  change would be re-sent forever — and setting the value *back* before the
  round starts would be skipped there too, leaving the first change pending.
  The round in progress reads `roundSettings`, its own copy, so the CSV is not
  affected.

`autoPlayGame` and `clickAssist` are `restart`: they decide which tasks a run
registers (`runTaskTable`), so only a fresh `start()` can move them.

#### Why this is a table and not a convention

Three bugs here have been the same bug, and none of them was hard to make. The
Box Buying rows had no `case` in `quickBarApplyOne` and so did nothing until a
restart. Twelve of the rows a preset carries had none either, so
`applyLiveSettings` dropped them in silence — a preset built around a skill
arrived without the bubble strategy that makes it work. And the three above had
a `case` when they should not have. All three failed the same way: **silently**,
on a device, weeks later. Nothing in the type system has an opinion about a
`switch` that is missing an arm, and neither did any check.

So the answer is declared per setting in `LiveSettings` and
**`npm run live:check`** holds the code to it. It runs the built bundle in a vm
and drives it rather than reading it, which is what lets it check behaviour:

| Check | What it would have caught |
|:--|:--|
| `declared` | a `SHARE_SLOTS` row with no answer at all |
| `switch` | the Box Buying bug — declared live, no `case`, dropped in silence |
| `reported` | a live key `quickBarState` does not report, which is the panel pushing its stale value back over it at the next save |
| `roundtrip` | a unit conversion: `skillWaitingTime` is seconds on the form and `ts.skillInterval` is ms, so a state line that forgot to divide has the panel and the run trade values forever |
| `timing` | a `nextRound` key that writes the world anyway, or one the whistle never applies |
| `stable` | a held key that shows one value while it waits and another once the whistle has run it through its `case`. `quickBarSetAside` cannot clamp — a range lives in one `case` each — so a held key with a range would change under the pages after they had drawn it |
| `whistle` | `playRound` no longer calling `quickBarApplyPending`, which would strand every held setting with every other check still passing |

`timing` needs no per-key knowledge, which is what makes it worth having: it
snapshots every primitive on `ts` and on `Config`, applies the setting, and
looks at what moved. Every live case writes one of those.

What the check cannot decide is **which** of the three a new setting is. That is
a judgement — *does a pass read this during a round, against a board that was
dealt before the change?* — and all this does is make the judgement something
that has to be written down, next to the `case`, where a reviewer sees it. What
it does do is put the burden on the dangerous side: `NextRound` is the default,
`Now` is the one that has to name a read site, and `quickBarHoldsBack` is
written as *not `Now`, not `Restart`* so an entry that is neither is held rather
than written.

### The Quick Bar page

A second page in the same overlay, in a strip of its own on the screen's bottom
edge -- under the log HUD, over the status line, and under the row of buttons the
game keeps along its own bottom, which is what lets it stay up during a round.

**The strip's height is not a constant.** The host shares that band with the
status line and pushes what is left through `onGapState`'s `stripHeight`;
`qbSetStripHeight` puts it in `--qb-h`, and every vertical size in `quickbar.css`
is a count of `--qb-vs`, the ratio of that to the 62 the page was drawn at. One
step is not a ratio and so is a flag: below 48 the chips put a name beside its
number instead of above it (`data-dense`, *a short band* in the stylesheet),
because a shorter row cannot hold two lines at any type size.

The page does not rely on being told. `qbMeasureStrip` reads the same number off
`window.innerHeight` on load and on every resize, and the two agree -- the window
*is* the band, except while the skill sheet is open, when the host grows it on
purpose and the push is the only thing that still knows. Both routes exist
because a missed push is not a mis-sized strip but a clipped one: the page lays
out at 62 in a window of 39 and the whole top row goes off the edge with nothing
on screen to say so. `.qb` is capped at `min(var(--qb-height), 100%)` as the last
guard under both.

It is a **third compilation** (`tsconfig.quickbar.json` → `dist/quickbar.html`). The host
finds it by name: `quickbar.html` beside `index.html`, and a script without one
simply has no Quick Bar button.

It is built the opposite way round from the settings page, on purpose. There the
schema is the source of truth and `settings.ts` renders it; here **the markup is**
— every control is written out in `src/quickbar.html` with a `data-key` naming
its `SettingKey`, and `quickbarPage.ts` finds them by that attribute and does
nothing else. Moving a cell, adding one, restyling the lot needs no change to the
script, which is the whole point of a strip whose layout wants to be iterated on.
The three things it does rely on are listed at the top of the HTML.

The two halves of a change are both needed:

- `quickBarApply()` (`src/quickbar.ts`, in the *game bundle*) writes the value
  onto the running world — the same field `buildRun` would have written it to,
  and onto `ts.settings` beside it. Nothing is rebuilt, so the round, the
  round-stats row and the coin averages survive. Only settings with a live field
  to write belong in the strip.
- The page patches `StorageKey.Settings` in `localStorage`, which is the settings
  page's own entry — both pages are `file://` documents in one WebView origin —
  so the next `start()` does not hand back the value that was just changed.

A third follows once the engine has answered the batch: `qbNudgePages` tells the
settings page to read the running world, so the form on screen moves at the
change rather than on its own poll. The store above is what the *next* run
starts from; this is what the panel is showing now. See *The nudge, and why the
poll is still there*, above.

`quickBarApply` is a thin shell over **`quickBarApplyOne`**, which is where a
live change actually happens, because the settings page goes through the same
switch (`applyLiveSettings`, `src/index.ts` — see *Three copies of a setting*
above). That switch is the one list of what a run in progress will take, so the
strip and the panel cannot disagree about it. Its companion invariant:
**anything `quickBarApplyOne` can take, `quickBarState` has to report.**
`lorcanaCard` is the case that makes it visible — no cell draws it, and it is
still in the state, because the settings page reads that same reply and would
otherwise push its own stale value back over it at the next save. The three Box
Buying rows are there for the same reason: the panel is the only thing that
changes them, and the panel is what reads the state back. A key the switch holds
back for the whistle still counts — the state reports what was *asked for*; see
*Some of what it takes lands at the next round* above.

Both of those wait. `qbApply` draws the tap and queues it; `qbFlushApplies` sends
it 350ms later, one apply per setting at whatever it was last tapped to, and one
localStorage patch for the batch. A stepper held down therefore costs one apply,
one reply and one state read instead of ten of each. A skill pick, a preset being
loaded and the strip being unpaused or taken away flush at once — a deliberate
choice and a closing window are not bursts to wait out.

That inverts where the strip draws from: **the tap, not the reply.** The engine
is still the authority — the `quickBarState()` read after a flush is the running
world, clamp included, and overwrites what was drawn — but a read is now held
while a change is pending or unanswered, and unconfirmed values are laid back
over any read that crosses one (`qbPending`, `qbSent`). Without that a state read
already in the air lands on top of a value the user has tapped past, and the next
tap steps off the old one.

**The dropdown lists are shared files**, compiled into *both* pages, because two
copies drift the first time an entry is added: `src/skillOptions.ts` for the
skills and `src/bubbleOptions.ts` for the bubble strategies. `qbOptionsFor` is
the one place the strip maps a cell's `data-key` to its list, and `qbFillOptions`
draws whichever it is given — so a third dropdown on the strip is a `qbOptionsFor`
entry, a `<div class="qb-cell" data-key="...">` and nothing else.

A bubble entry carries a **`short`** as well as a `title`. The strip's chip is a
few characters wide, where "All Bubbles Mid Chain" is an ellipsis and says
nothing, so the chip draws `short` ("All mid") and the sheet, which has the room,
draws `title`. Two `UiText` keys rather than a truncation at render time: which
words survive is a translation decision.

#### When a change would land, on the chip itself

While a round is being played, `qbRender` gives every `data-key` cell a
`data-when` of `now` or `nextRound`, and quickbar.css draws a bar along the
chip's bottom edge from it — teal for this round, amber for the next. The preset
chip gets `both`, a half-and-half bar, because picking one moves settings of
either kind at once. Between rounds the attribute comes off: the whistle is
seconds away, everything effectively lands now, and there is nothing to explain.

Both facts come from the engine in `quickBarState` — `inRound` and a
space-separated `nextRound` — rather than being worked out here, for the usual
reason: the answer is `LiveSettings`, this page is a separate compilation, and a
copy of that list here would be one more thing to keep in step. Neither is a
`SettingKey`, so the settings page's `takeSettingValues` walks past both exactly
as it does the coin averages.

#### The one control that is not a setting

`.qb-preset` carries no `data-key`, because a preset is a whole form rather than
one row. It therefore goes to the engine as **`applyLiveSettings`** — the
settings page's own entry into `quickBarApplyOne`, so a preset loaded from the
strip and a preset loaded from the panel take exactly the same rows live — and it
patches `localStorage` *first*, since a preset is where the next `start()` reads
from and two of its rows (`autoPlayGame`, `clickAssist`) can only be taken there.
Everything else in a preset lands on the run: most of it now, and the tsum on the
board at the next round.

That is also why its answer broadcasts **`PageMessage.Presets`** and not
`LiveSettings`. `LiveSettings` means "re-read the run", and a settings page that
only did that would take back every row the run never saw at its next save. The
`Presets` topic means "re-read the store as well" — and it doubles as "the list
of presets has changed", which is what the settings page sends when one is saved
or deleted.

A preset is **how a round is played and nothing else** — the same set
`SHARE_SLOTS` names, so the export is one settings code per preset and a line of
it pasted into the share box is the way back in. It is stored as values rather
than as that code only because decoding one needs the settings schema, which the
strip's compilation does not have.

Which preset is loaded is **matched, not remembered** (`presetMatchName`,
`src/presets.ts`). Nothing has to invalidate a label when a stepper moves: the
strip and the panel each compare the stored form against every preset when they
redraw, and the answer stops being a name the moment a value differs. The store
rather than `quickBarState()`, on both pages, because a preset is the whole form
and that reply carries only the live rows.

#### Seeing it without a device

The development toolkit can stage `build/quickbar.preview.html`
here: the same page, with a stand-in engine behind it that answers the calls
and pushes `onGapState` the way the host does. Open it in a browser and the
strip is live, and the query string drives the state (`?state=running`,
`?presets=off`, `?width=320`, `?lang=zh-TW`). Nothing of it is part of a build:
`dist/quickbar.html` is inlined from `src/quickbar.html`, which never names the
fixture — that is why the preview is a staged copy rather than a tag in the
source page.

The desktop browser is not the device's engine. The emulator's WebView is
Chromium 110, and it measures a flex container's intrinsic width from what its
items *contain* — a bare `flex-basis` counts for nothing, and a percentage
`max-width` inside a content-sized box resolves to nothing — so a strip that
fits on the desktop can still come out with its `+` buttons clipped on the
device. Give a fixed-size flex item a `width`, and when a layout change matters,
check it under that engine: a Win64 snapshot of 110 is at
`commondatastorage.googleapis.com/chromium-browser-snapshots/Win_x64/1084030/chrome-win.zip`,
and `chrome.exe --headless --screenshot --window-size=360,62` on the staged
preview draws the strip the way the device does.

#### Pausing pauses the round too

`onPause()` (`src/quickbar.ts`) is a hook the host evaluates **after** it sets
the engine's pause flag, letting that one evaluation through a gate that parks
`tap()` and `sleep()` for everything else. That is when the game's own Pause
button gets pressed, which is what stops the round's clock while the strip is
being used.

The ordering is the entire mechanism, and it is the opposite of the obvious one.
Run before the flag — which is what it did until 0.5 — the press lands while the
play loop is still going, and the loop's next `gPages.detect` sees `GamePause`
and has `dismiss.resumeGame` press Continue straight back: the round carries on
with the script frozen beside it, which is exactly the bug this replaced. The
two threads were also injecting into one touch stream. Frozen first, the hook is
the only thing on the screen.

It still uses `gPages.peek` rather than `detect`, because a broadcast would hand
the frozen play loop a page it never looked at and queue a Continue on the pause
menu it is about to open.

There is no resume hook and none is wanted: the play loop's next
`gPages.detect` sees `GamePause` and `dismiss.resumeGame` presses Continue, the
same as for any other way onto that screen.

`onPause` is the only caller of that button, and the Max Round Duration cap
(`src/play.ts`) deliberately is not a second one: pausing the game stops its
round timer, and both of the cap's actions depend on the round still being able
to time out on its own.

**Nothing a page evaluates may park.** `quickBarState`, `quickBarApply`,
`applyLiveSettings` and `roundDelaySkip` are evaluated *only* while the run is
paused, and the host used to answer them on the thread that also reads its
control socket -- the Resume included. So a gated native inside one (`sleep()`,
a touch) waited on itself: the logger's old spacing sleep did exactly that on
the second of two lines inside 10ms, and a preset or the skill sheet writes two.
The logger no longer sleeps, the host now lets an `Eval` through the gate and
answers it off that thread, and `npm run live:check` fails on any gated call
from an entry point (`entry`). `onPause` is the one exception, and it is the
host that makes it one.

**That handler has to be in the `dismiss` band, and it was in `navigate` until
0.5.** The navigate band is silent when nothing set a goal — which is what stops
a bare `detect()` from tapping the script off the screen it is reading — so a
resume handler there is unreachable from the one caller that ever finds a round
paused. It went unnoticed for as long as a pause could not make a round stick.

The pause menu also leaves the skill button showing over a screen that has
stopped moving, so `checkSkillReadiness` reads "ready" on every look and the tap
that should spend it never reaches the game: `while (this.useSkill(board))` in
`taskPlayGameQuick` spins for ever, and the logger's flood guard drops the
repeats past its burst, so the log shows a "Use skill" every few hundred with a
`dropped` count under it -- which looks like a hang. `useSkill` therefore takes
`GamePlaying` and nothing else — and its own `detect` is what presses Continue,
so declining hands the loop a board rather than parking it.

#### What the stats row records

Six of the strip's settings are also columns in the round-stats CSV, so where
the change lands decides whether the file can be trusted. Two writes, in order:

- `quickBarApply` puts the value on `ts.settings` as well as on the live field,
  below the `switch`'s `default` so every applied key is recorded and no second
  list has to be kept in step. That object is therefore the *current*
  configuration, not the one `start()` was handed.
- `beginRoundStats` copies it into `ts.roundSettings` when a round starts, and
  `writeRoundStats` writes all of its columns — `skill_type` included — off that
  copy.

The copy is what stops a change made during a round being written onto that
round's row as though it had been in force from the whistle. Change +Coin
mid-round and the row for the round in progress still says what it was played
under; the next one says the new value.

## Share codes — `settings.ts`

Copy and Paste on the **Share settings** row move a whole configuration between
devices as one line of text, and the format is built around getting that line
short enough to paste into a chat message — 18 characters for stock settings,
33 for the twelve-change example below:

```
TSUM4-y2f.YiDACgg.K5.T2.U5.Vo.fu~
│     ││  │       └── one field per non-boolean setting that is NOT at its
│     ││  │           default: a slot character, then the value in base36
│     ││  └── all 48 slots, one bit each, six bits per character
│     │└── the script version in base36, for the status line
│     └── one character of checksum over everything after it
└── format marker; the digit changes when the payload shape does
```

Two decisions do the work. Booleans — 28 of the 42 settings — cost a bit each
instead of a name and a value, and anything still at its default is not written
down at all. The second is why **a code is a whole configuration rather than a
patch**: what it omits is *defined* as default, so applying a code resets the
settings it does not mention. Pasting a code reproduces the sender's setup; it
does not merge into yours.

What keeps that honest:

- **`SHARE_SLOTS` is the set, and it is append-only.** It is not a subset of
  what could travel — it *is* what a code carries, and therefore what a preset
  is: **how a round is played**, and nothing else. That is `SHARE_TABS`
  (Gameplay and Skills) less the rows on them that shape the *run* rather than
  the round, which say so with `neverShared` — Auto Play Game, the
  between-rounds delay, Track round statistics, and the Max Round Duration pair
  (how long the run will spend on one round). A setting's position in the
  list is its identity on the wire — the character that names it, and its bit in
  the bitmap — so reordering or reusing one silently turns one setting into
  another in every code in circulation; a setting that goes away leaves `''`
  behind, or is cut outright with a `SHARE_PREFIX` bump. (0.12 cut three slots
  with no bump, which is the one case that needs none: they were appended and
  removed inside the same unreleased version, so no code ever carried them.)
  `checkShareSlots` runs on load and logs a repeated slot, more slots than the
  64 the alphabet can name, a slot naming a `neverShared` row, and — the one
  that catches a real mistake — a row on either of `SHARE_TABS` with neither a
  slot nor a `neverShared`. `bubbleStrategy` is what that mistake looks like: it
  carried `share` ids for two years with no position to use them from, so it was
  in no code until 0.12.
- **The rows outside the set are not touched.** Applying a code puts the rows it
  does not mention back to their defaults, and leaves the language, the chores,
  the mailbox, the hearts, the box buying and the three run-shaped rows exactly
  where they are. A code cannot carry those, so resetting them would be an edit
  made on no evidence — and it is what made a paste unusable for someone who had
  their mailbox set up.
- **The bitmap's length is data.** It says how many slots the sender's version
  had, which is what lets an older code leave newer settings at their default
  rather than at `false` — but only to within six bits, because the packing
  rounds up to whole characters. A **boolean defaulting to `true`** appended into
  that padding is switched off by every older code; `autoPlayGame` at slot 19 did
  exactly that to 0.11's codes for one 0.12 build. Append one only at a multiple
  of six, or give it a `false` default.
- **Skills are one character each** — `share` on each dropdown entry, required by
  the `satisfies` clause there, and fixed once shipped for the same reason slots
  are.
- **`SHARE_DEFAULTS` is captured at load**, before `loadSettings` writes the
  user's saved values over `setting.default`. Comparing against `setting.default`
  later would compare the settings with themselves and build an empty code.
- **A damaged code is refused, not half-applied.** The format is positional, so a
  code cut short by a chat client would otherwise decode as a code that merely
  mentions less — quietly resetting everything past the cut. The checksum and the
  required terminator turn that into "that is not a settings code"; one character
  of checksum catches 63 of every 64 mangled codes.

Three more things are worth knowing before touching it.

**One reader, two subsets.** `collectSettingValues(settings, skip)` is the only
place the rendered form is read; `skip` is all that separates its callers —
`saveSettings` and `genStartCommand` take every row, while `buildSettingsCode`
and `presetFormValues` pass `isUnsharedSetting` and so take the slot list's rows
alone. Add a caller by passing a predicate, not by writing a second copy of the
four-branch read.

**Nothing is trusted on the way in.** `applySettingValue` refuses a value whose
type does not match the row's `default` and a dropdown value no item declares,
clamps numbers into `min`/`max`, and counts what it skipped — which is what a
code from an older or newer script looks like from here. Renaming a setting key
is therefore a wire change as much as a storage one: rename one and its slot has
to be pointed at the new key, or every code in circulation loses that setting.

**The clipboard is not a given.** The settings page is loaded from a `file://`
base, so it is not a secure context: `navigator.clipboard` does not exist, and
what is left is `document.execCommand('copy')` — which needs the text selected
and on screen. That is why the share box exists and why the code is always shown
in it, selected. Game Automation Platform grew
`JavaScriptInterface.setClipboard` / `getClipboard` for this, and
`writeClipboard` / `readClipboard` feature-detect them, falling back to the box
without saying anything about it on any host that lacks the bridge.

## Skills — `src/skills/`

`skillCore.ts` owns everything common to every skill: the gauge read
(`checkSkillReadiness`), the fever hold-off, the activation tap(s), and the
`useSkill` dispatcher. Each remaining file is one skill, registering a handler:

```ts
registerSkill({
  types: ['block_moana_s'],        // skillType values from the settings dropdown
  afterActivate: function(ts) {    // the choreography, after the button is tapped
    ts.clearAllBubbles(2500, 50);
  }
});
```

Handlers may also declare `beforeActivate` (work that must land *before* the
skill fires, e.g. waiting for the board to settle), `usesSecondButton` (Pair
Tsum's two halves), `bareTapActivates` (burst skills, where a tap is the whole
activation — this is what lets the play loop fire them blind between chains) and
`sweepsBubbles` (the choreography ends on `clearAllBubbles`, as Moana's above
does). Returning `false` from `afterActivate` reports "did not fire" to the
caller.

`sweepsBubbles` is the one declaration that overrides a *setting*. The play loop
hoards bubbles for chains — a bubble popped while a chain is clearing takes a
bigger area with it, and how many it may spend is the Bubble Strategy setting
(`Tsum.bubbleTapBudget`, read by `popGameBubbles`). A skill that turns tsums
*into* bubbles has no chain to save them for, so it clears up after itself and
says so here; the loop then leaves its taps alone and does not count the
activation towards its own sweep. Ten skill ids declare it. A new bubble tap
that reads neither the budget nor this flag silently undoes the setting.

Every skill file is a **leaf**: nothing outside `src/skills/` references its
symbols, and it is reached only through `SkillHandlers[skillType]` at runtime.
An unregistered `skillType` falls back to `skillRandomizeAndWait`; `no_skill`
short-circuits before dispatch.

**To add a skill:** create `src/skills/<name>.ts` with a `registerSkill` call,
add it to the `files` list in `tsconfig.json` (after `skillCore.ts`), and add the
matching dropdown entry in `settings.ts`.

## How the layers fit together

```
  index.ts            start() / stop()          entry point
      │
      ▼
  taskController.ts   schedules ──────────────► play.ts, mail.ts, hearts.ts,
                                                levelCap.ts, boxes.ts  task*
                                                   │
                                                   │ "what screen is this?"
                                                   ▼
                                              pages.ts  gPages
                                          detect · broadcast · queue
                                                   │
                                                   │ broadcasts to
                                                   ▼
                                            pageHandlers.ts
                                        guard · record · navigate
                                                   │
                        ┌──────────────────────────┼──────────────────────┐
                        ▼                          ▼                      ▼
                  pathfinding.ts             skills/                 dialogs.ts
                  what to link          which skill, how          system popups
                        │                          │                      │
                        └──────────────┬───────────┘──────────────────────┘
                                       ▼
                              data.ts  ·  logs.ts  ·  utils.ts
                          coordinates   strings    colour maths
                                       │
                                       ▼
                                 host API
                        (declared in globals.d.ts)
```

Dependencies point downward. `data.ts`, `logs.ts` and `utils.ts` are leaves that
know nothing about the rest; `tsum.ts` and the files that reopen its prototype
are the hub that everything above the middle row goes through. `logEvents.ts` sits below even the leaves -- it is
erased at compile time, so nothing depends on it at runtime at all.

The couplings that are easy to miss:

- **`pages.ts` ↔ `pageHandlers.ts` is a cycle on paper and not one in practice.**
  The router knows nothing about any particular handler; the handlers call back
  into `Tsum` methods and into `gPages` itself. What keeps it honest is load
  order: `pages.ts` constructs `gPages` as the bundle evaluates, and
  `pageHandlers.ts` — concatenated last — registers into it. Anything that needs
  to run on a page change belongs in the second file, never in the first.

- **`board.ts` / `play.ts` → `skills/`** is not just `useSkill`. `link()` calls
  `skillBareTapActivates` to decide whether to fire blind after each chain, and
  the play loop calls `fanWouldBeWasted` and `maybeAutoTapSkill`. All four live
  in `skillCore.ts`, which is why it stays in the main bundle rather than being
  a leaf like the individual skills.
- **`data.ts` owns Tiara's tables, `skills/tiaraMinniePlus.ts` owns its logic.**
  Same for `logs.ts` and the Tiara log strings. Data and behaviour are split
  deliberately: tuning a threshold should not mean opening the skill file.
- **`settings.ts` ↔ `index.ts`** is a contract `SettingKey` now holds up. Both
  sides name a setting by an enum member, so a misspelling is a build error
  rather than a control that quietly does nothing. What is still silent is
  omission: a row nobody reads in `buildRun` compiles perfectly.

## Building

```bash
npm run typecheck      # both compilations: the game bundle and the settings UI
npm run build          # → dist/index.js, dist/index.html, dist/tsums.dat, LICENSE + NOTICE, <archive>.zip + .sha256
npm run buildAndAdb    # build, then adb push to the device
npm run adb            # push an existing dist/ without rebuilding
```

`typecheck:game` and `typecheck:settings` run the two halves separately.

**The build is a dependency graph, not a script** — `tools/build/build.js`.
Every step names what it needs, and anything whose needs are met runs
concurrently: only the page docs, the dispatch traces and the shipped bundle
need `build/index.js`, while `eventDocs`, `map:check` and the tsum library need
no compile at all. That, plus reprinting the eight page scripts in one terser
process instead of eight, is ~16s of sequential steps down to ~4s. `--jobs N`
caps the concurrency, which is worth doing when reading a failure.

Each step's output is buffered and printed in declaration order, so the log
still reads top-to-bottom. The documentation and check steps are *optional*: a
stale document, a drifted code map or a changed trace row prints its findings
and does not fail the build (`pages:docs:check`, `events:docs:check`,
`dispatch:eval` and `map:check` are the gates that do). `check:live` is the one
check in the build that is *not* optional, because what it catches is not a
document falling behind: it is a setting that will silently do nothing on a
running script, or take and break the round it was changed in. A required step's
failure stops new work but lets what is already running finish, so nothing is
still running when the failure is reported.

`build.sh` and `build.ps1` translate flags into that and do nothing else. They
used to hold the same recipe twice, in two dialects, and had drifted: the
PowerShell one wrote CRLF into `dist/*.html`, built its archive with a different
tool, and pushed over adb only when given a device. One build now, whichever
shell starts it.

**The archive is named from `config.json` and `package.json`**, not `index.zip`:
the channel's `Archive` and the `version` the package is on, so
`TsumTsum-Alpha-0.1.zip`. The channel is `build.sh -c Beta`, `build.ps1 -Channel
Beta` or `--channel Beta`, and the default channel when none says. A downloaded
archive therefore says which release it is, and [Releasing](#releasing) below
cannot publish an entry describing a different build.

`<archive>.zip.sha256` is written straight after the archive, so the two always
describe the same bytes, and it says whether a copy that has travelled to a
device is still the build it came from. The archive is written by
`tools/build/zip.js` rather than by whatever the shell had — `zip` and
`Compress-Archive` disagree about entry order and metadata, so the same `dist/`
used to produce two different archives and two different digests.

**The sidecar is the digest and nothing else** — 64 lowercase hex characters,
no filename field and no trailing newline. It is read to be handed on as a web
payload, so its whole contents are the value; that is deliberately not
`sha256sum -c` format, and checking a copy by hand means comparing the digests
rather than running `-c` over the file:

```bash
ZIP=TsumTsum-Alpha-0.1.zip
[ "$(sha256sum -b "$ZIP" | cut -d' ' -f1)" = "$(cat "$ZIP.sha256")" ]   && echo match
```

### What ships is compacted, and only in ways that cannot change it

Both tsconfigs set `removeComments: true`, and `tools/minify/minify.js` runs
terser over both outputs on the way into the payload — **with `compress: false`
and `mangle: false`**. It parses the file and prints the same AST back without
the formatting: nothing is renamed, inlined, folded or dropped. The program that
comes out is the program that went in.

That is the measurement, not caution for its own sake:

| Game bundle | |
|:--|--:|
| as tsc first wrote it | 400K |
| `removeComments` | 235K |
| **whitespace stripped** — what we do | **157K** |
| whitespace + mangling local names | 140K |
| whitespace + mangling + `compress` | 134K |

Every transform that can change behaviour is worth 23K between them, about 10%
of the file. This script runs unattended for hours on a phone; its error handler
logs `String(e)` and nothing else, there is no source map, and a misplay caused
by a `compress` pass would read as "it taps the wrong place sometimes". 23K does
not buy that. The settings script goes 51K → 31K on the same terms, and is
inlined into `dist/index.html`, so that comes off the page too.

**`build/index.js` is left alone entirely.** `tools/runtime` and
`tools/pageDocs` load it, and a stack trace out of the harness is only useful
against readable code — so even the whitespace pass runs on the copy into
`dist/`, not in place. (`build/settings.js` *is* rewritten in place: nothing
reads it, and every byte of it goes into the page.)

**If mangling is ever reconsidered, the rule it has to respect is that top-level
names are the API.** Both programs are classic scripts reached by name from
outside — the settings WebView evaluates `start({...})` and `stop();` in the
bundle's global scope, and the host calls `onEvent` and `onLog` on the settings
side — so `toplevel` would have to stay off in both `mangle` and `compress`.

What ships is executed before it is packed either way. `--verify bundle`
evaluates the output under the `tools/runtime/` host shim, running every
top-level initialiser the device runs, and fails the build if a name the bridge
needs has gone; `--verify names:onEvent,onLog` is the weaker equivalent for the
settings script, which cannot be evaluated without a DOM. The development
toolkit's detection regression can be pointed at `dist/index.js` to run against
the shipped file.

**The game bundle is `strict: true` and clean.** Keep it that way — the point of
the strictness is that `ts.*`, `this.*`, `Button.*`, `Page.*`, `settings.*` and
the log tables are all checked names rather than `any`, which is what makes a
typo a build error instead of a silent no-op on the device. The settings UI is
checked at a lower setting (`noImplicitThis` + `strictNullChecks`, no
`noImplicitAny`): it is a direct port of the original `settings.js` and still
leans on implicit `any` in a few places, but it does check the thing
that matters — that the object `genStartCommand` builds matches `Settings`.

**TypeScript is pinned to 6.x, deliberately.** TypeScript 7 removed `outFile`
and `module: none`, and the whole no-imports design depends on `outFile`
concatenation. The `"ignoreDeprecations": "6.0"` line in both tsconfigs is what
keeps those options legal. Moving to TS 7 would mean replacing the bundler
(e.g. esbuild emitting a single IIFE) — a build-system migration, not a config
edit. The `target: ES5` requirement is gone: the host is QuickJS-ng and the
target is now `ES2023`.

**`target` is `ES2023`, and that is a licence to write modern code, not a
speed-up.** The ES5 emit it replaced carried no TypeScript helpers
(`__extends`, `__spreadArray`, `__assign`, `__read` were all absent) and two
`_loop_` closures in 8,000-odd lines, so downlevelling was costing essentially
nothing at runtime. What did change is *where the bundle's names live*:
`var` and `function` declarations become properties of the global object, while
`class`, `let` and `const` are lexical bindings on the global environment. Both
resolve by name from a later script in the same realm, so the settings bridge
(`start` and `stop` — both function declarations) is unaffected;
but anything reading them as properties off a context object is not, which is
why `tools/runtime/load.js` republishes the bundle's classes explicitly.

## Releasing

```bash
npm run release:alpha              # build the Alpha channel and publish it
npm run release:beta
npm run release:production
npm run release:alpha -- --dry-run # show the entry, write nothing
npm run release:alpha -- --yes     # skip the note review, publish the Summary as it stands
```

Each one builds its channel and writes three files into the catalogue repository:

```
../game-automation-catalogue/Official/LineTsumTsum/<Alpha|Beta|Production>/
├── TsumTsum-Alpha-0.2.zip     the build, named from config.json + package.json
├── TsumTsum-Alpha-0.1.zip     and the ones before it, up to HistoryLimit
├── metadata.json              the entry that describes the newest, and lists the rest
└── CHANGELOG.md               every release cut on this channel, newest first
```

That path is the whole point of the exercise — it is what the catalogue's own
`build-official.ps1` scans to regenerate `official.json`, the index the app
fetches. **Run that script in the catalogue and commit there**; nothing on this
side touches it.

`config.json`, beside the build scripts, is the release identity — the one place
the game name and the channels live. **The version is not there: it is
`package.json`'s `version`**, so `npm version` and the release cannot disagree
about what this is, and there is one number to bump rather than two:

| Field | |
|:--|:--|
| `Game` | copied into every entry |
| `Publisher` | the catalogue this ships under, and the first segment of the on-device folder |
| `Catalogue` | where a release is published, relative to the package |
| `Channels.<name>` | `Name` (what the app shows), `Archive` (the zip's base name), `Directory` (under `Catalogue`), `Note` (a line appended to every release note on that channel) |
| `MessageMaxChars` | the note is read on a phone; over this, the release refuses rather than shipping a card that scrolls |
| `HistoryLimit` | how many builds stay installable (default 5); older archives are deleted from the catalogue on the next release |

`metadata.json` is written from the bytes that were just built — the `Hash` is
taken from the archive being copied, not from the sidecar — so an entry cannot
describe a build other than the one beside it.

**Its `Versions` array is what lets a player roll back.** The top-level fields
describe the newest build, exactly as they always have; `Versions` lists that
build and the `HistoryLimit - 1` before it, newest first, each with its own
`Version`, `Date`, `Hash` and `File`. The app offers them in a menu on the
script's card, so a release that breaks something is recoverable without anyone
editing the catalogue by hand.

Two consequences worth knowing:

- **Old archives are kept, then pruned.** A release inherits the previous
  `metadata.json`'s history — synthesising a one-entry history from its
  top-level fields when it predates this — prepends itself, and deletes the zips
  that fall past `HistoryLimit`. It prints what it pruned; stage those deletions
  when you commit.
- **Re-publishing a version replaces its row** rather than adding a second, the
  same rule the changelog section follows.

A history row carries no `Message`. Nothing renders an old version's note, and
one per version would push `official.json` toward the 2 MB the app caps a
catalogue at — the changelog below is where per-version notes live.

**The release note comes from the changelog, and only from its `### Summary`
block.** `CHANGELOG.md` has one section per version, named for `package.json`'s
`version` — there is no `[Unreleased]`, so the section to publish is simply the
one for the version being built, and a missing section fails the release. Each
opens with a Summary: one line per change, and only changes a player would
notice, internals excluded. The release turns those bullets into a numbered
Markdown list, appends the channel's `Note`, and that string is the `Message`
field. The host app renders it with its own small Markdown subset
(`ui/Markdown.kt`: headings, emphasis, code, lists, links, rules), so a bullet is
a sentence and not a paragraph. A section with no Summary fails the release
**before** the build runs, rather than shipping an empty card.

Re-releasing a version after more work has landed under it is normal: the section
is still open, so the note carries the bullets added since, and the catalogue's
own entry for that version is rewritten rather than duplicated.

**Those bullets are a proposal, and the release stops to have it approved.**
Before anything is built, `tools/release/review.js` prints the note exactly as the
app will render it — the numbered list, the channel's `Note`, and the character
count against `MessageMaxChars` — and waits:

| | |
|:--|:--|
| `a` | approve, and the release goes on with this note |
| `e` | open the bullets in `$VISUAL`/`$EDITOR` (`notepad` on Windows, `vi` otherwise), one `- ` line each, and come back to the same prompt |
| `d` | deny — nothing is built, nothing is published, and the command exits non-zero |

A note that is over the limit or has no bullets cannot be approved; it can be
edited until it is. An approved **edit** is then offered back to `CHANGELOG.md`,
rewriting only that `### Summary` block, so what shipped and what the repo says
shipped stay the same text. Declining leaves the file alone and ships the edit
anyway; a `--dry-run` never writes it.

`--yes` skips the review and publishes the Summary as it stands — the old
behaviour, and what to pass from a script. Without it, a run with no terminal to
ask on fails rather than guessing.

The same bullets are also appended to a **`CHANGELOG.md` in the channel's
catalogue folder**, under a `## <version> - <date>` heading, newest first.
`metadata.json`'s `Versions` says which builds are still installable but not what
any of them changed, so that file stays the only record of that — and it keeps a
section for a version long after its archive has been pruned. Publishing the same
version twice rewrites its section instead of adding a second one. It is written on a real
release only — a `--dry-run` says it would and writes nothing — and, like the
archive, it is committed on the catalogue side.

Two paths onto a device, and they are not the same thing:

- `npm run release:*` publishes an archive for the app to *install* from the
  catalogue. This is what a user gets.
- `debug_deploy.ps1` builds and pushes `dist/` straight over the installed
  script's folder with `adb`, skipping the catalogue entirely. It derives that
  folder from the same `config.json` (`<Publisher>/<Game>/<Name with spaces
  dashed>`), so it lands on top of the release the app already has rather than
  beside it. This is the debug loop; take `-Channel` to point it at another one.

## Where to start

| Task | Look at |
|:--|:--|
| Script taps the wrong place | `data.ts` → `Button` |
| Script does not recognise a screen | `data.ts` → `Page`, then `PageRouter.sweep` / `PageRouter.matches` in `pages.ts` |
| Chains are poor / short | `pathfinding.ts` → `calculatePaths`, `findLongestTsumPath` |
| A skill misfires | `src/skills/<name>.ts`, then `useSkill` in `skillCore.ts` |
| A chore taps the wrong thing in the store, or buys nothing | `BoxStore` in `data.ts` first -- the tab row and the purchase buttons both move, and it says how each is read -- then `taskBuyBoxes` and its helpers in `boxes.ts` |
| Bubbles are tapped too eagerly, or not at all | `Tsum.bubbleTapBudget` / `bubblePopChainLength` / `popGameBubbles` in `board.ts` and the Bubble Strategy setting; `settleScansAfterSkill` for the hold after a burst; `clearAllBubbles` and `sweepsBubbles` for the skills that override it |
| Add a new skill | `src/skills/`, `tsconfig.json`, `settings.ts` dropdown |
| Add a setting | `settings.ts` (`settings` array) **and** `index.ts` (`start`) |
| Add a background job | `index.ts` → `gTaskController.newTask` in `buildRun`, task body in its own `src/` file (see `mail.ts`, `boxes.ts`) |
| A changed setting does not take, or the script misbehaves after a stop | `index.ts` → the run lifecycle: `gRunActive`, `endRun`, the wait in `stop()` |
| A setting does nothing on a running script, or takes but breaks the round | `LiveSettings` in `quickbar.ts` — the one statement of when each setting reaches a run. `npm run live:check` says whether the code agrees with it |
| Script gets stuck on a popup | `dialogs.ts`, and `PAGE_DISPATCH.md` for what was supposed to clear it |
| React to a screen the script already recognises | `pageHandlers.ts` → a new `gPages.subscribe({...})` |
| React to a fever starting or ending | `fever.ts` → a new `gFever.subscribe({...})`; `ts.isFeverTime()` for a one-off look |
| A screen goes away on its own | `data.ts` → `PageProfiles`, mark it `Transient` with a duration |
| Wrong/missing log text | `logsEn.ts`, then the same key in `logsZhTw.ts` and any other language |
| Wrong/missing settings-page or Quick Bar text | `uiEn.ts`, then the same key in `uiZhTw.ts`; a *new* string needs a `UiText` member in `strings.d.ts` first |
| Adding a language | `Locale` in `shared.d.ts` → a `ui` and a `logs` catalogue beside the English ones → the tsconfigs, the build scripts and the two HTML files. `npm run i18n:check` says what is still untranslated |
| A new log event, or finding where one is defined | `logEvents.ts` — the member first, then `logsEn.ts` if it is user-visible |
| Somebody has sent in a zip and says it got stuck | What goes *into* one is `report.ts`; a failure that should collect one on its own is one entry in `ReportTriggers` there and nothing at the call site. Opening one is the development toolkit's job |

## The development toolkit

This repository holds the script and what builds it. The tooling that was used
to *develop* it -- and is still used to keep it right -- is the development
toolkit: a separate, private repository beside this one that runs against this
repository's build.

Comments throughout `src/` cite the toolkit's commands by name, because they
are the measurements behind the numbers. Read any `npm run` command that this
package's `package.json` does not define as one of the toolkit's; none of them
runs here.

## Debugging

- `Config.debugLogs` (the "Debug logs" setting) decides whether `logDebug()` is
  *written out* — and it is now the *only* switch that does. Some debug output
  used to be gated on `ts.debug` instead, which meant two settings had to agree
  before a diagnostic appeared. The record is built and kept either way, in the
  ring an issue report carries (`LOGGING.md` § The ring), so a report from a
  player who never touched this setting still explains itself.
- `ts.debug` (the "Debug game" setting) additionally saves annotated screenshots
  to `<storage>/tmp/`, and keeps a page-history frame for every remembered screen
  rather than only the last few. The last few are kept on every run, because that
  is what a report sends.
- `adb logcat -s gap.script` shows script output on the host.
- The log is **JSONL** — one JSON record per line, in
  `<script root>/logs/script-<device id>.log` (the service's startup line in
  `/data/local/tmp/gap/service.log` names it): a fixed envelope plus a `data`
  bag. Point Logdy at it (`adb shell tail -f …/logs/script-<id>.log | logdy`) or `jq`, and
  filter on `event`, `runId` and `roundId` rather than grepping sentences. The floating
  bar and `gap-cli logs` render the records back to human lines, so nothing on
  the device got harder to read. `LOGGING.md` § With Logdy.
- Detector thresholds are best tuned offline against saved screenshots on the
  PC (turn on "Debug game" to collect them) rather than by trial and error on
  the device -- see **Page detection offline** below for the tooling that does it.

## Page dispatch — `pages.ts` / `pageHandlers.ts`

Recognising a screen is half the job. The other half is what happens next, and
that used to be spread across every loop that happened to be looking: three
navigation loops with near-identical `switch (page)` bodies, a corpus capture in
one of them, a round-stats sample in another, and the Magical Time cancel in
three places because any of three loops could be the one that saw it. Two of
those reactions on one frame — one reading, one tapping — read or tapped a
screen the other had already changed.

`gPages` (`PageRouter`) is now the only thing that looks, and it **broadcasts**
what it found:

```ts
gPages.detect()            // → PageName, after the subscriptions have run
gPages.detectObject()      // → the matching Page entry, same broadcast
gPages.observe()           // → the PageEvent, filed in the history, nothing run over it
gPages.react(event)        // run the queue over an event `observe` returned
gPages.peek()              // → detection with no broadcast and no history
gPages.matches(name)       // → is *this* page up? (the divergent metric, below)
gPages.navigate(PageName.FriendPage)   // poll and act until we are there
```

`detect` is `observe` then `react`. The goal a look is made with -- what lets
the navigate band act -- is an argument to the look (`navigate()` is the one
caller that passes one), not router state, so what a look may set in motion is
decided by the caller making it.

Writing the *caller* — a task that walks a flow rather than reacting to one
screen — is `DRIVING_SCREENS.md`: what `navigate` costs per pass, when the `via`
hop is skipped, why a screen that waits for a tap can swallow one, and how to
read a list you are in the middle of changing.

Anything that wants to react registers a subscription instead of writing another
branch:

```ts
gPages.subscribe({
  id: 'dismiss.magicalTime',
  category: PageCategory.Dismiss,
  what: 'Cancel the offer to play on...',   // required: it is the documentation
  pages: [PageName.MagicalTime],
  every: true,
  steps: [
    { do: 'log', event: Log.Play.MagicalTimeCancelled, message: 'Magical Time offered, cancelling' },
    { do: 'tap', anchor: PageAnchor.Back },   // the *matched* entry's Cancel
    { do: 'sleep', ms: 500 }
  ]
});
```

`steps` and not a body. The vocabulary is `tap` (an anchor of the entry that
matched — never a coordinate, because the variants of a page put the same button
in different places), `tapAt` (a fixed `Button`), `settle`, `sleep`, `waitOut`,
`log` and `call` — the last for what is neither a tap nor a wait. So the taps and
the budgets are data: `PAGE_DISPATCH.md` prints every one of them, `takes` is
read off the first tap rather than declared beside it, and `tools/dispatchEval`
pins the lot. `PageRouter.perform` is the only thing that runs them.

### The queue

Subscriptions run **one at a time**, in a fixed band order, and the first one to
touch the screen ends it — everything below would be acting on a frame that no
longer exists. Whether a subscription touched the screen is its **band's**
answer, not a value it returns: `guard`, `dismiss` and `navigate` act unless
their `acts` declined. The bands:

| band | priority | for |
|:--|--:|:--|
| `Observe` | 100 | read-only state (`isStartupPhase`). Always runs. |
| `Record` | 80 | measurements only valid before a tap (corpus frames, coin counter) |
| `Guard` | 60 | not a game screen at all (the root warning) |
| `Dismiss` | 40 | interruptions in the way (Magical Time) |
| `Navigate` | 20 | move toward the goal. **Only inside `navigate()`, never on the goal page.** |
| `Notify` | 10 | logging, progress bookkeeping. **Runs even after the queue has stopped** — it records what was seen, not what is there. |

Within a band: `order` descending, then registration order, then a topological
pass over each subscription's `after` list. A dependency naming a subscription
that is not in the same queue is satisfied vacuously.

Two rules carry most of the safety:

- **`Navigate` is silent with no goal.** That is what lets the play loop call
  `gPages.detect()` every cycle without anything tapping the game away.
- **`Navigate` never fires on the destination.** Arriving is `navigate()`'s job,
  and a fallback back-tap firing there would walk straight off the page the
  caller asked for.

`every: true` means "fire on every look" rather than only when the page changed.
The navigation movers need it — they tap the same screen until it gives way.
Nothing else should.

A subscription that can decline declares its condition as `acts`, and only there:
the dispatch tests it and skips the steps when it answers false, so they never
run on a frame it would have refused, and the forecast reads the same declaration
— which is why the two cannot disagree about who acts.

There is no blind fallback. The last mover, `nav.move.exit`, presses a page's
`back` only where that page's `PageRoutes` row (data.ts) says `back` is a way
out — a Close, a Cancel, an OK, a back arrow. A page with no such row is not
tapped: `navigate()` logs `nav.noRoute` once for it and the stall guard takes
it from there, which ends the same way a page that would not give way does. The
hub is the page that must never have the row — its `back` is Play — and it is
how a fingerprint that aliased the hub once started rounds nobody asked for. So
a new page that navigation has to leave needs its exit declared, or navigation
will sit on it and say so.

### Permanent vs transient

Every name in `PageName` declares in `PageProfiles` (data.ts) how it leaves the
screen:

- **permanent** — it waits for input. Still there in ten seconds, and the only
  way past it is a tap. The navigate band taps these.
- **transient** — it dismisses itself after `durationMs`. Tapping it is worse
  than doing nothing: by the time the tap lands, the page it was aimed at is
  gone and the tap hits whatever replaced it. `nav.wait.transient` sits these out
  instead.

`PageProfiles` is a mapped type over `PageName`, so a new name with no profile is
a build error rather than a page whose behaviour nobody decided.

Durations are quoted at 60fps (`PageBaselineFps`) because the game runs these
windows off a frame counter, not a clock: a device at 120fps shows a "10 second"
page for five. `PageRouter.durationOf` scales by `gPages.fps`, which the
**Device frame rate** setting feeds.

**Measuring one.** Turn on *Debug game* and *Page history depth*, reproduce the
screen, and read the visit's duration out of the `[Pages]` trail line — it prints
each screen with how long it was up. Do it on a device whose frame rate you know,
convert back to 60fps (`measured × fps / 60`), and set `measured: true`. Today
only `MagicalTime` is transient and its 10s is an estimate, which
`npm run pages:docs` reports as a finding until it is timed.

### The history stack

`gPages.history` keeps the last `historyDepth` visits (default 20, from the
**Page history depth** setting), newest first, each with when it started, when it
was left, and its kind. `gPages.trail()` renders the tail as
`FriendPage(2.1s) < StartPage(0.4s)`, which `notify.trail` logs on every change
when *Debug game* is on.

With debug on it also writes the matcher's own frame for each visit to
`tsum_record/pageHistory/`, and deletes each frame as its visit falls off the
stack — so the directory is bounded by the depth, not by uptime.

### The generated map

```bash
npm run pages:docs         # write PAGE_DISPATCH.md
npm run pages:docs:check   # fail if it is stale (CI)
```

[`PAGE_DISPATCH.md`](PAGE_DISPATCH.md) is every subscription, the order it runs
in, the queue for each of the 34 pages, and the permanent/transient table. It is
**generated by asking the loaded bundle's own `PageRouter.plan`**, not by
re-deriving the rule, and the build regenerates it as soon as `tsc` has emitted
the bundle — so it is never a version behind the code. Do not edit it by hand.

The generator also reports a page no handler can leave — nothing in the guard,
dismiss or navigate band, so a screen `navigate()` would sit on until the stall
guard restarted the app — and an `after` naming an id nothing registers, which
`gPages.validate()` refuses at load as well.

### The queue, run offline

`PAGE_DISPATCH.md` says who is *on* the queue. `npm run dispatch:eval`
(`tools/dispatchEval/`) says what the queue *does*: for every `Page` entry, every
navigate goal and both kinds of look, it sets the router's state by hand, builds
the event with `gPages.buildEvent` and runs the real `gPages.react` over a
`Tsum` whose taps and waits are recorded instead of performed. The trace per row
-- the taps, the budgets, the handler that claimed the frame, the one the
forecast expected -- is pinned in `tools/dispatchEval/golden/`, so a change made
for one page that moves another page's trace fails there, with the row named,
before a device ever sees it. `npm run dispatch:update` rewrites the goldens;
the diff it produces is the review.

## Page detection offline

`tools/runtime/` is the Node stand-in for the host: `load.js` evaluates the
*built* `build/index.js` in a vm and `host.js` shims the ~15 host primitives
underneath it, so `gPages.sweep`, `gPages.score`, `Page`, `absColor` and
`Tsum.getColor` are the production ones -- nothing about classification is
reimplemented. That works only because `module: none` + `outFile` leaves
everything at global scope; a move to a real bundler has to preserve that or
the loader breaks. The build uses it for `PAGE_DISPATCH.md`, the dispatch
traces, `live:check` and `--verify bundle`.

Everything that *tests* detection lives in the
[development toolkit](#the-development-toolkit) and runs against this one's
build. A fingerprint change is not finished until the toolkit's detection
regression has been run.

### How a match is chosen

`PageRouter.sweep` scores every entry and takes the best; it used to take the
first one in declaration order whose probes all passed. Pass/fail per entry is
unchanged, so this only decides between entries that would all have been
accepted anyway.

"Best" is **evidence first, comfort second**: the entry confirming the most
landmarks wins, and slack only breaks ties between fingerprints of equal length.
Ranking on slack alone is actively wrong here -- it averages, so a one-probe
entry that matched by luck outscores a nine-probe entry that matched genuinely.
`ClosePage` carries exactly one probe by design, and the development toolkit
catches this the moment the rule is relaxed.

`gPages.matches` still uses a *different* metric -- per-channel `isSameColor`
rather than `absColor` against each probe's threshold -- and that divergence is
deliberate for now. Switching it would make `ReceiveHeartWithoutCoins` harder to
match, not easier (its probes all carry threshold 30, and a 15-per-channel error
passes the old rule but fails a sum-of-30 one), and that page decides a branch in
mail handling. The comment on the function says what to collect before flipping it.

`Config.pageMinMargin` can reject a win that is too close to a
differently-named runner-up. It defaults to 0 (never reject), and should only be
raised on evidence from the development toolkit's detection regression: turning
a recognised screen into `Unknown` is handled far worse by the navigation band
than a mis-identification.

`detect`/`sweep` also take an optional `expect` list, which narrows *which
entries are scored at all*. It is a filter and nothing else -- scoring, ranking
and the margin gate are untouched, and omitting it scores the whole table as
before. The play loop's liveness check passes `inRoundPages()` (`src/pages.ts`,
read off the `roles` each page declares in `PageProfiles`), because a running
round can only be looking at the board, the pause menu, or a screen it ended
on. That buys two things, in that order: a page outside the list
can no longer win by being the last entry still passing over a board hidden by an
animation -- which is how a single fever frame once ended a round through
`ClosePage` -- and the ~48 entries it rules out cost no native crossing.

It is deliberately a caller's list rather than a router-wide page-to-page graph.
The router distrusts `this.page` as stale on purpose (see the `via` hop in
`navigate`), so a successor set keyed off it would be wrong exactly when the last
reading was old, and a wrong one produces the spurious `Unknown` the paragraph
above warns about. A caller that knows what it is watching does not have that
problem. A narrowed sweep that matches nothing still reports `Unknown`, so such a
caller has to read that as "none of the pages I asked about".
