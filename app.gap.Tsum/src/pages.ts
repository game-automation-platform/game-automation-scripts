// ---------------------------------------------------------------------------
// The page router: one place that decides what is on screen, and one queue that
// decides who gets to act on it.
//
// ## Why this exists
//
// Screen recognition used to be four functions on `Tsum` (`scorePage`,
// `findPageObject`, `findPage`, `matchesPage`) plus a per-entry `onDetect` hook,
// and every consumer wrote its own reaction inline: three navigation loops with
// near-identical `switch (page)` bodies, a corpus capture here, a stats sample
// there, a Magical Time cancel in three separate places because three separate
// loops could be the one that saw it. Nothing knew what anything else did, and
// two of those reactions firing on one frame -- one tapping, one reading -- read
// or tapped a screen the other had already changed.
//
// So detection is centralised here and its result is *broadcast*. Anything that
// wants to react registers a subscription instead of writing another branch, and
// the router runs those subscriptions one at a time, in a defined order, with
// the rule that the first one to touch the screen ends the round.
//
// ## The four things it owns
//
//   DETECTION   `sweep` scores every `Page` entry against a captured frame and
//               picks the best (see `betterPageMatch`). This is the *only* copy
//               of that logic; every offline harness loads the built bundle
//               through `tools/runtime/` and calls straight into it.
//   BROADCAST   every detection produces a `PageEvent`; `changed` says whether
//               the screen actually turned over since the last one.
//   THE QUEUE   subscriptions are grouped into `PageCategory` bands with fixed
//               priorities, ordered within a band, and topologically sorted by
//               their declared `after` dependencies. One at a time, so there is
//               no interleaving to race.
//   HISTORY     a bounded stack of visits, with the frames saved to disk when
//               debug is on -- which is what turns "it got stuck sometimes" into
//               a sequence you can look at.
//
// ## Permanent vs transient
//
// A permanent page waits for input: it is still there in ten seconds, and the
// only way past it is a tap. A transient one dismisses itself after a while, and
// tapping it is worse than useless -- the tap lands on whatever replaced it. The
// two need opposite handling, so every page says which it is (`PageProfiles` in
// data.ts) and the navigation band waits transient pages out instead of tapping
// them (`nav.wait.transient` in pageHandlers.ts).
//
// Transient durations are wall-clock at `PageBaselineFps`, because the game
// counts these windows in frames: a device running faster shows the page for
// less time. `PageRouter.fps` scales them (see `durationOf`).
// ---------------------------------------------------------------------------

/** How a page leaves the screen. */
const enum PageKind {
  /** Waits for input. The only way past it is a tap. */
  Permanent = 'permanent',
  /** Dismisses itself after `durationMs`. Tapping it hits whatever follows. */
  Transient = 'transient',
}

/**
 * What a page is to the flows, beyond how it leaves the screen.
 *
 * A flow that watches a screen it is on hands `sweep` the pages that screen
 * can turn into (`expect`), so an overlay cannot be read as some unrelated
 * page -- OBSCURED_BOARD.md. Those lists used to be written per caller, in
 * four files, and a page added to one and not another changed a flow nobody
 * was editing. Now each page says what it is, once, in `PageProfiles`, and the
 * lists are read off that (`inRoundPages`, `roundOverPages`, `preTallyPages`,
 * `heartSweepPages`, below). Still lists a caller passes in, never a graph the
 * router consults: that design stays rejected, for the reasons written there.
 */
const enum PageRole {
  /** The board, or the pause menu over it: a round is on. */
  Board = 'board',
  /** The score tally a finished round lands on. */
  Tally = 'tally',
  /** A panel between the end of a round and its tally: over, but not yet due. */
  PreTally = 'preTally',
  /** Only exists once the game is fully up, so seeing it ends the startup phase. */
  GameUp = 'gameUp',
  /** A screen the heart sweep branches on. */
  HeartSweep = 'heartSweep',
  /**
   * An interruption that can stand in front of any flow and has a handler able
   * to act with no goal set -- so a narrowed sweep must still be able to see it.
   */
  Interrupt = 'interrupt',
}

/**
 * The frame rate `PageProfiles`' durations are quoted at.
 *
 * The game animates these windows on a frame counter, so a device running at
 * 120fps shows a "3 second" page for about 1.5 seconds. Everything is written
 * down at 60 and scaled at runtime rather than re-measured per device.
 */
const PageBaselineFps = 60;

/**
 * How far apart two page-detection captures are taken.
 *
 * Separates one capture from the next -- successive passes of a multi-pass
 * sweep, and one retry round from the next when nothing fingerprinted. It is
 * deliberately not applied after the final capture, where there is nothing left
 * to separate it from and it only delays the caller.
 */
const PageSweepSpacingMs = 100;

/**
 * Looks that have to agree before `NavPlan.holdMs` is satisfied.
 *
 * Two, spaced by `PageSweepSpacingMs`: the look that matched the destination and
 * one more to say nothing has landed on top of it. A third would double the
 * saving's cost for a second helping of the same evidence -- what the budget is
 * really insuring against is a window arriving *later*, and no number of looks
 * taken now sees that one. `settleMaxMs` and the confirming look after it are
 * what cover the rest of the arrival.
 */
const NavHoldLooks = 2;

// ---------------------------------------------------------------------------
// Categories
//
// The bands a subscription can join, and the order they run in. These are not
// open-ended: the set below is derived from what the scripts already do on a
// page change, and the priorities encode the one ordering that is always right.
//
//   read before write       `observe` and `record` never touch the screen, so
//                           they go first and are the only bands guaranteed to
//                           run at all -- everything below them can be cut short
//                           by whoever taps first
//   evidence before action  a frame is evidence right up until something
//                           changes it, so captures and measurements precede
//                           every tap
//   safety before intent    a native dialog is not a game screen; it is handled
//                           before anything tries to navigate past it
//   dismiss before navigate an interruption sitting over the screen has to go
//                           before the navigation taps blind
//   notify last             logging and bookkeeping never decide anything
//
// Higher priority runs first. The gaps leave room for a new band without
// renumbering the ones around it.
// ---------------------------------------------------------------------------

const enum PageCategory {
  /** Read-only state updates. No taps, no captures that cost real time. */
  Observe = 'observe',
  /** Measurements and captures that are only valid while the screen is untouched. */
  Record = 'record',
  /** Safety: native dialogs, root warnings -- anything that is not a game screen. */
  Guard = 'guard',
  /** Close the interruptions standing between us and where we are going. */
  Dismiss = 'dismiss',
  /** Move the app toward the goal the look was made with. Silent when it had none. */
  Navigate = 'navigate',
  /** Logging, bookkeeping: anything with no effect on the screen. */
  Notify = 'notify',
}

var PageCategoryPriority: { [C in PageCategory]: number } = {
  observe: 100,
  record: 80,
  guard: 60,
  dismiss: 40,
  navigate: 20,
  notify: 10,
};

/** Declaration order, and the order the generated documentation lists them in. */
var PageCategoryOrder: PageCategory[] = [
  PageCategory.Observe,
  PageCategory.Record,
  PageCategory.Guard,
  PageCategory.Dismiss,
  PageCategory.Navigate,
  PageCategory.Notify,
];

