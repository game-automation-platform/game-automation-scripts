// ---------------------------------------------------------------------------
// Round stats
//
// One row per played round, appended to <storage>/tsum_record/stats_<YYYYMMDD>.csv
// -- one file per day, named for the day the round was played. A row carries
// when it was played, which build of the script played it, how long it ran, the
// final score, coin and medal totals off the score page, and the in-game coin
// counter as it stood when the round ended.
//
// The engine has no OCR, so the digits are read here. Each field is a fixed
// rectangle: crop it, mask it to the digit colour with inRange(), take one
// bounding box per glyph from findContours(), squash each glyph to a 10x14
// bitmap and compare it against the templates below. The game draws every
// number in the same typeface -- the big orange score and the white coin
// counters normalise to the same shapes -- so one template set covers all of
// them. A box the mask joined across two glyphs ("44" on the dimmed HUD) is
// cut back into them first (`statsSplitJoined`).
//
// **Which screen a field is read on is part of the measurement, not an
// implementation detail.** Both of the numbers this file gets wrong, it gets
// wrong by reading the right rectangle at the wrong moment:
//
//   base coins   the in-game counter, read off the TsumLevelUp panel. The board goes
//                on paying out for seconds after the round timer stops, so the
//                counter holds the round's figure only once that is over, and
//                the level-up panel is the first screen that is certainly after
//                it. It also dims the HUD behind it, which is why that region
//                carries its own colour cutoffs.
//   score,       all read off the ScorePage, and only once its button row is
//   final coins  up: the page arrives counting the numbers up from zero and
//   medals       holds the row back until it has finished.
//
// **Medals move two of those.** A game carrying medals draws a medal counter to
// the left of the in-game coin counter, and a medals row between the exp and
// coin rows of the tally -- so both coin figures sit somewhere the rectangles
// aimed at them used to be background. The two screens are told apart
// differently, because what is cheap on each differs:
//
//   the HUD      one rectangle spans the whole counter row and the reader
//                returns its fields (`readStatsNumbers`). One field is coins
//                alone; two are medals then coins. Nothing has to be recognised,
//                which matters on a panel still fading in.
//   the tally    `ScorePageMedalRow` is scored on the frame that already had to
//                be taken to see the button row, so the layout costs no capture
//                and the three rows stay separate rectangles.
//
// A tally with no medals row is the game saying none were earned, so `medals` is
// 0 there rather than blank.
//
// A glyph that matches nothing well enough fails the whole field, which is
// written as an empty cell. Guessing would be worse than a gap: the numbers are
// the only reason the file exists. Note that the floating window is composited
// into getScreenshot(), so a log panel expanded over the top of the screen sits
// on the in-game coin counter and that field will come back empty.
// ---------------------------------------------------------------------------

const StatsGlyphW = 10;
const StatsGlyphH = 14;

/**
 * The glyph sample grid, row-major, built once at load.
 *
 * Every glyph is read at exactly this size, so the coordinates never vary --
 * which is what makes one batched `getImageColors` possible here. Reading them
 * one pixel at a time cost 140 engine crossings per glyph, so around a thousand
 * for a seven-digit score, and every field is read at least twice
 * (`readSettledStatsNumber`).
 */
const StatsGlyphPoints: Point[] = (function() {
  const pts: Point[] = [];
  for (let y = 0; y < StatsGlyphH; y++) {
    for (let x = 0; x < StatsGlyphW; x++) {
      pts.push({x: x, y: y});
    }
  }
  return pts;
})();

// Digit shapes, normalised to StatsGlyphW x StatsGlyphH. Each is the per-pixel
// majority over every labelled glyph in the corpus and the device's unread-*
// debug shots -- 212 glyphs across the three sizes the game draws a number at:
// the orange score (~50px), the tally rows (~20px) and the dimmed level-up
// counter (~17px). Over that set the worst genuine digit scores 0.793 with a
// 0.050 lead over the runner-up. `pages:stats` is the gate; recut the same way
// from fresh frames if the game ever changes its typeface.
//
// Twice a template was bolder than the game's small glyph, and each time it
// cost a whole field at tally size, where a stroke is two pixels of this grid
// rather than three. The old '5' had a three-row top bar where the game draws
// one, so on the coin row it read as '6'. The old '9' closed its loop with two
// full-width rows where the game draws a thin loop and a hooked tail, so at
// 20px it was 0.021 from '0' -- under `StatsMinGlyphMargin` -- and every coin
// figure with a 9 in it was written blank.
const StatsDigits: {[digit: string]: string[]} = {
  '0': ['...####...',
        '..##..##..',
        '.##...###.',
        '.##....##.',
        '###....###',
        '###....###',
        '###....###',
        '###....###',
        '###....###',
        '###....###',
        '.##....##.',
        '.##...###.',
        '..##..##..',
        '...####...'],
  '1': ['.....#####',
        '..########',
        '##########',
        '.....#####',
        '.....#####',
        '.....#####',
        '.....#####',
        '.....#####',
        '.....#####',
        '.....#####',
        '.....#####',
        '.....#####',
        '.....#####',
        '......####'],
  '2': ['..######..',
        '.########.',
        '.##....###',
        '###....###',
        '.#.....###',
        '.......###',
        '......###.',
        '....#####.',
        '...####...',
        '..####....',
        '.####.....',
        '.###......',
        '#########.',
        '##########'],
  '3': ['...#####..',
        '.##...###.',
        '.##....##.',
        '.#.....##.',
        '.......##.',
        '......##..',
        '...####...',
        '......###.',
        '.......###',
        '.......###',
        '##.....###',
        '###....##.',
        '.###..###.',
        '...###....'],
  '4': ['......##..',
        '.....###..',
        '....####..',
        '....####..',
        '...#####..',
        '...#..##..',
        '..##..##..',
        '.##...##..',
        '.##...##..',
        '#########.',
        '##########',
        '.########.',
        '......##..',
        '......##..'],
  '5': ['.########.',
        '#########.',
        '###.......',
        '###.......',
        '###.###...',
        '#########.',
        '###...###.',
        '.#.....###',
        '.......###',
        '.......###',
        '##.....###',
        '##.....##.',
        '.###..###.',
        '..#####...'],
  '6': ['...#####..',
        '.###..###.',
        '.##....###',
        '###.......',
        '###.......',
        '########..',
        '###...###.',
        '###....###',
        '###....###',
        '###....###',
        '###....###',
        '.##....##.',
        '..##..###.',
        '...####...'],
  '7': ['##########',
        '##########',
        '.#########',
        '.......##.',
        '......###.',
        '......##..',
        '.....###..',
        '.....##...',
        '....###...',
        '...###....',
        '...###....',
        '..###.....',
        '..###.....',
        '..##......'],
  '8': ['...####...',
        '.###..###.',
        '.###..###.',
        '.###..###.',
        '.###..###.',
        '.###..###.',
        '..######..',
        '.###..###.',
        '###....###',
        '###....###',
        '###....###',
        '###....###',
        '.###..###.',
        '...#####..'],
  '9': ['...####...',
        '.###...##.',
        '.##....##.',
        '.##....##.',
        '###....##.',
        '###....###',
        '.##....###',
        '.###...###',
        '..####.###',
        '.......##.',
        '.......##.',
        '.##....##.',
        '.##...###.',
        '...####...']
};

// Width over height of each digit as the game draws it. Squashing every glyph
// into the same box throws those proportions away, and '1' is the one digit
// they identify on their own -- it is half the width of everything else.
const StatsDigitAspect: {[digit: string]: number} = {
  '0': 0.79, '1': 0.50, '2': 0.73, '3': 0.77, '4': 0.80,
  '5': 0.74, '6': 0.77, '7': 0.75, '8': 0.76, '9': 0.75
};

// Capture rectangles in logical 1080x1920 coordinates, each with the colour
// range (r/g/b low, then high) that separates its digits from the background.
// Every rectangle is padded well past the widest number its field can hold, and
// the padding only ever covers background: the gold coin icon beside every coin
// value is nowhere near any cutoff -- its blue channel is single digits -- and
// nothing else on those rows is either.
//
// Each region is only ever read on the page named beside it, which is what lets
// the coin fields carry different cutoffs for what is the same white counter
// drawn on two screens.
//
// **The white floors are just under white, not mid-grey.** The counters are
// drawn pure white with an antialiased skirt, and on a 1080 capture the crop is
// halved on its way out of getScreenshotModify, which averages that skirt thin.
// A 540-wide device gets no such shrink, and at a 150 floor the skirt of one
// digit reaches the next: '5' and '4' of "3,954" came back as a single contour
// and the field read empty. Everything from 215 to 225 reads both corpus
// tallies -- the 1080 one and the 540 one -- so 220 sits in the middle of the
// band rather than on an edge of it. The orange score has the same story at a
// lower absolute level.
const StatsRegions: {
  score: StatsRegion;
  finalCoins: StatsRegion;
  finalMedals: StatsRegion;
  finalCoinsMedals: StatsRegion;
  baseCounters: StatsRegion;
} = {
  // ScorePage: the big orange total. One rectangle for both tally layouts --
  // the medals row is below it and the block grows downwards from here.
  score: {
    name: 'score',
    x: 60, y: 604, w: 960, h: 162,
    lo: [200, 140, 0], hi: [255, 255, 150]
  },
  // ScorePage, no medals row: the round's coins, in the row under the star.
  finalCoins: {
    name: 'final coins',
    x: 400, y: 1046, w: 376, h: 80,
    lo: [220, 220, 220], hi: [255, 255, 255]
  },
  // ScorePage, medals row present: the medal count, between the exp and coin
  // rows. Starts at x 400 because the crystal icon at 334-380 is white enough to
  // mask in; the count is right-aligned at 710 and its digits are pitched 34
  // apart, so the rectangle holds nine of them and the icon is never the limit.
  finalMedals: {
    name: 'final medals',
    x: 400, y: 980, w: 376, h: 90,
    lo: [220, 220, 220], hi: [255, 255, 255]
  },
  // ScorePage, medals row present: the same coin figure as `finalCoins`, in the
  // row the medals pushed it down to.
  finalCoinsMedals: {
    name: 'final coins (medals)',
    x: 400, y: 1072, w: 376, h: 88,
    lo: [220, 220, 220], hi: [255, 255, 255]
  },
  // TsumLevelUp: the in-game counter row, seen through the dimming that screen
  // lays over the board -- so the digits are not white here. Their cores read
  // 72-79 on the level-up frames in the corpus against a background packed
  // into 0-15, and the same counter under the Magical Time offer and the pause
  // menu, which dim harder, reads 48-55. A floor of 40 sits below every one of
  // those and above every background, so it is a cutoff for "the counter with
  // a panel over it" rather than one tuned to a single screenshot.
  //
  // The undimmed counter does not read through this at all -- too much of the
  // live HUD clears a floor that low -- and that is the safe direction: an
  // unreadable field is left empty, where a wrong one would be recorded.
  //
  // The whole row rather than the coin figure alone, because a game carrying
  // medals draws a second counter to the left of it and pushes the coins ~130px
  // right. `readStatsNumbers` splits what it finds and coins are the last field
  // either way. The left edge clears the medal icon (302-354) and the right one
  // the Pause button (from 818).
  //
  // That left edge is the one real limit here. The medal count is right-aligned
  // at 500 and pitched 30 apart, so four digits reach x 384 and clear it, while
  // five would start under the icon and be cut by the edge. A clipped glyph
  // fails, and it fails the *row*, so a five-digit medal count would cost
  // `base_coins` as well. Medal awards seen so far are in the hundreds.
  baseCounters: {
    name: 'base counters',
    x: 368, y: 286, w: 432, h: 78,
    lo: [40, 40, 40], hi: [255, 255, 255]
  }
};

