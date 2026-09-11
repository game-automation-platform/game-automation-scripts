#!/usr/bin/env node
// Golden traces for the dispatch queue and the scheduler.
//
//   npm run dispatch:eval             compare against golden/, exit 1 on a change
//   npm run dispatch:update           rewrite golden/ from the current bundle
//   -- --dispatch | --scheduler       one half only
//   -- --only <text>                  rows or presets whose id contains <text>
//   -- --strict                       every invariant is a gate, not a finding
//   -- -v                             print every finding and every changed row
//
// ## What it is for
//
// A change made for one page kept changing what happened on other pages, and
// nothing said so until a device did. This pins, for every (Page entry x goal x
// look), the exact taps and waits the queue sends out and the handler that
// claimed the frame -- and for every settings preset, the exact order the loop
// takes the jobs in. A change that alters another page's row fails here, with
// the row named, before it ships.
//
// The goldens are captured from the bundle as it is, not from a specification:
// `dispatch:update` says "this is now the intended behaviour", and the diff it
// writes is what a reviewer reads. See tools/dispatchEval/README.md.
//
// ## Invariants
//
// Some things are wrong whatever the golden says, and are checked separately:
// a leaked image handle, a dispatch re-entered from a handler, a navigate-band
// handler running with no goal set, a handler running after a Stop that is not
// in the notify band, a tap on a transient page with window still to run, and
// the forecast's actor disagreeing with the handler that acted (the dispatch
// tests the same `acts` the forecast reads, so it cannot). One more is a
// finding until the change that makes it true has shipped, and a gate under
// `--strict`: every handler that ran declaring the page it ran on.

const fs = require('fs');
const path = require('path');
const { runDispatch } = require('./dispatch');
const { runScheduler } = require('./scheduler');

const goldenDir = path.join(__dirname, 'golden');
const dispatchGolden = path.join(goldenDir, 'dispatch.json');
const schedulerGolden = path.join(goldenDir, 'scheduler.json');

const argv = process.argv.slice(2);
const flag = (name) => argv.indexOf(name) !== -1;
const update = flag('--update');
const verbose = flag('-v') || flag('--verbose');
const strict = flag('--strict');
const onlyDispatch = flag('--dispatch');
const onlyScheduler = flag('--scheduler');
const only = (() => {
  const i = argv.indexOf('--only');
  return i === -1 ? '' : (argv[i + 1] || '');
})();

// --- invariants ------------------------------------------------------------

const NAVIGATE = 'navigate';
const NOTIFY = 'notify';

/**
 * What must hold for one dispatch row. Each returns a message or ''. `gate`
 * ones fail the run; the rest are findings until `--strict`.
 */
const invariants = [
  { gate: true, name: 'no leaked image', check: (r) => r.leaked === 0 ? '' : r.leaked + ' image handle(s) left open' },
  { gate: true, name: 'no re-entry', check: (r) => r.reentered ? 'dispatch was re-entered from a handler' : '' },
  { gate: true, name: 'navigate silent without a goal', check: (r, ctx) => {
    if (r.goal !== '') return '';
    const moved = r.ran.filter((e) => ctx.bands[e.id] === NAVIGATE).map((e) => e.id);
    return moved.length === 0 ? '' : 'navigate band ran with no goal: ' + moved.join(', ');
  } },
  { gate: true, name: 'only notify after a stop', check: (r, ctx) => {
    let stopped = false;
    for (const e of r.ran) {
      if (stopped && ctx.bands[e.id] !== NOTIFY) return e.id + ' ran after ' + r.stoppedBy + ' stopped the queue';
      if (e.outcome === 'stop') stopped = true;
    }
    return '';
  } },
  { gate: true, name: 'no tap inside a transient window', check: (r) => {
    if (r.window === 0 || r.age >= r.window) return '';
    const taps = r.trace.filter((t) => t[0] === 'tap' || t[0] === 'keycode');
    return taps.length === 0 ? '' : taps.length + ' tap(s) on a page that dismisses itself';
  } },
  { gate: true, name: 'forecast agrees with dispatch', check: (r) =>
    r.predicted === r.stoppedBy ? '' : 'forecast expected ' + (r.predicted || 'nobody') + ', ' + (r.stoppedBy || 'nobody') + ' acted' },
  { gate: false, name: 'every handler declares its page', check: (r, ctx) => {
    const wild = r.ran.filter((e) => ctx.pages[e.id] === null).map((e) => e.id);
    return wild.length === 0 ? '' : 'ran on an undeclared page: ' + wild.join(', ');
  } },
];

function checkInvariants(results, ctx) {
  const findings = [];
  for (const id of Object.keys(results)) {
    for (const inv of invariants) {
      const message = inv.check(results[id], ctx);
      if (message !== '') findings.push({ id, gate: inv.gate || strict, name: inv.name, message });
    }
  }
  return findings;
}

// --- goldens ---------------------------------------------------------------

