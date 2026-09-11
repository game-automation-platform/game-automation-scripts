// ---------------------------------------------------------------------------
// Lorcana tsums: the transformation, and the ink stones that pay for it.
//
// A Lorcana tsum is really two tsums with one gauge between them. The board it
// plays on carries a sixth piece that is not a tsum at all -- a dark hexagonal
// ink stone (`block_<short>_i_s.png` in the game's own art) -- and every time
// the tsum's skill goes off it leaves exactly one bubble with a stone inside
// it. Tapping that bubble clears every stone on the board; leaving it there
// means the next activation adds another one to a board already full of them.
//
// Meanwhile the ring round the skill button fills a second time. When it is
// full the game slides a Lorcana card up from the bottom edge, and tapping it
// transforms the tsum: the stones go, the art changes (`_1` becomes `_2`) and
// the skill becomes a different skill for the rest of the round.
//
// None of that is a skill, which is why it is not in `src/skills/`. Every
// Lorcana tsum works this way whatever its own skill does, so it is one
// setting -- "Lorcana Card" -- and this file is all of it. A skill that wants
// to behave differently either side of the transformation reads
// `gLorcana.transformed`; `src/skills/lorcanaAurora.ts` is the worked example.
//
// ## Why it is not a page, and not a variant either
//
// The transformation is a mode of `GamePlaying`, like a fever (`src/fever.ts`)
// -- the board keeps running underneath and the play loop plays straight
// through. Unlike a fever it cannot even be given a documentation `variant`:
// page probes are read off a capture normalised to 360px wide, and its tell is
// the gold rim of the medallion the skill button is until she transforms, a
// couple of pixels there. So it is read at native resolution off a crop of the
// button, exactly as Formal Suit Beast's twin gauge is (see CODEMAP.md § "A
// mode of a screen is not a page").
//
// ## What this file gives you
//
//   gLorcana.transformed          the medallion is gone, so she has transformed
//   lorcanaReset()                forget it -- called at the whistle
//   ts.lorcanaReadMedallion()     one crop read: how much of the rim is there
//   ts.lorcanaMaybeTapCard()      the play loop's step: read, keep the state, and
//                                 tap where the card sits while the medallion is up
//   ts.popLorcanaStoneBubble()    tap the stone bubble the last skill left
//   lorcanaFindBubbles(ts)        the bubble pass this file needs, which is
//                                 not `findGameBubbles` -- see below
// ---------------------------------------------------------------------------

// --- Tuning data -----------------------------------------------------------

