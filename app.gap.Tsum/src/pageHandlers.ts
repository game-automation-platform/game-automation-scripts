// ---------------------------------------------------------------------------
// Everything the script does about a page, in one list.
//
// These are the subscriptions `gPages` runs when it has decided what is on
// screen. Before the router existed each of them was a branch inside whichever
// loop happened to be looking at the time -- which is why the Magical Time
// offer was cancelled in three places, why an unrecognised screen was only
// captured for the corpus if a navigation loop was the one that saw it, and why
// two of these could act on the same frame in an order nobody had chosen.
//
// Reading this file top to bottom is reading the dispatch order, because that is
// how the queue sorts: by band (`PageCategory`), then by `order` within a band,
// then by registration. `npm run pages:docs` renders the same thing as a table
// per page, and the studio's Dispatch tab shows it live.
//
// Four rules worth knowing before adding one:
//
//   * A subscription is a list of `steps` (globals.d.ts), not a body. Taps,
//     settles and sleeps are data, so `PAGE_DISPATCH.md` states every budget
//     and `tools/dispatchEval` pins every one of them. `call` is the escape
//     hatch, for what is neither a tap nor a wait.
//   * Whether a row ends the queue is its *band's* answer: guard, dismiss and
//     navigate touch the screen unless their `acts` declined, and everything
//     after such a row would be reading a frame that no longer exists. The
//     notify band is the exception and runs anyway -- it records what was seen.
//   * `every: true` means "fire on every look", not just when the page changed.
//     The navigation movers need it -- they tap the same page repeatedly until
//     it gives way. Everything else should stay on the default.
//   * The `navigate` band runs only on a look made with a goal -- which
//     `gPages.navigate()` does and nothing else -- and never on the destination
//     page. That is what lets the play loop call `gPages.detect` without
//     anything tapping the game away.
//   * `pages` is required and there is no wildcard. A handler for every page
//     says `allPages()`, one for every transient page `pagesOfKind(...)`, one
//     for every page carrying a button `pagesWithAnchor(...)` (pages.ts) -- so
//     what a page's queue holds follows from what that page declares, never
//     from a handler that forgot to say.
//
// A `tap` names an anchor of the entry that matched, never a coordinate: the
// variants of a page put the same button in different places, and the two
// Magical Time layouts put Cancel 135px apart.
//
// `gPages.validate()` at the bottom checks the one rule the types cannot: an
// `after` names something registered, in the same or a higher band.
// ---------------------------------------------------------------------------

// --- Waiting for what a tap started ----------------------------------------
//
// Every mover below taps and then has to let the screen it asked for arrive
// before anything looks at it or taps it again. These were fixed rests, which
// is a guess at an animation the game draws in frames rather than milliseconds
// -- right on the device the stopwatch was held against and short on any slower
// one, where the next tap lands inside the animation and is swallowed by it.
//
// They are `Tsum.settleScreen` budgets now (`ScreenSettle`, data.ts): the wait
// ends when the screen stops moving, so it is the device that decides how long
// it took. A budget is a ceiling and not a cost -- a fast device spends far less
// than the rests it replaced.
//
// One wait is deliberately still blind: the board. A round is animating from
// the first frame to the last, so a stillness gate over one can only ever time
// out, and `nav.move.startToGame` and `dismiss.resumeGame` keep their sleeps.

/** A panel dismissed over the screen behind it, animating away (was 800ms). */
const PanelGoneSettleMs = 2000;
/** A whole screen arriving after the tap that opened it (was 2000-3000ms). */
const ScreenChangeSettleMs = 3000;
/**
 * The smaller waits: the generic back and close taps, and settling a screen
 * that is already up before pixels are read off it. Lower than the two above
 * because the back taps are the handlers that can fire on a board --
 * `GamePlaying` carries a `back` anchor -- and there a budget is spent rather
 * than measured.
 */
const ShortSettleMs = 1500;

// ===========================================================================
// observe -- read-only. Always runs, whatever the rest of the queue decides.
// ===========================================================================

gPages.subscribe({
  id: 'observe.startupPhase',
  category: PageCategory.Observe,
  what: 'The root warning means the game is coming up (or has just been restarted), '
      + 'so the navigation loops go back to their slower startup timings.',
  pages: [PageName.RootDetection],
  every: true,
  steps: [
    { do: 'call', name: 'enterStartupPhase', run: function() {
      this.isStartupPhase = true;
    } }
  ]
});

