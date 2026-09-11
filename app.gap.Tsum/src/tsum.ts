// The Tsum object itself: the world one run is played in, and the wrappers
// every other file reaches the device through.
//
// What is left here is what nothing else can be written without -- the fields,
// the screen geometry `init` works out, the capture and touch wrappers, and the
// two conversions between the coordinates the tables are written in and the
// pixels the host wants. This file used to be all of it; the work now lives in
// the eight it was split into, which reopen this prototype:
//
//   src/waits.ts         sleep, settleScreen, settleBoard, mayContinue
//   src/appLifecycle.ts  is the game in front, and getting it there
//   src/board.ts         reading the board, and drawing chains on it
//   src/play.ts          playing one round, start to game over
//   src/mail.ts          the mailbox chore
//   src/hearts.ts        the send-hearts chore, and the record it keeps
//   src/levelCap.ts      the level-cap sweep
//   src/boxes.ts         the Box Buying chore
//
// Plenty of others reopen it too -- fever.ts, lorcana.ts, dialogs.ts,
// corpus.ts, roundStats.ts, walkthrough.ts, clickAssist.ts and the skills --
// but those were never part of this file. `interface Tsum` in globals.d.ts is
// the whole list, grouped by the file that implements each member.
//
// Every `Tsum.prototype.NAME = function` assignment, here and there, is declared
// in `interface Tsum` (globals.d.ts), which merges with the class below. That is
// what types `this` and the parameters inside one -- they need no annotations of
// their own.
//
// A class rather than a constructor function purely so `new Tsum(...)` has a
// construct signature and `Tsum.prototype` is typed; the field declarations
// below emit nothing at all.

class Tsum {
  debug: boolean;
  autoLaunch: boolean;
  isRunning: boolean;
  /**
   * An injected finger is down: between `tapDown` and the `tapUp` that ends
   * it. Once the run is stopped a gesture not yet begun never starts, but one
   * already begun is finished, so no finger is left resting on the game.
   */
  gestureOpen: boolean;
  /**
   * A level-cap sweep asked for from the settings page is waiting for its turn.
   * Raised by `queueUnlockSweep` (src/index.ts), lowered when the sweep takes
   * its turn. The chores read it through `mayContinue()` and hand the loop back
   * at their next step; the play task reads it before starting a round.
   */
  yieldAsked: boolean;
  isStartupPhase: boolean;
  runTimes: number;
  /**
   * The short name of the tsum currently selected in game, or '' when nothing
   * in the library matched it confidently. Written by identifyMyTsum(), read by
   * writeRoundStats() for the CSV's `tsum` column.
   *
   * Deliberately not per-round state: the selection belongs to the account, the
   * script never changes it, and it is read on the pre-round screen -- which
   * happens *before* beginRoundStats(), so a field that reset per round would
   * be wiped between the reading and the row it belongs on.
   */
  myTsum: string;
  myTsumColor: Color | null;
  myTsumIdx: number;
  boardClusters: Color[];
  storagePath: string;
  originScreenWidth: number;
  originScreenHeight: number;
  screenHeight: number;
  screenWidth: number;
  gameOffsetX: number;
  gameOffsetY: number;
  gameHeight: number;
  gameWidth: number;
  resizeRatio: number;
  captureGameRatio: number;
  playOffsetX: number;
  playOffsetY: number;
  playHeight: number;
  playWidth: number;
  playResizeWidth: number;
  playResizeHeight: number;
  uniqueTsumCount: number;
  maxChainsPerScan: number;
  prioritizeMyTsum: boolean;
  /**
   * A skill is holding "Link MyTsum first" off (`setMyTsumPriority`). Kept
   * beside the setting rather than written over it, so lifting the hold
   * restores exactly what the player chose.
   */
  myTsumPriorityHeld: boolean;
  isJP: boolean;
  logs: LogCatalogue;
  scoreItem: boolean;
  coinItem: boolean;
  expItem: boolean;
  timeItem: boolean;
  bubbleItem: boolean;
  comboItem: boolean;
  sentToZero: boolean;
  skillInterval: number;
  skillLevel: number;
  /** `SkillType.Unset` until start() reads the setting. */
  skillType: SkillType;
  gameBubbles: GameBubble[];
  skillAutoTap: boolean;
  skillAutoTapInterval: number;
  _lastSkillAutoTap: number;
  /**
   * Blackout after an overload activation, so the probe loop cannot re-fire on
   * the skill's own animation. Needed only on the overload path: readiness is
   * defined negatively (anything not one of `SkillNotActiveColors`), so a
   * button mid-animation reads Active, and that path has dropped both guards
   * the normal one relies on -- the 500ms throttle and useSkill's 200ms
   * re-check.
   */
  _skillCooldownUntil: number;
  /** When the last real `dumpsys window` focus check ran; 0 means never. */
  _appOnCheckedAt: number;
  overloadPending: boolean;
  unlockLevelHoursWait: number;
  /** Box Buying: which box the sweep buys. */
  buyBoxType: BoxType;
  /** Box Buying: take the 10-Time button where the box draws one. */
  buyBoxTenTimes: boolean;
  /** Box Buying: purchases one sweep may make, a 10-Time one counting as one. */
  buyBoxMaxPurchases: number;
  /** The "Delay between rounds" setting in ms; 0 plays straight on. */
  roundDelayMs: number;
  /** The "Max round duration" setting in ms; 0 lets every round run its course. */
  maxRoundMs: number;
  /** What the play loop does when `maxRoundMs` runs out. */
  maxRoundAction: MaxRoundAction;
  /**
   * When the next round may start, epoch ms; 0 when nothing is waiting.
   *
   * An instant rather than a countdown, so nothing has to tick it down: the
   * play task compares against the clock once per turn, and `roundDelaySkip()`
   * ends the wait by clearing it.
   */
  nextRoundAt: number;
  sendHearts: boolean;
  keepRuby: boolean;
  /** Step past the Mission Clear medal mails instead of opening them. */
  skipMedals: boolean;
  sendHeartMaxDuring: number;
  useFan: boolean;
  record: TsumRecord;
  receiveCheckLimit: number;
  /** What the play loop may do with the bubbles on the board. */
  bubbleStrategy: BubbleStrategy;
  /** Scans still to go before a mid-chain pop is worth taking again. */
  bubbleSettleScans: number;
  noSkillLastFeverSec: number;
  /** Play a Lorcana tsum's transformation and its ink stones -- see src/lorcana.ts. */
  lorcanaCard: boolean;
  claimAllWithoutCoins: boolean;
  gameOverGraceMs: number;
  sendHeartsDownwards: boolean;
  /** Walkthrough recording state; empty unless `taskWalkthrough` is running. */
  _walkVisits: WalkVisit[];
  _walkFrames: { [page: string]: number };
  _walkFrameCount: number;
  _walkSession: string;
  _walkStartedAt: number;

