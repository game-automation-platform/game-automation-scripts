// ---------------------------------------------------------------------------
// Issue reports
//
// A bug report from a player is usually "it got stuck last night". By the time
// they say so the screen has moved on, the log has rotated and the debug lines
// that would have explained it were never written. This is the answer: one
// folder per report, holding the screen, the screens before it, the machine's
// own configuration and the last few hundred log records -- including the debug
// ones, which `logRingPush` keeps whether or not they were written out.
//
// Two ways one is made, and they are the same folder either way:
//
//   reportIssue(reason, note)  a person pressed something -- the settings page's
//                              Report button, the Quick Bar's chip, or a long
//                              press on the host's Log chip
//   reportOnLogged(...)        the script noticed its own failure. `ReportTriggers`
//                              below is the list, and the logger is what checks
//                              it, so no call site has to remember
//
// **Not gated on a developer setting.** The corpus recorder and the debug shots
// are, because they are collected deliberately; a report is collected by someone
// who has already hit the bug and will not have turned anything on first. What
// bounds it instead is the pruning: `ReportMinIntervalMs` between automatic
// ones, `ReportMaxPerRun` in a run, and `ReportsKept` folders on the disk.
//
// The frames are written in the corpus triple format (`corpusSidecar`), so
// the detection suite replays a reported screen unchanged and its report opener
// can drop it straight into the unlabelled corpus. A report is therefore a
// regression test that has not been labelled yet, which is the same trade
// `corpus.ts` makes.
//
// The host is what gets it off the phone: Run History's Share button zips this
// folder with the run's slice of `script.log`. Nothing here talks to a network.
// ---------------------------------------------------------------------------

// --- Tuning data -----------------------------------------------------------

/** Least gap between two *automatic* reports. A wedged screen must not fill the disk. */
const ReportMinIntervalMs = 3 * 60 * 1000;
/** Hard stop per run, automatic and manual together. */
const ReportMaxPerRun = 12;
/** Report folders left on the device; the oldest are pruned as new ones land. */
const ReportsKept = 8;
// How many page-history frames a report copies is `Config.reportTrailFrames`
// (src/data.ts), because the router reads the same number to decide how many to
// keep -- and it is built several files before this one is evaluated.

/** Visits listed in the manifest's trail. Cheap text, so more of them than frames. */
const ReportTrailVisits = 20;

/**
 * The events that make a report on their own.
 *
 * One list, checked by the logger (`logEmit`), rather than a `reportIssue` call
 * at each site: these are failures, and a failure path is exactly where a call
 * somebody has to remember gets forgotten. Anything here must be an event that
 * is genuinely rare -- the rate limit is a backstop, not the design.
 *
 * A plain object rather than an array so the check is a lookup: the logger runs
 * on every line the script writes, and a scan of a list per line is a cost the
 * rest of this file does not pay for.
 */
const ReportTriggers: { [event: string]: boolean } = {
  // The watchdog gave up on a screen it could not leave.
  [Log.Stall.GivingUp]: true,
  // Five throws running from one job; the run is being restarted under itself.
  [Log.Task.WatchdogRestart]: true,
  // A round ended with nothing fingerprinting it -- the obscured-board case.
  [Log.Play.GameOverAssumed]: true,
  // Navigation was asked for a screen with no declared way out.
  [Log.Nav.NoRoute]: true,
  // Not `Board.Stalled`: the first night it was here, five of six reports were
  // it, and every frame showed a board mid-clear with the effects hiding the
  // chain. That is the fan doing its job, not a failure; a stall that outlasts
  // the fan ends in one of the four above.
};

/** Set while a report is being written, so its own log lines cannot start another. */
var gReportWriting = false;

// --- writing one -----------------------------------------------------------

Tsum.prototype.reportsDir = function() {
  return this.storagePath + '/' + Config.recordDir + '/reports';
}

/**
 * Writes one report and returns its id, or `''` if nothing was written.
 *
 * `reason` is why the report exists -- an event name for an automatic one, a
 * short word for a pressed one -- and becomes part of the folder name, so a
 * directory listing already says what happened. `note` is whatever the person
 * typed, and is empty for an automatic one.
 *
 * Never throws. A report is the thing you reach for when something has already
 * gone wrong, so it must not be able to make that worse.
 */
