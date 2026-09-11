// ===========================================================================
// Box Buying -- buying boxes in the Tsum Tsum Store.
//
// Navigate to the store, open the box the settings name, press its 1-Time or
// 10-Time purchase, confirm, tap through the reveals, and go round again. It
// ends on the game's own two signals -- the purchase buttons turning blue
// ("Sold Out"), or "Not enough Coins!" -- and on its own purchase limit, which
// is there because neither of those is something a chore that spends the
// player's coins may rely on arriving (DRIVING_SCREENS.md § 8).
//
// **Rubies are never spent.** The "Not enough Coins!" dialog offers to trade
// them, and this sweep presses Cancel and stops. So does `dismiss.notEnoughCoins`
// (pageHandlers.ts) wherever else the dialog turns up, and the `Page` entry
// points both its anchors at Cancel so no generic mover can press the other
// button either.
//
// The screen geometry -- the tab row, the buttons, where a reveal is tapped --
// is `BoxStore` in data.ts, with what was measured and why.
//
// `awaitPage` is borrowed from levelCap.ts, which is what its `event` parameter
// is for: a timeout here is filed as `Log.Box.PageMissed` rather than under the
// sweep the wait was written for.
// ===========================================================================

/** Purchases in one sweep when the setting is missing or nonsense. */
const BuyBoxDefaultMax = 10;
/** Hard ceiling on one sweep, whatever the setting says. Each purchase costs coins. */
const BuyBoxMaxPurchases = 50;
/** Failed purchases in a row before the sweep gives up rather than retrying. */
const BuyBoxMaxMisses = 3;
/** How long each purchase's counter holds the banner, as the other chores' notices do. */
const BuyBoxBannerMs = 4000;
/** How long the purchase confirmation gets to open after the button that asks for it. */
const BuyBoxDialogWaitMs = 6000;
/** How long the store gets to come back after a purchase, reveals and all. */
const BuyBoxRevealWaitMs = 90 * 1000;
/** How long the store gets to redraw when the sweep has to re-ground itself. */
const BuyBoxReturnWaitMs = 10 * 1000;
/**
 * How long the store's contents get to arrive after its frame is up.
 *
 * Not a `settleScreen` budget: the store is *still* while it loads, so there is
 * nothing for a settle to watch. This is the ceiling on reading for the content
 * itself instead (`awaitBoxTabs`), measured at ~1.5s on the reference device.
 */
const BuyBoxLoadWaitMs = 8000;
/** Between two looks while the store is still loading. */
const BuyBoxLoadPollMs = 250;
/** Captures per look inside the reveal loop, and their budget. One is enough to name a screen. */
const BuyBoxPeekMs = 500;
/**
 * Taps at `BoxStore.revealAdvance` between two looks.
 *
 * The reveals are the one part of this flow with nothing to read: ten cards that
 * each want a tap, and a capture between every one would cost more than the
 * taps do. Bursting is § 7's rule -- the capture is the expensive half -- and it
 * is safe here for § 4's reason: every screen the loop can be on without having
 * recognised it has dead space at that point.
 */
const BuyBoxRevealBurst = 4;
/** Rest between two taps of a burst, so the game registers them as separate taps. */
const BuyBoxRevealTapMs = 220;
// The four gates below are budgets for `settleScreen`, not durations: each ends
// as soon as the screen it names holds still. Sized generously, because a budget
// costs nothing on a device that does not need it (DRIVING_SCREENS.md § 5).
/** The store redrawing after a tab tap. */
const BuyBoxTabSettleMs = 2000;
/** The purchase confirmation arriving, or leaving after OK. */
const BuyBoxDialogSettleMs = 2000;
/** A reveal card finishing whatever the last burst started. */
const BuyBoxRevealSettleMs = 2500;
/** A panel closing back onto the store. */
const BuyBoxPanelSettleMs = 2500;

/** What ended the run of reveals a purchase started. */
const enum BoxReveals {
  /** The store is back: everything the purchase opened has been dismissed. */
  Done = 'done',
  /** "Not enough Coins!" -- cancelled, and the sweep is over. */
  NoCoins = 'noCoins',
  /** The budget ran out with something else on screen, or the run is stopping. */
  Stuck = 'stuck',
}

