// The scheduler traces: which task the loop picks, tick by tick, per preset.
//
// The real `buildRun` builds the run -- the table, the registration, the Now
// sweeps -- so the golden is what the device would do, not a reading of it.
// Then the loop is driven one `tick()` at a time under the harness clock, with
// each job's body swapped for one that only advances the clock by how long that
// job takes. The sequence of picks is the golden.
//
// The two "Now" sweeps keep their real bodies: what they call on the run
// (`taskAutoUnlockLevel`, `taskBuyBoxes`) is stubbed instead, so a preset can
// have the sweep stand aside for a round a given number of times before it goes.

const fs = require('fs');
const path = require('path');
const { createRuntime } = require('../runtime/load');
const { installClock, START_AT } = require('./clock');

const presetsDir = path.join(__dirname, 'presets');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Every preset but the base, by name. */
function listPresets() {
  return fs.readdirSync(presetsDir)
    .filter((f) => f.endsWith('.json') && f !== 'base.json')
    .sort()
    .map((f) => ({ name: f.slice(0, -5), preset: readJson(path.join(presetsDir, f)) }));
}

/** A job's fake body: the pick is recorded by the loop, this only costs time. */
function fakeBody(clock, durationMs) {
  const body = () => { clock.now += durationMs; };
  body.isFake = true;
  return body;
}

/**
 * Replace the body of every scheduled job with one that only costs time. Run
 * before every tick, so a job registered mid-run is caught before its first
 * turn. The Now sweeps are not in `durations`: they keep their real bodies, and
 * what those call on the run is stubbed instead.
 */
function swapBodies(controller, clock, durations) {
  for (const name of Object.keys(controller.tasks)) {
    const task = controller.tasks[name];
    if (task.run.isFake || durations[name] === undefined) continue;
    task.run = fakeBody(clock, durations[name]);
  }
}

function runPreset(name, preset, base) {
  const { ctx, host } = createRuntime({ quiet: true });
  const clock = installClock(ctx);
  host.setCapture({ w: 1080, h: 1920, data: new Uint8Array(1080 * 1920 * 4) });

  const settings = Object.assign({}, base.settings, preset.settings || {});
  const durations = Object.assign({}, base.durationsMs, preset.durationsMs || {});
  const ticks = preset.ticks || base.ticks;
  const standAside = Object.assign({}, preset.standAside || {});

  ctx.buildRun(settings, ctx.logStringsFor(settings.locale));
  const controller = ctx.gTaskController;
  const run = ctx.ts;
  if (controller === undefined || run === undefined) {
    throw new Error(name + ': buildRun built no run');
  }

  // What the Now sweeps call. `false` is "a round is on, stand aside".
  let note = '';
  const sweep = (task) => () => {
    if ((standAside[task] | 0) > 0) {
      standAside[task]--;
      note = 'stood aside';
      return false;
    }
    clock.now += durations[task];
    return true;
  };
  run.taskAutoUnlockLevel = sweep('autoUnlockLevel');
  run.taskBuyBoxes = sweep('buyBoxes');

  const picks = [];
  try {
    for (let i = 0; i < ticks; i++) {
      swapBodies(controller, clock, durations);
      note = '';
      const at = clock.now - START_AT;
      const ran = controller.tick();
      if (ran !== '') {
        const pick = { at, ran };
        if (note !== '') pick.note = note;
        picks.push(pick);
      }
      clock.now += controller.interval;
    }
  } finally {
    ctx.endRun();
  }

  // The order the jobs first ran in: the short answer to "who goes first".
  const order = [];
  for (const pick of picks) {
    if (order.indexOf(pick.ran) === -1) order.push(pick.ran);
  }
  return { order, tickMs: controller.interval, picks };
}

/** Run every preset. Returns the results keyed by preset name. */
function runScheduler(filter) {
  const base = readJson(path.join(presetsDir, 'base.json'));
  const results = {};
  for (const { name, preset } of listPresets()) {
    if (filter && name.indexOf(filter) === -1) continue;
    results[name] = runPreset(name, preset, base);
  }
  return results;
}

module.exports = { runScheduler, listPresets };
