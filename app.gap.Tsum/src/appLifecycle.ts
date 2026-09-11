// ---------------------------------------------------------------------------
// The game app: whether it is in front, getting it there, and bouncing it.
//
// `isAppOn` is the reading, cached only when positive; `startApp` and
// `forceRestartApp` are the two ways the script changes the answer, and the two
// `await*` waits either side of a restart watch focus and the first fingerprint
// rather than a clock.
//
// `taskTsumAppRestart` is the scheduled bounce and navigates to a known screen
// at both ends. `forceRestartApp` deliberately does not -- it is the recovery
// path the navigation loops themselves call (dialogs.ts), and navigating from
// inside one would recurse back into it.
// ---------------------------------------------------------------------------

/**
 * How long a positive focus check is trusted for.
 *
 * `PageRouter.navigate` asks this once per pass round its loop, and every pass
 * also takes a screenshot and scores the whole page table -- so the question was
 * costing a process spawn and a full `dumpsys window` parse at roughly the rate
 * the script can act at all. Three seconds is far shorter than anything that
 * legitimately moves the game out of focus, and the waits that watch the game
 * leave and come back (`awaitAppOff`, `awaitAppUp`) start by clearing it.
 */
const AppOnCacheMs = 3000;

/**
 * Whether the game is the focused app.
 *
 * Only the *positive* answer is cached. A negative one sends the caller into
 * `startApp()`, which changes the very thing being measured, so it is always
 * re-read; and both `startApp` and `forceRestartApp` clear the cache anyway, so
 * a stale "yes" cannot survive the script bouncing the app itself.
 */
Tsum.prototype.isAppOn = function() {
  if (!this.autoLaunch) {
    return true;
  }
  if (this._appOnCheckedAt !== 0 && Date.now() - this._appOnCheckedAt < AppOnCacheMs) {
    return true;
  }
  // Every early return below leaves `_appOnCheckedAt` alone, which is what
  // keeps a "cannot tell" from being remembered as an answer.
  let result = execute('dumpsys window').split('mCurrentFocus');
  if (result.length < 2) {
    return false;
  }
  result = result[1].split(" ");
  if (result.length < 3) {
    return false;
  }
  result = result[2].split("/");
  if (result.length < 2) {
    return false;
  }
  const packageName = result[0];
  const isOn = packageName.indexOf('LGTMTM') !== -1;
  this._appOnCheckedAt = isOn ? Date.now() : 0;
  return isOn;
};

/**
 * Forget the cached focus answer.
 *
 * Called wherever the script itself moves the game in or out of focus, so the
 * next `isAppOn()` goes and looks instead of repeating what was true before.
 */
Tsum.prototype.invalidateAppOn = function() {
  this._appOnCheckedAt = 0;
};

function getPackageName(isJP: boolean): string {
    let packageName = 'com.linecorp.LGTMTM';
    if (!isJP) {
        packageName += 'G';
    }
    return packageName;
}

// A hardcoded `BOOTCLASSPATH=...` prefix used to sit in front of the java-backed
// commands here and in `dumpUiXml`, because Robotmon's shell started without one.
// It is gone, and removing it fixed something rather than merely saving a few
// characters.
//
// Checked on the target emulator (Android 12, API 32): three of the fifteen jars
// it named -- core.jar, core-junit.jar, webviewchromium.jar -- no longer exist,
// the framework having moved most of them under /apex. `am` turned out to ignore
// the variable entirely (it behaves identically with a deliberately broken value
// and with none), but `uiautomator` reads it and *aborts* on a bad one:
//
//   BOOTCLASSPATH=<stale> uiautomator dump ...  ->  Aborted
//   uiautomator dump ...                        ->  UI hierarchy dumped to: ...
//
// So the prefix had been quietly disabling `dumpUiXml`: two aborted dumps in a
// row and the system-dialog path gives up on the view hierarchy and runs on
// pixels alone for the rest of the session. Game Automation Platform runs
// `sh -c` with the process environment, which already carries the correct
// BOOTCLASSPATH.
function startTsumTsumApp(isJP: boolean): void {
  const packageName = getPackageName(isJP);
  execute('am start --activity-single-top -n ' + packageName + '/com.linecorp.LGTMTM.TsumTsum');
}

/** Budget for a launched game to be in front and on a screen the table knows. */
const AppUpWaitMs = 30000;
/** Between looks while it comes up. */
const AppUpPollMs = 500;
/** Budget for a force-stopped game to leave the foreground. */
const AppOffWaitMs = 3000;
/** Between focus checks while it goes. */
const AppOffPollMs = 250;

