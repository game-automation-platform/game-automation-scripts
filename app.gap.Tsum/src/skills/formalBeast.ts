// ---------------------------------------------------------------------------
// Formal Suit Beast.
//
// A burst skill with a second half. The activation itself is a plain tap and
// wants nothing choreographed -- what makes this skill different is what the
// board turns into afterwards: for a while there are only Beast (blue) and
// Belle (gold) tsums, and a twin gauge is drawn across the bottom of the play
// area, one half per colour, filling inwards from each end towards a rose in
// the middle. Whichever half reaches the rose detonates across the board; if
// that detonation is enough to finish the *other* half too, the mode pays out a
// run of much larger bursts instead of the one, and then both halves reset.
//
// So there is a way to play the mode badly, and it is the way the ordinary play
// loop plays it: take the longest chain going, every scan, whatever colour it
// is. That fills one half far ahead of the other, tops it out while the other
// is still low, and spends the cycle on a single burst. The way to play it well
// is to keep the two halves level -- specifically, to keep the trailing half at
// or above `FormalBeastPlay.pairFill` before the leading one is allowed to top
// out, because the burst carries the trailing half about that far.
//
// Keeping them level is free, and it matters that it is. Both halves fill on
// tsums cleared of their own colour, so the pair fills at whatever rate the
// board is being cleared at and the only choice on offer is which half each
// clear feeds. Refusing to link the leading colour does not fill the trailing
// half any faster -- it just stops the clock, and during the mode there are
// only two colours on the board, so a refused colour is half of everything
// there is to link. That is what this skill used to do, and with no third
// colour to fall back on a scan whose trailing colour had no linkable
// component linked nothing at all: a whole cycle's capture, circle detection
// and clustering spent, and the combo timer running down through it.
//
// So nothing here refuses a chain. The leading colour is *throttled* instead:
// its chains are cut to what still fits under the rose, and a short chain is
// still a clear, still a combo, and still one drag. Two more things follow from
// the two-colour board -- chains there want to be long, because its components
// are huge and a scan yields one chain per component, so the ordinary cap of 3
// throws the mode's own gift away; and how far one cleared tsum moves a gauge
// is worth measuring rather than assuming, since the readings and the batch
// sizes to measure it with are both already here.
//
// This file is therefore three things:
//
//   ts.readFormalBeastGauges()  one look at the arc, off its own crop. No
//                               memory, no events.
//   gFormalBeast                the mode's state, fed by the play loop, plus
//                               what it has learned about the gauge's rate.
//   formalBeastOrderPaths       the chain policy those two drive.
//
// Everything the reading depends on -- the crop, the probe points, the colour
// cutoffs and the two thresholds above -- is under "Tuning data" below,
// including why the arc cannot be a page fingerprint.
//
// The play loop reaches all of this through `SkillHandler.orderPaths`, so none
// of it runs, and no capture is taken for it, unless Formal Suit Beast is the
// selected skill.
// ---------------------------------------------------------------------------

// --- Tuning data ---------------------------------------------------------
//
// The crop, the probe points, the colour cutoffs and the two play thresholds:
// what `readFormalBeastGauges` below reads to find out where the two halves
// are.
//
// ## Why this is not a page fingerprint
//
// The gauge is a mode of the board, like fever time, so it has no `PageName`
// (see `FeverProbes` above, and the note on `PageDef.variant`). Unlike fever it
// also cannot be read the way page probes are read. Measured off
// corpus/GamePlaying/formal_beast_* (540x960): the unlit channel runs x 30..234
// on the left and x 302..510 on the right, its centre line fits
// y = 771.7 - 5.157e-4 (x - 270)^2 to within half a pixel over both, and it is
// about 10px thick. Doubled into logical 1080x1920 that is
// y = 1543.5 - 2.579e-4 (x - 540)^2 and ~20px -- which is three pixels on the
// 360px-wide capture every other probe table is read from, with the two ends of
// the arc five pixels apart. So this one is read off a native-resolution crop
// instead, and there is no `Page` entry for the mode to go with it.
var FormalBeastConfig = {
  // The crop `readFormalBeastGauges` grabs, in logical coordinates: the arc and
  // its upper rim, with room around both for the probes to land in after the
  // rounding in `toRealXY`. No resize and no JPEG -- see above.
  strip: {x: 50, y: 1468, w: 980, h: 88},
  // A probe reads as unlit channel at or below `darkMax` and as a lit gauge at
  // or above `litMin`. The channel measures 16-33 on every corpus frame and a
  // lit gauge 255, so what these two have to survive is a glow, not a close
  // call -- everything between them is treated as the boundary pixel.
  darkMax: 60,
  litMin: 140,
  // How far a lit probe has to lean towards its own channel to be called Beast
  // blue (measured rgb 66-123 / 166-255 / 255) or Belle gold (255 / 219-255 /
  // 33-99). Both leans are at least 130 on every pixel measured, in a range
  // that only reaches 255.
  hueLean: 60,
  // Brightest channel a rim probe may read and still say the arc is not drawn.
  //
  // An empty gauge is forty dark probes, and a board can be dark along the
  // bottom too -- for a moment after a big clear, which with this skill is
  // exactly when the question gets asked. So an empty reading has to be
  // *positively* an empty gauge, and the frame around it is what says so: it is
  // gold while the gauge fills and white under a burst, but never dark. It
  // measures at worst 214 on the three corpus frames, against 33 for the
  // channel it sits over.
  rimMin: 150
};

