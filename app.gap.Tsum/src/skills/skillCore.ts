// ---------------------------------------------------------------------------
// Skill dispatch
//
// Every playable skill lives in its own file under src/skills/ and registers a
// handler here. useSkill owns the parts that are the same for all of them --
// checking the gauge, the fever hold-off, the activation tap(s) -- and hands the
// skill-specific choreography to the registered handler.
//
// Files are concatenated in tsconfig order, so this file must come before the
// individual skill files: their registerSkill calls run at load time.
// ---------------------------------------------------------------------------

/** The play loop's chain limits for one skill. See `SkillHandler.chainLimits`. */
interface SkillChainLimits {
  maxChain?: number;
  maxChainsPerScan?: number;
}

interface SkillHandler {
  // skillType keys (from the Skill Type dropdown in settings) this handler drives.
  types: SkillType[];
  // A bare tap on the skill button is a complete activation: no aiming, no
  // follow-up, and a tap while the gauge is still filling is a no-op the game
  // ignores. Lets the play loop fire these blind instead of paying for a gauge
  // check (see Tsum.link and maybeAutoTapSkill).
  bareTapActivates?: boolean;
  // The skill has two halves on two buttons (Pair Tsum): gameSkill2 counts
  // towards readiness and gets its own activation tap.
  usesSecondButton?: boolean;
  // EXPERIMENTAL. The skill is choreographed but its choreography is anchored
  // to the activation instant rather than to its own entry, so it survives
  // being fired mid-chain for the overload. Opts the skill into the cheap
  // probe path in maybeAutoTapSkill/useSkill; only consulted when the
  // "Auto-tap skill when ready" setting is on. See the note above
  // checkSkillReadinessFast for why this became possible.
  overloadProbe?: boolean;
  // What the play loop's chain limits are for this skill, overriding the
  // "Maximum Chain Number" and "Chains per board scan" settings.
  //
  // For a skill whose chains are worth something other than what they clear.
  // The settings are tuned for ordinary play -- many short chains keep the
  // combo alive -- and a skill that pays out on something else (a gauge, a
  // freeze window, a mode) can want the opposite badly enough that leaving it
  // to the player to notice is a worse default than saying so here.
  //
  // Applied where the limits are read, never written into the settings: the
  // Quick Bar goes on showing what the player chose, a skill change takes
  // effect on the next scan with nothing to restore, and a choreography that
  // throws cannot leave the run capped at something it set. `maxChain` is
  // `calculatePaths`' cap, where 0 means uncapped; `maxChainsPerScan` is how
  // many of what it finds get linked per scan. Either may be left out to keep
  // the setting for that one.
  //
  // A function is asked once per scan, so a skill whose board changes shape
  // mid-round can answer differently: Formal Suit Beast's mode leaves two
  // colours on the board, where short chains throw away the components that
  // makes, and the setting is right again the moment the mode ends. It is read
  // just before `orderPaths` runs, so a mode read off the board is one scan
  // stale -- which a mode measured in seconds does not notice.
  chainLimits?: SkillChainLimits | ((ts: Tsum) => SkillChainLimits);
  // Extra colour-cluster slots this skill's board scans keep, on top of the
  // `uniqueTsumCount - 1` every scan keeps by default.
  //
  // A frozen tsum is an ordinary colour cluster to the scan, so a skill that
  // freezes the board spends slots on its own ice -- and a live colour pushed
  // out of the last slot is not merely left unchained, it is not in the board
  // array at all and no pass can plan over it. Declared rather than set for the
  // duration of a choreography so every scan of the round agrees: the scans
  // between windows are the ones the ice-alike whitelist learns from, and a
  // colour it never saw there is a colour it cannot exonerate later.
  extraClusterSlots?: number;
  // The choreography clears bubbles itself, with `clearAllBubbles`.
  //
  // That call is the deliberate override of the Bubble Strategy setting: the
  // skill turns tsums *into* bubbles, or ends on a board covered in them, so
  // hoarding them for a chain that will not come is not an option. This flag is
  // how the play loop knows without reading the choreography, and it does two
  // things with it: it does not count the activation towards its own periodic
  // sweep (which would sweep a board the skill just emptied), and it leaves the
  // skill's taps alone whatever the strategy says.
  sweepsBubbles?: boolean;
  // Bubbles on the board are this skill's to spend, not the Bubble Strategy's.
  //
  // For a skill that links bubbles into a chain of their own, where every bubble
  // the strategy pops on its way past is a link taken out of that chain. While
  // this answers true the play loop pops none at all (`Tsum#bubbleTapBudget`);
  // what the skill wants spent anyway it asks for through
  // `popBubblesAfterChain`.
  //
  // A function rather than a flag because it can be true for only part of a
  // round: Lorcana Aurora bursts bubbles before her transformation and chains
  // them after it.
  claimsBubbles?: (ts: Tsum) => boolean;
  // A chain just landed: how many of the scan's bubbles to tap into its clear.
  //
  // For a skill that claims the bubbles -- `bubbleTapBudget` is 0 while a claim
  // stands -- but still wants a few spent on its own terms. Aurora hoards them
  // for the next activation's chain, which is worth far more than any single
  // pop, but a board that only ever clears by chaining tsums is a slow board:
  // one bubble every couple of long chains keeps it moving and costs the chain
  // one link.
  //
  // Called once per chain linked, with that chain's length, so a skill can count
  // chains as well as read the board; `ts.gameBubbles` is what there is to tap.
  // Every other skill declares nothing here and leaves it to the Bubble
  // Strategy.
  popBubblesAfterChain?: (ts: Tsum, chainLength: number) => number;
  // The play loop's chain order is this skill's to change.
  //
  // Called once per board scan with everything `calculatePaths` found, in the
  // order it would otherwise be linked, and returns the list to link instead --
  // reordered, shortened or unchanged. It runs *before* the batch is cut to
  // `maxChainsPerScan`, so a skill choosing between colours can reach past the
  // longest chains to the ones it wants; dropping a path is allowed and means
  // "not this scan", since the next scan sees the board again.
  //
  // The only hook that runs while the skill is not activating, and it sits
  // between the scan and the first drag of the batch -- so whatever it does
  // comes out of combo time and has to stay cheap.
  orderPaths?: (ts: Tsum, paths: TsumPath[], board: BoardPoint[]) => TsumPath[];
  // Runs after the gauge check but before the activation tap -- settle waits and
  // pre-taps that have to land while the skill is not yet running.
  beforeActivate?: (ts: Tsum) => void;
  // The choreography, run straight after the activation tap. Returning false
  // reports "did not fire" to the caller even though the skill went off.
  // `activatedAt` is when the activation tap went out. Handlers whose timings
  // are absolute can ignore it; an overloadProbe handler must not.
  afterActivate?: (ts: Tsum, board?: BoardPoint[], activatedAt?: number) => boolean | void;
}

