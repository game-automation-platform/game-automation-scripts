---
title: Add a skill
description: A new file under src/skills/, a dropdown entry, and the four places between.
---

# Add a skill

A **skill** is what the script does when a tsum's skill gauge fills: tap the
button, then run a choreography — wait for the board to settle, sweep the
bubbles the skill left, aim taps, draw drags. Every playable skill is one file
under `src/skills/` that registers a handler; `skillCore.ts` owns what is the
same for all of them (the gauge read, the fever hold-off, the activation
taps, the `useSkill` dispatch).

## What a change has to touch

| # | File | What |
|:--|:--|:--|
| 1 | `src/shared.d.ts` | A `SkillType` member: the game's id for the skill. |
| 2 | `src/skills/<name>.ts` | The handler, registered with `registerSkill`. |
| 3 | `tsconfig.json` | A line in `files`, **after** `src/skills/skillCore.ts`. |
| 4 | `src/strings.d.ts` + `src/uiEn.ts` | A `UiText` key for the dropdown label, and its English text. |
| 5 | `src/skillOptions.ts` | A `SkillOption` entry: group, share character, status. |
| 6 | `CODEMAP.md` | A row in the skills table. |
| 7 | `CHANGELOG.md` | A `### Summary` line under the current version — a new skill is something a player sees. |

Then `npm run typecheck`, `npm run i18n:check`, `npm run map:check`.

## 1. The `SkillType` member

`SkillType` is a `const enum` in `shared.d.ts`, compiled into all three
programs, so the dropdown and the play loop name the skill by one member. The
member name is the dropdown label in PascalCase; the value is the id that
crosses the `start({...})` bridge.

```ts reference title="app.gap.Tsum/src/shared.d.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/shared.d.ts#L34-L44
```

## 2. The handler

The smallest complete skill in the tree is Moana: bubbles again, behind a
slightly longer intro than Marie's.

```ts reference title="app.gap.Tsum/src/skills/moana.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/skills/moana.ts
```

`registerSkill` files the handler under each id in `types`, so one handler can
drive two dropdown entries (Donald and Holiday Donald share one). Burst shows
that, plus `bareTapActivates`:

```ts reference title="app.gap.Tsum/src/skills/burst.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/skills/burst.ts
```

Every field except `types` is optional. The interface is documented field by
field in `skillCore.ts`; the short version:

| Field | Declare it when |
|:--|:--|
| `afterActivate(ts, board?, activatedAt?)` | Always, unless a bare tap and a settle is the whole skill. This is the choreography, run straight after the activation tap. Return `false` to report "did not fire". |
| `beforeActivate(ts)` | Something has to land *before* the skill fires — a settle wait, a pre-tap. |
| `bareTapActivates` | A tap on the button is the whole activation and a tap on a filling gauge is a no-op. Lets the play loop fire the skill blind between chains instead of paying for a gauge check. |
| `usesSecondButton` | The skill has two halves on two buttons (Pair Tsum). |
| `sweepsBubbles` | The choreography ends on `clearAllBubbles`, because the skill turns tsums *into* bubbles and there is no chain to save them for. This is the one declaration that overrides the Bubble Strategy setting — see below. |
| `claimsBubbles(ts)` | The bubbles are the skill's to chain, so the play loop must pop none. A function, because it can be true for part of a round (Lorcana Aurora after her transformation). |
| `popBubblesAfterChain(ts, chainLength)` | With a claim standing, how many bubbles to spend on a chain that just landed anyway. |
| `chainLimits` | The skill wants different chain caps from the player's settings — a value, or a function of `ts` for a skill whose board changes shape mid-round. Applied where the limits are read, never written into the settings. |
| `orderPaths(ts, paths, board)` | The skill chooses which chains to link and in what order (Formal Beast keeps his two gauges level). Runs between the scan and the first drag, so it must stay cheap. |
| `extraClusterSlots` | The skill's board scans need extra colour slots — a skill that freezes tsums spends slots on its own ice. |
| `overloadProbe` | Experimental: the choreography is anchored to the activation instant, so it can be fired mid-chain by the auto-tap. |

