// The run lifecycle.
//
// `start()` does not return: `gTaskController.start()` runs the task loop and
// only comes back once something has cleared its flag. Every `stop()` therefore
// runs on a *second* thread while `start()` is still on the stack -- the host
// dispatches each eval on its own pool thread, and the engine hands the
// interpreter lock over at every `sleep()` -- and the two have to agree on who
// owns `ts`, the task set and the router.
//
// They did not, and opening the settings page mid-run is what it cost: that
// page's `OnSettingClick` used to evaluate `stop();` -- it no longer does, the
// host pauses instead and Play with the panel open is what sends the `start()`
// that replaces the run -- which cleared `ts` and detached `gPages` while the
// loop was still inside a task. The task's next detect threw
// "PageRouter is not attached", and when the loop finally handed back, `start()`
// finished on `log(ts.logs.TaskControllerStop)` (now `logInfo(Log.Task.LoopStopped)`) with
// `TypeError: cannot read property 'logs' of undefined`. Pressing Play then
// built a second world on top of the first, which is why the script had to be
// reloaded before a changed setting would take.
//
// The rule now: **a run dismantles its own world.** `stop()` only asks it to
// end, and waits until it says it has.

/** True from the moment `start()` owns a world until `endRun()` has cleared it. */
let gRunActive = false;

/**
 * Is this run the walkthrough recorder?
 *
 * A mode rather than a task, and the only one where nothing may touch the screen
 * -- so it is also the one run that has to refuse work the settings page asks for
 * on demand. `buildRun` is where that is decided; this is how `unlockLevelsNow`
 * finds out.
 */
let gWalkthroughRun = false;

/**
 * Set by `stop()`, cleared by the next `start()`.
 *
 * A stop that lands while a run is still being assembled has nothing to stop:
 * the controller it flagged is not the one being built. This is how that
 * request survives to the one check that can still honour it.
 */
let gStopRequested = false;

/**
 * How long `stop()` waits for the task loop to hand back.
 *
 * Tasks are cooperative and only notice `ts.isRunning` at their own loop
 * boundaries, so a stop costs whatever the running task has left to do -- under
 * a second for an idle loop, a couple of seconds mid-round. Well above both,
 * because the cost of giving up too early is two task loops tapping the same
 * screen with two different configurations.
 */
const StopWaitMs = 20 * 1000;

function start(settings: Settings) {
  // A hand-written start() command can arrive with no `locale` at all; an
  // absent or unknown tag falls back to English inside `logStringsFor`, so
  // nothing here has to know which languages exist.
  const logs = logStringsFor(settings.locale);
  logSetMessages(logs);

  // A run still on the stack owns everything `buildRun` is about to replace.
  // Wind it down first, and refuse rather than double up if it will not go.
  if (gRunActive) {
    stop();
    if (gRunActive) {
      logWarn(Log.Run.StartBusy);
      return;
    }
  }
  gStopRequested = false;
  // Opened before anything can log, so every line from here to endRun() carries
  // the same runId -- including the ones buildRun writes on its way up.
  logBeginRun();
  // Before buildRun, so a recorder is already following when the first round
  // starts. `ts` does not exist yet, hence the free function rather than
  // `ts.emit` -- see emitScriptEvent in tsum.ts.
  emitScriptEvent(Emit.Run.Started, {
    version: ScriptVersion,
    skill: statsSkillName(settings.skillType),
    locale: settings.locale,
  });

  try {
    buildRun(settings, logs);
    const controller = gTaskController;
    if (controller === undefined) {
      return;
    }
    // A yield, not a rest: the host hands the interpreter lock over at every
    // `sleep()`, and this is the chance a `stop()` that arrived during the build
    // has to set its flag before the loop below starts tapping. It was 500ms,
    // which bought nothing the handover itself does not.
    sleep(50);
    if (!gStopRequested) {
      controller.start();
    }
  } finally {
    // Reached on the way out of the loop, and on any throw during the build --
    // either way this is the thread that owns the run, and the loop it was
    // running has ended.
    endRun();
  }
  logInfo(Log.Task.LoopStopped);
}

/**
 * Builds the world one run plays in: the `Tsum`, the tuning `start()` maps onto
 * it, the router binding and the task set. Everything here is undone by
 * `endRun()`.
 */
