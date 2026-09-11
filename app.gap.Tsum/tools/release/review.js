// The gate in front of the release note.
//
// CHANGELOG.md's `### Summary` block used to go straight into the catalogue
// entry, sight unseen. This renders what the app will actually show and stops
// there: approve it, edit it in $EDITOR, or deny -- and a denied note means
// nothing is built and nothing is published, since the review runs before the
// build.
//
// An approved edit can be written back into CHANGELOG.md, so the section stays
// what the release published rather than drifting from it. That write-back is
// the only reason this file touches the repo at all.

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('node:readline/promises');
const { execFileSync } = require('child_process');

/** The `- `/`* ` lines of `text`. The Summary's bullet rule, in one place. */
function bulletsFrom(text) {
  return text.split('\n')
    .map((line) => line.match(/^[-*]\s+(.*\S)\s*$/))
    .filter(Boolean)
    .map((m) => m[1]);
}

/**
 * Why this note cannot ship, or undefined.
 *
 * The same check guards an approval and a `--yes` run, so an edited note is held
 * to exactly what the changelog's own bullets are held to.
 */
function noteProblem(bullets, message, limit) {
  if (!bullets.length) {
    return 'The note has no bullets. One line per change, written for a player on a phone.';
  }
  if (message.length > limit) {
    return `The note is ${message.length} characters, over the ${limit} in config.json. ` +
      'Shorten it -- it is read on a phone.';
  }
  return undefined;
}

// --- editing ---------------------------------------------------------------

/** $VISUAL, $EDITOR, or the platform default. A value may carry flags (`code --wait`). */
function editorCommand() {
  const raw = (process.env.VISUAL || process.env.EDITOR || '').trim();
  if (raw) {
    const parts = raw.split(/\s+/);
    return [parts[0], parts.slice(1)];
  }
  return process.platform === 'win32' ? ['notepad', []] : ['vi', []];
}

/**
 * Open the bullets in an editor and read back what was saved.
 *
 * Returns the new bullets, or undefined if the editor could not be run -- the
 * caller keeps what it had rather than losing it.
 */