// The two gauges, outer end first.
//
// Probe `i` of `n` sits at the ((i + 0.5) / n) mark along the channel, measured
// by arc length rather than across the screen, so a gauge with `k` of them lit
// is k/n full and the answer has a resolution of one step. The left gauge is
// Beast's and fills rightwards, the right one is Belle's and fills leftwards;
// both run towards the rose in the middle, which is why one list ascends in x
// and the other descends.
//
// Generated from the channel fit above, not read off pixel by pixel. Check them
// against a frame rather than adjusting one: a point that has drifted has taken
// the whole fit with it.
var FormalBeastGauges: { beast: Point[], belle: Point[] } = {
  beast: [
    {x:   74, y: 1487}, {x:   94, y: 1492}, {x:  113, y: 1497}, {x:  133, y: 1501},
    {x:  153, y: 1505}, {x:  173, y: 1509}, {x:  193, y: 1512}, {x:  213, y: 1516},
    {x:  233, y: 1519}, {x:  253, y: 1522}, {x:  273, y: 1525}, {x:  293, y: 1528},
    {x:  313, y: 1530}, {x:  333, y: 1532}, {x:  353, y: 1534}, {x:  373, y: 1536},
    {x:  393, y: 1538}, {x:  413, y: 1539}, {x:  434, y: 1541}, {x:  454, y: 1542}
  ],
  belle: [
    {x: 1006, y: 1487}, {x:  986, y: 1492}, {x:  967, y: 1497}, {x:  947, y: 1501},
    {x:  927, y: 1505}, {x:  907, y: 1509}, {x:  887, y: 1512}, {x:  867, y: 1516},
    {x:  847, y: 1519}, {x:  827, y: 1522}, {x:  807, y: 1525}, {x:  787, y: 1528},
    {x:  767, y: 1530}, {x:  747, y: 1532}, {x:  727, y: 1534}, {x:  707, y: 1536},
    {x:  687, y: 1538}, {x:  667, y: 1539}, {x:  646, y: 1541}, {x:  626, y: 1542}
  ]
};

// One probe step, and so the resolution of every fill this file reads: the
// smallest move that is a move rather than noise. Derived, not written down,
// because the probe list above is what decides it.
const FormalBeastGaugeStep = 1 / FormalBeastGauges.beast.length;

// The arc's own frame: eight points on the gold rim above the channel, spread
// across both halves and clear of the rose in the middle.
//
// These carry no fill information and are not read for one. They are what makes
// an empty gauge different from a dark board -- see `FormalBeastConfig.rimMin`.
// Nine logical px above the channel centre is where the rim is brightest at
// every x measured, and 18 is that doubled.
var FormalBeastRim: Point[] = [
  {x:  100, y: 1476}, {x:  240, y: 1502}, {x:  380, y: 1519}, {x:  460, y: 1524},
  {x:  620, y: 1524}, {x:  700, y: 1519}, {x:  840, y: 1502}, {x:  980, y: 1476}
];

