// ---------------------------------------------------------------------------
// The level-cap sweep: buy every raise the collection is offering.
//
// A tsum stops gaining levels at its cap, and the game sells the next few for
// coins. Sorting the collection by Level Lock puts every capped tsum at the
// front of it, so the sweep is: rewind to the first page, then repeatedly read
// the eight cards and raise the first one still wearing a padlock, until a page
// has none and a page turn finds none either.
//
// It re-reads rather than walking slots 0..7 off one reading because a raise
// takes its tsum out of the group the collection is sorted by, so the cards can
// shift underneath -- DRIVING_SCREENS.md § 6, which is also why the rewind is
// unconditional (§ 7) and why the toast is tapped rather than waited on (§ 4).
//
// Five hops, and every one waits to *see* the screen it asked for rather than
// sleeping at it, which is what the twelve blind taps this replaced could not do:
//
//   TsumsPage       -- the sort dropdown          -> TsumSortOrder
//   TsumSortOrder   -- Level Lock, then Close     -> TsumsPage
//   TsumsPage       -- a card, then the raise coin-> RaiseLevelCap
//   RaiseLevelCap   -- OK, which spends the coins -> LevelCapRaised
//   LevelCapRaised  -- a tap anywhere             -> TsumsPage
//
// The collection is left in Level Lock order rather than put back the way it
// was. Nothing else in the script reads that order, and leaving it is what makes
// the next run's first card the next capped tsum.
//
// `awaitPage` is the wait every one of those hops goes through, and boxes.ts
// borrows it -- hence its `event` parameter, so a Box Buying timeout is not
// filed under this sweep.
// ---------------------------------------------------------------------------

/** Pages of eight cards one run will walk. 769 tsums is 97 pages; a backstop. */
const UnlockMaxPages = 40;
/** Caps one sweep will buy. A runaway guard, not a budget -- each one costs coins. */
const UnlockMaxRaises = 200;
/** Failed raises in a row before the sweep believes the fault is real. */
const UnlockMaxMisses = 3;
/**
 * Left-arrow taps one run will spend getting back to the first page.
 *
 * It counts taps, not pages, and a burst deliberately taps faster than the grid
 * slides -- `UnlockRewindTapMs` was measured against a 120fps slide, and a 60fps
 * device draws the same one in twice the frames, so about every other tap lands
 * mid-slide and turns nothing. A full collection is ~97 pages, which is 192 taps
 * at half of them landing and 388 at a quarter; this covers both, and it is a
 * runaway guard rather than a budget -- overshooting the first page is free.
 *
 * Raising the cadence instead was weighed and turned down: it would slow the
 * rewind on every fast device to fix it on a slow one, for the same wall clock.
 */
const UnlockRewindMaxPages = 400;
/** Left-arrow taps between two readings of where the collection is. */
const UnlockRewindBurst = 4;
/** Rest between rewind taps -- the grid slides in well under this. */
const UnlockRewindTapMs = 250;
/** How long a dialog gets to open after the tap that asked for it. */
const UnlockDialogWaitMs = 4000;
/** How long the raise gets to land: OK spends the coins, and the counter animates. */
const UnlockConfirmWaitMs = 8000;
/** How long the collection gets to redraw after the toast is dismissed. */
const UnlockReturnWaitMs = 6000;
/** Rest between polls while waiting for a screen. */
const UnlockPollRestMs = 300;
/** Taps the order gets before the sweep gives up on it -- the first can be swallowed. */
const UnlockSortAttempts = 3;
// The five gates below are budgets for `settleScreen`, not durations: each one
// ends as soon as the screen it names holds still, so it costs what the device
// actually takes rather than what one device once took. They were rests of 500,
// 700, 1200 and 600ms measured at 120fps, where a 60fps device draws the same
// animations in twice the time and took the next tap inside them.
/** A screen this sweep waited to see, finishing arriving. */
const UnlockSettleMs = 2000;
/** The Change Order dialog showing the order it was just given. */
const UnlockOptionSettleMs = 1500;
/** The detail panel above the grid redrawing for the card just selected. */
const UnlockSelectSettleMs = 2000;
/** The grid sliding after a page chevron. */
const UnlockPageTurnSettleMs = 2500;
/** The toast arriving or leaving after a tap on it. */
const UnlockToastSettleMs = 1500;

