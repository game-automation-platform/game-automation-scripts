// ---------------------------------------------------------------------------
// Lorcana Aurora
//
// Two skills with one gauge between them, either side of the transformation
// that `src/lorcana.ts` plays. Which half runs is `gLorcana.transformed`, and
// this file is the only place that reads it.
//
// **Before the card.** She turns tsums into bubbles and leaves one more with an
// ink stone inside it, so this half is Burst Bubbles: fire, wait for the
// bubbles, pop every one where it stands (`lorcanaAuroraSweepBubbles`), the
// stone's among them. That replaced the blind grid, which cost 2.6s an
// activation and never reached the top of the board. The aimed
// `popLorcanaStoneBubble` is for the *other* Lorcana tsums, the ones playing as
// a plain burst with nothing that sweeps.
//
// **After the card.** Any two bubbles link however far apart they are -- there
// is no reach and no colour, so the whole board is one chain. Releasing it
// bursts the board around the bubbles *and along the drag between them*, which
// is what makes the order matter: the same bubbles chained a different way sweep
// a different amount of board.
//
// Her skill only *adds* to that. Every bubble standing is one a chain can burst
// the board from, whatever put it there, so the claim below (`claimsBubbles`)
// takes bubbles off the Bubble Strategy for the rest of the round.
//
// **An activation draws one chain and hands the board back.** Her burst leaves
// bubbles of its own, and the temptation is to chain those too, and the ones
// after them -- which is what this used to do (a "cascade" of settle, chain,
// settle). Measured off a screen recording of a whole post-card stretch, that
// came to 21 chains over 9 activations averaging 5.3 bubbles each, where the
// bubbles were there for far fewer and far bigger: every chain the cascade drew
// spent bubbles that would otherwise have been standing in the next window's
// route. Three bursts of 5 cross much less board than one of 15, and each of
// those extra chains cost a second and a half waiting for the board first.
//
// So the burst's leavings stand. They are the head start on the next window,
// which is what makes the chains grow instead of resetting to whatever one
// activation happens to spawn. `link` ending its batch when a choreography
// fires mid-batch is the same idea from the other side, since the rest of that
// batch was planned on a board the burst has since blown apart.
//
// The other half is *when*. Her burst clears the board around the bubbles and
// along the drag, so what it is worth is however much board is there to clear,
// and every chain waits for the board to come back before it goes out
// (`lorcanaAuroraAwaitRefill`). Before rather than after, which is the whole of
// it: the wait used to follow the burst, so it was spent by one chain for the
// benefit of the next, and after an activation's chain there is no next.
// Measured, the window chain went out onto 30 tsums where a full board is about
// 43, because her activation takes tsums off the board and the count is only
// two thirds back when the bubbles settle; with the wait ahead of it the same
// chain goes out onto 39-42.
//
// That wait **counts tsums; it does not wait for the board to go still.** Those
// are different questions and they come apart exactly when the screen is
// busiest: a board under score popups and coin showers never goes still while
// being perfectly full, and three waits in a measured round ran their whole
// ceiling out on boards holding 39, 40 and 41. Counted frame by frame off the
// same recording, the board reached its fullest a median of 0.45s after the
// gate and then sat there. So the wait leaves on the count, and a board that
// stops filling *short* of full has one bubble spent on it to shake the last
// slow clear loose (`popKeepBubbles`).
//
// **Between activations nothing chains bubbles at all.** They stand, and the
// next activation's route takes every one of them. Chaining them as they turned
// up spent them three and four at a time -- 21 measured per-scan chains averaged
// 3.5 bubbles against the activations' 5.3 -- and since a chain is worth the
// board it crosses, one route through eight bursts far more than two through
// four. A window that goes wrong now costs the next window, not a scan.
//
// What the play loop does between activations is *make* them. The game pays a
// bubble for a long chain, and "Maximum Chain Number" defaults to 3, which earns
// none: after the card the cap is the skill's (`chainMaxAfterCard`). The board
// still has to keep clearing while the gauge fills, though, and a bubble is the
// fastest clear there is -- so one is tapped into the clear of every second long
// chain (`popEveryChains`), which costs the next route one link.
//
// So the route is planned for spread rather than for speed. It is the opposite
// of a travelling salesman: the longest tour through every bubble, not the
// shortest, because length here is board crossed. `lorcanaAuroraRoute` builds
// one greedily -- start at the bubble farthest from the middle, always go to
// the farthest one left -- and then 2-opts it, which is the same move as the
// classic one with its sign flipped.
//
// Four things the chain has to get right:
//
//   - **the board has to be read at the last moment.** The bubbles arrive over
//     several frames and then drift as the board refills under them -- up to 25
//     play-square px in half a second, most of a bubble -- and worse, a board
//     still clearing *hides* them: six or seven circles where the same board a
//     second and a half later carries ten. So the settle gate is a clock and
//     nothing more (`lorcanaAuroraWaitForBubbles`), the route is planned off a
//     reading taken after the board has come back (`lorcanaAuroraLookNow`), and
//     `lorcanaAuroraDrag` re-reads at every bubble and re-aims what is left of
//     the route, so the plan is never older than one hop. Chaining the gate's
//     list instead drew four bubbles where ten were standing.
//   - **the game has to have taken it.** A drag that goes out before the board
//     is handed back links nothing, and from here looks exactly like one that
//     did. So the release is checked -- the bubbles are read again, and if they
//     are still standing the window goes round again (`lorcanaAuroraBurstCheck`,
//     `chainAttempts`). That check is what lets the wait be short instead of
//     safe.
//   - **the bubble pass has to find all of them.** `findGameBubbles` answers
//     with about two thirds, and a bubble missed here is a bubble the chain
//     never reaches. `lorcanaFindBubbles` is the recall-favouring pass, and its
//     false positives cost a detour rather than a link -- see `bubbleParam2` in
//     `src/lorcana.ts`.
//   - **the drag has to be sampled, not flicked -- and not swept either.** One
//     `moveTo` per point at 10ms is under one display frame, so each bubble is
//     held for a frame and the last one for three. But the game takes one touch
//     event per frame, so a drag costs its event count, and a hop between two
//     bubbles has nothing to cross: it is one move (see `stepsPerHop`).
// ---------------------------------------------------------------------------