gPages.subscribe({
  id: 'observe.leftStartup',
  category: PageCategory.Observe,
  what: 'Any of the screens that only exist once the game is fully up ends the '
      + 'startup phase, which is what stops the navigation loops from waiting five '
      + 'seconds a round for event windows that are no longer arriving.',
  pages: pagesWithRole(PageRole.GameUp),
  every: true,
  steps: [
    { do: 'call', name: 'leaveStartupPhase', run: function() {
      this.isStartupPhase = false;
    } }
  ]
});

// ===========================================================================
// record -- measurements that are only valid while the screen is untouched.
// ===========================================================================

gPages.subscribe({
  id: 'record.feverTime',
  category: PageCategory.Record,
  what: 'Keep the fever state up to date, and broadcast a fever starting or ending. '
      + 'A fever is a mode of the board rather than a screen of its own, so nothing '
      + 'else in this file can report it -- see src/fever.ts.',
  // In `record` rather than `observe` because reading a fever costs a capture of
  // its own, and the observe band is the band that promises not to take one.
  // Nothing here taps, so it still runs before anything can change the screen.
  //
  // Every page, deliberately. A fever only starts on the board, but it ends the
  // moment the board is gone, and a subscription scoped to GamePlaying would
  // never see that: the round would finish with the watcher still saying a fever
  // was running. Off the board the reading is free -- no capture is taken.
  pages: allPages(),
  every: true,
  steps: [
    { do: 'call', name: 'gFever.update', run: function(event) {
      gFever.update(this, event.page);
    } }
  ]
});

gPages.subscribe({
  id: 'record.corpusUnknown',
  category: PageCategory.Record,
  what: 'Keep an unrecognised screen before anything taps it. By definition nothing '
      + 'in the table matched, so this is the single best source of corpus frames -- '
      + 'and the escape below is about to change what is on display.',
  pages: [PageName.Unknown],
  // On the way *into* Unknown only. A screen the matcher cannot read tends to
  // stay unreadable for many polls, and one frame of it is the evidence; the
  // rate limit and per-session cap inside saveCorpusFrame are the backstop, not
  // the plan.
  every: false,
  steps: [
    { do: 'call', name: 'saveCorpusFrame', run: function() {
      this.saveCorpusFrame('unknown');
    } }
  ]
});

gPages.subscribe({
  id: 'record.baseCoins',
  category: PageCategory.Record,
  what: 'Read the in-game coin counter off the level-up screen. The board goes on '
      + 'paying out after the round timer stops, and this is the first screen that is '
      + 'certainly after that -- so it is where the counter first holds the round\'s '
      + 'figure, and it holds it there for seconds rather than frames.',
  pages: [PageName.TsumLevelUp],
  // Every look rather than only the first: the panel fades in over the board, so
  // the frame that first fingerprints it can still be too dark to read, and what
  // is kept is the highest confident read across the whole visit.
  every: true,
  steps: [
    // `sampleBaseCoins` declines unless a round is open and being tracked, which
    // is the guard that matters here: this screen belongs to the end of a round,
    // but it is also on screen for a moment after that round's row has been
    // written, and the highest read wins.
    { do: 'call', name: 'sampleBaseCoins', run: function() {
      this.sampleBaseCoins();
    } }
  ]
});

gPages.subscribe({
  id: 'record.myTsum',
  category: PageCategory.Record,
  what: 'Read which tsum is selected off the thumbnail in the pre-round screen\'s '
      + 'lower-right button, so the round about to be played can be attributed to it '
      + 'in the stats CSV and named on the floating banner. Matched against a library '
      + 'rebuilt from the sprite art the game itself ships, so the comparison is against '
      + 'the same drawing rather than a photograph of it.',
  pages: [PageName.StartPage],
  // In `record` rather than `observe` because it takes a capture of its own, and
  // it needs the screen before nav.move.startToGame taps Start.
  //
  // Once per arrival: the selection cannot change while this screen is up -- the
  // script never taps the button -- so every look after the first would re-read
  // the same pixels for the same answer.
  every: false,
  steps: [
    { do: 'call', name: 'identifyMyTsum', run: function() {
      this.identifyMyTsum();
    } }
  ]
});

// ===========================================================================
// guard -- not a game screen at all.
// ===========================================================================

