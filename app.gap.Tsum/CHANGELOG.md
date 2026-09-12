# Changelog

All notable changes to the Tsum Tsum script. Format based on
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

**One section per version, named for `package.json`'s `version`.** There is no
`[Unreleased]`: an entry goes under whatever version the package is on, and
bumping the version is what opens the next section. Cutting a release does not
close one -- `npm run release:*` publishes the section for the version it built,
and later work on that same version reopens and republishes it.

**`### Summary` opens every section, and it is the user-facing changelog.**
`npm run release:*` reads those bullets and nothing else to fill the `Message`
field of the catalogue entry -- the release note a player reads on a phone, in a
card a few lines tall. A bullet is:

- **one line**: a sentence, no sub-bullets, no wrapped paragraph;
- **one bullet per feature, not per change** -- a new skill is "Coronation Day
  Elsa skill added", and a later round of work on it is "Coronation Day Elsa
  skill improved by making clears faster". Every pass over the same feature
  folds into that one line; *how* it was done belongs in the sections below;
- about **what a player sees or does** -- a setting, a screen, a stats column,
  behaviour they would notice. If it can only be said in file, key or API names,
  it is not one;
- **never internals**: refactors, tooling, docs, detection plumbing, tests, and
  build or release machinery all stay below.

Keep the list short enough to read on that card; over `MessageMaxChars`
(`config.json`) the release refuses rather than shipping one that scrolls.

The sections under it are the internal record, for whoever works on this next:
everything that changed, user-facing or not, **one or two lines each** -- what
changed, and the one fact that explains why. Measurements, rejected designs and
long reasoning belong in the design docs (`OBSCURED_BOARD.md`, `LOGGING.md`,
`DRIVING_SCREENS.md`, `PAGE_DISPATCH.md`, `DEVELOPMENT.md`).

## [0.13]

### Summary

- Two grey or black-and-white tsums on one board -- the Mandalorian beside Oswald, say -- are told apart instead of being chained together and refused.
- Link MyTsum first finds your tsum's colour on the board again, instead of guessing from the skill button.
- Round stats no longer leave the base coins blank when the counter ends in 44, or the round's coins blank when the figure has a 9 in it.
- A round whose level-up panel shows a wide-eared tsum second -- Bianca, Stitch -- is recorded again instead of going to the stats file blank.

### Added

- **The contributor site (`website/`).** A Docusaurus site that explains the
  tree to someone who has never opened it: the architecture with diagrams,
  guides for the common changes (a skill, a setting, a page, a task, logging,
  lifecycle hooks), publishing, a page on hosting a script library of your
  own, and the reference tables -- all rewritten from the documents here. Code
  on the site is fetched from GitHub at view time, `EVENTS.md`,
  `PAGE_DISPATCH.md` and `BACKLOG.md` are synced in at build time, and
  `refs:check` there holds every code reference to the tree. Published to
  GitHub Pages by `.github/workflows/docs.yml`; `CONTRIBUTING.md` at the root
  is the short form, and `map:check` knows the directory. Screenshots are
  placeholders for now, listed in `website/IMAGES_NEEDED.md`.
- **`README.md` § Getting logs, stats and screenshots off the device.** What
  the script root holds, file by file; that on MuMu it is already a folder on
  the PC (`Documents\MuMuSharedFolder\Download\…`, shared by every instance);
  and the shared-folder and adb routes for other emulators and a phone.
  `LOGGING.md` and `CODEMAP.md` point there; the site carries it as *Files on
  the device*.

### Changed

- **The public tree names the development toolkit as one thing.**
  `DEVELOPMENT.md` § The development toolkit replaced the inventory of its
  commands, and `CODEMAP.md` and `CLAUDE.md` point there: a cited command still
  means the toolkit's, and nothing here says more about what it holds.

### Fixed

- **Two greys on one board merged into one colour.** The chroma plane puts
  every near-grey tsum at its origin, so a silver helmet and a black-and-white
  face differed only in value at half weight -- the Mandalorian and Oswald read
  22 apart against a merge distance of 40, and every chain through the merged
  cluster was refused. `findTsums` (`src/pathfinding.ts`) now reads each
  circle's texture off the board gray it already has -- the spread of 57 samples
  inside the head and the brightest one -- and `distance3D` counts those two
  axes between two near-grey colours only, so a saturated tsum's distance is
  unchanged. On composite piles of that roster refused drags fall from 26% to
  4%; over the corpus captures it undoes two merges and moves two tsums; on
  six phone captures of Mandalorian boards the helmet's cluster, merged with
  the black-and-white tsum on every one before, comes out pure on all six.
  `board.clusters` carries `contrast` and `peak` per cluster. Board Studio
  still clusters on colour alone.
- **"Link MyTsum first" had been sampling the skill gauge since 0.12's colour
  model.** The library's colour column was still `board=hsv31`, the HSV
  derivation, while `MyTsumBoard.tag` asked for `chroma1`, so the loader
  dropped the column and the match fell back to the button sample that lands
  on the gauge. The library could not be regenerated because the derivation
  script reads `MyTsumBoard.width` and `.background` out of `src/data.ts` and
  the 0.12 dead-code sweep had deleted them as unread. Both are back, with a
  note saying who reads them, and `src/tsums.dat` is regenerated as `chroma1`:
  every one of the 769 rows carries a colour, ids and signatures unchanged.
  The derivation lands inside the gate on all four labelled Buzz boards
  (1 to 23 away), and the Mandalorian's colour picks the helmet's cluster on
  five of the six phone captures -- the sixth, a fever board, has a 3-tsum
  grey fragment 4 nearer than the helmet's 11, which a texture column in the
  library would settle.
- **`base_coins` was blank for every counter ending in 44.** Two '4's stand
  bar to bar, and on the level-up panel -- read at a floor of 40 because the
  HUD is dimmed there -- the antialiased skirt between them reads 40-49, so
  the mask joined the pair into one 30-wide contour that matched nothing.
  `statsSplitJoined` (`src/roundStats.ts`) now cuts a box wider than the
  row's tallest glyph at the column with the least light above the floor,
  bounded so a digit's width is left either side; the join is a single
  column at 0 light, where a '0''s thinnest column is core. Nine debug shots
  from the device all read, and one is in the corpus for `pages:stats`.
  `stats.joinedGlyphsCut` records a cut.
- **`final_coins` was blank for every figure with a 9 in it.** The '9'
  template closed its loop with two full-width rows where the game draws a
  thin loop and a hooked tail, so at tally size the glyph led '0' by 0.021,
  under the 0.03 margin floor, and the field failed every read of the round.
  Six device shots in a row (2,997 … 4,191) had a 9 and nothing else wrong.
  `StatsDigits` (`src/roundStats.ts`) is recut whole as the per-pixel
  majority over 275 labelled glyphs at all three sizes the game draws a
  number, on both a 540 emulator and a 1080 phone -- the tally's bonus and
  high-score rows included, since they are the corpus's only small '6' and
  '8', and a first cut without them turned the phone's '8' into a '3'. The
  worst glyph goes from 0.743 / 0.021 to 0.800 / 0.043, no glyph reads
  wrong, and thirteen device shots the set was not cut from all read. A
  glyph on the crop's top or bottom edge now fails the read outright
  (`stats.clippedGlyph`): it is a row the rectangle is not for, and a '9'
  with its tail cut off is a '0'. Two of the tallies are in the corpus, and
  `pages:stats -- --digits` prints the per-digit margins and the templates
  so the next recut is a paste.
- **`pages:stats` is now a three-part regression gate for the number
  readers**, so a change to a rectangle, a cutoff or a template fails there
  rather than on the device: every labelled field reads (116 over 19 frames),
  every labelled digit reads as itself over both floors (304 glyphs, the
  tally's bonus and high-score rows included), and every digit has a sample
  at every size the game draws a number -- a gap is a failure that names the
  frame to capture. Two level-up frames off the device fill the last two
  gaps, the dimmed counter's '6' and '8'.
- **A whole round went to the stats file blank when the second level-up panel
  held a wide-eared tsum.** `TsumLevelUp5to4Bonus`'s margin probe sat at
  x 240, where Bianca's and Stitch's ears reach, so the panel went
  unrecognised and the tally wait -- renewed only on a page it can name --
  gave up with the panel still standing. Four of the six whole-tally debug
  shots on the device were this. The probe is at x 216 (`src/data.ts`),
  which reads the same on all five four-panel frames in the corpus.
- **`PAGE_DISPATCH.md` grew headings out of wrapped comments.** The page-docs
  generator took any short `//` line in the `PageName` enum for a group
  header, so the last line of a wrapped note ("waits to be closed.") became a
  section. A header now has to open its comment run.

## [0.12]

### Summary

- Lorcana Aurora skill improved and moved out of WIP.
- Box Buying improved
- Presets added: save how you play a round under a name and switch between setups from the top of the settings or from the Quick Bar, without stopping the run; exporting them writes one settings code each, to the clipboard or to a file, and pasting a line back applies it.
- Max round duration added: cap how long one round may last, and pick what happens when it is up -- stop playing and let the clock run out, so the round finishes as normal and the next one starts, or stop the script.
- A board that stops taking chains -- the same few tsums lit up over and over with nothing going off -- is now noticed and fanned loose on its own, instead of running until the round ends.
- Reporting a problem added: press Report on the Debug tab or the Quick Bar -- or hold the floating bar's Log button -- and the screen, the screens before it, your settings and the recent log are saved to share or save from Run History; the script saves one by itself whenever it gets stuck. The Quick Bar's Report works while the script is still playing, so it catches the live screen rather than the pause menu.
- The status line under the floating bar stays clear of what the script reads: on a device where the two would meet it shrinks or steps aside, instead of hiding the board from the script.
- Quick Bar layout tightened: every control takes only the width its words need, the rows line up in columns, and on a wide screen the block sits centred rather than stretched.

### Added

- **Apache-2.0 license.** `LICENSE` and `NOTICE` at the repo root; the notice
  records the `r2-studio/robotmon-scripts` origin and the inlined Pico CSS, and
  both files ride in the release zip. `package.json` says the same.
- **The repository is the script and what builds it.** The development toolkit
  lives in a separate private repository now and runs against this one's
  build. What stayed under `tools/` is the build, the checks it runs, and
  `tools/runtime/`, the host shim every harness loads the bundle through. The
  observed page graph moved to `docs/transitions.json`, beside the clip
  library. `DEVELOPMENT.md` § The development toolkit says what the commands
  cited in comments refer to.
- **`declareReadTop` (`tsum.ts`), the host's `setReadTop`.** The floating
  bar's status line hangs under the bar, in the half of the frame page
  detection reads, and on 0.16 it sat across the six pixels the board
  fingerprint reads on every device but MuMu -- no board was recognised and
  nothing was chained (BlueStacks Air). The script now tells the host the
  top-most row it reads, derived from `Page` and `StatsRegions` and converted
  through `toRealXY`, and the host fits the line above it or keeps it down.
  From `init`, since the row moves with `gameOffsetY`; guarded like `banner`.
- **Max Round Duration (`maxRoundMinutes`, `maxRoundAction`, Gameplay →
  Playing).** The clock giving up on a round the play loop cannot see is stuck:
  every part of it is behaving, so only elapsed time says so. Measured from
  `roundStartedAt` -- the board coming up, not the walk in -- and read fresh
  each turn round the loop, which is what makes both rows `LiveWhen.Now`.
- **Two things it may do, `MaxRoundAction`.** Both stop *playing* the round and
  leave the game's own timer to run it out; what they decide is what becomes of
  the script. `Coast` (the default) waits it out, so the tally, the stats and
  the next round all follow as usual; `Stop` ends the run where it stands.
  Neither presses the game's Pause button, and that is the point: pausing the
  game stops its round timer, and a round that can no longer time out is what
  this exists to avoid. Both rows `neverShared` -- they cap what the *run*
  spends on a round, not how one is played.
- **`requestStop()` (`src/index.ts`).** The flag-raising half of `stop()`, split
  out because a task body calling `stop()` would wait for itself: it waits on
  `gRunActive`, which only clears once the run's own thread hands back.
- **`ReleaseStatus`, and the channel floor (`src/releaseStatus.ts`).** Alpha 0,
  Beta 1, Production 2. Each `config.json` channel carries the floor it ships,
  the build stamps it into `$RELEASE_STATUS`, and `offeredHere` is the one
  predicate everything asks -- so one comparison decides the whole rule.
  `resolveChannel` refuses a channel without a valid `Status` rather than
  defaulting, because the quiet failure is an unfinished thing offered to
  everyone.
- **Skills carry it, and the list is narrowed to it.** Required on each entry for
  the reason `share` is: a half-finished skill should not ship to everyone by
  being forgotten. Coronation Day Elsa and Gaston are Alpha; the rest are
  Production. The handler still ships; only the way to ask for it is withheld,
  and a share code naming a withheld skill already decodes to `undefined`.
- **Settings rows carry it too.** Optional there, absent meaning Production --
  the shape `neverShared` has, since a field every one of 48 rows repeated would
  be noise. Below the floor a row is not drawn, and takes no value from storage,
  a share code or a preset, so it sits at the schema default. It keeps its share
  slot and still reaches `start()` at that default, which is what stops a code
  meaning one thing on Alpha and another on Production. A group left with no
  rows draws no empty card, and a Quick Bar cell says its status in markup
  (`data-status`) because the strip's compilation has no schema to read.
- **An unfinished thing is badged.** One table (`StatusFlags`) read both ways --
  status to badge, `data-status` name back to status -- so the two cannot
  disagree. The sheets and settings rows draw the colour and an ALPHA/BETA pill;
  the closed dropdown row and the Quick Bar chip take the colour alone, having no
  room for the pill. Alpha gets its own orange rather than `--gap-accent`, which
  already means "selected" in that very list. This replaces the hand-written
  "- WIP" on the two skill names.
- **Issue reports (`src/report.ts`).** One folder per report under
  `tsum_record/reports/<id>/`: the screen at full resolution, the matcher's own
  view and its sidecar -- the corpus triple, so `tools/pageEval/` replays a
  reported screen unchanged -- the router's recent frames under `trail/`, a
  manifest carrying the geometry, the device, the whole settings object and the
  page trail with dwell times, and `log.jsonl`. **Not gated on a developer
  setting**, unlike the corpus recorder and the debug shots: the person who
  needs one has already hit the bug and will not have turned anything on first.
  What bounds it is the pruning -- three minutes between automatic ones, twelve
  a run, eight folders on the disk.
- **A failure writes its own report.** `ReportTriggers` names four events -- the
  stall watchdog giving up, five throws from one job, a round that ended with
  nothing fingerprinting it, and navigation with no declared route -- and the
  *logger* is what checks the list, so no call site has to remember. "It got
  stuck last night" now usually has its evidence on disk before anyone asks for
  it. `board.stalled` was a fifth for one night and reported five boards
  mid-clear; the fan is a rescue, not a failure.
- **`reportIssue(reason, note)`**, the global both pages and the host evaluate,
  beside `roundDelaySkip` and the two Now buttons. It sleeps and taps nothing,
  because the pages evaluate it while the run is paused and the host gates both;
  `live:check` now drives it as a page entry point for exactly that.
- **The log ring (`LogRingMax`, `src/logging.ts`).** The last 300 records, kept
  whether or not they were written out. `logDebug` no longer returns before
  building anything with "Debug logs" off -- it builds the record, rings it and
  skips the sinks -- because the records that explain a wedge are almost all
  debug ones and turning the setting on by default would flood the 2 MB
  rotation. A ring-only record spends no flood allowance, so it cannot cost an
  `info` line its place. `LOGGING.md` § The ring.
- **A Report row on the Debug tab, and a Report chip on the Quick Bar.** The row
  opens a note box that is optional; the chip is the strip's second control that
  is not a setting, and says "Saved" for six seconds rather than toasting over
  the game.
- **`npm run report:open`** (`tools/report/`): unpacks a report zip into
  `corpus/_reports/`, prints the manifest as a paragraph plus the warnings out of
  the log slice, and stages the reported frame into `corpus/_unlabeled/` under
  the names `pages:pull` uses -- which is what turns a field failure into a
  regression test.
- **`npm run report:pull`**: the same for the device on the desk -- pulls the
  report folders not yet in `corpus/_reports/` and the log file over adb, then
  opens them. The adb half (`tools/pageEval/adb.js`) is now shared with
  `pages:pull` rather than copied. An emulator has no chat app to share through,
  and its user had to run `start-service.sh` over adb anyway.

- **Presets: a named configuration, and the store both pages read it from
  (`src/presets.ts`).** In both page compilations, like `skillOptions.ts`,
  because the settings page saves, deletes and loads one and the Quick Bar loads
  one mid-run. A preset is **how a round is played and nothing else** -- the set
  `SHARE_SLOTS` names -- so a preset and a settings code carry the same
  thing and the export is one code per preset. It is stored as values rather
  than as that code for one reason: decoding needs the schema (types, ranges,
  dropdown `share` ids), and the strip's compilation has none.
- **Which preset is loaded is matched, not remembered** (`presetMatchName`).
  Both pages compare the stored form against every preset when they redraw, so a
  value changed by hand afterwards drops the label back to "No preset" with
  nothing to invalidate -- there is no one place either page could have hooked
  to notice it otherwise, and a Quick Bar change reaches the form anyway.
- **The settings page's app bar: the preset dropdown and the save panel**
  (`src/settings.ts`, `src/index.html`, `src/index.css`). One name field with
  Save as new, Update and Delete under it, each enabled by what that name already
  means, so the buttons say what they would do. Loading one writes *every*
  shareable row -- the ones it does not name back to their defaults -- exactly as
  pasting a share code does, because a merge would make "switch preset" mean
  something different each time.
- **Export presets, in the Settings code card.** One line per preset, its name
  and its settings code -- so the export is also the import: `parseSettingsCode`
  already finds a code inside whatever text surrounds it, and a line pasted into
  the share box applies as it stands. Copy puts it on the clipboard; Save file
  asks the *engine* to write `presets.txt` under `Config.recordDir`, since a
  `file://` page has no filesystem, and the reply is what says so when no script
  has been started. `writeClipboard` grew the box to fall back to, because its
  last resort used to select the share code whatever it had been asked to copy.
- **`PageMessage.Presets`.** `LiveSettings` means "re-read the run", and most of
  a preset is rows no run can take -- so a strip that loaded one and nudged with
  that topic would have the panel push its own stale values back over half of it
  at the next save. The new topic means "re-read the store as well", and doubles
  as "the list of presets changed".
- **Gaston (`src/skills/gaston.ts`), under Unique.** His activation makes every
  tsum that *drops* a Gaston for the window, so the activation is worth however
  much board gets cleared while it is open. **The chain is a snake from the top**
  (`gastonSnake`): read frame by frame, the human's thirty-chain in
  `debug/gaston_correct.mp4` starts at the top-left corner, sweeps the top row,
  drops, sweeps back, drops -- so the window draws that. The rows are found
  first for the whole pile (`gastonRows`): judging "same row" hop by hop on a
  jumbled pile read the next tsum along as the row below, dropped, turned and
  dropped again -- a staircase down the diagonal, four off the top row and
  fourteen in all (`debug/gaston_debug_1.mp4`). The walk (`gastonSnake`) then
  takes the next tsum along the row or a straggler above it, else turns back,
  else drops to the nearest row below -- at its far end when the row is fresh,
  since landing one short leaves a visited tsum mid-row that a 47.5px reach
  cannot jump, and at its nearest tsum when re-entering. Both corners, every
  colour, longest kept. On synthetic hex piles it takes 100% of a single-colour
  board with no up-hops and ~96% of an 85%-Gaston one. Top-down on purpose,
  against the bottom-first the other long chains use: the gate has just seen the
  board full and landed, and clearing the top rows leaves the pile below unmoved
  for the refill. The refill gate between passes also stopped leaving early: its
  stale exit fired inside the pop animation of the chain just released, and the
  next pass scanned a board mid-clear and drew threes on it; it now has a floor.
- **Gaston's board gate is a count again, and the HUD is cut out of his board.**
  Off `debug/gaston_debug5.mp4` and its log: the window sat three seconds over a
  full board, then drew a five and a fourteen. A gate on circle *positions* had
  been tried and never opened -- through the same Hough pass, frames of a board
  that had visibly landed matched only 45-80% of their circles read to read (at
  a vote threshold of 10 a dozen of forty-odd circles move between frames), so
  every gate ran to its ceiling. It is the count (`gastonCountTsums`): full and
  not up by more than `countNoise` on two reads, behind the 3.5s opening floor
  and a `fillMinMs` of 1000 -- a clear takes ~10 tsums a second off the count,
  so any real clear reads short by then, while a cancelled one is back and full
  at ~1.1s -- with the ceiling for a board that never reads full. The short
  chains were the **fever bonus and combo counter**: drawn across the top of the
  play square, their 0/8/9/2 glyphs are tsum-sized circles; ordinary play drops
  their small cluster with the `uniqueTsumCount - 1` cut, but the colour-blind
  snake keeps every cluster and started on them, at the top corner where it
  starts. Replayed offline both routes began on the digits, and on the device
  those drags linked one, then five. `gastonFreeBoard` cuts every circle with its
  centre in the top `hudBand` of the square (1.25 tsums; every fever capture in
  the corpus has two to four glyph circles there, an over-tall pile at most three
  real ones). The charge is one chain at most: the closing chain, left to pop,
  ends the window, and only if none went out is one more drawn on the board as
  it stands -- never on the refill behind it, which is mixed and gave the "1"
  chains after the fever. `skill.gaston.pass` logs each pass's board and route
  so a short chain can be replayed offline.
- **Gaston's route is Gaston only, and his bubbles are found.** Off
  `debug/gaston_debug6.mp4` against its pass records: the game registered 14,
  17, 2, 1 and 8 of routes planned at 29, 35, 15, 22 and 28. A tsum links only
  while it is within reach of the chain's *head*, so the first leftover of
  another colour in a colour-blind route leaves every Gaston after it two hops
  from the head and the chain stalls for good -- every stall was on an ordinary
  23-33px hop, while 43-44px hops inside the same chains linked. The route now
  runs over his tsums alone (`gastonGastons`): the biggest clusters until they
  hold `paletteShare` of the board, plus anything within the scan's own merge
  distance of a centre remembered on `gastonPalette` for the window, so a hair
  cluster the leftovers outnumber later is still his. A snake that dead-ends
  early hands the points to `findLongestTsumPath`. And a third of the passes
  went uncancelled with bubbles in plain sight: `GameBubbleConfig` was
  uncalibrated (a bubble measures radius 15-18 in the play square, the range
  started at 16 and ran to 30, which took a face under a score popup), and the
  bottom row of bubbles sits half below the play square, so the skill reads them
  off a capture that runs `bubbleHem` lower (`gastonBubbles`). Smaller: every
  gate that leaves on a full count sits `landMs` for the last tsums to land
  (two boards were scanned with a band still in the air: 39 read, a route of 8);
  a clear left to pop holds the refill gate for its own length
  (`popPerTsumMs`); the closing chain is only waited on when it is long enough
  to fill anything (`chargeMinChain`), for longer (`gaugeWaitMs` 4.5s); and the
  bubble reserve is one.
- **Gaston's snake is colour blind, and the opening gate has a floor.** Both off
  the device log rather than a recording: windows planning the snake over the
  biggest colour cluster drew `chains: [13, 11, 19, 7, 4, 20, 6, 10]`, eight to
  thirteen passes a window, on boards that read 43 tsums -- where the same walk
  takes the whole of a synthetic single-colour pile. Gaston is one colour to the
  game and two or three to the scan (a tan face under black hair, and the Hough
  centre lands on either), so the snake now runs over the whole board array,
  with `extraClusterSlots: 4` keeping every colour in it; a leftover of another
  colour the drag crosses is inert, and the leftovers sink to the rows the snake
  reaches last. The done record carries `read` and `biggest` per pass so the
  split is visible. And `openMs` alternated 4500 and 1500 window by window: a
  board that was full when the button went is still forty circles under the dim,
  so the count gate cannot see the animation on its own and sits behind
  `openMinMs` (3s, under the 3.2-3.4s measured) now.
- **Gaston's last chain is not cancelled, and the tap follows a chain.** Read off
  `debug/gaston_debug2.mp4`: Gastons cleared after the window closes fill the
  gauge *as they pop*, through a three-second clear for a thirty chain, and the
  bubble cancel is exactly what cuts that short. So a chain released within
  `noCancelTailMs` of the close is left to pop, nothing pops a bubble between
  windows any more (the surplus above the reserve goes on the window's cancels
  instead), and after the close the choreography watches the gauge through that
  chain's clear (`gaugeWaitMs`), returning the moment it reads full so `useSkill`
  fires within a read or two, while the chain that filled it is still popping. A full
  gauge at the close gets a chain first for the same reason. Every pass now
  checks the board is still there, since the choreography runs blind for ten
  seconds and more and a round that ended under it would have had chains dragged
  across whatever came next. **Nothing here consults the chain settings**:
  between windows `chainLimits` is `{maxChain: 0, maxChainsPerScan: 1}`, and
  `npm run chain:bench -- --only=gaston` puts that uncapped search at 49 tsums of
  a 49-tsum board for ~10ms a scan on QuickJS-ng, worst 38ms. One chain per scan
  matters as much as the cap: the rest of a batch is planned on a board the first
  chain has already cleared, which on a Gaston board is what turns one chain of
  thirty into a twelve and two threes.
- **Gaston's window is anchored to the end of the activation animation, not to
  the tap.** Read frame by frame off `gaston_correct.mp4`, the tap lands at 8.0s,
  the board sits under a dark flexing figure until 11.4s and only fills with
  Gaston by 13.5s -- so a 6s window anchored at the tap is over before the board
  is worth looking at, which is what `gaston_wrong.mp4` shows. The gate is the
  tsum count and covers the animation and the first fill together, because they
  are the same question; it leaves on a full board or its ceiling and never on
  the count going stale, which under an animation reads as "finished filling"
  within one poll. No colour is identified anywhere: the longest chain on a board
  the skill has filled *is* the Gaston chain, and matching the skill-button
  portrait (his face, on blue) against his board sprite (an orange body) was the
  part that failed -- with it the window drew nothing at all. Bubbles are a
  standing claim (`claimsBubbles`) held at `bubbleReserve`; tsums sitting on one
  are held out of the plan, and the bubble is spent the instant the drag
  releases, which is what fits a second pass into the window. Level 6's 6s is the
  only measured number in `durationMs`, and the anchor is not measured either.
- **`chain:bench` gained the `gaston` scenarios**: one colour over the whole
  board with no cap, the one shape where the search has nothing to stop it early.
- **`tools/boardStudio/physics.json`: the game's own board physics.** The pile
  is **Box2D driven from `SceneGame`** -- cocos2d's own physics is never
  constructed -- so `HitData` (986 block ids over 11 convex polygons), the six
  bowl quads and the body and fixture constants are facts to be read rather
  than modelled. `HitData`'s per-vertex flag marks the *last* vertex and does not
  terminate before it; reading it as a terminator drops one vertex from every
  polygon and settles a pile 16% too tight.
- **`tools/build/`: the build as a dependency graph**, ~16s down to ~4s. Only
  the page docs, the dispatch traces and the shipped bundle need
  `build/index.js`, so everything else runs alongside the compile that produces
  it; output is buffered per step and printed in declaration order so the log
  still reads top-to-bottom. `zip.js` writes the archive in node, so `dist/`
  produces the same bytes whichever shell started the build.
- **`tools/docMedia/`: the clips the documentation embeds.** `media:record`
  captures the emulator window with ffmpeg's `gdigrab` and writes one marker per
  log record beside it, stamped with its offset into the video; `media:clips`
  cuts short per-feature clips out of that take. A clip is bracketed by an
  **event the script already writes** — `fever.start` to `fever.end`, or
  `skill.use` where `skill` is `elsa_coronation` — and never by a timestamp, so
  any take holding the moment supplies the clip and re-recording invalidates no
  entry in `docs/media.json`. Re-cutting is free; getting a round to play the
  same way twice is not possible at all. Takes are Matroska because the usual
  end is Ctrl-C, and MP4 loses everything when its index is not written.
  `media:check` is the gate against a library rotting silently: a document that
  says it embeds a clip and does not, a file nothing names, a clip older than
  the source it shows.

### Changed

- **The Quick Bar is a three-column grid at its content's width, centred**
  (`src/quickbar.html`, `src/quickbar.css`). Every stepper and toggle is its
  own width (fixed 18-unit step buttons, no `flex-grow`); the first two
  columns -- skill over level and items, scan over chain -- are `auto`, and
  the preset-over-bubble column is `minmax(56u, max-content)`, so it takes
  what its longer name needs and no more. The strip centres the block
  (`justify-content: center`) rather than stretching it, which on a tablet
  leaves the edges empty; a phone still fills. So `+Coin` no longer ellipsises
  at 440dp, the chain steppers line up, and a long preset name ellipsises only
  itself. Only the third column's cells carry `min-width: 0`: on the others it
  let an `auto` column be squeezed under its stepper. Report is narrower
  (3-unit padding), the dense band keeps the wide readouts left-aligned, and
  `qbRenderPreset` re-measures the Report hotspot, since a name of a different
  length now moves the chip. The toggles read `qb.bonusCoin` / `qb.bonus5to4`
  rather than the settings rows' names, which run long in zh-TW; the preview's
  `?presetName=` renames the loaded demo preset for the ellipsis case.
- **The Quick Bar's Report chip is live for the whole run, not only while
  paused.** Pausing presses the game's own Pause button, so a report from the
  paused strip only ever showed the pause menu. The page now names the chip's
  rect to the host (`setQuickBarHotspot`, `qbNameHotspot`), which keeps just
  that patch touchable while the script plays and forwards the presses; the
  rest of the strip stays untouchable, so the script's own taps are not eaten.
  The chip is disabled only when there is no run.
- **The round id's device half is the host's `getDeviceId()`** where the host
  has one; the local FNV derivation and its `tsum_record/device.id` cache stay
  as the fallback. Every MuMu instance mounts one Windows folder as
  `/sdcard/Download`, so that cache -- like the host's `script.log` -- was one
  file for all of them; the host now derives the id from what an emulator sets
  per instance and names its log `logs/script-<id>.log`. `state:view` and the
  docMedia follower read the name off the service's startup line instead of
  assuming it. `LOGGING.md` § With Logdy.
- **The play loop's liveness check is `Tsum#watchRoundEnd` now.** Same debounce,
  same `confirmGameOver`, same `round.over` -- moved out of the loop's tail
  because a coasting round has to watch for the end without playing, and one
  copy of that judgement is the point. `HudWatch` carries the debounce between
  turns; `RoundLook` is what a look answers.
- **The next round starts from the tally, not from the hub**
  (`nav.move.tallyToGame`). Its Play goes straight to the pre-round screen,
  where the round used to walk Close -> hub -> Play to reach the same place.
  A point battle's tally draws one centred Close and no Play, so the handler
  scores `ScorePagePlay` before it presses and spends one press per visit;
  anything it declines falls through to `nav.move.exit` as before.
  `pages:stats` reads the button off all five tally frames, that one included.
- **`CODEMAP.md` is an index again** -- 111KB down to 68KB. Its three inventory
  tables were 63% of the file and had grown into paragraphs restating the header
  comments of the files they name, which are better and are next to the code. A
  row is a clause now, and `## Keeping this file true` says so. `DEVELOPMENT.md`
  § File map went with it: it was a second copy of the same table, unchecked by
  `map:check` and drifted -- still placing `TiaraLayouts` in `data.ts` a release
  after it moved into `skills/tiaraMinniePlus.ts`.
- **Page-history frames are on for every run** (`PageRouter.keepShots`), where
  they used to follow "Debug game". A trail that only exists once somebody
  thought to collect it is never there when it is wanted. The cost is held down
  by `shotDepth` instead, a second number against `historyDepth`: eight visits
  keep a frame where twenty keep a line, and "Debug game" raises it to the whole
  trail. `Config.reportTrailFrames` is the one number both sides read.
- `TsumTaskController.runningTask` -- which job is on the screen right now, for
  an issue report taken while the run is paused inside one. The due list cannot
  answer that: it says what runs next, not what is halfway through.
- **`src/tsum.ts` split into nine files** -- 4,048 lines down to 716. One chore
  per file (`play.ts`, `mail.ts`, `hearts.ts`, `levelCap.ts`, `boxes.ts`),
  `board.ts` for the scan and the chains, plus `waits.ts` and
  `appLifecycle.ts`; `tsum.ts` keeps the class, `init`, the capture and touch
  wrappers and `exitUnknownPage`. A pure move: the emitted bundle is the same
  set of lines in a different order, byte for byte the same size. `interface
  Tsum` (`globals.d.ts`) was regrouped to match, since it claims to be ordered
  by the file that implements each member.
- **The logger's flood guard no longer blocks** (`src/logging.ts`). A burst of
  `LogBurst` lines goes out untouched and the allowance refills at one line per
  `LogMinSpacingMs`, so a loop that never stops logging still settles at 100
  lines a second; past that a line is dropped and counted, and the next line
  out carries `dropped` (LOGGING.md). A `warn` or `error` is never dropped. The
  old guard slept between two lines inside 10ms, which is what the deadlock
  under Fixed was made of -- and under the dispatch harness's per-row clock
  reset it was also sleeping out a *negative* gap, so most of `elapsedMs` in
  the traces was that artefact. The baseline is regenerated.
- **Bubble Strategy is on the strip** (`src/bubbleOptions.ts`), the third column
  now being the preset chip over it. The entries moved out of `settings.ts` into
  a shared file for the reason `skillOptions.ts` is one -- the panel and the
  strip offer the same list from two compilations -- and each carries a `short`
  beside its `title`, because the chip is a few characters wide and "All Bubbles
  Mid Chain" is an ellipsis there. `qbOpenSheet` and `qbFillOptions` are written
  against what the two lists have in common now, so a third dropdown on the strip
  is a `qbOptionsFor` entry and a cell in the markup.
- **Every control says when a change to it would land** while a round is being
  played: `qbRender` sets `data-when` from the engine's own `LiveSettings`, and
  quickbar.css draws a bar along the chip's bottom edge -- teal for this round,
  amber for the next, and half of each on the preset chip, which moves settings
  of both kinds. `quickBarState` carries `inRound` and `nextRound` for it rather
  than the page keeping a copy of the table. Off between rounds, where everything
  lands now and there is nothing to tell apart.
- **The strip has the screen's bottom edge to itself** (host change): the status
  line moved up under the floating bar and follows it, so `quickBarStrip` is
  `quickBarHeight` again rather than that less the line's height, and the chips
  get the band they were drawn at instead of a squeezed one. `.qb-cell-tall` and
  the dense-mode preset override went with it. The line is now in the half of the
  frame page detection reads, so `status.hideFromCapture` defaults on -- and on
  the `screencap` capture path, where that flag does nothing, the line has to be
  turned off instead.
- **Waiting for the next round is the default, and landing now is what a setting
  has to earn.** `LiveWhen.Now` is given only where the play loop re-reads the
  setting during a round, and each entry names that read site; everything else
  is `NextRound`, including a `LiveWhen` value added later and not taught to
  `quickBarHoldsBack`, which is written as *not Now, not Restart* for exactly
  that reason. Seven rows moved under the new default: the six bonus items and
  `trackRoundStats`. Nothing a player does changes -- `openRound`'s item screen
  is the only reader of an item and the whistle runs before it, so a +Coin tap
  lands on the same round it always did -- but `ts.coinItem` now describes the
  round being played rather than the next one, the banner tells the truth about
  when a tap takes effect, and `trackRoundStats` no longer writes a row for a
  round whose early coin reads it missed. `quickBarSetAside` coerces by the
  value's own type rather than by key, since `NextRound` is now where an
  undecided setting lands.
- **When a setting reaches a run is declared, not assumed** (`LiveSettings`,
  `src/quickbar.ts`), and `npm run live:check` holds the code to it. One entry
  per setting -- `now`, `nextRound` or `restart` -- replacing three conventions
  that lived only in prose and had been broken three times: a `case` in
  `quickBarApplyOne`, a line in `quickBarState`, and a judgement about whether a
  round already dealt can take the change. The check runs the built bundle in a
  vm and drives it rather than reading it, so it tests behaviour: every
  `SHARE_SLOTS` row has an answer; `now`/`nextRound` keys have a case and
  `restart` keys have none; every one is reported by `quickBarState`, and
  reported as the same value the apply said it took (which is what catches a
  unit conversion like `skillInterval` and would have caught the settings page
  and the run trading values forever); a `nextRound` key writes nothing but
  `pendingSettings` until `quickBarApplyPending`, and a `now` key writes the
  world at once; a held key reports the same value either side of the whistle,
  since `quickBarSetAside` cannot clamp and a range lives in one `case` each;
  and `playRound` still calls the whistle, without which every held setting
  would be stranded with every other check still passing. Each of the seven was
  verified by injecting the bug it exists for. It is a **required**
  build step rather than an optional one, unlike the four documentation checks
  beside it: what it catches is not a document falling behind. What it cannot
  decide is which of the three a new setting is -- that judgement is what the
  table records, next to the `case`, where a reviewer sees it.
- **`SHARE_SLOTS` is the set a code carries, not a subset of one**, and the set
  is **how a round is played**: `SHARE_TABS` (Gameplay and Skills) less the rows
  on them that shape the *run* rather than the round, which now say so with
  `neverShared` -- `autoPlayGame`, `roundDelayMinutes` and `trackRoundStats`.
  `bubbleStrategy` was appended, having carried `share` ids since it was written
  with no position to use them from, so it was in no code at all.
  `checkShareSlots` now reports a row on either tab with neither a slot nor a
  `neverShared` -- the precise version of the warning it used to make about every
  setting in the schema. Appending needs no `SHARE_PREFIX` bump; nor did cutting
  the three, since they were appended and removed inside this same unreleased
  version, so no code in circulation names a slot past `lorcanaCard`.
- **Applying a code no longer resets the rows it cannot carry.** `byKey` was
  every non-`neverShared` setting, so a paste put the mailbox, the hearts, the
  chore schedules and the box buying back to their defaults -- about 25 rows a
  code has never had a slot for, silently, on evidence it did not contain. It is
  the slot list now, so a paste is how the sender plays a round and nothing
  else. `isPrivateSetting` / `shareableSettingsByKey` became
  `isUnsharedSetting` / `sharedSettingsByKey` to say which set they mean.
- **The Quick Bar's rest column is now the preset chip** (`src/quickbar.html`,
  `src/quickbar.css`, `src/quickbarPage.ts`). The countdown and the Rest stepper
  went with it, along with `qbRestEndsAt` and the one-second tick; both remain on
  the settings page, where "Delay between rounds (min)" is the number and the Now
  button beside it is what the countdown's tap did. The chip is the one control
  with no `data-key`, so it goes to the engine through `applyLiveSettings` -- the
  settings page's own way into `quickBarApplyOne` -- rather than through
  `quickBarApply`, which carries one value at a time.
