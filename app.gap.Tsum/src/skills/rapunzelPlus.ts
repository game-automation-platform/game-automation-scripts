// ---------------------------------------------------------------------------
// Rapunzel+
//
// Her activation clears nothing by itself: it makes the board colour-blind for
// a moment, so one chain can be drawn through tsums of any colour. How many it
// may take is the skill level -- 9 at level 1 up to 24 at level 6
// (`chainLength`), and that number is the only limit inside the window.
//
// So the choreography is one drag: drop colour from the search (`rapunzelChain`
// treats the whole board as a single group), stop at the level's cap, draw the
// longest path that comes back. The "Maximum Chain Number" and "Chains per
// board scan" settings are not consulted -- they are what the play loop links
// between activations, and have nothing to say about the one chain the skill
// pays out. They are also left alone for that ordinary play: her chains outside
// the window are worth exactly what they clear, so no `chainLimits` here.
//
// Three things the window has to get right:
//
//   - **every tsum has to be in the board array.** A scan keeps only the
//     `uniqueTsumCount - 1` biggest colour clusters, and a colour without a
//     slot is not in the array at all, so no chain can be planned over it.
//     Ordinarily that is the cheapest colour to drop; for a chain that ignores
//     colour it is a tenth of the board. `extraClusterSlots` buys it back.
//   - **the board must have stopped falling.** The window opens on the refill
//     from the batch the play loop linked just before activating, and a capture
//     taken mid-fall reads tsums where they are passing through -- the drag then
//     goes out at air. A look that reads clearly fewer tsums than the play
//     loop's own scan did is waited out and retaken.
//   - **a bubble breaks the drag.** One crossed mid-travel pops and ends the
//     chain there, and this chain crosses the whole board. `beforeActivate`
//     spends the hoard aimed, off the positions the cycle's scan already holds,
//     so it costs no capture.
//   - **the drag has to be drawn, not flicked.** This is the one that made the
//     skill link three tsums where it had planned twenty-four, and it has two
//     halves, both of them consequences of the chain being long and colour
//     blind. Nothing on the board is inert any more, so a tsum merely *passed
//     over* is linked, out of order, and the plan and the game's chain part
//     company -- answered by planning at `planReach` rather than at the game's
//     full link reach, so no third tsum sits on the line between two of ours.
//     And one `moveTo` per tsum at 10ms is under one display frame, so a long
//     path can have its middle sampled away -- answered by `rapunzelLinkChain`,
//     which dwells on each tsum for longer than a frame and sweeps the gaps.
//     A three-chain that loses a link clears nothing and gets noticed; a
//     twenty-four chain that loses one just stops there and looks short.
// ---------------------------------------------------------------------------

// --- Tuning data -----------------------------------------------------------