  // Set by start() immediately after `new Tsum(...)`, before any task runs --
  // hence the definite-assignment `!` rather than a constructor default.
  /**
   * What the world is set to now, not only what `start()` was handed: the Quick
   * Bar writes each change here as well as onto the live field it belongs to.
   * Read `roundSettings` for the CSV, never this.
   */
  settings!: Settings;
  /**
   * Changes a round already under way cannot take, waiting for the whistle.
   *
   * Keyed by `SettingKey`; `LiveSettings` (src/quickbar.ts) is the list of
   * which ones and why, and `quickBarApplyPending` is what empties it. Not `!`
   * like the fields above: it is written before `start()` maps the settings on.
   */
  pendingSettings: { [key: string]: string | number | boolean };
  bonus5to4!: boolean;
  receiveSecondItem!: boolean;
  tsumAppRestartFrequency!: number;

  // Lazily initialised caches, owned by dialogs.ts and clickAssist.ts.
  // The counters are seeded below; `_touchDevice` uses undefined as a third
  // state ("not looked up yet") distinct from null ("looked up, not found").
  _uiDumpFailures: number;
  _lastDebugShot: number;
  _touchDevice: TouchDevice | null | undefined;

  // Corpus collection; see corpus.ts. Off unless the setting turns it on.
  collectUnknownScreens: boolean;
  _lastCorpusShot: number;
  _corpusShots: number;

  // Issue reports; see report.ts. On for every run -- somebody hitting a bug
  // will not have turned anything on first -- so these two are the bound.
  _lastReportAt: number;
  _reportCount: number;

