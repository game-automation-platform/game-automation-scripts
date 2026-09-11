// ---------------------------------------------------------------------------
// Playing one round: the walk in, the loop, and proving the round is over.
//
// `taskPlayGameQuick` is the whole of it -- the between-rounds delay, the walk
// to the board, then scan, link and skill until the HUD stops answering. Two
// things make it longer than that sounds.
//
// The round is not over when the board stops fingerprinting. A burst skill's
// animation covers the same HUD pixels, so an unreadable frame is played
// through (`HudMissesBeforeGameOver`) and only a page a round can genuinely end
// on (`isRoundOverPage`) or `confirmGameOver`'s grace window ends it.
//
// And a chain the game refuses leaves the board exactly as it was, so the next
// scan plans the same chain and draws it again. The dead-scan counter sees that
// fixpoint and the Fan is what answers it -- "The stalled board" below.
//
// The board itself -- the scan, the chains, the bubbles -- is board.ts.
// ---------------------------------------------------------------------------

Tsum.prototype.checkGameItem = function() {
  // Same positions as Button.outGameItems; the two tuples share the order.
  const isItemsOn: GameItemStates = [false, false, false, false, false, false, false];
  if (this.scoreItem) {
    isItemsOn[0] = true;
  }
  if (this.coinItem) {
    isItemsOn[1] = true;
  }
  if (this.expItem) {
    isItemsOn[2] = true;
  }
  if (this.timeItem) {
    isItemsOn[3] = true;
  }
  if (this.bubbleItem) {
    isItemsOn[4] = true;
  }
  if (this.uniqueTsumCount === 4) {
    isItemsOn[5] = true;
  }
  if (this.comboItem) {
    isItemsOn[6] = true;
  }
  for(let t = 0; t < 3; t++) {
    const img = this.screenshot();
    let isChange = false;
    try {
      for (let i = 0; i < Button.outGameItems.length; i++) {
        const c = this.getColor(img, Button.outGameItems[i]);
        if (c.b > 128) { // off
          if (isItemsOn[i]) {
            this.tap(Button.outGameItems[i]);
            isChange = true;
            this.sleep(500);
          }
        } else { // on
          if (!isItemsOn[i]) {
            this.tap(Button.outGameItems[i]);
            isChange = true;
            this.sleep(500);
          }
        }
      }
    } finally {
      releaseImage(img);
    }
    logDebug(Log.Play.BonusItemsToggled, { changed: isChange });
    if (!isChange) {
      break;
    }
    this.sleep(500);
  }
  logDebug(Log.Play.CheckBonusItems, { itemsOn: isItemsOn });
}

/** Budget for the pre-round screen to leave and the board to arrive, after Start. */
const RoundStartWaitMs = 5000;
/** Between looks while it does. */
const RoundStartPollMs = 100;
/** Budget for the tsums dropping into a new board to land. */
const RoundStartSettleMs = 2000;

/**
 * Wait for the round to be up after the Start tap, and say whether it is.
 *
 * This was `sleep(5000)`, and what it guarded was the next navigation pass
 * reading the pre-round screen mid-fade and running the item check and the
 * Start tap all over again. Watching for that instead: a look that no longer
 * says `StartPage` is progress, and one that says `GamePlaying` is the answer.
 * `peek`, because nothing here may act on what it sees -- the drive loop this
 * returns to is what handles a dialog that lands in the meantime.
 *
 * The board never goes still, so its arrival is its fingerprint; the tsums
 * dropping into it are then given `settleBoard`, so the first scan reads a
 * board that has landed rather than one still filling.
 *
 * False means the budget ran out with the board not seen, which is the drive
 * loop's cue to take another pass -- exactly what followed the flat rest.
 */
Tsum.prototype.awaitRoundStart = function() {
  const startedAt = Date.now();
  const deadline = startedAt + RoundStartWaitMs;
  let looks = 0;
  let left = false;
  let seen: PageName | null = null;
  while (this.isRunning && Date.now() < deadline) {
    const page = gPages.peek(1, 0);
    looks++;
    seen = page === null ? null : page.name;
    if (seen === PageName.GamePlaying) {
      logDebug(Log.Play.BoardUp, { ms: Date.now() - startedAt, looks: looks, sawLeave: left });
      this.settleBoard(RoundStartSettleMs);
      return true;
    }
    if (seen !== PageName.StartPage) {
      left = true;
    }
    this.sleep(RoundStartPollMs);
  }
  logDebug(Log.Play.BoardUpTimeout,
    { ms: Date.now() - startedAt, looks: looks, sawLeave: left,
      saw: seen === null ? 'nothing' : seen, stopped: !this.isRunning });
  return false;
}