// `var`, like every other skill's table: a `const` here is lexical, so it is not
// a property of the global object and the offline harness cannot reach it.
var RapunzelPlusConfig = {
  // Tsums one chain may take, by skill level 1-6.
  chainLength: [9, 12, 15, 18, 21, 24],
  // Her activation animation puts a dark veil over the board and holds it there
  // for most of a second. Measured off `rapunzel_debug/rapunzel+_1.mp4`: the
  // board reads mean luminance 138 before the tap, drops to 41 by 0.1s, sits at
  // 41-43 from 0.65s to 1.45s, and comes back at 1.50s. A board scan taken in
  // there finds a handful of tsums and the chain comes out at three, which is
  // exactly what this skill did until that clip was measured -- the plan was
  // short, and no amount of care over the drag was ever going to help.
  //
  // So the animation is not waited out by the clock, it is watched for -- with
  // the clock left underneath as a floor, because the watching can be wrong
  // (`litMinMs`).
  // `rapunzelEdgeLight` reads the play square's left, right and bottom bands --
  // bands and not the whole square because the animation is a *bright* figure
  // over the middle, so the middle cannot say whether the board is back; and
  // each band against its own level from before the tap, because a band with no
  // tsums under it is dark either way.
  //
  // In that clip the board comes back at 1.16 of its own pre-tap level, and no
  // moment of the animation gets all three bands past 0.64 -- the rainbow burst
  // takes the bottom band to 1.5 on its own, and the left to 0.90, but never
  // the right. 0.85 sits in the gap with room on both sides.
  litFraction: 0.85,
  litPollMs: 50,
  // Chain anyway once this is spent. A board that reads badly is a short chain;
  // a drag never sent is no chain at all, and the skill is spent either way.
  litWaitMs: 2500,
  // Nothing leaves the gate before this, whatever the light says --
  // `settleBoard`'s `minMs` for the same reason it has one. Every reading is a
  // ratio against `rapunzelBaseLight`, one sample taken a moment before the
  // tap; sampled over a hole the last clear opened, that baseline reads low,
  // the veil never registers as a darkening, and the gate used to give up at
  // `darkByMs` and scan the middle of it. In the clip the board is back at
  // 1.50s, so a gate that works exits past this anyway and the floor costs it
  // nothing -- what it buys is the gate that cannot see the veil, which now
  // waits the animation out by the clock.
  litMinMs: 1500,
  // The gate waits for the board to darken and then come back, so it cannot be
  // fooled by the frames between the tap and the veil (the veil is down 0.1s
  // after the clip starts, but where the tap sits inside that is not known).
  // Nothing darkened by here is not an exit any more, only the finding that
  // this reading cannot see the animation -- the floor above covers it.
  darkByMs: 700,
  // A look reading fewer than this fraction of the board the play loop scanned
  // is a board still falling -- waited out and retaken, at most `settleMaxWaits`
  // times before it is chained anyway. This gate is for the *fall*; the light
  // gate above is for the animation, which is what it used to be spending its
  // retries on at 250ms a scan.
  settledFraction: 0.8,
  settleRetryMs: 150,
  settleMaxWaits: 2,
  // How far apart two tsums may be and still be chained, as a multiple of
  // `Config.tsumWidth`. Deliberately below the game's own `Config.linkReach`
  // (1.9), and it is the drag that pays for the difference, not the search --
  // see `rapunzelLinkChain`. At 1.35 the chain is exactly as long (24.00 tsums
  // over 300 synthetic boards, unchanged from 1.9) while the paths whose drag
  // crosses no unplanned tsum go from 54% to 97%. Below 1.25 length starts to
  // go: 1.15 reads 23.66.
  planReach: 1.35,
  // Work the board bottom-up, as Coronation Day Elsa's window does -- but for a
  // harder reason than hers. For her it was measured free and argued from the
  // shape of a pile (67.1% against 67.0%); she can also spend a bad chain and
  // draw another. This skill has one drag, and the tsums at the top of the pile
  // are the ones the refill is still dropping in: a first link that grabs air
  // where a tsum used to be loses the whole chain, not one chain of several.
  //
  // Three parts, and it is the third that does the work. `lowFirst` into the
  // search (Elsa's parameter); `fallingBand` held out of the plan; and the
  // finished path drawn from whichever end is lower, which is free because a
  // path links the same tsums drawn either way. It is needed because the search
  // orders its starts by *ascending degree*, and on a pile the loose low-degree
  // tsums are exactly the ones at the top -- so left alone the drag begins
  // precisely where the board is least settled.
  //
  // Over 300 ragged synthetic boards, share of chains whose first link falls in
  // the top 30% of the pile: 80.0% as it was, 64.3% with `lowFirst`, 25.7% also
  // drawing from the low end, 0.3% with the band held out as well. Mean chain
  // length is 24.00 in every one of those, and stays 24.00 at 60% raggedness --
  // only a board eaten to 70% costs anything (22.62), where the fallback below
  // is what is holding it up.
  bottomFirst: true,
  // The top slice of the *occupied* board -- a share of pile height, not of the
  // play square -- held out of planning as the ground the refill is still
  // arriving on. Swept at 0.20/0.30/0.40: all cost nothing and all put the
  // first link out of the top band, so this is the middle of a flat optimum
  // rather than a tuned value.
  fallingBand: 0.25,
  // Total DFS steps the chain search may spend, as `SearchStepBudget` is for
  // `calculatePaths`. Once colour is dropped the board is one component and the
  // cap stops the search in a few dozen steps; this only bounds a board so
  // broken up that no path reaches the cap.
  searchBudget: 3000,
  // The drag. `linkTsums`' 10/10/10 is left alone -- it is measured against
  // ordinary chains -- and this one gets its own timings instead, because
  // it is several times longer than anything else the script draws and both of
  // the numbers below are about being *sampled*, not about being fast.
  //
  // `dwellMs` is the hold on each tsum's centre and is the important one: it
  // has to outlast one frame (16.7ms at 60fps), so that centre is the position
  // the game reads for that frame however it coalesces the moves inside it.
  // `stepMs`/`stepsPerHop` sweep the gap between two tsums instead of
  // teleporting across it, the way a finger crosses it.
  grabMs: 30,
  dwellMs: 18,
  stepMs: 5,
  stepsPerHop: 2,
  releaseMs: 20,
  // Kept after the drag, so the clear and its refill are over before the play
  // loop scans again. Scales with the chain, capped: 24 tsums leave a bigger
  // hole than 9.
  clearSettleMs: 400,
  clearSettlePerTsumMs: 25,
  clearSettleMaxMs: 1200,
};