  // Per-round metrics; see roundStats.ts.
  trackRoundStats: boolean;
  /**
   * Rounds this run has started, counted here rather than off `runCoins.rounds`:
   * that one only moves when round stats are on, and the emitted events must not
   * depend on a stats setting.
   */
  roundNumber: number;
  /**
   * The play task is walking to a round, so the pre-round screen may open one.
   * `nav.move.startToGame` is what reads it -- click assist walks to the same
   * board through the same handler and is not a round anybody records.
   */
  openingRound: boolean;
  /**
   * This round's unique id -- a UUIDv7 ending in this device's tag, minted by
   * `openRound` and carried by every `round.*` event of the round, so a
   * consumer several emulators dial into can join them. `roundNumber` cannot:
   * it counts this device's rounds, and every device counts from 1.
   *
   * The same id the CSV row gets, so an event joins to its row. Empty before the
   * first round of a run. See "Row identity" in roundStats.ts.
   */
  roundUid: string;
  /**
   * What the round that just ended came to, for `round.end` to carry. Null when
   * the figures were never read -- round stats off, or a round that had none.
   * Written by `finishRoundStats`; see roundStats.ts.
   */
  lastRound: RoundOutcome | null;
  roundStartedAt: number;
  roundEndedAt: number;
  roundBaseCoins: number;
  /**
   * Whether the tally the round ended on drew a medals row. Set by
   * `waitForScorePage` off the frame that says the count-up has finished, and
   * read by `finishRoundStats` -- the row moves the coin figure, so which
   * rectangle holds it is this flag.
   */
  roundMedalsRow: boolean;
  /**
   * The settings this round is being played under -- a copy of `settings` taken
   * by `beginRoundStats`, and what `writeRoundStats` writes its columns from.
   *
   * The copy is the point. `settings` is live, so a Quick Bar change made while
   * a round is on would otherwise be written onto that round's row as though it
   * had been in force all along. Undefined until the first round starts.
   */
  roundSettings: Settings | undefined;
  baseCoinReads: number;
  baseCoinHits: number;
  _statsDebugShots: number;

  /**
   * Coins earned since this run began, as the Quick Bar shows them.
   *
   * On `ts` rather than in a module variable so it resets with the world:
   * `buildRun` makes a new `Tsum` per run, which is exactly what "since the
   * script was last initialized" means. Filled by `finishRoundStats`, so it
   * counts the rounds whose figures were legible and no others.
   */
  runCoins: RunCoinTally;

