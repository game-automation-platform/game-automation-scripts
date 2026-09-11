// ---------------------------------------------------------------------------
// What the script is about to do, answered without doing any of it.
//
// Three questions, three layers, and they are three different things:
//
//   DISPATCH  which subscription is about to touch this frame, and what the
//             rest of the queue will get to do about it. `PageRouter.plan` is
//             already the exact ordered queue and is pure, so the only thing
//             missing was which entry ends it -- which is the band's answer
//             (`ForecastActingBands`, below) unless the entry declared a
//             condition (`acts`, globals.d.ts), and the dispatch reads both.
//   TASKS     which job the scheduler runs next, and when the rest come due.
//             `dueTasks` (taskController.ts) is the loop's own pick, reused
//             here rather than re-read, so this orders the set the way the loop
//             really would.
//   ROUTES    the ways off this screen, where each leads, and which of them
//             gets closer to where `navigate()` is going. The edges are
//             `PageRoutes` and `AnchorRoutes` in data.ts.
//
// ## What this is not
//
// It is not a successor filter. Nothing here is consulted by `sweep`, by
// `detect`, or by anything deciding what is on display -- read backwards, these
// edges turn a recognised screen into `Unknown`, which is OBSCURED_BOARD.md
// § The design that was rejected. Forward, a missing edge says "no route", which
// is loud, and that is the only direction used.
//
// It also predicts nothing about the game. "Expected next" here means *what the
// script intends*: the button it is about to press and where the table says that
// leads. Whether the game agrees is what `docs/transitions.json` records, and
// the detection suite's self-test is where the two are compared.
//
// ## Cost
//
// Debug-gated at the top of `forecastEmit`, and the heavy fields are thunks, so
// a run without debug logs pays one boolean per page change. With them on it
// pays one `plan()` -- a sort over ~12 registered subscriptions, no capture and
// no native crossing -- and only when the answer has actually changed, which is
// what `gForecastLast` is for: the play loop's liveness check calls `detect`
// several times a second on the same board, and a record per look would drown
// the file it is meant to explain.
// ---------------------------------------------------------------------------

/**
 * The bands whose subscriptions touch the screen unless they say otherwise.
 *
 * The one statement of the stop rule: `PageRouter.react` reads it to decide
 * which row ends the acting part of the queue, and `forecastWouldAct` reads it
 * to predict the same row. There is no per-row return value to disagree with.
 */
var ForecastActingBands: PageCategory[] = [
  PageCategory.Guard,
  PageCategory.Dismiss,
  PageCategory.Navigate
];

/** The route graph, built once from the static tables. */
var gForecastGraph: PageRouteMap | null = null;
/**
 * Distance to a goal for every page that can reach it, per goal.
 *
 * `| undefined` on the inner map is not decoration: "no declared route" is the
 * answer that matters here, so the absent key has to be a value the compiler
 * makes every reader handle.
 */
type ForecastDistances = { [page: string]: number | undefined };
var gForecastDistances: { [goal: string]: ForecastDistances | undefined } = {};
/** The last forecast emitted, so an unchanged one is not written again. */
var gForecastLast = '';

// --- layer 1: the dispatch queue -------------------------------------------

/**
 * Would this subscription touch the screen on this event?
 *
 * One that can decline says so with `acts`; everything else is answered by its
 * band. This is the dispatch's own rule rather than a guess about it -- `react`
 * (pages.ts) reads the same list -- so a prediction and what happens are the
 * same test run twice.
 */
function forecastWouldAct(sub: PageSubscriptionEntry, event: PageEvent): boolean {
  if (sub.acts !== undefined) {
    return sub.acts(event);
  }
  return ForecastActingBands.indexOf(sub.category) !== -1;
}

/**
 * The queue for this frame, each entry marked with what it is expected to do,
 * and the entry expected to act.
 *
 * The first handler expected to act ends the part of the queue that reads or
 * changes the screen -- `notify` still runs, exactly as `dispatch` does it. The
 * acting entry comes back whole rather than by id because what it `takes` is
 * how the route layer knows which edge is being used.
 */
