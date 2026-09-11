// ---------------------------------------------------------------------------
// The waits.
//
//   ts.sleep()         the interruptible rest: 500ms at a time, so a stopped run
//                      does not have to see out a long one
//   ts.sleepUntil()    the same to a wall-clock deadline -- what a choreography
//                      that can be entered late needs, where `sleep(2100)`
//                      restarts the clock wherever the call happens
//   ts.settleScreen()  wait for the screen to stop moving. The gate every flow
//                      uses in place of a fixed rest, and why the flows work at
//                      a frame rate nobody measured them at -- DRIVING_SCREENS.md § 5
//   ts.settleBoard()   its counterpart for the one screen it cannot judge: the
//                      board's HUD moves all round, so this watches the play
//                      square alone
//   ts.mayContinue()   should a chore carry on, or hand the loop back
//
// The waits that watch for a particular *screen* rather than for stillness live
// with the flow that waits (`awaitAppUp`, `awaitRoundStart`, `awaitPage`).
// ---------------------------------------------------------------------------

// Sleep to a wall-clock deadline rather than for a duration. What a
// choreography wants once it can be entered late: `sleep(2100)` re-starts the
// clock wherever the call happens, a deadline off the activation instant does
// not.
Tsum.prototype.sleepUntil = function(deadline) {
  const remaining = deadline - Date.now();
  if (remaining > 0) {
    this.sleep(remaining);
  }
}

/** One reading of the settle grid: one capture, one crossing, released. */
function screenSettleSample(ts: Tsum, points: Point[]): Color[] {
  const img = ts.screenshot();
  try {
    return ts.getColors(img, points);
  } finally {
    releaseImage(img);
  }
}

/**
 * Wait for the screen to stop moving, and say whether it did.
 *
 * The gate that makes a flow work at any frame rate. `sleep(800)` after a tap
 * is a guess at how long a panel takes to arrive, and the game measures that in
 * frames rather than milliseconds -- so the guess is only right on the device it
 * was made on, and it is the slower device it is wrong on, where the next tap
 * lands inside the animation and is swallowed by it (DRIVING_SCREENS.md § 4).
 * Watching the animation instead needs no frame rate to be configured.
 * DRIVING_SCREENS.md § 5 is the rule, and where it must not be used.
 *
 * `maxMs` is a budget, not a duration: this returns the moment the screen holds
 * still, so a generous one costs nothing on a fast device and is what a slow one
 * needs. Poll cost is `ScreenSettle`'s sixty probes off one capture.
 *
 * False means the budget ran out with the screen still moving, or the run
 * stopped. Neither is fatal -- the caller was going to sleep blind anyway -- so
 * only a caller with something better to do than carry on need look.
 */
Tsum.prototype.settleScreen = function(maxMs) {
  if (!this.isRunning) {
    return false;
  }
  const budget = maxMs === undefined ? ScreenSettle.maxMs : maxMs;
  const points: Point[] = [];
  for (let i = 0; i < ScreenSettle.ys.length; i++) {
    for (let j = 0; j < ScreenSettle.xs.length; j++) {
      points.push({x: ScreenSettle.xs[j], y: ScreenSettle.ys[i]});
    }
  }

  // The animation this is waiting on has not necessarily started: a sample taken
  // the instant after the tap reads the old screen, and the one after it reads
  // the old screen again, which is "still" and is the wrong answer.
  this.sleep(ScreenSettle.leadMs);
  const startedAt = Date.now();
  let before = screenSettleSample(this, points);
  let moved = points.length;
  let polls = 0;
  while (this.isRunning && Date.now() - startedAt < budget) {
    this.sleep(ScreenSettle.spacingMs);
    const after = screenSettleSample(this, points);
    polls++;
    moved = 0;
    for (let i = 0; i < after.length; i++) {
      if (absColor(before[i], after[i]) > ScreenSettle.threshold) {
        moved++;
      }
    }
    if (moved <= ScreenSettle.maxMoved) {
      logDebug(Log.Screen.Settled,
        {still: true, ms: Date.now() - startedAt, moved: moved, polls: polls});
      return true;
    }
    before = after;
  }
  logDebug(Log.Screen.Settled,
    {still: false, ms: Date.now() - startedAt, moved: moved, polls: polls,
     budgetMs: budget, stopped: !this.isRunning});
  return false;
}