// --- Waiting out the activation animation -----------------------------------

// Cells per side of the play-square downsample the light probe reads.
const RapunzelLightGrid = 8;

// The board's brightness before the activation tap, as `rapunzelEdgeLight`
// returns it. Sampled in `beforeActivate`, which is the last moment the board
// is certainly not under the veil, and read once by the wait below.
var rapunzelBaseLight: number[] | null = null;

/**
 * Mean brightness of the play square's left, right and bottom bands.
 *
 * One capture of the square at 8x8, so the whole probe is 24 pixels off a
 * 64-pixel image -- about what the cropped gauge read costs, which is what
 * makes it pollable. See `litFraction` for why the bands and not the middle.
 */
function rapunzelEdgeLight(ts: Tsum): number[] {
  const g = RapunzelLightGrid;
  const img = getScreenshotModify(ts.playOffsetX, ts.playOffsetY,
    ts.playWidth, ts.playHeight, g, g, 100);
  try {
    const pts: Point[] = [];
    for (let i = 0; i < g; i++) { pts.push({x: 0, y: i}); }
    for (let i = 0; i < g; i++) { pts.push({x: g - 1, y: i}); }
    for (let i = 0; i < g; i++) { pts.push({x: i, y: g - 1}); }
    const cols = getImageColors(img, pts);
    const bands: number[] = [];
    for (let b = 0; b < 3; b++) {
      let sum = 0;
      for (let i = 0; i < g; i++) {
        const c = cols[b * g + i];
        sum += (c.r + c.g + c.b) / 3;
      }
      bands.push(sum / g);
    }
    return bands;
  } finally {
    releaseImage(img);
  }
}

/**
 * How lit the board is now, as the dimmest band against its own pre-tap level.
 * 1 when there is no baseline to compare against, so a missing sample reads as
 * "get on with it" rather than as a veil that never lifts.
 */
function rapunzelLitRatio(ts: Tsum): number {
  const base = rapunzelBaseLight;
  if (!base) { return 1; }
  const now = rapunzelEdgeLight(ts);
  let dimmest = Infinity;
  for (let i = 0; i < now.length && i < base.length; i++) {
    // A band that was dark before the tap is dark because nothing is under it;
    // its ratio is 1 so it abstains rather than holding the gate shut.
    const ratio = base[i] > 1 ? now[i] / base[i] : 1;
    if (ratio < dimmest) { dimmest = ratio; }
  }
  return dimmest;
}

/**
 * Hold until the activation animation is off the board.
 *
 * Waits for the board to darken and *then* come back, so the bright frames
 * between the tap and the veil cannot be mistaken for the board returning.
 * Never refuses to chain: every way out of here leads to the scan.
 *
 * Two exits, and `litMinMs` is the floor under both. The board reading lit
 * again is one; failing to see the veil at all by `darkByMs` is the other, and
 * that one is a finding about the *reading*, not about the board -- so it waits
 * the animation out by the clock rather than scanning now. A poll that reads
 * dark after the board looked lit takes `lit` back down, so the floor also
 * turns one lucky reading into a sustained one.
 */
function rapunzelWaitForBoard(ts: Tsum, from: number):
    { litMs: number, sawDark: boolean, lit: boolean } {
  const cfg = RapunzelPlusConfig;
  if (!rapunzelBaseLight) { return { litMs: 0, sawDark: false, lit: false }; }
  let sawDark = false;
  let lit = false;
  let blind = false;
  while (ts.isRunning && Date.now() - from < cfg.litWaitMs) {
    const dimmest = rapunzelLitRatio(ts);
    if (dimmest < cfg.litFraction) {
      sawDark = true;
      lit = false;
      // The veil arrived, late: this reading can see the animation after all,
      // so go back to watching for it to lift rather than to the clock.
      blind = false;
    } else if (sawDark) {
      lit = true;
    } else if (Date.now() - from > cfg.darkByMs) {
      blind = true;
    }
    if ((lit || blind) && Date.now() - from >= cfg.litMinMs) {
      break;
    }
    ts.sleep(cfg.litPollMs);
  }
  return { litMs: Date.now() - from, sawDark: sawDark, lit: lit };
}