// GamePlaying is recognized by HUD pixels on the pause/fan buttons, and a
// long burst-skill animation (e.g. Dapper Hat Mickey) covers them for longer
// than the old two-check window (~5s) while the game is still running — the
// play loop would bail mid-game and stall on the "unknown" screen. So an
// unrecognized screen alone is not proof of game over; require positive
// confirmation instead: a game that really ends always reaches a known
// out-of-game page (the score tally lands on ScorePage). Poll until the HUD
// comes back (still playing), a known page shows up (game over), or the
// grace window runs out (assume over — the old behavior, just later).
// The screens a round can actually end on.
//
// A round that really finished lands on the score tally, by way of the
// new-record panel, the post-round tsum level-up panel, the account level-up
// panel or the Magical Time offer. Nothing else in the table can follow a
// running round, so nothing else is evidence that one has ended.
//
// This list exists because "any page the table can name" was being treated as
// that evidence, and the table is not uniformly trustworthy. `ClosePage` is a
// deliberate single-pixel catch-all for the standard close button at centre
// bottom -- one positive probe at (540,1588) with threshold 80, which
// `pages:selftest` reports every run under "catch-all risk". Mid-round that
// pixel sits on the fever bar (rgb(8,191,231) on the corpus board frame), and a
// fever payout or a burst skill washing the bottom band yellow moves it to
// something ClosePage accepts. When that happened while the HUD was also
// obscured -- the same instant, since both are the same animation -- ClosePage
// was the only entry left passing, and one frame of it ended the round: the play
// loop broke out mid-game, waitForScorePage spent its fifteen seconds waiting
// for a tally that was never coming, and the round was recorded with no score
// and no coins.
//
// The half of that which has since been fixed is the HUD: `GamePlayingHudProbes`
// (data.ts) was re-measured against six captured fever frames and moves by at
// most 12 there, so the board now fingerprints through a fever and ClosePage is
// no longer the only entry passing on such a frame. What is not fixed is the
// general case -- a burst skill's full-screen animation and the mid-round
// level-up banner have never been captured -- which is why this list, and the
// narrowed sweep below, both stay.
//
// Widening ClosePage's fingerprint is the other half of this and is deliberately
// not done here: it is a navigation catch-all that answers for screens nobody
// has enumerated (events, My Info, settings), so tightening it trades this bug
// for a navigation stall. Not trusting it as proof of game over costs nothing.
//
// The play loop now also refuses to *read* ClosePage mid-round: its liveness
// check scores `inRoundPages()` instead of the whole table, so the entry is not
// a candidate there at all. The narrower question -- which of those pages mean
// the round is over -- is `roundOverPages()`: the tally and the panels before
// it, as each declares in `PageProfiles` (`PageRole.Tally`, `PageRole.PreTally`).
// The event card's screens are among them: the round ends onto its result
// overlay, which has no fingerprint (event art -- see waitForScorePage), and the
// play loop's own trailing taps can have advanced it to the event page already.
// Also the guard for confirmGameOver, which does sweep the whole table.
function isRoundOverPage(page: PageName): boolean {
  return roundOverPages().indexOf(page) !== -1;
}

// Watch until the round is proven over, or the board comes back.
//
// Nothing plays while this runs: the loop below neither scans nor taps, so
// every millisecond spent here is a millisecond of a round that may still be
// running. That is what makes the poll's cost the thing to watch -- see the
// `detect` call.
Tsum.prototype.confirmGameOver = function() {
  logInfo(Log.Play.ConfirmingGameOver, { graceMs: this.gameOverGraceMs });
  const startedAt = Date.now();
  const deadline = startedAt + this.gameOverGraceMs;
  let looks = 0;
  while (this.isRunning) {
    // One look, no retry budget. `detect`'s timeout is spent only when *nothing*
    // fingerprints -- which is this function's entire situation, since it is
    // only ever called after the board stopped fingerprinting. So the 1500ms
    // this used to ask for was never a wait for a page to arrive; it was 1.5s of
    // standing still per poll, on top of the 250ms below, while the round went
    // on running underneath. The loop's own `gameOverGraceMs` deadline is the
    // budget, and it is the only one this needs.
    //
    // Still the whole table, unlike the play loop's liveness check: a page
    // outside `inRoundPages()` cannot end the round here (`isRoundOverPage` is
    // what does that), and sweeping everything is what keeps the root-detection
    // and network guards live through a grace window that can last 20s.
    const page = gPages.detect(1, 0);
    looks++;
    if (page === PageName.GamePlaying || page === PageName.GamePause) {
      // Still playing after all. `idleMs` is what this cost the round.
      logDebug(Log.Play.HudBack, { page: page, looks: looks, idleMs: Date.now() - startedAt });
      return false;
    }
    if (isRoundOverPage(page)) {
      // A screen the round can genuinely end on. If it was the Magical Time
      // offer, `dismiss.magicalTime` has already cancelled it inside the
      // detection above -- which is the earliest point on this path that the
      // dialog can be seen, and used to be a branch here.
      logInfo(Log.Play.GameOverConfirmed, 'Game over confirmed by a round-over page',
        { page: page, looks: looks, idleMs: Date.now() - startedAt });
      return true;
    }
    // Everything else -- `Unknown`, or a page the game cannot reach from a
    // running round -- is an animation or a misread, not an ending. Keep
    // polling: either the HUD comes back or the grace window runs out.
    if (Date.now() > deadline) {
      logWarn(Log.Play.GameOverAssumed,
        'Assumed game over: no recognisable screen within the grace window',
        { graceMs: this.gameOverGraceMs, lastPage: page, looks: looks,
          idleMs: Date.now() - startedAt });
      return true;
    }
    this.sleep(250);
  }
  return true;
}

