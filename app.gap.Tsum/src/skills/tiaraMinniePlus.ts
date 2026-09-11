// ---------------------------------------------------------------------------
// Tiara Minnie+
//
// The skill shows Minnie with a thought bubble holding one present, then a
// screen of presents to pick the match from; a fresh bubble comes with every
// pick. Both halves are read by cropping fixed boxes and comparing the pictures
// directly: the bubble is always drawn in the same place, and the presents
// always land on the centres in TiaraLayouts.
//
// Nothing here works out how many presents are on screen. Every centre from
// every layout is scored against the bubble and the best-matching one is
// tapped, and two centres from different layouts that sit on the same present
// are both right answers. Offline this picked the correct present on all 20
// frame/design pairs, and kept doing so with every centre shifted by up to 25px.
//
// That is not the same as "the tap cannot go anywhere bad", which this comment
// used to claim. Most centres belong to layouts that are not on screen: for a
// four-present screen only 11 of the 20 sit on a present, and the other 9 point
// at bare board. Nothing rejects a winner for being one of those, so the whole
// design rests on the *right* candidate winning. It does, comfortably, once the
// presents have arrived -- 0.62 against 0.25 for the runner-up on a recorded
// frame -- but on a frame taken while they are still sliding in, a foreign
// centre wins instead. Hence the gates in tiaraPick, and hence coverageFloor:
// the failure being defended against is a tap taken too early, not a matcher
// that cannot tell two presents apart.
//
// Timing is the whole game here, and the margins are thinner than they look.
// Measured at 10fps over the three activations in
// tiara_minnie_debug/tiara_minnie.mp4: the thought bubble is on screen for
// ~750ms, the presents become tappable 550-650ms after it goes, and they stop
// being tappable ~1150ms after it. So there are two windows of about half a
// second each, and missing either one costs the activation and resets the
// 2-to-6 progression exactly as a wrong present would. On the recording the
// script missed the third activation outright: the choice screen timed out
// untouched.
//
// What makes those windows workable is that the game clock is stopped for the
// whole skill -- not just the choice screen, but the activation animation and
// the bubble too (the recording's timer holds for 5.5s across each activation
// while ticking once a second either side). So captures taken in here cost the
// round nothing, and the windows above are wall clock, not game clock.
//
// That is the shape of most decisions below: the free resource is *looking* and
// the scarce one is *elapsed time*, so the sweep is one batched read, and the
// bubble is read up to three times across the same settle wait rather than once
// at the end of it.
//
// It is not a licence to look as often as possible, which was tried and made
// things worse on the device even though the offline harness liked it at every
// capture cost. See pollMs below. Two things came out of that: the poll
// intervals are back where they were, and the check that a tap is trustworthy
// no longer rests on how fast the loop happens to spin -- confirmGapMs is a
// wall-clock separation between the scan that proposes a centre and the scan
// that confirms it, so it means the same thing on any device.
//
// The timings that would settle it are now in the ordinary log on every pick
// and every miss: scans taken, what a scan cost, how long the screen had been
// readable. Read those before changing any interval here.
// ---------------------------------------------------------------------------

// --- Tuning data ---------------------------------------------------------
//
// A correct pick adds a present to the next activation's screen (2 up to 6); a
// wrong one resets it to 2 -- which is why every layout below has to be
// handled, but also why the count never needs tracking between activations.
//
// The presents always land on the same centres for a given count, so there is
// nothing to search for: crop each known centre, crop the bubble, and compare
// the pictures directly. Centres are logical 1080x1920, read off five reference
// frames -- one per layout -- whose blob centres agreed within ~20px.
var TiaraLayouts: { [n: number]: Point[] } = {
  2: [{x: 292, y: 973},  {x: 781, y: 1059}],
  3: [{x: 781, y: 829},  {x: 666, y: 1275}, {x: 306, y: 987}],
  4: [{x: 292, y: 1232}, {x: 263, y: 829},  {x: 796, y: 757},  {x: 796, y: 1117}],
  5: [{x: 234, y: 1117}, {x: 882, y: 1102}, {x: 292, y: 771},  {x: 839, y: 742},
      {x: 551, y: 1304}],
  6: [{x: 752, y: 757},  {x: 378, y: 728},  {x: 176, y: 973},  {x: 896, y: 1001},
      {x: 349, y: 1232}, {x: 680, y: 1261}]
};

// Presents shrink as more of them appear; these are the crop sides that put the
// present in the same fraction of the frame at every count (measured widths ran
// 270/275/252/237/237 for counts 2..6).
var TiaraSlotSide: { [n: number]: number } = {
  2: 300, 3: 295, 4: 280, 5: 265, 6: 260
};