// Keyed loosely, valued as possibly-absent: a miss is normal (SkillType.NoSkill has no
// handler, and a stale setting from an older build still has to play). What is
// checked is *registration* -- registerSkill takes SkillType[], so a handler
// cannot be filed under an id the dropdown does not offer, which is the
// direction typos actually go.
var SkillHandlers: { [type: string]: SkillHandler | undefined } = {};

function registerSkill(handler: SkillHandler) {
  for (let i = 0; i < handler.types.length; i++) {
    SkillHandlers[handler.types[i]] = handler;
  }
}

// Skills with no choreography of their own: tap randomize (tsums that support it
// reshuffle) and wait for the clear to land. Also what an unregistered skillType
// falls back to, so a stale setting still plays.
//
// The "Skill Waiting time" setting is the budget, not the wait: `settleBoard`
// returns as soon as the tsums have stopped falling, and only a board still
// moving at the deadline spends the whole of it.
function skillRandomizeAndWait(ts: Tsum) {
  ts.tap(Button.fan, 100);
  ts.settleBoard(ts.skillInterval - 100);
}

function skillBareTapActivates(skillType: SkillType): boolean {
  const handler = SkillHandlers[skillType];
  return !!(handler && handler.bareTapActivates);
}

// Whether this skill ends its own choreography by clearing bubbles. See
// `SkillHandler.sweepsBubbles`; an unregistered skillType sweeps nothing.
function skillSweepsBubbles(skillType: SkillType): boolean {
  const handler = SkillHandlers[skillType];
  return !!(handler && handler.sweepsBubbles);
}

// Whether bubbles on the board belong to the skill rather than to the Bubble
// Strategy. See `SkillHandler.claimsBubbles`; every other skill claims nothing.
//
// Asked from `bubbleTapBudget`, which `link` reaches once per chain, so it stays
// a lookup and a call.
function skillClaimsBubbles(ts: Tsum): boolean {
  const handler = SkillHandlers[ts.skillType];
  return !!(handler && handler.claimsBubbles && handler.claimsBubbles(ts));
}