// --- Tuning data -----------------------------------------------------------

// `var`, like every other skill's table: a `const` here is lexical, so it is
// not a property of the global object and the offline harness cannot reach it.
var LorcanaAuroraConfig = {
  // --- waiting for the bubbles --------------------------------------------
  //
  // Her activation animation is enormous and not one length. Timed frame by
  // frame across three recordings it covers the board for anywhere from 1.8s
  // to 3.5s after the tap -- it plays a full-screen card some times and not
  // others -- and the bubbles are painted onto the last frames of its fade-out.
  // So the exit is neither a clock nor a count. It is **`bubbleMinCount`
  // circles that have held position for `bubbleStillSpanMs`**, on
  // `bubbleSettleReads` reads running. The animation cannot do that: it draws
  // 0-6 circles a frame, somewhere different each time, never more than two of
  // them twice. Neither can a board still refilling under the bubbles.
  //
  // It used to ask for the *whole* set to hold, same count and all, and that is
  // what the third recording (`debug2.mp4`) caught costing 2.4s and 3.2s on
  // boards that were perfectly still: the recall-favouring pass draws a circle
  // or two round tsums as well, and those flicker in and out between reads, so
  // the count was rarely the same twice. The held subset ignores them. It is
  // the gate only, though: the route takes the last two reads together --
  // everything in the latest, plus what was there a span ago and is missing
  // from it -- because the pass finds each bubble about five reads in six, and
  // a bubble missed on one read is a link lost where a circle drawn round a
  // tsum is a detour.
  //
  // The span is compared against a read that old rather than the previous one
  // because the poll is fast: at 30ms a bubble drifting 55px/s moves under 2px
  // between reads, which the tolerance cannot see. Over 150ms it moves 8.
  //
  // Reads are cheap on this host -- ~4ms for the capture and the Hough pass
  // together, measured off the log -- which is what makes a 30ms poll and a
  // re-read per hop affordable at all.
  bubblePollMs: 30,
  bubbleStillSpanMs: 150,
  bubbleSettleReads: 2,
  bubbleMinCount: 3,
  // No pass before this long after the tap, whatever holds still. Bubbles kept
  // standing from before are visible for the ~250ms until the card covers the
  // board, and three of them would pass the gate into a drag the game ignores.
  // The animation is never under 1.8s.
  bubbleEarliestMs: 1500,
  // How far a bubble may move over the span and still be the same bubble, in
  // play-square px. A bubble is ~33 across there; a settled one moves 1 or 2,
  // a drifting one 8 or more.
  bubbleStableTolerance: 4,
  // The window's whole budget from the activation tap, retries included, and
  // the pre-card sweep's own. Past either the latest reading is used as it
  // stands. Running out is no longer the end of anything: whatever is standing
  // goes into the next activation's route. The sweep's is shorter because it has
  // no retry, and a board with fewer than `bubbleMinCount` bubbles on it would
  // otherwise stand the whole budget.
  //
  // Nine seconds so `chainAttempts` means what it says. At six, an attempt
  // costing a 2.9s gate plus the board wait plus a 0.6s release check left room
  // for two, so a window whose drag the game refused twice gave up with a third
  // attempt it was configured to have. Both refusals in the measured round were
  // that shape.
  bubbleWaitMs: 9000,
  sweepWaitMs: 4000,
  // Taps that land in the lull before the game takes input back pop nothing --
  // on 6 of 18 sweeps the second look found every bubble still up. So the sweep
  // looks again `sweepPassGapMs` after each pass and taps what is left, up to
  // `sweepPasses`, stopping once at most one circle remains.
  //
  // Two passes and a short gap because the measured sweep averaged 2.3 passes
  // and ended with 0.6 circles up: the third pass almost never ran and the
  // 300ms gaps were most of what made this 4.8s against the blind grid's 2.6s.
  sweepPasses: 2,
  sweepPassGapMs: 150,
  // Drags one window may draw before handing the bubbles back to the play
  // loop. The second is the one that earns its keep: a drag that went out
  // during the fade-out, before the game takes input, is found out at the
  // release and drawn again once the board is back.
  chainAttempts: 3,

  // --- between activations -------------------------------------------------
  //
  // Nothing chains bubbles here -- see the header -- so what the play loop does
  // between activations is make more of them. The game pays a bubble for a long
  // chain, and the "Maximum Chain Number" setting defaults to 3, which never
  // earns one; after the card this is the cap instead.
  //
  // 12 because that is the length `Tsum.link` already treats as reliably worth a
  // bubble: the drawn chain comes out shorter than the plan, so the seven the
  // game asks for wants twelve planned. 0 would be uncapped, and is the other
  // end worth a round -- it clears more board per drag but links fewer chains,
  // and it is chains that earn bubbles, not tsums.
  chainMaxAfterCard: 12,
  // One bubble is tapped into the clear of every `popEveryChains`th chain of at
  // least `popChainMin` tsums. The board has to keep clearing while the gauge
  // fills and a bubble is the fastest clear there is; set against that, each one
  // spent is a link out of the next activation's route.
  //
  // The count is held rather than spent when no bubble is on the board, so the
  // first one to appear after a drought is popped instead of the first long
  // chain after it.
  popChainMin: 6,
  popEveryChains: 2,

  // --- the route -----------------------------------------------------------
  //
  // 2-opt passes over each greedy route, maximising total length. Two is
  // measured, not guessed: four changed none of the fifteen captures (see
  // `lorcanaAuroraRoute`). `routeMaxBubbles` is the cap on how many points the
  // planner will take at all -- the construction is O(n^3) over the starts, so
  // a frame the bubble pass drew twenty circles on cannot cost a round.
  routePasses: 2,
  routeMaxBubbles: 24,

  // --- the drag ------------------------------------------------------------
  //
  // One touch event per display frame, and as few of them as the chain needs.
  // The third recording put the chain graphic against the log: a drag paced at
  // 5ms a step grew ~16ms a step on screen, one 60Hz frame per event however
  // fast they are sent -- and 70 chain records off three rounds then fitted
  // `dragMs = moves x 16 + ~110` exactly, so a drag costs what it sends. It used
  // to sweep every hop in 20px steps, up to twelve a hop: four events in five.
  // After the card nothing between two bubbles has to be crossed -- any bubble
  // links to any other, and the game draws its own vine between their centres
  // -- so a hop is one move. `stepsPerHop` is the way back if a jumped hop ever
  // fails to link (Rapunzel+ sweeps two). `linkTsums`' 10/10/10 is left alone.
  grabMs: 30,
  dwellMs: 20,
  stepMs: 16,
  stepsPerHop: 0,
  // Extra holds on the last bubble before the release. Six planned, five
  // linked, and the one missing was the last: a move and a release landing in
  // the same frame is a link the game does not count.
  lastHoldMoves: 2,
  releaseMs: 20,
  // How far a bubble may be from where it was last seen and still be the same
  // bubble, in play-square px -- when the route is re-aimed at each hop, and
  // when the release check follows it. The worst drift measured is ~6px/100ms.
  trackTolerancePx: 14,

  // --- after the release ---------------------------------------------------
  //
  // The burst covers the board within a frame of the release, so a route whose
  // bubbles are still standing `burstCheckMs` later was not taken. Polled
  // rather than slept, so a burst that did happen costs a couple of reads.
  burstCheckMs: 600,
  burstCheckPollMs: 30,
  /** The chain was taken once at most this fraction of its bubbles is seen... */
  burstGoneFraction: 0.5,
  // ...on this many reads running. The pass misses a standing bubble one read
  // in six, so one read's misses can pass for a burst; two agreeing cannot.
  burstGoneReads: 2,
  // --- waiting for the board to come back ----------------------------------
  //
  // **Count the tsums; do not wait for stillness.** Those are different
  // questions and they come apart exactly when the screen is busiest.
  // `Tsum.settleBoard` was asked the stillness one, and on a board carrying
  // score popups and coin showers it never gets a yes: three of eight waits in
  // a measured round ran the whole ceiling and reported `refilled: false` on
  // boards holding 39, 40 and 41 tsums, which is full. Meanwhile the same
  // recording, counted frame by frame, showed the board reaching its fullest a
  // median of 0.45s after the gate and then sitting there for another one to two
  // seconds while the wait ran on.
  //
  // The wait goes **before** the chain, never after it, and that is the whole
  // point rather than a detail. Waiting afterwards spends the time and hands
  // the benefit to whatever comes next -- and an activation draws one chain, so
  // nothing came next and it was spent on nobody. Waiting first spends the same
  // time on the chain that is about to go out.
  //
  // What it buys is measured. The chain was going out onto 30 tsums where a
  // full board is about 43: the activation takes tsums off the board and the
  // count is only two thirds back when the bubbles have settled. Her burst
  // clears the board around the bubbles and along the drag, so a third of the
  // board missing is a third of the burst missing. With the wait ahead of it the
  // same chain measured 39-42.
  //
  // So the wait leaves the moment the board is worth bursting, on either of two
  // answers: `refillEnoughTsums` showing, or the count no longer beating its
  // best for `refillStaleReads` reads, which says it has finished filling
  // wherever it got to. A count is one capture and one Hough pass, ~10ms, so
  // polling it is affordable at the rate below.
  //
  // 40 because a full board measures ~43 and the counts wander a few either way;
  // three stale reads at 80ms is a quarter-second of confirmation, against peaks
  // that arrived a median of 0.45s in.
  refillPollMs: 80,
  refillStaleReads: 3,
  refillEnoughTsums: 40,
  // Least time spent, even on a board that reads full on the first count. The
  // floor is for the *bubbles*, not the tsums: `lorcanaAuroraLookNow` reads the
  // board straight after this, and leaving on the gate's own frame would hand
  // it the reading the gate already had -- which is the whole thing that fix
  // was for. Measured, the wait is worth about a bubble (`atGate` 5.2 against
  // `seen` 5.9 over a round).
  refillMinMs: 250,
  // The ceiling, for a board that neither fills nor stops trying.
  refillWaitMs: 2500,
  // A board that stops filling *short* of full is one the game is still
  // clearing a few tsums at a time -- and one bubble blows that away at once
  // where waiting cannot. So it is spent: tapped, and the wait carries on.
  //
  // Once per wait, and only with this many bubbles standing, because the bubble
  // comes out of the chain that is about to go out. The most central one goes:
  // the route is scored on how much board it crosses, so a bubble near the
  // middle of the pile is the cheapest one to lose.
  //
  // SPECULATIVE. The board reaching its fullest 0.45s in says most waits have
  // nothing to unstick, so this fires on the minority that plateau low -- three
  // of eight in the measured round, at 34, 37 and 39. Whether a burst on a
  // fuller board beats a burst with one more link in it is not measured;
  // `poppedToFill` on a chain record against `tsums` is what will say.
  popKeepBubbles: 4,

  // A bubble found on its own is not a chain. Tapped instead, so it is at least
  // spent -- the same call the stone handling makes.
  tapDuring: 10,
};