// Fraction of the tallest glyph below which a shape is a thousands separator
// rather than a digit. Commas measure ~0.41 of a digit in every size the game
// uses, so the gap either side of this is wide.
const StatsSeparatorHeight = 0.62;

// A horizontal gap this many glyph-heights wide starts a new number.
//
// What separates "1,015" from "154  2,075" without knowing which screen is
// being read. Measured in glyph heights so it holds at any capture size: on the
// level-up HUD the two counters are 2.6 heights apart, while the widest gap
// inside a number -- the one straddling a thousands separator, which is dropped
// before this is measured -- is 0.5, and on the big orange score it is 0.42.
const StatsFieldGapHeights = 1.2;

// The narrowest and widest a digit is, in glyph heights: '1' measures 0.39-0.47
// and '4' up to 0.84 on every frame in the corpus. A contour wider than the
// tallest glyph in its row is two glyphs the mask joined, and the cut between
// them (`statsSplitJoined`) has to leave a digit's width either side.
const StatsDigitMinWidth = 0.33;
const StatsDigitMaxWidth = 0.9;

// A glyph has to match its best template this well, and beat the runner-up by
// this much, for the field to be accepted. The worst genuine digit over the
// 212 glyphs the templates were cut from scores 0.793 with a 0.050 lead.
const StatsMinGlyphScore = 0.72;
const StatsMinGlyphMargin = 0.03;

// More glyphs than this means the crop is showing something other than the
// number it was aimed at.
const StatsMaxDigits = 12;

// One window, spent on one thing at a time: how long the tally gets to arrive,
// then how long the count-up it arrives running gets to finish, then how long a
// number gets to come back the same twice. All three give up rather than block
// the task controller behind a screen that is never going to show what they are
// after; the round is still recorded, just with the fields that could not be
// read left empty.
const StatsScorePageWaitMs = 15 * 1000;
const StatsSettleMs = 8 * 1000;

// A field that has not produced a single reading is given up on after this
// many looks, well before the settle window runs out. A sparkle crosses a
// rectangle rather than camping on it, so this many misses with not one
// readable frame in between means the rectangle itself is wrong -- the other
// layout's row, or something parked over the tally -- and the rest of the
// window would only prove that again, at half a second a look.
const StatsSettleMissLimit = 6;

// The whole wait, however often the window above is renewed. The renewals are
// what stop a long post-round sequence from being read as a late tally, and this
// is what stops them running for ever -- a dismiss tap that never lands, or a
// panel the game leaves up.
const StatsScorePageMaxWaitMs = 60 * 1000;

// Where `waitForScorePage` taps a screen it cannot name once the tally has
// been seen, and how often. The spot has to be inert on everything that can be
// in front of it then: on the tally it is the panel's number rows, on the event
// page the map art, on the new-record and rank-up panels their body, and all of
// them keep their buttons well below it. On what it is aimed at -- an event's
// result overlay, its card reveal -- any tap counts. The interval leaves an
// overlay's exit animation time to finish before the next look.
const StatsUnknownTapSpot = {x: 540, y: 1000};
const StatsUnknownTapMs = 1500;

// How many failed reads of the coin counter it takes, with none having
// succeeded, before the level-up screen is kept for diagnosis. The screen is
// polled every few hundred milliseconds and its first frames can still be
// fading in, so a shot taken on the first miss would mostly catch a half-drawn
// panel; by the fourth the counter is up and genuinely unreadable.
const StatsBaseCoinShotAfter = 4;

// The screens between a finished round and its tally. While one of these is up
// the score page is not late, it is not yet due, so `waitForScorePage` gives
// itself a fresh window on each.
//
// Two sorts, and the difference does not matter to the wait. `MagicalTime`,
// `HighScore` and `AccountLevelUp` stand *in front of* the tally and are cleared
// by a dismiss handler; `TsumLevelUp` comes *before* it, closes itself, and is
// where `record.baseCoins` reads the coin counter. What they share is that the
// game decides when the tally arrives, and the seconds they are up are not
// seconds it was late by.
//
// `TsumLevelUp` is the one this list was missing, and it is the expensive one:
// it is up for seconds, and the payout it waits on is in front of it. Since the
// play loop stopped going quiet for a round's closing seconds
// (`GamePlayingLastSeconds`, src/data.ts) those seconds are played like any
// other, so there are more chains still paying out when the timer stops and a
// bigger score to count up afterwards -- which is how a round that ended
// perfectly normally started spending the whole window before the tally had been
// drawn, and writing itself with no score.
// The list itself is `preTallyPages()` (pages.ts): every page declaring
// `PageRole.PreTally`, which the event card's screens do too -- the event page
// the result overlay's tap lands on, whose Close restores the tally, and the
// card reveal and gift dialog the event puts up at its milestones. The overlay
// itself is not a page; it is what the blind tap in `waitForScorePage` is for.

// Cap on debug screenshots per run of the script. A round whose numbers cannot
// be read tends to be followed by more of the same, and a full-screen PNG is a
// megabyte or two.
const StatsMaxDebugShots = 30;

/** First column of every row, and the only one a deduplicating reader needs. */
const StatsIdColumn = 'id';

// 'id' is the row's dedupe key, unique across every device and player; see
// "Row identity" below. 'datetime' is UTC, like every timestamp the script
// writes. 'script_version' is the build that played the round -- without it a
// change in the numbers cannot be told apart from a change in the script that
// produced them, and the app's envelope names the app's version but not this
// one. 'tsum' is the short name of the tsum that played the round, read off
// the pre-round screen by identifyMyTsum(). Empty when nothing in the library
// matched it well enough. 'medals' is the round's medal award off the tally,
// and 0 -- not empty -- on a tally with no medals row, because that is the game
// saying none were earned rather than a figure that could not be read.
const StatsBaseColumns = [StatsIdColumn, 'datetime', 'script_version', 'skill_type', 'tsum', 'duration_seconds', 'score', 'base_coins', 'final_coins', 'medals'];

// One file per UTC day in tsum_record/, named for the day the round was played:
// stats_20260825.csv. The engine cannot append, so writing a row rewrites the
// whole file -- a day bounds how big that gets, where one file collecting
// months did not.
function statsFileName(date: Date): string {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return 'stats_' + date.getUTCFullYear() + (month < 10 ? '0' : '') + month
    + (day < 10 ? '0' : '') + day + '.csv';
}

// The gameplay settings each round was played under, one column each, so a run
// can be sliced by what it was set to. One column per setting rather than a
// packed "key=value;key=value" cell: the point of the file is to be grouped and
// charted, and a packed cell has to be taken apart before any of that can start.
//
// Named exactly as the settings UI names them, so a column maps straight back to
// the control that set it. Values are written as the settings object holds them
// -- `true`/`false` for switches, the number for the rest -- including the ones
// that were off, because "coins with +Coin off" is half of every comparison
// anyone would want to make.
//
// Read off the copy `beginRoundStats` took when the round started, never off
// the live object -- the Quick Bar changes settings mid-run, and a row has to
// say what its own round was played under. See `statsSettingsSnapshot`.
//
// Typed as keys of `Settings` so renaming a setting fails the build here rather
// than quietly writing a column of blanks.
//
// Deliberately absent: `autoPlayGame`, `clickAssist` and `trackRoundStats`,
// because a row only exists when the first is on, the second is off and the
// third is on, so all three would be the same in every row; `skillType`, which
// is already the second column; and the heart, mailbox and
// app-restart chores, which do not touch what happens inside a round.
const StatsSettingColumns: (keyof Settings)[] = [
  SettingKey.JpVersion,
  SettingKey.BubbleStrategy,
  SettingKey.UseFan,
  SettingKey.MaxChainsPerScan,
  SettingKey.MaxChain,
  SettingKey.LinkReachPercent,
  SettingKey.PrioritizeMyTsum,
  SettingKey.BonusScore,
  SettingKey.BonusCoin,
  SettingKey.BonusExp,
  SettingKey.BonusTime,
  SettingKey.BonusBubble,
  SettingKey.Bonus5to4,
  SettingKey.BonusCombo,
  SettingKey.SkillLevel,
  SettingKey.SkillWaitingTime,
  SettingKey.SkillAutoTap,
  SettingKey.LorcanaCard,
  SettingKey.NoSkillLastFeverSec
];

/**
 * The same settings, as `round.start` and `round.end` carry them -- so an event
 * and the CSV row for the same round describe it the same way, off the same
 * list. A consumer that groups rounds by what they were played under no longer
 * has to wait for the file.
 *
 * `Partial` because a snapshot may be missing a key the build knows about; the
 * columns above have the same gap and write it as an empty cell.
 */
type RoundSettings = Partial<Settings>;

/**
 * The snapshot reduced to those settings, with the values left as they are.
 *
 * Not `statsSettingValue`: a CSV cell has to be a string, and a JSON payload
 * does not -- so a switch goes out as `true`, not `"T"`, and a number stays a
 * number a consumer can compare.
 */
function statsSettingsPayload(settings: Settings | undefined): RoundSettings | undefined {
  if (!settings) {
    return undefined;
  }
  const from = settings as unknown as {[key: string]: unknown};
  const out: {[key: string]: unknown} = {};
  for (let i = 0; i < StatsSettingColumns.length; i++) {
    out[StatsSettingColumns[i]] = from[StatsSettingColumns[i]];
  }
  return out as RoundSettings;
}

/** One CSV row, keyed by column name; a column with no value is written empty. */
type StatsRow = {[column: string]: string | number | undefined};

/**
 * The engine returns a raw 0 when it could not produce an image; the nominal
 * NativeImage type cannot express that, so the check goes through here.
 */
function statsImageOk(img: NativeImage): boolean {
  return !!(img as unknown as number);
}

/**
 * Shrinks a glyph to the template grid and reads it back as row strings.
 * resizeImage is INTER_LINEAR, which samples rather than averages and so drops
 * whole strokes when it shrinks by much more than half in one go -- hence the
 * halving loop instead of one jump to the final size.
 */
function statsGlyphBitmap(mask: NativeImage, box: ContourBox): string[] | null {
  let cur = cropImage(mask, box.x, box.y, box.width, box.height);
  if (!statsImageOk(cur)) {
    return null;
  }
  try {
    while (true) {
      const size = getImageSize(cur);
      if (size.width <= StatsGlyphW * 2 && size.height <= StatsGlyphH * 2) {
        break;
      }
      const nw = Math.max(StatsGlyphW, Math.ceil(size.width / 2));
      const nh = Math.max(StatsGlyphH, Math.ceil(size.height / 2));
      if (nw === size.width && nh === size.height) {
        break;
      }
      const half = resizeImage(cur, nw, nh);
      if (!statsImageOk(half)) {
        return null;
      }
      releaseImage(cur);
      cur = half;
    }
    const small = resizeImage(cur, StatsGlyphW, StatsGlyphH);
    if (!statsImageOk(small)) {
      return null;
    }
    releaseImage(cur);
    cur = small;
    const samples = getImageColors(cur, StatsGlyphPoints);
    const rows: string[] = [];
    for (let y = 0; y < StatsGlyphH; y++) {
      let row = '';
      for (let x = 0; x < StatsGlyphW; x++) {
        row += samples[y * StatsGlyphW + x].r >= 110 ? '#' : '.';
      }
      rows.push(row);
    }
    return rows;
  } finally {
    releaseImage(cur);
  }
}