  constructor(isJP: boolean, detect: boolean, logs: LogCatalogue) {
    this.debug = false;
    this.autoLaunch = false;
    this.isRunning = true;
    this.gestureOpen = false;
    this.yieldAsked = false;
    this.isStartupPhase = true;
    this.runTimes = 0;
    this.myTsum = '';
    this.myTsumColor = null;
    this.myTsumIdx = -1;
    this.boardClusters = [];
    this.storagePath = getStoragePath();
    // screen size config
    /** @type {{width: number, height: number}}  */
    const size = getScreenSize();
    this.originScreenWidth = size.width;
    this.originScreenHeight = size.height;
    this.screenHeight = size.height;
    this.screenWidth = size.width;
    this.gameOffsetX = 0;
    this.gameOffsetY = 0;
    this.gameHeight = 0;
    this.gameWidth = 0;
    this.resizeRatio = Math.max(1, this.screenWidth / 360); // normalize page screenshots to 360px width
    this.captureGameRatio = 0;
    // playing game screen size config
    this.playOffsetX = 0;
    this.playOffsetY = 0;
    this.playHeight = 0;
    this.playWidth = 0;
    this.playResizeWidth = Config.screenResize;
    this.playResizeHeight = Config.screenResize;

    this.uniqueTsumCount = 5;
    this.maxChainsPerScan = 6;
    // Link MyTsum chains ahead of longer ones of other colors, so the skill gauge
    // fills faster (see calculatePaths). Off by default: it costs raw chain
    // length, and only pays off when the skill is worth more than the tsums.
    this.prioritizeMyTsum = false;
    this.myTsumPriorityHeld = false;
    this.isJP = isJP;
    this.logs = logs;
    this.scoreItem = false;
    this.coinItem = false;
    this.expItem = false;
    this.timeItem = false;
    this.bubbleItem = false;
    this.comboItem = false;
    this.sentToZero = false;
    this.skillInterval = 3000;
    this.skillLevel = 3;
    this.skillType = SkillType.Unset;
    // Bubble positions from the last board scan, tapped after a long chain.
    this.gameBubbles = [];
    // Optional safety poll: fire the skill the instant it's ready, even mid-link,
    // rather than only at the end of each board-scan cycle (see maybeAutoTapSkill).
    this.skillAutoTap = false;
    this.skillAutoTapInterval = 400;
    this._lastSkillAutoTap = 0;
    this._skillCooldownUntil = 0;
    this._appOnCheckedAt = 0;
    // Burst-skill overload: set after a link batch so the next scan issues one
    // carry-over tap on the skill button (see link / scanBoardQuick).
    this.overloadPending = false;
    this.unlockLevelHoursWait = 0;
    this.buyBoxType = BoxType.Premium;
    this.buyBoxTenTimes = false;
    this.buyBoxMaxPurchases = 0;
    this.roundDelayMs = 0;
    this.maxRoundMs = 0;
    this.maxRoundAction = MaxRoundAction.Coast;
    // A new world per start(), so pressing Play always plays now rather than
    // resuming a wait the previous run was in.
    this.nextRoundAt = 0;
    this.sendHearts = false;
    this.keepRuby = false;
    this.skipMedals = false;
    this.sendHeartMaxDuring = 0;
    this.useFan = true;
    // record
    this.record = {
      hearts_count: {
        receivedCount: 0,
        sentCount: 0
      }
    };
    this.receiveCheckLimit = 5;
    this.bubbleStrategy = BubbleStrategy.OneMidChain;
    this.bubbleSettleScans = 0;
    this.noSkillLastFeverSec = 0;
    this.lorcanaCard = false;
    // Nothing is held back until the Quick Bar holds something back.
    this.pendingSettings = {};
    this.claimAllWithoutCoins = false;
    // How long the play loop tolerates an unrecognized screen before accepting
    // game over (see confirmGameOver). Must outlast the longest burst-skill
    // animation; a real game over exits earlier via ScorePage detection.
    this.gameOverGraceMs = 20 * 1000;
    this.sendHeartsDownwards = true;
    this._walkVisits = [];
    this._walkFrames = {};
    this._walkFrameCount = 0;
    this._walkSession = '';
    this._walkStartedAt = 0;
    // Both were previously left undefined and read through `|| 0` guards; seeding
    // them here is the same value on every read, just stated once.
    this._uiDumpFailures = 0;
    this._lastDebugShot = 0;
    this.collectUnknownScreens = false;
    this._lastCorpusShot = 0;
    this._corpusShots = 0;
    this._lastReportAt = 0;
    this._reportCount = 0;
    // Per-round metrics; see the Round stats section.
    this.trackRoundStats = true;
    this.roundNumber = 0;
    this.openingRound = false;
    this.roundUid = '';
    this.lastRound = null;
    this.roundStartedAt = 0;
    this.roundEndedAt = 0;
    this.roundBaseCoins = -1;
    this.roundMedalsRow = false;
    this.roundSettings = undefined;
    this.baseCoinReads = 0;
    this.baseCoinHits = 0;
    this._statsDebugShots = 0;
    this.runCoins = {rounds: 0, baseRounds: 0, baseTotal: 0, finalRounds: 0, finalTotal: 0};
    this.init(detect);
  }
}

Tsum.prototype.init = function(detect) {
  logInfo(Log.Screen.CalculateSize);
  let isFat = false;
  if (this.screenHeight / this.screenWidth < 1.5) {
    isFat = true;
    this.gameHeight = this.screenHeight;
    this.gameWidth = this.screenHeight / 1.5;
    this.gameOffsetY = Math.floor((this.gameWidth * 16 / 9 - this.gameHeight) / 2);
    this.gameOffsetX = Math.floor((this.gameWidth - this.screenWidth) / 2);
  } else {
    this.gameWidth = this.screenWidth;
    this.gameHeight = this.screenWidth / 9 * 16;
    this.gameOffsetX = 0;
    this.gameOffsetY = Math.floor((this.gameHeight - this.screenHeight) / 2);
    logDebug(Log.Screen.TallGeometry, {
      gameHeight: this.gameHeight,
      screenHeight: this.screenHeight,
      gameWidth: this.gameWidth,
    });
  }

  if (detect && this.screenHeight / this.screenWidth > 16 / 9) {
    logInfo(Log.Screen.Detect, { reason: 'specialScreenRatio' });
    this.gameWidth = this.screenWidth;
    this.gameHeight = this.gameWidth * 1.5;
    this.gameOffsetX = 0;
    this.gameOffsetY = detectOffsetYInGame();
  }

  this.captureGameRatio = this.gameWidth / 1080;
  if (isFat) {
    this.playWidth = this.gameWidth;
    this.playOffsetX = Math.max(-this.gameOffsetX, 0);
  } else {
    this.playWidth = this.screenWidth;
    this.playOffsetX = 0;
  }
  // noinspection JSSuspiciousNameCombination
  this.playHeight = this.playWidth; // game has square dimension
  this.playOffsetY = PlayAreaTopY * this.captureGameRatio - this.gameOffsetY;

  logInfo(Log.Screen.Offset, {
    gameOffsetX: this.gameOffsetX,
    gameOffsetY: this.gameOffsetY,
    screenHeight: this.screenHeight,
    screenWidth: this.screenWidth,
  });
  this.declareReadTop();
  // No rests around these: `execute` is synchronous, and the 1.4s that used to
  // sit here waited for nothing.
  execute("mkdir -p " + this.storagePath + '/tmp');
  execute("mkdir -p " + this.storagePath + '/' + Config.recordDir);
}