/** Between activations: long chains linked since a bubble was last tapped. */
var LorcanaAuroraPlay = { longChains: 0 };

// --- Waiting for the bubbles ------------------------------------------------

/** A play-square point as the screen coordinate the touch natives want. */
function lorcanaAuroraToScreen(ts: Tsum, p: Point): Point {
  return {
    x: Math.floor(ts.playOffsetX + p.x * ts.playWidth / ts.playResizeWidth),
    y: Math.floor(ts.playOffsetY + p.y * ts.playHeight / ts.playResizeHeight),
  };
}

/** The point in `list` nearest to `p` within `tolerance` on both axes, or null. */
function lorcanaAuroraNearest<T extends Point>(list: T[], p: Point, tolerance: number): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (let i = 0; i < list.length; i++) {
    const dx = Math.abs(list[i].x - p.x);
    const dy = Math.abs(list[i].y - p.y);
    if (dx <= tolerance && dy <= tolerance && dx + dy < bestD) {
      bestD = dx + dy;
      best = list[i];
    }
  }
  return best;
}

/** Those of `now` that sit where one of `before` did, within `tolerance`. */
function lorcanaAuroraHeldStill(now: LorcanaBubble[], before: Point[],
                                tolerance: number): LorcanaBubble[] {
  const held: LorcanaBubble[] = [];
  for (let i = 0; i < now.length; i++) {
    if (lorcanaAuroraNearest(before, now[i], tolerance) != null) {
      held.push(now[i]);
    }
  }
  return held;
}

