#!/usr/bin/env node
// The build, written as a dependency graph rather than a list of commands.
//
//   node tools/build/build.js [--channel Alpha] [--adb] [--device SERIAL] [--jobs N]
//
// build.sh and build.ps1 are thin wrappers over this. They used to hold the same
// recipe twice, in two dialects, and had drifted: the PowerShell one wrote CRLF
// into dist/*.html and built its archive with a different tool, so the two
// shells shipped different bytes and different SHA256 sidecars from one tree.
//
// ## Why a graph
//
// Almost nothing in a build of this shape is actually sequential. Only
// pageDocs, dispatchEval and the shipped bundle need build/index.js; eventDocs
// reads the TypeScript sources directly, the code map reads the tree, and the
// tsum library is a plain file copy. Run in order that was ~16s of steps; run
// by need it is the length of the longest chain, which is the game bundle's
// compile and reprint.
//
// The other half of the win is not spawning node so often. It costs ~230ms to
// start and ~300ms more to load terser, against ~50ms to actually reprint one
// of the small page scripts -- so the eight separate minify processes spent
// 2.4s booting to do 0.4s of work. They are one process now (`--batch`), and
// the cheap file work here (copies, placeholder substitution) happens in this
// process rather than in a shell.
//
// ## Adding a step
//
// Add it to `steps` in the position it should *print*, name what it `needs`,
// and mark it `optional` if a finding from it should be read rather than block
// the build. tools/build/schedule.js does the rest.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const { projectDir, loadConfig, resolveChannel, archiveName } = require('../release/config');
const { runSteps, defaultJobs } = require('./schedule');
const { zipDirectory } = require('./zip');

const argv = process.argv.slice(2);
const has = (name) => argv.includes('--' + name);
const valueOf = (name) => {
  const at = argv.indexOf('--' + name);
  return at >= 0 ? argv[at + 1] : undefined;
};

const local = (...parts) => path.join(projectDir, ...parts);
const nodeBin = process.execPath;
const tsc = local('node_modules', 'typescript', 'bin', 'tsc');

const DEPLOY_DIR = '/sdcard/Download/GameAutomationPlatform/scripts/Official GAP/Tsum Tsum/';

// The page scripts, minified in one process. All ES5, to match what
// tsconfig.settings.json and tsconfig.quickbar.json emit. `verify` is only
// spelled out where the file declares something reached by name from outside
// itself -- the rest declare one array or one call, and nothing is renamed
// either way because mangling is off. A new language file is one more line.
const PAGE_SCRIPTS = [
  { file: 'build/settings.js', verify: 'names:onEvent,onLog' },
  { file: 'build/quickbarPage.js', verify: 'names:onGapState,onQuickBarState' },
  { file: 'build/i18n.js', verify: 'names:i18nRegister,i18nText' },
  { file: 'build/uiEn.js' },
  { file: 'build/uiZhTw.js' },
  { file: 'build/releaseStatus.js', verify: 'names:offeredHere,statusFlag' },
  { file: 'build/skillOptions.js' },
  // No `verify`, as skillOptions: `names:` looks for function declarations and
  // both of these files are one `var` holding an array.
  { file: 'build/bubbleOptions.js' },
  { file: 'build/runPlan.js' },
  { file: 'build/qrCode.js', verify: 'names:qrMatrix' },
  { file: 'build/presets.js', verify: 'names:presetsLoad,presetMatchName' },
].map((job) => ({ in: job.file, out: job.file, ecma: 5, verify: job.verify }));

// config.json is the release identity: the game and one entry per channel. The
// version is package.json's. The archive is named from both, so a build and the
// metadata.json that ships beside it cannot disagree about what was built.
const channel = resolveChannel(loadConfig(), valueOf('channel') || '');
const version = channel.Version;
const archive = archiveName(channel);

