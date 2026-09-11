#!/usr/bin/env node
// Print the archive name for a channel, so build.sh can name its zip without
// parsing JSON in shell. build.ps1 does the same thing in PowerShell.
//
//   node tools/release/archive.js [channel]

const { loadConfig, resolveChannel, archiveName } = require('./config');

try {
  process.stdout.write(archiveName(resolveChannel(loadConfig(), process.argv[2])));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