/**
 * `now` plus whatever `before` had that `now` does not, matched at the tracking
 * tolerance so a bubble that drifted between the reads is one bubble. The pass
 * misses each bubble about one read in six, and a bubble missed is a link lost.
 */
function lorcanaAuroraMerge(now: LorcanaBubble[], before: LorcanaBubble[]): LorcanaBubble[] {
  const out = now.slice();
  for (let i = 0; i < before.length; i++) {
    if (lorcanaAuroraNearest(now, before[i], LorcanaAuroraConfig.trackTolerancePx) == null) {
      out.push(before[i]);
    }
  }
  return out;
}

/** A reading of the board's bubbles, and what it cost to get it. */
interface LorcanaAuroraLook {
  /** What to chain: the last two reads together once settled, else the last read as it stands. */
  bubbles: LorcanaBubble[];
  /** Circles in the last read, held or not. */
  seen: number;
  /** What the settle gate saw, before the board came back. See `lorcanaAuroraLookNow`. */
  atGate: number;
  /** Bubbles were seen to hold still, rather than the budget running out. */
  settled: boolean;
  /** Since the activation tap (or the per-scan call). */
  waitMs: number;
  reads: number;
}

/**
 * The bubbles on the board, once a few of them have stopped moving.
 *
 * Polls every `bubblePollMs` until at least `minCount` circles have sat within
 * `bubbleStableTolerance` of where they were `bubbleStillSpanMs` ago, on
 * `bubbleSettleReads` reads running -- or until `until`, and never before
 * `from + bubbleEarliestMs`. See `bubblePollMs`
 * for why the comparison reaches back a span rather than one read, why it is
 * the held subset and not the whole set, and why the reading handed back is
 * the latest read plus what the one a span earlier had that it does not.
 *
 * **This is a clock, not a plan.** What it hands back says the animation is
 * over, and the window then waits for the board and reads the bubbles again
 * (`lorcanaAuroraLookNow`) -- because the board this exits onto is still
 * clearing, and a clearing board hides bubbles. Never refuses to chain: running
 * out of budget hands back the last read as it stands, with `settled` false, so
 * a window spent under the animation is a line in the log rather than a chain
 * that quietly never happened.
 */
function lorcanaAuroraWaitForBubbles(ts: Tsum, from: number, until: number,
                                     minCount: number): LorcanaAuroraLook {
  const cfg = LorcanaAuroraConfig;
  const history: {at: number, bubbles: LorcanaBubble[]}[] = [];
  let found: LorcanaBubble[] = [];
  let held: LorcanaBubble[] = [];
  let old: LorcanaBubble[] | null = null;
  let agreed = 0;
  let settled = false;
  let reads = 0;
  while (ts.isRunning && Date.now() < until) {
    const at = Date.now();
    found = lorcanaFindBubbles(ts);
    reads++;
    // The newest read at least a span older than this one, if there is one yet.
    old = null;
    for (let i = history.length - 1; i >= 0; i--) {
      if (at - history[i].at >= cfg.bubbleStillSpanMs) {
        old = history[i].bubbles;
        break;
      }
    }
    history.push({at: at, bubbles: found});
    while (history.length > 1 && at - history[1].at >= cfg.bubbleStillSpanMs) {
      history.shift();
    }
    held = old ? lorcanaAuroraHeldStill(found, old, cfg.bubbleStableTolerance) : [];
    agreed = held.length >= minCount ? agreed + 1 : 0;
    if (agreed >= cfg.bubbleSettleReads && at - from >= cfg.bubbleEarliestMs) {
      settled = true;
      break;
    }
    ts.sleep(cfg.bubblePollMs);
  }
  // Settled: the latest read, plus whatever the read a span ago had that it
  // does not, so one missed detection is not a bubble left out of the chain.
  const bubbles = settled && old != null ? lorcanaAuroraMerge(found, old) : found;
  return {
    bubbles: bubbles,
    seen: found.length,
    atGate: found.length,
    settled: settled,
    waitMs: Date.now() - from,
    reads: reads,
  };
}

/**
 * The bubbles on the board **now**, off two reads a poll apart.
 *
 * Run after the board has come back, never before it, and that ordering is the
 * whole of it. Read off a screen recording against its log: the settle gate
 * exits onto a board that is still clearing -- tsums greyed out mid-clear, the
 * last chain's flash across it -- where the pass finds six or seven circles,
 * and a second and a half later the same board is clean and carries ten. The
 * window used to chain the gate's list, so it drew four where ten were
 * standing, which from the outside looks like it did not chain the bubbles at
 * all. `atGate` against `seen` on a chain record is that gap.
 *
 * Two reads because the pass misses each bubble about one read in six, merged
 * the way the gate merges its last two, so one missed detection is not a link
 * lost. The gate's timings are carried through: they are what it was for.
 */
function lorcanaAuroraLookNow(ts: Tsum, gate: LorcanaAuroraLook): LorcanaAuroraLook {
  const cfg = LorcanaAuroraConfig;
  const first = lorcanaFindBubbles(ts);
  ts.sleep(cfg.bubblePollMs);
  const found = lorcanaFindBubbles(ts);
  return {
    bubbles: lorcanaAuroraMerge(found, first),
    seen: found.length,
    atGate: gate.atGate,
    settled: gate.settled,
    waitMs: gate.waitMs,
    reads: gate.reads + 2,
  };
}

// --- Chaining them ----------------------------------------------------------

