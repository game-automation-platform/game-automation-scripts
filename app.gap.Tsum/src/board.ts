// ---------------------------------------------------------------------------
// The board: reading it, and drawing chains on it.
//
// One scan is one capture of the play square (`scanBoardQuick`): circles from
// two Hough passes over a single shared grayscale, colour-clustered into the
// `tsumIdx` groups `calculatePaths` (pathfinding.ts) plans on. The bubbles are
// read off that same frame and remembered, which is what lets a pop after a
// chain be taps alone -- a capture in the middle of a link batch would stall the
// cadence and the combo timer with it.
//
// `link` is the other half: the batch that scan produced, drawn one chain at a
// time, with the bubble pops and the skill check that belong between them.
//
// The loop that calls both, and everything about a round beginning or ending,
// is play.ts.
// ---------------------------------------------------------------------------

Tsum.prototype.linkTsums = function(path) {
  // Whole drags only: a chain begun is finished, one not begun never starts.
  if (!this.isRunning) { return; }
  // Drag timings (ms). Measured, not chosen: these were 30/20/20 here for a
  // while because at 10ms the game was observed to miss the initial press or
  // skip intermediate tsums, so a found 3+ chain never cleared -- and 10/10/10
  // is what it turned out to accept once the rest of the input path was right.
  // Raise all three together if that ever comes back; a chain drawn faster than
  // the game samples is `DRIVING_SCREENS.md` § 5.
  const grabDuring = 10;
  const moveDuring = 10;
  const releaseDuring = 10;
  for (let j = 0; j < path.length; j++) {
    const point = path[j];
    const x = Math.floor(this.playOffsetX + (point.x + Config.tsumWidth / 2) * this.playWidth / this.playResizeWidth);
    const y = Math.floor(this.playOffsetY + (point.y + Config.tsumWidth / 2) * this.playHeight / this.playResizeHeight);
    if (j === 0) {
      tapDown(x, y, grabDuring);
    }
    moveTo(x, y, moveDuring);
    if (j === path.length - 1) {
      tapUp(x, y, releaseDuring);
    }
  }
}

// The chain length that earns a bubble, for the limits in force.
//
// `minChainForPop` is an absolute length, but the chain cap ("Maximum Chain
// Number", or the selected skill's `chainLimits`) hard-caps every path
// `calculatePaths` returns -- and the setting defaults to 3, one below the
// threshold. So the mid-chain pop could never fire at all unless the player had
// raised that setting, silently: a bubble is not a thing the log mentions when
// nothing taps it.
//
// Capping chains at 3 is choosing many short chains over a few long ones, not
// choosing never to spend a bubble. Every chain such a player links is already
// as long as their configuration can make one, and that is what earns the pop.
Tsum.prototype.bubblePopChainLength = function() {
  const limit = skillMaxChain(this);
  const cap = limit > 0 ? limit : Infinity;
  return Math.min(GameBubbleConfig.minChainForPop, cap);
};

// How many of the bubbles the last scan found this strategy will spend at once.
// The ceilings, and why there are any, are in GameBubbleConfig.
Tsum.prototype.bubbleTapBudget = function() {
  // A skill that chains bubbles keeps every one of them: the one this would pop
  // on the way past is a link out of that chain, and its chain is worth far more
  // than the bigger clear the pop buys. See `SkillHandler.claimsBubbles`.
  if (skillClaimsBubbles(this)) { return 0; }
  switch (this.bubbleStrategy) {
    case BubbleStrategy.AllMidChain: return GameBubbleConfig.maxTapsMidChain;
    case BubbleStrategy.AllAsap: return GameBubbleConfig.maxTapsAsap;
    // One Bubble Mid Chain, and anything a stale setting or a hand-written
    // start() puts here: the stingiest reading, which is the safe one to be
    // wrong in -- a bubble left on the board is a bubble the next chain can
    // still spend.
    default: return 1;
  }
};

