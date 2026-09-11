// Utils for Tsum

/** Squared distance -- the callers only ever compare it, so the sqrt is skipped. */
function getDistance(t1: Point, t2: Point): number {
  const dx = t1.x - t2.x;
  const dy = t1.y - t2.y;
  return dx * dx + dy * dy;
}

/**
 * Adjacency list over one colour group: `neighbors[i]` holds the indices of the
 * tsums within linking range of `tsums[i]`.
 */
function buildTsumNeighbors(tsums: Point[], maxDistSq: number): number[][] {
  const neighbors: number[][] = [];
  for (let i = 0; i < tsums.length; i++) {
    neighbors.push([]);
  }
  for (let i = 0; i < tsums.length; i++) {
    for (let j = i + 1; j < tsums.length; j++) {
      if (getDistance(tsums[i], tsums[j]) <= maxDistSq) {
        neighbors[i].push(j);
        neighbors[j].push(i);
      }
    }
  }
  return neighbors;
}

/** The connected components of the adjacency list, each a list of node indices. */
function findTsumComponents(neighbors: number[][]): number[][] {
  const n = neighbors.length;
  const seen: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) { seen[i] = false; }
  const components: number[][] = [];
  for (let s = 0; s < n; s++) {
    if (seen[s]) { continue; }
    const comp: number[] = [];
    const stack = [s];
    seen[s] = true;
    while (stack.length > 0) {
      const v = stack.pop()!;  // guarded by the loop condition
      comp.push(v);
      const nbrs = neighbors[v];
      for (let k = 0; k < nbrs.length; k++) {
        if (!seen[nbrs[k]]) {
          seen[nbrs[k]] = true;
          stack.push(nbrs[k]);
        }
      }
    }
    components.push(comp);
  }
  return components;
}

/** Set bits in a 32-bit integer. */
function popcount32(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return Math.imul((x + (x >>> 4)) & 0x0F0F0F0F, 0x01010101) >>> 24;
}

// Total DFS steps one component search may spend, over every start. With the
// memo below the search is exact and normally done in a few hundred steps; this
// only bounds the rare big, dense component (20 same-colour tsums at a wide
// reach). Set off the `worst ms` column of `npm run chain:bench`: a pruned
// step costs ~2.5x a plain one, and 3,000 is where the worst single search on
// QuickJS-ng comes in under the old search's (12 ms against 15) without a
// board in the benchmark losing a tsum to the cut.
const SearchStepBudget = 3000;