// How many of the scan's bubbles this skill wants tapped into the clear of a
// chain that just landed. See `SkillHandler.popBubblesAfterChain`; every other
// skill wants none and leaves the Bubble Strategy to it.
//
// Asked once per chain linked, so it stays a lookup and a call.
function skillPopBubblesAfterChain(ts: Tsum, chainLength: number): number {
  const handler = SkillHandlers[ts.skillType];
  return handler && handler.popBubblesAfterChain
    ? handler.popBubblesAfterChain(ts, chainLength) : 0;
}

// The chain length cap to search to, and how many chains to link per scan --
// this skill's `chainLimits` where it declares one, the player's setting
// everywhere else. See `SkillHandler.chainLimits`.
//
// `Config.maxChain` and `ts.maxChainsPerScan` are the settings, and stay
// exactly what the player set: an override belongs to the skill, not to them.

// This skill's limits for this scan, resolving a handler that answers with a
// function. Asked twice per scan, so it stays a lookup and a call.
function skillChainLimits(ts: Tsum): SkillChainLimits | undefined {
  const handler = SkillHandlers[ts.skillType];
  const limits = handler && handler.chainLimits;
  return typeof limits === 'function' ? limits(ts) : limits;
}

// Whether this scan links MyTsum chains first: the "Link MyTsum first"
// setting, unless the skill is holding it off. See `Tsum#setMyTsumPriority`.
function skillMyTsumPriority(ts: Tsum): boolean {
  return ts.prioritizeMyTsum && !ts.myTsumPriorityHeld;
}

// A skill's hold on the "Link MyTsum first" setting: `setMyTsumPriority(false)`
// stops the play loop linking MyTsum chains first, `setMyTsumPriority(true)`
// lifts the hold. For a skill whose board makes the priority useless -- Formal
// Suit Beast's mode leaves two colours to keep *level*, so putting one of them
// first would only fight that.
//
// A hold, not a write, for the same reasons `chainLimits` never touches the
// settings: the pages keep showing what the player chose, lifting the hold
// restores exactly that, and `setMyTsumPriority(true)` cannot switch the
// priority on for a player who has it off. A new run starts with no hold, and
// the Quick Bar lifts it on a skill change, so a skill that never lifts its own
// cannot outlive itself.
Tsum.prototype.setMyTsumPriority = function(enabled) {
  const held = !enabled;
  if (this.myTsumPriorityHeld === held) { return; }
  this.myTsumPriorityHeld = held;
  logDebug(Log.Skill.MyTsumPriorityHold, { held: held });
};

function skillMaxChain(ts: Tsum): number {
  const limits = skillChainLimits(ts);
  return limits && typeof limits.maxChain === 'number' ? limits.maxChain : Config.maxChain;
}

// How many colour clusters a board scan keeps for this skill. See
// `SkillHandler.extraClusterSlots`; every other skill keeps the
// `uniqueTsumCount - 1` it always did.
//
// Plus whatever the Lorcana ink stones need. That one is not a skill's
// declaration because it is not a skill's board: every Lorcana tsum plays on a
// board with stones on it, including the ones set to a plain Burst, so it is
// claimed off the setting instead (`lorcanaExtraClusterSlots`, src/lorcana.ts).
function skillClusterSlots(ts: Tsum): number {
  const handler = SkillHandlers[ts.skillType];
  const extra = handler && handler.extraClusterSlots;
  return ts.uniqueTsumCount - 1 + (typeof extra === 'number' ? extra : 0)
    + lorcanaExtraClusterSlots(ts);
}

function skillMaxChainsPerScan(ts: Tsum): number {
  const limits = skillChainLimits(ts);
  return limits && typeof limits.maxChainsPerScan === 'number'
    ? limits.maxChainsPerScan : ts.maxChainsPerScan;
}

// The chains this skill wants linked out of the ones the scan found, for a
// skill that has an opinion. See `SkillHandler.orderPaths`; every other skill,
// and an unregistered skillType, gets the list back untouched.
function skillOrderPaths(ts: Tsum, paths: TsumPath[], board: BoardPoint[]): TsumPath[] {
  const handler = SkillHandlers[ts.skillType];
  if (!handler || !handler.orderPaths) { return paths; }
  return handler.orderPaths(ts, paths, board);
}