/**
 * Cuts a contour the mask joined across two glyphs back into them, or returns
 * it alone.
 *
 * '4' is the digit that joins. Its bar reaches the edge of its own box, so two
 * of them stand bar to bar with only the kerning between, and on the level-up
 * panel -- read at a floor of 40, because the HUD is dimmed to 72-79 there --
 * the antialiased skirt between "44" reads 40-49 and links them into one
 * 30-wide contour. That matches nothing, so every counter ending in 44 was
 * written empty.
 *
 * No digit is wider than 0.84 of its height, so a box wider than the row's
 * tallest glyph holds more than one. The cut goes at the column with the least
 * light above the region's floor, read off the crop rather than the mask: a
 * join is skirt sitting on the floor, where the thinnest column a real glyph
 * has -- the middle of a '0', two pixels -- is core, and counting mask pixels
 * would make those a tie. Only columns leaving a digit's width either side are
 * candidates; with none the box is left whole and fails as it always did,
 * rather than reading wrong. Each half is re-bounded to its own pixels, so it
 * is the box `findContours` would have returned without the join, and the
 * remainder is cut again if it is still too wide.
 */
function statsSplitJoined(img: NativeImage, region: StatsRegion, box: ContourBox, tallest: number): ContourBox[] {
  if (box.width <= tallest) {
    return [box];
  }
  const minW = Math.ceil(tallest * StatsDigitMinWidth);
  const first = minW;
  const last = Math.min(Math.floor(tallest * StatsDigitMaxWidth), box.width - 1 - minW);
  if (first > last) {
    return [box];
  }
  const points: Point[] = [];
  for (let y = 0; y < box.height; y++) {
    for (let x = 0; x < box.width; x++) {
      points.push({x: box.x + x, y: box.y + y});
    }
  }
  const pixels = getImageColors(img, points);
  // Per column: how far above the floor its in-range pixels sit, and whether
  // any pixel is in range at all (the mask, re-derived so no second read).
  const light: number[] = [];
  const inked: boolean[][] = [];
  for (let x = 0; x < box.width; x++) {
    light.push(0);
  }
  for (let y = 0; y < box.height; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < box.width; x++) {
      const p = pixels[y * box.width + x];
      const above = Math.min(p.r - region.lo[0], p.g - region.lo[1], p.b - region.lo[2]);
      const on = above >= 0 && p.r <= region.hi[0] && p.g <= region.hi[1] && p.b <= region.hi[2];
      row.push(on);
      if (on) {
        light[x] += above;
      }
    }
    inked.push(row);
  }
  let cut = first;
  for (let x = first + 1; x <= last; x++) {
    if (light[x] < light[cut]) {
      cut = x;
    }
  }
  // The join can be two columns wide; drop the whole run at the minimum.
  let cutEnd = cut;
  while (cutEnd < last && light[cutEnd + 1] === light[cut]) {
    cutEnd++;
  }
  const bound = function(x0: number, x1: number): ContourBox | null {
    let minX = box.width, maxX = -1, minY = box.height, maxY = -1, area = 0;
    for (let y = 0; y < box.height; y++) {
      for (let x = x0; x < x1; x++) {
        if (!inked[y][x]) {
          continue;
        }
        area++;
        if (x < minX) { minX = x; }
        if (x > maxX) { maxX = x; }
        if (y < minY) { minY = y; }
        if (y > maxY) { maxY = y; }
      }
    }
    return maxX < 0 ? null
      : {x: box.x + minX, y: box.y + minY, width: maxX - minX + 1, height: maxY - minY + 1, area: area};
  };
  const left = bound(0, cut);
  const right = bound(cutEnd + 1, box.width);
  logDebug(Log.Stats.JoinedGlyphsCut, {
    region: region.name,
    x: box.x,
    width: box.width,
    tallest: tallest,
    cutAt: cut,
    cutWidth: cutEnd - cut + 1,
    light: light[cut],
  });
  const parts: ContourBox[] = [];
  if (left !== null) {
    parts.push(left);
  }
  if (right !== null) {
    const rest = statsSplitJoined(img, region, right, tallest);
    for (let i = 0; i < rest.length; i++) {
      parts.push(rest[i]);
    }
  }
  return parts;
}

/** Best-matching digit for one normalised glyph, with how clear the win was. */
function statsMatchGlyph(rows: string[], aspect: number): {digit: string; score: number; margin: number} {
  let best = -1;
  let second = -1;
  let digit = '';
  for (const d in StatsDigits) {
    const template = StatsDigits[d];
    let same = 0;
    for (let y = 0; y < StatsGlyphH; y++) {
      const got = rows[y];
      const want = template[y];
      for (let x = 0; x < StatsGlyphW; x++) {
        if (got.charAt(x) === want.charAt(x)) {
          same++;
        }
      }
    }
    let score = same / (StatsGlyphW * StatsGlyphH);
    // Only penalise proportions that are clearly wrong: the digits other
    // than '1' sit within 0.07 of each other, which is inside the noise of
    // where the mask cuts an antialiased edge.
    const off = Math.abs(aspect - StatsDigitAspect[d]);
    if (off > 0.12) {
      score -= 0.35 * off;
    }
    if (score > best) {
      second = best;
      best = score;
      digit = d;
    } else if (score > second) {
      second = score;
    }
  }
  return {digit: digit, score: best, margin: best - second};
}

/**
 * Reads the number in one region, or null if any part of it is unclear.
 *
 * A region is expected to hold exactly one number: two of them is a rectangle
 * pointed at the wrong thing, and concatenating their digits would record a
 * figure no screen ever showed. `readStatsNumbers` is the caller for a region
 * that may legitimately hold more.
 */
Tsum.prototype.readStatsNumber = function(region) {
  const fields = this.readStatsNumbers(region);
  return fields !== null && fields.length === 1 ? fields[0] : null;
};

/**
 * Reads every number in one region, left to right, or null if any part of it is
 * unclear.
 *
 * Glyphs are grouped into numbers by the gaps between them
 * (`StatsFieldGapHeights`), which is what lets one rectangle cover a row whose
 * contents change shape: the level-up HUD draws coins alone, or medals and then
 * coins, and this answers `[coins]` or `[medals, coins]` without being told
 * which. An empty region is null rather than `[]` -- "nothing there" and "there
 * but unreadable" are both a gap in the CSV, and no caller wants to tell them
 * apart.
 */
Tsum.prototype.readStatsNumbers = function(region) {
  const origin = this.toRealXY(region.x, region.y);
  const w = Math.floor(region.w * this.captureGameRatio);
  const h = Math.floor(region.h * this.captureGameRatio);
  if (w < 16 || h < 8) {
    return null;
  }
  // Bring the crop back to the 540-wide space the templates were measured in,
  // but never enlarge it: on a 540-wide screen the capture is already there.
  let outW = Math.floor(region.w / 2);
  let outH = Math.floor(region.h / 2);
  if (outW >= w) {
    outW = 0;
    outH = 0;
  }
  const img = getScreenshotModify(origin.x, origin.y, w, h, outW, outH, 100);
  if (!statsImageOk(img)) {
    return null;
  }
  let mask: NativeImage | null = null;
  try {
    // inRange takes its bounds per BGRA channel, so the region's r/g/b
    // arrays go in reversed.
    const masked = inRange(img,
      region.lo[2], region.lo[1], region.lo[0], 0,
      region.hi[2], region.hi[1], region.hi[0], 255);
    if (!statsImageOk(masked)) {
      return null;
    }
    mask = masked;
    const boxes = findContours(mask, 2, 0);
    if (boxes.length === 0) {
      return null;
    }
    boxes.sort(function(a, b) { return a.x - b.x; });
    let tallest = 0;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].height > tallest) {
        tallest = boxes[i].height;
      }
    }
    // One box per glyph: separators and speckle out, and a contour the mask
    // joined across two glyphs cut back into them.
    const glyphs: ContourBox[] = [];
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (box.height < tallest * StatsSeparatorHeight || box.width < 2) {
        continue;  // thousands separator, or speckle the mask let through
      }
      const parts = statsSplitJoined(img, region, box, tallest);
      for (let j = 0; j < parts.length; j++) {
        glyphs.push(parts[j]);
      }
    }
    const fields: number[] = [];
    const gap = tallest * StatsFieldGapHeights;
    let digits = '';
    let read = 0;
    // Right edge of the last glyph taken, so the gap that starts a new number is
    // measured digit to digit -- a thousands separator is dropped before it
    // counts, and the gap either side of one is small anyway.
    let prevRight = -1;
    for (let i = 0; i < glyphs.length; i++) {
      const box = glyphs[i];
      if (read >= StatsMaxDigits) {
        logDebug(Log.Stats.TooManyGlyphs,
          { region: region.name, digits: read, maxDigits: StatsMaxDigits });
        return null;
      }
      const rows = statsGlyphBitmap(mask, box);
      if (rows === null) {
        return null;
      }
      const match = statsMatchGlyph(rows, box.width / box.height);
      if (match.score < StatsMinGlyphScore || match.margin < StatsMinGlyphMargin) {
        logDebug(Log.Stats.UnreadableGlyph, {
          region: region.name,
          x: box.x,
          bestDigit: match.digit,
          score: +match.score.toFixed(2),
          margin: +match.margin.toFixed(2),
          minScore: StatsMinGlyphScore,
          minMargin: StatsMinGlyphMargin,
        });
        return null;
      }
      if (digits !== '' && box.x - prevRight > gap) {
        fields.push(parseInt(digits, 10));
        digits = '';
      }
      digits += match.digit;
      read++;
      prevRight = box.x + box.width;
    }
    if (digits !== '') {
      fields.push(parseInt(digits, 10));
    }
    for (let i = 0; i < fields.length; i++) {
      if (isNaN(fields[i])) {
        return null;
      }
    }
    return fields.length > 0 ? fields : null;
  } catch (e) {
    logDebug(Log.Stats.ReadFailed, { region: region.name, errorText: String(e) });
    return null;
  } finally {
    if (mask != null) {
      releaseImage(mask);
    }
    releaseImage(img);
  }
};

/**
 * Is the score page's button row up?
 *
 * Which is the game's own signal that the page has finished animating: it
 * counts the score and the coins up from zero on arrival and withholds the row
 * until that is done. Reading before then measures a frame of the count, and the
 * numbers on it are real enough to pass every check the digit matcher makes --
 * they are simply not the round's.
 *
 * Read off the Close button alone, where the ordinary row and the point-battle
 * one overlap (`ScorePageButtons`, src/data.ts). The point battle's tally has no
 * Play, and asking for one is what left those rounds unread.
 *
 * This is the *only* check that the count-up is over: `Page.ScorePage` used to
 * carry a pair of button probes among its five and no longer does, because
 * requiring them to name the page meant a tally still counting up was `unknown`
 * rather than "here, not finished". So it is load-bearing -- drop it and these
 * fields start filling with mid-animation numbers, and nothing about them would
 * look wrong. Read on a fresh frame immediately before the numbers, rather than
 * on whichever frame the sweep happened to capture.
 *
 * Scored through `PageRouter.score`, the same way a `Page` entry is, so "the
 * buttons are there" cannot come to mean two things. `pass` needs both probes.
 *
 * Takes the frame rather than capturing one, because the caller asks it and
 * `statsScoreMedalsShown` about the same frame -- two questions, one capture,
 * and no chance of the tally changing between them.
 */
