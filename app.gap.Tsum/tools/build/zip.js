// A minimal ZIP writer, so the release archive is made the same way from every
// shell.
//
// build.sh shelled out to `zip` and build.ps1 to `Compress-Archive`. Those two
// disagree about entry order and metadata, so the same dist/ produced two
// different archives and two different SHA256 sidecars depending on which shell
// ran the build. Node makes one archive from one code path.
//
// Deliberately small: stored or deflated entries, no directories, no zip64.
// dist/ is a handful of files and none of them is near 4GB.
//
// Needs Node >= 20.15 for zlib.crc32 (see package.json's `engines`).

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const VERSION = 20; // "2.0" -- the feature level deflate needs, and all we use

/** MS-DOS date/time: the only clock the format has. From 1980, 2-second steps. */
function dosStamp(when) {
  const year = Math.max(1980, when.getFullYear());
  return {
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
  };
}

/** Read one file and decide how it goes in. Deflate unless it would grow. */
function readEntry(dir, name) {
  const file = path.join(dir, name);
  const raw = fs.readFileSync(file);
  const deflated = zlib.deflateRawSync(raw, { level: 9 });
  const smaller = deflated.length < raw.length;
  return {
    name,
    size: raw.length,
    body: smaller ? deflated : raw,
    method: smaller ? 8 : 0,
    crc: zlib.crc32(raw),
    stamp: dosStamp(fs.statSync(file).mtime),
  };
}

function localHeader(entry) {
  const head = Buffer.alloc(30);
  head.writeUInt32LE(LOCAL_SIG, 0);
  head.writeUInt16LE(VERSION, 4);
  head.writeUInt16LE(0, 6);                    // flags
  head.writeUInt16LE(entry.method, 8);
  head.writeUInt16LE(entry.stamp.time, 10);
  head.writeUInt16LE(entry.stamp.date, 12);
  head.writeUInt32LE(entry.crc, 14);
  head.writeUInt32LE(entry.body.length, 18);
  head.writeUInt32LE(entry.size, 22);
  head.writeUInt16LE(Buffer.byteLength(entry.name), 26);
  head.writeUInt16LE(0, 28);                   // extra field
  return Buffer.concat([head, Buffer.from(entry.name, 'utf8')]);
}

function centralHeader(entry, offset) {
  const head = Buffer.alloc(46);
  head.writeUInt32LE(CENTRAL_SIG, 0);
  head.writeUInt16LE(VERSION, 4);              // made by: MS-DOS, 2.0
  head.writeUInt16LE(VERSION, 6);              // needed to extract
  head.writeUInt16LE(0, 8);                    // flags
  head.writeUInt16LE(entry.method, 10);
  head.writeUInt16LE(entry.stamp.time, 12);
  head.writeUInt16LE(entry.stamp.date, 14);
  head.writeUInt32LE(entry.crc, 16);
  head.writeUInt32LE(entry.body.length, 20);
  head.writeUInt32LE(entry.size, 24);
  head.writeUInt16LE(Buffer.byteLength(entry.name), 28);
  head.writeUInt16LE(0, 30);                   // extra field
  head.writeUInt16LE(0, 32);                   // comment
  head.writeUInt16LE(0, 34);                   // disk number
  head.writeUInt16LE(0, 36);                   // internal attributes
  head.writeUInt32LE(0, 38);                   // external attributes
  head.writeUInt32LE(offset, 42);              // where its local header is
  return Buffer.concat([head, Buffer.from(entry.name, 'utf8')]);
}

/**
 * Zip every file directly inside `dir` into `archivePath`, sorted by name.
 * @returns {string[]} the entry names, in the order they were written
 */
function zipDirectory(dir, archivePath) {
  const names = fs.readdirSync(dir)
    .filter((name) => fs.statSync(path.join(dir, name)).isFile())
    .sort();

  const bodies = [];
  const central = [];
  let offset = 0;
  for (const name of names) {
    const entry = readEntry(dir, name);
    const head = localHeader(entry);
    central.push(centralHeader(entry, offset));
    bodies.push(head, entry.body);
    offset += head.length + entry.body.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(EOCD_SIG, 0);
  end.writeUInt16LE(0, 4);                     // this disk
  end.writeUInt16LE(0, 6);                     // disk the directory starts on
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);                    // archive comment

  fs.writeFileSync(archivePath, Buffer.concat([...bodies, directory, end]));
  return names;
}

module.exports = { zipDirectory };
