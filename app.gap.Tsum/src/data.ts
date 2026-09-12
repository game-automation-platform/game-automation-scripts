// ============================TSUM=============================== //

// The release this bundle was built from, for the round-stats CSV. `$VERSION` is
// a placeholder build.sh / build.ps1 substitute from package.json, exactly as
// they do for the settings page, so the version stays written in one place.
// Left literal in build/, which the offline harnesses read and where nothing
// reads it for meaning.
var ScriptVersion = '$VERSION';

var Config: TsumConfig = {
  recordDir: 'tsum_record',
  // Centre-to-centre distance of two touching tsums, in the screenResize
  // (200px) play square -- about 8 tsums across a board.
  //
  // This was 16 for a long time, and it is the number the chain link
  // radius is derived from: `tsumWidth * 2.8` in calculatePaths. At 16 that
  // radius came out at 45px, which is 1.8 actual tsum widths rather than the
  // 2.8 it is named for, and the same-colour graph it built averaged 0.9
  // neighbours per tsum -- so its connected components were 2 to 4 nodes and no
  // chain longer than 4 existed to be found. "Maximum Chain Number" therefore
  // did nothing above 4, which is how this was noticed.
  //
  // 25 is measured, not guessed: nearest-neighbour distances between detected
  // circles on corpus/GamePlaying sit in a tight band at 24-26px. The rest of
  // the detector already agreed -- findTsums looks for radius 8-14 circles
  // (diameter 16-28) no closer than minDist 22, which is a ~25px tsum.
  tsumWidth: 25,
  screenResize: 200,
  colors: [[255,0,0], [0,255,0], [0,0,255], [0,255,255], [255,0,255]],
  // Link reach in tsum widths -- overwritten by the "Link reach" setting.
  //
  // 2.8 is what the constant this replaced was named for, and on the corpus
  // board it does give the longest chains (11,10,7,6 against 4,4,4,3 at 1.8).
  // It is not the default because reach past what the game itself accepts is
  // not free: the search proposes a hop the game will not link, the drag clears
  // nothing, and the next scan sees the same board and draws the same chain
  // again -- which looks like the script tapping the same tsums over and over.
  //
  // 2.2 is the middle: 55px against the 45px that was in effect before any of
  // this, so hops grow by about a fifth, and chains on the corpus board go to
  // 8,7,4,3. Raise it while the game keeps accepting the links.
  linkReach: 1.9,
  // Longest chain the board scan may return -- the "Maximum Chain Number"
  // setting, 3-15. 0 is not reachable from the settings UI and is treated as
  // "no limit", which is what a hand-written start() command can ask for.
  maxChain: 3,
  debugLogs: false,
  // What an issue report copies, and so what the router keeps -- see report.ts.
  reportTrailFrames: 8,
  // Pure tiebreak until a corpus says otherwise -- see TsumConfig.pageMinMargin.
  pageMinMargin: 0,
  // Measured and rejected -- see TsumConfig.pageShiftTolerance.
  pageShiftTolerance: false
};

// Top of the square play area in logical coordinates. The board occupies the
// 1080x1080 square below this line; everything above is score/timer chrome.
var PlayAreaTopY = 465;

// --- Game bubbles -------------------------------------------------------
//
// Tiara Minnie+ makes a bubble popped as a chain goes off clear a bigger area,
// so bubbles are worth tapping the instant a long chain lands rather than on
// the play loop's periodic sweep (which is ~50 blind taps and far too slow to
// land inside a chain).
//
// A bubble is a circle like a tsum, only much bigger, so it falls out of the
// same grayscale Hough pass findTsums already runs -- on the capture the scan
// already took, which is what makes locating them cost nothing extra.
var GameBubbleConfig = {
  // Circle geometry in the 200px play-square space findTsums works in, where a
  // tsum is radius 8-14.
  //
  // Measured off the frames of `app.gap.Tsum/debug/gaston_debug6.mp4` through
  // this same pass: a bubble is radius 15-18, and the range that was here
  // (16-30) missed the 15s and took a face under a score popup at 23. At 12 the
  // pass starts returning tsums. Getting it wrong costs stray taps on bare
  // board, which the game ignores -- a tap is not a drag, so nothing links.
  minRadius: 14,
  maxRadius: 22,
  minDist: 30,
  param1: 20,
  param2: 26,

  // Board scans after a skill fires whose bubbles are left alone.
  //
  // A skill's burst is what *makes* most bubbles, and several choreographies --
  // Tiara Minnie+ is the clearest -- return the moment their last aiming tap
  // goes out, before the burst has played out. The loop's very next scan is
  // therefore taken on a board still detonating: it finds the fresh bubbles,
  // and the longest chain it can offer is a scrap of one off a half-empty
  // board. Spending a bubble there is the waste this whole setting exists to
  // avoid, and from the outside it looks like the bubble being popped the
  // instant it appears.
  //
  // One scan, not a duration: it costs nothing on a fast device, scales with a
  // slow one, and nothing is lost by waiting -- every scan re-finds the
  // bubbles, so this only ever moves which chain spends them.
  settleScansAfterSkill: 1,

  // How long a row of the quick sweep waits before the next one.
  //
  // Zero: the quick sweep exists because the alternative is a skill sitting
  // ready while the script sleeps between rows. Cpt. Lightyear's own closing
  // sweep runs 300ms a row over four rows, which is 1.2s of standing still --
  // affordable when nothing is waiting on it, and the whole problem when
  // something is. The taps themselves still cost `tapDuring` each.
  quickSweepLineMs: 0,

  // Chain length that earns a pop.
  minChainForPop: 4,

  // Ceilings on one pop, by how much time there is for it. Which applies is the
  // Bubble Strategy setting's call (`Tsum.bubbleTapBudget`); One Bubble Mid
  // Chain takes exactly one and reads neither.
  //
  // There is a ceiling at all because the radii above are not calibrated, so a
  // frame full of false circles is a real possibility rather than a
  // hypothetical -- and a tap is held for `tapDuring`, so a burst of them is
  // time the link cadence does not have. Mid-chain that budget is the tail of a
  // clear still going off, which is why it is the tighter of the two; ASAP pops
  // between scans, where there is nothing to stay inside.
  //
  // Both are set well above what ordinary play produces: bubbles arrive one or
  // two at a time off a 12+ chain, so these bite on a misread frame, not on a
  // real board.
  maxTapsMidChain: 6,
  maxTapsAsap: 12,
  tapDuring: 10
};

// ---------------------------------------------------------------------------
// The selected tsum's icon: where the game draws it, and how it is reduced to
// something a library entry can be compared against.
//
// `icon` is the thumbnail inside the lower-right button on StartPage -- what the
// device reads before every round to say which tsum is about to play. The
// library it is matched against is not a photograph of that button: it is that
// button, rebuilt. The development tools' lexicon composites each tsum's own
// sprite into the game's own blank button at the transform the game uses, so a library entry
// and a live capture are the same drawing rather than two drawings of the same
// tsum. That is the whole reason the numbers below could be tightened.
//
// The rect is 1080x1920 logical coordinates and square, because it is squashed
// into a square grid and any other aspect would distort the drawing. Change it
// and the library has to be rebuilt: the lexicon reads this object when it
// writes `tsums.dat`, so the two cannot silently disagree.
//
// `maskBottom` and `maskRadius` are the parts nothing is read from, as
// fractions of the rect, masked on **both** sides: an entry and a query only
// mean the same thing if the same cells were dropped from each.
//
// `maskBottom` is the "Lv NN" badge the game draws across the icon's bottom.
//
// `maskRadius` keeps only an ellipse, which drops the corners -- not artwork on
// either side, but the orange button itself, and comparing that to itself is
// comparing the game's furniture. It also takes the store ribbon with it.
//
// Fractions rather than cell counts so that `grid` is a knob that only changes
// resolution. As counts they also changed *how much of the picture* was thrown
// away -- three rows is 19% of a 16-grid and 30% of a 10-grid -- which made a
// smaller grid look far worse than it is.
//
// `grid` is 16, re-measured on the rebuilt library rather than inherited: every
// one of the 769 tsums was matched at 12, 14, 16 and 20 while wearing real
// captures of the ribbon, the badge and a hint toast, and shifted, resampled to
// 1080p, gamma-shifted and JPEG'd on top. All four sizes name every tsum they
// are confident about correctly; 16 carries the best margin per byte, and the
// pairs still confusable at 16 are confusable at 20 as well, because they are
// the same drawing twice (`flynn` / `flynn2`).
//
// `minScore` / `minMargin` are the accept test, in the shape roundStats.ts
// already uses for digits -- a best match has to be good, *and* it has to beat
// the runner-up. The lexicon's `--verify` prints both numbers for every capture
// it holds.
var MyTsumPortrait = {
  // The library file, deployed beside index.js and read on the first round that
  // needs it. `magic` and `format` are its first line, and roundStats.ts
  // refuses a file that does not open with both -- a library cut through a
  // different grid scores against the wrong cells, which is a wrong name rather
  // than a missing one. The lexicon writes all three; they are here because
  // everything else the file's layout depends on already is.
  library: 'tsums.dat',
  magic: 'gap-tsum-portraits',
  format: 'v1',
  // Square, and centred on where the game draws the sprite -- the lexicon
  // fitted that transform against the art itself, so this rect is a crop of a
  // known drawing rather than a box someone framed by eye.
  //
  // 140 logical pixels of the sprite's 242: the widest centred crop that still
  // clears all three things drawn over the icon. The store ribbon comes in from
  // the top right, the Lv badge from the bottom, and a hint toast can sweep the
  // top left; sized against real captures of all three.
  icon: {from: {x: 832, y: 1584}, to: {x: 972, y: 1724}},
  grid: 16,
  maskBottom: 0.1875,
  maskRadius: 0.46,
  // Both moved when the library stopped being screenshots and became the game's
  // own art, and both moved in the helpful direction, because a right answer
  // now scores far higher than it used to: over all 769 tsums the true match
  // sits at 0.98 and only one falls under 0.80.
  //
  // So the score floor can be strict, and buys the case the margin cannot see
  // -- an icon the library does not hold at all, which a later game update will
  // produce. The margin can then be loose, which is what names the art twins
  // (`flynn`/`flynn2`) instead of leaving their cell empty. Measured together:
  // against 0.70/0.08 this names 97% of tsums rather than 91%, *and* invents a
  // name for an unknown icon less often, 12% against 15%.
  minScore: 0.85,
  minMargin: 0.04
};

// What a tsum looks like *on the board*, which is a different question from
// what it looks like in the pre-round button above.
//
// "Link MyTsum first" never identifies a tsum on the board -- `findTsums` finds
// circles and `classifyTsums` groups them by colour, so all `scanBoardQuick`
// does is pick the cluster nearest one reference colour. That reference used to
// be `sampleMyTsumColor()`, an 80x80 box at `Button.gameSkill1`; that point is
// the button's *tap* target, some 60 logical pixels below the portrait, so the
// box lands on the skill gauge and the reference tracked the gauge's charge
// rather than the tsum. Measured over four boards it missed the gate on all
// four, by 59 to 120.
//
// So the reference is precomputed instead, off the same block art the library
// is built from, and looked up by the shorthand `identifyMyTsum()` has already
// read. The lexicon's `board_colors.py` is the long form.
//
// Nothing in the bundle reads `width` or `background`: the derivation script
// does, out of this file, so a colour derived at one width and matched at
// another cannot happen. They were deleted once as unread and that stopped the
// library being regenerated for a week -- leave them.
var MyTsumBoard = {
  // The library header must carry `board=<tag>` before its colour column is
  // trusted. Bumped when anything below changes the numbers: unlike a stale
  // signature, a stale colour gives a *wrong* cluster rather than no answer,
  // and the rest of the file is still perfectly good at naming tsums -- so this
  // is versioned on its own instead of refusing the library whole.
  // 'hsv31' was the HSV read at this width; 'chroma1' is the chroma plane's
  // blur-then-convert read of the same art. The column stays HSV either way
  // and the scan converts on the compare. A library carrying the wrong tag is
  // simply not consulted, and MyTsum comes from the skill-button sample.
  tag: 'chroma1',
  // How wide the game draws a tsum, in the `Config.screenResize` play square.
  // Fitted over the labelled boards, not measured by eye -- and wider than
  // `Config.tsumWidth` (25) on purpose: that one is centre-to-centre spacing
  // of a pile that overlaps, this one is the sprite.
  width: 31,
  // The board blue the colours are derived over, BGR. It reaches the middle of
  // a tsum through the 22px sample blur, so it is part of the derivation rather
  // than a backstop -- but only just: over four boards a fever tint moved the
  // derived colour by under 6.
  background: {b: 90, g: 49, r: 18},
  // How near a cluster has to be to count as MyTsum.
  //
  // NOT MEASURED on the chroma plane. Carried over from the 30 the HSV model
  // used as the same multiple of the merge distance -- two clusters' worth of
  // slack. Worth re-reading off a run's `board.clusters` records now that the
  // library answers again.
  maxDistance: 80
};

// Definitions assuming screen resolution of 1080 * 1920
//
// Deliberately un-annotated. An index-signature type (`{[k: string]: any}`)
// erases the keys, which is what made `Button.gameSkill1` resolve to nothing
// and `Button.gameSkil1` compile. Inferring the literal instead gives every
// entry go-to-definition straight to its coordinates, and makes a mistyped
// name an error at the use site.
//
// The four `outReceive*` entries below carry no `y` of their own -- start()
// patches it in from the matching `*Base` entry, offset by whether the first
// mail row is skipped -- so each is annotated with the shape it has by the time
// anything reads it. All four are colour-matched, so their `color` is declared
// present rather than optional.
/**
 * The pre-game bonus toggles, in screen order. checkGameItem() indexes this and
 * its `isItemsOn` companion by the same positions, so the order is part of the
 * contract rather than an accident of layout.
 */
type GameItemToggles = [
  score: Point, coin: Point, exp: Point, time: Point,
  bubble: Point, fiveToFour: Point, combo: Point
];

/** The wanted on/off state of each toggle above, in the same seven positions. */
type GameItemStates = [
  score: boolean, coin: boolean, exp: boolean, time: boolean,
  bubble: boolean, fiveToFour: boolean, combo: boolean
];

type PatchedYColor = { x: number; y: number; color: Color };
type PatchedYColorPair = { x: number; y: number; color: Color; color2: Color };

var Button = {
  gameBubblesFrom: {x: 100, y: 632},
  gameBubblesTo: {x: 1000, y: 1532},
  gameQuestionCancel: {x: 400, y: 1352},
  gameQuestionCancel2: {x: 400, y: 1072},
  gameStop: {x: 440, y: 1072},
  gameSkill1: {x: 160, y: 1702},
  gameSkill2: {x: 95, y: 1702},
  fan: {x: 985, y: 1652, color: {"a":0,"b":6,"g":180,"r":232}},
  // The seven bonus-item toggles on the pre-game screen, in screen order.
  //
  // Positional: checkGameItem() walks this alongside an `isItemsOn` array built
  // in the same order, so index 5 meaning "5>4" is load-bearing and was only
  // ever recorded in these comments. The labelled tuple puts it in the type,
  // and fixes the length -- adding an eighth toggle here without updating
  // checkGameItem is now a build error rather than a silently ignored item.
  outGameItems: [
    {x: 205, y: 889},    // +Score
    {x: 435, y: 893},    // +Coin
    {x: 651, y: 889},    // +Exp
    {x: 871, y: 893},    // +Time
    {x: 201, y: 1167},   // +Bubble
    {x: 424, y: 1170},   // 5>4
    {x: 610, y: 1175}    // +Combo
  ] as GameItemToggles,
  outStart: {x: 500, y: 1592, color: {"a":0,"b":129,"g":111,"r":236}}, // 開始
  outClose: {x: 500, y: 1592, color: {"a":0,"b":7,"g":180,"r":236}}, // 關閉
  outReceive: {x: 910, y: 422},
  outReceiveAll: {x: 800, y: 1422},
  outReceiveOk: {x: 835, y: 1092, color: {"a":0,"b":6,"g":175,"r":236}},
  outReceiveAllHeartsDisabledJP: {x: 679, y: 880, color: {"a":0,"b":214,"g":129,"r":41}},
  outReceiveAllRubiesEnabledJP: {x: 261, y: 705, color: {"a":0,"b":33,"g":178,"r":247}},
  outReceiveAllOkJP: {x: 835, y: 1258, color: {"a":0,"b":6,"g":175,"r":236}},
  outReceiveItemSetOk: {x: 830, y: 1260, color: {"a":0,"b":8,"g":176,"r":238}},
  outReceiveClose: {x: 530, y: 1372},
  outReceiveOneBase: {y: 569},
  outReceiveOne: {x: 840, color: {"a":0,"b":30,"g":181,"r":235}, color2: {"a":0,"b":119,"g":74,"r":40}} as PatchedYColorPair,
  outReceiveOneRubyBase: {y: 651}, // ruby
  outReceiveOneRuby: {x: 295, color: {r: 224, g: 93, b: 101}} as PatchedYColor, // ruby
  outReceiveOneAdBase: { y: 672 }, // ad
  outReceiveOneAd: { x: 290, color: { r: 90, g: 57, b: 25 } } as PatchedYColor, // ad
  outReceiveOneMedalBase: { y: 645 }, // mission medal
  // The item badge over the thumbnail's bottom-right corner, and the pale
  // blue-white of the mission medal there. Past the photo itself, so a row
  // carrying no medal reads as its badge or as the frame, never as a bright
  // corner of someone's profile picture.
  outReceiveOneMedal: { x: 287, color: { r: 231, g: 247, b: 255 } } as PatchedYColor,
  outReceiveTimeout: {x: 600, y: 1092, color: {"a":0,"b":11,"g":171,"r":235}},
  // The heart column, the list viewport and the scroll gesture are the three
  // heart tables further down; the four `outSendHeart*` row positions,
  // the three end-of-list probes and the close button that used to live here
  // went with the rewrite that replaced them.
  outFriendScoreFrom: {x: 550, y: 935, color: {"a":0,"b":140,"g":93,"r":55}},
  outFriendScoreTo: {x: 760, y: 935},
  /** The Home tab on the hub left rail; `PageDef.home` on every page that has it. */
  outHomePage: {x: 60, y: 1000},
  skillLuke1: {x: 1000, y: 1372},
  skillLuke2: {x: 830, y: 1402},
  skillLuke3: {x: 670, y: 1447},
  skillLuke4: {x: 960, y: 1232},
  skillCptLy1: {x: 670, y: 1050},
  skillCptLy2: {x: 310, y: 1050},
  skillCptLy3: {x: 540, y: 419},
  /** The collection's right-hand sort dropdown; it opens `TsumSortOrder`. */
  outTsumSortOrder: {x: 906, y: 907}
};

// ---------------------------------------------------------------------------
// The mail list, as the one-by-one flow walks it.
//
// Every row is drawn the same, one `rowPitch` below the last, and the flow only
// ever gets the row a tap lands on -- so stepping past a medal means aiming a
// row lower, and running out of rows means scrolling.
//
// Which is why the rows are *found* rather than assumed. A scrolled list does
// not come to rest on a row boundary, and the `outReceive*` probes are fixed
// points; `Tsum.readMailRows` reads the Check buttons off the frame and every
// probe is then offset to the row it picked. At the home position that offset
// is 0 and nothing moves, so the flow reads exactly as it did before.
// ---------------------------------------------------------------------------

