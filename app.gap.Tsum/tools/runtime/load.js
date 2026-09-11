// Loads the real, built game bundle into a Node vm context wired to the host
// shim, so the harness exercises production `PageRouter.sweep` rather than a copy
// of it.
//
// This works because of how the bundle is built: `module: none` + `outFile` in
// tsconfig.json concatenates every source file into one classic script with
// everything at top level, so `Page`, `Config`, `absColor` and friends land as
// properties of the context's global object. If the build ever moves to a real
// bundler it has to keep exposing those as globals or this loader breaks.
//
// `var` and `function` declarations become properties of the global object;
// `class`, `let` and `const` do not -- they are lexical bindings on the global
// environment's declarative record. Both are reachable *by name* from a later
// script in the same realm, which is why the device is indifferent: everything
// the settings bridge calls through `runScript` (`start`, `stop`) is a
// function declaration, and the bundle resolves its own
// names internally either way. Only this loader cares, because it reads the
// names off the context object -- so `LexicalGlobals` below are republished as
// properties after evaluation. This mattered from the moment `target` went from
// ES5 (where `class` downlevelled to `var`) to ES2023.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const { createHost } = require('./host');

const projectDir = path.resolve(__dirname, '..', '..');
const bundlePath = path.join(projectDir, 'build', 'index.js');
const srcDir = path.join(projectDir, 'src');

/** Fields that describe where the game sits inside the captured frame. */
const GeometryKeys = [
  'originScreenWidth', 'originScreenHeight',
  'screenWidth', 'screenHeight',
  'gameOffsetX', 'gameOffsetY', 'gameWidth', 'gameHeight',
  'captureGameRatio', 'resizeRatio',
  'playOffsetX', 'playOffsetY', 'playWidth', 'playHeight',
  'playResizeWidth', 'playResizeHeight',
];

function newestSourceMtime() {
  let newest = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(entry.name)) {
        const m = fs.statSync(p).mtimeMs;
        if (m > newest) newest = m;
      }
    }
  };
  walk(srcDir);
  return newest;
}

/** Recompile the game bundle when a source file is newer than it. */
function ensureBuild(force) {
  const stale = force
    || !fs.existsSync(bundlePath)
    || fs.statSync(bundlePath).mtimeMs < newestSourceMtime();
  if (!stale) return false;
  // `shell: true` on Windows: node >=20 refuses to spawnSync a .cmd shim
  // directly (EINVAL), and npx is a .cmd there.
  execFileSync('npx', ['tsc'], {
    cwd: projectDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  return true;
}

/**
 * Top-level `class` declarations in the bundle, which are lexical rather than
 * properties of the global object. Kept as an explicit list so a new one that
 * the harness needs fails loudly here rather than as `undefined is not a
 * constructor` somewhere downstream.
 */
const LexicalGlobals = ['Tsum', 'TsumTaskController', 'PageRouter', 'FeverWatcher'];

/**
 * Build (if stale), then evaluate the bundle against a fresh host shim.
 * Returns the vm context and the host handle so callers can drive both.
 */
function createRuntime(options) {
  const opts = options || {};
  if (opts.build !== false) ensureBuild(opts.forceBuild);

  // `opts.bundlePath` runs the harness against a bundle other than the one tsc
  // just wrote -- which is how tools/minify/minify.js checks that the minified
  // dist/index.js still has the globals the device reaches by name.
  const from = opts.bundlePath || bundlePath;
  const host = createHost(opts);
  const sandbox = Object.assign({}, host.globals);
  const ctx = vm.createContext(sandbox);
  const source = fs.readFileSync(from, 'utf8');
  vm.runInContext(source, ctx, { filename: path.relative(projectDir, from) });

  // Republish the lexical bindings as properties. This runs as a second script
  // in the same context, which is exactly how the device would reach them, so
  // it is reading the real bindings rather than reconstructing anything.
  const missing = LexicalGlobals.filter(
    (name) => !vm.runInContext('typeof ' + name + ' !== "undefined"', ctx));
  if (missing.length) {
    throw new Error('bundle is missing expected globals: ' + missing.join(', '));
  }
  vm.runInContext(
    LexicalGlobals.map((name) => 'globalThis.' + name + ' = ' + name + ';').join(''),
    ctx, { filename: 'load.js:publish-lexical-globals' });

  // The bundle's own debug()/log() are gated on this; keep evals quiet unless
  // the caller explicitly wants the chatter.
  if (ctx.Config) ctx.Config.debugLogs = !!opts.debugLogs;

  return { ctx, host, bundlePath: from };
}

/**
 * A Tsum positioned for one captured frame.
 *
 * Geometry is the part a screenshot cannot carry on its own: `toResizeXY`
 * depends on captureGameRatio / gameOffsetX / gameOffsetY / resizeRatio, and on
 * special screen ratios gameOffsetY comes from `detectOffsetYInGame()`, which
 * needs a live screen. So the sidecar wins where it supplies a value and the
 * constructor's own derivation stands in everywhere else.
 */
function createTsum(ctx, host, frame, meta) {
  const m = meta || {};
  host.setCapture(frame);

  const ts = new ctx.Tsum(!!m.isJP, !!m.specialScreenRatio, ctx.Logs);

  if (m.geometry) {
    for (const key of GeometryKeys) {
      if (typeof m.geometry[key] === 'number') ts[key] = m.geometry[key];
    }
  }
  ts.isRunning = true;
  ts.debug = false;
  ts.autoLaunch = false;
  return ts;
}

/** The geometry a frame actually resolved to, for sidecar authoring. */
function readGeometry(ts) {
  const out = {};
  for (const key of GeometryKeys) out[key] = ts[key];
  return out;
}

module.exports = {
  createRuntime,
  createTsum,
  readGeometry,
  ensureBuild,
  projectDir,
  bundlePath,
  GeometryKeys,
};
