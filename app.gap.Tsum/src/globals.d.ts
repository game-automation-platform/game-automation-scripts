// Ambient declarations for the Game Automation Platform runtime, the shared
// value shapes, and the parts of `Tsum` that are defined outside its
// constructor.
//
// This file emits nothing. It is the first entry in tsconfig.json's `files`, so
// everything declared here is visible to every other file in the bundle.
//
// ## Why `interface Tsum` lives here
//
// `Tsum` is a class in tsum.ts, but every one of its methods is attached as
// `Tsum.prototype.NAME = function ...`, from a dozen files, because the bundle
// has no modules and a class cannot be reopened. Declaring those methods in an
// interface of the same name merges them into the class type, which buys three
// things the plain prototype assignment cannot:
//
//   * `ts.foo()` and `this.foo()` are checked, completed and find-referenced
//     everywhere, instead of being `any`;
//   * each method's `this` and parameters are *contextually typed* from the
//     declaration below, so the assignment sites need no annotations at all;
//   * `Tsum.prototype.typo = ...` is an error, so a method can't be defined
//     under a name nothing calls.
//
// Adding a method therefore means adding its signature here as well. That is
// the cost of the arrangement, and the reason each one carries a real type
// rather than `any`.

// --- Shared geometry / colour value shapes ---

/** A screen coordinate in the script's logical 1080x1920 space. */
interface Point {
  x: number;
  y: number;
}

/**
 * A grid over a scrolling list's viewport, read before and after a drag to
 * answer "did the list actually move?" -- which is also the end-of-list test,
 * since the end is where a drag changes nothing. `FriendListSample` and
 * `MailList.sample` (`src/data.ts`) are the two; `Tsum.dragList` reads both.
 */
interface ListSample {
  xs: number[];
  fromY: number;
  toY: number;
  step: number;
  /** Total channel movement at one point that counts as a change. */
  threshold: number;
  /** How many of the points must change before the list has moved. */
  minMoved: number;
}

/** A BGRA colour sample as returned by the image/colour APIs. */
interface Color {
  r: number;
  g: number;
  b: number;
  a?: number;
}

/**
 * Anything carrying r/g/b channels: a `Color`, a `Coord`, a `PageColor`, or a
 * bare `{r, g, b}` literal. Used by the colour-comparison helpers, which are
 * fed entries from the heterogeneous Button/Page tables.
 *
 * The channels stay optional on purpose. Plenty of `Button`/`Page` entries are
 * bare coordinates with no recorded colour, and the helpers are handed those:
 * the missing channel makes the arithmetic NaN and the comparison false, so
 * "no colour recorded" reads as "no match". Requiring the channels here would
 * be a lie about the tables and would reject those calls.
 */
type ColorLike = { r?: number; g?: number; b?: number; a?: number };

/**
 * A tappable/checkable location. Position is always present; the colour
 * channels and the various per-entry extras (reference colours, sizes,
 * labels) are optional because the Button/Page tables are heterogeneous.
 */
interface Coord {
  x: number;
  y: number;
  r?: number;
  g?: number;
  b?: number;
  a?: number;
  w?: number;
  h?: number;
  z?: number;
  name?: string;
  color?: Color;
  color2?: Color;
}

// --- Walkthrough recording (walkthrough.ts) --------------------------------

/** One tap, as the walkthrough recorder writes it down. */
interface WalkTap {
  /** Screen pixels, as the touch device reported them. */
  x: number;
  y: number;
  /** The same point in the 1080x1920 space `Button` and `Page` are written in. */
  lx: number;
  ly: number;
  /** Milliseconds into the visit. */
  ms: number;
}

/** One stay on one screen: what it was, what was done to it, what followed. */
interface WalkVisit {
  seq: number;
  page: PageName;
  /** The `Page` entry that matched, or `''` when nothing did. */
  key: string;
  at: number;
  /** How long the screen was up. Zero while the visit is still open. */
  ms: number;
  taps: WalkTap[];
  /** The page that followed, or `''` on the visit the walk ended on. */
  to: PageName | '';
  /** Basename of the frame kept for this visit, or `''` when none was. */
  frame: string;
}

/** A recorded walkthrough, as it is written to the device. */
interface WalkSession {
  session: string;
  startedAt: number;
  screen: { width: number; height: number };
  /** Enough geometry to turn the recorded screen pixels back into logical ones. */
  captureGameRatio: number;
  gameOffsetX: number;
  gameOffsetY: number;
  visits: WalkVisit[];
}

/** What one screenful of the friend list yielded to `sendHeartsOnPage`. */
interface HeartPageResult {
  /** Hearts the game confirmed with its "Heart sent!" toast. */
  sent: number;
  /**
   * A row scoring zero was reached. The ranking is ordered by score, so every
   * row below it scores zero too and the downward half has nothing left to do.
   */
  zeroScore: boolean;
}

/**
 * What one purchase-button position on the store holds.
 *
 * `none` is a real answer rather than a failure: the store draws two buttons
 * side by side for a box that sells both sizes and one centred button for a box
 * that sells only single ones, so which positions are empty is what says which
 * layout is up (`BoxStore`, src/data.ts).
 */
type BoxButtonState = 'available' | 'soldOut' | 'none';

/**
 * The store's box tab row, as one reading.
 *
 * There is no "nothing is selected" here: a row with no gold tab is a store that
 * has not drawn its row yet, and `readBoxTabs` answers that with null rather
 * than with a row (`BoxStore`, src/data.ts).
 */
interface BoxTabRow {
  /** How wide the row is drawn: 3, or 4 with a limited-time box among them. */
  tabs: number;
  /** Which tab is the open (gold) one, as an index into that width's order. */
  selected: number;
}

/** Where to tap for each purchase size on the open box, and what is sold out. */
interface BoxPurchaseOffer {
  /** The 1-Time button, wherever it was drawn; null when it cannot be pressed. */
  oneTime: Coord | null;
  /** The 10-Time button; null on a box that does not offer one, or whose stock has gone. */
  tenTime: Coord | null;
  /** At least one button is drawn but blue. The store's own "no stock left". */
  soldOut: boolean;
}

/**
 * How one attempt at buying a box ended.
 *
 * `soldOut` and `noCoins` end the sweep and are not faults -- they are the
 * game's two ways of saying there is nothing more to buy. `missed` is the one
 * worth retrying. `stuck` is both at once: OK was pressed, so the coins are
 * gone and the purchase counts, but the screens it opened would not clear, so
 * it counts as a failure too.
 */
type BoxPurchaseOutcome = 'bought' | 'stuck' | 'soldOut' | 'noCoins' | 'unavailable' | 'missed';

/** One reference pixel used to fingerprint a page. */
interface PageColor {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  match: boolean;
  threshold: number;
}

/**
 * A recognisable game page: a colour fingerprint plus navigation anchors.
 *
 * `name` is a `PageName` (declared next to the `Page` table in data.ts, since
 * that table is what defines the vocabulary), not a bare string -- which is
 * what makes every `page === '...'` comparison a checked one.
 */
interface PageDef {
  name: PageName;
  /**
   * Which *configuration* of the page this fingerprint is for, when the screen
   * has more than one.
   *
   * A page can be drawn more than one way without becoming a different page:
   * `TsumLevelUp` lists five tsums normally and four when the 5->4 bonus is on, and
   * the panels do not merely move, they interleave -- a pixel in a panel of one
   * layout is in the gap between panels of the other. No single probe list can
   * cover both, so each configuration gets its own entry under the same `name`,
   * which is the mechanism regional and dpi variants already use.
   *
   * The string is documentation and tooling, never control flow: the script only
   * ever learns the `name`, so a task that wants "the level-up screen" keeps
   * working whichever configuration showed up. What it buys is the ability to
   * say *which* screens the corpus has and which the table can actually detect
   * -- `npm run pages:eval` reports a configuration nothing fingerprints, and
   * the corpus's ANNOTATIONS.md pairs each entry with the frames it is for.
   *
   * Absent means "the only way this page is drawn". A page with two entries
   * where neither declares one is not wrong, just undocumented.
   */
  variant?: string;
  /**
   * Scored only when a caller asks for this page by name (`PageRouter.matches`),
   * never by `sweep`. For an entry that is a yes/no question about a screen
   * the caller already knows it is on, and whose fingerprint would win a sweep
   * it has no business winning -- `ReceiveHeartWithoutCoins` is mail-dialog
   * furniture that the GiftHeart page satisfies to within three absColor units
   * on one probe, and its seven probes outrank GiftHeart's five.
   */
  targeted?: boolean;
  colors: PageColor[];
  back: Coord;
  next: Coord;
  tsums?: Coord;
  store?: Coord;
  /**
   * The mailbox icon, on the screens that carry it. The route into `MailBox`,
   * the same way `tsums` is the route into the collection -- see
   * `nav.move.toMail` in pageHandlers.ts.
   */
  mail?: Coord;
  /**
   * The Home tab on the hub's left rail, on the screens that carry it. The
   * route into `ProfilePage`, the same way `mail` is the route into `MailBox`
   * -- see `nav.move.toHome` in pageHandlers.ts.
   */
  home?: Coord;
}