var MailList = {
  rowPitch: 202,
  /**
   * How far the button's centre is below `outReceiveOne`, which samples the
   * clear gold above the lettering rather than the middle of the word "Check".
   */
  buttonCentreDy: 29,
  /**
   * Where `readMailRows` looks for those buttons: a column through them that
   * misses the lettering, so a button is one unbroken run of `outReceiveOne`'s
   * gold instead of the three pieces the word cuts it into. `fromY`/`toY` are
   * the list's viewport -- the title bar above and the Claim All bar below are
   * outside it, and a run touching either end belongs to a half-drawn row.
   */
  buttonColumn: {x: 780, fromY: 500, toY: 1345, step: 4},
  /** A run shorter than this is a highlight or a clipped button, not a row. */
  minButtonRun: 50,
  /**
   * One drag of the list, and how long its overscroll bounce takes to settle.
   *
   * Travels 505px: two and a half rows, so the rows land half a row out of
   * phase with where they were. Deliberate -- a run of Mission Clear mails is
   * drawn identically, and a scroll by a whole number of rows would leave the
   * screen looking untouched, which is exactly what `sample` reads as the end
   * of the list.
   */
  scroll: {x: 550, path: [1300, 1130, 965, 795], settleMs: 900},
  /** Where that drag is judged to have moved the list; see `FriendListSample`. */
  sample: {
    xs: [340, 550, 760],
    fromY: 540,
    toY: 1310,
    step: 40,
    threshold: 40,
    minMoved: 10
  } satisfies ListSample,
  /** Drags one pass will spend looking past medals before it gives up. */
  maxScrolls: 6
};

// Every screen the script can recognise.
//
// This is the vocabulary `findPage()` speaks: it returns one of these names (or
// `'unknown'`), and roughly thirty comparisons around the codebase test against
// them. Declaring the set makes those comparisons checked in both directions --
// a name misspelt in the table below, or in a comparison anywhere, is a build
// error rather than a branch that silently never runs.
//
// Several names have more than one entry in `Page`: they are alternative colour
// fingerprints (regional variants, emulator/dpi variants) for one screen, and
// `findPageObject` returns whichever matches. `RootDetection` has eight.
// A `const enum` rather than a union of string literals: it is erased at compile
// time and every use inlines to exactly the string below, so this costs nothing
// at runtime while giving each name one definition to jump to, find references
// on, and rename.
const enum PageName {
  // In game
  GamePlaying = 'GamePlaying',
  GamePause = 'GamePause',
  ScorePage = 'ScorePage',
  HighScore = 'HighScore',
  // Two level-up screens, and they are different screens. `TsumLevelUp` is the
  // post-round panel listing what each tsum in the party earned; `AccountLevelUp`
  // is the player's own rank going up, which interrupts the score tally and
  // waits to be closed.
  TsumLevelUp = 'TsumLevelUp',
  AccountLevelUp = 'AccountLevelUp',
  MagicalTime = 'MagicalTime',
  // The event's own page, seen after a round while an event card is active:
  // the event's result overlay is thrown over the score tally, any tap moves it
  // on to this page, and Close here puts the tally back in front. The overlay
  // itself has no entry -- it is drawn in each event's own colours, so
  // `waitForScorePage` taps it away blind instead (src/roundStats.ts).
  EventMain = 'EventMain',
  // Two more the event puts up at its milestones, both permanent: the card
  // reveal ("Tap to Next"), and the GET! gift dialog with its Close -- the
  // game's generic reward dialog, dismissed the same way wherever it shows.
  EventCardReveal = 'EventCardReveal',
  EventGift = 'EventGift',
  // Home / navigation
  StartPage = 'StartPage',
  FriendPage = 'FriendPage',
  FriendInfo = 'FriendInfo',
  ProfilePage = 'ProfilePage',
  SquarePage = 'SquarePage',
  ClosePage = 'ClosePage',
  TapOpenPage = 'TapOpenPage',
  TapOpenPageDeprecated = 'TapOpenPageDeprecated',
  // Tsum collection and store
  TsumsPage = 'TsumsPage',
  // The three screens of the level-cap sweep. `TsumSortOrder` is the collection's
  // "Change Order" dialog; the other two are the raise confirmation and the toast
  // that says it worked.
  TsumSortOrder = 'TsumSortOrder',
  RaiseLevelCap = 'RaiseLevelCap',
  LevelCapRaised = 'LevelCapRaised',
  TsumTsumStorePage = 'TsumTsumStorePage',
  ConfirmPurchasePage = 'ConfirmPurchasePage',
  BoxPurchasedPage = 'BoxPurchasedPage',
  /** The 10-box tally, with the Close that drops back onto the store. */
  BoxPurchaseResult = 'BoxPurchaseResult',
  /**
   * "Not enough Coins! -- Trade Rubies for more Coins?". Cancel and Buy with
   * Rubies, and this script only ever presses Cancel -- see the entry in `Page`.
   */
  NotEnoughCoins = 'NotEnoughCoins',
  OutOfMedals = 'OutOfMedals',
  RubyResetDifficulty = 'RubyResetDifficulty',
  // Mail / hearts
  MailBox = 'MailBox',
  Received = 'Received',
  ReceiveHeart = 'ReceiveHeart',
  ReceiveHeartWithoutCoins = 'ReceiveHeartWithoutCoins',
  ReceiveSkillTicket = 'ReceiveSkillTicket',
  ReceivePremiumTicket = 'ReceivePremiumTicket',
  GiftHeart = 'GiftHeart',
  HeartSent = 'HeartSent',
  // Missions
  TodayMission = 'TodayMission',
  TodayMissions = 'TodayMissions',
  // Interruptions
  RootDetection = 'RootDetection',
  NetworkDisable = 'NetworkDisable',
  NetworkTimeout = 'NetworkTimeout',
  ExtraUpdate = 'ExtraUpdate',
  // Not a screen: what findPage() reports when nothing fingerprinted. No `Page`
  // entry carries it.
  Unknown = 'unknown',
}

// The button row along the bottom of the score page.
//
// Its arrival is the game's own signal that the post-round count-up has
// finished -- it withholds the row until it has -- so `roundStats.ts` scores
// this list immediately before reading the score and coins
// (`statsScoreButtonsReady`).
//
// The tally draws that row two ways, and both points below sit where the two
// **overlap**. An ordinary round offers Close (x 97..502) beside Play
// (575..982); a round played as part of a point battle cannot be replayed from
// here, so it draws one centred Close (337..740) and no Play at all. Probing the
// old Close and Play spots read that row as a count-up still running: the wait
// spent its whole budget, the row went to the CSV with no score in it, and
// nothing then pressed a button the anchors also missed -- the stall guard
// bounced the game instead. x 355..495 by y 1549..1750 is inside the Close of
// both layouts, and `Page.ScorePage.back` presses the same overlap for the same
// reason.
//
// Clear of the label band too, so the game's own language cannot move them: one
// on the button's lit upper face, one on its shaded lower one. Both read the
// same three bytes on every tally frame in the corpus, and the panel blue behind
// a row that has not arrived yet is 439 and 354 away.
//
// Deliberately *not* part of the `ScorePage` fingerprint: an entry that required
// the row could not name the page until the count-up was over, which is how a
// whole budget got spent watching an `unknown` tally. Detection says the page is
// up; this says it is finished. Kept here rather than inline so a re-measured
// button cannot end up meaning two different pixels.
var ScorePageButtons: PageColor[] = [
  {x: 415, y: 1582, r: 247, g: 190, b: 8, match: true, threshold: 80},  // upper face, separation 439
  {x: 410, y: 1726, r: 231, g: 121, b: 8, match: true, threshold: 80}   // lower face, separation 354
];

// The tally's Close, in the same overlap the probes above are read from: 82px
// inside the ordinary Close's right edge and 83px inside the point-battle
// Close's left one, with ~100px above and below it on either layout. Shared by
// both `ScorePage` entries, so the two cannot come to press different pixels.
var ScorePageClose: Point = {x: 420, y: 1650};

// The Play button's own face -- which only the ordinary tally draws.
//
// The point battle's row is one centred Close (337..740) and no Play, so
// `nav.move.tallyToGame` proves the button is there before pressing it and
// falls back to Close when it is not. This is the proof.
//
// Both pixels sit at x 900: 160px clear of the point-battle Close's right edge,
// and clear of the "Play!" label, which the columns nearer the button's centre
// run through. One on the lit upper face and one on the shaded lower one, the
// pairing `ScorePageButtons` uses on Close.
//
// Measured across all five tally frames in the corpus, through the matcher's
// own read path: the four that draw Play agree within 1, and the point-battle
// frame's panel blue is 412 and 371 away. Nothing rides on the threshold with
// separation like that, so it stays at the 80 the row above uses.
//
// Deliberately not a `Page` entry: which layout the tally drew is a mode of the
// page, and the script only ever learns the page name -- CODEMAP.md, "A mode of
// a screen is not a page". Both layouts fingerprint as `ScorePage`, which is
// what lets `waitForScorePage` read a point battle's numbers at all.
var ScorePagePlay: PageColor[] = [
  {x: 900, y: 1580, r: 255, g: 157, b: 16, match: true, threshold: 80},  // upper face, separation 412
  {x: 900, y: 1700, r: 255, g: 109, b:  8, match: true, threshold: 80}   // lower face, separation 371
];

// The crystal icon of the medals row on the score page.
//
// The tally used to list two rows, exp and coins. A game carrying medals lists
// three, medals in the middle, and the rows do not merely gain one -- the block
// grows both ways, so every row moves and the coin figure lands ~44px lower. Two
// numbers `roundStats.ts` reads are in there, hence a second `ScorePage` entry
// (`ScorePageMedals`) and this list.
//
// Both pixels are on the icon's flat interior, the white highlight band and the
// cyan body below it, and neither moves more than 65 across the pixels around
// it. Against the same coordinates on a no-medals tally -- panel blue there --
// they are 401 and 388 apart, so this is also what `roundStats.ts` asks to find
// out which layout it is reading (`statsScoreMedalsShown`). Kept here rather
// than inline so the fingerprint and that question cannot come to mean two
// different pixels.
//
// `pages:audit` reports the pair as crowded, and there is nowhere else for them:
// the icon is 50px tall, so any two pixels on it are within a capture pixel or
// two of each other. What that costs is redundancy, not separation.
var ScorePageMedalRow: PageColor[] = [
  {x: 356, y: 1026, r: 251, g: 248, b: 253, match: true, threshold: 80},  // white highlight, separation 401
  {x: 344, y: 1042, r: 171, g: 240, b: 255, match: true, threshold: 80}   // cyan body, separation 388
];

// The rail beside Pause and below the Fan: the HUD furniture that says a round
// is running, whatever the board underneath is doing.
//
// Declared apart from the entry that uses it because the fever entry uses it
// too -- the fever screen is this HUD plus the ring below (`FeverProbes`), and
// two copies of these six pixels would be two things to re-measure.
//
// These six were chosen off the fever frames as well as the plain board, and
// that is load-bearing beyond the fingerprint: across all six fever captures no
// probe here moves more than 12 (worst case, the one at 918,1567 against a
// threshold of 40; four of the six do not move at all). So a fever board reads
// as `GamePlaying` on its own, the play loop does not spend a single
// `HudMissesBeforeGameOver` on one, and `OBSCURED_BOARD.md`'s first case is
// closed.
var GamePlayingHudProbes: PageColor[] = [
  {x: 901, y:  197, r: 255, g: 219, b: 0, match: true, threshold: 80},  // stability 2, separation 381, cohesion 0, drift 0
  {x: 918, y: 1636, r: 247, g: 191, b: 0, match: true, threshold: 46},  // stability 7, separation 77, cohesion 4, drift 4
  {x: 856, y:  266, r: 247, g: 190, b: 0, match: true, threshold: 80},  // stability 6, separation 352, cohesion 0, drift 0
  {x: 979, y:  255, r: 247, g: 199, b: 0, match: true, threshold: 80},  // stability 3, separation 357, cohesion 0, drift 0
  {x: 918, y: 1567, r: 255, g: 219, b: 0, match: true, threshold: 40},  // stability 4, separation 44, cohesion 0, drift 12
  {x: 916, y: 1707, r: 231, g: 120, b: 8, match: true, threshold: 40}   // stability 7, separation 51, cohesion 3, drift 3
];

// Fever time, as four pixels.
//
// A fever is not a screen of its own -- it is the board with the lights turned
// down and the gauge at the bottom turned into a glowing timer -- so it has no
// `PageName` and is read on demand by `Tsum.isFeverTime` (src/fever.ts). This
// list is also what `Page.GamePlayingFever` adds to the HUD rail above, so the
// two answers cannot disagree.
//
// Two facts, deliberately, because either alone is a lie the screen tells often:
//
//   the ring is lit      the gauge's outline goes white while a fever runs, and
//                        it is drawn *over* a full-screen skill animation -- so
//                        this survives the frames where nothing else does.
//                        On its own it would also accept a bright fill on the
//                        ordinary gauge (it fills yellow, with its own glow).
//   the board is dimmed  the chrome behind the HUD drops from light blue to
//                        near-black teal. On its own this accepts every dimmed
//                        overlay the game draws -- the pause menu, the level-up
//                        panel and the Magical Time offer all darken the same
//                        pixels (measured 65-78 apart, which is why the
//                        threshold here is 60 rather than 80).
//
// Together they take a fever apart from all of those: over the corpus the six
// fever frames clear every probe with 21/80, 31/60 and 27/60 to spare, and no
// other frame comes within 336 of the two bright ones. Measured on 1080x1920
// captures and re-checked at 540x960; a device the plain `GamePlaying` entry
// needs its own fingerprint for (480x800) has not been measured for fever.
var FeverProbes: PageColor[] = [
  {x: 648, y: 1634, r: 255, g: 255, b: 255, match: true, threshold: 80},  // ring, top stroke -- identical on all six fever frames
  {x: 462, y: 1697, r: 255, g: 251, b: 248, match: true, threshold: 80},  // ring, bottom stroke -- worst frame 21 away
  {x: 660, y: 1736, r:   0, g:  35, b:  46, match: true, threshold: 60},  // dimmed chrome just under the gauge -- worst 31
  {x: 135, y: 1813, r:   7, g:  37, b:  50, match: true, threshold: 60}   // dimmed chrome, bottom strip -- worst 27
];

// The level-up overlay dims the whole screen, and these four points are where
// that is cheapest to prove: two beside the score capsule, two below the board.
// All four are constant HUD art rather than board, which is why they read so
// alike -- 13-20 on every one of the five corpus frames, whatever round drew
// them.
//
// They are what keeps a level-up entry off a bright page, and the reason the
// three entries below needed them. Every hub screen draws a button or a bar at
// all four (the coin bars, the Play row, the bottom frame): the *lowest* any of
// FriendPage, ProfilePage, SquarePage or StartPage reads is 372, against a
// level-up worst of 20. The threshold sits at 120 -- six times the darkest
// reading, a third of the brightest -- so nothing here is close.
//
// `pages:studio` will rate each one unusable on its own, and it is right to: a
// dark pixel says nothing about *which* dim screen this is, and Magical Time and
// the gift dialog are just as dark here. That is the pill probes' job. An entry
// is a conjunction, and these four are the half of it the old entries were
// missing -- nine samples of panel blue with nothing to say that the friends
// list, which is also a column of panel blue, was not it.
var LevelUpDimmedChrome: PageColor[] = [
  {x: 300, y:  250, r: 0, g: 0, b: 0, match: true, threshold: 120},  // left of the score capsule, hub reads 416+
  {x: 800, y:  250, r: 0, g: 0, b: 0, match: true, threshold: 120},  // right of the score capsule, hub reads 392+
  {x: 540, y: 1600, r: 0, g: 0, b: 0, match: true, threshold: 120},  // the fever bar, hub reads 408+
  {x: 150, y: 1750, r: 0, g: 0, b: 0, match: true, threshold: 120}   // below the skill button, hub reads 646+
];

