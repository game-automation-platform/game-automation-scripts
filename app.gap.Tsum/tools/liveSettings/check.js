// Checks the live-settings contract: when each setting reaches a run in
// progress, and whether the code agrees with what it says it does.
//
//   npm run live:check
//
// ## Why this exists
//
// Three bugs, all the same bug. The Box Buying rows had no `case` in
// `quickBarApplyOne` and so did nothing until the script was restarted. Twelve
// of the rows a preset carries had none either, and `applyLiveSettings` dropped
// them in silence -- a preset built around a skill arrived without the bubble
// strategy that makes it work. And the skill, 5>4 and the Lorcana card had a
// case when they should not have: written onto a board already dealt they left
// the play loop reading it as something it is not.
//
// What none of the three had was a written-down answer to *when does this reach
// a run?* `LiveSettings` (src/quickbar.ts) is that answer, one entry per
// setting, and this checks the answer against the behaviour.
//
// ## How it checks
//
// By running the real built bundle in a vm and driving it, not by reading it.
// A parse would only prove the `case` labels exist; this proves the switch
// takes the key, that `quickBarState` reports it, that the value survives the
// round trip, and that a `NextRound` key really does leave the world alone. The
// only things parsed are two flat literals -- `SettingKey` in `src/shared.d.ts`
// and `SHARE_SLOTS` in `src/settings.ts` -- because both are const enums by the
// time they reach the bundle, so the names are gone from it.
//
// Eight checks:
//
//   declared   every row a preset carries (`SHARE_SLOTS`) is in `LiveSettings`
//   switch     `Now`/`NextRound` keys have a case, `Restart` keys have none,
//              and no key outside the table has one
//   reported   `quickBarState` reports every `Now`/`NextRound` key and no other
//              setting -- the invariant the settings page depends on, since it
//              pushes back what it cannot see
//   roundtrip  what the apply says it took is what the state reports. This is
//              the one that catches a unit conversion: `skillWaitingTime` is
//              seconds on the form and `ts.skillInterval` is ms, so a state
//              line that forgot to divide would have the panel and the run
//              trade values forever
//   timing     a `NextRound` key changes nothing outside `pendingSettings`
//              until `quickBarApplyPending`; a `Now` key changes the world at
//              once. Structural, so it needs no per-key knowledge: every live
//              case writes a primitive on `ts` or on `Config`
//   stable     a held key reports the same value before and after the whistle.
//              `quickBarSetAside` does not clamp -- a range lives in its `case`
//              -- so a held key with one would show the pages a value the
//              switch then quietly changed under them
//   whistle    the play loop still calls `quickBarApplyPending`. The one thing
//              here that is read rather than run, because running it would mean
//              a round: without that call every held setting would be set aside
//              and never applied, and every check above would still pass
//   entry      no page entry point calls `sleep()` or a touch injector. Those
//              are the host's pause gate, and a page only ever evaluates these
//              while the run is paused -- on the service thread that also reads
//              the Resume. Driven back to back on purpose, because the bug this
//              caught (0.12) only showed on the second log line
//
// ## What it cannot decide
//
// *Which* of the three a setting is. That is a judgement -- does a pass read
// this during a round, against a board dealt before the change? -- and this
// only enforces that the judgement was made and that the code matches it. The
// table is where it is recorded, which is what makes it reviewable at all.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRuntime, projectDir } = require('../runtime/load');

/** The three `LiveWhen` values. A const enum, so the bundle has only these. */
const NOW = 'now';
const NEXT_ROUND = 'nextRound';
const RESTART = 'restart';
const KINDS = [NOW, NEXT_ROUND, RESTART];

const problems = [];
const fail = (check, message) => { problems.push(check + ': ' + message); };

// --- the two literals the bundle no longer carries -------------------------

/** `SettingKey`'s members, name -> value. Its const enum is gone by build time. */
function readSettingKeys() {
  const source = fs.readFileSync(path.join(projectDir, 'src', 'shared.d.ts'), 'utf8');
  const block = /const enum SettingKey \{([\s\S]*?)\n\}/.exec(source);
  if (block === null) {
    throw new Error('SettingKey not found in src/shared.d.ts');
  }
  const keys = {};
  const member = /^\s*([A-Za-z0-9_]+)\s*=\s*'([^']+)'/gm;
  let found;
  while ((found = member.exec(block[1])) !== null) {
    keys[found[1]] = found[2];
  }
  // Silence is not success: an empty parse would pass every check below.
  if (Object.keys(keys).length < 20) {
    throw new Error('parsed only ' + Object.keys(keys).length + ' SettingKey members');
  }
  return keys;
}

