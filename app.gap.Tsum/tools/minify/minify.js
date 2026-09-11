#!/usr/bin/env node
// Reprint one built script compactly on its way into the shipped payload, and
// prove the result still works.
//
//   node tools/minify/minify.js build/index.js dist/index.js --ecma 2023 --verify bundle
//   node tools/minify/minify.js build/settings.js build/settings.js --ecma 5 --verify names:onEvent,onLog
//   node tools/minify/minify.js --batch '[{"in":"build/uiEn.js","out":"build/uiEn.js","ecma":5}]'
//
// Run by tools/build/build.js. TypeScript takes the comments out
// (`removeComments` in both tsconfigs); this takes the whitespace out.
//
// `--batch` reprints a list of files in one process. Node costs ~230ms to start
// and ~300ms more to load terser, against ~50ms to reprint one of the page
// scripts -- so the eight page scripts are one call rather than eight.
//
// ## Whitespace only, deliberately
//
// terser is invoked with **`compress: false` and `mangle: false`**. It parses the
// file and prints the same AST back without the formatting: no renaming, no
// inlining, no dead-code removal, no expression rewriting.
//
// Parsing both files and comparing the trees, the output differs from the input
// in three ways and no others, all of them the printer choosing shorter syntax
// for the same thing:
//
//   `typeof(f) == 'x'`  ->  `typeof f == "x"`     redundant parentheses dropped
//   `{ a: a }`          ->  `{ a }`               ES6 shorthand
//   `{ "a": 1 }`        ->  `{ a: 1 }`            keys unquoted where legal
//
// 136 nodes out of 45,247, every one carrying the same text as before. Nothing
// else moves.
//
// That is not timidity, it is the measurement. On the game bundle:
//
//     as tsc emits it, comments already stripped   235K
//     whitespace only                              157K   <- what we do
//     whitespace + mangling local names            140K
//     whitespace + mangling + compress             134K
//
// Every transform that can change behaviour is worth 23K between them, about
// 10% of the file, and each one is a way for this to break somewhere no stack
// trace reaches: the script runs unattended for hours on a phone, its error
// handler logs `String(e)` and nothing else, and there is no source map. A
// misplay caused by a compress pass would read as "the script taps the wrong
// place sometimes". 23K does not buy that.
//
// If it ever has to be revisited, the two knobs are here and the verification
// below is what would have to be trusted. Note what mangling would put at risk:
// both programs are classic scripts reached *by name* from outside themselves --
// the settings WebView evaluates `start({...})` and `stop();` in the game
// script's global scope through the bridge, and the host calls `onEvent` and
// `onLog` on the settings side -- so `toplevel` would have to stay off in both
// `mangle` and `compress`.
//
// ## Verifying, rather than hoping
//
// `--verify bundle` evaluates the output in the `tools/runtime/` host shim --
// the same loader every offline harness uses, pointed at the output file. That runs every
// top-level initialiser the device runs (the `gPages` singleton, the skill
// registry, the `Page` tables) and then checks the names the bridge needs. It is
// cheap, and it means the file that ships has been executed at least once.
//
// `--verify names:a,b` is the weaker check for the settings script, which cannot
// be evaluated without a DOM: parse it, then confirm those functions are still
// declared under their own names.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { minify } = require('terser');

const projectDir = path.resolve(__dirname, '..', '..');

function usage(message) {
  if (message) console.error('[minify] ' + message);
  console.error('usage: minify.js <in.js> <out.js> [--ecma N] [--verify bundle|names:a,b]');
  console.error('       minify.js --batch <json array of {in, out, ecma, verify}>');
  process.exit(1);
}

/** The names the bridge calls, still declared as themselves. */
function checkNames(outPath, code, names) {
  const missing = names.filter((name) => !new RegExp(
    '(^|[^\\w$])function\\s+' + name + '\\s*\\(').test(code));
  if (missing.length) {
    console.error('[minify] ' + path.basename(outPath) +
      ' no longer declares: ' + missing.join(', '));
    process.exit(1);
  }
}