// `satisfies` rather than a plain annotation: every entry is still checked
// against PageDef, but the inferred type keeps the exact key set, so
// `Page.ClosePage.back` resolves to the coordinates below. It also keeps each
// entry's `name` as its literal type rather than widening it to `PageName`.
// The fingerprint loops that walk the table by string key cast to `PageMap` for
// an index signature (see findPageObject).
var Page = {

  TodayMissions: {
    name: PageName.TodayMissions,
    colors: [
      {x: 764, y: 445, r: 248, g: 190, b: 15, match: true, threshold: 80},
      {x: 781, y: 436, r: 165, g: 92, b: 63, match: true, threshold: 80},
      {x: 823, y: 445, r: 248, g: 249, b: 249, match: true, threshold: 80},
      {x: 554, y: 444, r: 45, g: 111, b: 142, match: true, threshold: 80},
      {x: 550, y: 1421, r: 33, g: 196, b: 231, match: true, threshold: 80},
      {x: 593, y: 1423, r: 240, g: 175, b: 8, match: true, threshold: 80},
      {x: 176, y: 1658, r: 238, g: 172, b: 8, match: true, threshold: 80},
      {x: 55, y: 1649, r: 238, g: 172, b: 8, match: true, threshold: 80},
      {x: 25, y: 1655, r: 8, g: 16, b: 26, match: true, threshold: 80}
    ],
    back: {x: 176, y: 1662},
    next: {x: 176, y: 1662}
  },
  TodayMission: {
    name: PageName.TodayMission,
    colors: [
      {x: 540, y: 1480, r: 238, g: 181, b: 12 , match: true, threshold: 80},
      {x: 975, y: 500, r: 161, g: 224, b: 231, match: true, threshold: 80},
      {x: 554, y: 1332, r: 24 , g: 189, b: 219, match: true, threshold: 80}
    ],
    back: {x: 558, y: 1473},
    next: {x: 558, y: 1473}
  },
  // Fingerprints the tally, not the buttons.
  //
  // Close and Play used to be two of these five, which made "the page is up" and
  // "the count-up has finished" the same question. A tally whose buttons were
  // still on their way therefore read `unknown`, and waitForScorePage spent its
  // whole budget watching a screen it could not name -- then wrote the round
  // with no score and no coins. 81 of the 162 frames the unread-shot recorder
  // kept are exactly that: the three probes below passing, and empty panel blue
  // where the buttons go.
  //
  // The count-up guard has not gone anywhere: `statsScoreButtonsReady`
  // (roundStats.ts) scores `ScorePageButtons` on a fresh frame immediately
  // before the numbers are read, which is where it belongs rather than on
  // whichever frame the sweep happened to take.
  ScorePage: {
    name: PageName.ScorePage,
    variant: 'no-medals',
    colors: [
      {x: 356, y:  972, r: 248, g: 247, b:  65, match: true, threshold: 85},  // stability 28, star icon
      {x: 356, y: 1086, r: 249, g: 252, b:  11, match: true, threshold: 80},  // stability 20, coin icon
      {x: 359, y:  507, r: 253, g: 250, b: 253, match: true, threshold: 80},  // stability 9,  white "Score" band
      // Both measured across the 81 recorded frames and confirmed against the
      // 1080x1920 corpus capture: drawn with the panel, not with the buttons.
      {x: 170, y: 1426, r: 247, g: 174, b:   8, match: true, threshold: 80},  // drift 29, missions gear
      {x: 900, y: 1200, r:  41, g:  73, b: 121, match: true, threshold: 80}   // drift 13, panel interior, right
    ],
    // Close, pressed where the two button rows overlap rather than at the
    // centre of either -- see `ScorePageButtons` for the measurements. The
    // centre of the ordinary Close is off the point-battle row's left edge, and
    // a tap that lands on panel blue leaves the tally up for good.
    //
    // `next` is Play, which the point-battle row does not draw at all, so
    // pressing it is conditional in a way pressing Close is not:
    // `nav.move.tallyToGame` scores `ScorePagePlay` first and leaves the tally
    // to Close when the button is not there.
    back: ScorePageClose,
    next: {x: 784, y: 1653}
  },
  // The same tally with a medals row in it -- see `ScorePageMedalRow` above.
  //
  // Three rows instead of two, and the block grows both ways rather than
  // downwards, so the star icon the entry above probes at y 972 is panel blue
  // here and the two entries are mutually exclusive on it. The three probes
  // they share are the furniture outside the block, which does not move.
  ScorePageMedals: {
    name: PageName.ScorePage,
    variant: 'medals',
    colors: ScorePageMedalRow.concat([
      {x: 350, y:  944, r: 255, g: 225, b:  72, match: true, threshold: 80},  // star icon, drift 410
      {x: 356, y: 1112, r: 247, g: 242, b:  22, match: true, threshold: 80},  // coin icon, drift 78
      {x: 359, y:  507, r: 253, g: 250, b: 253, match: true, threshold: 80},  // white "Score" band
      {x: 170, y: 1426, r: 247, g: 174, b:   8, match: true, threshold: 80},  // missions gear
      {x: 900, y: 1200, r:  41, g:  73, b: 121, match: true, threshold: 80}   // panel interior, right
    ]),
    // The medals row moves the tally block, not the buttons under it.
    back: ScorePageClose,
    next: {x: 784, y: 1653}
  },
  ProfilePageJp: {
    name: PageName.ProfilePage,
    colors: [
      {x: 540, y: 1592, r: 246, g: 135, b:  17, match: true, threshold: 80}, // top of the start button
      {x: 187, y: 1599, r: 240, g: 218, b:  72, match: true, threshold: 80}, // top of the card button
      {x: 799, y: 1653, r: 232, g: 170, b:   7, match: true, threshold: 80}, // left of the myTsum button
      {x: 698, y:  464, r: 244, g: 249, b: 243, match: true, threshold: 80}, // above the ranking title
      {x:  34, y: 1004, r: 247, g: 178, b:   8, match: true, threshold: 80}, // left home tab button
      {x:  6, y: 1120, r:  46, g: 135, b: 232, match: true, threshold: 80}, // left ranking tab button
      {x:  6, y: 1270, r:  44, g: 134, b: 233, match: true, threshold: 80}  // left square tab button
    ],
    back: {x: 31, y: 1126},
    next: {x: 31, y: 1126},
    tsums: {x: 900, y: 1653}
  },
  ProfilePageIntl: {
    name: PageName.ProfilePage,
    colors: [
      {x: 540, y: 1592, r: 246, g: 135, b:  17, match: true, threshold: 80}, // top of the start button
      {x: 187, y: 1599, r: 240, g: 218, b:  72, match: true, threshold: 80}, // top of the card button
      {x: 799, y: 1653, r: 232, g: 170, b:   7, match: true, threshold: 80}, // left of the myTsum button
      {x: 698, y:  464, r: 244, g: 249, b: 243, match: true, threshold: 80}, // above the ranking title
      {x:  34, y: 1004, r: 247, g: 178, b:   8, match: true, threshold: 80}, // left home tab button
      {x:   6, y: 1120, r:  46, g: 135, b: 232, match: true, threshold: 80}, // left ranking tab button
      {x:   6, y: 1270, r:  52, g:  98, b: 143, match: true, threshold: 80}  // left border where in JP left square tab button is
    ],
    back: {x: 31, y: 1126},
    next: {x: 31, y: 1126},
    tsums: {x: 900, y: 1653}
  },
  SquarePage: {
    name: PageName.SquarePage,
    colors: [
      {x: 540, y: 1592, r: 246, g: 135, b:  17, match: true, threshold: 80}, // top of the start button
      {x: 187, y: 1599, r: 240, g: 218, b:  72, match: true, threshold: 80}, // top of the card button
      {x: 799, y: 1653, r: 232, g: 170, b:   7, match: true, threshold: 80}, // left of the myTsum button
      {x:  18, y:  994, r:  46, g: 135, b: 234, match: true, threshold: 80}, // left home tab button
      {x:  16, y: 1120, r:  46, g: 135, b: 232, match: true, threshold: 80}, // left ranking tab button
      {x:  34, y: 1270, r: 247, g: 175, b:   8, match: true, threshold: 80}  // left square tab button
    ],
    back: {x: 31, y: 1126},
    next: {x: 31, y: 1126},
    home: Button.outHomePage
  },
  FriendPage: {
    name: PageName.FriendPage,
    colors: [
      {x: 540, y: 1592, r: 246, g: 135, b: 17 , match: true, threshold: 80}, // top of the start button
      {x: 187, y: 1599, r: 240, g: 218, b: 72 , match: true, threshold: 80}, // top of the card button
      {x: 799, y: 1653, r: 232, g: 170, b: 7  , match: true, threshold: 80}, // left of the myTsum button
      {x: 698, y: 464, r: 244, g: 249, b: 243, match: true, threshold: 80}, // left top of the ranking time
      {x: 960, y: 430, r: 24, g: 192, b: 231, match: true, threshold: 80}, // right bottom next to the mailbox icon
      {x:  20, y: 1124, r: 243, g: 172, b:   8, match: true, threshold: 80}  // left ranking tab, selected
    ],
    back: {x: 547, y: 1653},
    next: {x: 547, y: 1653},
    tsums: {x: 900, y: 1653},
    mail: {x: 910, y: 422},
    home: Button.outHomePage
  },
  FriendPage2: {
    name: PageName.FriendPage,
    colors: [
      {x: 540, y: 1649, r: 175, g: 188, b: 197, match: true, threshold: 80}, // center of the Tsum Hades
      {x: 187, y: 1599, r: 240, g: 218, b: 72 , match: true, threshold: 80}, // top of the card button
      {x: 799, y: 1653, r: 232, g: 170, b: 7  , match: true, threshold: 80}, // left of the myTsum button
      {x: 698, y: 464, r: 244, g: 249, b: 243, match: true, threshold: 80}, // left top of the ranking time
      {x: 960, y: 430, r: 24, g: 192, b: 231, match: true, threshold: 80}, // right bottom next to the mailbox icon
      {x:  20, y: 1124, r: 243, g: 172, b:   8, match: true, threshold: 80}  // left ranking tab, selected
    ],
    back: {x: 547, y: 1653},
    next: {x: 547, y: 1653},
    tsums: {x: 900, y: 1653},
    mail: {x: 910, y: 422},
    home: Button.outHomePage
  },
  FriendPage3: {
    name: PageName.FriendPage,
    colors: [
      {x: 540, y: 1649, r: 203, g: 192, b: 237, match: true, threshold: 80}, // center of the Tsum Ursula
      {x: 187, y: 1599, r: 240, g: 218, b: 72 , match: true, threshold: 80}, // top of the card button
      {x: 799, y: 1653, r: 232, g: 170, b: 7  , match: true, threshold: 80}, // left of the myTsum button
      {x: 698, y: 464, r: 244, g: 249, b: 243, match: true, threshold: 80}, // left top of the ranking time
      {x: 960, y: 430, r: 24, g: 192, b: 231, match: true, threshold: 80}, // right bottom next to the mailbox icon
      {x:  20, y: 1124, r: 243, g: 172, b:   8, match: true, threshold: 80}  // left ranking tab, selected
    ],
    back: {x: 547, y: 1653},
    next: {x: 547, y: 1653},
    tsums: {x: 900, y: 1653},
    mail: {x: 910, y: 422},
    home: Button.outHomePage
  },
  FriendPage4: {
    name: PageName.FriendPage,
    colors: [
      {x: 540, y: 1649, r: 79 , g: 89 , b: 94 , match: true, threshold: 80}, // center of the Tsum Maleficentd
      {x: 187, y: 1599, r: 240, g: 218, b: 72 , match: true, threshold: 80}, // top of the card button
      {x: 799, y: 1653, r: 232, g: 170, b: 7  , match: true, threshold: 80}, // left of the myTsum button
      {x: 698, y: 464, r: 244, g: 249, b: 243, match: true, threshold: 80}, // left top of the ranking time
      {x: 960, y: 430, r: 24, g: 192, b: 231, match: true, threshold: 80}, // right bottom next to the mailbox icon
      {x:  20, y: 1124, r: 243, g: 172, b:   8, match: true, threshold: 80}  // left ranking tab, selected
    ],
    back: {x: 547, y: 1653},
    next: {x: 547, y: 1653},
    tsums: {x: 900, y: 1653},
    mail: {x: 910, y: 422},
    home: Button.outHomePage
  },
  GiftHeart: {
    name: PageName.GiftHeart,
    colors: [
      {x: 216, y: 1084, r: 233, g: 172, b: 6  , match: true, threshold: 80},
      {x: 673, y: 1080, r: 235, g: 174, b: 8  , match: true, threshold: 80},
      {x: 468, y: 803, r: 214, g: 61 , b: 143, match: true, threshold: 100},
      {x: 572, y: 561, r: 30 , g: 193, b: 224, match: true, threshold: 80},
      {x: 583, y: 1195, r: 28 , g: 186, b: 221, match: true, threshold: 80}
    ],
    // Cancel, not OK. These were the other way round, which made every blind
    // exit from this dialog -- `nav.move.back`, an unknown-page escape -- send
    // the heart it was asking about.
    back: {x: 320, y: 1091},
    next: {x: 774, y: 1095}
  },
  // The "Heart sent!" toast, which has no buttons and clears itself.
  //
  // Without an entry of its own it fingerprinted as `Received` -- that entry is
  // three probes wide and the toast covers all three -- so the heart sender and
  // `navigate` both tapped `Received.back`, which lands on the friend list
  // underneath. Seven probes on the cyan frame, so it wins over `Received` on
  // evidence rather than on slack.
  HeartSent: {
    name: PageName.HeartSent,
    colors: [
      {x: 300, y: 690 , r: 24, g: 195, b: 231, match: true, threshold: 80},
      {x: 140, y: 720 , r: 33, g: 203, b: 239, match: true, threshold: 80},
      {x: 940, y: 690 , r: 41, g: 203, b: 247, match: true, threshold: 80},
      {x: 300, y: 1050, r: 33, g: 199, b: 239, match: true, threshold: 80},
      {x: 140, y: 1050, r: 24, g: 186, b: 231, match: true, threshold: 80},
      {x: 940, y: 1080, r: 41, g: 207, b: 247, match: true, threshold: 80},
      {x: 540, y: 890 , r: 49, g: 85 , b: 132, match: true, threshold: 80}
    ],
    // The toast swallows a tap anywhere, so aim at the toast itself: if the
    // game ever stops swallowing it, this still lands on the panel rather than
    // on the friend row behind it.
    back: {x: 540, y: 890},
    next: {x: 540, y: 890}
  },
  MailBox: {
    name: PageName.MailBox,
    colors: [
      {x: 738, y: 414, r: 255, g: 251, b: 255, match: true, threshold: 80},
      {x: 550, y: 1581, r: 238, g: 187, b: 10 , match: true, threshold: 80},
      {x: 604, y: 1419, r: 234, g: 171, b: 6  , match: true, threshold: 80}
    ],
    back: {x: 561, y: 1653},
    next: {x: 561, y: 1653}
  },
  MailBox2: {
    name: PageName.MailBox,
    colors: [
      {x: 738, y: 414, r: 240, g: 245, b: 239, match: true, threshold: 80},
      {x: 550, y: 1581, r: 238, g: 187, b: 10 , match: true, threshold: 80},
      {x: 619, y: 1426, r: 19 , g: 137, b: 175, match: true, threshold: 80}
    ],
    back: {x: 561, y: 1653},
    next: {x: 561, y: 1653}
  },
  ReceiveHeart: {
    name: PageName.ReceiveHeart,
    colors: [
      {x: 208, y: 1080, r: 233, g: 172, b: 6  , match: true, threshold: 80},
      {x: 662, y: 1080, r: 232, g: 171, b: 5  , match: true, threshold: 80},
      {x: 561, y: 554, r: 28 , g: 191, b: 222, match: true, threshold: 80},
      {x: 565, y: 1210, r: 30 , g: 195, b: 225, match: true, threshold: 80},
      {x: 334, y: 817, r: 213, g: 62 , b: 143, match: true, threshold: 90},
      {x: 586, y: 821, r: 248, g: 249, b: 51 , match: true, threshold: 100}
    ],
    back: {x: 774, y: 1095},
    next: {x: 320, y: 1091}
  },
  Received: {
    name: PageName.Received,
    colors: [
      {x: 799, y: 716, r: 30, g: 188, b: 223, match: true, threshold: 80},
      {x: 806, y: 889, r: 45, g: 80 , b: 122, match: true, threshold: 80},
      {x: 799, y: 1048, r: 27, g: 188, b: 217, match: true, threshold: 80}
    ],
    back: {x: 774, y: 1095},
    next: {x: 320, y: 1091}
  },
  Received2: {
    name: PageName.Received,
    colors: [
      {x: 799, y: 716, r: 30, g: 188, b: 223, match: true, threshold: 80},
      {x: 889, y: 824, r: 40, g: 72 , b: 111, match: true, threshold: 80},
      {x: 799, y: 1048, r: 27, g: 188, b: 217, match: true, threshold: 80}
    ],
    back: {x: 774, y: 1095},
    next: {x: 320, y: 1091}
  },
  StartPage: {
    name: PageName.StartPage,
    colors: [
      {x: 752, y: 471, r: 244, g: 249, b: 243, match: true, threshold: 80},
      {x: 856, y: 1430, r: 30 , g: 193, b: 224, match: true, threshold: 80},
      {x: 169, y: 1581, r: 239, g: 188, b: 11 , match: true, threshold: 80},
      {x: 547, y: 1581, r: 235, g: 118, b: 134, match: true, threshold: 80},
      {x: 792, y: 1660, r: 234, g: 171, b: 8  , match: true, threshold: 100}
    ],
    back: {x: 190, y: 1646},
    next: {x: 558, y: 1635},
    tsums: {x: 900, y: 1653}
  },
  StartPage2: {
    name: PageName.StartPage,
    colors: [
      {x: 820,  y: 515, r: 245, g: 250, b: 244, match: true, threshold: 80},
      {x: 954,  y: 1426, r: 31 , g: 190, b: 220, match: true, threshold: 80},
      {x: 180,  y: 1584, r: 235, g: 182, b: 8  , match: true, threshold: 80},
      {x: 540,  y: 1584, r: 238, g: 115, b: 133, match: true, threshold: 80},
      {x: 1011, y: 1675, r: 229, g: 166, b: 11 , match: true, threshold: 100}
    ],
    back: {x: 190, y: 1646},
    next: {x: 558, y: 1635}
  },
  StartPage3: {
    name: PageName.StartPage,
    colors: [
      {x: 400,  y: 1672, r: 245, g: 85, b: 115, match: true, threshold: 80},
      {x: 680,  y: 1672, r: 245, g: 85, b: 115, match: true, threshold: 80},
      {x: 540,  y: 1722, r: 235, g: 70, b: 90 , match: true, threshold: 80}
    ],
    back: {x: 190, y: 1646},
    next: {x: 558, y: 1635}
  },
  TsumsPage: {
    name: PageName.TsumsPage,
    colors: [
      {x: 27,   y: 901, r: 197, g: 243, b: 254, match: true, threshold: 80},   // light header bar, far left (sort-independent)
      {x: 436,  y: 902, r: 247, g: 247, b: 247, match: true, threshold: 80},   // white header gap between "Collection" and the dropdowns (sort-independent)
      {x: 713,  y: 900, r: 247, g: 187, b: 16,  match: true, threshold: 80},   // "All Tsums" (left) dropdown gold fill
      {x: 1030, y: 900, r: 249, g: 190, b: 19,  match: true, threshold: 80}    // right (sort) dropdown gold beside the arrow -- right-anchored, survives every sort label
    ],
    // The card grid, the padlock badges and the raise-cap button are
    // `CollectionGrid`, below -- a table rather than fields on this entry,
    // because they are readings the unlock sweep takes off a screen it has
    // already recognised, not evidence about which screen it is.
    back: {x: 176, y: 1592},
    next: {x: 176, y: 1592},
    store: {x: 910, y: 1592}
  },
  // The collection's "Change Order" dialog. Swept like any other page: the white
  // title band over the cyan panel is unlike anything else in the corpus, and the
  // three dark-blue probes below it pin the layout -- the two gaps between button
  // rows and the empty half of row three, none of which move when a different
  // order is the selected (gold) one.
  TsumSortOrder: {
    name: PageName.TsumSortOrder,
    colors: [
      {x: 224, y:  461, r:  33, g: 199, b: 239, match: true, threshold: 80},  // panel top, cyan
      {x: 734, y:  461, r:  33, g: 199, b: 239, match: true, threshold: 80},  // panel top, cyan
      {x: 170, y:  521, r: 222, g: 247, b: 255, match: true, threshold: 80},  // title band, left of the text
      {x: 872, y:  497, r: 239, g: 251, b: 255, match: true, threshold: 80},  // title band, right of the text
      {x: 540, y:  838, r:  57, g:  97, b: 156, match: true, threshold: 45},  // gap between button rows 1 and 2
      {x: 540, y: 1068, r:  57, g:  97, b: 148, match: true, threshold: 45},  // gap between button rows 2 and 3
      {x: 760, y: 1185, r:  49, g:  85, b: 140, match: true, threshold: 65},  // row 3 has no right-hand button
      {x: 930, y: 1375, r:  33, g: 199, b: 239, match: true, threshold: 45}   // bottom strip, right of its label
    ],
    // Close is the dialog's only exit; the order buttons are choices, not ways
    // out, so they are `CollectionSortDialog.buttons` instead.
    back: {x: 539, y: 1652},
    next: {x: 539, y: 1652}
  },
  // The raise confirmation, and the toast that follows it.
  //
  // Both are `targeted`: the game draws them with chrome it shares with other
  // dialogs, and outside the wording there is no pixel that tells them apart.
  // `RaiseLevelCap` is `GiftHeart`'s sprite -- identical down every edge, the
  // heart and the cost pill being the only difference -- and `LevelCapRaised` is
  // `HeartSent`'s. A swept entry here would have more probes than either of
  // those and would take their frames, so these two answer `matches()` only,
  // which is all the unlock sweep asks: it has just pressed the button that
  // raises them. Probes are the flattest pixels on each (stability <= 5), since
  // `matches()` compares per channel at <= 20 and ignores the thresholds below.
  //
  // The aliasing runs the other way too, and that is worth knowing: a sweep over
  // the `LevelCapRaised` frame answers `Received`, whose `Received2` entry
  // passes on it with three probes to spare (errors of 16, 6 and 24 against a
  // threshold of 80). Its two cyan probes land on the toast's bands and its dark
  // one on the message strip -- the same three-band chrome. Harmless as it
  // stands, because every edge off `Received` is a tap the toast also swallows,
  // and it is what a device log means when it says the sweep saw `Received`
  // during a raise. Separating them wants a corpus frame of the real received-
  // items panel, which would show whether its OK button can be probed; there is
  // none, so `Received` is left alone rather than retuned against a guess.
  // `npm run pages:eval` reports the claim on the targeted row.
  RaiseLevelCap: {
    name: PageName.RaiseLevelCap,
    targeted: true,
    colors: [
      {x: 440, y:  530, r:  33, g: 199, b: 239, match: true, threshold: 40},  // cyan band above the panel
      {x: 116, y:  659, r:  33, g:  65, b: 107, match: true, threshold: 40},  // panel, left gutter
      {x: 956, y:  653, r:  33, g:  65, b: 107, match: true, threshold: 40},  // panel, right gutter
      {x: 368, y: 1049, r: 247, g: 186, b:   8, match: true, threshold: 40},  // Cancel, top edge
      {x: 518, y: 1046, r:  57, g:  97, b: 148, match: true, threshold: 40},  // panel between the buttons
      {x: 692, y: 1052, r: 247, g: 182, b:   8, match: true, threshold: 40},  // OK, top edge
      {x: 782, y: 1187, r:  33, g: 203, b: 239, match: true, threshold: 40}   // cyan band below the panel
    ],
    back: {x: 315, y: 1080},  // Cancel
    next: {x: 764, y: 1080}   // OK -- pays the coins
  },
  LevelCapRaised: {
    name: PageName.LevelCapRaised,
    targeted: true,
    colors: [
      {x: 188, y:  686, r:  33, g: 199, b: 239, match: true, threshold: 40},  // cyan band above the message
      {x: 878, y:  686, r:  33, g: 199, b: 239, match: true, threshold: 40},
      {x: 155, y:  836, r:  33, g:  65, b: 107, match: true, threshold: 40},  // message band, left of the text
      {x: 935, y:  836, r:  33, g:  65, b: 107, match: true, threshold: 40},  // message band, right of the text
      {x: 269, y: 1031, r:  33, g: 203, b: 239, match: true, threshold: 40},  // cyan band below the message
      {x: 848, y: 1028, r:  33, g: 203, b: 239, match: true, threshold: 40}
    ],
    // The toast carries no button and swallows a tap anywhere, so both anchors
    // aim at the toast itself rather than at the collection behind it.
    back: {x: 539, y: 959},
    next: {x: 539, y: 959}
  },
  TsumTsum2025StorePage: {
    name: PageName.TsumTsumStorePage,
    colors: [
      {x: 30, y: 910, r: 8, g: 52, b: 99, match: true, threshold: 30},
      {x: 60, y: 910, r: 247, g: 170, b: 8, match: true, threshold: 40},
      {x: 520, y: 910, r: 237, g: 174, b: 8, match: true, threshold: 30},
      {x: 545, y: 840, r: 22, g: 65, b: 107, match: true, threshold: 30},
      {x: 570, y: 910, r: 16, g: 89, b: 173, match: true, threshold: 30},
      {x: 10, y: 955, r: 37, g: 71, b: 115, match: true, threshold: 30},
      {x: 170, y: 1490, r: 48, g: 81, b: 130, match: true, threshold: 30},
      {x: 170, y: 1515, r: 8, g: 164, b: 213, match: true, threshold: 30},
      {x: 170, y: 1570, r: 255, g: 199, b: 8, match: true, threshold: 30}
    ],
    back: {x: 190, y: 1650},
    next: {x: 1000, y: 690, r: 238, g: 172, b: 8}
  },
  ConfirmPurchaseBoxPage: {
    name: PageName.ConfirmPurchasePage,
    colors: [
      {x: 208, y: 1070, r: 247, g: 176, b: 8, match: true, threshold: 30},  // left of Cancel button
      {x: 420, y: 1070, r: 247, g: 176, b: 8, match: true, threshold: 30},  // right of Cancel button
      {x: 540, y: 1070, r: 54, g: 93, b: 146, match: true, threshold: 30},  // between buttons
      {x: 650, y: 1070, r: 247, g: 176, b: 8, match: true, threshold: 30},  // left of OK button
      {x: 880, y: 1070, r: 247, g: 176, b: 8, match: true, threshold: 30},  // right of OK button
      {x: 948, y: 1066, r: 33, g: 69, b: 107, match: true, threshold: 30},  // right next to OK button
      {x: 805, y: 1265, r: 239, g: 167, b: 8, match: true, threshold: 50}   // left of List button
    ],
    back: {x: 310, y: 1070},  // Cancel button
    next: {x: 760, y: 1070}   // OK button
  },
  Confirm2025PurchaseBoxPage: {
    name: PageName.ConfirmPurchasePage,
    colors: [
      {x: 208, y: 1070, r: 247, g: 186, b:   8, match: true, threshold: 30},  // left of Cancel button
      {x: 420, y: 1070, r: 247, g: 184, b:   8, match: true, threshold: 30},  // right of Cancel button
      {x: 540, y: 1070, r:  54, g:  90, b: 141, match: true, threshold: 30},  // between buttons
      {x: 650, y: 1070, r: 247, g: 190, b:   8, match: true, threshold: 30},  // left of OK button
      {x: 880, y: 1070, r: 247, g: 191, b:  14, match: true, threshold: 30},  // right of OK button
      {x: 948, y: 1066, r:  40, g:  70, b: 113, match: true, threshold: 30},  // right next to OK button
      {x: 785, y: 1320, r: 238, g: 171, b:   8, match: true, threshold: 50}   // left of List button
    ],
    back: {x: 310, y: 1070},  // Cancel button
    next: {x: 760, y: 1070}   // OK button
  },
  ConfirmPurchaseCapsulePage: {
    name: PageName.ConfirmPurchasePage,
    colors: [
      {x: 200, y: 1444, r: 247, g: 178, b: 8, match: true, threshold: 30},  // left of Cancel button
      {x: 426, y: 1444, r: 247, g: 178, b: 8, match: true, threshold: 30},  // right of Cancel button
      {x: 540, y: 1444, r: 54, g: 93, b: 146, match: true, threshold: 30},  // between buttons
      {x: 660, y: 1444, r: 247, g: 174, b: 8, match: true, threshold: 30},  // left of OK button
      {x: 860, y: 1444, r: 247, g: 178, b: 8, match: true, threshold: 30},  // right of OK button
      {x: 940, y: 1444, r: 33, g: 65, b: 107, match: true, threshold: 30},  // right next to OK button
      {x: 416, y: 790, r: 239, g: 28, b: 49, match: true, threshold: 40}    // red top of big pickup capsule image
    ],
    back: {x: 320, y: 1444},  // Cancel button
    next: {x: 766, y: 1444}   // OK button
  },
  Confirm2025PurchaseCapsulePage: {
    name: PageName.ConfirmPurchasePage,
    colors: [
      {x: 200, y: 1464, r: 247, g: 178, b: 8, match: true, threshold: 30},      // left of Cancel button
      {x: 426, y: 1464, r: 247, g: 178, b: 8, match: true, threshold: 30},      // right of Cancel button
      {x: 540, y: 1464, r: 54, g: 93, b: 146, match: true, threshold: 30},      // between buttons
      {x: 660, y: 1464, r: 247, g: 174, b: 8, match: true, threshold: 30},      // left of OK button
      {x: 860, y: 1464, r: 247, g: 178, b: 8, match: true, threshold: 30},      // right of OK button
      {x: 940, y: 1464, r: 33, g: 65, b: 107, match: true, threshold: 30},      // right next to OK button
      {x: 836, y: 1152, r: 255, g: 255, b: 255, match: true, threshold: 30},    // lower left of slash in "15/15"
      {x: 860, y: 1081, r: 255, g: 255, b: 255, match: true, threshold: 30},    // upper right of slash in "15/15"
      {x: 860, y: 1152, r: 48, g: 81, b: 127, match: true, threshold: 30}       // blue area under slash in "15/15"
    ],
    back: {x: 320, y: 1464},  // Cancel button
    next: {x: 766, y: 1464}   // OK button
  },
  TapOpenPageBox: {
    name: PageName.TapOpenPage,
    colors: [
      {x: 641, y: 328, r: 255, g: 255, b: 231, match: true, threshold: 30},
      {x: 641, y: 243, r: 255, g: 255, b: 247, match: true, threshold: 39},
      {x: 180, y: 520, r: 247, g: 182, b: 189, match: true, threshold: 34},
      {x: 899, y: 777, r: 140, g: 121, b: 156, match: true, threshold: 30},
      {x: 68, y: 1265, r: 33, g: 73, b: 107, match: true, threshold: 30},
      {x: 964, y: 1265, r: 33, g: 73, b: 115, match: true, threshold: 30},
      {x: 534, y: 1840, r: 33, g: 190, b: 231, match: true, threshold: 30}
    ],
    back: {x: 500, y: 1600},
    next: {x: 500, y: 1600}
  },
  TapOpenPageCapsule: {
    name: PageName.TapOpenPage,
    colors: [
      {x: 70, y: 560, r: 24, g: 85, b: 132, match: true, threshold: 30},
      {x: 899, y: 777, r: 137, g: 117, b: 148, match: true, threshold: 30},
      {x: 68, y: 1265, r: 33, g: 73, b: 107, match: true, threshold: 30},
      {x: 964, y: 1265, r: 33, g: 73, b: 115, match: true, threshold: 30},
      {x: 405, y: 1397, r: 255, g: 255, b: 255, match: true, threshold: 30}, // T from "TAP!"
      {x: 546, y: 1429, r: 255, g: 255, b: 255, match: true, threshold: 30}, // A from "TAP!"
      {x: 664, y: 1407, r: 255, g: 255, b: 255, match: true, threshold: 30}, // P from "TAP!"
      {x: 709, y: 1381, r: 255, g: 255, b: 255, match: true, threshold: 40} // ! from "TAP!"
    ],
    back: {x: 500, y: 1600},
    next: {x: 500, y: 1600}
  },
  TapOpenPageCapsuleDeprecated: {
    name: PageName.TapOpenPageDeprecated,
    colors: [
      {x: 620, y: 328, r: 205, g: 13, b: 34, match: true, threshold: 40},
      {x: 641, y: 243, r: 146, g: 0, b: 0, match: true, threshold: 40},
      {x: 70, y: 560, r: 24, g: 85, b: 132, match: true, threshold: 30},
      {x: 899, y: 777, r: 137, g: 117, b: 148, match: true, threshold: 30},
      {x: 68, y: 1265, r: 33, g: 73, b: 107, match: true, threshold: 30},
      {x: 964, y: 1265, r: 33, g: 73, b: 115, match: true, threshold: 30},
      {x: 534, y: 1840, r: 33, g: 190, b: 231, match: true, threshold: 30}
    ],
    back: {x: 500, y: 1600},
    next: {x: 500, y: 1600}
  },
  BoxPurchasedPage: {
    name: PageName.BoxPurchasedPage,
    colors: [
      {x: 156, y: 1077, r: 33, g: 195, b: 231, match: true, threshold: 30},
      {x: 48, y: 998, r: 24, g: 52, b: 82, match: true, threshold: 30},
      {x: 131, y: 1134, r: 33, g: 65, b: 107, match: true, threshold: 30},
      {x: 928, y: 1077, r: 33, g: 203, b: 239, match: true, threshold: 30},
      {x: 923, y: 1183, r: 33, g: 65, b: 107, match: true, threshold: 30},
      {x: 904, y: 1396, r: 33, g: 199, b: 239, match: true, threshold: 30},
      {x: 389, y: 1634, r: 247, g: 174, b: 8, match: true, threshold: 30},
      {x: 279, y: 1627, r: 41, g: 77, b: 115, match: true, threshold: 34},
      {x: 525, y: 1823, r: 24, g: 158, b: 189, match: true, threshold: 40}
    ],
    back: {x: 550, y: 1630},  // Close button
    next: {x: 550, y: 1630}   // Close button
  },
  PremiumPlusBoxPurchasedPage: {
    name: PageName.BoxPurchasedPage,
    colors: [
      {x: 156, y: 1077, r: 33, g: 195, b: 231, match: true, threshold: 30},
      {x: 48, y: 998, r: 33, g: 66, b: 99, match: true, threshold: 30},
      {x: 131, y: 1137, r: 33, g: 62, b: 101, match: true, threshold: 30},
      {x: 928, y: 1075, r: 33, g: 203, b: 236, match: true, threshold: 30},
      {x: 922, y: 1184, r: 33, g: 65, b: 107, match: true, threshold: 30},
      {x: 904, y: 1396, r: 33, g: 199, b: 239, match: true, threshold: 30},
      {x: 389, y: 1634, r: 238, g: 174, b: 8, match: true, threshold: 30},
      {x: 280, y: 1626, r: 63, g: 103, b: 147, match: true, threshold: 40},
      {x: 525, y: 1823, r: 40, g: 210, b: 247, match: true, threshold: 30}
    ],
    back: {x: 550, y: 1630},  // Close button
    next: {x: 550, y: 1630}   // Close button
  },
  // The tally a 10-Time box purchase ends on: all ten tsums in a 4/4/2 grid
  // inside a cyan-framed panel, under a white "Box Purchase Result" band, over
  // the dimmed reveal scene.
  //
  // The grid cells are what changes every purchase, so every probe is outside
  // them: the title band, the panel's bottom frame, the two interior margins
  // left and right of the cells, and the dark surround beside the panel. The
  // last one is the Close button, so the entry means "the tally, ready to be
  // dismissed" -- it is drawn about a second after the panel, and the reveal
  // loop's advance tap is harmless on the tally in the meantime.
  //
  // Authored on a 540x960 device capture and checked against a 604-wide frame
  // cut from a screen recording: two resolutions and two capture paths, agreeing
  // to within 12 absColor at every probe, which is what the thresholds are sized
  // against. The Close probe sits at the top of the button rather than at its
  // centre, clear of the label glyphs 40px below.
  //
  // `ClosePage`'s one-pixel catch-all also passes on this screen; ten probes
  // against its one is what settles a sweep, since `betterPageMatch` ranks on
  // evidence before slack.
  BoxPurchaseResultPage: {
    name: PageName.BoxPurchaseResult,
    colors: [
      {x:   40, y: 1470, r:   8, g:  16, b:  24, match: true, threshold: 50},  // dimmed surround, left of the panel
      {x: 1040, y: 1470, r:   8, g:  16, b:  24, match: true, threshold: 50},  // ... and right of it
      {x:  300, y:  420, r: 247, g: 251, b: 255, match: true, threshold: 50},  // white title band
      {x:  600, y:  420, r: 255, g: 255, b: 255, match: true, threshold: 50},
      {x:  800, y:  420, r: 255, g: 251, b: 255, match: true, threshold: 50},
      {x:  300, y: 1470, r:  33, g: 203, b: 239, match: true, threshold: 50},  // cyan panel frame, below the last row
      {x:  700, y: 1470, r:  33, g: 203, b: 239, match: true, threshold: 50},
      {x:  110, y:  900, r:  33, g:  65, b: 107, match: true, threshold: 50},  // panel interior, left of the cells
      {x:  970, y:  900, r:  33, g:  65, b: 107, match: true, threshold: 50},  // ... and right of them
      {x:  540, y: 1595, r: 247, g: 182, b:   8, match: true, threshold: 50}   // Close, above its label
    ],
    back: {x: 540, y: 1652},  // Close -- measured centre of a button spanning y 1552..1752
    next: {x: 540, y: 1652}   // Close
  },
  // "Not enough Coins! -- Trade Rubies for more Coins?", thrown over whatever
  // asked for the coins.
  //
  // **Both anchors are Cancel, deliberately.** `next` is the other button on
  // every other two-button screen in this table, and here the other button
  // spends rubies. Nothing in this project may buy them on the player's behalf,
  // and an anchor is pressed by the generic movers as well as by the flow that
  // raised the screen -- so the safe tap is the only tap the table offers.
  //
  // It shares its whole frame with `ConfirmPurchasePage` -- same panel, same
  // header and footer bands, same button row -- so the two probes that separate
  // them carry the entry: the second button reaches further left here than the
  // confirm dialog's OK does, and the confirm dialog's taller footer covers a
  // point this dialog leaves as dimmed background.
  NotEnoughCoins: {
    name: PageName.NotEnoughCoins,
    colors: [
      {x: 200, y:  560, r:  33, g: 207, b: 247, match: true, threshold: 50},  // cyan header band
      {x: 540, y:  560, r:  33, g: 199, b: 239, match: true, threshold: 50},
      {x: 880, y:  560, r:  33, g: 199, b: 239, match: true, threshold: 50},
      {x: 200, y: 1220, r:  24, g: 190, b: 231, match: true, threshold: 50},  // cyan footer band
      {x: 880, y: 1220, r:  33, g: 199, b: 239, match: true, threshold: 50},
      {x: 200, y: 1072, r: 239, g: 170, b:   8, match: true, threshold: 50},  // Cancel
      {x: 540, y: 1072, r:  57, g:  93, b: 148, match: true, threshold: 50},  // the gap between the buttons
      {x: 620, y: 1072, r: 247, g: 178, b:  16, match: true, threshold: 50},  // Buy with Rubies -- the confirm dialog is background here
      {x: 540, y: 1320, r:   8, g:  20, b:  24, match: true, threshold: 50}   // below the panel -- the confirm dialog's footer reaches here
    ],
    back: {x: 315, y: 1072},  // Cancel
    next: {x: 315, y: 1072}   // Cancel as well -- see above
  },
  GamePause: {
    name: PageName.GamePause,
    colors: [
      {x: 366, y:  654, r: 255, g: 251, b: 254, match: true, threshold: 80},  // stability 1, separation 419
      {x: 155, y: 1227, r: 245, g: 179, b:   8, match: true, threshold: 80},  // stability 8, separation 296
      {x: 623, y: 1221, r: 255, g: 192, b:   8, match: true, threshold: 80},  // stability 12, separation 150
      {x: 477, y: 1595, r: 246, g: 178, b:   7, match: true, threshold: 40}  // stability 4, separation 32
    ],
    back: {x: 318, y: 1078},
    next: {x: 539, y: 1657}
  },
  GamePlaying480x800: {
    name: PageName.GamePlaying,
    colors: [
      {x: 916, y: 198, r: 253, g: 216, b: 0, match: true, threshold: 80}, // above pause
      {x: 916, y: 318, r: 241, g: 161, b: 8, match: true, threshold: 80}, // below pause
      {x: 916, y: 1688, r: 242, g: 161, b: 8, match: true, threshold: 80} // below fan
    ],
    back: {x: 986, y: 273},
    next: {x: 986, y: 273}
  },
  GamePlaying: {
    name: PageName.GamePlaying,
    colors: GamePlayingHudProbes,
    back: {x: 986, y: 273},
    next: {x: 986, y: 273}
  },
  // The same board with a fever running. Declared so the corpus's `fever-time`
  // configuration has an entry that claims it (`npm run pages:eval` reports one
  // that nothing fingerprints) and so the page history says which of the two was
  // on screen. It is the HUD list plus `FeverProbes`, which is what makes it win
  // over the plain entry above while a fever is up: `betterPageMatch` ranks on
  // confirmed probes first, and ten beats six.
  //
  // Nothing branches on this key. `variant` is documentation and tooling by
  // contract (see PageDef), and the script only ever learns the page *name* --
  // code that wants the fever state reads it for itself through
  // `Tsum.isFeverTime` / `gFever`, off the same `FeverProbes` below.
  GamePlayingFever: {
    name: PageName.GamePlaying,
    variant: 'fever-time',
    colors: GamePlayingHudProbes.concat(FeverProbes),
    back: {x: 986, y: 273},
    next: {x: 986, y: 273}
  },
  // The board in the closing seconds of a round.
  //
  // The game flashes the whole screen with a pale cyan wash as the timer runs
  // out, and it pulses: over the five captured frames the six
  // `GamePlayingHudProbes` move between 32 and 208 away from what they want,
  // (901,197) reading 42, 49, 67, 102 and 137. Every probe in
  // `GamePlayingHudProbes` is lost partway up that ramp, so the board stopped
  // fingerprinting for part of every second of the last few -- and four looks
  // in a row landing on the flash handed the round to `confirmGameOver`, which
  // does not play. That is the "it stops playing for the last few seconds"
  // report in BACKLOG.md.
  //
  // A threshold wide enough to hold the plain entry through a 208-wide swing
  // would not be a fingerprint any more, so this is the third route in
  // OBSCURED_BOARD.md § Phase 2: pixels the overlay does not move. The wash
  // pulls colour towards white, so what survives it is what is already near
  // white -- the dotted outlines around Pause, the Fan and the skill button,
  // and the pale chrome at the top right. Each colour below is the midpoint of
  // that pixel's range across all fifteen `corpus/GamePlaying` frames, tinted
  // and not, which is why none of them is quite the colour the untinted board
  // shows.
  //
  // Six probes, not more, on purpose: it ties the plain entry on count, so on an
  // untinted board `betterPageMatch` falls through to slack and `GamePlaying`
  // still wins with its exact match. This one only answers when it is the only
  // one that can.
  //
  // Not measured: a fever still running as the timer expires. Every probe here
  // sits on furniture the fever backdrop leaves alone (they clear all six fever
  // frames by 21 or more), so it should hold, but no capture shows both at once.
  GamePlayingLastSeconds: {
    name: PageName.GamePlaying,
    variant: 'last-seconds',
    colors: [
      {x:  864, y:  198, r: 222, g: 213, b:  29, match: true, threshold: 95},  // stability 64, separation 372, Pause dots
      {x:  894, y:  288, r: 223, g: 185, b:  29, match: true, threshold: 85},  // stability 54, separation 352, Pause dots
      {x: 1005, y:  312, r: 190, g: 233, b: 227, match: true, threshold: 90},  // stability 62, separation 308, chrome, top right
      {x:  828, y: 1584, r: 222, g: 234, b: 227, match: true, threshold: 60},  // stability 34, separation 266, Fan dots
      {x:  909, y: 1545, r: 227, g: 187, b:  40, match: true, threshold: 86},  // stability 57, separation 244, Fan rim
      {x:  252, y: 1590, r: 167, g: 202, b: 232, match: true, threshold: 80}   // stability 50, separation 269, skill button dots
    ],
    back: {x: 986, y: 273},
    next: {x: 986, y: 273}
  },
  // Root-detection warning (a native Android AlertDialog) as it looks on a
  // handful of emulators. All variants share the page name so the navigation
  // loops handle them the same way: hand the screen to dismissSystemDialog(),
  // which finds the real "PERMIT" button in device pixels. The back/next
  // coordinates below belong to one specific emulator and dpi each, so they are
  // only a last-resort hint -- see dialogs.ts for why they cannot be trusted.
  // The matched variant's key is still logged, so detection stays diagnosable.
  RootDetectionLdp1080p480dpiEn: {
    name: PageName.RootDetection,
    colors: [
      {x: 80, y: 690, r: 255 , g: 255, b: 255, match: true, threshold: 25},
      {x: 70, y: 680,  r: 255 , g: 255, b: 255, match: false, threshold: 25},
      {x: 1000, y: 1300, r: 255 , g: 255, b: 255, match: true, threshold: 37},
      {x: 1010, y: 1310, r: 255 , g: 255, b: 255, match: false, threshold: 25}
    ],
    back: {x: 855, y: 1224},
    next: {x: 855, y: 1224}
  },
  RootDetectionLdp1080p480dpiJp: {
    name: PageName.RootDetection,
    colors: [
      {x: 80, y: 635, r: 255 , g: 255, b: 255, match: true, threshold: 25},
      {x: 70, y: 625, r: 255 , g: 255, b: 255, match: false, threshold: 25},
      {x: 1000, y: 1360, r: 255 , g: 255, b: 255, match: true, threshold: 25},
      {x: 1010, y: 1370, r: 255 , g: 255, b: 255, match: false, threshold: 25}
    ],
    back: {x: 850, y: 1280},
    next: {x: 850, y: 1280}
  },
  RootDetectionLdp480x800x160dpiEn: {
    name: PageName.RootDetection,
    colors: [
      {x: 90, y: 780, r: 253 , g: 253, b: 253, match: true, threshold: 25},
      {x: 65, y: 745, r: 255 , g: 255, b: 255, match: false, threshold: 25},
      {x: 990, y: 1190, r: 252 , g: 252, b: 252, match: true, threshold: 25},
      {x: 1015, y: 1225, r: 255 , g: 255, b: 255, match: false, threshold: 25}
    ],
    back: {x: 885, y: 1135},
    next: {x: 885, y: 1135}
  },
  RootDetectionNox1080p360dpiEn: {
    name: PageName.RootDetection,
    colors: [
      {x: 135, y: 795, r: 255 , g: 255, b: 255, match: true, threshold: 25},
      {x: 125, y: 785, r: 255 , g: 255, b: 255, match: false, threshold: 25},
      {x: 945, y: 1170, r: 255 , g: 255, b: 255, match: true, threshold: 25},
      {x: 955, y: 1180, r: 255 , g: 255, b: 255, match: false, threshold: 25}
    ],
    back: {x: 850, y: 1115},
    next: {x: 850, y: 1115}
  },
  RootDetectionNox480x800x160dpiJp: {
    name: PageName.RootDetection,
    colors: [
      {x: 85, y: 735, r: 255 , g: 255, b: 255, match: true, threshold: 29},
      {x: 75, y: 725, r: 255 , g: 255, b: 255, match: false, threshold: 25},
      {x: 995, y: 1240, r: 255 , g: 255, b: 255, match: true, threshold: 25},
      {x: 1005, y: 1250, r: 255 , g: 255, b: 255, match: false, threshold: 25}
    ],
    back: {x: 885, y: 1170},
    next: {x: 885, y: 1170}
  },
  RootDetectionNox480x800x160dpiEn: {
    name: PageName.RootDetection,
    colors: [
      {x: 85, y: 760, r: 255 , g: 255, b: 255, match: true, threshold: 25},
      {x: 75, y: 750, r: 255 , g: 255, b: 255, match: false, threshold: 25},
      {x: 995, y: 1215, r: 255 , g: 255, b: 255, match: true, threshold: 30},
      {x: 1005, y: 1225, r: 255 , g: 255, b: 255, match: false, threshold: 25}
    ],
    back: {x: 885, y: 1150},
    next: {x: 885, y: 1150}
  },
  RootDetectionSamsungA20En: {
    name: PageName.RootDetection,
    colors: [
      {x: 60, y: 440, r: 255 , g: 255, b: 255, match: true, threshold: 29},
      {x: 50, y: 440, r: 255 , g: 255, b: 255, match: false, threshold: 25},
      {x: 60, y: 430, r: 255 , g: 255, b: 255, match: false, threshold: 25},
      {x: 1020, y: 1310, r: 255 , g: 255, b: 255, match: true, threshold: 40},
      {x: 1020, y: 1320, r: 255 , g: 255, b: 255, match: false, threshold: 25},
      {x: 1010, y: 1325, r: 255 , g: 255, b: 255, match: false, threshold: 25}
    ],
    back: {x: 850, y: 1230},
    next: {x: 850, y: 1230}
  },
  // White AlertDialog variant on 1080x1920 portrait: a white popup box over a
  // dimmed grey background, with blue "REFUSE" / "PERMIT" link-style buttons
  // bottom-right.
  // Only the panel/scrim probes are kept: probes on the button text itself never
  // matched, because findPageObject reads a screenshot downscaled to 360px wide
  // and JPEG-compressed, which leaves nothing of a thin blue glyph at a guessed
  // position. The panel/scrim shape is coarse on purpose -- the tap that follows
  // is located and verified by dismissSystemDialog(), not by these coordinates.
  RootDetection1080pEn: {
    name: PageName.RootDetection,
    colors: [
      {x: 950, y:  868, r: 255, g: 255, b: 255, match: true,  threshold: 40}, // white dialog interior (top-right)
      {x: 540, y: 1100, r: 255, g: 255, b: 255, match: true,  threshold: 25}, // white dialog interior (below buttons)
      {x: 540, y:  300, r: 255, g: 255, b: 255, match: false, threshold: 25}, // dimmed grey overlay above dialog
      {x: 540, y: 1500, r: 255, g: 255, b: 255, match: false, threshold: 25}  // dimmed grey overlay below dialog
    ],
    back: {x: 932, y: 1059}, // estimated PERMIT position, hint only
    next: {x: 932, y: 1059}
  },
  MagicalTime: {
    name: PageName.MagicalTime,
    variant: 'pre-2025',
    colors: [
      {x: 592, y:  858, r: 255, g:  97, b: 124, match: true, threshold: 80},  // stability 21, separation 230
      {x: 701, y: 1224, r: 247, g: 173, b:  10, match: true, threshold: 80},  // stability 4, separation 272
      {x: 223, y: 1219, r: 243, g: 171, b:   0, match: true, threshold: 80},  // stability 15, separation 420
      {x: 301, y:  512, r: 252, g:  250, b: 251, match: true, threshold: 75}  // stability 24, separation 10
    ],
    back: {x: 315, y: 1220},
    next: {x: 761, y: 1224}
  },
  // The redrawn dialog: same buttons and the same white title band, but the
  // whole panel sits ~130px lower and the score rows are reworded ("Previous
  // High Score" / "Current Score"). None of the four probes above survive that,
  // which is why a round that offered Magical Time read `unknown` and nothing
  // cancelled it.
  //
  // No probe on the ruby gem this time: it is small and glossy, and the best
  // point on it still moves by 65 within +/-8px against a threshold of 80. The
  // dark strip *between* the two buttons stands in as the discriminator -- it is
  // what says there are two buttons here rather than one wide one.
  MagicalTime2025: {
    name: PageName.MagicalTime,
    variant: '2025',
    colors: [
      {x: 200, y:  530, r:  33, g: 205, b: 241, match: true, threshold: 80},  // stability 28, cyan dialog frame
      {x: 301, y:  640, r: 255, g: 254, b: 255, match: true, threshold: 75},  // stability 19, white title band
      {x: 300, y: 1325, r: 247, g: 186, b:   8, match: true, threshold: 80},  // stability 8,  Cancel body
      {x: 545, y: 1330, r:  57, g:  96, b: 148, match: true, threshold: 80},  // stability 17, gap between buttons
      {x: 700, y: 1330, r: 247, g: 181, b:   8, match: true, threshold: 80}   // stability 12, OK body
    ],
    back: {x: 320, y: 1355},
    next: {x: 767, y: 1355}
  },
  OutOfMedals: {
    name: PageName.OutOfMedals,
    colors: [
      {x: 127, y:  873, r:  74, g:  74, b:  74, match: true, threshold: 80},  // mickey left-side ear
      {x: 186, y:  898, r: 255, g: 213, b: 188, match: true, threshold: 80},  // mickey face
      {x: 865, y:  879, r: 247, g: 251, b: 255, match: true, threshold: 80},  // donald face
      {x: 474, y: 1065, r: 238, g: 174, b:   8, match: true, threshold: 80},  // left button
      {x: 540, y: 1070, r:  56, g:  91, b: 140, match: true, threshold: 80},  // blue between both buttons
      {x: 595, y: 1066, r: 238, g: 171, b:   8, match: true, threshold: 80}   // right button
    ],
    back: {x: 300, y: 1080},
    next: {x: 300, y: 1080}
  },
  NetworkDisable: {
    name: PageName.NetworkDisable,
    colors: [
      {x: 478, y: 1080, r: 236, g:  94, b: 116, match: true, threshold: 80},
      {x: 932, y: 1077, r: 232, g: 171, b:   5, match: true, threshold: 80}
    ],
    back: {x: 885, y: 1080},
    next: {x: 885, y: 1084}
  },
  NetworkTimeout: {
    name: PageName.NetworkTimeout,
    colors: [
      {x: 530, y: 590, r: 33, g: 197, b: 234, match: true, threshold: 80},
      {x: 530, y: 620, r: 59, g: 94, b: 148, match: true, threshold: 80},
      {x: 478, y: 1080, r: 232, g: 171, b: 5, match: true, threshold: 80},
      {x: 932, y: 1077, r: 232, g: 171, b: 5, match: true, threshold: 80},
      {x: 530, y: 1150, r: 59, g: 94, b: 148, match: true, threshold: 80},
      {x: 530, y: 1170, r: 33, g: 197, b: 234, match: true, threshold: 80}
    ],
    back: {x: 885, y: 1084},
    next: {x: 885, y: 1084}
  },
  FriendInfo: { // FriendInfo of Friend Page, SocailAccount of Setting Page
    name: PageName.FriendInfo,
    colors: [
      {x: 565, y: 576, r:  31, g: 190, b: 220, match: true, threshold: 80},
      {x: 547, y: 1195, r:  27, g: 192, b: 222, match: true, threshold: 80},
      {x: 554, y: 1332, r: 238, g: 186, b:  12, match: true, threshold: 80}
    ],
    back: {x: 576, y: 1408},
    next: {x: 576, y: 1408}
  },
  // --- Level Up, every way it is drawn -------------------------------------
  //
  // The screen lists one panel per tsum in the party, and the party is not
  // always five: the 5->4 bonus ("play with four tsums") takes one away, and a
  // one-tsum party collapses the list to a single panel. The stack stays
  // centred whatever its height, so the layouts do not merely shift -- they
  // interleave. Every four-panel row lands between two five-panel rows, the top
  // five-panel row (y 395-570) is empty board on the four-panel screen, and the
  // lone panel sits at y~960, which is the gap between panels on the
  // four-panel one.
  //
  // So there is no probe list that covers them all, and each configuration gets its
  // own entry under `PageName.TsumLevelUp`. Nothing downstream sees the difference:
  // `findPage()` reports the name, and every caller wanting "the level-up
  // screen" gets it whichever layout showed up. `variant` is for the corpus
  // tooling -- `npm run pages:eval` reports coverage per configuration, so a
  // layout with no entry reads as a missing fingerprint rather than as a
  // fingerprint that works half the time. The corpus's ANNOTATIONS.md lists them.
  // Five panels. `LevelUpDimmedChrome` proves the overlay is up; the four pill
  // probes below prove the stack is the five-panel one, and are chosen on
  // *drift* -- how differently the other two layouts draw the same pixel -- for
  // exactly that reason. Their separation is near zero and that is expected:
  // panel blue is panel blue wherever it is drawn, which is the whole trouble
  // the dimmed-chrome probes exist to fix.
  //
  // Two of the nine this entry used to carry are gone rather than moved:
  // (669,892) and (669,659) drifted 12 and 258 but separated 8 and 0, so
  // between them they said neither which page nor which layout. A probe that
  // measures nothing is not free -- `betterPageMatch` ranks on probe count, so
  // it is a vote for this entry over a shorter honest one.
  TsumLevelUp: {
    name: PageName.TsumLevelUp,
    variant: 'no-bonus',
    colors: LevelUpDimmedChrome.concat([
      {x: 661, y:  425, r: 54, g: 92, b: 145, match: true, threshold: 75},  // panel 1, drift 295
      {x: 453, y:  790, r: 52, g: 90, b: 143, match: true, threshold: 65},  // panel 2 gutter, drift 298
      {x: 443, y: 1025, r: 57, g: 94, b: 150, match: true, threshold: 65},  // panel 3 gutter, drift 451
      {x: 669, y: 1367, r: 56, g: 95, b: 148, match: true, threshold: 80}   // panel 5, drift 286, separation 97
    ]),
    back: {x: 300, y: 1660},
    next: {x: 300, y: 1660}
  },
  // The four-panel layout, probed in the two columns a panel keeps clear
  // whatever it is showing: the margin between its left edge and the tsum icon
  // (x 216) and the gutter between the icon and the text (x 450). The exp and
  // score numbers move with the tsum's state -- an unowned tsum reads "You
  // don't have this Tsum yet" and has no score row at all -- so the text column
  // is not somewhere a probe can live, however flat it looks on one screenshot.
  // The gaps between panels are no better: they show the dimmed board, which is
  // a different picture every round.
  //
  // The margin probe sat at x 240 once, which a wide-eared icon reaches: Bianca
  // and Stitch in panel 2 both failed it, the panel went unrecognised, and the
  // tally wait -- which renews itself only on a page it can name -- gave up
  // with the level-up still standing, so the whole round went to the CSV
  // blank. x 216 reads the same on all five four-panel frames in the corpus.
  //
  // `drift` in the comments is how far each pixel is from the same coordinate on
  // the five-panel frame, which is what says this list is evidence for *this*
  // layout: the margin probes sit in a gap on the other one.
  //
  // This is the entry that was pressing the Card button on the hub. All nine of
  // its probes separated by less than their own threshold, four of them by
  // nothing at all, and on four the nearest frame in the whole corpus was a
  // FriendPage one -- four evenly spaced panels of dark blue down the middle of
  // the screen is also what the weekly ranking looks like. It reached seven of
  // nine on both friends frames, so a different friends list was all it took;
  // nine probes then outranked FriendPage's six, and the level-up Close at
  // (300,1660) is the hub's Card button. `LevelUpDimmedChrome` is what makes
  // that impossible rather than unlikely.
  TsumLevelUp5to4Bonus: {
    name: PageName.TsumLevelUp,
    variant: '5to4-bonus',
    colors: LevelUpDimmedChrome.concat([
      {x: 450, y:  641, r: 57, g: 95, b: 148, match: true, threshold: 40},  // panel 1 gutter, drift 302
      {x: 216, y:  864, r: 24, g: 56, b:  99, match: true, threshold: 40},  // panel 2 left margin, drift 153
      {x: 450, y: 1271, r: 56, g: 94, b: 147, match: true, threshold: 40},  // panel 4 gutter, drift 282
      {x: 450, y: 1379, r: 54, g: 92, b: 145, match: true, threshold: 80}   // panel 4 gutter low, drift 255, separation 49
    ]),
    back: {x: 300, y: 1660},
    next: {x: 300, y: 1660}
  },
  // One panel, and only one -- the party held a single tsum, so the stack
  // collapses to one pill centred at y~960. It straddles the rows of both
  // multi-panel layouts, which is why neither entry above sees it: on the
  // five-panel frame y 960 is the gap between panels 3 and 4.
  //
  // Probed on the panel's own background, in the four places the pill keeps
  // clear whatever tsum it is showing: the margin left of the icon (x 240), the
  // strip above the "Lv" row (y 875), the strip below the "Score" row (y ~1040)
  // and the column right of the exp bar (x ~795). The icon, the two numbers,
  // the exp fill and the score row all move with the tsum and the round.
  //
  // This entry also passes the five-panel frame -- at these coordinates panel 3
  // is drawn the same way -- which costs nothing, since both report
  // `PageName.TsumLevelUp`. The reverse does not hold, which is why it is a
  // third entry rather than a widened one. The low-drift probes are what carry
  // that: (797,911) and (791,1034) drift 7 and 25, so they read the same on
  // both stacks.
  //
  // The best-separating pill probes in the table are here -- 41 to 86 against
  // thresholds of 40 to 58 -- and that is still only "weak", every one of them
  // inside twice its own threshold. Six were kept, chosen to keep both jobs:
  // separation where there is any, and the two low-drift ones that hold the
  // five-panel frame.
  TsumLevelUpSingleTsum: {
    name: PageName.TsumLevelUp,
    variant: 'single-tsum',
    colors: LevelUpDimmedChrome.concat([
      {x: 239, y:  971, r: 33, g:  60, b: 107, match: true, threshold: 40},  // left margin, separation 41, drift 172
      {x: 302, y: 1046, r: 24, g:  55, b:  99, match: true, threshold: 40},  // below the Score row, separation 48, drift 195
      {x: 353, y: 1043, r: 24, g:  56, b: 106, match: true, threshold: 58},  // below the Score row, separation 86, drift 119
      {x: 791, y: 1034, r: 33, g:  64, b: 107, match: true, threshold: 40},  // below the Score row, right, separation 56, drift 25
      {x: 797, y:  911, r: 35, g:  69, b: 115, match: true, threshold: 40},  // right of the exp bar, separation 43, drift 7
      {x: 845, y: 1010, r: 24, g:  54, b:  90, match: true, threshold: 45}   // right margin, separation 55, drift 104
    ]),
    back: {x: 300, y: 1660},
    next: {x: 300, y: 1660}
  },
  HighScore: {
    name: PageName.HighScore,
    colors: [
      {x: 576, y: 1325, r: 238, g: 187, b:  10, match: true, threshold: 80}, // top yellow of close button
      {x: 576, y: 1082, r:  33, g: 194, b: 231, match: true, threshold: 80}, // bottom light blue of highscore cell
      {x: 576, y:  762, r:  33, g: 194, b: 231, match: true, threshold: 80}, // top light blue of highscore cell
      {x: 576, y:  820, r:  64, g: 109, b: 171, match: true, threshold: 80}  // inner dark blue of highscore cell
    ],
    back: {x: 576, y: 1325},
    next: {x: 576, y: 1325}
  },
  // The player's rank going up, not a tsum's: a star with "Lv<n>", a Level Up
  // Bonus panel and a Close button, thrown over the score tally a moment after
  // it appears.
  //
  // Probed on the two things the screen draws the same way for every account:
  // the "Level Up" title art and the star behind the level number. Everything
  // else moves or is shared -- the number itself changes, the bonus rows differ
  // per level, and the cyan panel and Close button are the same furniture
  // `HighScore` draws (separation there is under a threshold's worth, which
  // is why no probe sits on them).
  //
  // Without an entry this screen fell through to `ClosePage`, the one-pixel
  // catch-all: enough for the navigation band to tap it, but not something
  // `waitForScorePage` could recognise as an interruption to sit out.
  AccountLevelUp: {
    name: PageName.AccountLevelUp,
    colors: [
      {x: 234, y: 237, r: 255, g: 138, b:   0, match: true, threshold: 80},  // title, stability 4, separation 258
      {x: 234, y: 273, r: 255, g: 150, b:   0, match: true, threshold: 80},  // title, stability 7, separation 249
      {x: 582, y: 237, r: 255, g: 139, b:   0, match: true, threshold: 80},  // title, stability 6, separation 216
      {x: 678, y: 237, r: 255, g: 138, b:   0, match: true, threshold: 80},  // title, stability 3, separation 316
      {x: 414, y: 615, r: 255, g: 200, b:  40, match: true, threshold: 80},  // star upper left, stability 7, separation 202
      {x: 582, y: 575, r: 255, g: 235, b: 140, match: true, threshold: 80},  // star top body, stability 6, separation 244
      {x: 468, y: 790, r: 173, g:  57, b:   7, match: true, threshold: 80},  // star lower left, stability 8, separation 214
      {x: 564, y: 822, r: 173, g:  73, b:  16, match: true, threshold: 80},  // star lower body, stability 4, separation 232
      {x: 600, y: 826, r: 173, g:  67, b:  16, match: true, threshold: 80}   // star lower right, stability 10, separation 229
    ],
    back: {x: 540, y: 1652},
    next: {x: 540, y: 1652}
  },
  // The event's own page, reached by tapping the result overlay away. Probed on
  // the one thing every event card draws the same: the yellow Card / Close /
  // How to Play row at the bottom, and the dark gaps between the three. Nothing
  // above it is safe -- the mission card at the top is event art, and this one
  // event alone draws it cream for its special mission and navy for the regular
  // ones, which is what the first fingerprint (cream card, header band) missed.
  //
  // A joint fingerprint: a yellow button at the centre bottom is the commonest
  // furniture in the game (`AccountLevelUp`'s Close sits exactly here, the
  // score page's Close and Play sit where Card and How to Play do), so no one
  // probe separates. Three buttons in a row do -- the nearest other page fails
  // five of the ten -- and the gaps are what reject the two-button score page.
  // Close (centre bottom) returns to the score tally.
  EventMain: {
    name: PageName.EventMain,
    colors: [
      {x:  170, y: 1589, r: 255, g: 223, b:  74, match: true, threshold: 60},  // Card, top; stability 0
      {x:  107, y: 1730, r: 231, g: 121, b:   0, match: true, threshold: 60},  // Card, bottom; stability 4
      {x:   56, y: 1625, r: 247, g: 180, b:   8, match: true, threshold: 60},  // Card, left edge; stability 3
      {x:  524, y: 1583, r: 247, g: 190, b:   8, match: true, threshold: 60},  // Close, top centre; stability 2
      {x:  500, y: 1715, r: 239, g: 154, b:   8, match: true, threshold: 60},  // Close, bottom centre; stability 5
      {x: 1010, y: 1604, r: 247, g: 190, b:   8, match: true, threshold: 60},  // How to Play, top right; stability 5, separation 153
      {x:  884, y: 1724, r: 231, g: 136, b:   0, match: true, threshold: 60},  // How to Play, bottom; stability 14
      {x: 1022, y: 1676, r: 246, g: 169, b:   0, match: true, threshold: 60},  // How to Play, right edge; stability 9
      {x:  326, y: 1604, r:   8, g:  19, b:  31, match: true, threshold: 60},  // gap, Card to Close; stability 6
      {x:  755, y: 1601, r:   8, g:  20, b:  31, match: true, threshold: 60}   // gap, Close to How to Play; stability 5
    ],
    back: {x: 540, y: 1655},
    next: {x: 540, y: 1655}
  },
  // The event's card reveal: one collectible card over the blacked-out event
  // page, "Tap to Next" beneath it. The card is different every time -- art,
  // ink colour, text -- so nothing inside it is evidence, and the label is too
  // thin to survive the capture. What every reveal draws the same way is the
  // card's black border (logical 124..176 and 905..956, a 17-capture-pixel
  // band) and the black scrim outside it, and that is all these probe.
  //
  // A joint fingerprint, because black is not rare: the level-up panel sits on
  // an equally dark scrim, and a first set of eight scrim probes passed on all
  // five of its corpus frames. Four of these ten sit where that panel is blue
  // -- (932,428), (914,524), and the two scrim probes -- and every TsumLevelUp
  // frame fails exactly those four. The event's result overlay -- event art,
  // deliberately without an entry -- failed seven when measured: its card is
  // drawn across the left border band. Threshold 40, not 80, because
  // the nearest dim page is 90 away at the strongest probe, not 200.
  // `back` is on the card, which is the one place a tap is certain to count.
  EventCardReveal: {
    name: PageName.EventCardReveal,
    colors: [
      {x: 134, y:  836, r:  8, g:  4, b: 0, match: true, threshold: 40},  // card border left, stability 0
      {x: 128, y:  908, r: 16, g:  8, b: 0, match: true, threshold: 40},  // card border left, stability 0
      {x: 170, y:  968, r:  0, g: 12, b: 8, match: true, threshold: 40},  // card border left, stability 0
      {x: 152, y:  998, r:  0, g: 12, b: 8, match: true, threshold: 40},  // card border left, stability 0
      {x: 932, y:  428, r:  0, g: 12, b: 8, match: true, threshold: 40},  // card border right, stability 0; rejects TsumLevelUp
      {x: 914, y:  524, r:  0, g: 12, b: 8, match: true, threshold: 40},  // card border right, stability 0; rejects TsumLevelUp by 203
      {x: 926, y:  800, r:  0, g: 12, b: 8, match: true, threshold: 40},  // card border right, stability 0
      {x: 908, y: 1004, r:  0, g: 12, b: 8, match: true, threshold: 40},  // card border right, stability 0
      {x: 176, y:  281, r:  0, g:  4, b: 8, match: true, threshold: 40},  // scrim above the card, stability 0; rejects TsumLevelUp by 209
      {x: 854, y: 1556, r:  0, g:  4, b: 0, match: true, threshold: 40}   // scrim below the card, stability 0; rejects TsumLevelUp by 198
    ],
    back: {x: 540, y: 1000},
    next: {x: 540, y: 1000}
  },
  // The GET! gift dialog -- cyan header, dark body, "Claim your gift from your
  // mailbox", a Close button -- which the event raises after a card reveal.
  // Probed on the dialog's own chrome, not on the amount or the item, so it
  // reads the same wherever the game shows it.
  //
  // A joint fingerprint, deliberately: this is the game's shared dialog sprite,
  // drawn where `GiftHeart` and `ReceiveHeart` draw theirs, so the header and
  // footer alone separate from those by under 25 -- and the Close sits where
  // `ScorePage`'s Today's Missions button is yellow. No page has all three, and
  // the GET! title rejects the mail dialogs by 100 and more. Verified against
  // the corpus: the nearest other page fails five of the nine.
  EventGift: {
    name: PageName.EventGift,
    colors: [
      {x: 431, y:  539, r:  26, g: 193, b: 233, match: true, threshold: 50},  // header band, stability 19
      {x: 119, y:  551, r:  26, g: 197, b: 233, match: true, threshold: 50},  // header band, stability 17
      {x: 275, y: 1217, r:  31, g: 197, b: 238, match: true, threshold: 50},  // footer band, stability 15
      {x: 665, y: 1193, r:  31, g: 199, b: 239, match: true, threshold: 50},  // footer band, stability 11
      {x: 452, y:  662, r: 255, g: 251, b: 115, match: true, threshold: 40},  // GET! title, stability 7, separation 144
      {x: 614, y:  662, r: 255, g: 251, b: 115, match: true, threshold: 40},  // GET! title, stability 0, separation 97
      {x: 542, y: 1382, r: 247, g: 174, b:   8, match: true, threshold: 40},  // Close button, stability 3, separation 53
      {x: 524, y: 1388, r: 247, g: 174, b:   8, match: true, threshold: 40},  // Close button, stability 4, separation 51
      {x: 542, y: 1418, r: 247, g: 174, b:   8, match: true, threshold: 40}   // Close button, stability 4, separation 51
    ],
    back: {x: 540, y: 1400},
    next: {x: 540, y: 1400}
  },
  ClosePage: { // including EventPage, MyInfo, SettingPage, others
    name: PageName.ClosePage, // the close button at center bottom
    colors: [
      {x: 540, y: 1588, r: 233, g: 180, b: 10, match: true, threshold: 80} // top right of the close button
    ],
    back: {x: 576, y: 1660},
    next: {x: 576, y: 1660}
  },
  // *** Following commented out because detection is way too unspecific and I don't know what it should detect.
  // InvitePage: {
  //   name: 'InvitePage', // the close button at left bottom
  //   colors: [
  //     {x: 180, y: 1592, r: 238, g: 180, b: 11, match: true, threshold: 80}
  //   ],
  //   back: {x: 176, y: 1592},
  //   next: {x: 176, y: 1592}
  // },
  ReceiveSkillTicket: {
    name: PageName.ReceiveSkillTicket,
    colors: [
      {x: 405, y: 806, r: 240, g: 155, b: 20, match: true, threshold: 80},
      {x: 488, y: 839, r: 244, g: 164, b: 23, match: true, threshold: 80},
      {x: 502, y: 821, r: 255, g: 255, b: 255, match: true, threshold: 40},
      {x: 390, y: 824, r: 58, g: 92, b: 142, match: true, threshold: 80},
      {x: 522, y: 812, r: 60, g: 95, b: 147, match: true, threshold: 80},
      {x: 874, y: 1098, r: 238, g: 174, b: 8, match: true, threshold: 80},
      {x: 198, y: 1095, r: 239, g: 174, b: 8, match: true, threshold: 80},
      {x: 160, y: 1545, r: 0, g: 4, b: 8, match: true, threshold: 80},
      {x: 526, y: 553, r: 33, g: 195, b: 231, match: true, threshold: 80}
    ],
    back: {x: 198, y: 1095},
    next: {x: 874, y: 1098}
  },
  ReceivePremiumTicket: {
    name: PageName.ReceivePremiumTicket,
    colors: [
      {x: 405, y: 806, r: 216, g: 20, b: 25, match: true, threshold: 80},
      {x: 488, y: 839, r: 208, g: 20, b: 23, match: true, threshold: 80},
      {x: 502, y: 821, r: 255, g: 247, b: 181, match: true, threshold: 40},
      {x: 390, y: 824, r: 58, g: 92, b: 142, match: true, threshold: 80},
      {x: 522, y: 812, r: 60, g: 95, b: 147, match: true, threshold: 80},
      {x: 874, y: 1098, r: 238, g: 174, b: 8, match: true, threshold: 80},
      {x: 198, y: 1095, r: 239, g: 174, b: 8, match: true, threshold: 80},
      {x: 160, y: 1545, r: 0, g: 4, b: 8, match: true, threshold: 80},
      {x: 526, y: 553, r: 33, g: 195, b: 231, match: true, threshold: 80}
    ],
    back: {x: 198, y: 1095},
    next: {x: 874, y: 1098}
  },
  // Asked for by name from the mail flow (`gPages.matches`) and never wanted
  // from a sweep -- and kept out of one on purpose: these seven probes are the
  // mail dialog's furniture, and the GiftHeart corpus frame satisfies six of
  // them by 6-13 and the seventh (460,820) by 33 against 30. One pixel rendered
  // three units differently and a sweep on the gift page would answer this,
  // seven probes outranking GiftHeart's five. Fixing the fingerprint needs a
  // frame of this page, which the corpus does not have.
  ReceiveHeartWithoutCoins: {
    name: PageName.ReceiveHeartWithoutCoins,
    targeted: true,
    colors: [
      {x: 360, y: 570, r: 33, g: 198, b: 233, match: true, threshold: 30},
      {x: 400, y: 620, r: 61, g: 94, b: 147, match: true, threshold: 30},
      {x: 460, y: 820, r: 222, g: 61, b: 148, match: true, threshold: 30},
      {x: 420, y: 1100, r: 238, g: 174, b: 8, match: true, threshold: 30},
      {x: 860, y: 1100, r: 238, g: 174, b: 8, match: true, threshold: 30},
      {x: 540, y: 1100, r: 58, g: 94, b: 146, match: true, threshold: 30},
      {x: 550, y: 1600, r: 49, g: 36, b: 0, match: true, threshold: 30}
    ],
    back: {x: 420, y: 1100},
    next: {x: 860, y: 1100}
  },
  ExtraUpdateJp: {
    name: PageName.ExtraUpdate,
    colors: [
      {x: 104, y:  556, r:  36, g: 204, b: 239, match: true, threshold: 80},  // light blue top left
      {x: 104, y: 1194, r:  36, g: 204, b: 239, match: true, threshold: 80},  // light blue bottom left
      {x: 700, y: 1100, r: 238, g: 174, b:   8, match: true, threshold: 80},  // OK button
      {x: 200, y: 1100, r: 238, g: 174, b:   8, match: true, threshold: 80},  // Cancel button
      {x: 644, y:  676, r: 248, g: 248, b: 248, match: true, threshold: 80},  // Left of big white "o" letter
      {x: 694, y:  676, r: 248, g: 248, b: 248, match: true, threshold: 80},  // Right of big white "o" letter
      {x: 668, y:  676, r:  58, g:  93, b: 148, match: true, threshold: 80},  // Middle of big white "o" letter
      {x: 422, y:  998, r:  48, g:  93, b: 148, match: true, threshold: 80},  // Middle of small white "o" letter
      {x: 406, y:  998, r: 248, g: 248, b: 248, match: true, threshold: 80},  // Left of small white "o" letter
      {x: 434, y:  998, r: 248, g: 248, b: 248, match: true, threshold: 80}   // Right of small white "o" letter
    ],
    back: {x: 770, y: 1100},
    next: {x: 770, y: 1100}
  },
  ExtraUpdateEn: {
    name: PageName.ExtraUpdate,
    colors: [
      {x: 104, y:  556, r:  36, g: 204, b: 239, match: true, threshold: 80},  // light blue top left
      {x: 104, y: 1194, r:  36, g: 204, b: 239, match: true, threshold: 80},  // light blue bottom left
      {x: 700, y: 1100, r: 238, g: 174, b:   8, match: true, threshold: 80},  // OK button
      {x: 200, y: 1100, r: 238, g: 174, b:   8, match: true, threshold: 80},  // Cancel button
      {x: 520, y:  680, r: 248, g: 248, b: 248, match: true, threshold: 80},  // Left of big white "o" letter
      {x: 558, y:  680, r: 248, g: 248, b: 248, match: true, threshold: 80},  // Right of big white "o" letter
      {x: 538, y:  680, r:  55, g:  94, b: 148, match: true, threshold: 80},  // Middle of big white "o" letter
      {x: 674, y: 1002, r:  60, g: 100, b: 150, match: true, threshold: 80},  // Middle of small white "o" letter
      {x: 662, y: 1002, r: 240, g: 240, b: 240, match: true, threshold: 80},  // Left of small white "o" letter
      {x: 686, y: 1002, r: 240, g: 240, b: 240, match: true, threshold: 80}   // Right of small white "o" letter
    ],
    back: {x: 770, y: 1100},
    next: {x: 770, y: 1100}
  },
  RubyResetDifficulty: {
    name: PageName.RubyResetDifficulty,
    colors: [
      {x: 594, y:  972, r: 247, g:  81, b:  82, match: true, threshold: 80},  // red arrow between numbers
      {x: 610, y: 1166, r: 189, g:   0, b:  41, match: true, threshold: 80},  // ruby next to "10"
      {x: 588, y: 1096, r:  25, g: 174, b: 214, match: true, threshold: 80},  // light blue next to above ruby
      {x: 867, y: 1270, r: 238, g: 174, b:   8, match: true, threshold: 80},  // OK button
      {x: 425, y: 1275, r: 238, g: 174, b:   8, match: true, threshold: 80}   // Cancel button
    ],
    back: {x: 425, y: 1275},
    next: {x: 867, y: 1270}
  }
} satisfies PageMap;