/** The rows a settings code -- and so a preset -- carries. Skips retired slots. */
function readShareSlots(keys) {
  const source = fs.readFileSync(path.join(projectDir, 'src', 'settings.ts'), 'utf8');
  const block = /var SHARE_SLOTS[^=]*=\s*\[([\s\S]*?)\n\];/.exec(source);
  if (block === null) {
    throw new Error('SHARE_SLOTS not found in src/settings.ts');
  }
  const slots = [];
  const member = /SettingKey\.([A-Za-z0-9_]+)/g;
  let found;
  while ((found = member.exec(block[1])) !== null) {
    const value = keys[found[1]];
    if (value === undefined) {
      throw new Error('SHARE_SLOTS names SettingKey.' + found[1] + ', which does not exist');
    }
    slots.push(value);
  }
  if (slots.length < 10) {
    throw new Error('parsed only ' + slots.length + ' share slots');
  }
  return slots;
}

// --- a world to drive ------------------------------------------------------

// `--no-build` is the build calling this: it has just compiled, and a second
// tsc racing the steps beside it can leave a half-written file in `build/`.
const { ctx } = createRuntime({ build: process.argv.indexOf('--no-build') < 0 });
const run = (code) => vm.runInContext(code, ctx);

/**
 * A run in the middle of a round, fresh each time.
 *
 * Fresh because the checks below mutate it on purpose, and `Config` with it --
 * two live cases write there rather than onto `ts`.
 *
 * The three fields `buildRun` assigns rather than the constructor are seeded
 * here for the same reason it does: `JSON.stringify` drops an undefined, so a
 * `quickBarState` line reading one would go missing from the reply rather than
 * report it, and the `reported` check would call that a missing line.
 */
function newWorld() {
  run(`
    ts = new Tsum(false, false, LogsEn);
    ts.isRunning = true;
    ts.settings = {};
    ts.bonus5to4 = false;
    ts.receiveSecondItem = false;
    ts.tsumAppRestartFrequency = 0;
    gRunActive = true;
    Config.maxChain = 12;
    Config.linkReach = 1.9;
  `);
}

const state = () => JSON.parse(run('quickBarState()'));

/** Every primitive on `ts` and on `Config`: the world a live case can write. */
function snapshot() {
  return run(`(function () {
    var out = {};
    for (var k in ts) { if (ts[k] !== Object(ts[k])) { out['ts.' + k] = ts[k]; } }
    for (var c in Config) { if (Config[c] !== Object(Config[c])) { out['Config.' + c] = Config[c]; } }
    return JSON.stringify(out);
  })()`);
}

function changedSince(before) {
  const was = JSON.parse(before);
  const now = JSON.parse(snapshot());
  return Object.keys(now).filter((k) => now[k] !== was[k]);
}

/** Applies one key, with the hold either honoured or bypassed. */
function apply(key, value, atRoundStart) {
  ctx.__probeKey = key;
  ctx.__probeValue = value;
  return run('quickBarApplyOne(ts, __probeKey, __probeValue, '
    + (atRoundStart ? 'true' : 'false') + ')');
}

/**
 * A value this key can take that is not the one it holds.
 *
 * Typed off what the state reports rather than off the settings schema, which
 * is the settings page's compilation and not loadable here. A number is nudged
 * either way so a row already at its ceiling still moves.
 */
function otherValue(key, current) {
  if (typeof current === 'boolean') {
    return !current;
  }
  if (typeof current === 'number') {
    return { up: current + 1, down: current - 1 };
  }
  return 'live-check-probe';
}

// --- the checks ------------------------------------------------------------