// Quality 100: no JPEG round-trip. This was 80 only because Robotmon captured
// that way, and the cost of it was never the compression -- it was that the
// probes read off the result are wrong. `npm run pages:noise` puts q80's error
// at a probe at 98 median / 253 max where the colour is not uniform for +-8
// capture-space px, against 0/0/0 at every radius for q100, and
// `pages:selftest` listed six otherwise-sound entries that only q80 lost.
// The downscale itself is exact, so nothing else here changes.
Tsum.prototype.screenshot = function() {
  return getScreenshotModify(
    0,
    0,
    this.originScreenWidth,
    this.originScreenHeight,
    this.originScreenWidth / this.resizeRatio,
    this.originScreenHeight / this.resizeRatio,
    100
  );
}

Tsum.prototype.playScreenshotSquare = function() {
  return getScreenshotModify(
    this.playOffsetX,
    this.playOffsetY,
    this.playWidth,
    this.playHeight,
    this.playResizeWidth,
    this.playResizeHeight,
    100
  );
}

/**
 * One line for the floating window's banner, beside the button bar.
 *
 * Not a log line: the banner holds a queue and gives each message its own time
 * on screen, so this is for the handful of things worth reading off the phone
 * while a round is playing -- which tsum is up, what the run is waiting for.
 * The log is still where everything goes.
 *
 * `duration` is milliseconds (omit for the overlay's default) and `plays` is
 * how many showings it gets before it drops out of the cycle, `0` meaning it
 * stays for the whole run.
 *
 * Guarded because `showBanner` is newer than the 52 raw APIs this script
 * otherwise assumes: on a host without it a missing global is a ReferenceError,
 * and a decoration must not be able to end a run.
 */
Tsum.prototype.banner = function(message, durationMs, plays) {
  if (typeof showBanner !== 'function') {
    return;
  }
  showBanner(message, durationMs, plays);
}

/**
 * Broadcast one event to whatever tooling is following this run.
 *
 * The name comes from `Emit` (src/scriptEvents.ts) and the payload is this
 * script's own vocabulary: the host adds a sequence, a timestamp and the script
 * id, and carries the line without reading either. What each event carries is
 * EVENTS.md, generated from these call sites.
 *
 * Guarded for the same reason `banner` is -- `emitEvent` is newer than the 52
 * raw APIs, so an older host would take a ReferenceError. That is host-version
 * skew, not the Robotmon compatibility CLAUDE.md rules out.
 *
 * A free function as well as a method because the run's own events are emitted
 * from `index.ts`, where `ts` does not exist yet (`run.started`) or has already
 * been cleared (`run.stopped`). One guard, two ways in.
 */
function emitScriptEvent(name: string, data?: unknown): void {
  if (typeof emitEvent !== 'function') {
    return;
  }
  emitEvent(name, data);
}

Tsum.prototype.emit = function(name, data) {
  emitScriptEvent(name, data);
}