- **`openSelectSheet` and `qbOpenSheet` split into a sheet and a filler**
  (`openListSheet`, `qbShowSheet`). The preset list opens the same sheet over
  rows that are not settings at all, and the scrim, the Esc key and opening on
  the selected row were the only things the two lists shared.
- **Lorcana Aurora's drag is one touch event per bubble.** 70 chain records off
  three rounds fitted `dragMs = moves × 16 + 110`: the game takes one event per
  frame, so the per-hop sweep (up to twelve moves) was four events in five, and
  after the card nothing between two bubbles has to be crossed. `stepsPerHop`
  (0) is the way back if a jumped hop ever fails to link.
- **The wait before a chain counts tsums instead of waiting for the board to go
  still**, which cuts it from 1.7s to 0.7s. Those are different questions and
  they come apart exactly when the screen is busiest: `settleBoard` never gets a
  yes on a board carrying score popups and coin showers, and three waits in a
  measured round ran their whole 2.5s ceiling out on boards holding 39, 40 and
  41 tsums, which is full. Counted frame by frame off a recording, the board
  reaches its fullest a median of 0.45s after the settle gate and then sits
  there. So the wait leaves once the count has reached `refillEnoughTsums` or has
  stopped climbing, against the peak rather than the latest read since the count
  dips while a clear goes off.
- **A board that stops filling short of full gets one bubble spent on it**, once,
  to shake loose the slow clear that is holding it back -- the most central one,
  since the route is scored on how much board it crosses. Speculative: it fires
  on the minority of boards that plateau low (three of eight in the measured
  round, at 34, 37 and 39), and `poppedToFill` against `tsums` on a chain record
  is what will say whether a fuller board beats one more link.
- The window's budget is 9s rather than 6s, so `chainAttempts` means what it
  says: an attempt costs a 2.9s gate plus the wait plus a 0.6s release check, so
  at 6s a window whose drag the game refused twice gave up with a third attempt
  it was configured to have. Chain records also carry `gauge`, the skill
  readiness straight after the release -- her bubbles only link while the
  transformed skill is running, so a refused chain with the gauge still full is
  an activation that never fired.
- **The bubbles are read after the board comes back, not before it.** The settle
  gate is a clock -- it says the activation animation is over -- and the window
  was chaining the list that gate read, one to two and a half seconds before the
  drag went out. A recording read against its log showed why that is the wrong
  reading: the gate exits onto a board still clearing, tsums greyed out
  mid-clear and the last chain's flash across it, where the pass finds six or
  seven circles; a second and a half later the same board is clean and carries
  ten. So the window drew four bubbles where ten were standing, which from the
  outside looks like it did not chain them at all. Chain records now carry
  `atGate` beside `seen` to measure the gap. The circle pass itself is fine --
  nine of ten on a clean board, checked frame by frame against `cv2.HoughCircles`
  with the shipping parameters.
- **An activation draws one chain and hands the board back.** A screen recording
  of a whole post-card stretch, read against the log, put the old cascade at 21
  chains over 9 activations averaging 5.3 bubbles apiece: every chain it drew
  spent bubbles that would otherwise have stood in the next window's route, and
  three bursts of 5 cross far less board than one of 15. It also cost 1.5s
  waiting for the board before each of those extra chains. The burst's leavings
  now stand as the next window's head start, which is what lets the chains grow.
- The board wait is capped at 2.5s rather than 4s. Eight of the nine activations
  in that round landed in 1.0-1.6s; the ninth ran to 3.4s, and past about 2.5s
  the board is not coming back and the chain may as well go out onto what is
  there. It is now the only wait left in the choreography.
- **A link batch ends when a choreography fires mid-batch.**
  `maybeAutoTapSkill` answers whether one ran, and `Tsum.link` stops on it: the
  paths still to draw were planned on the board the choreography was handed,
  not the one it leaves seconds later, so they link nothing or link the wrong
  tsums. Every choreographed skill was drawing them; Aurora is where it showed,
  two stale chains clearing the board her next burst wanted.
- Chain records dropped the `onScan` boolean, and then `stage` with it: one
  activation now draws one chain, so there is only one pass left to name.
- **Every chain waits for the board to come back before it goes out, not
  after.** The wait used to follow the burst, so one chain spent the time and
  the next got the benefit -- and after the last chain of an activation there is
  no next, which is the wait that was doing nothing at all. Counting tsums
  showed what it costs: the window chain, the biggest of the round, went out
  onto 30 tsums where a full board is about 43, because her activation takes
  tsums off the board and the count is only two thirds back when the bubbles
  settle. Her burst clears the board around the bubbles and along the drag, so a
  third of the board missing is a third of the burst missing. A cascade chain,
  which did get a wait before it under the old ordering, was drawn onto 41.
- The budget is four seconds, which is a ceiling rather than a cost --
  `settleBoard` returns the moment the board lands, about 1.1s of it in the
  measured round. A budget that does run out ends the cascade.
- `findTsumCount` (`src/pathfinding.ts`): `findTsums`' circle pass counted and
  nothing else, no clone, blur or colour conversion. Chain records carry
  `tsums`, the board a chain was drawn onto, which is what tells a small chain
  from a full chain onto an empty board.
- **The wait after one of her bursts had a 200ms floor, and that was wrong.**
  `BoardSettle.minMs` is 500 because a clear holds the board motionless before
  the tsums drop, so the settle was returning during the burst's own freeze and
  the cascade then read a board still refilling: 24 of 30 of its reads
  disagreed with the one 30ms before it, and chains came out at 2 and 3 on a
  board carrying more. Floor back to 500, and the budget up to 700ms plus 100 a
  bubble (capped 2500) since her burst clears several times what an ordinary
  chain does.
- The cascade stops at three bubbles rather than two: a remnant of two is worth
  more as two links in the next activation's chain than as a burst of its own.
- The pre-card sweep is back near the blind grid's cost -- two passes rather
  than three at a 150ms gap rather than 300, and no settle afterwards, which is
  what the grid did too. It had grown to 4.8s against the grid's 2.6s, on eight
  or nine activations a round.
- **The transformation is noticed sooner**, because until it is the skill plays
  its untransformed half -- a sweep popping the bubbles her transformed skill
  just made for a chain. The card check polls at 250ms rather than 500 (the gap
  is multiplied by `ringAbsentReads`), and the pre-card sweep lifts the
  post-activation quiet when it ends (`lorcanaEndSkillQuiet`): having found
  settled bubbles on the board it knows the animation is over, where the 4s
  quiet is only a worst case.
- **Nothing chains bubbles between activations any more.** They stand for the
  next window, whose route takes every one of them: chained as they turned up
  they went out 3.5 at a time against the activations' 5.3, and a chain is worth
  the board it crosses, so one route through eight bursts more than two through
  four. The stillness gate on that path is gone with it, and the activation gate
  still cannot pass in the first 1.5s after the tap (`bubbleEarliestMs`), so
  bubbles kept standing cannot start a drag before the card covers the board.
- **After the card the play loop links long chains and taps a bubble into every
  second one.** The game pays a bubble for a long chain and "Maximum Chain
  Number" defaults to 3, which earns none, so her `chainLimits` searches to 12
  after the transformation (`chainMaxAfterCard`) -- the length `Tsum.link`
  already treats as reliably worth a bubble, the drawn chain coming out shorter
  than the plan. Hoarding every bubble would leave the board clearing no faster
  than tsum chains clear it, so one is popped into the clear of every second
  chain of 6+ (`popBubblesAfterChain`, a new `SkillHandler` hook replacing
  `chainBubbles`), which costs the next route one link.
- The release check follows each bubble read to read at `trackTolerancePx` and
  wants two reads agreeing, instead of matching where the drag left them at 8px
  -- drift passed a chain of 7 as taken with six bubbles still standing.
- The wait after a burst is `settleBoard` with a 200ms floor, not a 0.5–1.8s
  sleep. `settleBoard` takes an optional `minMs` for it.
- **The pre-card sweep is aimed** (`lorcanaAuroraSweepBubbles`,
  `skill.lorcanaAurora.swept`): the same gate as the chain, every bubble tapped
  where it stands, a second look for the misses. The blind grid was 28 taps and
  four 300ms rests -- 2.6s an activation, eight activations before the card in
  the round measured -- and started at y=1000, leaving the upper board unswept.
  Passes repeat 300ms apart while circles remain, up to three: taps in the lull
  before the game takes input back pop nothing, and on 6 of 18 sweeps the
  second look found every bubble still up.
- Board Studio opens on the 1080×1920 screen rather than the bare play square:
  it is the game's own coordinate space, and every corpus capture is at it.
- Board Studio's defaults are set where the captures measure -- collision size
  109% and 48 pieces, spacing still 25. Hough over 22 in-round captures puts heads
  25.5 play units apart and 25.5 across, where the game's polygon at 100% packs
  to 23.2; template-matching the game's sprites into the captures finds them
  drawn within a few percent of one sprite pixel per game point, so the
  looseness is in the packing, not the drawing. `README.md` § Matching a
  capture.
- Board Studio settles on that polygon and that bowl, instead of on silhouettes
  traced from each tsum's art and an arc fitted to captures. A tsum collides as
  one symmetric hexagon whatever its ears do, 925 of the 986 ids share it, and
  `silhouette.js` is now only about drawing -- plus locating the head inside the
  sprite, which is what hangs the polygon off the circle the scan finds.
- The library independently puts a tsum at 24.7 play units against
  `Config.tsumWidth: 25`, and its bowl floor within a unit of the two heights
  measured off captures.
- **planck replaces matter-js**, so the pile now settles in the game's own engine
  (a port of Box2D 2.3) on the game's own step -- `min(dt, 1/30) x 10` at 6 and 2
  -- in metres at its PTM of 10, since Box2D's tolerances are absolute lengths.
  A body's origin can sit anywhere in Box2D, so the head is the origin and the
  centroid bookkeeping matter-js needed is gone.
- **Board Studio records the pour and can scan any frame of it.** A frame is a
  step, and a step is what `updateBlocks` advances on a 60fps device, so the
  strip under the board plays the fall at the speed it happens and `←`/`→` walk
  it. Every frame goes through the real planner, so the track plots chains found
  against frame with `taskPlayGameQuick`'s threshold of three drawn across it,
  and the readout puts the frame the pile stops moving -- what `Tsum.settleBoard`
  waits for -- beside the frame the planner's answer stops changing. Pieces still
  above the play square are left out, as the scan leaves them out, so frame 0 is
  an empty board. `POST /api/timeline` and `/api/frame` are separate routes off a
  one-entry board cache, so scrubbing costs a scan rather than a pack and
  dragging a slider redraws as fast as it did.
- **Board Studio plays the board out**, not just one scan of it. `plays` runs
  that many turns of the play loop -- scan, clear only what the game would
  *accept*, top the board back up to the count it poured with, scan again -- all
  into the one film, so a round is scrubbable frame by frame and each scan is
  ticked on the strip. Clearing and refilling are one settle, as they are in the
  game. A frame carries every piece the round has held, cleared ones parked below
  the rim where the scan's own "not on the board" test already hides them.
  `batch` reports the round, which is the only way to ask whether a *setup* runs
  dry rather than whether one board did.
- What it found first: **playing a board degrades it even with the piece count
  held constant** -- 120 six-play rounds at a fixed 52 tsums go from 5.8 chains a
  scan and 0.8% barren to 4.0 and 8.3%, so it is the arrangement and not the
  count. And ice costs a *round* far more than a board: eight frozen tsums never
  let a scan clear a full nine and put 22% of the sixth play's scans barren
  against 4% on the same seeds with none, while chains a scan barely move.
- **Which five tsums a board gets, read out of the library.** It is a rule, not
  a draw: `Block::Entry::lottery` shuffles everything eligible and takes greedily
  under `pickTargetByColorBit`, where each tsum carries a *mask of the colour
  groups it clashes with* (`CConfigData+0x1d0`, stride 24, `colorType` at +0 and
  `colorBit` at +4, mirrored on `TsumMast`), falling back to
  `pickTargetByColorType` -- same colour index only -- when five will not go.
  MyTsum enters first by its `TsumSubCategory` through
  `Entry::SetMyTsum::{Default,Charm,Pair,Set,Ink}`. The table itself is master
  data loaded at runtime, so Board Studio's **Separated five** runs the game's
  procedure over a hue reconstruction and reports the closest pair by
  `distance3D` -- because the game's rule and `ChromaMergeDistance` are different
  relations over the same tsums. That gap is measurable: a random five holds a
  merging pair 52% of the time and a rule-picked five 12%, so the rule removes
  most of the script's colour-merge exposure and cannot remove all of it. It
  reaches the board: 0.2% of scans barren under the rule against 1.5% for a
  random five. So the studio's own **Random five** was handing out a merging
  roster half the time, which is a worse board than the game would ever build.
- The pile settles at 23.2 rather than the 24.4 the traced discs gave, and that
  is not the model getting tighter: the hexagon's six faces rest at
  `23.2, 23.2, 23.3, 23.3, 24.7, 25.3`, so nearest-neighbour can only ever report
  the smaller of two contact families where a disc had one. The captures' 24-26
  band straddles both. Every § *What it has said so far* number was re-run for a
  third time and the conclusions held.
