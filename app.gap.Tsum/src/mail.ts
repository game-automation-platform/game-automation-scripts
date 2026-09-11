// ---------------------------------------------------------------------------
// The mailbox: the gifts the game hands out, taken all at once or one at a time.
//
// `taskReceiveAllItems` presses Claim All. `taskReceiveOneItem` walks the list
// instead, which is what a player keeping their rubies -- or skipping the
// Mission Clear medals -- needs.
//
// The list only ever gives up the row a tap lands on, so Skip Medals is
// `readMailRows` plus `mailRowToOpen`: the rows are *found* on the frame -- each
// Check button is one unbroken run of gold down a column that misses the
// lettering -- and reported as the offset every `outReceive*` probe moves by to
// reach one, so a list that came to rest between rows still reads. A screenful
// of nothing but medals is scrolled past, and the list refusing to move is the
// end of the mail.
//
// Every heart taken here is counted into `ts.record`, which hearts.ts owns.
// ---------------------------------------------------------------------------

/** Budget for one panel of the receive-all choreography to arrive or leave. */
const ReceiveAllSettleMs = 3000;

Tsum.prototype.taskReceiveAllItems = function() {
  if (gPages.detect() === PageName.GamePause)
    return;
  logInfo(Log.Page.Friends);
  // The mailbox is a navigation destination rather than a tap-and-hope: the hop
  // that used to be `navigate(FriendPage)` + `tap(outReceive)` + `sleep(3500)`
  // is `nav.move.toMail` plus the MailBox plan, so arriving is confirmed by the
  // fingerprint instead of assumed from a sleep. The taps below this line are
  // still open-loop -- the receive-all confirmation and the results panel have
  // no corpus frames yet, so they have no entries to navigate to.
  gPages.navigate(PageName.MailBox);
  logInfo(Log.Gifts.ReceiveAll);
  // Open-loop taps, so each one has to be given the panel it is aimed at. These
  // were rests of 2500/2000/1500ms; as budgets they end when the panel does,
  // which is a different number of milliseconds on a device drawing at 60fps.
  this.tap(Button.outReceiveAll);
  this.settleScreen(ReceiveAllSettleMs);
  this.fetchAllMails();
  this.settleScreen(ReceiveAllSettleMs);
  this.tap(Button.outReceiveClose);
  this.settleScreen(ReceiveAllSettleMs);
  this.tap(Button.outClose);
  gPages.navigate(PageName.FriendPage);
  logInfo(Log.Gifts.AllReceived);
}

Tsum.prototype.fetchAllMails = function() {
  const intlOkButton = Button.outReceiveOk;
  const jpOkButton = Button.outReceiveAllOkJP;

  const img = this.screenshot();

  try {
    if (this.isOnScreenshot(img, intlOkButton, 35)) {
      this.tap(intlOkButton);
    } else if (this.isOnScreenshot(img, jpOkButton, 35)) {
      // check important previous buttons before pressing OK
      if (this.keepRuby && this.isOnScreenshot(img, Button.outReceiveAllRubiesEnabledJP)) {
        this.tap(Button.outReceiveAllRubiesEnabledJP);
        this.sleep(500);
      }
      if (this.isOnScreenshot(img, Button.outReceiveAllHeartsDisabledJP)) {
        this.tap(Button.outReceiveAllHeartsDisabledJP);
        this.sleep(500);
      }
      this.tap(jpOkButton);
    } else {
      logError(Log.Gifts.NoOkButton, 'No OK button found on the receive-all screen');
      this.exitUnknownPage();
    }
  } finally {
    releaseImage(img);
  }
}

Tsum.prototype.skipAd = function () {
  this.tap(Button.outReceiveOne);
  this.sleep(1000);
  // also gets called for skill and premium tickets, so check we really have an ad!!!
  if (gPages.matches(PageName.ReceiveSkillTicket) || gPages.matches(PageName.ReceivePremiumTicket)) {
    // mcs: I improved ad detection here because I don't get ad mails. So I cannot improve detection in list view
    logInfo(Log.Gifts.TicketReceived, 'Receive ticket');
    this.tap(Button.outReceiveOk);
  } else {
    logInfo(Log.Gifts.AdIgnored, 'Ignore ad');
    if (Config.debugLogs) {
      const img = this.screenshot();
      try {
        saveImage(img, this.storagePath + "/tmp/" + this.runTimes + "-detectedAd.jpg");
      } finally {
        releaseImage(img);
      }
    }
    this.sleep(4000);
    // delete ad
    this.tap({ x: 462, y: 1095});
    this.sleep(4000);
    this.tap({ x: 172, y: 1220});
    this.sleep(2000);
    this.tap({ x: 556, y: 1417});
  }
}