var TiaraMinnieConfig = {
  // Resolution the play square is captured at for matching.
  //
  // Was briefly dropped to 300 for speed on the strength of the offline sweep
  // finding 270-720 all scoring 20/20 -- and wrong taps appeared on the device.
  // Do not lower it again without re-running the harness: the sweep varied this
  // alone against static frames, which is not the same claim as "300 is safe",
  // and a cell is only ~5.6 capture pixels wide there, so cell centres snap to
  // the grid with a tenth of a cell of error and the blur has less to work with.
  captureSize: 420,
  // Blur radius, in capture pixels, that makes one pixel read stand in for the
  // average of its cell -- so it has to stay in proportion to captureSize.
  captureBlur: 7,

  // The thought bubble is drawn at a fixed spot, so the template is a fixed
  // crop -- no searching. Verified at (250..255, 870..875) on every dream frame
  // where the present could be isolated, and +/-16px of error still ranked the
  // right present first.
  bubbleX: 252,
  bubbleY: 872,
  bubbleSide: 240,

  // Cloud test, used to tell "bubble is up" from "presents are up" and from
  // "the skill is over". Measured 0.484-0.503 on bubble frames vs 0.019-0.060
  // on present frames, so the threshold sits in a very wide gap.
  cloudBox: {x0: 60, y0: 690, x1: 450, y1: 1050},
  cloudSatMax: 70,
  cloudValMin: 180,
  // Sample spacing inside the box, leaving 162 samples.
  //
  // Was briefly 40 (64 samples). The gap between a bubble frame and a present
  // frame is wide enough for that, but the fraction is also read *during* the
  // bubble's fade, where the true value passes through the threshold: at 64
  // samples the standard error there is 0.06, so a mid-fade reading can call
  // the cloud gone early, and matching then starts on the hand-over frames.
  // The sample count is not really buying precision at the extremes, it is
  // buying it in the middle.
  cloudStep: 24,
  cloudMinFrac: 0.25,
  // This test is polled in a loop, and it is only asking whether a big pale
  // blob is present, so it gets its own small capture with no blur. At the
  // matching resolution each check cost a 420x420 grab plus a 7px blur, which
  // made the poll slower than the interval it was polling on.
  //
  // This is the resolution the whole play square would be captured at; only
  // cloudBox is actually grabbed, scaled to match. Nothing outside the box is
  // ever read, so capturing the rest of the board was pure overhead.
  cloudCaptureSize: 120,

  // Comparison grid. Each crop is reduced to grid x grid cells; cells are
  // compared only where the template says the present is, which drops the board
  // background (dark tsums) and the bubble background (white cloud) alike.
  // 10 through 20 all scored the same offline, so this is the cheap end of the
  // range that still held up: 12x12 cells over 20 candidates is 2880 reads.
  grid: 12,
  satMin: 70,
  valMin: 170,

  // Per-cell differences are divided by this and clipped at 1, so the score
  // counts clearly-disagreeing cells instead of averaging away small ones.
  // Raised the worst-case margin from 0.095 to 0.264 against the same frames.
  cellSpread: 0.30,

  // A tap needs both of these. The score alone cannot say whether the presents
  // are up yet: a green template scores 0.461 against ordinary green tsums, so
  // a board with no presents on it would clear any floor low enough to keep the
  // real matches (which fall to ~0.44 if the presents are 10px off the table).
  //
  // The margin does separate the two, because bare board has no standout winner
  // -- it reached 0.096 at best, where a real choice screen never scored under
  // 0.278. So the floor rejects noise and the margin proves a present is there.
  confidenceFloor: 0.42,
  marginFloor: 0.12,

  // The bar for a *last-chance* tap: one scan, no second opinion, taken only
  // once the choice screen has been readable for decisiveAfterMs without two
  // scans ever agreeing. Every ordinary tap still waits for agreeScans.
  //
  // These two are a much stronger test than the floors above, which is what
  // makes a single scan safe when it clears them. Re-measured at 30fps over the
  // three recorded activations in tiara_minnie_debug, scoring all 63 usable
  // bubble frames against every choice frame: 1063 frames cleared the three
  // floors and 48 of those named the wrong present, but of the 840 that also
  // cleared this pair, none did. The floors say "a present is there"; this pair
  // says "and it is that one".
  //
  // The wrong 48 are all in the ~100ms right after the cloud goes, when the
  // presents are sliding in -- which is also why choiceLeadMs must not shrink
  // to nothing, and why agreeScans on its own is not the whole defence: two
  // scans 90ms apart can both land in that band and agree with each other.
  decisiveScore: 0.60,
  decisiveMargin: 0.25,
  // Measured from the first scan that cleared the floors, not from the start of
  // the match loop -- what matters is how long the screen has been readable,
  // which is the clock the game itself is running down. Anchored to the loop
  // instead, a short choiceLeadMs would expire it before the presents even
  // arrived and turn every pick into a single-scan one.
  //
  // At 350 it never once fired on the recordings: two scans always agreed
  // first, at every capture cost tried. It is there for the case they do not.
  decisiveAfterMs: 350,

  // Is the choice screen readable yet? The share of the template's masked cells
  // where the winning candidate is itself bright and saturated, by the same
  // satMin/valMin test that built the mask.
  //
  // This is a *readiness* test, not an identity one: the board glows during the
  // skill, so a patch of it covers the mask as well as a real present does
  // (0.74 and 0.86 were measured on board candidates against 0.67 on the right
  // present). What it does separate is before from after. Measured over a
  // recorded activation as the presents slid in, the winner's coverage ran
  // 0.00, 0.00, 0.09, 0.44, 0.67 -- and the first two of those frames are the
  // ones where a foreign-layout centre wins, one of them missing marginFloor by
  // 0.008. A second recording read 0.00, 0.00, 0.31, 0.58, 0.62.
  //
  // So the floor sits in the empty middle of that: everything readable was
  // >= 0.31, everything still arriving was <= 0.09. It costs nothing -- the
  // saturation and value are already in hand for every cell the score reads.
  //
  // It only ever rejects, so it cannot make the script fire earlier than it
  // used to; what it removes is the tap taken on a half-arrived screen.
  coverageFloor: 0.25,

  // Tapping a present detonates an area of the board, so the blast wants a full,
  // still board under it. The play loop clears a chain immediately before the
  // skill fires (and may have just used the fan), so at activation the tsums are
  // almost always mid-fall and a blast then catches very few of them.
  //
  // How long that takes varies with how much was cleared, so it is measured
  // rather than guessed: take a coarse brightness fingerprint of the board twice
  // and watch how much it changes. Falling tsums move it a lot, a settled board
  // barely at all (only sparkles and the fever glow).
  //
  // For scale, that measure is 0 between identical frames, ~0.06 between two
  // frames of a similar scene, and 0.20-0.30 between wholly different screens.
  // settleMaxDiff is the one number here not pinned down by measurement -- there
  // were no consecutive-frame pairs to calibrate falling tsums against -- so it
  // is set loose rather than tight: too strict just means every activation waits
  // out settleWaitMs, which is the delay this was added to avoid. The timeout
  // logs the diff it actually saw, which is what to tune from.
  settleWaitMs: 320,
  settleMinMs: 60,
  settlePollMs: 30,
  settleCapture: 64,
  settleGrid: 16,
  settleMaxDiff: 0.03,
  settleQuietScans: 2,

  // Timings. The bubble is shown once, ~2s after the skill fires, and the
  // presents ~1s after that. The game timer is stopped while the presents are
  // up, so the checks made there are free; everything before them costs real
  // game time, which is what these two are sized against.
  //
  // Nothing can happen until the skill animation has played, so sit that out
  // rather than spending ~15 screenshots polling for something that cannot have
  // happened yet.
  dreamLeadMs: 1500,
  // Covers the lead plus a bubble arriving late. Only ever spent in full when
  // the skill did not actually fire.
  dreamWaitMs: 3000,
  // The bubble scales in over ~150ms and is gone about 750ms after it appears,
  // so this is the wait between first sighting and reading the present out of
  // it. It is a budget, not a sleep: tiaraWaitForDream reads once immediately
  // and once at the end of it, and keeps whichever has the larger mask. A
  // single read at the end of a fixed sleep loses the whole activation whenever
  // the first sighting lands in the bubble's last 250ms -- the read then hits an
  // empty cloud, the template comes back with no cells, and tiaraPick returns
  // before it has looked at anything. That is what the recorded miss in
  // tiara_minnie_debug/tiara_minnie.mp4 at 27-29s looks like.
  dreamSettleMs: 250,
  // Most reads to take of the bubble inside that budget. Three fit on a quick
  // device and give a better template than two -- the mask peaks when the
  // present is fully drawn, and a third look is another chance at the peak --
  // but the count is a ceiling, not a target: tiaraWaitForDream stops early
  // once dreamSettleMs is used up, so a slow device takes two and gets on with
  // it rather than spending the choice window on a fourth look at the bubble.
  dreamMaxReads: 3,
  // How pale the area around the bubble must be, read off the matching capture,
  // for a bubble read to count as taken while the bubble is fully open.
  //
  // This replaces "keep whichever read has the largest mask" as the way the
  // reads are chosen, because mask size is not actually the question. A read
  // taken while the bubble is still opening is not a smaller look at the
  // present, it is a look at the board through a half-drawn cloud, and it
  // matches things: over the recordings, a template read at cloud 0.29-0.38
  // picked the wrong present on *every* frame of the choice screen it cleared
  // the gates on -- 15 of 15 twice over, once for 467ms straight, which two
  // agreeing scans would have walked into. Those templates carry 26-29 cells,
  // so dreamMinCells never saw them.
  //
  // Measured on the same capture the match uses (V and S are already there, so
  // this costs no extra grab), the fade-in reads sit at 0.29-0.40 and the open
  // bubble sits on a 0.43-0.45 plateau. Fade-out drops away just as fast, and
  // is just as unwanted. Mask size is still the tiebreak between two reads that
  // are both open.
  dreamCloudFull: 0.42,
  // Fewest masked cells a bubble template may have and still be used. Reading
  // the bubble mid-scale-in gives a handful of cells that match nothing in
  // particular but can still clear the floors on some frame of the choice
  // screen -- on the recording, a 4-cell template picked a centre no present
  // was on. Real templates ran 48-77 cells there and the reference bubbles
  // bottom out around 12 (8% of the grid), so this only cuts off the scraps.
  dreamMinCells: 10,
  // After the bubble clears, the presents take about a second to arrive. Waiting
  // most of that out first means the matcher never sees the hand-over frames.
  //
  // This lead and pollMs have to be read together: matching starts at (however
  // late the poll noticed the cloud go) + this. Trading one against the other
  // by their averages is what caused wrong taps -- pollMs 100->200 raises the
  // mean lag by 50ms but the *minimum* stays 0, so taking 100ms off this lead
  // moved the earliest possible start from 500ms to 400ms after the bubble
  // cleared. It is the earliest start that decides whether the matcher can see
  // a present still sliding into place, and a present caught in transit can sit
  // convincingly on a centre belonging to another layout.
  //
  // 500 was too much of a good thing. Measured on three recorded activations,
  // the presents become tappable 550-650ms after the cloud goes and stop being
  // tappable ~1150ms after it, so at 500 plus the poll's own lag the first scan
  // landed at or after the window opened and the second one landed on its edge.
  // Trimmed rather than cut: the whole gain is in already by 400, and what
  // makes the trim safe is coverageFloor, which was added after the wrong taps
  // described above and rejects every hand-over frame in all three recordings.
  choiceLeadMs: 400,
  choiceWaitMs: 6000,
  // Poll intervals for the two cloud waits and for the match loop.
  //
  // The game clock is stopped for the whole skill, not just the choice screen.
  // Measured off the recording by watching the timer digits: it ticks once a
  // second throughout ordinary play and then holds for 5.5s across each of the
  // three activations -- covering the activation animation, the bubble and the
  // presents alike. So a capture taken in here is free in the only currency the
  // round is scored in, and these were briefly dropped to 40/30 on that basis.
  //
  // They are back at 100 because the device disagreed with the model. Offline,
  // faster polling was better at every capture cost tried, from 40ms to 320ms;
  // on the device it came out slower to pick and more often wrong. The offline
  // harness cannot see what would explain that -- whether getScreenshotModify
  // blocks for a fresh frame (so polling faster buys nothing and costs
  // overhead), whether it can hand back the same frame twice (which would make
  // two "agreeing" scans one scan), or whether the extra captures simply
  // contend with the game's own rendering. Until a log from the device says
  // which, the cadence stays where it was for the years this worked.
  //
  // What replaced the cadence as the guarantee is confirmGapMs, which is a
  // wall-clock separation rather than a scan count, and so does not care what a
  // capture costs.
  pollMs: 100,
  matchPollMs: 100,
  // Least time between the scan that proposes a centre and the scan that
  // confirms it. Two scans in a row are only worth one if the second could have
  // disagreed, and how long a *wrong* reading survives is measurable: over the
  // three recorded activations at 30fps, a wrong winner held for a median of
  // 67ms and 19 of 20 runs ended inside 100ms, while a right winner held for a
  // median of 367ms and usually 560-620ms. So 150ms is past almost every wrong
  // reading and well inside every right one.
  //
  // At a 100ms poll the scans are already ~190ms apart and this costs nothing.
  // It matters if the poll is ever shortened again: at 30ms two consecutive
  // scans are ~90ms apart, which is inside a wrong run, and agreeScans quietly
  // stops being a check at all. That is the trap this closes.
  confirmGapMs: 150,
  // How many scans in a row must name the same centre before it is tapped.
  // This is the normal path and it is what makes a tap trustworthy: a single
  // scan that clears the floors names the wrong present about 4.5% of the time
  // (48 of 1063 recorded frames), and the second scan is what removes that.
  //
  // Three was tried and is not affordable: at 30ms polling it still fell out of
  // the window often enough to score worse than two at every capture cost, and
  // far worse on a slow one (113 of 186 simulated runs against 174).
  agreeScans: 2,
  pickTaps: 2,
  pickTapDuring: 60,
  pickTapGapMs: 50
};