/**
 * Poll for one screen until it shows, then until it has finished showing up.
 *
 * `gPages.matches` rather than `detect`: two of the three screens this waits on
 * are `targeted`, so a sweep would never answer with them -- see the note above
 * `RaiseLevelCap` in data.ts.
 *
 * Seeing a screen and the screen being live are different moments, and the gap
 * between them is a frame count rather than a duration: a fingerprint is chosen
 * from the parts that identify a page and those are painted first, so the sort
 * dialog's probes all pass 130ms before its own Close button is drawn at 120fps
 * -- and twice that at 60. Every hop of the sweep comes through here, so the
 * settle belongs here rather than at five call sites.
 *
 * `event` is which chore is waiting, and defaults to the level-cap sweep this
 * was written for. It is a parameter rather than one fixed name because the
 * whole value of the line below is telling someone reading the log which flow
 * gave up -- a Box Buying timeout filed as `unlock.pageMissed` sends them to the
 * collection.
 */
Tsum.prototype.awaitPage = function(page, timeoutMs, event) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (gPages.matches(page)) {
      this.settleScreen(UnlockSettleMs);
      return true;
    }
    if (!this.isRunning) {
      return false;
    }
    if (Date.now() >= deadline) {
      // Say what the screen actually was. Every way a sweep gives up runs
      // through here, so this line is the one that makes a report of it worth
      // reading. `peek` rather than `detect`: nothing may act on it.
      const seen = gPages.peek(1, 500);
      logWarn(event === undefined ? Log.Unlock.PageMissed : event,
        'Waited for a screen that did not come',
        {want: page, saw: seen === null ? 'nothing' : seen.name, waitedMs: timeoutMs});
      return false;
    }
    this.sleep(UnlockPollRestMs);
  }
}

/**
 * Which order the open Change Order dialog says the collection is in.
 *
 * The selected order's button is gold, the other four blue; four points on each
 * button's body, clear of the label in any language. One gold button is the
 * answer; none or more than one is null -- a frame caught mid-fade.
 */
Tsum.prototype.readCollectionSort = function() {
  const orders = Object.keys(CollectionSortDialog.buttons) as CollectionSort[];
  const samples = CollectionSortDialog.selectedSamples;
  const points: Coord[] = [];
  for (let i = 0; i < orders.length; i++) {
    const button = CollectionSortDialog.buttons[orders[i]];
    for (let j = 0; j < samples.length; j++) {
      points.push({x: button.x + samples[j].dx, y: button.y + samples[j].dy});
    }
  }

  let selected: CollectionSort | null = null;
  let gold = 0;
  const img = this.screenshot();
  try {
    const read = this.getColors(img, points);
    for (let i = 0; i < orders.length; i++) {
      let votes = 0;
      for (let j = 0; j < samples.length; j++) {
        if (isSameColor(CollectionSortDialog.selectedColor, read[i * samples.length + j],
                        CollectionSortDialog.selectedDiff)) {
          votes++;
        }
      }
      if (votes >= CollectionSortDialog.selectedVotes) {
        selected = orders[i];
        gold++;
      }
    }
  } finally {
    releaseImage(img);
  }
  logDebug(Log.Unlock.SortRead, {order: selected, gold: gold});
  return gold === 1 ? selected : null;
}

/**
 * Put the collection in `order`, and say which order it was in before.
 *
 * Opens the Change Order dialog, reads the selected order, taps `order` unless
 * it already is, confirms the dialog took it, and closes. The answer is what
 * `restoreCollectionSort` needs later. Null means the collection is not known to
 * be in `order` -- the dialog did not open, would not take the order, or did not
 * close. When the *selected* order could not be read the sort still goes ahead
 * and the answer is `order` itself: nothing known to put back.
 */