gPages.subscribe({
  id: 'guard.rootDetection',
  category: PageCategory.Guard,
  what: 'Dismiss the root warning wherever it appears. It is an Android dialog laid '
      + 'out in device pixels, so it is found and pressed structurally; the '
      + 'coordinates recorded for whichever variant matched are passed only as a '
      + 'last-resort hint, because they belong to one emulator and dpi.',
  pages: [PageName.RootDetection],
  every: true,
  steps: [
    { do: 'call', name: 'dismissSystemDialog', run: function(event) {
      this.dismissSystemDialog(event.def === null ? undefined : event.def.next);
    } }
  ]
});

// ===========================================================================
// dismiss -- interruptions standing between the script and where it is going.
// ===========================================================================

gPages.subscribe({
  id: 'dismiss.magicalTime',
  category: PageCategory.Dismiss,
  what: 'Cancel the offer to play on. OK spends a time ticket and, once those run '
      + 'out, rubies -- and the offer also stands between the round and the score '
      + 'page, so leaving it up costs the round\'s statistics as well.',
  pages: [PageName.MagicalTime],
  every: true,
  steps: [
    { do: 'log', event: Log.Play.MagicalTimeCancelled, message: 'Magical Time offered, cancelling' },
    // One tap per sighting, with no retry of its own: every caller is already
    // polling and comes back here if the dialog is still up, whereas a blind
    // second tap would land on whatever replaced it.
    { do: 'tap', anchor: PageAnchor.Back },
    // Long enough for the dialog to animate away, so the caller's next poll
    // reads the screen behind it rather than the one on its way out.
    { do: 'sleep', ms: 500 }
  ]
});

gPages.subscribe({
  id: 'dismiss.highScore',
  category: PageCategory.Dismiss,
  what: 'Close the new-record panel. Like the Magical Time offer it stands between '
      + 'the round and the score page, and it waits for input -- so left alone it '
      + 'holds the tally behind it until whatever is waiting for that gives up.',
  pages: [PageName.HighScore],
  // A permanent page, so it has to be tapped and tapping it again is harmless if
  // the first one missed.
  every: true,
  steps: [
    { do: 'log', event: Log.Page.HighScoreClosing, message: 'New record panel, closing it' },
    { do: 'tap', anchor: PageAnchor.Back },
    // Until the panel has animated away, so the caller's next poll reads the
    // tally behind it rather than the panel on its way out.
    { do: 'settle', ms: PanelGoneSettleMs }
  ]
});

gPages.subscribe({
  id: 'dismiss.accountLevelUp',
  category: PageCategory.Dismiss,
  what: 'Close the rank-up panel. The player levelling up drops this over the score '
      + 'tally a moment after the tally appears, and like the new-record panel it '
      + 'waits for input -- so the round\'s score and coins stay behind it until '
      + 'something presses Close.',
  pages: [PageName.AccountLevelUp],
  // A permanent page, so it has to be tapped and tapping it again is harmless if
  // the first one missed.
  every: true,
  steps: [
    { do: 'log', event: Log.Page.AccountLevelUpClosing, message: 'Account level up, closing the panel' },
    { do: 'tap', anchor: PageAnchor.Back },
    // Until the panel has animated away, so the caller's next poll reads the
    // tally behind it rather than the panel on its way out.
    { do: 'settle', ms: PanelGoneSettleMs }
  ]
});

gPages.subscribe({
  id: 'dismiss.eventMain',
  category: PageCategory.Dismiss,
  what: 'Press Close on the event\'s own page. Tapping the event\'s result '
      + 'overlay away (waitForScorePage does that blind: the overlay is event '
      + 'art) lands here, one screen further from the score tally the round is '
      + 'waiting to read, and Close is what puts the tally back in front.',
  pages: [PageName.EventMain],
  // A permanent page, so it has to be tapped and tapping it again is harmless if
  // the first one missed.
  every: true,
  steps: [
    { do: 'log', event: Log.Page.EventMainClosing, message: 'Event page, pressing Close' },
    { do: 'tap', anchor: PageAnchor.Back },
    // Until the page has animated away, so the caller's next poll reads the
    // tally behind it rather than the page on its way out.
    { do: 'settle', ms: PanelGoneSettleMs }
  ]
});