function buildRun(settings: Settings, logs: LogCatalogue): void {
  ts = new Tsum(settings.jpVersion, settings.specialScreenRatio, logs);
  // From here on there is a world to dismantle, whether or not the rest of this
  // function gets to finish -- `start()` tears it down in its `finally`.
  gRunActive = true;
  ts.settings = settings
  logInfo(Log.Run.Start, { language: settings.locale || Locale.English });
  ts.debug = settings.debugGame;
  ts.collectUnknownScreens = settings.collectUnknownScreens;
  ts.bonus5to4 = settings.bonus5to4;
  if (ts.bonus5to4) {
    ts.uniqueTsumCount = 4;
  }
  ts.prioritizeMyTsum = settings.prioritizeMyTsum;
  ts.autoLaunch = settings.autoLaunchApp;
  ts.scoreItem = settings.bonusScore;
  ts.coinItem = settings.bonusCoin;
  ts.expItem = settings.bonusExp;
  ts.timeItem = settings.bonusTime;
  ts.bubbleItem = settings.bonusBubble;
  ts.comboItem = settings.bonusCombo;
  ts.receiveSecondItem = settings.receiveHeartsSkipFirst;
  ts.sentToZero = settings.sendHeartsToZeroScore;
  ts.receiveCheckLimit = settings.mailOpenMax;
  ts.bubbleStrategy = settings.bubbleStrategy;
  ts.skillInterval = settings.skillWaitingTime * 1000;
  ts.skillLevel = settings.skillLevel;
  ts.skillType = settings.skillType;
  ts.trackRoundStats = settings.trackRoundStats;
  // Hand the CSV to the host, which does the sending: it remembers the last id
  // it managed to send for each file, so nothing here has to track progress or
  // retry. Guarded on the *host* rather than on the settings: a bare reference
  // to a missing global is a ReferenceError on a host older than this native.
  if (ts.trackRoundStats && typeof publishStats === 'function') {
    const pattern = Config.recordDir + '/stats_*.csv';
    publishStats(pattern);
    logInfo(Log.Stats.Publishing, 'Handed the round stats to the host to send', {
      pattern: pattern,
    });
  }
  ts.skillAutoTap = settings.skillAutoTap;
  ts.lorcanaCard = settings.lorcanaCard === true;
  ts.unlockLevelHoursWait = settings.unlockLevelHoursWait;
  // Defaulted for a hand-written start() command: a missing box would make the
  // sweep buy nothing at all rather than the wrong thing, but naming one is
  // still the friendlier failure.
  ts.buyBoxType = settings.buyBoxType || BoxType.Premium;
  ts.buyBoxTenTimes = settings.buyBoxTenTimes;
  // Checked rather than taken, because this one is what stops a chore that
  // spends the player's coins: a hand-written start() command has no range.
  ts.buyBoxMaxPurchases = typeof settings.buyBoxMaxPurchases === 'number'
    ? settings.buyBoxMaxPurchases : 0;
  // A negative or fractional one can arrive from a hand-written start() command.
  ts.roundDelayMs = typeof settings.roundDelayMinutes === 'number'
    && settings.roundDelayMinutes > 0
    ? Math.round(settings.roundDelayMinutes) * 60 * 1000 : 0;
  // Same guard, and for the same reason: 0 is "no cap", so anything that is not
  // a positive number has to land on 0 rather than on a cap of NaN, which every
  // comparison in the play loop would answer false to.
  ts.maxRoundMs = typeof settings.maxRoundMinutes === 'number'
    && settings.maxRoundMinutes > 0
    ? Math.round(settings.maxRoundMinutes) * 60 * 1000 : 0;
  // Defaulted rather than taken, for a hand-written start() command: an
  // unrecognised action would match no branch and silently play the round out,
  // which is the one behaviour the cap exists to replace.
  ts.maxRoundAction = settings.maxRoundAction === MaxRoundAction.Stop
    ? MaxRoundAction.Stop : MaxRoundAction.Coast;
  ts.sendHearts = settings.sendHeartsAuto;
  ts.keepRuby = settings.receiveHeartsSkipRuby;
  ts.skipMedals = settings.receiveHeartsSkipMedals;
  ts.sendHeartMaxDuring = settings.sendHeartsMaxRuntime * 60 * 1000;
  ts.useFan = settings.useFan;
  if (typeof settings.maxChainsPerScan === 'number' && settings.maxChainsPerScan >= 1) {
    ts.maxChainsPerScan = settings.maxChainsPerScan;
  }
  const yOffset = ts.receiveSecondItem ? MailList.rowPitch : 0;
  Button.outReceiveOne.y = Button.outReceiveOneBase.y + yOffset;
  Button.outReceiveOneRuby.y = Button.outReceiveOneRubyBase.y + yOffset;
  Button.outReceiveOneAd.y = Button.outReceiveOneAdBase.y + yOffset;
  Button.outReceiveOneMedal.y = Button.outReceiveOneMedalBase.y + yOffset;

  ts.readRecord();
  if (ts.record[RecordKey.HeartsCount] === undefined) {
    ts.record[RecordKey.HeartsCount] = {
      receivedCount: 0,
      sentCount: 0
    };
  }

  Config.debugLogs = settings.debugLogs;
  Config.maxChain = settings.maxChain;
  // Bounded here as well as in the UI, because a share code clamps to *its*
  // version's range and a hand-edited start() command has no range at all --
  // and a reach of 0 links nothing while a huge one links the whole board into
  // one chain the game will not draw. Out of range, data.ts's value stands.
  if (typeof settings.linkReachPercent === 'number'
      && settings.linkReachPercent >= 100 && settings.linkReachPercent <= 400) {
    Config.linkReach = settings.linkReachPercent / 100;
  }
  logInfo(Log.Board.LinkReach, {
    reachPx: +(Config.tsumWidth * Config.linkReach).toFixed(0),
    reachTsumWidths: Config.linkReach,
  });

  // The page router. Attach before any task can ask what is on screen, which is
  // to say before gTaskController.start() below.
  //
  // `historyDepth` is how many screens back the trail goes; the frames are only
  // written when debug is on, because that is a PNG per page change. `fps` is
  // what scales the transient windows in PageProfiles -- the game counts those
  // in frames, so a device running at 120 shows them for half as long.
  gPages.attach(ts);
  // The other load-time singleton that outlives a run, and the only one holding
  // state from the last one: whatever the screen was doing when the previous
  // run ended has nothing to do with what this one is about to see.
  gFever.reset();
  // The other load-time state a round owns rather than a run. Reset here as
  // well as at the whistle, so a run built while the last one's transformation
  // was still set starts from untransformed whatever happens before the first
  // round begins.
  lorcanaReset();
  // Same reasoning: the forecast suppresses a repeat of what it last said, and
  // what it said during the previous run is not something this one has said.
  gForecastLast = '';
  if (typeof settings.pageHistoryDepth === 'number' && settings.pageHistoryDepth >= 0) {
    gPages.historyDepth = settings.pageHistoryDepth;
  }
  if (typeof settings.deviceFps === 'number' && settings.deviceFps > 0) {
    gPages.fps = settings.deviceFps;
  }
  // The trail's frames are on for every run, because an issue report copies
  // them and the person who needs one has already hit the bug -- see
  // `PageRouter.keepShots`. What "Debug game" still buys is *depth*: the whole
  // trail rather than the handful a report takes.
  gPages.keepShots = gPages.historyDepth > 0;
  gPages.shotDepth = ts.debug ? gPages.historyDepth : Config.reportTrailFrames;

  ts.noSkillLastFeverSec = settings.noSkillLastFeverSec;
  ts.claimAllWithoutCoins = settings.claimAllWithoutCoins;
  ts.tsumAppRestartFrequency = settings.tsumAppRestartFrequency;

  // The one assert worth keeping: every file in `tsconfig.json` is concatenated
  // into one script, so a bundle that did not build fully fails here with a
  // sentence rather than a bare TypeError several frames deep.
  if (typeof TsumTaskController !== 'function') {
    logError(Log.Run.BundleIncomplete,
      'TsumTaskController is missing -- the bundle did not concatenate correctly');
    return;
  }

  gTaskController = new TsumTaskController();

  // The task set is `runTaskTable` (src/runPlan.ts), which the settings page's
  // Run order card reads too -- so what it describes is what gets registered.

  // Set when a Now button started this run -- see `unlockLevelsNow`, `buyBoxesNow`.
  const unlockFirst = settings.unlockLevelsFirst === true;
  const buyBoxesFirst = settings.buyBoxesFirst === true;

  // The walkthrough recorder is a mode, not a task alongside the others: it is
  // watching a person play, so nothing else may touch the screen. The table
  // returns it alone, which is what enforces that -- the recorder itself only
  // ever calls `gPages.sweep`, which scores the table without broadcasting, so
  // not even a dismiss handler fires. See src/walkthrough.ts.
  gWalkthroughRun = settings.walkthrough === true;
  if (gWalkthroughRun) {
    if (unlockFirst) {
      logWarn(Log.Unlock.NowRefused, { reason: 'walkthrough' });
    }
    if (buyBoxesFirst) {
      logWarn(Log.Box.NowRefused, { reason: 'walkthrough' });
    }
  }
  const jobs = runTaskTable(settings);
  for (let i = 0; i < jobs.length; i++) {
    gTaskController.register(jobs[i], taskBody(ts, jobs[i].name));
  }
  if (gWalkthroughRun) {
    return;
  }
  if (unlockFirst) {
    queueUnlockSweep(ts, gTaskController);
  }
  if (buyBoxesFirst) {
    queueBuyBoxSweep(ts, gTaskController);
  }
}