// Longest simple path inside one connected component: a depth-first search
// with two prunings that make it exact, rather than a heuristic, on every board
// the benchmark has measured (`npm run chain:bench`):
//
//   - reachability bound -- at depth d with r unvisited tsums still reachable,
//     no chain longer than d + r can follow, so a branch that cannot beat the
//     best is dropped before it is walked;
//   - dead-state memo -- a (visited set, tsum) pair explored to exhaustion is
//     never explored again, from any start. Valid for the rest of the search
//     because the best length only grows. Keyed by bitmask, so n <= 31; a
//     bigger component (Rapunzel+'s whole board) runs without it, and the cap
//     stops that search long before the memo would matter.
//
// Every tsum is tried as a start, most constrained first, and the memo is what
// makes the later starts cheap. `budget` caps the total steps across them.
//
// maxLen caps the chain the search may return (Infinity for no cap). It is a
// stopping condition rather than a post-hoc trim: once a chain of that length
// exists there is nothing better to find, so the search returns immediately —
// which is where the speed-up of a short cap comes from.
//
// `lowFirst`, when given, is the group's own points, and it orders the starts
// by board position as well as degree — see `calculatePaths`' parameter of the
// same name. `startIdx` is the tsum the winning chain grew from, its `path[0]`.
function findLongestTsumPath(
    neighbors: number[][], comp: number[], budget: number, maxLen?: number,
    lowFirst?: Point[]): { path: number[], startIdx: number } {
  // Bound to a const because `dfs` closes over it; a narrowing on the parameter
  // itself would not survive into the closure.
  const cap: number = (maxLen === undefined || !(maxLen > 0)) ? Infinity : maxLen;
  const n = neighbors.length;
  const visited = new Uint8Array(n);
  const path: number[] = [];
  let steps = 0;
  let bestLen = 0;
  let best: number[] = [];
  let stop = false;

  // Order each adjacency list by ascending degree so the search tries the most
  // constrained branches first — dead ends prune quickly and leaves get
  // consumed before they become unreachable.
  const sortedNbrs: number[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    const arr = neighbors[i].slice();
    arr.sort(function(a, b) { return neighbors[a].length - neighbors[b].length; });
    sortedNbrs[i] = arr;
  }

  // Everything below is built on the first backtrack. A search that reaches
  // its cap on the first descent -- the default cap of 3, Rapunzel+'s window --
  // never allocates any of it.
  //
  // For a component of up to 31 tsums the visited set is also kept as a
  // bitmask: it keys the memo, and the reachability sweep runs on masks of the
  // adjacency -- a few dozen integer ops rather than a walk over every edge.
  const maskable = n <= 31;
  let visitedMask = 0;
  let dead: Set<number> | null = null;
  let adjMask: Int32Array | null = null;
  // The list walk, for a component too big for a mask. A stamp marks what one
  // call has queued, so nothing is cleared between calls.
  let stampOf: Int32Array | null = null;
  let queue: Int32Array | null = null;
  let stamp = 0;

  // Unvisited tsums reachable from `v` through unvisited tsums.
  function reach(v: number): number {
    if (maskable) {
      if (adjMask === null) {
        adjMask = new Int32Array(n);
        for (let i = 0; i < n; i++) {
          const nbrs = neighbors[i];
          for (let k = 0; k < nbrs.length; k++) { adjMask[i] |= (1 << nbrs[k]); }
        }
      }
      let frontier = adjMask[v] & ~visitedMask;
      let seen = frontier;
      while (frontier !== 0) {
        const bit = frontier & -frontier;
        frontier ^= bit;
        const add = adjMask[31 - Math.clz32(bit)] & ~visitedMask & ~seen;
        seen |= add;
        frontier |= add;
      }
      return popcount32(seen);
    }
    if (stampOf === null || queue === null) {
      stampOf = new Int32Array(n);
      queue = new Int32Array(n);
    }
    stamp++;
    let head = 0;
    let tail = 0;
    const nbrs = neighbors[v];
    for (let k = 0; k < nbrs.length; k++) {
      const u = nbrs[k];
      if (visited[u] === 0) { stampOf[u] = stamp; queue[tail++] = u; }
    }
    while (head < tail) {
      const wn = neighbors[queue[head++]];
      for (let k = 0; k < wn.length; k++) {
        const u = wn[k];
        if (visited[u] === 0 && stampOf[u] !== stamp) { stampOf[u] = stamp; queue[tail++] = u; }
      }
    }
    return tail;
  }

  function dfs(v: number): void {
    steps++;
    visited[v] = 1;
    if (maskable) { visitedMask |= (1 << v); }
    path.push(v);
    let fresh = false;
    if (path.length > bestLen) {
      bestLen = path.length;
      best = path.slice();
      fresh = true;
      if (bestLen >= cap) { stop = true; }
    }
    if (!stop && steps >= budget) { stop = true; }
    if (!stop) {
      const key = maskable ? visitedMask * 32 + v : 0;
      // A fresh best is neither dead -- nothing reached this depth before --
      // nor prunable: that would need nothing reachable at all.
      if (fresh || dead === null || !dead.has(key)) {
        if (fresh || path.length + reach(v) > bestLen) {
          const nbrs = sortedNbrs[v];
          for (let k = 0; k < nbrs.length; k++) {
            const u = nbrs[k];
            if (visited[u] === 0) {
              dfs(u);
              if (stop) { break; }
            }
          }
        }
        // Only a branch walked to its end is dead; one cut short by the cap or
        // the budget is not.
        if (maskable && !stop) {
          if (dead === null) { dead = new Set<number>(); }
          dead.add(key);
        }
      }
    }
    path.pop();
    visited[v] = 0;
    if (maskable) { visitedMask &= ~(1 << v); }
  }

  // Sort component nodes by ascending degree — true endpoints (degree 1) lie
  // on long paths and make the best DFS starts. `lowFirst` breaks the ties by
  // board position, lowest tsum first: degree is a small integer so equal
  // starts are the common case, and which of them is tried first is what
  // decides where on the board an equally long chain ends up. A tiebreak and
  // not the primary key, so this cannot cost chain length.
  const starts = comp.slice();
  starts.sort(function(a, b) {
    const byDegree = neighbors[a].length - neighbors[b].length;
    if (byDegree !== 0 || !lowFirst) { return byDegree; }
    return lowFirst[b].y - lowFirst[a].y;
  });
  for (let s = 0; s < starts.length && !stop; s++) {
    if (bestLen >= comp.length) { break; }
    dfs(starts[s]);
  }

  return { path: best, startIdx: best.length > 0 ? best[0] : -1 };
}