// Which colour cluster on the board is Beast's and which is Belle's.
//
// Hue here is OpenCV's 0..179, which is what `findTsums` samples and
// `classifyTsums` averages into a cluster centre. Over the play area of the
// three corpus frames the board is two hue families and nothing else: Belle's
// gold peaks at 10-20 and Beast's blue at 100-110, with under 1% of saturated
// pixels between them. So the pair is told apart by which way round it is
// rather than by hitting a number, and these are the two sanity checks on that
// -- a board that fails either is refused rather than guessed at.
var FormalBeastTsumHues = {
  /** Least separation between the two cluster hues before the pair is refused. */
  minGap: 25,
  /** Where the blue one has to land. Wide on purpose: it is a guard, not the test. */
  beastHueMin: 60,
  beastHueMax: 150
};

// What the play loop does about all this.
var FormalBeastPlay = {
  // Where "the burst will finish the other gauge too" starts, and the number
  // the whole mode is played around: below it a burst is worth one detonation,
  // at or above it the trailing gauge tops out on the same burst and the mode
  // pays out the long one instead.
  pairFill: 0.60,
  // The chain cap while the mode is running, overriding "Maximum Chain Number".
  //
  // The mode leaves two colours on the board, which makes its components huge
  // -- and `calculatePaths` returns one chain per component, so a scan there
  // offers two or three chains at all. Under the setting's default of 3 that is
  // nine tsums for a whole scan cycle. 15 is the top of the setting's own
  // documented range, so nothing downstream is handed a number a player could
  // not have chosen. Outside the mode the board is an ordinary five colours and
  // the setting is right again.
  modeMaxChain: 15,
  // How far one cleared tsum moves its own half, before anything has been
  // measured, and the band a measurement may move it inside.
  //
  // A gauge is twenty probe steps, so the seed is one gauge per ~67 tsums of
  // its colour. The band is what stops a single bad sample -- a detonation read
  // as a fill, a crop caught mid-burst -- from making the budget below absurd
  // in either direction; a rate outside it is refused rather than clamped, on
  // the grounds that it is evidence of the wrong thing rather than a slow gauge.
  fillPerTsum: 0.015,
  fillPerTsumMin: 0.004,
  fillPerTsumMax: 0.06,
  /** Weight of each accepted measurement in the running estimate. */
  fillLearnRate: 0.25,
  // How much of the leading half is kept clear of the rose when budgeting, as a
  // fraction. One probe step: the reading's own resolution, so a budget cannot
  // be wrong by more than the number it was computed from.
  headroomMargin: 0.05,
  // How long a mode whose gauges have stopped reading is held open, in ms. A
  // burst crosses the whole board and can cover them, so while a mode is
  // running an unreadable crop is no reading at all rather than evidence the
  // mode is over -- the same refusal `gFever` makes of an `Unknown` page
  // mid-round, and for the same reason.
  unreadableHoldMs: 2500
};

/** What one gauge probe landed on. */
const enum FormalBeastCell {
  /** Unlit channel. */
  Dark = 0,
  /** Lit blue -- Beast's half. */
  Beast = 1,
  /** Lit gold -- Belle's half. */
  Belle = 2,
  /** Neither: the soft edge of a fill, or not the gauge at all. */
  Other = 3
}

/** Which half of the arc a probe list belongs to, and so what "lit" means on it. */
function formalBeastCell(c: Color): FormalBeastCell {
  const cfg = FormalBeastConfig;
  const brightest = Math.max(c.r, Math.max(c.g, c.b));
  if (brightest <= cfg.darkMax) { return FormalBeastCell.Dark; }
  if (brightest < cfg.litMin) { return FormalBeastCell.Other; }
  if (c.b - c.r >= cfg.hueLean) { return FormalBeastCell.Beast; }
  if (c.r - c.b >= cfg.hueLean) { return FormalBeastCell.Belle; }
  return FormalBeastCell.Other;
}