// The skill button reads one of these colors while the gauge is not yet full.
// Don't know the reason why these are checked instead of the "active skill"
// colors, but hopefully for a good reason.
var SkillNotActiveColors = [
  {"a": 0, "b": 157, "g": 112, "r": 85},
  {"a": 0, "b": 181, "g": 139, "r": 72},
  {"a": 0, "b": 128, "g": 73, "r": 16},
  {"a": 0, "b": 178, "g": 153, "r": 3},
  {"a": 0, "b": 255, "g": 215, "r": 33}
];

// Tiered gauge read against SkillNotActiveColors, at two thresholds: tight (25)
// means firmly empty; loose (60) is the plain not-active match. Returns
// 'active', 'almost', or 'far'.
//
// Note the sense: Active is *not matching* any not-active colour, so anything
// unexpected over the button -- including the skill's own animation -- reads
// Active. Callers that fire on Active need something else to stop them firing
// again while the skill runs.
function classifySkillGauge(c: Color): SkillReadiness {
  let matchesTight = false, matchesLoose = false;
  for (let i = 0; i < SkillNotActiveColors.length; i++) {
    const nc = SkillNotActiveColors[i];
    if (isSameColor(nc, c, 25)) { matchesTight = true; }
    if (isSameColor(nc, c, 60)) { matchesLoose = true; }
  }
  if (!matchesLoose) { return SkillReadiness.Active; }
  if (!matchesTight) { return SkillReadiness.Almost; }
  return SkillReadiness.Far;
}

Tsum.prototype.checkSkillReadiness = function(img, skillButton) {
  return classifySkillGauge(this.getColor(img, skillButton));
};

// Half-width of the gauge crop, in logical px, scaled to capture space the way
// sampleMyTsumColor scales its own. Only has to contain the single probe point.
const SkillGaugeCropRadius = 24;

// The same reading off a crop around the skill button instead of a whole-screen
// capture downscaled to 360px wide to sample one pixel.
//
// This is what makes firing ASAP compatible with a choreography. Per the host's
// own stage timings (the platform app's README, "capture timings"), the grab is
// ~2.35ms warm and the region+convert is ~1.83ms at 360x640 but ~0.29ms at
// 200x200 -- so a full screenshot() is ~4.2ms and this is ~2.4ms, against a
// tap's >=10ms (the host holds the touch for `during`). A gauge read is now
// cheaper than the blind tap that existed to avoid it, which is the assumption
// the blind-spam design in link() was built on and is worth re-measuring on the
// device with GAP_CAPTURE_TIMING=1 before it is leaned on further.
//
// No resize is requested, so the probe coordinate stays crop-local and cannot
// drift with resizeRatio the way getColor's toResizeXYs mapping would.
Tsum.prototype.checkSkillReadinessFast = function() {
  const center = this.toRealXY(Button.gameSkill1.x, Button.gameSkill1.y);
  const r = Math.max(4, Math.floor(SkillGaugeCropRadius * this.captureGameRatio));
  const x = Math.max(0, center.x - r);
  const y = Math.max(0, center.y - r);
  const img = getScreenshotModify(x, y, r * 2, r * 2, 0, 0, 100);
  try {
    return classifySkillGauge(getImageColor(img, center.x - x, center.y - y));
  } finally {
    releaseImage(img);
  }
};

// Whether firing the fan now would be a waste: the tsums it shuffles are about
// to be cleared by a skill that is ready or nearly so. It also leaves the board
// churning right as the skill activates, which matters for skills that read the
// board on activation (Tiara Minnie+ blows up whatever is under her pick).
// Costs one screenshot, so only call it where a fan tap is actually pending.
Tsum.prototype.fanWouldBeWasted = function() {
  const img = this.screenshot();
  try {
    return this.checkSkillReadiness(img, Button.gameSkill1) !== SkillReadiness.Far;
  } finally {
    releaseImage(img);
  }
};

// When skillAutoTap is on, fire the skill the moment it's ready instead of
// waiting for the next useSkill at the end of the board-scan cycle. The gauge
// can fill and sit ready for seconds while we scan, calculate and link; this is
// called often (e.g. between chains) but only does a real screenshot/check once
// per skillAutoTapInterval ms, so the timestamp guard keeps frequent calls cheap.
// Routes through useSkill so every skill type's activation (and choreography) is
// handled exactly as the normal end-of-cycle path.
// EXPERIMENTAL, overload path only. How often the cropped probe may run, and
// how long after an activation the probe loop stays quiet.
//
// The probe interval is deliberately below one drag: link() calls this after
// every chain, and the point of the exercise is to fire within the window where
// a long chain's erased MyTsums are still counting into the gauge. At ~2.4ms a
// probe, six chains cost ~15ms against a batch whose drags alone are >=30ms
// each -- so this is bounded by the game's animation, not by us.
const SkillOverloadProbeIntervalMs = 40;
const SkillOverloadCooldownMs = 1500;

