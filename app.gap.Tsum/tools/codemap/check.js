#!/usr/bin/env node
// Keep CODEMAP.md honest.
//
//   npm run map:check
//
// Also run from build.sh / build.ps1, non-fatally, so a map that has drifted is
// noticed at the next build rather than at the next session that trusted it.
//
// ## Why a checker and not a generator
//
// CODEMAP.md exists to be read before anything is searched, which means its
// value is entirely in the prose: what a file is *for*, and which document
// already answers a question. None of that can be generated, and a generated
// half would have to interleave with the written half row by row.
//
// What can be verified is everything the prose hangs off: that the paths exist,
// that nothing in `src/` went unlisted, that a name family really is confined to
// the files it claims. Those are exactly the parts that rot silently -- a moved
// file leaves the map wrong in a way that reads perfectly.
//
// ## The name families
//
// The map claims things like "`tiara*` lives in tiaraMinniePlus.ts, data.ts and
// globals.d.ts". That claim is what saves the reader a search, so it is worth
// failing a build over: a `tiaraFoo` added to tsum.ts either belongs in the
// skill file, or the row needs a fourth path. Symbols come from `symbols.js`
// beside this file, which reads the tree the way the bundle does: one global
// scope, so a name is its own identity.

const fs = require('fs');
const path = require('path');
const { extractFile, listSources } = require('./symbols');

const projectDir = path.resolve(__dirname, '..', '..');
const repoRoot = path.resolve(projectDir, '..');
const mapFile = path.join(repoRoot, 'CODEMAP.md');

const errors = [];
const notes = [];

function fail(message) { errors.push(message); }

// --- reading the map -------------------------------------------------------

/** Every `backticked` span in the document. */
function ticked(text) {
  return [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
}

/**
 * Rows of the first table under a heading whose text contains `title`.
 *
 * Cells come back raw, so a caller can pull backticked paths out of them. The
 * table ends at the first line that is not a row, which is how the sections
 * below stay independent of each other.
 */
function tableUnder(text, title) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^#{2,3} /.test(l) && l.toLowerCase().includes(title.toLowerCase()));
  if (start < 0) {
    fail('CODEMAP.md has no heading containing "' + title + '" -- this checker reads its tables by heading.');
    return [];
  }
  const rows = [];
  let inTable = false;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^#{2,3} /.test(line)) break;
    const isRow = line.startsWith('|');
    if (!isRow) {
      if (inTable) break;
      continue;
    }
    inTable = true;
    if (/^\|[\s:|-]+\|$/.test(line)) continue;              // the ---|--- rule
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length && !/^\*\*?Name\*?\*?$|^File$|^Question$|^Command$|^Tree$|^Directory$/.test(cells[0])) {
      rows.push(cells);
    }
  }
  return rows;
}

/**
 * Does this backticked span name a path in *this* repo?
 *
 * Two kinds of near-miss have to be let through. Paths inside the external
 * trees (`docs/API.md` in the host app, `scripts/com.r2studio.TsumBeta`
 * upstream) are real, just not here -- so only this repo's own top-level
 * directories count. And the prose names source files bare (`skillCore.ts`,
 * `host.js`) where the sentence already says which directory; documents and
 * configs are still checked bare, because those all sit at one of the two roots.
 */
const RepoDirs = ['src', 'tools', 'docs', 'app.gap.Tsum', 'website'];

function isRepoPath(token) {
  if (/^[A-Za-z]:[\\/]/.test(token)) return false;          // external, absolute
  if (/^(npm|node|adb|http)/.test(token)) return false;
  if (/[\s*]/.test(token)) return false;
  if (token.includes('#')) return false;
  if (token.includes('/')) return RepoDirs.includes(token.split('/')[0]);
  return /\.(md|json|sh|ps1)$/.test(token);
}

function resolveRepoPath(token) {
  const clean = token.replace(/\/$/, '');
  for (const base of [projectDir, repoRoot]) {
    const p = path.join(base, clean);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// --- the checks ------------------------------------------------------------

/**
 * Drop the regions that describe another tree.
 *
 * A section about the host app talks in *its* paths, and `tools/gap-cli.js`
 * there is not `tools/` here. Writing every one of them out in full would be
 * noise for the reader, so such a section says so once, with
 * `<!-- map:external -->`, and existence checking stops until the next heading.
 */
function withoutExternalSections(text) {
  const kept = [];
  let skipping = false;
  for (const line of text.split('\n')) {
    if (line.trim() === '<!-- map:external -->') { skipping = true; continue; }
    if (skipping && /^#{1,6} /.test(line)) skipping = false;
    if (!skipping) kept.push(line);
  }
  return kept.join('\n');
}

/** Every path the map names has to exist. */
function checkPathsExist(fullText) {
  const text = withoutExternalSections(fullText);
  const seen = new Set();
  for (const token of ticked(text)) {
    if (!isRepoPath(token) || seen.has(token)) continue;
    seen.add(token);
    if (!resolveRepoPath(token)) fail('CODEMAP.md names `' + token + '`, which does not exist.');
  }
  for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (target.startsWith('#') || /^https?:/.test(target)) continue;
    if (!resolveRepoPath(target)) fail('CODEMAP.md links to ' + target + ', which does not exist.');
  }
}

function walk(dir, keep, rel = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const r = rel ? rel + '/' + entry.name : entry.name;
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), keep, r));
    else if (keep(r)) out.push(r);
  }
  return out;
}

/**
 * Nothing in `src/`, no tool directory and no document may go unmentioned.
 *
 * This is the check that catches a new file: someone adding `src/missions.ts`
 * has to say what it is for, which is the whole point of the map.
 */