// `var` rather than `const`, like every other tuning table here: a `const` is
// lexical and so not a property of the global object, which is what the offline
// harness reaches these through.
var LorcanaConfig = {
  // --- the medallion -------------------------------------------------------
  //
  // Until a Lorcana tsum transforms its skill button is a circular medallion
  // with a gold rim, the gauge ring that fills a second time inside it. After
  // the transformation -- and for every other tsum -- the button is the
  // ordinary rounded square, which has no rim. So the rim *is* the
  // transformation state, read directly.
  //
  // The card itself is not detected. While the medallion is there, the spot
  // the card slides up to is tapped on every poll: off the card that spot is
  // the fever bar, where a tap does nothing, and the one tap that lands on the
  // card is the one that matters. Two tells were tried and both fail on the
  // live device. The card's black frame off the bottom band: the Quick Bar's
  // own dark rows and any burst dimming the screen read as it. The medallion's
  // track lit gold all round: both card-up captures show it and the live
  // medallion does not -- watched through the MuMu window the card sat nine
  // seconds with a rainbow ring where the gauge was and no gold on the track
  // (18 frames, 0.00-0.06 of the angles), while a burst over the button before
  // the card lit the track to 0.78-0.92. The captures caught a transient.
  //
  // Geometry in logical 1080x1920 px, from a least-squares circle through the
  // rim's outer edge on three captures: centred on the button at (160, 1635),
  // radius 125, residual under 1px. The rim is ~6 logical px thick, so three
  // radii inside it are sampled at each of `ringSamples` angles, and one gold
  // pixel among them counts the angle. Wider radii were tried and lift the
  // medallion by a few hundredths, but lift the ordinary button on re-encoded
  // recordings to 0.31 -- into the dead band -- so three it stays.
  //
  // "Gold" is a hue band, not a colour to match: the rim runs from deep gold
  // round to a pale highlight. Measured live over one round through the MuMu
  // window, with the Quick Bar hiding the rim's bottom arc: 0.39-0.69 of the
  // angles read gold before the card (130 frames; two at 0.11 and 0.19 with a
  // burst over the button), 0.42-0.61 with the card up (18 frames -- the card
  // whitens the right arc), 0.00 on all 349 after the tap. The six real
  // captures read 0.53-0.78, every other corpus board frame 0.14 or under, and
  // every frame of three recordings taken after the transformation 0.22 or
  // under. The one thing that also reads as a rim is Formal Suit Beast's twin
  // gauge (0.69-0.78), drawn round the same button and never on a Lorcana
  // tsum's board.
  ringCenterX: 160,
  ringCenterY: 1635,
  ringRimRadii: [118, 121, 124],
  ringSamples: 36,
  // Hue in degrees, saturation as a fraction of value, value 0-255.
  ringGoldHueMin: 16,
  ringGoldHueMax: 70,
  ringGoldSatMin: 0.24,
  ringGoldValMin: 140,
  // The rim, with a dead band: at or above the first it is there, at or below
  // the second it is not, and a reading between the two is no vote. 0.36 is 13
  // of the 36 angles, under the 0.39 the live medallion bottomed out at before
  // the card and the 0.42 with it up; 0.25 is above every ordinary-button
  // frame measured (0.14 on captures, 0.22 on the recordings).
  ringPresentMin: 0.36,
  ringAbsentMax: 0.25,
  // Consecutive polls that have to agree before the state moves either way.
  // Three to go: a burst over the button reads absent for a frame or two, and
  // two polls `cardPollMs` apart can straddle one. Two to come back: nothing
  // but the medallion reads present twice, and a false transformation costs
  // the wrong choreography for as long as it stands.
  ringAbsentReads: 3,
  ringPresentReads: 2,
  // Where to tap for the card: the middle of the strip that shows above the
  // Quick Bar. The card is centred on the screen and its visible strip runs y
  // 1668-1732, so this is 16 device px clear of both the black frame and the
  // strip's top edge on the 540x960 capture it was measured on. Without the
  // card that spot is the fever bar.
  cardTapX: 540,
  cardTapY: 1700,
  cardTapDuring: 20,
  // Shortest gap between two polls, in ms -- each a medallion read and, while
  // the medallion is there, a tap. The play loop comes past once per board
  // scan, several times a second; the card waits to be tapped, and the read
  // and the tap together are under 30ms.
  //
  // 250 rather than 500 because the poll gap is multiplied: the state moves on
  // `ringAbsentReads` polls running, so at 500 the transformation went unnoticed
  // for 1.5s after the animation cleared, and every one of those polls is one
  // the skill plays its untransformed half in. Two reads a second against one
  // costs ~3ms a poll.
  cardPollMs: 250,
  // How long after a skill activation the button is not looked at at all.
  //
  // A Lorcana skill's activation animation is a Lorcana card drawn across the
  // whole screen, and it dims the chrome under it while it plays. No reading
  // taken through it means anything, so none is taken.
  //
  // 4000ms against the 3.5s that animation was measured at on the longest of
  // three recordings (see `bubblePollMs`, src/skills/lorcanaAurora.ts).
  // Costing nothing: the card waits to be tapped for as long as it takes, so
  // all this moves is which poll notices it.
  cardQuietAfterSkillMs: 4000,

  // --- bubbles -------------------------------------------------------------
  //
  // The bubble pass this file runs, in the 200px play square `findTsums` works
  // in. It is deliberately NOT `findGameBubbles`: that pass is tuned for the
  // play loop, where a bubble left unfound is a bubble the next scan finds
  // anyway, and it answers with about two thirds of what is on the board. Here
  // a missed bubble is the ink stone left standing, or a bubble Aurora's chain
  // never reaches, so this trades precision for recall.
  //
  // Measured on the three Lorcana captures with bubbles on the board, where the
  // eye counts 6, 8 and 6: `findGameBubbles` finds 4, 4 and 4 and misses the
  // stone bubble in one of them, and these numbers find 8, 8 and 6 -- every
  // true bubble in all three, plus one to three circles drawn round a tsum.
  //
  // Those extras are affordable in both callers and nowhere else, which is why
  // this is not the global setting. A stray tap is not a drag, so the game
  // ignores it; a stray point on Aurora's route is a detour across board her
  // chain wanted to cross anyway.
  bubbleMinDist: 28,
  bubbleParam1: 20,
  bubbleParam2: 20,
  bubbleMinRadius: 15,
  bubbleMaxRadius: 26,

  // --- the ink stone -------------------------------------------------------
  //
  // Which of those bubbles holds the stone, by how cool its middle reads
  // (`b - r`). The stone is a dark blue-teal hexagon for Aurora and a grey one
  // for Tinker Bell, while a bubble holding anything else is warm -- so the
  // test is relative, not a colour to match, and a grey stone still wins by the
  // width of the warm bubbles' own bias.
  //
  // On the one frame with a stone bubble on it: the stone reads +171 and the
  // four other bubbles -98, -99, -99 and -98. The stray circles the pass draws
  // round tsums in that frame read +33, -56 and -42, so the runner-up is +33
  // and the margin below has 138 of room.
  //
  // `stoneMargin` is what makes this safe to be wrong about: below it, no
  // bubble is *the* stone bubble and every one of them is tapped instead. That
  // spends the bubble hoard, which is the cheaper mistake -- a stone left on
  // the board is still there next activation, and the one after that.
  stoneMinCool: 40,
  stoneMargin: 60,
  // Half-width of the square averaged at a bubble's middle, as a fraction of
  // its radius. A third keeps the sample inside the item and off the rim.
  stoneSampleFraction: 3,
  stoneTapDuring: 10,
};