- **`build.sh` and `build.ps1` translate flags and nothing else.** Holding the
  same recipe twice had cost what it usually does: the PowerShell one wrote CRLF
  into `dist/*.html` and built its archive with a different tool, so the two
  shells shipped different bytes from one tree. `-ADB` alone now pushes, as
  `build.sh -a` always did.
- **`minify.js --batch` reprints a list of files in one process.** Node costs
  ~230ms to start and terser ~300ms more to load, against ~50ms to reprint a
  page script -- so the eight page scripts spent 2.4s booting to do 0.4s of work.
- **A Box Buying sweep says where it is**, as `Box buying 3/10` on the banner
  before each purchase. The banner and not a log line: a rendered record leads
  with its event and message, so a counter behind them wraps off a bar two lines
  tall. One showing each (`plays` 1), so no number is left parked over the game
  once the sweep is done. `box.bought` carries `purchase` and `limit` for the
  file; `buyOneBox` takes the pair as arguments, and the loop stays the only
  thing that counts and stops.

### Fixed

- **The Quick Bar's steppers lost their `+` on the device.** The emulator's
  WebView is Chromium 110, which measures a flex container's intrinsic width
  from what its items contain and counts a bare `flex-basis` for nothing, so
  each stepper column was measured at its glyphs' width, laid out at that, and
  clipped its own `+` (and "Chain" to "Chai"); the desktop preview, on a
  current Chrome, never showed it. The step buttons carry a `width` now, and
  the cyclic `max-width: 100%` on the readout text -- the other thing that
  engine resolves to nothing -- is gone, with the wide chips' value stretched
  to its readout instead. Verified under a Chromium 110 snapshot;
  `DEVELOPMENT.md` § Seeing it without a device says where to get one.
- **A board the game had stopped taking chains from was drawn at forever.** A
  chain the game refuses leaves the board untouched, so the next scan planned
  the same chain and drew it again -- the fixpoint `Config.linkReach`'s comment
  names, seen as the same few tsums lighting up over and over with nothing going
  off, and cleared by hand with the Fan. Reach past what the game accepts is one
  way in, a merged colour pair (12% of rosters) the other, and neither is worth
  telling apart from the loop: both leave the tsums the last drag went over
  still standing, which `boardStillHolds` (`src/pathfinding.ts`) counts off the
  next scan for free. Four such dead scans running and the play loop fans the
  board itself, settles it and re-scans. Not gated on "Use Fan?" -- that setting
  is a preference about stirring a board that is still playing -- and not on
  `fanWouldBeWasted()` either, which answers "the skill is nearly ready" and
  would refuse the rescue for the whole of a stall, since a board where nothing
  clears never fills the gauge. `board.deadScan` (debug) and `board.stalled`.
- **Rapunzel+ chained three tsums after her activation.** Everything her light
  gate reads is a ratio against `rapunzelBaseLight`, one sample taken in
  `beforeActivate` a moment before the tap -- and it was taken *after*
  `popGameBubbles`, so it measured the pop flashes rather than the board, while
  cutting `useSkill`'s readiness debounce from 200ms to 30ms moved the whole
  approach ~200ms earlier into the clear that filled the gauge. A baseline read
  over the hole that clear opened is low, the veil then registers as no
  darkening at all, and the `darkByMs` escape returned at ~700ms -- dead centre
  of a veil that sits at luminance 41-43 until 1.45s -- so all three board reads
  were taken under it. The sample now comes before the pops, and `litMinMs`
  (1500ms) floors both exits: not seeing the veil is a finding about the
  reading, not about the board, so it is waited out by the clock. Unverified on
  a device -- `skill.rapunzelDone` is what says so, `sawDark` and `litMs` first.
- **A Quick Bar change could break the round it was made in.** The strip is
  opened over a round that is *paused*, not one that has ended, and three of the
  settings it writes describe how that round was **set up**: `skillType` (the
  tsum on the board, its choreography and its per-round state), `bonus5to4`
  (`uniqueTsumCount`, which is how many colour clusters every board scan keeps)
  and `lorcanaCard` (an extra cluster slot plus the medallion poll that
  blind-taps where the card sits). Written onto a board already dealt they did
  not switch the round over -- a scan short of a colour cannot plan over it, so
  the loop went on reading a board it had no chains for. Picking Lorcana Aurora
  from the skill sheet hit two of the three at once, because the option
  `enables` the card handling, and a preset hit all three. They are now set aside
  in `ts.pendingSettings` and applied by `quickBarApplyPending` at the whistle,
  before the walk that opens the pre-round screen -- which is also where the 5>4
  item is bought, so the item and the colour count still agree. `quickBarState`
  reports them through `quickBarAsked` so both pages draw the new value at once,
  and the engine banners "Applies at the next round".
- **Loading a preset, or picking a skill, from the Quick Bar froze the run and
  the overlay with it -- in or out of a round.** This, not the board, was the
  freeze. Both write two log lines inside ten milliseconds, and the logger's
  flood guard spaced consecutive lines with `sleep()`, which is the host's
  pause gate. A page only ever evaluates `quickBarApply` and
  `applyLiveSettings` while the run is paused, and the host answered them on
  the one thread that reads its control socket, so the second line parked that
  thread on a gate that only the Resume queued behind it could open. Every
  button then timed out, and the strand watch ended the run once the overlay's
  claim lapsed. Fixed on both sides, each sufficient alone: the guard no longer
  sleeps (Changed), and the host now answers an `Eval` through the gate and
  off the reading thread. `npm run live:check` drives every page entry point
  twice in one evaluation and fails on any gated call (`entry`); it reproduced
  this before the fix.
- **Most of a preset never reached a running script.** `quickBarApplyOne` had a
  case for eleven settings, so `applyLiveSettings` silently dropped the other
  twelve rows a preset carries and the run kept playing under the old ones until
  the next Play -- a preset built around a skill arrived without the bubble
  strategy, the fan or the link reach that make it work. "Link MyTsum first",
  "Use fan", the five remaining bonus items, skill waiting time, auto-tap,
  no-skill fever seconds, bubble strategy, link reach and round-statistics
  tracking are all live now, and reported by `quickBarState` as the invariant
  requires. Only `autoPlayGame` and `clickAssist` still need a fresh Play: they
  decide which tasks a run registers.
- **The periodic blind bubble sweep ignored a skill's standing claim.** Under
  "All Bubbles ASAP" it fired on the strategy alone, so a skill that hoards
  bubbles for its own activation (Gaston's cancel, Aurora's chain) had the hoard
  swept away between windows -- the aimed pops already respected the claim, this
  one did not. It is now gated on `skillClaimsBubbles` as well.
- **The three Box Buying settings did nothing until the script was restarted.**
  "Box to buy", "Buy ten at a time" and "Purchases per sweep" had no case in
  `quickBarApplyOne`, so `applyLiveSettings` dropped them and the sweep kept
  reading what `buildRun` had put on `ts` -- change the limit, press **Now**, and
  the sweep still bought the old number. All three are live now and reported by
  `quickBarState`, as that switch's invariant requires. The schedule beside them
  is still start-only: it is the task's interval, fixed at registration.
- **`buyBoxesNow` applies the form it is handed before queueing the sweep.** The
  panel's save is pushed on the host's worker thread while the Now button comes
  down the bridge, so the two are not ordered; the sweep is queued on what the
  page just saved rather than on whichever arrived first.
- **The app bar's save and theme buttons sat above the version pill and the
  preset dropdown.** Pico gives every `[type=button]` a bottom margin, and the
  bar centres each item margin box and all; `.preset-select` zeroed its own and
  the two round buttons did not. Both now do.

## [0.11]

### Summary
- The Skill Type list is split into Burst, Bubble and Unique, each with the plain option first and the named tsums after it by name.
- Outside tools can now follow a run's rounds as they happen.
- A Skip Medals switch leaves Mission Clear medals in the mailbox and scrolls past them, so receiving hearts one by one collects only hearts.
- A round played in a point battle no longer leaves the script stuck on the score page until the game restarts.
- Rounds turn over faster: play resumes as soon as a skill's clear has landed and as soon as a new board is up, instead of waiting fixed seconds for each.

### Added

- **Skip Medals** (`receiveHeartsSkipMedals`, Hearts → Mailbox): the one-by-one
  mail flow steps past a Mission Clear medal instead of opening it, and scrolls
  on when a screenful of them hides the hearts underneath. The list only gives up
  the row a tap lands on, so the rows are *found* rather than assumed --
  `readMailRows` takes each Check button as one unbroken run of gold down a
  column that misses the lettering, and reports it as the offset every
  `outReceive*` probe moves by to reach it. That is what lets a scrolled list,
  which does not come to rest on a row boundary, read at all; at the home
  position the offset is 0 and the flow reads exactly as it did.
  `MailList.scroll` travels 505px, half a row out of phase on purpose: a run of
  Mission Clear mails is drawn identically, and a scroll by a whole number of
  rows would leave the screen looking untouched -- which is what the sample grid
  reads as the end of the list. The scan only runs with the mailbox actually in
  front of it (`isItem` at the home position, `gPages.matches(MailBox)` once
  scrolled), so it can never find a gift dialog's own gold buttons and aim a tap
  at one. `MailList.maxScrolls` bounds a pass that keeps finding only medals, and
  every gift that does land refills it.
- `Tsum.dragList`: the drag-and-see-if-it-moved half of `scrollFriendList`, now
  shared with the mailbox. Both lists' end-of-list test is the same reading --
  the end is where a drag changes nothing -- so it is one function taking a
  `ListSample` grid. `hearts.scrolled` reports `needed` in place of `of`.
- **Broadcast events** (`src/scriptEvents.ts`, `ts.emit`): `run.started`,
  `run.stopped`, `round.start`, `round.over` and `round.end`, so an outside tool
  can follow a run instead of scraping the log. `round.end` is emitted from the
  *caller* of `finishRoundStats`, which returns early when round stats are off --
  an event stream must not depend on a stats setting. The transport is the
  host's, `../game-automation-app/docs/EVENTS.md`.
- Every `round.*` event carries the round's own `id`, so a consumer that several
  emulators dial into can reconcile one round's events: `round` counts a single
  device's rounds and starts at 1 on each, and the host's `device` only separates
  the streams. It is the CSV row's UUIDv7, now minted by `beginRoundStats` at the
  whistle instead of by `writeRoundStats` at the write, so the row and the events
  that announced it are one identity -- and it exists whether or not a row is
  written. `RoundOutcome.id` went with it.
- `round.start` and `round.end` carry `settings`: the gameplay settings the round
  was played under, the same list the stats CSV records as columns
  (`statsSettingsPayload`), off the same round snapshot. Values keep their types
  rather than becoming CSV cells, so a switch is `true` and not `"T"`. A consumer
  can group rounds by what they were played under without waiting for the file.
- **`npm run events:docs`** (`tools/eventDocs/`): renders `EVENTS.md` from the
  `emitEvent` call sites. The only tool here that reads the TypeScript program
  rather than the built bundle -- a bundle has thrown away the file, the line and
  every payload field's type, which is all of what the document is. Fails on a
  name that is not a compile-time constant, one `Emit` does not declare, or one
  event emitted with two different payload shapes. Run by the build.
- **`npm run quickbar:preview`** (`tools/quickbarPreview/`): the Quick Bar page
  in a desktop browser, with a stand-in engine answering `quickBarState()`,
  `quickBarApply()` and `roundDelaySkip()` and pushing `onGapState`. The values
  are one editable object plus query-string overrides, so the strip's layout, its
  languages and its greyed-out states can be iterated on with no device attached.
  Staged into `build/`, never into `dist/`: `src/quickbar.html` does not name the
  fixture, so the shipped page cannot pick it up.
- **A `help:` line on every settings row that renders a control**, plus one on
  the Items card carrying the Coin cost once instead of seven times. The three
  "Waiting time before repeat" rows share a title, so each carries its own help
  key to say which job it paces. Only the two value-less rows are left without
  one: Share settings, whose card note already says it, and Build date, a note
  row with no help slot in the template.

### Fixed

- **A round played in a point battle left the script stuck on the score page
  until the stall guard bounced the game.** That tally offers no replay, so it
  draws one centred Close (x 337..740) where an ordinary round draws Close
  (97..502) beside Play (575..982). Nothing recognised the row: the count-up
  guard asked for the old Close and Play spots and read a finished tally as one
  still counting, so the wait spent its full 60s and the round went to the CSV
  with no score, and `ScorePage.back` then tapped panel blue for ~40s until the
  guard restarted the app. Both now use the overlap of the two rows -- probes at
  (415,1582) and (410,1726), `back` at (420,1650), each ~80px inside every edge
  of both buttons -- so neither has to tell the layouts apart.
  `corpus/ScorePage/point-battle-one-button.png` is the frame, and
  `pages:stats` gates the guard against it.
- **The Quick Bar and the settings page disagreed about what a setting was,
  until the run was replaced.** Three copies exist while a run is on -- the
  form, the running world, and the strip that draws from it -- and nothing read
  anything back: the settings page loads `localStorage` once, at load, and the
  host never reloads it, so a change made in the strip stayed invisible there
  and Play then started the next run on the stale form, undoing it. They are
  kept in step through the running world now, the one thing both pages can see:
  `flushSettings` hands the saved form to `applyLiveSettings` (`src/index.ts`),
  and `pullLiveSettings` reads `quickBarState()` back on the way onto the screen
  and every 3s while there, because both windows can be up at once. A settings
  change to one of those rows therefore lands on the run without a Play.
  `quickBarApplyOne` (`src/quickbar.ts`) is the one list of what a run in
  progress will take, and both ways in go through it. `quickBarState` now
  reports `lorcanaCard`, which no cell draws: anything the switch can take has
  to be readable, or the settings page pushes its own stale value back over it.
- **That agreement then waited out a poll on each side, up to 3s.** The two
  WebViews can reach each other through the host now --
  `JavaScriptInterface.broadcast(topic)`, fanned out by `broadcastToPages` to
  every page but the sender -- so whichever page has just had a change confirmed
  nudges the other and it reads the running world at once. The nudge carries no
  values: the engine clamps, and a skill can hold another setting off, so a page
  that hears one re-reads `quickBarState()` rather than believe what arrived
  sideways. It is sent *after* the engine answers rather than beside the write --
  `pushLiveSettings` switches to the answered call and the strip nudges from
  `onQuickBarApplied` at `qbInFlight === 0` -- because the host dispatches
  `runScript` onto a pool, so a read told to go could otherwise overtake the
  write that told it and redraw the value it was already showing. Both polls stay
  underneath as the floor: a desktop browser has no bridge to be nudged through,
  and a setting the engine moved by itself announces nothing.

- **Skill names in the Quick Bar were cut off along the bottom** -- the strip's
  own name and every row of the picker, so "Cpt. Lightyear" lost both its tails.
  The page's line height is 1, which is the em box and shorter than the glyphs,
  and a `<button>` clips at its content box rather than its padding box: the
  ellipsis's `overflow: hidden` therefore took the descenders off. `--qb-lh`
  (`src/quickbar.css`) is the line height for text drawn inside a clip, and the
  option's padding gave way to it so the list is the length it always was.

### Changed

- **The wait after a skill fires is a board-settle gate, not a rest.**
  `skillRandomizeAndWait` runs `Tsum.settleBoard` with "Skill Waiting time" as
  the budget, so the setting is a ceiling, spent in full only on a board still
  moving at the deadline. `BoardSettle` (`src/data.ts`) is the grid: a
  play-square brightness diff with a 500ms floor, for a cut-in that holds the
  board still before its clear. Tiara Minnie+ keeps her own tuned copy.
- **After Start, the round is watched in rather than slept for.**
  `nav.move.startToGame`'s flat 5s is `Tsum.awaitRoundStart`: peek until the
  pre-round screen has gone and the board fingerprints, then `settleBoard` for
  the tsums dropping in. A round's `seconds` now count from the board rather
  than from five seconds after the tap.
- **App launches and restarts poll instead of sleeping.** `startApp`'s 10s is
  `awaitAppUp` (focus, then a first fingerprint, up to 30s); the force-stop
  rests in `forceRestartApp` and `taskTsumAppRestart` are `awaitAppOff`. The
  navigate loop's 5s startup wait is a `settleScreen` budget, so it no longer
  stacks flat on top of the launch.
- **Two rests that waited for nothing are gone**: the 30ms after every board
  scan in `scanBoardQuick`, and the 1.4s around `init`'s two mkdir calls.
  `start()`'s 500ms before the loop is a 50ms yield, which is all the stop
  handshake needs of it.
- **Both readiness reads in `useSkill` are 30ms apart** (`SkillReadDebounceMs`):
  the ordinary path's 200 was 40x the read it separated, and the overload path
  had been proving 30.
- **The settings page is fully translated in `src/uiZhTw.ts`** -- 61 keys, most
  of them the `help:` lines added this version, plus the Boxes card and the Run
  order line for it. Taiwan is 223/235. What is left out stays out on purpose and
  the file's header says so: the Quick Bar strip (`qb.*`) and the box dropdown's
  four option labels, which name the store's own tabs.
- **`round.start` is emitted on the pre-round screen, just before Start is
  tapped**, rather than once the board is up: a recorder that opens on it now has
  the bonus items in frame. `ts.openRound()` (`src/tsum.ts`) mints the id, takes
  the settings snapshot and emits, and `nav.move.startToGame` calls it between
  the item check and the tap. It is gated on `ts.openingRound`, which only the
  play task sets -- click assist walks to the same board through the same
  handler and closes no round. `taskPlayGameQuick` calls it again on arrival, for
  a round that never passed that screen, and restamps `roundStartedAt` there so
  `duration_seconds` still measures play and not the walk in.
- **A navigation plan's floor is spent looking, not sleeping.** `NavPlan.settleMs`
  is `holdMs`, and `PageRouter.holdGoal()` watches the destination until two looks
  running agree on it instead of sleeping the budget out. The friend page's three
  seconds were paid in full on all 50 arrivals of a 13-hour log — a flat 3.92s
  each, 205 seconds — and bought nothing, because the event window they guard
  against cannot be seen through a `sleep`; a look sees it and the dismiss band
  presses it away. An arrival now costs ~0.4s of hold, and the budget is a cap on
  a screen that will not hold still. `page.heldOff` is the debug record.
- The heart sweep hands back at the turn between its halves, not after it.
  Reopening the ranking to find our own row is two navigations, and `sweepHearts`
  returns *true* at the end of a half, so a sweep queued from a Now button used to
  wait out the whole round trip. The next run pays one screenful at the list's end
  for it.
- **A control held down is recorded once, not once a tap.** Both pages debounce
  the expensive half of a change and draw the cheap half at once. The settings
  page waits 300ms (2s at most through a burst) before reading every control,
  rewriting the stored object and rebuilding the Run order card; `saveSettings`
  now schedules, `flushSettings` writes, and Play, the two Now buttons, a reset
  and the page being hidden all go through it so nothing waits past the panel.
  The Quick Bar waits 350ms before crossing the bridge, coalescing to the last
  value per setting and patching localStorage once for the batch -- so a stepper
  held down costs one apply, one reply and one state read instead of ten of each.
- The Quick Bar draws a change from the tap rather than from the engine's reply,
  which is what the debounce needs and also fixes a race it did not have to be
  fast to lose: an in-flight state read used to overwrite a value already tapped
  past, leaving the next tap stepping off the old one. A state read is now held
  while a change is pending or unanswered, and unconfirmed values are laid back
  over any read that crosses one.
- **The Skill Type dropdown is grouped.** A `SettingSpec.group` (a `UiText` key)
  on a dropdown entry makes both sheets start a new block under that heading
  wherever it changes, so the list's own order does the grouping and no sort
  runs at render time. `SkillOptions` is now Burst / Bubble / Unique — what the
  activation leaves behind, not how much the choreography does — with the
  generic entry pinned first and the rest by English name; No Skill declares no
  group and trails the list. Share letters and ids are untouched, so codes in
  circulation still mean what they meant.
- **The Quick Bar's chain steppers and bonus chips swapped columns.** Scan and
  Chain are the stacked pair now (`.qb-col-chain`), and +Coin and 5>4 split the
  skill row with the level: a stepper carries a name over a number and wants the
  width a third of a row cannot give; a chip that is its own label does not.
- **The coin block is a `<table>`.** Names down the left as row headings,
  figures right-aligned on one edge with a hairline between the rows, so base
  against final is read down a column. English capitalises Base / Final / Rounds
  to match the strip's other labels.

## [0.10]

### Summary
- Lorcana Card setting added: plays the Lorcana Tsums' transformation, tapping the card when it appears and clearing the ink stones their skill leaves behind.
- Lorcana Aurora skill added, chaining every bubble on the board into one drag the moment they settle once she has transformed.
- Picking a skill that needs a setting now switches that setting on for you.
- Boards where red, green and yellow tsums sit together are read properly now, so chains get made where the script used to find none.
- Sending hearts no longer stalls on the Gift a Heart screen and skips the friend.
- Box Buying finds the limited-time Select Box now, instead of saying the store is not selling it.
- The "Burst bubbles" skill is now called "Burst + clear bubbles", and clears the whole board after the skill instead of only the bottom third.
- Chores start in a fixed order rather than the order of their wait settings, and a sweep asked for with a Now button goes before the next round instead of after it.

### Added

- **`npm run dispatch:eval`** (`tools/dispatchEval/`): golden traces for the
  dispatch queue and the scheduler, off the built bundle with no device. One
  row per `Page` entry x navigate goal x look x age pins the exact taps and
  waits the queue sends out and the handler that claimed the frame; one row per
  settings preset pins the order the loop takes the jobs in, with the real
  `buildRun` doing the registering. A change made for one page that moves
  another page's row fails there, with the row named. The build runs it
  non-fatally; `dispatch:update` rewrites the goldens, and the diff is the review.
- What its first run showed (fixed under Changed): jobs started in
  *registration* order, not longest-interval-first as the Run order card said
  -- a job just registered displaced the deferred registration of the next,
  because the old pick took a longer interval over a higher priority -- and a
  sweep asked for with a Now button ran after the first round rather than
  before it. The blind `nav.move.back` claims 534 of the 1008 dispatch rows.
- `src/runPlan.ts`: the task table, in both compilations. `buildRun` registers
  it and the Run order card lists it, so the two cannot drift.
- **The Lorcana transformation** (`src/lorcana.ts`, the **Lorcana Card**
  setting). A Lorcana tsum is two tsums with one gauge between them: its skill
  leaves one bubble holding an ink stone every time it fires, and when the ring
  round the skill button fills a second time the game slides a card up from the
  bottom edge that transforms it. A mode of the board like fever time, so it is
  one setting rather than a skill -- a Lorcana tsum set to plain "Burst" still
  transforms.