/** One line per band, for `npm run pages:docs` and the studio's Dispatch tab. */
var PageCategoryPurpose: { [C in PageCategory]: string } = {
  observe: 'Read-only state updates derived from the page itself. No taps and no '
      + 'expensive captures -- these describe the frame the recorders are about to measure, '
      + 'and they are the only band guaranteed to run whatever else the queue decides.',
  record: 'Measurements and captures that are only valid while the screen is untouched: '
      + 'round statistics, corpus frames, debug shots. Everything below this line may tap.',
  guard: 'Anything that is not a game screen at all (native dialogs, the root warning) '
      + 'is handled here, before the rest of the queue is allowed to act on what it sees.',
  dismiss: 'Close the interruptions that stand between the script and where it is '
      + 'going -- offers, popups, error panels.',
  navigate: 'Move the app toward the goal the look was made with. Silent when the caller '
      + 'gave none -- every look outside navigate() -- and never on the goal page itself, '
      + 'so nothing can tap the script off its destination.',
  notify: 'Logging and progress bookkeeping. Nothing here changes what is '
      + 'on screen or what anything else decides -- which is why this band runs even when '
      + 'something above it has acted: it is recording what was seen, not acting on it.',
};

/**
 * Which edge of the route graph a step list takes: its first tap.
 *
 * Derived rather than declared beside the steps, so what the forecast says is
 * being pressed is what `perform` presses. A list whose first tap is a bare
 * coordinate takes no named edge, and neither does one that never taps.
 */
function subscriptionTakes(steps: PageStep[]): string | undefined {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.do === 'tap') {
      return step.anchor;
    }
    if (step.do === 'tapAt') {
      return step.name;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

// Rank two passing entries: more confirmed landmarks first, then more slack.
// See `PageRouter.sweep` for why evidence has to outrank comfort.
function betterPageMatch(a: PageMatch, b: PageMatch): boolean {
  if (a.probes !== b.probes) {
    return a.probes > b.probes;
  }
  return a.score > b.score;
}

/** Sorting key for the queue: band priority, then declared order, then age. */
function comparePageSubscriptions(a: PageSubscriptionEntry, b: PageSubscriptionEntry): number {
  const pa = PageCategoryPriority[a.category];
  const pb = PageCategoryPriority[b.category];
  if (pa !== pb) {
    return pb - pa;
  }
  const oa = a.order || 0;
  const ob = b.order || 0;
  if (oa !== ob) {
    return ob - oa;
  }
  return a.index - b.index;
}

// ---------------------------------------------------------------------------
// Page sets
//
// What a subscription's `pages` is when it is not a hand-written list. A
// handler that applies to every page, to every transient page, or to every
// page carrying a given button says so through one of these rather than by
// leaving `pages` out -- there is no wildcard. The set is read off what the
// pages themselves declare (`PageProfiles`, the `Page` table), so a page added
// later lands on exactly the queues its own declarations put it on, and on no
// other. Built once each: the tables are static.
// ---------------------------------------------------------------------------

var gPageSets: { [name: string]: PageName[] | undefined } = {};

/** One set, built on first use and kept: the tables it is read off are static. */
function pageSet(name: string, build: () => PageName[]): PageName[] {
  let out = gPageSets[name];
  if (out === undefined) {
    out = build();
    gPageSets[name] = out;
  }
  return out;
}

/** Every page name, `Unknown` included: the keys of `PageProfiles`. */
function allPages(): PageName[] {
  return pageSet('all', function() { return Object.keys(PageProfiles) as PageName[]; });
}

/** The pages `PageProfiles` gives this kind. */
function pagesOfKind(kind: PageKind): PageName[] {
  return pageSet('kind:' + kind, function() {
    return allPages().filter(function(page) { return PageProfiles[page].kind === kind; });
  });
}

/** The pages `PageProfiles` gives this role, in table order. */
function pagesWithRole(role: PageRole): PageName[] {
  return pageSet('role:' + role, function() {
    return allPages().filter(function(page) {
      const roles = PageProfiles[page].roles;
      return roles !== undefined && roles.indexOf(role) !== -1;
    });
  });
}

/**
 * The screens a round can end on: the tally, and the panels that come before
 * it. What `confirmGameOver` takes as proof the round is over, and what the
 * play loop's liveness check refuses to read the board as anything else -- see
 * `isRoundOverPage` (play.ts) for the frame that made the refusal necessary.
 */
function roundOverPages(): PageName[] {
  return pageSet('roundOver', function() {
    return pagesWithRole(PageRole.Tally).concat(pagesWithRole(PageRole.PreTally));
  });
}

/**
 * What a running round can be looking at: the board, the pause menu, and every
 * screen the round can end on. The play loop's liveness check passes this as
 * `expect`, because the whole table is not trustworthy mid-round -- `ClosePage`
 * is a single-pixel catch-all, and one fever frame once satisfied it.
 */
function inRoundPages(): PageName[] {
  return pageSet('inRound', function() {
    return pagesWithRole(PageRole.Board).concat(roundOverPages());
  });
}

/**
 * The panels between a finished round and its tally. `waitForScorePage` renews
 * its window on one of these rather than spending it: the tally is not late, it
 * is not due yet.
 */
function preTallyPages(): PageName[] {
  return pagesWithRole(PageRole.PreTally);
}

/**
 * What the heart sender can be looking at: the screens it branches on, plus the
 * interruptions with a handler able to act while `goal` is ''. Measured over
 * the corpus, 20 entries and 85 probes a pass instead of 58 and 332.
 *
 * `ClosePage` is deliberately not among them: the single-pixel catch-all only
 * stays honest while the full table outranks it, and in a narrowed sweep it
 * swallowed MailBox, GamePause and SquarePage frames. Left out, those read
 * `Unknown`, the poll runs out, and the sweep recovers through `navigate`,
 * which sweeps the whole table.
 */
function heartSweepPages(): PageName[] {
  return pageSet('heartSweep', function() {
    return pagesWithRole(PageRole.HeartSweep).concat(pagesWithRole(PageRole.Interrupt));
  });
}

/**
 * The pages whose `PageRoutes` row says their `back` is a way out.
 *
 * What `nav.move.exit` fires on. There is no fallback for the rest: a page
 * that has not said its `back` leaves it is not tapped blind, `navigate`
 * reports `nav.noRoute` and the stall guard takes it from there. The hub is the
 * page that must not be here -- its `back` is Play -- which is how a stray
 * fingerprint landing on it used to start rounds nobody asked for.
 */
function pagesWithDeclaredExit(): PageName[] {
  return pageSet('exit', function() {
    const out: PageName[] = [];
    for (const page in PageRoutes) {
      const rows = PageRoutes[page] || [];
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].via === PageAnchor.Back) {
          out.push(page as PageName);
          break;
        }
      }
    }
    return out;
  });
}

/**
 * The pages with a `Page` entry carrying this anchor -- by name, so a page one
 * of whose variants carries the button is included, and the handler's `acts`
 * still decides per matched entry.
 */
function pagesWithAnchor(anchor: PageAnchor): PageName[] {
  return pageSet('anchor:' + anchor, function() {
    const out: PageName[] = [];
    for (const key in Page) {
      const def = (Page as PageMap)[key];
      if (forecastAnchorAt(def, anchor) !== undefined && out.indexOf(def.name) === -1) {
        out.push(def.name);
      }
    }
    return out;
  });
}

