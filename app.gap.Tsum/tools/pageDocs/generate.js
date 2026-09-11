#!/usr/bin/env node
// Render the page-dispatch documentation.
//
//   npm run pages:docs          write PAGE_DISPATCH.md
//   npm run pages:docs -- --check   verify it is current without writing
//
// Also run from build.sh / build.ps1 straight after `tsc`, so the committed
// document is never a version behind the code it describes.
//
// ## Why it loads the bundle
//
// The order subscriptions run in is not written down anywhere -- it is computed,
// by `PageRouter.plan`, from four things at once: the band priorities, each
// subscription's `order`, its registration position, and a topological pass over
// the `after` dependencies. A generator that re-implemented that would be a
// second copy of the rule, and the interesting failure is exactly the case where
// the two disagree.
//
// So this builds the bundle, evaluates it under `tools/runtime/`'s host shim,
// and asks the real router. Everything below is a rendering of answers that
// came from production code; nothing here decides an order.
//
// ## What it checks
//
// Two things are errors rather than notes:
//
//   * an `after` naming a subscription id that does not exist -- a typo, and a
//     dependency that will never be waited for (`gPages.validate()` refuses it
//     at load as well, so this is belt and braces)
//   * a page no handler can leave -- nothing in the guard, dismiss or navigate
//     band -- which is a screen `navigate()` would sit on until the stall guard
//     restarts the app. Silent at runtime beyond the `nav.noRoute` line.
//
// `--check` turns a stale file into a non-zero exit as well, for CI.

const fs = require('fs');
const path = require('path');
const { createRuntime, ensureBuild, projectDir } = require('../runtime/load');
const transitions = require('../runtime/transitions');

const outFile = path.join(projectDir, 'PAGE_DISPATCH.md');
const dataFile = path.join(projectDir, 'src', 'data.ts');

/**
 * Every name `findPage()` can return, read out of the `PageName` declaration.
 *
 * Parsed from source rather than taken from the bundle because `PageName` is a
 * `const enum`: erased at compile time and inlined at every use, so there is no
 * runtime object to enumerate. Reading the source is also the only way to see a
 * name that is declared but has no `Page` entry yet.
 */
function listPageNames() {
  const src = fs.readFileSync(dataFile, 'utf8');
  const block = /const enum PageName \{([\s\S]*?)\n\}/.exec(src);
  if (!block) return [];

  const out = [];
  let section = '';
  for (const line of block[1].split('\n')) {
    const comment = /^\s*\/\/\s*(.+?)\s*$/.exec(line);
    if (comment) {
      // Only the short group headers ("// In game", "// Mail / hearts") are
      // sections; the long prose comments in that block are notes, not groups.
      if (comment[1].length <= 40) section = comment[1];
      continue;
    }
    const member = /^\s*(\w+)\s*=\s*'([^']*)'/.exec(line);
    if (member) out.push({ member: member[1], name: member[2], section });
  }
  return out;
}

/** The goals `PageRouter.navigate` accepts, plus "not navigating". */
const NoGoal = '';

/** Above this the mermaid graph stops being readable and the table stands alone. */
const SitemapMaxEdges = 80;

// --- gathering -------------------------------------------------------------

