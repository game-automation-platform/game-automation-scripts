// Cpt. Lightyear — randomize, then timed aiming taps, then a bubble sweep.
//
// How many aiming taps land depends on the skill level, and the gaps between
// them are the animation's, so they can't be collapsed into one loop.
//
// Two skill types share this choreography: `CptLightyear` at 60fps and
// `CptLightyear120` at 120. Nothing about *what* it taps differs between them,
// only *when* -- so the taps are written once against a `CptLyTiming` table and
// each registered type supplies its own. See CptLyTiming120 for which numbers
// move with the frame rate and which do not.

/**
 * Every wall-clock number the choreography spends, in ms.
 *
 * Split so a variant can be written as a spread of another with only the
 * numbers that actually differ named -- see `CptLyTiming120`. There is nothing
 * else in here: a variant that needed a different *tap* would be a different
 * handler, not a different table.
 */
interface CptLyTiming {
  /** For the debug lines, so a mistimed run says which table produced it. */
  label: string;

  // --- The pre-roll: what stands between the activation tap and the first
  // aiming tap. The first three mirror useSkill's activation sequence, so if
  // that sequence changes these have to follow.
  //
  // These three are host-side holds and sleeps -- real milliseconds the script
  // itself spends -- so they do not move with the device's frame rate.

  /** `tap(Button.gameSkill1)`'s default `during`. */
  activationHoldMs: number;
  /** useSkill's sleep before afterActivate. */
  settleMs: number;
  /** This handler's opening `tap(Button.gameRand)`. */
  fanMs: number;

  // --- The animation. The game counts these windows in frames rather than
  // seconds (the same reason `PageProfiles` quotes its durations at
  // `PageBaselineFps`), so these are the numbers a frame-rate variant changes.

  /**
   * The intro animation, measured from the fan tap.
   *
   * Tuned *in situ* at 60fps: it was a bare `sleep(2100)` reached only after the
   * activation tap's own hold, useSkill's settle, and the opening fan tap had
   * all gone by. So it is 2100 *from the fan tap*, and the first aiming tap
   * wants activation + 2280. Re-anchoring the chain to activation without
   * carrying that pre-roll across is what put the aiming ~180ms early -- which
   * is why the pre-roll above is kept decomposed rather than written as one
   * 2280, since that is the only form that says where the number came from.
   */
  introMs: number;
  /**
   * When each aiming tap goes out, in ms from the first one -- so [0] is 0 by
   * construction. At 60fps the gaps are the original delay chain (a 10ms tap,
   * then 50/500/500/550) and are unchanged, as is the moment the first one
   * lands; what changed is only that they became deadlines off a fixed anchor
   * rather than delays off each other, so entering this handler late shifts
   * none of them.
   */
  aimOffsetsMs: number[];
  /** How long each aiming tap is held. Host-side, so it does not scale. */
  aimHoldMs: number;
  /** Waited out before the closing bubble sweep starts. */
  bubbleSweepStartMs: number;
  /** Waited out between rows of the closing bubble sweep. */
  bubbleSweepLineMs: number;
}

/** The 60fps table: the numbers this skill has always run. */
const CptLyTiming60: CptLyTiming = {
  label: 'CptLY',
  activationHoldMs: 50,
  settleMs: 30,
  fanMs: 90,
  introMs: 2100,
  aimOffsetsMs: [0, 60, 570, 1080, 1640],
  aimHoldMs: 10,
  bubbleSweepStartMs: 600,
  bubbleSweepLineMs: 300,
};

/**
 * The 120fps table.
 *
 * Written as a spread of the 60fps one so only the numbers that differ appear
 * here -- anything left out is inherited, and adding a timing above needs no
 * edit here unless 120 wants a different value for it.
 *
 * NOT MEASURED IN SITU. The animation windows are seeded at half the 60fps
 * number, on the same reasoning `PageRouter.durationOf` scales its page
 * durations by: the game animates these off a frame counter, so a device
 * running at twice the rate burns through them in half the wall-clock time.
 * That derivation is sound for *where* the numbers should land but it is not a
 * measurement -- if the aiming lands early or late at 120, these five are the
 * numbers to move, and the trailing comments are what they were at 60.
 *
 * The pre-roll's other three are deliberately absent: `activationHoldMs`,
 * `settleMs` and `fanMs` are script-side holds, not animation, so they are the
 * same real milliseconds on any device.
 */
const CptLyTiming120: CptLyTiming = {
  ...CptLyTiming60,
  label: 'CptLY120',
  introMs: 2100,                        // 60fps: 2100
  aimOffsetsMs: [0, 50, 540, 930, 1420], // 60fps: [0, 60, 570, 1080, 1640]
  bubbleSweepStartMs: 300,              // 60fps: 600
  bubbleSweepLineMs: 150,               // 60fps: 300
};

/**
 * When each aiming tap goes out, in ms from the activation tap.
 *
 * The pre-roll is added here rather than being baked into `aimOffsetsMs` so the
 * offsets stay readable as the animation's own gaps.
 */