function forecastSteps(event: PageEvent): {
  steps: ForecastStep[];
  actor: PageSubscriptionEntry | null;
} {
  const queue = gPages.plan(event.page, event.goal, event.changed);
  const steps: ForecastStep[] = [];
  let actor: PageSubscriptionEntry | null = null;
  for (let i = 0; i < queue.length; i++) {
    const sub = queue[i];
    let outcome: ForecastOutcome;
    if (actor !== null) {
      outcome = sub.category === PageCategory.Notify ? 'passes' : 'skipped';
    } else if (forecastWouldAct(sub, event)) {
      outcome = 'acts';
      actor = sub;
    } else {
      outcome = 'passes';
    }
    steps.push({ id: sub.id, category: sub.category, outcome: outcome });
  }
  return { steps: steps, actor: actor };
}

// --- layer 2: the scheduler ------------------------------------------------

function forecastTaskRow(task: Task, at: number): ForecastTask {
  return {
    name: task.name,
    // A task that has never run has `lastRunTime` 0, which would price its due
    // time from the epoch -- fifty-odd years overdue rather than due now. Zero,
    // as `logAddHeartTally` reports the same case.
    dueInMs: task.lastRunTime === 0 ? 0 : task.lastRunTime + task.interval - at,
    intervalMs: task.interval,
    priority: task.priority
  };
}

/**
 * The task set, in the order the loop would take it.
 *
 * Due tasks first, in the loop's own order (`dueTasks`: priority, then name),
 * then everything else by when it comes due, ties by name -- so two readings
 * of the same state print the same list.
 */
function forecastTasks(now?: number): ForecastTask[] {
  const controller = gTaskController;
  if (controller === undefined) {
    return [];
  }
  const at = now === undefined ? Date.now() : now;
  const due = controller.dueTasks(at);
  const later: Task[] = [];
  for (const name in controller.tasks) {
    const task = controller.tasks[name];
    if (due.indexOf(task) === -1) {
      later.push(task);
    }
  }
  later.sort(function(a, b) {
    const gap = (a.lastRunTime + a.interval) - (b.lastRunTime + b.interval);
    if (gap !== 0) {
      return gap;
    }
    return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
  });
  const out: ForecastTask[] = [];
  for (let i = 0; i < due.length; i++) {
    out.push(forecastTaskRow(due[i], at));
  }
  for (let i = 0; i < later.length; i++) {
    out.push(forecastTaskRow(later[i], at));
  }
  return out;
}

// --- layer 3: the route graph ----------------------------------------------

/**
 * Where an anchor is on this entry, or undefined when it does not carry one.
 *
 * A switch rather than an index, so the anchor names and `PageDef`'s fields are
 * checked against each other instead of agreeing by luck.
 */
function forecastAnchorAt(def: PageDef, anchor: string): Coord | undefined {
  switch (anchor) {
    case PageAnchor.Back: return def.back;
    case PageAnchor.Next: return def.next;
    case PageAnchor.Tsums: return def.tsums;
    case PageAnchor.Store: return def.store;
    case PageAnchor.Mail: return def.mail;
    case PageAnchor.Home: return def.home;
    default: return undefined;
  }
}

/**
 * The static graph: every page, and every edge out of it the tree can name.
 *
 * Anchor edges come off the `Page` table, so an anchor added to an entry is an
 * edge added here. Built once -- the tables are static -- and used only to
 * measure distance to a goal, never to decide what is on screen.
 */
function forecastGraph(): PageRouteMap {
  if (gForecastGraph !== null) {
    return gForecastGraph;
  }
  const graph: PageRouteMap = {};
  const add = function(from: string, route: PageRoute): void {
    const edges = graph[from];
    if (edges === undefined) {
      graph[from] = [route];
      return;
    }
    const key = forecastRouteKey(route);
    for (let i = 0; i < edges.length; i++) {
      if (forecastRouteKey(edges[i]) === key) {
        return;   // variants of one page share their anchors
      }
    }
    edges.push(route);
  };

  for (const key in Page) {
    const def = (Page as PageMap)[key];
    for (const anchor in AnchorRoutes) {
      if (forecastAnchorAt(def, anchor) !== undefined) {
        add(def.name, AnchorRoutes[anchor]);
      }
    }
  }
  for (const page in PageRoutes) {
    const declared = PageRoutes[page];
    for (let i = 0; declared !== undefined && i < declared.length; i++) {
      add(page, declared[i]);
    }
  }
  // The board is left with nothing pressed. `roundOverPages()` is what the play
  // loop takes as a round's end, read off the roles each page declares;
  // expanding it here rather than repeating it in `PageRoutes` is what keeps
  // the two from drifting.
  const ends = roundOverPages();
  for (let i = 0; i < ends.length; i++) {
    add(PageName.GamePlaying, {
      via: '', to: ends[i], source: RouteSource.Handler
    });
  }

  gForecastGraph = graph;
  return graph;
}