/** What one chain attempt came to. */
interface LorcanaAuroraChain {
  /** Points in the route drawn (0 or 1 when nothing was drawn). */
  chain: number;
  /** The game burst the bubbles, rather than leaving them standing. */
  took: boolean;
}

/** What the board came to before a chain was drawn onto it. */
interface LorcanaAuroraBoard {
  /** It reached `refillEnoughTsums`, rather than stalling short or running the ceiling out. */
  refilled: boolean;
  /** Tsums showing when the wait ended -- what the burst has to work with. */
  count: number;
  /** The fullest it was seen during the wait. */
  peak: number;
  /** A bubble was spent to unstick a board that had stopped filling short of full. */
  popped: boolean;
  ms: number;
}

/** How many tsums the board is showing. One capture, one Hough pass. */
function lorcanaAuroraCountTsums(ts: Tsum): number {
  const img = ts.playScreenshotSquare();
  let gray: NativeImage | null = null;
  try {
    gray = buildBoardGray(img);
    return findTsumCount(gray);
  } finally {
    if (gray != null) { releaseImage(gray); }
    releaseImage(img);
  }
}

/**
 * Tap the most central bubble, to unstick a board that has stopped filling.
 *
 * Central because the route is scored on how much board it crosses, so a bubble
 * near the middle of the pile is the one the chain misses least. Answers whether
 * it found one to spend -- see `popKeepBubbles`.
 */
function lorcanaAuroraPopOneBubble(ts: Tsum): boolean {
  const cfg = LorcanaAuroraConfig;
  const bubbles = lorcanaFindBubbles(ts);
  if (bubbles.length < cfg.popKeepBubbles) { return false; }
  const mid = ts.playResizeWidth / 2;
  let best = 0;
  for (let i = 1; i < bubbles.length; i++) {
    if (lorcanaAuroraDistance(bubbles[i], {x: mid, y: mid})
        < lorcanaAuroraDistance(bubbles[best], {x: mid, y: mid})) {
      best = i;
    }
  }
  const p = lorcanaAuroraToScreen(ts, bubbles[best]);
  tap(p.x, p.y, cfg.tapDuring);
  return true;
}

/**
 * Wait for the board to be worth bursting, and say what it came to.
 *
 * Run **before** a chain is drawn, never after it -- see `refillWaitMs`. Counts
 * tsums rather than watching for stillness, because a board carrying score
 * popups and coin showers never goes still while being perfectly full: that is
 * the whole of the note in the table above. Leaves on `refillEnoughTsums`
 * showing, or on the count having stopped beating its best, or on the ceiling.
 *
 * A board that stalls short of full gets one bubble spent on it
 * (`lorcanaAuroraPopOneBubble`), once, and then the wait carries on.
 */
function lorcanaAuroraAwaitRefill(ts: Tsum): LorcanaAuroraBoard {
  const cfg = LorcanaAuroraConfig;
  const startedAt = Date.now();
  const until = startedAt + cfg.refillWaitMs;
  let count = lorcanaAuroraCountTsums(ts);
  let peak = count;
  let stale = 0;
  let popped = false;
  while (ts.isRunning && Date.now() < until) {
    // Against the peak, not the latest count: the count dips while a clear is
    // going off, and a board that has *been* full has filled -- waiting out the
    // dip only spends the time the dip already cost.
    if (peak >= cfg.refillEnoughTsums && Date.now() - startedAt >= cfg.refillMinMs) {
      break;
    }
    if (stale >= cfg.refillStaleReads) {
      // It has finished filling and it is not full. Nothing more is coming on
      // its own, so either spend a bubble to shake it loose or go with this.
      if (popped || !lorcanaAuroraPopOneBubble(ts)) { break; }
      popped = true;
      stale = 0;
    }
    ts.sleep(cfg.refillPollMs);
    count = lorcanaAuroraCountTsums(ts);
    if (count > peak) { peak = count; stale = 0; } else { stale++; }
  }
  return {
    refilled: peak >= cfg.refillEnoughTsums,
    count: count,
    peak: peak,
    popped: popped,
    ms: Date.now() - startedAt,
  };
}

/**
 * Chain the bubbles in `look`, check the game took the chain, and say so.
 *
 * `attempt` is which drag of the window this is, for the log. A bubble found on
 * its own is tapped rather than left: nothing else is going to pop it now
 * (`claimsBubbles`), and a window that found only one is not going to do better
 * by leaving it.
 *
 * Waits for nothing and leaves nothing to wait for: `board` is what the caller
 * already established about the board this is being drawn onto, and the moment
 * the burst is confirmed the caller has the board back. See `refillWaitMs`.
 */
