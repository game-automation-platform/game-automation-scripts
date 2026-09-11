// ---------------------------------------------------------------------------
// Sending hearts.
//
// The flow the game draws, and nothing else:
//
//   FriendPage   tap a pink heart in the right-hand column
//   GiftHeart    OK
//   HeartSent    the "Heart sent!" toast. It waits for a tap rather than
//                clearing itself, and the friend list is still underneath, so
//                one tap both acknowledges the send and puts us back on the list
//
// A row that has had its heart turns dark blue, so the column scan is its own
// progress check: send, rescan, repeat until the screenful has none left, then
// scroll and repeat until a drag stops changing anything. Then Home and back --
// which reopens the ranking at our own row -- and the same sweep upwards.
//
// This replaced an earlier loop that tracked four fixed row positions and read
// four hand-measured pixels to decide it had reached the end of the list. The
// end is now the point where the list will not move, and the rows are wherever
// the pink is.
//
// The running total lives at the bottom of this file: `readRecord` /
// `saveRecord` are `tsum_record/record.txt`, which counts hearts sent from here
// and hearts received in mail.ts.
// ---------------------------------------------------------------------------

/** How long `sendOneHeart` waits for the gift dialog the heart tap opens. */
const HeartDialogPolls = 8;
/** How long it then waits for the toast that confirms the send. */
const HeartToastPolls = 12;
/** Column runs this close together are the same row read twice. */
const HeartRowTolerance = 60;
/** Hearts one screenful can yield before something is wrong. Four rows fit. */
const HeartPageMaxSends = 8;
/**
 * Budget for one step of the send to finish animating: the gift dialog opening,
 * the toast arriving, the toast going. A `settleScreen` budget rather than a
 * rest, so it ends when the animation does rather than when a stopwatch held
 * against one device says it should have -- these were 600/600/400ms.
 */
const HeartStepSettleMs = 1500;
/**
 * OK presses one send may make.
 *
 * A tap the game never saw leaves the gift dialog exactly where it was, and the
 * toast wait then spends its whole budget watching it -- four seconds, and the
 * heart lost. Pressing again costs a few polls; not pressing costs the heart.
 * Measured at ~1% of taps, and the host's own `TAP_HOLD_MS` is the cause, so
 * this is the belt to that fix's braces rather than a replacement for it.
 */
const HeartOkPresses = 3;
/**
 * Polls the gift dialog is given to close before the press counts as lost.
 *
 * A press that landed has closed it well before the first of these -- the
 * `settleScreen` above already waited out the closing animation -- so this is
 * slack for a slow device, not for the dialog's own frames.
 */
const HeartOkLostPolls = 3;
/** Rest between a scroll and the scan that follows it. */
const HeartScrollRestMs = 400;
/**
 * Screenfuls one direction may travel. A backstop, not a limit: a ranking runs
 * to a few hundred friends and a screenful is four of them, so this only fires
 * if something keeps reading as movement when the list is not moving.
 */
const HeartSweepMaxScreenfuls = 300;

/**
 * Reopen the ranking, which puts our own row back in view.
 *
 * Home and back rather than a scroll: the list is rebuilt, so this is the one
 * position the sweep can start from without knowing how far it has travelled.
 */
Tsum.prototype.friendPageGoToSelf = function() {
  logDebug(Log.Hearts.GoToSelfStart);
  gPages.navigate(PageName.ProfilePage);
  gPages.navigate(PageName.FriendPage);
  // Upstream's, and still wanted: on an emulator the pointer parks where it
  // last tapped, and the score row below is read by colour.
  tap(0, 0, 20);
  this.sleep(1000);
  logDebug(Log.Hearts.GoToSelfDone);
}

Tsum.prototype.readHeartColumn = function(img) {
  const points: Point[] = [];
  for (let y = HeartColumn.fromY; y <= HeartColumn.toY; y += HeartColumn.step) {
    points.push({x: HeartColumn.x, y: y});
  }
  const scan = this.getColors(img, points);

  const hearts: Point[] = [];
  let start = -1;
  // One past the end, so a run reaching the bottom of the viewport is closed.
  for (let i = 0; i <= scan.length; i++) {
    const pink = i < scan.length
        && isSameColor(HeartColumn.color, scan[i], HeartColumn.threshold);
    if (pink) {
      if (start < 0) {
        start = i;
      }
      continue;
    }
    if (start >= 0) {
      const top = points[start].y;
      const bottom = points[i - 1].y;
      if (bottom - top + HeartColumn.step >= HeartColumn.minRun) {
        hearts.push({x: HeartColumn.x, y: Math.floor((top + bottom) / 2)});
      }
      start = -1;
    }
  }
  return hearts;
}

Tsum.prototype.friendRowScoreIsZero = function(img, heart) {
  const y = heart.y + HeartColumn.scoreOffsetY;
  const points: Point[] = [];
  for (let x = Button.outFriendScoreFrom.x; x <= Button.outFriendScoreTo.x; x += 20) {
    points.push({x: x, y: y});
  }
  const row = this.getColors(img, points);
  // A zero score is one narrow digit, so this band is empty panel all the way
  // across; any real score puts a glyph somewhere in it.
  for (let i = 0; i < row.length; i++) {
    if (!isSameColor(Button.outFriendScoreFrom.color!, row[i], 40)) {
      return false;
    }
  }
  return true;
}