function statsScoreButtonsReady(ts: Tsum, img: NativeImage): boolean {
  return gPages.score(ts, img, 'ScorePage.buttons', StatsScoreButtons).pass;
}

/**
 * Is this tally drawing a medals row?
 *
 * Which of the two ScorePage layouts is up, and so which rectangles hold the
 * coin figure and the medal count. Asked once a round, on the frame that said
 * the count-up had finished -- by then the page is fully drawn, so there is no
 * half-faded frame for this to be wrong about.
 *
 * Scored against `ScorePageMedalRow`, the same two pixels `Page.ScorePageMedals`
 * fingerprints the layout with. The alternative -- reading the medal rectangle
 * and taking a number as proof -- cannot tell "no medals row" from "the medal
 * row would not read", and getting that backwards puts the coin rectangle on the
 * wrong row.
 */
function statsScoreMedalsShown(ts: Tsum, img: NativeImage): boolean {
  return gPages.score(ts, img, 'ScorePage.medals', StatsScoreMedalRow).pass;
}

/**
 * Is this tally drawing Play, beside Close?
 *
 * The third question about the same button row, and the only one asked by
 * something other than the stats read: `nav.move.tallyToGame` presses Play to
 * open the next round from here rather than from the hub, and a round played in
 * a point battle ends on a tally that draws one centred Close and no Play at
 * all. `ScorePagePlay` (data.ts) is two pixels on the button's own face, 160px
 * clear of where that layout's Close ends.
 *
 * Here rather than in pageHandlers.ts because this row already has two readers
 * in this file, and the reason the probes are declared together in data.ts is
 * the reason to keep the readings together too.
 *
 * Pass a frame to read one already taken; the navigation band does not, because
 * the router releases its own before the queue runs.
 */
Tsum.prototype.tallyPlayShown = function(img) {
  const own = img === undefined;
  const frame = own ? this.screenshot() : img;
  try {
    return gPages.score(this, frame, 'ScorePage.play', StatsScorePlay).pass;
  } finally {
    if (own) {
      releaseImage(frame);
    }
  }
};

/** `ScorePageButtons` as an entry `PageRouter.score` will take. */
const StatsScoreButtons: PageDef = {
  name: PageName.ScorePage,
  colors: ScorePageButtons,
  back: Page.ScorePage.back,
  next: Page.ScorePage.next
};

/** `ScorePageMedalRow` as an entry `PageRouter.score` will take. */
const StatsScoreMedalRow: PageDef = {
  name: PageName.ScorePage,
  colors: ScorePageMedalRow,
  back: Page.ScorePage.back,
  next: Page.ScorePage.next
};

/** `ScorePagePlay` as an entry `PageRouter.score` will take. */
const StatsScorePlay: PageDef = {
  name: PageName.ScorePage,
  colors: ScorePagePlay,
  back: Page.ScorePage.back,
  next: Page.ScorePage.next
};

/**
 * Read a number until the same value comes back twice.
 *
 * A second line of defence rather than the count-up handler it started as --
 * `waitForScorePage` no longer reports the page until its buttons say the
 * count-up is over. What is left for this to catch is a one-off misread, and on
 * a settled number it costs one extra read and one sleep.
 *
 * The two agreeing reads do not have to be consecutive, and a failed read
 * discards nothing. The tally glitters for as long as it is up, and a sparkle
 * drifting through the rectangle fails that one read whole -- it clears the
 * digit mask, lands as one more contour, and the glyph it deforms misses the
 * templates. Requiring agreement in a row made every such frame restart the
 * confirmation, which could spend the entire window over a number sitting
 * there readable between sparkles, and then write the field empty. The buttons
 * gate has already said the count-up is over by the time this runs, so a value
 * seen twice around an obscured frame is the same evidence as twice in a row.
 *
 * Giving up takes `StatsSettleMissLimit` looks when nothing has ever read and
 * the full window otherwise -- the first means the rectangle is wrong and more
 * looking will not fix it, the second that a real value is still one clean
 * frame from confirmation.
 */
Tsum.prototype.readSettledStatsNumber = function(region) {
  const deadline = Date.now() + StatsSettleMs;
  // How often each distinct value has come back. Kept per value rather than as
  // "the previous read" so that neither a failed read nor a one-off misread
  // takes away the sighting the real number already has.
  const seen: {[value: number]: number} = {};
  let reads = 0;
  let misses = 0;
  while (this.isRunning) {
    const value = this.readStatsNumber(region);
    if (value !== null) {
      reads++;
      seen[value] = (seen[value] || 0) + 1;
      if (seen[value] >= 2) {
        return value;
      }
    } else {
      misses++;
      if (reads === 0 && misses >= StatsSettleMissLimit) {
        logWarn(Log.Stats.NeverRead, 'A stats number would not read at all; leaving it blank',
          { region: region.name, looks: misses });
        return null;
      }
    }
    if (Date.now() > deadline) {
      // `values` says which failure this was: empty means every read missed,
      // one entry means the number read but never twice, two or more means the
      // reads disagreed -- and those want three different fixes.
      logWarn(Log.Stats.NeverSettled, 'A stats number never settled; leaving it blank',
        { region: region.name, reads: reads, misses: misses, values: seen });
      return null;
    }
    this.sleep(350);
  }
  return null;
};

// ---------------------------------------------------------------------------
// Which tsum is playing
//
// The CSV's most confounded comparison was "these rounds earned more" with
// nothing saying which tsum earned them -- `skill_type` is the setting the user
// chose, and several tsums share one. So the pre-round screen is read for the
// thumbnail in its lower-right button, and that is matched against the library
// in `src/tsums.dat`.
//
// That library is not photographed, it is reconstructed: the development
// tools' lexicon draws each tsum's own sprite into the game's own blank button at the transform the
// game uses, so a library signature and the icon on screen are the same
// picture. Which is why the thresholds beside it can be as tight as they are.
//
// Same shape as the digit reader above, for the same reason: crop, shrink,
// sample once, compare against templates, and require the winner to be both
// good and clearly ahead. A tsum that matches nothing well enough is written as
// an empty cell -- guessing which tsum played a round would poison exactly the
// comparison the column exists for.
// ---------------------------------------------------------------------------

/**
 * The signature's cells, as sample points inside a `grid` x `grid` image.
 *
 * Built once at load for the same reason `StatsGlyphPoints` is: every portrait
 * is read at exactly this size, so one batched `getImageColors` replaces ~200
 * engine crossings. The masked cells are simply absent from the list, which is
 * what keeps a template and a query the same length without either side having
 * to know why a cell was dropped.
 */
const MyTsumPoints: Point[] = (function() {
  const n = MyTsumPortrait.grid;
  const bottom = Math.round(n * MyTsumPortrait.maskBottom);
  const pts: Point[] = [];
  for (let y = 0; y < n - bottom; y++) {
    for (let x = 0; x < n; x++) {
      // Outside the ellipse is not the tsum on either side -- it is the orange
      // button on the icon and the blue panel on the portrait. Comparing those
      // compares the game's furniture to itself, and it was costing more than
      // everything else here put together.
      const dx = (x + 0.5) / n - 0.5;
      const dy = (y + 0.5) / n - 0.5;
      if (Math.sqrt(dx * dx + dy * dy) > MyTsumPortrait.maskRadius) {
        continue;
      }
      pts.push({x: x, y: y});
    }
  }
  return pts;
})();

/** How many channel values a well-formed signature decodes to. */
const MyTsumChannels = MyTsumPoints.length * 3;

/** Code point to 6-bit value; -1 for anything outside the base64 alphabet. */
const MyTsumBase64: number[] = (function() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const table: number[] = [];
  for (let i = 0; i < 128; i++) {
    table.push(-1);
  }
  for (let i = 0; i < alphabet.length; i++) {
    table[alphabet.charCodeAt(i)] = i;
  }
  return table;
})();

/**
 * A packed signature back to `[17, 170, 34, ...]`: base64 to six-bit groups to
 * four-bit channels, in `MyTsumPoints` order, scaled back to the 0-255 the
 * query side samples at.
 *
 * Sixteen levels per channel rather than 256. The library covers 769 tsums, and
 * at a byte a channel it was the largest file in the tree by a distance;
 * halving it was measured, not assumed -- across every tsum under pixel shift,
 * 1080p resampling, gamma and JPEG, coarse and fine agreed on every match that
 * cleared the thresholds. What quantising costs is margin on the art twins
 * (`flynn`/`flynn2`), and those are rejected either way.
 *
 * Those four-bit channels are then packed two to a byte and base64'd, which is
 * another third off the file and nothing off the match -- the values that come
 * out here are the same ones a hex library held, character for character.
 *
 * Null rather than a short array for a character outside the alphabet or a
 * signature too short for this build's grid: both mean the row was not written
 * for this build, and a partial vector would score against everything.
 */
function myTsumDecode(packed: string): number[] | null {
  const out: number[] = [];
  let bits = 0;
  let held = 0;
  for (let i = 0; i < packed.length; i++) {
    const code = packed.charCodeAt(i);
    const value = code < 128 ? MyTsumBase64[code] : -1;
    if (value < 0) {
      return null;
    }
    // Six in, four out: `held` is never more than 8, so a byte of window is
    // all this needs and the trailing bits of an odd signature fall off the
    // end rather than becoming a channel.
    bits = ((bits << 6) | value) & 0xff;
    held += 6;
    while (held >= 4) {
      held -= 4;
      out.push(((bits >> held) & 15) * 17);
    }
  }
  if (out.length < MyTsumChannels) {
    return null;
  }
  out.length = MyTsumChannels;
  return out;
}

/**
 * A row's board colour: six hex characters, HSV, one byte a channel.
 *
 * Held in a `Color` the way every other colour off an HSV image is -- `b` is
 * the hue, `g` the saturation, `r` the value. Confusing read cold, but it is
 * what `getImageColor` hands back after `convertColor(img, 40)`, so a board
 * cluster and this can be compared without either being converted first.
 *
 * Null for anything that is not exactly six hex characters, which lands the
 * tsum on the button sample rather than on a colour read out of a bad row.
 */
function myTsumDecodeColor(hex: string): Color | null {
  if (hex.length !== 6) {
    return null;
  }
  const v: number[] = [];
  for (let i = 0; i < 6; i += 2) {
    const byte = parseInt(hex.substring(i, i + 2), 16);
    // parseInt('0x', 16) is NaN, and NaN in a colour propagates silently
    // through distance3D as "never nearest" rather than as an error.
    if (!(byte >= 0 && byte <= 255)) {
      return null;
    }
    v.push(byte);
  }
  return { b: v[0], g: v[1], r: v[2] };
}

/**
 * What `short` looks like on the board, or null if the library cannot say.
 *
 * The reference "Link MyTsum first" picks a colour cluster against. Null for
 * an unnamed tsum (`identifyMyTsum` leaves `ts.myTsum` empty when it is not
 * confident), for a library too old to carry the column, and for one whose
 * derivation does not match this build -- all three meaning "sample the button
 * instead", which is what the feature did for every tsum before this.
 */