/**
 * The transformation, as of this round.
 *
 * A plain object rather than a class for the reason the skills' tables are
 * `var`: nothing here needs a constructor, and a `class` would have to be
 * republished into the offline harness's context by name.
 */
var gLorcana = {
  /** The medallion has been seen to go, so the skill is the transformed one. */
  transformed: false,
  /** Polls running that read the rim absent, and present -- see `ringAbsentReads`. */
  absentReads: 0,
  presentReads: 0,
  /** When the button was last looked at -- what `cardPollMs` is measured from. */
  lastLookAt: 0,
  /**
   * Until when the button is not looked at, because a skill is activating and
   * its animation is a Lorcana card across the whole screen. See
   * `cardQuietAfterSkillMs`.
   */
  quietUntil: 0,
};

/**
 * Forget the transformation.
 *
 * Called at the whistle, for the reason `gFever.reset()` is: the state belongs
 * to a round, and the round that just ended has nothing to say about this one.
 */
function lorcanaReset(): void {
  gLorcana.transformed = false;
  gLorcana.absentReads = 0;
  gLorcana.presentReads = 0;
  gLorcana.lastLookAt = 0;
  gLorcana.quietUntil = 0;
}

/**
 * A skill has just been activated, so stop looking at the card band.
 *
 * Called from `useSkill` (src/skills/skillCore.ts) rather than from the play
 * loop, because that is the one place every activation goes through -- the
 * loop's own `while (useSkill(...))` is not, since `maybeAutoTapSkill` fires
 * the skill from inside a link batch as well.
 *
 * Unconditional: the cost of noting an instant is nothing, and gating it on
 * `lorcanaCard` here would only move the same test somewhere less obvious.
 */
function lorcanaNoteSkillFired(): void {
  gLorcana.quietUntil = Date.now() + LorcanaConfig.cardQuietAfterSkillMs;
}

