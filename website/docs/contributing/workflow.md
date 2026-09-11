---
title: Workflow
description: How a change gets in, and what it has to carry with it.
---

# Workflow

## The short version

1. Fork, branch, make the change in `app.gap.Tsum/`.
2. Run the checks (below) and fix what they say.
3. Add the bookkeeping the change needs: a `CHANGELOG.md` line, a `CODEMAP.md`
   row, regenerated documents.
4. Open a pull request against `main` that says what changed and why, and
   what you measured it against.

## The checks

Run from `app.gap.Tsum/`. The build runs the document and check steps as
optional findings; before a pull request, run them as gates:

| Command | Fails when |
|:--|:--|
| `npm run typecheck` | Any of the three compilations has an error. |
| `npm run pages:docs:check` | `PAGE_DISPATCH.md` does not match the bundle. Run `pages:docs` and commit the result. |
| `npm run events:docs:check` | `EVENTS.md` does not match the emit sites. Run `events:docs` and commit. |
| `npm run dispatch:eval` | A dispatch or scheduler trace row changed. If the change is yours and intended, `dispatch:update` and **read the diff** before committing it. |
| `npm run map:check` | `CODEMAP.md` names a path that does not exist, misses a source file, tool directory or document, or a name family escaped its file. |
| `npm run i18n:check` | A `data-i18n` names no key. (Missing translations are reported, not failed.) |
| `npm run live:check` | A setting a preset carries has no `LiveSettings` answer, or the answer and the code disagree. |

Then `npm run build` once, to see that the archive is produced.

## What a change carries

**A `CHANGELOG.md` entry, under `## [<the version in package.json>]`.** There
is no `[Unreleased]`; a version bump is what opens the next section. Inside
it:

- `### Summary` is the user-facing note and ships as the release note — one
  line per *feature*, not per change, and only what a player sees or
  interacts with. A new skill is "Coronation Day Elsa skill added"; later work
  on it folds into that same line ("… improved by making clears faster").
- Everything else — implementation detail, refactors, tooling, docs — goes in
  `### Added`, `### Changed`, `### Fixed`, `### Removed` below it. Keep it
  succinct.

**A `CODEMAP.md` row** when the change adds a file, a tool, a document, a
name family or a script. A row is one clause, never a paragraph; the reasoning
belongs in the file's own header comment. `map:check` enforces the rows.

**Regenerated documents** where the change touches what they are generated
from: `PAGE_DISPATCH.md` for anything in `pageHandlers.ts`, `data.ts`'s page
tables or `pages.ts`; `EVENTS.md` for an emit. Never edit either by hand.

**A `README.md` row** for a new setting — the settings table there is the
user documentation.

**A measurement** for anything tuned: a threshold, a timing, a coordinate. The
pull request should say what it was measured against (which device, which
frame rate, which frames). "It looked right" is how the values that look
arbitrary got that way.

## What the tree does not accept

- **Anything naming the private toolkit repository or describing what it
  holds** beyond "the development toolkit". Cite its commands by name
  (`pages:eval`) and no more. This tree is public.
- **Anything copied from the host app's code.** Describe its behaviour in
  prose; the natives are declared in `globals.d.ts` and that is the extent of
  it.
- **Game art or screenshots.** They belong in the toolkit's corpus.
- **A behaviour reintroduced because the original Robotmon script had it.**
  The break is complete; there is no upstream.
- **CRLF line endings.** `.gitattributes` pins LF; see
  [Windows and line endings](windows-and-line-endings).

## Reviewing a change to a page or a skill

Two diffs tell the reviewer most of what they need: the `PAGE_DISPATCH.md`
diff (did the queue for any page you did not mean to touch change?) and the
`dispatchEval` golden diff (did any trace row move?). A skill change should
name the skill's own log events (`skill.<name>.*`) and what a run's log
showed for them.

## Where to talk

Bugs and wanted features are in
[`BACKLOG.md`](../reference/generated/backlog) — read it before proposing
something, and add to it rather than to an issue tracker if the change is not
one you are about to make.