class PageRouter {
  // --- configuration -------------------------------------------------------

  /**
   * How many visits the history keeps. 0 turns the history off entirely.
   *
   * A stack rather than a log: the interesting question after a wedge is "how
   * did it get here", which is the last handful of screens, not the last hour.
   */
  historyDepth: number;
  /**
   * Save the matcher's own frame for each visit under
   * `<storage>/tsum_record/pageHistory`.
   *
   * **On by default**, which it did not used to be. It follows a *report*
   * rather than the debug setting now: the screens leading up to a wedge are
   * the first thing anyone asks for, and a player who has just hit one will not
   * have had "Debug game" on beforehand -- so a trail that only exists once
   * somebody thought to collect it is a trail that is never there when it is
   * wanted. What keeps the cost down is `shotDepth`, not this flag.
   *
   * Files beyond `shotDepth` are deleted as their visit drops past it, so the
   * directory never grows past that number.
   */
  keepShots: boolean;
  /**
   * How many of the most recent visits keep a frame, against `historyDepth`
   * visits in the trail itself.
   *
   * Two numbers because the two cost different things: a visit is a line of
   * text, and a frame is a capture and a PNG write per page change. Eight is
   * what a report copies (`ReportTrailFrames`, src/report.ts) and so is what
   * there is any point keeping; "Debug game" raises it to the whole trail.
   */
  shotDepth: number;
  /**
   * The device's frame rate. Transient windows are quoted at
   * `PageBaselineFps` and scaled by this -- see `durationOf`.
   */
  fps: number;

  // --- current state -------------------------------------------------------

  /** What is on screen as of the last detection. */
  page: PageName;
  /** The `Page` key that matched -- variants share a name, keys are unique. */
  key: string;
  /** The matching table entry, or null on `Unknown`. */
  def: PageDef | null;
  /** When the current page was first seen. */
  since: number;
  /** When the last detection ran. */
  seenAt: number;
  /** Most recent visit first. */
  history: PageVisit[];

  // --- registry ------------------------------------------------------------

  subscriptions: PageSubscriptionEntry[];

  private tsum: Tsum | undefined;
  private nextIndex: number;
  /** Set while the queue is running, so a handler's own detect cannot recurse. */
  private dispatching: boolean;
  private shotSeq: number;
  private shotDirReady: boolean;

  constructor() {
    this.historyDepth = 20;
    this.keepShots = true;
    this.shotDepth = Config.reportTrailFrames;
    this.fps = PageBaselineFps;

    this.page = PageName.Unknown;
    this.key = '';
    this.def = null;
    this.since = 0;
    this.seenAt = 0;
    this.history = [];

    this.subscriptions = [];
    this.tsum = undefined;
    this.nextIndex = 0;
    this.dispatching = false;
    this.shotSeq = 0;
    this.shotDirReady = false;
  }

  // --- wiring --------------------------------------------------------------

  /**
   * Bind the router to the live `Tsum`.
   *
   * Called from `start()`. Kept explicit rather than reaching for the `ts`
   * global so that the offline tools -- which load this bundle to read the
   * subscription registry without ever constructing a `Tsum` -- can call
   * `plan()` and `profile()` on an unattached router.
   */
  attach(tsum: Tsum): void {
    this.tsum = tsum;
    this.page = PageName.Unknown;
    this.key = '';
    this.def = null;
    this.since = 0;
    this.seenAt = 0;
    this.history = [];
    this.shotSeq = 0;
  }

  detach(): void {
    this.tsum = undefined;
  }

  /** The bound Tsum. Throws rather than silently no-opping when unattached. */
  private owner(): Tsum {
    if (this.tsum === undefined) {
      throw new Error('PageRouter is not attached to a Tsum (call gPages.attach in start())');
    }
    return this.tsum;
  }

  // --- subscriptions -------------------------------------------------------

  /**
   * Register a reaction to a page.
   *
   * `id` is the handle everything else uses: `after` names it, the generated
   * documentation lists it, and the studio shows it. It has to be unique, so a
   * second registration under the same id replaces the first rather than
   * running twice -- which is what a reloaded script would otherwise do.
   */
  subscribe(sub: PageSubscription): PageSubscriptionEntry {
    const entry: PageSubscriptionEntry = {
      id: sub.id,
      category: sub.category,
      what: sub.what,
      steps: sub.steps,
      pages: sub.pages,
      goals: sub.goals,
      after: sub.after,
      acts: sub.acts,
      takes: subscriptionTakes(sub.steps),
      order: sub.order || 0,
      every: !!sub.every,
      once: !!sub.once,
      index: this.nextIndex++
    };
    for (let i = 0; i < this.subscriptions.length; i++) {
      if (this.subscriptions[i].id === entry.id) {
        entry.index = this.subscriptions[i].index;
        this.subscriptions[i] = entry;
        return entry;
      }
    }
    this.subscriptions.push(entry);
    return entry;
  }