/**
 * The box tab row in one reading: how wide it is drawn, and which tab is open.
 *
 * Width comes off the two ends of the row, which the panel behind it shows
 * through only in the three-box layout. Both ends have to agree -- one on its
 * own would make a glyph or a badge drawn near an edge into a different layout,
 * and picking the wrong layout means tapping the wrong box.
 *
 * Null is "the row is not drawn yet", which is not the same answer as three
 * boxes and is why the selected tab is read here rather than separately: a
 * loading store reads the panel at both ends exactly as a three-box row does,
 * and only the gold tells them apart (`BoxStore`, src/data.ts). One capture
 * either way.
 */
Tsum.prototype.readBoxTabs = function() {
  const img = this.screenshot();
  let panelEnds = 0;
  let gold = 0;
  let selected = -1;
  let tabs: number;
  try {
    const ends = this.getColors(img, BoxStore.rowEnds);
    for (let i = 0; i < ends.length; i++) {
      if (isSameColor(BoxStore.panelColor, ends[i], BoxStore.tabDiff)) {
        panelEnds++;
      }
    }
    const centres = panelEnds === BoxStore.rowEnds.length ? BoxStore.tabX3 : BoxStore.tabX4;
    tabs = centres.length;
    const points: Coord[] = [];
    for (let i = 0; i < centres.length; i++) {
      points.push({x: centres[i], y: BoxStore.tabY});
    }
    const read = this.getColors(img, points);
    for (let i = 0; i < read.length; i++) {
      if (isSameColor(BoxStore.tabSelectedColor, read[i], BoxStore.tabDiff)) {
        gold++;
        selected = i;
      }
    }
  } finally {
    releaseImage(img);
  }
  logDebug(Log.Box.TabRead,
    {tabs: tabs, panelEnds: panelEnds, selected: selected, gold: gold});
  // Two gold tabs is a frame caught mid-repaint, and is no more a reading than
  // none is.
  return gold === 1 ? {tabs: tabs, selected: selected} : null;
}

/**
 * The tab row, once it is there.
 *
 * `settleScreen` cannot stand in for this: the store holds perfectly still while
 * its contents load, so the gate every other step uses passes at once on a
 * screen with no row on it (DRIVING_SCREENS.md § 5). Reading for the row itself
 * is the only wait that sees it.
 */
Tsum.prototype.awaitBoxTabs = function(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const row = this.readBoxTabs();
    if (row !== null) {
      return row;
    }
    if (!this.isRunning || Date.now() >= deadline) {
      return null;
    }
    this.sleep(BuyBoxLoadPollMs);
  }
}

/**
 * Put the store on `box`, and say whether it is there.
 *
 * Null means the store is not selling that box today, which is not a fault --
 * the limited-time slot is empty most of the time -- and ends the sweep quietly.
 *
 * The tab is confirmed by reading it back rather than by waiting: a tap that
 * lands while the panel above is still redrawing is swallowed by the animation
 * (DRIVING_SCREENS.md § 4), and on a screen being stayed on there is no
 * destination page to wait for instead. Tapping an already-selected tab is
 * skipped, which is the usual case between two purchases.
 */
Tsum.prototype.openBoxTab = function(box) {
  const row = this.awaitBoxTabs(BuyBoxLoadWaitMs);
  if (row === null) {
    logWarn(Log.Box.StoreLoading, 'The store did not finish loading', {box: box});
    return null;
  }
  const tabs = row.tabs;
  const order = tabs === 3 ? BoxStore.order3 : BoxStore.order4;
  let index = -1;
  for (let i = 0; i < order.length; i++) {
    if (order[i] === box) {
      index = i;
    }
  }
  if (index < 0) {
    logInfo(Log.Box.NotOffered, {box: box, tabs: tabs});
    return null;
  }
  if (row.selected === index) {
    return tabs;
  }

  const centres = tabs === 3 ? BoxStore.tabX3 : BoxStore.tabX4;
  for (let attempt = 0; attempt < BuyBoxMaxMisses && this.isRunning; attempt++) {
    this.tap({x: centres[index], y: BoxStore.tabTapY});
    this.settleScreen(BuyBoxTabSettleMs);
    const after = this.readBoxTabs();
    if (after !== null && after.selected === index) {
      logDebug(Log.Box.TabPicked, {box: box, tab: index, tabs: tabs});
      return tabs;
    }
  }
  logWarn(Log.Box.TabNotTaken, 'The store would not select that box',
    {box: box, tab: index, tabs: tabs});
  return null;
}