// The `logs` parameter this used to take is gone: its only job was to hand the
// two debug lines below a translated string, and debug lines are keyed by event
// now rather than translated.
// `maxChain` overrides the "Maximum Chain Number" setting for this call only.
// Coronation Day Elsa is the one caller that passes it: her freeze line is drawn
// between a chain's ends, so while her window is open a long chain is worth much
// more than the setting's usual answer. Passing it beats writing `Config.maxChain`
// for the duration -- a choreography that threw would leave the whole run capped
// at whatever it had set.
// `lowFirst` grows each chain from the lowest tsum the search can start on
// rather than from any equally good one, and tags what comes back with the
// `startY` it grew from. Elsa's freeze window is the one caller: it freezes
// rather than clears, so its chains can be worked bottom-up, and `startY` is
// what the window orders them by. Everything else wants the longest chain
// wherever on the board it happens to sit.
function calculatePaths(
    board: BoardPoint[],
    myTsumIdx: number, prioritizeMyTsum: boolean, maxChain?: number,
    lowFirst?: boolean): TsumPath[] {
  const startTime = Date.now();
  const groups: { [tsumIdx: string]: BoardPoint[] } = {};
  for (const t in board) {
    const tsum = board[t];
    if (groups[tsum.tsumIdx] === undefined) {
      groups[tsum.tsumIdx] = [];
    }
    groups[tsum.tsumIdx].push(tsum);
  }

  // How far apart two tsums of one colour may be and still be linkable. This
  // is the constraint that decides how long a chain can get -- not "Maximum
  // Chain Number", which can only cap what this has already made reachable.
  // Both ends of its range cost something; see `TsumConfig.linkReach`.
  const threshold = Config.tsumWidth * Config.linkReach;
  const maxDistSq = threshold * threshold;
  const paths: TsumPath[] = [];
  // A cap makes the search stop as soon as a chain that long is found, so short
  // caps also make the scan cheaper — which is the point for tsums that play
  // better on many quick chains than on a few long ones.
  const cap = typeof maxChain === 'number' ? maxChain : Config.maxChain;
  const maxLen = cap > 0 ? cap : Infinity;

  for (const tsumIdx in groups) {
    const group = groups[tsumIdx];
    if (group.length < 3) { continue; }

    const neighbors = buildTsumNeighbors(group, maxDistSq);
    const components = findTsumComponents(neighbors);

    for (let c = 0; c < components.length; c++) {
      const comp = components[c];
      if (comp.length < 3) { continue; }
      const best = findLongestTsumPath(neighbors, comp, SearchStepBudget, maxLen,
        lowFirst ? group : undefined);
      const bestIndices = best.path;
      if (bestIndices.length >= 3) {
        const pathPoints: TsumPath = [];
        for (let p = 0; p < bestIndices.length; p++) {
          pathPoints.push(group[bestIndices[p]]);
        }
        pathPoints.tsumIdx = +tsumIdx;
        pathPoints.startY = group[best.startIdx].y;
        paths.push(pathPoints);
      }
    }
  }

  // With "Link MyTsum first" on, MyTsum chains play first (longest first), then
  // other colors by length. Otherwise, just take the longest available chain
  // regardless of color so anything connectable goes out as soon as possible.
  paths.sort(function(a, b) {
    if (prioritizeMyTsum) {
      const aMy = (myTsumIdx >= 0 && a.tsumIdx === myTsumIdx);
      const bMy = (myTsumIdx >= 0 && b.tsumIdx === myTsumIdx);
      if (aMy !== bMy) { return aMy ? -1 : 1; }
    }
    if (a.length < b.length) { return 1; }
    return -1;
  });
  // Lengths in play order, which is what "Maximum chain length" and "Chains per
  // board scan" are tuned against. Built lazily: a function field is a thunk the
  // logger only calls when the record is really going out.
  logDebug(Log.Board.PathDone, {
    paths: paths.length,
    durationMs: Date.now() - startTime,
    chainLengths: function() {
      const lens: number[] = [];
      for (let i = 0; i < paths.length; i++) { lens.push(paths[i].length); }
      return lens;
    },
  });
  return paths;
}