// Hue names for the debug line, over OpenCV's 0..179 hue range.
//
// The top band is named for two colours on purpose. Sampled off the presents in
// tiara_minnie_debug, the pale pink bows and the deep red boxes both sit at hue
// 165-175 -- they differ in saturation (~0.3-0.5 against ~0.6-0.7), not in hue
// -- so calling that band "red" made every pink bow read as red in the log.
// There is no hue that splits them, so the name says both rather than picking
// one and being wrong half the time.
var TiaraHueNames = [
  {to: 8, name: 'red'},     {to: 20, name: 'orange'},  {to: 32, name: 'yellow'},
  {to: 44, name: 'lime'},   {to: 75, name: 'green'},   {to: 95, name: 'teal'},
  {to: 125, name: 'blue'},  {to: 145, name: 'purple'}, {to: 162, name: 'pink'},
  {to: 180, name: 'pink/red'}
];

function tiaraHueName(h: number): string {
  for (let i = 0; i < TiaraHueNames.length; i++) {
    if (h < TiaraHueNames[i].to) { return TiaraHueNames[i].name; }
  }
  return '?';
}

// A readable summary of a sampled present, so the log says what the script
// thinks it is looking at rather than just a score.
//
// This used to call the top 35% of the crop "the bow" and the rest "the body",
// and it reported both wrongly often enough to send a reader after the wrong
// bug. Two reasons, and neither is fixable by moving the split:
//
//   - The mask drops pale cells (satMin/valMin), which is deliberate -- it is
//     what removes the white cloud behind the bubble -- but it also removes a
//     white or pastel bow entirely. The top band then averages whatever
//     coloured pixels the bow does not cover, so "red box, white bow" reads as
//     "red bow / red body".
//   - A bag wears its bow across the middle, with fabric above and below it, so
//     on a bag the two halves come out swapped: the teal bag with a red bow in
//     the recording read as "teal bow / red body".
//
// So describe what is actually being matched on instead: the hues present in
// the mask, largest share first, and how much of the crop the mask covers. A
// pale-bowed present now shows up as what it is -- one hue over a small mask --
// rather than as a confident wrong answer.
function tiaraDescribe(t: number[], grid: number): string {
  const cells = grid * grid;
  const counts: { [name: string]: number } = {};
  const names: string[] = [];
  let masked = 0;
  for (let i = 0; i < cells; i++) {
    const k = i * 5;
    if (t[k + 4] <= 0) { continue; }
    masked++;
    let h = Math.atan2(t[k + 1], t[k]) * 90 / Math.PI;
    if (h < 0) { h += 180; }
    const name = tiaraHueName(h);
    if (counts[name] === undefined) { counts[name] = 0; names.push(name); }
    counts[name]++;
  }
  if (masked === 0) { return 'nothing (0/' + cells + ' cells)'; }
  names.sort(function(a, b) { return counts[b] - counts[a]; });
  let out = '';
  // Two hues describe every present in the tables; a third is noise from the
  // edge cells, and naming it would only make the line harder to scan.
  for (let i = 0; i < names.length && i < 2; i++) {
    if (counts[names[i]] * 8 < masked) { break; }
    out += (out === '' ? '' : ' + ') + names[i]
        + ' ' + Math.round(counts[names[i]] * 100 / masked) + '%';
  }
  return out + ' (' + masked + '/' + cells + ' cells)';
}