/**
 * What one `Page` entry scored against one captured frame.
 *
 * `score` is mean probe *slack* in [0,1] -- how comfortably the entry cleared
 * its own thresholds -- not a probability. It exists to break ties between
 * entries that all passed; `pass` is still the only thing that decides whether
 * an entry matched at all.
 */
interface PageMatch {
  page: PageDef;
  /** The `Page` key, not the page name: variants share a name, keys are unique. */
  key: string;
  pass: boolean;
  score: number;
  /**
   * How many probes the entry carries -- its weight of evidence, and the
   * *primary* ranking key. A fingerprint that confirms nine landmarks says more
   * about what is on screen than one confirming a single pixel comfortably, so
   * `score` only ever breaks ties between entries of equal length.
   */
  probes: number;
  /** Indices into `page.colors` of the probes that failed. */
  failed: number[];
  /**
   * Which of the nine one-pixel shifts the entry was judged at: 0 is the
   * centre, 1-8 the neighbours in `Tsum.getColorBlocks` order. Diagnostic --
   * the harness reads probes back at the same shift.
   */
  shift: number;
}

/**
 * An index-signature view of the `Page` table, for the `for (const key in Page)`
 * fingerprint loops. `Page` itself is inferred literally (see data.ts) so that
 * `Page.ClosePage.back` resolves to the entry; that inferred type deliberately
 * has no index signature, hence this cast target.
 */
type PageMap = { [name: string]: PageDef };

// --- The page router (pages.ts) ---

/**
 * How a page behaves once it is up, declared for every name in `PageName` by
 * the `PageProfiles` table in data.ts.
 *
 * This is the distinction the navigation band turns on. A permanent page is
 * still there in ten seconds and the only way past it is a tap; a transient one
 * dismisses itself, and a tap aimed at it lands on whatever replaced it. So the
 * two get opposite handling, and getting the classification wrong is a stray tap
 * on a screen nobody meant to touch.
 */
interface PageProfile {
  kind: PageKind;
  /**
   * What this page is to the flows (`PageRole`, pages.ts): a round's board or
   * tally, a panel before the tally, a screen the heart sweep branches on, an
   * interruption. The lists the flows hand `sweep` as `expect` are read off
   * these, so a page is in every list its roles put it in and in no other.
   * Absent means the page is in none of them.
   */
  roles?: PageRole[];
  /**
   * Transient pages only: how long the page stays up, in milliseconds at
   * `PageBaselineFps`. The game runs these windows off a frame counter, so
   * `PageRouter.durationOf` scales this by the device's actual frame rate.
   */
  durationMs?: number;
  /** How the classification (and the duration) was arrived at. */
  note?: string;
  /**
   * Whether `durationMs` was timed on a device or estimated. Estimates are
   * flagged in the generated documentation so they can be replaced with
   * measurements rather than quietly inherited.
   */
  measured?: boolean;
}

/**
 * Every page's profile. A mapped type over `PageName`, so a name added to the
 * enum without a profile is a build error rather than a page whose behaviour
 * nothing ever decided.
 */
type PageProfileMap = { [P in PageName]: PageProfile };

/** One entry in the router's history stack. */
interface PageVisit {
  page: PageName;
  /** The `Page` key that matched; `''` on `Unknown`. */
  key: string;
  at: number;
  /** When the page was left; 0 while it is still on screen. */
  leftAt: number;
  kind: PageKind;
  /** Path of the saved frame, or `''` when history shots are off. */
  shot: string;
}

/** What every subscription is handed. */
interface PageEvent {
  page: PageName;
  /** The matching `Page` entry, or null on `Unknown`. */
  def: PageDef | null;
  /** The `Page` key: variants share a name, keys are unique. */
  key: string;
  /** The page before this one, or `Unknown` if there was none. */
  previous: PageName;
  /** Whether the screen turned over, or this is another look at the same page. */
  changed: boolean;
  /** When the detection that produced this event ran. */
  at: number;
  /** How long this page has been on screen, in ms. */
  age: number;
  kind: PageKind;
  /** Transient pages: ms left of the expected window, scaled for the device's fps. 0 otherwise. */
  remainingMs: number;
  /** Where the caller of this look said it was heading; `''` when it was only watching. */
  goal: PageName | '';
  /**
   * The subscription that ended the acting part of the queue, once one has.
   * Only the notify band can ever see this set, since it is the only band that
   * runs after a `Stop`.
   */
  stoppedBy: string;
  ts: Tsum;
}

/**
 * One thing a subscription does, in the order its steps are written.
 *
 * A subscription is a list of these rather than a function body, so what a page
 * costs -- which button, which settle budget, in what order -- is data that the
 * generated documentation reads directly instead of a reader inferring it from
 * a body. `PageRouter.perform` is the only thing that runs them.
 *
 * `call` is the escape hatch for what is neither a tap nor a wait: reading the
 * coin counter, escaping a screen nothing fingerprinted. It carries its own
 * name, so the docs still say what ran.
 */
type PageStep =
  /** Press one of the matched entry's own anchors. `takes` is read off this. */
  | { do: 'tap'; anchor: PageAnchor }
  /** Press a fixed coordinate. `name` marks a `Button`, and `takes` reads it. */
  | { do: 'tapAt'; at: Coord; name?: string }
  /** Wait for the screen to stop moving, up to this budget. */
  | { do: 'settle'; ms: number }
  /** Wait blind, where there is no still frame to wait for. */
  | { do: 'sleep'; ms: number }
  /** Sit out what is left of a transient page's window. */
  | { do: 'waitOut' }
  | { do: 'log'; event: LogEvent; message: string }
  | { do: 'call'; name: string; run: (this: Tsum, event: PageEvent) => void };

/**
 * A registered reaction to a page.
 *
 * Everything here except `steps` exists to answer a question about ordering
 * without running anything, which is what makes the generated documentation and
 * the studio's Dispatch tab possible.
 */
interface PageSubscription {
  /** Unique. `after` names it, the docs list it, a re-registration replaces it. */
  id: string;
  category: PageCategory;
  /** One sentence, for the generated documentation. Required on purpose. */
  what: string;
  /**
   * Which pages this fires on. Required, and there is no wildcard: a handler
   * for every page says `allPages()`, one for every transient page
   * `pagesOfKind(PageKind.Transient)`, one for every page carrying an anchor
   * `pagesWithAnchor(PageAnchor.Mail)` (all in pages.ts) -- so the queue for a
   * page is decided by what that page declares, and a page added later is on
   * exactly the queues its own declarations put it on.
   */
  pages: PageName[];
  /** Restrict to these navigation goals. Omitted means any goal. */
  goals?: PageName[];
  /**
   * Subscription ids that must have run before this one. A dependency that is
   * not in the same queue (different page, different goal) is satisfied
   * vacuously -- it did not run, and it was never going to.
   */
  after?: string[];
  /** Higher runs earlier within the same category. Defaults to 0. */
  order?: number;
  /**
   * Fire on every detection rather than only when the page changed.
   *
   * The default is change-only, which is what "broadcast when the page changes"
   * means. Handlers that have to keep acting while the same page stays up --
   * the navigation taps, mostly -- opt in here.
   */
  every?: boolean;
  /** Remove the subscription after it runs once. */
  once?: boolean;
  /**
   * Whether this would touch the screen, answered without running it.
   *
   * Only for the subscriptions that can decline. The dispatch tests it before
   * the steps and skips them when it answers false, so they only ever run on a
   * frame the condition accepts and nothing tests it twice; `forecast.ts` reads
   * the same declaration, which is what keeps the forecast and the dispatch
   * from disagreeing.
   *
   * Absent means the band answers: `guard`, `dismiss` and `navigate` act,
   * `observe`, `record` and `notify` never do.
   */
  acts?: (event: PageEvent) => boolean;
  /** What this does, in order. Empty is legal and means "nothing yet". */
  steps: PageStep[];
}

