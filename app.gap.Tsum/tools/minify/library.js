#!/usr/bin/env node
// Copy the tsum portrait library into the shipped payload without its header.
//
//   node tools/minify/library.js src/tsums.dat dist/tsums.dat
//
// Run by build.sh / build.ps1 in place of a plain copy, so the one file in
// dist/ that is not a script gets the same rule as the ones that are:
// tools/minify/minify.js takes the comments and the whitespace out of those,
// this takes them out of this.
//
// src/tsums.dat opens with twenty-five `#` lines saying how it is built and
// what a row means. They are worth their bytes to whoever opens the source and
// nothing at all to the device -- `myTsumLoadLibrary` in src/roundStats.ts
// skips `#` lines and blank lines on its way to the format line.
//
// The format line -- `gap-tsum-portraits v1 grid=16 cells=148 ...` -- is data
// rather than a comment, and is kept. roundStats.ts refuses a library that does
// not open with it: one cut through a different grid scores against the wrong
// cells, which is a wrong name rather than a missing one.

const fs = require('fs');
const path = require('path');

const [, , srcArg, destArg] = process.argv;
if (!srcArg || !destArg) {
  console.error('usage: library.js <src.dat> <dest.dat>');
  process.exit(1);
}

const srcPath = path.resolve(srcArg);
const destPath = path.resolve(destArg);
const text = fs.readFileSync(srcPath, 'utf8');

// The trailing \r goes with the comments: this is the copy that ships, and the
// reader spends a substring on every row that carries one.
const lines = text.split('\n').map((line) => line.replace(/\r$/, ''));
const kept = lines.filter((line) => line !== '' && line.charAt(0) !== '#');
const dropped = lines.filter((line) => line.charAt(0) === '#').length;

// The format line plus at least one row. Less than that is not the library, and
// shipping it would mean an empty tsum column on every round the device records.
if (kept.length < 2) {
  console.error('[library] ' + srcArg + ' has no rows under its header');
  process.exit(1);
}

const out = kept.join('\n') + '\n';
fs.mkdirSync(path.dirname(destPath), { recursive: true });
fs.writeFileSync(destPath, out);

console.log('[library] ' + path.basename(destPath) + ' ' +
  (Buffer.byteLength(text) / 1024).toFixed(0) + 'K -> ' +
  (Buffer.byteLength(out) / 1024).toFixed(0) + 'K (' +
  (kept.length - 1) + ' tsums, ' + dropped + ' comment lines dropped)');