// Hue vector lookup. Every sampled cell turns its hue into a unit vector; there
// are a few thousand of those per match, and the hue is a byte.
//
// Filled for all 256 values, not just OpenCV's 0..179 hue range, so the table
// is a total function of the byte and cannot hand back undefined -- an
// out-of-range hue would otherwise turn the whole score into NaN, which fails
// every gate silently. The extra entries are the same wrap Math.cos would give.
var TiaraHueCos: number[] = [];
var TiaraHueSin: number[] = [];
(function() {
  for (let h = 0; h < 256; h++) {
    TiaraHueCos.push(Math.cos(h * Math.PI / 90));
    TiaraHueSin.push(Math.sin(h * Math.PI / 90));
  }
})();

// Reduce a template sampled by tiaraSample to just the cells it marks as
// present, laid out flat.
//
// Scoring only ever looks at those cells -- so neither the dark tsums behind a
// board present nor the white cloud behind the bubble one can influence the
// result -- which means the other cells of a candidate crop never need to be
// read at all. On the reference bubbles the mask keeps between 8% and 58% of
// the 144 cells, around 38% on average, and that is the factor it takes off
// every candidate.
function tiaraCompileTemplate(t: number[], grid: number): TiaraTemplate {
  const idx: number[] = [], hx: number[] = [], hy: number[] = [],
        sat: number[] = [], val: number[] = [];
  const cells = grid * grid;
  for (let i = 0; i < cells; i++) {
    const k = i * 5;
    if (t[k + 4] <= 0) { continue; }
    idx.push(i);
    hx.push(t[k]); hy.push(t[k + 1]); sat.push(t[k + 2]); val.push(t[k + 3]);
  }
  return {idx: idx, hx: hx, hy: hy, sat: sat, val: val, n: idx.length};
}

var TiaraSignaturePoints: Point[] | null = null;

// The points tiaraBoardSignature reads, worked out once. Depends only on the
// settle constants.
function tiaraSignaturePoints(): Point[] {
  if (TiaraSignaturePoints != null) { return TiaraSignaturePoints; }
  const cfg = TiaraMinnieConfig;
  const step = cfg.settleCapture / cfg.settleGrid;
  const pts: Point[] = [];
  for (let gy = 0; gy < cfg.settleGrid; gy++) {
    for (let gx = 0; gx < cfg.settleGrid; gx++) {
      pts.push({x: Math.floor((gx + 0.5) * step), y: Math.floor((gy + 0.5) * step)});
    }
  }
  TiaraSignaturePoints = pts;
  return pts;
}

// A coarse brightness fingerprint of the play area, cheap enough to take over
// and over. Used only to tell whether anything on the board is still moving.
//
// One batched read for the whole grid: this is polled every settlePollMs for as
// long as settleWaitMs, and it sits in front of the activation tap, so what it
// spends comes out of the same budget the choice screen is short of.
Tsum.prototype.tiaraBoardSignature = function() {
  const cfg = TiaraMinnieConfig;
  const n = cfg.settleCapture;
  const img = getScreenshotModify(
    this.playOffsetX, this.playOffsetY, this.playWidth, this.playHeight, n, n, 100);
  const out: number[] = [];
  try {
    const cols = getImageColors(img, tiaraSignaturePoints());
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      out.push((c.r + c.g + c.b) / 3);
    }
  } finally {
    releaseImage(img);
  }
  return out;
};

function tiaraSignatureDiff(a: number[], b: number[]): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) { d += Math.abs(a[i] - b[i]); }
  return d / a.length / 255;
}

// Hold off activating until the board stops moving.
//
// Tapping a present blows up an area of the board, so it pays to fire when the
// board is full and settled. The play loop clears a chain (and sometimes works
// the fan) immediately before the skill goes off, and a blast that lands while
// the tsums are still falling hits far fewer of them.
Tsum.prototype.tiaraWaitForSettledBoard = function() {
  const cfg = TiaraMinnieConfig;
  const start = Date.now();
  const deadline = start + cfg.settleWaitMs;
  let prev = this.tiaraBoardSignature();
  let quiet = 0;
  let diff = 1;
  while (Date.now() < deadline) {
    this.sleep(cfg.settlePollMs);
    const now = this.tiaraBoardSignature();
    diff = tiaraSignatureDiff(prev, now);
    prev = now;
    // Two quiet readings, not one, so a momentary lull mid-cascade doesn't pass.
    quiet = diff <= cfg.settleMaxDiff ? quiet + 1 : 0;
    if (quiet >= cfg.settleQuietScans && Date.now() - start >= cfg.settleMinMs) {
      logDebug(Log.Skill.TiaraSettled, {
        durationMs: Date.now() - start,
        diff: +diff.toFixed(3),
      });
      return true;
    }
  }
  // Fire anyway: a late skill is worth more than a skipped one.
  logInfo(Log.Skill.TiaraBusy, { diff: +diff.toFixed(3), maxDiff: cfg.settleMaxDiff });
  return false;
};