/**
 * How full one half is, 0..1 -- or -1 when these probes are not a gauge.
 *
 * A half is lit from its outer end inwards, so the only valid shape is a run of
 * its own colour followed by a run of unlit channel. One probe between the two
 * may be neither: the fill has a soft edge about a third of a step wide, so a
 * probe lands in it now and again, and that one counts as half a step. Anything
 * else -- the other half's colour, a second boundary, a lit probe past the dark
 * -- means the crop is not showing a gauge.
 *
 * That refusal is the mode test. Away from the mode these same pixels land on
 * the bottom row of the board, where any colour can turn up in any order: over
 * the corpus, the seven `GamePlaying` frames without the mode all fail it, most
 * of them on the very first probe.
 */
function formalBeastFill(cells: FormalBeastCell[], own: FormalBeastCell): number {
  let lit = 0;
  while (lit < cells.length && cells[lit] === own) { lit++; }
  const edge = (lit < cells.length && cells[lit] === FormalBeastCell.Other) ? 1 : 0;
  for (let i = lit + edge; i < cells.length; i++) {
    if (cells[i] !== FormalBeastCell.Dark) { return -1; }
  }
  return (lit + edge * 0.5) / cells.length;
}

Tsum.prototype.readFormalBeastGauges = function() {
  const cfg = FormalBeastConfig;
  const near = this.toRealXY(cfg.strip.x, cfg.strip.y);
  const far = this.toRealXY(cfg.strip.x + cfg.strip.w, cfg.strip.y + cfg.strip.h);
  const x = Math.max(0, near.x);
  const y = Math.max(0, near.y);
  // No resize and no quality drop, and the probes stay crop-local -- the same
  // three reasons `checkSkillReadinessFast` crops. Here the resolution is not
  // an optimisation but the whole point: the channel is ~20 logical px thick,
  // which is three pixels on the 360px-wide capture the page probes are read
  // from, with the arc's two ends five pixels apart.
  const img = getScreenshotModify(x, y, far.x - x, far.y - y, 0, 0, 100);
  try {
    const gauges = FormalBeastGauges;
    const nBeast = gauges.beast.length;
    const nBelle = gauges.belle.length;
    // One crossing for all forty-eight, as everywhere else a table of probes is
    // read off one frame. Gauge probes first, both halves, then the rim.
    const pts: Point[] = [];
    const add = (list: Point[]) => {
      for (let i = 0; i < list.length; i++) {
        const p = this.toRealXYs(list[i]);
        pts.push({x: p.x - x, y: p.y - y});
      }
    };
    add(gauges.beast);
    add(gauges.belle);
    add(FormalBeastRim);
    const cols = getImageColors(img, pts);

    // The frame first, because it is the cheapest way to be wrong: forty dark
    // probes are an empty gauge only if the arc is really there. See
    // `FormalBeastConfig.rimMin`.
    for (let i = nBeast + nBelle; i < pts.length; i++) {
      const c = cols[i];
      if (Math.max(c.r, Math.max(c.g, c.b)) < cfg.rimMin) {
        return {readable: false, beast: 0, belle: 0};
      }
    }

    const beastCells: FormalBeastCell[] = [];
    const belleCells: FormalBeastCell[] = [];
    for (let i = 0; i < nBeast; i++) {
      beastCells.push(formalBeastCell(cols[i]));
    }
    for (let i = 0; i < nBelle; i++) {
      belleCells.push(formalBeastCell(cols[nBeast + i]));
    }
    const beast = formalBeastFill(beastCells, FormalBeastCell.Beast);
    const belle = formalBeastFill(belleCells, FormalBeastCell.Belle);
    // Both halves have to read, not one: a single half can be faked by a run of
    // one colour along the bottom of an ordinary board, and on the corpus it is
    // (a fever frame reads a full Beast half). Both at once is not fakeable.
    if (beast < 0 || belle < 0) {
      return {readable: false, beast: 0, belle: 0};
    }
    return {readable: true, beast: beast, belle: belle};
  } finally {
    releaseImage(img);
  }
};

/**
 * Which `tsumIdx` is Beast's and which is Belle's, or null if the board does
 * not say clearly.
 *
 * Read off the cluster centres the last scan kept (`ts.boardClusters`), whose
 * `b` is hue in OpenCV's 0..179. Null is the honest answer while the mode is
 * arriving or leaving, and the caller's response to it is to leave the batch
 * alone -- so a board this cannot read plays exactly as a plain burst skill's
 * would.
 */
