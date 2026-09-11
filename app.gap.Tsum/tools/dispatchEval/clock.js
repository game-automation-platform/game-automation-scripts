// A clock the harness owns, installed into the bundle's own realm.
//
// The bundle runs in a vm context with its own `Date`, so patching `Date.now`
// from this file would change nothing it reads (DRIVING_SCREENS.md § 10). The
// patch has to be evaluated *inside* the context, against a counter both sides
// can see. Every wait then advances the counter instead of passing time, which
// is what makes a deadline loop finish in microseconds and a trace repeatable.

const vm = require('vm');

/** Any fixed epoch will do; this one keeps the numbers readable in a diff. */
const START_AT = 1700000000000;

/**
 * Replace the realm's `Date.now` and its `sleep` native with the counter.
 * Returns the counter, whose `now` the caller reads and advances.
 */
function installClock(ctx) {
  ctx.__clock = { now: START_AT };
  vm.runInContext(
    'Date.now = function () { return globalThis.__clock.now; };',
    ctx, { filename: 'dispatchEval/clock.js:install' });
  // The host shim's sleep is a no-op; here a sleep is time passing.
  ctx.sleep = (ms) => { ctx.__clock.now += Number(ms) || 0; };
  return ctx.__clock;
}

module.exports = { installClock, START_AT };