// How long the play loop keeps playing through a screen it cannot read as the
// board before it starts checking for game over. Mid-round an unreadable frame
// is ordinary rather than rare -- see the liveness check at the bottom of
// taskPlayGameQuick -- and the loop plays through these rather than standing
// still while the combo timer runs down.
//
// A fever is no longer one of them. `GamePlayingHudProbes` was re-measured on
// six fever frames and moves by at most 12 against a 40 threshold, so a fever
// board fingerprints as `GamePlaying` like any other and costs no misses at
// all (OBSCURED_BOARD.md). The guard stays because the two overlays that have
// never been captured -- a burst skill's full-screen animation and the
// mid-round level-up banner -- are still unenumerated, and an overlay nobody
// has enumerated is exactly what this is for.
//
// Both bounds have to be passed, because either alone is the wrong measure. A
// scan over a board hidden by an animation finds no tsums, so it links nothing
// and comes round again in a fraction of the time a real scan takes: a count on
// its own can run out in well under a second, shorter than the animation it is
// meant to tolerate. A duration on its own would end a round that genuinely
// finished a whole grace window late, since the loop scans an empty board the
// entire time.
//
// Erring long is the cheap direction. A round that really ended lands on one of
// `roundOverPages()`, and those skip this debounce entirely -- they are recognised
// and end the round on the frame they first appear.
const HudMissesBeforeGameOver = 3;
const HudMissGraceMs = 1500;

/** The debounce above, carried between the turns that share it. */
interface HudWatch {
  /** Consecutive looks that did not fingerprint as the board. */
  misses: number;
  /** When that run of them started, epoch ms. Only read while `misses` is up. */
  firstMissAt: number;
}

/** What one liveness look says about the round. */
const enum RoundLook {
  /** The board answered. Carry on. */
  Playing,
  /**
   * A paused board, or an animation over one. Carry on, but nothing this turn's
   * scan found is evidence about the board -- neither takes a chain.
   */
  Unreadable,
  /** Over: `roundEndedAt` is stamped and `round.over` has gone out. */
  Over,
}

/**
 * Liveness check: is the board still up?
 *
 * One look, no retry budget. `detect`'s timeout is spent only when *nothing*
 * fingerprints, so a generous one costs nothing on the yes and everything on
 * the no -- and mid-round the no is an ordinary frame, not a rare one. A
 * burst skill's full-screen animation and the mid-round level-up banner both
 * cover the HUD this is read from, and neither has an entry. Asking for
 * 2500ms here bought a stall of up to that long in which the loop neither
 * scanned nor tapped, silent in the log because a sweep that matches nothing
 * logs nothing -- and the combo timer does not survive it.
 *
 * A fever used to be the third of those and is not any more: the entries
 * this scores were re-measured off six fever frames, and a fever board now
 * answers `GamePlaying` outright (OBSCURED_BOARD.md).
 *
 * The wait is not gone, it moved: HudMissesBeforeGameOver/HudMissGraceMs
 * debounce the same thing here, where the loop plays through the animation
 * instead of watching it.
 *
 * Scored against `inRoundPages()` rather than the whole table. A running round
 * can only be looking at the board, the pause menu, or a screen it ended on,
 * so the other 48-odd entries are answers this call cannot want -- and one of
 * them, `ClosePage`, is a single-pixel catch-all sitting on the fever bar
 * that has previously been the only entry left passing over an obscured
 * board and ended the round on the spot (see `isRoundOverPage` above). It
 * cannot win here now. The branches below already treat "nothing matched" and
 * "matched something a round cannot become" the same way, so a narrowed
 * sweep that comes back empty needs no new handling.
 *
 * A method rather than the tail of the play loop because the loop is not the
 * only caller: a round the Max Round Duration cap has stopped playing still has
 * to be seen out, and it watches with exactly this.
 */