/**
 * How many of `chain`'s tsums are still standing where the drag left them.
 *
 * A chain the game takes is off the board within a frame of the release, so a
 * later scan that still finds every one of them is a drag that linked nothing.
 * That is the play loop's dead-scan check (`DeadScanTolerancePx`, play.ts) and
 * the same question `lorcanaAuroraBurstCheck` asks of her bubbles -- matched
 * against one later scan rather than followed read to read, because here the
 * two readings are whole board scans a batch apart, not frames.
 *
 * `tolerance` is play-square px: the square is 200 across and tsums sit ~25
 * apart, so a few px is the pile's own jitter and a moved tsum is far outside
 * it.
 */
function boardStillHolds(board: BoardPoint[], chain: BoardPoint[], tolerance: number): number {
  const maxDistSq = tolerance * tolerance;
  let held = 0;
  for (let i = 0; i < chain.length; i++) {
    for (let j = 0; j < board.length; j++) {
      const dx = board[j].x - chain[i].x;
      const dy = board[j].y - chain[i].y;
      if (dx * dx + dy * dy <= maxDistSq) {
        held++;
        break;
      }
    }
  }
  return held;
}

// The longest chain reachable from the tsum nearest to a touch point, in the
// same shape calculatePaths returns. Used by Click Assist: the user points at a
// tsum, this works out which of its color-mates are connected to it and in what
// order to draw them.
function findChainAtTouch(board: BoardPoint[], touchX: number, touchY: number): TsumPath | null {
  if (!board || board.length === 0) { return null; }

  let nearestAllIdx = -1;
  let nearestAllDistSq = Infinity;
  // How near the tap has to land to count as pointing at a tsum -- a bit over
  // one tsum, so a tap between two picks the closer one instead of missing.
  // The multiplier moved 1.8 -> 1.15 when tsumWidth was corrected 16 -> 25, to
  // hold the reach at ~29px; unlike the link radius below, this one was already
  // the size it wanted to be.
  const maxTouchDistSq = (Config.tsumWidth * 1.15) * (Config.tsumWidth * 1.15);
  for (let i = 0; i < board.length; i++) {
    const dx = board[i].x - touchX;
    const dy = board[i].y - touchY;
    const d = dx * dx + dy * dy;
    if (d < nearestAllDistSq) {
      nearestAllDistSq = d;
      nearestAllIdx = i;
    }
  }
  if (nearestAllIdx === -1 || nearestAllDistSq > maxTouchDistSq) { return null; }

  const tsumIdx = board[nearestAllIdx].tsumIdx;
  const group: BoardPoint[] = [];
  let nearestInGroup = -1;
  for (let i = 0; i < board.length; i++) {
    if (board[i].tsumIdx === tsumIdx) {
      if (i === nearestAllIdx) { nearestInGroup = group.length; }
      group.push(board[i]);
    }
  }
  if (group.length < 3 || nearestInGroup === -1) { return null; }

  // The same reach the auto-player uses, so Click Assist draws the chain the
  // script would have drawn rather than a different one.
  const threshold = Config.tsumWidth * Config.linkReach;
  const maxDistSq = threshold * threshold;
  const neighbors = buildTsumNeighbors(group, maxDistSq);

  // Flood fill from the touched tsum: only the component it actually belongs to
  // can be linked, however many same-colored tsums sit elsewhere on the board.
  const n = group.length;
  const seen: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) { seen[i] = false; }
  const queue: number[] = [nearestInGroup];
  seen[nearestInGroup] = true;
  const comp: number[] = [];
  while (queue.length > 0) {
    const v = queue.shift()!;  // guarded by the loop condition
    comp.push(v);
    const nbrs = neighbors[v];
    for (let k = 0; k < nbrs.length; k++) {
      if (!seen[nbrs[k]]) {
        seen[nbrs[k]] = true;
        queue.push(nbrs[k]);
      }
    }
  }
  if (comp.length < 3) { return null; }

  // No cap here: "Maximum chain length" is about how the auto-player paces
  // itself. Click Assist is the user pointing at a chain and asking for it, so
  // it always draws the whole thing.
  const bestIndices = findLongestTsumPath(neighbors, comp, SearchStepBudget, Infinity).path;
  if (bestIndices.length < 3) { return null; }

  const pathPoints: TsumPath = [];
  for (let p = 0; p < bestIndices.length; p++) {
    pathPoints.push(group[bestIndices[p]]);
  }
  pathPoints.tsumIdx = +tsumIdx;
  return pathPoints;
}

