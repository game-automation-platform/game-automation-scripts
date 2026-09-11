# Images the site still needs

Every `<ImagePlaceholder id="..." />` in `docs/` is listed here, and
`npm run refs:check` fails when the two disagree. To replace one: drop the
image in `static/img/<id>.png`, then either add `src="/img/<id>.png"` to the
placeholder (it renders as a captioned figure) or swap it for a plain
`![alt](/img/<id>.png)`, and remove the row here.

Capture at the device's native resolution, in the game's portrait
orientation, with no personal data on screen (friend names, player ids).

| Id | Pages | What to capture | Status |
|:--|:--|:--|:--|
| `app-library-tab` | getting-started/what-this-is, publishing/build-and-deploy | The app's Library tab with the Tsum Tsum script card: version, Download/Play controls | needed |
| `app-sources-tab` | publishing/your-own-library-source | The Sources tab: the built-in Official GAP source with its OFFICIAL badge, and the add-URL field | needed |
| `app-source-added` | publishing/your-own-library-source | The Sources tab after adding a custom source (name, URL, script count), and the Library listing its script | needed |
| `github-pages-settings` | publishing/your-own-library-source | A repository's Settings → Pages screen with Source set to GitHub Actions | needed |
| `floating-bar` | getting-started/what-this-is | The floating bar over the game: Play, Stop, Log, Settings, Quick Bar toggle | needed |
| `settings-tabs-general` | architecture/three-worlds, reference/settings | The settings page on the General tab: the Run order card, the tab bar, the light/dark toggle | needed |
| `settings-run-order-card` | architecture/run-lifecycle, guides/add-a-task | The Run order card close up: the jobs in scheduler order with a detail line each | needed |
| `settings-debug-tab` | reference/settings | The Debug tab: the Report row with its note field, the developer switches | needed |
| `quick-bar-strip` | architecture/three-worlds, guides/add-a-setting, reference/settings | The Quick Bar along the bottom edge while paused: every chip live, the coin averages on the right | needed |
| `quick-bar-chip-pending` | architecture/settings-model | A chip mid-round wearing the amber "next round" bar, with the "Applies at the next round" banner over the game | needed |
| `share-code-dialog` | architecture/settings-model, reference/settings | The Share settings card with a code in its box and the QR under it | needed |
| `preset-menu` | reference/settings | The preset dropdown open on the Quick Bar, the current preset marked | needed |
| `run-history-report-buttons` | guides/logging-and-events, reference/settings | Run History in the app: a reported run's card with Share report and Save to device | needed |
| `page-fingerprint-probes` | architecture/page-router, guides/handle-a-page | A captured screen with its `Page` entry's probe points drawn and labelled (colour, threshold) — an authored illustration, not a raw screenshot | needed |
| `board-chain-drawn` | architecture/play-loop | The board mid-round with one planned chain overlaid on the tsums it links | needed |
| `skill-button-gauge` | architecture/play-loop, guides/add-a-skill | The skill button in its states: gauge filling, full, and the Lorcana medallion | needed |
| `score-page` | architecture/play-loop | The post-round score page: score, coins, medals | needed |
| `fever-gauge` | guides/lifecycle-hooks | The board during fever time: lights down, the gauge turned into a timer | needed |
| `logdy-view` | guides/logging-and-events, reference/log-schema | Logdy with a run's log loaded: level, component, event, roundId columns, a row drawer open | needed |
| `report-folder` | guides/test-without-a-device | The contents of one `tsum_record/reports/<id>` folder: the screen, the trail frames, the manifest, the log excerpt | needed |

Also placeholders: `static/img/logo.svg` and `static/img/favicon.svg` are a
generated three-circle mark, to be replaced with the project's own.