function main() {
  const keys = readSettingKeys();
  const slots = readShareSlots(keys);
  const every = Object.keys(keys).map((name) => keys[name]);

  newWorld();
  const table = run('LiveSettings');
  const declared = Object.keys(table);

  for (const key of declared) {
    if (KINDS.indexOf(table[key]) < 0) {
      fail('declared', key + ' is "' + table[key] + '", which is not a LiveWhen value');
    }
    if (every.indexOf(key) < 0) {
      fail('declared', key + ' is not a SettingKey');
    }
  }
  const live = declared.filter((k) => table[k] === NOW || table[k] === NEXT_ROUND);
  const held = declared.filter((k) => table[k] === NEXT_ROUND);

  // 1. Every row a preset carries has an answer.
  for (const slot of slots) {
    if (declared.indexOf(slot) < 0) {
      fail('declared', slot + ' is a share slot -- a preset carries it -- but LiveSettings'
        + ' does not say when it reaches a run. Add it as now, nextRound or restart.');
    }
  }

  // 2. The switch agrees. `atRoundStart` bypasses the hold, so this measures
  //    the switch itself rather than the table twice over.
  for (const key of every) {
    newWorld();
    const handled = apply(key, false, true) !== undefined;
    const shouldHandle = live.indexOf(key) >= 0;
    if (handled && !shouldHandle) {
      fail('switch', key + ' has a case in quickBarApplyOne but LiveSettings says '
        + (declared.indexOf(key) < 0 ? 'nothing about it' : '"' + table[key] + '"'));
    }
    if (!handled && shouldHandle) {
      fail('switch', key + ' is declared "' + table[key]
        + '" but quickBarApplyOne has no case for it, so it is dropped in silence');
    }
  }

  // 3. Anything the switch can take, quickBarState has to report.
  newWorld();
  const reported = state();
  for (const key of live) {
    if (!(key in reported)) {
      fail('reported', key + ' can be applied but quickBarState does not report it, so the'
        + ' settings page would push its own stale value back over it at the next save');
    }
  }
  for (const key of Object.keys(reported)) {
    if (every.indexOf(key) >= 0 && live.indexOf(key) < 0) {
      fail('reported', key + ' is reported but cannot be applied');
    }
  }

  // 4. What the apply says it took is what the state reports.
  for (const key of live) {
    newWorld();
    const current = state()[key];
    const probe = otherValue(key, current);
    for (const value of (typeof probe === 'object' ? [probe.up, probe.down] : [probe, current])) {
      newWorld();
      const applied = apply(key, value);
      const shown = state()[key];
      if (shown !== applied) {
        fail('roundtrip', key + ': the apply took ' + JSON.stringify(applied)
          + ' and quickBarState reports ' + JSON.stringify(shown)
          + ' -- the settings page reads that back, so the two would never settle');
      }
    }
  }

  // 5. A held key leaves the world alone until the whistle; a live one does not.
  for (const key of live) {
    newWorld();
    const current = state()[key];
    const probe = otherValue(key, current);
    const value = typeof probe === 'object' ? probe.up : probe;
    const before = snapshot();
    const applied = apply(key, value);
    // A number already at its ceiling comes back unchanged; nudge the other way
    // rather than calling a case that wrote nothing a case that cannot write.
    const moved = applied !== current ? applied : apply(key, probe.down);
    const changed = changedSince(before);
    if (held.indexOf(key) >= 0) {
      if (changed.length > 0) {
        fail('timing', key + ' is declared nextRound but writing it moved '
          + changed.join(', ') + ' -- the round in front of the loop was dealt'
          + ' under the old value');
      }
      const shownWhileHeld = state()[key];
      run('quickBarApplyPending(ts)');
      if (changedSince(before).length === 0) {
        fail('timing', key + ' is set aside and the whistle then writes nothing:'
          + ' quickBarApplyPending never applies it');
      }
      // The set-aside path does not clamp -- a range lives in one `case` each --
      // so a held key with a range would show one value while it waits and
      // another once the switch has had it. Both pages have already drawn the
      // first by then.
      if (state()[key] !== shownWhileHeld) {
        fail('stable', key + ' showed ' + JSON.stringify(shownWhileHeld)
          + ' while it was held and ' + JSON.stringify(state()[key])
          + ' after the whistle -- the pages drew the first one. Its case clamps or'
          + ' coerces in a way quickBarSetAside does not.');
      }
    } else if (changed.length === 0 && moved !== current) {
      fail('timing', key + ' is declared now, and applying ' + JSON.stringify(moved)
        + ' over ' + JSON.stringify(current) + ' changed nothing on ts or Config');
    }
  }

  // 6. The whistle is still wired to the play loop. Read rather than run: the
  //    call sits inside `playRound`, which needs a board in front of it.
  const loop = fs.readFileSync(path.join(projectDir, 'src', 'play.ts'), 'utf8');
  if (loop.indexOf('quickBarApplyPending(this)') < 0) {
    fail('whistle', 'src/play.ts no longer calls quickBarApplyPending(this), so every'
      + ' nextRound setting would be set aside and never applied. It belongs in'
      + ' playRound, before the walk that opens the pre-round screen.');
  }

  // 7. A page entry point never parks. The host gates `sleep()` and the touch
  //    injectors while the run is paused, and the pages evaluate these *only*
  //    while it is paused -- so a gated call here is a call that waits on the
  //    Resume queued behind it. `onPause` is left out: it taps by design, and
  //    the host lets that one evaluation through the gate.
  //
  //    Each is driven twice in one evaluation. The logger's spacing sleep only
  //    fired on a second line inside 10ms, which is exactly what a preset (its
  //    own line, then the apply's) and the skill sheet (the pick, then what it
  //    `enables`) produce.
  const gated = ['sleep', 'tap', 'tapDown', 'tapUp', 'moveTo', 'swipe'];
  const parked = [];
  const natives = {};
  for (const name of gated) {
    natives[name] = ctx[name];
    ctx[name] = (...args) => { parked.push(name); return natives[name](...args); };
  }
  const flipped = () => {
    const values = state();
    const out = {};
    for (const key of live) {
      const other = otherValue(key, values[key]);
      out[key] = typeof other === 'object' ? other.up : other;
    }
    return JSON.stringify(out);
  };
  newWorld();
  const preset = flipped();
  const entries = [
    ['quickBarState(); quickBarState()', (r) => JSON.parse(r).active === true],
    ['quickBarApply("skillType", "live-check-probe"); quickBarApply("lorcanaCard", true)',
      (r) => JSON.parse(r).ok === true],
    ['applyLiveSettings(' + preset + '); applyLiveSettings({})', (r) => r === 'nothing to apply'],
    ['applyLiveSettings(' + preset + ')', (r) => /^applied /.test(r)],
    ['ts.nextRoundAt = Date.now() + 60000; roundDelaySkip(); roundDelaySkip()',
      (r) => r === 'nothing waiting'],
    // Both pages have a Report button and the host's Log chip reaches the same
    // name, so it is a page entry point like the rest. The answer is the report
    // id, which always opens with the UTC stamp report.ts builds it from.
    ['reportIssue("liveCheck", ""); reportIssue("liveCheck", "")',
      (r) => /^\d{8}-\d{6}-/.test(r)],
  ];
  for (const [code, answered] of entries) {
    newWorld();
    parked.length = 0;
    const result = run(code);
    if (!answered(result)) {
      fail('entry', code + ' answered ' + JSON.stringify(result) + ', so this check drove nothing');
    }
    if (parked.length > 0) {
      fail('entry', code + ' called ' + parked.join(', ') + ' -- on the host that is the'
        + ' pause gate, and a page evaluates this while the run is paused, on the thread'
        + ' that reads the Resume. It would wait on itself.');
    }
  }
  for (const name of gated) {
    ctx[name] = natives[name];
  }

  const counts = KINDS.map((kind) =>
    declared.filter((k) => table[k] === kind).length + ' ' + kind);
  console.log('live settings: ' + declared.length + ' declared (' + counts.join(', ')
    + '), ' + slots.length + ' share slots, ' + Object.keys(keys).length + ' setting keys');
  if (problems.length === 0) {
    console.log('the table, the switch, the state, the whistle and the entry points all agree.');
    return 0;
  }
  console.log('');
  for (const problem of problems) {
    console.log('  ' + problem);
  }
  console.log('\n' + problems.length + ' problem(s). See LiveSettings in src/quickbar.ts.');
  return 1;
}

process.exit(main());
