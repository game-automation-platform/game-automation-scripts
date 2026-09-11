# TsumTsum script

Working on the code? See [DEVELOPMENT.md](DEVELOPMENT.md) for how the source is
laid out, how the files fit together, and how to build.

## Script description

This script automates the following tasks:
- Receiving items from the mailbox
- Sending hearts to your friends
- Playing the game
- Unlocking Tsum levels
- Buying pickup capsules and select / premium boxes


## Settings

The settings page is split into seven tabs — **General**, **Gameplay**,
**Chores**, **Skills**, **Hearts**, **Advanced** and **Debug** — and it opens on
whichever one you used last. **Chores** is the jobs the script does between
rounds: raising level caps, and buying boxes. Hearts are chores too, and have a
tab of their own. The **Run order** card at the top of General is worth a look
before pressing Play: it lists what your settings add up to — every job the run
will do, in the order it will do them, and what one board scan looks like. The button in the top right switches between light and dark; until you
press it, the page follows whatever your device is set to.

**Changing a setting while the script is running:** open the settings panel and
the script pauses — it has to, the panel sits over the screen it taps — and if a
round is running it presses the game's own Pause on the way, so the timer stops
too. Change what you want and press ▶ Play: with the panel open that always
means "start with these settings", from whatever is on screen at the time,
including a round already in progress. There is no need to close and reload the
script.

Close the panel instead — the ⚙ button again, or the ✕ in its header — and the
run simply carries on where it left off, with the settings it was started on.
Looking at the settings costs you nothing.

Here is a brief description of every setting.