Tsum.prototype.sortCollection = function(order) {
  this.tap(Button.outTsumSortOrder);
  if (!this.awaitPage(PageName.TsumSortOrder, UnlockDialogWaitMs)) {
    logWarn(Log.Unlock.SortFailed, 'The Change Order dialog did not open', {order: order});
    return null;
  }
  let previous = this.readCollectionSort();
  if (previous === null) {
    // One more look: the buttons may still have been fading in.
    this.sleep(UnlockPollRestMs);
    previous = this.readCollectionSort();
  }
  if (previous === null) {
    logWarn(Log.Unlock.SortUnread,
      'Could not tell which order the collection was in; it will stay on the new one',
      {order: order});
    previous = order;
  }
  if (previous !== order) {
    // Tap the order, then read the dialog back to see it took. A tap landing
    // while the dialog is still animating in is swallowed by the animation
    // (DRIVING_SCREENS.md § 4), and the panel this waited to see is painted
    // before the dialog is live -- so the tap that picks the order lands inside
    // that window on some devices. A blind rest cannot tell a swallowed tap
    // from one that worked; re-reading can, and re-tapping an order already
    // selected costs nothing.
    let taken = false;
    for (let i = 0; i < UnlockSortAttempts && !taken && this.isRunning; i++) {
      this.tap(CollectionSortDialog.buttons[order]);
      this.settleScreen(UnlockOptionSettleMs);
      taken = this.readCollectionSort() === order;
    }
    if (!taken) {
      // Sweeping in the wrong order is worse than not sweeping: it walks the
      // whole collection and raises nothing. Close, and let the caller stop.
      logWarn(Log.Unlock.SortNotTaken, 'The collection would not take the order it was asked for',
        {order: order, previous: previous, attempts: UnlockSortAttempts, stopped: !this.isRunning});
      this.tap(Page.TsumSortOrder.back);
      return null;
    }
  }
  this.tap(Page.TsumSortOrder.back);
  if (!this.awaitPage(PageName.TsumsPage, UnlockDialogWaitMs)) {
    logWarn(Log.Unlock.SortFailed, 'The collection did not come back after Close', {order: order});
    return null;
  }
  logDebug(Log.Unlock.Sorted, {order: order, previous: previous});
  return previous;
}

/**
 * Put the collection back in the order the player had it in.
 *
 * Nothing to do when that was Level Lock, or once the run has stopped. The
 * collection has to be showing first, and after a failed raise it may not be.
 */
Tsum.prototype.restoreCollectionSort = function(order) {
  if (order === CollectionSort.LevelLock || !this.isRunning) {
    return;
  }
  if (!this.awaitPage(PageName.TsumsPage, UnlockReturnWaitMs)) {
    gPages.navigate(PageName.TsumsPage);
  }
  if (this.sortCollection(order) !== null) {
    logInfo(Log.Unlock.SortRestored, {order: order});
  }
}

/**
 * Is the collection showing its first eight cards?
 *
 * By the absence of the left chevron, which the game draws only when there is a
 * page behind this one. Measured on all three `corpus/TsumsPage` frames: the
 * two at the start of their list read nothing on any of the five points, the
 * one a page in reads the chevron on all five.
 */
Tsum.prototype.collectionAtFirstPage = function() {
  const offsets = CollectionGrid.prevPageSamples;
  const points: Coord[] = [];
  for (let i = 0; i < offsets.length; i++) {
    points.push({
      x: CollectionGrid.prevPage.x + offsets[i].dx,
      y: CollectionGrid.prevPage.y + offsets[i].dy
    });
  }
  let votes = 0;
  const img = this.screenshot();
  try {
    const read = this.getColors(img, points);
    for (let i = 0; i < read.length; i++) {
      if (isSameColor(CollectionGrid.prevPageColor, read[i], CollectionGrid.prevPageDiff)) {
        votes++;
      }
    }
  } finally {
    releaseImage(img);
  }
  return votes < CollectionGrid.prevPageVotes;
}