function lorcanaAuroraChainBubbles(ts: Tsum, look: LorcanaAuroraLook, from: number, attempt: number,
                                   board: LorcanaAuroraBoard): LorcanaAuroraChain {
  const cfg = LorcanaAuroraConfig;
  const route = lorcanaAuroraRoute(look.bubbles);
  const planned = lorcanaAuroraSpan(route);
  let drag = {moves: 0, reaimed: 0};
  let burst = {gone: false, left: route.length, checkMs: 0};
  let dragMs = 0;
  if (route.length >= 2) {
    const dragAt = Date.now();
    // Its own drag, not `linkTsums` and emphatically not `link`: the pacing is
    // the point (see `lorcanaAuroraDrag`), and `link`'s `maybeAutoTapSkill`
    // would re-enter this choreography the moment the clear refilled the gauge.
    drag = lorcanaAuroraDrag(ts, route);
    dragMs = Date.now() - dragAt;
    burst = lorcanaAuroraBurstCheck(ts, route);
  } else if (route.length === 1) {
    const p = lorcanaAuroraToScreen(ts, route[0]);
    tap(p.x, p.y, cfg.tapDuring);
  }

  const fields = {
    // The field to read first when the clear looks small. `chain` well under
    // what the skill spawns means the reading was short; a full `chain` with
    // `left` high means the game did not take the drag.
    chain: route.length,
    seen: look.seen,
    // What the settle gate saw against what the board carried once it came back
    // (`seen`). `atGate` well under `seen` is the wait earning its keep; the two
    // close together on a small chain means the board really had that few.
    atGate: look.atGate,
    // Whether the bubbles were seen to hold still, which is the gate: `false`
    // is a window spent entirely under the activation animation.
    settled: look.settled,
    attempt: attempt,
    // How much board the route crosses as planned, in play-square px (the
    // square is 200 across, so this is comparable between rounds and devices).
    spanPx: Math.round(planned),
    moves: drag.moves,
    // Route points moved by more than a couple of px when re-aimed mid-drag:
    // how much the bubbles were still drifting under the chain.
    reaimed: drag.reaimed,
    waitMs: look.waitMs,
    reads: look.reads,
    dragMs: dragMs,
    // The release check: how long it looked, and how many of the route's
    // bubbles were still standing when it stopped.
    checkMs: burst.checkMs,
    left: burst.left,
    // The board this chain was drawn onto: how long the wait took, how many
    // tsums were showing when the drag went out, the fullest it got, whether it
    // reached `refillEnoughTsums`, and whether a bubble was spent to unstick it.
    // `tsums` is the one that says how big a burst this could have been -- a
    // full board is around 43.
    waitedMs: board.ms,
    tsums: board.count,
    peakTsums: board.peak,
    refilled: board.refilled,
    poppedToFill: board.popped,
    // The skill gauge straight after the release, for the drags the game does
    // not take. Her bubbles only link while the transformed skill is running,
    // so a refused chain with the gauge still reading full is an activation that
    // never fired -- which the gauge check cannot tell from one that did, since
    // anything unexpected over the button reads Active (`classifySkillGauge`).
    gauge: ts.checkSkillReadinessFast(),
    totalMs: Date.now() - from,
  };
  // Three events, because a chain the game took, a chain it did not and a
  // window that drew nothing are different news.
  if (route.length >= 2 && burst.gone) {
    logInfo(Log.Skill.LorcanaAuroraDone, fields);
  } else if (route.length >= 2) {
    logWarn(Log.Skill.LorcanaAuroraStayed, fields);
  } else {
    logWarn(Log.Skill.LorcanaAuroraNoChain, fields);
  }
  return {
    chain: route.length,
    took: route.length >= 2 && burst.gone,
  };
}

/**
 * Did the game take the chain? A burst takes the bubbles off the board within
 * a frame of the release; a drag it ignored leaves them standing, drifting a
 * little. So each route point is *followed* read to read -- moved to the
 * nearest circle within `trackTolerancePx` of where it was last seen -- rather
 * than matched against where the drag left it: at 8px a bubble that had merely
 * drifted read as gone, and a chain of 7 passed as taken with six still up.
 * Gone is `burstGoneFraction` or fewer seen on `burstGoneReads` reads running.
 *
 * `route` is the drag as drawn -- the re-aimed points, not the plan.
 */
function lorcanaAuroraBurstCheck(ts: Tsum, route: Point[]): {gone: boolean, left: number, checkMs: number} {
  const cfg = LorcanaAuroraConfig;
  const start = Date.now();
  const last: Point[] = route.map(p => ({x: p.x, y: p.y}));
  let left = route.length;
  let goneReads = 0;
  while (ts.isRunning) {
    const now = lorcanaFindBubbles(ts);
    left = 0;
    for (let i = 0; i < last.length; i++) {
      const near = lorcanaAuroraNearest(now, last[i], cfg.trackTolerancePx);
      if (near != null) {
        last[i] = {x: near.x, y: near.y};
        left++;
      }
    }
    goneReads = left <= route.length * cfg.burstGoneFraction ? goneReads + 1 : 0;
    if (goneReads >= cfg.burstGoneReads) {
      return { gone: true, left: left, checkMs: Date.now() - start };
    }
    if (Date.now() - start >= cfg.burstCheckMs) { break; }
    ts.sleep(cfg.burstCheckPollMs);
  }
  return { gone: false, left: left, checkMs: Date.now() - start };
}

// --- The route --------------------------------------------------------------

function lorcanaAuroraDistance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Total length of a route, which is what the ordering is chosen to maximise. */
function lorcanaAuroraSpan(route: Point[]): number {
  let sum = 0;
  for (let i = 1; i < route.length; i++) {
    sum += lorcanaAuroraDistance(route[i - 1], route[i]);
  }
  return sum;
}

/**
 * Farthest-next from one starting bubble: from each bubble, go to the one left
 * that is farthest away. On its own that already zig-zags from one side of the
 * board to the other, which is the shape wanted.
 */
function lorcanaAuroraGreedy(pts: Point[], start: number): Point[] {
  const left = pts.slice();
  const route: Point[] = [left.splice(start, 1)[0]];
  while (left.length > 0) {
    const from = route[route.length - 1];
    let far = 0;
    for (let i = 1; i < left.length; i++) {
      if (lorcanaAuroraDistance(left[i], from) > lorcanaAuroraDistance(left[far], from)) {
        far = i;
      }
    }
    route.push(left.splice(far, 1)[0]);
  }
  return route;
}

/**
 * 2-opt, in place, accepting a reversal when it makes the route *longer* --
 * the classic move with its sign flipped, since here length is board crossed.
 */
function lorcanaAurora2Opt(route: Point[], passes: number): Point[] {
  for (let pass = 0; pass < passes; pass++) {
    let improved = false;
    for (let i = 1; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        // The two edges reversing route[i..j] replaces. j+1 off the end means
        // the segment reaches the last point, where there is one edge to weigh
        // rather than two.
        const before = lorcanaAuroraDistance(route[i - 1], route[i])
          + (j + 1 < route.length ? lorcanaAuroraDistance(route[j], route[j + 1]) : 0);
        const after = lorcanaAuroraDistance(route[i - 1], route[j])
          + (j + 1 < route.length ? lorcanaAuroraDistance(route[i], route[j + 1]) : 0);
        if (after > before) {
          const flipped = route.slice(i, j + 1).reverse();
          for (let k = 0; k < flipped.length; k++) { route[i + k] = flipped[k]; }
          improved = true;
        }
      }
    }
    if (!improved) { break; }
  }
  return route;
}