Tsum.prototype.startApp = function() {
  if (!this.autoLaunch) {
    return;
  }
  logInfo(Log.App.Start);
  this.invalidateAppOn();
  startTsumTsumApp(this.isJP);
  this.awaitAppUp();
  logInfo(Log.App.Started, 'TsumTsum app starting');
}

/**
 * Wait for the launched game to be in front and showing a screen the table
 * knows, and say whether it is.
 *
 * This was `sleep(10000)`: right for the slowest cold start it was measured
 * against and paid in full on every faster one. Focus is asked first because a
 * splash fingerprints as nothing, and `isAppOn`'s negative answer is never
 * cached; then a look, because focus arrives well before the first screen does.
 * The screen it finds is whatever the game opens on -- the tap-to-open page, an
 * event window, the root warning -- and leaving it is the navigation loop's job.
 *
 * False means the budget ran out, or the run stopped; the caller carries on
 * exactly as it did after the flat rest.
 */
Tsum.prototype.awaitAppUp = function() {
  const startedAt = Date.now();
  const deadline = startedAt + AppUpWaitMs;
  let looks = 0;
  while (this.isRunning && Date.now() < deadline) {
    if (this.isAppOn()) {
      const page = gPages.peek(1, 0);
      looks++;
      if (page !== null) {
        logDebug(Log.App.Up, { ms: Date.now() - startedAt, looks: looks, page: page.name });
        return true;
      }
    }
    this.sleep(AppUpPollMs);
  }
  logWarn(Log.App.UpTimeout, 'The game did not reach a known screen after launch',
    { waitedMs: Date.now() - startedAt, looks: looks, stopped: !this.isRunning });
  return false;
}

/**
 * Wait for a force-stopped game to leave the foreground, and say whether it did.
 * The focus cache is cleared before every check: a "yes" cached seconds ago is
 * the one answer this must not be given.
 */
Tsum.prototype.awaitAppOff = function() {
  if (!this.autoLaunch) {
    // `isAppOn` answers yes unasked without Auto launch, so there is nothing to
    // watch; this is the one blind rest left on the path.
    this.sleep(AppOffWaitMs);
    return false;
  }
  const startedAt = Date.now();
  const deadline = startedAt + AppOffWaitMs;
  while (this.isRunning) {
    this.invalidateAppOn();
    if (!this.isAppOn()) {
      logDebug(Log.App.Off, { ms: Date.now() - startedAt });
      return true;
    }
    if (Date.now() >= deadline) {
      break;
    }
    this.sleep(AppOffPollMs);
  }
  logWarn(Log.App.OffTimeout, 'The game was still in front after force-stop',
    { waitedMs: Date.now() - startedAt, stopped: !this.isRunning });
  return false;
}

// Bounce the game app. Deliberately does not navigate anywhere afterwards (that
// is taskTsumAppRestart's job) so the recovery paths inside the navigation loops
// can call it without recursing back into themselves.
Tsum.prototype.forceRestartApp = function() {
  if (!this.autoLaunch) {
    logWarn(Log.App.RestartSkipped, "Not restarting the game app: 'Auto launch app' is off");
    return false;
  }
  this.invalidateAppOn();
  execute("am force-stop " + getPackageName(this.isJP));
  this.awaitAppOff();
  this.isStartupPhase = true;
  this.startApp();
  return true;
}

Tsum.prototype.taskTsumAppRestart = function () {
    logInfo(Log.App.RestartPreparing, 'Preparing to restart the Tsum app');
    if (!this.isAppOn()) {
        this.startApp();
    }
    gPages.navigate(PageName.FriendPage);

    logInfo(Log.App.Restarting, 'Restarting the Tsum app');
    // Inlined rather than routed through forceRestartApp(): that helper is the
    // stall-recovery path (dialogs.ts) and is a different job -- gated on "Auto
    // launch app", and always relaunches. This is a scheduled restart that
    // navigates to a known screen at both ends.
    // `awaitAppOff` clears the focus cache before every check, so the answer
    // below is never one taken while the app was still up.
    this.invalidateAppOn();
    execute("am force-stop " + getPackageName(this.isJP));
    this.awaitAppOff();
    if (!this.isAppOn()) {
        this.startApp();
    }
    gPages.navigate(PageName.FriendPage);
    logInfo(Log.App.Restarted, 'Tsum app restarted');
}