function editBullets(bullets, channel) {
  const [cmd, args] = editorCommand();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gap-release-'));
  const file = path.join(dir, 'release-note.md');
  const header = [
    `# The release note for ${channel.Name} ${channel.Version}.`,
    '# One bullet per line, starting with "- ". Lines starting with # are ignored.',
    '# One line per change, and only what a player sees. Save and close to continue.',
    '',
  ].join('\n');

  try {
    fs.writeFileSync(file, header + bullets.map((b) => `- ${b}`).join('\n') + '\n');
    execFileSync(cmd, [...args, file], { stdio: 'inherit' });
    return bulletsFrom(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.log(`\n  Could not run the editor (${cmd}): ${err.message}`);
    console.log('  Set $EDITOR to something that blocks until you close it, e.g. "code --wait".');
    return undefined;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// --- writing an edit back --------------------------------------------------

/**
 * `changelog` with the `### Summary` block of `## [<version>]` replaced.
 *
 * Only that block's lines are touched: the section's other headings, and every
 * other section, come back byte for byte.
 */
function replaceSummary(changelog, version, bullets) {
  const lines = changelog.split('\n');
  const start = lines.findIndex((l) => l.trim() === `## [${version}]`);
  if (start < 0) throw new Error(`CHANGELOG.md has no "## [${version}]" section to write into.`);

  const next = lines.findIndex((l, i) => i > start && /^## /.test(l));
  const sectionEnd = next < 0 ? lines.length : next;
  const head = lines.findIndex((l, i) => i > start && i < sectionEnd && /^### Summary\b/.test(l));
  if (head < 0) throw new Error(`The [${version}] section has no "### Summary" block to write into.`);

  let stop = head + 1;
  while (stop < sectionEnd && !/^###? /.test(lines[stop])) stop++;
  while (stop > head + 1 && lines[stop - 1].trim() === '') stop--; // keep the blank line before the next heading

  return [
    ...lines.slice(0, head + 1),
    ...bullets.map((b) => `- ${b}`),
    ...lines.slice(stop),
  ].join('\n');
}

// --- the prompt ------------------------------------------------------------

function printNote(channel, message, bullets, limit, problem) {
  const rule = '─'.repeat(64);
  console.log(`\n${rule}`);
  console.log(`Release note -- ${channel.Name} ${channel.Version}`);
  console.log(`${rule}\n`);
  console.log(message.split('\n').map((l) => (l ? `  ${l}` : '')).join('\n'));
  console.log(`\n${rule}`);
  console.log(`${bullets.length} bullet${bullets.length === 1 ? '' : 's'}, ` +
    `${message.length} of ${limit} characters`);
  if (problem) console.log(`\nCannot ship as it stands: ${problem}`);
}

/**
 * Show the note and wait for a decision.
 *
 * `render` is the caller's own note renderer, so what is reviewed is what ships
 * -- an edit is re-rendered through it rather than approximated here. Returns
 * `{approved, bullets, message}`; `approved` false is a deny, and the caller
 * publishes nothing.
 */
async function reviewNote({ bullets, channel, limit, render, changelogFile, allowSave }) {
  let current = bullets.slice();
  let edited = false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  // A question asked after stdin ends never resolves on its own, which would
  // leave the release exiting silently and looking like a success. Racing the
  // interface's own close makes an ended input an answer of its own.
  const closed = new Promise((resolve) => rl.once('close', () => resolve(undefined)));
  const ask = async (prompt) => {
    const answer = await Promise.race([rl.question(prompt).catch(() => undefined), closed]);
    return answer === undefined ? undefined : answer.trim().toLowerCase();
  };

  try {
    for (;;) {
      const message = render(current);
      const problem = noteProblem(current, message, limit);
      printNote(channel, message, current, limit, problem);

      const answer = await ask('\n[a]pprove  [e]dit  [d]eny  > ');
      if (answer === undefined) {
        console.log('\nInput ended -- taking that as a deny.');
        return { approved: false, bullets: current, message };
      }

      if (/^(a|approve|y|yes)$/.test(answer)) {
        if (problem) {
          console.log('\nNot as it stands -- edit it or deny.');
          continue;
        }
        if (edited) await saveEdit(ask, current, channel, changelogFile, allowSave);
        return { approved: true, bullets: current, message };
      }

      if (/^(e|edit)$/.test(answer)) {
        // The editor inherits this terminal, so stop reading it first or a
        // full-screen editor and this prompt fight over the same keystrokes.
        rl.pause();
        const next = editBullets(current, channel);
        rl.resume();
        if (next && next.join('\n') !== current.join('\n')) {
          current = next;
          edited = true;
        }
        continue;
      }

      if (/^(d|deny|n|no|q|quit)$/.test(answer)) {
        return { approved: false, bullets: current, message };
      }

      console.log('\nAnswer a, e or d.');
    }
  } finally {
    rl.close();
  }
}

/** Offer to put an approved edit back in CHANGELOG.md, so the two cannot drift. */
async function saveEdit(ask, bullets, channel, changelogFile, allowSave) {
  if (!allowSave) {
    console.log('\nDry run -- the edit was not written to CHANGELOG.md.');
    return;
  }
  const answer = await ask(
    `\nWrite these bullets back into CHANGELOG.md's [${channel.Version}] Summary? [Y/n] `);
  if (answer === undefined || /^(n|no)$/.test(answer)) {
    console.log('Left CHANGELOG.md alone -- the release note and the section now differ.');
    return;
  }
  const changelog = fs.readFileSync(changelogFile, 'utf8');
  fs.writeFileSync(changelogFile, replaceSummary(changelog, channel.Version, bullets));
  console.log(`Wrote the [${channel.Version}] Summary in CHANGELOG.md.`);
}

module.exports = { bulletsFrom, noteProblem, replaceSummary, reviewNote };