/**
 * Every bubble, in the order that crosses the most board.
 *
 * Greedy from every bubble in turn, each run 2-opted, and the longest of them
 * kept. The single start this began as -- the bubble farthest from the middle
 * of the pile, so the route has the whole board in front of it -- is a good
 * one, but it is not reliably the best one, and trying them all is free at this
 * size: n greedy runs and n 2-opts over a handful of points, which for eight
 * bubbles is a few thousand distances.
 *
 * Scored against the exact longest Hamiltonian path (brute force, n <= 8) over
 * the fifteen Lorcana captures: the single start comes out at 82.7% of optimal
 * at worst and 91.6% on average, and trying every start takes that to 97.7% at
 * worst with eleven of the fifteen exactly optimal. Raising `routePasses` from
 * 2 to 4 changed not one of them, which is why it is 2.
 *
 * The bubbles chained are the same set whichever order comes out, so nothing
 * here can lose one; all it moves is how much board the drag between them
 * crosses.
 */
function lorcanaAuroraRoute(bubbles: LorcanaBubble[]): Point[] {
  const cfg = LorcanaAuroraConfig;
  const pts: Point[] = [];
  for (let i = 0; i < bubbles.length && i < cfg.routeMaxBubbles; i++) {
    pts.push({x: bubbles[i].x, y: bubbles[i].y});
  }
  if (pts.length < 2) { return pts; }

  let best: Point[] = [];
  let bestSpan = -1;
  for (let start = 0; start < pts.length; start++) {
    const route = lorcanaAurora2Opt(lorcanaAuroraGreedy(pts, start), cfg.routePasses);
    const span = lorcanaAuroraSpan(route);
    if (span > bestSpan) {
      bestSpan = span;
      best = route;
    }
  }
  return best;
}

// --- The drag ---------------------------------------------------------------

/**
 * Draw the route, re-aiming it as it goes, and say what it took.
 *
 * At every bubble the board is read again and each point still ahead is moved
 * to the circle now nearest it (within `trackTolerancePx`), so a bubble that
 * drifted since the plan is met where it is. `route` is updated in place --
 * what the caller holds afterwards is the drag as drawn, which is what the
 * release check needs. A point with no circle near it keeps its plan: the
 * chain's own glow can hide a linked bubble from the pass, and a detour is
 * cheaper than a lost link.
 *
 * Each bubble's centre is held for `dwellMs` -- a display frame, so it is some
 * frame's final position whatever the moves coalesce into -- and the last one
 * for `lastHoldMoves` more. The hop between two bubbles is one move: the game
 * takes one touch event per frame, so every extra move is a frame spent, and
 * there is nothing on the way that has to be crossed (see `stepsPerHop`).
 *
 * Positions arrive as play-square centres, not the top-left corners the board
 * array holds, so no half-tsum goes back on.
 */
function lorcanaAuroraDrag(ts: Tsum, route: Point[]): {moves: number, reaimed: number} {
  // A stopped run draws no new chain -- the same rule as `linkTsums`.
  if (!ts.isRunning || route.length < 2) { return {moves: 0, reaimed: 0}; }
  const cfg = LorcanaAuroraConfig;
  let moves = 1;
  let reaimed = 0;
  let at = lorcanaAuroraToScreen(ts, route[0]);
  tapDown(at.x, at.y, cfg.grabMs);
  moveTo(at.x, at.y, cfg.dwellMs);
  for (let i = 1; i < route.length; i++) {
    const now = lorcanaFindBubbles(ts);
    for (let j = i; j < route.length; j++) {
      const near = lorcanaAuroraNearest(now, route[j], cfg.trackTolerancePx);
      if (near == null) { continue; }
      if (Math.abs(near.x - route[j].x) > 2 || Math.abs(near.y - route[j].y) > 2) { reaimed++; }
      route[j] = {x: near.x, y: near.y};
    }
    const to = lorcanaAuroraToScreen(ts, route[i]);
    for (let s = 1; s <= cfg.stepsPerHop; s++) {
      const f = s / (cfg.stepsPerHop + 1);
      moveTo(Math.floor(at.x + (to.x - at.x) * f), Math.floor(at.y + (to.y - at.y) * f), cfg.stepMs);
      moves++;
    }
    moveTo(to.x, to.y, cfg.dwellMs);
    moves++;
    at = to;
  }
  for (let k = 0; k < cfg.lastHoldMoves; k++) {
    moveTo(at.x, at.y, cfg.dwellMs);
    moves++;
  }
  tapUp(at.x, at.y, cfg.releaseMs);
  return {moves: moves, reaimed: reaimed};
}

// --- The pre-card sweep -----------------------------------------------------

/**
 * Pop every bubble the untransformed skill left, where it stands.
 *
 * Same gate as the chain, so the taps go out once the bubbles are there and
 * still; then every circle is tapped, and `sweepPassGapMs` later the board is
 * looked at again and what still stands is tapped, up to `sweepPasses` times --
 * taps in the lull before the game takes input back pop nothing, the pass
 * misses a bubble one read in six, and a circle drawn round a tsum costs one
 * tap the game ignores. Nothing
 * here asks which bubble holds the stone: before the card they are all spent.
 *
 * Nothing is waited on afterwards. The pops set off clears the board is still
 * running when this returns, and the blind grid this replaced left it that way
 * too -- the play loop's next scan finds fewer chains on a churning board and
 * the one after it does not, which is a scan against the ~700ms a settle costs
 * on every one of the eight or nine activations before the card.
 *
 * It ends the card check's quiet instead (`lorcanaEndSkillQuiet`). The gate
 * above only returns once bubbles have been seen holding still on the board,
 * which is proof the activation animation is over and the skill button is
 * legible again -- and until the transformation is noticed, an activation
 * lands here and pops bubbles the transformed skill meant for a chain.
 */
