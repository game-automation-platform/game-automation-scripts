# Contributing

The contributor guide is a site, built from `website/` and published at
https://scripts.gapapp.app/. It explains the script to someone who has never
seen the code — what it is, how it is put together, how to add a skill, a
setting, a page or a task, and how to ship a build or a script library of your
own. Start there; `CODEMAP.md` is the index into the tree itself.

The short version:

1. Work in `app.gap.Tsum/`: `npm install`, then `npm run typecheck` and
   `npm run build`.
2. Before a pull request, run the gates: `pages:docs:check`,
   `events:docs:check`, `dispatch:eval`, `map:check`, `i18n:check`,
   `live:check`.
3. File the change in `app.gap.Tsum/CHANGELOG.md` under
   `## [<the version in package.json>]` — a `### Summary` line only for what a
   player sees — and give any new file, tool or document its row in
   `CODEMAP.md`.
4. Keep line endings LF (`.gitattributes` pins them; `core.autocrlf` off).
5. This tree is public. Nothing in it may name the private development
   toolkit repository or describe what it holds beyond "the development
   toolkit", carry anything of the game's, or copy code from the host app.

Bugs and wanted features are in `app.gap.Tsum/BACKLOG.md`.