/**
 * Classify one purchase-button position: is a button drawn there, and can it be
 * pressed?
 *
 * Four samples across the flat band at the top of the button, and a majority
 * decides -- one point would be a coin flip on a frame caught mid-fade. Three
 * answers rather than two, because "no button here" is what tells the centred
 * single-button layout from the pair.
 */
Tsum.prototype.readBoxButtonAt = function(img, x) {
  const points: Coord[] = [];
  for (let i = 0; i < BoxStore.probeDx.length; i++) {
    points.push({x: x + BoxStore.probeDx[i], y: BoxStore.probeY});
  }
  const read = this.getColors(img, points);
  let available = 0;
  let soldOut = 0;
  for (let i = 0; i < read.length; i++) {
    if (isSameColor(BoxStore.availableColor, read[i], BoxStore.buttonDiff)) {
      available++;
    } else if (isSameColor(BoxStore.soldOutColor, read[i], BoxStore.buttonDiff)) {
      soldOut++;
    }
  }
  if (available >= BoxStore.buttonVotes) {
    return 'available';
  }
  return soldOut >= BoxStore.buttonVotes ? 'soldOut' : 'none';
}

/**
 * What the open box offers: where to tap for each purchase size, and whether
 * anything is sold out.
 *
 * All three positions are read because the layout is not fixed -- a box with
 * both sizes draws them side by side, one with only a 1-Time purchase draws it
 * centred over the gap between them. Which positions hold a button is what says
 * which layout was drawn, so nothing has to know in advance which box this is.
 */
Tsum.prototype.readBoxPurchase = function() {
  const img = this.screenshot();
  let pair, single;
  let one, ten;
  try {
    one = this.readBoxButtonAt(img, BoxStore.oneTimeX);
    ten = this.readBoxButtonAt(img, BoxStore.tenTimeX);
    single = this.readBoxButtonAt(img, BoxStore.onlyOneX);
  } finally {
    releaseImage(img);
  }
  pair = one !== 'none' || ten !== 'none';

  const offer: BoxPurchaseOffer = {
    oneTime: null,
    tenTime: null,
    soldOut: one === 'soldOut' || ten === 'soldOut' || single === 'soldOut'
  };
  if (single === 'available' && !pair) {
    offer.oneTime = {x: BoxStore.onlyOneX, y: BoxStore.tapY};
  } else {
    if (one === 'available') {
      offer.oneTime = {x: BoxStore.oneTimeX, y: BoxStore.tapY};
    }
    if (ten === 'available') {
      offer.tenTime = {x: BoxStore.tenTimeX, y: BoxStore.tapY};
    }
  }
  logDebug(Log.Box.ButtonsRead,
    {oneTime: one, tenTime: ten, single: single, soldOut: offer.soldOut});
  return offer;
}

/**
 * The purchase buttons, once they are there.
 *
 * Nothing at any of the three positions is the panel still loading rather than a
 * box with nothing to sell -- a box whose stock has gone keeps its buttons and
 * turns them blue -- so it is waited out for the reason the tab row is, instead
 * of being counted as a failed purchase. Returns the last reading either way, so
 * a store that never finishes is still described by what was on it.
 */
Tsum.prototype.awaitBoxPurchase = function(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const offer = this.readBoxPurchase();
    const drawn = offer.oneTime !== null || offer.tenTime !== null || offer.soldOut;
    if (drawn || !this.isRunning || Date.now() >= deadline) {
      return offer;
    }
    this.sleep(BuyBoxLoadPollMs);
  }
}

/**
 * Tap through everything one purchase put on screen, and stop when the store is
 * back.
 *
 * A 1-Time purchase opens the box, reveals one tsum and ends on that card's
 * Close; a 10-Time one shows ten reveals and then the tally, which has its own
 * Close. Both are dismissed here, and so is "Not enough Coins!" -- which is what
 * OK raises when the price could not be paid, and which ends the whole sweep.
 *
 * One `peek` a pass rather than a `matches` per page: it is one capture against
 * four, it must not broadcast (a `dismiss` handler acting here would be tapping
 * the same screen from two places), and the four screens worth telling apart are
 * all in the table. The destination is checked before anything is tapped, so no
 * tap is ever spent on the store (DRIVING_SCREENS.md § 4).
 */