/**
 * How many edges each page is from `goal`.
 *
 * One reverse breadth-first walk from the destination, so every page is
 * answered at once and the answer is cached per goal. A page absent from the
 * result has no declared route there at all -- which is the loud failure the
 * forward direction is worth having.
 */
function forecastDistances(goal: PageName | ''): ForecastDistances {
  if (goal === '') {
    return {};
  }
  const cached = gForecastDistances[goal];
  if (cached !== undefined) {
    return cached;
  }
  const graph = forecastGraph();
  const inbound: { [to: string]: string[] | undefined } = {};
  for (const from in graph) {
    const edges = graph[from];
    for (let i = 0; edges !== undefined && i < edges.length; i++) {
      const to = edges[i].to;
      if (to === undefined) {
        continue;
      }
      const preds = inbound[to];
      if (preds === undefined) {
        inbound[to] = [from];
      } else {
        preds.push(from);
      }
    }
  }
  const dist: ForecastDistances = {};
  dist[goal] = 0;
  let frontier: string[] = [goal];
  let depth = 0;
  while (frontier.length > 0) {
    depth++;
    const next: string[] = [];
    for (let i = 0; i < frontier.length; i++) {
      const preds = inbound[frontier[i]];
      for (let p = 0; preds !== undefined && p < preds.length; p++) {
        if (dist[preds[p]] === undefined) {
          dist[preds[p]] = depth;
          next.push(preds[p]);
        }
      }
    }
    frontier = next;
  }
  gForecastDistances[goal] = dist;
  return dist;
}

/** The screens between here and `goal`, this one first. Empty when there is no route. */
function forecastPath(from: PageName, goal: PageName | ''): PageName[] {
  if (goal === '') {
    return [];
  }
  if (from === goal) {
    return [from];
  }
  const dist = forecastDistances(goal);
  let hops = dist[from];
  if (hops === undefined) {
    return [];
  }
  const graph = forecastGraph();
  const path: PageName[] = [from];
  let at: string = from;
  while (at !== goal) {
    const edges = graph[at];
    let step: PageName | undefined;
    for (let i = 0; edges !== undefined && i < edges.length && step === undefined; i++) {
      const to = edges[i].to;
      if (to !== undefined && dist[to] === hops - 1) {
        step = to;
        hops--;
      }
    }
    if (step === undefined) {
      return [];    // unreachable given the distances, but a loop is worse
    }
    path.push(step);
    at = step;
  }
  return path;
}

/**
 * The ways off the screen that is up, best first.
 *
 * Reads the matched entry rather than the graph where it can, so the anchor
 * coordinates are the ones the tap would really use -- variants of one page put
 * the same button in different places. The fallback `back` is included with no
 * destination when nothing declares one, because that is exactly what
 * `nav.move.back` is about to press.
 */
function forecastRoutes(event: PageEvent): ForecastRoute[] {
  const dist = forecastDistances(event.goal);
  const here = dist[event.page];
  const out: ForecastRoute[] = [];
  const seen: { [via: string]: boolean } = {};

  const take = function(route: PageRoute, at: Coord | undefined): void {
    const key = forecastRouteKey(route);
    if (seen[key]) {
      return;
    }
    seen[key] = true;
    const to = route.to;
    const reach = to === undefined ? undefined : dist[to];
    out.push({
      via: route.via,
      to: to,
      source: route.source,
      at: at,
      advances: reach !== undefined && (here === undefined || reach < here)
    });
  };

  const declared = PageRoutes[event.page];
  for (let i = 0; declared !== undefined && i < declared.length; i++) {
    const route = declared[i];
    const at = event.def === null ? undefined : forecastAnchorAt(event.def, route.via);
    // A per-page row naming an anchor only applies to an entry that carries it.
    if (at === undefined && event.def !== null && AnchorRoutes[route.via] !== undefined) {
      continue;
    }
    take(route, at);
  }
  if (event.def !== null) {
    for (const anchor in AnchorRoutes) {
      const at = forecastAnchorAt(event.def, anchor);
      if (at !== undefined) {
        take(AnchorRoutes[anchor], at);
      }
    }
    // What `nav.move.back` will press when nothing above claimed the screen.
    take({ via: PageAnchor.Back, source: RouteSource.Anchor }, event.def.back);
  }
  if (event.page === PageName.GamePlaying) {
    const ends = roundOverPages();
    for (let i = 0; i < ends.length; i++) {
      take({ via: '', to: ends[i], source: RouteSource.Handler }, undefined);
    }
  }

  out.sort(function(a, b) {
    if (a.advances !== b.advances) {
      return a.advances ? -1 : 1;
    }
    return forecastSourceRank(a.source) - forecastSourceRank(b.source);
  });
  return out;
}