| Setting                            | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
|:-----------------------------------|:-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Language                           | Changes the language in which the script settings are shown.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Japan Version?                     | Activates special behaviour for the JP version of Tsum Tsum.<br>This setting is used to decide if the JP or Int'l version is started when "Auto Launch Tsum App" is enabled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Special Screen Ratio (Long Screen) | If the script does not do the expected actions like sending/receiving hearts, give this setting a shot. <br>Some smartphones with long displays render black areas over and under the game screen itself. If these areas have different vertical sizing, this setting is needed. Beware that it does not work together with "Auto Launch Tsum App" as the game must already be running when starting the script with this setting enabled.                                                                                                                                                                                                                                               |
| Device frame rate                  | The frame rate the emulator runs at (default 60). A few of the game's screens dismiss themselves after a fixed number of *frames* rather than after a fixed time, so on a faster device they are up for less time. The script uses this number to work out how long it can expect such a screen to stay, and waits it out instead of tapping into whatever replaces it. Leave it at 60 unless you have changed the emulator's frame rate; getting it wrong only affects those screens. |
| Auto Launch Tsum App               | This starts the Tsum Tsum game as soon as this script is started. Should only be used if "Special Screen Ratio" is disabled. Depending on the used device, this might or might not work. Successfully tested within LDPlayer 5.0.11 on different screen resolutions.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Run order                          | Not a setting: a summary of the others. It lists the jobs this run will register, in the order the task loop takes them when more than one is due at once -- a fixed order per job (a sweep asked for with a Now button, then the app restart, level caps, boxes, mailbox, receive-all, hearts, and the round last), not the order of their intervals -- and the steps of one board scan. It redraws as you change things. |
| Share settings                     | **Copy** turns your current gameplay settings into a short code and puts it on the clipboard; **Paste** reads such a code back and applies it. See [Sharing settings](#sharing-settings).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Auto Play Game                     | If enabled, the script will play games when no other tasks need to be done. Receiving and sending hearts has priority, so if these tasks are configured to be performed very often, the script might never play a single game.<br>***Warning:*** this can affect system stability if the script runs for many many hours. If the game or the used emulator crashes frequently, try disabling auto play.                                                                                                                                                                                                                                                                                  |
| Delay between rounds (min)         | How long the script rests after a round before starting the next one (0-120, default 0 — no rest). Only auto-play waits: the mailbox, heart and app-restart jobs keep their own clocks and run during it, and Click Assist is unaffected. The **Now** button beside the number ends a rest that is already running, so the next round starts within a few seconds — it does not change the setting, so the round after that rests again. |
| Max round duration (min)           | How long one round may last before the script gives up on it (0-60, default 0 — no limit). It answers the round that never ends: a skill stuck on a board it cannot clear, or a screen the script never recognised. Timed from the board coming up, not from the walk to it, so a normal round with plenty of +Time is well under two minutes. |
| When a round runs long             | What happens to the script when the limit above is reached. Either way the script stops *playing* and the round is left to time out on its own — the game's Pause button is never pressed, because pausing the game would stop the very clock the round has to run down. `Stop playing, let the clock run out` (default) waits it out: the round ends within a minute, and the run carries on as normal with the score screen, the stats and the next round. `Stop the script` stops it where it stands, exactly as the Stop button does — the round times out with nothing watching, so it is not recorded. |
| Record round stats                 | Appends one row per played round to `tsum_record/stats_<YYYYMMDD>.csv` in the script's storage folder -- one file per day, next to `record.txt`: a unique `id` for the round, when it was played (UTC), the skill type, how many seconds it ran, the final score, the in-game coin counter as the round ended, the coins and medals shown on the score page, and the gameplay settings it was played under — one column each, so a run can be grouped by what it was set to. The numbers are read off the screen, so a field that could not be read is left empty rather than guessed at (`medals` is 0 rather than empty when the score page shows no medals row at all, which is the game saying none were earned), and the screen is saved beside the CSV as `unread-….png`. Only rounds the script plays itself are recorded. The `id` is unique to that one round on that one device, so a file can be merged with anybody else's, or imported twice, without a round being counted twice.                                                          |
| Bubble Strategy                    | What the script does with the bubbles the board leaves lying about. A bubble popped while a chain is clearing takes a bigger area with it (this is what Tiara Minnie+ is built around), so a bubble spent off a chain is a bubble wasted — every option here says how much of that to give up.<br>`One Bubble Mid Chain` (default) pops exactly one bubble as a chain lands, and taps none at any other time, so the rest stay on the board for the chains after it.<br>`All Bubbles Mid Chain` pops every bubble the last board scan found, still only as a chain lands.<br>`All Bubbles ASAP` pops them the moment they are seen, without waiting for a chain, and additionally runs the old blind sweep — quick taps over every possible spot — to catch what the scan missed. This is roughly what the former "Clear Bubbles" switch did.<br>Skills that turn tsums *into* bubbles (Marie, Moana, Horn Hat Mickey, Snow White, Cinderella, Cpt. Lightyear, Burst + clear bubbles) clear up after themselves whatever this is set to: they have no chain to save anything for. |
| Use Fan?                           | After some Tsum removals, the fan is used to shake the remaining Tsums around. Try yourself how that affects the game results as different people have different opinions about this setting.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Maximum Chain Number               | Caps how many Tsums the script links in one chain (3-15, default 3). A low cap plays more, shorter chains instead of fewer long ones, which suits Tsums that score off chain count rather than chain length (Roxas, Maleficent) and gets more out of a high-FPS setup. It also makes each board scan cheaper, because the path search stops as soon as a chain that long is found. Does not affect Click Assist, which always draws the whole chain you point at.                                                                                                                                                                                                                  |
| +Score                             | Play the game with active +Score bonus.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| +Coin                              | Play the game with active +Coin bonus.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| +Exp                               | Play the game with active +Exp bonus.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| +Time                              | Play the game with active +Time bonus.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| +Bubble                            | Play the game with active +Bubble bonus.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 5>4                                | Play the game with active 5>4 bonus.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| +Combo                             | Play the game with active +Combo bonus.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Skill Waiting time                 | The most time the script leaves the board alone after activating a skill. It watches the board and plays on as soon as the tsums have stopped falling, so a generous value costs nothing; only a board still moving at the deadline spends the whole of it. Set it to cover the skill effect if the chosen skill clears bubbles after itself.                                                                                                                                                                                                                                                                                                                                                             |
| Skill Level                        | Only read by the skills whose choreography changes with it: "Cinderella", "Cpt. Lightyear" (how many aiming taps land) and "Coronation Day Elsa" (how long her freeze window stays open — 5s at level 1 up to 10s at level 6). Ignored by every other skill.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Skill Type                         | The skill type which the script will perform. The list is grouped by what the skill leaves behind: **Burst** for the ones that fire and clear, **Bubble** for the ones that turn Tsums into bubbles the script then sweeps, and **Unique** for the ones that change how the script plays the board while they are up. Each group opens with its general-purpose entry.<br>`Burst` is the general purpose skill: it fires, waits for the board to settle (up to "Skill Waiting time") and then continues.<br>`Burst + clear bubbles` is "Burst" plus a blind sweep of the whole play area once that wait is over — for a Tsum whose skill leaves the board covered in bubbles, where there is no chain left to save them for. Only the sweep after the skill is affected: the rest of the round still follows your "Bubble Strategy" setting, which is what makes this different from picking "Burst" and setting that to "All Bubbles ASAP".<br>`Pair Tsum` behaves like "Burst", but activates any skill as soon as one is ready to be activated.<br>`No Skill` never activates a skill (if you want to click it yourself).<br>`Formal Beast` fires like "Burst", and then plays the mode his skill opens: while the twin Beast/Belle gauge is on screen the script chooses chains by colour rather than by length, so that neither half of the gauge tops out while the other is under 60% — which is what turns one burst into the long one.<br>`Coronation Day Elsa` does not burst at all: her activation opens a freeze window, and every chain linked while it is open freezes a band of tsums right across the board, drawn between the chain's first and last tsum. The script clears the bubbles out of the bottom of the board first, then spends the whole window freezing — picking chains to get as many bands down as it can rather than to make each one big, and keeping every later chain well clear of the ice already drawn, because one touch on a frozen tsum sets the whole pile off early. Right before the window closes it taps the pile once, so everything frozen goes off together — and a board that freezes out early is burst on the spot and refrozen, so a long window can clear more than one board's worth. Your "Max chain" and "Chains per board scan" settings are ignored inside the window. How long the window lasts is "Skill Level".<br>`Lorcana Aurora` is two skills with one gauge between them, and needs **Lorcana Card** (below) on -- picking her switches it on for you. Before she transforms she plays as "Burst + clear bubbles". After the card is tapped, any two bubbles link however far apart they are, so the script draws one chain through every bubble on the board -- and because the burst follows the drag as well as the bubbles, it deliberately picks the *longest* way round them rather than the shortest, to sweep as much board as it can. Her skill only adds to that, so from the transformation on the script stops popping bubbles singly and chains whatever is on the board instead -- starting the moment a few bubbles have held still, re-aiming each link at where its bubble is by then, and drawing the chain again if the game did not take it.<br>The other skills named after Tsums are optimized for these Tsums.                                                                                                                                                                                                                                                              |
| No skill last fever seconds        | Setting this to a value height than 0, the script won't trigger the Tsum's skill if there is currently fever active which approximately ends within X seconds, while "X" is the value you configured here. Can be useful to max out fever times per game.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Lorcana Card                       | For the Lorcana Tsums (Aurora, Tinker Bell), which play in two halves. Their skill leaves a bubble with an ink stone in it every time it fires, and the stones pile up on the board until that bubble is popped; meanwhile the ring round the skill button fills a second time, and when it is full the game slides a card up from the bottom edge that transforms the Tsum when tapped. With this on the script does both: it pops the stone bubble after each skill, and it taps the card as soon as it appears. Whether the Tsum has transformed is read off the skill button itself -- a gold-rimmed medallion until then, the ordinary button after -- so the skill's own card animation or a burst dimming the screen cannot fool it. Works with any Skill Type, so a Lorcana Tsum set to plain "Burst" still transforms; picking "Lorcana Aurora" switches it on automatically. |
| Unlock Level every hours           | A value of for example 3 will check every 3 hours whether any Tsums have reached their level cap, sort the collection by Level Lock so those come first, and buy the raise for each until it meets one that is not capped (attention: consumes coins), then put the collection back in the order it was in. 0 disables the schedule. The **Now** button beside the number runs one sweep whatever the schedule says — including when it is 0 — and it goes ahead of everything else the script does: a heart or mailbox chore hands over at its next step, a round that has not started waits, and only a round already in progress finishes first. With the script stopped, Now starts it and sweeps before anything else.                                                                                                                  |
| Buy boxes every hours              | A value of for example 6 will go to the Tsum Tsum Store every 6 hours and buy the box you picked, over and over, until the box sells out or you no longer have the Coins for it (attention: consumes coins). 0 disables the schedule. The **Now** button works exactly like the one above, and the three box rows below it are read at each sweep — change one, press Now, and the sweep that follows uses it without a restart. **Rubies are never spent:** when the game offers to trade them for Coins the script always cancels and ends the sweep.                                                                                                                                                                                                                                                                            |
| Box to buy                         | Premium Box+, Premium Box, Select Box or Happiness Box. Only ever this one — the script never falls back to a different box. Select Box is the limited-time slot, so most of the time it is not on sale, and the sweep says so and buys nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Buy ten at a time                  | Takes the **10-Time Purchase** button where the box offers one. A box that only sells single ones — Happiness Box always, and any box whose 10-Time has sold out — is bought singly instead. It never goes the other way: with this off, the script never buys ten.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Purchases per sweep                | The safety limit, 1 to 50, on a chore that spends your Coins. A 10-Time purchase counts as one. Normally the sweep ends before this on Sold Out or on Coins; this is what bounds it when neither of those ever comes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Receive All Hearts                 | Will Receive hearts by clicking the "Claim All" button. This is fast, but not very nice to others because "Unknown" senders won't get hearts back from you. Check the setting "Receive Hearts One By One" if you care about your Unknown friends.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Waiting time (min) before repeat   | The frequency how often the "Claim All" button will be used.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Receive Hearts One By One          | This will process every message in your mailbox one after another. While this might seem waste of time compared to the "Claim All" button, Claiming every heart one by one also sends a heart back to the sender, even if it is an Unknown person you don't have in your friends list. Fetching hearts this may might encourage Unknown players to also send you hearts (and coins) in the future as they als get a heart from you.                                                                                                                                                                                                                                                      |
| Skip first person                  | Always ignores the first message when claiming hearts one by one. Useful if you live in a country where the first message is an Ad which causes problems for you.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Skip ruby                          | Won't open messages which contain rubies.<br>Enable if your main playing device is an Apple phone but your sender runs on an Android phone, as rubies are not shared between Apple and Android versions of the game.<br>If you only own Android devices, leave this off.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Claim All old mails                | Retrieves all heart mails containing coins one by one until heart mails contain no coins anymore. Starts then collecting again until heart mails don't contain hearts within 5 mails. Then clicks "Claim All"                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Max Times to Open Mailbox          | Maximum amount of consecutive mailbox openings until the next task (send hearts / play game) will be started. The task ends before "max times" if on one opening the mailbox is still empty.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Waiting time before repeat         | The mailbox won't be opened again for so many minutes after it has been emptied successfully or "Max Times" was reached.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Auto Send Hearts                   | Enabling this lets the script regularly send hearts to your friends list.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Send to 0 score                    | If enabled, the script will send hearts even to players without a score. Useful if these are auto-senders who receive every heart one by one, waste of time if these friends are really not playing anymore.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Max run time                       | Limits the amount of time where you're sending hearts to friends. Useful if you have lots of friends (400+) and don't want to miss coins on incoming heart messages. <br>Might not work as expected if "Auto Play Game" is enabled.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Waiting time (min) before repeat   | Same as above, just for heart sending instead of receiving.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |


### The Quick Bar

The settings worth changing between rounds, in a strip along the very bottom
edge of the screen -- below the lowest button the game draws, so it can be left
up for a whole run without covering anything you or the script needs to press.
The sliders button on the floating bar opens it. While it is up the status line
steps aside and the log moves up over it.

| Control | What it changes |
|:--|:--|
| Skill | Which skill the play loop plays |
| Lv | Skill level |
| Scan | Chains per board scan |
| Chain | Maximum chain number |
| +Coin | The +Coin bonus item |
| 5>4 | The 5>4 bonus item |
| Preset | Not one setting: which saved configuration is loaded. Tap it to switch |
| Bubble | Bubble strategy, short: **1 mid**, **All mid**, **All now** |
| Report | Not a setting either: saves a report of what is on screen — see [Reporting a problem](#reporting-a-problem). The one button here that works while the script is still playing; everything else needs it paused |

**Preset** shows the name of the preset your settings currently are, or *No
preset* when they are not any of them, and tapping it lists the ones you have
saved. Picking one loads a whole how-a-round-is-played configuration — see
[Presets](#presets) — so this is the one control here that changes more than the
row it sits on.

**Most changes wait for the next round, and the strip says which.** The Quick Bar
opens over a round that is *paused*, not one that has finished, and a setting
that round was **set up** under cannot be changed halfway through it — only
decided again for the next one. So the default is to wait: the change is held,
*"Applies at the next round"* appears over the game, and both the strip and the
settings panel show the new value straight away so you can see what you picked.

**While a round is being played, every control wears a coloured bar along its
bottom edge** saying when a change to it would land: **teal** for this round,
**amber** for the next one. The Preset chip's bar is half of each, because
picking a preset moves settings of both kinds at once. Between rounds there is
nothing to tell apart, so the bars go away.

| Takes effect at once | Waits for the next round | Needs a fresh Play |
|:--|:--|:--|
| Chain, Scan, Link reach, Link MyTsum first, Use fan, Bubble strategy, Skill waiting time, Skill auto-tap, No-skill fever seconds, Skill level, Delay between rounds, Max round duration | Skill, Lorcana card, 5>4, +Score, +Coin, +Exp, +Time, +Bubble, +Combo, Track round statistics | Auto play game, Click assist |

The left column is everything the script re-reads *while it plays* — each of
those changes what the next board scan does. The middle column is everything the
round already committed to: which tsum is on the board, and which items were
bought on the screen before it started. Changing the tsum halfway through a
round does not swap the board over — it leaves the script reading it as
something it is not, which is what used to make a round go wrong after a
mid-round skill or preset change. And the right column decides which tasks a run
does at all, so it can only change when a run begins.

The between-rounds delay used to sit here and no longer does: **Delay between
rounds (min)** is on the Gameplay tab, and the **Now** button beside it is what
the old countdown's tap did.

On the right it shows what this run has earned: the average **base** coins and
**final** coins per round, and how many rounds those are over. Both reset every
time you press Play, because that is what "this run" means, and both only count
rounds whose figures were actually legible — a round whose tally could not be
read is left out rather than counted as zero.

**The controls only work while the script is paused.** Press ⏸ and they come
alive, teal along the strip's top edge; press ▶ and they grey out again. That is
not a rule for tidiness: a live strip would swallow the taps the script is
aiming at the game underneath it. Nothing is ever hidden, though -- the whole
strip stays readable, coin readout and current settings alike, which is what it
is up for.

**Pausing also pauses the round.** If a round is running when you press ⏸, the
script presses the game's own Pause button on its way out, so the timer stops
while you are changing things. Pressing ▶ closes the game's pause menu and picks
the round up where it was.

**+Coin and 5>4** are the two that wait: the script sets the bonus items on the
pre-round screen, so a change to either takes effect from the next round rather
than the one you are paused in. The other four take effect immediately.

Everything you change here is applied to the run that is already going — the
round, the coin averages and the statistics all survive it — *and* saved, so the
settings page shows the new value and the next Play starts with it. That is the
difference from opening Settings, which pauses the run and, once you press Play,
replaces it with a new one.

**The strip and the settings page stay in step, both ways.** Change one of these
settings in Settings while a run is paused and the strip shows it within a few
seconds, and the run is already playing under it — no Play needed, for these
settings. Change one in the strip and the settings page shows it the next time
you open it. Everything else in Settings still needs Play, because a run reads
it once when it starts.

### Presets

A preset is **how a round is played, under a name**, so a setup you have tuned
for one thing — farming coins with one Tsum, going for score with another — can
be put back with two taps instead of a dozen. It is exactly what a
[settings code](#sharing-settings) carries, which is why one can be exported as
one.

That is the Gameplay and Skills tabs apart from three rows about the run rather
than the round: **Auto Play Game**, the **wait between rounds** and **Track
round statistics** stay as you have them, whichever preset you load. So does
everything outside those two tabs — your language, the mailbox, the hearts, the
chore schedules, the box buying. Those describe your account, and you should not
have to re-set them to try a different setup.

The controls are at the top of the settings page, next to the light/dark button:

- **The dropdown** names the preset your settings currently are, or *No preset*
  when they are not any of them — change one setting after loading a preset and
  it says so at once. Tapping it lists what you have saved; picking one loads it.
- **The save button** beside it opens a box with the preset's name in it and
  three things to do with that name. **Save as new** stores your current settings
  under a name nothing else is using. **Update** writes them over the preset that
  name already belongs to. **Delete** removes it. Whichever of the three the
  typed name allows is the one that is live, so the buttons say what they would
  do before you press them.

Loading a preset changes **everything it carries**, not just the part you were
last looking at: a row it carries but does not mention goes back to its default,
exactly as pasting someone's settings code does. That is what makes switching
presets a switch rather than a merge.

The same dropdown is on the [Quick Bar](#the-quick-bar), which is the point of
the whole feature: a preset can be swapped between two rounds, from the strip,
without opening the settings or ending the run. The settings a round in progress
can take are taken immediately; the rest are saved for the next Play.

**Export presets**, in the *Settings code* card, writes one line per preset — its
name and its settings code — with **Copy** to the clipboard or **Save file** to
`presets.txt` beside the round statistics on the device (`tsum_record/`, which
is why it needs the script to have been started at least once). Since every line
holds a whole settings code, that is also the way back in and the way to hand one
to someone else: paste a line into **Share settings ▸ Paste**, or into the box
under it, and tap **Apply**.

### Sharing settings

The **Share settings** row near the top of the settings turns your setup into
one line of text that someone else can paste into theirs.

- **Copy** builds the code, puts it on the clipboard and shows it in a box below
  the row. If the clipboard is out of reach the code is still there, selected,
  ready to be copied by hand — which is what happens on any host whose settings
  page cannot reach the clipboard.
- **Paste** takes a code off the clipboard and applies it. If the clipboard
  cannot be read, the box opens empty instead: paste the code into it and tap
  **Apply**.

Under the box the same code is drawn as a **QR**, which is the way between two
phones that needs nothing else: the other player points their camera at your
screen, and whatever their scanner hands them goes in their own box. It shows
what is in the box rather than your current settings, so a code you pasted
draws the code you pasted.

A code is short enough to read out or put in a message — a whole configuration
is usually 20 to 40 characters, because everything left at its default is not
written down at all:

```
TSUM4-y2f.YiDACgg.K5.T2.U5.Vo.fu~
```

It carries **how a round is played, and nothing else** — the chain and board
settings, which items are set, and how the skill is used. Nothing about your
account or about your run travels with it, and none of it is touched by applying
one: your language, the mailbox, the hearts, the chores, the box buying and the
developer options, and on the Gameplay tab itself **Auto Play Game**, the
**wait between rounds**, **Track round statistics** and **Max round duration**
with the action beside it. Someone else's code cannot stop your script playing,
keep it waiting, turn your statistics off, or make it stop after a few minutes.

**Within that, a code is a whole configuration, not a patch.** Applying one
gives you the setup the sender had: a setting the code carries but does not
mention was at its default, so it goes back to its default here too. As with any
settings change, it takes effect the next time the script is started.

Codes from another version of the script still work: the settings both versions
have are applied, anything else is skipped, and the line under the row says how
many of each. A number that is out of range in this version is clamped to it
rather than refused. A code that arrives damaged — cut short by a chat client,
or mistyped — is refused outright rather than applied in part.

## Reporting a problem

Something went wrong and you would like it fixed. What makes that possible is
the screen it went wrong on and the log around it, and both are gone by the time
you have finished typing the message — so the script collects them for you.

**Press Report.** It is on the Debug tab of the settings panel, and there is a
Report button on the Quick Bar as well. You can add a line saying what happened;
you do not have to. Either way the script writes a folder holding the screen,
the screens before it, your settings, and the last few hundred log lines. It also
writes one by itself whenever it gives up on a screen, a chore throws repeatedly,
a round ends without the script ever seeing the score, or it finds itself on a
screen it has no way off — so "it got stuck last night" usually already has its
evidence saved before anyone asks.

**Then send it.** Open **Run History** in the app. A run that saved a report has
two buttons on its card, and the **Reported** filter shows only those runs.
Nothing is uploaded anywhere on its own, and no report leaves the device unless
you send it.

- **Share report** packs everything into one zip and hands it to whatever you
  share with — a chat app, mail, a drive. This is the route on a phone.
- **Save to device** writes the same zip to `Download/GameAutomationPlatform/reports`
  and tells you where that is on your PC. This is the route on an emulator,
  where there is usually nothing to share *to*: on MuMu the folder is already
  inside its shared folder, and for the others the dialog names the folder to
  look in. The app's own README has the list, under *Sending in a problem*.

One thing to know about which screen you get. Opening the settings panel pauses
the run, and pausing presses the game's own Pause button — so a report taken
from there shows the pause menu rather than the thing you were looking at. The
screens *before* it are saved too, which is usually where the problem is. To
catch the live screen, press **Report on the Quick Bar** while the script is
still playing — it is the one button on the strip that works without pausing —
or **hold the Log button** on the floating bar. Neither route pauses first.

Reports live in `tsum_record/reports`. The newest eight are kept and older ones
are deleted, so the folder cannot grow without limit.

### Developer options

Clicking 10 times on the "Build date" will open additional settings. These aren't useful for normal usage but might 
be helpful when troubleshooting.

| Setting    | Description                                                                                                                             |
|:-----------|:----------------------------------------------------------------------------------------------------------------------------------------|
| Report a problem | Saves what is on screen, the screens before it, your settings and this run's recent log to `tsum_record/reports`. Share it from Run History in the app. See [Reporting a problem](#reporting-a-problem) above — this is the one thing on this tab meant for everybody. |
| Debug logs | Adds more details to the logging output. A report carries those lines whether or not this is on; what this changes is whether they also reach the log file. |
| Debug game | Saves screenshots while playing the game with different color transformations used by the script. Also keeps a screenshot of *every* screen the script visits in `tsum_record/pageHistory` rather than only the last few, and logs the last few screens with how long each was up. Really not useful for non-developers. |
| Walkthrough recorder | Records instead of playing. Nothing else runs: you drive the game by hand, and the script writes down every screen it recognises, where you tapped on it, and which screen followed, into `tsum_record/walkthrough`. It is how the project maps out what the game can actually do — screens it has never seen, and the buttons that reach them. Turn it off again to play. |
| Collect unknown screens | Saves any screen the script cannot recognise to `tsum_record/corpus`, so it can be sent in and turned into a fix. Rate-limited and capped per run. |
| Page history depth | How many recent screens the script remembers (default 20). A picture of the last few is kept in `tsum_record/pageHistory` for a report to send; with "Debug game" on, every remembered screen keeps one. Each is deleted as it drops off the end, so the folder never grows past this number. 0 turns the history off. |


## Roadmap

See the [Changelog](CHANGELOG.md) for previous and upcoming changes.

## License

Apache License 2.0 — see [LICENSE](../LICENSE) and [NOTICE](../NOTICE). The
script was forked from `r2-studio/robotmon-scripts` (also Apache-2.0) and has
been rewritten since.