// ---------------------------------------------------------------------------
// How each page behaves once it is up.
//
// The distinction that matters to everything downstream is whether a page waits
// for you or leaves on its own:
//
//   PERMANENT  it is still there in ten seconds. Something has to tap it -- a
//              button, or a tap anywhere -- and until something does, nothing
//              else will happen. The navigation band taps these.
//   TRANSIENT  it dismisses itself after `durationMs`. Tapping it is worse than
//              doing nothing, because by the time the tap lands the page it was
//              aimed at is gone and the tap hits whatever replaced it. The
//              navigation band waits these out instead (`nav.wait.transient`).
//
// Durations are wall-clock at `PageBaselineFps` (60). The game runs these
// windows off a frame counter rather than a clock, so a device at 120fps shows
// a "10 second" page for about five; `PageRouter.durationOf` does that scaling
// from `PageRouter.fps`, which the "Device frame rate" setting feeds.
//
// A mapped type over `PageName`, so adding a name to the enum without saying how
// the page behaves is a build error rather than a page that quietly inherits
// somebody else's handling.
//
// `measured: false` marks a duration that was reasoned about rather than timed.
// `npm run pages:docs` lists those separately: they are the ones to replace with
// a stopwatch reading, not to trust.
// ---------------------------------------------------------------------------