function myTsumBoardColor(short: string): Color | null {
  if (short === '') {
    return null;
  }
  const lib = myTsumLibrary();
  for (let i = 0; i < lib.length; i++) {
    if (lib[i].short === short) {
      return lib[i].board;
    }
  }
  return null;
}

/** The decoded library, built on first use. Empty when there is none to load. */
var myTsumLibraryCache: MyTsumEntry[] | null = null;
/** How many distinct tsums that library holds, for the logs. */
var myTsumLibraryTsums = 0;

/**
 * The library file, read and decoded once, on the first round that asks.
 *
 * It ships beside the bundle rather than inside it -- see the header of
 * `src/tsums.dat`. Two thirds of `index.js` used to be this table, and none of
 * it is needed until a pre-round screen is up, so it is read lazily and the
 * cache holds whatever came back. An empty result is cached too: a device with
 * no library file should cost one failed read per run, not one per round.
 *
 * Every way this can fail ends in the same place -- an empty library, which
 * `selectedTsum` turns into "no tsum was identified" and the CSV into an empty
 * cell. Each says which failure it was exactly once, because the alternative
 * symptom is a column that quietly stops filling.
 */
function myTsumLoadLibrary(): MyTsumEntry[] {
  const empty: MyTsumEntry[] = [];
  // Defined by the host per load, so it exists whenever a script is running.
  // Guarded anyway: without it there is no path to try, and an offline harness
  // that evaluates the bundle is exactly the caller that will not have it.
  if (typeof getScriptPath !== 'function') {
    logWarn(Log.Tsums.NoLibrary, { reason: 'no script path' });
    return empty;
  }
  const path = getScriptPath() + '/' + MyTsumPortrait.library;
  // readFile answers '' for both a missing file and an unreadable one, and
  // neither is worth telling apart here: the fix is the same.
  const text = readFile(path);
  if (text === '') {
    logWarn(Log.Tsums.NoLibrary, { reason: 'unreadable', file: path });
    return empty;
  }

  const lines = text.split('\n');
  const lib: MyTsumEntry[] = [];
  let header = false;
  let stale = 0;
  // Whether this file's board colours were derived the way `MyTsumBoard`
  // expects. Versioned apart from the signatures because the two fail
  // differently: a stale signature names no tsum, a stale colour picks the
  // wrong chains. So a mismatch drops the fourth column and keeps the rest.
  let boardOk = false;
  for (let i = 0; i < lines.length; i++) {
    // The trailing \r a file that has been through a Windows tool carries.
    // It would otherwise land on the end of a signature and reject the row.
    let line = lines[i];
    if (line.charAt(line.length - 1) === '\r') {
      line = line.substring(0, line.length - 1);
    }
    if (line === '' || line.charAt(0) === '#') {
      continue;
    }
    if (!header) {
      // The first line that is not a comment states what the file is and what
      // grid it was cut through. A library from another build scores against
      // the wrong cells, so it is refused whole rather than row by row.
      header = true;
      const fields = line.split(' ');
      if (fields[0] !== MyTsumPortrait.magic || fields[1] !== MyTsumPortrait.format) {
        logWarn(Log.Tsums.StaleTemplate, { file: path, header: line });
        return empty;
      }
      let cells = -1;
      for (let f = 2; f < fields.length; f++) {
        if (fields[f].substring(0, 6) === 'cells=') {
          cells = parseInt(fields[f].substring(6), 10);
        }
        if (fields[f].substring(0, 6) === 'board=') {
          boardOk = fields[f].substring(6) === MyTsumBoard.tag;
        }
      }
      if (cells !== MyTsumPoints.length) {
        logWarn(Log.Tsums.StaleTemplate,
          { file: path, cells: cells, expected: MyTsumPoints.length });
        return empty;
      }
      if (!boardOk) {
        logWarn(Log.Tsums.NoBoardColors, { file: path, expected: MyTsumBoard.tag });
      }
      continue;
    }
    // Three fields before the board colour was added, four after. Read
    // leniently in both directions: a row with no colour is a tsum that falls
    // back to sampling the button, not a row worth throwing away.
    const parts = line.split('\t');
    const sig = parts.length >= 3 ? myTsumDecode(parts[2]) : null;
    if (sig === null) {
      stale++;
      continue;
    }
    // Prepared once, at load: a template's vector never changes, and doing it
    // here is what makes a round's match one dot product per entry.
    lib.push({
      short: parts[0], full: parts[1], vec: myTsumPrepare(sig),
      board: boardOk && parts.length >= 4 ? myTsumDecodeColor(parts[3]) : null,
    });
  }
  if (stale > 0) {
    logWarn(Log.Tsums.StaleTemplate, { file: path, ignored: stale, kept: lib.length });
  }
  if (lib.length === 0) {
    logWarn(Log.Tsums.NoLibrary, { reason: 'no usable rows', file: path });
  } else {
    logDebug(Log.Tsums.LibraryLoaded, { file: path, tsums: lib.length });
  }
  return lib;
}

/**
 * The library, loaded on first use.
 *
 * One entry per tsum: the library is rendered from a single sprite each, so
 * there is one way a tsum can look and no need for alternates.
 */
function myTsumLibrary(): MyTsumEntry[] {
  if (myTsumLibraryCache !== null) {
    return myTsumLibraryCache;
  }
  const lib = myTsumLoadLibrary();
  myTsumLibraryCache = lib;
  myTsumLibraryTsums = lib.length;
  return lib;
}

/**
 * A signature, prepared so that comparing two of them is a dot product.
 *
 * Three things happen here, and all three were measured against a 312-portrait
 * library rather than assumed.
 *
 * **Opponent-colour axes.** RGB is rewritten as brightness, red-vs-green and
 * yellow-vs-blue. Straight RGB is three correlated copies of mostly the same
 * picture, so shape dominates and colour barely registers -- and the tsums that
 * are hard to tell apart are precisely the ones that differ *only* in colour.
 * Chip and Dale are the same drawing with a black nose or a red one. Splitting
 * the axes gives that difference a third of the weight instead of a sliver, and
 * took the collection's separable share from 270/312 to 291/312.
 *
 * **Centring, per axis.** Correlation about each axis's own mean, which is what
 * OpenCV calls TM_CCOEFF_NORMED and what the host's `findImage` uses. Without
 * it the shared background and palette dominate: plain absolute difference
 * scored the right tsum 0.92, the best wrong one 0.78, and two *different*
 * library entries 0.82. Centred, the same right answer sits at 0.93 and the
 * best wrong one at 0.20.
 *
 * **Unit length.** Which is what makes the comparison a bare dot product with
 * no per-pair normalisation, so a round costs one pass over the library.
 */
function myTsumPrepare(sig: number[]): number[] {
  const v: number[] = [];
  for (let i = 0; i + 2 < sig.length; i += 3) {
    const r = sig[i];
    const g = sig[i + 1];
    const b = sig[i + 2];
    v.push((r + g + b) / 3, r - g, (r + g) / 2 - b);
  }
  for (let axis = 0; axis < 3; axis++) {
    let mean = 0;
    let n = 0;
    for (let i = axis; i < v.length; i += 3) {
      mean += v[i];
      n++;
    }
    mean /= n;
    for (let i = axis; i < v.length; i += 3) {
      v[i] -= mean;
    }
  }
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i] * v[i];
  }
  const norm = Math.sqrt(sum);
  if (norm > 0) {
    for (let i = 0; i < v.length; i++) {
      v[i] /= norm;
    }
  }
  // A flat crop -- a blank rect, or a capture that came back one colour -- has
  // no variance to correlate against, and is left as zeroes so it scores 0
  // against everything rather than matching whatever it is compared with.
  return v;
}

/** How alike two prepared signatures are, from -1 to 1. */
function myTsumSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length && i < b.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

/**
 * The closest library entry to one signature.
 *
 * With a single entry there is no runner-up and `margin` is the score itself:
 * nothing to beat is not the same as a tie.
 */
function myTsumMatch(sig: number[]): MyTsumMatch | null {
  const lib = myTsumLibrary();
  const vec = myTsumPrepare(sig);
  let best = -2;
  let second = -2;
  let winner = -1;
  for (let i = 0; i < lib.length; i++) {
    const score = myTsumSimilarity(vec, lib[i].vec);
    if (score > best) {
      second = best;
      best = score;
      winner = i;
    } else if (score > second) {
      second = score;
    }
  }
  if (winner < 0) {
    return null;
  }
  return {
    short: lib[winner].short,
    full: lib[winner].full,
    score: best,
    // -2 is the sentinel: correlation cannot leave [-1, 1], so anything below
    // that means no second entry was scored at all.
    margin: second < -1 ? best : best - second
  };
}

Tsum.prototype.myTsumSignature = function(rect) {
  const from = this.toRealXY(rect.from.x, rect.from.y);
  const to = this.toRealXY(rect.to.x, rect.to.y);
  const w = to.x - from.x;
  const h = to.y - from.y;
  const n = MyTsumPortrait.grid;
  if (w < n || h < n) {
    return null;
  }
  // Native resolution, no JPEG: outW/outH of 0 means "do not resize", and the
  // matcher's own capture is 360px wide, which leaves this rect about 41px
  // across -- under three pixels per cell, and the artwork gone with them.
  let cur = getScreenshotModify(from.x, from.y, w, h, 0, 0, 100);
  if (!statsImageOk(cur)) {
    return null;
  }
  try {
    // The halving loop from statsGlyphBitmap, and for the same reason:
    // resizeImage is INTER_LINEAR, so it samples rather than averages, and one
    // jump from 300px to 16 would read 256 lone pixels instead of 256 averages.
    while (true) {
      const size = getImageSize(cur);
      if (size.width <= n * 2 && size.height <= n * 2) {
        break;
      }
      const nw = Math.max(n, Math.ceil(size.width / 2));
      const nh = Math.max(n, Math.ceil(size.height / 2));
      if (nw === size.width && nh === size.height) {
        break;
      }
      const half = resizeImage(cur, nw, nh);
      if (!statsImageOk(half)) {
        return null;
      }
      releaseImage(cur);
      cur = half;
    }
    const small = resizeImage(cur, n, n);
    if (!statsImageOk(small)) {
      return null;
    }
    releaseImage(cur);
    cur = small;
    const samples = getImageColors(cur, MyTsumPoints);
    const sig: number[] = [];
    for (let i = 0; i < samples.length; i++) {
      sig.push(samples[i].r, samples[i].g, samples[i].b);
    }
    return sig;
  } catch (e) {
    logDebug(Log.Tsums.ReadFailed, { errorText: String(e) });
    return null;
  } finally {
    releaseImage(cur);
  }
};

/**
 * Which tsum is selected in game right now, read off the pre-round screen's
 * lower-right button icon.
 *
 * The question anything may ask; `identifyMyTsum` is the stats path's use of
 * it. Every call takes a capture and rescores the library, so it answers about
 * the screen as it is rather than about a remembered reading, and it is
 * deliberately ungated -- the caller decides whether that capture is worth it.
 *
 * A match below the thresholds is returned with `confident` false rather than
 * dropped: which tsum nearly won, and by how little, is the whole diagnosis
 * when a template needs recutting. Null is the other thing entirely -- there
 * was nothing to score, because the icon could not be read or this release
 * carries no library.
 */