/**
 * Poll the narrowed page set until `want` shows up, and say where it stopped.
 *
 * `abortOn` ends the wait early on a screen whose presence makes waiting
 * pointless -- the gift dialog still up after OK -- but only from
 * `HeartOkLostPolls` on. The page it ends on is the answer, so a caller can
 * tell "the screen never moved" from "it moved and the one I wanted never came".
 */
Tsum.prototype.waitForHeartPage = function(want, polls, abortOn) {
  let page = PageName.Unknown;
  for (let i = 0; i < polls && this.isRunning; i++) {
    page = gPages.detect(1, 300, heartSweepPages());
    if (page === want) {
      return page;
    }
    if (abortOn !== undefined && page === abortOn && i >= HeartOkLostPolls) {
      return page;
    }
    if (page === PageName.FriendInfo) {
      // The tap opened the friend's card instead of the gift dialog.
      this.tap(Page.FriendInfo.back);
    } else if (page === PageName.Received) {
      this.tap(Page.Received.back);
    }
    this.sleep(250);
  }
  return page;
}

Tsum.prototype.sendOneHeart = function(heart) {
  this.tap(heart);
  // Each of the three waits here is a dialog arriving or leaving, and each was a
  // fixed rest measured at one frame rate. Waiting for the animation itself is
  // what keeps the tap that follows from landing inside it.
  this.settleScreen(HeartStepSettleMs);

  if (this.waitForHeartPage(PageName.GiftHeart, HeartDialogPolls) !== PageName.GiftHeart) {
    logDebug(Log.Hearts.SendStep, {step: 'noGiftDialog', y: heart.y});
    return false;
  }

  let page = PageName.Unknown;
  for (let press = 1; press <= HeartOkPresses; press++) {
    this.tap(Page.GiftHeart.next);  // OK
    this.settleScreen(HeartStepSettleMs);
    page = this.waitForHeartPage(
      PageName.HeartSent, HeartToastPolls, PageName.GiftHeart);
    // Only the dialog still being up is worth another press. A wait that ran
    // out anywhere else means the press landed and it is the toast that went
    // missing -- and OK's coordinate on the friend list below is a friend's row.
    if (page !== PageName.GiftHeart) {
      break;
    }
    logDebug(Log.Hearts.SendStep, {step: 'okLost', y: heart.y, press: press});
  }

  if (page !== PageName.HeartSent) {
    // The heart may well have gone out; without the toast nothing says so, and
    // counting it would be counting a guess.
    logWarn(Log.Hearts.NoToast, 'Pressed OK but never saw the confirmation',
      {y: heart.y, stoppedOn: page});
    return false;
  }
  this.tap(Page.HeartSent.back);
  this.settleScreen(HeartStepSettleMs);
  return true;
}

/** Whether this run is one the sender has already tried and failed to send. */
function heartRefused(refused: number[], heart: Point): boolean {
  for (let i = 0; i < refused.length; i++) {
    if (Math.abs(refused[i] - heart.y) < HeartRowTolerance) {
      return true;
    }
  }
  return false;
}

Tsum.prototype.sendHeartsOnPage = function(stopAtZeroScore) {
  const result: HeartPageResult = {sent: 0, zeroScore: false};
  // Rows that would not send. Without them a stuck button is found by every
  // rescan and the loop never ends.
  const refused: number[] = [];

  // `mayContinue`: a level-cap sweep asked for from the settings page takes the
  // screen at the next heart rather than the next screenful.
  while (this.mayContinue() && result.sent < HeartPageMaxSends) {
    const img = this.screenshot();
    let hearts: Point[];
    let zero = false;
    try {
      hearts = this.readHeartColumn(img);
      if (stopAtZeroScore && hearts.length !== 0) {
        zero = this.friendRowScoreIsZero(img, hearts[0]);
      }
    } finally {
      releaseImage(img);
    }
    if (zero) {
      result.zeroScore = true;
      return result;
    }

    let next: Point | null = null;
    for (let i = 0; i < hearts.length; i++) {
      if (!heartRefused(refused, hearts[i])) {
        next = hearts[i];
        break;
      }
    }
    if (next === null) {
      return result;
    }

    logDebug(Log.Hearts.SendAttempt, {y: next.y, onPage: hearts.length});
    if (this.sendOneHeart(next)) {
      result.sent++;
      this.record[RecordKey.HeartsCount]!.sentCount++;
    } else {
      refused.push(next.y);
      // Whatever the failed send left up, the next scan has to read the list.
      gPages.navigate(PageName.FriendPage);
    }
  }
  return result;
}

Tsum.prototype.scrollFriendList = function(down) {
  const moved = this.dragList(HeartScrollPath.x,
    down ? HeartScrollPath.down : HeartScrollPath.up,
    HeartScrollPath.settleMs, FriendListSample);
  logDebug(Log.Hearts.Scrolled,
    {down: down, moved: moved, needed: FriendListSample.minMoved});
  return moved >= FriendListSample.minMoved;
}

