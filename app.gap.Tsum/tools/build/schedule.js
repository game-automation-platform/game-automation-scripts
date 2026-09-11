// A dependency-ordered step runner, used by tools/build/build.js.
//
// Every step names the steps it needs. Anything whose needs are met runs, up to
// a job limit; the rest waits. Two rules keep a parallel build readable:
//
//   - each step's output is buffered and flushed in *declaration* order, so the
//     log reads top-to-bottom however the steps actually interleaved;
//   - a step marked `optional` prints its findings and does not stop the build,
//     which is how the documentation and check steps have always behaved.
//
// A required step's failure stops new work from starting but lets the in-flight
// steps finish, so their output is not thrown away. Whatever never ran is
// reported as skipped rather than silently missing.

'use strict';

const os = require('os');

/** One job per core, within reason: the graph is only ~6 steps wide. */
function defaultJobs() {
  const cores = typeof os.availableParallelism === 'function'
    ? os.availableParallelism()
    : (os.cpus() || []).length;
  return Math.max(2, Math.min(cores || 4, 8));
}

const messageOf = (err) => (err && err.message) ? err.message : String(err);

/**
 * @param {Array<{id: string, needs?: string[], optional?: boolean, run: Function}>} steps
 *        In the order they should print, which is not the order they run in.
 * @param {{jobs?: number, write?: Function}} opts
 * @returns {Promise<{ok: boolean, failures: Array, timings: Array}>}
 */
async function runSteps(steps, opts = {}) {
  const limit = opts.jobs || defaultJobs();
  const write = opts.write || ((text) => process.stdout.write(text));

  const index = new Map(steps.map((step, i) => [step.id, i]));
  for (const step of steps) {
    for (const need of step.needs || []) {
      if (!index.has(need)) throw new Error(`step "${step.id}" needs unknown step "${need}"`);
    }
  }

  const state = steps.map(() => ({ status: 'waiting', ms: 0, out: [], note: '' }));
  const failures = [];
  let running = 0;
  let stopped = false;
  let printed = 0;

  const finished = (i) => state[i].status !== 'waiting' && state[i].status !== 'running';

  // Print every finished step up to the first one still going. A step that
  // finishes early simply waits its turn.
  function flush() {
    while (printed < steps.length && finished(printed)) {
      const st = state[printed];
      write(st.status === 'skipped'
        ? `== ${steps[printed].id}  skipped\n`
        : `== ${steps[printed].id}  ${st.ms} ms${st.status === 'failed' ? '  FAILED' : ''}${st.note}\n`);
      if (st.out.length) write(st.out.join(''));
      printed++;
    }
  }

  await new Promise((resolve) => {
    function pump() {
      if (!stopped) {
        for (let i = 0; i < steps.length && running < limit; i++) {
          if (state[i].status !== 'waiting') continue;
          if (!(steps[i].needs || []).every((n) => state[index.get(n)].status === 'ok')) continue;
          start(i);
        }
      }
      if (running === 0) {
        for (const st of state) if (st.status === 'waiting') st.status = 'skipped';
        flush();
        resolve();
      }
    }

    function start(i) {
      const st = state[i];
      st.status = 'running';
      running++;
      const started = Date.now();

      // Always async (the run() call is behind a promise), so this never
      // re-enters pump's loop while it is still starting steps.
      const done = (err) => {
        st.ms = Date.now() - started;
        running--;
        if (!err) {
          st.status = 'ok';
        } else if (steps[i].optional) {
          st.status = 'ok';
          st.note = '  (reported findings; see below)';
          st.out.push(`[build] ${steps[i].id}: ${messageOf(err)}\n`);
        } else {
          st.status = 'failed';
          failures.push({ id: steps[i].id, message: messageOf(err) });
          stopped = true;
        }
        flush();
        pump();
      };

      Promise.resolve()
        .then(() => steps[i].run({ log: (text) => st.out.push(text) }))
        .then(() => done(null), (err) => done(err || new Error('failed')));
    }

    pump();
  });

  return {
    ok: failures.length === 0,
    failures,
    timings: steps.map((step, i) => ({ id: step.id, ms: state[i].ms, status: state[i].status })),
  };
}

module.exports = { runSteps, defaultJobs };
