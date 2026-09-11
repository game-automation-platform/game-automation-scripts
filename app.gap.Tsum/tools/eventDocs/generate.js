#!/usr/bin/env node
// Render EVENTS.md: every `emitEvent` this script makes, what it carries, and
// where it is made from.
//
//   npm run events:docs             write EVENTS.md
//   npm run events:docs:check       verify it is current without writing
//
// Also run from build.sh / build.ps1 during compilation, beside the page docs,
// so the committed document is never a version behind the code it describes.
//
// ## Why it reads the sources rather than the bundle
//
// `tools/pageDocs` asks the *built* router for its dispatch order, because that
// order is computed and a second implementation of it would be a second copy of
// the rule. Nothing is computed here: an emit is a call site. What matters about
// one is the two things a bundle throws away -- which file and line it is on,
// and what type each payload field has -- so this reads the TypeScript program
// instead, with the same compiler the build uses.
//
// That also resolves `Emit.Round.Start` to `'round.start'` honestly: the checker
// gives the const enum's value, so a member renamed without its string changing
// (or the other way round) shows up here as itself.
//
// ## What it checks
//
// Three things are errors rather than notes:
//
//   * an emit whose name is not a compile-time constant -- a consumer cannot
//     match on a name that is only known at runtime, and this document cannot
//     state it either
//   * a name emitted that `Emit` (src/scriptEvents.ts) does not declare, which
//     is the no-reused-string-literals rule for this vocabulary
//   * the same event emitted with disagreeing payload shapes, since the shape is
//     the interface and one caller quietly dropping a field breaks a consumer
//
// A member of `Emit` that nothing emits is a note, not an error: a vocabulary
// may legitimately run ahead of the call sites.
//
// `--check` turns a stale file into a non-zero exit as well, for CI.

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const projectDir = path.resolve(__dirname, '..', '..');
const outFile = path.join(projectDir, 'EVENTS.md');
const vocabularyFile = 'src/scriptEvents.ts';

/** Callees that broadcast: the host global, the guarded free function, `ts.emit`. */
const EmitCallees = new Set(['emitEvent', 'emitScriptEvent', 'emit']);

// --- reading the program ---------------------------------------------------

function openProgram() {
  const configPath = path.join(projectDir, 'tsconfig.json');
  const raw = ts.readConfigFile(configPath, ts.sys.readFile);
  if (raw.error) {
    throw new Error(ts.flattenDiagnosticMessageText(raw.error.messageText, '\n'));
  }
  const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, projectDir);
  return ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true });
}

/** `src/tsum.ts:1312`, always with forward slashes so the document reads the same on Windows. */
function where(sourceFile, node) {
  const rel = path.relative(projectDir, sourceFile.fileName).split(path.sep).join('/');
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { file: rel, line: line + 1, label: `${rel}:${line + 1}` };
}

/**
 * The `Emit` vocabulary as declared: member path -> string value.
 *
 * Read off the AST rather than by importing, because the namespace and its const
 * enums are erased at build time and there is nothing to import at runtime.
 */
function readVocabulary(program) {
  const declared = [];
  const file = program.getSourceFiles()
    .find((f) => f.fileName.endsWith('/' + vocabularyFile) || f.fileName.endsWith('\\' + path.basename(vocabularyFile)));
  if (!file) return declared;

  const checker = program.getTypeChecker();
  const visit = (node, trail) => {
    if (ts.isModuleDeclaration(node) && node.body) {
      visit(node.body, trail.concat(node.name.text));
      return;
    }
    if (ts.isModuleBlock(node)) {
      node.statements.forEach((s) => visit(s, trail));
      return;
    }
    if (ts.isEnumDeclaration(node)) {
      const group = trail.concat(node.name.text);
      node.members.forEach((member) => {
        const value = checker.getConstantValue(member);
        declared.push({
          path: group.concat(member.name.getText(file)).join('.'),
          value: typeof value === 'string' ? value : null,
          doc: docOf(checker, member),
        });
      });
    }
  };
  file.statements.forEach((s) => visit(s, []));
  return declared;
}

/** The JSDoc on a declaration, as one line, or ''. Through the symbol: `node.jsDoc` is internal. */
function docOf(checker, node) {
  const symbol = checker.getSymbolAtLocation(node.name);
  if (!symbol) return '';
  return ts.displayPartsToString(symbol.getDocumentationComment(checker))
    .replace(/\s+/g, ' ')
    .trim();
}

// --- finding the emits -----------------------------------------------------

/** `emit`, `emitEvent`, ... plus how it was written, for the document. */
function calleeOf(node, sourceFile) {
  const target = node.expression;
  if (ts.isIdentifier(target)) return { name: target.text, written: target.text };
  if (ts.isPropertyAccessExpression(target)) {
    return { name: target.name.text, written: target.getText(sourceFile) };
  }
  return null;
}

