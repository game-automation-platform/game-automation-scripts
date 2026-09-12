# game-automation-scripts

An automation script that plays **Disney Tsum Tsum** on Android through the
**Game Automation Platform** host app, and the build that packages it. The
script reads the screen, draws the chains, fires the skills, and does the chores
between rounds — the mailbox, hearts, level caps, boxes.

**Documentation: https://scripts.gapapp.app/** — what the script is, how it is
put together, how to add a skill, a setting, a page or a task, and how to ship a
build or publish a script library of your own.

In the tree:

- [`app.gap.Tsum/`](app.gap.Tsum/) — the script and its build. Its
  [`README.md`](app.gap.Tsum/README.md) describes what the script does and
  every setting; [`DEVELOPMENT.md`](app.gap.Tsum/DEVELOPMENT.md) is how the
  source fits together.
- [`CODEMAP.md`](CODEMAP.md) — the index into the tree: which file owns what,
  and which document answers which question.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — the short form of the site, and the
  gates a change has to pass.
- [`website/`](website/) — the documentation site's source.

Releases are published to the
[game-automation-catalogue](https://github.com/game-automation-platform/game-automation-catalogue),
which the app downloads from.

Licensed under [Apache-2.0](LICENSE); see [`NOTICE`](NOTICE) for what was
inherited from where.