function gather(ctx) {
  const router = ctx.gPages;
  const names = listPageNames();
  const goals = Object.keys(ctx.NavPlans);
  const subs = router.subscriptions;

  const byId = {};
  for (const sub of subs) byId[sub.id] = sub;

  // The whole registry in the order `plan` sorts it into before its topological
  // pass: band priority, then `order`, then registration. Every queue is this
  // list with entries removed, which is what makes one merged table per page
  // honest -- see mergeOrders.
  const canonical = globalOrder(ctx, subs);

  const pages = names.map((n) => {
    const profile = ctx.PageProfiles[n.name];
    // The canonical order for a page change with no destination, which every
    // per-goal queue is a subsequence of (asserted below).
    const base = router.plan(n.name, NoGoal, true);
    const perGoal = {};
    for (const goal of goals) perGoal[goal] = router.plan(n.name, goal, true);
    // The same queues on a second look at a page that has not changed, which is
    // what the navigation loop spends most of its time doing: only the `every`
    // subscriptions are offered.
    const repeat = mergeOrders(canonical, [router.plan(n.name, NoGoal, false)]
      .concat(goals.map((g) => router.plan(n.name, g, false))));

    // The merged listing: everything that can fire on this page, in the order it
    // would fire, whatever the destination.
    const merged = mergeOrders(canonical, [base].concat(goals.map((g) => perGoal[g])));

    return {
      name: n.name,
      member: n.member,
      section: n.section,
      profile,
      merged,
      base,
      perGoal,
      repeatIds: repeat.map((s) => s.id),
      goalsThatApply: goals.filter((g) => perGoal[g].length > base.length
        || perGoal[g].some((s) => base.indexOf(s) === -1)),
    };
  });

  return { router, subs, byId, pages, goals, names };
}

/** The registry sorted the way `PageRouter.plan` sorts it, before dependencies. */
function globalOrder(ctx, subs) {
  return subs.slice().sort((a, b) => {
    const pa = ctx.PageCategoryPriority[a.category];
    const pb = ctx.PageCategoryPriority[b.category];
    if (pa !== pb) return pb - pa;
    if ((a.order || 0) !== (b.order || 0)) return (b.order || 0) - (a.order || 0);
    return a.index - b.index;
  });
}

/**
 * Fold the per-goal queues into one listing.
 *
 * Filtering never reorders -- `plan` sorts the whole registry the same way every
 * time and then drops what does not apply -- so the union of the queues, taken
 * in the registry's own order, describes every one of them at once.
 * `verifySubsequences` is what holds that claim to account: if the topological
 * pass ever did reorder something between goals, the document would say so
 * instead of quietly picking one.
 */
function mergeOrders(canonical, queues) {
  const union = {};
  for (const queue of queues) {
    for (const sub of queue) union[sub.id] = true;
  }
  return canonical.filter((sub) => union[sub.id] === true);
}

/** Every per-goal queue must appear inside the merged listing, in order. */
function verifySubsequences(pages) {
  const broken = [];
  for (const page of pages) {
    const order = page.merged.map((s) => s.id);
    const check = (label, queue) => {
      let at = -1;
      for (const sub of queue) {
        const next = order.indexOf(sub.id);
        if (next <= at) {
          broken.push(page.name + ' / ' + label + ': ' + sub.id);
          return;
        }
        at = next;
      }
    };
    check('no goal', page.base);
    for (const goal of Object.keys(page.perGoal)) check('goal ' + goal, page.perGoal[goal]);
  }
  return broken;
}

function findings(data, ctx) {
  const errors = [];
  const notes = [];

  for (const sub of data.subs) {
    for (const dep of sub.after || []) {
      if (!data.byId[dep]) {
        errors.push('`' + sub.id + '` declares `after: [\'' + dep + '\']`, and no '
          + 'subscription has that id. Nothing will ever wait for it.');
      }
    }
  }

  for (const page of data.pages) {
    if (page.name === 'unknown') continue;
    // An entry only `matches()` answers with is never what the router lands on,
    // so a page with no other entry has no queue to speak of.
    const entries = Object.keys(ctx.Page).filter((k) => ctx.Page[k].name === page.name);
    if (entries.length > 0 && entries.every((k) => ctx.Page[k].targeted)) continue;
    // A guard or dismiss handler leaves the page before navigation gets a turn;
    // a navigate handler leaves it during one. Any of the three will do.
    const leaves = page.merged.filter((s) =>
      s.category === 'navigate' || s.category === 'guard' || s.category === 'dismiss');
    if (leaves.length === 0) {
      errors.push('`' + page.name + '` has no handler that can leave it -- nothing in the '
        + 'guard, dismiss or navigate band -- so `gPages.navigate()` would sit on it '
        + 'until the stall guard restarts the app.');
    }
    const acts = page.merged.filter((s) => s.category !== 'notify' && s.category !== 'observe');
    if (acts.length === 0) {
      notes.push('`' + page.name + '` is only observed and logged -- nothing acts on it.');
    }
  }

  const estimates = data.pages.filter((p) =>
    p.profile.kind === 'transient' && p.profile.measured !== true);
  for (const page of estimates) {
    notes.push('`' + page.name + '` is transient on an estimated duration ('
      + page.profile.durationMs + 'ms at ' + ctx.PageBaselineFps + 'fps), not a measured one.');
  }

  return { errors, notes };
}