/**
 * The method a job name binds to, on this run's `Tsum`.
 *
 * A switch rather than a lookup by string, so a name the table can produce and
 * this cannot bind is a build error.
 */
function taskBody(run: Tsum, name: TaskName): () => void {
  switch (name) {
    case TaskName.Walkthrough: return run.taskWalkthrough.bind(run);
    case TaskName.ReceiveOneItem: return run.taskReceiveOneItem.bind(run);
    case TaskName.ReceiveAllItems: return run.taskReceiveAllItems.bind(run);
    case TaskName.SendHearts: return run.taskSendHearts.bind(run);
    case TaskName.AppRestart: return run.taskTsumAppRestart.bind(run);
    case TaskName.ClickAssist: return run.taskClickAssist.bind(run);
    case TaskName.UnlockLevel: return run.taskAutoUnlockLevel.bind(run);
    case TaskName.BuyBoxes: return run.taskBuyBoxes.bind(run);
    case TaskName.PlayRound: return run.taskPlayGameQuick.bind(run);
  }
}

/**
 * Dismantles the world `buildRun` made, in the order the parts can safely go.
 *
 * Only ever called by the thread running `start()`, and only once its loop has
 * handed back -- which is what makes clearing `ts` and detaching the router safe
 * here and unsafe from `stop()`.
 */