/**
 * The grayscale, blurred copy both Hough passes run on.
 *
 * `findTsums` and `findGameBubbles` hunt circles of different sizes in the same
 * picture, so they want a byte-identical preprocessed image -- and each used to
 * build its own, paying a clone, a colour conversion and a 9x9 Gaussian twice
 * per board scan for the same result.
 *
 * The caller owns the handle and must release it. Both passes take it as a
 * required parameter rather than building one on demand: an optional argument
 * would make ownership conditional, which is the shape that leaks native memory
 * on whichever path forgets.
 */
function buildBoardGray(img: NativeImage): NativeImage {
  const tmpImg = clone(img);
  const grayImg = bgrToGray(tmpImg);
  releaseImage(tmpImg);
  smooth(grayImg, 2, 9);
  return grayImg;
}

// Game bubbles are circles too, just a good deal bigger than a tsum, so they
// come out of the same grayscale Hough pass at a larger radius -- the very same
// pass, now: `grayImg` is the board gray the scan already built for findTsums.
// Locating them therefore costs no screenshot and no second blur, which is the
// point: the taps have to land while the chain is still going off.
function findGameBubbles(grayImg: NativeImage): GameBubble[] {
  const cfg = GameBubbleConfig;
  // houghCircles returns centres, unlike the board points findTsums feeds the
  // pathfinder (those are shifted to a tsum's top-left corner).
  const found = houghCircles(grayImg, 3, 1, cfg.minDist, cfg.param1, cfg.param2,
                             cfg.minRadius, cfg.maxRadius);
  const out: GameBubble[] = [];
  for (const k in found) {
    // `radius` is the native's own field name -- see `HoughCircle`. This read
    // `found[k].r` and so stored `undefined` until that was declared properly.
    out.push({x: found[k].x, y: found[k].y, r: found[k].radius});
  }
  return out;
}

// A tsum's circle in the 200px play square `findTsums` works in. Hoisted out of
// it because `findTsumCount` runs the same pass for the count alone, and two
// copies of these would drift the first time one was retuned.
var TsumCircle = {
  dp: 1,           // accumulator resolution (lower = finer)
  minDist: 22,     // min gap between circle centers
  param1: 20,      // Canny high threshold
  param2: 10,      // accumulator vote threshold
  minRadius: 8,
  maxRadius: 14,
};