var PageProfiles: PageProfileMap = {
  // --- In game ---
  GamePlaying: {
    kind: PageKind.Permanent,
    roles: [PageRole.Board, PageRole.GameUp],
    note: 'The board. It does end on its own when the round timer runs out, but '
        + 'not on a window anything can wait out -- the script plays until the HUD '
        + 'stops fingerprinting, which is what confirmGameOver is for.'
  },
  GamePause: {
    kind: PageKind.Permanent,
    roles: [PageRole.Board, PageRole.GameUp],
    note: 'Pause menu; Continue resumes it.'
  },
  ScorePage: {
    kind: PageKind.Permanent,
    roles: [PageRole.Tally],
    note: 'Post-round tally. Close and Play both wait; after a point battle it '
        + 'draws Close alone, centred.'
  },
  HighScore: {
    kind: PageKind.Permanent,
    roles: [PageRole.PreTally],
    note: 'New-record panel with a close button.'
  },
  TsumLevelUp: {
    kind: PageKind.Transient,
    roles: [PageRole.PreTally],
    durationMs: 2900,
    note: 'The post-round panel listing what each tsum in the party earned -- the '
        + 'one with Close and Share. Not the banner that flashes over the board '
        + 'mid-round, which is an animation rather than a page and has no '
        + 'fingerprint, and not `AccountLevelUp`, which is the player ranking up.'
  },
  AccountLevelUp: {
    kind: PageKind.Permanent,
    roles: [PageRole.PreTally],
    note: 'The player\'s own rank going up. It arrives a moment after the score '
        + 'tally and sits on top of it until Close is pressed, so unlike '
        + '`TsumLevelUp` there is no window to wait out.'
  },
  EventMain: {
    kind: PageKind.Permanent,
    roles: [PageRole.PreTally],
    note: 'The event\'s own page, reached by tapping the result overlay away. '
        + 'Close is what puts the score tally back in front.'
  },
  EventCardReveal: {
    kind: PageKind.Permanent,
    roles: [PageRole.PreTally],
    note: 'The event\'s card reveal, "Tap to Next" -- put up at its milestones '
        + 'on the way to the tally. Waits for input; any tap moves it on.'
  },
  EventGift: {
    kind: PageKind.Permanent,
    roles: [PageRole.PreTally],
    note: 'The GET! gift dialog ("Claim your gift from your mailbox") with its '
        + 'Close. The game\'s generic reward dialog; the event raises it after a '
        + 'card reveal.'
  },
  MagicalTime: {
    kind: PageKind.Permanent,
    // Both: it follows a round on the way to the tally, and it can stand in
    // front of the heart sweep, which has a handler for it.
    roles: [PageRole.PreTally, PageRole.Interrupt],
    measured: false,
    note: 'The offer to play on for a time ticket, and the one page here that '
        + 'plainly runs a countdown: left alone it cancels itself. The script '
        + 'cancels it anyway (accepting spends tickets and then rubies), so the '
        + 'window is only used to keep the navigation band from tapping into the '
        + 'screen behind it. Ten seconds is the observed order of magnitude, not '
        + 'a timed figure -- see DEVELOPMENT.md on how to measure it.'
  },

  // --- Home / navigation ---
  StartPage: {
    kind: PageKind.Permanent,
    roles: [PageRole.GameUp],
    note: 'Pre-round screen: items, Start, Tsums.'
  },
  FriendPage: {
    kind: PageKind.Permanent,
    roles: [PageRole.HeartSweep],
    note: 'The hub the script navigates back to.'
  },
  FriendInfo: {
    kind: PageKind.Permanent,
    roles: [PageRole.HeartSweep],
    note: 'A friend card, or the settings social panel.'
  },
  ProfilePage: {
    kind: PageKind.Permanent,
    // Not somewhere a heart tap leads, but where the sweep goes between its two
    // halves, and a screen left out of a narrowed sweep reads `Unknown`.
    roles: [PageRole.HeartSweep],
    note: 'The Home tab of the hub -- your own tsum, high score and the daily '
        + 'missions. Named for the profile it shows rather than for the tab; '
        + '`StartPage` is the pre-round screen, not this.'
  },
  SquarePage: {kind: PageKind.Permanent},
  ClosePage: {
    kind: PageKind.Permanent,
    note: 'Not one screen: a deliberate single-pixel catch-all for anything with '
        + 'the standard close button at centre bottom (events, My Info, settings).'
  },
  TapOpenPage: {kind: PageKind.Permanent, note: 'Waits for the "TAP!" it asks for.'},
  TapOpenPageDeprecated: {kind: PageKind.Permanent, note: 'Older capsule art for the same screen.'},

  // --- Tsum collection and store ---
  TsumsPage: {kind: PageKind.Permanent, roles: [PageRole.GameUp]},
  TsumSortOrder: {kind: PageKind.Permanent, note: 'The collection\'s Change Order dialog; Close is the only exit.'},
  RaiseLevelCap: {kind: PageKind.Permanent, note: 'Cancel / OK, and OK spends the coins.'},
  LevelCapRaised: {
    kind: PageKind.Permanent,
    note: 'The "level cap has been raised" toast. Like `HeartSent` -- whose '
        + 'sprite it is -- it carries no button and does not clear itself; a tap '
        + 'anywhere is the only way past it.'
  },
  TsumTsumStorePage: {kind: PageKind.Permanent, roles: [PageRole.GameUp]},
  ConfirmPurchasePage: {kind: PageKind.Permanent, note: 'OK / Cancel.'},
  BoxPurchasedPage: {
    kind: PageKind.Permanent,
    note: 'One box\'s reveal card, with Close. What a 1-Time purchase ends on; a '
        + '10-Time one shows ten of these without the Close and then '
        + '`BoxPurchaseResult`.'
  },
  BoxPurchaseResult: {
    kind: PageKind.Permanent,
    note: 'The 10-box tally: all ten in a grid, and Close. Only a 10-Time '
        + 'purchase reaches it.'
  },
  NotEnoughCoins: {
    kind: PageKind.Permanent,
    note: 'Cancel / Buy with Rubies, over whatever asked for the coins. Both '
        + 'anchors are Cancel -- see the `Page` entry.'
  },
  OutOfMedals: {kind: PageKind.Permanent, note: 'Two buttons; neither times out.'},
  RubyResetDifficulty: {kind: PageKind.Permanent, note: 'OK / Cancel.'},

  // --- Mail / hearts ---
  MailBox: {kind: PageKind.Permanent},
  Received: {
    kind: PageKind.Permanent,
    roles: [PageRole.HeartSweep],
    note: 'The received-items panel, with OK.'
  },
  ReceiveHeart: {kind: PageKind.Permanent},
  ReceiveHeartWithoutCoins: {kind: PageKind.Permanent},
  ReceiveSkillTicket: {kind: PageKind.Permanent},
  ReceivePremiumTicket: {kind: PageKind.Permanent},
  GiftHeart: {kind: PageKind.Permanent, roles: [PageRole.HeartSweep]},
  HeartSent: {
    kind: PageKind.Permanent,
    roles: [PageRole.HeartSweep],
    note: 'The "Heart sent!" toast. It carries no button, but it does not clear '
        + 'itself either -- it waits for a tap anywhere, so it is permanent by '
        + 'the definition that matters here: left alone it is still there, and '
        + 'the only way past it is a tap.'
  },

  // --- Missions ---
  TodayMission: {kind: PageKind.Permanent},
  TodayMissions: {kind: PageKind.Permanent},

  // --- Interruptions ---
  RootDetection: {
    kind: PageKind.Permanent,
    roles: [PageRole.Interrupt],
    note: 'An Android AlertDialog rather than a game screen, and it never goes '
        + 'away by itself -- see dialogs.ts for why it is dismissed structurally '
        + 'instead of by the recorded coordinates.'
  },
  NetworkDisable: {kind: PageKind.Permanent, roles: [PageRole.Interrupt], note: 'OK button.'},
  NetworkTimeout: {kind: PageKind.Permanent, roles: [PageRole.Interrupt], note: 'OK button.'},
  ExtraUpdate: {kind: PageKind.Permanent, note: 'OK / Cancel.'},

  // --- Not a screen ---
  unknown: {
    kind: PageKind.Permanent,
    note: 'What the router reports when nothing fingerprinted. Permanent is the '
        + 'safe reading: an unrecognised screen that would have cleared itself '
        + 'costs one wasted escape attempt, where treating a stuck one as '
        + 'transient would wait forever.'
  }
};