function endRun(): void {
  if (!gRunActive) {
    return;
  }
  gRunActive = false;
  gWalkthroughRun = false;
  gUnlockNowQueued = false;
  gBuyBoxNowQueued = false;
  // Read before `ts` is cleared below; the event itself goes out with the rest
  // of the closing lines.
  const rounds = ts === undefined ? 0 : ts.runCoins.rounds;
  if (ts !== undefined) {
    ts.isRunning = false;
  }
  if (gTaskController !== undefined) {
    gTaskController.stop();
    gTaskController = undefined;
  }
  // Last, with `ts`: the router throws rather than no-op when it is asked about
  // a screen with nothing attached, and until the loops above have wound down
  // one of them can still be mid-detection.
  gPages.detach();
  ts = undefined;
  emitScriptEvent(Emit.Run.Stopped, { rounds: rounds });
  // Last, so the lines above are still attributed to the run that wrote them.
  logEndRun();
}

/**
 * Raises every flag that ends a run, and returns at once.
 *
 * The half of `stop()` a task body may call. `stop()` itself waits for
 * `gRunActive` to clear, and that is the run's own thread handing back -- so a
 * task calling it would be waiting for itself and spend `StopWaitMs` doing it.
 * Flags are all a task needs: it returns, the controller's loop sees
 * `isRunning` false and ends, and `start()`'s `finally` calls `endRun()`.
 */