// Play square at matching resolution, blurred so one pixel read stands in for
// the average of its cell, then HSV -- where getImageColor gives b=hue 0..179,
// g=saturation, r=value.
Tsum.prototype.tiaraCapture = function() {
  const cfg = TiaraMinnieConfig;
  const img = getScreenshotModify(
    this.playOffsetX, this.playOffsetY, this.playWidth, this.playHeight,
    cfg.captureSize, cfg.captureSize, 100);
  smooth(img, 1, cfg.captureBlur);
  convertColor(img, 40);
  return img;
};

// The capture pixel each of the grid x grid cells of the logical square
// (lcx, lcy, side) reads from, flat and in row order. Cells falling outside the
// capture are marked -1 and read as black, as they always were.
//
// These depend only on the layout tables and the capture size, so every table
// is worked out once and kept -- the match loop would otherwise redo a few
// thousand of these multiplies per scan for coordinates that never change.
//
// `pts` is the same list as {px, py} in the shape getImageColors takes, built
// here so a batched read never has to allocate one. An out-of-capture cell goes
// in as (-1, -1), which that call reports as all-zero -- the same black the
// per-pixel path substituted for it.
function tiaraCellPixels(lcx: number, lcy: number, side: number): TiaraCells {
  const cfg = TiaraMinnieConfig;
  const g = cfg.grid;
  const scale = cfg.captureSize / 1080;
  const step = side / g;
  const left = lcx - side / 2;
  const top = lcy - side / 2;
  const px: number[] = [], py: number[] = [];
  const pts: Point[] = [];
  for (let cy = 0; cy < g; cy++) {
    for (let cx = 0; cx < g; cx++) {
      const x = Math.round((left + (cx + 0.5) * step) * scale);
      const y = Math.round((top + (cy + 0.5) * step - PlayAreaTopY) * scale);
      const inside = x >= 0 && y >= 0 && x < cfg.captureSize && y < cfg.captureSize;
      px.push(inside ? x : -1);
      py.push(inside ? y : -1);
      pts.push({x: inside ? x : -1, y: inside ? y : -1});
    }
  }
  return {px: px, py: py, pts: pts};
}

var TiaraBubbleCells: TiaraCells | null = null;

function tiaraBubbleCells(): TiaraCells {
  if (TiaraBubbleCells == null) {
    const cfg = TiaraMinnieConfig;
    TiaraBubbleCells = tiaraCellPixels(cfg.bubbleX, cfg.bubbleY, cfg.bubbleSide);
  }
  return TiaraBubbleCells;
}

// Read a cell table into grid x grid cells. Each cell carries a
// saturation-weighted hue vector, saturation, value, and whether it looks like
// part of a present. Hue goes in as a vector so the 179->0 wrap cannot average
// a red into a cyan.
//
// Only the bubble goes through here now; candidates are read and compared in
// one pass by tiaraBestMatch, which never materialises this array.
//
// One batched read for the whole grid. This runs once per activation, so the
// saving is small next to the match loop's -- it is here because the two paths
// reading the same cell tables should read them the same way.
Tsum.prototype.tiaraSample = function(img, cells) {
  const cfg = TiaraMinnieConfig;
  const n = cfg.grid * cfg.grid;
  const cols = getImageColors(img, cells.pts);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const col = cols[i];
    const h = col.b, s = col.g, v = col.r;
    out.push(s * TiaraHueCos[h] / 255);
    out.push(s * TiaraHueSin[h] / 255);
    out.push(s / 255);
    out.push(v / 255);
    out.push((s >= cfg.satMin && v >= cfg.valMin) ? 1 : 0);
  }
  return out;
};

// Small, unblurred capture for the cloud test only. That test is polled in a
// loop and only asks whether a big pale blob is on screen, which survives heavy
// downsampling -- the margin it works with is 0.49 against 0.09.
//
// Grabs the whole play square even though only cloudBox is read from it.
// Cropping to the box was tried: it is 88% less capture area, but it resamples
// the region on a slightly different grid, and this test decides when matching
// starts. Not worth an unproven change to that.
Tsum.prototype.tiaraCloudCapture = function() {
  const n = TiaraMinnieConfig.cloudCaptureSize;
  return getScreenshotModify(
    this.playOffsetX, this.playOffsetY, this.playWidth, this.playHeight, n, n, 100);
};

var TiaraCloudPoints: { pts: Point[]; n: number } | null = null;

// The capture pixels the cloud test reads -- the same points it always read,
// worked out once instead of on every poll, with the present dropped here
// rather than tested each time round.
//
// Kept in getImageColors' shape: this list is read whole on every poll of two
// separate wait loops, and it is the poll cadence that decides when the bubble
// is seen and when matching starts.
function tiaraCloudPoints(): { pts: Point[]; n: number } {
  if (TiaraCloudPoints != null) { return TiaraCloudPoints; }
  const cfg = TiaraMinnieConfig;
  const box = cfg.cloudBox;
  const size = cfg.cloudCaptureSize;
  const scale = size / 1080;
  const half = cfg.bubbleSide / 2;
  const ex0 = cfg.bubbleX - half, ex1 = cfg.bubbleX + half;
  const ey0 = cfg.bubbleY - half, ey1 = cfg.bubbleY + half;
  const pts: Point[] = [];
  for (let ly = box.y0; ly <= box.y1; ly += cfg.cloudStep) {
    for (let lx = box.x0; lx <= box.x1; lx += cfg.cloudStep) {
      // Skip the present itself: only the cloud around it should count.
      if (lx >= ex0 && lx <= ex1 && ly >= ey0 && ly <= ey1) { continue; }
      const px = Math.round(lx * scale);
      const py = Math.round((ly - PlayAreaTopY) * scale);
      if (px < 0 || py < 0 || px >= size || py >= size) { continue; }
      pts.push({x: px, y: py});
    }
  }
  TiaraCloudPoints = {pts: pts, n: pts.length};
  return TiaraCloudPoints;
}

// How much of the area around the bubble is pale cloud. Separates "bubble is
// up" from "presents are up" and from ordinary play by a wide margin: the
// sample frames read 0.48-0.50 with a bubble and 0.02-0.06 without one.
// Takes a capture from tiaraCloudCapture, not the matching one.
//
// Reads the raw BGR pixel: OpenCV's HSV value is max(b,g,r) and its saturation
// is 255*(max-min)/max, so the pale test can be made straight from the pixel
// and the whole-image colour conversion this poll used to run dropped. The
// saturation is rounded the way OpenCV rounds it, so pixels sitting exactly on
// the threshold fall the same side of it as before.
Tsum.prototype.tiaraCloudFrac = function(img) {
  const cfg = TiaraMinnieConfig;
  const pts = tiaraCloudPoints();
  if (pts.n === 0) { return 0; }
  const cols = getImageColors(img, pts.pts);
  let hit = 0;
  for (let i = 0; i < pts.n; i++) {
    const col = cols[i];
    const mx = col.r > col.g
      ? (col.r > col.b ? col.r : col.b)
      : (col.g > col.b ? col.g : col.b);
    if (mx < cfg.cloudValMin) { continue; }
    const mn = col.r < col.g
      ? (col.r < col.b ? col.r : col.b)
      : (col.g < col.b ? col.g : col.b);
    if (Math.round(255 * (mx - mn) / mx) <= cfg.cloudSatMax) { hit++; }
  }
  return hit / pts.n;
};