function lorcanaAuroraSweepBubbles(ts: Tsum, from: number): void {
  const cfg = LorcanaAuroraConfig;
  const look = lorcanaAuroraWaitForBubbles(ts, from, from + cfg.sweepWaitMs, cfg.bubbleMinCount);
  let tapped = 0;
  const pop = (list: Point[]) => {
    for (let i = 0; i < list.length && ts.isRunning; i++) {
      const p = lorcanaAuroraToScreen(ts, list[i]);
      tap(p.x, p.y, cfg.tapDuring);
      tapped++;
    }
  };
  let targets: Point[] = look.bubbles;
  let left = 0;
  let passes = 0;
  while (targets.length > 0 && passes < cfg.sweepPasses && ts.isRunning) {
    pop(targets);
    passes++;
    ts.sleep(cfg.sweepPassGapMs);
    targets = lorcanaFindBubbles(ts);
    left = targets.length;
    // One circle left is as likely a tsum as a bubble; a bubble it is, the
    // Bubble Strategy pops it on the next long chain.
    if (left <= 1) { break; }
  }
  // The play loop's own list was read before these taps -- see `popLorcanaStoneBubble`.
  ts.gameBubbles = [];
  // The board was legible enough to find settled bubbles on, so the animation
  // is over and the medallion can be read again -- see the note above.
  lorcanaEndSkillQuiet();
  logInfo(Log.Skill.LorcanaAuroraSwept, {
    // `settled: false` with a small `seen` is a board the gate never saw three
    // bubbles hold on -- the budget ran out and the last read was tapped anyway.
    seen: look.seen,
    settled: look.settled,
    waitMs: look.waitMs,
    reads: look.reads,
    popped: look.bubbles.length,
    passes: passes,
    // Circles still up on the last look. `passes` at the cap with `left` high
    // is a sweep the game never took.
    left: left,
    tapped: tapped,
    totalMs: Date.now() - from,
  });
}

registerSkill({
  types: [SkillType.LorcanaAurora],
  // NOT `bareTapActivates`, even though the pre-card half is a burst that a
  // bare tap does fire. That flag lets `maybeAutoTapSkill` spend the gauge
  // without ever entering `afterActivate`, which after the card would spawn the
  // bubbles and never chain them -- the skill would look like it had done
  // nothing. One gauge read per auto-tap is what that costs, and it is the same
  // read every other choreographed skill already pays.
  //
  // No `extraClusterSlots` either: the ink stones need one, but so do the ones
  // on every other Lorcana tsum's board, so that is claimed by
  // `lorcanaExtraClusterSlots` off the setting rather than here off the skill.
  sweepsBubbles: true,
  // After the card every bubble on the board is a link in her next chain, so
  // they stop being the Bubble Strategy's to pop -- see the header. Before it
  // they are ordinary bubbles the sweep is about to pop anyway.
  claimsBubbles: function(_ts) { return gLorcana.transformed; },
  // After the card, long chains. Every bubble is a link in her next route and
  // the game pays a bubble for a long chain, so between activations the play
  // loop's job is to make them -- which the setting's usual answer (many short
  // chains, for the combo) never does at its default of 3. See
  // `chainMaxAfterCard`.
  //
  // Before the card the setting stands: her skill turns tsums into bubbles by
  // itself, and the sweep spends them where they stand.
  chainLimits: function() {
    return gLorcana.transformed
      ? { maxChain: LorcanaAuroraConfig.chainMaxAfterCard } : {};
  },
  // One bubble into the clear of every second long chain, so the board keeps
  // moving while the gauge fills. See `popChainMin` in the table.
  popBubblesAfterChain: function(ts, chainLength) {
    const cfg = LorcanaAuroraConfig;
    if (!gLorcana.transformed || chainLength < cfg.popChainMin) { return 0; }
    LorcanaAuroraPlay.longChains++;
    // Nothing to tap: the count stands, so the next bubble to turn up is spent
    // rather than the next long chain after it.
    if (LorcanaAuroraPlay.longChains < cfg.popEveryChains || ts.gameBubbles.length === 0) {
      return 0;
    }
    LorcanaAuroraPlay.longChains = 0;
    return 1;
  },
  afterActivate: function(ts, _board, activatedAt) {
    const t0 = activatedAt || Date.now();
    if (!gLorcana.transformed) {
      // Before the card: Burst Bubbles, and the sweep takes the ink stone's
      // bubble with the rest. Reached with the "Lorcana Card" setting off as
      // well, in which case this is the whole skill for the round -- she plays,
      // she just never transforms.
      skillRandomizeAndWait(ts);
      lorcanaAuroraSweepBubbles(ts, t0);
      return true;
    }

    // The window: wait the animation out, then chain every bubble standing --
    // what this activation made, and everything that has stood since the last
    // one. **One chain, and then the board goes back.** Drawn again only while
    // the game leaves the bubbles standing, up to `chainAttempts` times inside
    // `bubbleWaitMs`, which is a retry and not a second helping.
    const cfg = LorcanaAuroraConfig;
    const until = t0 + cfg.bubbleWaitMs;
    for (let attempt = 1; attempt <= cfg.chainAttempts && ts.isRunning; attempt++) {
      // The gate is a clock: it says the animation is over. The board it exits
      // onto is still clearing -- her activation takes tsums off it and the
      // count is only two thirds back (30 of ~43, measured).
      const gate = lorcanaAuroraWaitForBubbles(ts, t0, until, cfg.bubbleMinCount);
      const board = lorcanaAuroraAwaitRefill(ts);
      // Then read the bubbles, on the board the drag is about to go out onto
      // rather than the one before it. A clearing board hides them: six or
      // seven at the gate against ten a second and a half later, measured off a
      // recording. See `lorcanaAuroraLookNow`.
      const look = lorcanaAuroraLookNow(ts, gate);
      const result = lorcanaAuroraChainBubbles(ts, look, t0, attempt, board);
      if (result.took || result.chain < 2 || Date.now() >= until) { break; }
    }
    // The burst leaves bubbles of its own, and they stand: they are the head
    // start on the next window's chain. Chaining them here was three small
    // bursts where the next window wants one big one -- see the header.
    LorcanaAuroraPlay.longChains = 0;
    return true;
  }
});
