// Symbol extraction: every top-level declaration in a source tree, keyed by
// the global name it has once the bundle is concatenated.
//
// The bundle has no modules -- every `src/*.ts` is concatenated into one script,
// so a name is global and a symbol's identity is its name, not its path. That is
// why the key here is `sendHeart` and not `src/tsum.ts:sendHeart`.
//
// Methods are keyed `Owner#name`, which covers both spellings the codebase uses:
// `class Tsum { foo() {} }` and `Tsum.prototype.foo = function () {}` produce
// the same key, so moving a method between the two forms is not a difference.
// Types are keyed `type Name`, and `interface Tsum` is reopened from several
// files, so those accumulate instead of the last one winning.
//
// `tools/codemap/check.js` is the consumer; it is also the general-purpose
// extractor to reuse rather than writing another one.

const path = require('path');
const fs = require('fs');

// Resolved from the script package, which is the only place typescript is a
// dependency. tools/codemap sits two levels below it.
const ts = require(path.resolve(__dirname, '..', '..', 'node_modules', 'typescript'));

/** Directories that are build output, never sources. */
const SkipDirs = new Set(['node_modules', 'build', 'dist']);

function nameOf(node) {
  if (!node.name) return null;
  if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) return node.name.text;
  return null;
}

/**
 * Read `Tsum.prototype.foo = function ...` off an expression statement.
 * Returns `{owner, method}`, or null when the statement is something else.
 */
function prototypeAssignment(stmt) {
  if (!ts.isExpressionStatement(stmt)) return null;
  const expr = stmt.expression;
  if (!ts.isBinaryExpression(expr) || expr.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return null;
  const left = expr.left;
  if (!ts.isPropertyAccessExpression(left)) return null;
  const proto = left.expression;
  if (!ts.isPropertyAccessExpression(proto) || proto.name.text !== 'prototype') return null;
  if (!ts.isIdentifier(proto.expression)) return null;
  return { owner: proto.expression.text, method: left.name.text };
}

function classify(initializer) {
  if (!initializer) return 'value';
  if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) return 'function';
  if (ts.isObjectLiteralExpression(initializer) || ts.isArrayLiteralExpression(initializer)) return 'table';
  if (ts.isAsExpression(initializer)) return classify(initializer.expression);
  return 'value';
}

/**
 * Every top-level declaration in one source file, keyed by global name.
 *
 * Nested functions are deliberately not walked. They have no independent
 * identity in a bundle with one scope, and a change inside one is a change to
 * the enclosing symbol.
 */
function extractFile(filePath, relPath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const source = ts.createSourceFile(relPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const symbols = new Map();

  const add = (key, kind, node) => {
    symbols.set(key, {
      key,
      kind,
      file: relPath,
      line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
    });
  };

  for (const stmt of source.statements) {
    if (ts.isFunctionDeclaration(stmt)) {
      const name = nameOf(stmt);
      if (name) add(name, 'function', stmt);
      continue;
    }
    if (ts.isClassDeclaration(stmt)) {
      const name = nameOf(stmt);
      if (!name) continue;
      // The class itself is not a symbol: its members are.
      for (const member of stmt.members) {
        const memberName = ts.isConstructorDeclaration(member) ? 'constructor' : nameOf(member);
        if (!memberName) continue;
        const kind = ts.isPropertyDeclaration(member) ? 'field' : 'method';
        add(name + '#' + memberName, kind, member);
      }
      continue;
    }
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        add(decl.name.text, classify(decl.initializer), decl);
      }
      continue;
    }
    if (ts.isEnumDeclaration(stmt)) {
      const name = nameOf(stmt);
      if (name) add(name, 'enum', stmt);
      continue;
    }
    // A namespace is one symbol, not one per member: `Log` holds const enums
    // that are erased together, and a member moving between them is a change to
    // the vocabulary rather than to something with its own identity.
    if (ts.isModuleDeclaration(stmt)) {
      const name = nameOf(stmt);
      if (name) add(name, 'namespace', stmt);
      continue;
    }
    if (ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt)) {
      const name = nameOf(stmt);
      // First declaration wins: `interface Tsum` is reopened from ten files and
      // is one symbol, at the file that opened it.
      if (name && !symbols.has('type ' + name)) add('type ' + name, 'type', stmt);
      continue;
    }
    const proto = prototypeAssignment(stmt);
    if (proto) add(proto.owner + '#' + proto.method, 'method', stmt);
  }

  return symbols;
}

/** Every source file under `root`, as `{abs, rel}`, sorted by path. */
function listSources(root) {
  const out = [];
  const walk = (dir, rel) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const abs = path.join(dir, entry.name);
      const r = rel ? rel + '/' + entry.name : entry.name;
      if (entry.isDirectory()) {
        if (SkipDirs.has(entry.name)) continue;
        walk(abs, r);
      } else if (/\.tsx?$/.test(entry.name)) {
        out.push({ abs, rel: r });
      }
    }
  };
  walk(root, '');
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

module.exports = { extractFile, listSources, ts };
