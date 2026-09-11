---
title: Settings reference
description: What every setting means, tab by tab, plus the Quick Bar, presets, sharing and reporting.
---

# Settings reference

The settings page has seven tabs — **General**, **Gameplay**, **Chores**,
**Skills**, **Hearts**, **Advanced** and **Debug** — and opens on the one you
used last. The **Run order** card at the top of General lists what the
settings add up to: every job the run will do, in the order it will do them,
and what one board scan looks like. The button in the app bar switches light
and dark.

**Changing a setting while the script is running**: open the panel and the
script pauses (it has to — the panel sits over the screen it taps; if a round
is running it presses the game's own Pause too). Change what you want and
press ▶ Play: with the panel open that always means "start with these
settings". Close the panel instead and the run carries on where it left off.

<ImagePlaceholder id="settings-tabs-general" alt="The settings page open on the General tab, showing the Run order card and the tab bar" />

## General

| Setting | What it does |
|:--|:--|
| Language | The language of the settings page and the log's sentences. |
| Japan Version? | Special behaviour for the JP version of the game; also decides which version *Auto Launch* starts. |
| Special Screen Ratio (Long Screen) | For phones that render black bands above and below the game of different heights. Does not work together with *Auto Launch* — the game must already be running. |
| Device frame rate | The rate the emulator runs at (default 60). A few of the game's screens dismiss themselves after a number of *frames*, so a faster device shows them for less time; this is how the script knows how long to wait one out. Leave at 60 unless you changed it. |
| Auto Launch Tsum App | Start the game as soon as the script starts. |
| Run order | Not a setting: a summary of the others. |
| Share settings | **Copy** turns the gameplay settings into a short code; **Paste** applies one. See [Sharing settings](#sharing-settings). |

## Gameplay

| Setting | What it does |
|:--|:--|
| Auto Play Game | Play rounds when nothing else is due. Mail and hearts have priority, so very frequent chores can starve it. |
| Delay between rounds (min) | Rest after a round before the next (0–120, default 0). Only auto-play waits; the chores keep their clocks. The **Now** button ends a rest already running without changing the setting. |
| Max round duration (min) | How long one round may last before the script gives up on it (0–60, default 0 = no limit). Timed from the board coming up. |
| When a round runs long | What happens at that limit. `Stop playing, let the clock run out` (default) stops playing and lets the round finish on its own, so the score screen, the stats and the next round follow as normal. `Stop the script` stops where it stands; the round is not recorded. The game's Pause is never pressed — it would stop the very clock the round has to run down. |
| Record round stats | One CSV row per played round in `tsum_record/stats_<YYYYMMDD>.csv`: a unique round id, UTC time, skill, duration, score, coins, medals, and the gameplay settings it was played under. Figures that could not be read are left empty and the screen saved beside the CSV. |
| Bubble Strategy | What to do with bubbles the board leaves lying about. A bubble popped while a chain is clearing takes a bigger area with it, so one spent off a chain is wasted. `One Bubble Mid Chain` (default) pops exactly one as a chain lands. `All Bubbles Mid Chain` pops every bubble the last scan found, still only as a chain lands. `All Bubbles ASAP` pops them as soon as seen and runs the old blind sweep as well. Skills that turn tsums into bubbles clear up after themselves whatever this says. |
| Use Fan? | Shake the board with the Fan every few scans. Opinions differ; try it. |
| Maximum Chain Number | Caps how many tsums one chain links (3–15, default 3). A low cap plays more, shorter chains, which suits tsums that score off chain count and gets more out of a high-FPS setup; it also makes each scan cheaper. |
| +Score, +Coin, +Exp, +Time, +Bubble, 5>4, +Combo | Play with that bonus item on. Bought on the pre-round screen, so each spends coins every round. |

## Skills

| Setting | What it does |
|:--|:--|
| Skill Type | Which skill the play loop plays, grouped by what the skill leaves behind: **Burst** (fires and clears), **Bubble** (turns tsums into bubbles the script sweeps), **Unique** (changes how the script plays while it is up). `Burst` is the general-purpose entry; `Burst + clear bubbles` adds a sweep after the wait; `Pair Tsum` activates either half as soon as it is ready; `No Skill` never activates one. Skills named after a tsum are tuned for it — [Add a skill](../guides/add-a-skill) explains what a tuned one can do. |
| Skill Waiting time | The most time the script leaves the board alone after a skill. It plays on as soon as the tsums stop falling, so a generous value costs nothing. |
| Skill Level | Only read by skills whose choreography changes with it: Cinderella, Cpt. Lightyear (how many aiming taps) and Coronation Day Elsa (how long the freeze window stays open). |
| No skill last fever seconds | Do not fire the skill if the running fever ends within this many seconds. |
| Lorcana Card | For the Lorcana tsums, which play in two halves: pop the ink-stone bubble after each skill and tap the card when it appears. Works with any skill type; picking *Lorcana Aurora* switches it on. |
| Skill auto-tap | Tap the skill the moment the gauge fills, even mid-batch, for skills that can take it. |

## Chores

| Setting | What it does |
|:--|:--|
| Unlock Level every hours | Every N hours, sort the collection by Level Lock, raise the cap on each capped tsum (spends coins), and restore the order. 0 disables. **Now** runs one sweep immediately, ahead of everything but a round in progress. |
| Buy boxes every hours | Every N hours, go to the store and buy the chosen box until it sells out or coins run out. 0 disables. **Now** works like the one above; the three box rows are read at each sweep. Rubies are never spent. |
| Box to buy | Premium Box+, Premium Box, Select Box or Happiness Box. Only ever this one. |
| Buy ten at a time | Take the 10-Time Purchase button where offered; buy singly otherwise. |
| Purchases per sweep | The safety limit (1–50) on a chore that spends coins. |
| Auto Send Hearts | Send hearts to the friends list on a schedule. |
| Send to 0 score | Send even to friends without a score. |
| Max run time | Limit one heart-sending pass. |
| Waiting time (min) before repeat | The heart-sending interval. |

## Hearts (receiving)

| Setting | What it does |
|:--|:--|
| Receive All Hearts | Use Claim All. Fast, but *Unknown* senders get no heart back. |
| Waiting time (min) before repeat | The Claim All interval. |
| Receive Hearts One By One | Open every message in turn. Slower, but sends a heart back to each sender, unknown ones included. |
| Skip first person | Ignore the first message when claiming one by one (an ad, in some regions). |
| Skip ruby | Do not open messages containing rubies (they are not shared between Apple and Android). |
| Claim All old mails | Claim coin mails one by one until none carry coins, then Claim All. |
| Max Times to Open Mailbox | How many consecutive openings before the next task runs. |
| Waiting time before repeat | How long after the mailbox has been emptied before it is opened again. |

## Debug

| Setting | What it does |
|:--|:--|
| Report a problem | Save what is on screen, the screens before it, the settings and this run's recent log to `tsum_record/reports`, then share it from Run History in the app. The one row here meant for everybody — see [Reporting a problem](#reporting-a-problem). |
| Debug logs | Write `debug` records to the log file. A report carries them whether or not this is on. |
| Debug game | Save annotated screenshots while playing, keep a frame of *every* screen visited in `tsum_record/pageHistory`, and log the recent screens with how long each was up. |
| Walkthrough recorder | Record instead of play: you drive the game by hand and the script writes down every screen it recognises, where you tapped, and what followed, into `tsum_record/walkthrough`. |
| Collect unknown screens | Save any screen the script cannot recognise to `tsum_record/corpus`, rate-limited. |
| Page history depth | How many recent screens the script remembers (default 20). Frames of the last few are kept for a report. |

<ImagePlaceholder id="settings-debug-tab" alt="The Debug tab: the Report row with its note field, and the developer switches below it" />

## The Quick Bar

The settings worth changing between rounds, in a strip along the very bottom
of the screen, below the lowest button the game draws. The sliders button on
the floating bar opens it.

| Control | Changes |
|:--|:--|
| Skill | Which skill the play loop plays |
| Lv | Skill level |
| Scan | Chains per board scan |
| Chain | Maximum chain number |
| +Coin, 5>4 | Those two bonus items |
| Preset | Not one setting: which saved configuration is loaded |
| Bubble | Bubble strategy, short: **1 mid**, **All mid**, **All now** |
| Report | Saves a report of what is on screen. The one control that works while the script is still playing |

- **The controls work while the script is paused.** Press ⏸ and they come
  alive; press ▶ and they grey out. A live strip would swallow the taps the
  script aims at the game underneath.
- **Pausing pauses the round too**: the script presses the game's Pause on
  the way out and Continue on the way back.
- **Most changes wait for the next round, and the strip says which.** A
  teal bar along a chip's bottom edge means this round, amber the next; the
  Preset chip's is half of each. Between rounds the bars go away.
- Everything changed here is applied to the run already going *and* saved,
  so the settings page shows it and the next Play starts with it.
- On the right: this run's average base and final coins per round, and how
  many rounds those are over. Both reset at every Play.

<ImagePlaceholder id="quick-bar-strip" alt="The Quick Bar while a round is paused: the chips live with teal along the strip's top edge, and the coin averages on the right" />

## Presets

A preset is **how a round is played, under a name** — exactly what a settings
code carries, so a setup tuned for farming coins with one tsum and one for
score with another can be swapped with two taps. It covers the Gameplay and
Skills tabs except the rows about the *run* rather than the round (Auto Play
Game, the wait between rounds, Track round statistics, Max round duration);
everything on the other tabs — language, mailbox, hearts, chores — stays as
you have it.

The dropdown at the top of the settings page names the preset your settings
currently are, or *No preset* when they are not any of them. The save button
opens a box with **Save as new**, **Update** and **Delete**; whichever the
typed name allows is live. Loading a preset changes everything it carries — a
row it does not mention goes back to its default, like pasting a code.

The same dropdown is on the Quick Bar. **Export presets** writes one line per
preset (name and settings code) to the clipboard or to `presets.txt` beside
the round statistics; a line pasted into the share box is the way back in.

<ImagePlaceholder id="preset-menu" alt="The preset dropdown open on the Quick Bar, listing the saved presets with the current one marked" />

## Sharing settings

**Copy** turns the current gameplay settings into one line of text and puts
it on the clipboard; **Paste** reads one back and applies it. The same code is
drawn as a QR under the box, for the way between two phones. A whole
configuration is 20 to 40 characters, because everything at its default is not
written down:

```
TSUM4-y2f.YiDACgg.K5.T2.U5.Vo.fu~
```

A code carries how a round is played and nothing else. Applying one gives you
the sender's setup: a setting the code carries but does not mention goes back
to its default. Codes from another version still work — what both versions
have is applied, the rest skipped, and the line under the row says how many.
A damaged code is refused outright.

<ImagePlaceholder id="share-code-dialog" alt="The Share settings row with a code in its box, selected, and the QR drawn below it" />

## Reporting a problem

Press **Report** — on the Debug tab, or on the Quick Bar — and the script
writes a folder holding the screen, the screens before it, your settings and
the last few hundred log lines. It also writes one by itself whenever it gives
up on a screen, a chore throws repeatedly, a round ends without the script
seeing the score, or it finds itself somewhere with no way off.

Then open **Run History** in the app: a run that saved a report has **Share
report** (packs everything into one zip for a chat app, mail, a drive) and
**Save to device** (writes the zip to `Download/GameAutomationPlatform/reports`).
Nothing leaves the device unless you send it.

Opening the settings panel pauses the run and presses the game's Pause, so a
report taken from there shows the pause menu — the screens *before* it are
saved too. To catch the live screen, press Report on the Quick Bar while the
script is still playing, or hold the Log button on the floating bar.

Reports live in `tsum_record/reports`; the newest eight are kept.

<ImagePlaceholder id="run-history-report-buttons" alt="Run History in the app, with a reported run's card showing Share report and Save to device" />