/** A subscription as the router stores it: registration order resolved. */
interface PageSubscriptionEntry extends PageSubscription {
  order: number;
  every: boolean;
  once: boolean;
  /**
   * Which edge of the route graph this subscription takes, by its `via` -- a
   * `PageAnchor` when it presses one of the entry's own anchors, or a `Button`
   * name when it presses a fixed coordinate.
   *
   * This is the join between "who acts" and "where that leads", and without it
   * a reader of the forecast has to infer the second from the order of the
   * first, which is wrong the moment two routes are open at once. Undefined
   * means no declared edge is taken: it waits, it presses something structural,
   * or it is escaping a screen nothing fingerprinted.
   *
   * Derived from the steps rather than declared beside them (`subscriptionTakes`,
   * pages.ts), so the edge the forecast names is the one the executor presses.
   */
  takes: string | undefined;
  /** Registration order, the last tiebreak in the queue sort. */
  index: number;
}

/**
 * One fever turning on or off (src/fever.ts).
 *
 * Not a `PageEvent`: a fever is a mode the board is in, not a screen, so it
 * arrives on its own edges rather than on a page change.
 */
interface FeverEvent {
  /** true when a fever just started, false when the one that was running ended. */
  active: boolean;
  /** When the reading that settled the change was taken. */
  at: number;
  /** How long the state this replaced had been up, in ms; 0 for the first one. */
  lastedMs: number;
  /** The page the change was seen on -- `GamePlaying` for a start, anything for an end. */
  page: PageName;
  ts: Tsum;
}

/** A registered reaction to a fever starting or ending. */
interface FeverSubscription {
  /** Unique. A re-registration under the same id replaces the first. */
  id: string;
  /** One sentence: what this does about it. Required on purpose, as for pages. */
  what: string;
  handler: (this: Tsum, event: FeverEvent) => void;
}

/** A fever subscription as the watcher stores it. */
interface FeverSubscriptionEntry extends FeverSubscription {
  /** Registration order, which is the order they run in. */
  index: number;
}

/**
 * How `PageRouter.navigate` polls for one destination.
 *
 * The three navigation loops this replaced differed only in these numbers and
 * in what they did on arrival, so that difference is data now and the loop is
 * written once. Everything about *how to get there* from a given page is a
 * subscription in pageHandlers.ts instead.
 */
interface NavPlan {
  /** `sweep` arguments for each poll. */
  times: number;
  timeout: number;
  /**
   * How long the destination has to hold before it is believed, ms. 0 to skip.
   *
   * A **budget, not a duration**: `PageRouter.holdGoal` watches the screen and
   * ends the moment two looks running agree it is still the destination, so an
   * arrival nothing lands on top of costs one extra capture rather than the whole
   * figure. What the budget is for is the other case -- a window landing on the
   * destination, dismissed where it is seen, and the count started again. It was
   * a blind `sleep` until it was measured at a flat 3.9s on every friend-page
   * arrival -- 205s of a 13-hour run, spent not looking at the one thing it was
   * there to watch for. DRIVING_SCREENS.md § 3.
   */
  holdMs: number;
  /**
   * After the hold, wait for the screen to stop moving, up to this long.
   *
   * `holdMs` is about *what* is on screen and this is about whether it has
   * stopped arriving -- the part that does not depend on the device's frame rate
   * (`ScreenSettle`, data.ts). Omit it for a destination that never goes still:
   * the board is animating for the whole round, so gating on stillness there
   * would spend the budget on every single navigation to one.
   */
  settleMaxMs?: number;
  /** Rest at the end of a round that did not arrive, ms. */
  restMs: number;
  /** Settle budget per round while the app is still coming up, ms. 0 to skip. */
  startupWaitMs: number;
  /** Get here first. */
  via?: PageName;
  /** Runs once the destination is confirmed. */
  arrive?: (this: Tsum) => void;
}

type NavPlanMap = { [page: string]: NavPlan | undefined };

// --- The route graph and the forecast (data.ts, forecast.ts) ---

/**
 * One edge of the route graph: a tap on one screen, and where it lands.
 *
 * Declared in `data.ts` (`PageRoutes`, `AnchorRoutes`) and read only forward --
 * see the header there for why nothing consults it during detection.
 */
interface PageRoute {
  /**
   * What is pressed to take it: a `PageDef` anchor (`PageAnchor`) when the
   * button is one the table locates per page, otherwise the `Button` name, and
   * `''` for a screen that leaves on its own with nothing pressed at all.
   */
  via: string;
  /**
   * Where it lands, when the tree can name it. Absent means the tap is known
   * and its destination is not -- which is the honest answer for the fallback
   * `back`, and a more useful one than leaving the edge out.
   */
  to?: PageName;
  source: RouteSource;
}

type PageRouteMap = { [page: string]: PageRoute[] | undefined };

/** What the queue is expected to do with one subscription. */
type ForecastOutcome = 'acts' | 'passes' | 'skipped';

/** One subscription's place in the queue for the frame being forecast. */
interface ForecastStep {
  id: string;
  category: PageCategory;
  outcome: ForecastOutcome;
}

/** One task, as the scheduler is about to see it. */
interface ForecastTask {
  name: string;
  /** ms until it is due. <= 0 means due now. */
  dueInMs: number;
  intervalMs: number;
  /** Its place among the jobs due at once: lower first. */
  priority: number;
}

/** A route out of the current page, scored against where the script is going. */
interface ForecastRoute extends PageRoute {
  /** Where the tap lands, for an anchor the matched entry carries. */
  at?: Coord;
  /** True when taking this edge gets closer to the current goal. */
  advances: boolean;
}

/** Everything knowable about what the script is about to do, in three layers. */
interface Forecast {
  /** Layer 1: the dispatch queue for this frame. */
  steps: ForecastStep[];
  /** Which subscription is expected to touch the screen; `''` for none. */
  actor: string;
  /** Layer 2: the scheduler, due-first. */
  tasks: ForecastTask[];
  /** Layer 3: the ways off this screen. */
  routes: ForecastRoute[];
  /**
   * The one of those the acting handler is about to take, joined through its
   * `takes`. Null when nothing is acting, or when what acts takes no declared
   * edge -- a blind escape from `Unknown`, or a wait.
   */
  intent: ForecastRoute | null;
  /** The screen before this one. */
  previous: PageName;
  page: PageName;
  goal: PageName | '';
  /** The path the graph says leads to `goal`, current page first; empty if none. */
  path: PageName[];
}

// --- Board / pathfinding shapes ---

/**
 * What a tsum's face looks like in grey, read off the board gray inside the
 * circle: the spread of the samples and the brightest one. Only ever compared
 * between two near-grey colours -- see `distance3D` in `src/pathfinding.ts`.
 */
interface TsumTexture {
  contrast: number;
  peak: number;
}

/**
 * One tsum found by `findTsums`: position and radius in the play-square capture
 * space, plus the sampled colour as the chroma feature `chromaFeature` makes of
 * the HSV read (b/g/r hold that feature's three axes), and its texture.
 */
interface TsumPoint extends TsumTexture {
  x: number;
  y: number;
  z: number;
  b: number;
  g: number;
  r: number;
}

/** One colour cluster from `classifyTsums`: a running mean plus its members. */
interface TsumCluster extends TsumTexture {
  sumb: number;
  sumg: number;
  sumr: number;
  sumContrast: number;
  sumPeak: number;
  b: number;
  g: number;
  r: number;
  points: TsumPoint[];
}

/**
 * A board tsum as the pathfinder sees it: position shifted to the tsum's
 * top-left corner, tagged with the colour cluster it belongs to. `tsumIdx` is a
 * string because the board is built from a `for (... in ...)` over the clusters.
 */
interface BoardPoint {
  tsumIdx: string;
  x: number;
  y: number;
}

/**
 * A connectable chain of same-colour tsums, carrying an extra `tsumIdx` tag
 * identifying which colour cluster it belongs to (used to prioritise the
 * player's own tsum in 5>4 mode).
 */