  unsubscribe(id: string): boolean {
    for (let i = 0; i < this.subscriptions.length; i++) {
      if (this.subscriptions[i].id === id) {
        this.subscriptions.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  /**
   * Whether a subscription would be offered this page.
   *
   * `pages` is always a list -- there is no wildcard -- so a subscription is on
   * a page's queue only by naming it, or by a set derived from what the page
   * itself declares (`allPages`, `pagesOfKind`, `pagesWithAnchor`, below).
   */
  private wants(sub: PageSubscriptionEntry, page: PageName, goal: PageName | ''): boolean {
    if (sub.pages.indexOf(page) === -1) {
      return false;
    }
    if (sub.category === PageCategory.Navigate) {
      // The navigation band exists to move the app somewhere, so it is silent
      // when nothing asked to be moved -- which is what keeps a bare
      // `gPages.detect()` in the play loop from tapping the game away.
      if (goal === '') {
        return false;
      }
      // And never on the destination: arriving is handled by navigate() itself,
      // and a fallback "tap back" firing here would walk straight off the page
      // the caller just asked for.
      if (page === goal) {
        return false;
      }
    }
    if (sub.goals !== undefined && sub.goals.indexOf(goal as PageName) === -1) {
      return false;
    }
    return true;
  }

  /**
   * The queue for one page, in the order it will run.
   *
   * Split out from `dispatch` because it is also the answer the documentation
   * generator and the studio's Dispatch tab want, and neither of those has a
   * screen or a `Tsum`. Everything about ordering is decided here.
   *
   * Two passes: sort by band priority (then declared order, then registration
   * order, so the result is stable), then a topological pass that pulls a
   * subscription later when something it declared `after` is also in this
   * queue. A dependency naming a subscription that is *not* in this queue is
   * satisfied vacuously -- it did not run, and it was never going to.
   */
  plan(page: PageName, goal: PageName | '', changed: boolean): PageSubscriptionEntry[] {
    const wanted: PageSubscriptionEntry[] = [];
    for (let i = 0; i < this.subscriptions.length; i++) {
      const sub = this.subscriptions[i];
      if (!changed && !sub.every) {
        continue;
      }
      if (this.wants(sub, page, goal)) {
        wanted.push(sub);
      }
    }
    wanted.sort(comparePageSubscriptions);
    return this.resolveDependencies(wanted);
  }

  /** Kahn's algorithm over `after`, taking the highest-priority ready node. */
  private resolveDependencies(sorted: PageSubscriptionEntry[]): PageSubscriptionEntry[] {
    const present: { [id: string]: boolean } = {};
    for (let i = 0; i < sorted.length; i++) {
      present[sorted[i].id] = true;
    }
    const done: { [id: string]: boolean } = {};
    const remaining = sorted.slice();
    const out: PageSubscriptionEntry[] = [];
    while (remaining.length > 0) {
      let picked = -1;
      for (let i = 0; i < remaining.length && picked === -1; i++) {
        const after = remaining[i].after;
        let ready = true;
        for (let d = 0; after !== undefined && d < after.length; d++) {
          if (present[after[d]] === true && done[after[d]] !== true) {
            ready = false;
            break;
          }
        }
        if (ready) {
          picked = i;
        }
      }
      if (picked === -1) {
        // A cycle. Reporting it and running the rest in priority order beats
        // dropping handlers on the floor: the ordering is wrong either way, but
        // this way the script still works and the cycle is in the log.
        const stuck: string[] = [];
        for (let i = 0; i < remaining.length; i++) {
          stuck.push(remaining[i].id);
        }
        logWarn(Log.Page.SubscriptionCycle,
          'Subscription dependency cycle; running the rest in priority order',
          { subscriptions: stuck });
        return out.concat(remaining);
      }
      const sub = remaining.splice(picked, 1)[0];
      done[sub.id] = true;
      out.push(sub);
    }
    return out;
  }

  /**
   * Check what the types cannot: every `after` names a registered subscription
   * in the same or a higher band.
   *
   * Called once, after the last registration (the bottom of pageHandlers.ts).
   * Throws, so a bad registration stops the bundle loading -- on the PC as much
   * as on the device -- rather than reordering a queue where nobody looks. The
   * band rule is what keeps `after` from pulling a subscription below a band
   * that is supposed to run first: waiting for something that ran earlier
   * anyway costs nothing, waiting for something later moves it.
   */
  validate(): void {
    const byId: { [id: string]: PageSubscriptionEntry } = {};
    for (let i = 0; i < this.subscriptions.length; i++) {
      byId[this.subscriptions[i].id] = this.subscriptions[i];
    }
    for (let i = 0; i < this.subscriptions.length; i++) {
      const sub = this.subscriptions[i];
      const after = sub.after || [];
      for (let d = 0; d < after.length; d++) {
        const target = byId[after[d]];
        if (target === undefined) {
          throw new Error('Page subscription ' + sub.id + ' runs after ' + after[d]
            + ', which nothing registers');
        }
        if (PageCategoryPriority[target.category] < PageCategoryPriority[sub.category]) {
          throw new Error('Page subscription ' + sub.id + ' runs after ' + after[d]
            + ', which is in a lower band; `after` may only wait for the same or a higher band');
        }
      }
    }
  }

  // --- profiles ------------------------------------------------------------

  profile(page: PageName): PageProfile {
    return PageProfiles[page];
  }

  /**
   * How long `page` stays up on *this* device, in ms.
   *
   * `PageProfiles` quotes the window at `PageBaselineFps`; the game counts it in
   * frames, so a faster device burns through it sooner. 0 for a permanent page,
   * which is the honest answer: it does not leave on its own at all.
   */
  durationOf(page: PageName): number {
    const profile = PageProfiles[page];
    if (profile.kind !== PageKind.Transient || !profile.durationMs) {
      return 0;
    }
    const fps = this.fps > 0 ? this.fps : PageBaselineFps;
    return Math.round(profile.durationMs * PageBaselineFps / fps);
  }

  /** How much of the current page's transient window is left, in ms. */
  remainingMs(): number {
    const total = this.durationOf(this.page);
    if (total === 0) {
      return 0;
    }
    const left = total - (Date.now() - this.since);
    return left > 0 ? left : 0;
  }

  // --- scoring -------------------------------------------------------------

  /**
   * Score one entry against a captured frame.
   *
   * The metric is the one page detection has always used -- `absColor` (the sum
   * of the three channel deltas) against the entry's own `threshold`, with
   * `match: false` inverting the test. `score` is how much slack each probe had,
   * averaged: meaningless on its own and useful for exactly one thing, choosing
   * between entries that all passed.
   *
   * Pure by design: it captures nothing and taps nothing. Everything with a side
   * effect is in `sweep` and the queue. The detection suite and its studio call
   * this directly so the offline verdicts come from production rather than a
   * copy.
   */
  score(tsum: Tsum, img: NativeImage, key: string, page: PageDef): PageMatch {
    const colors = page.colors || [];
    const failed: number[] = [];
    let total = 0;

    // One batched read for the entry's whole probe list: this runs once per
    // Page entry per sweep, and per-pixel crossings were what that cost.
    //
    // Normally that read is one pixel per probe and the loop below runs once.
    // `Config.pageShiftTolerance` reads each probe's 3x3 block instead and
    // judges the entry at one *shift* -- every probe read one pixel over in the
    // same direction -- tried nine ways, centre first, taking the centre when
    // it passes. It is off, and why is on `TsumConfig.pageShiftTolerance`: nine
    // chances to find a matching pixel rescue a probe on the wrong page as
    // readily as one on the right page, and this table has more of the former.
    // `npm run pages:calibrate` sets thresholds under whichever rule is on.
    const blocks: Color[][] = colors.length === 0 ? []
        : Config.pageShiftTolerance
            ? tsum.getColorBlocks(img, colors)
            : tsum.getColors(img, colors).map(function(c) { return [c]; });
    const shifts = blocks.length > 0 ? blocks[0].length : 0;
    let shift = 0;
    for (let k = 0; k < shifts; k++) {
      const kFailed: number[] = [];
      let kTotal = 0;
      for (let i = 0; i < colors.length; i++) {
        const c = colors[i];
        const diff = absColor(c, blocks[i][k]);
        if ((diff < c.threshold) === c.match) {
          // Slack, normalised by this entry's own threshold: a positive probe
          // that landed dead on scores 1, one that only just cleared scores near 0.
          const slack = c.match
              ? 1 - diff / c.threshold
              : (diff - c.threshold) / c.threshold;
          kTotal += slack < 0 ? 0 : (slack > 1 ? 1 : slack);
        } else {
          kFailed.push(i);
        }
      }
      // Fewest failures, then most slack -- and the centre keeps ties.
      if (k === 0 || kFailed.length < failed.length
          || (kFailed.length === failed.length && kTotal > total)) {
        failed.length = 0;
        for (let i = 0; i < kFailed.length; i++) { failed.push(kFailed[i]); }
        total = kTotal;
        shift = k;
      }
      if (failed.length === 0) { break; }
    }

    return {
      page: page,
      key: key,
      // An entry with no probes can never match.
      pass: colors.length > 0 && failed.length === 0,
      score: colors.length > 0 ? total / colors.length : 0,
      probes: colors.length,
      failed: failed,
      shift: shift
    };
  }

  /**
   * Which screen is on display, with no broadcast and no side effects.
   *
   * Every entry is scored and the best one wins -- "best" being evidence first,
   * comfort second: the entry confirming the most landmarks wins, and only among
   * equally long fingerprints does the one with more slack win. Ranking on slack
   * alone would be backwards, since it averages: a one-probe entry that matched
   * by luck would outscore a nine-probe entry that matched genuinely, which is
   * how `ClosePage` (a deliberate single-pixel catch-all) would swallow real
   * pages.
   *
   * `Config.pageMinMargin` can additionally reject a win that is too close to a
   * differently-named runner-up; it defaults to 0, which never rejects.
   *
   * `timeout` is a retry budget spent *only when nothing matched* -- a frame the
   * table recognises is answered from the first capture, whatever the budget
   * says. So the cost of a generous timeout falls entirely on the negative
   * answer, which is the opposite of what a call site usually wants: the play
   * loop asking "is the board still up?" gets its yes instantly and pays seconds
   * for its no. Pass `0` for a single look with no retries, and keep a budget
   * only where the caller is genuinely *waiting for* a page to arrive.
   *
   * `expect` narrows which entries are scored at all, for a caller that knows
   * what the screen it is watching can turn into -- `inRoundPages()` from the
   * play loop, `heartSweepPages()` from the heart sender, both read off the
   * roles each page declares. It is a filter and nothing else: scoring,
   * ranking and the margin gate below are untouched, and omitting it scores the
   * whole table exactly as before. Two things it buys, in that order:
   * a page outside the set can no longer win by being the last entry still
   * passing over an obscured screen, and the entries outside it cost no native
   * crossing. It cannot be a router-wide rule, because `this.page` is only ever
   * as fresh as the last detection -- see the `via` hop in `navigate` -- so the
   * knowledge has to come from the caller.
   */
  sweep(times?: number, timeout?: number, expect?: PageName[]): PageMatch | null {
    const tsum = this.owner();
    if (times === undefined) { times = 2; }
    if (timeout === undefined) { timeout = 700; }
    const start = Date.now();
    // Where a detection's time goes, for the `page.matched` and `page.unmatched`
    // records: the captures, the scoring, and -- the remainder of `durationMs`
    // -- the spacing between passes. Two clock reads a pass; nothing else.
    let captureMs = 0;
    let scoreMs = 0;
    let passes = 0;
    let scored = 0;

    while (tsum.isRunning) {
      let best: PageMatch | null = null;
      let rival: PageMatch | null = null;   // best match carrying a different name
      for (let t = 0; t < times; t++) {
        best = null;
        rival = null;
        const t0 = Date.now();
        const img = tsum.screenshot();
        const t1 = Date.now();
        captureMs += t1 - t0;
        passes++;
        scored = 0;
        try {
          // Walks the whole table by key, so it needs the index-signature view
          // of it rather than the literal type that gives Page.X its click-through.
          for (const key in Page) {
            const def = (Page as PageMap)[key];
            // Skipped before `score`, so a narrowed sweep pays nothing for the
            // entries it ruled out -- the crossing per entry is what this costs.
            if (expect !== undefined && expect.indexOf(def.name) === -1) {
              continue;
            }
            // An entry only `matches()` may answer with -- see `PageDef.targeted`.
            if (def.targeted) {
              continue;
            }
            const match = this.score(tsum, img, key, def);
            scored++;
            if (!match.pass) {
              continue;
            }
            if (best === null || betterPageMatch(match, best)) {
              if (best !== null && best.page.name !== match.page.name) {
                rival = best;
              }
              best = match;
            } else if (match.page.name !== best.page.name
                && (rival === null || betterPageMatch(match, rival))) {
              rival = match;
            }
          }
        } finally {
          scoreMs += Date.now() - t1;
          releaseImage(img);
        }
        // No early exit: `times` sweeps always run and the last one is the
        // answer. The sweeps are a debounce, not a vote -- a screen mid-animation
        // can fingerprint as something else for a frame, and settling on the
        // final reading is what the navigation loops have always been tuned against.
        //
        // The spacing goes *between* two captures, which is the only place it
        // debounces anything. It used to run after the last pass as well, where
        // it delayed the answer without separating it from anything -- and with
        // `times === 1`, which is what the play loop and most of the navigation
        // calls pass, that was the only sleep there was: 100ms of waiting after
        // the single capture the caller asked for, debouncing nothing.
        if (t < times - 1) {
          tsum.sleep(PageSweepSpacingMs);
        }
      }

      if (best !== null) {
        // Variants of one page agreeing with each other is not ambiguity, so the
        // margin is measured against the best *differently named* entry. Winning
        // on evidence is decisive; only a same-length rival makes the call close
        // enough for the slack gap to mean anything.
        const margin = rival === null ? 1
            : (best.probes > rival.probes ? 1 : best.score - rival.score);
        if (margin < Config.pageMinMargin) {
          logDebug(Log.Page.Rejected, {
            phase: 'sweep',
            page: best.page.name,
            key: best.key,
            margin: +margin.toFixed(2),
            minMargin: Config.pageMinMargin,
            rivalPage: rival!.page.name,
            rivalKey: rival!.key,
            durationMs: Date.now() - start,
          });
        } else {
          // `shift` is the one-pixel tolerance in `score` at work: 0 means the
          // centre pixels matched outright, anything else that this device
          // draws the page a pixel off the table and the tolerance carried it.
          // Always 0 unless `Config.pageShiftTolerance` is on, which it is not.
          logDebug(Log.Page.Matched, {
            phase: 'sweep',
            page: best.page.name,
            key: best.key,
            score: +best.score.toFixed(2),
            margin: rival === null ? undefined : +margin.toFixed(2),
            shift: best.shift,
            durationMs: Date.now() - start,
            captureMs: captureMs,
            scoreMs: scoreMs,
            passes: passes,
            scored: scored,
            narrowed: expect !== undefined,
          });
          return best;
        }
      }
      if (Date.now() - start >= timeout) {
        // The negative answer is where a detection's whole budget goes (see
        // the doc comment above), so it is the one to cost: how much was the
        // captures, how much the scoring, and how many looks it took.
        logDebug(Log.Page.Unmatched, {
          durationMs: Date.now() - start,
          captureMs: captureMs,
          scoreMs: scoreMs,
          passes: passes,
          scored: scored,
          narrowed: expect !== undefined,
        });
        return null;
      }
      // Nothing fingerprinted and there is still time: space the next round off
      // this one exactly as two passes within a round are spaced. The trailing
      // sleep removed above used to be what kept this loop off the framebuffer.
      tsum.sleep(PageSweepSpacingMs);
    }
    // Reached only when isRunning went false mid-scan (the script is stopping).
    return null;
  }

  // --- detection + broadcast -----------------------------------------------

  /**
   * Look, then tell everyone. The normal way to ask what is on screen.
   *
   * Returns the matched table entry, or null when nothing fingerprinted. The
   * broadcast happens before the return, so by the time a caller sees the
   * answer the guards have run and any handler that decided to tap has already
   * done so -- which is the point: the caller does not have to remember to
   * handle the root warning, the corpus capture or the Magical Time offer,
   * because those are subscriptions now.
   *
   * `expect` is passed straight to `sweep`; see there for what it narrows. Note
   * that a narrowed sweep which matches nothing reports `Unknown` and files it in
   * the history like any other miss, so the caller has to read `Unknown` as "not
   * one of the pages I asked about" rather than "not a page".
   */
  detectObject(times?: number, timeout?: number, expect?: PageName[], goal?: PageName | ''): PageDef | null {
    this.react(this.observe(times, timeout, expect, goal));
    return this.def;
  }

  /** As `detectObject`, but the page's name -- `PageName.Unknown` when nothing matched. */
  detect(times?: number, timeout?: number, expect?: PageName[], goal?: PageName | ''): PageName {
    this.detectObject(times, timeout, expect, goal);
    return this.page;
  }

  /**
   * Look, file what was seen, and say so -- without telling anyone.
   *
   * The pure half of `detect`: the sweep, the history, and the event the queue
   * would be handed, with nothing run over it; `react` is the other half. A
   * caller that wants to decide for itself what to do with a reading takes
   * this, and never has to remember which handlers `detect` would have let
   * tap. `peek` is the same look without even the history.
   *
   * `goal` is where the caller is heading -- the navigate band is offered the
   * event only then, and never on the goal itself -- and `''`, the default,
   * says it is only watching. An argument rather than router state, so what a
   * look may set in motion is decided by the caller making it, and by nothing
   * some other caller left set.
   */
  observe(times?: number, timeout?: number, expect?: PageName[], goal?: PageName | ''): PageEvent {
    const match = this.sweep(times, timeout, expect);
    const changed = this.file(match);
    return this.buildEvent(changed, goal === undefined ? '' : goal);
  }

  /**
   * Detection with no broadcast and no history.
   *
   * For the handful of callers that must not let anything act: a handler asking
   * what the screen became after its own tap, and the offline tools. Everything
   * else wants `detect`.
   */
  peek(times?: number, timeout?: number): PageDef | null {
    const match = this.sweep(times, timeout);
    return match === null ? null : match.page;
  }

  /**
   * Take the sweep's result as the current page and file it in the history.
   * Returns whether the screen actually turned over.
   */
  private file(match: PageMatch | null): boolean {
    const now = Date.now();
    const page = match === null ? PageName.Unknown : match.page.name;
    const key = match === null ? '' : match.key;
    this.seenAt = now;
    this.def = match === null ? null : match.page;
    this.key = key;

    if (page === this.page && this.since !== 0) {
      return false;
    }

    if (this.history.length > 0) {
      this.history[0].leftAt = now;
    }
    this.page = page;
    this.since = now;
    this.pushHistory(page, key, now);
    return true;
  }

  private pushHistory(page: PageName, key: string, at: number): void {
    if (this.historyDepth <= 0) {
      return;
    }
    const visit: PageVisit = {
      page: page,
      key: key,
      at: at,
      leftAt: 0,
      kind: PageProfiles[page].kind,
      shot: this.keepShots && this.shotDepth > 0 ? this.saveHistoryShot(page) : ''
    };
    this.history.unshift(visit);
    // A visit past `shotDepth` keeps its line and gives up its frame: the trail
    // is what says how the run got here, and the frames are only worth keeping
    // for as far back as a report copies them.
    for (let i = this.shotDepth; i < this.history.length; i++) {
      const old = this.history[i];
      if (old.shot !== '') {
        execute('rm -f "' + old.shot + '"');
        old.shot = '';
      }
    }
    while (this.history.length > this.historyDepth) {
      const dropped = this.history.pop();
      if (dropped !== undefined && dropped.shot !== '') {
        // Only reachable with shotDepth >= historyDepth, which is what "Debug
        // game" sets. Otherwise the loop above has already taken the frame.
        execute('rm -f "' + dropped.shot + '"');
      }
    }
  }

  /** Where the history frames go. */
  historyDir(): string {
    return this.owner().storagePath + '/' + Config.recordDir + '/pageHistory';
  }

  /**
   * Save the matcher's own view of this visit.
   *
   * The matcher frame rather than a full-resolution capture: it is what the
   * verdict was actually made from, it is a tenth of the bytes, and
   * `corpus.ts` already covers the case where a full-res frame is wanted.
   * Returns the path written, or `''` if anything went wrong -- a failed debug
   * screenshot must never take the run down with it.
   */
  private saveHistoryShot(page: PageName): string {
    const tsum = this.owner();
    const dir = this.historyDir();
    if (!this.shotDirReady) {
      execute('mkdir -p ' + dir);
      // Clear the previous run's frames. The sequence numbers restart with the
      // run, so without this a shorter run leaves the tail of a longer one
      // behind and the directory reads as one impossible session. Only the
      // frames this writes are removed, never anything else in the folder.
      execute('rm -f ' + dir + '/*.png');
      this.shotDirReady = true;
    }
    const seq = this.shotSeq++;
    // Zero-padded so the directory sorts into visit order in any file browser.
    let stamp = '' + seq;
    while (stamp.length < 5) {
      stamp = '0' + stamp;
    }
    const path = dir + '/' + stamp + '_' + page + '.png';
    const img = tsum.screenshot();
    try {
      saveImage(img, path);
      return path;
    } catch (e) {
      logWarn(Log.Page.HistoryFrameFailed, 'Could not save the page history frame',
        { path: path, errorText: '' + e });
      return '';
    } finally {
      releaseImage(img);
    }
  }

  /**
   * The event one look hands the queue, off the router's current state and the
   * goal the look was made with.
   *
   * Separate from `react` so the offline harness (`tools/dispatchEval`) can set
   * that state by hand, build the same event, and run the real queue over it.
   * `stoppedBy` is empty here; the dispatch fills it in.
   */
  buildEvent(changed: boolean, goal: PageName | ''): PageEvent {
    return {
      page: this.page,
      def: this.def,
      key: this.key,
      previous: this.history.length > 1 ? this.history[1].page : PageName.Unknown,
      changed: changed,
      at: this.seenAt,
      age: this.seenAt - this.since,
      kind: PageProfiles[this.page].kind,
      remainingMs: this.remainingMs(),
      goal: goal,
      stoppedBy: '',
      ts: this.owner()
    };
  }

  /**
   * Run one subscription's steps.
   *
   * The only place a step list becomes taps and waits, and public so the
   * offline harness (`tools/dispatchEval`) can wrap it and record which rows
   * ran without touching the rows themselves.
   *
   * A `tap` names an anchor of the entry that matched, not a coordinate: the
   * variants of a page put the same button in different places, and pressing
   * the table's first entry for the page is how the 0.7 loop pressed a hub
   * button for ever. An anchor the matched entry does not carry throws -- the
   * subscription said it presses something that is not there, which is a
   * declaration bug and not a frame to recover from.
   */
  perform(sub: PageSubscriptionEntry, event: PageEvent): void {
    const tsum = event.ts;
    for (let i = 0; i < sub.steps.length; i++) {
      const step = sub.steps[i];
      switch (step.do) {
        case 'tap': {
          const at = event.def === null
            ? undefined
            : forecastAnchorAt(event.def, step.anchor);
          if (at === undefined) {
            throw new Error(sub.id + ' presses `' + step.anchor + '`, which entry '
              + (event.key === '' ? '(none)' : event.key) + ' does not carry');
          }
          tsum.tap(at);
          break;
        }
        case 'tapAt':
          tsum.tap(step.at);
          break;
        case 'settle':
          tsum.settleScreen(step.ms);
          break;
        case 'sleep':
          tsum.sleep(step.ms);
          break;
        case 'waitOut':
          this.waitOut();
          break;
        case 'log':
          logInfo(step.event, step.message);
          break;
        case 'call':
          step.run.call(tsum, event);
          break;
      }
    }
  }

  /**
   * Run the queue for `event`: the acting half of `detect`.
   *
   * Serial and non-reentrant, which together are the whole answer to the race
   * this replaced: exactly one handler is touching the screen at a time. A
   * handler that calls `detect` from inside its own dispatch gets the reading
   * without a nested broadcast -- and a warning, since nothing in the tree does
   * that on purpose and the frame it read is not the one the queue is on.
   */
  react(event: PageEvent): void {
    if (this.dispatching) {
      logWarn(Log.Page.DispatchReentered,
        'A handler looked at the screen mid-dispatch; that look was not broadcast',
        { page: event.page });
      return;
    }
    const tsum = event.ts;
    const queue = this.plan(event.page, event.goal, event.changed);
    if (queue.length === 0) {
      return;
    }

    this.dispatching = true;
    let stopped = false;
    try {
      for (let i = 0; i < queue.length; i++) {
        const sub = queue[i];
        if (!tsum.isRunning) {
          break;
        }
        // Once something has touched the screen, the rest of the queue would be
        // acting on a frame that no longer exists. The notify band is the
        // exception: it records what was *seen* rather than acting on what is
        // *there*, which is still true after a tap -- skipping it is how the
        // progress signal ended up missing every page the script did something
        // about.
        if (stopped && sub.category !== PageCategory.Notify) {
          continue;
        }
        // A subscription that can decline says how (`acts`), and its steps are
        // not run when it would. They may then assume the condition held, and
        // the forecast, which reads the same declaration, cannot disagree.
        if (sub.acts !== undefined && !sub.acts(event)) {
          continue;
        }
        // Whether this touched the screen is its band's answer, not its own:
        // the acting bands act unless their `acts` said otherwise, and that
        // test is already above. `ForecastActingBands` (forecast.ts) is the one
        // statement of it, so the forecast's pick and this cannot diverge.
        let acted = ForecastActingBands.indexOf(sub.category) !== -1;
        try {
          this.perform(sub, event);
        } catch (e) {
          // One broken subscription must not cost the others their turn, nor
          // take down the task that asked what was on screen. It may have run
          // some of its steps before throwing, but the queue carries on rather
          // than stopping on a row that did not finish -- the next look reads
          // whatever it left behind.
          logError(Log.Page.SubscriptionThrew, 'Page subscription threw',
            { subscription: sub.id, page: event.page, errorText: '' + e });
          acted = false;
        }
        if (sub.once) {
          this.unsubscribe(sub.id);
        }
        if (acted) {
          stopped = true;
          event.stoppedBy = sub.id;
          logDebug(Log.Page.DispatchStopped, { page: event.page, stoppedBy: sub.id });
        }
      }
    } finally {
      this.dispatching = false;
    }
  }

  // --- targeted matching ---------------------------------------------------

  /**
   * Is *this* page on screen? Used where the caller already knows what it
   * expects and only needs a yes/no.
   *
   * DELIBERATE DIVERGENCE, not an oversight. This runs its own comparison --
   * `isSameColor(..., 20)`, per channel, ignoring each probe's own `threshold`
   * -- where `sweep` uses `absColor` against the threshold. So the same row in
   * `Page` means one thing here and another there.
   *
   * Unifying the two on `score` is the obvious cleanup and is deliberately not
   * done yet, because it is not the loosening it looks like. Compare the rules
   * on ReceiveHeartWithoutCoins, whose seven probes all carry threshold 30:
   *
   *   error per channel   old (each <= 20)   new (sum < 30)
   *   (25, 0, 0)          fails              passes
   *   (15, 15, 15)        passes             FAILS
   *
   * JPEG error spreads across all three channels, so the second row is the
   * common case and the switch would make this page *harder* to match, not
   * easier -- and this is the "did the mail item come without coins" test, so
   * failing it takes the wrong branch silently. `npm run pages:noise` put the
   * q80 error at 20-90 near screen detail, the same order as the whole budget.
   * The capture is lossless now, which weakens that argument without supplying
   * the frames that would settle it -- these three pages still have none.
   *
   * To finish this: collect frames for ReceiveHeartWithoutCoins,
   * ReceiveSkillTicket and ReceivePremiumTicket (the only three pages reaching
   * this function), then swap the body for `this.score(...).pass` and confirm
   * with `npm run pages:eval` that those frames still match.
   *
   * This is also the only reader of an entry marked `targeted` (see
   * `PageDef`): `sweep` skips those, this does not.
   */
  matches(pageName: PageName): boolean {
    const tsum = this.owner();
    let found = false;
    let img: NativeImage | null = null;
    try {
      for (const pageId in Page) {
        const page = (Page as PageMap)[pageId];
        if (pageName !== page.name) {
          continue;
        }
        if (img == null) {
          img = tsum.screenshot();  // lazy init only if page exists
        }
        const colors = page.colors || [];
        found = false;
        for (let i = 0; i < colors.length; i++) {
          found = isSameColor(tsum.getColor(img, colors[i]), colors[i], 20);
          if (!found) {
            break;  // try next page
          }
        }
        if (found) {
          break;  // exit search
        }
      }
    } finally {
      if (img != null) {
        releaseImage(img);
      }
    }
    logDebug(Log.Page.Probed, { page: pageName, found: found });
    return found;
  }

  // --- waiting -------------------------------------------------------------

  /**
   * Sit out the rest of the current page's transient window.
   *
   * The whole reason transient pages are declared: a page that dismisses itself
   * must not be tapped, because by the time the tap lands the page it was aimed
   * at is gone and the tap hits whatever replaced it.
   */
  waitOut(): void {
    const left = this.remainingMs();
    if (left <= 0) {
      return;
    }
    logDebug(Log.Page.WaitOut, { page: this.page, remainingMs: left });
    this.owner().sleep(left);
  }

  // --- navigation ----------------------------------------------------------

  /**
   * Drive the app to `goal` and return once it is there.
   *
   * This is the one loop that replaced `goFriendPage`, `goGamePlayingPage` and
   * `goTsumsPage`, whose bodies were the same shape three times over: look,
   * switch on what you saw, tap something, check for a stall, repeat. What was
   * actually different between them is now data (`NavPlans` in data.ts) and
   * subscriptions (`pageHandlers.ts`), so the loop itself is written once.
   *
   * Returns false only when the script is stopping, or `abort` answers true
   * between two looks; otherwise it does not give up -- the stall guard
   * escalates to a dialog check and then to an app restart, exactly as the three
   * loops did. `abort` is for a caller whose destination can wait -- the play
   * task walking to a round while a level-cap sweep is asking for the screen --
   * and is asked only once a look has said this is not the goal, so a caller
   * already there is never turned away.
   *
   * What one pass costs, and why a `NavPlans` entry is most of it:
   * DRIVING_SCREENS.md § 3.
   */
  navigate(goal: PageName, abort?: () => boolean): boolean {
    return this.drive(goal, false, abort);
  }

  /**
   * `navigate`, told whether this screen is the destination or only on the way.
   *
   * A waypoint is one the caller taps straight off again, so the ceremony that
   * makes an *arrival* believable buys nothing there: the settle that waits an
   * event window out, the rest between passes, and the second look are all
   * about not acting on a frame caught mid-transition, and what the hop does
   * next is a tap the outer loop re-confirms anyway. A wrong belief costs one
   * missed tap and another pass; the ceremony costs 3s of settle and 1s a pass
   * on the friend page, which is the `via` of every plan that has one -- most
   * of what it took to reach the collection.
   */
  private drive(goal: PageName, waypoint: boolean, abort?: () => boolean): boolean {
    const tsum = this.owner();
    const plan = NavPlans[goal];
    if (plan === undefined) {
      logError(Log.Nav.NoPlan, 'No navigation plan for this page', { goal: goal });
      return false;
    }
    if (plan.via !== undefined && !this.oneTapFrom(goal)) {
      this.drive(plan.via, true, abort);
    }

    const guard = tsum.newStallGuard('navigate:' + goal);
    while (tsum.isRunning) {
      if (!tsum.isAppOn()) {
        tsum.startApp();
      }
      if (tsum.isStartupPhase && plan.startupWaitMs > 0) {
        // A budget, not a rest: a new event window still loading is moving,
        // and reading it mid-fade as whatever half-drawn thing it looks like is
        // what this guards against. Once it holds still the look below can be
        // trusted, however long that took -- the flat five seconds used to sit
        // on top of `startApp`'s own wait, every pass.
        tsum.settleScreen(plan.startupWaitMs);
      }
      // The one kind of look made with a goal: this is what offers the navigate
      // band its turn, and only for as long as this pass lasts.
      const page = this.detect(plan.times, plan.timeout, undefined, goal);
      logInfo(Log.Page.Current, { page: page, goal: goal });
      if (page === goal) {
        // Confirm before believing it. A screen caught mid-transition can
        // fingerprint as the destination for one frame, and every one of the
        // three loops this replaced re-read before returning for that reason.
        // A waypoint skips all of it -- see `drive`.
        if (waypoint) {
          if (plan.arrive !== undefined) {
            plan.arrive.call(tsum);
          }
          return true;
        }
        // Watch the destination hold. A window landing on it inside the budget
        // is seen and dismissed in there; false means the budget ran out with
        // the screen still not holding, which is another pass.
        if (this.holdGoal(goal, plan.holdMs)) {
          // And then wait out whatever is still arriving. The hold is about what
          // is on screen; this measures the animation, so the caller's first tap
          // on the destination is not swallowed by it. Omitted for a destination
          // that never goes still -- see `settleMaxMs` in globals.d.ts.
          if (plan.settleMaxMs !== undefined) {
            tsum.settleScreen(plan.settleMaxMs);
          }
          if (this.detect(1, 500, undefined, goal) === goal) {
            if (plan.arrive !== undefined) {
              plan.arrive.call(tsum);
            }
            return true;
          }
        }
      }
      if (abort !== undefined && abort()) {
        return false;
      }
      // Nothing on the queue moves off this page toward the goal: no page
      // declares an exit here and no mover takes it. Said once per page,
      // loudly, rather than tapping something blind; the stall guard below
      // is what happens next, exactly as for a page that would not give way.
      if (page !== goal && !this.hasMover(page, goal) && guard.noRoute !== page) {
        guard.noRoute = page;
        logWarn(Log.Nav.NoRoute, 'No handler moves off this page toward the goal',
          { page: page, goal: goal });
      }
      tsum.checkStall(guard, this.page);
      if (!waypoint && plan.restMs > 0) {
        tsum.sleep(plan.restMs);
      }
    }
    return false;
  }

  /**
   * Watch `goal` for up to `budgetMs`, and say whether it stayed.
   *
   * This is `NavPlan.holdMs`, and it used to be `sleep(holdMs)`. The friend
   * page's three seconds of it were measured at a flat 3.9s on all fifty
   * arrivals in a 13-hour run -- and spent asleep, so the event window the floor
   * exists to catch went unseen for the whole of it and was found, if at all, by
   * the confirming look at the end.
   *
   * Looking instead is strictly more than sleeping was, in both directions. An
   * arrival nothing lands on ends at the second agreeing look -- one capture and
   * `PageSweepSpacingMs`, against three seconds. And a window that *does* land
   * inside the budget is seen rather than slept through, so the dismiss band
   * presses it away here and the count starts again, where bailing to the outer
   * loop would cost a whole pass and its `restMs` for the same recovery.
   *
   * False therefore means the budget ran out with the screen still not holding
   * on the destination, which is a caller's cue to take another pass -- not
   * "something appeared", which this handles.
   *
   * The looks carry `goal`, so the navigate band is not offered them -- it never
   * runs on the destination -- and nothing here can tap the screen it is
   * judging.
   */
  private holdGoal(goal: PageName, budgetMs: number): boolean {
    if (budgetMs <= 0) {
      return true;
    }
    const tsum = this.owner();
    const until = Date.now() + budgetMs;
    let agreed = 1;   // the look that got us here
    while (tsum.isRunning && agreed < NavHoldLooks) {
      tsum.sleep(PageSweepSpacingMs);
      if (this.detect(1, 0, undefined, goal) === goal) {
        agreed++;
        continue;
      }
      agreed = 0;
      if (Date.now() >= until) {
        logDebug(Log.Page.HeldOff, { goal: goal, page: this.page, budgetMs: budgetMs });
        return false;
      }
    }
    return tsum.isRunning;
  }

  /** Would any navigate-band handler be offered this page on the way to `goal`? */
  private hasMover(page: PageName, goal: PageName): boolean {
    const queue = this.plan(page, goal, true);
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].category === PageCategory.Navigate) {
        return true;
      }
    }
    return false;
  }