// ---------------------------------------------------------------------------
// The lists a flow hands `sweep` as `expect` -- what a running round can be
// looking at, what the heart sender can -- are not written here any more. Each
// page declares its `roles` in `PageProfiles` above, and `inRoundPages()`,
// `roundOverPages()`, `preTallyPages()` and `heartSweepPages()` (pages.ts) are
// read off that, so a page is in every list its roles put it in and no other.
//
// They exist because the whole table is not uniformly trustworthy while a flow
// is mid-screen: `ClosePage` is a deliberate single-pixel catch-all at
// (540,1588), that pixel sits on the fever bar, and one fever payout moved it
// far enough that `ClosePage` was the only entry still passing -- one frame of
// which ended a round with no score and no coins (the note above
// `isRoundOverPage` in play.ts). Handing the sweep the pages the screen can
// turn into makes the misread structurally impossible there.
//
// Deliberately not generalised into a page-to-page graph. `PageRouter` distrusts
// `this.page` as stale on purpose (see the `via` hop in navigate()), and a wrong
// successor set turns a recognised screen into `Unknown` -- which DEVELOPMENT.md
// notes the navigation band handles worse than a mis-identification. A list one
// caller passes in stays inside the one place that knows its own context.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The friend list, as the heart sender reads it.
//
// Three tables: where the send buttons are, what a screenful looks like, and
// how to move the list. All three are measured off the `FriendPage` corpus
// frames, and the studio re-measures them from a script -- see the sweep in
// `Tsum.readHeartColumn`.
// ---------------------------------------------------------------------------

