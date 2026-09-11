#!/usr/bin/env node
// What each language is missing, and what nothing uses.
//
//   npm run i18n:check
//
// ## Why a tool and not a type
//
// The compiler already checks most of this. `uiEn.ts` is typed `UiStrings`, so
// English cannot be incomplete; every catalogue is checked against `UiText`, so
// a stale or misspelt key cannot hide in one; `logsEn.ts` is the type the other
// log tables are declared against.
//
// Three things it cannot see, and they are what this is for:
//
//   1. **What a translation is missing.** Deliberately allowed -- a language
//      that is not finished still compiles and still ships, falling back to
//      English key by key -- so the gap has to be reported somewhere else, or
//      it is not reported at all.
//   2. **A key nothing uses.** A row deleted from the settings schema leaves
//      its text behind in every catalogue, and nothing says so.
//   3. **A `data-i18n` that names no key.** The Quick Bar's labels live in its
//      markup, which no compiler reads. A typo there shows the key on the strip
//      instead of a word, which is visible but only if someone looks.
//
// Only the third fails the build. The first two are reported and are meant to
// be read -- an unfinished translation is a normal state, not an error.

const fs = require('fs');
const path = require('path');

const projectDir = path.resolve(__dirname, '..', '..');
const srcDir = path.join(projectDir, 'src');

const problems = [];

function read(rel) {
  return fs.readFileSync(path.join(srcDir, rel), 'utf8');
}

function sourcesMatching(pattern) {
  return fs.readdirSync(srcDir).filter((name) => pattern.test(name)).sort();
}

// --- the vocabularies ------------------------------------------------------

/** `UiText` as `{ MemberName: 'dotted.key' }`, in declaration order. */
function uiTextMembers() {
  const text = read('strings.d.ts');
  const block = /declare const enum UiText \{([\s\S]*?)\n\}/.exec(text);
  if (!block) {
    problems.push('src/strings.d.ts has no `declare const enum UiText` block.');
    return {};
  }
  const members = {};
  for (const [, name, value] of block[1].matchAll(/^\s*([A-Za-z0-9_]+) = '([^']*)',/gm)) {
    members[name] = value;
  }
  return members;
}

/** The `[UiText.X]` / `[Log.X.Y]` keys one catalogue file answers. */
function cataloguedKeys(rel, prefix) {
  const pattern = new RegExp('\\[' + prefix + '\\.([A-Za-z0-9_.]+)\\]\\s*:', 'g');
  return [...read(rel).matchAll(pattern)].map((m) => m[1]);
}

/** The language a catalogue registers itself as, for the report's headings. */
function registeredLocale(rel) {
  const found = /(?:i18nRegister|logRegisterStrings)\(Locale\.([A-Za-z0-9_]+)/.exec(read(rel));
  return found ? found[1] : '(unregistered)';
}

// --- the report ------------------------------------------------------------

/**
 * One family: a reference file naming every key, and the translations beside it.
 *
 * Both families work the same way -- the difference is only which constant the
 * keys are spelt with -- so they share this rather than being two reports that
 * drift.
 */
function reportFamily(label, referenceFile, translationFiles, prefix, allKeys) {
  const reference = new Set(cataloguedKeys(referenceFile, prefix));
  console.log('\n' + label + ' -- ' + reference.size + ' strings, reference is src/' + referenceFile);

  // A key declared but never given text anywhere: only possible for UiText,
  // whose enum is separate from the catalogue. Reported against the reference.
  const undeclared = allKeys.filter((key) => !reference.has(key));
  if (undeclared.length) {
    console.log('  src/' + referenceFile + ' has no text for: ' + undeclared.join(', '));
  }

  for (const file of translationFiles) {
    const answered = new Set(cataloguedKeys(file, prefix));
    const missing = [...reference].filter((key) => !answered.has(key));
    const done = reference.size - missing.length;
    const percent = reference.size === 0 ? 100 : Math.round((done / reference.size) * 100);
    console.log('  ' + registeredLocale(file) + ' (src/' + file + '): '
      + done + '/' + reference.size + ' (' + percent + '%)');
    if (missing.length) {
      console.log('    missing: ' + missing.join(', '));
    }
  }
}

// --- unused keys -----------------------------------------------------------

/**
 * Comments out, so a key named only in one reads as unused.
 *
 * That is the case worth catching: the commented-out Formal Beast dropdown entry
 * still spells its key, and counting it would hide the very row this report
 * exists to surface. Rough on purpose -- a `//` inside a string literal would be
 * cut too, and no file here has one carrying a `UiText.` after it.
 */
function withoutComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Every `UiText.X` a source file names, plus every `data-i18n` the markup does.
 *
 * The catalogues are skipped: they answer keys rather than use them, so counting
 * them would make every key look used.
 */
function usedUiKeys(members) {
  const used = new Set();
  const byValue = {};
  for (const name of Object.keys(members)) {
    byValue[members[name]] = name;
  }

  for (const name of fs.readdirSync(srcDir)) {
    if (!/\.(ts|html)$/.test(name) || /^ui[A-Z]/.test(name)) continue;
    const text = withoutComments(read(name));
    for (const [, member] of text.matchAll(/\bUiText\.([A-Za-z0-9_]+)\b/g)) {
      used.add(member);
    }
    for (const [, key] of text.matchAll(/data-i18n="([^"]*)"/g)) {
      const member = byValue[key];
      if (member === undefined) {
        problems.push('src/' + name + ' has data-i18n="' + key + '", which is not a UiText key.');
        continue;
      }
      used.add(member);
    }
  }
  return used;
}

// --- run -------------------------------------------------------------------

const members = uiTextMembers();
const memberNames = Object.keys(members);

reportFamily('UI strings', 'uiEn.ts', sourcesMatching(/^ui(?!En\.ts$)[A-Z].*\.ts$/), 'UiText',
  memberNames);
reportFamily('Log sentences', 'logsEn.ts', sourcesMatching(/^logs(?!En\.ts$)[A-Z].*\.ts$/), 'Log',
  []);

const used = usedUiKeys(members);
const unused = memberNames.filter((name) => !used.has(name));
if (unused.length) {
  console.log('\nDeclared in UiText but named by no page or markup:');
  for (const name of unused) {
    console.log('  UiText.' + name + '  (' + members[name] + ')');
  }
  console.log('  Each is either a string whose row was deleted, or one held for a '
    + 'feature that is commented out. Delete it here and in every catalogue, or say why.');
}

if (problems.length) {
  console.log('');
  for (const problem of problems) {
    console.error('error: ' + problem);
  }
  process.exit(1);
}
console.log('\nNo unnamed keys in the markup.');