interface TsumPath extends Array<BoardPoint> {
  tsumIdx?: number;
  /**
   * y of the tsum the search grew this chain from -- `[0].y`, kept as its own
   * field so a caller ordering by anchor need not know which end that is.
   * `calculatePaths` always sets it; only under `lowFirst` is the start itself
   * chosen low, which is what makes it worth ordering by.
   */
  startY?: number;
}

/** A game bubble located by `findGameBubbles`: centre plus radius. */
interface GameBubble {
  x: number;
  y: number;
  r: number;
}

/**
 * A bubble `lorcanaFindBubbles` found: a `GameBubble` plus what its middle
 * reads as, which is how the ink stone's bubble is told from the rest.
 */
interface LorcanaBubble extends GameBubble {
  /** Mean colour of a small cross at the middle, off the play-square capture. */
  color: Color;
  /** `color.b - color.r`. The stone reads cool where every other bubble is warm. */
  cool: number;
}

// --- Native image handles ---

declare const NativeImageBrand: unique symbol;

/**
 * Opaque handle to a native (OpenCV) image. Every one of these must be handed
 * to `releaseImage`, which is why the type is nominal: it makes a raw number or
 * object impossible to pass where an image is expected.
 */
interface NativeImage {
  readonly [NativeImageBrand]: true;
}

// --- Round stats (roundStats.ts) ---

/** A number field on screen: where it is, and what colour its digits are. */
interface StatsRegion {
  /** Used in log lines and debug-shot names. */
  name: string;
  /** Logical 1080x1920 coordinates, converted by toRealXY(). */
  x: number; y: number; w: number; h: number;
  /** Inclusive colour bounds as [r, g, b] -- reversed when handed to inRange. */
  lo: [number, number, number];
  hi: [number, number, number];
}

/** A portrait rect in logical 1080x1920 coordinates. `MyTsumPortrait` holds two. */
interface MyTsumRect {
  from: Point;
  to: Point;
}

/**
 * A library entry with its signature decoded, as `myTsumLibrary` holds it.
 *
 * `short` is the game's own id for the tsum, what goes in the CSV's `tsum`
 * column, and the key its sprite and its printed name share. It is
 * read out of `tsums.dat` -- see that file's header for the layout, and
 * `myTsumLoadLibrary` for what happens when it cannot be.
 */
interface MyTsumEntry {
  short: string;
  full: string;
  /** The signature through `myTsumPrepare`: centred, unit length, ready to dot. */
  vec: number[];
  /**
   * What this tsum reads as on the board -- HSV in a `Color`, as `MyTsumBoard`
   * describes. Null when the library carries no colour for it, or carries one
   * this build did not derive; both mean "sample the skill button instead".
   */
  board: Color | null;
}

/**
 * What one finished round came to, for `round.end` to carry.
 *
 * Written by `finishRoundStats` and read once, by its caller. Every figure is
 * nullable because the score page may not have been readable. No id here: the
 * round already has one (`Tsum.roundUid`), and the row takes that.
 */
interface RoundOutcome {
  seconds: number;
  score: number | null;
  baseCoins: number | null;
  finalCoins: number | null;
  medals: number | null;
}

/** The best library entry for a signature, and how far clear of the runner-up. */
interface MyTsumMatch {
  short: string;
  full: string;
  score: number;
  /** `score` itself when the library holds one entry: there is no rival to beat. */
  margin: number;
}

/**
 * What the pre-round screen says is selected right now: the best library entry
 * for the icon on it, plus whether that match may be believed.
 */
interface MyTsumSelection extends MyTsumMatch {
  /** Both `MyTsumPortrait.minScore` and `.minMargin` cleared. */
  confident: boolean;
}

// --- Records (the heart-sender history) ---

/** The running send/receive tallies, stored under `hearts_count`. */
interface HeartsCount {
  receivedCount: number;
  sentCount: number;
}

/**
 * The run's coin totals, kept by `finishRoundStats` and read by the Quick Bar.
 *
 * Three counts rather than one because a round can write a row with either coin
 * figure missing -- the level-up panel never showed, or the tally would not read
 * -- and an average taken over rounds that had no number is not an average of
 * anything. `rounds` is every row written; the other two are the rounds that
 * actually contributed to each total.
 */
interface RunCoinTally {
  rounds: number;
  baseRounds: number;
  baseTotal: number;
  finalRounds: number;
  finalTotal: number;
}

/**
 * `tsum_record/record.txt` as parsed: the account's running heart tally, and
 * nothing else. It used to carry one entry per recorded sender beside this,
 * which is why it is a table rather than the counts themselves.
 *
 * Optional because the file is user data read straight from JSON -- an absent
 * or hand-edited one is a missing key, not a parse error, and `buildRun` seeds
 * it.
 */
interface TsumRecord {
  hearts_count?: HeartsCount;
}

// --- Skills ---

/** How full the skill gauge reads: fired, nearly there, or plainly empty. */
declare const enum SkillReadiness {
  Active = 'active',
  Almost = 'almost',
  Far = 'far',
}

// --- Formal Suit Beast (skills/formalBeast.ts) ---

/**
 * One look at Formal Suit Beast's twin gauge.
 *
 * `readable` is the mode test as well as a health flag: the crop only reads as
 * a gauge when both halves are lit from their outer end inwards and nothing
 * else, which an ordinary board's bottom row cannot fake. Both fills are 0 when
 * it is false, so a caller that ignores it biases nothing.
 */
interface FormalBeastReading {
  readable: boolean;
  /** How full each half is, 0..1, at the resolution of one probe step. */
  beast: number;
  belle: number;
}

// --- Native dialogs (dialogs.ts) ---

/** Panel geometry, in both scan-image and device pixels. */
interface DialogBox {
  x0: number; y0: number; x1: number; y1: number;  // scan-image space
  dx0: number; dy0: number; dx1: number; dy1: number;  // device space
  scale: number;
  sw: number; sh: number;
}

/** Per-loop stall bookkeeping; see checkStall. */
interface StallGuard {
  where: string;
  /** The last page handled; `''` before the first round, which no page equals. */
  page: PageName | '';
  repeats: number;
  rounds: number;
  dialogTried: boolean;
  restarts: number;
  /** The page `nav.noRoute` was last reported for, so a stall on one page says so once. */
  noRoute: PageName | '';
}

// --- Click Assist (clickAssist.ts) ---

/** The touchscreen input device, as parsed out of `getevent -lp`. */
interface TouchDevice {
  path: string;
  xMax: number;
  yMax: number;
}

// --- Tiara Minnie+ (skills/tiaraMinniePlus.ts) ---

/**
 * The capture pixel each grid cell reads from, flat and in row order.
 *
 * `pts` is the same list in getImageColors' shape; cells outside the capture
 * are (-1, -1) there, which that call reports as all-zero.
 */
interface TiaraCells {
  px: number[];
  py: number[];
  pts: Point[];
}

/** A sampled template reduced to just the cells it marks as present. */
interface TiaraTemplate {
  idx: number[];
  hx: number[];
  hy: number[];
  sat: number[];
  val: number[];
  n: number;
}

/** One present centre from one layout, with its precomputed cell table. */
interface TiaraCandidate {
  x: number;
  y: number;
  count: number;
  px: number[];
  py: number[];
}

/**
 * One scan's pixel list: the template's masked cells for every candidate, laid
 * end to end so a sweep is a single getImageColors call. `starts[c]` is where
 * candidate c's run begins; each run is `tpl.n` long.
 */
interface TiaraScan {
  points: Point[];
  starts: number[];
  tpl: TiaraTemplate;
}

/** One candidate's similarity to the template, and how much of the mask is lit. */
interface TiaraCandidateScore {
  score: number;
  coverage: number;
}

/** The best-scoring candidate of a scan, and how far clear of its nearest rival. */
interface TiaraMatch {
  x: number;
  y: number;
  count: number;
  score: number;
  /** Share of the template's cells that are bright and saturated here. */
  coverage: number;
  margin: number;
  // Filled in only by tiaraPick, on the match it tapped, for the log.
  /** Scans taken before the tap went out. */
  scans?: number;
  /** What the last scan cost, measured. */
  scanCost?: number;
  /** How long the choice screen had been readable when the tap went out. */
  readableMs?: number;
  /** Whether a second, separated scan confirmed the centre, or it was a last chance. */
  confirmed?: boolean;
}

/** One look at the thought bubble, and whether it was fully open at the time. */
interface TiaraLook {
  cells: number[];
  open: boolean;
}