Tsum.prototype.selectedTsum = function() {
  // Before the capture, not after it: with no library there is nothing to score
  // the icon against, and reading one costs a screenshot and a resize chain on
  // every pre-round screen. myTsumLibrary() has already said why, once.
  if (myTsumLibrary().length === 0) {
    return null;
  }
  const sig = this.myTsumSignature(MyTsumPortrait.icon);
  if (sig === null) {
    logWarn(Log.Tsums.Unreadable, 'Could not read the pre-round tsum icon');
    return null;
  }
  const match = myTsumMatch(sig);
  if (match === null) {
    return null;
  }
  return {
    short: match.short,
    full: match.full,
    score: match.score,
    margin: match.margin,
    confident: match.score >= MyTsumPortrait.minScore
      && match.margin >= MyTsumPortrait.minMargin
  };
};

/**
 * Read the pre-round button icon and remember which tsum it is.
 *
 * Called from `record.myTsum` on the pre-round screen, before anything taps it.
 * Ungated: the CSV was the only reader when it was gated on the stats setting,
 * and the floating banner is now a second one -- which tsum is about to be
 * played is worth a line on screen whether or not the round is being recorded.
 * `selectedTsum` costs a capture, once per arrival on that screen.
 */
Tsum.prototype.identifyMyTsum = function() {
  const selected = this.selectedTsum();
  // The CSV carries the short name, and only when the match cleared both
  // thresholds: an empty cell is honest, a coin flip between two lookalikes is
  // not. selectedTsum() has already said why on the null path.
  this.myTsum = selected !== null && selected.confident ? selected.short : '';
  if (selected === null) {
    return;
  }
  // One record either way, carrying the runner-up gap. Which tsum nearly won,
  // and by how little, is what a recut is decided on, and nothing else can
  // supply it after the fact.
  if (selected.confident) {
    logInfo(Log.Tsums.Identified, {
      tsum: selected.short,
      name: selected.full,
      score: +selected.score.toFixed(3),
      margin: +selected.margin.toFixed(3),
    });
    // On the banner for the round it belongs to, not for a fixed few seconds:
    // one showing, and the next pre-round screen replaces it. The catalogue
    // sentence is reused so the strip is in the run's language, like the log.
    this.banner('Tsum: ' + selected.full);
  } else {
    logWarn(Log.Tsums.Unidentified,
      'No tsum in the library matched the pre-round icon well enough; leaving the column empty', {
      best: selected.short,
      score: +selected.score.toFixed(3),
      margin: +selected.margin.toFixed(3),
      minScore: MyTsumPortrait.minScore,
      minMargin: MyTsumPortrait.minMargin,
      signatures: myTsumLibrary().length,
      library: myTsumLibraryTsums,
    });
  }
};

/**
 * The settings a round is played under, frozen at the moment it starts.
 *
 * Shallow, because every field is a string, number or boolean. It exists
 * because `ts.settings` is live: the Quick Bar writes changes onto it mid-run,
 * so a row that read it when the row was written would describe the settings in
 * force *after* the round rather than during it -- a bonus item switched off
 * between the tally and the next round would be recorded as never having been
 * on. Taking the copy at the whistle puts a change on the first row of the
 * round that was actually played that way.
 */
function statsSettingsSnapshot(settings: Settings | undefined): Settings | undefined {
  if (!settings) {
    return undefined;
  }
  const from = settings as unknown as {[key: string]: unknown};
  const copy: {[key: string]: unknown} = {};
  const keys = Object.keys(from);
  for (let i = 0; i < keys.length; i++) {
    copy[keys[i]] = from[keys[i]];
  }
  return copy as unknown as Settings;
}

Tsum.prototype.beginRoundStats = function() {
  this.roundStartedAt = Date.now();
  this.roundEndedAt = 0;
  // The round's own id, minted at the whistle rather than at the CSV write:
  // every `round.*` event carries it, and a consumer that several emulators dial
  // into has nothing else to join one round's events on -- the round number is
  // per device and repeats across them. The row inherits it, so an event and the
  // row it turns into are the same round. See "Row identity" below.
  //
  // Unconditional, like the events it is for: `trackRoundStats` decides whether
  // a row is written, never whether a round can be followed. The one cost is
  // `statsDeviceTag`'s probes on the first round of a run, and they are cached.
  this.roundUid = statsRowId(new Date(this.roundStartedAt), statsDeviceTag(this.storagePath));
  this.roundSettings = statsSettingsSnapshot(this.settings);
  this.roundBaseCoins = -1;
  this.roundMedalsRow = false;
  this.baseCoinReads = 0;
  this.baseCoinHits = 0;
};

/**
 * Reads the in-game coin counter off the level-up screen, where `record.baseCoins`
 * is the only thing that calls it.
 *
 * That screen is the whole point. Coins carry on being paid out after the round
 * timer stops -- the end-of-round clear awards whatever is still on the board,
 * and that is a large part of the total -- so the counter only holds the round's
 * figure once the payout is over, and the level-up panel is the first screen
 * that is certainly after it. Sampling during play recorded whatever the counter
 * happened to hold mid-round, which is much too low; sampling across the
 * unrecognised frames between the board and the score page, which is what this
 * did before, straddled the payout and so caught the counter wherever it had got
 * to when a frame happened to be readable.
 *
 * The frame is taken here rather than handed down from the detection: the
 * matcher works off a third-size JPEG, which no digit survives. This is a fresh
 * full-quality crop of the counter row alone, and the screen it is cropped from
 * is the one the detection just named -- the level-up panel stands for seconds.
 *
 * The counter only climbs within a round, so the highest confident read wins.
 * There is deliberately no ceiling on how far it may jump between reads: a
 * fever payout routinely more than doubles a small total in one step, and an
 * earlier version that rejected such jumps as implausible would latch onto the
 * value held when the first big chain landed and refuse everything after it.
 */
Tsum.prototype.sampleBaseCoins = function() {
  if (!this.trackRoundStats || !this.roundStartedAt) {
    return;
  }
  this.baseCoinReads++;
  // The whole counter row, because a game carrying medals draws a medal count
  // to the left of the coins. Coins are the last field either way; the medal
  // count is read only to know where they end up, since the tally the round
  // finishes on is where `medals` is measured.
  const fields = this.readStatsNumbers(StatsRegions.baseCounters);
  const value = fields === null ? null : fields[fields.length - 1];
  if (value === null || value < 0) {
    // The frame worth keeping for a coin figure that will not read is this one,
    // not the score page the round ends on -- so it is saved here rather than
    // with the other two fields in finishRoundStats. Reads only ever climb, so
    // testing for equality is also what makes this once per round.
    if (this.baseCoinHits === 0 && this.baseCoinReads === StatsBaseCoinShotAfter) {
      this.saveStatsDebugShot('base');
    }
    return;
  }
  this.baseCoinHits++;
  if (value > this.roundBaseCoins) {
    this.roundBaseCoins = value;
  }
};

/** `{unknown: 12, TsumLevelUp: 4}` as `unknown x12, TsumLevelUp x4`, commonest first. */
function statsPageTally(seen: {[page: string]: number}): string {
  const names: string[] = [];
  for (const page in seen) {
    names.push(page);
  }
  names.sort(function(a, b) { return seen[b] - seen[a]; });
  const parts: string[] = [];
  for (let i = 0; i < names.length; i++) {
    parts.push(names[i] + ' x' + seen[names[i]]);
  }
  return parts.length === 0 ? 'nothing' : parts.join(', ');
}

/**
 * Poll until the score page is up *and* done animating, or the budget runs out.
 *
 * Both conditions, because the page arrives counting its numbers up from zero
 * and only puts its buttons out when that finishes -- so "the score page is on
 * screen" is not yet "the score page is showing the round's score".
 *
 * One window at a time rather than one budget for the lot. Arriving and counting
 * up are two waits for two different things, and a round whose post-round panels
 * ran long used to hand the count-up whatever the arrival had left -- often
 * nothing. `StatsScorePageMaxWaitMs` is what bounds the renewals.
 *
 * This is a *wait*, not a navigation: its looks carry no goal, so the
 * navigate band is silent and the only handlers that can clear the screen are
 * the guard and dismiss bands. That is deliberate -- `nav.move.unknown` taps
 * blind, and on this screen a blind tap can land on Play and start another
 * round -- but it does mean anything standing in front of the tally has to have
 * a dismiss handler of its own, or this loop just watches it until the budget
 * runs out. The failure log below is what says which screen that was.
 *
 * The one thing tapped blind is an unreadable screen *after* the tally has been
 * seen -- something standing in front of a tally that already arrived. That is
 * an event's result overlay, drawn in the event's own colours, so there is no
 * fingerprint to keep current from one event to the next; what holds is that
 * every one so far advances on any tap. `StatsUnknownTapSpot` is inert on the
 * tally and on the panels that share its moment, and the window is renewed
 * while the tapping goes on, since the loop is then acting rather than
 * watching; `StatsScorePageMaxWaitMs` bounds it as before.
 *
 * The polling also drives `record.baseCoins`, which reads the coin counter off
 * the level-up panel this loop passes through on the way.
 */
Tsum.prototype.waitForScorePage = function() {
  const startedAt = Date.now();
  const hardDeadline = startedAt + StatsScorePageMaxWaitMs;
  let deadline = startedAt + StatsScorePageWaitMs;
  // What the wait actually looked at. An empty score column is otherwise
  // indistinguishable between "the tally never came", "something was parked in
  // front of it" and "it came but never finished counting up", and those want
  // three different fixes.
  let sawTally = false;
  // The blind taps: when the last went out, and how many, for the record.
  let lastTapAt = 0;
  let taps = 0;
  const seen: {[page: string]: number} = {};
  while (this.isRunning && Date.now() < deadline && Date.now() < hardDeadline) {
    const page = gPages.detect(1, 600);
    seen[page] = (seen[page] || 0) + 1;
    if (page === PageName.ScorePage) {
      if (!sawTally) {
        sawTally = true;
        // Arrived, so whatever the arrival cost is spent and the count-up starts
        // its own window here. Set once, not on every look: renewing it while
        // the tally is up would turn "the buttons never came" into the full
        // `StatsScorePageMaxWaitMs`, and that failure is worth reporting early.
        deadline = Date.now() + StatsScorePageWaitMs;
      }
      // One capture, two questions: has the count-up finished, and is this the
      // layout with a medals row in it. The second only means anything once the
      // first is true, which is why it is answered here and not on every look.
      const img = this.screenshot();
      try {
        if (statsScoreButtonsReady(this, img)) {
          this.roundMedalsRow = statsScoreMedalsShown(this, img);
          return true;
        }
      } finally {
        releaseImage(img);
      }
    } else if (preTallyPages().indexOf(page) !== -1) {
      // The game is still working through the end of the round, so the tally is
      // not late -- it is not due yet. The dismiss band cleared whichever of
      // these takes a tap inside the detection above; what is left here is the
      // window, which starts again from that. Spending it on these is what left
      // rows with no score or coins in them.
      deadline = Date.now() + StatsScorePageWaitMs;
    } else if (page === PageName.Unknown && sawTally) {
      // Something the table does not know is in front of a tally that has
      // already arrived. With an event card active that is the event's result
      // overlay, and after it is tapped away the ~15s walk of the event's token
      // along its area path. Neither is fingerprinted: both are drawn in each
      // event's own art, and a fingerprint would be stale by the next event.
      // What holds across events is that the overlay advances on any tap, so a
      // spot that is inert on the tally is tapped at an interval until a page
      // this loop knows is back. Renewing on `Unknown` is refused everywhere
      // else in this loop; here the loop is acting rather than watching, and
      // `StatsScorePageMaxWaitMs` still bounds it.
      if (Date.now() - lastTapAt >= StatsUnknownTapMs) {
        if (taps === 0) {
          logInfo(Log.Stats.TallyCovered,
            'A screen the table does not know is over the tally; tapping it away');
        }
        this.tap(StatsUnknownTapSpot);
        lastTapAt = Date.now();
        taps++;
      }
      deadline = Date.now() + StatsScorePageWaitMs;
    }
    this.sleep(250);
  }
  if (this.isRunning) {
    // One record instead of three lines that only meant anything read together.
    logWarn(Log.Stats.ScorePageGaveUp, sawTally
      ? 'Gave up on the score page: the tally showed but never put its buttons out'
      : 'Gave up on the score page: the tally never showed -- a screen above with no '
        + 'dismiss handler will sit there for the whole budget', {
      waitedSec: +((Date.now() - startedAt) / 1000).toFixed(1),
      sawTally: sawTally,
      // Which deadline ran out: the window on one wait, or the cap on all of
      // them. The second means the post-round screens kept renewing it, so the
      // fix is there rather than in the window's length.
      cappedOut: Date.now() >= hardDeadline,
      blindTaps: taps,
      pagesSeen: statsPageTally(seen),
      trail: gPages.trail(8),
    });
  }
  return false;
};