// --- rendering -------------------------------------------------------------

function cell(text) {
  return String(text === undefined || text === null ? '' : text).replace(/\|/g, '\\|');
}

function table(headers, rows) {
  const out = ['| ' + headers.join(' | ') + ' |'];
  out.push('|' + headers.map(() => '---').join('|') + '|');
  for (const row of rows) out.push('| ' + row.map(cell).join(' | ') + ' |');
  return out.join('\n');
}

/** The one-line answer to "when does this fire", for the per-page tables. */
/**
 * One subscription's steps as a line, in the order they run.
 *
 * This is the half of a subscription that used to be a function body, so it is
 * the half a reader had to open the source for -- and with it the settle and
 * sleep budgets, which are the numbers a slow device is judged against.
 */
function describeSteps(sub) {
  const parts = (sub.steps || []).map((step) => {
    switch (step.do) {
      case 'tap': return 'tap `' + step.anchor + '`';
      case 'tapAt': return step.name
        ? 'tap `Button.' + step.name + '`'
        : 'tap (' + step.at.x + ', ' + step.at.y + ')';
      case 'settle': return 'settle ' + step.ms + 'ms';
      case 'sleep': return 'sleep ' + step.ms + 'ms';
      case 'waitOut': return 'wait the page out';
      case 'log': return 'log `' + step.event + '`';
      case 'call': return '`' + step.name + '()`';
      default: return step.do;
    }
  });
  return parts.join(' → ') || '—';
}

function when(sub, page) {
  const parts = [];
  parts.push(sub.every ? 'every look' : 'on arrival');
  if (sub.category === 'navigate') {
    parts.push(sub.goals ? 'goal ' + sub.goals.join(' or ') : 'any goal');
  }
  if (sub.pages === undefined) parts.push('wildcard');
  return parts.join(', ');
}

/**
 * The observed page graph.
 *
 * Measured, not declared. A hand-authored `PageTransitions` table was turned
 * down partly because it could not be validated; this is the data that would
 * validate one, harvested off a device and accumulated in
 * `docs/transitions.json`.
 *
 * Read it as a lower bound in both directions. An edge here is a transition that
 * really happened. A pair that is missing means only that no harvest has caught
 * it -- the on-device window is `pageHistoryDepth` visits deep and needs "Debug
 * game" on, so absence is not evidence.
 */