  /**
   * Is the screen in front of us the goal already, or carrying the button that
   * reaches it?
   *
   * What the `via` hop is for is that a back-tap chain from an arbitrary screen
   * is not a route -- but neither is it needed from a screen holding the anchor
   * that *is* the route. `goTsumsPage` hopped home unconditionally because
   * `this.page` is only as fresh as the last detection, which may be minutes and
   * an app restart old; a look taken here and now is not that reading, and it
   * costs one capture against the seconds the round trip costs.
   *
   * `peek` rather than `detect`: this look decides the route, and nothing may
   * act on it.
   */
  private oneTapFrom(goal: PageName): boolean {
    const def = this.peek(1, 500);
    if (def === null) {
      return false;
    }
    if (def.name === goal) {
      return true;
    }
    for (const anchor in AnchorRoutes) {
      if (AnchorRoutes[anchor].to === goal
          && (def as unknown as { [key: string]: unknown })[anchor] !== undefined) {
        return true;
      }
    }
    return false;
  }

  // --- introspection -------------------------------------------------------

  /** The last few screens, newest first: `FriendPage(2.1s) < StartPage(0.4s)`. */
  trail(count?: number): string {
    const max = count === undefined ? 5 : count;
    const parts: string[] = [];
    for (let i = 0; i < this.history.length && i < max; i++) {
      const visit = this.history[i];
      const until = visit.leftAt === 0 ? Date.now() : visit.leftAt;
      parts.push(visit.page + '(' + ((until - visit.at) / 1000).toFixed(1) + 's)');
    }
    return parts.join(' < ');
  }
}

/**
 * The router. One per script run, like `ts` and `gTaskController`, but created
 * at load time rather than in `start()` so that the subscriptions in
 * `pageHandlers.ts` can register into it as the bundle evaluates -- which is
 * also what lets `npm run pages:docs` read the registry out of a loaded bundle
 * without starting anything.
 */
var gPages = new PageRouter();