function formalBeastColors(ts: Tsum): { beast: number, belle: number } | null {
  const clusters = ts.boardClusters;
  if (clusters.length < 2) { return null; }
  // The two largest, which is what `tsumIdx` 0 and 1 already are: the scan
  // sorts its clusters by size. During the mode there are only two colours on
  // the board, so a third is a straggler and not one of these.
  const hues = FormalBeastTsumHues;
  if (Math.abs(clusters[0].b - clusters[1].b) < hues.minGap) { return null; }
  const beast = clusters[0].b > clusters[1].b ? 0 : 1;
  const beastHue = clusters[beast].b;
  if (beastHue < hues.beastHueMin || beastHue > hues.beastHueMax) { return null; }
  return {beast: beast, belle: 1 - beast};
}

/**
 * The mode: whether it is running, and where its two halves are.
 *
 * One per script run, like `gPages` and `gFever`, and for the same reason --
 * the state has to outlive any one scan. Unlike `gFever` there is no
 * subscription list: nothing but the chain policy below has ever wanted to know,
 * and a broadcast nobody listens to is a queue to maintain for nothing.
 *
 * There is no debounce on the way *in* either. `readFormalBeastGauges` refuses
 * anything that is not two clean halves, which no ordinary board produces, so
 * one clean reading is already better evidence than two agreeing loose ones.
 * The way *out* is held instead: see `FormalBeastPlay.unreadableHoldMs`.
 *
 * Nothing resets this between rounds and nothing needs to. A mode left running
 * when a round ends has a stale `cleanAt`, so the first unreadable frame of the
 * next round is already past the hold window and ends it.
 */
var gFormalBeast = {
  /** Whether the mode is running, as of the last reading. */
  active: false,
  /** When the current state began; 0 before the first reading. */
  since: 0,
  /** The last fills that read, 0..1. Stale while `active` is holding. */
  beast: 0,
  belle: 0,
  /** When the gauge last read as a gauge. What the hold window is measured from. */
  cleanAt: 0,
  /**
   * How far one cleared tsum moves its own half, learned from the readings.
   * Seeded from `FormalBeastPlay`; `learn` is the only writer.
   */
  fillPerTsum: FormalBeastPlay.fillPerTsum,
  /**
   * The fills the last batch was planned against and what it was going to
   * clear of each colour -- one measurement of the rate above, waiting for the
   * reading that completes it. `lastBeast` is -1 when there is no pair pending.
   */
  lastBeast: -1,
  lastBelle: -1,
  lastBeastTsums: 0,
  lastBelleTsums: 0,

  /** Drop the pending measurement: whatever comes next cannot be compared. */
  forget: function(): void {
    this.lastBeast = -1;
    this.lastBelle = -1;
    this.lastBeastTsums = 0;
    this.lastBelleTsums = 0;
  },

  /**
   * Remember what this scan is about to link, so the next reading measures the
   * gauge against it.
   *
   * Counts the batch's first `skillMaxChainsPerScan` chains only, because that
   * is the cut the play loop makes between here and `link`.
   */
  expect: function(ts: Tsum, paths: TsumPath[], beastIdx: number, belleIdx: number): void {
    const n = Math.min(paths.length, skillMaxChainsPerScan(ts));
    let beastTsums = 0;
    let belleTsums = 0;
    for (let i = 0; i < n; i++) {
      const path = paths[i];
      if (path.tsumIdx === beastIdx) { beastTsums += path.length; }
      else if (path.tsumIdx === belleIdx) { belleTsums += path.length; }
    }
    this.lastBeast = this.beast;
    this.lastBelle = this.belle;
    this.lastBeastTsums = beastTsums;
    this.lastBelleTsums = belleTsums;
  },

  /**
   * Move `fillPerTsum` towards what this reading says, if it can say anything.
   *
   * Three ways for a pair of readings to be no measurement, all refused rather
   * than blended in: a half that went *down* means a detonation landed between
   * the two and neither half is comparable, a move under one probe step is
   * below the reading's own resolution, and a rate outside the plausible band
   * is a burst being read as a fill. See `FormalBeastPlay.fillPerTsumMin`.
   */
  learn: function(beast: number, belle: number): void {
    if (this.lastBeast < 0 || beast < this.lastBeast || belle < this.lastBelle) {
      return;
    }
    this.absorb(beast - this.lastBeast, this.lastBeastTsums);
    this.absorb(belle - this.lastBelle, this.lastBelleTsums);
  },

  absorb: function(delta: number, tsums: number): void {
    const play = FormalBeastPlay;
    // Both sides are sums of twentieths, so a delta of exactly one step lands
    // either side of it depending on which twentieths: 0.6 - 0.55 is over and
    // 0.35 - 0.3 is under. The epsilon is what stops that deciding whether a
    // real one-step move is a measurement.
    if (tsums <= 0 || delta < FormalBeastGaugeStep - 1e-9) { return; }
    const rate = delta / tsums;
    if (rate < play.fillPerTsumMin || rate > play.fillPerTsumMax) { return; }
    this.fillPerTsum += (rate - this.fillPerTsum) * play.fillLearnRate;
  },

  /** Take one reading and settle the mode's state on it. */
  observe: function(ts: Tsum): void {
    const now = Date.now();
    const reading = ts.readFormalBeastGauges();
    if (reading.readable) {
      this.cleanAt = now;
      this.learn(reading.beast, reading.belle);
      this.beast = reading.beast;
      this.belle = reading.belle;
      if (!this.active) {
        this.active = true;
        this.since = now;
        // "Link MyTsum first" is useless on the mode's two-colour board, and
        // its sort would put one colour ahead of the throttle's length order --
        // held off for the mode, not disabled: the setting itself is untouched.
        ts.setMyTsumPriority(false);
        logInfo(Log.Skill.FormalBeastModeStart);
      }
      return;
    }
    // Nothing linked since the pending measurement can be attributed to it any
    // more: the frames in between are exactly the ones a burst covers.
    this.forget();
    if (!this.active) { return; }
    // A burst crosses the whole board and the long one crosses it repeatedly,
    // either of which can cover the arc. While the mode is running an
    // unreadable crop is therefore no reading at all rather than evidence the
    // mode is over -- the same refusal `gFever` makes of an `Unknown` page
    // mid-round, and bounded for the same reason.
    if (now - this.cleanAt < FormalBeastPlay.unreadableHoldMs) { return; }
    this.active = false;
    this.beast = 0;
    this.belle = 0;
    ts.setMyTsumPriority(true);
    logInfo(Log.Skill.FormalBeastModeEnd, {
      lastedSec: this.since === 0 ? 0 : +((now - this.since) / 1000).toFixed(1)
    });
    this.since = now;
  }
};