var TiaraFullPoints: Point[] | null = null;

// The same points tiaraCloudFrac reads, but placed on the matching capture.
function tiaraFullPoints(): Point[] {
  if (TiaraFullPoints != null) { return TiaraFullPoints; }
  const cfg = TiaraMinnieConfig;
  const box = cfg.cloudBox;
  const scale = cfg.captureSize / 1080;
  const half = cfg.bubbleSide / 2;
  const ex0 = cfg.bubbleX - half, ex1 = cfg.bubbleX + half;
  const ey0 = cfg.bubbleY - half, ey1 = cfg.bubbleY + half;
  const pts: Point[] = [];
  for (let ly = box.y0; ly <= box.y1; ly += cfg.cloudStep) {
    for (let lx = box.x0; lx <= box.x1; lx += cfg.cloudStep) {
      if (lx >= ex0 && lx <= ex1 && ly >= ey0 && ly <= ey1) { continue; }
      const px = Math.round(lx * scale);
      const py = Math.round((ly - PlayAreaTopY) * scale);
      if (px < 0 || py < 0 || px >= cfg.captureSize || py >= cfg.captureSize) { continue; }
      pts.push({x: px, y: py});
    }
  }
  TiaraFullPoints = pts;
  return pts;
}

// Is the bubble fully open? The same pale test tiaraCloudFrac makes, read off
// the matching capture instead of its own small one -- convertColor has already
// put value in r and saturation in g, so this is the same comparison without
// the grab. Runs 0.29-0.40 while the bubble is opening or fading and sits on a
// 0.43-0.45 plateau while it is open.
Tsum.prototype.tiaraBubbleOpenFrac = function(img) {
  const cfg = TiaraMinnieConfig;
  const pts = tiaraFullPoints();
  if (pts.length === 0) { return 0; }
  const cols = getImageColors(img, pts);
  let hit = 0;
  for (let i = 0; i < cols.length; i++) {
    if (cols[i].r >= cfg.cloudValMin && cols[i].g <= cfg.cloudSatMax) { hit++; }
  }
  return hit / pts.length;
};

var TiaraCandidates: TiaraCandidate[] | null = null;

// Every present centre from every layout, each with the cell table for the crop
// size that suits its count. Scored together; the count is never decided.
function tiaraCandidates(): TiaraCandidate[] {
  if (TiaraCandidates != null) { return TiaraCandidates; }
  const out: TiaraCandidate[] = [];
  for (let n = 2; n <= 6; n++) {
    const slots = TiaraLayouts[n];
    const side = TiaraSlotSide[n];
    for (let i = 0; i < slots.length; i++) {
      const cells = tiaraCellPixels(slots[i].x, slots[i].y, side);
      out.push({x: slots[i].x, y: slots[i].y, count: n, px: cells.px, py: cells.py});
    }
  }
  TiaraCandidates = out;
  return out;
}

// One scan's worth of pixel coordinates: the template's masked cells, for every
// candidate, laid end to end so a whole sweep is a single getImageColors call.
//
// This is what makes the match loop fast enough to matter. A sweep reads the
// mask's cells (~55 of 144) for each of 20 candidates, and it used to spend an
// engine crossing on every one of those ~1100 pixels; now it spends one. The
// window this runs in is short -- the presents are only readable for about half
// a second before the game resolves the screen itself -- so the loop's cadence
// decides how many valid looks it gets, and the crossings were the cadence.
//
// Rebuilt once per activation, because which cells are masked depends on the
// bubble. `starts[c]` is where candidate c's run begins; every run is tpl.n
// long, so no end index is needed.
function tiaraCompileScan(tpl: TiaraTemplate): TiaraScan {
  const cands = tiaraCandidates();
  const points: Point[] = [];
  const starts: number[] = [];
  for (let c = 0; c < cands.length; c++) {
    starts.push(points.length);
    const cand = cands[c];
    for (let j = 0; j < tpl.n; j++) {
      const i = tpl.idx[j];
      const px = cand.px[i];
      // Out-of-capture cells go in as (-1, -1) and read back all-zero, which is
      // the black the per-pixel path used to substitute for them.
      points.push(px >= 0 ? {x: px, y: cand.py[i]} : {x: -1, y: -1});
    }
  }
  return {points: points, starts: starts, tpl: tpl};
}

// Similarity of one candidate crop to the compiled bubble template, 0..1, plus
// how much of the template's mask is covered by something present-like here.
//
// Scores from colours already read by the sweep -- `base` is where this
// candidate's run starts in them. Each cell's difference is divided by
// cellSpread and clipped, which makes the score count clearly-wrong cells
// instead of averaging away small ones -- worth roughly triple the margin of a
// plain mean.
//
// `coverage` is the share of those cells where the candidate is itself bright
// and saturated, by the same satMin/valMin test that built the mask. It says
// nothing about *which* present this is -- the glowing board scores as high as
// a real present -- but it does say whether the presents have finished arriving,
// which is what tiaraPick needs and what a score alone cannot tell it.
Tsum.prototype.tiaraScoreCandidate = function(cols, base, tpl) {
  const cfg = TiaraMinnieConfig;
  const spread = cfg.cellSpread;
  if (tpl.n <= 0) { return {score: 0, coverage: 0}; }
  let d = 0, lit = 0;
  for (let j = 0; j < tpl.n; j++) {
    const col = cols[base + j];
    const cs = col.g / 255;
    const cv = col.r / 255;
    const chx = cs * TiaraHueCos[col.b];
    const chy = cs * TiaraHueSin[col.b];
    if (col.g >= cfg.satMin && col.r >= cfg.valMin) { lit++; }
    let cell = (Math.abs(tpl.hx[j] - chx) + Math.abs(tpl.hy[j] - chy)
              + Math.abs(tpl.sat[j] - cs) + Math.abs(tpl.val[j] - cv)) / 4 / spread;
    if (cell > 1) { cell = 1; }
    d += cell;
  }
  return {score: 1 - d / tpl.n, coverage: lit / tpl.n};
};

