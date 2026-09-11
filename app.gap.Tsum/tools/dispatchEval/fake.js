// A `Tsum` with no screen and no touch, for running the real dispatch queue over.
//
// Built on the production prototype, so every subscription's steps run through
// the real `PageRouter.perform`; only the leaves are replaced -- the taps, the
// waits, the readers that need pixels -- and each of those writes one entry
// into a trace instead. The trace is what the golden file holds: for a given
// page, goal and look, exactly this sequence of taps and waits went out, in
// this order, with these budgets.
//
// Nothing here decides anything. A subscription that reads a field this fake
// does not set gets `undefined`, which is a finding, not a fallback.

/**
 * The fake, bound to `trace` and `clock`. `host` supplies the storage path the
 * corpus and record readers build paths off.
 */
function createFake(ctx, host, trace, clock) {
  const fake = Object.create(ctx.Tsum.prototype);
  const note = (...entry) => { trace.push(entry); };

  fake.isRunning = true;
  fake.debug = false;
  fake.collectUnknownScreens = false;
  fake.autoLaunch = false;
  fake.isStartupPhase = false;
  fake.yieldAsked = false;
  fake.trackRoundStats = false;
  fake.storagePath = host.storagePath;

  // --- the touch --------------------------------------------------------------
  // Logical coordinates, straight off the table: the conversion to device
  // pixels needs geometry a fake screen does not have, and the table is what a
  // trace should be read against anyway.
  fake.tap = (xy) => { note('tap', xy.x, xy.y); };
  ctx.keycode = (code) => { note('keycode', code); };

  // --- the waits --------------------------------------------------------------
  fake.sleep = (ms) => {
    const t = typeof ms === 'number' ? ms : 1000;
    note('sleep', t);
    clock.now += t;
  };
  // A budget, not a cost: the device decides how much of it is spent, so the
  // trace records the ceiling and the clock does not move.
  fake.settleScreen = (maxMs) => { note('settle', maxMs); return true; };

  // --- the readers that need pixels -------------------------------------------
  fake.screenshot = () => {
    throw new Error('a handler captured the screen; the fake has none');
  };
  fake.isFeverTime = () => false;
  // The ordinary tally, which draws Play: the layout a point battle ends on
  // draws Close alone, and `nav.move.tallyToGame` then declines. Which of the
  // two is up is a question about a frame, and a row here has none -- so the
  // fallback is gated on real frames elsewhere and these rows pin the fast path.
  //
  // Why only the first tally row presses it: the handler allows one press per
  // *visit* to the page, and the clock does not move between rows, so all four
  // ScorePage rows are one visit. The rows after the first read `declined` and
  // fall through to `nav.move.exit` -- which is the fallback itself, pinned.
  fake.tallyPlayShown = () => true;
  fake.saveCorpusFrame = (tag) => { note('call', 'saveCorpusFrame', tag); return false; };
  fake.sampleBaseCoins = () => { note('call', 'sampleBaseCoins'); };
  fake.identifyMyTsum = () => { note('call', 'identifyMyTsum'); };
  fake.checkGameItem = () => { note('call', 'checkGameItem'); };
  // A budget spent looking for the board, like `settleScreen`: the trace
  // records that it ran and the clock does not move.
  fake.awaitRoundStart = () => { note('call', 'awaitRoundStart'); return true; };
  fake.dismissSystemDialog = () => { note('call', 'dismissSystemDialog'); return false; };
  fake.banner = () => {};

  return fake;
}

/**
 * Record which rows ran and what each did -- and which the dispatch skipped
 * because its `acts` said no.
 *
 * One wrapper on `PageRouter.perform`, which is the single place a row's steps
 * are run, rather than one per row: a row that is registered later is recorded
 * too, and there is nothing per-row to keep in step. Whether a row ended the
 * queue is its band's answer (`ForecastActingBands`), read off the bundle, so
 * the harness is not holding a second copy of the stop rule. A row whose steps
 * throw pushes nothing, exactly as the dispatch records nothing for it.
 *
 * Once per runtime. `acts` is also what the forecast reads, so the caller
 * clears `ran` between the forecast and the dispatch.
 */
function recordHandlers(ctx, gPages, ran) {
  const perform = ctx.PageRouter.prototype.perform;
  const acting = ctx.ForecastActingBands;
  ctx.PageRouter.prototype.perform = function (sub, event) {
    perform.call(this, sub, event);
    ran.push({ id: sub.id, outcome: acting.indexOf(sub.category) !== -1 ? 'stop' : 'continue' });
  };
  for (const sub of gPages.subscriptions) {
    if (sub.acts !== undefined) {
      const acts = sub.acts;
      sub.acts = function (event) {
        const would = acts(event);
        if (!would) ran.push({ id: sub.id, outcome: 'declined' });
        return would;
      };
    }
  }
}

module.exports = { createFake, recordHandlers };