gPages.subscribe({
  id: 'dismiss.eventCardReveal',
  category: PageCategory.Dismiss,
  what: 'Tap the event\'s card reveal on. It is put up at the event\'s milestones '
      + 'on the way back to the tally and waits for input; the gift dialog it '
      + 'leads to has a handler of its own.',
  pages: [PageName.EventCardReveal],
  // A permanent page, so it has to be tapped and tapping it again is harmless if
  // the first one missed.
  every: true,
  steps: [
    { do: 'log', event: Log.Page.EventCardRevealClosing, message: 'Event card reveal, tapping it on' },
    { do: 'tap', anchor: PageAnchor.Back },
    // Until what follows has drawn in, so the next poll reads that rather than
    // the card on its way out.
    { do: 'settle', ms: PanelGoneSettleMs }
  ]
});

gPages.subscribe({
  id: 'dismiss.eventGift',
  category: PageCategory.Dismiss,
  what: 'Press Close on the GET! gift dialog. The game\'s generic reward dialog, '
      + 'so it is closed wherever it shows, event or not -- the gift itself waits '
      + 'in the mailbox for the mail sweep.',
  pages: [PageName.EventGift],
  // A permanent page, so it has to be tapped and tapping it again is harmless if
  // the first one missed.
  every: true,
  steps: [
    { do: 'log', event: Log.Page.EventGiftClosing, message: 'Gift dialog, pressing Close' },
    { do: 'tap', anchor: PageAnchor.Back },
    // Until the dialog has animated away, so the next poll reads the screen
    // behind it rather than the dialog on its way out.
    { do: 'settle', ms: PanelGoneSettleMs }
  ]
});

gPages.subscribe({
  id: 'dismiss.notEnoughCoins',
  category: PageCategory.Dismiss,
  what: 'Cancel the offer to trade Rubies for Coins, wherever it comes up. Nothing '
      + 'in this project may spend the player\'s Rubies, and the Box Buying sweep '
      + 'is only one of the ways the game can ask -- so the refusal lives here as '
      + 'well as in that flow, and the page\'s `next` anchor is Cancel too, so no '
      + 'generic mover can press the other button either.',
  pages: [PageName.NotEnoughCoins],
  // A permanent dialog, so it has to be tapped and tapping it again is harmless
  // if the first one missed.
  every: true,
  steps: [
    { do: 'log', event: Log.Box.NoCoins, message: 'Not enough Coins, pressing Cancel' },
    { do: 'tap', anchor: PageAnchor.Back },
    // Until the dialog has animated away, so the next poll reads the screen
    // behind it rather than the dialog on its way out.
    { do: 'settle', ms: PanelGoneSettleMs }
  ]
});

/**
 * The pause menu is in the way unless something is deliberately leaving the board.
 *
 * Nothing here navigates *to* the pause menu -- `PageRoutes` gives it one edge
 * and it leads back to the board -- so the only goal it can be a step towards is
 * `GamePlaying` itself. Outside `navigate()` the goal is `''`, which is the case
 * this band exists for: the play loop asking what is on screen.
 */
function pauseMenuIsInTheWay(event: PageEvent): boolean {
  return event.goal === '' || event.goal === PageName.GamePlaying;
}

gPages.subscribe({
  id: 'dismiss.resumeGame',
  category: PageCategory.Dismiss,
  what: 'Press Continue on the game\'s own pause menu. It stands between the script '
      + 'and the board it was playing, and the script did not necessarily open it: '
      + 'the host presses Pause for the user through `onPause`, so a round comes '
      + 'back from a script pause through here.',
  pages: [PageName.GamePause],
  // Dismiss rather than navigate, and the distinction is the whole point: the
  // navigate band is silent when nothing set a goal, so a handler there is never
  // reached by the play loop's own `detect` -- which is exactly the caller that
  // finds a round paused. It stayed unnoticed while a pause could not make one
  // stick.
  every: true,
  acts: pauseMenuIsInTheWay,
  steps: [
    { do: 'log', event: Log.Page.GameResuming, message: 'Pause menu, pressing Continue' },
    { do: 'tap', anchor: PageAnchor.Next },
    // The game counts back in before the board is live again. Blind, like the
    // other wait on a board: there is no still frame to wait for.
    { do: 'sleep', ms: 500 }
  ]
});