// --- The chain -------------------------------------------------------------

/**
 * The longest chain of up to `maxLen` tsums on this board, colour ignored.
 *
 * `calculatePaths` groups by colour first and is no use here; what is reused is
 * everything below it -- the same adjacency graph, the same bounded DFS. The
 * whole board goes in as one group, so the indices the search returns are
 * indices into `board` itself.
 *
 * The one thing not reused is the reach. Every other chain in the script is
 * planned at `Config.linkReach`, the widest hop the game will link, because a
 * drag that crosses a tsum of another colour is crossing something inert. In
 * this window nothing is inert: whatever the drag passes over gets linked, in
 * the order it is passed, and one such gatecrasher desynchronises the plan from
 * the chain the game is actually building. So planning stops at `planReach` --
 * hops short enough that the straight line between two of them holds no third
 * tsum -- and that costs no length at all. See the numbers on `planReach`.
 *
 * Components are still walked, because the board can be split by a gap wide
 * enough that no hop crosses it. The cap is a stopping condition, so a board
 * that offers more than `maxLen` costs one short search and not a full one.
 *
 * `lowFirst` is passed for the same reason Coronation Day Elsa passes it, and
 * it matters more here: her window can spend a bad chain and draw another,
 * while this skill has one drag and its *first* link is the one that decides
 * whether any of it lands. See `bottomFirst`.
 */
function rapunzelSearch(board: BoardPoint[], maxLen: number): BoardPoint[] {
  const cfg = RapunzelPlusConfig;
  if (board.length < 3 || maxLen < 3) { return []; }
  const threshold = Config.tsumWidth * cfg.planReach;
  const neighbors = buildTsumNeighbors(board, threshold * threshold);
  const components = findTsumComponents(neighbors);
  let best: number[] = [];
  for (let c = 0; c < components.length && best.length < maxLen; c++) {
    const comp = components[c];
    // Nothing here can beat what is already held.
    if (comp.length < 3 || comp.length <= best.length) { continue; }
    const found = findLongestTsumPath(neighbors, comp, cfg.searchBudget, maxLen,
      cfg.bottomFirst ? board : undefined).path;
    if (found.length > best.length) { best = found; }
  }
  // Resolved here rather than handed back as indices: the two searches below
  // run over different arrays, and indices into the wrong one are a chain drawn
  // somewhere else entirely.
  const out: BoardPoint[] = [];
  for (let i = 0; i < best.length; i++) { out.push(board[best[i]]); }
  return out;
}

/** The part of the board below the top slice the refill is still arriving in. */
function rapunzelSettledPart(board: BoardPoint[], band: number): BoardPoint[] {
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < board.length; i++) {
    if (board[i].y < minY) { minY = board[i].y; }
    if (board[i].y > maxY) { maxY = board[i].y; }
  }
  // A share of the *occupied* height, not of the play square: the board is a
  // pile whose top is wherever it happens to have run out.
  const line = minY + (maxY - minY) * band;
  const out: BoardPoint[] = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i].y > line) { out.push(board[i]); }
  }
  return out;
}

/**
 * The chain to draw, in the order to draw it: bottom-first, and planned over
 * the settled part of the board wherever that can fill the chain on its own.
 */
function rapunzelChain(board: BoardPoint[], maxLen: number): TsumPath | null {
  const cfg = RapunzelPlusConfig;
  if (board.length < 3 || maxLen < 3) { return null; }
  // The settled part first. If it can fill the chain on its own the top never
  // comes into the plan at all -- which on a full board it can, for nothing:
  // 24.00 tsums either way over 300 boards.
  let best = cfg.bottomFirst
    ? rapunzelSearch(rapunzelSettledPart(board, cfg.fallingBand), maxLen) : [];
  if (best.length < maxLen) {
    // It could not, so the whole board goes back in: a chain that has to reach
    // up beats a chain that is short. The second search costs ~0.2ms.
    const all = rapunzelSearch(board, maxLen);
    if (all.length > best.length) { best = all; }
  }
  if (best.length < 3) { return null; }
  const path: TsumPath = best as TsumPath;
  // Draw from whichever end is lower. A path links the same tsums drawn either
  // way, so this is free, and it is the single biggest lever on where the drag
  // *starts*: the search orders its starts by ascending degree, and on a pile
  // the loose low-degree tsums are the ones at the top, so left alone it begins
  // exactly where the refill is still landing. Over 300 ragged boards the first
  // link fell in the top 30% of the pile 80% of the time; with this and
  // `lowFirst` that is 25.7%, and with `fallingBand` as well, 0.3%.
  if (path.length > 1 && path[path.length - 1].y > path[0].y) { path.reverse(); }
  // `tsumIdx` stays unset: the chain has no one colour, which is the point.
  return path;
}