/** The cell centres `boardSettleSample` reads, worked out once. */
let BoardSettlePoints: Point[] | null = null;

/** One reading of the board: the play square captured coarse, one brightness per cell. */
function boardSettleSample(ts: Tsum): number[] {
  if (BoardSettlePoints === null) {
    const step = BoardSettle.capture / BoardSettle.grid;
    BoardSettlePoints = [];
    for (let gy = 0; gy < BoardSettle.grid; gy++) {
      for (let gx = 0; gx < BoardSettle.grid; gx++) {
        BoardSettlePoints.push({x: Math.floor((gx + 0.5) * step), y: Math.floor((gy + 0.5) * step)});
      }
    }
  }
  const img = getScreenshotModify(
    ts.playOffsetX, ts.playOffsetY, ts.playWidth, ts.playHeight,
    BoardSettle.capture, BoardSettle.capture, 100);
  const out: number[] = [];
  try {
    const cols = getImageColors(img, BoardSettlePoints);
    for (let i = 0; i < cols.length; i++) {
      out.push((cols[i].r + cols[i].g + cols[i].b) / 3);
    }
  } finally {
    releaseImage(img);
  }
  return out;
}

/** Mean per-cell brightness change between two readings, 0..1. */
function boardSettleDiff(a: number[], b: number[]): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) { d += Math.abs(a[i] - b[i]); }
  return d / a.length / 255;
}

/**
 * Wait for the tsums to stop moving, and say whether they did.
 *
 * `settleScreen`'s counterpart for the one screen it cannot judge: the board's
 * HUD moves for the whole round, so the full-screen grid never reads still
 * there. This watches the play square alone (`BoardSettle`), where a landed
 * board barely changes between readings and a falling one changes a lot.
 *
 * What it replaces is the flat rest after a skill fires -- the "Skill Waiting
 * time" setting, spent in full whether the clear took one second or three.
 * `maxMs` is that budget now: the call returns once the board has held still
 * for `quietReads` readings, and not before `minMs`, because a skill's cut-in
 * can hold the board motionless before the clear and that is not the stillness
 * wanted. A caller whose clear is already under way may pass a lower `minMs`.
 * What comes off is the tail of the wait, where the tsums have landed and the
 * clock is still running.
 *
 * False means the budget ran out with the board still moving, or the run
 * stopped -- the old wait, in full, so a caller need not look.
 */
Tsum.prototype.settleBoard = function(maxMs, minMs) {
  if (!this.isRunning) {
    return false;
  }
  const budget = maxMs === undefined ? BoardSettle.maxMs : maxMs;
  const floor = minMs === undefined ? BoardSettle.minMs : minMs;
  const startedAt = Date.now();
  let before = boardSettleSample(this);
  let diff = 1;
  let quiet = 0;
  let reads = 1;
  while (this.isRunning && Date.now() - startedAt < budget) {
    this.sleep(BoardSettle.spacingMs);
    const after = boardSettleSample(this);
    reads++;
    diff = boardSettleDiff(before, after);
    before = after;
    quiet = diff <= BoardSettle.maxDiff ? quiet + 1 : 0;
    if (quiet >= BoardSettle.quietReads && Date.now() - startedAt >= floor) {
      logDebug(Log.Screen.BoardSettled,
        {still: true, ms: Date.now() - startedAt, diff: +diff.toFixed(3), reads: reads});
      return true;
    }
  }
  logDebug(Log.Screen.BoardSettled,
    {still: false, ms: Date.now() - startedAt, diff: +diff.toFixed(3), reads: reads,
     budgetMs: budget, stopped: !this.isRunning});
  return false;
}

/**
 * Should a chore carry on? False once the run is ending, or a level-cap sweep
 * asked for from the settings page is waiting: it goes before everything but a
 * round in progress, so a chore hands the loop back at its next step. The play
 * loop deliberately does not ask -- a round already started is the one thing
 * the sweep waits for.
 */
Tsum.prototype.mayContinue = function() {
  return this.isRunning && !this.yieldAsked;
}

Tsum.prototype.sleep = function(t) {
  if (typeof t !== 'number') {
    t = 1000;
  }
  let waitTime = t;
  while (this.isRunning && waitTime > 0) {
    if (waitTime <= 500) {
      sleep(waitTime);
      break;
    } else {
      sleep(500);
      waitTime -= 500;
    }
  }
}