/**
 * The payload's fields, as `{name, type}`.
 *
 * Literal types are widened -- `{n: 1}` documents `number`, not `1` -- because
 * the shape is the interface and the one call site's value is not part of it.
 * A payload that is not an object literal is documented as its whole type,
 * which is the honest answer for one built elsewhere.
 */
function shapeOf(checker, sourceFile, argument) {
  if (argument === undefined) return { kind: 'none', fields: [] };

  if (!ts.isObjectLiteralExpression(argument)) {
    const type = checker.typeToString(checker.getTypeAtLocation(argument));
    return { kind: 'opaque', text: argument.getText(sourceFile), type, fields: [] };
  }

  const fields = [];
  for (const property of argument.properties) {
    if (ts.isSpreadAssignment(property)) {
      fields.push({ name: '…' + property.expression.getText(sourceFile), type: 'spread' });
      continue;
    }
    const name = property.name ? property.name.getText(sourceFile).replace(/^['"]|['"]$/g, '') : '?';
    const value = ts.isPropertyAssignment(property) ? property.initializer : property.name;
    const widened = checker.getBaseTypeOfLiteralType(checker.getTypeAtLocation(value));
    fields.push({ name, type: checker.typeToString(widened) });
  }
  return { kind: 'object', fields };
}

/** Every emit call in `src/`, in source order. */
function findEmits(program) {
  const checker = program.getTypeChecker();
  const calls = [];

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    if (!sourceFile.fileName.replace(/\\/g, '/').includes('/src/')) continue;

    const visit = (node) => {
      if (ts.isCallExpression(node)) {
        const callee = calleeOf(node, sourceFile);
        // A call that passes its own `name` parameter straight on is the
        // plumbing -- `Tsum.prototype.emit` and `emitScriptEvent` -- not an
        // emit, and has no name to resolve.
        if (callee && EmitCallees.has(callee.name) && !forwardsAParameter(checker, node)) {
          const nameArg = node.arguments[0];
          const constant = nameArg === undefined ? undefined : checker.getConstantValue(nameArg);
          const literal = nameArg !== undefined && ts.isStringLiteralLike(nameArg)
            ? nameArg.text : undefined;
          calls.push({
            at: where(sourceFile, node),
            via: callee.written,
            source: nameArg === undefined ? '' : nameArg.getText(sourceFile),
            name: typeof constant === 'string' ? constant : literal,
            shape: shapeOf(checker, sourceFile, node.arguments[1]),
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return calls;
}

/** Whether the name argument is just a parameter being handed on. */
function forwardsAParameter(checker, call) {
  const nameArg = call.arguments[0];
  if (nameArg === undefined || !ts.isIdentifier(nameArg)) return false;
  const symbol = checker.getSymbolAtLocation(nameArg);
  const declaration = symbol && symbol.valueDeclaration;
  return declaration !== undefined && declaration !== null && ts.isParameter(declaration);
}

// --- checking --------------------------------------------------------------

function findings(calls, declared) {
  const errors = [];
  const notes = [];
  const known = new Map(declared.filter((d) => d.value).map((d) => [d.value, d]));

  for (const call of calls) {
    if (call.name === undefined) {
      errors.push('`' + call.at.label + '` emits `' + call.source + '`, whose value is not known at '
        + 'compile time. A consumer cannot match on that, and this document cannot state it.');
      continue;
    }
    if (!known.has(call.name)) {
      errors.push('`' + call.at.label + '` emits `' + call.name + '`, which `' + vocabularyFile
        + '` does not declare. Every emitted name belongs in `Emit`, once.');
    }
  }

  for (const [name, group] of byEvent(calls)) {
    const shapes = new Set(group.map((c) => fieldList(c.shape)));
    if (shapes.size > 1) {
      errors.push('`' + name + '` is emitted with ' + shapes.size + ' different payload shapes ('
        + group.map((c) => c.at.label).join(', ') + '). The shape is the interface: a caller that '
        + 'leaves a field out breaks a consumer that reads it.');
    }
  }

  const emitted = new Set(calls.map((c) => c.name));
  for (const entry of declared) {
    if (entry.value && !emitted.has(entry.value)) {
      notes.push('`' + entry.path + '` (`' + entry.value + '`) is declared and never emitted.');
    }
  }

  return { errors, notes };
}

/** Event name -> its call sites, in the order the names were first seen. */
function byEvent(calls) {
  const groups = new Map();
  for (const call of calls) {
    if (call.name === undefined) continue;
    if (!groups.has(call.name)) groups.set(call.name, []);
    groups.get(call.name).push(call);
  }
  return groups;
}

const fieldList = (shape) => shape.fields.map((f) => f.name).sort().join(',') || shape.kind;

// --- rendering -------------------------------------------------------------

const cell = (text) => String(text === undefined || text === null ? '' : text).replace(/\|/g, '\\|');

function table(headers, rows) {
  const out = ['| ' + headers.join(' | ') + ' |'];
  out.push('|' + headers.map(() => '---').join('|') + '|');
  for (const row of rows) out.push('| ' + row.map(cell).join(' | ') + ' |');
  return out.join('\n');
}

function render(calls, declared, found) {
  const groups = byEvent(calls);
  const byValue = new Map(declared.filter((d) => d.value).map((d) => [d.value, d]));
  const out = [];

  out.push('# Emitted events');
  out.push('');
  out.push('<!-- Generated by `npm run events:docs`. Do not edit: every row below is read');
  out.push('     out of the `emitEvent` call sites, so a change here is lost on the next');
  out.push('     build and a change in src/ shows up here on its own. -->');
  out.push('');
  out.push('What this script broadcasts to tooling following a run, and what each event');
  out.push('carries. The host defines none of it: `emitEvent(name, data)` hands a line to');
  out.push('whichever consumers are attached, adding only a sequence number, a UTC');
  out.push('timestamp and the script id. The transport, the two sockets and the wire');
  out.push('format are the host\'s document --');
  out.push('`../game-automation-app/docs/EVENTS.md`.');
  out.push('');
  out.push('Names are declared once, in `' + vocabularyFile + '`, and reached through');
  out.push('`ts.emit()`, which is silent on a host too old to have `emitEvent`.');
  out.push('');
  out.push('`' + groups.size + '` event(s) from `' + calls.length + '` call site(s).');
  out.push('');

  out.push(table(['event', 'emitted from', 'payload'],
    [...groups].map(([name, group]) => [
      '`' + name + '`',
      group.map((c) => '`' + c.at.label + '`').join('<br>'),
      group[0].shape.fields.map((f) => '`' + f.name + '`').join(', ') || '_none_',
    ])));
  out.push('');

  out.push('## The events');
  out.push('');

  for (const [name, group] of groups) {
    const entry = byValue.get(name);
    out.push('### `' + name + '`');
    out.push('');
    if (entry) {
      out.push('`' + entry.path + '`' + (entry.doc ? ' — ' + entry.doc : ''));
      out.push('');
    }

    const shape = group[0].shape;
    if (shape.kind === 'object' && shape.fields.length) {
      out.push(table(['field', 'type'], shape.fields.map((f) => ['`' + f.name + '`', '`' + f.type + '`'])));
    } else if (shape.kind === 'opaque') {
      out.push('Payload built elsewhere: `' + shape.text + '`, of type `' + shape.type + '`.');
    } else {
      out.push('No payload. The host sends `{}`.');
    }
    out.push('');

    out.push('Emitted from:');
    out.push('');
    for (const call of group) {
      out.push('- `' + call.at.label + '` — `' + call.via + '(' + call.source + (
        call.shape.kind === 'none' ? '' : ', …') + ')`');
    }
    out.push('');
  }

  if (found.errors.length) {
    out.push('## Problems');
    out.push('');
    for (const error of found.errors) out.push('- ' + error);
    out.push('');
  }

  if (found.notes.length) {
    out.push('## Declared, not emitted');
    out.push('');
    out.push('Names `Emit` carries that no call site uses. Not a fault on its own -- a');
    out.push('vocabulary may run ahead of the code -- but a long-standing one is usually a');
    out.push('rename that only landed on one side.');
    out.push('');
    for (const note of found.notes) out.push('- ' + note);
    out.push('');
  }

  return out.join('\n');
}

// --- entry point -----------------------------------------------------------

function main() {
  const check = process.argv.includes('--check');
  const program = openProgram();
  const declared = readVocabulary(program);
  const calls = findEmits(program);
  const found = findings(calls, declared);
  const text = render(calls, declared, found);

  for (const note of found.notes) console.log('note: ' + note);
  for (const error of found.errors) console.error('error: ' + error);

  const current = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
  if (check) {
    if (current !== text) {
      console.error('EVENTS.md is out of date. Run `npm run events:docs`.');
      process.exit(1);
    }
    console.log('EVENTS.md is current (' + byEvent(calls).size + ' events, '
      + calls.length + ' call sites).');
  } else if (current === text) {
    console.log('EVENTS.md is unchanged (' + byEvent(calls).size + ' events, '
      + calls.length + ' call sites).');
  } else {
    fs.writeFileSync(outFile, text);
    console.log('wrote EVENTS.md (' + byEvent(calls).size + ' events, '
      + calls.length + ' call sites).');
  }

  if (found.errors.length) process.exit(1);
}

main();