/** `mailRowToOpen`: nothing on screen that a tap could open. */
const MailNoRow = -100000;
/** `mailRowToOpen`: rows on screen, every one of them a medal. Scroll. */
const MailAllMedals = -200000;

Tsum.prototype.readMailRows = function(img) {
  const col = MailList.buttonColumn;
  const points: Coord[] = [];
  for (let y = col.fromY; y <= col.toY; y += col.step) {
    points.push({x: col.x, y: y});
  }
  const read = this.getColors(img, points);
  // Where the first row sits when the list is at home, so a row is reported as
  // the offset every `outReceive*` probe has to be moved by to reach it.
  const home = Button.outReceiveOne.y + MailList.buttonCentreDy;
  const rows: number[] = [];
  let from = -1;
  for (let i = 0; i <= points.length; i++) {
    if (i < points.length && isSameColor(Button.outReceiveOne.color, read[i], 35)) {
      if (from < 0) { from = points[i].y; }
      continue;
    }
    if (from < 0) { continue; }
    const to = points[i - 1].y;
    // A run against either end of the scan is a row the viewport cuts in half,
    // and its midpoint is not its button's centre -- so it is not a row here.
    const clipped = from <= points[0].y || to >= points[points.length - 1].y;
    if (!clipped && to - from >= MailList.minButtonRun) {
      rows.push((from + to) / 2 - home);
    }
    from = -1;
  }
  return rows;
}

Tsum.prototype.mailRowToOpen = function(img) {
  const rows = this.readMailRows(img);
  const wanted: number[] = [];
  const points: Coord[] = [];
  for (let i = 0; i < rows.length; i++) {
    // Drop the rows above the one "Skip first person" starts at. Half a pitch
    // of slack, because a found centre carries the scan's own step as error.
    if (rows[i] < -MailList.rowPitch / 2) { continue; }
    wanted.push(rows[i]);
    points.push({x: Button.outReceiveOneMedal.x,
                 y: Button.outReceiveOneMedal.y + rows[i]});
  }
  if (wanted.length === 0) {
    return MailNoRow;
  }
  const badges = this.getColors(img, points);
  for (let i = 0; i < wanted.length; i++) {
    if (!isSameColor(Button.outReceiveOneMedal.color, badges[i], 35)) {
      return wanted[i];
    }
    logDebug(Log.Gifts.ReceiveOneSkipMedal, {offset: wanted[i]});
  }
  return MailAllMedals;
}

Tsum.prototype.scrollMailList = function() {
  const moved = this.dragList(MailList.scroll.x, MailList.scroll.path,
    MailList.scroll.settleMs, MailList.sample);
  logDebug(Log.Gifts.MailScrolled,
    {moved: moved, needed: MailList.sample.minMoved});
  return moved >= MailList.sample.minMoved;
}