Tsum.prototype.watchRoundEnd = function(hud) {
  const page = gPages.detect(1, 0, inRoundPages());
  const stillDebouncing = hud.misses < HudMissesBeforeGameOver
      || Date.now() - hud.firstMissAt < HudMissGraceMs;
  if (page === PageName.GamePlaying || page === PageName.GamePause) {
    hud.misses = 0;
    // A paused board takes no chain and every scan of one reads the same tsums
    // standing in the same places, which is the stall's signature without being
    // the stall. The pause handler is already resuming it.
    return page === PageName.GamePause ? RoundLook.Unreadable : RoundLook.Playing;
  }
  if (!isRoundOverPage(page) && stillDebouncing) {
    // Nothing matched, or something matched that a running round cannot turn
    // into -- both of which are what an animation over the board looks like,
    // and neither of which is an ending. Keep playing.
    if (hud.misses === 0) {
      hud.firstMissAt = Date.now();
    }
    hud.misses++;
    // The scan that fed this turn looked through that animation, so what it
    // found is not evidence about whether the game took the chain.
    return RoundLook.Unreadable;
  }
  // Either a page the round can genuinely end on -- proof on its own, and so
  // not debounced at all -- or the debounce above running out.
  //
  // Stamped from the frame the HUD went away on rather than from here: the
  // round was already over then, and neither the scans spent playing through
  // the debounce nor the twenty seconds confirmGameOver is allowed to spend
  // proving it are time the round ran for.
  const endedAt = hud.misses > 0 ? hud.firstMissAt : Date.now();
  hud.misses = 0;
  // Nothing reads the coin counter here. The board is still paying out at
  // this point, so the counter is not yet showing the round's figure --
  // `record.baseCoins` waits for the level-up screen, which is the first one
  // that is certainly after the payout, and finishRoundStats' wait for the
  // score page is what polls long enough to see it.
  if (!this.confirmGameOver()) {
    // Still playing after all: the screen that looked like an ending was an
    // animation.
    return RoundLook.Playing;
  }
  this.roundEndedAt = endedAt;
  logInfo(Log.Play.GameOver, { chains: this.runTimes,
    hudLostMs: Date.now() - endedAt });
  // The board is done; the tally has not started. Not the stop signal -- that
  // is round.end, once the figures can be read.
  this.emit(Emit.Round.Over, {
    id: this.roundUid,
    seconds: Math.round((endedAt - this.roundStartedAt) / 1000),
  });
  return RoundLook.Over;
}

// --- The stalled board -------------------------------------------------------
//
// A chain the game refuses leaves the board exactly as it was, so the next scan
// reads the same board, plans the same chain and draws it again. That fixpoint
// is what `Config.linkReach`'s comment describes, and what a player watching it
// sees: the same few tsums lighting up over and over with nothing going off.
//
// Two things get a board into it, and neither is worth telling apart from
// inside the loop. Reach past what the game itself accepts proposes a hop it
// will not link; two tsums whose colours merged into one cluster (12% of
// rosters, Board Studio's measurement) put both kinds in one chain, and the
// game breaks it where the kind changes. Either way a prefix shorter than three
// links, so nothing clears.
//
// What they leave behind is the same and is free to see: the tsums the last
// drag went over are still standing. The Fan is the answer because it is the
// only move that changes the board without the game having to accept a link --
// it re-packs the pile, which is what a player does by hand to clear this.
//
// The barren board below (`zeroPath`) is a different complaint: there the loop
// finds nothing to draw, where here it draws and is refused.
/** How far a tsum may have shifted and still count as standing, in play-square px. */
const DeadScanTolerancePx = 4;
/** What share of a drawn chain still standing makes a scan a dead one. */
const DeadScanStillFraction = 0.8;
/**
 * Dead scans in a row before the Fan goes out.
 *
 * Four rather than one because a refill can drop a tsum back onto a cleared
 * spot, and because a bubble pop or a skill firing mid-batch can leave a chain
 * standing for a reason that is not a stall. None of those repeats four scans
 * running; a board the game has stopped taking links from does nothing else.
 */
const DeadScansBeforeFan = 4;
/** Budget for the fanned board to land again before it is scanned. */
const DeadScanFanSettleMs = 1200;

// --- The Max Round Duration cap ---------------------------------------------
//
// A round that will not end -- a choreography stuck on a board it cannot clear,
// a screen the router never recognised -- is the one failure the play loop
// cannot see from inside, because every part of it is behaving. The cap is the
// clock saying so from outside, and `MaxRoundAction` is what to do about it.
//
// Both options stop *playing* the round and leave the game's own timer to run
// it out; what they decide is what becomes of the script. Coasting is the
// default because it costs the least -- leaving the board alone ends the round
// within a minute or so, and the run then carries on as normal.
//
// Neither presses the game's Pause button, and that is the point rather than an
// omission: pausing the game stops its round timer, and a round that can no
// longer time out is exactly what this is here to avoid. The game's Pause
// button has one caller and keeps it -- `onPause` (src/quickbar.ts), where a
// person has asked for the round to stop where it is.

/** Between looks while a round is coasting to its end. */
const RoundCoastPollMs = 500;
/**
 * How long coasting will wait for the round to end on its own.
 *
 * Generous: a 60s round stretched by +Time and a long fever is nowhere near it.
 * It bounds the one case coasting cannot answer -- a board that goes on
 * fingerprinting as the round with the game's own clock stopped -- because the
 * task never handing back is exactly the wedge the cap exists to escape.
 */