Tsum.prototype.saveReport = function(reason, note) {
  if (gReportWriting) {
    return '';
  }
  if (this._reportCount >= ReportMaxPerRun) {
    return '';
  }
  gReportWriting = true;
  try {
    return reportWrite(this, reason, note || '');
  } catch (e) {
    logWarn(Log.Report.Failed, { errorText: '' + e });
    return '';
  } finally {
    gReportWriting = false;
  }
}

/** The body of `saveReport`, so that one owns only the guards. */
function reportWrite(tsum: Tsum, reason: string, note: string): string {
  const now = new Date();
  // Sortable, readable and unique: the stamp orders the folders, the tail keeps
  // two reports inside one second apart, and the reason says what it is.
  const id = statsFileStamp(now) + '-' + statsRandomHex(4)
    + '-' + reason.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const dir = tsum.reportsDir() + '/' + id;
  execute('mkdir -p "' + dir + '"');

  tsum._reportCount++;
  tsum._lastReportAt = Date.now();

  // Every part is written under its own guard. A report is what somebody
  // reaches for once something has already gone wrong, and the half that still
  // works is worth far more than a folder that was abandoned because the other
  // half did not -- a screen that will not capture is itself a finding.
  //
  // The screen first, and at full resolution: it is the one thing that cannot
  // be reconstructed afterwards, and everything below is cheap by comparison.
  // PNG rather than JPEG so a reported frame is corpus-grade -- a template can
  // be cut from it, which is what turns a report into a regression test.
  reportSaveImage(dir + '/screen.png', function() {
    return tsum.dialogScreenshot(tsum.originScreenWidth, tsum.originScreenHeight);
  });
  // The matcher's own view beside it, byte for byte, so the detection suite can
  // replay the frame the verdict was really made from.
  reportSaveImage(dir + '/screen.scaled.png', function() { return tsum.screenshot(); });
  reportPart(dir + '/screen.json', function() { return tsum.corpusSidecar('report'); });

  reportPart(dir + '/report.json',
    function() { return reportManifest(tsum, id, now, reason, note); });
  reportPart(dir + '/log.jsonl', function() { return logRingLines().join('\n') + '\n'; });
  reportCopyTrail(dir);
  reportPrune(tsum);

  logInfo(Log.Report.Saved, {
    report: id,
    reason: reason,
    reports: tsum._reportCount,
    maxPerRun: ReportMaxPerRun,
    dir: dir,
  });
  return id;
}

/**
 * Takes one capture and saves it, releasing the handle whatever happened.
 *
 * `take` is a thunk rather than an image because the capture itself is one of
 * the things that fails on a device in trouble, and a report must survive that
 * as readily as it survives a full disk.
 */
function reportSaveImage(path: string, take: () => NativeImage): void {
  let img: NativeImage | undefined;
  try {
    img = take();
    saveImage(img, path);
  } catch (e) {
    reportPartFailed(path, e);
  } finally {
    if (img !== undefined) {
      try {
        releaseImage(img);
      } catch (e) {
        // A handle the capture never produced. Nothing to give back.
      }
    }
  }
}

/**
 * Builds one of the text parts and writes it.
 *
 * The *building* is inside the guard as well as the write, because it is the
 * likelier half to throw: the sidecar re-scores every page fingerprint against
 * the screen, and a screen that will not capture is exactly the state a report
 * is being written about.
 */
function reportPart(path: string, build: () => string): void {
  let text: string;
  try {
    text = build();
  } catch (e) {
    reportPartFailed(path, e);
    return;
  }
  try {
    writeFile(path, text);
  } catch (e) {
    reportPartFailed(path, e);
  }
}

function reportPartFailed(path: string, e: unknown): void {
  logWarn(Log.Report.PartFailed, 'A report is missing one of its files',
    { file: path, errorText: '' + e });
}

/**
 * Freezes the router's recent frames into the report.
 *
 * Copied rather than referenced: the router deletes a frame as its visit falls
 * off the stack, so by the time anyone opens the report the trail it describes
 * would be gone. `cp` rather than a re-read and re-encode -- these are already
 * the exact bytes the matcher saw.
 */