/**
 * Draw the chain, and say how many touch events it took.
 *
 * `linkTsums` sends one `moveTo` per tsum at 10ms, which is under one display
 * frame: the game may read only the last position of the several that arrive
 * inside a frame, so tsums in the middle of a long path can go unsampled. A
 * three-chain that loses one link clears nothing and is noticed; a twenty-four
 * chain that loses one link stops there and looks like a short chain, which is
 * how this reads from the outside. So each tsum's centre is held for `dwellMs`
 * -- longer than a frame, so it is *some* frame's final position whatever the
 * coalescing does -- and the gap to the next is swept in `stepsPerHop` steps
 * rather than jumped.
 *
 * Board points are the tsum's top-left corner in the play square, so the
 * half-width goes back on; `linkTsums`' own conversion, repeated because this
 * drag has to interpolate between the converted points.
 */
function rapunzelLinkChain(ts: Tsum, path: TsumPath): number {
  // A stopped run draws no new chain -- the same rule as `linkTsums`.
  if (!ts.isRunning) { return 0; }
  const cfg = RapunzelPlusConfig;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < path.length; i++) {
    xs.push(Math.floor(ts.playOffsetX
      + (path[i].x + Config.tsumWidth / 2) * ts.playWidth / ts.playResizeWidth));
    ys.push(Math.floor(ts.playOffsetY
      + (path[i].y + Config.tsumWidth / 2) * ts.playHeight / ts.playResizeHeight));
  }
  let moves = 1;
  tapDown(xs[0], ys[0], cfg.grabMs);
  moveTo(xs[0], ys[0], cfg.dwellMs);
  for (let i = 1; i < path.length; i++) {
    for (let s = 1; s <= cfg.stepsPerHop; s++) {
      const f = s / (cfg.stepsPerHop + 1);
      moveTo(Math.floor(xs[i - 1] + (xs[i] - xs[i - 1]) * f),
        Math.floor(ys[i - 1] + (ys[i] - ys[i - 1]) * f), cfg.stepMs);
      moves++;
    }
    moveTo(xs[i], ys[i], cfg.dwellMs);
    moves++;
  }
  tapUp(xs[path.length - 1], ys[path.length - 1], cfg.releaseMs);
  return moves;
}

/**
 * One capture of a board that has finished falling, or the best look of
 * `settleMaxWaits + 1` tries. `expected` is the play loop's own count.
 */
function rapunzelSettledBoard(ts: Tsum, expected: number): BoardPoint[] {
  const cfg = RapunzelPlusConfig;
  let board = ts.scanBoardQuick();
  let waits = 0;
  while (ts.isRunning && waits < cfg.settleMaxWaits
      && board.length < cfg.settledFraction * expected) {
    waits++;
    ts.sleep(cfg.settleRetryMs);
    const again = ts.scanBoardQuick();
    // Keep the fuller read: a retake can land on the next fall.
    if (again.length > board.length) { board = again; }
  }
  return board;
}