/** The game's own shortest link, and so the shortest a chain can be cut to. */
const FormalBeastMinChain = 3;

/**
 * The first `n` tsums of a chain, as a chain.
 *
 * A prefix of a path is a path: `calculatePaths` returns a walk, so its first
 * `n` points are connected in the same order. `startY` is `[0].y` and survives
 * the cut for the same reason.
 */
function formalBeastPrefix(path: TsumPath, n: number): TsumPath {
  const cut: TsumPath = path.slice(0, n);
  cut.tsumIdx = path.tsumIdx;
  cut.startY = path.startY;
  return cut;
}

/**
 * The batch with the leading colour throttled -- three tiers, in play order:
 *
 *   the trailing colour, whole. What the mode is waiting for, so it goes first
 *     and goes at full length.
 *   the leading colour, cut to what still fits under the rose. The budget is
 *     the leading half's headroom converted to tsums at the measured rate, and
 *     it is spent longest chain first. Until the leader is actually near the
 *     rose this cuts nothing at all, which is the point: there is nothing to
 *     protect while it is low, and full speed is free.
 *   the leading colour whole, last. A chain the budget cannot fit even at the
 *     game's minimum link. It goes to the back rather than being dropped, and
 *     the mode offers few enough chains that the back is usually still inside
 *     this scan's batch -- which is the trade: an idle scan costs the combo and
 *     a whole cycle's fixed cost, an early burst costs one pair payout. It is
 *     also rare, because the two tiers above have been feeding the trailing
 *     half several times faster the whole way up.
 */