/** Evaluate the output the way the device would, and look for its API. */
function checkBundle(file) {
  // Required lazily: the settings half of a build has no business loading the
  // page-detection harness, and this file is used for both.
  const { createRuntime } = require('../runtime/load');
  const { ctx } = createRuntime({ build: false, bundlePath: file });
  // The names something outside the bundle reaches by name: the page's
  // `start`/`stop`, the overlay's `onPause` hook, and the two the Quick Bar page
  // evaluates. Nothing here is mangled, so a miss means the file lost a
  // declaration rather than that one was renamed.
  const wanted = ['start', 'stop', 'Tsum', 'TsumTaskController', 'PageRouter',
                  'gPages', 'gFever', 'Config', 'Page', 'Button',
                  // The log sentence registry and its reference table. A new
                  // language's table is not listed: it registers itself into
                  // `gLogCatalogues`, which is checked instead, so adding one
                  // needs no edit here.
                  'LogsEn', 'gLogCatalogues', 'logStringsFor',
                  'onPause', 'quickBarState', 'quickBarApply', 'applyLiveSettings',
                  // Both pages have a Report button, and the host's Log chip
                  // reaches the same name over the IPC socket on a long press.
                  'reportIssue'];
  const missing = wanted.filter((name) => ctx[name] === undefined);
  if (missing.length) {
    console.error('[minify] the reprinted bundle lost: ' + missing.join(', '));
    process.exit(1);
  }
}

/** Reprint one file. `job` is `{ in, out, ecma, verify }`, paths project-relative. */
async function reprint(job) {
  const inPath = path.resolve(projectDir, job.in);
  const outPath = path.resolve(projectDir, job.out);
  const ecma = Number(job.ecma || 2020);
  const verify = job.verify;

  const code = fs.readFileSync(inPath, 'utf8');
  const result = await minify(code, {
    ecma,
    // The two that could change behaviour. See the note above before touching
    // either: they are worth about 10% of the file, and this script runs
    // unattended on a device that reports no line numbers.
    compress: false,
    mangle: false,
    format: { ecma, comments: false },
    sourceMap: false,
  });
  if (typeof result.code !== 'string') {
    console.error('[minify] terser produced nothing for ' + inPath);
    process.exit(1);
  }

  try {
    new vm.Script(result.code, { filename: path.relative(projectDir, outPath) });
  } catch (e) {
    console.error('[minify] the output does not parse: ' + e.message);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, result.code);

  if (verify === 'bundle') {
    checkBundle(outPath);
  } else if (verify && verify.startsWith('names:')) {
    checkNames(outPath, result.code, verify.slice('names:'.length).split(','));
  }

  const before = Buffer.byteLength(code);
  const after = Buffer.byteLength(result.code);
  console.log('[minify] ' + path.basename(outPath) + ' ' +
    (before / 1024).toFixed(0) + 'K -> ' + (after / 1024).toFixed(0) + 'K (' +
    Math.round((1 - after / before) * 100) + '% smaller)');
}

// Every flag here takes a value, so a bare argument is only a path when it is
// not the value of the flag before it.
const args = process.argv.slice(2);
const files = [];
const flags = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    flags[args[i].slice(2)] = args[++i];
  } else {
    files.push(args[i]);
  }
}

let jobs;
if (flags.batch) {
  if (files.length) usage('--batch carries every path; it takes no bare arguments');
  try {
    jobs = JSON.parse(flags.batch);
  } catch (e) {
    usage('--batch is not valid JSON: ' + e.message);
  }
  if (!Array.isArray(jobs) || !jobs.length) usage('--batch needs a non-empty array of jobs');
} else {
  if (files.length !== 2) usage('needs exactly an input and an output path');
  jobs = [{ in: files[0], out: files[1], ecma: flags.ecma, verify: flags.verify }];
}

(async () => {
  for (const job of jobs) await reprint(job);
})().catch((e) => {
  console.error('[minify] ' + (e && e.message ? e.message : e));
  process.exit(1);
});