// --- Scheduling ---

/** A unit of work scheduled by the TaskController. */
interface Task {
  name: string;
  run: () => void;
  interval: number;
  runTimes: number;
  /** Lower runs first among the jobs due at once; distinct per job. `JobPriority`, src/runPlan.ts. */
  priority: number;
  lastRunTime: number;
  /** Consecutive throws from this job; `TaskErrorsBeforeRestart` of them bounce the app. */
  errors: number;
  status: number;
}

// --- Static tuning constants ---

/** Static tuning constants for the player. */
interface TsumConfig {
  recordDir: string;
  tsumWidth: number;
  screenResize: number;
  colors: number[][];
  /**
   * How far apart two same-coloured tsums may be and still be linked, as a
   * multiple of `tsumWidth`. Set from the "Link reach" setting, which carries
   * it as an integer percentage.
   *
   * This, not `maxChain`, is what decides how long a chain can get: it builds
   * the graph, and `maxChain` can only cap what the graph already made
   * reachable. Too low and the same-colour components are 2-4 nodes so no long
   * chain exists; too high and the search proposes hops the game refuses, so
   * the drag links nothing and the same board is scanned and redrawn.
   */
  linkReach: number;
  maxChain: number;
  debugLogs: boolean;
  /**
   * Page-history frames an issue report copies, and so the number the router
   * keeps on disk (`PageRouter.shotDepth`).
   *
   * Here rather than in `src/report.ts` because the router reads it when its
   * singleton is built, which is several files before that one is evaluated --
   * and two numbers, one per side, would be a trail deeper than anything
   * collects or shallower than what a report asks for.
   */
  reportTrailFrames: number;
  /**
   * How far the best-scoring page must lead the best *differently named* one
   * before the match is trusted, in the [0,1] slack units `scorePage` reports.
   *
   * 0 -- the default -- means "never reject", so scoring acts purely as a
   * tiebreak between entries that all passed, which is what declaration order
   * used to decide arbitrarily. A win on evidence (more probes) reports a
   * margin of 1 and so is never rejected. Raise it only once `npm run pages:eval` over a
   * real corpus shows what a safe floor is; too high turns recognised screens
   * into `Unknown`, which the navigation loops handle far worse than a
   * mis-identification.
   */
  pageMinMargin: number;
  /**
   * Judge each entry on its probes' 3x3 capture blocks rather than on the
   * centre pixels alone -- one *shift* for all of an entry's probes, tried nine
   * ways, centre first. The idea is that a device or dpi resampling the screen
   * moves every landmark the same way, so a fingerprint should survive it.
   *
   * Off, because measuring it over the corpus said it is all cost: of 2852
   * (frame, entry) pairs it rescued the right entry on **none** and brought a
   * *wrong* entry closer to claiming the frame on **487**. Nine chances to
   * land on a matching pixel help a probe sitting on flat colour it should not
   * be matching at least as much as they help a real landmark, and this table
   * has plenty of the former -- it is a third of what took `TsumLevelUp` from
   * missing the friends page to claiming it, and the Card button being pressed
   * on the hub was the visible half of that. `pages:eval` is 46/46 either way.
   *
   * Turn it on only alongside a corpus that shows a device this table cannot
   * otherwise recognise, and re-run `npm run pages:calibrate` after: thresholds
   * are set under whichever rule this selects.
   */
  pageShiftTolerance: boolean;
}

// The `Settings` object `start()` receives lives in shared.d.ts, which is the
// one file both this compilation and the settings UI's include -- so the object
// the UI builds and the object the script reads are checked against one type.

// ---------------------------------------------------------------------------
// Tsum: the methods attached to the prototype outside tsum.ts's class body.
//
// Merged into `class Tsum`. Grouped by the file that implements each one.
// ---------------------------------------------------------------------------

interface Tsum {
  // --- tsum.ts ---------------------------------------------------------
  init(detect: boolean): void;
  screenshot(): NativeImage;
  playScreenshotSquare(): NativeImage;
  toResizeXY(x: number, y: number): Point;
  toResizeXYs(xy: Coord): Point;
  getColor(img: NativeImage, xy: Coord): Color;
  getColors(img: NativeImage, xys: Coord[]): Color[];
  /** The 3x3 capture block around each probe, centre first -- see tsum.ts. */
  getColorBlocks(img: NativeImage, xys: Coord[]): Color[][];
  toRealXY(x: number, y: number): Point;
  toRealXYs(xy: Coord): Point;
  tap(xy: Coord, during?: number): void;
  tapDown(xy: Coord, during?: number): void;
  moveTo(xy: Coord, during?: number): void;
  tapUp(xy: Coord, during?: number): void;
  /**
   * Drag one column of the screen and answer how many of `sample`'s points the
   * drag changed. Shared by the friend list and the mailbox: both need "did it
   * actually move?", which is also both lists' end-of-list test.
   */
  dragList(x: number, path: number[], settleMs: number, sample: ListSample): number;
  /**
   * Blind escape from a screen nothing fingerprinted: cancel buttons, close
   * buttons, dpad + enter. Detection and the reaction to it live in
   * `gPages` (pages.ts); this is only the escape itself, which the router's
   * `nav.move.unknown` subscription calls and a few tasks call directly.
   */
  exitUnknownPage(): void;
  isOnScreenshot(img: NativeImage, pageObject: Coord, colorDiff?: number): boolean;
  /**
   * Queue one line for the floating window's banner. See `showBanner`.
   * Silent on a host that has no banner rather than taking the run down.
   */
  banner(message: string, durationMs?: number, plays?: number): void;
  /**
   * Broadcast one event to tooling following this run. See `emitEvent`, and
   * EVENTS.md for what each one carries. Names come from `Emit`
   * (src/scriptEvents.ts); silent on a host that has no `emitEvent`.
   */
  emit(name: string, data?: unknown): void;
  /**
   * Tell the host the top-most screen row this script reads, so its status
   * line stays above it. See `setReadTop`; derived from the tables, and silent
   * on a host that has no such call.
   */
  declareReadTop(): void;

  // --- waits.ts --------------------------------------------------------
  sleep(t?: number): void;
  sleepUntil(deadline: number): void;
  /**
   * Wait for the screen to stop moving, up to `maxMs` (`ScreenSettle.maxMs` when
   * omitted). False means it never did, or the run stopped.
   */
  settleScreen(maxMs?: number): boolean;
  /**
   * Wait for the tsums to stop moving, up to `maxMs` (`BoardSettle.maxMs` when
   * omitted) and not before `minMs` (`BoardSettle.minMs`): `settleScreen`'s
   * counterpart for the board, which the full-screen grid can never call still.
   * False means they never did, or the run stopped.
   */
  settleBoard(maxMs?: number, minMs?: number): boolean;
  /** `isRunning`, and no level-cap sweep waiting to take the screen (`yieldAsked`). */
  mayContinue(): boolean;

  // --- appLifecycle.ts -------------------------------------------------
  isAppOn(): boolean;
  /** Forget the cached `isAppOn` answer; call after moving the game in or out of focus. */
  invalidateAppOn(): void;
  startApp(): void;
  /** Wait for a launched game to be in front on a known screen; false at the budget. */
  awaitAppUp(): boolean;
  /** Wait for a force-stopped game to leave the foreground; false at the budget. */
  awaitAppOff(): boolean;
  forceRestartApp(): boolean;
  taskTsumAppRestart(): void;

  // --- board.ts --------------------------------------------------------
  linkTsums(path: Point[]): void;
  /** Scans still to go before a mid-chain pop is worth taking again. */
  bubbleSettleScans: number;
  /** The chain length that earns a bubble pop, bounded by the chain cap in
   * force -- `Config.maxChain`, or the selected skill's `chainLimits`. */
  bubblePopChainLength(): number;
  /** How many bubbles the Bubble Strategy setting allows one pop to spend. */
  bubbleTapBudget(): number;
  /**
   * Tap the bubbles the last board scan found, up to `limit` (default: what
   * `bubbleTapBudget` allows). Pass one only to override the setting outright.
   */
  popGameBubbles(limit?: number): void;
  /** Returns whether a chain long enough to spawn bubbles was linked. */
  link(paths: TsumPath[], board?: BoardPoint[]): boolean;
  clearAllBubbles(startDelay?: number, endDelay?: number, fromY?: number, delayBetweenLines?: number): void;
  /** Mean HSV of the MyTsum portrait, comparable with a `TsumCluster` centre. */
  sampleMyTsumColor(): Color;
  /**
   * The cluster centre behind each `tsumIdx` the last board scan produced, in
   * the same HSV space `findTsums` samples (`b` is hue, 0..179). Rewritten by
   * every scan, empty before the first.
   *
   * Everything downstream of the scan sees only the index, so this is the one
   * place the colour behind it survives -- which is what lets a skill that has
   * to tell two colours apart do so (`SkillHandler.orderPaths`).
   */
  boardClusters: Color[];
  scanBoardQuick(): BoardPoint[];