function sitemap(data, ctx, ledger) {
  const out = [];
  const sections = {};
  for (const n of data.names) sections[n.name] = n.section;
  const isInterrupt = (page) => sections[page] === 'Interruptions';
  const isGoal = (page) => data.goals.indexOf(page) !== -1;

  out.push('## The sitemap');
  out.push('');
  out.push('Which screen has been seen to follow which. **Measured, not declared** --');
  out.push('harvested off a device and accumulated in `docs/transitions.json`. Two');
  out.push('sources feed it: a recorded walkthrough, which carries the taps, and the');
  out.push('page-change frames `PageRouter.saveHistoryShot` leaves behind, which do not.');
  out.push('');

  if (ledger.transitions.length === 0) {
    out.push('_Nothing harvested yet._ Two ways to fill it in, and a harvest followed');
    out.push('by `npm run pages:docs` collects either:');
    out.push('');
    out.push('- **Turn on "Walkthrough recorder"** and drive the game by hand. Nothing else');
    out.push('  runs while it is on, and it records every screen, every tap on it and what');
    out.push('  followed -- so the edges come back knowing where you pressed.');
    out.push('- **Turn on "Debug game"** with **Page history depth** above zero and let the');
    out.push('  script work. That records page changes but not taps, and one pull sees only');
    out.push('  the last `pageHistoryDepth` visits, so it fills in over several runs.');
    out.push('');
    return out;
  }

  const seen = transitions.pagesSeen(ledger);
  const total = data.names.filter((n) => n.name !== 'unknown').length;
  out.push('`' + ledger.transitions.length + '` distinct transition(s) over `'
    + seen.length + '` of `' + total + '` pages, from `' + ledger.harvests
    + '` harvest(s), last ' + (ledger.updated || 'unknown') + '.');
  out.push('');

  if (ledger.transitions.length <= SitemapMaxEdges) {
    out.push('```mermaid');
    out.push('flowchart LR');
    for (const page of seen) {
      // Shape rather than colour, so it survives whichever theme renders this:
      // hexagon for an interruption, stadium for a navigation destination.
      const label = '"' + page + '"';
      if (isInterrupt(page)) out.push('  ' + page + '{{' + label + '}}');
      else if (isGoal(page)) out.push('  ' + page + '([' + label + '])');
      else out.push('  ' + page + '[' + label + ']');
    }
    for (const t of ledger.transitions) {
      out.push('  ' + t.from + ' -->|' + t.count + '| ' + t.to);
    }
    out.push('```');
    out.push('');
    out.push('Hexagons are interruptions, stadiums are `navigate()` destinations, and the');
    out.push('edge labels are how many times the pair has been observed.');
    out.push('');
    if (seen.indexOf('unknown') !== -1) {
      out.push('`unknown` is not a screen: it is where nothing in the table matched. An edge');
      out.push('through it marks a gap in *detection* rather than a route -- a screen with no');
      out.push('fingerprint, or one obscured while the game animates over it.');
      out.push('');
    }
  } else {
    out.push('_Too many edges to draw legibly (' + ledger.transitions.length + '); the table');
    out.push('below is the whole graph._');
    out.push('');
  }

  out.push('**An interruption can follow any page**, which is the reason this graph is a');
  out.push('map and not a filter. `RootDetection` is an Android dialog, and the two network');
  out.push('panels arrive whenever the connection does -- none of them is a successor of');
  out.push('anything in particular. Narrowing detection on a successor set would therefore');
  out.push('have to admit all of them at every node, which is most of what the narrowing');
  out.push('was for. `heartSweepPages()` (`src/pages.ts`, read off the roles each page');
  out.push('declares) is the shape that works instead: a list the one caller that knows its');
  out.push('own context passes in.');
  out.push('');

  const tapped = ledger.transitions.filter((t) => (t.taps || []).length !== 0).length;
  if (tapped !== 0) {
    out.push('The **by tapping** column comes from a recorded walkthrough (the');
    out.push('"Walkthrough recorder" setting), which notes where a finger went as well as');
    out.push('what followed. Positions are logical, rounded to 20px, most-used first. An');
    out.push('edge with none was never seen to be *caused* by a tap -- either nobody has');
    out.push('walked it yet, or it is one the screen takes on its own, which is the');
    out.push('difference between a route and a wait.');
    out.push('');
  }

  out.push(table(['from', 'to', 'seen', 'by tapping', 'first', 'last'],
    ledger.transitions.map((t) => [
      '`' + t.from + '`' + (isInterrupt(t.from) ? ' ⬡' : ''),
      '`' + t.to + '`' + (isInterrupt(t.to) ? ' ⬡' : ''),
      t.count,
      (t.taps || []).map((p) => '(' + p.x + ', ' + p.y + ')&nbsp;×' + p.n).join(' ') || '—',
      t.firstSeen,
      t.lastSeen,
    ])));
  out.push('');

  const unseen = data.names
    .filter((n) => n.name !== 'unknown' && seen.indexOf(n.name) === -1)
    .map((n) => '`' + n.name + '`');
  if (unseen.length) {
    out.push('### Not yet observed');
    out.push('');
    out.push('Pages the table can recognise that no harvest has caught at either end of a');
    out.push('transition. Absence of evidence: ' + unseen.join(', ') + '.');
    out.push('');
  }

  return out;
}

