---
title: Handle a page
description: Teach the script to recognise a screen, and say what happens on it.
---

# Handle a page

Two separate jobs, and most changes need only the second:

1. **Recognise** a screen nothing recognises yet: a fingerprint, a profile,
   and a route off it.
2. **React** to a screen the script already recognises: one subscription in
   `pageHandlers.ts`.

[Page router](../architecture/page-router) is the model this guide assumes.

## Part 1 — recognise a new screen

| # | File | What |
|:--|:--|:--|
| 1 | a frame of the screen | Captured on a device (turn on *Collect unknown screens*) and authored into probes with the development toolkit's studio. |
| 2 | `src/data.ts` | A `PageName` member, and a `Page` entry with the probes. |
| 3 | `src/data.ts` | Its `PageProfiles` entry: permanent or transient, and its `roles`. |
| 4 | `src/data.ts` | A `PageRoutes` row if navigation may have to leave it. |

Then `npm run pages:docs`, `npm run dispatch:update`, and the toolkit's
detection regression (`pages:eval`, `pages:calibrate`, `pages:audit`) — a
fingerprint change is not finished until that has run.

### The fingerprint

A `Page` entry is a name, a list of probe pixels — each with the colour
expected there and how far a reading may drift before the probe fails — and
the anchors that locate its buttons:

```ts reference title="app.gap.Tsum/src/data.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/data.ts#L690-L699
```

Coordinates are in the table's own space (a 1080 × 1920 portrait); `Tsum`
converts to the device. The entry's shape is `PageDef`:

```ts reference title="app.gap.Tsum/src/globals.d.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/globals.d.ts#L191-L259
```

A screen drawn two ways — five tsums or four on the level-up panel — gets a
second entry under the same `name` with a `variant`. The variant is
documentation and tooling only; the script learns the name.

Two rules about what is *not* a page:

- **A mode of a screen is not a page.** "A fever is running" is read from its
  own probe table, never from the matched key. Declaring an entry with a
  `variant` for it is still usually worth doing, so the detection corpus has
  something to test — make it the plain entry's probes *plus* the new ones,
  because the ranking prefers more probes and a shorter entry can never win.
- **Something too small to survive the capture path cannot have an entry.**
  Probes are read off a 360-px-wide capture; a channel 20 logical px thick is
  three pixels there. Such a mode is read at native resolution off a crop
  (Formal Beast's twin gauge is the case), and its frames stay plain
  `GamePlaying`.

<ImagePlaceholder id="page-fingerprint-probes" alt="A captured screen with the entry's probe points marked, showing which pixels the fingerprint reads" />

### The profile

`PageProfiles` is a mapped type over `PageName`, so a new name with no profile
is a build error. Say whether the page **waits for input** (`Permanent`) or
**dismisses itself** (`Transient`, with `durationMs` at 60 fps), and which
`roles` it plays — a screen a round can end on, one the heart sweep branches
on, an interruption — because the narrowed sweeps are drawn from those roles:

```ts reference title="app.gap.Tsum/src/data.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/data.ts#L1968-L2001
```

To measure a transient page's duration: turn on *Debug game* and *Page history
depth*, reproduce the screen, and read the visit's duration out of the
`[Pages]` trail line; convert to 60 fps if the device runs faster, and set
`measured: true`.

### The route

If navigation may ever have to leave the page, declare how. `PageRoutes` says
which anchor leads where; a row with `via: PageAnchor.Back` and no `to` means
"back is a way out". Without a row **nothing taps the page blind**:
`navigate()` logs `nav.noRoute` once and the stall guard takes over.

```ts reference title="app.gap.Tsum/src/data.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/data.ts#L2735-L2762
```

The hub is the page that must never have the row — its `back` is Play, and a
fingerprint that once aliased it started rounds nobody asked for.

## Part 2 — react to a page

One `gPages.subscribe({...})` in `pageHandlers.ts`, in the right band. Reading
that file top to bottom is reading the dispatch order, so put the new
subscription with its band.

```ts reference title="app.gap.Tsum/src/globals.d.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/globals.d.ts#L399-L470
```

### Pick the band

| You want to… | Band | Notes |
|:--|:--|:--|
| update a flag, take no capture | `observe` | Always runs. |
| measure something off the untouched frame | `record` | Captures allowed; taps not. |
| get past something that is not a game screen | `guard` | Taps. |
| close an offer, popup or panel in the way | `dismiss` | Taps. Runs on every look, including the play loop's. |
| move toward a destination | `navigate` | Taps. **Only** on a look made with a goal, never on the goal page. |
| log or count what was seen | `notify` | Runs even after something above tapped. |

Nothing checks this. A capture in `observe` or a tap in `record` silently
breaks the promise the band makes to everything below it.

### Write the subscription

- **`id`** — unique, `band.thing`: `dismiss.magicalTime`, `nav.move.friendToGame`.
- **`what`** — one sentence; it is the documentation `PAGE_DISPATCH.md` prints.
- **`pages`** — required, no wildcard. Names, or a set off the tables:
  `allPages()`, `pagesOfKind(PageKind.Transient)`, `pagesWithAnchor(PageAnchor.Mail)`,
  `pagesWithRole(PageRole.GameUp)`.
- **`goals`** — for `navigate` only: which destinations this is a step toward.
- **`every: true`** — fire on every look, not only when the page changed. The
  navigation movers need it; almost nothing else should.
- **`acts`** — if the subscription can decline, say so here and nowhere else.
  The dispatch tests it before the steps, and the forecast reads the same
  declaration, so the two cannot disagree.
- **`steps`** — a list, not a body: `tap` an anchor of the entry that matched
  (never a coordinate — variants put the same button in different places),
  `tapAt` a fixed `Button`, `settle` (wait for the screen to stop moving, up
  to a budget), `sleep` (blind, where there is no still frame), `waitOut` a
  transient page, `log`, and `call` for what is none of those.

An `observe` that sets a flag:

```ts reference title="app.gap.Tsum/src/pageHandlers.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/pageHandlers.ts#L81-L93
```

A `dismiss` that logs, taps and waits:

```ts reference title="app.gap.Tsum/src/pageHandlers.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/pageHandlers.ts#L226-L244
```

A `dismiss` that can decline, through `acts`:

```ts reference title="app.gap.Tsum/src/pageHandlers.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/pageHandlers.ts#L372-L398
```

A `navigate` mover with a goal and a settle:

```ts reference title="app.gap.Tsum/src/pageHandlers.ts"
https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/pageHandlers.ts#L518-L532
```

If the first tap presses a button no `PageRoutes` row declares yet, add the
edge with `source: RouteSource.Handler` — the code is now the evidence.

### Wait for stillness, not for a clock

`settle` is the default after a tap that opens a screen. The game measures
animations in frames, so a fixed `sleep` is right only on the device it was
tuned on; on a slower device the next tap lands inside the animation and is
swallowed. Two waits are deliberately still blind — the board is animating from
its first frame to its last, so a stillness gate over one can only time out.
[Driving screens](driving-screens) has the reasoning.

### After the change

```bash
npm run pages:docs         # regenerate PAGE_DISPATCH.md -- never edit it by hand
npm run dispatch:update    # rewrite the golden traces, then READ THE DIFF
```

The diff is the review: a row that moved for a page the change was not about
is the failure `dispatchEval` exists for. `gPages.validate()` at the bottom of
`pageHandlers.ts` refuses an `after` that names nothing registered, and
`pages:docs` reports a page no handler can leave.