// The column of send buttons down the right of the ranking, and the pink that
// means a heart is still to go.
//
// Read as *runs* rather than as four fixed rows: a heart is ~52px of pink in
// this column and a row that has already had one is dark blue, so the run's
// midpoint is the button's centre and an already-sent row simply is not found.
// That is what lets the sender rescan after each send instead of tracking which
// of four rows it has dealt with.
//
// `fromY`/`toY` are the list viewport -- between the "Weekly Ranking" header
// (ends at ~550) and the panel below (starts at ~1358), a few pixels inside
// both. `threshold` is per-channel, as `isSameColor` compares: the heart's r
// never drops below 156 across its gradient while nothing else in the column
// reaches 90, so 50 is generous in both directions.
//
// `minRun` is half a heart. One scroll moves almost exactly one viewport, so a
// row can be split across two screenfuls -- and if it is, one of the two halves
// is at least half a heart, which is what stops a row falling between them.
var HeartColumn = {
  x: 910,
  fromY: 556,
  toY: 1354,
  step: 4,
  color: {r: 222, g: 85, b: 140},
  threshold: 50,
  minRun: 24,
  /** Where the row's score sits, relative to the heart's centre. */
  scoreOffsetY: 35
};

// Where `Tsum.scrollFriendList` looks to answer "did the list actually move?".
//
// A grid over the viewport rather than a pixel that means "end of list": the
// end *is* the point where a drag changes nothing, and reading that directly
// costs one capture and cannot go stale when the game redraws a row. The three
// end-of-list probes this replaced were four magic pixels and a truth table.
// `Tsum.dragList` reads this and `MailList.sample` the same way.
//
// Inside the viewport on all sides, so the header's countdown and the buttons
// below are out of it.
var FriendListSample = {
  xs: [200, 420, 640, 860],
  fromY: 580,
  toY: 1340,
  step: 40,
  /** Total channel movement at one point that counts as a change. */
  threshold: 40,
  /** How many of the points must change before the list has moved. */
  minMoved: 8
} satisfies ListSample;

// One screenful of scroll, the gesture unchanged since the fork: a drag down the heart
// column through the four row positions, ending at 500ms so the list settles
// where it is put instead of flinging past it.
//
// `down` starts on the bottom row and drags to above the list; `up` is its
// mirror. Both travel 802px, against a viewport 798px tall -- so a screenful of
// scroll is a screenful of list, which is why `HeartColumn.minRun` has to
// accept a half-visible row.
var HeartScrollPath = {
  x: 900,
  down: [1304, 1102, 895, 698, 502],
  up: [698, 895, 1102, 1304, 1500],
  /** Long enough for an overscroll bounce to settle before the list is re-read. */
  settleMs: 900
};

// ---------------------------------------------------------------------------
// The tsum collection's card grid, as the level-cap sweep reads it.
//
// One page of the collection is eight cards, four across and two down, and this
// says where each one is, how to tell that its tsum has hit its level cap, and
// where the two buttons that move the sweep on are. Read only by
// `Tsum.taskAutoUnlockLevel` (src/levelCap.ts); measured off the two
// `corpus/TsumsPage` frames sorted by Level Lock and by Favorites, which
// between them show fourteen capped cards and ten uncapped ones.
//
// The padlock is read as a *vote* rather than as one pixel, and that is the
// whole trick. The badge is a bright glyph about 30 logical px across sitting on
// a dark progress bar -- so one capture pixel of drift takes a single probe from
// 239/247/255 to the bar behind it, which is why the pixel-per-card table this
// replaced rated `risky` to `unusable` on half its entries. Six points spread
// over the glyph and a majority rule survives that: a shift moves some of them
// off the badge, never all six, and an uncapped card reads dark across the whole
// 30px window on every frame measured, so the two answers are never close.
// ---------------------------------------------------------------------------

var CollectionGrid = {
  /** Card centres in reading order: the top row left to right, then the bottom. */
  cells: [
    {x: 190, y: 1075}, {x: 424, y: 1075}, {x: 659, y: 1075}, {x: 893, y: 1075},
    {x: 190, y: 1330}, {x: 424, y: 1330}, {x: 659, y: 1330}, {x: 893, y: 1330}
  ],
  /** The padlock badge on each card, same order -- centred under the card. */
  lockBadges: [
    {x: 190, y: 1195}, {x: 424, y: 1195}, {x: 659, y: 1195}, {x: 894, y: 1195},
    {x: 190, y: 1450}, {x: 424, y: 1450}, {x: 659, y: 1450}, {x: 894, y: 1450}
  ],
  /** Where to sample around a badge, and what the badge is when it is there. */
  lockSamples: [
    {dx: -9, dy: -9}, {dx: 6, dy: -9},
    {dx: -9, dy:  0}, {dx: 6, dy:  0},
    {dx: -9, dy:  9}, {dx: 6, dy:  9}
  ],
  lockColor: {r: 239, g: 247, b: 255},
  /** Per channel, as `isSameColor` compares. The nearest uncapped read is 82 away. */
  lockDiff: 60,
  /** How many of the six have to be the badge colour. Measured: 6 or 0, never between. */
  lockVotes: 3,
  /**
   * The gold coin below the selected card's level bar, which is the game's own
   * offer to raise that tsum's cap: it is drawn only when the tsum is at its cap
   * and the cap can go higher. Four points on the coin's rim, all four required,
   * because this one is a decision to spend coins.
   */
  raiseCap: {x: 110, y: 765},
  raiseCapSamples: [
    {dx: -36, dy: -12}, {dx: 36, dy: -12},
    {dx: -36, dy:  12}, {dx: 36, dy:  12}
  ],
  raiseCapColor: {r: 243, g: 174, b: 8},
  raiseCapDiff: 50,
  /** The white chevron to the right of the grid: the next eight cards. */
  nextPage: {x: 1030, y: 1193},
  /**
   * Its mirror on the left, and the sweep's answer to "am I on the first page".
   * The game draws it only when there is a page behind this one, so the check is
   * its absence. Read as a vote for the same reason the padlock is -- a chevron
   * is ~40px of white on dark blue.
   */
  prevPage: {x: 50, y: 1193},
  prevPageSamples: [
    {dx: 0, dy: -27}, {dx: -9, dy: -9}, {dx: 0, dy: 0}, {dx: 0, dy: 9}, {dx: 0, dy: 27}
  ],
  prevPageColor: {r: 220, g: 244, b: 253},
  prevPageDiff: 60,
  prevPageVotes: 3
};

/**
 * The five orders on the collection's Change Order dialog (`TsumSortOrder`).
 *
 * A `const enum` for the same reason `PageName` is: each member inlines to its
 * string, and that string is also its key in `CollectionSortDialog.buttons`, so
 * the list of orders exists once.
 */
const enum CollectionSort {
  ReleaseDate  = 'releaseDate',
  Favorites    = 'favorites',
  Skill        = 'skill',
  LevelLock    = 'levelLock',
  DateAcquired = 'dateAcquired'
}

/**
 * The Change Order dialog, as the level-cap sweep reads it.
 *
 * The sweep needs Level Lock order and the player may not, so before picking it
 * the sweep reads which order is selected -- the gold button, the other four
 * being blue -- and picks that one again when it is done.
 */
var CollectionSortDialog = {
  /** Button centres, in the dialog's reading order. */
  buttons: {
    [CollectionSort.ReleaseDate]:  {x: 316, y:  725},
    [CollectionSort.Favorites]:    {x: 760, y:  725},
    [CollectionSort.Skill]:        {x: 316, y:  953},
    [CollectionSort.LevelLock]:    {x: 760, y:  953},
    [CollectionSort.DateAcquired]: {x: 316, y: 1185}
  } as Record<CollectionSort, Coord>,
  /** Where to sample a button: four points on its body, clear of the label. */
  selectedSamples: [
    {dx: -120, dy: -55}, {dx: 120, dy: -55},
    {dx: -120, dy:  55}, {dx: 120, dy:  55}
  ],
  /** The selected button's gold. Measured 239-247/166-178/8; a blue one reads 24-41/97-113/189-206. */
  selectedColor: {r: 247, g: 174, b: 8},
  selectedDiff: 50,
  /** How many of the four have to be gold. Measured: 4 or 0, never between. */
  selectedVotes: 3
};

// ---------------------------------------------------------------------------
// The Tsum Tsum Store, as the Box Buying chore reads and taps it.
//
// Readings off a screen already recognised, the way `CollectionGrid` is the
// level-cap sweep's own table -- not evidence about which screen it is, which
// is `Page.TsumTsum2025StorePage` and is not touched by any of this. Read only
// by `Tsum.taskBuyBoxes` and its helpers (src/boxes.ts).
//
// Two things about this screen make it a table rather than a handful of
// coordinates, and both were measured off the corpus rather than reasoned out:
//
//   THE ROW MOVES.  The boxes are a row of tabs, three wide normally and four
//   while a limited-time box is running. It stays centred, so the two layouts
//   interleave and no single set of centres covers both -- exactly the problem
//   `PageDef.variant` exists for on the detection side. Which one is up is read
//   from the ends of the row: with three tabs the panel background shows at
//   both, with four a tab reaches into each.
//
//   SO DO THE BUTTONS.  A box with both purchase sizes draws them side by side;
//   one with only a 1-Time purchase -- Happiness always, and any box whose
//   10-Time has gone -- draws that one centred instead, over the gap the pair
//   leaves. So all three positions are read, and where a button *is* is what
//   says which layout was drawn.
//
//   AND NEITHER IS THERE AT FIRST.  The store fingerprints as itself the moment
//   its frame is up, about 1.5s before its contents arrive: until then the panel
//   is empty and the row is three placeholder slots with spinners. That frame
//   reads the panel at both ends -- which is exactly what a three-box row looks
//   like -- so width alone would name the three-box layout and lose the
//   limited-time box. The gold separates them: a drawn row always has one
//   selected tab, a loading one has none. Nothing moves while it waits, so no
//   settle catches it (DRIVING_SCREENS.md § 5).
//
// Sold out is a colour, not an absence: the button stays where it is and turns
// blue. That is what ends a sweep without anything having to count purchases.
// ---------------------------------------------------------------------------

var BoxStore = {
  /**
   * The boxes in the order the tab row draws them, per row width.
   *
   * The limited-time box sits third, between Premium Box and Happiness Box --
   * true of every four-tab frame in the corpus. A four-tab row whose third box
   * is some *other* limited box would be bought as `Select`, which is why only
   * a player who picked Select can reach it.
   */
  order3: [BoxType.PremiumPlus, BoxType.Premium, BoxType.Happiness] as BoxType[],
  order4: [BoxType.PremiumPlus, BoxType.Premium, BoxType.Select, BoxType.Happiness] as BoxType[],
  /** Tab centres for each row width. Measured across all seven corpus store frames. */
  tabX3: [232, 540, 847],
  tabX4: [141, 406, 673, 938],

  /**
   * The band a tab is read on: below its label, above its bottom edge, and clear
   * of the "1 days left" line a limited box prints. A tab body is flat here --
   * gold when it is the selected box, light blue when it is not.
   */
  tabY: 1410,
  /** Where a tab is tapped: the middle of its body. */
  tabTapY: 1210,
  /**
   * The ends of the row. Both read the panel behind it with three tabs and a
   * tab body with four, and the gap between those is never less than 60 in the
   * worst channel -- so `tabDiff` separates them with room to spare.
   */
  rowEnds: [{x: 60, y: 1410}, {x: 1020, y: 1410}],
  /** The panel the tab row sits on. Nothing else on the row reads this. */
  panelColor: {r: 33, g: 65, b: 107},
  /** The selected tab's gold, which is how a tab tap is confirmed to have landed. */
  tabSelectedColor: {r: 231, g: 128, b: 8},
  tabDiff: 45,

  /**
   * The purchase buttons: two side by side, or one centred where a box offers
   * only a 1-Time purchase.
   *
   * `x` is the centre of each; `probeY` is a flat band across the top of the
   * button, above the label text, and `tapY` the middle of it.
   */
  oneTimeX: 620,
  tenTimeX: 910,
  /** The single centred button, over the gap the pair leaves. */
  onlyOneX: 755,
  probeY: 540,
  tapY: 605,
  /** Where to sample a button, from its centre. Inside the flattest 170px of it. */
  probeDx: [-70, -25, 25, 70],
  /** A button that can be pressed. Measured 254-255/203-205/8-12 on every frame. */
  availableColor: {r: 255, g: 204, b: 10},
  /** Sold out: the button stays put and turns blue. Measured 55-56/136-142/223-224. */
  soldOutColor: {r: 56, g: 138, b: 223},
  buttonDiff: 45,
  /** How many of the four samples have to agree. Measured: 4 or 0, never between. */
  buttonVotes: 3,

  /**
   * Where the reveal loop taps to move a box reveal on.
   *
   * The reveal cards take a tap anywhere, so what picks this point is what it
   * does on the screens the loop can be looking at without having recognised
   * them: dead panel above the tab row on the store itself, dead dialog body on
   * the purchase confirmation and on `NotEnoughCoins`, and dead art on the
   * tally. Nothing here is a button on any of them, which is what makes it safe
   * to burst blind (DRIVING_SCREENS.md § 4).
   */
  revealAdvance: {x: 540, y: 960}
};