/**
 * Walk the collection back to its first page.
 *
 * Closing the sort dialog leaves the grid wherever the selected tsum landed in
 * the new order, and that tsum is whatever the player last looked at -- often a
 * MyTsum already at MAX, which Level Lock order puts well past the capped run.
 * The sweep would then read eight uncapped cards and stop having raised nothing,
 * which is what it was doing. So rewind first, always, rather than deciding
 * whether to on one reading.
 *
 * Taps go in bursts because the list can be ninety pages long and the capture is
 * the expensive half of a page turn. Overshooting a burst is free: with no page
 * behind this one the game draws no chevron, and the tap lands on the grid's
 * empty left margin. A burst also outruns the slide -- deliberately, since a
 * tap per confirmed turn would cost a capture each -- so `UnlockRewindMaxPages`
 * counts taps rather than pages and is set well above the length of the list.
 */
Tsum.prototype.rewindCollection = function() {
  let turned = 0;
  while (this.isRunning && turned <= UnlockRewindMaxPages) {
    // Every reading past the first is taken after the settle at the bottom of
    // the loop, so the grid it reads has stopped moving. On the first pass
    // nothing has moved yet, so there is nothing to wait out.
    if (this.collectionAtFirstPage()) {
      logDebug(Log.Unlock.Rewound, {pages: turned});
      return true;
    }
    logDebug(Log.Unlock.Rewinding, {pages: turned});
    for (let i = 0; i < UnlockRewindBurst && this.isRunning; i++) {
      this.tap(CollectionGrid.prevPage);
      this.sleep(UnlockRewindTapMs);
      turned++;
    }
    // Confirm arrival after the slide, not during it -- DRIVING_SCREENS.md § 7.
    this.settleScreen(UnlockPageTurnSettleMs);
  }
  logWarn(Log.Unlock.RewindFailed,
    'The collection would not go back to its first page', {pages: turned});
  return false;
}

/**
 * Which of the eight cards on this page are at their level cap.
 *
 * One capture and forty-eight probes: six points on each card's padlock badge,
 * and a card is capped when enough of them are the badge colour. `CollectionGrid`
 * says why it is a vote rather than a single pixel.
 */
Tsum.prototype.readCappedCards = function() {
  const badges = CollectionGrid.lockBadges;
  const samples = CollectionGrid.lockSamples;
  const points: Coord[] = [];
  for (let i = 0; i < badges.length; i++) {
    for (let j = 0; j < samples.length; j++) {
      points.push({x: badges[i].x + samples[j].dx, y: badges[i].y + samples[j].dy});
    }
  }

  const capped: boolean[] = [];
  const img = this.screenshot();
  try {
    const read = this.getColors(img, points);
    for (let i = 0; i < badges.length; i++) {
      let votes = 0;
      for (let j = 0; j < samples.length; j++) {
        if (isSameColor(CollectionGrid.lockColor, read[i * samples.length + j],
                        CollectionGrid.lockDiff)) {
          votes++;
        }
      }
      capped.push(votes >= CollectionGrid.lockVotes);
    }
  } finally {
    releaseImage(img);
  }
  logDebug(Log.Unlock.CardsRead, {capped: capped});
  return capped;
}

/**
 * Leave the "the level cap has been raised" toast, back to the card grid.
 *
 * The toast carries no button and does not clear itself; it waits for a tap
 * anywhere. One tap is nearly always enough -- but one that lands while the
 * toast is still arriving is swallowed by the animation rather than by the
 * toast, and the sweep then sat watching an undismissed toast until its wait ran
 * out. Observed after seven clean raises in a row, on the eighth.
 *
 * So tap for as long as the toast is still there, checking for the collection
 * before each one so a tap is never spent on the grid behind it. If what is up
 * is neither -- something this sweep did not put there, a mission reward the
 * raise earned -- the router is what knows how to leave a screen.
 */
