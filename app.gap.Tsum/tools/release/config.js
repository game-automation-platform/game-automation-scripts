// config.json, and the two things derived from it.
//
// config.json is the release identity: the game and one entry per channel
// (Alpha / Beta / Production). The version is package.json's, so npm and the
// release cannot disagree about what this is. build.sh, build.ps1 and
// release.js all name the archive from these two, so a build and the
// metadata.json that ships beside it cannot disagree about what was built.

const fs = require('fs');
const path = require('path');

const projectDir = path.resolve(__dirname, '..', '..');
const configFile = path.join(projectDir, 'config.json');
const packageFile = path.join(projectDir, 'package.json');

function loadConfig() {
  return JSON.parse(fs.readFileSync(configFile, 'utf8'));
}

/** The script version -- package.json is the one place it lives. */
function loadVersion() {
  const version = JSON.parse(fs.readFileSync(packageFile, 'utf8')).version;
  if (!version) throw new Error('package.json has no "version" -- it is the release version.');
  return version;
}

/**
 * The channel entry for `key`, or the default channel when key is empty.
 *
 * `Status` is the lowest `SkillStatus` the channel offers, and is required
 * rather than defaulted: the build stamps it into src/skillOptions.ts, and a
 * channel that had lost it would quietly widen -- an unfinished skill listed to
 * everyone, which looks like a working build.
 */
function resolveChannel(config, key) {
  const name = key || config.DefaultChannel;
  const channel = config.Channels[name];
  if (!channel) {
    const known = Object.keys(config.Channels).join(', ');
    throw new Error(`Unknown channel "${name}". config.json knows: ${known}.`);
  }
  if (!Number.isInteger(channel.Status) || channel.Status < 0 || channel.Status > 2) {
    throw new Error(
      `Channel "${name}" has no valid "Status" in config.json. It is the lowest ` +
      'skill status the channel ships: 0 Alpha, 1 Beta, 2 Production.');
  }
  return { name, ...channel, Version: loadVersion() };
}

/** `TsumTsum-Alpha-0.1.zip` -- what the build writes and the catalogue serves. */
function archiveName(channel) {
  return `${channel.Archive}-${channel.Version}.zip`;
}

module.exports = {
  projectDir, configFile, packageFile, loadConfig, loadVersion, resolveChannel, archiveName,
};