function render(data, ctx, found, ledger) {
  const router = data.router;
  const out = [];
  const fps = ctx.PageBaselineFps;

  out.push('# Page dispatch');
  out.push('');
  out.push('<!-- Generated by `npm run pages:docs`. Do not edit: every number below is');
  out.push('     read out of the built bundle, so a change here is lost on the next build');
  out.push('     and a change in `src/pageHandlers.ts` shows up here on its own. -->');
  out.push('');
  out.push('What the script does when it works out which screen is on display.');
  out.push('');
  out.push('`gPages` (src/pages.ts) detects the page, then broadcasts it to the');
  out.push('subscriptions registered in `src/pageHandlers.ts`. They run one at a time, in');
  out.push('the order below, and **the first one to touch the screen ends the round** --');
  out.push('everything after it would be acting on a frame that no longer exists.');
  out.push('');
  out.push('A subscription is a list of steps rather than a function body, so the **steps**');
  out.push('column below is the whole of what it does: which button, which wait, in what');
  out.push('order. `settle` is a ceiling and not a cost -- it ends when the screen stops');
  out.push('moving -- where `sleep` is spent in full, and is only used where there is no');
  out.push('still frame to wait for.');
  out.push('');
  out.push('`' + data.subs.length + '` subscriptions, `' + data.pages.length + '` pages, `'
    + data.goals.length + '` navigation destinations.');
  out.push('');

  // --- the pipeline ---
  out.push('## The pipeline');
  out.push('');
  out.push('```mermaid');
  out.push('flowchart TD');
  out.push('  detect["gPages.detect()<br/>score every Page entry, best wins"]');
  const ids = {};
  ctx.PageCategoryOrder.forEach((cat, i) => {
    ids[cat] = 'c' + i;
    const count = data.subs.filter((s) => s.category === cat).length;
    out.push('  ' + ids[cat] + '["<b>' + cat + '</b> &middot; priority '
      + ctx.PageCategoryPriority[cat] + '<br/>' + count + ' subscription'
      + (count === 1 ? '' : 's') + '"]');
  });
  out.push('  done(["caller gets the page name"])');
  out.push('  detect --> ' + ids[ctx.PageCategoryOrder[0]]);
  for (let i = 1; i < ctx.PageCategoryOrder.length; i++) {
    out.push('  ' + ids[ctx.PageCategoryOrder[i - 1]] + ' --> ' + ids[ctx.PageCategoryOrder[i]]);
  }
  out.push('  ' + ids[ctx.PageCategoryOrder[ctx.PageCategoryOrder.length - 1]] + ' --> done');
  // A Stop skips the rest of the acting bands and lands on notify, which runs
  // whatever happened: it records what was seen rather than acting on it.
  const notify = ids.notify;
  for (const cat of ctx.PageCategoryOrder) {
    if (cat === 'observe' || cat === 'record' || cat === 'notify') continue;
    out.push('  ' + ids[cat] + ' -. "one acted" .-> ' + notify);
  }
  out.push('```');
  out.push('');
  out.push('The first subscription to touch the screen ends the queue, and everything below');
  out.push('it is skipped -- it would be reading a frame that no longer exists. Which ones');
  out.push('touch it is the band\'s answer rather than each one\'s: **guard**, **dismiss**');
  out.push('and **navigate** act unless their `acts` declined. **notify** is the exception');
  out.push('and runs either way: it records what was seen rather than acting on what is');
  out.push('there.');
  out.push('');
  out.push(table(['band', 'priority', 'subscriptions', 'purpose'],
    ctx.PageCategoryOrder.map((cat) => [
      '**' + cat + '**',
      ctx.PageCategoryPriority[cat],
      data.subs.filter((s) => s.category === cat).length,
      ctx.PageCategoryPurpose[cat],
    ])));
  out.push('');
  out.push('Within a band the order is `order` descending, then registration order, then a');
  out.push('topological pass over `after`. A dependency that names a subscription which is');
  out.push('not in the same queue is satisfied vacuously: it did not run, and it was never');
  out.push('going to.');
  out.push('');

  // --- every subscription ---
  out.push('## Every subscription, in dispatch order');
  out.push('');
  const ordered = globalOrder(ctx, data.subs);
  out.push(table(['#', 'id', 'band', 'steps', 'order', 'pages', 'goals', 'fires', 'after'],
    ordered.map((sub, i) => [
      i + 1,
      '`' + sub.id + '`',
      sub.category,
      describeSteps(sub),
      sub.order || 0,
      sub.pages ? sub.pages.map((p) => '`' + p + '`').join(', ') : '_any_',
      sub.category !== 'navigate' ? '—' : (sub.goals ? sub.goals.join(', ') : '_any_'),
      sub.every ? 'every look' : 'on arrival',
      (sub.after || []).map((d) => '`' + d + '`').join(', ') || '—',
    ])));
  out.push('');
  out.push('### What each one is for');
  out.push('');
  for (const sub of ordered) {
    out.push('- **`' + sub.id + '`** — ' + sub.what);
  }
  out.push('');

  // --- dependencies ---
  const edges = [];
  for (const sub of data.subs) {
    for (const dep of sub.after || []) edges.push([dep, sub.id]);
  }
  out.push('## Declared dependencies');
  out.push('');
  if (edges.length === 0) {
    out.push('None. Every ordering currently in force comes from the band priorities.');
  } else {
    out.push('```mermaid');
    out.push('flowchart LR');
    for (const [from, to] of edges) {
      out.push('  ' + from.replace(/\W/g, '_') + '["' + from + '"] --> '
        + to.replace(/\W/g, '_') + '["' + to + '"]');
    }
    out.push('```');
    out.push('');
    out.push('These hold in addition to the band order, and outrank it: a subscription waits');
    out.push('for everything it declares, even one in a lower band.');
  }
  out.push('');

  // --- pages ---
  out.push('## How each page behaves');
  out.push('');
  out.push('Durations are wall-clock at ' + fps + 'fps. The game counts these windows in');
  out.push('frames, so `PageRouter.durationOf` scales them by the **Device frame rate**');
  out.push('setting -- the same page is up for half as long at ' + (fps * 2) + 'fps.');
  out.push('');
  out.push('`roles` is what the page is to the flows (`PageRole`, src/pages.ts): the lists');
  out.push('a flow hands the sweep as `expect` -- what a running round can be looking at,');
  out.push('what the heart sender can -- are read off these, so a page is in every list its');
  out.push('roles put it in and in no other.');
  out.push('');
  out.push(table(['page', 'kind', 'roles', 'at ' + fps + 'fps', 'at ' + (fps * 2) + 'fps', 'source', 'note'],
    data.pages.map((p) => [
      '`' + p.name + '`',
      p.profile.kind,
      (p.profile.roles || []).map((r) => '`' + r + '`').join(' ') || '—',
      p.profile.kind === 'transient' ? p.profile.durationMs + ' ms' : '—',
      p.profile.kind === 'transient' ? Math.round(p.profile.durationMs / 2) + ' ms' : '—',
      p.profile.kind !== 'transient' ? '—' : (p.profile.measured ? 'measured' : '**estimate**'),
      p.profile.note || '',
    ])));
  out.push('');

  // --- navigation ---
  out.push('## Navigation destinations');
  out.push('');
  out.push('`gPages.navigate(page)` polls until it is there. The navigate band only runs');
  out.push('inside it, and never on the destination itself.');
  out.push('');
  out.push(table(['destination', 'poll', 'hold budget', 'rest', 'startup wait', 'via'],
    data.goals.map((g) => {
      const plan = ctx.NavPlans[g];
      return [
        '`' + g + '`',
        plan.times + ' sweep(s), ' + plan.timeout + 'ms budget',
        plan.holdMs + ' ms',
        plan.restMs + ' ms',
        plan.startupWaitMs ? plan.startupWaitMs + ' ms' : '—',
        plan.via ? '`' + plan.via + '`' : '—',
      ];
    })));
  out.push('');

  // --- the observed graph ---
  for (const line of sitemap(data, ctx, ledger)) out.push(line);

  // --- per page dispatch ---
  out.push('## The queue, page by page');
  out.push('');
  out.push('Read a row as "this runs, unless something above it acted first".');
  out.push('');
  let section = null;
  for (const page of data.pages) {
    if (page.section && page.section !== section) {
      section = page.section;
      out.push('### ' + section);
      out.push('');
    }
    out.push('#### `' + page.name + '` <sub>' + page.profile.kind + '</sub>');
    out.push('');
    if (page.merged.length === 0) {
      out.push('_Nothing subscribes to this page._');
      out.push('');
      continue;
    }
    out.push(table(['#', 'subscription', 'band', 'when'],
      page.merged.map((sub, i) => [
        i + 1,
        '`' + sub.id + '`',
        sub.category,
        when(sub, page),
      ])));
    const repeats = page.merged.filter((s) => page.repeatIds.indexOf(s.id) !== -1).length;
    if (repeats !== page.merged.length) {
      out.push('');
      out.push('On a repeat look at the same page, ' + repeats + ' of these ' + page.merged.length
        + ' run: the rest fire only when the page changes.');
    }
    out.push('');
  }

  // --- findings ---
  out.push('## Findings');
  out.push('');
  if (found.errors.length === 0 && found.notes.length === 0) {
    out.push('Nothing to report.');
  }
  if (found.errors.length) {
    out.push('### Errors');
    out.push('');
    for (const e of found.errors) out.push('- ' + e);
    out.push('');
  }
  if (found.notes.length) {
    out.push('### Notes');
    out.push('');
    for (const n of found.notes) out.push('- ' + n);
    out.push('');
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

// --- entry point -----------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  const check = argv.includes('--check');
  const quiet = argv.includes('--quiet');

  ensureBuild(false);
  const { ctx } = createRuntime({ quiet: true, build: false });
  if (!ctx.gPages) {
    console.error('the built bundle has no gPages -- is src/pages.ts still in tsconfig.json?');
    process.exit(2);
  }

  const data = gather(ctx);
  const found = findings(data, ctx);

  const broken = verifySubsequences(data.pages);
  if (broken.length) {
    found.errors.push('The dispatch order is not the same for every navigation goal, so the '
      + 'merged tables below are approximate: ' + broken.join('; ') + '. This means a '
      + '`after` dependency is reordering a queue; give the subscriptions explicit '
      + '`order` values instead.');
  }

  const markdown = render(data, ctx, found, transitions.read());
  const current = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : null;

  if (check) {
    if (current !== markdown) {
      console.error('PAGE_DISPATCH.md is out of date. Run: npm run pages:docs');
      process.exit(1);
    }
  } else if (current !== markdown) {
    fs.writeFileSync(outFile, markdown);
    if (!quiet) console.log('wrote ' + path.relative(projectDir, outFile));
  } else if (!quiet) {
    console.log(path.relative(projectDir, outFile) + ' is up to date');
  }

  for (const note of found.notes) if (!quiet) console.log('note: ' + strip(note));
  for (const error of found.errors) console.error('error: ' + strip(error));
  if (found.errors.length) process.exit(1);
}

function strip(text) {
  return text.replace(/`/g, '').replace(/\*\*/g, '');
}

main();