/**
 * How many tsums the board is showing -- `findTsums`' circle pass, counted and
 * nothing else, so no clone, no blur and no colour conversion.
 *
 * What it is for is telling a board that has finished clearing from one that is
 * still going: outside a fever the game removes a big clear's tsums slowly, and
 * that is motion too small for `Tsum.settleBoard`'s grid to call moving while
 * being most of the board a burst wants. `grayImg` is the caller's.
 */
function findTsumCount(grayImg: NativeImage): number {
  const c = TsumCircle;
  return houghCircles(grayImg, 3, c.dp, c.minDist, c.param1, c.param2,
    c.minRadius, c.maxRadius).length;
}

/**
 * Locate the tsums on the board and sample each one's colour.
 *
 * `grayImg` is the shared board gray from `buildBoardGray`, which the caller
 * owns -- circle detection runs on a plain grayscale copy, NOT a colour mask.
 * The old HSV outRange masks filtered blue tsums out before detection, so their
 * circles were never found and blue chains went unplayed. Grayscale is
 * colour-agnostic: it detects every tsum, and colour is then sampled from the
 * HSV image and clustered separately in classifyTsums.
 */
function findTsums(img: NativeImage, grayImg: NativeImage): TsumPoint[] {
  // Every native image allocated here must be released even when a native
  // call throws mid-scan: the task controller swallows task errors and
  // retries, so a leak on this hot path would silently recur on every scan.
  // `grayImg` is deliberately not on that list -- the caller allocated it.
  const hsvImg = clone(img);
  let debugImg: NativeImage | null = null;
  try {
    const minRadius = TsumCircle.minRadius;
    const points = houghCircles(grayImg, 3, TsumCircle.dp, TsumCircle.minDist,
      TsumCircle.param1, TsumCircle.param2, minRadius, TsumCircle.maxRadius);

    if (ts!.debug) {
      debugImg = clone(img);
      for (let d = 0; d < points.length; d++) {
        const pt = points[d];
        drawCircle(debugImg, pt.x, pt.y, minRadius, 255, 0, 0, 1);
      }
      saveImage(debugImg, ts!.storagePath + "/tmp/" + ts!.runTimes + "-detectedHoughCircles.jpg");
      releaseImage(debugImg);
      debugImg = null;
    }

    // Heavy blur to smear out face features, then a 5-pixel cross average at
    // the circle center.
    //
    // Blur first, convert second, and that order matters. Blurring an image
    // that is already HSV averages hue linearly, but hue is a circle: red sits
    // at both 0 and 179, so a red tsum's blurred hue landed near 90 -- on top
    // of green. Blurring in BGR averages three linear channels and converts
    // once, which leaves red at 0. See `chromaFeature` for the rest of it.
    smooth(hsvImg, 1, 22);
    convertColor(hsvImg, 40);

    // One crossing for the whole board instead of up to five per circle. A
    // typical board is 40-60 tsums, so this was 200-300 separate reads of the
    // same image every scan; the sampling was never the cost, the crossings
    // were (the same reason `Tsum.getColors` and page scoring batch theirs).
    //
    // Every circle contributes exactly five points, in cross order, so circle
    // `i` owns samples[i*5 .. i*5+4] with no bookkeeping. A neighbour that
    // would fall off the edge is replaced by the centre coordinate rather than
    // dropped, which is precisely what the old code's `hsvN = hsv1` default
    // did: the skipped neighbour contributed the centre colour to the average.
    // Passing the out-of-range point instead would not do -- those read back as
    // transparent black and would drag the mean toward zero.
    const CrossPoints = 5;
    const pts: Point[] = [];
    for (let k = 0; k < points.length; k++) {
      const p = points[k];
      pts.push({x: p.x, y: p.y});
      pts.push({x: p.x - 1 >= 0 ? p.x - 1 : p.x, y: p.y});
      pts.push({x: p.x + 1 < Config.screenResize ? p.x + 1 : p.x, y: p.y});
      pts.push({x: p.x, y: p.y - 1 >= 0 ? p.y - 1 : p.y});
      pts.push({x: p.x, y: p.y + 1 < Config.screenResize ? p.y + 1 : p.y});
    }
    const samples = pts.length > 0 ? getImageColors(hsvImg, pts) : [];

    const results: TsumPoint[] = [];
    for (let k = 0; k < points.length; k++) {
      const p = points[k];
      const base = k * CrossPoints;
      let sumb = 0, sumg = 0, sumr = 0;
      for (let s = 0; s < CrossPoints; s++) {
        const c = samples[base + s];
        sumb += c.b; sumg += c.g; sumr += c.r;
      }
      const c = chromaFeature({
        b: sumb / CrossPoints,
        g: sumg / CrossPoints,
        r: sumr / CrossPoints
      });
      results.push({
        // `z` is the circle's radius, and `radius` is the native's field name
        // -- see `HoughCircle`. This read `p.r`, so `z` was `undefined` on
        // every tsum; nothing reads it, which is why nothing noticed.
        x: p.x, y: p.y, z: p.radius,
        b: c.b, g: c.g, r: c.r
      });
    }

    if (ts!.debug) {
      saveImage(hsvImg, ts!.storagePath + "/tmp/" + ts!.runTimes + "-hsvImg.jpg");
    }

    return results;
  } finally {
    if (debugImg != null) { releaseImage(debugImg); }
    releaseImage(hsvImg);
  }
}