  // --- play.ts ---------------------------------------------------------
  checkGameItem(): void;
  /** After the Start tap: wait for the pre-round screen to leave and the board to arrive. */
  awaitRoundStart(): boolean;
  /**
   * Open a round -- mint its id, freeze its settings, emit `round.start`.
   * Called from the pre-round screen just before Start is tapped, and again
   * from the board; gated on `openingRound`, so only the first of the two
   * announces. See `openRound` in play.ts.
   */
  openRound(): void;
  confirmGameOver(): boolean;
  /**
   * One liveness look at the round, carrying the debounce in `hud`. Stamps
   * `roundEndedAt` and emits `round.over` on the turn it answers `Over`.
   */
  watchRoundEnd(hud: HudWatch): RoundLook;
  /** What is left of the between-rounds delay, in ms; 0 when none is running. */
  roundDelayRemainingMs(): number;
  taskPlayGameQuick(): void;

  // --- corpus.ts -------------------------------------------------------
  /** Where saveCorpusFrame writes, under the record directory. */
  corpusDir(): string;
  /** Save the current screen for offline page work. Returns whether it wrote. */
  saveCorpusFrame(tag: string): boolean;
  corpusSidecar(tag: string): string;
  corpusCandidates(): string;

  // --- report.ts -------------------------------------------------------
  /** Where one report folder per issue is written, under the record directory. */
  reportsDir(): string;
  /**
   * Write one issue report and answer with its id, or `''` if nothing was
   * written -- this run's cap, or a report already in progress. Never throws.
   */
  saveReport(reason: string, note?: string): string;

  // --- mail.ts ---------------------------------------------------------
  taskReceiveAllItems(): void;
  fetchAllMails(): void;
  /**
   * The mail rows drawn in full on this frame, as offsets to add to the
   * `outReceive*` probes to reach each one, top to bottom. Negative for a row
   * above the one "Skip first person" starts at; 0 is that row itself.
   *
   * Found rather than assumed, because a scrolled list does not come to rest on
   * a row boundary -- see `MailList` (`src/data.ts`).
   */
  readMailRows(img: NativeImage): number[];
  /**
   * Which mail row a Skip Medals pass should open, as one of `readMailRows`'
   * offsets; `MailNoRow` when nothing on screen can be opened, `MailAllMedals`
   * when every row on screen is a Mission Clear medal and the hearts under them
   * are only out of sight.
   */
  mailRowToOpen(img: NativeImage): number;
  /** Drag the mail list on; false when it did not move, so the mail ended. */
  scrollMailList(): boolean;
  skipAd(): void;
  taskReceiveOneItem(): void;

  // --- hearts.ts -------------------------------------------------------
  friendPageGoToSelf(): void;
  /** The tappable hearts on this frame of the friend list, top to bottom. */
  readHeartColumn(img: NativeImage): Point[];
  /** Whether the row this heart belongs to shows no score at all. */
  friendRowScoreIsZero(img: NativeImage, heart: Point): boolean;
  /**
   * Poll the narrowed page set until `want` shows up, answering with the page
   * it stopped on. `abortOn` ends the wait early once that page has held for
   * `HeartOkLostPolls`.
   */
  waitForHeartPage(want: PageName, polls: number, abortOn?: PageName): PageName;
  /** Tap one heart and see it through the gift dialog and the toast. */
  sendOneHeart(heart: Point): boolean;
  /** Send every heart on the screenful in front of us. */
  sendHeartsOnPage(stopAtZeroScore: boolean): HeartPageResult;
  /** Drag the list one screenful; false when it did not move, so the list ended. */
  scrollFriendList(down: boolean): boolean;
  /** Whether the run has spent its `sendHeartMaxDuring` budget. */
  outOfHeartTime(startTime: number): boolean;
  /**
   * One direction of the sweep. True means it ran out of list; false means it
   * stopped early, on the time budget or on shutdown, and the phase is unfinished.
   */
  sweepHearts(down: boolean, startTime: number): boolean;
  taskSendHearts(): void;
  readRecord(): void;
  saveRecord(): void;

  // --- walkthrough.ts --------------------------------------------------
  walkthroughDir(): string;
  /** Full-resolution screen pixels back to the 1080x1920 space the tables use. */
  toLogicalXY(x: number, y: number): Point;
  /** Keep the screen if this page still has frame budget; the basename, or `''`. */
  walkSaveFrame(seq: number, page: PageName): string;
  /** The visit being recorded, or undefined before the first one. */
  walkCurrentVisit(): WalkVisit | undefined;
  walkRecordTap(point: Point): void;
  /** Close the open visit and start one for `match`; `null` means unrecognised. */
  walkEnterPage(match: PageMatch | null): void;
  walkFlush(): void;
  taskWalkthrough(): void;

  // --- levelCap.ts -----------------------------------------------------
  /** Which order the open Change Order dialog says the collection is in; null when it cannot tell. */
  readCollectionSort(): CollectionSort | null;
  /** Put the collection in `order`. The order it was in before, or null when the dialog failed. */
  sortCollection(order: CollectionSort): CollectionSort | null;
  /** Put the collection back in `order` once the sweep is done; nothing to do for Level Lock. */
  restoreCollectionSort(order: CollectionSort): void;
  /** The raise loop. The fields for `Log.Unlock.End`, or null when the run stopped under it. */
  raiseCappedCards(): LogFields | null;
  /** Is the collection showing its first eight cards? By the left chevron's absence. */
  collectionAtFirstPage(): boolean;
  /** Tap the left arrow until the collection is back on its first page. */
  rewindCollection(): boolean;
  /** Which of the eight cards on this collection page are at their level cap. */
  readCappedCards(): boolean[];
  /** Select card `slot` and raise its tsum's cap; false stops the sweep. */
  raiseCardLevelCap(slot: number): boolean;
  /** Tap the "level cap raised" toast away, until the collection is back. */
  leaveLevelCapToast(): boolean;
  /**
   * Poll for `page` until it shows or `timeoutMs` runs out. `event` names the
   * chore in the give-up line; the level-cap sweep's when it is left out.
   */
  awaitPage(page: PageName, timeoutMs: number, event?: LogEvent): boolean;
  /** True once the sweep has run; false when it stood aside for a paused round. */
  taskAutoUnlockLevel(): boolean;

  // --- boxes.ts --------------------------------------------------------
  /** The store's box tab row, or null while it is still loading. */
  readBoxTabs(): BoxTabRow | null;
  /** The tab row once it is drawn, or null when `timeoutMs` ran out first. */
  awaitBoxTabs(timeoutMs: number): BoxTabRow | null;
  /** Put the store on `box`. The row width it found, or null when that box is not there. */
  openBoxTab(box: BoxType): number | null;
  /** Is a purchase button drawn at `x`, and can it be pressed? */
  readBoxButtonAt(img: NativeImage, x: number): BoxButtonState;
  /** Where to tap for each purchase size on the open box, and whether anything is sold out. */
  readBoxPurchase(): BoxPurchaseOffer;
  /** The offer once its buttons are drawn; the last reading when `timeoutMs` ran out. */
  awaitBoxPurchase(timeoutMs: number): BoxPurchaseOffer;
  /** Tap through everything one purchase opened, until the store is back or `deadline` passes. */
  clearBoxReveals(deadline: number): BoxReveals;
  /**
   * Buy one box at the size asked for, falling back to 1-Time where that is all
   * there is. `purchase` / `limit` are where this one sits in the sweep, for the
   * log line only.
   */
  buyOneBox(tenTimes: boolean, purchase: number, limit: number): BoxPurchaseOutcome;
  /** The purchase loop. The fields for `Log.Box.End`, or null when the run stopped under it. */
  buyBoxes(box: BoxType, tenTimes: boolean, maxPurchases: number): LogFields | null;
  /** True once the sweep has run; false when it stood aside for a paused round. */
  taskBuyBoxes(): boolean;