function reportCopyTrail(dir: string): void {
  const frames: string[] = [];
  for (let i = 0; i < gPages.history.length
      && frames.length < Config.reportTrailFrames; i++) {
    if (gPages.history[i].shot !== '') {
      frames.push(gPages.history[i].shot);
    }
  }
  if (frames.length === 0) {
    return;
  }
  execute('mkdir -p "' + dir + '/trail"');
  for (let i = 0; i < frames.length; i++) {
    // Numbered by distance from the moment rather than by the router's own
    // sequence, so `00` is always the screen the report was taken on.
    const seq = (i < 10 ? '0' : '') + i;
    execute('cp -f "' + frames[i] + '" "' + dir + '/trail/' + seq + '_'
      + reportBaseName(frames[i]) + '"');
  }
}

/** The file name out of a path, for naming the copy after the original. */
function reportBaseName(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? path : path.substring(slash + 1);
}

/**
 * Keeps the newest `ReportsKept` folders and removes the rest.
 *
 * The ids begin with a UTC stamp, so a plain lexical sort is chronological and
 * `ls` has already done it. Only folders directly under the reports directory
 * are touched.
 */
function reportPrune(tsum: Tsum): void {
  const dir = tsum.reportsDir();
  const listing = execute('ls -1 "' + dir + '" 2>/dev/null');
  const names = (listing || '').split('\n')
    .map(function(n) { return n.replace(/^\s+|\s+$/g, ''); })
    .filter(function(n) { return n !== ''; })
    .sort();
  for (let i = 0; i < names.length - ReportsKept; i++) {
    execute('rm -rf "' + dir + '/' + names[i] + '"');
  }
}

/**
 * Everything a screenshot cannot carry, as JSON.
 *
 * The whole settings object rather than the round-stats subset: a report is
 * read by somebody trying to reproduce the run, and the row that mattered is
 * exactly the one a curated list would have left out.
 */
function reportManifest(tsum: Tsum, id: string, at: Date,
                        reason: string, note: string): string {
  const visits: object[] = [];
  for (let i = 0; i < gPages.history.length && i < ReportTrailVisits; i++) {
    const visit = gPages.history[i];
    visits.push({
      page: visit.page,
      key: visit.key,
      kind: visit.kind,
      at: new Date(visit.at).toISOString(),
      // 0 while the page is still up, which is true of the first entry only.
      heldMs: visit.leftAt === 0 ? undefined : visit.leftAt - visit.at,
      frame: visit.shot === '' ? undefined : reportBaseName(visit.shot),
    });
  }

  const manifest = {
    id: id,
    at: at.toISOString(),
    reason: reason,
    note: note,
    script: {
      version: ScriptVersion,
      locale: tsum.settings ? tsum.settings.locale : undefined,
      jp: tsum.isJP,
    },
    run: {
      runId: gLogRunId === '' ? undefined : gLogRunId,
      roundId: gLogRoundId === 0 ? undefined : gLogRoundId,
      roundUid: tsum.roundUid === '' ? undefined : tsum.roundUid,
      rounds: tsum.roundNumber,
      running: tsum.isRunning,
      startupPhase: tsum.isStartupPhase,
      task: gTaskController === undefined ? undefined : gTaskController.runningTask,
    },
    screen: {
      page: gPages.page,
      key: gPages.key === '' ? undefined : gPages.key,
      heldMs: gPages.since === 0 ? undefined : Date.now() - gPages.since,
      trail: visits,
    },
    play: {
      skill: statsSkillName(tsum.skillType),
      skillLevel: tsum.skillLevel,
      myTsum: tsum.myTsum === '' ? undefined : tsum.myTsum,
      bubbleStrategy: tsum.bubbleStrategy,
      fever: gFever.active,
      lorcanaTransformed: gLorcana.transformed,
    },
    device: reportDevice(tsum),
    settings: tsum.settings,
  };
  try {
    return JSON.stringify(manifest, null, 2);
  } catch (e) {
    // A cycle in `settings` is the only way here, and losing the manifest would
    // lose the whole report's context. The rest of it is already written.
    return JSON.stringify({ id: id, at: at.toISOString(), reason: reason, note: note,
      errorText: '' + e });
  }
}