Tsum.prototype.clearBoxReveals = function(deadline) {
  let taps = 0;
  let closes = 0;
  while (this.isRunning && Date.now() < deadline) {
    const seen = gPages.peek(1, BuyBoxPeekMs);
    const name = seen === null ? PageName.Unknown : seen.name;

    if (name === PageName.NotEnoughCoins) {
      // Cancel, always. The other button spends rubies.
      this.tap(Page.NotEnoughCoins.back);
      this.settleScreen(BuyBoxPanelSettleMs);
      return BoxReveals.NoCoins;
    }
    if (name === PageName.TsumTsumStorePage) {
      return BoxReveals.Done;
    }
    if (name === PageName.BoxPurchaseResult || name === PageName.BoxPurchasedPage) {
      this.tap(seen!.back);
      this.settleScreen(BuyBoxPanelSettleMs);
      closes++;
      continue;
    }

    for (let i = 0; i < BuyBoxRevealBurst && this.isRunning; i++) {
      this.tap(BoxStore.revealAdvance);
      this.sleep(BuyBoxRevealTapMs);
      taps++;
    }
    this.settleScreen(BuyBoxRevealSettleMs);
  }

  if (!this.isRunning) {
    return BoxReveals.Stuck;
  }
  // Say what was there instead. `peek` again rather than reusing the last
  // reading: several taps have gone out since, and the diagnostic must describe
  // the screen it is giving up on (DRIVING_SCREENS.md § 9).
  const stuck = gPages.peek(1, BuyBoxPeekMs);
  logWarn(Log.Box.RevealsStuck, 'The boxes would not finish opening',
    {saw: stuck === null ? 'nothing' : stuck.name, taps: taps, closes: closes});
  gPages.navigate(PageName.TsumTsumStorePage);
  return BoxReveals.Stuck;
}

/**
 * Buy one box, and say how it went.
 *
 * The button is read rather than assumed, because reading it is also the
 * sold-out check: the game leaves the button where it is and turns it blue, so
 * "nothing to press" and "no stock left" are the same reading. A 10-Time
 * purchase falls back to the 1-Time button when the box only draws one -- never
 * the other way round, so a player who asked for single boxes can never be
 * charged for ten.
 *
 * `purchase` and `limit` are this purchase's place in the sweep. They are log
 * fields and nothing else -- the loop is what counts and what stops.
 */
Tsum.prototype.buyOneBox = function(tenTimes, purchase, limit) {
  const offer = this.awaitBoxPurchase(BuyBoxLoadWaitMs);
  if (offer.oneTime === null && offer.tenTime === null) {
    if (offer.soldOut) {
      logInfo(Log.Box.SoldOut);
      return 'soldOut';
    }
    logWarn(Log.Box.NotOffered, 'The open box has no purchase button');
    return 'unavailable';
  }
  const wanted = tenTimes && offer.tenTime !== null ? offer.tenTime : offer.oneTime;
  if (wanted === null) {
    // Single boxes were asked for, the 1-Time button has sold out, and the
    // 10-Time one has not. Buying ten instead is the fallback this flow does not
    // have -- it only ever goes the other way.
    logInfo(Log.Box.SoldOut, {wanted: 1});
    return 'soldOut';
  }
  const size = wanted === offer.tenTime ? 10 : 1;

  logInfo(Log.Box.Buying, {boxes: size});
  this.tap(wanted);
  if (!this.awaitPage(PageName.ConfirmPurchasePage, BuyBoxDialogWaitMs, Log.Box.PageMissed)) {
    logWarn(Log.Box.DialogMissing, 'The purchase confirmation did not open', {boxes: size});
    return 'missed';
  }

  // The confirmation's own OK, off the entry that matched, rather than a
  // coordinate of this flow's own: the box and capsule dialogs put their buttons
  // 400px apart, and the one in front of us is the one that knows which it is.
  const dialog = gPages.peek(1, BuyBoxPeekMs);
  this.tap(dialog !== null && dialog.name === PageName.ConfirmPurchasePage
    ? dialog.next : Page.ConfirmPurchaseBoxPage.next);
  this.settleScreen(BuyBoxDialogSettleMs);

  const outcome = this.clearBoxReveals(Date.now() + BuyBoxRevealWaitMs);
  if (outcome === BoxReveals.NoCoins) {
    logInfo(Log.Box.NoCoins, {boxes: size});
    return 'noCoins';
  }
  // `purchase` / `limit` are the sweep counter in the file: the banner is what
  // shows it live, and nothing on the phone is there to read afterwards.
  logInfo(Log.Box.Bought,
    {purchase: purchase, limit: limit, boxes: size, cleared: outcome === BoxReveals.Done});
  // OK is where the coins go, so a purchase whose reveals would not finish is
  // still a purchase and still counts against the limit. It is *also* a miss:
  // the sweep has to be able to stop on a screen it cannot get off, rather than
  // spending the whole budget re-pressing OK behind it.
  return outcome === BoxReveals.Done ? 'bought' : 'stuck';
}