Tsum.prototype.leaveLevelCapToast = function() {
  const deadline = Date.now() + UnlockReturnWaitMs;
  let taps = 0;
  while (this.isRunning && Date.now() < deadline) {
    if (gPages.matches(PageName.TsumsPage)) {
      return true;
    }
    if (taps === 0 || gPages.matches(PageName.LevelCapRaised)) {
      this.tap(Page.LevelCapRaised.back);
      taps++;
    }
    // The toast is on its way in or on its way out; either way the next look has
    // to be at a screen that has stopped moving, or it reads the transition.
    this.settleScreen(UnlockToastSettleMs);
  }
  if (!this.isRunning) {
    return false;
  }
  logWarn(Log.Unlock.ToastStuck,
    'The level-cap toast would not go; asking the router to get back', {taps: taps});
  gPages.navigate(PageName.TsumsPage);
  return gPages.matches(PageName.TsumsPage);
}

/**
 * Select one card and buy the raise the game offers for it.
 *
 * The card's padlock said its tsum is at its cap; the gold coin under the detail
 * panel's level bar is the game's own offer to lift it, and that is checked
 * before anything is pressed, because the tap after it spends coins. `false`
 * ends the sweep -- either the offer was not there, in which case the grid and
 * the panel disagree and the next tap would be a blind one, or the confirmation
 * never arrived, which is what running out of coins looks like.
 */
Tsum.prototype.raiseCardLevelCap = function(slot) {
  this.tap(CollectionGrid.cells[slot]);
  // The coin below is read next, and a panel caught mid-redraw answers "no
  // raise offered" -- which ends the sweep. Wait for the redraw to finish.
  this.settleScreen(UnlockSelectSettleMs);

  const offsets = CollectionGrid.raiseCapSamples;
  const points: Coord[] = [];
  for (let i = 0; i < offsets.length; i++) {
    points.push({
      x: CollectionGrid.raiseCap.x + offsets[i].dx,
      y: CollectionGrid.raiseCap.y + offsets[i].dy
    });
  }
  let offered = true;
  const img = this.screenshot();
  try {
    const read = this.getColors(img, points);
    for (let i = 0; i < read.length; i++) {
      offered = offered && isSameColor(CollectionGrid.raiseCapColor, read[i],
                                       CollectionGrid.raiseCapDiff);
    }
  } finally {
    releaseImage(img);
  }
  if (!offered) {
    logWarn(Log.Unlock.RaiseNotOffered,
      'The card shows a padlock but the panel offers no raise', {slot: slot});
    return false;
  }

  logDebug(Log.Unlock.Raising, {slot: slot});
  this.tap(CollectionGrid.raiseCap);
  if (!this.awaitPage(PageName.RaiseLevelCap, UnlockDialogWaitMs)) {
    logWarn(Log.Unlock.DialogMissing, 'The raise confirmation did not open', {slot: slot});
    return false;
  }

  this.tap(Page.RaiseLevelCap.next);
  if (!this.awaitPage(PageName.LevelCapRaised, UnlockConfirmWaitMs)) {
    // Cancel rather than leave the run standing on a dialog it did not expect.
    logWarn(Log.Unlock.RaiseNotConfirmed, {slot: slot});
    this.tap(Page.RaiseLevelCap.back);
    return false;
  }

  if (!this.leaveLevelCapToast()) {
    logWarn(Log.Unlock.DialogMissing, 'The collection did not come back', {slot: slot});
    return false;
  }
  logInfo(Log.Unlock.Raised, {slot: slot});
  return true;
}

// Returns false only when it stood aside for a round in progress -- the board,
// or the game's own pause menu over it. Either way the round is the play task's
// to finish: there is no route off a running board, so navigating from one only
// stalls into an app restart. The detect broadcasts, so on the pause menu
// `dismiss.resumeGame` has pressed Continue by the time the answer is read.
Tsum.prototype.taskAutoUnlockLevel = function() {
  const page = gPages.detect();
  if (page === PageName.GamePause || page === PageName.GamePlaying) {
    return false;
  }
  logInfo(Log.Page.Tsums);
  gPages.navigate(PageName.TsumsPage);
  logInfo(Log.Unlock.Start);

  // The sweep needs Level Lock order and the player may not: remember theirs,
  // and put it back once the raises are done.
  const previous = this.sortCollection(CollectionSort.LevelLock);
  if (previous === null) {
    logInfo(Log.Unlock.End);
    return true;
  }
  const outcome = this.raiseCappedCards();
  this.restoreCollectionSort(previous);
  if (outcome !== null) {
    logInfo(Log.Unlock.End, outcome);
  }
  return true;
}