Tsum.prototype.tiaraBestMatch = function(img, scan) {
  const cands = tiaraCandidates();
  const n = cands.length;
  const tpl = scan.tpl;
  // The whole sweep, in one crossing.
  const cols = getImageColors(img, scan.points);
  const scores = [], covers = [];
  let bi = 0;
  for (let i = 0; i < n; i++) {
    const r = this.tiaraScoreCandidate(cols, scan.starts[i], tpl);
    scores.push(r.score);
    covers.push(r.coverage);
    if (scores[i] > scores[bi]) { bi = i; }
  }
  const best = cands[bi];
  // Centres from different layouts can land on the same present, and tapping
  // either is correct, so the margin is measured against the best candidate
  // that is somewhere else entirely.
  let rival = -1;
  for (let i = 0; i < n; i++) {
    const dx = cands[i].x - best.x, dy = cands[i].y - best.y;
    if (dx * dx + dy * dy < 100 * 100) { continue; }
    if (rival < 0 || scores[i] > scores[rival]) { rival = i; }
  }
  return {
    x: best.x, y: best.y, count: best.count, score: scores[bi],
    coverage: covers[bi],
    margin: rival < 0 ? scores[bi] : scores[bi] - scores[rival]
  };
};

// How many cells of a sampled crop the mask keeps. The size of the mask is what
// scoring has to work with, and on the bubble it also says how much of the
// present is drawn: it climbs as the bubble scales in and collapses to nothing
// as it fades.
function tiaraMaskCount(t: number[], grid: number): number {
  let n = 0;
  for (let i = 0; i < grid * grid; i++) {
    if (t[i * 5 + 4] > 0) { n++; }
  }
  return n;
}

// Wait for the thought bubble, then read the present inside it.
//
// The bubble is on screen for about three quarters of a second and scales in
// over the first ~150ms of that, so neither end of it can be read. This used to
// sleep dreamSettleMs from the first sighting and read once, which is right
// only when the sighting is early: a first look that lands in the bubble's last
// 250ms -- one slow poll, or a skill animation that ran long -- put the single
// read after the bubble had gone, and an empty template makes tiaraPick return
// before it has scored a single frame. The activation is then spent for
// nothing, which reads on screen as the choice screen timing out untouched.
//
// So look up to dreamMaxReads times across the same wait and keep the best.
// Mask size is the test, and it is not a proxy: it climbs as the present is
// drawn, peaks when it is whole, and collapses to nothing as the cloud fades,
// so the largest mask is the fullest look at the present. The reads come out of
// the wait rather than being added to it, and the loop stops as soon as the
// budget is used, so this costs no more elapsed time than the single read did
// -- only more captures, which the frozen game clock makes free.
Tsum.prototype.tiaraWaitForDream = function(timeoutMs) {
  const cfg = TiaraMinnieConfig;
  const deadline = Date.now() + timeoutMs;
  let seen = false;
  while (Date.now() < deadline) {
    const img = this.tiaraCloudCapture();
    try {
      seen = this.tiaraCloudFrac(img) >= cfg.cloudMinFrac;
    } finally {
      releaseImage(img);
    }
    if (seen) { break; }
    this.sleep(cfg.pollMs);
  }
  // Logged here rather than by the caller so the two ways this returns null --
  // the skill never fired, and the bubble came and went unread -- stay apart in
  // the log. They want different fixes.
  if (!seen) {
    logInfo(Log.Skill.TiaraNoDream);
    return null;
  }

  // One look: the present, and whether the bubble was fully open while it was
  // taken. Both come off the same capture.
  const read = function(ts: Tsum): TiaraLook {
    const img = ts.tiaraCapture();
    try {
      return {
        cells: ts.tiaraSample(img, tiaraBubbleCells()),
        open: ts.tiaraBubbleOpenFrac(img) >= cfg.dreamCloudFull
      };
    } finally {
      releaseImage(img);
    }
  };

  const sighted = Date.now();
  let started = Date.now();
  let look = read(this);
  // What a read costs on this device, measured rather than assumed -- it is the
  // whole basis for deciding whether another one fits.
  let readCost = Date.now() - started;
  let best = look.cells;
  let bestOpen = look.open;
  let bestCells = tiaraMaskCount(best, cfg.grid);
  let reads = 1;
  const seenLooks = [(bestOpen ? '' : '~') + bestCells];
  while (reads < cfg.dreamMaxReads) {
    const left = cfg.dreamSettleMs - (Date.now() - sighted);
    if (left <= 0) {
      // Out of budget. Take the second read anyway -- it is the one insuring
      // against a bubble that vanished during the first -- but stop there,
      // unless the pair so far never caught the bubble open.
      if (reads >= 2 && bestOpen) { break; }
    } else {
      // The pair is in and another read would not finish inside the budget.
      if (reads >= 2 && bestOpen && left < readCost) { break; }
      this.sleep(Math.floor(left / (cfg.dreamMaxReads - reads)));
    }
    started = Date.now();
    look = read(this);
    readCost = Date.now() - started;
    const cells = tiaraMaskCount(look.cells, cfg.grid);
    reads++;
    seenLooks.push((look.open ? '' : '~') + cells);
    // An open read always beats a half-open one, whatever the mask sizes say --
    // a bigger mask through a half-drawn cloud is more board, not more present.
    // Between two open reads, or two half-open ones, the larger mask wins.
    if ((look.open && !bestOpen) || (look.open === bestOpen && cells > bestCells)) {
      best = look.cells; bestCells = cells; bestOpen = look.open;
    }
  }

  // `seenLooks` marks a look taken while the bubble was not fully open with a
  // leading `~`; it stays an array so each look is its own value.
  logDebug(Log.Skill.TiaraBubbleRead, {
    looks: reads,
    seenLooks: seenLooks,
    durationMs: Date.now() - sighted,
    keptCells: bestCells,
    open: bestOpen,
    readCostMs: readCost,
  });
  // Scraps of a bubble caught mid-animation match nothing in particular but can
  // still win a frame of the choice screen outright, so they are worse than no
  // template at all.
  if (bestCells < cfg.dreamMinCells) {
    logInfo(Log.Skill.TiaraDimDream, { cells: bestCells, minCells: cfg.dreamMinCells });
    return null;
  }
  return best;
};