/**
 * What this device is, as far as a report needs to know.
 *
 * The identifiers are hashed into the same 12-hex tag the stats rows carry
 * (`statsDeviceTag`), never sent as found -- this file leaves the phone, and
 * `android_id` is a hardware identifier. The model and the build fingerprint do
 * go as they are: they are what an emulator-only bug is recognised by, and they
 * name a product rather than a person.
 *
 * The geometry is the half that decides whether a frame can be replayed at all
 * -- `gameOffsetY` on a tall screen comes from a live detection and cannot be
 * recovered from a still. The sidecar beside the frame carries it too; it is
 * here as well so the manifest alone answers "what was this run playing on".
 */
function reportDevice(tsum: Tsum): object {
  return {
    tag: statsDeviceTag(tsum.storagePath),
    model: statsShellValue('getprop ro.product.model'),
    manufacturer: statsShellValue('getprop ro.product.manufacturer'),
    android: statsShellValue('getprop ro.build.version.release'),
    fingerprint: statsShellValue('getprop ro.build.fingerprint'),
    // Emulators are most of the reports and are worth naming outright rather
    // than leaving to be read out of the fingerprint.
    emulator: statsShellValue('getprop ro.kernel.qemu') === '1'
      || /generic|emulator|sdk|mumu|nox|ldplayer/i.test(
        statsShellValue('getprop ro.product.model')
        + ' ' + statsShellValue('getprop ro.product.device')),
    screen: { width: tsum.originScreenWidth, height: tsum.originScreenHeight },
    geometry: {
      gameOffsetX: tsum.gameOffsetX,
      gameOffsetY: tsum.gameOffsetY,
      gameWidth: tsum.gameWidth,
      gameHeight: tsum.gameHeight,
      captureGameRatio: tsum.captureGameRatio,
      resizeRatio: tsum.resizeRatio,
      playOffsetX: tsum.playOffsetX,
      playOffsetY: tsum.playOffsetY,
      playWidth: tsum.playWidth,
      playHeight: tsum.playHeight,
    },
    fps: gPages.fps,
  };
}

// --- the two ways in -------------------------------------------------------

/**
 * The logger's hook: makes a report of an event that says the run has failed.
 *
 * Called from `logEmit` for every record, so the lookup has to be the cheap
 * thing it is. Rate-limited here rather than in `saveReport`, because a person
 * pressing the button is entitled to a report however recently one was written
 * and this is the caller that is not.
 */
function reportOnLogged(event: string): void {
  // The run check comes first for two reasons: it is the cheaper of the two,
  // and `ReportTriggers` is a `const` in this file's slot of the bundle -- with
  // no run there is no `ts`, which is also true of every line logged before
  // that slot has been evaluated.
  if (ts === undefined || !gRunActive || gReportWriting) {
    return;
  }
  if (ReportTriggers[event] !== true) {
    return;
  }
  if (Date.now() - ts._lastReportAt < ReportMinIntervalMs) {
    return;
  }
  ts.saveReport(event, '');
}

/**
 * Writes a report of what is on screen now, and returns its id.
 *
 * A global for the same reason `start`, `stop` and `roundDelaySkip` are: the
 * settings page and the Quick Bar reach it by evaluating its name through
 * `JavaScriptInterface.runScript`, and the host's own Log-chip long press
 * evaluates it over the IPC socket.
 *
 * The settings page evaluates this **while the run is paused**, which is why
 * nothing here sleeps or taps: the host gates those, on the very thread that
 * would deliver the Resume (see `tools/liveSettings/check.js`, the `entry`
 * check). Captures and file writes are deliberately left working while paused,
 * which is the whole reason a report can be taken from a paused panel at all.
 * The Quick Bar's chip and the Log-chip long press reach it mid-run as well,
 * between two steps of the play loop, and that is the route that catches the
 * live screen rather than the pause menu.
 *
 * Returns the report id, or a sentence saying why there is none -- the host
 * writes the answer to the log either way.
 */
// noinspection JSUnusedGlobalSymbols
function reportIssue(reason?: string, note?: string): string {
  if (!gRunActive || ts === undefined) {
    return 'no run';
  }
  const id = ts.saveReport(reason === undefined || reason === '' ? 'manual' : reason,
    note === undefined ? '' : note);
  if (id === '') {
    return 'not saved';
  }
  ts.banner('Report saved: ' + id, 6000);
  return id;
}