  // --- fever.ts --------------------------------------------------------
  /**
   * Is a fever running on this frame? One look, no memory and no events.
   *
   * Captures its own frame when none is given; pass one you already hold and
   * this costs a single batched probe read. `gFever` is the same answer with a
   * debounce and a broadcast around it.
   */
  isFeverTime(img?: NativeImage): boolean;

  // --- lorcana.ts ------------------------------------------------------
  /**
   * Play a Lorcana tsum's transformation and its ink stones -- the "Lorcana
   * Card" setting, read here by `buildRun`.
   */
  lorcanaCard: boolean;
  /**
   * One crop read of the skill button: how much of the medallion's gold rim is
   * there, as a fraction of the angles sampled (present means not yet
   * transformed), or null when the button is off the capture. See
   * `LorcanaConfig` for why it cannot be a page probe.
   */
  lorcanaReadMedallion(): number | null;
  /**
   * The play loop's per-scan step: read the medallion, keep the transformation
   * state from its rim, and tap where the card sits while the medallion is
   * there. Returns true on the call that transformed the tsum.
   */
  lorcanaMaybeTapCard(): boolean;
  /**
   * Tap the ink-stone bubble the last activation left, or every bubble when
   * none of them stands out. Returns how many taps went out. A deliberate
   * override of the Bubble Strategy setting -- see the function.
   */
  popLorcanaStoneBubble(): number;

  // --- skills/skillCore.ts ---------------------------------------------
  checkSkillReadiness(img: NativeImage, skillButton: Coord): SkillReadiness;
  /** `checkSkillReadiness` for gameSkill1 off a crop, without a whole-screen capture. */
  checkSkillReadinessFast(): SkillReadiness;
  fanWouldBeWasted(): boolean;
  /**
   * Fire the skill the moment the gauge is ready, rather than at the end of the
   * board-scan cycle. True means a *choreographed* activation ran, so any plan
   * made before this call is stale -- see `Tsum.link`.
   */
  maybeAutoTapSkill(board?: BoardPoint[]): boolean;
  /**
   * A skill's hold on "Link MyTsum first": `false` stops the play loop linking
   * MyTsum chains first, `true` lifts the hold. Never touches the setting, so
   * it cannot enable a priority the player has off.
   */
  setMyTsumPriority(enabled: boolean): void;
  /** `fast` takes the cropped-probe, short-debounce path used for overloading. */
  useSkill(board?: BoardPoint[], fast?: boolean): boolean;

  // --- dialogs.ts ------------------------------------------------------
  dialogScreenshot(sw: number, sh: number): NativeImage;
  findSystemDialog(): DialogBox | null;
  findDialogButton(box: DialogBox): Point | null;
  dumpUiXml(): string;
  tapDialogButtonViaUi(box: DialogBox): boolean;
  dialogChanged(box: DialogBox): boolean;
  tryDismissDialog(box: DialogBox, hint?: Coord): boolean;
  dismissSystemDialog(hint?: Coord): boolean;
  saveDebugScreenshot(tag: string): void;
  newStallGuard(where: string): StallGuard;
  checkStall(guard: StallGuard, page: PageName): void;

  // --- roundStats.ts ---------------------------------------------------
  /** The number in `region`, or null if it held anything but one clear number. */
  readStatsNumber(region: StatsRegion): number | null;
  /**
   * Every number in `region`, left to right, or null if any glyph was unclear.
   * Never an empty array -- an empty region reads as null.
   */
  readStatsNumbers(region: StatsRegion): number[] | null;
  /** As readStatsNumber, but re-reads until the same value comes back twice. */
  readSettledStatsNumber(region: StatsRegion): number | null;
  beginRoundStats(): void;
  /** Read the coin counter off the level-up screen; see `record.baseCoins`. */
  sampleBaseCoins(): void;
  /**
   * Whether the score page showed, and finished counting up, before the wait
   * ran out.
   */
  waitForScorePage(): boolean;
  /**
   * Whether this tally draws Play beside Close, which a point battle's does not.
   * Takes its own frame unless given one.
   */
  tallyPlayShown(img?: NativeImage): boolean;
  finishRoundStats(): void;
  saveStatsDebugShot(tag: string): void;
  writeRoundStats(date: Date, seconds: number, score: number | null,
                  baseCoins: number | null, finalCoins: number | null,
                  medals: number | null): void;
  /**
   * `MyTsumPortrait.icon` on the pre-round screen, reduced to a signature --
   * or null if it could not be read.
   */
  myTsumSignature(rect: MyTsumRect): number[] | null;
  /**
   * Which tsum is selected in game, read off the pre-round button icon now.
   * Null when the icon could not be read or the release carries no library.
   */
  selectedTsum(): MyTsumSelection | null;
  /** Read the pre-round button icon and set `myTsum`; see `record.myTsum`. */
  identifyMyTsum(): void;

  // --- clickAssist.ts --------------------------------------------------
  findTouchDevice(): TouchDevice | null;
  /** The touch position in screen pixels, or null on timeout. */
  pollTouchDown(timeoutSec: number): Point | null;
  taskClickAssist(): void;

  // --- skills/cinderella.ts, skills/cptLy.ts ---------------------------
  useCinderellaSkill(): void;
  /** `timing` defaults to the 60fps table; see CptLyTiming in skills/cptLy.ts. */
  useCptLySkill(activatedAt?: number, timing?: CptLyTiming): void;

  // --- skills/coronationElsa.ts ----------------------------------------
  /**
   * Set off the pile of frozen tsums: aimed taps over `frozen`, then the blind
   * grid behind them. Returns how many of the taps were aimed.
   */
  /**
   * Set off the pile: aimed taps down the sorted pile, then -- only when
   * `grid` says so -- the blind sweep. The closing burst passes true; a
   * mid-window burst must not, or the grid taps ice the model never claimed.
   */
  elsaBurstFrozen(frozen: BoardPoint[], grid: boolean): number;
  /**
   * One settled capture (a mid-fall or bubbled ice-free look is retaken, up to
   * twice each), then chains chosen for coverage until the board offers none
   * or `closesAt` passes. `expected` is the settle gate's board population.
   * Returns the board points the model believes are now ice, how many chains
   * the pass drew, and the whole population it read.
   */
  elsaFreezePass(closesAt: number, expected?: number):
    { iced: BoardPoint[], chains: number, read: number };
  /**
   * Play out the freeze window: freeze until no more chains can be made, then
   * burst -- the clock forces the burst only at `burstTailMs` before close.
   * `expectTsums` seeds the settle gate with the pre-activation board's size.
   */
  useCoronationElsaSkill(activatedAt?: number, expectTsums?: number): void;

  // --- skills/formalBeast.ts -------------------------------------------
  /**
   * One reading of the twin gauge, off a native-resolution crop of the arc.
   *
   * Costs one small capture and one batched colour read; takes no view of what
   * came before it. `gFormalBeast` is the same answer with the mode's state
   * around it, and is what the play loop actually consults.
   */
  readFormalBeastGauges(): FormalBeastReading;

  // --- skills/tiaraMinniePlus.ts ---------------------------------------
  tiaraBoardSignature(): number[];
  tiaraWaitForSettledBoard(): boolean;
  tiaraCapture(): NativeImage;
  tiaraSample(img: NativeImage, cells: TiaraCells): number[];
  tiaraCloudCapture(): NativeImage;
  tiaraCloudFrac(img: NativeImage): number;
  /** The same pale test, read off the matching capture. See dreamCloudFull. */
  tiaraBubbleOpenFrac(img: NativeImage): number;
  /** Scores one candidate from colours the sweep already read, starting at `base`. */
  tiaraScoreCandidate(cols: Color[], base: number, tpl: TiaraTemplate): TiaraCandidateScore;
  tiaraBestMatch(img: NativeImage, scan: TiaraScan): TiaraMatch;
  /** The sampled bubble template, or null if no bubble appeared in time. */
  tiaraWaitForDream(timeoutMs: number): number[] | null;
  tiaraPick(scan: TiaraScan): TiaraMatch | null;
  useTiaraMinniePlusSkill(): number;
}

/** The Android key events the script sends. Values are platform constants. */
declare const enum KeyCode {
  DpadDown = 'KEYCODE_DPAD_DOWN',
  DpadRight = 'KEYCODE_DPAD_RIGHT',
  Enter = 'KEYCODE_ENTER',
}