Tsum.prototype.taskReceiveOneItem = function() {
  if (gPages.detect() === PageName.GamePause)
    return;
  logInfo(Log.Page.Friends);
  gPages.navigate(PageName.FriendPage);
  this.sleep(1000)
  this.tap(Button.outReceive);
  logInfo(Log.Gifts.ReceiveOneByOne);
  this.sleep(1000);

  let receivedCount = 0;
  let receiveCheckLimit = 1;

  // A gift has been taken and its OK not yet counted. Cleared once the heart
  // is tallied, so an OK the loop sees twice cannot count twice.
  let pickedUp = false;
  let receiveTime = Date.now();
  let timeoutCounter = 0;
  const maxTimeoutCount = 100;
  let receivedHeartWithoutCoins = 0;
  // Skip Medals only. `mailScrolled` says the list is no longer at the position
  // the fixed probes were measured at, so from then on the rows have to be
  // found; `mailScrolls` is the budget for looking past a run of medals, and it
  // is refilled by every gift that does get taken.
  let mailScrolled = false;
  let mailScrolls = 0;
  while (this.isRunning && timeoutCounter < maxTimeoutCount) {
    if (this.yieldAsked) {
      // A level-cap sweep asked for from the settings page goes first. Close
      // the gift screen as the idle exit below does; the sweep navigates from
      // wherever that leaves the game.
      logInfo(Log.Unlock.NowYielded, { task: 'receiveOneItem' });
      this.tap(Button.outClose);
      break;
    }
    let img = this.screenshot();
    // Declared outside the try so the if-chain below (and the later
    // `isNonItem = true`) can read them after the screenshot is released.
    let isItem: boolean, isRuby: boolean, isNonItem: boolean, isAd: boolean,
        isOk: boolean, isOk2: boolean, isTimeout: boolean, isHeartWithoutCoins: boolean;
    // How far from the first mail row this turn works, in screen pixels. Only
    // Skip Medals ever moves it, and `MailNoRow` / `MailAllMedals` are the two
    // answers that are not an offset at all.
    let rowOffset = 0;
    try {
      // Six distinct points, one crossing. `outReceiveOne` is compared against
      // two different expected colours (an item vs. nothing), so it is sampled
      // once and tested twice rather than read twice.
      const p = this.getColors(img, [
        Button.outReceiveOne,
        Button.outReceiveOneRuby,
        Button.outReceiveOneAd,
        Button.outReceiveOk,
        Button.outReceiveItemSetOk,
        Button.outReceiveTimeout
      ]);
      isItem = isSameColor(Button.outReceiveOne.color, p[0], 35);
      isRuby = isSameColor(Button.outReceiveOneRuby.color, p[1], 35);
      isNonItem = isSameColor(Button.outReceiveOne.color2, p[0], 35);
      isAd = isSameColor(Button.outReceiveOneAd.color, p[2], 35);
      isOk = isSameColor(Button.outReceiveOk.color, p[3], 35);
      isOk2 = isSameColor(Button.outReceiveItemSetOk.color, p[4], 35);
      isTimeout = isSameColor(Button.outReceiveTimeout.color, p[5], 35);
      isHeartWithoutCoins = gPages.matches(PageName.ReceiveHeartWithoutCoins);
      // The scan may only run with the mail list in front of it: a gift dialog
      // has gold buttons of its own, and a row found on one would aim the tap
      // at it. `isItem` is that proof while the list is at home -- a dialog
      // never shows gold there -- and once scrolled it has to be asked for.
      if (this.skipMedals
          && (isItem || (mailScrolled && gPages.matches(PageName.MailBox)))) {
        rowOffset = this.mailRowToOpen(img);
        if (rowOffset === MailNoRow) {
          // Whatever the fixed probe read, there is no row under it to open.
          isItem = false;
        } else if (rowOffset !== MailAllMedals) {
          isItem = true;
          isNonItem = false;
          const row = this.getColors(img, [
            {x: Button.outReceiveOneRuby.x, y: Button.outReceiveOneRuby.y + rowOffset},
            {x: Button.outReceiveOneAd.x, y: Button.outReceiveOneAd.y + rowOffset}
          ]);
          isRuby = isSameColor(Button.outReceiveOneRuby.color, row[0], 35);
          isAd = isSameColor(Button.outReceiveOneAd.color, row[1], 35);
        }
      }
      logDebug(Log.Gifts.ReceiveOneProbe, {
        isItem: isItem, isRuby: isRuby, isNonItem: isNonItem, isAd: isAd, isOk: isOk,
        isTimeout: isTimeout, rowOffset: rowOffset, timeoutCounter: timeoutCounter,
      });
    } finally {
      releaseImage(img);
    }
    if (rowOffset === MailAllMedals) {
      // Skip Medals, and every row on screen is one -- but the hearts under
      // them are out of sight, not gone. Scroll on and look again; the list
      // refusing to move is what says the mail has actually run out.
      if (mailScrolls < MailList.maxScrolls && this.scrollMailList()) {
        mailScrolls++;
        mailScrolled = true;
        timeoutCounter = 0;
        receiveTime = Date.now();
        continue;
      }
      logInfo(Log.Gifts.ReceiveOneMedalsOnly,
        { receivedCount: receivedCount, scrolls: mailScrolls });
      this.tap(Button.outClose);
      gPages.navigate(PageName.FriendPage);
      break;
    }
    if (isItem) {
      if (isAd) {
        logDebug(Log.Gifts.ReceiveOneHandleAd);
        this.skipAd();
        this.sleep(2000);
        continue;
      }
      if (receivedHeartWithoutCoins > 2) {
        if (receivedCount <= 5 + receivedHeartWithoutCoins) {
          this.sleep(2000);
          logDebug(Log.Gifts.ReceiveOneReceiveAll, { receivedCount: receivedCount });
          this.taskReceiveAllItems();
          this.tap(Button.outReceive);
          this.sleep(1500);
        }
        logDebug(Log.Gifts.ReceiveOneClosing,
          { receivedHeartWithoutCoins: receivedHeartWithoutCoins });
        this.tap(Button.outClose);
        receivedHeartWithoutCoins = 0;
        this.tap(Button.outClose);
        gPages.navigate(PageName.FriendPage);
        this.sleep(500);
        receivedCount = 0;
        pickedUp = true;
        timeoutCounter = 0;
        logInfo(Log.Gifts.CheckUnreceived, { reason: 'heartsWithoutCoins' });
        this.sleep(500);
        this.tap(Button.outReceive);
        this.sleep(1500);
      } else if (!this.keepRuby || !isRuby) {
        pickedUp = true;
        this.tap({x: Button.outReceiveOne.x, y: Button.outReceiveOne.y + rowOffset});
        this.sleep(200);
        timeoutCounter = 0;
      } else {
        isNonItem = true;
        receiveTime = 0;
      }
    } else if (isTimeout) {
      logDebug(Log.Gifts.ReceiveOneTimeout);
      logInfo(Log.Gifts.ReceiveAgain);
      this.tap(Button.outReceiveOk);
      this.sleep(1000);
      timeoutCounter = 0;
    } else if (isOk || isOk2) {
      this.sleep(100);
      if (isOk) {
        logDebug(Log.Gifts.ReceiveOneOk, { button: 'outReceiveOk' })
        this.tap(Button.outReceiveOk);
      } else {
        logDebug(Log.Gifts.ReceiveOneOk, { button: 'outReceiveItemSetOk' })
        this.tap(Button.outReceiveItemSetOk);
      }
      if (pickedUp) {
        this.record[RecordKey.HeartsCount]!.receivedCount++;
        receivedCount++;
        // The scroll budget is per run of medals, not per pass: a mailbox that
        // alternates medals and hearts is making progress every time one lands.
        mailScrolls = 0;
        this.saveRecord();
      }
      pickedUp = false;
      timeoutCounter = 0;
      if (this.claimAllWithoutCoins &&  isHeartWithoutCoins)
        receivedHeartWithoutCoins++;
    } else {
      logDebug(Log.Gifts.ReceiveOneFetchedAllSoFar);
      this.tap(Button.outReceiveClose); // usual close button
    }
    this.sleep(200);

    if (!isNonItem) {
      receiveTime = Date.now();
    }

    if (Date.now() - receiveTime > 3000) {
      logDebug(Log.Gifts.ReceiveOneIdle, { idleMs: Date.now() - receiveTime });
      this.tap(Button.outClose);
      gPages.navigate(PageName.FriendPage);
      this.sleep(500);
      if (receivedCount === 0 || receiveCheckLimit >= this.receiveCheckLimit) {
        logInfo(Log.Gifts.Completed, {
          receivedCount: receivedCount,
          checks: receiveCheckLimit,
          checkLimit: this.receiveCheckLimit,
        });
        break;
      } else {
        receiveCheckLimit++;
        receivedCount = 0;
        pickedUp = true;
        timeoutCounter = 0;
        logInfo(Log.Gifts.CheckUnreceived, { reason: 'nextCheckCycle', checks: receiveCheckLimit });
        this.sleep(500);
        this.tap(Button.outReceive);
        this.sleep(1500);
      }
    }
    timeoutCounter++;
    if (timeoutCounter % 10 === 0) {
      logInfo(Log.Gifts.ReceiveOneWaiting, 'Still waiting on the gift screen',
        { timeoutCounter: timeoutCounter, maxTimeoutCount: maxTimeoutCount });
    }
  }
  if (maxTimeoutCount <= timeoutCounter) {
    // we seem to be trapped, try to exit the trap
    logWarn(Log.Gifts.ReceiveOneStuck, 'Stuck on the gift screen; trying to exit',
      { timeoutCounter: timeoutCounter, maxTimeoutCount: maxTimeoutCount });
    this.exitUnknownPage();
    this.sleep(1000);
    if (gPages.detect() === PageName.Unknown) {
      // last attempt
      logWarn(Log.Gifts.ReceiveOneStuckRetry, 'Still stuck; last attempt to exit');
      this.exitUnknownPage();
      this.sleep(1000);
    }
  }
}