/**
 * Called once the play loop has left the game. Writes a row only for a round
 * that actually ended -- the loop also exits when the script is stopped, and
 * that is not a round anyone played.
 *
 * The round stays open until the row is written, which is what `sampleBaseCoins`
 * tests for: the level-up panel it reads the coin counter off is shown *after*
 * the play loop has broken out, so this function's own wait for the score page
 * is what the counter is read during. Zeroing the round here rather than at the
 * end used to discard every one of those reads, and with them the whole
 * base_coins column.
 */
Tsum.prototype.finishRoundStats = function() {
  const startedAt = this.roundStartedAt;
  const endedAt = this.roundEndedAt;
  // Cleared on every way in: `lastRound` describes the round that just ended,
  // and the caller's `round.end` reads null as "nothing was read".
  this.lastRound = null;
  if (!this.trackRoundStats || !startedAt || !endedAt) {
    this.roundStartedAt = 0;
    this.roundEndedAt = 0;
    return;
  }
  try {
    let score: number | null = null;
    let finalCoins: number | null = null;
    let medals: number | null = null;
    const sawScorePage = this.waitForScorePage();
    // Measured before the score page is read, so it describes the window the
    // coin counter was sampled in rather than the whole of this function.
    const windowMs = Date.now() - endedAt;
    if (sawScorePage) {
      score = this.readSettledStatsNumber(StatsRegions.score);
      if (this.roundMedalsRow) {
        medals = this.readSettledStatsNumber(StatsRegions.finalMedals);
        finalCoins = this.readSettledStatsNumber(StatsRegions.finalCoinsMedals);
      } else {
        // No medals row is the game saying none were earned, which is a zero
        // rather than a gap -- unlike the fields below it, this one is not
        // missing, it is absent.
        medals = 0;
        finalCoins = this.readSettledStatsNumber(StatsRegions.finalCoins);
      }
    }
    // No `else` log: waitForScorePage has already said what it saw and why it
    // gave up, which is more than "it did not work" could be.
    const baseCoins = this.roundBaseCoins >= 0 ? this.roundBaseCoins : null;
    // How often the counter was legible, and whether the screen it is read off
    // showed up at all, is the thing to look at when the coin figure comes out
    // wrong -- so say it every round rather than only on failure. No reads at
    // all means the level-up panel never fingerprinted, which is a different
    // problem from a panel that was there and would not read.
    logInfo(Log.Stats.CoinCounter, 'Coin counter reads off the level-up screen', {
      hits: this.baseCoinHits,
      reads: this.baseCoinReads,
      windowSec: +(windowMs / 1000).toFixed(1),
    });
    const missing: string[] = [];
    if (score === null) {
      missing.push('score');
    }
    if (finalCoins === null) {
      missing.push('coins');
    }
    if (medals === null) {
      missing.push('medals');
    }
    // Only the two score-page fields: the score page is what is on screen now,
    // so it is the right frame for those and the wrong one for the counter,
    // whose own shot was taken back on the level-up panel by `sampleBaseCoins`.
    if (missing.length > 0) {
      this.saveStatsDebugShot(missing.join('+'));
    }
    const seconds = Math.round((endedAt - startedAt) / 1000);
    // What the caller's `round.end` carries. Set before the write, so a write
    // that throws still leaves the figures that were read.
    this.lastRound = {
      seconds: seconds,
      score: score,
      baseCoins: baseCoins,
      finalCoins: finalCoins,
      medals: medals,
    };
    this.writeRoundStats(new Date(), seconds, score, baseCoins, finalCoins, medals);
    // The Quick Bar's running average, off the same two figures the row carries.
    // A missing one is left out of its own total rather than counted as zero --
    // see `RunCoinTally`.
    this.runCoins.rounds++;
    if (baseCoins !== null) {
      this.runCoins.baseRounds++;
      this.runCoins.baseTotal += baseCoins;
    }
    if (finalCoins !== null) {
      this.runCoins.finalRounds++;
      this.runCoins.finalTotal += finalCoins;
    }
  } finally {
    // Closes the round for `sampleBaseCoins`, so nothing on the way back out to
    // the friend page can add to a figure that has already been written.
    this.roundStartedAt = 0;
    this.roundEndedAt = 0;
  }
};

// 'YYYYMMDD-HHMMSS' in UTC, for debug shot filenames.
function statsFileStamp(date: Date): string {
  function pad(n: number): string {
    return (n < 10 ? '0' : '') + n;
  }
  return date.getUTCFullYear() + pad(date.getUTCMonth() + 1) + pad(date.getUTCDate())
    + '-' + pad(date.getUTCHours()) + pad(date.getUTCMinutes()) + pad(date.getUTCSeconds());
}

/**
 * Drops the whole screen into tsum_record/ whenever a round's numbers could not
 * be read, named for the fields that failed, so an empty cell can be looked at
 * instead of guessed about. Full resolution and PNG rather than JPEG: the point
 * is to be able to re-measure a region or re-cut a digit template from it.
 */
Tsum.prototype.saveStatsDebugShot = function(tag) {
  if (this._statsDebugShots >= StatsMaxDebugShots) {
    return;
  }
  this._statsDebugShots++;
  const path = this.storagePath + '/' + Config.recordDir
    + '/unread-' + tag + '-' + statsFileStamp(new Date()) + '.png';
  let img: NativeImage | null = null;
  try {
    img = this.dialogScreenshot(this.originScreenWidth, this.originScreenHeight);
    saveImage(img, path);
    logWarn(Log.Stats.UnreadShotSaved, 'Could not read a stats number; saved a screenshot', {
      unread: tag.split('+'),
      path: path,
      shot: this._statsDebugShots,
      maxShots: StatsMaxDebugShots,
      lastShot: this._statsDebugShots === StatsMaxDebugShots,
    });
  } catch (e) {
    logWarn(Log.Stats.ShotSaveFailed, 'Could not save the stats screenshot',
      { path: path, errorText: '' + e });
  } finally {
    if (img != null) {
      releaseImage(img);
    }
  }
};

function statsSkillName(skillType: SkillType | undefined | null): string {
  const name = String(skillType === undefined || skillType === null ? '' : skillType)
    .replace(/[^A-Za-z0-9_.-]/g, '_');
  return name === '' ? 'unknown_skill' : name;
}

// ---------------------------------------------------------------------------
// Row identity
//
// Every row carries an `id` that no other row can repeat -- not across runs of
// the script, not across devices, not across players. It is the only thing a
// reader needs to drop duplicates: the same file handed to a spreadsheet twice,
// a row re-sent after a failed upload, or two players' files merged into one
// table. It is also what the remote stats API this file is headed for will key
// on, so a repeated id anywhere would silently lose somebody's round.
//
// It is minted at the whistle, by `beginRoundStats`, not when the row is
// written: it is the *round's* id, and every `round.*` event carries it so an
// events consumer fed by several emulators can tell one round's events apart
// from another's. The row is the same round, so it takes the same id.
//
// The shape is a UUIDv7: 48 bits of millisecond timestamp, then the tail.
// Time-first means ids sort by when the round was played, which is what a
// time-series store wants from a primary key, and the format is one every
// database and HTTP API already understands.
//
// The tail is deliberately NOT left to Math.random alone. QuickJS seeds its
// PRNG from the clock, so two phones that start the script in the same moment
// walk the same random sequence -- exactly the collision an id shared between
// players must not have. So the last group is a per-device tag (`statsDeviceTag`),
// and only the 24 bits in front of it are random. Two rows can then collide only
// if they came from the same device in the same millisecond, and one device
// plays rounds minutes apart.
// ---------------------------------------------------------------------------

// Beside the CSV, so a device keeps one identity even if the tag ever has to be
// invented rather than derived. Only the fallback derivation reads it -- see
// `statsDeviceTag`.
const StatsDeviceIdFile = 'device.id';

/** Worked out once per script run; the derivation costs a handful of shell calls. */
var gStatsDeviceTag = '';

/** `n` random hex characters. */
function statsRandomHex(digits: number): string {
  let out = '';
  for (let i = 0; i < digits; i++) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
}

/** `value` as exactly `digits` hex characters, zero-padded, trimmed from the left. */
function statsHexPad(value: number, digits: number): string {
  let hex = Math.floor(value).toString(16);
  while (hex.length < digits) {
    hex = '0' + hex;
  }
  return hex.substring(hex.length - digits);
}

/**
 * FNV-1a, 32 bits, as 8 hex characters. The multiply is written as shifted adds
 * because the 32-bit product overflows what a double holds exactly.
 */