// --- Native runtime (provided by the host environment) ---
declare function sleep(ms: number): void;
declare function tap(x: number, y: number, during?: number): void;
declare function tapDown(x: number, y: number, during?: number): void;
declare function tapUp(x: number, y: number, during?: number): void;
declare function moveTo(x: number, y: number, during?: number): void;
declare function tapMove(id: number, x: number, y: number): void;
declare function press(key: string | number): void;
declare function keycode(code: KeyCode, during?: number): void;
declare function swipe(x1: number, y1: number, x2: number, y2: number, steps?: number): void;
declare function getColor(x: number, y: number): Color;
declare function getColors(points: Point[]): Color[];
declare function getScreenshot(): NativeImage;
declare function getScreenshotModify(
  x: number, y: number, w: number, h: number,
  outW: number, outH: number, quality: number): NativeImage;
declare function releaseImage(img: NativeImage): void;
declare function openImage(path: string): NativeImage;
declare function saveImage(img: NativeImage, path: string): void;
declare function cloneImage(img: NativeImage): NativeImage;
declare function clone(img: NativeImage): NativeImage;
declare function cropImage(img: NativeImage, x: number, y: number, w: number, h: number): NativeImage;
declare function getBase64FromImage(img: NativeImage): string;
declare function getImageColor(img: NativeImage, x: number, y: number): Color;
/**
 * Batched `getImageColor`: one engine crossing for the whole point list, in
 * declaration order. Out-of-range points come back `{r:0,g:0,b:0,a:0}`, exactly
 * as the single-pixel call reports them, so a fixed probe table can be passed
 * without first filtering it against the frame being sampled.
 */
declare function getImageColors(img: NativeImage, points: Point[]): Color[];
declare function getImageWidth(img: NativeImage): number;
declare function getImageHeight(img: NativeImage): number;
declare function getImageSize(img: NativeImage): { width: number; height: number };
declare function getScreenSize(): { width: number; height: number };
declare function getDeviceSize(): { width: number; height: number };
declare function getStoragePath(): string;
/**
 * The loaded script's own folder -- where `tsums.dat` sits, beside `index.js`.
 *
 * Not one of the original API's globals: the host defines it per load, because
 * an install from a source sits at `scripts/<Source>/<Game>/<Name>` and
 * `getStoragePath() + '/scripts/' + appName` no longer resolves. Declared
 * optional-by-`typeof` at its one call site rather than here, since a harness
 * evaluating the bundle outside the host will not have it.
 */
declare function getScriptPath(): string;
/**
 * Twelve hex digits naming this device: the same id the host puts in its log
 * file name (`logs/script-<id>.log`) and at the end of the device's default
 * events name. Distinct per emulator instance even when several share one host
 * folder as their script root, which is what a tag kept in a file cannot be.
 *
 * Newer than the rest of the API, so it may be missing on an older host --
 * reach for it behind `typeof getDeviceId === 'function'`, like `publishStats`.
 */
declare function getDeviceId(): string;
/**
 * The top-most screen row this script reads, in screen px, so the host keeps
 * the windows it leaves up for a whole run -- the status line under the
 * floating bar -- above it, or shows nothing there. Negative withdraws it.
 *
 * Newer than the rest of the API, so it may be missing on an older host --
 * reach for it behind `typeof setReadTop === 'function'`, like `showBanner`.
 * `Tsum.prototype.declareReadTop` is the one caller.
 */
declare function setReadTop(y: number): void;
declare function getCurrentPackage(): string;
declare function launchApp(pkg: string): void;
declare function killCurrentPackage(): void;
declare function killApp(pkg: string): void;
declare function execute(cmd: string): string;
declare function readFile(path: string): string;
declare function writeFile(path: string, content: string): void;
declare function setScreenOrientation(orientation: number): void;
declare function keepScreenAwake(enabled?: boolean): void;

// --- Image-processing helpers (OpenCV-backed) ---
declare function smooth(img: NativeImage, type: number, size: number): void;
declare function convertColor(img: NativeImage, code: number): void;
declare function outRange(img: NativeImage, ...bounds: number[]): NativeImage;
declare function bgrToGray(img: NativeImage): NativeImage;
/**
 * One circle from `houghCircles`, in the native's own shape.
 *
 * `radius`, not `r`: the host writes that name (`js_houghCircles`,
 * `api_image.cpp`), and this used to be declared as `GameBubble[]` -- whose
 * field *is* `r`, so `findGameBubbles` copied `undefined` into every bubble's
 * radius and the compiler agreed with it. Nothing read the field, which is why
 * it went unnoticed; `lorcanaFindBubbles` reads it.
 */
interface HoughCircle {
  x: number;
  y: number;
  radius: number;
}

declare function houghCircles(
  img: NativeImage, method: number, dp: number, minDist: number,
  param1: number, param2: number, minRadius: number, maxRadius: number): HoughCircle[];
declare function drawCircle(
  img: NativeImage, x: number, y: number, radius: number,
  r: number, g: number, b: number, thickness: number): void;
declare function getIdentityScore(img1: NativeImage, img2: NativeImage): number;

/** One shape from `findContours`: bounding box plus filled pixel area. */
interface ContourBox {
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
}

/**
 * Mask of the pixels inside the given per-channel bounds. Bounds are **BGRA**,
 * not RGBA -- the commonest way to get an empty mask out of this.
 */
declare function inRange(img: NativeImage,
  minB: number, minG: number, minR: number, minA: number,
  maxB: number, maxG: number, maxR: number, maxA: number): NativeImage;
/** Bounding boxes of the connected shapes in a mask. `maxArea = 0` means no upper bound. */
declare function findContours(img: NativeImage, minArea: number, maxArea: number): ContourBox[];
declare function resizeImage(img: NativeImage, width: number, height: number): NativeImage;

// --- Networking ---
declare function httpClient(method: string, url: string, body: string, headers: object): string;

// --- The floating window ---
/**
 * Queue one message for the banner beside the floating bar.
 *
 * `duration` is how long it stays up in ms (0 takes the overlay's default);
 * `plays` is how many showings it gets before it leaves the cycle, 0 meaning
 * "for as long as the run lasts". The overlay cycles through everything queued,
 * and holds the last message left when that one has no lifetime to run down.
 *
 * Newer than the 52 raw APIs, so it may be missing on an older host -- go
 * through `ts.banner()`, which guards for that.
 */
declare function showBanner(message: string, duration?: number, plays?: number): void;

/**
 * Register a file of this script's whose recorded rows the host should send to
 * its stats endpoint.
 *
 * `pattern` is relative to the script's own folder and may use `*` in the file
 * name. The rows must be CSV with a header and a unique, time-sortable `id`
 * column -- which is what `roundStats.ts` already writes.
 *
 * Registration only: this never names a URL and never causes a request. The
 * host remembers the last id it managed to send for each file and sends what is
 * newer, at most once a minute, and only if the user switched it on. So it is
 * safe to call once a run and harmless to call more often.
 *
 * Newer than the rest of the API, so it may be missing on an older host --
 * reach for it behind `typeof publishStats === 'function'`, since a bare
 * reference to a missing global is a ReferenceError.
 */
declare function publishStats(pattern: string): void;

/**
 * Broadcast one of this script's own events to tooling outside the device.
 *
 * The host defines no names and reads no payloads: it adds a sequence, a UTC
 * timestamp and the script id, and carries the line to whichever consumers are
 * attached -- a desktop recorder, say. `data` is JSON-encoded; a string is
 * passed through as-is, and anything that will not encode is sent as `{}`.
 *
 * Fire-and-forget. Nothing is returned, nothing is waited on, and with nobody
 * listening it goes nowhere -- so a run must never behave differently for being
 * followed. Caps are the host's: 128 bytes of name, 16 KB of payload, 50 events
 * a second, and over any of them the event is dropped rather than throwing.
 *
 * Newer than the rest of the API, so it may be missing on an older host --
 * reach for it through `ts.emit()`, which guards for that.
 */
declare function emitEvent(name: string, data?: unknown): void;

// The settings WebView reaches `start` and `stop` by name
// through `JavaScriptInterface.runScript(<source string>)`. They are declared
// -- not just implemented -- as plain global functions in index.ts, which is
// what keeps them reachable that way; nothing inside the bundle calls them, so
// there is no ambient declaration for them here.