/**
 * Tell the host the top-most screen row this script reads, so the status line
 * it hangs under the floating bar stays above it -- or stays down.
 *
 * The bar is at the top and so is most of what page detection reads; the host
 * measures the room between the bar's edge and this row on the device it is on
 * and fits the line in it, slimmer if it must, not at all if it cannot. The
 * host does that arithmetic because only it knows the bar's size in px; this
 * side knows where the reads are.
 *
 * Derived, not declared: the lowest row over every fingerprint probe in `Page`
 * and every `StatsRegions` box, in reference px, converted the way a probe is
 * (`toRealXY`). A constant here would be a second copy of the tables that
 * nothing keeps true. The scans that visit rows above these -- the system
 * dialog search, the letterbox detector -- look for a light panel or true
 * black, and the line is neither; the board and the name strips are all below
 * `PlayAreaTopY`.
 *
 * From `init`, after the geometry, because the row moves with `gameOffsetY`.
 * Guarded like `banner`: newer than the raw API, and a decoration must not be
 * able to end a run.
 */
Tsum.prototype.declareReadTop = function() {
  if (typeof setReadTop !== 'function') {
    return;
  }
  let top = Infinity;
  const pages = Page as PageMap;
  for (const key in pages) {
    const colors = pages[key].colors;
    for (let i = 0; i < colors.length; i++) {
      top = Math.min(top, colors[i].y);
    }
  }
  const regions = StatsRegions as { [name: string]: StatsRegion };
  for (const key in regions) {
    top = Math.min(top, regions[key].y);
  }
  setReadTop(Math.max(0, this.toRealXY(0, top).y));
}

Tsum.prototype.toResizeXY = function(x, y) {
  const rx = Math.floor((x * this.captureGameRatio - this.gameOffsetX) / this.resizeRatio);
  const ry = Math.floor((y * this.captureGameRatio - this.gameOffsetY) / this.resizeRatio);
  return {x: rx, y: ry};
}

Tsum.prototype.toResizeXYs = function(xy) {
  return this.toResizeXY(xy.x, xy.y);
}

Tsum.prototype.getColor = function(img, xy) {
  const rxy = this.toResizeXYs(xy);
  return getImageColor(img, Math.max(rxy.x, 0), Math.max(rxy.y, 0));
}

// Batched getColor: same per-point mapping, one engine crossing for the lot.
// Worth using anywhere a whole table of probes is read off a single frame --
// the sampling itself is trivial, the crossing around it was not.
Tsum.prototype.getColors = function(img, xys) {
  const pts: Point[] = [];
  for (let i = 0; i < xys.length; i++) {
    const rxy = this.toResizeXYs(xys[i]);
    pts.push({x: Math.max(rxy.x, 0), y: Math.max(rxy.y, 0)});
  }
  return getImageColors(img, pts);
}

// The 3x3 block of capture pixels around each probe, centre first -- what
// `PageRouter.score` reads, so a fingerprint tolerates the one capture pixel a
// different device or dpi resamples a landmark by. One crossing for the lot,
// like `getColors`. The centre is read exactly as `getColors` reads it, so a
// probe judged on its block can only ever do as well as it did on the centre
// alone or better; the eight neighbours are clamped onto the frame rather
// than read off its edge as transparent black.
Tsum.prototype.getColorBlocks = function(img, xys) {
  const maxX = Math.trunc(this.originScreenWidth / this.resizeRatio) - 1;
  const maxY = Math.trunc(this.originScreenHeight / this.resizeRatio) - 1;
  const pts: Point[] = [];
  for (let i = 0; i < xys.length; i++) {
    const rxy = this.toResizeXYs(xys[i]);
    const cx = Math.max(rxy.x, 0);
    const cy = Math.max(rxy.y, 0);
    pts.push({x: cx, y: cy});
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) { continue; }
        pts.push({
          x: Math.min(Math.max(cx + dx, 0), maxX),
          y: Math.min(Math.max(cy + dy, 0), maxY),
        });
      }
    }
  }
  const flat = getImageColors(img, pts);
  const blocks: Color[][] = [];
  for (let i = 0; i < xys.length; i++) {
    blocks.push(flat.slice(i * 9, i * 9 + 9));
  }
  return blocks;
}

Tsum.prototype.toRealXY = function(x, y) {
  const rx = Math.floor(x * this.captureGameRatio - this.gameOffsetX);
  const ry = Math.floor(y * this.captureGameRatio - this.gameOffsetY);
  return {x: rx, y: ry};
}

Tsum.prototype.toRealXYs = function(xy) {
  return this.toRealXY(xy.x, xy.y);
}

Tsum.prototype.isOnScreenshot = function(img, pageObject, colorDiff) {
  return !!(pageObject && pageObject.color
      && isSameColor(pageObject.color, this.getColor(img, pageObject), colorDiff))
}