function requestStop(): void {
  // First, so that a run still being assembled sees it before it starts a loop.
  gStopRequested = true;

  if (ts !== undefined) {
    logInfo(Log.Run.Stop);
    // The flag every long task body polls: a game already in progress hands the
    // loop back at its next check rather than mid-chain. It is also what the
    // touch wrappers read (src/tsum.ts), so whatever the task does before that
    // check stays off the screen -- the host drops its input as well when the
    // stop is its own, since a paused run is parked inside the tap it was
    // about to make and only the host can catch that one.
    ts.isRunning = false;
  }
  if (gTaskController !== undefined) {
    gTaskController.removeAllTasks();
    gTaskController.stop();
  }
}

/**
 * Asks the running script to end, and waits for it.
 *
 * Called from the settings page (Stop), from the host's own stop, and from
 * `start()` -- often two of those at once, which is why nothing here tears
 * anything down: it flags, and it waits.
 */
function stop() {
  const run = ts;
  requestStop();
  if (!gRunActive) {
    return;
  }

  const deadline = Date.now() + StopWaitMs;
  while (gRunActive && Date.now() < deadline) {
    sleep(100);
  }
  if (gRunActive && run !== undefined) {
    // Left alone deliberately: the run is wedged somewhere that is not checking
    // its flag, and clearing `ts` out from under it is exactly the bug this
    // handshake exists to prevent. `start()` refuses to build a second world
    // over it, so pressing Play again is safe and is what to do.
    logWarn(Log.Run.StopSlow, { waitedMs: StopWaitMs });
  }
}

/**
 * Ends the between-rounds wait now, so the next round starts at the play task's
 * next turn rather than when the delay would have run out.
 *
 * A global for the same reason `start` and `stop` are: the settings page reaches
 * it by evaluating its name through `JavaScriptInterface.runScript`. Only the
 * *running* wait is cleared -- the setting itself is untouched, so the round
 * after this one waits again.
 *
 * Returns what it decided, which the host writes to the log.
 */
// noinspection JSUnusedGlobalSymbols
function roundDelaySkip(): string {
  if (!gRunActive || ts === undefined) {
    return 'no run';
  }
  const left = ts.roundDelayRemainingMs();
  if (left <= 0) {
    return 'nothing waiting';
  }
  ts.nextRoundAt = 0;
  logInfo(Log.Play.RoundDelaySkipped, { skippedMs: left });
  return 'skipped ' + Math.round(left / 1000) + 's';
}

/**
 * Puts the settings page's saved values onto the run in progress, for the rows
 * a run can take mid-run.
 *
 * A global for the same reason `start`, `stop` and `roundDelaySkip` are: the
 * settings page reaches it by evaluating its name through
 * `JavaScriptInterface.runScript`. It is sent the *whole* form on every save
 * and keeps no list of what is live -- `quickBarApplyOne` (src/quickbar.ts) is
 * that list, and it is the same one the Quick Bar's own changes go through, so
 * a value edited on either side means the same thing. Everything else is
 * ignored in silence: most of a run's configuration is read once by `buildRun`
 * and only a fresh `start()` can change it.
 *
 * Only what differs from `ts.settings` -- what the world is set to *now*, which
 * is why the Quick Bar writes there too -- is applied. Re-applying an unchanged
 * row is not free: picking a skill lifts the previous skill's hold on "Link
 * MyTsum first", and setting the between-rounds delay re-bases a rest already
 * running on it.
 *
 * Some of what it takes lands at the next round rather than now -- the tsum on
 * the board cannot be swapped under a round already dealt. See
 * `LiveSettings` (src/quickbar.ts); the answer says which.
 *
 * Returns what it decided, which the host writes to the log.
 */