const RoundCoastMaxMs = 3 * 60 * 1000;

Tsum.prototype.roundDelayRemainingMs = function() {
  const left = this.nextRoundAt - Date.now();
  return left > 0 ? left : 0;
}

/**
 * Open the round: mint its id, freeze the settings it is played under, and
 * announce it.
 *
 * Called from `nav.move.startToGame` in the moment between the bonus items
 * being set and Start being tapped, so a recorder starting on `round.start`
 * opens on the items the round will be played with rather than on a board that
 * is already running. `taskPlayGameQuick` calls it again once the board is up,
 * for the round that never passed that screen -- one already in play when the
 * task arrived, or a walk that reached the board another way.
 *
 * Gated on `openingRound` because the pre-round screen alone cannot tell a round
 * from click assist, which walks to the same board through the same handler and
 * closes no round afterwards. Whichever call gets here first clears the flag, so
 * the second is a no-op and one round is announced once.
 *
 * A round already open is one whose walk was cut short between the tap and the
 * board -- a level-cap sweep asking for the screen during those five seconds --
 * and the pass that picks the board up is the same round arriving late, not a
 * new one. `finishRoundStats` is what closes a round, by zeroing the clock.
 */
Tsum.prototype.openRound = function() {
  if (!this.openingRound) {
    return;
  }
  this.openingRound = false;
  if (this.roundStartedAt !== 0) {
    return;
  }
  this.beginRoundStats();
  // After beginRoundStats, so `roundUid` and `roundSettings` are this round's own.
  this.roundNumber++;
  this.emit(Emit.Round.Start, {
    // What every other round.* event of this round repeats. `round` counts this
    // device's rounds and repeats across emulators; `id` does not.
    id: this.roundUid,
    round: this.roundNumber,
    myTsum: this.myTsum,
    skill: statsSkillName(this.roundSettings ? this.roundSettings.skillType : this.skillType),
    // What the round is played under, so a consumer can group rounds without
    // waiting for the CSV. The snapshot, so a mid-round Quick Bar change is the
    // next round's news.
    settings: statsSettingsPayload(this.roundSettings),
  });
}