function statsHash32(text: string, basis: number): string {
  let h = basis >>> 0;
  for (let i = 0; i < text.length; i++) {
    h = (h ^ text.charCodeAt(i)) >>> 0;
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return statsHexPad(h, 8);
}

/**
 * 48 bits of hash over `text`, as 12 hex characters.
 *
 * Two passes over differently salted input rather than one 32-bit hash widened:
 * the halves have to be independent, or the tag is really only 32 bits wide and
 * a few thousand devices would start colliding by the birthday bound.
 */
function statsHash48(text: string): string {
  return statsHash32(text, 0x811c9dc5).substring(2)
    + statsHash32('gap.tsum.stats/' + text, 0x9e3779b1).substring(2);
}

/** One line of shell output, trimmed; '' when the command said nothing useful. */
function statsShellValue(cmd: string): string {
  let out: string;
  try {
    out = execute(cmd) || '';
  } catch (e) {
    return '';
  }
  out = out.split('\n')[0].replace(/[^\x20-\x7e]/g, '').replace(/^\s+|\s+$/g, '');
  return out === 'null' ? '' : out;
}

/**
 * A stable 12-hex tag for this device.
 *
 * The host's `getDeviceId()` where there is one: it is the id that names the
 * host's log file (`logs/script-<id>.log`) and the device in the event stream,
 * so a row, the log it came from and the events it fired agree on which device
 * that was. It is also the only derivation that tells two emulator instances
 * apart when they share one host folder as their script root -- which MuMu does
 * by default -- because nothing kept under that root is one device's own.
 *
 * On an older host, derived here from the device's own identifiers and cached
 * in `tsum_record/device.id`, so a cleared record folder comes back with the
 * same tag. Hashed rather than sent as found, because `android_id` is a
 * hardware identifier and this file is headed off the phone. The random
 * fallback covers a device that answers none of the probes; it is written to
 * the file straight away, so it is invented once and then kept.
 */
function statsDeviceTag(storagePath: string): string {
  if (gStatsDeviceTag !== '') {
    return gStatsDeviceTag;
  }
  if (typeof getDeviceId === 'function') {
    const hostId = (getDeviceId() || '').replace(/[^0-9a-f]/g, '');
    if (hostId.length === 12) {
      gStatsDeviceTag = hostId;
      return gStatsDeviceTag;
    }
  }
  const path = storagePath + '/' + Config.recordDir + '/' + StatsDeviceIdFile;
  let saved = '';
  try {
    saved = (readFile(path) || '').replace(/[^0-9a-f]/g, '');
  } catch (e) {
    saved = '';
  }
  if (saved.length === 12) {
    gStatsDeviceTag = saved;
    return gStatsDeviceTag;
  }
  const probes = [
    statsShellValue('settings get secure android_id'),
    statsShellValue('getprop ro.serialno'),
    statsShellValue('getprop ro.boot.serialno'),
    statsShellValue('getprop ro.product.model'),
    statsShellValue('getprop ro.build.fingerprint')
  ];
  const seed = probes.join('|');
  gStatsDeviceTag = seed.split('|').join('') === '' ? statsRandomHex(12) : statsHash48(seed);
  try {
    writeFile(path, gStatsDeviceTag + '\n');
  } catch (e) {
    logWarn(Log.Stats.DeviceIdUnsaved, 'Could not save the stats device id',
      { path: path, errorText: '' + e });
  }
  return gStatsDeviceTag;
}

/**
 * A UUIDv7 from its three parts: 48 bits of timestamp, 7 hex characters of
 * `tail`, and the 48-bit device tag. The version nibble (7) and the variant
 * nibble (8-b) are fixed by the format, so the tail fills the six free hex
 * characters around them and its last character picks the variant.
 */
function statsUuidV7(ms: number, tail: string, deviceTag: string): string {
  const time = statsHexPad(ms, 12);
  const variant = '89ab'.charAt(parseInt(tail.charAt(6), 16) & 3);
  return time.substring(0, 8) + '-' + time.substring(8, 12)
    + '-7' + tail.substring(0, 3)
    + '-' + variant + tail.substring(3, 6)
    + '-' + deviceTag;
}

/** The id for a round started at `date` on this device. */
function statsRowId(date: Date, deviceTag: string): string {
  return statsUuidV7(date.getTime(), statsRandomHex(7), deviceTag);
}

/** Milliseconds for a `statsTimestamp` string, read as UTC; 0 when it cannot be read. */
function statsParseTimestamp(text: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(text || '');
  if (m === null) {
    return 0;
  }
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

/**
 * An id for a row written before the column existed, filled in the one time the
 * file is rewritten to add it.
 *
 * The tail is a digest of the row's own text rather than randomness, so the same
 * historical round always resolves to the same id no matter what rebuilds it --
 * which is what a dedupe key has to promise. Two rows identical in every field
 * therefore share an id, and that is correct: identical fields include the
 * timestamp, and one device cannot play two rounds in the same second.
 */
function statsBackfillId(fields: string[], datetime: string, deviceTag: string): string {
  return statsUuidV7(statsParseTimestamp(datetime),
    statsHash32(fields.join(','), 0x811c9dc5).substring(1), deviceTag);
}

// 'YYYY-MM-DD HH:MM:SS' in UTC, so rows written on different devices sort and
// group against each other without anyone having to know where they were played.
function statsTimestamp(date: Date): string {
  function pad(n: number): string {
    return (n < 10 ? '0' : '') + n;
  }
  return date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate())
    + ' ' + pad(date.getUTCHours()) + ':' + pad(date.getUTCMinutes()) + ':' + pad(date.getUTCSeconds());
}

function statsCell(value: number | null): string {
  return value === null ? '' : String(value);
}

/** Quotes a value only when CSV requires it. */
function statsCsvField(value: string | number | undefined): string {
  const text = value === undefined || value === null ? '' : String(value);
  if (text.indexOf(',') < 0 && text.indexOf('"') < 0 && text.indexOf('\n') < 0 && text.indexOf('\r') < 0) {
    return text;
  }
  return '"' + text.split('"').join('""') + '"';
}

/** Splits one CSV line, honouring quotes and doubled quotes inside them. */
function statsParseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line.charAt(i);
    if (quoted) {
      if (c !== '"') {
        field += c;
      } else if (line.charAt(i + 1) === '"') {
        field += '"';
        i++;
      } else {
        quoted = false;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      fields.push(field);
      field = '';
    } else {
      field += c;
    }
  }
  fields.push(field);
  return fields;
}

// Splitting the file on newlines is only safe because nothing written here ever
// contains one: timestamps, numbers, true/false and a skill name that has been
// through statsSkillName. Keep it that way and quoted multi-line fields never
// have to be dealt with.
function statsSplitLines(text: string): string[] {
  const lines: string[] = [];
  if (!text) {
    return lines;
  }
  const raw = text.split('\n');
  for (let i = 0; i < raw.length; i++) {
    let line = raw[i];
    if (line.charAt(line.length - 1) === '\r') {
      line = line.substring(0, line.length - 1);
    }
    if (line !== '') {
      lines.push(line);
    }
  }
  return lines;
}

function statsCsvRow(columns: string[], values: StatsRow): string {
  const fields: string[] = [];
  for (let i = 0; i < columns.length; i++) {
    fields.push(statsCsvField(values[columns[i]]));
  }
  return fields.join(',');
}

/**
 * The file's new contents: whatever rows it already held, plus this one, under
 * a header that is the union of the columns it was written with and the ones
 * this build writes.
 *
 * Columns are only ever appended, never reordered or dropped, so rows written
 * by an older build keep their values and a column since removed from the code
 * just goes empty from here on. Without this, adding a setting would shift
 * every column in the file along by one and quietly invalidate every round
 * collected before the change -- which is the whole point of the file.
 *
 * The rewrite is also where rows from before the `id` column get one, so a file
 * that has been collecting rounds for months can still be uploaded whole rather
 * than from the day of this build onwards.
 */
function statsCsvDocument(existing: string, columns: string[], values: StatsRow,
                          deviceTag: string): string {
  const lines = statsSplitLines(existing);
  const header = lines.length > 0 ? statsParseCsvLine(lines[0]) : columns.slice();
  const merged = header.slice();
  for (let i = 0; i < columns.length; i++) {
    let known = false;
    for (let j = 0; j < merged.length; j++) {
      if (merged[j] === columns[i]) {
        known = true;
        break;
      }
    }
    if (!known) {
      merged.push(columns[i]);
    }
  }
  // merged starts as a copy of header and only grows, so equal lengths mean
  // the file already has every column -- the usual case, and one that does not
  // need the rows on disk touched at all.
  if (lines.length > 0 && merged.length === header.length) {
    return lines.join('\n') + '\n' + statsCsvRow(merged, values) + '\n';
  }
  const out = [statsCsvRow(merged, statsIdentityRow(merged))];
  for (let r = 1; r < lines.length; r++) {
    const old = statsParseCsvLine(lines[r]);
    const mapped: StatsRow = {};
    for (let c = 0; c < header.length && c < old.length; c++) {
      mapped[header[c]] = old[c];
    }
    if (!mapped[StatsIdColumn]) {
      mapped[StatsIdColumn] = statsBackfillId(old, String(mapped.datetime || ''), deviceTag);
    }
    out.push(statsCsvRow(merged, mapped));
  }
  out.push(statsCsvRow(merged, values));
  return out.join('\n') + '\n';
}

/** Maps each column name to itself, so the header goes out the same way rows do. */
function statsIdentityRow(columns: string[]): StatsRow {
  const row: StatsRow = {};
  for (let i = 0; i < columns.length; i++) {
    row[columns[i]] = columns[i];
  }
  return row;
}

/** A setting as the CSV should carry it: switches as true/false, blank if unset. */
function statsSettingValue(settings: Settings | undefined, key: keyof Settings): string {
  if (!settings) {
    return '';
  }
  const value = settings[key];
  if (value === undefined || value === null) {
    return '';
  }
  if (value === true) {
    return 'T';
  }
  if (value === false) {
    return 'F';
  }
  return String(value);
}

Tsum.prototype.writeRoundStats = function(date, seconds, score, baseCoins, finalCoins, medals) {
  // The snapshot, not the live object: every settings column on this row --
  // `skill_type` included -- says what the round was played under, however many
  // times the Quick Bar has been touched since. The fallback covers a row
  // written without a round having been opened, which nothing does today.
  const settings = this.roundSettings || this.settings;
  const skill = statsSkillName(settings ? settings.skillType : this.skillType);
  // Split by day, never by skill: the comparisons the file exists for cut
  // across skills, and `skill_type` is a column to group by.
  const path = this.storagePath + '/' + Config.recordDir + '/' + statsFileName(date);
  const columns: string[] = (StatsBaseColumns as string[]).concat(StatsSettingColumns);
  const deviceTag = statsDeviceTag(this.storagePath);
  const values: StatsRow = {
    // The id the round opened with, so this row and the `round.*` events that
    // announced it carry one identity. Minted here only for a call made outside
    // a round, which nothing does today.
    id: this.roundUid || statsRowId(date, deviceTag),
    datetime: statsTimestamp(date),
    // Substituted into the bundle at build time; see ScriptVersion in data.ts.
    script_version: ScriptVersion,
    skill_type: skill,
    // Read on the pre-round screen, well before this row exists; see
    // identifyMyTsum(). Empty rather than guessed when nothing matched.
    tsum: this.myTsum,
    duration_seconds: seconds,
    score: statsCell(score),
    base_coins: statsCell(baseCoins),
    final_coins: statsCell(finalCoins),
    medals: statsCell(medals)
  };
  for (let i = 0; i < StatsSettingColumns.length; i++) {
    values[StatsSettingColumns[i]] = statsSettingValue(settings, StatsSettingColumns[i]);
  }
  try {
    // The engine has no append, so the file is read back and rewritten. A
    // row is a couple of hundred bytes and a day holds a few hundred rows, so
    // the rewrite stays small however long the script has been collecting.
    const existing = readFile(path);
    writeFile(path, statsCsvDocument(existing, columns, values, deviceTag));
    logInfo(Log.Stats.RoundWritten, 'Wrote a round to the stats CSV', {
      id: values.id,
      datetime: values.datetime,
      durationSec: seconds,
      score: score,
      baseCoins: baseCoins,
      finalCoins: finalCoins,
      medals: medals,
      skill: skill,
      tsum: this.myTsum,
      path: path,
    });
    this.banner('Round stats saved!', 2000);
  } catch (e) {
    logError(Log.Stats.WriteFailed, 'Could not write the stats CSV',
      { path: path, errorText: '' + e });
  }
};