/**
 * The activation animation is over: read the button again now.
 *
 * `cardQuietAfterSkillMs` is a worst case, and a choreography that has *seen*
 * the board -- settled bubbles on it, say -- knows better than the clock does.
 * Lifting the quiet early matters because every poll spent waiting is a poll
 * the transformation goes unnoticed in, and until it is noticed the skill plays
 * its untransformed half: on a Lorcana Aurora board that is a sweep popping the
 * bubbles her transformed skill just made for a chain.
 */
function lorcanaEndSkillQuiet(): void {
  gLorcana.quietUntil = 0;
}

/**
 * Colour-cluster slots the ink stones need, on top of what the scan keeps.
 *
 * The stones are a colour like any other to `classifyTsums`, and a board scan
 * keeps only the `uniqueTsumCount - 1` biggest clusters -- so on a Lorcana
 * board the stones take a slot and a live colour is pushed out of the board
 * array entirely, where no pass can plan over it. One slot back, and only while
 * there are stones to pay for: after the transformation they are gone.
 *
 * Read by `skillClusterSlots` (src/skills/skillCore.ts) so it applies to every
 * Lorcana tsum, not only to one that has a skill file of its own.
 */
function lorcanaExtraClusterSlots(ts: Tsum): number {
  return ts.lorcanaCard && !gLorcana.transformed ? 1 : 0;
}

// --- The medallion ---------------------------------------------------------

/** Does this colour sit in the rim's gold band? See `ringGoldHueMin`. */
function lorcanaIsGold(c: Color): boolean {
  const cfg = LorcanaConfig;
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  if (max < cfg.ringGoldValMin || max === 0 || (max - min) / max < cfg.ringGoldSatMin) {
    return false;
  }
  let hue: number;
  if (max === c.r) {
    hue = 60 * (c.g - c.b) / (max - min);
  } else if (max === c.g) {
    hue = 120 + 60 * (c.b - c.r) / (max - min);
  } else {
    hue = 240 + 60 * (c.r - c.g) / (max - min);
  }
  if (hue < 0) { hue += 360; }
  return hue >= cfg.ringGoldHueMin && hue <= cfg.ringGoldHueMax;
}

/**
 * One reading of the skill button: how much of the medallion's rim is there,
 * as a fraction of the `ringSamples` angles. See `LorcanaConfig` for what it
 * means and how it was measured. Null when the button is off the capture.
 *
 * One crop at native resolution and one batched colour read. Its points are
 * crop-local, so nothing here goes through `toResizeXY` and the circle cannot
 * drift with `resizeRatio` -- the same reason `checkSkillReadinessFast` takes
 * its own crop.
 */
Tsum.prototype.lorcanaReadMedallion = function() {
  const cfg = LorcanaConfig;
  const centre = this.toRealXY(cfg.ringCenterX, cfg.ringCenterY);
  const ratio = this.captureGameRatio;
  const radii = cfg.ringRimRadii;
  const reach = Math.ceil((radii[radii.length - 1] + 2) * ratio);
  const x = centre.x - reach;
  const y = centre.y - reach;
  const size = reach * 2 + 1;
  // `toRealXY` subtracts the game's own offsets, so on a screen that crops the
  // game top and bottom (`isFat`, Tsum.init) the button can fall off the
  // capture -- and a `getScreenshotModify` whose rectangle comes out empty
  // answers with handle 0, which the colour read would throw on.
  if (x < 0 || y < 0 || x + size > this.screenWidth || y + size > this.screenHeight) {
    return null;
  }
  const pts: Point[] = [];
  for (let i = 0; i < cfg.ringSamples; i++) {
    const a = 2 * Math.PI * i / cfg.ringSamples;
    for (let j = 0; j < radii.length; j++) {
      pts.push({
        x: Math.round(reach + radii[j] * ratio * Math.cos(a)),
        y: Math.round(reach + radii[j] * ratio * Math.sin(a)),
      });
    }
  }
  const img = getScreenshotModify(x, y, size, size, 0, 0, 100);
  try {
    const cols = getImageColors(img, pts);
    // An angle counts when any of its radii reads gold.
    let hit = 0;
    for (let i = 0; i < cfg.ringSamples; i++) {
      for (let j = 0; j < radii.length; j++) {
        if (lorcanaIsGold(cols[i * radii.length + j])) { hit++; break; }
      }
    }
    return hit / cfg.ringSamples;
  } finally {
    releaseImage(img);
  }
};