/**
 * Walk the collection, in Level Lock order, raising every cap it meets.
 *
 * Returns the fields for `Log.Unlock.End` -- how far it got and why it stopped
 * -- or null when the run stopped under it, which is not an ending to report.
 */
Tsum.prototype.raiseCappedCards = function() {
  this.rewindCollection();

  let raised = 0;
  let turnedPages = 0;
  let turnedEmpty = false;
  let recovered = false;
  let misses = 0;
  while (this.isRunning && raised < UnlockMaxRaises) {
    // Re-read the grid every time round rather than walking slots 0..7 off one
    // reading. A raise takes its tsum out of the locked group, and the locked
    // group is what the collection is sorted by, so the eight cards can shift
    // under the sweep -- which is what made it skip cards and stop early.
    // Whether the game re-sorts or leaves the card where it is, "the first card
    // still wearing a padlock" is the right next tap either way.
    const capped = this.readCappedCards();
    let slot = -1;
    for (let i = 0; i < capped.length && slot < 0; i++) {
      if (capped[i]) {
        slot = i;
      }
    }

    if (slot >= 0) {
      turnedEmpty = false;
      recovered = false;
      if (!this.raiseCardLevelCap(slot)) {
        // One hiccup used to end the sweep -- a dialog that opened a beat late,
        // a screen read mid-fade. Get back to the collection and take the page
        // again instead; three in a row is a real fault and worth stopping on.
        misses++;
        if (misses >= UnlockMaxMisses) {
          return {pages: turnedPages + 1, raised: raised, misses: misses, reason: 'raise failed'};
        }
        logInfo(Log.Unlock.Retrying, {slot: slot, misses: misses});
        if (!this.awaitPage(PageName.TsumsPage, UnlockReturnWaitMs)) {
          gPages.navigate(PageName.TsumsPage);
          if (turnedPages === 0) {
            this.rewindCollection();
          }
        }
        continue;
      }
      misses = 0;
      raised++;
      continue;
    }

    // Nothing capped on this page. Where the grid is tells the three cases apart
    // rather than leaving them guessed at.
    if (turnedPages === 0 && !recovered && !this.collectionAtFirstPage()) {
      // The grid moved without the sweep turning a page: the game followed the
      // tsum whose cap was just raised to its new place in the order.
      recovered = true;
      this.rewindCollection();
      continue;
    }
    if (turnedEmpty) {
      // A page turn found no capped card either, so the run really has ended.
      return {pages: turnedPages + 1, raised: raised, reason: 'no more capped'};
    }
    if (turnedPages + 1 >= UnlockMaxPages) {
      logWarn(Log.Unlock.PagesExhausted,
        'Reached the page limit with cards still capped', {pages: turnedPages + 1});
      return {pages: turnedPages + 1, raised: raised, reason: 'page limit'};
    }
    logInfo(Log.Unlock.NextPage, {page: turnedPages});
    this.tap(CollectionGrid.nextPage);
    // The next thing round the loop is `readCappedCards`, and a padlock read off
    // a grid still sliding is read off the wrong card.
    this.settleScreen(UnlockPageTurnSettleMs);
    turnedPages++;
    turnedEmpty = true;
  }

  if (!this.isRunning) {
    return null;
  }
  logWarn(Log.Unlock.RaiseLimit,
    'Stopped at the safety limit rather than spending coins without end', {raised: raised});
  return {pages: turnedPages + 1, raised: raised, reason: 'raise limit'};
}