// Tap the bubbles the last board scan found. Taps only -- the positions were
// worked out at scan time -- so this stays inside the window where the chain is
// still clearing. A tap that misses costs nothing: it is not a drag, so it
// links nothing and the game ignores it.
//
// `limit` caps how many are taken; the default is whatever the Bubble Strategy
// setting allows. Pass one explicitly only to override that setting outright,
// the way a skill choreography does.
Tsum.prototype.popGameBubbles = function(limit) {
  const bubbles = this.gameBubbles;
  if (!bubbles || bubbles.length === 0 || !this.isRunning) { return; }
  const cfg = GameBubbleConfig;
  // An explicit `limit` is an override and stands on its own -- the ceilings in
  // bubbleTapBudget are what the *setting* allows, not a hard cap on callers.
  const budget = typeof limit === 'number' ? limit : this.bubbleTapBudget();
  const count = Math.min(bubbles.length, budget);
  if (count <= 0) { return; }
  for (let i = 0; i < count; i++) {
    const b = bubbles[i];
    const x = Math.floor(this.playOffsetX + b.x * this.playWidth / this.playResizeWidth);
    const y = Math.floor(this.playOffsetY + b.y * this.playHeight / this.playResizeHeight);
    tap(x, y, cfg.tapDuring);
  }
  logDebug(Log.Bubble.Popped, { popped: count, seen: bubbles.length });
  // A bubble only pops once, and one left behind is one this strategy is
  // deliberately saving for the next chain -- either way this list is spent:
  // the board has moved, so the positions in it are no longer where anything
  // is. The next scan finds whatever is still there.
  this.gameBubbles = [];
};

Tsum.prototype.link = function(paths, board) {
  let isBubble = false;
  // Bubbles seen on a board still detonating from a skill are not spent on this
  // batch -- see `settleScansAfterSkill`. Read and spent once here rather than
  // per path, so a batch is held or not held as a whole, and so the count moves
  // by one scan rather than by one chain.
  const holdBubbles = this.bubbleSettleScans > 0;
  if (holdBubbles) { this.bubbleSettleScans--; }
  // Overloading (burst skills): erased MyTsums keep counting into the gauge
  // for a moment after the drag, and firing the skill right as the gauge tops
  // off lets the rest of that count spill into the next gauge instead of
  // capping at 100%. Tapping a not-yet-full skill button is a no-op the game
  // ignores, so the cheap way to catch the fill instant is a single
  // fire-and-forget tap after each drag: no screenshots, no waits (a gauge
  // check costs ~10x a tap), no change to the link cadence. The game itself
  // fires the skill on whichever tap lands first after the gauge fills.
  // Choreographed skills can't ride blind taps (activating without the
  // follow-up aiming wastes the skill) and go through maybeAutoTapSkill,
  // which verifies readiness before handing over to useSkill.
  for (const i in paths) {
    const path = paths[i];
    // >= 7 should be correct, but practically the real chain is always shorter
    // so using a bigger value than theoretically correct
    if (path.length >= 12) {
      isBubble = true;
    }
    this.linkTsums(path);
    // Pop what the last scan saw the moment a long chain lands: with Tiara
    // Minnie+ a bubble popped as a chain goes off clears a bigger area, which
    // is the whole reason bubbles are worth saving for a chain at all. How many
    // go is the Bubble Strategy setting's call -- one, under the default. Under
    // All Bubbles ASAP there is nothing left here to pop: the loop spent them
    // the moment the scan found them.
    if (!holdBubbles && path.length >= this.bubblePopChainLength()) {
      this.popGameBubbles();
    }
    // A skill that claimed the bubbles gets its own say. The budget above is 0
    // while a claim stands, and hoarding every bubble for the next activation
    // leaves the board clearing no faster than tsum chains clear it -- so Aurora
    // spends one every couple of long chains. See `popBubblesAfterChain`.
    if (!holdBubbles) {
      const pops = skillPopBubblesAfterChain(this, path.length);
      if (pops > 0) { this.popGameBubbles(pops); }
    }
    // Linking a full batch of chains can take several seconds; check between
    // chains so a gauge that fills mid-batch fires right away.
    //
    // A choreography that ran here ends the batch. It is seconds of taps, drags
    // and waits, and the paths still to draw were planned on the board it was
    // handed, not the one it leaves -- so they either link nothing or link the
    // wrong tsums, and the next scan re-plans off what is actually there.
    // Lorcana Aurora is the case that made it obvious: her window bursts most of
    // the board and chains the bubbles that burst leaves, and the two stale
    // chains drawn afterwards were clearing the board her next burst wanted.
    if (this.maybeAutoTapSkill(board)) {
      break;
    }
  }
  return isBubble;
}

/**
 * The blind sweep: ~50 taps over the whole play area on a fixed grid.
 *
 * This is the deliberate override of the Bubble Strategy setting and is never
 * gated on it. A skill that turns tsums into bubbles, or ends on a board
 * covered in them, is not hoarding anything for a chain that will not come --
 * it declares that with `sweepsBubbles` and calls this. The play loop's own
 * periodic sweep is the one caller that *is* gated, to `BubbleStrategy.AllAsap`.
 *
 * Blind because it needs no capture: it is far too slow to land inside a chain
 * (that is `popGameBubbles`), so it runs where there is time for it.
 */