/**
 * The play loop's per-scan step: read the medallion, keep the state, and tap
 * where the card sits while the medallion is there. Returns whether this call
 * transformed the tsum.
 *
 * The only thing that moves `gLorcana.transformed`, and it moves it both ways:
 * the rim gone for `ringAbsentReads` polls is the transformation, and the rim
 * back for `ringPresentReads` polls afterwards means the earlier reading was
 * wrong -- a tsum over the button, a flash -- and the state goes back with it,
 * with a warning, rather than the skill file playing the transformed
 * choreography against the untransformed skill for the rest of the round.
 *
 * The tap is blind (see `cardTapX`). It goes out on every poll whose last
 * decisive read had the medallion there, so the card is tapped within a poll
 * of arriving and a poll spent in the dead band does not skip it. Rate-limited
 * to `cardPollMs`.
 */
Tsum.prototype.lorcanaMaybeTapCard = function() {
  if (!this.lorcanaCard || !this.isRunning) { return false; }
  const cfg = LorcanaConfig;
  const now = Date.now();
  // A skill is activating, and its animation is a full-screen Lorcana card
  // that dims the button under it. Nothing read here now means anything.
  if (now < gLorcana.quietUntil) { return false; }
  if (now - gLorcana.lastLookAt < cfg.cardPollMs) { return false; }
  gLorcana.lastLookAt = now;
  const rim = this.lorcanaReadMedallion();
  if (rim == null) { return false; }

  if (rim >= cfg.ringPresentMin) {
    gLorcana.presentReads++;
    gLorcana.absentReads = 0;
  } else if (rim <= cfg.ringAbsentMax) {
    gLorcana.absentReads++;
    gLorcana.presentReads = 0;
  }
  if (!gLorcana.transformed && gLorcana.absentReads >= cfg.ringAbsentReads) {
    gLorcana.transformed = true;
    logInfo(Log.Lorcana.Transformed, { skill: this.skillType, rim: rim });
    this.banner('Lorcana: transformed', 3000);
    return true;
  }
  if (gLorcana.transformed) {
    if (gLorcana.presentReads >= cfg.ringPresentReads) {
      gLorcana.transformed = false;
      logWarn(Log.Lorcana.Untransformed, { rim: rim });
    }
    return false;
  }
  // The medallion is there, so the card may be: tap where it would be.
  if (gLorcana.presentReads > 0) {
    this.tap({x: cfg.cardTapX, y: cfg.cardTapY}, cfg.cardTapDuring);
  }
  return false;
};

// --- Bubbles ---------------------------------------------------------------

/**
 * Every bubble on the board, with what each one's middle reads as.
 *
 * Its own capture and its own Hough pass -- see `bubbleParam2` for why this is
 * not `findGameBubbles` and what the two find. The colour comes off the same
 * capture, so telling the ink stone from the rest costs no second look.
 */