function formalBeastThrottle(paths: TsumPath[], leadIdx: number, leadFill: number,
    counts: { trimmed: number, cutTsums: number, spare: number }): TsumPath[] {
  const play = FormalBeastPlay;
  const headroom = 1 - leadFill - play.headroomMargin;
  let budget = headroom > 0 ? Math.floor(headroom / gFormalBeast.fillPerTsum) : 0;

  const wanted: TsumPath[] = [];
  const trimmed: TsumPath[] = [];
  const spare: TsumPath[] = [];
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    if (path.tsumIdx !== leadIdx) {
      wanted.push(path);
      continue;
    }
    const room = Math.min(path.length, budget);
    if (room < FormalBeastMinChain) {
      spare.push(path);
      continue;
    }
    budget -= room;
    if (room < path.length) {
      counts.cutTsums += path.length - room;
      trimmed.push(formalBeastPrefix(path, room));
    } else {
      trimmed.push(path);
    }
  }
  counts.trimmed = trimmed.length;
  counts.spare = spare.length;
  return wanted.concat(trimmed, spare);
}

/**
 * The chains to link this scan.
 *
 * Three states, in the order they are tested:
 *
 *   not in the mode, or the board's two colours cannot be told apart
 *                      the batch goes out as it came in, so this plays as a
 *                      plain burst skill.
 *   trailing half >= pairFill
 *                      whichever half tops out next takes the other with it, so
 *                      there is nothing to protect: longest chain first again,
 *                      which is also what finishes the leading half soonest.
 *   trailing half short
 *                      the trailing colour first, the leading colour throttled
 *                      behind it -- `formalBeastThrottle`. Nothing is dropped
 *                      in any of the three, so no scan of this mode is ever
 *                      spent without linking something.
 */
function formalBeastOrderPaths(ts: Tsum, paths: TsumPath[], _board: BoardPoint[]): TsumPath[] {
  gFormalBeast.observe(ts);
  // The colours are read whether or not they are steered by, because the
  // measurement needs them too: without them there is no telling which half the
  // batch about to go out is going to fill.
  const colors = gFormalBeast.active ? formalBeastColors(ts) : null;
  if (colors === null || paths.length === 0) {
    gFormalBeast.forget();
    return paths;
  }

  const play = FormalBeastPlay;
  const beastLeads = gFormalBeast.beast >= gFormalBeast.belle;
  const leadFill = beastLeads ? gFormalBeast.beast : gFormalBeast.belle;
  const trailFill = beastLeads ? gFormalBeast.belle : gFormalBeast.beast;

  let batch = paths;
  if (trailFill < play.pairFill) {
    const counts = {trimmed: 0, cutTsums: 0, spare: 0};
    batch = formalBeastThrottle(paths, beastLeads ? colors.beast : colors.belle,
      leadFill, counts);
    if (counts.cutTsums > 0 || counts.spare > 0) {
      logDebug(Log.Skill.FormalBeastSteer, {
        beast: gFormalBeast.beast,
        belle: gFormalBeast.belle,
        trailing: beastLeads ? 'belle' : 'beast',
        preferred: batch.length - counts.trimmed - counts.spare,
        trimmed: counts.trimmed,
        cutTsums: counts.cutTsums,
        spare: counts.spare,
        fillPerTsum: +gFormalBeast.fillPerTsum.toFixed(4)
      });
    }
  }
  gFormalBeast.expect(ts, batch, colors.beast, colors.belle);
  return batch;
}

registerSkill({
  types: [SkillType.FormalBeast],
  // As Burst: the tap is the whole activation, so the play loop may fire it
  // blind between chains. The mode that follows is not choreography and is not
  // driven from here -- it is read off the board by `orderPaths`, which is also
  // why firing blind costs it nothing.
  bareTapActivates: true,
  // Only while the mode is running, and only the chain cap -- see
  // `FormalBeastPlay.modeMaxChain` for why the two-colour board wants long
  // chains where an ordinary one does not. Answered per scan, and read one scan
  // before `orderPaths` refreshes the mode's state, so the first scan of a mode
  // still searches to the setting and the first scan after it still searches
  // long. Neither is worth a capture to avoid.
  chainLimits: function() {
    return gFormalBeast.active ? {maxChain: FormalBeastPlay.modeMaxChain} : {};
  },
  orderPaths: formalBeastOrderPaths,
  afterActivate: function(ts) {
    skillRandomizeAndWait(ts);
  }
});