// ===========================================================================
// navigate -- only on a look made with a goal, and never on the destination.
//
// Ordered from "most specific thing to do here" down to "leave by the way it
// was entered", and only where the page has said that is a way out.
//
// A subscription that can decline declares its condition as `acts`
// (globals.d.ts) and nothing else: the dispatch tests it and skips the steps
// when it does not hold, and the forecast reads the same declaration. The steps
// are never run on a frame the condition rejects, so they do not test it again
// -- a second copy of the condition would be right on the day it was written and
// wrong at the first edit.
// ===========================================================================

/** Is there any of this page's self-dismissing window left to sit out? */
function navTransientLeft(event: PageEvent): boolean {
  return event.remainingMs > 0;
}

/** Does the matched entry put the collection one tap away? */
function navHasTsums(event: PageEvent): boolean {
  return event.def !== null && event.def.tsums !== undefined;
}

/** Does the matched entry carry the mailbox icon? */
function navHasMail(event: PageEvent): boolean {
  return event.def !== null && event.def.mail !== undefined;
}

/** Does the matched entry carry the hub's Home tab? */
function navHasHome(event: PageEvent): boolean {
  return event.def !== null && event.def.home !== undefined;
}

/** Does the matched entry carry the Tsum Tsum Store button? */
function navHasStore(event: PageEvent): boolean {
  return event.def !== null && event.def.store !== undefined;
}

/**
 * When the tally on screen arrived -- the visit a Play press is counted against.
 *
 * `age` is measured from the arrival, so this holds for as long as the page is
 * up and changes the moment a new tally replaces it.
 */
function navTallyVisitAt(event: PageEvent): number {
  return event.at - event.age;
}

/** The tally visit whose Play has been pressed. One press a tally, not a look. */
var gTallyPlayPressedAt = 0;

/**
 * Is the tally's Play button really drawn, and still unpressed on this visit?
 *
 * Both halves are about failing safe. The second is not `every: false` in
 * disguise: that is keyed on the page *changing*, and by the time the play task
 * navigates, the tally is the page the round-stats read has been looking at for
 * seconds -- so an on-arrival handler would never be offered here at all.
 * Counting the press against the visit instead gives the shortcut exactly one
 * attempt and hands the tally to `nav.move.exit` after it, whatever went wrong.
 *
 * `tallyPlayShown` takes a frame of its own, because the router has released
 * the sweep's by the time the queue runs. One capture a tally -- and none on a
 * point-battle tally once the attempt is spent.
 */
function navTallyPlayDrawn(event: PageEvent): boolean {
  if (gTallyPlayPressedAt === navTallyVisitAt(event)) {
    return false;
  }
  return event.ts.tallyPlayShown();
}

gPages.subscribe({
  id: 'nav.wait.transient',
  category: PageCategory.Navigate,
  order: 100,
  what: 'Sit out a page that dismisses itself rather than tapping it. This is the '
      + 'whole reason pages are classified: a tap aimed at a transient page lands '
      + 'after it has gone, on whatever replaced it.',
  pages: pagesOfKind(PageKind.Transient),
  every: true,
  acts: navTransientLeft,
  // Not a tap, but the screen is expected to be different afterwards, so the
  // rest of the queue would be acting on a stale reading either way -- which is
  // what being in an acting band says.
  steps: [{ do: 'waitOut' }]
});

gPages.subscribe({
  id: 'nav.move.tallyToGame',
  category: PageCategory.Navigate,
  order: 60,
  what: 'From the score tally, Play opens the pre-round screen directly, saving the hop '
      + 'through the hub between one round and the next. Only when the button can be '
      + 'seen, and only once per tally: a round played in a point battle ends on a tally '
      + 'with one centred Close and no Play, and anything this does not press lands on '
      + 'nav.move.exit below, which closes to the hub as before.',
  pages: [PageName.ScorePage],
  // The only goal this is a shortcut for. Every other goal -- the mailbox, the
  // collection, the store -- starts from the hub, so those still leave by Close.
  goals: [PageName.GamePlaying],
  every: true,
  acts: navTallyPlayDrawn,
  steps: [
    // Before the tap, so the attempt is spent even if the tap is what fails.
    // A press that goes nowhere leaves the tally up, `acts` declines on the next
    // look, and the queue falls through to Close.
    { do: 'call', name: 'markTallyPlayPressed', run: function(event) {
      gTallyPlayPressedAt = navTallyVisitAt(event);
    } },
    { do: 'tap', anchor: PageAnchor.Next },
    // The pre-round screen slides in and is read straight away by
    // `nav.move.startToGame`'s item check, which cannot read it mid-slide.
    { do: 'settle', ms: ScreenChangeSettleMs }
  ]
});