Tsum.prototype.clearAllBubbles = function(startDelay, endDelay, fromY, delayBetweenLines) {
  delayBetweenLines = delayBetweenLines || 0;
  if (typeof startDelay === 'number' && startDelay > 0) {
    this.sleep(startDelay);
  }

  let fy = Button.gameBubblesFrom.y;
  if (typeof fromY == 'number') {
    fy = fromY;
  }

  for (let by = fy; by <= Button.gameBubblesTo.y; by += 140) {
    for (let bx = Button.gameBubblesFrom.x; bx <= Button.gameBubblesTo.x; bx += 140) {
      this.tap({x: bx, y: by}, 10);
    }
    this.sleep(delayBetweenLines);
  }

  if (typeof endDelay === 'number' && endDelay > 0) {
    this.sleep(endDelay);
  }
}

Tsum.prototype.sampleMyTsumColor = function() {
  // The MyTsum portrait is the circular icon inside the skill button at the
  // bottom-left of the play area. Sample a small region around its center,
  // run the same smooth + HSV pipeline as findTsums, and average central
  // pixels so the result is directly comparable to tsum cluster colors.
  const center = this.toRealXY(Button.gameSkill1.x, Button.gameSkill1.y);
  const sampleR = Math.max(4, Math.floor(40 * this.captureGameRatio));
  const x = Math.max(0, center.x - sampleR);
  const y = Math.max(0, center.y - sampleR);
  const img = getScreenshotModify(x, y, sampleR * 2, sampleR * 2, 40, 40, 100);
  try {
    // Same blur-then-convert ordering findTsums uses, for the same reason: the
    // result is compared against cluster centres, so it has to be built the
    // way they were.
    smooth(img, 1, 7);
    smooth(img, 1, 22);
    convertColor(img, 40);
    let sumB = 0, sumG = 0, sumR = 0, count = 0;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const c = getImageColor(img, 20 + dx, 20 + dy);
        sumB += c.b; sumG += c.g; sumR += c.r;
        count++;
      }
    }
    return chromaFeature({ b: sumB / count, g: sumG / count, r: sumR / count });
  } finally {
    releaseImage(img);
  }
};

