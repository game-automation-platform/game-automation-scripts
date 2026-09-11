// ---------------------------------------------------------------------------
// Gaston
//
// His activation changes nothing already on the board: for a window his skill
// level sets, every tsum that *drops* is a Gaston. So the activation is worth
// however much board gets cleared while it is open -- clear a chain of Gastons
// and the hole fills with more of them -- and the chain that clears it wants to
// take as much of the board as it can. A human playing him draws **one chain of
// about thirty**; measured off `debug/gaston_correct.mp4`, that is the whole
// skill.
//
// ## The chain is a snake from the top, not the longest path
//
// Read frame by frame, the human's thirty-chain starts at the top-left corner,
// sweeps right along the top row, drops a row, sweeps back left, drops, sweeps
// right -- a boustrophedon down the pile, and it stops where the Gastons run
// out. `gastonSnake` draws exactly that as a greedy walk on the link-reach
// graph, and the part that took two tries to get right is **what a row is**. A
// pile is jumbled: the next tsum along a row sits ten or fifteen px above or
// below the last, so judging "same row" hop by hop read it as the row below,
// dropped, turned, found everything behind already visited and dropped again --
// a staircase down the diagonal, four tsums off the top row and fourteen in all
// (`debug/gaston_debug_1.mp4`). So the rows are found first, for the whole pile
// (`gastonRows`): a sweep down the sorted heights that opens a new row at a gap
// or once the row is a tsum tall. A hex pile's real rows come out as rows; a
// jumbled one comes out in bands a tsum tall, which is all a horizontal sweep
// needs. The walk then exhausts its row -- forward, then back for anything it
// passed -- before it drops, and it drops to the far end of the row below so the
// sweep back covers that row whole. Tried from both top corners, longest kept.
// A snake that dead-ends early -- a board fragmented by bubbles, or read with a
// band of the refill still in the air -- is beaten by the longest path the
// search finds over the same points (`findLongestTsumPath`): the game takes any
// hop inside its reach, so the shape is a preference and the count is the point.
//
// **The route is Gaston only, and Gaston is learned from the board.** The snake
// ran over the whole board array for a while, on the theory that a leftover of
// another colour the drag crosses is inert. It is not. The game links a tsum
// only while it is within reach of the chain's *head*, so the first leftover in
// the route leaves every Gaston after it two hops from the head, and the chain
// stalls there for good: `gaston_debug6.mp4` registered 14, 17, 2, 1 and 8 of
// routes planned at 29, 35, 15, 22 and 28, every stall on an ordinary 23-33px
// hop, while 43-44px hops inside the same chains linked fine. So the route is
// drawn over his tsums alone, and which clusters are his is decided by size and
// remembered by colour (`gastonGastons`). Gaston is one colour to the game and
// two or three to the scan -- a tan face under black hair, and the Hough centre
// lands on either -- but on a board the window has just filled the biggest
// clusters are his: they are taken until they hold `paletteShare` of the board,
// and the large ones go on `gastonPalette` for the window, so a hair cluster a
// later board's leftovers outnumber is still his. Matching the skill-button
// portrait was tried first and drew nothing: his face on blue is not his sprite
// on the board. `extraClusterSlots` keeps his second and third clusters in the
// board array whatever the leftovers do.
//
// Top-down rather than the bottom-first the other long chains use, on purpose.
// Rapunzel+ starts low because her window opens on a board still falling; this
// one opens on a board the count gate has just seen full and still. And the
// order pays for itself at the release: the cleared tsums are the top rows, so
// the pile below does not move and the refill drops straight into the space --
// where a chain taken from the bottom collapses the whole pile before anything
// new can land.
//
// ## Nothing here consults the chain settings
//
// "Maximum Chain Number" and "Chains per board scan" are tuned for ordinary
// play, where many short chains keep the combo alive. They are the wrong answer
// for every part of this skill, so `chainLimits` buys both of them out for the
// play loop between windows: the chain is **uncapped** and exactly **one** goes
// out per scan. The second half matters as much as the first -- the extra chains
// of a batch are planned on a board the first chain has already cleared, and on
// a Gaston board that is what turns one chain of thirty into a chain of twelve
// and two of three. Inside the window the snake consults nothing at all.
//
// ## The activation animation is 3.4 seconds and the window is 6
//
// So the window is anchored to the **end of the animation**, not to the tap.
// Measured off `gaston_correct.mp4` frame by frame: the tap lands at 8.0s, the
// board sits under a dark flexing figure until 11.4s, fills with Gaston by
// 13.5s, and the chain goes out at 14.3s. Anchored at the tap, a 6s window is
// over before the board is worth looking at -- which is exactly what
// `gaston_wrong.mp4` shows: five seconds of window spent scanning a board under
// the veil, then the play loop chaining fours across a board of twenty-six
// Gastons.
//
// The gate is **a full count that has stopped climbing, behind a floor** -- a
// count, not positions. A position gate was tried: the circles matched read to
// read, landed meaning nine in ten within 3px of a read ago. Run through the
// same Hough pass over the frames of a board that had visibly landed
// (`debug/gaston_debug5.mp4`, 3.0s to 5.3s), that share never passed 0.80 and
// mostly sat near 0.6: at a vote threshold of 10 the pass finds forty-odd
// circles of which a dozen are somewhere else on the next frame. So every gate
// ran to its ceiling and the window sat three seconds over a full board. The
// count wanders a few either way for the same reason, which is why "stopped
// climbing" allows `countNoise` (a refill landing climbs by several a read).
// What a count cannot see is a clear in progress -- forty popping tsums are
// forty circles for a while yet -- so the refill gate does not look before
// `fillMinMs`, long enough for a clear of any size to have taken tsums off the
// count, and a board that never reads full is taken at the ceiling
// (`fillWaitMs`) rather than by a "landed short" test the count cannot make.
// The floor (`openMinMs`) covers the activation animation, because a board that
// was full when the button went is still forty circles under the dim.
//
// ## The HUD is inside the play square
//
// The fever bonus and the combo counter are drawn across the top of the play
// square, over the pile's top row, and their glyphs -- the 0, 8, 9 and 2 of
// "48,202" -- are tsum-sized circles to the Hough pass. Ordinary play never
// meets them: they land in a small colour cluster the `uniqueTsumCount - 1` cut
// drops. This snake is colour blind and keeps every cluster, so they were in
// its board, at the top, which is exactly where it starts. Replayed offline on
// the boards of `gaston_debug5.mp4`, both routes began on the fever bonus
// digits and hopped through the combo counter; on the device those drags
// linked one tsum, then five. `gastonFreeBoard` cuts everything with its centre
// in the top `hudBand` of the square. That costs a real tsum or two on a pile
// stacked into the band (`corpus/GamePlaying/last_seconds1.png` has three
// there), and the snake then starts a row lower; every fever capture in the
// corpus has two to four glyph circles in the band.
//
// ## The last chain is not cancelled, and the tap follows a chain
//
// Gastons cleared while the skill is running do not fill the gauge; the ones
// cleared after it has run out do, and they fill it *as they pop* -- a thirty
// chain's clear is three seconds long (`debug/gaston_debug2.mp4`, 44.3s to
// 47.3s) and the gauge climbs through the whole of it. So the bubble cancel,
// which is exactly what cuts that animation short, is only for chains whose
// clear the skill still covers: a chain released within `noCancelTailMs` of the
// close, or after it, is left to pop in full, and it ends the window -- its
// Gastons popping past the close are the charge. A window that closes with no
// such chain out draws one more on the board as it stands, since what dropped
// before the close is still Gaston; nothing after that, because the refill
// behind it is mixed, and a colour-blind snake over a mixed board links one
// tsum (the "1" chains after the fever in `gaston_debug5.mp4`). The gauge is
// then watched through the clear (`gastonAwaitGauge`), and this hands back the
// moment it reads full so `useSkill` fires within a read or two -- a chain
// still clearing when the button goes spills the rest of its count into the
// fresh gauge, which is the overload `Tsum.link` is built around. That is also
// the rule when the gauge is already full at the close: the chain first, then
// the tap, so the burst has something to fill. A gauge not full by
// `gaugeWaitMs` is the play loop's: its chains fill it, and `useSkill` fires on
// the first read that says so.
//
// Two smaller things the window has to get right:
//
//   - **the drag must not cross a bubble.** One crossed mid-travel pops and
//     ends the chain there, and this chain crosses the board. Tsums sitting on
//     a bubble are held out of the plan, and the bubble is then spent
//     deliberately: tapped the moment the drag releases, which cuts the pop
//     animation short so the next batch of Gastons drops at once. That is what
//     makes a second pass fit in the window at all, and it is why bubbles are
//     the skill's rather than the Bubble Strategy's (`claimsBubbles`) -- nothing
//     pops one between windows, since a bubble there cancels a chain that is
//     filling the gauge; the surplus goes on the cancels instead. The bubbles
//     are read off a capture that runs below the play square (`gastonBubbles`,
//     `bubbleHem`): the square cuts the bottom row of them in half, and a third
//     of one window's passes went uncancelled with four in plain sight.
//   - **the drag has to be sampled, not flicked.** One `moveTo` per tsum at
//     10ms is under a display frame, so a thirty-chain can have its middle
//     sampled away. Same answer as Rapunzel+: dwell longer than a frame on each
//     tsum and sweep the gaps.
// ---------------------------------------------------------------------------

