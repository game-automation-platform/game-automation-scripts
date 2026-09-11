#!/usr/bin/env node
// Build a channel and publish it into the catalogue.
//
//   npm run release:alpha | release:beta | release:production
//   node tools/release/release.js --channel Alpha [--dry-run] [--no-build] [--yes]
//
// Builds the archive named in config.json, then writes what the catalogue
// serves -- the zip, a metadata.json describing it, and a running CHANGELOG.md
// of every release cut on the channel -- into <Catalogue>/<Directory>. The hash
// is taken from the bytes just written, so the entry can never describe a build
// other than the one beside it.
//
// metadata.json's top-level fields always describe the newest build, and its
// `Versions` array lists the last `HistoryLimit` of them so the app can offer a
// user any of those to install. Archives past that limit are deleted here: their
// zips live in this repo, so keeping every build ever cut grows it forever.
//
// The release note (`Message`) comes from the `### Summary` bullets of the
// CHANGELOG section for the version being released -- sections are named for
// package.json's version, so there is exactly one candidate. It is rendered as
// Markdown on a phone by the host app, which is why it is a short numbered list
// rather than prose, and why the internal sections below the Summary are not
// consulted at all.
//
// Those bullets are proposed, not taken: `tools/release/review.js` shows the
// rendered note and waits to be told to approve it, edit it or deny it, before
// anything is built. `--yes` skips that gate, and is required when there is no
// terminal to ask on.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { projectDir, loadConfig, resolveChannel, archiveName } = require('./config');
const { bulletsFrom, noteProblem, reviewNote } = require('./review');

// --- the release note ------------------------------------------------------

/**
 * The `### Summary` bullets of `## [<version>]`.
 *
 * Every change is filed under the version package.json is on, so the section to
 * publish is the one named for the version being built. There is no
 * `[Unreleased]` to fall back to.
 */