Tsum.prototype.scanBoardQuick = function() {
  // load game tsums
  const startTime = Date.now();
  const srcImg = this.playScreenshotSquare();
  // Overload carry-over: the last batch's count-in may top the gauge off
  // during this scan; one blind tap catches it. After the capture so the tap
  // can't disturb the frame.
  if (this.overloadPending) {
    this.overloadPending = false;
    this.tap(Button.gameSkill1, 10);
  }
  const board = [];
  // Owned here rather than inside either pass, so the two Hough passes below
  // share one image and exactly one release covers it -- including when a
  // native call throws mid-scan, which the task controller swallows and
  // retries, so a leak here would recur on every scan.
  let grayImg: NativeImage | null = null;
  try {
    // Both circle passes want the same grayscale, blurred copy of the board, so
    // it is built once here and handed to each. They used to build one apiece:
    // two clones, two colour conversions and two 9x9 Gaussians per scan for a
    // pair of identical images.
    grayImg = buildBoardGray(srcImg);
    const points = findTsums(srcImg, grayImg);
    // Read bubble positions off this same capture and remember them, so popping
    // one after a chain is taps only -- no screenshot in the middle of a batch,
    // which would stall the link cadence and the combo timer with it. Bubbles
    // are big and drift slowly, so a position a second old still lands.
    this.gameBubbles = findGameBubbles(grayImg);
    if (this.gameBubbles.length > 0) {
      logDebug(Log.Bubble.Found, { bubbles: this.gameBubbles.length });
    }
    logDebug(Log.Board.RecognitionStart);
    const tcs = classifyTsums(points);
    tcs.sort(function(a, b) { return a.points.length > b.points.length ? -1: 1; });
    // HSV cluster centers — compare these (and the inter-cluster distance3D)
    // against the boardImg circles when tuning the color-clustering settings.
    // One record with a cluster per array entry rather than a line each: the
    // whole point of reading these is comparing them against one another.
    logDebug(Log.Board.Clusters, {
      clusters: function() {
        const out: LogFields[] = [];
        for (let ci = 0; ci < tcs.length; ci++) {
          const distances: number[] = [];
          for (let cj = 0; cj < ci; cj++) {
            distances.push(Math.round(distance3D(tcs[ci], tcs[cj])));
          }
          // h/s/v, which is how a cluster centre is read; `distances` stay on
          // the chroma plane, which is what the merge threshold measures.
          const hsv = chromaToHsv({b: tcs[ci].b, g: tcs[ci].g, r: tcs[ci].r});
          out.push({
            cluster: ci,
            n: tcs[ci].points.length,
            h: Math.round(hsv.b),
            s: Math.round(hsv.g),
            v: Math.round(hsv.r),
            distances: distances,
          });
        }
        return out;
      },
    });

    // Identify which color cluster (if any) is the player's MyTsum by matching
    // the skill-button portrait color against cluster centers. Only the
    // "Link MyTsum first" setting reads myTsumIdx, so with it off -- or held
    // off by the skill (`setMyTsumPriority`) -- the whole thing is skipped;
    // the portrait sample is a screenshot per game.
    // How many clusters this scan keeps. Normally `uniqueTsumCount - 1`; a
    // skill that turns tsums into a colour of their own declares the extra it
    // needs, so its ice does not push live colours off the board array
    // (`SkillHandler.extraClusterSlots`).
    const clusterSlots = skillClusterSlots(this);
    this.myTsumIdx = -1;
    if (skillMyTsumPriority(this)) {
      if (!this.myTsumColor) {
        // The library first: `identifyMyTsum` read which tsum this is off the
        // pre-round screen, and what that tsum looks like on a board was
        // derived from its own art rather than photographed. Sampling the
        // skill button is the fallback -- see `MyTsumBoard` for why it is not
        // the first choice any more.
        //
        // The library column is HSV, so it converts here -- clusters live on
        // the chroma plane. It answers null for the file shipping today: that
        // column was derived through the old blur ordering, so
        // `MyTsumBoard.tag` no longer matches it and the loader drops it. The
        // button sample needs no conversion, `sampleMyTsumColor` already
        // building it the way this scan built its clusters.
        const known = myTsumBoardColor(this.myTsum);
        this.myTsumColor = known ? chromaFeature(known) : this.sampleMyTsumColor();
        logDebug(Log.Board.MyTsumColor, {
          color: this.myTsumColor,
          source: known ? 'library' : 'button',
          tsum: this.myTsum,
        });
      }
      let bestMyDist = MyTsumBoard.maxDistance;
      for (let ci = 0; ci < tcs.length && ci < clusterSlots; ci++) {
        const dMy = distance3D(tcs[ci], this.myTsumColor);
        if (dMy < bestMyDist) {
          bestMyDist = dMy;
          this.myTsumIdx = ci;
        }
      }
    }

    // Keep the colour behind each tsumIdx. `calculatePaths` and everything
    // after it see only the index, so without this the board's colours are
    // gone by the time anything downstream could ask -- which is what a skill
    // that has to tell two of them apart needs (`SkillHandler.orderPaths`).
    // Three numbers per cluster, off numbers the scan has already computed.
    this.boardClusters = [];
    for(const i in tcs) {
      if (+i >= clusterSlots) {
        break;
      }
      const tc = tcs[i];
      // Published as hue/saturation/value, not as the chroma feature they were
      // grouped on -- the skills that read these (Elsa's frozen box, Formal
      // Beast's two families) are written in those terms and stay that way.
      this.boardClusters.push(chromaToHsv({b: tc.b, g: tc.g, r: tc.r}));
      // The debug palette is five long and a skill may ask for more slots than
      // that, so it wraps -- two clusters sharing an overlay colour is a
      // cosmetic collision, reading past the end is a crash.
      const dbg = Config.colors[+i % Config.colors.length];
      for (const j in tc.points) {
        const p = tc.points[j];
        board.push({tsumIdx: i, x: p.x - (Config.tsumWidth / 2), y: p.y - (Config.tsumWidth / 2)});
        if (this.debug) {
          drawCircle(srcImg, p.x, p.y, 4, dbg[0], dbg[1], dbg[2], 0);
        }
      }
    }
    if (this.debug) {
      saveImage(srcImg, this.storagePath + "/tmp/" + ts!.runTimes + "-boardImg.jpg");
    }
  } finally {
    if (grayImg != null) { releaseImage(grayImg); }
    releaseImage(srcImg);
  }
  logDebug(Log.Board.Recognized, { tsums: board.length });
  logDebug(Log.Board.RecognitionTime, { durationMs: Date.now() - startTime });

  return board;
}