// --- the board colour model ------------------------------------------------
//
// How a sampled tsum becomes three numbers to cluster on.
//
// Hue is an angle, and the model this replaced treated it as an ordinary
// number twice over: `cv::blur` averaged it linearly across the 0/179 wrap,
// and `classifyTsums` averaged it again into a running cluster mean. Both are
// wrong at the wrap, and red lives there. Measured over 674 red tsums on one
// recorded round, 3% of them read within 15 of red's true hue; the rest spread
// over the whole wheel with a mean of 82.6, which is where green reads (81.2).
// A red tsum was merged with a green one 22% of the time -- about as often as
// with another red (35%).
//
// So hue and saturation go down as one vector on the chroma plane, and value
// is carried separately at a weight:
//
//     (S * cos H, S * sin H, ChromaValueWeight * V)
//
// which fixes both averages at once -- there is no wrap to cross, and the mean
// of several vectors is a vector. It also disarms the other failure: a washed
// out tsum has a tiny radius rather than a wild angle, so the koalas stop
// scattering (same-colour agreement 23% -> 45%). Plain BGR was tried and is
// better than either on an evenly lit board, but it ties colour to brightness
// and collapses when the board dims -- which is what a fever stage does.
const ChromaValueWeight = 0.5;

// What counts as the same colour on the chroma plane -- the old model's 15 does
// not carry over, because the axes are not the same lengths.
//
// Swept over three hand-labelled boards (same-type and different-type tsum
// pairs) and every second of one recorded round, against the old model at its
// own 15, which merged 52.0% of same-type pairs and 2.9% of different-type
// ones for a longest chain of 4.05 and a 4+ chain on 40% of boards:
//
//     40   63.7% same   2.2% wrong   chain 4.39   4+ on 57%
//     45   67.0% same   3.4% wrong   chain 4.91   4+ on 69%
//     50   70.9% same   5.1% wrong   chain 5.75   4+ on 84%
//
// 40 is the point that beats the old model on *both* counts rather than trading
// one for the other. A wrong merge is a drag the game will not link, so the
// higher rows are worth having only if live play says those cost little.
const ChromaMergeDistance = 40;

/** An HSV sample as the board model clusters it. */
function chromaFeature(hsv: Color): Color {
  // OpenCV packs hue as degrees/2 into 0..179, so the angle is 2h degrees.
  const a = hsv.b * (Math.PI / 90);
  return {
    b: hsv.g * Math.cos(a),
    g: hsv.g * Math.sin(a),
    r: ChromaValueWeight * hsv.r
  };
}