gPages.subscribe({
  id: 'nav.move.friendToGame',
  category: PageCategory.Navigate,
  order: 60,
  what: 'From the friend hub, Play opens the pre-round screen.',
  pages: [PageName.FriendPage],
  goals: [PageName.GamePlaying],
  every: true,
  steps: [
    { do: 'tap', anchor: PageAnchor.Next },
    // The pre-round screen slides in and is read straight away by
    // `nav.move.startToGame`'s item check, which cannot read it mid-slide.
    { do: 'settle', ms: ScreenChangeSettleMs }
  ]
});

gPages.subscribe({
  id: 'nav.move.startToGame',
  category: PageCategory.Navigate,
  order: 60,
  what: 'Set the bonus items the settings asked for, open the round, then start it. '
      + 'The round is opened here rather than on the board so `round.start` goes out '
      + 'with the items still in frame -- a recorder listening for it opens on what '
      + 'the round is being played with. The wait afterwards watches the pre-round '
      + 'screen leave and the board arrive, so the next poll neither reads the round '
      + 'fading in as this screen and checks the items all over again, nor sits out '
      + 'a flat five seconds for a board that came up in two.',
  pages: [PageName.StartPage],
  goals: [PageName.GamePlaying],
  // The item check reads the screen and should not be doing so under startup
  // timings, so it waits for the flag to be cleared.
  after: ['observe.leftStartup'],
  every: true,
  steps: [
    // The item check reads pixels, so it waits for the screen holding them.
    { do: 'settle', ms: ShortSettleMs },
    { do: 'call', name: 'checkGameItem', run: function() {
      this.checkGameItem();
    } },
    // After the item check, so the frame a recorder starts on has the items in
    // the state the round is played with; before the tap, so it has them at all.
    // A no-op unless the play task is the one walking here -- see `openRound`.
    { do: 'call', name: 'openRound', run: function() {
      this.openRound();
    } },
    // The button, not the entry's `next`: they are 58px apart -- see PageRoutes.
    { do: 'tapAt', at: Button.outStart, name: 'outStart' },
    // Not a `settle`: what this is waiting for is a board, which is animating
    // from its first frame and never goes still. Its fingerprint is the arrival,
    // and the tsums dropping into it get `settleBoard` -- see `awaitRoundStart`.
    { do: 'call', name: 'awaitRoundStart', run: function() {
      this.awaitRoundStart();
    } }
  ]
});

gPages.subscribe({
  id: 'nav.move.toTsums',
  category: PageCategory.Navigate,
  order: 60,
  what: 'Any screen carrying a `tsums` anchor has a route straight into the '
      + 'collection, so take it rather than backing out one screen at a time.',
  pages: pagesWithAnchor(PageAnchor.Tsums),
  goals: [PageName.TsumsPage],
  every: true,
  acts: navHasTsums,
  steps: [
    { do: 'tap', anchor: PageAnchor.Tsums },
    { do: 'settle', ms: ScreenChangeSettleMs }
  ]
});

gPages.subscribe({
  id: 'nav.move.toMail',
  category: PageCategory.Navigate,
  order: 60,
  what: 'Any screen carrying a `mail` anchor has the mailbox icon on it, so open the '
      + 'mailbox directly rather than backing out to the hub and hoping.',
  pages: pagesWithAnchor(PageAnchor.Mail),
  goals: [PageName.MailBox],
  every: true,
  acts: navHasMail,
  steps: [
    { do: 'tap', anchor: PageAnchor.Mail },
    // The mailbox slides in; the plan's settle covers the confirming re-read,
    // this covers the poll that would otherwise land mid-animation.
    { do: 'settle', ms: ScreenChangeSettleMs }
  ]
});

gPages.subscribe({
  id: 'nav.move.toHome',
  category: PageCategory.Navigate,
  order: 60,
  what: 'The left rail is on every tab of the hub, so the Home tab is one tap '
      + 'from any of them. The heart sweep goes through here between its two halves: '
      + 'reopening the ranking is what puts our own row back in view.',
  pages: pagesWithAnchor(PageAnchor.Home),
  goals: [PageName.ProfilePage],
  every: true,
  acts: navHasHome,
  steps: [
    { do: 'tap', anchor: PageAnchor.Home },
    { do: 'settle', ms: ScreenChangeSettleMs }
  ]
});