- The transformation is read off the skill button, not off the card. Until it
  happens the button is a gold-rimmed medallion with the gauge ring inside the
  rim; after it, the ordinary rounded square. `ts.lorcanaReadMedallion` samples
  the rim at 36 angles off one native-resolution crop (a couple of pixels in
  matcher space, so neither a `Page` entry nor a `variant`): 0.39 or more of
  them read gold on the live medallion, 0.14 or under on every other board
  frame. The state moves once a few polls agree, back as well as forward --
  with a warning -- so a burst over the button cannot leave the wrong half of
  the skill playing all round. The card itself is not detected: while the
  medallion is there its spot is tapped blind every poll, because the one tell
  the captures gave it (the medallion's track lit gold) is a transient the
  live card never shows -- it sat untapped for as long as it took to tap it by
  hand.
- The ink stone's bubble is popped aimed, as a deliberate override of the Bubble
  Strategy setting: it is the one bubble hoarding cannot pay for, because until
  it goes the next activation adds another stone. It is picked out by reading
  cool (`b - r`) where every other bubble reads warm -- +146 against +22 for the
  runner-up on the frame it was measured on -- and where no bubble stands out,
  every bubble is tapped instead.
- `lorcanaFindBubbles`, a bubble pass of its own rather than `findGameBubbles`.
  That one is tuned for the play loop, where a missed bubble is one the next
  scan finds anyway, and answers with about two thirds of the board; here a
  missed bubble is a stone left standing or a bubble Aurora never chains. Over
  the three captures with bubbles on the board it finds 8/8/6 against 4/4/4,
  paying one to three circles drawn round a tsum -- affordable, since a stray
  tap is not a drag and a stray point is a detour.
- **Lorcana Aurora** (`src/skills/lorcanaAurora.ts`), the first skill with two
  halves. Before the card she is Burst Bubbles, whose blind sweep is what takes
  the stone bubble with it. After it her bubbles link at any distance, so the
  chain is every bubble on the board -- and since the burst follows the drag as
  well as the bubbles, the *order* is the thing worth solving.
- `lorcanaAuroraRoute` therefore looks for the **longest** path through the
  bubbles rather than the shortest: greedy farthest-next from every start, each
  2-opted with its sign flipped, longest kept. Against the exact optimum (brute
  force, n <= 8) over the fifteen Lorcana captures that is 97.7% at worst with
  eleven exactly optimal, where a single start manages 82.7% at worst; four
  2-opt passes changed none of them, so it does two. It crosses 1.2x-1.5x more
  board than the order the bubble pass happens to return.
- The ink stones cost a colour-cluster slot -- a scan keeps only the
  `uniqueTsumCount - 1` biggest clusters, so a live colour was being pushed out
  of the board array entirely. Claimed back off the setting
  (`lorcanaExtraClusterSlots`) rather than off a skill, since every Lorcana
  board has stones on it whatever skill is selected.
- **A dropdown entry may declare the settings it needs** (`SettingSpec.enables`,
  `src/settings.d.ts`), and picking it switches them on. Lorcana Aurora is the
  case it exists for: with Lorcana Card off she half works, silently. Read by
  both pages from the one list, so the settings page ticks the row and the Quick
  Bar applies it to the running world. A one-way nudge -- picking another option
  leaves the switch where the user has it.
- Three Lorcana frames labelled into `corpus/GamePlaying/` (the card up, the
  stones and a stone bubble, a transformed bubble chain), which is what the card
  reader and the stone test are measured against.
- **A new board colour model** (`src/pathfinding.ts`), replacing the HSV read
  rather than sitting beside it. Hue is an angle, and the old read treated it as
  an ordinary number twice -- the blur averaged it across the 0/179 wrap, then
  `classifyTsums` averaged it again -- so red, which lives at the wrap, read at
  green's hue: 3% of 674 red tsums read within 15 of red's true hue, and red
  merged with green 22% of the time. Every tsum now clusters as
  `(S cos H, S sin H, weighted V)`, where there is no wrap and a mean of vectors
  is a vector, with the blur ahead of the HSV conversion to match, `distance3D`
  plain Euclidean and the merge threshold 15 -> 40.
- Plain BGR was measured and rejected: best of the three on an evenly lit board,
  worst when the board dims, which is what a fever stage does.
- Cluster centres are still published as hue/saturation/value, so Elsa's frozen
  box and Formal Beast's hue families are unchanged -- and Elsa's box now catches
  ice on two captures where the old read finds none.
- `MyTsumBoard.tag` is `chroma1`, which the shipped `src/tsums.dat` does not
  match: its colour column was derived through the old ordering, so the loader
  drops it and "Link MyTsum first" samples the skill button. `board_colors.py`
  replicates the new model and the column stays HSV, so regenerating the library
  is all it takes -- except that the script cannot run at all today, wanting
  `MyTsumBoard.width` / `.background`, deleted in 0.9 as read by nothing.
- Board Studio converts the library's HSV into the same feature before it
  clusters, and reports cluster centres back as HSV.

### Fixed

- **Box Buying reported "the store is not selling that box today" for the Select
  Box and stopped.** The store fingerprints as itself ~1.5s before its contents
  arrive, and until then draws three empty placeholder slots where the box tabs
  go -- which is also how many tabs it has when no limited-time box is running,
  so `readBoxTabCount` read the placeholders as a real three-box row and the
  fourth tab did not exist as far as the sweep was concerned. Nothing moves while
  it loads, so no settle catches it. `readBoxTabs` replaces `readBoxTabCount` and
  `boxTabSelected` -- one capture, width and open tab together -- and answers
  null unless exactly one tab is gold, which a drawn row always has and a loading
  one never does; `awaitBoxTabs` and `awaitBoxPurchase` poll for the row and the
  buttons. Corpus frame `TsumTsumStorePage/store_loading.png`.
- **A heart send sometimes sat on the gift dialog for four seconds and then
  cancelled it.** The OK tap is lost now and then -- the host held a tap down
  for 16ms, one frame at 60fps, so a game reading touches once a frame could
  take the DOWN and the UP in the same read and never fire the button. Measured
  off a screen recording: on the sends that worked the OK button drew its
  pressed sprite for ~100ms and the dialog closed; on the two that stuck, that
  region was bit-identical for the whole wait, and so was every other pixel.
  Fixed on both sides: `DeviceHost.TAP_HOLD_MS` is 40 (`../game-automation-app`),
  and `sendOneHeart` presses OK again rather than watching a dialog that never
  moved.
- `waitForHeartPage` answers with the page it stopped on instead of a boolean,
  and takes an `abortOn` page. The toast wait was already detecting `GiftHeart`
  on all twelve of its polls and throwing the answer away; it now gives up after
  three and hands the dialog back for another press, up to `HeartOkPresses`. A
  wait that ran out anywhere else is left alone -- the press landed and the
  toast is what went missing, and OK's coordinate on the friend list underneath
  is a friend's row.
- **Lorcana Aurora chained nothing after transforming**, every time, and the
  bubbles her skill made were then spent one per chain by the play loop under
  the Bubble Strategy setting. Her activation animation is far bigger than it
  was built for: timed frame by frame off a screen recording, the tap goes out,
  the board is covered a quarter of a second later, a full-screen Lorcana card
  holds it for 1.6s, and the board comes back **3.15 seconds** after the tap.
  The wait for her bubbles was 1800ms, so the whole choreography ran and
  finished under the animation.
- The wait no longer trusts a clock or a count. The drag starts once **three
  circles have held position for 150ms** on two reads running, polled every
  30ms -- which neither the animation (0-6 circles a frame, somewhere different
  each time) nor a board still refilling under the bubbles can fake. The budget
  is 6s and only bounds the failure.
- **Then it chained the bubbles' shadows.** A second recording caught the chain
  drawn through where the bubbles had been: they are painted onto the last
  frames of the fade-out, sit still for ~400ms, and then drift up to **25
  play-square px -- most of a bubble's own 32 -- in 450ms** as the board
  refills. 3 of 5 points were still on a bubble by the end of the drag, and a
  chain of 3 was logged as a chain of 6. The route is now re-aimed at every
  bubble of the drag from a fresh read of the board, so the plan is never older
  than one hop, and the last bubble is held for two extra frames -- the one
  link a chain was seen to lose was its last.
- **Then it sat for three seconds on a board that never moved.** A third
  recording: the gate asked for the whole set of circles to match twice
  running, and the recall-favouring pass draws a circle or two round tsums that
  flicker in and out between reads, so the count was rarely the same twice --
  3.2s and 2.4s from the bubbles stopping to the drag. The gate now counts the
  circles that held rather than the set, and the route takes the last two reads
  together, since the pass misses each bubble about one read in six. Replayed
  at the poll's cadence, the drag starts 0.25s after the bubbles appear.
- **A drag the game ignores is now found out.** The bubbles are read again after
  the release, and a route whose bubbles are still standing 600ms later was not
  taken (`skill.lorcanaAurora.stayed`); the window draws it again, up to three
  times. That is what lets the wait be short rather than safe -- a drag sent
  during the fade-out costs one retry instead of the skill. Touch events are
  also paced at one per display frame (`stepMs` 16, was 5): the same recording
  showed the chain graphic growing at ~16ms a link however fast the moves were
  sent, so the script's clock ran 200ms ahead of the screen by the release.
- **Bubbles are hers for the rest of the round, not just for that window.** Any
  two bubbles link at any distance once she has transformed, and her skill only
  *adds* to what is on the board -- so the Bubble Strategy popping one mid-chain
  was a link taken out of her next chain, and a window that went wrong lost its
  bubbles for good. A skill can now declare that with `claimsBubbles` /
  `chainBubbles`: `bubbleTapBudget` stops spending them, and the play loop hands
  every scan's bubbles to the skill. The activation window is the first and best
  chance at them rather than the only one.
- **The transformation was called early, and late.** It was read off the card's
  black frame on the bottom band, and on an emulator with the Quick Bar up the
  strip's own dark rows sit inside that band: a burst dimming the screen read
  as a card, a tap at nothing "went away" 600ms later, and the tsum was marked
  transformed two activations into a round. The other way, a recording shows
  the untransformed half -- burst and blind sweep -- played four times against
  a tsum that had transformed 25 seconds earlier, off a card the band never
  saw. The state now comes from the medallion (see Added), which is the thing
  that changes; the 4s quiet after an activation stays, since the animation
  dims the button too.
- A window that draws no chain now says so (`skill.lorcanaAurora.noChain`,
  a warning) instead of logging "Bubble chain drawn" regardless, which is what
  hid all of the above -- the log looked right while nothing was happening. A
  chain the game did not take says so too (`skill.lorcanaAurora.stayed`), and
  every chain line carries how many of its bubbles were left standing.
- `houghCircles` was declared as returning `GameBubble[]`, whose radius field is
  `r`, where the host writes `radius` (`js_houghCircles`, `api_image.cpp`). So
  `findGameBubbles` copied `undefined` into every bubble's radius and
  `findTsums` did the same into every tsum's `z`, with the compiler agreeing.
  Nothing read either field, which is why it went unnoticed until
  `lorcanaFindBubbles` needed one; `HoughCircle` now declares the native's own
  shape.

- **Board art for the base-roster tsums the block pack ships none for.** `_s`
  art for 12 of the 16 library tsums that had none — `pooh`, `donald`, `minnie`,
  `tigger` and the rest — is cut out of the game's own atlases and staged into
  `name_handling/blocks/`, which takes Board Studio's board-art coverage from
  753 of 769 to 765; the four left (`claricetrans`, `kristoff2`, `minnietrans`,
  `simba`) are on no atlas at all.
- **Board Studio** (`tools/boardStudio/`, `npm run board:studio`), a browser
  workbench for the question Page Studio does not answer: the screen is
  recognised, the board is up, and no chain goes out. Build a board from up to
  five real tsums and their own `name_handling/blocks/` art, plant chains of
  given lengths or none at all, add bombs, large tsums, capsules and ice, and
  the production planner reports what it found. Boards export as JSON and can be
  traced over a corpus capture, so an exact board can be handed to someone else.
- It replaces the **Hough half** of `scanBoardQuick` with ground truth and
  nothing else: `classifyTsums`, `distance3D` and `calculatePaths` are read off
  the built bundle, and every board colour is the one `board_colors.py` derived
  from that tsum's own sprite. So a board that stalls on a device but not here
  is evidence about the *detector* rather than about the planner —
  `tools/boardStudio/README.md` § The fidelity boundary.
- **The pile is settled rather than laid out** (`packPhysics`, matter-js — the
  one dependency the tool adds, and dev-only). Each piece is dropped into the
  bowl and left to come to rest, so the packing is uneven, a large tsum shoves
  its neighbours aside, and the link graph is the one a real pile produces
  rather than the one a grid does. The old hex lattice is kept as
  `pack: 'lattice'`, so a finding can be checked against both. `Common._seed`
  and `Common._nextId` are reset before every pack, or a spec would settle
  differently depending on how many boards preceded it in the process.
- **Each tsum collides as its own art** (`silhouette.js`). The sprite's alpha
  mask is distance-transformed and covered with discs, deepest first, so a body
  comes out as a head plus its ears — six circles for Dumbo, five for Hamm, one
  for Olaf. Ears nest into the gaps between heads, which is what makes a pile
  look poured rather than stacked, and a big-eared tsum genuinely takes more
  room than a round one. A new **Bodies** layer draws the circles over the art
  they came from. Circles and not a traced polygon because a tsum *is* a union
  of circles, and a concave one would need a decomposition library for a worse
  fit.
- **The board draws `block_<short>_s.png` and nothing else** — the art the game
  itself puts on the board. `_l` is the same drawing at 256 rather than 160 and
  `_y` is a different drawing carrying the selection glow, so neither is a
  fallback: the 16 library tsums with no `_s` draw as plain discs rather than as
  something else's picture. Coverage goes up, not down — 753 of 769 against
  `_l`'s 745. The derived board colours are unaffected, since `_s` and `_l` are
  one drawing and agree on mean colour to a unit or two. `_s` is read from
  `name_handling/blocks/` when it has been staged there and from the extracted
  `gameres/block/` otherwise.
- **Sized off the head, not the bounding box.** A tsum's core circle is
  `Config.tsumWidth` across whatever its ears do, which is what a 25px circle
  overlaid on a capture shows and why one Hough pass at radius 8–14 finds every
  tsum on the board. `board_colors.py` normalises on the bounding box instead,
  which is right for averaging a colour and wrong for drawing a board. The
  settled pile lands at a 24.4 nearest-neighbour median against the 24–26 real
  boards sit at.
- **The bowl floor is the arc it is on screen.** Walking up each column of the
  play square until the chrome stops, over all four boards in
  `name_handling/boards/` and the `GamePlaying` frames, puts the rim at y≈175
  against the walls and y≈196 in the middle — an arc of radius 250, not a flat
  floor with rounded corners. It is why the lowest row of a real board dips in
  the centre.
- Tsums settle roughly upright rather than at any angle, by a torsional spring
  standing in for the fact that they are bottom-heavy; matter-js will not move a
  compound body's centre of mass off its parts.
- **A collision-size slider**, which is the knob for how far apart the pile ends
  up: how big a piece is to the solver against how big it is drawn. The readout
  beside it is what the pile actually settled at, head to head, so the setting
  and its result are on screen together. 100% is where two independent
  measurements put a real board — a 25px circle laid over a capture lands on a
  head, and the autocorrelation period of a real board and of a studio one agree
  at 28 units — and past about 108% the heads stop overlapping.
- **The tsum picker is a real combobox** rather than a `<datalist>` of all 769.
  It ranks shorthand over name and prefix over contained, so `alice` offers
  Alice before Alice+ and `buzzl` finds Captain Lightyear; arrow keys and Enter
  work; each row shows the tsum's board art and colour; and one already in
  another slot is dimmed. Three things were making it slow and erratic, and all
  three are gone: 769 live `<option>` nodes the browser re-filtered per
  keystroke, a full rebuild of the panel on every commit (which destroyed the
  input under the pointer — the source of the lost focus and jumping caret), and
  a `/api/colors` round trip riding along with each rebuild. Sprite and backdrop
  responses are cacheable now instead of `no-store`, so the art behind the list
  is fetched once rather than per keystroke.
- **Resolution presets.** The stage can be a whole phone screen rather than the
  play square, with the square inset exactly where `Tsum.prototype.init` puts it
  and a readout giving a tsum's width and `findTsums`' radius band in that
  screen's own pixels: 135px and 43–76 at 1080×1920, 90px and 29–50 at 720×1280.
  All three of the script's cases are reachable — plain 16:9, the pillarboxed
  one wider than 3:2, and the letterboxed one taller than 16:9, where the
  presets assume the letterbox is centred because `detectOffsetYInGame()` runs
  on the device. A backdrop is drawn whole rather than cropped when a screen is
  chosen, so a capture lands under the board it belongs to.
- Its first findings, which move where to look for a stall: a full 52-piece
  five-colour board never comes back with fewer than three chains, but a
  played-down 20-piece one does 59% of the time; the `uniqueTsumCount - 1`
  cluster cut keeps 6.5 of 52 tsums off the planner by default and 15.3 under
  the 5>4 bonus; a two-colour board reads as barren 48% of the time while
  holding chains up to 34 long, because the fan counter asks for three *chains*
  rather than for any board to work with; and bombs, large tsums, capsules and
  ice each cost about a chain a board on their own but take 57% of scans barren
  together, with tsums cleared per scan down from 9.0 to 3.4.
- Bombs, capsules, large tsums and ice have no art of their own anywhere in
  the game's asset packs, and need none — each is the tsum's own sprite with
  something drawn over it. The consequence worth knowing is that a large tsum
  and a bomb are the same size, so `findTsums` (radius 8–14) misses both and
  `findGameBubbles` (16–30) picks up both.

### Changed

- `SkillType.BurstBubbles` sweeps the full play area (`clearAllBubbles(0, 50)`),
  like the named skills it is the generic form of. It started at y=1000 in an
  area running 632–1532 and paused 300ms a row, so it was both narrower and
  slower than Marie, Moana, Horn Hat Mickey and Snow White.
- Renamed in the dropdown to "Burst + clear bubbles", and given an entry of its
  own in the README's Skill Type table. As "Burst bubbles" it sat next to
  "Burst" with nothing to tell the two apart, and was defined nowhere — it
  appeared only in passing in the Lorcana Aurora paragraph. Label only: the
  `SkillType` id and the share letter `B` are untouched, so codes in
  circulation still mean what they meant.
- `PageRouter.dispatch(changed)` is now `buildEvent(changed, goal)` plus
  `react(event)`, and `TsumTaskController.loop()` is `tick()` plus the rest
  between passes -- both public, so `dispatch:eval` drives the real code. A
  dispatch re-entered from a handler logs `page.dispatchReentered` instead of
  returning silently.
- **The goal is an argument to a look, not router state.** `gPages.goal`,
  which `navigate()` set and every handler and forecast read, is gone: a look
  says where it is heading (`detect(times, timeout, expect, goal)`), the
  navigate band is offered the event only then, and `''` means watching. With
  it, `detect` is split into `observe` -- the sweep, the history and the event,
  nothing run over it -- and `react`, the queue over that event; `detect` is
  the pair. Traces unchanged.
- The dispatch tests a handler's `acts` itself and skips the handler when it
  answers false; the seven bodies that repeated the test no longer do. The
  forecast reads the same declaration, so the two cannot disagree -- now an
  invariant `dispatch:eval` fails on. Traces unchanged; 606 golden rows show
  `declined` where they showed a body returning `Continue`.
- **No wildcard subscriptions.** `pages` is required; the nine handlers that
  left it out now take a set read off the page tables -- `allPages()`,
  `pagesOfKind(Transient)`, `pagesWithAnchor(Mail)` and so on (pages.ts) --
  so a page is on exactly the queues its own declarations put it on. The
  transient wait and the four anchor movers leave the queues of pages they
  could never act on; traces unchanged, 812 golden rows shorter. A load-time
  `gPages.validate()` refuses an `after` naming nothing, or a lower band.
- **Page roles replace the hand lists.** Each page says in `PageProfiles` what
  it is to the flows -- board, tally, a panel before the tally, a screen that
  means the game is up, a screen the heart sweep branches on, an interruption
  -- and `inRoundPages()`, `roundOverPages()`, `preTallyPages()`,
  `heartSweepPages()` and the startup-phase handler's pages are read off that
  (pages.ts). The five lists they replace, in four files, were proved equal to
  the derived sets before they went. A new page is in every list its roles put
  it in and in no other, and `PAGE_DISPATCH.md` shows the roles beside each page.
- **The scheduler is a total order.** Among the jobs due at once the lowest
  `JobPriority` (src/runPlan.ts) runs first, then the name; every job's
  priority is distinct and `newTask` refuses a duplicate. The rule it replaces
  preferred a longer interval over a higher priority and was not transitive,
  so the pick fell to object iteration -- which is how jobs started in
  registration order and a Now sweep ran after the first round. The start
  order is now: Now sweeps, app restart, level caps, boxes, mailbox,
  receive-all, hearts, round; the Run order card sorts on the same enum.
- With it: registration is immediate (no `system_*` bookkeeping tasks, so a
  job no longer costs a tick to appear), the tick is a fixed 200ms
  (`updateRunInterval` is gone; the smallest interval was 3s anyway), and five
  consecutive throws from *one* job restart the app, rather than five spread
  across any. The forecast's task rows carry `priority` instead of `system`.
- **No blind back-tap.** `nav.move.back`, which pressed any page's `back` when
  no other mover claimed it, is `nav.move.exit`, which presses it only where
  the page's `PageRoutes` row says `back` is a way out -- 26 such rows added,
  each a Close, Cancel, OK or back arrow the fallback was already pressing. The
  one page left without a row is the hub, whose `back` is Play: the 0.7 loop
  where a level-up fingerprint aliased the hub and pressed Card for ever cannot
  recur, because nothing taps the hub blind. A page with no exit makes
  `navigate()` log `nav.noRoute` once and leave it to the stall guard. Of 1008
  golden rows, 526 moved to the new id with the same taps and 8 -- the hub
  with the store as the goal -- lost theirs.
- **A subscription is a list of steps rather than a function body.** `tap` an
  anchor of the entry that matched, `tapAt` a button, `settle`, `sleep`,
  `waitOut`, `log`, and `call` for what is neither a tap nor a wait. So the taps
  and the three settle budgets are data: `PAGE_DISPATCH.md` prints them per
  subscription, where they were numbers a reader had to open
  `src/pageHandlers.ts` for. `takes` -- the route edge a mover presses -- is
  read off the first tap instead of declared beside it, so the edge the forecast
  names is the one that gets pressed.
- With it, no subscription returns anything. Whether one ends the queue is its
  *band's* answer -- guard, dismiss and navigate act unless their `acts`
  declined -- so `PageAction` is gone and `ForecastActingBands` is the one
  statement of the rule, read by the dispatch and the forecast alike.
  `PageRouter.perform` is the only thing that runs a step list, which is also
  where `dispatch:eval` records what ran: one wrapper rather than one per row.
  `dismissMagicalTime` is gone, inlined into the three steps that were its whole
  body. All 1008 golden rows are unchanged.

## [0.9]

### Summary
- Box Buying chore added: buys Premium Box+, Premium, Select or Happiness boxes from the Tsum Tsum Store on a schedule, one or ten at a time, and stops when the box sells out or the Coins run low. Rubies are never spent.
- Settings now has a Chores tab, so the jobs the script does between rounds are in one place instead of at the bottom of Gameplay.
- A long skill animation can no longer be mistaken for the end of a round: the script always waits for the round to actually be over. The Handle Long Skill Animations switch is gone, because there was never a reason to turn it off.
- Settings codes made before this version are refused — copy a fresh one from a device on 0.9.
- A settings code is now shown as a QR as well as text, so someone else can take your setup by photographing the screen instead of being sent the line.
- Record Sender is gone. It counted hearts per friend into a file nothing could show you any more, and the running heart totals it used to carry now survive a restart on their own.

### Added

- **The settings code as a QR** (`drawShareQr`, `src/settings.ts`), under the
  share box and showing whatever the box holds, so what is on screen and what a
  camera reads cannot disagree. Black on white in both themes and drawn at a
  whole number of pixels per module: a QR is only readable at full contrast,
  and a canvas the browser has to scale loses whole rows of modules.
- **`src/qrCode.ts`**, the encoder behind it. Byte mode, level M, versions 1–6
  — 106 characters against a share code's ~45 worst case, and the last version
  at which every block is the same length and there is one alignment pattern.
  No library, because the page is loaded from `file://` and inlined whole.
- **The Box Buying chore** (`Tsum.taskBuyBoxes`, `src/tsum.ts`): navigate to the
  store, open the box the settings name, press its 1-Time or 10-Time purchase,
  confirm, tap through the reveals, repeat. Scheduled in hours like the
  level-cap sweep, with the same Now button (`buyBoxesNow`, `src/index.ts`) that
  queues one sweep on a live run or starts a run for it.
- **Four settings** — `buyBoxHoursWait`, `buyBoxType`, `buyBoxTenTimes`,
  `buyBoxMaxPurchases`. `buyBoxMaxPurchases` is a runaway guard rather than a
  preference: a chore that spends the player's coins may not depend on the game
  running out to stop it (`DRIVING_SCREENS.md` § 8), and a hard 50 caps whatever
  the setting says. A purchase whose reveals will not clear counts against that
  limit and against the retry budget both — the coins go when OK is pressed, so
  a screen the sweep cannot get off has to stop it rather than cost another
  purchase every time round.
- **`BoxStore`** (`src/data.ts`), the store's geometry as a reading. Two things
  there move and are measured rather than fixed: the box tab row is three wide
  normally and four while a limited-time box runs, told apart by the panel
  showing through at both ends; and the purchase buttons are a pair side by side
  or one centred over the gap between them, told apart by which positions hold a
  button. Sold out is a colour, not an absence — the button stays and turns
  blue, which is what ends a sweep.
- **Two page entries** — `BoxPurchaseResult`, the 10-box tally with its Close,
  fingerprinted on the title band, panel frame and interior margins so nothing
  sits on a grid cell; and `NotEnoughCoins`. The tally is authored on a 540x960
  device capture and checked against a 604-wide frame cut from a screen
  recording — two resolutions and two capture paths, agreeing to within 12
  absColor at every probe, which is what its thresholds are sized against. `TapOpenPage`, `BoxPurchasedPage`
  and `ConfirmPurchasePage` already existed and are what the rest of the flow
  waits on. The ten reveal cards get no entry at all: they are tapped through
  blind, being one screen the flow never has to tell from another.
- **`NavPlans.TsumTsumStorePage`** and `nav.move.toStore`, which presses the
  `store` anchor the `Page` table has located since before anything used it.
- **`awaitPage` takes the event to log a timeout under**, defaulting to the
  level-cap sweep's. A Box Buying timeout filed as `unlock.pageMissed` sends
  whoever reads it to the collection.
- **A Chores tab in the settings page**, with a group per chore. The chores were
  one card at the bottom of Gameplay until Box Buying arrived with four rows of
  its own. Hearts are chores too and keep the tab they already had.

### Changed

- **Rubies are refused structurally, not just by the flow that can ask for
  them.** `Page.NotEnoughCoins` points *both* its anchors at Cancel, so no
  generic mover can press Buy with Rubies, and `dismiss.notEnoughCoins` cancels
  the dialog wherever else the game raises it.
- **`tsum_record/record.txt` is now the heart tally and nothing else**, and it is
  read and written on every run rather than only when Record Sender was on. The
  running totals on `hearts.*` log lines used to restart from zero unless that
  setting happened to be enabled; now they carry over.
- **The break with Robotmon upstream is complete.** `PORTING.md`, `tools/port/`,
  `npm run port:upstream` / `port:drift` and the `robotmon-scripts` external-tree
  entry are gone, as is `DEVELOPMENT.md` § Behaviour parity — this package no
  longer tracks `r2-studio/robotmon-scripts` and nothing here is owed to what
  that project does now. The symbol extractor the port tooling owned was the one
  piece with another consumer, so it moved to `tools/codemap/symbols.js` and lost
  the comparison half it no longer needs (no token hashing, no type erasure, no
  compilation-unit split). Comments that justified a value by parity now say what
  the value actually is: the `linkTsums` drag timings, `taskTsumAppRestart`'s
  inlined restart, `preferTask`, `Config.maxChain` and Rapunzel+'s drag.
- **The retired `tools/tsumStudio/`** is deleted rather than kept for its
  history — it cut library templates out of screenshots, `name_handling/`
  replaced it by rebuilding the button from the game's own art, and it had
  already stopped running against a `MyTsumPortrait` rect that no longer exists.
  `.gitignore` loses the `tsums/art/` and `tsums/crops/` carve-outs and the
  `npm run tsums:*` scripts they named, none of which exist.
- **`settings.ts`'s last three untyped parameters** are annotated: the host
  entry points `onEvent` and `onLog`, and the `readText` callback. They passed
  `npm run typecheck` (`tsconfig.settings.json` is not `strict`) but showed as
  implicit-any errors in an editor, whose fallback project uses its own options.

### Removed

- **`handleLongSkillAnimations`**, and with it the legacy game-over check it
  selected. Off was TsumBeta's original guess — `sleep(500)`, one
  `detect(1, 2500)`, then assume the round ended — which is slower than
  `confirmGameOver` on a real ending (that 500ms is unconditional) and wrong on
  the burst animation the setting is named after. Nothing was left to prefer, so
  the play loop calls `confirmGameOver` unconditionally. `gameOverGraceMs` is
  the dial if the 20s window ever needs one.
- **`play.gameOver`'s `endedBy`**, now that there is one way to get there.
  Which ending it was is the record before it: `play.gameOverConfirmed` names
  the screen, `play.gameOverAssumed` means the grace window ran out.
- **Its share-code slot, cut rather than retired**, at the user's request ahead
  of a wider sweep of settings that no longer decide anything. Every slot below
  it moved one place, so `SHARE_PREFIX` is `TSUM4-` and pre-0.9 codes are
  refused instead of misread. A further cut before 0.9 ships needs no second
  bump.

- **The second stuck watchdog, and everything that fed it.** `Tsum.taskWatchdog`
  had a body that was entirely commented out and a registration that was
  commented out with it, so the only live watchdog was — and still is — the
  consecutive-error restart in `TsumTaskController`. Going with it:
  `ts.lastVisitedPages`, a map with twenty write sites across `pageHandlers.ts`,
  `skillCore.ts` and `tsum.ts` and **no readers**; `_lastProgress`,
  `_lastSeenCount`, `stuckTimeoutMs`; the `notify.visited` subscription that
  existed only to feed it; and `play.watchdogRestart` /
  `play.watchdogRestartFailed`. The `task.watchdog*` events are the live ones and
  stay.
- **`PageRouter.isTransient`, `convertTo2DArray`** — no callers.
- **`ts.receiveOneItem`** (written by `buildRun`, never read) and
  **`ts.showHeartLog`** (set to `true` in two places and nowhere else, so the
  guard it gated in `logAddHeartTally` could not fire).
- **`Config.tsumBoundW` / `tsumBoundH`, `MyTsumBoard.width` / `background`,
  `BoxStore.emptyColor`, `Log.Run.unknownState`, `Log.Skill.cptLy.fanSkipped`** —
  each read by nothing. The two `Config` fields were kept only because upstream's
  `TsumConfig` had them.
- **Record Sender and Enlarge Sender's Image**, a feature whose only consumer
  was deleted in the port: the "List of Heart Counts" section and its HTML
  exports went at 0.1, and nothing since could read the per-sender counts back.
  What it cost to keep was a portrait crop and an `getIdentityScore` pass per
  heart, up to 200 PNGs pinned in native memory, and — with Enlarge on — a
  `resizeRatio` of 1 for the *whole run*, which rescaled every capture the
  script took, not just the portrait. Out with them: `recognizeSender`,
  `countReceiveHeart`, `evictOldRecordImages`, `releaseRecord`, `clear`,
  `ts.recordImages`, `ts.maxRecordImages`, `ts.recordReceive`, `SenderRecord`,
  `Button.outReceiveName*` and seven `hearts.*` log events.
- **`checkFunction`, the last Robotmon host guard.** Its own comment said so.
  One caller was asserting the bundle concatenated, which is now a plain
  `typeof`; the other gated **all of Click Assist and auto-play** on `outRange`,
  a native nothing calls — so a false reading there would have registered no play
  task at all and said nothing about it.
- **`nowTime()`**, a one-line alias for `Date.now()` left from when it applied
  the device's timezone offset. Three call sites, now direct.
- **Every back-compatibility path for settings saved by an older script**:
  `langTaiwan` (and `runLocale` with it), and the `!!` / `|| default` /
  `!== false` coercions in `buildRun` for `collectUnknownScreens`, `bonus5to4`,
  `prioritizeMyTsum`, `receiveHeartsSkipFirst`, `bubbleStrategy`,
  `trackRoundStats`, `skillAutoTap` and `buyBoxTenTimes`. The guards that also
  validate a *range* or a hand-written `start()` command stay — `linkReachPercent`,
  `roundDelayMinutes`, `maxChainsPerScan`, `pageHistoryDepth`, `deviceFps`,
  `buyBoxType` and `buyBoxMaxPurchases`, which is what stops a chore that spends
  the player's coins.
- **The two retired `''` share-code slots** (`clearBubbles`, `tsumMonitorUrl`).
  Cut rather than kept, since 0.9's `TSUM4` bump has not shipped and one bump
  covers every cut made before it does. The `''` mechanism itself stays: it is
  what a *later* removal will need.
- **Seven blocks of commented-out code** in `tsum.ts` (the blind-tap overload
  experiment), `cptLy.ts`, `lightningMcQueenPlus.ts`, `tiaraMinniePlus.ts`,
  `pathfinding.ts` and `fever.ts`. The fever one carried a real decision — a
  fever start/end log line was tried and taken out because the transition is
  detected too inconsistently to trust — so that is now a sentence instead.

## [0.8]

### Summary
- Fixed the level cap sweep walking the whole collection in the order the player had it in, raising nothing: the tap that picks Level Lock is now checked and taken again if the dialog was still opening when it landed.
- Fixed a round played with an event card recording no score or coins: the event's result screen is now tapped away whatever the event looks like, its page closed, and the card reveal and gift screens it puts up at milestones dismissed, instead of giving up on the score page.
- Fixed taps going missing on slower devices: the script now waits for each screen to finish animating rather than for a fixed time, so navigation, the mailbox, sending hearts and the level cap sweep behave the same at 60fps as at 120.

### Added

- **`Tsum.settleScreen(maxMs)`**, the gate that replaces a blind rest after a
  tap: it samples a 60-point grid (`ScreenSettle`, `src/data.ts`), samples it
  again, and returns as soon as almost nothing moved. `maxMs` is a ceiling, not
  a cost. `DRIVING_SCREENS.md` § 5 is the rule and where it does and does not
  apply; `screen.settled` is its debug record.
- **`NavPlan.settleMaxMs`**, an arrival's stillness budget after `settleMs`.
  Declared for `FriendPage`, `TsumsPage`, `ProfilePage` and `MailBox`; omitted
  for `GamePlaying`, because a board never stops moving and a gate over one can
  only time out.

- **The event's two milestone screens are fingerprinted and dismissed**
  (`EventCardReveal`, `EventGift`): the collectible-card reveal any tap moves
  on, then the GET! gift dialog whose Close drops back onto the event page.
  Both are round-over and pre-tally pages like the rest of the event's
  screens; the gift is the game's generic reward dialog and is closed wherever
  it shows, event or not, and it does not by itself put the tally wait into
  its sit-out-the-animation mode.
- **Both fingerprints are joint ones**, and each says why in `src/data.ts`. The
  reveal is a black scrim round a card that is different every time, so its
  probes are the card's black border and the scrim -- pixels the level-up
  panel's own scrim shares, which is why four of the ten sit where that panel
  is blue. The gift dialog is the shared dialog sprite drawn where
  `GiftHeart` draws it, so its header and footer alone separate by under 25;
  the GET! title and a Close that sits where only the score page is yellow are
  what make the set unique.
- **The event page is fingerprinted on game chrome only** (`EventMain`): the
  yellow Card / Close / How to Play row every event card draws the same, not
  the mission card above it, which each event styles its own way. The Lorcana
  event alone draws that card cream for its special mission and navy for the
  regular ones, and the 0.7a fingerprint matched only the cream one.

### Fixed

- **An event's result overlay is tapped away blind, not fingerprinted.** The
  0.7a fingerprint was authored on the special mission's cream card; the
  regular missions' navy card read `unknown`, sat for the whole window, and the
  round was written with no score -- and the next event will restyle both.
  `waitForScorePage` now taps `StatsUnknownTapSpot` every `StatsUnknownTapMs`
  while the screen is unreadable *after* the tally has shown (the overlay, then
  the ~15s token walk that follows it), renewing the window as it goes;
  `StatsScorePageMaxWaitMs` bounds it. The spot is inert on the tally, the
  new-record and rank-up panels and the event page, and the taps are counted in
  `stats.scorePageGaveUp`. The overlay's frames leave the corpus with its
  entry: a fingerprint of event art is the thing this replaces.

- **`sortCollection` confirms the order it picked** instead of resting 500ms and
  trusting it. The Change Order dialog's fingerprint is all panel, and the panel
  is painted before the dialog is live -- measured on a device recording, the
  Close button appears 130ms after the probes pass -- so the option tap could
  land inside the entry animation and be swallowed (`DRIVING_SCREENS.md` § 4).
  Up to `UnlockSortAttempts` taps, each confirmed by re-reading the dialog.
- **A sort that will not take now stops the sweep** (`Log.Unlock.SortNotTaken`,
  returning null) rather than letting it walk 40 pages in the wrong order and
  raise nothing. That was the whole visible fault: one swallowed tap cost a
  58-second sweep and left the collection unchanged.

- **Every wait for an animation is a `settleScreen` budget instead of a fixed
  rest.** The game animates on a frame counter, so a rest measured at 120fps is
  half long enough at 60 and the next tap lands inside the animation -- which is
  what "Level Lock misses taps" was. Converted: the router's arrival settle, the
  dismiss band's five panel closes, the navigate band's movers, `Tsum.awaitPage`
  (so all five hops of the level-cap sweep are gated at once), the sweep's own
  four rests, `sendOneHeart`'s three, and `taskReceiveAllItems`' three.
- **Two waits stay blind, and say so**: `nav.move.startToGame` and
  `dismiss.resumeGame` are waiting on a board, which is animating for the whole
  round and never goes still.
- **`UnlockRewindMaxPages` 120 → 400.** It counts left-arrow *taps*, and the
  rewind bursts faster than the grid slides on purpose -- a settle per tap costs
  the capture the burst exists to avoid. At 60fps about half the burst is
  swallowed, so a ~97-page collection needs 192 taps, and 388 at a quarter
  landing; the old bound stopped the rewind mid-list. The burst now settles once
  before each reading of where it is.

## [0.7a]

### Summary
- With an event card active, the event result screen the game puts up after a round is now closed automatically, so rounds keep recording their stats instead of stalling behind it.

### Added

- **The event card's two post-round screens are fingerprinted and dismissed**
  (`EventResult`, `EventMain`): the mission tally any tap advances, then the
  event page whose Close puts the score tally back in front. Both are
  round-over pages and renew `waitForScorePage`'s window like the other
  pre-tally panels, so a round ending on them still writes its row.

## [0.7]

### Summary
- Formal Beast skill improved: he keeps the two halves of his gauge level by shortening chains rather than skipping them, links much longer chains while his mode is up, and Link MyTsum first stands aside during the mode, so playing for the double payout no longer costs the round its pace.
- Fixed the script opening the Card screen over and over on the home and friends pages instead of getting on with the round.
- Unlock Level every hours rebuilt. Has a Now button that runs one sweep straight away whatever the schedule says -- ahead of everything but a round in progress, and starting the script if it is stopped. Puts the collection back in the order it was in once the sweep is done.
- Fixed Link MyTsum first almost never finding MyTsum on the board: it was reading the colour off the skill button's gauge instead of the Tsum, and now knows what each Tsum looks like on a board.
- Fixed Stop letting a tap the paused script was still waiting to make go off on whatever screen was open by then: once stopped, nothing the script had queued reaches the game.

### Added

- **`DRIVING_SCREENS.md`**, the design doc for writing a task that walks a flow
  rather than reacting to one screen: what `sweep` and `matches` each compare and
  why a probe list is not right for both, aliasing in the direction `targeted`
  does not cover, what a `NavPlans` entry costs per pass, the tap-until-it-goes
  pattern for a screen that swallows taps, re-reading a list you are changing,
  and how to drive the built bundle off-device. Every rule in it is one this
  release paid for. It opens by drawing the line the rest of it keeps: the router
  owns which screen you are on and how to get between them, a flow owns
  everything drawn inside one, and there is no shared list or grid reader --
  `CollectionGrid` belongs to the level-cap sweep the way `HeartColumn` belongs
  to the heart sweep. Each rule is stated in neutral terms with the sweep's own
  version set aside under *In the collection*. Linked from `CODEMAP.md` and
  `DEVELOPMENT.md`'s page-detection symptom table.
- **A Now button beside "Unlock Level every hours"**, the second control on the
  page that acts on the run rather than on the form. `unlockLevelsNow(settings?)`
  (`src/index.ts`) is the global the page evaluates, beside `roundDelaySkip()`.
  On a live run it *queues* the sweep rather than running it, because the bridge
  evaluates it on the host's thread and the sweep taps the screen for minutes;
  the task is registered at priority -1 (`newTask` now takes one) so it goes
  before the play loop's next round and any chore due at the same moment, and
  it stays registered until the sweep actually ran, since `taskAutoUnlockLevel`
  stands aside (now `false`) for a round in progress -- the board or the pause
  menu; navigating off a running board has no route and stalls into an app
  restart. It also pre-empts the chore that is *running*: `ts.yieldAsked` is up
  while the sweep waits, the heart and mailbox loops poll it through
  `mayContinue()` and hand back at their next heart or gift, and the play task
  neither starts a round while it is up nor finishes walking to one
  (`navigate` takes an optional `abort` predicate, asked only once a look has
  said this is not the goal) -- a round already on screen is the one thing the
  sweep waits for. With nothing
  running it starts one: the page sends its settings with the call, and
  `unlockLevelsFirst` -- a start-command-only key like `locale` -- has `buildRun`
  queue the sweep first and defer the scheduled one by a full interval. The page
  closes the panel first, as Play does, because an open panel holds a live run
  paused and would swallow a new run's taps. Refused during a walkthrough
  recording, where nothing may touch the screen.
- **Three screens of the level-cap sweep are fingerprinted**: `TsumSortOrder`
  (the collection's Change Order dialog) is swept like any other page;
  `RaiseLevelCap` and `LevelCapRaised` are `targeted`, because they are
  `GiftHeart`'s and `HeartSent`'s sprites -- identical down every edge, the
  wording being the only difference -- so a swept entry for either would take
  those pages' frames. Four corpus frames with them, and two more `TsumsPage`
  frames that are what the padlock vote is measured against.
- **`pages:eval` can test a `targeted` page.** A label whose every entry is
  targeted is asked with production `matches()` rather than swept, and reported
  as `targeted`; before this the corpus could not hold a frame of such a page
  without failing the gate, which is why the three pages `matches()` already
  served had none. It also names the page a *sweep* of that frame answers with,
  because nothing stops another entry claiming a targeted page's screen and a
  silent `targeted` row is how that stayed hidden: `Received2` claims
  `LevelCapRaised` with errors of 16, 6 and 24 against a threshold of 80, which
  is what a device log means when a raise reports seeing `Received`. Reported,
  not failed -- every edge off `Received` is a tap the toast swallows anyway,
  and separating them wants a corpus frame of the real panel, which there is
  none of.
- **`name_handling/add_tsums.py`, the monthly job for a game update's new
  tsums**: the shorthands `src/tsums.dat` does not hold, staged out of
  `gameres/block/`, named on a page it serves on `127.0.0.1:7819` — each
  sprite above the name strip that answers it — then the library rebuilt and
  verified. What is new is measured against the library rather than against
  `blocks/`, so a run that stopped half way resumes where it left off.
- **`ocr_names.py`'s recogniser is behind `add_tsums.py --ocr`**, not in its
  path. It was built to read the 676 strips the lexicon started from; a month
  adds a handful, and the strip is already on the page above the field. The
  EN strip is still staged into `name_images/` either way, because a full
  `ocr_names.py` pass rewrites `name_map.json` from that directory alone.
- **It reports which new signatures landed as art twins**, scored library entry
  against library entry so the margin comes out at its best possible value:
  anything flagged there will certainly go unnamed at runtime rather than be
  guessed at. `build_library.py` now parses `minScore` and `minMargin` out of
  `MyTsumPortrait` with the rest, so that report and `--verify` judge by the
  thresholds the device uses.
- **`name_handling/board_colors.py` derives what each tsum looks like on a
  board**, from `blocks/block_<short>_l.png` -- the plain sprite, where `_y`
  (which the portrait library uses) carries the golden selection glow and costs
  about 12. It packs the sprite into a synthetic board and runs the *production*
  detector over it, because the circle `findTsums` lands on is the tsum's face
  rather than the middle of its bounding box. `--fit` refits the render width,
  `--verify` scores it, `--stage` backfills the `_l` art into `blocks/`.
- **`src/tsums.dat` carries a fourth column**, the board colour as HSV hex, and
  its header a `board=` tag. Versioned apart from the signatures because the two
  fail differently: a stale signature names no tsum, a stale colour picks the
  wrong chains -- so a tag this build does not know drops the colours and keeps
  the names. Rows with three fields still load.
- **`name_handling/boards/`, four labelled in-round captures** and the MyTsum
  each was played with. The standing check for the colours, the way
  `screenshots/` is for the portraits. `MyTsumBoard.width` is fitted on them:
  31px in the 200px play square, a clean minimum (mean residual 5.5, against 7.3
  either side), and wider than `Config.tsumWidth` because that one is the
  spacing of a pile that overlaps and this one is the sprite. The derived colour
  lands 2.9 to 10.2 from the real cluster across a normal board, a fever board
  and a time-up flash.
- **A skill can hold "Link MyTsum first" off mid-round**: `ts.setMyTsumPriority`
  (`src/skills/skillCore.ts`), a hold beside the setting rather than a write
  over it, lifted on a Quick Bar skill change and gone with the run. Formal Suit
  Beast holds it while his mode runs -- on a two-colour board the priority is
  useless, and its sort fought the throttle's length order.

### Fixed

- **Stop fired the tap a paused run was parked in.** A paused script sits
  *inside* the native `tap()` it was about to make, and the host must resume it
  for `stop()` to wind it down -- so that tap, and every one the task made
  before its next `isRunning` check, landed on whatever the user had navigated
  to meanwhile. The host now revokes a stopped run's input before that resume
  (`DeviceHost.revokeInput`, `../game-automation-app`), and the `Tsum` touch
  wrappers, `linkTsums`, `popGameBubbles`, `elsaBurstFrozen` and
  `rapunzelLinkChain` inject nothing once `isRunning` is down, which also covers
  a run `start()` replaces. A gesture already begun is finished (`gestureOpen`)
  so no finger is left down. Needs the matching app build.
- **The level-cap sweep gave up as soon as it arrived.** Closing the sort dialog
  leaves the grid on whichever page the selected tsum landed on, and that tsum
  is usually a MyTsum at MAX, which Level Lock order puts far past the capped
  run. The rewind was bounded at twelve pages against a collection that runs to
  about ninety, so the sweep read eight uncapped cards and stopped having raised
  nothing. `rewindCollection()` now walks the whole way, in bursts of four taps
  between readings because the capture is the expensive half of a page turn.
- **And it skipped every other tsum when it did start.** It read the eight
  padlocks once and then walked slots 0..7 off that reading, which only holds if
  the grid stands still -- but a raise takes its tsum out of the locked group,
  which is what the collection is sorted by, so the cards shift under it and the
  walk lands on an uncapped one within a few raises. It now re-reads the grid
  after each raise and takes the first card still wearing a padlock, which is
  the right next tap whether or not the game re-sorts. A page turn is only
  spent once the page has none left, and if the grid moves without one being
  turned -- the game following the tsum whose cap was just raised -- the sweep
  rewinds and picks the run up again.

- **"Link MyTsum first" was sampling the skill gauge, not the tsum.**
  `sampleMyTsumColor()` averages an 80x80 box at `Button.gameSkill1`, which is
  the button's *tap* point some 60 logical pixels below the portrait, so the box
  lands on the gauge -- and the reference therefore tracked how charged the
  skill was. Over four labelled boards it missed the 30 gate on all four, by 59
  to 120, leaving `myTsumIdx` at -1 and the setting doing nothing. The reference
  now comes from `src/tsums.dat`, looked up by the shorthand `identifyMyTsum()`
  has already read off the pre-round screen; the button sample stays as the
  fallback for a tsum the library cannot name. One screenshot per round cheaper
  than what it replaced.
- **The level-up fingerprints were matching the friends page.** All nine probes
  of `TsumLevelUp5to4Bonus` separated by less than their own threshold, four by
  nothing at all, and on four the nearest frame in the corpus was a FriendPage
  one: four evenly spaced panels of dark blue down the middle is also what the
  weekly ranking looks like. It reached seven of nine on both friends frames, so
  a different friends list was enough to tip it; nine probes then outranked
  FriendPage's six, and `nav.move.back` pressed the level-up Close at
  (300,1660) -- the hub's Card button. `LevelUpDimmedChrome` is the fix: four
  points the overlay dims and no hub page can, reading 13-20 against a hub
  minimum of 372. The three entries drop the probes that measured nothing in
  either direction, so they no longer outrank an honest fingerprint either.
- **`Config.pageShiftTolerance` is off.** Judging an entry on its probes' 3x3
  blocks at the best single shift rescued a *wrong* entry over the corpus far
  more often than a right one -- 487 (frame, entry) pairs brought closer to a
  false match against none rescued -- and it was a third of what took the
  level-up entries from missing the friends page to claiming it. `pages:eval` is
  46/46 either way, and `score` is back to one capture pixel per probe.
  `pages:calibrate` follows the flag, so thresholds are set under the rule the
  device judges by.

### Changed

- **A `via` hop the router does take no longer pays for an arrival.**
  `drive(goal, waypoint)` runs a waypoint without the settle, the rest between
  passes or the second look: those exist so an *arrival* is not believed off a
  frame caught mid-transition, and a waypoint is tapped straight off again, with
  the outer loop confirming the real goal. Every plan that declares a `via`
  declares `FriendPage`, whose settle is 3s and whose rest is 1s a pass, so that
  was about four seconds of the eleven it took to reach the collection.
  Destinations are unchanged; measured at 0ms of plan waiting for the hop, and
  ProfilePage still settling its 1.5s as a destination.
- **The "level cap has been raised" toast was dismissed with one blind tap.**
  It carries no button and does not clear itself, and a tap landing while it is
  still arriving is swallowed by the animation rather than by the toast -- so
  the sweep sat watching an undismissed toast until its wait ran out. A device
  log caught it on the eighth raise after seven clean ones.
  `leaveLevelCapToast()` taps for as long as the toast is still up, checks for
  the collection before each tap so none is spent on the grid behind it, and
  hands anything that is neither to the router.
- **One hiccup no longer ends the level-cap sweep.** A raise that did not take
  -- a dialog opening a beat late, a screen read mid-fade -- ended the whole
  run; it now takes the collection page again and carries on, and gives up only
  after three in a row. Every wait that times out logs what the screen actually
  was (`unlock.pageMissed`), which is what a report of one of these needs.
- **`navigate()` takes a plan's `via` hop only when it needs to.** It was
  unconditional, on the reasoning that `this.page` is too stale to skip a hop
  on -- true, but a look taken then and there is not that reading.
  `PageRouter.oneTapFrom()` peeks once and skips the hop when the screen is
  already the goal or carries the anchor that reaches it, which is the usual
  case: the collection is one tap from the friend page the play loop sits on,
  and the round trip home cost seconds of settles for nothing. `peek` rather
  than `detect`, because the movers are still pointed at the outer goal there.
- **The level-cap sweep is rewritten off page detection.** `taskAutoUnlockLevel`
  made twelve blind taps and no detections, four of them raw literals; it now
  waits to *see* each of the five screens it walks. The Robotmon-era old/new
  order-panel probing and its six `Button.outTsumCollectionOrder*` tables are
  gone.
- **The sweep puts the collection back in the player's order.** `sortCollection`
  reads which button on the Change Order dialog is gold before picking Level Lock
  (`CollectionSortDialog`: four points a button, gold against blue), and
  `restoreCollectionSort` picks that one again once the raises are done. Leaving
  Level Lock in place bought nothing -- every sweep sorts on entry anyway.
- **`CollectionGrid` (`src/data.ts`) replaces `PageDef.lockIcons`.** The card
  grid, the padlock badges and the raise-cap coin are readings taken off a screen
  already recognised, not evidence about which screen it is. The padlock is now a
  vote over six points on the badge rather than one pixel: the glyph is 30px on a
  dark bar, so a single probe rated `risky` to `unusable`, where the vote reads 6
  of 6 on all fourteen capped cards in the corpus and 0 of 6 on all ten uncapped
  ones.
- **A raise is only pressed when the game offers one.** The card's padlock says
  the tsum is at its cap; the gold coin under the detail panel is the offer to
  lift it, and that is checked before the tap that spends coins.

- **Formal Beast throttles the leading colour instead of refusing it**
  (`formalBeastThrottle`): its chains are cut to what still fits under the rose,
  never dropped. The old rule dropped them, and with only two colours on the
  board there was no third to fall back on -- a scan whose trailing colour had
  no linkable component linked nothing at all.
- **Formal Beast searches to chains of 15 while his mode is up**
  (`FormalBeastPlay.modeMaxChain`). Two colours make the board's components
  huge and `calculatePaths` returns one chain per component, so the default cap
  of 3 was clearing nine tsums for a whole scan cycle.
- **Formal Beast measures how far one cleared tsum moves his gauge**
  (`gFormalBeast.fillPerTsum`), off the readings and batch sizes it already
  takes; the throttle's budget is that number rather than a constant. Seeded at
  0.015, bounded, and carried on `skill.formalBeast.steer`.
- **`SkillHandler.chainLimits` may be a function of `ts`**, asked once per scan,
  for a skill whose board changes shape mid-round. `skillMaxChain` takes the
  `Tsum` rather than the skill id; static limits (Coronation Elsa) are
  unchanged.

## [0.6]

### Summary
- Coronation Day Elsa skill added: her window freezes as much of the board as it can, then sets the whole pile off in one burst. Elsa reads "Skill Level" as how long her freeze window stays open, 5 seconds at level 1 up to 10 at level 6, and ignores your "Max chain" and "Chains per board scan" settings.
- Rapunzel+ skill added: her skill draws one chain through tsums of any colour, as long as "Skill Level" allows — 9 tsums at level 1 up to 24 at level 6, ignoring your "Max chain" setting during the skill.
- "Delay between rounds" setting added: rest a set number of minutes after each round. The Quick Bar counts the rest down and starts the next round on a tap, and the rest can be changed mid-run. Hearts and the mailbox carry on during it.

### Added

- **`src/strings.d.ts`, `src/i18n.ts` and one catalogue per language.** `UiText`
  is a `const enum` of every translatable string the two pages show, and
  `UiStrings` is *mapped over* it, so a catalogue and the vocabulary are one
  list. `i18nText` / `i18nFormat` / `i18nThunk` resolve at render time against a
  registry each catalogue file registers itself into.
- **`src/logsEn.ts` and `src/logsZhTw.ts`, with `src/logs.ts` as the registry.**
  `logStringsFor(tag)` merges a language over English once at the top of a run,
  so `logMessageFor` stays one lookup however partial a translation is.
- **`npm run i18n:check` (`tools/i18n/`).** Reports what each language is
  missing and which `UiText` keys nothing names any more; fails only on a
  `data-i18n` in the markup naming no key, which is the one thing here no
  compiler reads.
- **Between-rounds delay (`SettingKey.RoundDelayMinutes`, Gameplay > Playing).**
  `taskPlayGameQuick` holds the wait itself and returns until it is up, rather
  than the task being registered with a longer interval: the interval is also
  what orders the task set at start (`preferTask`), so a long delay would put
  playing ahead of the heart and mailbox chores. `ts.nextRoundAt` is the instant
  the next round may start, set after `finishRoundStats` so it is measured from
  the score screen being away.
- **`roundDelaySkip()`, `src/index.ts`.** The third global the settings page
  evaluates by name, after `start` and `stop`: the Now button beside the delay
  clears `nextRoundAt` on the live run and leaves the setting alone. The Quick
  Bar's countdown chip calls the same one — a rest cut short is an action, and
  `quickBarApply` only carries values.
- **The rest pair on the Quick Bar** (`src/quickbar.html`, a fourth column):
  `Rest`, the delay as an ordinary stepper, under a `.qb-skip` chip that draws
  the countdown and ends the rest when tapped. `quickBarState` reports a
  *remaining span* rather than the instant it ends at, and `quickbarPage.ts`
  re-bases that onto its own clock and ticks it every second between the
  three-second polls — so the two sides need not agree about what "now" is.
  `quickBarSetRoundDelay` re-times a rest already running from where it began,
  since the delay it was set with is what `nextRoundAt` was built from.
- **Rapunzel+ (`SkillType.RapunzelPlus`, `src/skills/rapunzelPlus.ts`).** Her
  activation clears nothing: it makes the board colour-blind for a moment, so
  the choreography is one drag. `rapunzelChain` puts the whole board in a single
  group and reuses what sits under `calculatePaths` — the same link reach, the
  same adjacency graph, the same bounded DFS — with the level's
  `RapunzelPlusConfig.chainLength` entry as the stopping condition. The chain
  settings are not consulted inside the window and not overridden outside it:
  her chains in ordinary play are worth exactly what they clear, so there is no
  `chainLimits` here. Three things it has to get right, each borrowed from Elsa's
  window: `extraClusterSlots: 1` buys back the colour the `uniqueTsumCount - 1`
  cut drops, which is a tenth of the board when colour no longer matters; a look
  reading under `settledFraction` of the board the play loop scanned is the
  refill from its last batch still falling, waited out and retaken rather than
  dragged at air; and `beforeActivate` spends the hoarded bubbles aimed, off
  positions the cycle's scan already holds, because a bubble crossed mid-drag
  pops and ends this board-crossing chain there. `skill.rapunzel.done` carries
  the cap, the chain actually taken and the board it was read off — a `chain`
  short of `maxChain` with a full `read` means the board offered no longer path.

### Fixed

- **The Copy, Paste and Now buttons kept the language the page opened in.**
  Their labels were the one text resolved while the `tabs` schema was being
  built, so the redraw that follows a language change re-read a string chosen at
  load. A button label is a thunk now, called on every render like every other
  piece of text.

- **Rapunzel+ began her drag on the tsums that were still falling.** The chain
  is now worked bottom-up, as Coronation Day Elsa's window is — but for a harder
  reason: Elsa can spend a bad chain and draw another, while this skill gets one
  drag, and a first link that grabs air where a tsum used to be loses all of it.
  The cause is that the search orders its DFS starts by *ascending degree*, and
  on a pile the loose low-degree tsums are exactly the ones at the top, where
  the refill is still arriving — so left alone it began precisely where the
  board was least settled. Three parts, and the plain one does most of the work:
  `lowFirst` into the search (Elsa's own parameter), a `fallingBand` of the pile
  held out of planning, and the finished path drawn from whichever end is lower
  — free, since a path links the same tsums drawn either way. Over 300 ragged
  synthetic boards the first link fell in the top 30% of the pile **80.0% of the
  time before; 0.0-1.7% now**, and the chain banks 5 to 22 links before it
  reaches that band at all. Mean length is unchanged at every level and every
  raggedness (9.00 and 24.00), because the settled part of a board fills the
  chain on its own; the whole board comes back into the plan only when it
  cannot, which on these boards is a pile eaten to 70%.
- **Rapunzel+ scanned the board while her own animation was covering it**, which
  is why it chained three: the plan was three, and no amount of care over the
  drag was going to help. Measured off `rapunzel_debug/rapunzel+_1.mp4` — the
  board reads mean luminance 138 before the tap, is under a dark veil by 0.1s,
  sits at 41 from 0.65s to 1.45s, and comes back at 1.47s. The old fixed lead-in
  put the scan at ~0.7s, squarely inside that, on a board that is also *still
  refilling* from the play loop's last batch. So the animation is no longer
  waited out by the clock, it is watched for: `rapunzelEdgeLight` reads the play
  square's left, right and bottom bands at 8×8 — bands, because the animation is
  a bright figure over the middle, and each against its own pre-tap level,
  because a band with no tsums under it is dark either way — and the gate waits
  for the board to darken and then come back, so the frames between tap and veil
  cannot be mistaken for it. Replaying the clip through the shipped gate fires it
  at 1500ms, the frame the board returns, with the animation never getting all
  three bands past 0.64 against a 0.85 threshold (the rainbow burst takes the
  bottom band to 1.5 on its own, and the left to 0.90 — never the right, which
  is why it is the *dimmest* band that decides). It never refuses to chain: a
  board that never lights is chained anyway after `litWaitMs`.
- **Rapunzel+ linked three tsums where it had planned twenty-four.** Two causes,
  both of them the chain being long *and* colour-blind, and neither reachable by
  a same-colour chain. Nothing on the board is inert during her window, so a
  tsum the drag merely passes over is linked, out of order, and the plan parts
  company with the chain the game is building: planning now stops at
  `planReach` (1.35 × `tsumWidth`) instead of the game's full 1.9 link reach, so
  no third tsum sits on the line between two of ours — 300 synthetic boards say
  that costs nothing at all (24.00 tsums either way) and takes the paths whose
  drag crosses no unplanned tsum from 54% to 97%. And `linkTsums` sends one
  `moveTo` per tsum at 10ms, under one display frame, so the middle of a long
  path can be sampled away; `rapunzelLinkChain` is her own drag, dwelling on
  each tsum for longer than a frame and sweeping the gaps instead of jumping
  them. `linkTsums` itself is untouched — it is held identical to TsumBeta on
  purpose. The drag costs 292ms at level 1 and 712ms at level 6, paid for by
  cutting the flat lead-in from 700ms to 450ms and the settle retries from two
  to one: an animation over the board and a board mid-fall both read as too few
  tsums, so the settle gate already catches them, and only when they are really
  there. `skill.rapunzel.done` gained `moves` and `dragMs` to tell a lost-links
  drag from a short plan next time.

- **Coronation Day Elsa (`SkillType.CoronationElsa`, `src/skills/coronationElsa.ts`).**
  The only choreography that plays rather than aims: her activation opens a timed
  freeze window instead of bursting, and a chain drawn in it freezes a band across
  the board between the chain's two *ends* rather than clearing anything.
  **The board does not move while the window is open** — measured off the four
  `corpus/_unlabeled/Coronation_Day_Elsa` captures, which read 6.1 and 11.7 mean
  absolute difference per channel over the cells unfrozen in both, against 64 for
  the control of one frame displaced by a third of a tsum. So a pass takes **one
  capture**, not one per chain, and what froze is modelled from the bands drawn
  (`elsaBandCover`) rather than re-read. **One tap on the ice spends the whole
  pile**, so a burst is a decision, never a reflex — and the decision is "no
  more chains can be made": it fires when fresh captures keep agreeing the
  board is played out with a real pile standing (`earlyBurst`), refreezing the
  refill with window left and closing out without, and the clock forces it
  only when just `burstTailMs` of window remains. The board's three moving
  moments are all falls — the window opening on the last batch's refill, a
  pop, a burst — and an ice-free look reading clearly fewer tsums than the
  board holds is one in flight, waited out and retaken
  (`settledFraction`/`settleRetryMs`) rather than chained at air. Between
  bursts every chain is kept off the ice: a *quarantine
  ring* (`avoidHalfWidth`, the band measurement's upper bound) drops everything
  near a drawn line from planning until a later capture reads back what it
  really was; *every* cluster inside the frozen colour box is treated as ice,
  not just the biggest; a candidate whose drag would pass within
  `dragClearance` of known ice *or a read bubble* is not drawn — a linkable hop
  (47.5px) is wider than a narrow band so a chain can straddle one, and a
  bubble touched mid-drag pops and ends the chain there; and each chain gets
  `chainSettleMs` to register before the next drag. After a burst the board
  settles for `postBurstSettleMs` under a blind sweep; the next pass then pops
  every bubble it can see *aimed*, off its own capture, and looks again after
  the fall (`bubbleSettleMs`, twice at most) — a bubble is a hole in every
  freeze band drawn through it, and bursts are what earn them, so left alone
  each burst would seed the holes that shrink the next one. Leftover ice the
  play loop ever sees is burst on sight (`orderPaths`) rather than left
  standing. `beforeActivate` spends whatever bubbles the cycle's scan still
  holds, aimed — before the activation tap, so before there is any ice a tap
  could set off.
- **`elsaNextChain` picks the chain whose band takes the *least* off the board**,
  which is the opposite of the obvious rule and what measured best: freezing and
  consuming are the same act, so the widest band spends the material the next
  chain would have been made from. Over ten synthetic 49-tsum boards at five
  colours — longest-first 67% (3.6 chains), widest band 65% (3.3), narrowest band
  73% (5.0), widest span 70% (4.2). A sweep of the length cap from 4 to 10 moved
  coverage by one point, which is why there is no cap.
- **`CoronationElsaConfig` (`src/data.ts`)** — the window by skill level, the
  chain caps, and the HSV box a frozen tsum's cluster centre falls in. The box
  was measured off the four `corpus/_unlabeled/Coronation_Day_Elsa` captures
  against every `corpus/GamePlaying` frame; ice reads (h 103-116, s 62-79,
  v 222-229) and the nearest ordinary colour anywhere is a blue Sadness tsum at
  (h 108, s 131, v 174).
- **`tools/elsaCoverage/`** (`npm run elsa:coverage`) — how much board Elsa's
  window freezes, by selection rule, over synthetic boards. Drives the
  production `calculatePaths`/`elsaNextChain` out of the built bundle under the
  `tools/pageEval/load.js` shim, so it measures the real rule. Makes the
  hand-measured table in `elsaNextChain`'s doc comment reproducible, and says
  what `maxChain` costs: capped at 10 it matches uncapped coverage exactly
  (66.0% over 100 boards), and only a cap of 4 gives up a point.
- **Candidate slicing tried and rejected**, recorded in the harness header.
  `calculatePaths` gives the window ~3 candidates a step, so it cannot choose a
  freeze band's direction; slicing each chain into its sub-chains gives ~15 and
  costs no search. It loses anyway — 67.6% production against 60.7% sliced, and
  worse still when slices are required to span the board. Every variant that
  made a band better made the window draw fewer of them, so coverage is set by
  how many bands get down, not how good each is. The window is unchanged; the
  experiment lives in `tools/elsaCoverage/` so the result can be re-checked.
- **Elsa's window works the board bottom-up** (`CoronationElsaConfig.bottomFirst`).
  `calculatePaths` gained an optional `lowFirst`, which breaks its DFS
  start-order ties by board position and tags each chain with the `startY` it
  grew from; the window then draws the lowest anchor first. Free at 1000 boards
  a seed — 67.1% against 67.0% — where reordering the same candidates by height
  cost a point, and `highest` scored the same as `lowest`. Both halves hang off
  the one flag, and `--bottomBandPx` in the harness sweeps how wide a level is.
- **`tools/chainBench/`** (`npm run chain:bench`) — the chain search against an
  exact longest-path solver over synthetic square and hex boards, beside the
  bounded DFS it replaced, and with `--qjs` timed under a wasm QuickJS-ng, the
  interpreter the device runs. What it settled: the old search already found
  the optimum in ~4,000 of ~4,000 component searches at the shipped reach, and
  a whole `calculatePaths` costs 0.5–2 ms a scan against ~50 ms for one drag —
  so neither a native solver in the host nor an exact DP was worth taking, and
  the question is closed rather than open.
- **`npm run pages:calibrate`** (`tools/pageEval/calibrate.js`) — what the
  corpus reads at every probe, through the production read path. It re-centres
  a colour the page's own frames agree on, raises a threshold to the studio's
  formula (1.25× spread + 15, at least 40, under 0.6× separation) and never
  lowers one, replays every proposal against the other pages' frames and drops
  an entry that would newly match one, and with `--write` rewrites the literals
  in `src/data.ts` in place. An entry's own frames are only those it passes or
  misses by one near probe, so a regional alternate is never re-centred onto
  its sibling's frame.

### Changed

- **The Quick Bar scales with the screen instead of scrolling (`--qb-u`,
  `src/quickbar.css`).** Every width, gap and type size is now a count of one
  design pixel that runs from 1px at 440dp down to 0.72px at 320dp, and the
  `min-width` floors that used to push the fourth column past the edge are gone
  — the strip needed 422dp at drawn size, which no common phone has. Squeezed
  further, a stepper's name ellipsises before its arrows lose tap area.
- **Text moved out of the code into per-language catalogues.** Both languages
  used to be inlined at every string — `title` beside `title_zh_TW` on every
  spec, `Logs` beside `LogsTW`, and a positional `i18n(zhTW, en)` — so a third
  language meant editing every line rather than adding a file. A spec now names
  a `UiText` key and the text lives in `src/uiEn.ts` / `src/uiZhTw.ts`; log
  sentences moved the same way. Adding a language is now a `Locale` member, two
  catalogue files that register themselves, and the lines that list them.
- **A translation may be incomplete; English may not.** The reference
  catalogues are typed complete (`UiStrings`, `typeof LogsEn`), so a new string
  fails the build until it has English; every other language is partial and
  falls back key by key. `LogsTW: typeof Logs` forced a translation to be
  finished before it compiled, which is the friction that stops a language being
  added at all. `i18n:check` reports the gaps instead.
- **Interpolation is by name, not by concatenation.** `i18nFormat` fills
  `{named}` placeholders, so `'Waits {minutes} min between rounds.'` and
  `'每局之間休息 {minutes} 分鐘。'` put the number where each sentence wants it.
  The item-list separator and the "every 6 h" unit are strings in their own
  right for the same reason.
- **`Settings.langTaiwan` is now `Settings.locale`, a tag.** The engine looks a
  catalogue up by it rather than asking "is it Chinese?", so a third language
  needs no change on either side of the bridge. `start()` still accepts
  `langTaiwan` from a settings page older than the field, or from a hand-written
  command. **Share codes are untouched** — `SHARE_SLOTS` never carried the
  language, and dropdown values encode `item.key`, never a label; codes built
  before and after this are byte-identical.
- **The language picker draws itself from the registry.** One button per
  registered catalogue, labelled with what that language calls itself, so a new
  catalogue appears in the picker with nothing edited. `Locale` moved to
  `src/shared.d.ts`, which all three compilations include.
- **The Quick Bar's labels are translatable.** They are `data-i18n` keys in
  `src/quickbar.html`, filled in by `quickbarPage.ts` — so the strip's layout is
  still edited in the markup alone. Left untranslated in Chinese rather than
  invented, which is the rule this project already follows for log sentences;
  they fall back to English exactly as they read today.
- **A number row may carry buttons.** `buildStepper` appends `setting.buttons`
  into the stepper, so an action can sit beside a value instead of needing a row
  of its own; the delay's Now button is the one user.
- **`setNumberValue` rounds.** Every numeric row in the schema is a whole
  number, and a share code has always carried one as `Math.round(n)` — typing
  `2.5` used to store `2.5` and travel as `3`.
- **Page fingerprints tolerate a one-pixel shift.** `PageRouter.score` reads
  each probe's 3×3 capture block (`Tsum.getColorBlocks`, still one crossing per
  entry) and judges the entry at one shift for all its probes, tried nine ways
  with the centre first — a device or dpi resampling the screen moves every
  landmark the same way, and letting each probe pick its own neighbour was
  measured to admit a page's near-twin. Anything that matched before scores
  exactly as it did. On the corpus it recognises the four `TsumTsumStorePage`
  frames that read 31 against a threshold of 30: 46 of 46, from 42.
- **`PageDef.targeted`** keeps an entry out of `sweep`, so only `matches()` can
  answer with it. `ReceiveHeartWithoutCoins` is the one user: its seven probes
  are mail-dialog furniture that the GiftHeart frame satisfies by 6–13 on six
  and by 33 against 30 on the seventh, and seven probes outrank GiftHeart's
  five — a sweep on the gift page was three absColor units from answering it.
- **The `Page` table recalibrated off the corpus** (`pages:calibrate --write`):
  six probe colours re-centred on what the corpus reads — the store page's, a
  MailBox white, a last-seconds HUD pixel — and seventeen thresholds raised, the
  hand-authored 25s and 30s lifted towards the studio's floor of 40 wherever the
  other pages' frames leave room. Nothing lowered. 85 probes could not be
  lifted: the purchase and box dialogs are furniture fingerprints with no frame
  of their own and no separation to spend, which is the corpus's gap, not the
  table's.
- **The tooling stopped describing a q80 capture.** `Tsum.screenshot()` has
  been lossless for some time and the harness already applied the bundle's own
  quality, but DEVELOPMENT.md, the studio, `noise.js`, `synth.js`, `corpus.js`
  and the corpus README all still said q80. `pages:audit`'s TIGHT list now means
  thresholds under the studio's authoring floor rather than under a q80 noise
  floor that no longer exists.
- **Page detection is costed.** `page.matched` carries `durationMs`,
  `captureMs`, `scoreMs`, `passes`, `scored` and `shift` — 0 when the centre
  pixels matched outright, otherwise the one-pixel tolerance carried it, which
  makes it a per-device drift signal — and the timeout path emits
  `page.unmatched` with the same costs. Debug records: a run without debug
  logs pays two clock reads a pass. Until now nothing recorded what a
  detection cost.
- **`findLongestTsumPath` is a pruned DFS rather than a budgeted one.** A
  reachability bound drops branches that cannot beat the best chain, a
  dead-state memo never re-walks a (visited set, tsum) pair, and every tsum is
  tried as a start under one `SearchStepBudget` — so the search is exact where
  the old six-starts-plus-extension pass was a heuristic: it finds the two
  chains that pass missed at reach 2.8, in 3–8× fewer steps. On QuickJS-ng that
  is 30–70% off a scan at cap 15 or above and a wash at the default cap of 3;
  the budget sits where the worst single search is under the old one's
  (`npm run chain:bench`). `startY` is now simply `[0].y`.
- **`calculatePaths` takes an optional chain cap**, overriding the "Maximum Chain
  Number" setting for one call — `0` for no cap, which is what Elsa passes. A
  parameter rather than writing `Config.maxChain` for the duration, which a
  choreography that threw would leave set for the whole run.
- **A ready skill fires before the play loop's periodic sweep and fan**, not
  after: a full gauge used to wait behind a blind sweep — two, when the skill's
  own `beforeActivate` swept as well. A firing skill that sweeps for itself
  (`sweepsBubbles`) now also resets the pending periodic sweep, whose job its
  closing sweep just did.
- **`SkillHandler.chainLimits`** — a skill may override the "Maximum Chain
  Number" and "Chains per board scan" settings for the play loop, for one whose
  chains are worth something other than what they clear. Read at the point of
  use (`skillMaxChain`, `skillMaxChainsPerScan`) and never written into the
  settings, so the Quick Bar goes on showing what the player chose, a skill
  change takes effect on the next scan with nothing to restore, and a
  choreography that throws cannot leave the run capped at something it set.
  Coronation Day Elsa is the first user: uncapped chains, because between
  windows the only job is refilling the gauge, which counts tsums cleared
  rather than chains linked. `bubblePopChainLength` follows the same limit, so
  a skill that caps chains low still earns its bubble pops.
- **A skill's tuning tables now live in its own file**, under a "Tuning data"
  heading below the file header: the Tiara, Formal Beast and Coronation Elsa
  blocks moved out of `src/data.ts` (2557 → 1966 lines), which keeps only what
  more than one file reads. No behaviour change — every one of those tables had
  exactly one reader, and nothing reads them at load time.
- **`elsaBurstFrozen` taps highest ice first**, aimed taps sorted by `y` and the
  blind grid's rows already top-down. A tap spends the group of ice it lands in,
  and a pile is not always one group — bands drawn in different corners never
  touched. Clearing a group drops everything above it, so a tap taken low staled
  every aimed position left in the list and the ice they were for survived as a
  gap. Nothing below a tap moves.
- **README**: "Skill Level" no longer claims only Cinderella reads it — Cpt.
  Lightyear and Coronation Day Elsa do too.
- **`chainSettleMs` is a real wait (150ms)**, not the 0 it had held for the
  skill's whole history, which made the margin the header claims a no-op.
  `coronation_elsa_debug1.mp4` at 13.68s sets a 16-tsum pile off 33ms after a
  15-chain froze, for 94,680 — where the clean window at 1.9s took 106 tsums
  for 1,626,542.
- **The freeze model quarantines the drawn path, not just the end line**
  (`elsaPathBandCover`, unioned into both the coverage and the avoid band). That
  15-chain snaked down the left of the board and froze a column along its own
  path, nowhere near the diagonal through its ends — which was all the
  quarantine had modelled.
- **`maxChain` capped at 10 inside the window**, was uncapped. The measured cost
  is about one coverage point (the 4-to-10 sweep), and it bounds how far a chain
  can snake off the end line the ice model is built on.
- **The settle gate holds out five retries** (`settleMaxWaits`), was a hardcoded
  two. 500ms could not outlast a burst-sized refill: after the 106-tsum burst at
  1.9s the gate ran out and chained a still-filling board at 2.72s.
- **The post-burst wait scales with the pile** (`elsaPostBurstSettleMs`: 250ms
  plus 6ms a tsum, capped at 900), replacing a flat 250 sized for a small pop.
- **The release note is approved before it ships** (`tools/release/review.js`).
  `npm run release:*` used to take the `### Summary` bullets and publish them
  unseen; it now renders the note as the app will and waits for approve, edit or
  deny — before the build, so a deny costs nothing. An edit opens `$EDITOR` and
  can be written back into `CHANGELOG.md`, so the published note and the section
  it came from stay the same text. `--yes` skips the gate for a scripted run, and
  is required when there is no terminal to ask on.

### Fixed

- **A live tsum colour inside the frozen box no longer reads as ice**
  (`elsaIceAlikes`): the `coronation_elsa_debug2.mp4` board carries a pale
  ice-blue tsum whose cluster sits in the box, and the phantom pile it made
  satisfied `earlyBurst` for ever — each early burst's blind grid then popped
  the real ice the last chain had just frozen. Colours the box matches on
  scans taken before the round's first window — when ice cannot exist — are
  remembered for the round and exonerated (plain-Euclidean match,
  `iceAlikeMatchDist`; real ice measured ~24 away).
- **The blind burst grid now backs the closing burst only.** A mid-window
  burst's pile comes off a fresh capture, so its aimed taps suffice, a missed
  group is re-read next pass — and the grid was what popped piles the model
  never claimed.
- **Elsa's ice no longer crowds live colours off the board**
  (`SkillHandler.extraClusterSlots`, four for her). The scan keeps its biggest
  `uniqueTsumCount - 1` clusters and cannot tell ice from a colour, so with ice
  measured at three shades a five-colour board was read as one — and a colour
  without a slot is absent from the board array, not merely unchained. Worth
  nine points on the harness (`--slots=4 --iceShades=3`: 48.5% against 57.8%),
  which is more than any selection rule in the file. Declared on the handler
  rather than set while the window is open, so the between-window scans that
  `elsaIceAlikes` learns from see the same clusters.

## [0.5]

### Summary
- A Quick Bar along the bottom edge of the screen, below the game's own buttons so it can be left up all run, changes skill, skill level, chain settings and the +Coin and 5>4 items without stopping the run, and shows this run's average coins per round
- Pausing now pauses the round as well, so nothing runs down while you change something
- With "Debug logs" on, the script now records what it is about to do next, so a run that gets stuck can be read back step by step
- Each round's stats row now records the settings that round was played under, so a Quick Bar change shows up from the next round rather than on rounds already finished
- Opening the settings panel now pauses the run instead of ending it: close it again and the script carries on where it was, or press Play to restart on the settings you just changed

### Added

- **The Quick Bar — six settings, changed mid-run.** A strip on the screen's
  bottom edge carrying Skill, Skill level, Chains per board scan, Max chain,
  +Coin and 5>4,
  plus this run's average base and final coins per round. Live only while the
  script is paused, because a touchable overlay also eats the taps the script
  injects. `src/quickbar.ts` is the engine half (`quickBarState`,
  `quickBarApply`); `src/quickbar.html` / `.css` are the whole appearance, and
  `src/quickbarPage.ts` only binds what the markup declares.
- **Pausing presses the game's Pause button.** `onPause()` is a hook the host
  evaluates once the pause flag is down, gating that one evaluation back through
  a gate that parks `tap()` and `sleep()` for everything else. No resume hook:
  `dismiss.resumeGame` presses Continue on the next look at the screen.
- **`src/skillOptions.ts`** — the Skill Type list, in both page compilations
  rather than copied into each.
- **`RunCoinTally` on `ts`**, filled by `finishRoundStats` from the same two
  figures the CSV row carries. A round whose coins would not read is left out of
  its own average rather than counted as zero.
- **`src/forecast.ts` — what the script is about to do, without doing it.**
  Three layers, each answered from whatever already decides it rather than from
  a second reading of the rule: which subscription will act on this frame, which
  task the scheduler takes next, and the ways off this screen with where each
  leads. Written as one `forecast.state` record per change, debug-gated and
  deduplicated, with `stoppedBy` beside the prediction so a record that
  disagrees with itself is visible in the log.
- **A route graph: `PageRoutes` and `AnchorRoutes` (`src/data.ts`).** The
  page-to-page edges BACKLOG.md names as the fix for every remaining blind tap.
  Anchor edges (`mail`, `tsums`, `home`, `store`) come off the `Page` table, so
  adding an anchor adds an edge; `back` and `next` are per page. Every edge says
  how far it is to be believed — `handler` for a tap that exists in
  pageHandlers.ts, `anchor` for a button nothing navigates by yet, `declared`
  for one read off the screen's layout. **Forward only**, which is the direction
  OBSCURED_BOARD.md § The design that was rejected leaves open. Nothing consults
  it while deciding what is on screen, and `navigate()` does not read it yet.
- **`npm run state:view` (`tools/stateView/`)** — the three layers as one
  picture, following the log over adb, gap-cli or a saved file. It renders and
  computes nothing: every judgement on the page was made on the device by the
  code that acts on it. Runs with no device attached, on the built bundle.
  The top lane grows downward twenty screens deep instead of redrawing each
  frame, and joins two rows in red when the screen the script named is not the
  one it landed on.
- **`npm run pages:selftest` now checks the route graph against
  `corpus/transitions.json`** — an observed transition no edge admits, an edge no
  harvest has seen, and the pages with no way out declared (24 of them today).

### Changed

- **Opening the settings panel no longer stops the run.** `OnSettingClick` is a
  no-op in `src/settings.ts`; the host pauses instead, which parks `sleep()` and
  every touch injector, so the script cannot tap the panel drawn over the game.
  Closing the panel resumes; Play with it open sends `start()` with the settings
  on screen, and `start()` winds the old run down itself. Needs the matching
  host change (`FloatingWindowService`) -- an older host still stops on its own
  side, which is harmless.
- **A stats row says what its own round was played under.** `beginRoundStats`
  copies the settings when the round starts (`ts.roundSettings`) and
  `writeRoundStats` writes every settings column, `skill_type` included, off
  that copy. `quickBarApply` now also writes each change onto `ts.settings`, so
  that object is the live configuration rather than what `start()` was handed --
  before this, six Quick Bar settings could move without the CSV ever noticing.
- **The Quick Bar greys out instead of veiling itself.** The "Pause to edit"
  cover, and the 0.35 opacity under it, hid the readings the strip is left up
  for. Now every value keeps full ink and only the affordances go quiet, with
  `disabled` on each control -- so the tap is refused by the button as well as
  by the untouchable window -- and a teal top edge for "live".
- **The Quick Bar is three columns, not a grid of six equal cells.** Skill,
  Lv, Scan and Chain in one growing column of two rows; +Coin and 5>4 in one
  as narrow as its toggles; the coin readout as before. The equal thirds gave
  the skill name no more room than a toggle, which is the one control with
  anything to read.
- **+Coin and 5>4 are chips that say their own name.** A label beside a switch
  spent 39dp repeating what the chip's own teal tint already says; that width
  now goes to the skill name, and the button's word is its accessible name.
- **The skill name has the top row to itself.** Lv moved down beside Scan and
  Chain, and all three now carry their name over their number inside the chip --
  at three steppers to a row there is no width for a label next to one. The
  skill name roughly doubles its room; only the +/- buttons take the slack, so
  a wider screen buys tap area.
- **The values column no longer shrinks past its own stepper row.** Under about
  340dp the three chips slid under the bonus column instead of starting the
  scroll the strip already had.
- **A third compilation: `tsconfig.quickbar.json`** → `dist/quickbar.html`,
  built and inlined the way the settings page is. `npm run typecheck` runs all
  three.
- **`StorageKey` (`src/settings.d.ts`)** — the two localStorage keys the pages
  share, written once now that two of them read the settings entry.
- **A handler that can decline says so, as the same function its body tests.**
  `acts` on five subscriptions and `takes` on eleven, both read by the forecast:
  `acts` is what makes "which one will act" answerable without running it, and
  `takes` is what joins the acting handler to the edge it presses. Sharing the
  predicate rather than restating it is the point — a forecast that has drifted
  from the handler it describes is worse than no forecast.
- **`getFirstPriorityTaskName`'s choice is `preferTask`**, extracted so the
  forecast orders the task set the way the loop really would. A move, not a
  change; the chain's real rule (a larger interval wins over a higher-priority
  task, because each test is only reached when the one above it did not fire) is
  now written down where it can be read.
- **`dist/tsums.dat` ships without its header.** `tools/minify/library.js`
  replaces the plain copy in both build scripts and drops the 25 comment lines
  `build_library.py` writes, which explain the format to whoever opens the
  source and are skipped by `myTsumLoadLibrary` on the device. The format line
  stays -- it is data, and the loader refuses a library without it. The compiled
  scripts already carried no comments (`removeComments` in all three tsconfigs,
  and terser prints with `comments: false`), so this was the last one left.

### Fixed

- **A pause mid-round left the round running.** `onPause()` ran *before* the
  pause flag, so the press landed while the play loop was still going: its next
  detect saw `GamePause` and the resume handler pressed Continue straight back,
  and the two threads were injecting into one touch stream besides. The host now
  pauses first and lets the hook alone through the gate
  (`ScriptRuntime.runPauseHook`, `Engine::eval`'s `ignorePause`), so nothing is
  racing it. Every route into a pause runs the hook now, not just the floating
  bar's button. Needs the matching host change.
- **Resuming left the round on its pause menu.** `nav.move.resumeGame` was in
  the `navigate` band, which is silent unless `navigate()` set a goal — so the
  play loop's own `detect` never reached it. It is `dismiss.resumeGame` now,
  which runs on any look at the screen. Unreachable for as long as a pause could
  not make a round stick, which is why it surfaced only with the fix above.
- **A paused round hung on "Use skill".** The pause menu leaves the skill button
  showing over a frozen screen, so it reads ready on every look and the tap never
  reaches the game: `while (this.useSkill(board))` never ended, and the repeats
  collapsed into one log line. `useSkill` now takes `GamePlaying` only.
- **`onPause` says which screen it found.** A round sitting on its own pause
  menu reported "not in a round"; it now reports being already paused, and an
  unrecognised screen says so rather than sharing that answer.

## [0.4]

### Summary
- Round stats save several seconds sooner, and no longer blank a score or coin figure whose digits include a 5
- Tuned Captain Lightyear 120 skill a bit to hopefully perform better than before.

### Changed

- **A setting is named by `SettingKey`, not by a quoted string.** The new
  `const enum` in `shared.d.ts` keys `interface Settings` itself, so the enum
  and the object `start()` receives are one list; the schema rows, `SHARE_SLOTS`,
  the Run order card and the stats columns all take members, and a misspelling
  is a build error instead of a control that quietly does nothing. Erased at
  compile time, so both built files are byte-for-byte what they were.
- **The settings page's other repeated literals became constants too**:
  `LANG_KEY` / `SETTINGS_KEY` for its localStorage keys, `Locale` for the two
  language tags, `RowKey` for the rows that hold no value, and
  `rowElementId` / `controlElementId` for the two element-id prefixes.

### Fixed

- **The digit `5` misread, and blanked whichever stats field held one.** The
  template drew a three-row top bar where the game draws one row and a long
  left stem -- most of a '6' -- so a coin-sized '5' flipped to '6' and failed
  the margin check on every read of the round. Recut from two failing tallies,
  now in the corpus (`ScorePage/mumu-540x960-five-*`) and gated by `pages:stats`.
- **One obscured frame no longer restarts a field's confirmation.**
  `readSettledStatsNumber` counts sightings per value instead of requiring two
  reads in a row, and gives up after six looks when nothing has ever read -- so
  the tally's glitter cannot burn the whole 8s settle window per field, which
  is what was stretching a recording to 9-10 seconds and then blanking the
  field anyway.

## [0.3]

### Summary
- Round stats now record the medals a round earned
- A round that finishes slowly no longer loses its score in the stats file
- "URL to Tsum Monitor" has been removed

### Added

- **The `medals` column reaches players here.** It was written under 0.2 (below),
  but after the 0.2 archive was cut, so 0.3 is the first build installable with
  it -- a round's medal award, read off the score page beside the coins, with a
  tally that draws no medals row recorded as 0 rather than an empty cell.

### Changed

- **The play line reads "Gaming", not "Gaming (Fast version)".** The
  parenthetical contrasted with a slow loop that exists neither here nor
  upstream. The `play.gamingFast` event id is unchanged -- that is what a log
  filter matches on, and only the sentence is free to move.
- **A release keeps the last few builds installable.** `metadata.json` gains a
  `Versions` array of the newest `HistoryLimit` builds, so the app's card can
  offer an older one; archives past the limit are pruned on the next release.
  `DEVELOPMENT.md` § Releasing.
- **The tree is pinned to LF** (`.gitattributes`, `.editorconfig`), and
  `CLAUDE.md` records why neither Git Bash nor PowerShell can be trusted to
  measure or write a text file here.

### Fixed

**Round stats**

- **A round that takes its time finishing is still recorded with its score.** The
  wait for the tally was one 15s budget covering the whole post-round sequence,
  and the **Level Up** panel was not one of the screens that renewed it -- so the
  panel and the payout in front of it could spend the lot before the tally was
  drawn, and the row was written blank. Now the panel renews the window like the
  rank-up and record panels already did, the count-up gets its own window once the
  tally arrives, and one cap (60s) bounds the renewals. This surfaced when the
  script stopped going quiet for a round's closing seconds: those seconds are
  played now, so there is more still paying out when the timer stops and more to
  count up afterwards.

**Tooling**

- **`pages:stats` runs again, and checks the medals tally.** It crashed on
  `statsScoreButtonsReady`, which takes the frame now rather than capturing one,
  and its expectations still named the coin region by its old name -- so the one
  test of the stats readers had been failing to start rather than passing. It also
  asks which tally layout is up, and the medals frame has expected values at last.

### Removed

- **"URL to Tsum Monitor"**, its 30s ping task, the `requestTsumMonitor` calls
  scattered through the long-running tasks, and the whole `monitor.*` log
  component. It pinged a Robotmon-era side service nothing here ships. The
  `lastVisitedPages` progress signal stays -- it is the stuck watchdog's. Its
  share-code slot is retired rather than cut, so codes still work.

## [0.2]

Folds 0.1 as well: the two were cut from one running section, and were never
split apart afterwards.

### Summary
- Longer chains, with a new "Link reach" setting
- New skill: Formal Suit Beast
- Better timing for Cpt. Lightyear
- "Clear Bubbles" is now a three-way "Bubble Strategy"
- Settings changes now apply mid-run
- Settings now shows what will run, and when
- New "Share settings": copy your setup as a code, or paste someone else's
- Auto Send Hearts now sweeps your whole ranking
- Rank-up and record panels no longer hide your score
- New "Record round stats": every round you play is logged to a spreadsheet
- Round stats name the tsum played, split by day, and can be shared from the app
- The floating bar names the tsum being played
- No more going quiet for the last seconds of a round
- "Auto buy boxes" has been removed

### Added

**Gameplay**

- **"Link reach (% of a tsum)"** -- how far apart two same-coloured tsums may be
  and still link, as a percentage of one tsum width. This is what governs chain
  length; "Maximum Chain Number" only caps what it makes reachable. Default 220%
  (180% gives chains of 4,4,4,3 on the corpus board; 280% gives 11,10,7,6). Too
  high and the search proposes hops the game refuses, which reads as re-tapping.
  In the stats CSV and in share codes.
- **Formal Suit Beast.** The board becomes Beast (blue) vs Belle (gold) with a
  twin gauge; whichever half fills first detonates, and finishing *both* pays out
  a run of bursts instead of one. The loop keeps the halves level -- trailing
  colour's chains first, leading colour dropped once it is within a chain of the
  rose while the trailing half is under 60%. Two hooks are general rather than
  his: `SkillHandler.orderPaths` (a skill may reorder the chain batch before it
  is cut to "Chains per board scan") and `ts.boardClusters` (the scan now keeps
  each cluster's centre, so a skill can tell two colours apart). The gauge is too
  thin for a page probe, so it is read at native resolution off a 980x88 crop.
- **Cpt. Lightyear sweeps and re-fires when its own burst refills the gauge.**
  EXPERIMENTAL, this skill only. That state leaves a board full of bubbles and no
  chain coming to spend them on, so it sweeps the board (~0.5s) and returns,
  sending the play loop straight round again. The gauge read can false-positive
  on its own animation, so it only decides whether to sweep -- re-firing stays
  `useSkill`'s call, which re-reads properly.
- **Cpt. Lightyear 120**, for 120fps devices: same taps, halved timings. Seeded,
  not yet measured -- four numbers at the top of `src/skills/cptLy.ts`.
- **Fever time is detected and broadcast.** A fever is a mode of the board, not a
  screen, so it gets no `PageName` and the play loop is unchanged.
  `ts.isFeverTime(img?)` is one look at four pixels; `gFever` holds the state and
  `gFever.subscribe` fires on both edges. Driven by `record.feverTime` (one
  capture per 300ms while the board is up), with two agreeing readings required
  before an edge is announced. The fingerprint needs two facts, because either
  alone is a lie the screen tells often: the gauge outline goes white, *and* the
  HUD chrome drops to near-black teal.

**Round stats**

- **"Record round stats"** (on by default) -- one row per played round appended
  to a CSV in `tsum_record/`: date and time, skill type, how long the round ran,
  the final score, the in-game coin counter as the round ended, the coins shown
  on the score page, and the gameplay settings it was played under, one column
  each. Only rounds the script actually played through are written, and columns
  are only ever added to an existing file, so rounds collected before a settings
  change stay comparable. The score and both coin figures are read off the screen
  by matching each digit against bundled templates; a field that cannot be read
  confidently is left empty rather than guessed at, and the whole screen is saved
  beside the CSV as `unread-<fields>-<timestamp>.png` so the reason can be looked
  at. Note that an expanded log window sits on top of the in-game coin counter,
  which legitimately empties `base_coins`. Everything below refines this.
- **`tsum` column** -- which tsum played the round. Coins per round vary more by
  tsum than by any setting, and `skill_type` is not a stand-in. Read off the
  pre-round button thumbnail before anything taps, matched against
  `src/tsumPortraits.ts` (311 portraits cut from the large TsumsPage artwork,
  ~1.1 KB each) at native resolution -- the matcher's own 360px capture leaves
  the thumbnail 41px across. **An unclear match is an empty cell, never a guess**:
  77 of the 311 cannot be separated at any bundle-sized grid (Chip and Dale
  differ by a nose), and a coin flip would poison the comparison the column
  exists for. Masking to an **ellipse** was the single biggest win -- the corners
  of both crops are the game's own furniture, so comparing them compared
  furniture to itself.
- **`medals` column** -- the round's medal award, read off the score page beside
  the coins. A tally with no medals row at all is the game saying none were
  earned, so that is a 0 rather than an empty cell.
- **`script_version` column.** Without it a change in the numbers cannot be told
  apart from a change in the script that produced them. `ScriptVersion`
  (`src/data.ts`) carries the `$VERSION` placeholder, stamped into `dist/` by the
  build scripts, so `package.json` stays the one place a version is written.
- **Every row carries an `id`, first column** -- what a reader needs to drop
  duplicates. A UUIDv7, so ids sort by when the round was played. The tail is not
  `Math.random` alone (QuickJS seeds its PRNG from the clock, so two phones
  starting together would collide); its last group is a digest of the device's
  own identifiers, cached in `tsum_record/device.id`. Hashed, because those are
  hardware ids and this file leaves the phone.
- **Stats can be sent to an endpoint -- by the app, not the script.** `buildRun`
  hands the daily CSV pattern to `publishStats()` (host API) and that is all of
  it. The files are the queue: the host remembers the last `id` sent per file and
  sends what is newer, which is what the UUIDv7 was for. A run killed mid-upload
  costs a duplicate, never a loss. Off until **Share round stats** is switched on.
- Existing CSVs gain new columns on the next round written to them, with earlier
  rows left empty. Rows predating `id` are given one on the rewrite that adds it,
  keyed on the row's own text, so a months-old file uploads whole.

**Settings**

- **"Share settings"** at the top of the settings page. **Copy** turns the
  current gameplay settings into a short code -- 20-40 characters for a whole
  configuration -- and puts it on the clipboard; **Paste** reads such a code back
  and applies it. The code carries the gameplay settings only: the developer
  options and "Auto buy boxes" stay out of it, and a code from another version of
  the script applies the settings the two versions share, skipping and reporting
  the rest.
  - A code is a whole configuration rather than a patch: what it does not mention
    was at its default and goes back to its default when applied, which is both
    what keeps it short and what makes pasting one reproduce the sender's setup
    exactly. A code that arrives damaged is refused rather than applied in part.

**Screens and navigation**

- **`AccountLevelUp` is a recognised screen.** The player's own rank-up panel
  lands over the score tally and waits. Nothing fingerprinted it, so it fell to
  `ClosePage` (the one-pixel catch-all) and `waitForScorePage` could not see it as
  an interruption -- the round's score and coins were read late or not at all.
  Its nine probes sit only on the title art and the star, the two things drawn
  identically for every account.
- **`StatsScorePageBlockers`** (`src/roundStats.ts`) -- `waitForScorePage`
  restarted its budget for the Magical Time offer only; it is a list now, holding
  `MagicalTime`, `HighScore` and `AccountLevelUp`.
- **`ProfilePage` is a navigation destination.** The hub's Home tab had a
  fingerprint but no way to be asked for. New `NavPlans` entry and
  `nav.move.toHome` off a `home` anchor, so `friendPageGoToSelf` is two confirmed
  hops instead of two blind taps.
- **The Level Up screen is recognised whether or not the 5-to-4 bonus is on.**
  The bonus drops a panel and the stack stays centred, so the layouts interleave
  rather than shift; only the five-panel one was recognised before.
- **Screens drawn more than one way say so.** A corpus frame records which
  *configuration* it caught and coverage is counted per configuration, so an
  unrecognisable layout reads as a missing fingerprint rather than a flaky one.
  Two new measurements beside stability and separation: *cohesion* (how far a
  pixel moves across a page's own frames) and *drift* (how far it moves between
  configurations -- whether one entry can cover both).
- **Permanent vs transient screens.** A transient screen goes away by itself and
  is waited out rather than tapped, so a tap aimed at it cannot land on whatever
  replaced it.
- New corpus frames for `StartPage` (the pre-round screen had none, so nothing
  had ever checked the screen the tsum reader depends on) and `HighScore` (which
  had a fingerprint and a handler but no frame behind either).

**Tooling**

- **Which tsum is selected is read off the game's own art.** The pre-round
  button is a blank yellow plate with one sprite drawn over it, and both ship in
  the asset pack -- so `name_handling/build_library.py` rebuilds every one of the
  769 buttons rather than photographing them, at a transform fitted against real
  captures (the residual is nothing but the store ribbon, the Lv badge and the
  hint toast drawn on top). A library entry and a live capture are the same
  drawing, which is what let both accept thresholds tighten at once: a strict
  score floor to catch an icon the library does not hold, and a loose margin to
  still name the art twins. Measured over all 769 wearing real overlays, then
  shifted, resampled, gamma-shifted and JPEG'd: every confident match correct,
  and the refusals are twins like `flynn`/`flynn2`. 16 levels per channel scored
  the same as 256, so the library covers 769 tsums in 386KB where 505 cost 488KB.
- **The tsum's name comes from the strip the game prints it on.** 676
  `win_tsumname_<short>.png` strips out of the asset pack, read by
  `name_handling/ocr_names.py` into a shorthand -> name map. The CSV's `tsum`
  column now carries the game's own id (`kalimcm`), not a name-derived one
  (`kalim_charm`). A tsum with a sprite but no name strip -- 94 of them -- is
  still identified, under its shorthand: telling two tsums apart and printing a
  name are separate facts.
- **A walkthrough recorder**: drive the game by hand and the script writes down
  what the game did. A Debug setting, and a *mode* -- `buildRun` registers nothing
  else and the recorder only calls `gPages.sweep()`, which scores without
  broadcasting, so nothing taps and what is recorded is what the person did. Per
  visit it stores the page, the matching entry, the duration, the page that
  followed, a frame, and **every tap** in both screen pixels and the 1080x1920
  logical space (via a new `Tsum.toLogicalXY`) -- a logical tap can be pasted
  into `Button` or read as a `PageDef` anchor, a device-pixel one describes one
  phone. Frames are budgeted; the visit and tap record is complete regardless.
- **The page graph is collected rather than guessed at.** `PageRouter` has always
  written one frame per page change and nothing read them back, though those
  filenames are ordered, page-labelled visits. `npm run pages:pull` harvests them
  into `corpus/transitions.json` (one `adb shell ls`, no image transfer) and
  `npm run pages:docs` draws the sitemap in PAGE_DISPATCH.md: a mermaid graph,
  every observed pair with a count, and a `by tapping` column, so
  `GiftHeart -> HeartSent` is an edge you take by pressing (780, 1100). The
  ledger accumulates across pulls and re-pulling is idempotent.
  **It is a map, not a filter** -- nothing consults it at runtime and nothing
  should; an interruption can follow any page, so the graph is not closed.
  `pages:selftest` covers the ledger rules that fail silently.
- **`npm run release:alpha` / `release:beta` / `release:production`** build a
  channel and write the archive, a `metadata.json` entry and a running
  `CHANGELOG.md` into the catalogue folder that `build-official.ps1` scans.
  `-- --dry-run` prints the entry without writing. It replaces three hand-steps,
  each a way to ship an entry describing some other build: the archive is now
  **named from `config.json`** (`TsumTsum-Alpha-0.1.zip`), the **`Hash` is taken
  from the bytes being copied**, and the **release note is generated from the
  `### Summary` bullets** -- a section without one fails before the build runs.
  `deploy.ps1` is now `debug_deploy.ps1`, which is what it always was: the debug
  loop that pushes `dist/` over the installed folder, skipping the catalogue.
- **The build writes `<archive>.zip.sha256`** -- the bare 64-character digest, no
  filename field and no trailing newline, so a reader gets a string rather than a
  line to split. `build.sh` and `build.ps1` write identical bytes.
- **A Run order card on the General tab.** The settings page had no answer to
  "what happens when I press Play" -- the schedule is spread over five tabs and
  the order is a property of the task controller. The card lists every job the run
  registers in the order `getFirstPriorityTaskName` picks them, then one board
  scan as a single line, and redraws on every change. It is a hand-kept mirror of
  `buildRun` and `taskPlayGameQuick`: a new task needs a line in `runOrderSteps`,
  and nothing checks that it still matches. `SettingSpec.build` is the new hook
  that lets a row draw itself rather than hold a value.
- **Page Studio: Dispatch, Anchors, and deleting a frame.** Dispatch shows every
  reaction per screen live. Anchors edits where a `Page` entry's taps land --
  draggable and nudgeable, and the only check there is, since no fingerprint
  evaluation notices a Cancel button ten pixels into the wrong bevel. Frame rows
  can now be deleted from the list rather than by opening each one.
- **`npm run pages:stats`** reads the three round-stats numbers off the corpus
  through production code and checks them against what a person read. Those
  colour cutoffs fail quietly -- a drift empties a column a round at a time.
- **`PAGE_DISPATCH.md`**, generated on every build: every reaction, the order they
  run in, the queue per screen, and the permanent/transient table. Produced by
  asking the compiled script, so it cannot drift.
- **`CODEMAP.md`** at the repo root -- the one-page index of the tree, verified
  against it by `npm run map:check` on every build.

**Logging**

- **Every line the script writes is one JSON record.** JSONL, so it goes straight
  into Logdy, `jq` or anything else with no parser and no prefix to strip.
  `LOGGING.md` is the schema and the Logdy recipe; `src/logging.ts` is the
  machinery. The point is what an overnight run leaves behind: "which rounds did
  the Tiara skill give up on, and what were the scan timings?" is a filter over
  fields (`event = skill.tiara.unsure`, `scanCostMs > 40`) and was not answerable
  against a sentence with the numbers spliced into it.
  - The top level is a **fixed envelope** -- `timestamp`, `level`, `component`,
    `event`, `message`, `runId`, `roundId`, `data` -- and everything a call site
    had to say lives under `data`. The envelope holds only what is true of any
    program's log line, so it is a schema you can assert, a payload field named
    `level` cannot collide with the record's own, and renderers need no list of
    "keys that are not payload".
  - **`event`** is a stable dotted id (`play.gameOver`) that does not change with
    the wording and is the same in both languages; **`component`** is its first
    segment and the coarse filter; **`runId`** spans one `start()`..`stop()` and
    **`roundId`** one round. Both ids are injected by the logger rather than
    passed by call sites, which is the only way they land on every line instead
    of the ones somebody remembered.
- **`gap-cli logs --raw`** (host app) prints records as they came, for piping into
  a viewer. Without it, `logs` renders them back to human lines.

### Changed

**Gameplay**

- **"Clear Bubbles" is now "Bubble Strategy", a three-way choice, and the default
  taps no bubbles off a chain at all.** A bubble popped while a chain clears takes
  a bigger area with it -- the premise Tiara Minnie+ is played on -- so a bubble
  spent on a blind sweep is wasted, and the old switch had only that sweep to
  offer. **One Bubble Mid Chain** (default) pops one bubble as a chain lands;
  **All Bubbles Mid Chain** pops every bubble the last scan found, still only as a
  chain lands; **All Bubbles ASAP** pops on sight and keeps the periodic blind
  sweep. The ceiling is per strategy now (`maxTapsMidChain` 6, `maxTapsAsap` 12,
  replacing a flat 3 that made "all" mean "up to three"). A saved config with the
  old switch on comes back at the new default, and its share-code slot is retired
  rather than reused, so codes in circulation keep their meaning.
- **A skill declares that it clears bubbles itself.** `SkillHandler.sweepsBubbles`
  marks the ten skills whose choreography ends on `clearAllBubbles`, for skills
  that turn tsums into bubbles and so have no chain to save them for. The loop had
  a hardcoded pair of Lightyear ids doing half this job, which left eight other
  skills sweeping a board they had just emptied.
- **A fever no longer costs the play loop an unreadable frame, and an unreadable
  frame no longer ends a fever.** `GamePlayingHudProbes` was re-measured against
  the six fever frames -- no probe moves more than 12 against a threshold of 40 --
  so a fever board fingerprints as the board and `ClosePage` matches none of them.
  And `gFever.update()` now treats `Unknown` as *no reading* for
  `FeverUnknownHoldMs` (2000ms): mid-round an unreadable frame is ordinary, and
  the two disagreeing readings needed to flip state arrived well inside a second,
  so a running fever was announced as ended and then restarted.
- **Score and coins are read off the score page only once its Close and Play
  buttons show.** The page arrives with both numbers counting up and holds the
  buttons back until that finishes, so their appearance is the game's own signal
  that the figures are the round's.
- **`ts.selectedTsum()` makes "which tsum is selected" a question anything can
  ask** -- the match, its score, its margin and whether it cleared the thresholds,
  ungated, so the caller decides whether the capture is worth paying for.
  `identifyMyTsum()` is now just the stats path's use of it. The reading did not
  change; it was only reachable as a side effect before.

**Hearts**

- **Heart sending was rewritten around the pages the game actually draws.**
  Upstream tracked four fixed row positions and decided it had run out of list
  from five hand-measured pixels; none of that survived the move to `gPages`. The
  flow is now three screens: `FriendPage` (tap a pink heart) -> `GiftHeart` (OK)
  -> `HeartSent` (one tap both acknowledges the toast and returns to the list
  underneath). Two things fall out of reading the list rather than remembering it:
  - **Hearts are runs of pink, not fixed rows.** A row that has had its heart
    turns dark blue, so a rescan after each send is its own progress check. The
    run's midpoint is the button centre, so a half-scrolled row is still tappable.
  - **The end of the list is where the list stops moving.** `scrollFriendList`
    samples 80 points, drags, and re-reads them: 0 of 80 move between a frame and
    itself, 45 of 80 between two scroll positions, against a threshold of 8.
  - A run is now both halves of the ranking -- down from our own row to the end,
    Home and back, then up to first place. "Max run time" still splits that across
    runs, and `sendHeartsDownwards` remembers which half is unfinished.
- **Backing out of "Gift a Heart" sent the heart.** `Page.GiftHeart` had `back` on
  OK and `next` on Cancel, so `nav.move.back` confirmed the gift it was leaving.
- **The friend list no longer fingerprints as the home screen.** All five
  `FriendPage` probes were things the Home tab also draws; it lost only because
  `ProfilePage` carries seven probes and `betterPageMatch` ranks on count -- slack,
  not evidence, and not slack a narrowed sweep has. All four entries now also
  require the Rankings tab to be the selected one.
- **Heart sending polls a handful of screens instead of all 58.** `sendHeart` was
  scoring 332 probes a pass when its own `switch` branches on five page names; it
  passes `SendHeartPages` as the sweep's `expect` list now -- 85 probes.
  `ClosePage` is deliberately left out despite being branched on: it is a
  one-pixel catch-all that stays honest only because the full table outranks it.
- **The mailbox is a navigation destination** rather than navigate-sleep-tap-sleep,
  so arriving is a fingerprint match and the stall guard covers the hop. The taps
  *after* it are still open-loop, because neither screen has a corpus frame;
  `BACKLOG.md` has the full audit of what is still hand-driven.

**Logging**

- **Log event names are constants.** `src/logEvents.ts` declares all 222 as
  `Log.Play.GameOver` -- one erased `const enum` per component, so the emitted
  bundle is byte-for-byte what it was. The strings were the interface all along,
  but they had no definition to jump to, could not be renamed, and only the 69
  with a catalogue entry were checked; the other 153 were free-text where a typo
  produced a line nobody would ever find.
- **`log()` and `debug()` are gone**, and `src/utils.ts` no longer owns logging.
  All ~200 call sites moved to `logInfo` / `logWarn` / `logError` / `logDebug` in
  `src/logging.ts`. A catalogued event resolves its own sentence; an uncatalogued
  one carries its English inline rather than getting a fabricated translation.
- **Severity is real now.** Everything used to be one level. A failed task, a
  stall giving up and an undismissable dialog are `error`; a restart or retry is
  `warn`; both go out on the matching `console` method so the host's level column
  agrees with the record.
- **`Config.debugLogs` is the only switch on debug output.** The Tiara timings,
  the colour clusters, the bubble counts and the page trail were gated on
  `ts.debug` instead, so two settings had to agree before a diagnostic appeared.
  `ts.debug` still controls saving annotated screenshots, which is what it is for.
- **The rotating log file is pure JSONL.** A record goes through verbatim, since
  it already carries a better timestamp and level than the old text columns did.
  Plain text from the host and engine is wrapped into a `host.message` record --
  including the session banner, the one line guaranteed to break a reader.
- **The floating bar, the settings page's `onLog` and `gap-cli logs` render the
  records back to human lines**, so nothing on the device got harder to read:
  `14:30:00.123 [info] play.gameStart Game Start roundId=7`.
- **The heart tally rides on `hearts.*` records only.** It was a `[R:3 S:5/12]`
  prefix glued onto every message, a running total repeated onto every line about
  the board, the store and the page router. `runId` ties a run together now.
- **The settings page writes records too** -- it shares the stream, so a plain
  line from it would break the file as surely as one from the bundle. This also
  fixes its quoting, which used to mangle apostrophes; the payload goes through
  `JSON.stringify` now.
- Several measurements that spanned lines are one record each now
  (`detectOffsetYInGame`, the score-page give-up, the per-cluster HSV dump), and
  `calculatePaths` no longer takes a `logs` parameter.

**Settings, files and names**

- **The tsum library ships beside the bundle, packed.** It was `src/tsumPortraits.ts`,
  a compiled-in array and two thirds of `index.js`; it is now `src/tsums.dat`,
  deployed next to `index.js` and read by `roundStats.ts` on the first round that
  needs a name. Signatures are the same 4-bit channels packed two to a byte and
  base64'd -- 444 characters to 296, lossless, so no threshold moved. The bundle
  goes 572 KB to 193 KB. A missing, unreadable or stale-grid file logs once and
  leaves the CSV's `tsum` column empty; `selectedTsum()` then answers null
  without spending a capture. Deploy is three files now, not two.

- **The floating window has a banner**, filling the row the button bar leaves
  empty, and the first thing on it is which tsum is about to be played. It is not
  the status line twice over: the status line is the last thing logged and is
  replaced a moment later, while the banner is a queue --
  `showBanner(message, duration, plays)`, each message with its own time on screen
  and its own number of showings, `plays: 0` meaning "for the run". `showBanner`
  is new host API, so `ts.banner()` guards for an older host rather than taking a
  run down over a decoration; `"banner": {"hidden": true}` in `floating-bar.json`
  turns it off. Identifying the tsum is **no longer gated on the stats setting**,
  since the CSV is no longer its only reader.
- **The settings page has been rebuilt.** Same options, same names. **Five tabs**
  instead of one scroll of ninety rows, reopening on the tab used last; **light
  and dark**, following the device unless overridden; **nothing fetched over the
  network** (Bootstrap and jQuery came from CDNs, so an offline device got no
  layout at all -- styling is now [Pico CSS](https://picocss.com) inlined at build
  time, with no framework behind it); and a **real skill dropdown** with typeable
  number rows.
- **Round stats are one file per day**, `tsum_record/stats_<YYYYMMDD>.csv`. They
  were split per skill, which put the field every comparison groups by in the file
  name instead of the data -- and `skill_type` was already a column. Day is a
  split no column can stand in for and no comparison needs to cross, and it bounds
  the read-modify-rewrite every row costs, because the engine has no append. Old
  per-skill files are left alone and share the same columns.
- **Every timestamp the script writes is UTC** -- the `datetime` column, the day a
  stats file is named for, the debug shots and the heart record's day buckets.
  `nowTime()` shifted the epoch by the timezone offset, which also put it a whole
  offset from the `Date.now()` the scheduler stamps `lastRunTime` with, so
  "minutes until hearts are next sent" was wrong by that much off UTC. Timestamps
  are these files' join key: two devices' CSVs could not be sorted as one, and a
  round near midnight landed in a different day's file depending on where the
  phone was. The written shape is unchanged; older rows keep their local-time
  text. The PC-side tooling matches.
- **The package directory is `app.gap.Tsum`** (was `com.r2studio.Tsum`, which
  claimed a package id belonging to a host this no longer targets). Nothing on a
  device is named from it, so this is a repo-local move. Upstream's names stay
  where they mean something: `PORTING.md`'s lineage and `tools/port/config.json`.
  Both build scripts also pushed `dist/` to a folder named after the old
  directory, and neither path was one the app reads; both now push where
  `npm run adb` does.
- **The release version is `package.json`'s.** The two were separate numbers kept
  equal by hand, and only one named the archive. `config.json` is identity alone
  now. Archive names unchanged.
- **`LevelUp` is now `TsumLevelUp`.** There are two level-up screens -- the
  post-round panel listing what each *tsum* earned, and the player's own rank
  going up -- and they behave differently, so the names now say which is which.
- **The host app is Game Automation Platform.** Docs, comments and tool names
  follow (`tools/gap-cli.js`, `GAP_CAPTURE_TIMING`, the `gap.*` logcat tags). No
  behaviour and no setting key moved, so share codes and installed trees are
  untouched, and `Download/Robotmon` is still searched, so existing devices need
  no migration. Robotmon references that were about lineage rather than mechanism
  are gone; the ones left name something real.
- **The shipped script is stripped of comments and whitespace**: the game bundle
  400K -> 235K -> **157K**, the settings script 51K -> 31K. **Nothing is renamed
  or rewritten** -- terser runs with `compress` and `mangle` off, so it parses and
  prints the same tree back. Those two passes were worth ~10% against a script
  that runs unattended for hours on a device that reports no line numbers.
  `build/index.js` stays as tsc wrote it, because the harnesses load it, and what
  ships is executed and run against the corpus before it is packed.

**Screen handling**

- **Screen handling reworked.** Everything that decides what is on screen is in
  one place (`gPages`, `src/pages.ts`) and everything that reacts to it is a
  subscription in one list (`src/pageHandlers.ts`), instead of a branch inside
  whichever loop happened to be looking. The three navigation loops are one
  table-driven loop, and reactions run one at a time in a fixed order, with the
  rule that the first to touch the screen ends the round -- so two can no longer
  act on the same frame in an order nobody chose. Practical effects: the root
  warning is dismissed wherever it shows up, the Magical Time offer is cancelled
  from one place and so on paths that used to miss it, and an unrecognised screen
  is saved for diagnosis whenever it appears.
- The script's progress signal (what the monitor URL and the stuck watchdog read)
  is "the screen changed" rather than a handful of hand-placed marks, so a game
  that is moving but not reaching those marks no longer looks stalled.

**Tooling**

- **Tsum Studio is four tabs, and a tab draws only when opened.** All four panes
  drew at once, so reaching a drop zone cost the library's 312 templates (17MB)
  and an all-pairs separation score. The closest pair is its own request now, and
  a template URL carries the signature of its cut -- so `/api/state` went from
  ~95ms to 8ms, the browser caches templates instead of refetching them on every
  save, and the grid loads what is on screen.

### Fixed

**Run lifecycle**

- **Changing a setting mid-run no longer needs the whole script reloaded.**
  Opening the settings panel stops the script -- it has to, the panel sits over
  the screen the script taps -- and that stop was racing the run it was stopping.
  `start()` never returns while the script is playing, so every `stop()` ran on a
  second thread with `start()` still on the stack, clearing `ts` and detaching
  `gPages` from under a task still using them: the next detect threw "PageRouter
  is not attached", and `start()` finished on a `TypeError`. Pressing Play then
  built a second world over the wreckage of the first, which is what made a
  changed setting look like it needed a reload.
  - A run dismantles its own world now: `endRun()` runs from `start()`'s
    `finally`, on the thread that owns the run and only once its loop has handed
    back. `stop()` drains the controller and waits `StopWaitMs` (20s) for the run
    to clear -- and if it never does, says so and leaves the run alone rather than
    clearing `ts` under it again. `start()` takes the same route before building
    anything, so Play right after Stop cannot end up with two task loops tapping
    one screen with two configurations.
  - The host half is in the platform app: opening the panel now takes the
    service-side stop route as well as the page's. Pause is engine-wide, so on a
    *paused* script the `stop();` the page dispatched parked at its first
    `sleep()` and never landed, and Play resumed the old run with the old settings.

**Chains and bubbles**

- **Chains are no longer limited to 3-4 tsums.** `Config.tsumWidth` -- the
  centre-to-centre distance of two touching tsums -- was 16, inherited from
  upstream, where the real figure measured off the corpus is 25. The chain link
  radius derives from it, so it reached 1.8 tsum widths instead of the 2.8 it was
  named for, and the same-colour graph averaged 0.9 neighbours per tsum against
  ~6 for the board -- components of 2 to 4 nodes, so no longer chain existed for
  the search to find. **"Maximum Chain Number" has to be raised as well**, since
  it defaults to 3 and caps whatever the graph makes reachable. Click Assist's tap
  radius was rescaled to hold its reach at ~29px.
- **The mid-chain bubble pop could never fire at the default chain cap.**
  `minChainForPop` is an absolute 4 and `Config.maxChain` hard-bounds every path
  at a default of **3**, so `popGameBubbles` never ran for anyone who had not
  raised that setting -- silently, because a bubble nothing taps is not something
  the log mentions. The threshold is now `Tsum.bubblePopChainLength()`,
  `minChainForPop` bounded by the cap in force: capping chains at 3 is choosing
  many short chains, not choosing never to spend a bubble.
- **A skill's burst no longer has its own bubbles spent on the wreckage it left
  behind.** `useTiaraMinniePlusSkill` returns the moment its pick tap goes out, so
  the play loop's next scan is taken on a board still detonating -- it finds the
  fresh bubbles, and the longest chain it can offer is a scrap.
  `settleScansAfterSkill` (1) holds the mid-chain pop for a scan after any skill
  fires. Nothing is lost, since every scan re-finds the bubbles; this only moves
  *which* chain spends them. ASAP is unaffected -- it asks for them gone, not
  saved.

**Tiara Minnie+**

- **It stops losing the race to the choice screen.** The symptom was the presents
  timing out untouched, which resets the 2-to-6 progression exactly as a wrong
  pick would. A recording of three activations at 30fps put numbers on how tight
  the timing is: the thought bubble is up ~750ms, the presents become tappable
  550-650ms after it goes and stop being tappable ~1150ms after -- two half-second
  windows, and the loop was arriving at the end of both.
  - **The bubble is read up to three times across its settle wait**, not once at
    the end, out of the same budget rather than added to it. The read with the
    largest mask wins, since mask size peaks when the present is fully drawn.
  - **A read taken while the bubble is still opening is discarded, not merely
    deprioritised.** `dreamMinCells` was never going to catch it: a half-drawn
    read carries 26-29 cells, well over any sane floor, and is a look at the
    *board through a cloud* -- one picked the wrong present on 15 of 15 frames it
    cleared the gates on and held that answer for 467ms. `dreamCloudFull`
    separates them off the capture the match already took (fade-in 0.29-0.40, open
    bubble a 0.43-0.45 plateau), so an open read beats a half-open one outright.
  - **A tap is confirmed by a scan separated in *time*, not by a second scan.** A
    single qualifying scan names the wrong present ~4.5% of the time, and "the
    next scan agreed" only means something if it could have disagreed. A wrong
    reading survives a median of 67ms, a right one 367ms, so `confirmGapMs: 150`
    sits past almost every wrong reading and well inside every right one -- and
    means the same thing however fast the loop spins.
  - **`choiceLeadMs` 500 -> 400**, since with poll lag on top 500 put the first
    scan at or after the window opened. Not trimmed further: the wrong-present
    frames sit in the first ~100ms after the cloud goes.
  - **The poll intervals stay at 100ms**, after a reverted spell at 30-40ms. On
    the device the faster cadence was slower to pick and more often wrong, while
    the offline harness preferred it at every capture cost -- and the harness
    cannot see whatever explains that, so the cadence goes back to what worked.
  - **Every pick and miss logs its timings.** What this skill gets wrong is nearly
    always *when* rather than *what*, which cannot be reconstructed after the fact.
- **It no longer runs out of time on the present screen.** The game resolves the
  screen itself ~850ms after the presents appear and the tap went out at 830ms --
  timing, not matching, since replaying production scoring over the frames the
  right present wins 0.62 to 0.25 once settled. The cost of *looking* was the
  problem: a sweep spent an engine crossing on each of ~1800 pixels. Every read in
  the skill is a single batched `getImageColors` now -- one crossing apiece
  instead of 2362 per activation.
- **It no longer taps a half-arrived present screen.** Score and margin were all
  that stood between a transit frame and a tap. `coverageFloor` now asks whether
  the screen is readable *at all* before the other two are consulted; it only ever
  rejects, so it cannot make the script fire earlier than before.
- **The log says what it is actually looking at.** `tiaraDescribe` called a fixed
  top band "the bow" and got it wrong often enough to send a reader after the
  wrong bug -- a pale bow is dropped by the saturation mask, and a bag wears its
  bow across the middle, so the halves came out swapped. It reports the hues in
  the mask by share now, with the mask size, which cannot lie about a structure it
  no longer assumes.
- **A bubble that appeared but could not be read logs as `tiaraDimDream`** rather
  than sharing `tiaraNoDream` with a skill that never fired, since the two want
  different fixes. A template thinner than `dreamMinCells` is refused outright.

**Screens**

- **The script no longer stops playing for the last few seconds of a round.** The
  game washes the whole screen pale cyan as the timer runs out, pulsing as it
  goes, and it moves the six pixels the board is recognised by up to 208 -- so
  for part of every one of those seconds the board did not fingerprint. Four
  looks in a row landing on the flash was enough to hand the round to
  `confirmGameOver`, which watches without playing, and the rest of the round
  went untapped. `GamePlayingLastSeconds` fingerprints the flash off pixels it
  cannot move -- the dotted outlines around Pause, the Fan and the skill button,
  which are already near white -- measured over five captures of a round's
  closing seconds. The plain entry still wins on an untinted board.
- **A round can no longer end because an animation hid the board.** The play
  loop's "is the board still up?" check scored all 58 fingerprints, including
  `ClosePage`, whose single pixel sits on the fever bar. A fever payout recoloured
  it, and with the HUD obscured by the same animation `ClosePage` was the only
  fingerprint left passing -- so one frame ended the round with no score and no
  coins. That check now considers only the six screens a running round can be
  looking at, so the misread is impossible there rather than something a later
  guard has to catch. Every other caller still sweeps the whole table.
- **Confirming a game over no longer costs 1.75s a look.** When the board stops
  fingerprinting, `confirmGameOver` watches until the HUD comes back or a
  round-over page proves the round ended -- and nothing plays while it watches.
  Each poll asked `detect` for a 1500ms retry budget, which is spent *only* when
  nothing fingerprints: exactly this function's situation, so it bought 1.5s of
  standing still per look and nothing else. One look per poll now, the grace
  window being the only budget it needs, so play resumes about four times sooner
  when the animation clears with time still on the clock. `play.hudBack`,
  `play.gameOverConfirmed` and `play.gameOverAssumed` carry `idleMs` and `looks`,
  and `play.gameOver` carries `hudLostMs`, so the next occurrence says how much
  of the round went unplayed. An overlay that lasts to the final whistle still
  costs the rest of the round; that half needs the frames OBSCURED_BOARD.md asks
  for.
- **The Level Up screen was unrecognised when the party held one tsum.** The
  screen centres its stack, so a one-tsum party draws a single pill in the gap
  both existing layouts leave clear. The screen came back unknown and "Record
  round stats" lost the round, since the in-game coin counter is read here and the
  round is not closed until its row is written. `TsumLevelUpSingleTsum` is a third
  entry, probed on the panel background the pill keeps clear.
- **The "Heart sent!" toast is a page now, and sending no longer stalls on it.**
  It carries no button and had no table entry, but it covers all three of
  `Received`'s probes, so it fingerprinted as the received-items panel and both
  `sendHeart` and `navigate` tapped buttons that are not on it. It is
  `PageName.HeartSent` now, with seven probes so it wins on evidence, and
  `PageKind.Permanent`, because it waits for a tap anywhere -- so it is dismissed
  rather than waited out. A toast found before its row has been tapped is cleared
  without being credited as a send.
- **A heart that was sent no longer reports failure.** `sendHeart` could only
  succeed through `Received` *and* only if `isGift` was set, so the flow off the
  ranking list had no success path at all: it ran its poll out, `doHeartSending`
  made a second attempt, then a full navigate and a rescan without scrolling.
  Every heart paid all of that. A send now ends on any of the three things that
  mean it happened -- the toast, the `Received` panel, or the row in its sent
  colour. Driving the real `sendHeart`: 2 polls returning true, against 17
  returning false before.
- **`sendHeart` no longer taps a dead send button forever.** The tap branch never
  touched `unknownCount`, so a row that did not react was pressed for as long as
  the script ran. It gets `HeartSendMaxTaps` (8) presses and then reports failure.
- **The new-record panel is closed wherever it appears**, rather than only when a
  navigation loop happened to be running. It waits for input and stands between
  the round and the score page, so anything waiting for that page used to watch it
  until it gave up.

**Round stats**

- **"Record round stats" now fills in the in-game coin figure.** `base_coins` was
  empty on nearly every row for two reasons at once: it was read while the screen
  was unrecognised, but the board goes on paying out coins through most of that,
  so a read that landed caught a total still climbing -- and the round was marked
  finished just before most of those reads, so they were discarded anyway. It is
  read off the **Level Up** screen now, which is shown after the payout and stays
  up for seconds, and the round stays open until its row is written.
- **A game that draws medals no longer empties the score, coin and medal columns.**
  The medal counter sits to the left of the in-game coin counter and adds a row
  between exp and coins on the tally, so both coin figures were somewhere the
  rectangles aimed at them used to be background -- and the tally's star icon
  moved out from under the `ScorePage` fingerprint, which cost the page itself.
  A second entry (`ScorePageMedals`) fingerprints the three-row layout; on the
  level-up HUD one rectangle now spans the whole counter row and the reader
  returns a number per group of glyphs, so coins are the last field whether or
  not medals are beside them.
- **The digit floors are just under white rather than mid-grey.** A 1080 capture
  is halved on its way out of `getScreenshotModify`, which thins the antialiased
  skirt round each digit; a 540-wide device gets no such shrink, and at the old
  floor the skirt of one digit reached the next -- '5' and '4' of "3,954" came
  back as one contour and the field read empty.
- **When stats cannot reach the score page, the log says what it was looking at**:
  how long it waited, every screen it saw and how often, whether the tally ever
  appeared, and the recent trail. An empty score column could previously mean the
  tally never came, or that something was parked in front of it, or that it came
  but never finished counting -- three problems that read identically.

**Tooling**

- **`pages:pull` reported an adb problem as an empty device.** Its `ls` helper
  caught every failure as "the directory is not there", so `adb: more than one
  device/emulator` came out as "Nothing recorded on the device" -- a lie about the
  device rather than a complaint about adb. Only the shell saying the path does
  not exist is read that way now, and with several devices attached it stops early
  and lists them with the recorders each is carrying.
- **The device path is one fact in `config.json` again.** Three places had three
  different paths, one of them carrying both the old root *and* the pre-catalogue
  script folder, so it wrote where nothing reads. All three come from `DevicePath`
  now; the pull still tries the old roots as fallbacks.
- **Page Studio can edit every anchor a `Page` entry carries.** Its table listed
  four of them while `PageDef` had gained `mail` and now `home`, and the generated
  snippet dropped whichever the entry already had -- so pasting over a
  `FriendPage` entry silently removed its route into the mailbox. The optional
  roles come from one table now rather than being listed a second time.
- **The settings page works inside the AGA overlay.** Two things it did are things
  a page in an overlay WebView cannot do, both failing silently enough to look
  like the page was simply broken.
  - **The skill dropdown does something when tapped.** It was a `<select>`, and
    Chromium will not open a select popup in a window with no Activity behind it
    -- it gives up with no exception and no console line, so the row rendered
    perfectly and was inert. It is a button opening a list built from ordinary
    page content, and still answers to `.value` as the `<select>` did.
  - **Switching language no longer blanks the page.** `saveLocale` called
    `location.reload()`, but the host delivers the page with
    `loadDataWithBaseURL`, so the document's address is the *script directory* and
    reloading loaded that directory. The page redraws itself in place now, which
    keeps every row's live value and is what should have been happening anyway.

### Removed

- **"Auto buy boxes"**, its `taskAutoBuyBoxes` job, the `goTsumTsumStorePage`
  navigation only it used, and the whole `store.*` log component. It spent real
  currency from a hand-rolled `switch (page)` loop that duplicated `navigate()`,
  and it was the one setting that was never persisted -- with it gone the
  settings page's `transient` flag has no users and is dropped too. The
  `TsumTsumStorePage` and `OutOfMedals` fingerprints stay: they are corpus-backed
  detection data, not part of the job.
- **"Pause When Calculating"**, along with the pause-menu round trip it did before
  and after every board scan -- far more time than the scan it was steadying, and
  upstream's own help text said to leave it off. Its share-code slot was taken out
  rather than retired, which moved every slot after it, so **share codes made
  before this no longer work**: the marker went `TSUM2-` to `TSUM3-` and an older
  code is refused with a message rather than quietly setting each of those
  settings from its neighbour. Its `pauseWhenCalc` stats column is dropped; CSVs
  that have it keep it, empty from here on.
- **The "List of Heart Counts" section** and the report behind it. It rendered one
  image per sender by round-tripping every portrait through the script bridge as
  base64 -- the slowest thing the settings page did -- and the same data is in
  `tsum_record/record.txt`. **"Record Sender" is unaffected**: hearts are still
  counted per sender and the counters still show in the log.