// ---------------------------------------------------------------------------
// Waiting for an animation to end, instead of guessing how long it takes.
//
// The game animates on a frame counter, not a clock -- the same reason
// `PageProfiles` durations are quoted at `PageBaselineFps` and scaled. A panel
// that slides in over sixty frames takes 1s at 60fps and half that at 120, so
// every blind `sleep` after a tap is only right at the frame rate it was
// measured on. It is the *slower* device it is wrong on: the next tap lands
// inside the animation and is swallowed by it rather than taken by the screen
// under it (DRIVING_SCREENS.md § 4), which is what "taps get missed at 60fps"
// turned out to be.
//
// `Tsum.settleScreen` replaces the guess with a measurement -- sample a coarse
// grid, sample it again, and call the screen still when almost nothing moved
// between the two. That needs no frame rate to be configured, because it is
// watching the very animation the tap has to wait for.
//
// The reading is `scrollFriendList`'s, widened to the whole screen: one capture
// and one batched probe read per poll.
// ---------------------------------------------------------------------------

var ScreenSettle = {
  /** Sample grid over the logical 1080x1920 screen: 6 x 10 = 60 points. */
  xs: [90, 270, 450, 630, 810, 990],
  ys: [120, 300, 480, 660, 840, 1020, 1200, 1380, 1560, 1740],
  /** Total channel movement at one point that counts as movement, as `absColor`. */
  threshold: 40,
  /**
   * Points allowed to move with the screen still called still.
   *
   * Not zero, and that is the point: some screens never stop moving, and a gate
   * waiting for one would spend its whole budget every time. The collection is
   * the case -- its card portraits animate for as long as the grid is up, and
   * `CollectionGrid`'s three rows are 18 of these 60 points.
   *
   * Measured off `levellock_debug/missed_tap.mp4`, 79s of a level-cap sweep on a
   * 60fps device, sampling this grid at the 150ms `spacingMs` below: the settled collection
   * page moves a median of 9 points and never more than 16, while the seven real
   * screen transitions in it move 36 to 55. Two clearly separated populations,
   * so the value only has to fall in the gap -- but it sits at 3 rather than in
   * the middle because those figures are an upper bound. The recording is 809kbps
   * H.264 and the device's own capture path is lossless (`pages:eval` quality
   * 100, `pages:noise` error 0), so the real page moves less than 9.
   *
   * The card animation is intermittent rather than continuous, which is what
   * makes 3 workable: simulated over that recording, a settle on the collection
   * page returns still 100% of the time, in a median of 700ms and never more
   * than 1600. Raising it to 14 would cut that to the 400ms floor, and is
   * declined -- it would be tuning to the recorder's noise, for 300ms.
   */
  maxMoved: 3,
  /**
   * Wait before the first sample, so the animation the tap started has begun.
   * Sampling immediately reads the pre-tap screen twice and calls it still --
   * exactly the failure this exists to stop.
   */
  leadMs: 250,
  /** Between samples. */
  spacingMs: 150,
  /** Budget after the lead, when the caller names none. */
  maxMs: 2500
};

/**
 * The board's settle grid, for `Tsum.settleBoard`.
 *
 * `ScreenSettle` cannot judge a board: the HUD moves for the whole round, and
 * sixty points over the full screen call that motion. This reads the play
 * square alone, captured coarse, one mean brightness per cell -- falling tsums
 * move the reading a lot, a landed board barely (sparkles and the fever glow).
 * The measure is the one `tiaraWaitForSettledBoard` was tuned on: 0 between
 * identical frames, ~0.06 between two frames of a similar scene, 0.20-0.30
 * between wholly different screens.
 */
var BoardSettle = {
  /** The play square is captured at this many pixels a side... */
  capture: 64,
  /** ...and read as this many cells a side. */
  grid: 16,
  /** Mean per-cell change (0..1) at or under which two readings agree. */
  maxDiff: 0.03,
  /** Agreeing readings running before the board is called still. */
  quietReads: 3,
  /** Between readings. */
  spacingMs: 50,
  /**
   * Least time spent, whatever the readings say. A skill's cut-in can hold the
   * board motionless before its clear, and that is not the stillness wanted.
   * What the gate takes off is the tail of the wait, where the tsums have
   * landed and the clock is still running.
   */
  minMs: 500,
  /** Budget when the caller names none. */
  maxMs: 3000
};

// ---------------------------------------------------------------------------
// Where `gPages.navigate()` can be asked to go, and how hard it looks.
//
// These three destinations were `goFriendPage`, `goGamePlayingPage` and
// `goTsumsPage`: three loops with the same body -- look, switch, tap, check for
// a stall, repeat -- differing only in the poll timings, the confirmation, and
// what to do on arrival. That difference is this table; the loop is written once
// in `PageRouter.navigate`; and everything about *how to get there from a given
// page* is a subscription in pageHandlers.ts.
// ---------------------------------------------------------------------------

var NavPlans: NavPlanMap = {
  FriendPage: {
    times: 2,
    timeout: 1000,
    // The friend page is where a new event window flies in from, so the
    // confirmation watches it before believing the first sighting. A budget
    // rather than a wait -- see `holdMs` -- so an arrival nothing lands on pays
    // one extra look, and the three seconds are there for one that does.
    holdMs: 3000,
    settleMaxMs: 2500,
    restMs: 1000,
    startupWaitMs: 5000,
    arrive: function(this: Tsum) {
      this.isStartupPhase = false;
    }
  },
  GamePlaying: {
    times: 2,
    timeout: 2000,
    holdMs: 0,
    // No `settleMaxMs`: a board is moving for the whole round, so it never goes
    // still and the gate would only ever time out. This is the destination the
    // run reaches most often, and that would be seconds on every round.
    // Every mover on the way here sleeps for its own transition, so a rest at
    // the bottom of the loop would only add to those.
    restMs: 0,
    startupWaitMs: 0
  },
  TsumsPage: {
    times: 2,
    timeout: 2000,
    holdMs: 0,
    // No hold -- the collection is arrived at by a tap that already slept --
    // but the level-cap sweep taps the grid the instant this returns, and the
    // cards are still sliding in behind their own fingerprint.
    settleMaxMs: 2500,
    restMs: 0,
    startupWaitMs: 0,
    // The collection is reached from the home screen, so get home first rather
    // than hoping a back-tap chain from wherever we are lands there.
    via: PageName.FriendPage
  },
  ProfilePage: {
    times: 2,
    timeout: 1000,
    // The tab swaps the whole panel; confirm after the swap, not during it.
    holdMs: 1000,
    settleMaxMs: 2000,
    restMs: 500,
    startupWaitMs: 0
  },
  MailBox: {
    times: 2,
    timeout: 2000,
    // The mailbox slides in, and a frame caught mid-slide can fingerprint as the
    // list before the list is tappable. The receive choreography that follows
    // taps immediately, so confirm after the animation rather than during it.
    holdMs: 1000,
    settleMaxMs: 2500,
    restMs: 500,
    startupWaitMs: 0,
    // The mailbox icon lives on the home screen, so get there first. Same
    // reasoning as TsumsPage above: a back-tap chain from an arbitrary screen is
    // not a route.
    via: PageName.FriendPage
  },
  TsumTsumStorePage: {
    times: 2,
    timeout: 2000,
    holdMs: 0,
    // The store slides in over the collection, and the Box Buying sweep reads
    // the tab row the moment this returns -- a row caught mid-slide is read at
    // the wrong x. No hold, for the reason TsumsPage has none: this is arrived
    // at by a tap that already settled.
    settleMaxMs: 2500,
    restMs: 0,
    startupWaitMs: 0,
    // The store button is on the collection, so go there first. `drive` follows
    // that plan's own `via` in turn, so this reaches the hub when it has to.
    via: PageName.TsumsPage
  }
};

// ---------------------------------------------------------------------------
// The route graph: which press on a screen leads where.
//
// **Forward only.** "How do I get from here to there" is the one direction
// OBSCURED_BOARD.md § The design that was rejected leaves open: a missing edge
// answers "no route", which is loud. The same edges read *backwards*, to
// constrain what the next screen may be, turn a recognised screen into
// `Unknown`, and nothing here is consulted by `sweep` or by anything that
// decides what is on display. `inRoundPages()` (pages.ts) stays the shape for
// that question -- a list the one caller that knows its own context passes in.
//
// Two halves, because two halves are what the tree already had:
//
//   ANCHORS   `mail`, `tsums`, `home` and `store` mean the same thing wherever
//             they are drawn, so each destination is declared once in
//             `AnchorRoutes` and the edge is read off whichever `Page` entry
//             matched. Adding the anchor to a new entry adds the edge.
//   PER PAGE  `back` and `next` mean whatever that screen's two buttons mean,
//             so they are declared per page in `PageRoutes`.
//
// Every edge carries a `RouteSource`, because the difference between a route
// the tree implements and one somebody believed is the whole point of writing
// them down. A page with no row below is not an error: `forecast.ts` still
// reports the fallback `back` tap, with no destination, which is what
// `nav.move.back` really does.
//
// `docs/transitions.json` is what checks this -- the detection suite's self-test
// reports an observed transition no edge admits and an edge no harvest has seen.
// The ledger is one harvest and twenty visits deep, so neither is a failure yet;
// a contradiction is still worth reading.
// ---------------------------------------------------------------------------

/** The `PageDef` fields that locate a button, which is what an edge is taken by. */
const enum PageAnchor {
  Back = 'back',
  Next = 'next',
  Tsums = 'tsums',
  Store = 'store',
  Mail = 'mail',
  Home = 'home',
}

/** How much an edge is worth believing. */
const enum RouteSource {
  /** A subscription in pageHandlers.ts takes this tap. The code is the evidence. */
  Handler = 'handler',
  /** The `Page` table locates the button, but nothing navigates by it yet. */
  Anchor = 'anchor',
  /** Read off the screen's own layout, and confirmed by nothing. */
  Declared = 'declared',
}

/** Anchors that lead to the same screen from wherever they are pressed. */
var AnchorRoutes: { [anchor: string]: PageRoute } = {
  tsums: { via: PageAnchor.Tsums, to: PageName.TsumsPage, source: RouteSource.Handler },
  mail: { via: PageAnchor.Mail, to: PageName.MailBox, source: RouteSource.Handler },
  home: { via: PageAnchor.Home, to: PageName.ProfilePage, source: RouteSource.Handler },
  // `nav.move.toStore` takes this one, for the Box Buying sweep. It was an
  // `Anchor` edge until then -- the table located the button and nothing pressed
  // it.
  store: { via: PageAnchor.Store, to: PageName.TsumTsumStorePage, source: RouteSource.Handler },
};

/**
 * `back` and `next`, per page. Anchor edges are not repeated here.
 *
 * Only edges with a destination something in this tree can name. The rest are
 * left out on purpose rather than guessed at -- an invented row would be
 * indistinguishable from a measured one at exactly the moment it mattered.
 */
var PageRoutes: PageRouteMap = {
  // nav.move.friendToGame: Play, from the hub.
  FriendPage: [
    { via: PageAnchor.Next, to: PageName.StartPage, source: RouteSource.Handler }
  ],
  // nav.move.startToGame presses `Button.outStart` rather than the entry's own
  // `next` -- 58px apart -- so the edge names the button it really presses.
  // The back arrow at the bottom left returns to the hub; nav.move.exit takes
  // it for every other goal.
  StartPage: [
    { via: 'outStart', to: PageName.GamePlaying, source: RouteSource.Handler },
    { via: PageAnchor.Back, to: PageName.FriendPage, source: RouteSource.Declared }
  ],
  // The five screens the board can end on with nothing pressed are
  // `roundOverPages()` (pages.ts) -- read off the roles each page declares
  // above, which `forecast.ts` expands rather than this table copying it. What is here is the one press:
  // `back` and `next` are both the pause button at the top right, which is what
  // `nav.move.back` reaches for when something wants off the board.
  GamePlaying: [
    { via: PageAnchor.Back, to: PageName.GamePause, source: RouteSource.Declared }
  ],
  // dismiss.resumeGame: Continue, back to a round already running. The other
  // button ends the round; nav.move.exit takes it only when something is
  // deliberately heading off the board, which is when resumeGame declines.
  GamePause: [
    { via: PageAnchor.Next, to: PageName.GamePlaying, source: RouteSource.Handler },
    { via: PageAnchor.Back, source: RouteSource.Declared }
  ],
  // The three panels that stand between a finished round and its tally. Each is
  // closed by a `dismiss` handler, and each says so in its own `what`.
  MagicalTime: [
    { via: PageAnchor.Back, to: PageName.ScorePage, source: RouteSource.Handler }
  ],
  HighScore: [
    { via: PageAnchor.Back, to: PageName.ScorePage, source: RouteSource.Handler }
  ],
  AccountLevelUp: [
    { via: PageAnchor.Back, to: PageName.ScorePage, source: RouteSource.Handler }
  ],
  // The event page's `back` is its Close. The result overlay that leads here
  // has no entry (see PageName.EventMain), so no route arrives from it.
  EventMain: [
    { via: PageAnchor.Back, to: PageName.ScorePage, source: RouteSource.Handler }
  ],
  // The event's milestone pair: the card reveal's tap raises the gift dialog,
  // whose Close drops back onto the event page it is drawn over.
  EventCardReveal: [
    { via: PageAnchor.Back, to: PageName.EventGift, source: RouteSource.Handler }
  ],
  EventGift: [
    { via: PageAnchor.Back, to: PageName.EventMain, source: RouteSource.Handler }
  ],
  // Declared, not implemented: `nav.move.back` is what closes it, and the tally
  // is what `record.baseCoins` and `finishRoundStats` expect behind it.
  TsumLevelUp: [
    { via: PageAnchor.Back, to: PageName.ScorePage, source: RouteSource.Declared }
  ],
  // The tally's two ways on, and the only page here where which one is open
  // depends on the frame rather than on the page.
  //
  // Play goes straight to the pre-round screen, saving the hub hop the round
  // after a round used to take. `nav.move.tallyToGame` takes it, and only when
  // it can see the button: a point battle's tally draws one centred Close and
  // no Play (`ScorePagePlay`). Close is the way out for every other goal, and
  // the fallback for that one -- it lands on the hub, which is where the mail,
  // heart, collection and store routes all start.
  ScorePage: [
    { via: PageAnchor.Next, to: PageName.StartPage, source: RouteSource.Handler },
    { via: PageAnchor.Back, to: PageName.FriendPage, source: RouteSource.Declared }
  ],
  // The level-cap sweep's three edges. `Declared` rather than `Handler` because
  // no subscription takes them: `Tsum.taskAutoUnlockLevel` does, from inside its
  // own loop, which is not evidence this table's readers can check.
  TsumSortOrder: [
    { via: PageAnchor.Back, to: PageName.TsumsPage, source: RouteSource.Declared }
  ],
  RaiseLevelCap: [
    { via: PageAnchor.Back, to: PageName.TsumsPage, source: RouteSource.Declared },
    { via: PageAnchor.Next, to: PageName.LevelCapRaised, source: RouteSource.Declared }
  ],
  LevelCapRaised: [
    { via: PageAnchor.Back, to: PageName.TsumsPage, source: RouteSource.Declared }
  ],
  // The Box Buying sweep's edges. `Declared` for the reason the three above are:
  // `Tsum.taskBuyBoxes` takes them from inside its own loop rather than through
  // a subscription, which is not evidence this table's readers can check.
  //
  // The store's own `back` leaves to the collection. The sweep never presses
  // it -- it is where the reveals come back to -- but navigate does, on its way
  // anywhere else.
  TsumTsumStorePage: [
    { via: PageAnchor.Back, to: PageName.TsumsPage, source: RouteSource.Declared }
  ],
  ConfirmPurchasePage: [
    { via: PageAnchor.Back, to: PageName.TsumTsumStorePage, source: RouteSource.Declared }
  ],
  // Both end on the store, and both by their Close. The ten reveals in between
  // have no entry at all: they are tapped through blind, being one screen the
  // sweep never has to tell apart from another (`BoxStore.revealAdvance`).
  BoxPurchasedPage: [
    { via: PageAnchor.Back, to: PageName.TsumTsumStorePage, source: RouteSource.Declared }
  ],
  BoxPurchaseResult: [
    { via: PageAnchor.Back, to: PageName.TsumTsumStorePage, source: RouteSource.Declared }
  ],

  // --- Exits: pages whose `back` is a way out, and nothing more is known ---
  //
  // What `nav.move.exit` (pageHandlers.ts) fires on. Every row here is the
  // blind fallback it replaced, made explicit per page: the page's `back` is a
  // Close, a Cancel, an OK or a back arrow, and pressing it leaves the page.
  // `to` is given only where the tree depends on the destination; the rest is
  // a way out with nowhere named, which is the honest answer. A page with no
  // row is not tapped blind any more -- the hub above all, whose `back` is Play.
  //
  // The tally is not here: its Close is an exit like these, but it has a second
  // edge and so is declared with the round-end pages above.
  //
  // The collection's back arrow returns to the hub it was opened from.
  TsumsPage: [
    { via: PageAnchor.Back, to: PageName.FriendPage, source: RouteSource.Declared }
  ],
  // The rail's ranking tab: the heart sweep comes back this way between its
  // two halves (`friendPageGoToSelf`, hearts.ts).
  ProfilePage: [
    { via: PageAnchor.Back, to: PageName.FriendPage, source: RouteSource.Declared }
  ],
  SquarePage: [
    { via: PageAnchor.Back, source: RouteSource.Declared }
  ],
  MailBox: [
    { via: PageAnchor.Back, source: RouteSource.Declared }
  ],
  // The mail dialogs: the mail flow drives these itself; this is for a
  // navigation that finds one in the way.
  Received: [
    { via: PageAnchor.Back, source: RouteSource.Declared }
  ],
  ReceiveHeart: [
    { via: PageAnchor.Back, source: RouteSource.Declared }
  ],
  ReceiveSkillTicket: [
    { via: PageAnchor.Back, source: RouteSource.Declared }
  ],
  ReceivePremiumTicket: [
    { via: PageAnchor.Back, source: RouteSource.Declared }
  ],
  // The heart sweep's dialogs and toast, likewise.
  GiftHeart: [
    { via: PageAnchor.Back, source: RouteSource.Declared }
  ],
  HeartSent: [
    { via: PageAnchor.Back, source: RouteSource.Declared }
  ],
  FriendInfo: [
    { via: PageAnchor.Back, source: RouteSource.Declared }
  ],
  // Panels and dialogs with one way to close them.
  TodayMission: [
    { via: PageAnchor.Back, source: RouteSource.Declared }
  ],
  TodayMissions: [
    { via: PageAnchor.Back, source: RouteSource.Declared }
  ],
  TapOpenPage: [
    { via: PageAnchor.Back, source: RouteSource.Declared }
  ],
  TapOpenPageDeprecated: [
    { via: PageAnchor.Back, source: RouteSource.Declared }
  ],
  OutOfMedals: [
    { via: PageAnchor.Back, source: RouteSource.Declared }
  ],
  RubyResetDifficulty: [
    { via: PageAnchor.Back, source: RouteSource.Declared }
  ],
  ExtraUpdate: [
    { via: PageAnchor.Back, source: RouteSource.Declared }
  ],
  // The network dialogs' OK. They have no dismiss handler of their own, so
  // this is the one thing that clears them, and only inside navigate().
  NetworkDisable: [
    { via: PageAnchor.Back, source: RouteSource.Declared }
  ],
  NetworkTimeout: [
    { via: PageAnchor.Back, source: RouteSource.Declared }
  ],
};