/**
 * A cluster centre back as hue/saturation/value.
 *
 * Everything downstream of the scan reads `ts.boardClusters` as HSV -- Elsa's
 * frozen box and Formal Beast's two hue families both do -- so the model
 * changed how tsums are grouped and not what a group is then called.
 */
function chromaToHsv(c: Color): Color {
  let h = Math.atan2(c.g, c.b) * (90 / Math.PI);
  if (h < 0) { h += 180; }
  return {b: h, g: Math.sqrt(c.b * c.b + c.g * c.g), r: c.r / ChromaValueWeight};
}

// Distance between two tsum colours on the chroma plane, which is an ordinary
// Euclidean space. The HSV model this replaced needed three rebates on top of
// the same formula -- near hues, near saturations, and a dark pair -- and each
// of them was patching a pathology the plane does not have.
function distance3D(p1: Color, p2: Color): number {
  const db = p1.b - p2.b, dg = p1.g - p2.g, dr = p1.r - p2.r;
  return Math.sqrt(db * db + dg * dg + dr * dr);
}

// Greedy single pass against a drifting running mean, fixed merge threshold,
// unbounded cluster count. Each point joins the CLOSEST cluster within the
// threshold rather than the first one found: when two clusters both fall inside
// the merge distance (common once blue variants are detected), first-match
// could bleed a point into the wrong colour and drift both means; nearest-match
// keeps the assignment stable.
function classifyTsums(points: TsumPoint[]): TsumCluster[] {
  const threshold = ChromaMergeDistance;
  if (!Array.isArray(points) || points.length === 0) {
    return [];
  }

  const clusters: TsumCluster[] = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    let bestCluster: TsumCluster | null = null;
    let minDistance = Infinity;

    // Find the closest existing cluster within threshold.
    for (let j = 0; j < clusters.length; j++) {
      const cluster = clusters[j];
      const d = distance3D(cluster, p);
      if (d < threshold && d < minDistance) {
        minDistance = d;
        bestCluster = cluster;
      }
    }

    if (bestCluster) {
      // Add to the nearest cluster and update its running mean colour.
      bestCluster.points.push(p);
      const count = bestCluster.points.length;
      bestCluster.sumb += p.b; bestCluster.sumg += p.g; bestCluster.sumr += p.r;
      bestCluster.b = bestCluster.sumb / count;
      bestCluster.g = bestCluster.sumg / count;
      bestCluster.r = bestCluster.sumr / count;
    } else {
      clusters.push({ sumb: p.b, sumg: p.g, sumr: p.r, b: p.b, g: p.g, r: p.r, points: [p] });
    }
  }

  return clusters;
}

function detectOffsetYInGame() {
  const img = getScreenshot();
  try {
    const size = getImageSize(img);
    const centerY = Math.floor(size.height / 2);

    // find top black
    let topBlackY = 0;
    let y: number;
    let color: Color;
    for (y = centerY; y >= 0; y--) {
      color = getImageColor(img, size.width*0.9, y);
      if (isSameColor({r: 0, g: 0, b: 0}, color, 6)) {
        // black color found
        topBlackY = y;
        break;
      }
    }
    let bottomBlackY = size.height;
    for (y = centerY; y < size.height; y++) {
      color = getImageColor(img, size.width*0.9, y);
      if (isSameColor({r: 0, g: 0, b: 0}, color, 6)) {
        // black color found
        bottomBlackY = y;
        break;
      }
    }
    // One record rather than the four separate numbers this used to print:
    // they are one measurement, and reading them apart never made sense.
    logInfo(Log.Screen.DetectOffset, 'Detected the game area inside the device screen', {
      deviceWidth: size.width,
      deviceHeight: size.height,
      topBlackY: topBlackY,
      bottomBlackY: bottomBlackY,
      screenHeight: bottomBlackY - topBlackY + 1,
    });
    return -topBlackY;
  } finally {
    releaseImage(img);
  }
}

// Tsum struct