/**
 * What makes two edges the same edge.
 *
 * One press is one row, however many `Page` entries draw the button -- so a
 * pressed edge is keyed by its button. The screens a page leaves to on its own
 * (`via: ''`) are not presses and there are five of them, so those are keyed by
 * where they land.
 */
function forecastRouteKey(route: PageRoute): string {
  return route.via === '' ? '>' + route.to : route.via;
}

/** Believability, for ordering: what the code does beats what someone wrote down. */
function forecastSourceRank(source: RouteSource): number {
  if (source === RouteSource.Handler) { return 0; }
  return source === RouteSource.Anchor ? 1 : 2;
}

// --- all three, and the record ---------------------------------------------

/** Everything knowable about the next move, for one detected frame. */
function forecastNow(event: PageEvent): Forecast {
  const queue = forecastSteps(event);
  const routes = forecastRoutes(event);
  const actor = queue.actor;
  // The join: the acting handler names the edge it takes, so "expected next" is
  // the destination of *that* edge rather than of whichever route happened to
  // sort first. On a screen with two ways out those are different answers.
  let intent: ForecastRoute | null = null;
  const takes = actor === null ? undefined : actor.takes;
  for (let i = 0; takes !== undefined && i < routes.length && intent === null; i++) {
    if (routes[i].via === takes) {
      intent = routes[i];
    }
  }
  return {
    steps: queue.steps,
    actor: actor === null ? '' : actor.id,
    tasks: forecastTasks(),
    routes: routes,
    intent: intent,
    previous: event.previous,
    page: event.page,
    goal: event.goal,
    path: forecastPath(event.page, event.goal)
  };
}

/**
 * Write the forecast, when there is anything new to say.
 *
 * `stoppedBy` rides along because by the time the notify band runs it is known,
 * which makes every record its own check: the handler that was expected to act
 * and the one that did are both on the line, so a wrong `acts` shows up in the
 * log rather than in a viewer nobody cross-references.
 */
function forecastEmit(event: PageEvent): void {
  // The same gate `logDebug` applies, hoisted so nothing below is built either.
  // The signature is cheap but `plan()` is not free, and the play loop asks what
  // is on screen several times a second.
  if (!Config.debugLogs) {
    return;
  }
  const forecast = forecastNow(event);
  const next = forecast.intent;
  const signature = forecast.page + '|' + forecast.goal + '|' + forecast.actor
      + '|' + (next === null ? '' : next.via) + '|' + event.stoppedBy;
  if (signature === gForecastLast) {
    return;
  }
  gForecastLast = signature;

  logDebug(Log.Forecast.State, {
    page: forecast.page,
    previous: forecast.previous,
    goal: forecast.goal === '' ? undefined : forecast.goal,
    actor: forecast.actor === '' ? undefined : forecast.actor,
    stoppedBy: event.stoppedBy === '' ? undefined : event.stoppedBy,
    nextVia: next === null ? undefined : next.via,
    nextPage: next === null ? undefined : next.to,
    // Thunks: nothing below is built unless the record is really emitted.
    steps: function() { return forecast.steps; },
    tasks: function() { return forecast.tasks; },
    routes: function() { return forecast.routes; },
    intent: function() { return forecast.intent === null ? undefined : forecast.intent; },
    path: function() { return forecast.path; }
  });
}