registerSkill({
  types: [SkillType.RapunzelPlus],
  // No `chainLimits`, deliberately, and it is worth saying why since this skill
  // is the one whose chain most obviously outgrows "Maximum Chain Number".
  //
  // That declaration overrides the setting for the chains the *play loop* links
  // between activations, and those are ordinary chains worth exactly what they
  // clear -- the setting's usual answer is the right one for them. Her own
  // chain never consults the setting in the first place (see `cap` in
  // `afterActivate`), so there is nothing here that needs to buy it out.
  // Room for the colour the ordinary `uniqueTsumCount - 1` cut drops. Every
  // colour is chainable inside the window, so one missing from the board array
  // is tsums the chain cannot reach -- see the header.
  extraClusterSlots: 1,
  beforeActivate: function(ts) {
    // The last look at the board before the activation veil comes down, which
    // is what every reading after the tap is measured against. Before the pops
    // below, not after: they are a burst of taps and a bubble's pop is a bright
    // flash, so a baseline taken on the far side of them measures the flash
    // rather than the board. The bubbles themselves are a few cells of an 8x8
    // downsample; the flash is the whole band.
    rapunzelBaseLight = rapunzelEdgeLight(ts);
    // Spend the hoarded bubbles aimed, before the window opens: a bubble the
    // drag crosses pops mid-travel and ends the chain there, and the chain this
    // skill draws crosses the board. Under All Bubbles ASAP the list is already
    // spent and this is zero taps. The light gate below covers the fall.
    ts.popGameBubbles(ts.gameBubbles.length);
  },
  afterActivate: function(ts, board, activatedAt) {
    const cfg = RapunzelPlusConfig;
    const t0 = activatedAt || Date.now();
    const level = Math.min(Math.max(ts.skillLevel, 1), cfg.chainLength.length);
    // Her level's own cap, and the only one in force here. NOT `skillMaxChain`
    // and never `Config.maxChain`: "Maximum Chain Number" defaults to 3 and is
    // routinely set around 12, both of them far under what she can take, and it
    // caps chains that are worth what they clear -- which this one is not.
    // Structurally so, not just by choice: `rapunzelSearch` calls
    // `findLongestTsumPath` itself, and `calculatePaths` -- the one place the
    // setting is ever consulted -- is not on this path at all. Verified by
    // pinning the setting to 1 and getting all six level caps back unchanged.
    const cap = cfg.chainLength[level - 1];
    // Not a fixed wait: the animation holds the board for most of a second and
    // a scan taken under it is what made this skill chain three. See
    // `litFraction`.
    const light = rapunzelWaitForBoard(ts, t0);

    // The play loop's board was scanned before its last batch linked, so its
    // length is a full board's population -- the settle gate's seed.
    const fresh = rapunzelSettledBoard(ts, board ? board.length : 0);
    const path = rapunzelChain(fresh, cap);
    let moves = 0;
    let dragMs = 0;
    // Is the window still open now that the scan has been paid for? In the one
    // clip measured the board stayed lit for the whole drag and went dark on
    // release, so the window closes on a completed chain rather than on a
    // clock -- if this starts reading dark, that is wrong and the scan has to
    // come out of the window (the board is still refilling under the veil, so
    // it cannot simply move before the tap).
    const litAtDrag = path ? rapunzelLitRatio(ts) : 0;
    if (path) {
      // Its own drag, not `linkTsums` and emphatically not `link`: the pacing
      // is the point (see `rapunzelLinkChain`), and `link`'s
      // `maybeAutoTapSkill` would re-enter this choreography the moment the
      // clear refilled the gauge.
      const dragAt = Date.now();
      moves = rapunzelLinkChain(ts, path);
      dragMs = Date.now() - dragAt;
      ts.sleep(Math.min(cfg.clearSettleMaxMs,
        cfg.clearSettleMs + path.length * cfg.clearSettlePerTsumMs));
    }

    logInfo(Log.Skill.RapunzelDone, {
      skillLevel: level,
      // Named for her level and not `maxChain`, which is the *setting*'s name:
      // reading a log where the two shared one word invited exactly the
      // question of whether the setting was clipping her. It is not, and cannot.
      levelCap: cap,
      // The field to read first when the chain looks short on screen. `chain`
      // is what was *planned*: at `levelCap` with a short chain showing in the
      // game, the plan was fine and the drag lost links -- `moves` and `dragMs`
      // are then the pacing. Well under `levelCap` with a small `read` is the
      // opposite problem, a board scan that put too few tsums in the array.
      chain: path ? path.length : 0,
      read: fresh.length,
      moves: moves,
      dragMs: dragMs,
      // How long the activation animation held the board, and whether it was
      // really seen to lift. Three shapes: `lit: true` is the gate working;
      // `sawDark: false` with `litMs` near `litMinMs` is the veil never seen at
      // all, so the baseline is suspect and the wait fell back to the clock;
      // `lit: false` with `litMs` near `litWaitMs` is the board never coming
      // back to its own pre-tap brightness, and everything after it was planned
      // off a veiled board.
      litMs: light.litMs,
      sawDark: light.sawDark,
      lit: light.lit,
      litAtDrag: Math.round(litAtDrag * 100) / 100,
      totalMs: Date.now() - t0,
    });
    return true;
  }
});