Tsum.prototype.outOfHeartTime = function(startTime) {
  if (this.sendHeartMaxDuring === 0) {
    return false;
  }
  const elapsed = Date.now() - startTime;
  if (elapsed <= this.sendHeartMaxDuring) {
    return false;
  }
  logInfo(Log.Hearts.TimeUp, {elapsedMs: elapsed, budgetMs: this.sendHeartMaxDuring});
  return true;
}

Tsum.prototype.sweepHearts = function(down, startTime) {
  let screenfuls = 0;
  while (this.isRunning) {
    if (gPages.detect(1, 500, heartSweepPages()) !== PageName.FriendPage) {
      gPages.navigate(PageName.FriendPage);
      if (!this.isRunning) {
        return false;
      }
    }

    // The zero-score stop is for the downward half only: everything above us in
    // the ranking outscores us by definition.
    const page = this.sendHeartsOnPage(down && !this.sentToZero);
    screenfuls++;
    if (page.sent !== 0) {
      logInfo(Log.Hearts.Screenful, {down: down, sent: page.sent, screenfuls: screenfuls});
      this.saveRecord();
    } else {
      logDebug(Log.Hearts.Screenful, {down: down, sent: 0, screenfuls: screenfuls});
    }
    if (page.zeroScore) {
      logInfo(Log.Hearts.ZeroScore, {screenfuls: screenfuls});
      return true;
    }
    if (this.yieldAsked) {
      // Unfinished, like running out of time: the next run carries on from
      // here, since `sendHeartsDownwards` survives between runs.
      logInfo(Log.Unlock.NowYielded, {task: 'sendHearts', screenfuls: screenfuls});
      return false;
    }
    if (this.outOfHeartTime(startTime)) {
      return false;
    }
    if (!this.scrollFriendList(down)) {
      logInfo(Log.Hearts.ListEnd, {down: down, screenfuls: screenfuls});
      return true;
    }
    if (screenfuls >= HeartSweepMaxScreenfuls) {
      logWarn(Log.Hearts.SweepTooLong, 'The list keeps moving; ending this half anyway',
        {down: down, screenfuls: screenfuls});
      return true;
    }
    this.sleep(HeartScrollRestMs);
  }
  return false;
}

Tsum.prototype.taskSendHearts = function() {
  if (gPages.detect() === PageName.GamePause) {
    return;
  }
  logInfo(Log.Page.Friends);
  gPages.navigate(PageName.FriendPage);
  logInfo(Log.Hearts.SendStart);

  const startTime = Date.now();
  // With no budget every run is a whole sweep, so it starts from our own row
  // rather than wherever the last one left the list -- which is what the
  // setting's "0 starts from the first place every time" means. With a budget
  // the list is left where the time ran out and the next run carries on from
  // there, so `sendHeartsDownwards` has to survive between runs.
  if (this.sendHeartMaxDuring === 0) {
    this.sendHeartsDownwards = true;
    this.friendPageGoToSelf();
  }

  while (this.isRunning) {
    if (!this.sweepHearts(this.sendHeartsDownwards, startTime)) {
      logDebug(Log.Hearts.SendTaskUnfinished, {downwards: this.sendHeartsDownwards});
      return;
    }
    if (!this.sendHeartsDownwards) {
      // Both halves done; the next run starts downwards again.
      this.sendHeartsDownwards = true;
      break;
    }
    // The turn is the one step of the sweep with no yield point in it: the
    // upward half must start from our own row, and reopening the ranking is two
    // navigations. `sweepHearts` hands back at the next screenful but returns
    // *true* at the end of a half, so a sweep queued from the settings page used
    // to wait out the whole round trip. Handing back before the flip costs the
    // next run one screenful at the list's end and nothing else -- the anchor
    // still happens, on the other side of the wait.
    if (!this.mayContinue()) {
      logInfo(Log.Unlock.NowYielded, {task: 'sendHearts', at: 'halfTurn'});
      return;
    }
    this.sendHeartsDownwards = false;
    this.friendPageGoToSelf();
  }
  logInfo(Log.Hearts.SendDone);
}

// `tsum_record/record.txt` holds one thing: how many hearts this account has
// received and sent. Read once by `buildRun` and rewritten by `saveRecord`
// after every heart that lands, so the running total in the hearts log lines
// survives a restart instead of starting from zero every run.
Tsum.prototype.readRecord = function() {
  logInfo(Log.Hearts.ReadRecords);
  const recordFile = this.storagePath + '/' + Config.recordDir + '/record.txt';
  const txt = readFile(recordFile);
  if (txt !== undefined && txt !== "") {
    this.record = JSON.parse(txt);
  }
}

Tsum.prototype.saveRecord = function() {
  logInfo(Log.Hearts.SaveRecords);
  const recordFile = this.storagePath + '/' + Config.recordDir + '/record.txt';
  writeFile(recordFile, JSON.stringify(this.record));
}