```ts reference title="app.gap.Tsum/src/skills/skillCore.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/skills/skillCore.ts#L19-L142
```

A skill with no `afterActivate` falls back to `skillRandomizeAndWait`: tap the
Fan and `settleBoard` for up to the *Skill Waiting time*. That wait is a
budget, not a duration — it returns as soon as the tsums stop falling.

What a choreography can call on `ts`: `tap`, `tapDown` / `moveTo` / `tapUp`
for a drag, `sleep`, `sleepUntil`, `settleBoard`, `screenshot` + `getColor`
for a probe, `clearAllBubbles`, `setMyTsumPriority`, and everything else in
`interface Tsum`. Keep a skill's tuning tables in its own file under a
"Tuning data" heading — `data.ts` holds only what more than one file reads.

:::warning Bubble taps go through the Bubble Strategy, or say why not
Bubbles are worth more popped inside a chain than alone, so the play loop
hoards them. A skill that pops bubbles must either declare `sweepsBubbles`
(it made them, it clears them) or `claimsBubbles` (they are its chain). A new
tap on a bubble that reads neither silently undoes the player's setting.
:::

Every skill file is a **leaf**: nothing outside `src/skills/` references its
symbols; it is reached only through the registry at runtime. An unregistered
id still plays, as a plain burst, so a forgotten `tsconfig.json` line is
silent — which is why step 3 matters.

## 3. The `tsconfig.json` line

Files are concatenated in this order and `registerSkill` runs at load time, so
the new file must come after `skillCore.ts` and before `clickAssist.ts`:

```jsonc reference title="app.gap.Tsum/tsconfig.json"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/tsconfig.json#L95-L117
```

## 4. The label

The dropdown never shows a raw id. Add a `UiText` member in `strings.d.ts` and
its English in `uiEn.ts`; the build fails until the English exists, and other
languages fall back to it until translated ([UI text and languages](ui-text-and-languages)).

```ts reference title="app.gap.Tsum/src/uiEn.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/uiEn.ts#L170-L186
```

## 5. The dropdown entry

`skillOptions.ts` is compiled into both pages, so the settings page and the
Quick Bar list the same skills. Insert the entry under its group, at its
alphabetical position:

```ts reference title="app.gap.Tsum/src/skillOptions.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/skillOptions.ts#L112-L129
```

- **`group`** is what the activation leaves behind: `SkillGroupBurst` (fires
  and clears), `SkillGroupBubble` (turns tsums into bubbles the choreography
  sweeps), `SkillGroupUnique` (changes how the play loop plays while it is up).
- **`share`** is the character the skill is written as in a share code. Any
  free letter; unique; **fixed once shipped**, because changing it rewrites
  what every code in circulation means.
- **`status`** is how finished it is. A new skill is almost always
  `ReleaseStatus.Alpha`, which lists it on Alpha builds only and badges it
  orange; promoting it later is a one-word edit.
- **`enables`** lists settings the skill cannot play without, switched on when
  it is picked (Lorcana Aurora enables the Lorcana card).

## 6 and 7. Bookkeeping

Add a row to the skills table in `CODEMAP.md` — one clause saying what makes
this skill unlike the others; `map:check` fails on a skill file the table does
not list. Add a Summary bullet in `CHANGELOG.md` under the version in
`package.json`: `<Name> skill added`. Later work on the skill folds into that
same line.

## Testing it

- `npm run typecheck` catches a `SkillType` used before it exists, a
  `UiText` with no English, and a prototype method not declared in
  `interface Tsum`.
- The offline harness can drive a choreography over a real frame:
  `createRuntime` and `createTsum` from `tools/runtime/load.js` give you the
  built bundle with the natives shimmed ([Test without a device](test-without-a-device)).
- On a device, set *Debug logs* on and read `skill.use` and the skill's own
  events in the log. `Skill Level` is only read by skills whose choreography
  changes with it.

<ImagePlaceholder id="skill-button-gauge" alt="The skill button with its gauge filling, then full — what checkSkillReadiness reads" />