function checkCoverage(text) {
  for (const rel of walk(path.join(projectDir, 'src'), (r) => /\.(ts|html|css)$/.test(r))) {
    if (!text.includes('src/' + rel)) fail('src/' + rel + ' is not mentioned in CODEMAP.md.');
  }

  for (const entry of fs.readdirSync(path.join(projectDir, 'tools'), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    if (!text.includes('tools/' + entry.name)) fail('tools/' + entry.name + '/ is not mentioned in CODEMAP.md.');
  }

  const docs = [
    ...walk(repoRoot, (r) => r.endsWith('.md') && !r.includes('/') && r !== 'CODEMAP.md'),
    ...walk(projectDir, (r) => r.endsWith('.md') && !r.startsWith('build/')),
  ];
  for (const doc of new Set(docs)) {
    const name = doc.includes('/') ? doc : path.basename(doc);
    if (!text.includes(name)) fail(doc + ' is not mentioned in CODEMAP.md.');
  }
}

/** Every symbol in `src/`, keyed as symbols.js keys them. */
function allSymbols() {
  const out = [];
  for (const f of listSources(path.join(projectDir, 'src'))) {
    for (const s of extractFile(f.abs, f.rel).values()) {
      out.push({ key: s.key, bare: s.key.replace(/^type /, '').replace(/^[A-Za-z0-9_]+#/, ''), file: 'src/' + f.rel });
    }
  }
  return out;
}

function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^' + escaped + '$');
}

/**
 * "Where a name lives": each row claims a set of patterns is confined to a set
 * of files. A pattern matching nothing is a stale row; a match outside the
 * listed files is either a misplaced symbol or a row that needs another path.
 */
function checkNameFamilies(text) {
  const symbols = allSymbols();
  const rows = tableUnder(text, 'Where a name lives');
  if (!rows.length) return;

  for (const [nameCell, fileCell] of rows) {
    // `ts.foo()` and the like are prose sharing the cell, not patterns: a family
    // name is a bare identifier, optionally with an `Owner#` prefix and a `*`.
    const patterns = ticked(nameCell).filter((t) => /^[A-Za-z_][A-Za-z0-9_]*#?[A-Za-z0-9_*]*$/.test(t));
    const files = ticked(fileCell).filter(isRepoPath);
    if (!patterns.length || !files.length) continue;         // prose row, e.g. host natives

    for (const pattern of patterns) {
      const re = globToRegExp(pattern);
      const hits = symbols.filter((s) => re.test(s.key) || re.test(s.bare));
      if (!hits.length) {
        fail('CODEMAP.md name family `' + pattern + '` matches no symbol in src/ any more.');
        continue;
      }
      const strays = [...new Set(hits.filter((h) => !files.includes(h.file)).map((h) => h.file + ' (' + h.key + ')'))];
      if (strays.length) {
        fail('CODEMAP.md says `' + pattern + '` lives in ' + files.join(', ')
          + ', but it also matches: ' + strays.slice(0, 5).join(', ')
          + (strays.length > 5 ? ' and ' + (strays.length - 5) + ' more' : '') + '.');
      }
    }
  }
}

/** Every skill file listed against a SkillType has to register that type. */
function checkSkills(text) {
  const rows = tableUnder(text, 'Skills');
  const listed = new Set();
  for (const [fileCell, typeCell] of rows) {
    const file = ticked(fileCell).find(isRepoPath);
    if (!file) continue;
    listed.add(file);
    const resolved = resolveRepoPath(file);
    if (!resolved) continue;                                 // already reported
    const source = fs.readFileSync(resolved, 'utf8');
    for (const type of ticked(typeCell).filter((t) => t.startsWith('SkillType.'))) {
      if (!source.includes(type)) {
        fail('CODEMAP.md lists ' + type + ' under ' + file + ', which does not mention it.');
      }
    }
  }
  for (const rel of walk(path.join(projectDir, 'src', 'skills'), (r) => r.endsWith('.ts'))) {
    if (!listed.has('src/skills/' + rel)) fail('src/skills/' + rel + ' is missing from the skills table in CODEMAP.md.');
  }
}

/** The command table and package.json have to agree, in both directions. */
function checkCommands(text) {
  const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
  const scripts = Object.keys(pkg.scripts || {});
  const mentioned = new Set([...text.matchAll(/npm run ([A-Za-z0-9:_-]+)/g)].map((m) => m[1]));

  for (const name of mentioned) {
    if (!scripts.includes(name)) fail('CODEMAP.md documents `npm run ' + name + '`, which is not in package.json.');
  }
  for (const name of scripts) {
    if (!mentioned.has(name)) fail('package.json has a `' + name + '` script that CODEMAP.md does not mention.');
  }
}

// --- entry point -----------------------------------------------------------

function main() {
  const quiet = process.argv.includes('--quiet');
  if (!fs.existsSync(mapFile)) {
    console.error('CODEMAP.md not found at ' + mapFile);
    process.exit(2);
  }
  const text = fs.readFileSync(mapFile, 'utf8');

  checkPathsExist(text);
  checkCoverage(text);
  checkNameFamilies(text);
  checkSkills(text);
  checkCommands(text);

  for (const note of notes) if (!quiet) console.log('note: ' + note);
  for (const error of errors) console.error('error: ' + error);

  if (errors.length) {
    console.error('\nCODEMAP.md is out of date in ' + errors.length + ' place'
      + (errors.length === 1 ? '' : 's') + '. Fix the map, or the tree.');
    process.exit(1);
  }
  if (!quiet) console.log('CODEMAP.md matches the tree.');
}

main();