// UTC, and the same string both old scripts produced: `2026-09-07 12:34:56 +00:00`.
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const buildDate = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ` +
  `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())} +00:00`;

/** Run a child process, folding both of its streams into the step's log. */
function sh(log, file, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd: projectDir, stdio: ['ignore', 'pipe', 'pipe'] });
    const take = (chunk) => log(chunk.toString());
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.on('error', reject);
    child.on('close', (code) => code === 0
      ? resolve()
      : reject(new Error(`${path.basename(file)} ${args.join(' ')} exited ${code}`)));
  });
}

/** Every tool in this build is a node script. */
const node = (log, ...args) => sh(log, nodeBin, args);

/**
 * The pages carry `$VERSION` and `$BUILD_DATE` placeholders rather than values
 * of their own, so package.json stays the one place the version is written.
 *
 * `$RELEASE_STATUS` is the same trick for the channel's floor: src/releaseStatus.ts
 * turns it into `ReleaseStatusMin`, which is what narrows both the skill list and
 * the settings schema to what this channel offers. Substituted after inlining
 * like the other two, which is safe because tools/minify runs terser with
 * `compress: false` -- the literal is still a literal in the minified page.
 */
const substitute = (text) => text
  .replaceAll('$BUILD_DATE', buildDate)
  .replaceAll('$VERSION', version)
  .replaceAll('$RELEASE_STATUS', String(channel.Status));

/** Stage the page assets so tools/inline/inline.js can resolve them by name. */
function stageAssets(log) {
  for (const name of ['index.html', 'index.css', 'quickbar.html', 'quickbar.css']) {
    fs.copyFileSync(local('src', name), local('build', name));
  }
  // Pico CSS from node_modules rather than a CDN: the settings page is opened
  // from file:// on a device that is often offline, so every asset it names has
  // to end up inside dist/index.html. `@charset` is dropped because it is only
  // legal at the top of a stylesheet *file*, and this becomes a <style> element.
  const pico = fs.readFileSync(local('node_modules', '@picocss', 'pico', 'css', 'pico.min.css'), 'utf8');
  fs.writeFileSync(local('build', 'pico.css'), pico.replace(/^@charset "UTF-8";/, ''));
  log('[build] staged index/quickbar html+css and pico.css into build/\n');
}

/**
 * Fold a page's assets into it and substitute the placeholders. The inlined
 * copy is staged in build/ rather than dist/: a failure between the two steps
 * would otherwise leave a half-made page in the directory that gets zipped.
 */
async function inlinePage(log, source, dest) {
  const staged = 'build/' + path.basename(dest, '.html') + '.inlined.html';
  await node(log, 'tools/inline/inline.js', source, staged);
  fs.writeFileSync(local(dest), substitute(fs.readFileSync(local(staged), 'utf8')));
  fs.rmSync(local(staged));
}

/**
 * The game bundle, stripped of whitespace on the way into dist/ and left alone
 * in build/: the offline harnesses (tools/runtime, tools/pageDocs) read
 * build/index.js and want it readable when something there fails.
 *
 * The version is stamped in on the way past. build/index.js keeps the
 * placeholder -- that is the copy the harnesses read, and nothing there reads
 * it for meaning.
 */
async function distBundle(log) {
  const source = fs.readFileSync(local('build', 'index.js'), 'utf8');
  fs.writeFileSync(local('build', 'index.stamped.js'), source.replaceAll('$VERSION', version));
  await node(log, 'tools/minify/minify.js', 'build/index.stamped.js', 'dist/index.js',
    '--ecma', '2023', '--verify', 'bundle');
  fs.rmSync(local('build', 'index.stamped.js'));
}

/**
 * The archive, and its SHA256 beside it so a copy that has travelled to a
 * device can be checked back against the build it came from.
 *
 * The sidecar holds the bare 64-character lowercase digest and nothing else --
 * no filename field, no trailing newline -- because it is read to be passed
 * around as a web payload, and whoever reads it should get a value they can use
 * as-is. That is deliberately not `sha256sum -c` format.
 */
function writeArchive(log) {
  const names = zipDirectory(local('dist'), local(archive));
  const bytes = fs.readFileSync(local(archive));
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  fs.writeFileSync(local(archive + '.sha256'), digest);
  log(`[build] ${archive} (${(bytes.length / 1024).toFixed(0)}K): ${names.join(', ')}\n`);
  log(`[build] SHA256 = ${digest}\n`);
}

// Declaration order is print order. What actually runs when is decided by
// `needs` alone.
const steps = [
  { id: 'tsc:game', run: ({ log }) => node(log, tsc) },

  // Regenerated from the bundle that was just built: the dispatch order is
  // computed by PageRouter.plan rather than written down, so the only honest way
  // to document it is to ask the compiled router.
  //
  // Optional here, and in the three below it, is deliberate: a stale document, a
  // page nothing navigates off, a changed trace row or a drifted code map is
  // worth reading and never worth blocking a build over. `npm run
  // pages:docs:check`, `events:docs:check`, `dispatch:eval` and `map:check` are
  // the gates that fail.
  {
    id: 'docs:pages', needs: ['tsc:game'], optional: true,
    run: ({ log }) => node(log, 'tools/pageDocs/generate.js'),
  },
  // Reads the TypeScript program rather than the bundle -- what matters about an
  // emit is which file and line it is on and what type each payload field has,
  // and the bundle has thrown all three away. So it needs no compile, and runs
  // alongside one.
  {
    id: 'docs:events', optional: true,
    run: ({ log }) => node(log, 'tools/eventDocs/generate.js'),
  },
  {
    id: 'eval:dispatch', needs: ['tsc:game'], optional: true,
    run: ({ log }) => node(log, 'tools/dispatchEval/run.js'),
  },
  {
    id: 'check:codemap', optional: true,
    run: ({ log }) => node(log, 'tools/codemap/check.js', '--quiet'),
  },
  // Not optional, unlike the four above: this one is not a document going
  // stale, it is a setting that will silently do nothing on a running script or
  // break the round it is changed in -- which has shipped three times. Drives
  // the bundle tsc just wrote, so `--no-build` keeps it from compiling again
  // over the steps running beside it.
  {
    id: 'check:live', needs: ['tsc:game'],
    run: ({ log }) => node(log, 'tools/liveSettings/check.js', '--no-build'),
  },

  { id: 'tsc:settings', run: ({ log }) => node(log, tsc, '-p', 'tsconfig.settings.json') },
  // Behind the settings compile for want of a lock, not a core: both configs
  // emit build/i18n.js, uiEn.js, uiZhTw.js and skillOptions.js from the same
  // sources. The output is identical either way, but two tsc processes writing
  // those paths at once can leave one of them half-written. Giving this config
  // its own outDir would buy back ~0.5s and cost a copy step plus a fix to
  // tools/quickbarPreview, which reads them out of build/ by name.
  {
    id: 'tsc:quickbar', needs: ['tsc:settings'],
    run: ({ log }) => node(log, tsc, '-p', 'tsconfig.quickbar.json'),
  },
  {
    id: 'minify:pages', needs: ['tsc:quickbar'],
    run: ({ log }) => node(log, 'tools/minify/minify.js', '--batch', JSON.stringify(PAGE_SCRIPTS)),
  },

  { id: 'stage:assets', run: ({ log }) => stageAssets(log) },
  {
    id: 'dist:index', needs: ['minify:pages', 'stage:assets'],
    run: ({ log }) => inlinePage(log, 'build/index.html', 'dist/index.html'),
  },
  // Deployed beside index.html, where the host looks for it -- a script without
  // one simply has no Quick Bar button.
  {
    id: 'dist:quickbar', needs: ['minify:pages', 'stage:assets'],
    run: ({ log }) => inlinePage(log, 'build/quickbar.html', 'dist/quickbar.html'),
  },
  { id: 'dist:bundle', needs: ['tsc:game'], run: ({ log }) => distBundle(log) },
  // The tsum portrait library: not compiled, but shipped, so it goes into dist/
  // under the same rule as the scripts. It is read off getScriptPath() on the
  // first round that needs a name rather than out of the bundle.
  {
    id: 'dist:library',
    run: ({ log }) => node(log, 'tools/minify/library.js', 'src/tsums.dat', 'dist/tsums.dat'),
  },
  // The license and the notices ride in the archive: dist/index.html inlines
  // Pico CSS, whose MIT notice has to travel with it.
  {
    id: 'dist:notices',
    run: ({ log }) => {
      for (const name of ['LICENSE', 'NOTICE']) fs.copyFileSync(local('..', name), local('dist', name));
      log('[build] dist/LICENSE, dist/NOTICE\n');
    },
  },

  {
    id: 'archive', needs: ['dist:index', 'dist:quickbar', 'dist:bundle', 'dist:library', 'dist:notices'],
    run: ({ log }) => writeArchive(log),
  },
];