gPages.subscribe({
  id: 'nav.move.toStore',
  category: PageCategory.Navigate,
  order: 60,
  what: 'The collection carries the Tsum Tsum Store button, so take it rather than '
      + 'backing out towards it. The Box Buying sweep is what asks for the store, '
      + 'and `NavPlans.TsumTsumStorePage` is what routes it via the collection.',
  pages: pagesWithAnchor(PageAnchor.Store),
  goals: [PageName.TsumTsumStorePage],
  every: true,
  acts: navHasStore,
  steps: [
    { do: 'tap', anchor: PageAnchor.Store },
    { do: 'settle', ms: ScreenChangeSettleMs }
  ]
});

gPages.subscribe({
  id: 'nav.move.closePage',
  category: PageCategory.Navigate,
  order: 40,
  what: 'The standard close button at centre bottom, plus the second tap that clears '
      + 'the panel some of these screens leave behind.',
  pages: [PageName.ClosePage],
  every: true,
  steps: [
    { do: 'tap', anchor: PageAnchor.Back },
    { do: 'tapAt', at: {x: 310, y: 1588 - 140} },
    { do: 'settle', ms: ShortSettleMs }
  ]
});

gPages.subscribe({
  id: 'nav.move.unknown',
  category: PageCategory.Navigate,
  order: 30,
  what: 'Blind escape from a screen nothing fingerprinted: look for a native dialog '
      + 'first, then work through the cancel and close buttons the game reuses.',
  pages: [PageName.Unknown],
  // The frame is evidence until this touches it. Both are in the Unknown queue,
  // so this is a real edge rather than a formality -- the band priorities would
  // already order them, and saying so keeps that true if either one moves.
  after: ['record.corpusUnknown'],
  every: true,
  steps: [
    { do: 'call', name: 'exitUnknownPage', run: function() {
      this.exitUnknownPage();
    } }
  ]
});

gPages.subscribe({
  id: 'nav.move.exit',
  category: PageCategory.Navigate,
  order: 0,
  what: 'Leave a page by the way it was entered -- its `back` -- where the page '
      + 'declares that as its way out (`PageRoutes`). Last in the band, so anything '
      + 'that knows better has already had its turn. A page with no declared exit is '
      + 'not tapped: `navigate` reports it and the stall guard takes it from there.',
  // Declared per page rather than every page: the hub is the one whose `back`
  // is Play, and a stray fingerprint landing there used to start rounds.
  pages: pagesWithDeclaredExit(),
  every: true,
  steps: [
    { do: 'tap', anchor: PageAnchor.Back },
    { do: 'settle', ms: ShortSettleMs }
  ]
});

// ===========================================================================
// notify -- nothing here changes what is on screen.
// ===========================================================================

gPages.subscribe({
  id: 'notify.trail',
  category: PageCategory.Notify,
  what: 'Log the last few screens with how long each was up, and who claimed this one. '
      + 'Debug only -- this is the history stack in one line, and it is what a report of '
      + '"it got stuck" is usually missing.',
  pages: allPages(),
  steps: [
    { do: 'call', name: 'gPages.trail', run: function(event) {
      logDebug(Log.Page.Trail, {
        trail: gPages.trail(),
        handledBy: event.stoppedBy === '' ? undefined : event.stoppedBy,
      });
    } }
  ]
});

gPages.subscribe({
  id: 'notify.forecast',
  category: PageCategory.Notify,
  what: 'Write what the script is about to do next: which subscription is expected to act '
      + 'on this frame, which task the scheduler runs after this one, and the ways off this '
      + 'screen with where each leads. Debug only and deduplicated -- see src/forecast.ts. '
      + 'It fires on every look rather than only on a change, so a navigation loop tapping '
      + 'the same screen is visible as the loop it is.',
  // Last in the band, so everything it describes -- `stoppedBy` included -- is
  // already settled by the time it reads the event.
  pages: allPages(),
  every: true,
  steps: [
    { do: 'call', name: 'forecastEmit', run: function(event) {
      forecastEmit(event);
    } }
  ]
});

// Every registration is in; the one rule the types cannot check is checked
// here, and a broken one stops the bundle loading.
gPages.validate();