// Answers whether a *choreographed* activation ran, so a caller holding a plan
// made before it knows that plan is stale: a choreography is seconds of taps,
// drags and waits, and the board it hands back is not the one it was given.
// `Tsum.link` ends its batch on it. A bare-tap skill's blind tap answers false
// -- nothing here knows whether it fired, which is the whole point of that path.
Tsum.prototype.maybeAutoTapSkill = function(board) {
  if (!this.skillAutoTap) { return false; }
  const now = Date.now();
  const handler = SkillHandlers[this.skillType];
  const overload = !!(handler && handler.overloadProbe);
  if (overload && now < this._skillCooldownUntil) { return false; }
  const interval = overload ? SkillOverloadProbeIntervalMs : this.skillAutoTapInterval;
  if (now - this._lastSkillAutoTap < interval) { return false; }
  this._lastSkillAutoTap = now;
  if (skillBareTapActivates(this.skillType)) {
    // A bare tap is a complete activation for burst skills, and it's a no-op
    // while the gauge isn't full -- skip the screenshots entirely.
    this.tap(Button.gameSkill1, 10);
    return false;
  }
  // One readiness read before the full useSkill probe (findPage plus a double
  // gauge check, several screenshots) so the recurring cost while the gauge is
  // still filling stays at a single screenshot.
  let status: SkillReadiness;
  if (overload) {
    status = this.checkSkillReadinessFast();
  } else {
    const img = this.screenshot();
    try {
      status = this.checkSkillReadiness(img, Button.gameSkill1);
    } finally {
      releaseImage(img);
    }
  }
  if (status !== SkillReadiness.Active) { return false; }
  const fired = this.useSkill(board, overload);
  if (overload) {
    // Whether or not it fired: a probe that saw Active and a useSkill that then
    // did not is exactly the mid-animation false positive the negative sense of
    // classifySkillGauge produces, and re-probing it 40ms later just repeats it.
    this._skillCooldownUntil = Date.now() + SkillOverloadCooldownMs;
    logDebug(Log.Skill.OverloadProbe, { fired: fired, durationMs: Date.now() - now });
  }
  return fired;
};

// Hold off activating while a fever is about to end, so the skill's clear lands
// in the next fever rather than being spent on its last moments.
function skillWaitOutEndingFever(ts: Tsum) {
  let feverAlmostOver = null;
  do {
    if (feverAlmostOver) {
      ts.sleep(100);
    }
    // Where along the fever ring "nearly over" sits, in logical px. Hoisted
    // above the read because the probe list has to be complete before it is
    // sent, and this depends only on the setting, not on the frame.
    const offsetX = Math.floor((733 - 345) * ts.noSkillLastFeverSec / 10);
    const img = ts.screenshot();
    try {
      // One crossing for all seven probes rather than seven. This runs in a
      // poll loop that re-reads until the fever stops ending, so the saving is
      // per iteration, not once.
      const p = ts.getColors(img, [
        {x: 340, y: 310},            // 0 in-fever backdrop
        {x: 332, y: 1666},           // 1 fever ring, left
        {x: 746, y: 1666},           // 2 fever ring, right
        {x: 345, y: 1670},           // 3 ring start
        {x: 345 + offsetX, y: 1670}, // 4 ring at the "nearly over" mark
        {x: 155, y: 190},            // 5 remaining time
        {x: 144, y: 195}             // 6 a few seconds left
      ]);
      const fever1 = isSameColor(p[0], {r: 0, g: 40, b: 49}, 80);
      const feverRingLeft = rgb2hsv(p[1]);
      const feverRingRight = rgb2hsv(p[2]);
      const hueDifference = Math.min(
          Math.abs(feverRingLeft.h - feverRingRight.h),
          360 - Math.abs(feverRingLeft.h - feverRingRight.h));
      const fever2 = hueDifference > 20;
      const feverStartColorHsv = rgb2hsv(p[3]);
      const feverEndColorHsv = rgb2hsv(p[4]);
      const nearlyDone = feverEndColorHsv.v < 90 || Math.abs(feverStartColorHsv.v - feverEndColorHsv.v) > 10;
      const enoughSecondsRemaining = isSameColor(p[5], p[6], 60);
      // logDebug(Log.Skill.FeverHoldOff, {fever1: fever1, fever2: fever2, almostOver: nearlyDone, enoughTime: enoughSecondsRemaining});
      feverAlmostOver = fever1 && fever2 && nearlyDone && enoughSecondsRemaining;
    } finally {
      releaseImage(img);
    }
  } while (feverAlmostOver);
}

