// Keep the GitHub code references honest.
//
//   node scripts/check-refs.js            check every `reference` code block
//   node scripts/check-refs.js --images   also check the image placeholders
//
// A `reference` block names a file and, usually, a line range on GitHub, and
// the site fetches it at view time -- so a range that has drifted shows the
// wrong code with nothing to say so. This resolves every reference against the
// checkout beside the site and fails on a file that is gone, a range past the
// end, or a whole-file reference too long to read.
//
// With --images, every <ImagePlaceholder id="..."> in the pages has to be
// listed in IMAGES_NEEDED.md and vice versa, so the list of screenshots still
// wanted stays true.

'use strict';

const fs = require('fs');
const path = require('path');

const siteDir = path.resolve(__dirname, '..');
const docsDir = path.join(siteDir, 'docs');
const repoRoot = path.resolve(siteDir, '..');
const catalogueRoot = path.resolve(repoRoot, '..', 'game-automation-catalogue');

/** Where a reference URL's repository is checked out, or null to skip it. */
const repos = {
  'game-automation-platform/game-automation-scripts': repoRoot,
  'game-automation-platform/game-automation-catalogue': fs.existsSync(catalogueRoot) ? catalogueRoot : null,
};

const WholeFileMax = 200;

const failures = [];
function fail(file, message) {
  failures.push(`${path.relative(siteDir, file)}: ${message}`);
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (/\.mdx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

/** Every `reference` fence in a page: its URL and the line it sits on. */
function referencesIn(text) {
  const refs = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const fence = /^\s*```\S*\s+(.*)$/.exec(lines[i]);
    if (!fence || !/\breference\b/.test(fence[1])) continue;
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j++;
    refs.push({ line: i + 1, url: (lines[j] || '').trim() });
  }
  return refs;
}

function checkReference(file, ref) {
  const m = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/([^/]+)\/(.+?)(?:#L(\d+)(?:-L(\d+))?)?$/.exec(ref.url);
  if (!m) return fail(file, `line ${ref.line}: not a GitHub blob URL: ${ref.url || '(empty)'}`);
  const [, repo, , relPath, from, to] = m;
  if (!(repo in repos)) return fail(file, `line ${ref.line}: unknown repository ${repo}`);
  const root = repos[repo];
  if (root === null) return; // no checkout to check against
  const target = path.join(root, relPath);
  if (!fs.existsSync(target)) return fail(file, `line ${ref.line}: ${relPath} does not exist in ${repo}`);
  const count = fs.readFileSync(target, 'utf8').split('\n').length;
  if (from === undefined) {
    if (count > WholeFileMax) fail(file, `line ${ref.line}: ${relPath} is ${count} lines; reference a range`);
    return;
  }
  const start = Number(from);
  const end = to === undefined ? start : Number(to);
  if (start < 1 || start > end) fail(file, `line ${ref.line}: bad range L${from}-L${to}`);
  if (end > count) fail(file, `line ${ref.line}: ${relPath} has ${count} lines, range ends at ${end}`);
}

function checkImages(pages) {
  const used = new Map();
  for (const file of pages) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/<ImagePlaceholder\s[^>]*\bid="([^"]+)"/g)) {
      if (!used.has(m[1])) used.set(m[1], []);
      used.get(m[1]).push(path.relative(docsDir, file).replace(/\\/g, '/'));
    }
  }
  const listFile = path.join(siteDir, 'IMAGES_NEEDED.md');
  const listed = new Set(
    [...fs.readFileSync(listFile, 'utf8').matchAll(/^\| `([^`]+)`/gm)].map((m) => m[1]));
  for (const [id, files] of used) {
    if (!listed.has(id)) fail(listFile, `placeholder \`${id}\` (used in ${files.join(', ')}) is not listed`);
  }
  for (const id of listed) {
    if (!used.has(id)) fail(listFile, `lists \`${id}\`, which no page uses`);
  }
}

function main() {
  const pages = walk(docsDir);
  let refs = 0;
  for (const file of pages) {
    for (const ref of referencesIn(fs.readFileSync(file, 'utf8'))) {
      refs++;
      checkReference(file, ref);
    }
  }
  if (process.argv.includes('--images')) checkImages(pages);
  if (failures.length) {
    for (const f of failures) console.error(f);
    console.error(`\n${failures.length} problem${failures.length === 1 ? '' : 's'}.`);
    process.exit(1);
  }
  console.log(`${refs} references checked across ${pages.length} pages.`);
}

main();
