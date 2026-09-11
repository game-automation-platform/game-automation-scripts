// The observed page graph: which screen has actually been seen to follow which.
//
// Not a hand-authored sitemap. One of those was turned down for three reasons,
// the third being that it could not be validated -- 35 pages of hand-written
// successor sets with no regression gate, where a missing edge is a permanent
// `Unknown`. This is the answer to that: a ledger of transitions the script was
// measured making, which accumulates across pulls and can be checked rather
// than believed. The harvesting tools live outside this repo and write through
// this module; PAGE_DISPATCH.md's sitemap is rendered from it here.
//
// ## Where the data comes from
//
// `PageRouter.saveHistoryShot` (src/pages.ts) writes one matcher-space frame per
// page change to `<storage>/tsum_record/pageHistory/<seq>_<PageName>.png`. The
// *filenames* are the record: ordered, page-labelled visits. So a harvest is one
// `adb shell ls` and no image transfer at all.
//
// Three properties of that directory shape everything here:
//
//   * It is a sliding window, not a session. A frame is deleted as its visit
//     falls off `historyDepth` (default 20), so one pull sees the tail of the
//     last run and nothing before it. The ledger accumulates; a single pull
//     never will.
//   * Sequence numbers restart with the run and the directory is wiped at
//     startup, so seq is unique *within* a run and repeats across runs. That is
//     why dedup below is best-effort and `count` is a confidence signal rather
//     than a statistic.
//   * A gap in the sequence is a visit whose frame failed to save, not a
//     transition. `pairsFrom` requires consecutive numbers before it will call
//     two visits an edge.
//
// It also needs "Debug game" on, because that is what sets `keepShots`.
//
// ## The other source
//
// `taskWalkthrough` (src/walkthrough.ts) records a whole hand-driven walk --
// every screen, every tap on it, and what followed -- into one session file. It
// needs a person, but it is not a window and it carries the taps, so an edge
// harvested from one says *where you press to take it*. `mergeSession` folds
// those in beside the pageHistory pairs.

const fs = require('fs');
const path = require('path');

// The ledger lives with the documentation it feeds (PAGE_DISPATCH.md's sitemap).
// The tools that write it live outside this repo and reach it through here.
const ledgerFile = path.resolve(__dirname, '..', '..', 'docs', 'transitions.json');

/** `00007_FriendPage.png` -- the zero padding is what makes a listing sort. */
const FrameName = /^(\d+)_(.+)\.png$/;

const LedgerNote =
  'Observed page-to-page transitions, harvested from tsum_record/pageHistory by ' +
  'the development tools. Generated data, not hand-authored: see ' +
  'tools/runtime/transitions.js. `count` is how many times the pair has been ' +
  'observed across all harvests, which is a confidence signal rather than a ' +
  'statistic -- the on-device window is only `pageHistoryDepth` visits deep.';

function emptyLedger() {
  return {
    note: LedgerNote, harvests: 0, updated: '',
    lastListing: [], sessions: [], transitions: []
  };
}

function read() {
  if (!fs.existsSync(ledgerFile)) return emptyLedger();
  try {
    const ledger = Object.assign(emptyLedger(), JSON.parse(fs.readFileSync(ledgerFile, 'utf8')));
    // The note is prose that belongs to the tool, not to the data.
    ledger.note = LedgerNote;
    return ledger;
  } catch (e) {
    throw new Error('docs/transitions.json is not readable JSON: ' + e.message);
  }
}

function write(ledger) {
  ledger.transitions.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1
    : a.to < b.to ? -1 : a.to > b.to ? 1 : 0));
  fs.mkdirSync(path.dirname(ledgerFile), { recursive: true });
  fs.writeFileSync(ledgerFile, JSON.stringify(ledger, null, 2) + '\n');
}

/** A device listing as ordered visits. Anything not a history frame is dropped. */
function parseListing(names) {
  const visits = [];
  for (const name of names) {
    const m = FrameName.exec(String(name).trim());
    if (m) visits.push({ seq: parseInt(m[1], 10), page: m[2] });
  }
  return visits.sort((a, b) => a.seq - b.seq);
}

/**
 * The edges in one window.
 *
 * Keyed by seq as well as by the pair, so a second harvest of the same run can
 * tell "this edge again" from "this same edge, still sitting in the window".
 */
function pairsFrom(visits) {
  const pairs = [];
  for (let i = 0; i + 1 < visits.length; i++) {
    const a = visits[i];
    const b = visits[i + 1];
    if (b.seq !== a.seq + 1) continue;
    pairs.push({ key: a.seq + '>' + a.page + '>' + b.page, from: a.page, to: b.page });
  }
  return pairs;
}

/**
 * Fold a device listing into the ledger.
 *
 * Returns what happened, for the caller to report: `added` are pairs the ledger
 * had never seen, `counted` is how many observations were new since the last
 * harvest, and `unchanged` is true when the device is still showing exactly what
 * the last pull saw -- which is what it looks like when nothing has run since.
 */
