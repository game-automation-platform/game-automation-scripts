---
title: What this is
description: The host app, the script, and what the script does.
---

# What this is

## The host app

**Game Automation Platform** is an Android app that runs automation scripts
against games. It owns everything that touches the device: taking screenshots,
reading pixel colours, tapping and dragging, running shell commands, launching
apps. A script is a folder the app loads:

| File | What it is |
|:--|:--|
| `index.js` | The automation itself, run on the app's embedded JavaScript engine (QuickJS-ng). It has to declare a global `start(settings)` and `stop()`. |
| `index.html` | The settings page, shown in a floating window over the game. It builds the settings object and calls `start(...)` when you press Play. |
| `quickbar.html` | Optional. A strip of live controls the app draws along the bottom of the screen. |
| `tsums.dat` | This script's own data file: a library of tsum portraits, deployed beside the bundle. |

The app installs scripts from **sources** — catalogues it downloads — or from a
folder copied in by hand. Its floating bar has Play, Stop, a Log panel, a
settings button and, for scripts that ship one, the Quick Bar.

<ImagePlaceholder id="app-library-tab" alt="The app's Library tab showing the Tsum Tsum script card with its Download / Play controls" />

<ImagePlaceholder id="floating-bar" alt="The floating bar drawn over the game: Play, Stop, Log, Settings and the Quick Bar toggle" />

## The script

This repository's one script plays **Disney Tsum Tsum**. Left running, it:

- plays rounds — reads the board, links chains of matching tsums, uses the
  tsum's skill, pops bubbles, sets bonus items, and records what each round
  scored;
- receives items from the mailbox, one by one or with Claim All;
- sends hearts to friends;
- raises level caps on tsums that have reached them;
- buys boxes in the store, on a schedule and up to a limit.

Everything it does is driven by **screen recognition**: a screen is
"fingerprinted" by a handful of probe pixels, the script decides which screen it
is looking at, and a table of subscriptions says what happens on each one. That
one idea — recognise, then react — runs through the whole codebase and is
worth holding onto as you read.

The script has no view of the game's memory or network. It sees pixels and it
taps. Every timing, every coordinate and every colour threshold in the source
was **measured** against the real game, which is why the docs keep saying
"prefer a measurement to a tidy-up".

## Where it came from

The script was forked from a Robotmon script (`r2-studio/robotmon-scripts`,
Apache-2.0) and rewritten since. **The break is complete**: there is no
upstream to compare against, no compatibility layer, and no reason to keep a
behaviour because the original had it. What survives is the reason a few
constants look arbitrary — they were tuned against a working script rather
than derived. `NOTICE` in the repository root records what was inherited.

## What you need to know already

TypeScript, and a willingness to read header comments. Each source file opens
with one that says what the file owns and why it is shaped the way it is;
those comments are the long form of everything on this site. You do not need
Android experience: the host app is a black box with a documented API, and
most changes never touch it.