async function main() {
  const jobs = Number(valueOf('jobs')) || defaultJobs();
  console.log(`[build] channel ${channel.name}, version ${version}, archive ${archive}`);
  console.log(`[build] offering skills and settings at status ${channel.Status} and above`);
  console.log(`[build] ${steps.length} steps, ${jobs} jobs`);

  fs.rmSync(local('dist'), { recursive: true, force: true });
  fs.rmSync(local('build'), { recursive: true, force: true });
  fs.mkdirSync(local('dist'));
  fs.mkdirSync(local('build'));

  const started = Date.now();
  const result = await runSteps(steps, { jobs });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  if (!result.ok) {
    for (const failure of result.failures) console.error(`[build] FAILED ${failure.id}: ${failure.message}`);
    console.error(`[build] build failed after ${elapsed}s`);
    process.exit(1);
  }
  console.log(`[build] done in ${elapsed}s`);

  if (has('adb')) {
    const device = valueOf('device');
    const target = device ? ['-s', device] : [];
    console.log(`[build] pushing to ${device || 'the connected device'}...`);
    await sh((text) => process.stdout.write(text), 'adb', [
      ...target, 'push',
      'dist/index.js', 'dist/index.html', 'dist/quickbar.html', 'dist/tsums.dat',
      DEPLOY_DIR,
    ]);
  }
}

main().catch((err) => {
  console.error('[build] ' + (err && err.message ? err.message : err));
  process.exit(1);
});