function cptLyAimAtMs(t: CptLyTiming): number[] {
  const first = t.activationHoldMs + t.settleMs + t.fanMs + t.introMs;
  const at: number[] = [];
  for (let i = 0; i < t.aimOffsetsMs.length; i++) {
    at.push(first + t.aimOffsetsMs[i]);
  }
  return at;
}

Tsum.prototype.useCptLySkill = function(activatedAt, timing) {
  const t = timing || CptLyTiming60;
  const aimAt = cptLyAimAtMs(t);
  const t0 = activatedAt || Date.now();
  const lag = Date.now() - t0;
  if (lag > 100) {
    // The pre-roll stands between activation and the first aiming tap, so being
    // entered late is survivable up to about that -- but if this starts
    // reporting hundreds of ms, the probe loop, not the choreography, is what
    // needs looking at. Worth noting the 120fps table halves that margin.
    logDebug(Log.Skill.CptLyEnteredLate, { table: t.label, lagMs: lag });
  }
  this.sleep(200);
  this.tap(Button.fan, t.fanMs);
  this.tap(Button.fan, t.fanMs);

  this.sleepUntil(t0 + aimAt[0]);
  this.tap(Button.skillCptLy1, t.aimHoldMs);
  this.sleepUntil(t0 + aimAt[1]);
  this.tap(Button.skillCptLy2, t.aimHoldMs);
  if (this.skillLevel >= 2) {
    // 3rd tap
    this.sleepUntil(t0 + aimAt[2]);
    this.tap(Button.skillCptLy3, t.aimHoldMs);
  }
  if (this.skillLevel >= 4) {
    // 4th tap
    this.sleepUntil(t0 + aimAt[3]);
    this.tap(Button.skillCptLy3, t.aimHoldMs);
  }
  if (this.skillLevel === 6) {
    // 5th tap
    this.sleepUntil(t0 + aimAt[4]);
    this.tap(Button.skillCptLy3, t.aimHoldMs);
  }
  // The closing sweep is off: a bubble is worth more popped inside a chain, and
  // sweeping every one of them the moment the burst ends is what the Bubble
  // Strategy setting exists to stop. `sweepsBubbles: false` on both handlers
  // below says so.
  //
  // The one exception is this. Lightyear's burst can clear enough MyTsums to
  // refill the gauge outright, which leaves a board full of bubbles *and* a
  // skill ready to go -- and in that state there is no chain coming to spend
  // them on, because the next thing that happens is another burst. So the
  // bubbles are only in the way: sweep them fast and go round again.
  //
  // EXPERIMENTAL, and Cpt. Lightyear only for now. Generalising it means a
  // `repeatWhenReady` flag on `SkillHandler` and moving these six lines into
  // `useSkill` after `afterActivate` -- deliberately not done yet, because what
  // it costs when the gauge read is wrong has only been reasoned about here,
  // not measured on a device.
  //
  // One cropped read, ~2.4ms. It can say Active spuriously -- the burst's own
  // animation over the button reads as "not one of the not-active colours"
  // (see classifySkillGauge) -- and that is why this only decides whether to
  // sweep. Re-firing is still `useSkill`'s call, and it re-reads the gauge
  // properly, twice, before spending anything. So a wrong Active here costs one
  // quick sweep and nothing else.
  //
  // The other direction is the one to watch on a device: this reads 600ms after
  // the last aiming tap (`bubbleSweepStartMs`, borrowed because that is already
  // the moment the choreography treated the burst as done enough to sweep at),
  // and the count-in that refills the gauge may not have finished by then. If
  // the exception never seems to fire, that is the number to move, not this
  // check -- the log line below is what says whether it fired.
  if (this.checkSkillReadinessFast() !== SkillReadiness.Active) { return; }
  logInfo(Log.Skill.ReadyAgain, { skill: this.skillType });
  // The whole board, not the bottom half the old closing sweep covered: this
  // runs precisely when every bubble is about to be in the way.
  this.clearAllBubbles(50, 0, 1000, 10);
  // Returning normally is what re-fires it: `afterActivate` reports "fired",
  // and the play loop's `while (this.useSkill(board))` comes straight back.
};

registerSkill({
  types: [SkillType.CptLightyear],
  // EXPERIMENTAL: fire during a chain's count-in so the rest of that count
  // spills into the next gauge, and anchor the aiming to the activation tap
  // rather than to when this handler happened to be entered. Only active while
  // the "Auto-tap skill when ready" setting is on.
  overloadProbe: true,
  // The choreography does not sweep any more -- its closing `clearAllBubbles`
  // is off, and the one it can still run is the ready-again exception, which is
  // rare and is followed immediately by another activation. So the play loop
  // should go on counting this activation towards its own sweep.
  sweepsBubbles: false,
  afterActivate: function(ts, _board, activatedAt) {
    ts.useCptLySkill(activatedAt, CptLyTiming60);
  }
});

registerSkill({
  types: [SkillType.CptLightyear120],
  overloadProbe: true,
  sweepsBubbles: false,
  afterActivate: function(ts, _board, activatedAt) {
    ts.useCptLySkill(activatedAt, CptLyTiming120);
  }
});