// Wait for the presents to land, then tap the one matching the template. The
// game timer is stopped for this whole stretch, so every check here is free --
// but the stretch itself is not open-ended: the game resolves the screen on its
// own about 850ms after the presents appear, and a tap that arrives after that
// selects nothing at all. Losing that race looks exactly like picking the wrong
// present, because both reset the 2-to-6 progression.
//
// Four things must agree before a tap goes out: the screen is readable at all
// (coverage), the score clears the floor, the winner beats everything elsewhere
// by the margin, and the same centre wins agreeScans scans running.
//
// That fourth one is not ceremony. Measured at 30fps over the three activations
// in tiara_minnie_debug/tiara_minnie.mp4, scoring all 63 usable bubble frames
// against every choice frame, 1063 frames cleared the first three gates and 48
// of them named the wrong present -- all in the ~100ms right after the cloud
// goes, while the presents are still sliding in. A single scan is not enough.
//
// What it costs is a whole scan cycle out of a window that is only ~500ms wide:
// the presents become tappable 550-650ms after the cloud goes and stop being
// tappable ~1150ms after it. That used to be unaffordable at a 100ms poll, and
// is affordable at 30 -- see pollMs/matchPollMs above for why looking that
// often is free here and waiting is not.
//
// The one exception is decisiveAfterMs: a screen that has been readable that
// long with no two scans ever agreeing gets one very clear reading tapped on
// its own, because the alternative at that point is not a safer tap, it is no
// tap. It did not fire once across the recordings.
Tsum.prototype.tiaraPick = function(scan) {
  const cfg = TiaraMinnieConfig;
  const tpl = scan.tpl;
  const deadline = Date.now() + cfg.choiceWaitMs;
  // A template with no cells scores every candidate 0, so no tap can ever clear
  // the floor. Leave now rather than spend choiceWaitMs of full-resolution
  // captures proving it.
  if (tpl.n <= 0) { return null; }

  // The presents only exist once the bubble has gone.
  while (Date.now() < deadline) {
    const img = this.tiaraCloudCapture();
    let gone;
    try {
      gone = this.tiaraCloudFrac(img) < cfg.cloudMinFrac;
    } finally {
      releaseImage(img);
    }
    if (gone) { break; }
    this.sleep(cfg.pollMs);
  }
  this.sleep(cfg.choiceLeadMs);

  // The centre a scan proposed, and when. It is confirmed by a later scan that
  // names the same centre at least confirmGapMs afterwards -- a separation in
  // time, not a count of scans, because two scans taken close together can both
  // land inside the same wrong reading and agree with each other.
  let cand = null;
  let candAt = 0;
  // When the choice screen first became readable, which is the clock the game
  // is running down. Set once and never reset -- a scan that fails the gates
  // after the screen is up is a blink, not the screen going away.
  let readableAt = 0;
  let scans = 0;
  let scanCost = 0;
  while (Date.now() < deadline) {
    const scanStart = Date.now();
    const img = this.tiaraCapture();
    let m;
    try {
      m = this.tiaraBestMatch(img, scan);
    } finally {
      releaseImage(img);
    }
    scans++;
    scanCost = Date.now() - scanStart;
    const now = Date.now();
    if (m.coverage >= cfg.coverageFloor
        && m.score >= cfg.confidenceFloor && m.margin >= cfg.marginFloor) {
      if (readableAt === 0) { readableAt = now; }
      const sameAsCand = cand != null && cand.x === m.x && cand.y === m.y;
      // Confirmed: the same centre, seen again far enough later that the second
      // look could have disagreed.
      const confirmed = sameAsCand && now - candAt >= cfg.confirmGapMs;
      // Last chance: the screen has been readable this long without any two
      // separated scans agreeing. One very clear reading now beats no tap,
      // which costs exactly what a wrong tap costs.
      const lastChance = m.score >= cfg.decisiveScore
        && m.margin >= cfg.decisiveMargin
        && now - readableAt >= cfg.decisiveAfterMs;
      if (confirmed || lastChance) {
        for (let i = 0; i < cfg.pickTaps; i++) {
          this.tap({x: m.x, y: m.y}, cfg.pickTapDuring);
          if (i + 1 < cfg.pickTaps) { this.sleep(cfg.pickTapGapMs); }
        }
        m.scans = scans;
        m.scanCost = scanCost;
        m.readableMs = now - readableAt;
        m.confirmed = confirmed;
        return m;
      }
      if (!sameAsCand) { cand = m; candAt = now; }
    } else {
      cand = null;
      logDebug(Log.Skill.TiaraWaiting, {
        score: +m.score.toFixed(2),
        margin: +m.margin.toFixed(2),
        coverage: +m.coverage.toFixed(2),
        x: m.x,
        y: m.y,
        scanCostMs: scanCost,
      });
    }
    this.sleep(cfg.matchPollMs);
  }
  // Nothing was tapped. Say why in numbers, because whether the loop ran out of
  // window or never saw a readable screen wants opposite fixes.
  logInfo(Log.Skill.TiaraUnsure, {
    scans: scans,
    scanCostMs: scanCost,
    everReadable: readableAt !== 0,
    readableMs: readableAt === 0 ? undefined : Date.now() - readableAt,
  });
  return null;
};

// One bubble, one pick, per activation.
//
// The thought bubble is only shown once, straight after the skill fires -- it
// does not come back between picks -- so once the present is tapped there is
// nothing left to wait for and this returns straight away. (The 2-to-6
// progression happens across activations, not inside one.)
Tsum.prototype.useTiaraMinniePlusSkill = function() {
  const cfg = TiaraMinnieConfig;
  const started = Date.now();
  this.sleep(cfg.dreamLeadMs);
  const armed = Date.now();
  // tiaraWaitForDream logs which way it failed; both mean there is nothing to
  // match against.
  const template = this.tiaraWaitForDream(cfg.dreamWaitMs);
  if (template == null) { return 0; }
  logInfo(Log.Skill.TiaraDream, {
    present: tiaraDescribe(template, cfg.grid),
    afterMs: Date.now() - armed,
  });
  // Compiled once and reused by every candidate of every scan, along with the
  // pixel list those cells turn into.
  // tiaraPick logs tiaraUnsure itself, with the scan counts and timings that
  // say whether it ran out of window or never saw a readable screen.
  const pick = this.tiaraPick(tiaraCompileScan(tiaraCompileTemplate(template, cfg.grid)));
  if (pick == null) { return 0; }
  // The timings are in the ordinary log, not behind `debug`, because what this
  // skill gets wrong is almost always a matter of when rather than what, and
  // that is not reconstructable after the fact from a score alone. `scan` is
  // what one capture-and-match costs on this device, which is the number every
  // interval here is really sized against.
  logInfo(Log.Skill.TiaraPicked, {
    x: pick.x,
    y: pick.y,
    score: +pick.score.toFixed(2),
    margin: +pick.margin.toFixed(2),
    coverage: +pick.coverage.toFixed(2),
    layout: pick.count,
    confirmed: pick.confirmed,
    scans: pick.scans,
    scanCostMs: pick.scanCost,
    readableMs: pick.readableMs,
    totalMs: Date.now() - started,
  });
  return 1;
};

registerSkill({
  types: [SkillType.TiaraMinniePlus],
  sweepsBubbles: false,
  afterActivate: function(ts) {
    ts.useTiaraMinniePlusSkill();
    // Always report "did not fire", whatever happened. The caller runs
    // `while (useSkill())`, and for a skill that takes seconds of choreography
    // an immediate second go is never right: the gauge still reads active
    // through the outro, so a `true` here buys another settle wait, lead-in and
    // bubble wait -- about six seconds of standing still -- before the missing
    // bubble finally ends it. If the gauge really is full again, the next
    // board-scan cycle picks it up one cycle later, which costs nothing like
    // as much.
    return false;
  }
});