function lorcanaFindBubbles(ts: Tsum): LorcanaBubble[] {
  const cfg = LorcanaConfig;
  const img = ts.playScreenshotSquare();
  let grayImg: NativeImage | null = null;
  try {
    grayImg = buildBoardGray(img);
    const found = houghCircles(grayImg, 3, 1, cfg.bubbleMinDist, cfg.bubbleParam1,
      cfg.bubbleParam2, cfg.bubbleMinRadius, cfg.bubbleMaxRadius);
    const out: LorcanaBubble[] = [];
    if (found.length === 0) { return out; }
    // Five points per bubble -- centre and a cross a third of the radius out --
    // read in one crossing rather than one call per bubble. Clamped into the
    // square: a point outside a capture reports as all-zero rather than
    // throwing, which would drag a bubble on the rim towards black and could
    // hand the ink-stone test the wrong answer.
    const last = ts.playResizeWidth - 1;
    const clamp = (v: number) => Math.max(0, Math.min(last, Math.round(v)));
    const pts: Point[] = [];
    for (const k in found) {
      const b = found[k];
      const d = Math.max(1, Math.round(b.radius / cfg.stoneSampleFraction));
      const cx = clamp(b.x), cy = clamp(b.y);
      pts.push({x: cx, y: cy});
      pts.push({x: clamp(b.x - d), y: cy});
      pts.push({x: clamp(b.x + d), y: cy});
      pts.push({x: cx, y: clamp(b.y - d)});
      pts.push({x: cx, y: clamp(b.y + d)});
    }
    const cols = getImageColors(img, pts);
    for (let i = 0; i < found.length; i++) {
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < 5; j++) {
        const c = cols[i * 5 + j];
        r += c.r; g += c.g; b += c.b;
      }
      r /= 5; g /= 5; b /= 5;
      out.push({
        x: found[i].x, y: found[i].y, r: found[i].radius,
        color: {r: r, g: g, b: b, a: 0},
        cool: b - r,
      });
    }
    return out;
  } finally {
    if (grayImg != null) { releaseImage(grayImg); }
    releaseImage(img);
  }
}

/**
 * Tap the ink-stone bubble the last activation left behind.
 *
 * This is a deliberate override of the Bubble Strategy setting and says so, per
 * the rule in CODEMAP.md: the stone bubble is not worth hoarding for a chain,
 * it is worth spending now, because until it goes every further activation adds
 * another stone to the board.
 *
 * Aimed where it can be: the one bubble whose middle reads clearly cooler than
 * the rest is the stone (see `stoneMinCool`), and only that one is tapped, so
 * the ordinary bubbles stay on the board for the chains that earn them. Where
 * no bubble stands out, every bubble found is tapped instead -- the fallback is
 * the point of the margin, not a failure of it.
 *
 * Returns how many taps went out.
 */
Tsum.prototype.popLorcanaStoneBubble = function() {
  if (!this.isRunning) { return 0; }
  const cfg = LorcanaConfig;
  const bubbles = lorcanaFindBubbles(this);
  if (bubbles.length === 0) { return 0; }
  let best = -1, bestCool = -Infinity, runnerUp = -Infinity;
  for (let i = 0; i < bubbles.length; i++) {
    const cool = bubbles[i].cool;
    if (cool > bestCool) {
      runnerUp = bestCool;
      bestCool = cool;
      best = i;
    } else if (cool > runnerUp) {
      runnerUp = cool;
    }
  }
  const clear = best >= 0 && bestCool >= cfg.stoneMinCool
    && (bubbles.length === 1 || bestCool - runnerUp >= cfg.stoneMargin);
  const targets = clear ? [bubbles[best]] : bubbles;
  for (let i = 0; i < targets.length; i++) {
    const b = targets[i];
    const x = Math.floor(this.playOffsetX + b.x * this.playWidth / this.playResizeWidth);
    const y = Math.floor(this.playOffsetY + b.y * this.playHeight / this.playResizeHeight);
    tap(x, y, cfg.stoneTapDuring);
  }
  logDebug(Log.Lorcana.StonePopped, {
    // `aimed: false` with a `seen` of one or two is an ordinary board the pass
    // found nothing cool on; with a big `seen` it is the pass drawing circles
    // round tsums, and `cool`/`runnerUp` say by how much it was undecided.
    aimed: clear,
    seen: bubbles.length,
    popped: targets.length,
    cool: Math.round(bestCool),
    runnerUp: Math.round(runnerUp),
  });
  // The play loop's own list was read off a capture taken before these taps, so
  // whatever is still on the board is not where that list says it is. Dropped
  // for the same reason `popGameBubbles` drops its own.
  this.gameBubbles = [];
  return targets.length;
};