function summaryBullets(changelog, version) {
  const sections = changelog.split(/^## /m).slice(1);
  const wanted = sections.find((s) => s.startsWith(`[${version}]`));
  if (!wanted) {
    throw new Error(
      `CHANGELOG.md has no "## [${version}]" section. Changes are filed under the ` +
      'version in package.json -- add that section, or bump to the version you meant.');
  }

  const summary = wanted.split(/^### /m).slice(1).find((s) => /^Summary\b/.test(s));
  if (!summary) {
    throw new Error(
      'That CHANGELOG section has no "### Summary" block. The release note is ' +
      'read from it -- add one line per change, written for a player on a phone.');
  }
  return bulletsFrom(summary.split('\n').slice(1).join('\n'));
}

/** Markdown, as the host app's renderer reads it: a bold lead, a numbered list. */
function releaseMessage(bullets, note) {
  const list = bullets.map((b, i) => `${i + 1}. ${b}`).join('\n');
  return `**Changes**\n${list}` + (note ? `\n\n${note}` : '');
}

/**
 * The channel's release notes in the catalogue, one section per version, newest
 * first.
 *
 * metadata.json's `Versions` lists which builds are still installable, but not
 * what any of them changed, so this stays the only place the catalogue records
 * that -- and it keeps a section for a version long after its zip is pruned. A
 * version already in the file is rewritten in place, so re-publishing one cannot
 * leave two sections for it.
 */
function writeCatalogueChangelog(file, channel, bullets, date) {
  const header = `# ${channel.Name}\n\n` +
    `What shipped in each release, newest first. ` +
    (channel.Note ? `\n${channel.Note}\n` : '');
  const section = `## ${channel.Version} - ${date.slice(0, 10)}\n\n` +
    bullets.map((b) => `- ${b}`).join('\n') + '\n';

  let existing = '';
  try {
    existing = fs.readFileSync(file, 'utf8');
  } catch {
    /* first release on this channel */
  }
  const older = existing.split(/^(?=## )/m)
    .filter((s) => s.startsWith('## ') && !s.startsWith(`## ${channel.Version} `))
    .map((s) => s.trimEnd() + '\n');

  fs.writeFileSync(file, [header, section, ...older].join('\n'));
}

// --- publishing ------------------------------------------------------------

function runBuild(channelName) {
  const powershell = process.platform === 'win32';
  const [cmd, args] = powershell
    ? ['powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', './build.ps1', '-Channel', channelName]]
    : ['./build.sh', ['-c', channelName]];
  execFileSync(cmd, args, { cwd: projectDir, stdio: 'inherit' });
}

/** The metadata.json the catalogue served before this release, if any. */
function readPreviousMetadata(target) {
  try {
    return JSON.parse(fs.readFileSync(path.join(target, 'metadata.json'), 'utf8'));
  } catch {
    return undefined;
  }
}

/**
 * The four fields a history row carries.
 *
 * The release note is deliberately not one of them: nothing renders an old
 * version's note -- the app's notes dialog shows the newest, which is what "what
 * changed" means when you are behind -- and one note per version would push
 * official.json toward the 2 MB the app caps a catalogue at. Per-version notes
 * are what CHANGELOG.md is for.
 */
function historyRow(entry) {
  return { Version: entry.Version, Date: entry.Date, Hash: entry.Hash, File: entry.File };
}

/**
 * The version history this release inherits, newest first.
 *
 * A metadata.json written before histories existed has no `Versions`, so its own
 * top-level fields are the one release it knows about. That is the migration:
 * the first release after this change picks up its predecessor for free.
 */
function priorVersions(previous) {
  if (!previous) return [];
  if (Array.isArray(previous.Versions)) return previous.Versions.filter((v) => v && v.Version && v.File);
  if (!previous.Version || !previous.File) return [];
  return [historyRow(previous)];
}

/** 'YYYY-MM-DD HH:MM:SS' in UTC -- the shape the catalogue entry has always had. */
function utcTimestamp(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const dryRun = argv.includes('--dry-run');
  const skipBuild = argv.includes('--no-build');
  const skipReview = argv.includes('--yes') || argv.includes('-y');

  const config = loadConfig();
  const channel = resolveChannel(config, flag('--channel'));
  const archive = archiveName(channel);

  // The note is settled first: a missing Summary, or one nobody approved, should
  // stop the release before a build runs rather than after one.
  const changelogFile = path.join(projectDir, 'CHANGELOG.md');
  const changelog = fs.readFileSync(changelogFile, 'utf8');
  const limit = config.MessageMaxChars || 600;
  const render = (lines) => releaseMessage(lines, channel.Note);

  let bullets = summaryBullets(changelog, channel.Version);
  let message = render(bullets);

  if (skipReview) {
    const problem = noteProblem(bullets, message, limit);
    if (problem) throw new Error(problem);
  } else {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error(
        'The release note has to be approved, and there is no terminal to ask on. ' +
        'Run this interactively, or pass --yes to publish the CHANGELOG Summary as it stands.');
    }
    const reviewed = await reviewNote({
      bullets, channel, limit, render, changelogFile, allowSave: !dryRun,
    });
    if (!reviewed.approved) {
      throw new Error('Denied -- nothing was built, and nothing was published.');
    }
    ({ bullets, message } = reviewed);
  }

  console.log(`\nReleasing ${channel.Name} ${channel.Version} (${archive})`);
  if (skipBuild) console.log('Skipping the build (--no-build).');
  else runBuild(channel.name);

  const builtArchive = path.join(projectDir, archive);
  if (!fs.existsSync(builtArchive)) throw new Error(`The build produced no ${archive}.`);

  const bytes = fs.readFileSync(builtArchive);
  const metadata = {
    Game: config.Game,
    Name: channel.Name,
    Version: channel.Version,
    Date: utcTimestamp(new Date()),
    Hash: crypto.createHash('sha256').update(bytes).digest('hex'),
    File: archive,
    Message: message,
  };

  const target = path.join(path.resolve(projectDir, config.Catalogue), channel.Directory);
  const inherited = priorVersions(readPreviousMetadata(target));

  // The history the app's version menu offers, newest first: this release at the
  // head, then what came before. Re-publishing a version replaces its row rather
  // than adding a second -- the same rule writeCatalogueChangelog follows for a
  // section, and for the same reason.
  const historyLimit = config.HistoryLimit || 5;
  metadata.Versions = [historyRow(metadata)]
    .concat(inherited.filter((v) => v.Version !== metadata.Version))
    .slice(0, historyLimit);

  // Archives that just fell off the end of the history. Nothing points at them
  // any more, and a catalogue that keeps every build it ever cut is a repo that
  // grows without bound, so they go. Scoped to this channel's directory, so
  // pruning Alpha can never reach into Beta.
  const kept = new Set(metadata.Versions.map((v) => v.File));
  const pruned = inherited
    .map((v) => v.File)
    .filter((file, i, all) => !kept.has(file) && all.indexOf(file) === i)
    .filter((file) => fs.existsSync(path.join(target, file)));

  console.log(`\n${JSON.stringify(metadata, null, 2)}\n`);
  if (dryRun) {
    console.log(`Dry run -- nothing written. Would have published to ${target}, CHANGELOG.md included.`);
    pruned.forEach((file) => console.log(`  would prune ${file} (past the ${historyLimit} kept)`));
    return;
  }

  fs.mkdirSync(target, { recursive: true });

  fs.writeFileSync(path.join(target, archive), bytes);
  fs.writeFileSync(path.join(target, 'metadata.json'), JSON.stringify(metadata, null, 2) + '\n');
  writeCatalogueChangelog(path.join(target, 'CHANGELOG.md'), channel, bullets, metadata.Date);
  pruned.forEach((file) => fs.rmSync(path.join(target, file)));

  console.log(`Published to ${target}`);
  console.log(`  ${archive}  (${bytes.length} bytes)`);
  console.log('  metadata.json');
  console.log(`  CHANGELOG.md  (the ${channel.Version} section)`);
  console.log(`\nInstallable versions (${metadata.Versions.length} of ${historyLimit} kept):`);
  metadata.Versions.forEach((v, i) => console.log(`  ${v.Version}${i === 0 ? '  (latest)' : ''}  ${v.File}`));
  pruned.forEach((file) => console.log(`\nPruned ${file} -- past the ${historyLimit} kept. Stage the deletion when you commit.`));
  console.log('\nRun build-official.ps1 in the catalogue to fold this into official.json, then commit there.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