// --- Tuning data -----------------------------------------------------------

// `var`, like every other skill's table: a `const` here is lexical, so it is not
// a property of the global object and the offline harness cannot reach it.
var GastonConfig = {
  // How long the drops stay Gaston **after the activation animation ends**, by
  // skill level 1-6, in ms.
  //
  // Level 6's 6s is the number the skill is played on; the rest are a straight
  // ladder to it and are NOT MEASURED. Nor is the anchor: the game may well
  // start the window at the tap, in which case this over-runs by the length of
  // the animation. That is the safe direction to be wrong in -- an over-run
  // chains leftover Gastons, which is worth doing anyway, where the under-run
  // it replaces threw the whole window away.
  durationMs: [4000, 4400, 4800, 5200, 5600, 6000],

  // --- the board gates -----------------------------------------------------
  //
  // The tsum count off one capture and one Hough pass (~10ms), polled -- not
  // `settleBoard`, whose grid a score popup or a coin shower keeps moving over
  // a board that has landed, and not circle positions, which the pass does not
  // hold still enough to match (see the header).
  pollMs: 80,
  // Full: the count at or over `enoughTsums`, and not up by more than
  // `countNoise` on `stillReads` reads running. A full board measures around
  // 43 and wanders a few either way read to read, where a refill landing
  // climbs by several a read; a dozen dim tsums is what the animation leaves
  // visible. 36 rather than 40 because the window carries bubbles, each sitting
  // where a tsum or two would, and because the count carries the two to four
  // HUD glyphs `gastonFreeBoard` cuts.
  enoughTsums: 36,
  countNoise: 2,
  stillReads: 2,
  // The opening gate's floor and ceiling. It waits out the activation animation
  // and the first fill together: the animation measured 3.4s in
  // `gaston_correct.mp4` and ~3.2s in `gaston_wrong.mp4`, 3.3s in
  // `gaston_debug5.mp4`, and the board was full 0.4s behind it there. The floor
  // is the animation, which the count cannot see through when the board was
  // already full at the tap (see the header); the gate then leaves on a full
  // board or on the ceiling. 3500 sits just over the animation: a drag begun
  // under its last frames is a drag the game may not take.
  openMinMs: 3500,
  openWaitMs: 6500,
  // The refill gates between passes. A cancelled clear is off the board at
  // once and the board is back and full at ~1.1s (`gaston_debug5.mp4`, 5.9s to
  // 7.0s), so its floor is `fillMinMs`. A clear left to pop -- no bubble to
  // cancel it with -- takes its tsums off one at a time at about
  // `popPerTsumMs` each (a thirty chain is three seconds, `gaston_debug2.mp4`),
  // and the count cannot tell that from a full board for the first second, so
  // its floor is the pop's own length plus `popTailMs` for the drop behind it.
  // `fillWaitMs` is the ceiling past the floor, for a board that never reads
  // full -- one crowded with bubbles -- which is chained as it stands then.
  fillMinMs: 1000,
  fillWaitMs: 1500,
  popPerTsumMs: 90,
  popTailMs: 400,
  // A full count is not a landed board: the last tsums of a refill are circles
  // while they fall, and `gaston_debug6.mp4` had two boards scanned with a band
  // still in the air -- 39 read, a route of 8. Every gate that leaves on full
  // sits this long first.
  landMs: 250,
  // A pass that found no chain waits this long before looking again.
  rescanIdleMs: 120,

  // --- the snake -----------------------------------------------------------
  //
  // How the pile is cut into rows (`gastonRows`), in tsum widths. Sorted by
  // height, a new row opens where two neighbouring tsums are more than `rowGap`
  // apart, or once the row is `rowHeight` tall. A hex pile's rows sit ~0.87
  // widths apart and jitter a few px within, so the gap alone finds them; the
  // height cap is for a jumbled pile whose heights run together, and bands it
  // -- which is all a horizontal sweep needs. 0.75 rather than a whole tsum so
  // a band opened at the top of one row cannot reach the highest tsums of the
  // row below it (0.87 down, less their jitter); a row too jittered for the cap
  // is swept as two bands, which is a second pass over the same ground rather
  // than a zigzag between two rows. Both swept offline over jittered hex piles
  // (gap 0.4/0.5 against height 0.75/1.0): the height is what matters, and
  // 0.75 took 98% of a jumbled single-colour pile against 94%.
  rowGap: 0.4,
  rowHeight: 0.75,
  minChain: 3,
  // A snake shorter than this share of the Gastons dead-ended early, and the
  // longest-path search gets the board (see the header).
  snakeMinShare: 0.6,
  // Which clusters are Gaston (`gastonGastons`). On the window's first board,
  // the biggest until they hold this share of it -- his face and hair are
  // 40-60% and 20-30% of a filled board, the largest leftover colour under 15%
  // -- with those at least `paletteMinShare` of the board remembered on
  // `gastonPalette`; on every board after, the clusters within
  // `paletteDistance` of a remembered centre, which is `ChromaMergeDistance`,
  // what the scan itself calls one colour.
  paletteShare: 0.6,
  paletteMinShare: 0.2,
  paletteDistance: 40,
  // How far a planned tsum must stay from a bubble, in tsum widths. A bubble is
  // about 1.4 tsums across, so this is "not touching".
  bubbleAvoid: 1.0,
  // How far below the play square the bubble capture runs, as a share of its
  // height. The bowl is deeper at the middle than the square is tall, and a
  // bubble resting there has its lower third cut off the square: four sat so
  // in `gaston_debug6.mp4` and the pass over the square found none of them.
  bubbleHem: 0.1,
  // The band across the top of the play square the HUD draws into, in tsum
  // widths; a circle with its centre in it is a glyph, not a tsum (see the
  // header). The fever bonus digits centre at 0.7-1.0 and the combo counter's
  // at up to ~1.15 (`gaston_debug5.mp4`); a full pile's top row centres at
  // 1.25-2.0.
  hudBand: 1.25,

  // --- the drag ------------------------------------------------------------
  //
  // `linkTsums`' 10/10/10 is measured against ordinary chains and left alone;
  // this drag is an order of magnitude longer and `dwellMs` is what it is for:
  // it outlasts one frame (16.7ms at 60fps), so each tsum's centre is some
  // frame's final position however the moves coalesce. A thirty-chain that
  // loses one link stops there and merely looks short.
  //
  // `stepsPerHop` is 1 rather than Rapunzel+'s 2 because the two skills are
  // sweeping for different reasons. Hers is colour blind, so everything the
  // drag passes over is linked, out of order, and the gap has to be crossed the
  // way a finger crosses it. This chain is one colour and every hop is inside
  // the game's own link reach, so the gap has nothing that must be crossed --
  // one intermediate move is a hedge against a hop at the full reach, not a
  // requirement. The game takes one touch event per frame, so this is also the
  // whole cost: 45 tsums at 2 events each is ~1.5s, against ~2.2s at 2 steps
  // and the human's own 1.75s. Drop it to 0 if the links hold.
  grabMs: 30,
  dwellMs: 18,
  stepMs: 5,
  stepsPerHop: 1,
  releaseMs: 20,

  // --- the cancel ----------------------------------------------------------
  //
  // Tapped the moment the drag releases: the pop animation is what it cuts
  // short, so a late tap spends a bubble on nothing.
  cancelTapMs: 10,
  // Bubbles left standing for the next window, so it always has a cancel. The
  // surplus above this goes on the cancel too -- every long chain earns one and
  // nothing else ever spends one, so left alone they pile up and sit where the
  // chain would go. One: the next long chain makes the next one.
  bubbleReserve: 1,
  // A chain released within this of the window's close is not cancelled: its
  // clear straddles the close, and the Gastons that pop after it are the ones
  // that fill the gauge. About a long chain's pop animation once the cancel
  // has not cut it short.
  noCancelTailMs: 800,

  // --- charging the gauge after the close ----------------------------------
  //
  // How long the closing chain's clear is watched for the gauge: a thirty
  // chain pops for three seconds and the gauge reads full a little after the
  // last of it -- a 34 watched for 3.5s was read full by the play loop 1.8s
  // later. Past this the play loop has the board back and its own chains fill
  // the rest, which is also the whole plan for a closing chain under
  // `chargeMinChain`: that one is not going to fill anything, and the play
  // loop's longest chain on the Gastons it left is worth more than the wait.
  gaugeWaitMs: 4500,
  gaugePollMs: 40,
  chargeMinChain: 12,
};