// The touch wrappers inject nothing once the run is stopped (`isRunning` down).
// A stop lands mid-task, and the taps a flow makes before its next flag check
// would go to whatever screen is up by then. The host drops them as well when
// the stop is its own (Stop button, Close); this also covers a run `start()`
// replaces. A gesture already begun is finished -- see `gestureOpen`.
Tsum.prototype.tap = function(xy, during) {
  if (!this.isRunning) { return; }
  if (during === undefined) {
    during = 50;
  }
  const rxy = this.toRealXYs(xy);
  tap(rxy.x, rxy.y, during);
  // Whatever gesture was open, this tap's release ended it.
  this.gestureOpen = false;
}

Tsum.prototype.tapDown = function(xy, during) {
  if (!this.isRunning) { return; }
  if (during === undefined) {
    during = 50;
  }
  const rxy = this.toRealXYs(xy);
  this.gestureOpen = true;
  tapDown(rxy.x, rxy.y, during);
}

Tsum.prototype.moveTo = function(xy, during) {
  // Only inside a gesture this object began: a dropped tapDown drops its drag.
  if (!this.gestureOpen) { return; }
  if (during === undefined) {
    during = 50;
  }
  const rxy = this.toRealXYs(xy);
  moveTo(rxy.x, rxy.y, during);
}

Tsum.prototype.tapUp = function(xy, during) {
  if (!this.gestureOpen) { return; }
  this.gestureOpen = false;
  if (during === undefined) {
    during = 50;
  }
  const rxy = this.toRealXYs(xy);
  tapUp(rxy.x, rxy.y, during);
}

// Drag a list and say how much of it moved -- the primitive under both of the
// script's scrolls (`scrollFriendList` in hearts.ts, `scrollMailList` in
// mail.ts). A list that will not move is how each of them knows it has reached
// the end, so the answer is a count of changed sample points rather than a
// boolean: the caller compares it against its own `ListSample.minMoved`.

Tsum.prototype.dragList = function(x, path, settleMs, sample) {
  const points: Point[] = [];
  for (let y = sample.fromY; y <= sample.toY; y += sample.step) {
    for (let i = 0; i < sample.xs.length; i++) {
      points.push({x: sample.xs[i], y: y});
    }
  }

  let before: Color[];
  const first = this.screenshot();
  try {
    before = this.getColors(first, points);
  } finally {
    releaseImage(first);
  }

  const last = path.length - 1;
  this.tapDown({x: x, y: path[0]}, 50);
  for (let i = 0; i <= last; i++) {
    // The last move is slow so the list settles where it is put rather than
    // flinging past it.
    this.moveTo({x: x, y: path[i]}, i === last ? 500 : 50);
  }
  this.tapUp({x: x, y: path[last]}, 100);
  this.sleep(settleMs);

  let moved = 0;
  const second = this.screenshot();
  try {
    const after = this.getColors(second, points);
    for (let i = 0; i < after.length; i++) {
      if (absColor(before[i], after[i]) > sample.threshold) {
        moved++;
      }
    }
  } finally {
    releaseImage(second);
  }
  return moved;
}

Tsum.prototype.exitUnknownPage = function() {
  // Keep the screen before touching it. This is the single best source of
  // corpus frames: by definition nothing in the table matched, and the blind
  // taps below are about to change what is on display. Rate-limited and off by
  // default (see corpus.ts).
  //
  // Also done by `record.corpusUnknown` on the way into Unknown, and kept here
  // as well for the callers that arrive without a detection having run --
  // fetchAllMails reaches for this when it cannot make sense of a screen it
  // never asked the router about. The rate limit makes the overlap free.
  this.saveCorpusFrame('unknown');

  // A native dialog (root warning, permission prompt) is not a game screen, and
  // the blind keycodes below can activate its *negative* button -- "REFUSE" on
  // the root warning quits the game. Handle it properly and leave.
  if (this.dismissSystemDialog()) {
    return;
  }
  keycode(KeyCode.DpadDown, 50);
  this.sleep(500);
  keycode(KeyCode.Enter, 50);
  this.tap(Button.gameQuestionCancel);
  this.tap(Button.gameQuestionCancel2);
  this.tap(Button.outClose);
  this.tap(Button.gameStop);
  this.sleep(500);
}