// noinspection JSUnusedGlobalSymbols
function applyLiveSettings(values?: Partial<Settings>): string {
  if (!gRunActive || ts === undefined) {
    return 'no run';
  }
  if (values === undefined) {
    return 'no settings';
  }
  // `Settings` has no index signature and each field is narrower than what
  // arrives here -- which `quickBarApplyOne` clamps and coerces to it.
  const wanted = values as unknown as { [key: string]: string | number | boolean };
  const current = ts.settings as unknown as { [key: string]: string | number | boolean };
  const keys = Object.keys(wanted);
  const applied: string[] = [];
  const held: string[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (wanted[key] === current[key]) {
      continue;
    }
    if (quickBarApplyOne(ts, key as SettingKey, wanted[key]) === undefined) {
      continue;
    }
    applied.push(key);
    // Taken, but by the next round rather than by this one -- see
    // `LiveSettings` (src/quickbar.ts). Worth separating because this is
    // the call a whole preset arrives on, and one that changes only these looks
    // from the outside like a preset that did nothing.
    if (quickBarHoldsBack(key as SettingKey)) {
      held.push(key);
    }
  }
  if (applied.length === 0) {
    return 'nothing to apply';
  }
  logInfo(Log.Settings.LiveApplied, 'The settings page changed the running world',
    { settings: applied, heldForNextRound: held });
  quickBarSayHeldBack(ts, held.length);
  return 'applied ' + applied.join(' ')
    + (held.length === 0 ? '' : ' (' + held.join(' ') + ' at the next round)');
}

/** Name of the one-shot task `unlockLevelsNow` queues. */
const UnlockNowTask = 'autoUnlockLevelNow';

/**
 * How soon the one-shot comes round again after standing aside.
 *
 * It stands aside for a round in progress -- the board, or the game's own pause
 * menu, where its detect has already had `dismiss.resumeGame` press Continue.
 * The round is the play task's to finish, and the sweep goes once that hands
 * back. The play task's own cadence, so the two take turns until then.
 */
const UnlockNowRetryMs = 3 * 1000;

/** Set while a sweep asked for from the settings page is waiting for its turn. */
let gUnlockNowQueued = false;

/**
 * Registers the sweep on `controller`, to run at the loop's first free turn.
 * `unlockLevelsNow` calls this on a live run, `buildRun` on one started for it.
 *
 * The sweep goes before everything but a round in progress. Its priority
 * (`JobPriority.UnlockNow`, ahead of every scheduled job) is what puts it
 * first among the tasks that are *due*; `ts.yieldAsked` is what gets the
 * running one to hand back -- the heart and mailbox chores poll it at every
 * step, and the play task will not start a round while it is up.
 *
 * Not `runTimes: 1`: a task that runs once is gone whether or not it did
 * anything, and the sweep stands aside for a round. It stays registered until
 * `taskAutoUnlockLevel` says it ran, and removes itself then.
 */
function queueUnlockSweep(run: Tsum, controller: TsumTaskController): void {
  gUnlockNowQueued = true;
  run.yieldAsked = true;
  let waited = false;
  controller.newTask(UnlockNowTask, function() {
    run.yieldAsked = false;
    if (!run.taskAutoUnlockLevel()) {
      // A round is on. It is the play task's to finish, and everything else
      // still waits behind the sweep.
      run.yieldAsked = true;
      if (!waited) {
        waited = true;
        logInfo(Log.Unlock.NowWaiting);
      }
      return;
    }
    gUnlockNowQueued = false;
    controller.removeTask(UnlockNowTask);
  }, UnlockNowRetryMs, 0, false, JobPriority.UnlockNow);
  logInfo(Log.Unlock.NowQueued);
  run.banner('Raising level caps next', 4000);
}

/**
 * Runs the level-cap sweep once, whatever the schedule says.
 *
 * A global for the same reason `start`, `stop` and `roundDelaySkip` are: the
 * settings page reaches it by evaluating its name through
 * `JavaScriptInterface.runScript`.
 *
 * On a live run it queues rather than sweeps. The bridge evaluates this on the
 * host's thread, and the sweep taps the screen for minutes -- so running it
 * here would put two things on the same screen, which is the bug `stop()`'s
 * handshake exists to prevent. A task instead: the loop takes it at its next
 * turn, which is as soon as whatever is running now hands back.
 *
 * With nothing running, and `settings` given, it starts a run: the page's own
 * `start()` command with `unlockLevelsFirst` set, so `buildRun` queues the
 * sweep ahead of the loop's first turn. Like `start()`, that does not return
 * until the run ends -- this thread becomes the run's, as it does for Play.
 *
 * Returns what it decided, which the host writes to the log.
 */