// Gap between the two readiness reads. It was 200ms on the ordinary path and 30
// on the overload one, on the reasoning that the longer gap caught the button
// mid-flash -- but at ~4.2ms a read, 200 was 40x the thing it was separating,
// and the overload path had been proving 30 since it was written. 30ms still
// separates two frames at 60Hz, and is inside the count-in window the overload
// needs.
const SkillReadDebounceMs = 30;

Tsum.prototype.useSkill = function(board, fast) {
  if (this.skillType === SkillType.NoSkill) {
    return false;
  }

  // One look, no retry budget. This is a guard, not a wait: the gauge is read
  // off a fresh capture on the very next line either way, and `detect`'s timeout
  // is only ever spent when *nothing* fingerprints -- which mid-round means an
  // animation is covering the HUD, exactly when firing the skill is unwanted.
  // The 500ms it used to ask for bought nothing and stacked onto the play loop's
  // own check on every such frame.
  //
  // The board only, and the pause menu emphatically not: the menu leaves the
  // skill button showing over a screen that has stopped moving, so every read
  // says "ready" and the tap that should spend it never reaches the game. The
  // play loop's `while (this.useSkill(board))` then never ends -- which is what
  // a paused round used to hang on. The `detect` above is also what presses
  // Continue (`dismiss.resumeGame`), so returning false here hands the loop a
  // board again rather than parking it.
  if (gPages.detect(1, 0) !== PageName.GamePlaying) {
    return false;
  }

  const handler = SkillHandlers[this.skillType];
  const usesSecondButton = !!(handler && handler.usesSecondButton);

  // Checked twice, a moment apart: a single read can catch the button mid-flash.
  // `fast` shrinks the read -- a crop of the button instead of the whole screen
  // -- because on the overload path this whole block sits between the gauge
  // filling and the tap that spends it.
  const cropped = !!fast && !usesSecondButton;
  let skillActive2 = false;
  for (let i = 0; i < 2; i++) {
    let skillActive1: boolean;
    if (cropped) {
      skillActive1 = this.checkSkillReadinessFast() === SkillReadiness.Active;
    } else {
      const img = this.screenshot();
      try {
        skillActive1 = this.checkSkillReadiness(img, Button.gameSkill1) === SkillReadiness.Active;
        skillActive2 = usesSecondButton
          && this.checkSkillReadiness(img, Button.gameSkill2) === SkillReadiness.Active;
      } finally {
        releaseImage(img);
      }
    }
    if (skillActive1 || skillActive2) {
      if (i === 0) {
        this.sleep(SkillReadDebounceMs);
      }
    } else {
      return false;
    }
  }

  if (this.noSkillLastFeverSec > 0) {
    skillWaitOutEndingFever(this);
  }

  logInfo(Log.Skill.Use, { skill: this.skillType, skillLevel: this.skillLevel });
  if (handler && handler.beforeActivate) {
    handler.beforeActivate(this);
  }

  // Stamped at touch-down, not after the tap returns: "activation" is when the
  // press lands, and stamping after would fold `tap`'s default 50ms hold into
  // every offset measured from it -- silently, and differently if that default
  // ever changes. An anchored choreography measures its waits from here, so
  // everything the handler spends before its first timed tap, including this
  // tap's own hold and the settle below, comes out of its own budget.
  const activatedAt = Date.now();
  // The Lorcana card check stands down until this animation is over: for a
  // Lorcana tsum the animation *is* a card, drawn across the whole screen.
  // Here rather than in the play loop because this is the one place every
  // activation goes through -- see `lorcanaNoteSkillFired`.
  lorcanaNoteSkillFired();
  this.tap(Button.gameSkill1);
  this.sleep(30);
  if (skillActive2) {
    this.tap(Button.gameSkill2);
    this.sleep(30);
  }

  if (handler && handler.afterActivate) {
    return handler.afterActivate(this, board, activatedAt) !== false;
  }
  skillRandomizeAndWait(this);
  return true;
}