/** The golden's view of a dispatch row: what is pinned, and nothing diagnostic. */
function pinDispatch(row) {
  return {
    queue: row.queue,
    ran: row.ran,
    stoppedBy: row.stoppedBy,
    predicted: row.predicted,
    trace: row.trace,
    elapsedMs: row.elapsedMs,
  };
}

function readGolden(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeGolden(file, note, rows) {
  fs.mkdirSync(goldenDir, { recursive: true });
  // One row per line, so a diff names the row and nothing else moves.
  const keys = Object.keys(rows).sort();
  const lines = keys.map((k) => '    ' + JSON.stringify(k) + ': ' + JSON.stringify(rows[k]));
  const text = '{\n  "note": ' + JSON.stringify(note) + ',\n  "rows": {\n' + lines.join(',\n') + '\n  }\n}\n';
  fs.writeFileSync(file, text);
}

/** Field-by-field differences between two rows, as short strings. */
function describeChange(before, after) {
  const out = [];
  for (const field of Object.keys(after)) {
    const a = JSON.stringify(before[field]);
    const b = JSON.stringify(after[field]);
    if (a !== b) out.push(field + ' ' + a + ' -> ' + b);
  }
  return out;
}

function compare(label, golden, actual) {
  const changes = [];
  const ids = new Set(Object.keys(actual));
  if (golden) for (const k of Object.keys(golden.rows)) ids.add(k);
  for (const id of Array.from(ids).sort()) {
    if (only && id.indexOf(only) === -1) continue;
    const before = golden ? golden.rows[id] : undefined;
    const after = actual[id];
    if (before === undefined) changes.push({ id, what: 'new row (not in golden)' });
    else if (after === undefined) changes.push({ id, what: 'row gone (in golden, not produced)' });
    else {
      const diff = describeChange(before, after);
      if (diff.length) changes.push({ id, what: diff.join('; ') });
    }
  }
  return changes;
}

// --- main ------------------------------------------------------------------

let failed = false;

function report(label, count, changes, findings) {
  const gates = findings.filter((f) => f.gate);
  const notes = findings.filter((f) => !f.gate);
  console.log(`${label}: ${count} rows, ${changes.length} changed, ${gates.length} invariant failure(s), ${notes.length} finding(s)`);
  const show = (items, prefix) => {
    for (const item of items) console.log('  ' + prefix + ' ' + item.id + ': ' + (item.what || item.name + ' -- ' + item.message));
  };
  if (changes.length) show(verbose ? changes : changes.slice(0, 20), 'changed');
  if (changes.length > 20 && !verbose) console.log('  ... ' + (changes.length - 20) + ' more (-v for all)');
  show(gates, 'FAIL');
  if (verbose) show(notes, 'note');
  else if (notes.length) {
    const byName = {};
    for (const n of notes) byName[n.name] = (byName[n.name] || 0) + 1;
    for (const name of Object.keys(byName)) console.log('  note: ' + name + ' x' + byName[name] + ' (-v to list)');
  }
  if (changes.length || gates.length) failed = true;
}

if (!onlyScheduler) {
  const { results, bands, pages } = runDispatch(only);
  const pinned = {};
  for (const id of Object.keys(results)) pinned[id] = pinDispatch(results[id]);
  const findings = checkInvariants(results, { bands, pages });
  if (update && !only) {
    writeGolden(dispatchGolden,
      'One row per Page entry x navigate goal x look (changed/repeat) x age: the queue, which handlers ran and what each answered, the trace of taps and waits, and the forecast\'s pick. Rewritten by `npm run dispatch:update`; a diff here is a behaviour change.',
      pinned);
    console.log('dispatch: wrote ' + Object.keys(pinned).length + ' rows to ' + path.relative(process.cwd(), dispatchGolden));
    const gates = findings.filter((f) => f.gate);
    for (const g of gates) console.log('  FAIL ' + g.id + ': ' + g.name + ' -- ' + g.message);
    if (gates.length) failed = true;
  } else {
    const golden = readGolden(dispatchGolden);
    if (golden === null) { console.log('dispatch: no golden yet; run `npm run dispatch:update`'); failed = true; }
    report('dispatch', Object.keys(pinned).length, compare('dispatch', golden, pinned), findings);
  }
}

if (!onlyDispatch) {
  const results = runScheduler(only);
  if (update && !only) {
    writeGolden(schedulerGolden,
      'One row per preset in tools/dispatchEval/presets/: the order the jobs first ran in, and every pick the loop made, tick by tick, under a fake clock. Rewritten by `npm run dispatch:update`; a diff here is a behaviour change.',
      results);
    console.log('scheduler: wrote ' + Object.keys(results).length + ' presets to ' + path.relative(process.cwd(), schedulerGolden));
  } else {
    const golden = readGolden(schedulerGolden);
    if (golden === null) { console.log('scheduler: no golden yet; run `npm run dispatch:update`'); failed = true; }
    report('scheduler', Object.keys(results).length, compare('scheduler', golden, results), []);
    if (verbose) for (const name of Object.keys(results)) console.log('  ' + name + ': ' + results[name].order.join(' > '));
  }
}

process.exit(failed ? 1 : 0);