Tsum.prototype.taskPlayGameQuick = function() {
  // The between-rounds delay, if one is running. Held here rather than by
  // lengthening this task's interval, because an interval is a schedule nothing
  // else can see or cut short: `nextRoundAt` is what the Quick Bar's countdown
  // reads and what its Skip clears. Returning instead costs one clock read
  // every 3s and leaves the schedule alone -- the chores keep running through
  // the wait, which is the point of having one.
  const waitMs = this.roundDelayRemainingMs();
  if (waitMs > 0) {
    // One line per turn, so a wait ticking down is visible rather than looking
    // like a stalled loop. Debug-gated, and logDebug returns before building
    // anything when debug is off.
    logDebug(Log.Play.RoundDelayWaiting, { remainingMs: waitMs });
    return;
  }
  if (this.nextRoundAt !== 0) {
    this.nextRoundAt = 0;
    logInfo(Log.Play.RoundDelayOver);
  }
  // A level-cap sweep asked for from the settings page goes before a round that
  // has not started. One already on screen is still this task's to finish --
  // the sweep stood aside for it and is waiting on it. `peek`: nothing may act.
  if (this.yieldAsked) {
    const seen = gPages.peek(1, 0);
    if (seen === null
        || (seen.name !== PageName.GamePlaying && seen.name !== PageName.GamePause)) {
      logInfo(Log.Unlock.NowYielded, { task: 'playRound' });
      return;
    }
  }
  // The whistle, and the last moment a setting can still shape this round:
  // below here the walk opens the pre-round screen, which is where the bonus
  // items are chosen and where 5>4 decides how many colours the board is dealt.
  quickBarApplyPending(this);
  // Opens this round's correlation scope: every record until the next round
  // starts carries the same roundId, injected by the logger.
  logBeginRound();
  logInfo(Log.Play.GameStart);
  // This walk is a round starting, which is what lets the pre-round screen open
  // it in front of the bonus items -- see `openRound`.
  this.openingRound = true;
  // Abandoned if the sweep is asked for on the way there: the round has not
  // started, so there is nothing to finish.
  if (!gPages.navigate(PageName.GamePlaying, () => this.yieldAsked)) {
    // Whatever happens next is not this walk. A round the pre-round screen
    // already opened stays open and is closed by the pass that finds the board.
    this.openingRound = false;
    if (this.yieldAsked) {
      logInfo(Log.Unlock.NowYielded, { task: 'playRound', stage: 'navigating' });
    }
    return;
  }
  logInfo(Log.Play.GamingFast);
  // Normally a no-op: the pre-round screen opened this round a few seconds ago,
  // before it tapped Start. This is the round that never passed it.
  this.openRound();
  // The clock, restamped now the board is actually up. The round is opened
  // ahead of the tap so `round.start` lands with the items in frame, and
  // `duration_seconds` must still measure play rather than the walk in.
  this.roundStartedAt = Date.now();
  this.runTimes = 0;
  // Re-resolved on the first board scan of each game: the player may have
  // changed which tsum is selected, and `identifyMyTsum` has just re-read it.
  this.myTsumColor = null;
  this.myTsumIdx = -1;
  this.overloadPending = false;
  // Same reasoning as `gFever.reset()` in buildRun: the transformation belongs
  // to a round, and the round that just ended has nothing to say about this one.
  lorcanaReset();
  // Bubble-spawning events seen since the last blind sweep: a chain long enough
  // to leave bubbles behind, or a skill activation that does. Only
  // `BubbleStrategy.AllAsap` ever spends them -- see the sweep below.
  let bubbleEvents = 0;
  let zeroPath = 0;
  // The liveness check's debounce, carried across the turns that share it.
  const hud: HudWatch = { misses: 0, firstMissAt: 0 };
  // While the Max Round Duration cap is coasting this round out, when it gives
  // up on that too; 0 while the round is still being played. See the block at
  // the top of the loop.
  let coastUntil = 0;
  // The chain the last turn certainly drew, and how many scans running have
  // found it still standing afterwards -- the stalled-board check above. Null
  // means the last turn drew nothing, or churned the board by some other means,
  // so this scan has nothing to judge.
  let drawnChain: BoardPoint[] | null = null;
  let deadScans = 0;
  while(this.isRunning) {
    // The Max Round Duration cap. Read off `ts` each turn, which is what lets a
    // Quick Bar change land at once, and measured from `roundStartedAt` -- the
    // board coming up, not the walk in.
    if (coastUntil === 0 && this.maxRoundMs > 0
        && Date.now() - this.roundStartedAt >= this.maxRoundMs) {
      const stopping = this.maxRoundAction === MaxRoundAction.Stop;
      logWarn(Log.Play.RoundTimeUp, { ranMs: Date.now() - this.roundStartedAt,
        capMs: this.maxRoundMs, action: this.maxRoundAction });
      this.banner(stopping ? 'Round time up: stopping'
        : 'Round time up: letting the clock run out', 5000);
      if (stopping) {
        // Abandons the round where it stands: `roundEndedAt` is never stamped,
        // which is what has `finishRoundStats` below drop it -- the same as any
        // other mid-round stop. The game is left alone and its own timer ends
        // the round, whether or not anything is still watching.
        requestStop();
        break;
      }
      // Coast. Nothing below runs again; the round then finishes like any
      // other, so the tally, the stats and the next round all follow as usual.
      coastUntil = Date.now() + RoundCoastMaxMs;
    }
    if (coastUntil !== 0) {
      if (Date.now() >= coastUntil) {
        // Left alone for longer than any round can last and still going, so the
        // game's own clock is not running either and there is nothing to wait
        // for. Hand the task back rather than watch for ever -- the chores get
        // their turns, and the next pass walks to the board again.
        logWarn(Log.Play.RoundCoastGaveUp, { ranMs: Date.now() - this.roundStartedAt,
          coastedMs: RoundCoastMaxMs });
        break;
      }
      // Watching, not playing: no scan, no chain, no skill. The liveness check
      // is the whole turn, and the rest is what keeps it cheap.
      this.sleep(RoundCoastPollMs);
      if (this.watchRoundEnd(hud) === RoundLook.Over) {
        break;
      }
      continue;
    }
    let board = this.scanBoardQuick();
    if (board == null) {
      break;
    }
    // Did the last drag do anything? The chain is gone from a board that took
    // it, and standing on a board that refused it.
    if (drawnChain !== null) {
      const held = boardStillHolds(board, drawnChain, DeadScanTolerancePx);
      if (held >= drawnChain.length * DeadScanStillFraction) {
        deadScans++;
        logDebug(Log.Board.DeadScan,
          { held: held, chain: drawnChain.length, deadScans: deadScans });
      } else {
        deadScans = 0;
      }
      drawnChain = null;
    }
    if (deadScans >= DeadScansBeforeFan) {
      // Not gated on `useFan`, unlike both fans below: that setting is a
      // preference about stirring a board that is still playing, and this one
      // has stopped. `fanWouldBeWasted()` is not consulted either -- it answers
      // "the skill is nearly ready", and on a board where nothing clears the
      // gauge never fills, so asking it would refuse the rescue for as long as
      // the stall lasts, which is the whole of it.
      logWarn(Log.Board.Stalled, { deadScans: deadScans, tsums: board.length });
      this.tap(Button.fan, 60);
      this.tap(Button.fan, 60);
      deadScans = 0;
      // Re-scan rather than plan off the pre-fan capture: those positions are
      // where the tsums were before the Fan moved them. Deliberately not a
      // `continue` -- the liveness check at the bottom runs every turn round
      // this loop, and a rescue is no reason to skip one.
      this.settleBoard(DeadScanFanSettleMs);
      board = this.scanBoardQuick();
      if (board == null) {
        break;
      }
    }
    // All Bubbles ASAP: spend them where they are, before a chain can earn
    // them. The other two strategies leave the list for `link` to spend on the
    // first long chain of this batch.
    if (this.bubbleStrategy === BubbleStrategy.AllAsap) {
      this.popGameBubbles();
    }
    logDebug(Log.Board.PathStart);
    // The cap is the "Maximum Chain Number" setting unless the selected skill
    // overrides it (`SkillHandler.chainLimits`).
    let paths = calculatePaths(board, this.myTsumIdx, skillMyTsumPriority(this),
      skillMaxChain(this));
    // The selected skill may have an opinion about which of those to link and
    // in what order -- Formal Suit Beast keeps his two gauges level. Before the
    // cut below, so a skill choosing between colours can reach past the longest
    // chains; every other skill hands the list straight back.
    paths = skillOrderPaths(this, paths, board);
    // Each linked chain is a clear that refreshes the combo timer; the combo
    // is only at risk during the scan gap between batches. More chains per
    // scan means fewer gaps, but chains linked late in a batch can miss
    // because earlier clears already reshuffled the board. The skill may have
    // its own count here too.
    // How many chains the scan *found*, kept before the cut below: the barren
    // check further down asks whether the board has stopped producing chains,
    // and a board cut to fewer than three per scan by the skill's own
    // `chainLimits` would otherwise answer "barren" on every scan of a board
    // covered in them -- and fan the tsums away. Gaston's cut is 1.
    const foundPaths = paths.length;
    paths = paths.splice(0, skillMaxChainsPerScan(this));
    // Catch a gauge that filled during the scan/calculation above before linking.
    this.maybeAutoTapSkill(board);
    const isBubble = this.link(paths, board);
    // What the next scan judges the stall by. `paths[0]` rather than the batch:
    // it is the one chain `link` always draws, where a later one can be left
    // undrawn when a skill fires mid-batch.
    drawnChain = paths.length > 0 ? paths[0] : null;
    if (isBubble) {
      logDebug(Log.Bubble.Generated);
      bubbleEvents++;
    }
    if (foundPaths < 3) {
      zeroPath++;
      if (zeroPath === 6) {
        // Same guard as the periodic fan below. Without it this fires the fan
        // with the skill already full, and useSkill() runs immediately after --
        // so the skill activates onto a board that is still being tossed about.
        // It also self-sustains: a churning board scans as few paths, which is
        // what increments this counter in the first place.
        //
        // Gated on `useFan` like the periodic fan below: the setting is off by
        // default, and a board that stopped producing chains is not a reason to
        // override it. Tested first so the readiness screenshot is skipped outright
        // when the fan is off.
        if (this.useFan && !this.fanWouldBeWasted()) {
          this.tap(Button.fan, 60);
          this.tap(Button.fan, 60);
          // The Fan moved everything, so the chain above says nothing about
          // whether the game took it.
          drawnChain = null;
        }
        zeroPath = 0;
      }
    } else {
      // Counts *consecutive* barren scans: a board that is producing chains is
      // not stuck, and letting the count carry over between them fires the fan
      // on a board that never needed shuffling.
      zeroPath = 0;
    }
    // Before the periodic sweep and the fan below: both are busywork a full
    // gauge should not wait behind. A ready skill used to sit through a blind
    // sweep (and then, for a skill whose beforeActivate swept too, a second
    // one) before its activation tap went out.
    while (this.useSkill(board)) {
      // An activation clears most of what it touches, so the chain drawn above
      // is not evidence about the game refusing it either way.
      drawnChain = null;
      // A skill that ends its own choreography with a bubble sweep has already
      // cleared the board it just filled, so counting towards another sweep
      // here only sweeps an empty one. `sweepsBubbles` is that declaration --
      // it used to be a hardcoded pair of Lightyear ids, which left the eight
      // other skill ids that sweep counting towards a redundant one. Better:
      // its closing sweep just did the periodic sweep's job, so the pending
      // events are spent, not merely unincremented.
      if (!skillSweepsBubbles(this.skillType)) {
        bubbleEvents++;
      } else {
        bubbleEvents = 0;
      }
      // Every Lorcana activation leaves one bubble with an ink stone inside it,
      // and tapping that bubble is what clears the stones already on the board.
      // Aimed, and now rather than at the next chain: it is the one bubble
      // hoarding cannot pay for, since leaving it means the next activation
      // adds another stone to a board that still has all of the last ones.
      // Skipped for a skill that sweeps its own bubbles -- that sweep has just
      // taken this one with it. See src/lorcana.ts.
      if (this.lorcanaCard && !gLorcana.transformed
          && !skillSweepsBubbles(this.skillType)) {
        this.popLorcanaStoneBubble();
      }
      // The burst is what made those bubbles, and several choreographies return
      // before it has finished playing. Let the board settle before any of them
      // is spent, so the chain that spends one is a real chain rather than
      // whatever could be scraped off a board mid-detonation.
      this.bubbleSettleScans = GameBubbleConfig.settleScansAfterSkill;
    }
    // The transformation: while the skill button is still a medallion the
    // card's spot is tapped blind, and the medallion going is the
    // transformation. Rate-limited inside, so most turns round this loop cost
    // nothing.
    this.lorcanaMaybeTapCard();
    // The periodic blind sweep. Only All Bubbles ASAP wants it: it is the one
    // strategy that would rather have a bubble gone than saved, and the sweep
    // catches what the Hough pass in `scanBoardQuick` missed. Under either
    // mid-chain strategy this is exactly the tapping that throws bubbles away,
    // so it does not run -- a skill that needs it asks for it itself
    // (`clearAllBubbles`, declared with `sweepsBubbles`).
    //
    // A standing claim silences it too, whatever the strategy says. `AllAsap`
    // is a preference about bubbles the play loop owns, and while a claim
    // stands it owns none: `bubbleTapBudget` already returns 0 for the aimed
    // pops, and a blind sweep that ignored that would spend the hoard the
    // skill's next activation is counting on -- Gaston's cancel bubble, or
    // Aurora's chain.
    if (this.bubbleStrategy === BubbleStrategy.AllAsap && bubbleEvents >= 2
        && !skillClaimsBubbles(this)) {
      logDebug(Log.Bubble.Cleared);
      bubbleEvents = 0;
      // A popped bubble clears the area around it, which can take the chain
      // above with it whether or not the game ever linked it.
      drawnChain = null;
      // only clearing lower area in order to speed up the cleaning process
      this.clearAllBubbles(0, 0, (Button.gameBubblesFrom.y + Button.gameBubblesTo.y) / 2);
    }
    if (this.useFan && this.runTimes % 4 === 3) {
      // Skip the fan when the skill is nearly ready — the next clear will fill
      // the gauge, so the fan would just be wasted on tsums about to be
      // cleared. (A gauge already full was spent by useSkill above.)
      if (!this.fanWouldBeWasted()) {
        this.tap(Button.fan, 60);
        this.tap(Button.fan, 60);
        // Same as the barren fan above: the board this chain was drawn on is
        // gone, so it is no longer evidence of a stall.
        drawnChain = null;
      }
    }

    // Is the board still up? See `watchRoundEnd` -- it owns the debounce and,
    // on the turn the round is proven over, the stamp and `round.over`.
    const look = this.watchRoundEnd(hud);
    if (look === RoundLook.Over) {
      break;
    }
    if (look === RoundLook.Unreadable) {
      // A paused board, or an animation over one: this turn's scan proves
      // nothing about whether the game took the chain.
      drawnChain = null;
      deadScans = 0;
    }
    this.runTimes++;
  }
  // Captured first: finishRoundStats closes the round by zeroing both, and this
  // is the one figure `round.end` must carry even when it read nothing.
  const roundSeconds = this.roundStartedAt && this.roundEndedAt
    ? Math.round((this.roundEndedAt - this.roundStartedAt) / 1000)
    : 0;
  this.finishRoundStats();
  // The stop signal, and emitted from here rather than from inside
  // finishRoundStats: that returns early when round stats are off, and an event
  // stream must not depend on a stats setting. `lastRound` is what it managed to
  // read; null means it read nothing, and the figures go out as nulls.
  const outcome = this.lastRound;
  this.emit(Emit.Round.End, {
    // The id round.start opened with, and the id of the CSV row this round
    // writes -- so a consumer can join what it reacted to against the row that
    // gets published. `roundSettings` is still this round's: finishRoundStats
    // closes the round without clearing either.
    id: this.roundUid,
    round: this.roundNumber,
    seconds: outcome === null ? roundSeconds : outcome.seconds,
    score: outcome === null ? null : outcome.score,
    baseCoins: outcome === null ? null : outcome.baseCoins,
    finalCoins: outcome === null ? null : outcome.finalCoins,
    medals: outcome === null ? null : outcome.medals,
    settings: statsSettingsPayload(this.roundSettings),
  });
  // Start the wait here rather than at game over: finishRoundStats sees the
  // score screen away, so this measures from the game being back at the start
  // screen -- which is what "between rounds" means to the person who set it.
  if (this.roundDelayMs > 0) {
    this.nextRoundAt = Date.now() + this.roundDelayMs;
    const minutes = Math.round(this.roundDelayMs / 60000);
    logInfo(Log.Play.RoundDelayStarted, { delayMs: this.roundDelayMs,
      nextRoundAt: new Date(this.nextRoundAt).toISOString() });
    this.banner('Next round in ' + minutes + ' min', 4000);
  }
}