// noinspection JSUnusedGlobalSymbols
function unlockLevelsNow(settings?: Settings): string {
  if (!gRunActive || ts === undefined || gTaskController === undefined) {
    if (settings === undefined) {
      return 'no run';
    }
    settings.unlockLevelsFirst = true;
    start(settings);
    return 'started';
  }
  if (gWalkthroughRun) {
    // The recorder is watching a person play; a sweep would be the script
    // tapping over them, and the walk would record its taps as theirs.
    logWarn(Log.Unlock.NowRefused, { reason: 'walkthrough' });
    return 'walkthrough recording';
  }
  if (gUnlockNowQueued) {
    return 'already queued';
  }
  queueUnlockSweep(ts, gTaskController);
  return 'queued';
}

/** Name of the one-shot task `buyBoxesNow` queues. */
const BuyBoxNowTask = 'buyBoxesNow';

/** Set while a Box Buying sweep asked for from the settings page is waiting for its turn. */
let gBuyBoxNowQueued = false;

/**
 * Registers a Box Buying sweep on `controller`, to run at the loop's first free
 * turn. The level-cap sweep's `queueUnlockSweep`, for the other chore that has a
 * Now button -- see that function for why the priority and `yieldAsked` are what
 * they are, and why it is not `runTimes: 1`.
 *
 * The two share `ts.yieldAsked`, which is a flag rather than a queue: with both
 * queued, whichever the controller takes first clears it and the other's still
 * stands, so they run one after the other rather than fighting for the screen.
 */
function queueBuyBoxSweep(run: Tsum, controller: TsumTaskController): void {
  gBuyBoxNowQueued = true;
  run.yieldAsked = true;
  let waited = false;
  controller.newTask(BuyBoxNowTask, function() {
    run.yieldAsked = false;
    if (!run.taskBuyBoxes()) {
      // A round is on. It is the play task's to finish, and everything else
      // still waits behind the sweep.
      run.yieldAsked = true;
      if (!waited) {
        waited = true;
        logInfo(Log.Box.NowWaiting);
      }
      return;
    }
    gBuyBoxNowQueued = false;
    controller.removeTask(BuyBoxNowTask);
  }, UnlockNowRetryMs, 0, false, JobPriority.BuyBoxesNow);
  logInfo(Log.Box.NowQueued);
  run.banner('Buying boxes next', 4000);
}

/**
 * Buys boxes once, whatever the schedule says.
 *
 * A global for the same reason `start`, `stop`, `roundDelaySkip` and
 * `unlockLevelsNow` are: the settings page reaches it by evaluating its name
 * through `JavaScriptInterface.runScript`. It behaves as `unlockLevelsNow` does
 * -- queued on a live run rather than run on the host's thread, or a run started
 * for it when nothing is playing -- and that function carries the reasoning for
 * both.
 *
 * One difference: this sweep has settings of its own -- which box, how many at a
 * time, how many purchases -- so on a live run the form goes onto the run before
 * the sweep is queued. The panel's own save carries them too, but it is pushed
 * on the host's worker thread while this call comes down the bridge, so it need
 * not have landed yet; the sweep would then run on the value the run started
 * with.
 *
 * Returns what it decided, which the host writes to the log.
 */
// noinspection JSUnusedGlobalSymbols
function buyBoxesNow(settings?: Settings): string {
  if (!gRunActive || ts === undefined || gTaskController === undefined) {
    if (settings === undefined) {
      return 'no run';
    }
    settings.buyBoxesFirst = true;
    start(settings);
    return 'started';
  }
  if (gWalkthroughRun) {
    logWarn(Log.Box.NowRefused, { reason: 'walkthrough' });
    return 'walkthrough recording';
  }
  if (gBuyBoxNowQueued) {
    return 'already queued';
  }
  applyLiveSettings(settings);
  queueBuyBoxSweep(ts, gTaskController);
  return 'queued';
}

// input: rgb in [0,255], out: h in [0,360) and s,v in [0,100]
function rgb2hsv(rgb: Color): { h: number; s: number; v: number } {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const v = Math.max(r, g, b), c = v - Math.min(r, g, b);
  const h = c && ((v === r) ? (g - b) / c : ((v === g) ? 2 + (b - r) / c : 4 + (r - g) / c));
  return {h: 60 * (h < 0 ? h + 6 : h), s: Math.round(v && c / v * 100), v: Math.round(v * 100)};
}