/**
 * Buy boxes until the store, the player's purse or the purchase limit says stop.
 *
 * Returns the fields for `Log.Box.End` -- how many were bought and why it
 * stopped -- or null when the run ended under it, which is not an ending to
 * report.
 */
Tsum.prototype.buyBoxes = function(box, tenTimes, maxPurchases) {
  const limit = Math.min(
    maxPurchases > 0 ? maxPurchases : BuyBoxDefaultMax, BuyBoxMaxPurchases);
  let bought = 0;
  let misses = 0;

  while (this.mayContinue() && bought < limit) {
    // The banner rather than a log line: a rendered record leads with its event
    // and message, so a counter behind them wraps off a bar two lines tall.
    // Each number is its own message, shown once and retired (`plays` 1) -- a
    // banner with no lifetime stays for the whole run, and "Box buying 10/10"
    // parked over the game long after the sweep is what that would leave.
    // A retry repeats the number: the coins have not gone yet.
    this.banner('Box buying ' + (bought + 1) + '/' + limit, BuyBoxBannerMs, 1);
    if (!gPages.matches(PageName.TsumTsumStorePage)) {
      // Whatever a purchase left behind is gone by now -- `clearBoxReveals`
      // waits for the store -- so this is a screen nothing here put up.
      if (!this.awaitPage(PageName.TsumTsumStorePage, BuyBoxReturnWaitMs, Log.Box.PageMissed)) {
        gPages.navigate(PageName.TsumTsumStorePage);
      }
    }
    const tabs = this.openBoxTab(box);
    if (tabs === null) {
      return {bought: bought, reason: 'box unavailable'};
    }

    const outcome = this.buyOneBox(tenTimes, bought + 1, limit);
    if (outcome === 'bought') {
      misses = 0;
      bought++;
      continue;
    }
    if (outcome === 'soldOut') {
      return {bought: bought, reason: 'sold out'};
    }
    if (outcome === 'noCoins') {
      return {bought: bought, reason: 'not enough coins'};
    }
    if (outcome === 'stuck') {
      // Paid for, and the screens it opened would not clear. It counts against
      // the limit -- the coins went when OK was pressed -- and against the miss
      // budget, so a screen the sweep cannot get off stops it rather than
      // costing another purchase every time round.
      bought++;
    }
    // A dialog that opened a beat late, or a screen read mid-fade. Take the
    // store page again and try once more; three in a row is a real fault
    // (DRIVING_SCREENS.md § 8).
    misses++;
    if (misses >= BuyBoxMaxMisses) {
      return {bought: bought, misses: misses, reason: 'purchase failed'};
    }
    logInfo(Log.Box.Retrying, {misses: misses});
  }

  if (!this.isRunning) {
    return null;
  }
  if (bought >= limit) {
    logInfo(Log.Box.PurchaseLimit, {bought: bought, limit: limit});
    return {bought: bought, reason: 'purchase limit'};
  }
  // `mayContinue` went false without the run ending: a sweep asked for from the
  // settings page wants the loop back.
  return {bought: bought, reason: 'stood aside'};
}

// Returns false only when it stood aside for a round in progress, for the same
// reason `taskAutoUnlockLevel` does: there is no route off a running board, so
// navigating from one only stalls into an app restart. The detect broadcasts, so
// on the pause menu `dismiss.resumeGame` has pressed Continue by the time the
// answer is read.
Tsum.prototype.taskBuyBoxes = function() {
  const page = gPages.detect();
  if (page === PageName.GamePause || page === PageName.GamePlaying) {
    return false;
  }
  logInfo(Log.Box.Start, {
    box: this.buyBoxType,
    boxes: this.buyBoxTenTimes ? 10 : 1,
    limit: this.buyBoxMaxPurchases
  });
  gPages.navigate(PageName.TsumTsumStorePage);

  const outcome = this.buyBoxes(
    this.buyBoxType, this.buyBoxTenTimes, this.buyBoxMaxPurchases);
  if (outcome !== null) {
    logInfo(Log.Box.End, outcome);
  }
  return true;
}
