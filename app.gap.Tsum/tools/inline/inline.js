#!/usr/bin/env node
// Fold a page's local assets into it, so the result is one file.
//
//   node tools/inline/inline.js build/index.html dist/index.html
//
// Run by build.sh / build.ps1 on the staged settings page: `pico.css`,
// `index.css` and `settings.js` go in, and what comes out is the single
// `dist/index.html` the device loads from file://. That is not a size
// optimisation -- the page is opened from local storage on a phone that is
// often offline, so an asset it has to fetch is an asset it does not get.
//
// ## Why not a library
//
// This replaced `html-inline-external`, which parses the page with jsdom and
// re-serialises it. Two problems, both from the parse rather than from the job:
// jsdom hands every `<style>` to a CSS parser that predates nesting and `:host`,
// so inlining Pico printed eighty kilobytes of "Could not parse CSS stylesheet"
// over every build; and a full parse-and-serialise round trip is free to rewrite
// markup that was already correct.
//
// Substitution needs neither. A `<link>` or a `<script src>` in a page we wrote
// is found by pattern, and everything else in the file is copied through
// untouched -- the `<template>` elements the settings page is built from arrive
// on the other side byte for byte.

const fs = require('fs');
const path = require('path');

const [, , srcArg, destArg] = process.argv;
if (!srcArg || !destArg) {
  console.error('usage: inline.js <src.html> <dest.html>');
  process.exit(1);
}

const srcPath = path.resolve(srcArg);
const srcDir = path.dirname(srcPath);

/** Anything with a scheme stays a reference: it is not ours to inline. */
function isExternal(url) {
  return /^[a-z][a-z0-9+.-]*:|^\/\//i.test(url);
}

/** One asset's text, or a hard failure -- a missing asset is a broken page. */
function read(url) {
  const file = path.join(srcDir, url.split(/[?#]/)[0]);
  if (!fs.existsSync(file)) {
    console.error(`[inline] ${srcArg} references ${url}, which is not next to it`);
    process.exit(1);
  }
  return fs.readFileSync(file, 'utf8');
}

/** The value of `attr` in one start tag, or undefined. */
function attribute(tag, attr) {
  const match = new RegExp(`\\s${attr}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return match === undefined || match === null ? undefined : (match[2] ?? match[3] ?? match[4]);
}

let html = fs.readFileSync(srcPath, 'utf8');
let inlined = 0;

// <link rel="stylesheet" href="..."> -> <style>...</style>
html = html.replace(/<link\b[^>]*>/gi, (tag) => {
  const rel = attribute(tag, 'rel');
  const href = attribute(tag, 'href');
  if (!href || isExternal(href) || (rel || '').toLowerCase() !== 'stylesheet') {
    return tag;
  }
  inlined++;
  return `<style>\n${read(href)}\n</style>`;
});

// <script src="..."></script> -> <script>...</script>
html = html.replace(/<script\b([^>]*)>\s*<\/script>/gi, (tag, attrs) => {
  const src = attribute(' ' + attrs, 'src');
  if (!src || isExternal(src)) {
    return tag;
  }
  const code = read(src);
  // A `</script>` inside the code would end the tag early. It has never
  // happened here, and it would be a silently truncated page if it did.
  if (/<\/script/i.test(code)) {
    console.error(`[inline] ${src} contains "</script>", which cannot be inlined as-is`);
    process.exit(1);
  }
  inlined++;
  return `<script>\n${code}\n</script>`;
});

fs.mkdirSync(path.dirname(path.resolve(destArg)), { recursive: true });
fs.writeFileSync(path.resolve(destArg), html);
console.log(`[inline] ${inlined} assets into ${destArg}`);