// The colour centres of Gaston's clusters, learned per window -- see
// `gastonGastons`. Chroma features, the space the scan clusters in.
var gastonPalette: Color[] = [];

/** What one pass of the window came to. */
interface GastonPass {
  /** Tsums in the chain drawn, 0 when none was. */
  chain: number;
  /** Bubbles tapped to cancel the pop animation. */
  cancelled: number;
  /** The chain was released in the window's tail and left to pop -- the closing chain. */
  held: boolean;
  /** Tsums the scan put in the board array, HUD glyphs included. */
  read: number;
  /** Tsums in the board's biggest colour cluster -- how far short of `read` the scan reads Gaston. */
  biggest: number;
  /** The board was there to be scanned; false is a round that ended under the window. */
  onBoard: boolean;
}

/** What a wait for the board came to. */
interface GastonWait {
  /** The fullest the board was seen. */
  peak: number;
  /** The gauge read full while waiting (only when watched). */
  ready: boolean;
}

// --- Reading the board ------------------------------------------------------

/**
 * How many tsum circles the board shows: one capture and `findTsums`' circle
 * pass, counted and nothing else.
 */
function gastonCountTsums(ts: Tsum): number {
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
 * Wait until the board reads full, and say how full it got.
 *
 * Leaves once the count is at `enoughTsums` and has stopped climbing --
 * `stillReads` reads running not up by more than `countNoise`, the last of a
 * refill landing being the count still on its way up -- or on `until`. Never
 * short of full: the count cannot tell a board landed short from one mid-clear
 * (see the header), so a board that never reads full is taken at the ceiling.
 *
 * Nothing ends the wait before `notBefore`: the opening gate's floor under the
 * activation animation, the refill gates' `fillMinMs` while a clear takes its
 * tsums off the count.
 *
 * With `watchGauge` the skill gauge is read on every poll too, and a full one
 * ends the wait at once.
 */
function gastonAwaitBoard(ts: Tsum, until: number, notBefore: number,
                          watchGauge: boolean): GastonWait {
  const cfg = GastonConfig;
  let count = gastonCountTsums(ts);
  let peak = count;
  let held = 0;
  let full = false;
  while (ts.isRunning && Date.now() < until) {
    if (watchGauge && ts.checkSkillReadinessFast() === SkillReadiness.Active) {
      return { peak: peak, ready: true };
    }
    if (Date.now() >= notBefore && count >= cfg.enoughTsums && held >= cfg.stillReads) {
      full = true;
      break;
    }
    ts.sleep(cfg.pollMs);
    const now = gastonCountTsums(ts);
    held = now > count + cfg.countNoise ? 0 : held + 1;
    count = now;
    if (count > peak) { peak = count; }
  }
  // Full is not landed: the last of the refill is still falling. See `landMs`.
  if (full) { ts.sleep(cfg.landMs); }
  return { peak: peak, ready: false };
}

/**
 * Watch the gauge through a chain's clear: true the moment it reads full,
 * false once `until` passes with it still filling. A cropped read, ~2.4ms, so
 * the poll is as tight as the game's own frame.
 */
function gastonAwaitGauge(ts: Tsum, until: number): boolean {
  while (ts.isRunning && Date.now() < until) {
    if (ts.checkSkillReadinessFast() === SkillReadiness.Active) { return true; }
    ts.sleep(GastonConfig.gaugePollMs);
  }
  return false;
}

/**
 * The Gastons on the board: the points of the colour clusters that are his,
 * decided by size and remembered by colour -- see the header and
 * `paletteShare`. The clusters' colours are `ts.boardClusters`, as the scan
 * that made `board` left them.
 */
function gastonGastons(ts: Tsum, board: BoardPoint[]): BoardPoint[] {
  const cfg = GastonConfig;
  const clusters = ts.boardClusters;
  const sizes: number[] = [];
  for (let c = 0; c < clusters.length; c++) { sizes.push(0); }
  for (let i = 0; i < board.length; i++) {
    const c = +board[i].tsumIdx;
    if (c >= 0 && c < sizes.length) { sizes[c]++; }
  }
  const order: number[] = [];
  for (let c = 0; c < sizes.length; c++) { order.push(c); }
  order.sort(function(a, b) { return sizes[b] - sizes[a]; });
  const his: boolean[] = [];
  for (let c = 0; c < sizes.length; c++) { his.push(false); }
  // By colour, once the window has a palette: a cluster near a remembered
  // centre is his. Size decides nothing then -- on a later board a leftover
  // colour can outnumber his hair, and taking it would put it on the palette.
  let found = 0;
  for (let c = 0; c < sizes.length && gastonPalette.length > 0; c++) {
    if (sizes[c] === 0) { continue; }
    const feature = chromaFeature(clusters[c]);
    for (let p = 0; p < gastonPalette.length; p++) {
      if (distance3D(feature, gastonPalette[p]) <= cfg.paletteDistance) {
        his[c] = true;
        found += sizes[c];
        break;
      }
    }
  }
  // By size, for the window's first board or a palette that no longer matches
  // it: the biggest until together they hold the share, and the large ones
  // among them remembered.
  if (found < cfg.minChain) {
    let held = 0;
    for (let k = 0; k < order.length; k++) {
      const c = order[k];
      if (sizes[c] === 0 || (held > 0 && held >= cfg.paletteShare * board.length)) { break; }
      his[c] = true;
      held += sizes[c];
      if (sizes[c] >= cfg.paletteMinShare * board.length) {
        gastonPalette.push(chromaFeature(clusters[c]));
      }
    }
  }
  const out: BoardPoint[] = [];
  for (let i = 0; i < board.length; i++) {
    const c = +board[i].tsumIdx;
    if (c >= 0 && c < his.length && his[c]) { out.push(board[i]); }
  }
  return out;
}

/**
 * The bubbles on the board, off a capture that runs `bubbleHem` below the play
 * square -- see `bubbleHem` for the ones the square cuts in half. The same
 * Hough pass as `findGameBubbles`, in play-square scale; a centre below the
 * square has y past `playResizeHeight`, which the taps map like any other.
 */
function gastonBubbles(ts: Tsum): GameBubble[] {
  const hem = GastonConfig.bubbleHem;
  const h = Math.min(Math.round(ts.playHeight * (1 + hem)), ts.screenHeight - ts.playOffsetY);
  const outH = Math.round(ts.playResizeHeight * h / ts.playHeight);
  const img = getScreenshotModify(ts.playOffsetX, ts.playOffsetY, ts.playWidth, h,
    ts.playResizeWidth, outH, 100);
  let gray: NativeImage | null = null;
  try {
    gray = buildBoardGray(img);
    return findGameBubbles(gray);
  } finally {
    if (gray != null) { releaseImage(gray); }
    releaseImage(img);
  }
}

/**
 * The board minus what the drag must not touch: every tsum sitting on a bubble,
 * since a bubble the drag crosses pops and ends the chain there, and every
 * circle with its centre in the HUD band across the top, which is the fever
 * bonus and the combo counter read as tsums -- see the header.
 *
 * Board points are top-left corners and bubbles are centres, so the half-width
 * goes back on before either test.
 */
function gastonFreeBoard(board: BoardPoint[], bubbles: GameBubble[]): BoardPoint[] {
  const half = Config.tsumWidth / 2;
  const hud = Config.tsumWidth * GastonConfig.hudBand;
  const avoid = Config.tsumWidth * GastonConfig.bubbleAvoid;
  const avoidSq = avoid * avoid;
  const out: BoardPoint[] = [];
  for (let i = 0; i < board.length; i++) {
    const cx = board[i].x + half;
    const cy = board[i].y + half;
    if (cy < hud) { continue; }
    let clear = true;
    for (let b = 0; b < bubbles.length; b++) {
      const dx = bubbles[b].x - cx;
      const dy = bubbles[b].y - cy;
      if (dx * dx + dy * dy < avoidSq) { clear = false; break; }
    }
    if (clear) { out.push(board[i]); }
  }
  return out;
}

// --- The snake --------------------------------------------------------------

/**
 * Which row each point is in, top row 0. See `rowGap` for how the pile is cut.
 *
 * Decided for the whole pile before the walk, not hop by hop: a pile is
 * jumbled enough that two neighbours along one row can sit half a tsum apart in
 * height, and a per-hop test read that as the row below -- see the header.
 */
function gastonRows(points: BoardPoint[]): Int32Array {
  const cfg = GastonConfig;
  const n = points.length;
  const order: number[] = [];
  for (let i = 0; i < n; i++) { order.push(i); }
  order.sort(function(a, b) { return points[a].y - points[b].y; });
  const gap = Config.tsumWidth * cfg.rowGap;
  const height = Config.tsumWidth * cfg.rowHeight;
  const rows = new Int32Array(n);
  let row = 0;
  let top = points[order[0]].y;
  let prev = top;
  for (let k = 0; k < n; k++) {
    const y = points[order[k]].y;
    if (y - prev > gap || y - top > height) { row++; top = y; }
    rows[order[k]] = row;
    prev = y;
  }
  return rows;
}

/**
 * A boustrophedon over one colour's points, as indices into `points`: start at
 * a corner of the top row, sweep it, drop a row, sweep back, and so on down the
 * pile until no unvisited tsum is within reach.
 *
 * Greedy, one hop at a time, over `neighbors` (the link-reach graph), with the
 * rows already decided (`rows`). From the current tsum the next is, in strict
 * order of preference:
 *
 *   1. the next tsum along the row in the current direction -- the one the
 *      least far ahead, so the row is walked tsum by tsum. "The row" here is
 *      this row *or any above it*: the sweep goes down, so an unvisited tsum
 *      above is one an earlier sweep could not reach, and it is taken in
 *      passing rather than left for the climb back;
 *   2. the nearest tsum back along the row (or above), turning round -- what
 *      the sweep passed over because it was out of reach at the time;
 *   3. the nearest row below that has anything in reach. A row not yet
 *      entered is landed on at its far end in the current direction, so the
 *      sweep back covers it whole from a clean end -- landing one short and
 *      stepping to the end leaves a visited tsum in the middle of the row,
 *      and two tsums is 50px against a 47.5px reach, so everything past it is
 *      lost. A row the walk has already been in (it stepped out for a
 *      straggler) is re-entered at its nearest tsum, which is where the sweep
 *      left off. Nothing turns here: rule 1 first takes whatever lies further
 *      along, and rule 2 is the turn;
 *   4. anything left, nearest first, heading away from where it came -- the
 *      climb back up for what the sweep down left behind.
 *
 * `startRight` picks the corner; the caller tries both and keeps the longer.
 */
function gastonSnake(points: BoardPoint[], neighbors: number[][], rows: Int32Array,
                     startRight: boolean): number[] {
  const n = points.length;
  let start = -1;
  for (let i = 0; i < n; i++) {
    if (rows[i] !== 0) { continue; }
    if (start < 0 || (startRight ? points[i].x > points[start].x
                                 : points[i].x < points[start].x)) {
      start = i;
    }
  }
  if (start < 0) { return []; }

  let rowCount = 0;
  for (let i = 0; i < n; i++) { if (rows[i] >= rowCount) { rowCount = rows[i] + 1; } }
  // Visited tsums per row: whether a row rule 3 drops into is fresh or one the
  // walk has been in before.
  const seen = new Int32Array(rowCount);
  const visited = new Uint8Array(n);
  const route: number[] = [start];
  visited[start] = 1;
  seen[rows[start]]++;
  // Heading along the row: from the right corner the sweep goes left.
  let dir = startRight ? -1 : 1;
  let cur = start;
  for (;;) {
    const nbrs = neighbors[cur];
    const row = rows[cur];
    let best = -1;
    // 1. Along the row, or a straggler above it: the least far ahead.
    let bestKey = Infinity;
    for (let k = 0; k < nbrs.length; k++) {
      const u = nbrs[k];
      if (visited[u] || rows[u] > row) { continue; }
      const ahead = (points[u].x - points[cur].x) * dir;
      if (ahead > 0 && ahead < bestKey) { bestKey = ahead; best = u; }
    }
    // 2. Back along the row (or above): the nearest, and turn.
    if (best < 0) {
      for (let k = 0; k < nbrs.length; k++) {
        const u = nbrs[k];
        if (visited[u] || rows[u] > row) { continue; }
        const d = gastonDistance(points[u], points[cur]);
        if (d < bestKey) { bestKey = d; best = u; }
      }
      if (best >= 0) { dir = -dir; }
    }
    // 3. The nearest row below: a fresh row at its far end ahead, a row the
    //    walk has been in at its nearest tsum.
    if (best < 0) {
      let bestRow = Infinity;
      for (let k = 0; k < nbrs.length; k++) {
        const u = nbrs[k];
        if (visited[u] || rows[u] <= row) { continue; }
        const key = seen[rows[u]] === 0
          ? -(points[u].x - points[cur].x) * dir
          : gastonDistance(points[u], points[cur]);
        if (rows[u] < bestRow || (rows[u] === bestRow && key < bestKey)) {
          bestRow = rows[u]; bestKey = key; best = u;
        }
      }
    }
    // 4. Anything left, nearest first, heading away from here.
    if (best < 0) {
      for (let k = 0; k < nbrs.length; k++) {
        const u = nbrs[k];
        if (visited[u]) { continue; }
        const d = gastonDistance(points[u], points[cur]);
        if (d < bestKey) { bestKey = d; best = u; }
      }
      if (best >= 0) {
        const dx = points[best].x - points[cur].x;
        if (dx !== 0) { dir = dx > 0 ? 1 : -1; }
      }
    }
    if (best < 0) { break; }
    visited[best] = 1;
    seen[rows[best]]++;
    route.push(best);
    cur = best;
  }
  return route;
}

function gastonDistance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * The chain to draw over `board` -- the Gastons the drag may touch: the longest
 * snake from either top corner, or the longest path the search finds when the
 * snake dead-ended early. See the header.
 */
function gastonChain(board: BoardPoint[]): TsumPath | null {
  const cfg = GastonConfig;
  if (board.length < cfg.minChain) { return null; }
  const reach = Config.tsumWidth * Config.linkReach;
  const neighbors = buildTsumNeighbors(board, reach * reach);
  const rows = gastonRows(board);
  let best: number[] = [];
  for (let side = 0; side < 2; side++) {
    const route = gastonSnake(board, neighbors, rows, side === 1);
    if (route.length > best.length) { best = route; }
  }
  if (best.length < cfg.snakeMinShare * board.length) {
    const comps = findTsumComponents(neighbors);
    let biggest: number[] = [];
    for (let i = 0; i < comps.length; i++) {
      if (comps[i].length > biggest.length) { biggest = comps[i]; }
    }
    const found = findLongestTsumPath(neighbors, biggest, SearchStepBudget).path;
    if (found.length > best.length) { best = found; }
  }
  if (best.length < cfg.minChain) { return null; }
  const path: TsumPath = [] as TsumPath;
  for (let i = 0; i < best.length; i++) { path.push(board[best[i]]); }
  return path;
}

/** Tsums in the board's biggest colour cluster, for the log. */
function gastonBiggestCluster(board: BoardPoint[]): number {
  const sizes: { [tsumIdx: string]: number } = {};
  let biggest = 0;
  for (let i = 0; i < board.length; i++) {
    const n = (sizes[board[i].tsumIdx] || 0) + 1;
    sizes[board[i].tsumIdx] = n;
    if (n > biggest) { biggest = n; }
  }
  return biggest;
}

// --- Drawing it -------------------------------------------------------------

/** A board point as the screen coordinate the touch natives want. */
function gastonToScreen(ts: Tsum, p: BoardPoint): Point {
  return {
    x: Math.floor(ts.playOffsetX
      + (p.x + Config.tsumWidth / 2) * ts.playWidth / ts.playResizeWidth),
    y: Math.floor(ts.playOffsetY
      + (p.y + Config.tsumWidth / 2) * ts.playHeight / ts.playResizeHeight),
  };
}

/** Draw the chain, dwelling on each tsum and sweeping the gaps. See `dwellMs`. */
function gastonLinkChain(ts: Tsum, path: TsumPath): void {
  // A stopped run draws no new chain -- the same rule as `linkTsums`.
  if (!ts.isRunning || path.length < 2) { return; }
  const cfg = GastonConfig;
  const pts: Point[] = [];
  for (let i = 0; i < path.length; i++) { pts.push(gastonToScreen(ts, path[i])); }
  tapDown(pts[0].x, pts[0].y, cfg.grabMs);
  moveTo(pts[0].x, pts[0].y, cfg.dwellMs);
  for (let i = 1; i < pts.length; i++) {
    for (let s = 1; s <= cfg.stepsPerHop; s++) {
      const f = s / (cfg.stepsPerHop + 1);
      moveTo(Math.floor(pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f),
        Math.floor(pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f), cfg.stepMs);
    }
    moveTo(pts[i].x, pts[i].y, cfg.dwellMs);
  }
  const last = pts[pts.length - 1];
  tapUp(last.x, last.y, cfg.releaseMs);
}

/**
 * Cancel the pop animation: tap a bubble, and the surplus above the reserve
 * with it, furthest from the chain first. Answers how many went.
 *
 * Furthest because the chain's own tsums are already clearing -- a bubble
 * popped on top of them adds nothing, where one across the board clears ground
 * the chain did not reach. Positions come from the scan the chain was planned
 * off; bubbles are big and drift slowly, so the tap still lands.
 */
function gastonCancelBubble(ts: Tsum, path: TsumPath, bubbles: GameBubble[]): number {
  if (!ts.isRunning || bubbles.length === 0) { return 0; }
  const far: { b: GameBubble, d: number }[] = [];
  for (let b = 0; b < bubbles.length; b++) {
    let nearest = Infinity;
    for (let i = 0; i < path.length; i++) {
      const dx = bubbles[b].x - (path[i].x + Config.tsumWidth / 2);
      const dy = bubbles[b].y - (path[i].y + Config.tsumWidth / 2);
      const d = dx * dx + dy * dy;
      if (d < nearest) { nearest = d; }
    }
    far.push({ b: bubbles[b], d: nearest });
  }
  far.sort(function(p, q) { return q.d - p.d; });
  const count = Math.max(1, bubbles.length - GastonConfig.bubbleReserve);
  for (let i = 0; i < count && i < far.length; i++) {
    const x = Math.floor(ts.playOffsetX + far[i].b.x * ts.playWidth / ts.playResizeWidth);
    const y = Math.floor(ts.playOffsetY + far[i].b.y * ts.playHeight / ts.playResizeHeight);
    tap(x, y, GastonConfig.cancelTapMs);
  }
  // The board has moved, so every other position in the list is stale too.
  ts.gameBubbles = [];
  return count;
}

// --- The window -------------------------------------------------------------

/**
 * Scan, snake the board from the top, draw it, and cancel it if the release
 * lands before `cancelBefore` -- 0 never cancels, and a chain released past it
 * is `held`.
 *
 * The board is checked for first: this runs blind for ten seconds and more,
 * and a round that ends under it would otherwise have chains dragged across
 * whatever screen came next.
 */
function gastonPass(ts: Tsum, cancelBefore: number): GastonPass {
  if (gPages.detect(1, 0) !== PageName.GamePlaying) {
    return { chain: 0, cancelled: 0, held: false, read: 0, biggest: 0, onBoard: false };
  }
  const board = ts.scanBoardQuick();
  // Its own bubble read, not the scan's `ts.gameBubbles`: the scan's capture
  // cuts the bottom row of bubbles in half. See `bubbleHem`.
  const bubbles = gastonBubbles(ts);
  const biggest = gastonBiggestCluster(board);
  const gastons = gastonGastons(ts, board);
  const free = gastonFreeBoard(gastons, bubbles);
  const path = gastonChain(free);
  if (!path) {
    logInfo(Log.Skill.GastonPass, {
      chain: 0, read: board.length, gaston: gastons.length, cut: gastons.length - free.length,
      bubbles: bubbles.length, palette: gastonPalette.length,
    });
    return { chain: 0, cancelled: 0, held: false, read: board.length, biggest: biggest, onBoard: true };
  }
  // Its own drag, not `linkTsums` and emphatically not `link`: the pacing is
  // the point, and `link`'s `maybeAutoTapSkill` would re-enter this
  // choreography.
  gastonLinkChain(ts, path);
  // Decided at the release, not at the plan: the drag is a second and a half,
  // and it is where the *clear* falls against the close that matters.
  const held = Date.now() >= cancelBefore;
  const cancelled = held ? 0 : gastonCancelBubble(ts, path, bubbles);
  // The board the route was planned on and the route over it, so a short chain
  // on a recording can be replayed offline. Logged after the drag and the
  // cancel, which are what the window's time is for.
  const flat: number[] = [];
  for (let i = 0; i < free.length; i++) {
    flat.push(Math.round(free[i].x + Config.tsumWidth / 2), Math.round(free[i].y + Config.tsumWidth / 2));
  }
  const route: number[] = [];
  for (let i = 0; i < path.length; i++) { route.push(free.indexOf(path[i])); }
  logInfo(Log.Skill.GastonPass, {
    chain: path.length, read: board.length, gaston: gastons.length, cut: gastons.length - free.length,
    bubbles: bubbles.length, palette: gastonPalette.length,
    held: held, cancelled: cancelled, board: flat, route: route,
  });
  return {
    chain: path.length, cancelled: cancelled, held: held, read: board.length, biggest: biggest,
    onBoard: true,
  };
}

registerSkill({
  types: [SkillType.Gaston],
  // Every bubble is a cancel, and a cancel is what fits a second pass into the
  // window -- worth far more than the bigger clear the Bubble Strategy would
  // buy by popping one into a chain. So they are the skill's for the whole
  // round; what it still wants spent it asks for below.
  claimsBubbles: function() { return true; },
  // No `popBubblesAfterChain`: a bubble popped into a chain between windows
  // cancels a clear that is filling the gauge (see the header). The surplus is
  // spent on the window's own cancels instead (`gastonCancelBubble`).
  //
  // Every colour stays in the board array, so Gaston's second and third
  // clusters are there whatever the leftovers do -- see the header. Four, as
  // Coronation Day Elsa keeps, is more than a board of leftovers has colours.
  // It also keeps the HUD glyphs' cluster, which `gastonFreeBoard` cuts.
  extraClusterSlots: 4,
  // Neither chain setting applies to this skill -- see the header. Uncapped,
  // because right after a window the board is a single colour and the chain on
  // it is worth thirty (`npm run chain:bench -- --only=gaston` costs that
  // search); one per scan, because the rest of a batch is planned on a board
  // the first chain has already cleared, which is what turned that thirty into
  // a twelve and two threes in `gaston_wrong.mp4`.
  chainLimits: { maxChain: 0, maxChainsPerScan: 1 },
  afterActivate: function(ts, _board, activatedAt) {
    const cfg = GastonConfig;
    const t0 = activatedAt || Date.now();
    const level = Math.min(Math.max(ts.skillLevel, 1), cfg.durationMs.length);
    // His colours are learned afresh off this window's boards. See `gastonGastons`.
    gastonPalette = [];

    // The animation and the first fill are one wait, behind a floor: the
    // animation is never under three seconds, and a board that was full at the
    // tap counts as full under it. See `openMinMs`.
    const opened = gastonAwaitBoard(ts, t0 + cfg.openWaitMs, t0 + cfg.openMinMs, false);
    const openMs = Date.now() - t0;
    // The clock starts here, not at the tap. See `durationMs`.
    const closesAt = Date.now() + cfg.durationMs[level - 1];

    // The window: chain, cancel, wait for the drop, again, until a chain goes
    // out in the tail and is left to pop -- that one ends the window and is
    // the charge. The refill gate is not cut at the close: what is falling at
    // the close is Gaston, and the closing chain wants it landed.
    let passes = 0;
    let cancels = 0;
    let onBoard = true;
    // The chain popping as the window closes, 0 when none is.
    let clearing = 0;
    const drawn: number[] = [];
    const read: number[] = [];
    const biggest: number[] = [];
    while (ts.isRunning) {
      const pass = gastonPass(ts, closesAt - cfg.noCancelTailMs);
      passes++;
      if (!pass.onBoard) { onBoard = false; break; }
      read.push(pass.read);
      biggest.push(pass.biggest);
      if (pass.chain > 0) {
        drawn.push(pass.chain);
        cancels += pass.cancelled;
        if (pass.held) { clearing = pass.chain; break; }
        // A cancelled clear is gone at once; one left to pop takes its time
        // off the board tsum by tsum. See `popPerTsumMs`.
        const floor = pass.cancelled > 0 ? cfg.fillMinMs
          : Math.max(cfg.fillMinMs, pass.chain * cfg.popPerTsumMs + cfg.popTailMs);
        const at = Date.now();
        gastonAwaitBoard(ts, at + floor + cfg.fillWaitMs, at + floor, false);
      } else {
        // Nothing to chain, and the close well past: the board is not coming
        // back as Gaston. A ceiling, not the close itself, because a pass that
        // finds nothing right at the close is a refill still landing.
        if (Date.now() >= closesAt + cfg.fillWaitMs) { break; }
        ts.sleep(cfg.rescanIdleMs);
      }
    }

    // The charge: the window has closed, so every Gaston popping now fills the
    // gauge. With no chain clearing, one is drawn on the board as it stands
    // and left to pop; the gauge is then watched through the clear, and the
    // moment it reads full this returns -- the `useSkill` loop fires within a
    // read or two, while the chain that filled it is still popping. See the
    // header.
    const chargeFrom = Date.now();
    let charged = 0;
    let ready = false;
    if (onBoard && clearing === 0) {
      const wait = gastonAwaitBoard(ts, chargeFrom + cfg.fillMinMs + cfg.fillWaitMs, 0, true);
      if (wait.ready) {
        ready = true;
      } else {
        const pass = gastonPass(ts, 0);
        if (!pass.onBoard) { onBoard = false; }
        charged = pass.chain;
        clearing = pass.chain;
      }
    }
    // A short closing chain fills nothing worth waiting on. See `chargeMinChain`.
    if (onBoard && !ready && clearing >= cfg.chargeMinChain) {
      ready = gastonAwaitGauge(ts, Date.now() + cfg.gaugeWaitMs);
    }

    logInfo(Log.Skill.GastonDone, {
      skillLevel: level,
      windowMs: cfg.durationMs[level - 1],
      // The field to read first. `openMs` near 3900 with `openTsums` at a full
      // board is the gate working; `openMs` at the `openWaitMs` ceiling with
      // `openTsums` low is a board that never filled, and everything after it
      // was planned under the animation.
      openMs: openMs,
      openTsums: opened.peak,
      passes: passes,
      // Every chain the window drew, in order, the last of them the closing
      // chain left to pop. Thirty, thirty, thirty is the skill playing; a short
      // one is a board read before it had filled, or a route the game did not
      // follow -- `skill.gaston.pass` has the board and the route to replay.
      chains: drawn,
      // Per pass: how many tsums the scan put in the board array, and how many
      // of them its biggest colour cluster holds. `biggest` well under `read`
      // on a board that looks like solid Gaston is the scan reading him as
      // several colours -- the reason the snake is colour blind.
      read: read,
      biggest: biggest,
      // Bubbles tapped into the window's clears. At least one a chain bar the
      // last is the loop working; well under is a window with no bubble to
      // cancel with, whose refills ran the `fillWaitMs` ceiling.
      cancels: cancels,
      // The chain drawn after the close when none was clearing (0 otherwise),
      // and how long the charge took. `ready` is whether the gauge was seen
      // full; false at `gaugeWaitMs` hands the board to the play loop with the
      // gauge still filling. `onBoard: false` is a round that ended under the
      // window.
      charged: charged,
      chargeMs: Date.now() - chargeFrom,
      ready: ready,
      onBoard: onBoard,
      totalMs: Date.now() - t0,
    });
    // "It fired", which is what ends the play loop's link batch: the paths
    // still to draw were planned ten seconds ago on a board this window has
    // since cleared several times over. It is also what re-enters `useSkill`
    // at once, which is the tap the charge above was waiting to hand over.
    return true;
  }
});
