---
title: Add a setting
description: A key, a row, a read, a share slot, and an answer to "when does it reach a running script?"
---

# Add a setting

A setting is named by a `SettingKey` member, drawn by a row in the settings
schema, carried across the `start({...})` bridge in the `Settings` object,
read once by `buildRun`, and — if it is about how a round is played — carried
by share codes and presets and applied live from the Quick Bar. Almost every
step here fails **silently** if forgotten: a row nobody reads compiles
perfectly, and a setting that does nothing until a restart is the oldest bug
in this area. Follow the list in order.

## What a change has to touch

| # | File | What |
|:--|:--|:--|
| 1 | `src/shared.d.ts` | A `SettingKey` member, then its field in `interface Settings`. |
| 2 | `src/strings.d.ts` + `src/uiEn.ts` | `UiText` keys for the title and the help text, with English. |
| 3 | `src/settings.ts` | A row in `tabs`. |
| 4 | `src/index.ts` | The read in `buildRun` — where the value lands on `ts` or `Config`. |
| 5 | `src/settings.ts` | If the row is on the Gameplay or Skills tab: a slot appended to `SHARE_SLOTS`, or `neverShared: true`. |
| 6 | `src/quickbar.ts` | An entry in `LiveSettings`, and a `case` in `quickBarApplyOne` if it is `Now` or `NextRound`. |
| 7 | `src/quickbar.html` (optional) | A cell with `data-key`, if the setting belongs on the Quick Bar. |
| 8 | `src/settings.ts` (optional) | `status: ReleaseStatus.Alpha` while the setting is unfinished. |

Then `npm run typecheck`, `npm run live:check`, and open the settings page
once and read the log — `checkShareSlots` is what says a slot was forgotten.

## 1. The key and the field

```ts reference title="app.gap.Tsum/src/shared.d.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/shared.d.ts#L231-L250
```

`interface Settings` is keyed by `SettingKey`, so the enum and the object that
crosses the bridge are one list. Misspelling a key anywhere is now a build
error.

## 2. The text

Never a literal in `settings.ts` or the markup. A `UiText` member in
`strings.d.ts` and its English in `uiEn.ts` (required — the build fails without
it); other languages fall back key by key. [UI text and languages](ui-text-and-languages).

## 3. The row

The settings page is three levels: a **tab** (one button in the tab bar), a
**group** (one card), a **row** (one setting). Only rows carry state. A toggle
row needs a `key`, `title`, `help` and a boolean `default`:

```ts reference title="app.gap.Tsum/src/settings.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/settings.ts#L287-L292
```

A number row adds `min`, `max` and `step`, and a dropdown row a `dropdown`
list — one written once and shared with the Quick Bar (`skillOptions.ts`,
`bubbleOptions.ts`) if the strip offers it too:

```ts reference title="app.gap.Tsum/src/settings.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/settings.ts#L352-L369
```

The row's type is inferred from its `default`; a pasted value of the wrong
type is refused, numbers are clamped into `min`/`max`. **Moving a row between
tabs is cosmetic**; what is not is its `key` (the contract with `start()`) and
its position in `SHARE_SLOTS` (the contract with every share code in
circulation).

## 4. The read

`buildRun` copies each setting onto the world the run plays in — most onto a
`ts.*` field, a few onto the global `Config`:

```ts reference title="app.gap.Tsum/src/index.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/index.ts#L114-L142
```

If the setting is new on `ts`, declare the field on the class in `tsum.ts`
and set its default in the constructor. This is the step nothing checks:
forgetting it gives you a setting that renders and does nothing.

## 5. Share codes and presets

A row on the **Gameplay** or **Skills** tab is either *how a round is played* —
in which case it gets a slot on the end of `SHARE_SLOTS`, which is what puts it
into share codes and presets — or it shapes the *run* instead and says so with
`neverShared: true` (Auto Play Game, the between-rounds delay, Track round
statistics, the Max Round Duration pair). A row on any other tab needs
neither.

```ts reference title="app.gap.Tsum/src/settings.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/settings.ts#L1277-L1336
```

The list is **append-only**. Two traps:

- A boolean that defaults to `true` must be appended at a slot index that is a
  multiple of six, or given a `false` default: the bitmap is packed six bits
  per character, and an older code's padding would switch it off.
- A setting that goes away leaves `''` in its slot rather than being removed.

Neither trap is checked by a tool. `checkShareSlots` (run when the page loads)
does catch a row on a shared tab with neither a slot nor `neverShared`.

## 6. When it reaches a running script

Every slotted row must say, in `LiveSettings` (`quickbar.ts`), when a change
reaches a run in progress. [Settings model](../architecture/settings-model)
explains the three answers; the short form:

- **`NextRound`** — the default. Ask: *does a pass read this during a round,
  against a board that was dealt before the change?* If yes, it waits for the
  whistle.
- **`Now`** — only if the play loop re-reads the value fresh on every pass
  that wants it. Name the read site in the comment.
- **`Restart`** — it decides which tasks a run registers.

`Now` and `NextRound` keys need a `case` in `quickBarApplyOne` that writes the
same field `buildRun` wrote; `Restart` keys must not have one:

```ts reference title="app.gap.Tsum/src/quickbar.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/quickbar.ts#L211-L239
```

Whatever the switch takes, `quickBarState()` has to report, or the settings
page pushes its stale value back at the next save. `npm run live:check` holds
all of this together: a slotted row with no entry, an entry with no case, a
case whose value does not survive the round trip, and a held key that writes
the world anyway all fail there.

## 7. A Quick Bar cell

Only settings that can change mid-run belong on the strip. The markup is the
source of truth there: a cell with the `SettingKey` as `data-key`, and
`quickbarPage.ts` finds it by that attribute and does nothing else. Nothing in
the page script changes unless the cell is a *dropdown*, which needs its list
in `qbOptionsFor`.

```html reference title="app.gap.Tsum/src/quickbar.html"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/quickbar.html#L132-L141
```

A stepper cell carries `data-min` / `data-max`; the engine clamps to the same
range in its `case`. Add a matching `data-status` if the setting is `Alpha`.

<ImagePlaceholder id="quick-bar-strip" alt="The Quick Bar with its stepper cells (Scan, Chain, Lv), toggles (+Coin, 5>4) and dropdowns (Skill, Bubble)" />

## 8. Gating an unfinished setting

`status: ReleaseStatus.Alpha` on the row keeps it off Beta and Production
builds: the row is not drawn, takes no stored, shared or preset value, but
keeps its slot and its default in `start()`. Promote it by changing the word.

## Checklist for the pull request

- `npm run typecheck` and `npm run live:check` pass.
- Opening the settings page logs no `checkShareSlots` warning.
- The setting has a `README.md` row (the settings table is user documentation)
  and a `CHANGELOG.md` Summary line if a player will see it.
- `dispatch:update` if the setting changes which tasks run or their order.
