// The dispatch traces: one row per (Page entry x goal x look x age).
//
// Each row sets the router's state by hand -- which entry matched, where
// `navigate()` is heading, whether this look is a change or a repeat, how long
// a transient page has been up -- builds the event the router would build from
// that state, and runs the production queue over the fake. What the row records
// is the queue, which handlers ran and what each answered, the trace of taps
// and waits, and the handler the forecast expected to act.
//
// Keys rather than names, because variants of one page differ in exactly the
// thing a trace is about: where `back` is. `targeted` entries are left out --
// `sweep` never returns one, so the router's `def` is never one.

const { createRuntime } = require('../runtime/load');
const { installClock, START_AT } = require('./clock');
const { createFake, recordHandlers } = require('./fake');

/** The `Unknown` page name, read off a fresh router rather than spelt out. */
function unknownName(ctx) {
  return new ctx.PageRouter().page;
}

/** Everything a row is made of. */
function listRows(ctx) {
  const router = ctx.gPages;
  const goals = [''].concat(Object.keys(ctx.NavPlans));
  const entries = [];
  for (const key of Object.keys(ctx.Page)) {
    const def = ctx.Page[key];
    if (def.targeted) continue;
    entries.push({ key, name: def.name, def });
  }
  entries.push({ key: '', name: unknownName(ctx), def: null });

  const rows = [];
  for (const entry of entries) {
    const window = router.durationOf(entry.name);
    // A transient page is looked at inside its window and after it; anything
    // else has no window and one age is the whole story.
    const ages = window > 0 ? [0, window + 1] : [0];
    for (const goal of goals) {
      for (const changed of [true, false]) {
        for (const age of ages) {
          rows.push({ key: entry.key, name: entry.name, def: entry.def, goal, changed, age });
        }
      }
    }
  }
  return rows;
}

function rowId(row) {
  return [row.key || 'unknown', row.goal || '-', row.changed ? 'changed' : 'repeat', row.age].join('|');
}

/** One runtime, reused across rows; the router is reset between them. */
function createEnv() {
  const { ctx, host } = createRuntime({ quiet: true });
  const clock = installClock(ctx);
  const trace = [];
  const ran = [];
  const fake = createFake(ctx, host, trace, clock);
  recordHandlers(ctx, ctx.gPages, ran);
  return { ctx, host, clock, trace, ran, fake, gPages: ctx.gPages };
}

function runRow(env, row) {
  const { ctx, host, clock, trace, ran, fake, gPages } = env;
  trace.length = 0;
  ran.length = 0;
  host.logLines.length = 0;
  clock.now = START_AT;

  // `attach` is the router's own reset: page, history, goal, and the owner.
  gPages.attach(fake);
  ctx.gFever.reset();
  ctx.gForecastLast = '';
  fake.isStartupPhase = false;

  gPages.page = row.name;
  gPages.key = row.key;
  gPages.def = row.def;
  gPages.since = clock.now - row.age;
  gPages.seenAt = clock.now;

  const event = gPages.buildEvent(row.changed, row.goal);
  const queue = gPages.plan(row.name, row.goal, row.changed).map((sub) => sub.id);
  const forecast = ctx.forecastSteps(event);
  // The forecast asked every `acts` too; only the dispatch's answers count.
  ran.length = 0;
  gPages.react(event);

  return {
    queue,
    ran: ran.slice(),
    stoppedBy: event.stoppedBy,
    predicted: forecast.actor === null ? '' : forecast.actor.id,
    trace: trace.slice(),
    elapsedMs: clock.now - START_AT,
    // Not part of the golden: these are invariants, checked in run.js.
    leaked: host.liveImages(),
    reentered: host.logLines.some((line) => line.indexOf('page.dispatchReentered') !== -1),
    window: gPages.durationOf(row.name),
  };
}

/**
 * The band of every subscription, by id, for the invariant checks.
 */
function bandsOf(ctx) {
  const out = {};
  for (const sub of ctx.gPages.subscriptions) out[sub.id] = sub.category;
  return out;
}

/** The pages each subscription declares, or null for a wildcard. */
function pagesOf(ctx) {
  const out = {};
  for (const sub of ctx.gPages.subscriptions) out[sub.id] = sub.pages === undefined ? null : sub.pages;
  return out;
}

/**
 * Run every row. Returns the results keyed by row id, plus what the invariant
 * checks need to read them.
 */
function runDispatch(filter) {
  const env = createEnv();
  const results = {};
  for (const row of listRows(env.ctx)) {
    const id = rowId(row);
    if (filter && id.indexOf(filter) === -1) continue;
    results[id] = Object.assign({ page: row.name, goal: row.goal, changed: row.changed, age: row.age }, runRow(env, row));
  }
  return { results, bands: bandsOf(env.ctx), pages: pagesOf(env.ctx) };
}

module.exports = { runDispatch, listRows, rowId };