function merge(ledger, names, when) {
  const stamp = (when || new Date()).toISOString().slice(0, 10);
  const listing = names.slice().sort();
  const unchanged = ledger.lastListing.length !== 0
    && ledger.lastListing.join('\n') === listing.join('\n');

  const seen = {};
  for (const pair of pairsFrom(parseListing(ledger.lastListing))) seen[pair.key] = true;

  const index = {};
  for (const t of ledger.transitions) index[t.from + '>' + t.to] = t;

  const added = [];
  let counted = 0;
  for (const pair of pairsFrom(parseListing(listing))) {
    if (seen[pair.key]) continue;
    counted++;
    const id = pair.from + '>' + pair.to;
    let entry = index[id];
    if (entry === undefined) {
      entry = { from: pair.from, to: pair.to, count: 0, firstSeen: stamp, lastSeen: stamp };
      index[id] = entry;
      ledger.transitions.push(entry);
      added.push(entry);
    }
    entry.count++;
    entry.lastSeen = stamp;
  }

  ledger.lastListing = listing;
  if (counted > 0) {
    ledger.harvests++;
    ledger.updated = stamp;
  }
  return { added, counted, unchanged, visits: parseListing(listing).length };
}


// --- recorded walkthroughs -------------------------------------------------
//
// The other source, and the richer one. `taskWalkthrough` (src/walkthrough.ts)
// records a hand-driven walk: every screen, every tap made on it in logical
// coordinates, and what followed. Folding that in gives each edge the thing the
// pageHistory filenames cannot -- *where you tap to take it*, which is what a
// routing table over declared edges would need.

/** Taps this close together are the same button pressed twice. */
const TapGrid = 20;
/** Distinct positions kept per edge, most-used first. */
const TapsPerEdge = 6;

const snap = (v) => Math.round(v / TapGrid) * TapGrid;

/**
 * The tap that caused a visit to end.
 *
 * The last one made on the screen: a visit can hold several -- a miss, then the
 * button -- and only the final one can be what moved the game on. The earlier
 * ones are real taps that changed nothing, which is not a claim this ledger is
 * shaped to carry.
 */
function causingTap(visit) {
  const taps = visit.taps || [];
  return taps.length === 0 ? null : taps[taps.length - 1];
}

function recordTap(entry, tap) {
  if (!entry.taps) entry.taps = [];
  const x = snap(tap.lx);
  const y = snap(tap.ly);
  const hit = entry.taps.find((t) => t.x === x && t.y === y);
  if (hit) {
    hit.n++;
  } else {
    entry.taps.push({ x, y, n: 1 });
  }
  entry.taps.sort((a, b) => b.n - a.n);
  if (entry.taps.length > TapsPerEdge) entry.taps.length = TapsPerEdge;
}

/**
 * Fold one recorded session into the ledger.
 *
 * Deduped by session name rather than by content: a session file is written
 * once and named for the moment the walk started, so re-pulling a device is
 * idempotent without having to reason about overlapping windows the way the
 * pageHistory harvest does.
 */
function mergeSession(ledger, session, when) {
  const name = String(session.session || '');
  if (name === '' || ledger.sessions.indexOf(name) !== -1) {
    return { added: [], counted: 0, already: true, visits: 0 };
  }
  const stamp = (when || new Date()).toISOString().slice(0, 10);

  const index = {};
  for (const t of ledger.transitions) index[t.from + '>' + t.to] = t;

  const added = [];
  let counted = 0;
  for (const visit of session.visits || []) {
    if (!visit.to) continue;  // the visit the walk ended on: no edge yet
    counted++;
    const id = visit.page + '>' + visit.to;
    let entry = index[id];
    if (entry === undefined) {
      entry = { from: visit.page, to: visit.to, count: 0, firstSeen: stamp, lastSeen: stamp };
      index[id] = entry;
      ledger.transitions.push(entry);
      added.push(entry);
    }
    entry.count++;
    entry.lastSeen = stamp;
    const tap = causingTap(visit);
    if (tap) recordTap(entry, tap);
  }

  ledger.sessions.push(name);
  if (counted > 0) {
    ledger.harvests++;
    ledger.updated = stamp;
  }
  return { added, counted, already: false, visits: (session.visits || []).length };
}

/** Every page the ledger has ever seen, either end of an edge. */
function pagesSeen(ledger) {
  const set = {};
  for (const t of ledger.transitions) {
    set[t.from] = true;
    set[t.to] = true;
  }
  return Object.keys(set).sort();
}

module.exports = {
  ledgerFile,
  emptyLedger,
  read,
  write,
  parseListing,
  pairsFrom,
  merge,
  mergeSession,
  pagesSeen,
};
