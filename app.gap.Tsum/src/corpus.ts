// ---------------------------------------------------------------------------
// Corpus recorder
//
// When the script cannot tell what is on screen, the useful thing to keep is
// the screen. This writes the frames the detection suite then replays on the
// PC, turning a field failure into a regression test rather than a bug report
// that says "it got stuck sometimes".
//
// Three files per capture, because they answer different questions:
//
//   <tag>_<ts>.png         the full-resolution screen, for reading, annotating
//                          and cutting templates from
//   <tag>_<ts>.scaled.png  exactly what `Tsum.screenshot()` handed the matcher,
//                          so the harness can replay the frame the matcher
//                          really saw instead of simulating the lossy capture
//                          path with a different JPEG encoder
//   <tag>_<ts>.json        the geometry pixels cannot carry, plus what the
//                          matcher made of the screen at the time
//
// Off by default: it writes megabytes and only a developer collecting a corpus
// wants it. Gated on the "Collect unknown screens" setting, rate-limited and
// capped per session -- the same shape as `saveDebugScreenshot` (dialogs.ts)
// and `saveStatsDebugShot` (roundStats.ts), whose limits exist because a stuck
// screen otherwise fills up storage.
// ---------------------------------------------------------------------------

/** Minimum gap between captures. A wedged screen must not fill the disk. */
const CorpusMinIntervalMs = 20 * 1000;
/** Hard stop per script run, in the spirit of roundStats' own dump cap. */
const CorpusMaxPerSession = 40;

Tsum.prototype.corpusDir = function() {
  return this.storagePath + '/' + Config.recordDir + '/corpus';
}

/**
 * Save the current screen for offline page-detection work.
 *
 * `tag` becomes the filename prefix and should say why the frame was kept
 * ('unknown', 'stall', 'manual'). Returns whether anything was written.
 */
Tsum.prototype.saveCorpusFrame = function(tag) {
  if (!this.collectUnknownScreens) {
    return false;
  }
  if (this._corpusShots >= CorpusMaxPerSession) {
    return false;
  }
  if (Date.now() - (this._lastCorpusShot || 0) < CorpusMinIntervalMs) {
    return false;
  }
  this._lastCorpusShot = Date.now();
  this._corpusShots++;

  const dir = this.corpusDir();
  const stamp = tag + '_' + Date.now();
  const base = dir + '/' + stamp;

  // Created here rather than in init() so that leaving the setting off does not
  // scatter empty folders across devices that will never collect anything.
  execute("mkdir -p " + dir);

  // Full resolution first: quality 100, no resize. This is the frame a human
  // reads and a template gets cut from.
  const full = this.dialogScreenshot(this.originScreenWidth, this.originScreenHeight);
  try {
    saveImage(full, base + '.png');
  } catch (e) {
    logWarn(Log.Corpus.SaveFailed, 'Could not save a corpus file',
      { file: base + '.png', errorText: '' + e });
    return false;
  } finally {
    releaseImage(full);
  }

  // Then the matcher's own view, byte for byte. Without it the harness has to
  // reconstruct the downscale and the JPEG pass, and its encoder is not the
  // device's.
  const scaled = this.screenshot();
  try {
    saveImage(scaled, base + '.scaled.png');
  } catch (e) {
    logWarn(Log.Corpus.SaveFailed, 'Could not save a corpus file',
      { file: base + '.scaled.png', errorText: '' + e });
  } finally {
    releaseImage(scaled);
  }

  try {
    writeFile(base + '.json', this.corpusSidecar(tag));
  } catch (e) {
    logWarn(Log.Corpus.SaveFailed, 'Could not save a corpus file',
      { file: base + '.json', errorText: '' + e });
  }

  logInfo(Log.Corpus.Saved, 'Saved an unrecognised screen to the corpus',
    { frame: stamp, shots: this._corpusShots, maxPerSession: CorpusMaxPerSession });
  return true;
}

/**
 * The metadata a screenshot cannot carry.
 *
 * Geometry above all: `toResizeXY` reads captureGameRatio, gameOffsetX/Y and
 * resizeRatio, and on a taller-than-16:9 screen with "special screen ratio" on,
 * gameOffsetY comes from `detectOffsetYInGame()` -- which needs a live screen
 * and cannot be recovered from a still. A frame from such a device is not
 * replayable without this file.
 *
 * Built by hand rather than with JSON.stringify. That was once justified by the
 * runtime being ES5-era; it no longer is -- QuickJS-ng has a full JSON -- so the
 * only remaining reason is that the shape is small, fixed, and its key order is
 * readable in a diff. Fair game to replace, but it is not a compatibility
 * constraint any more.
 */
Tsum.prototype.corpusSidecar = function(tag) {
  const quote = function(s: string): string {
    return '"' + s + '"';
  };
  const num = function(key: string, value: number): string {
    return quote(key) + ': ' + value;
  };
  const bool = function(key: string, value: boolean): string {
    return quote(key) + ': ' + (value ? 'true' : 'false');
  };
  const special = !!(this.settings && this.settings.specialScreenRatio);

  return [
    '{',
    '  ' + quote('tag') + ': ' + quote(tag) + ',',
    '  ' + quote('screen') + ': {' + num('width', this.originScreenWidth) + ', '
        + num('height', this.originScreenHeight) + '},',
    '  ' + quote('geometry') + ': {',
    '    ' + num('gameOffsetX', this.gameOffsetX) + ', ' + num('gameOffsetY', this.gameOffsetY) + ',',
    '    ' + num('gameWidth', this.gameWidth) + ', ' + num('gameHeight', this.gameHeight) + ',',
    '    ' + num('captureGameRatio', this.captureGameRatio) + ', '
        + num('resizeRatio', this.resizeRatio) + ',',
    '    ' + num('playOffsetX', this.playOffsetX) + ', ' + num('playOffsetY', this.playOffsetY) + ',',
    '    ' + num('playWidth', this.playWidth) + ', ' + num('playHeight', this.playHeight),
    '  },',
    '  ' + bool('isJP', this.isJP) + ',',
    // A literal, not SettingKey: this is the sidecar's own field name, read by
    // tools/runtime/load.js. Renaming the setting must not rename it.
    '  ' + bool('specialScreenRatio', special) + ',',
    '  ' + bool('startupPhase', this.isStartupPhase) + ',',
    '  ' + quote('candidates') + ': [' + this.corpusCandidates() + '],',
    '  ' + quote('notes') + ': ' + quote(''),
    '}'
  ].join('\n');
}

/**
 * What the matcher made of the screen, for the sidecar.
 *
 * On an 'unknown' capture the passing list is normally empty and the
 * interesting question is which entry came closest -- so the nearest miss is
 * reported too, with how many of its probes failed. That is usually enough to
 * see whether a fingerprint needs a new probe or a wider threshold before
 * opening the frame at all.
 */
Tsum.prototype.corpusCandidates = function() {
  const img = this.screenshot();
  const parts: string[] = [];
  try {
    let nearestKey = '';
    let nearestFailed = -1;
    for (const key in Page) {
      const match = gPages.score(this, img, key, (Page as PageMap)[key]);
      if (match.pass) {
        parts.push('{"key": "' + key + '", "name": "' + match.page.name
            + '", "score": ' + match.score.toFixed(3) + ', "probes": ' + match.probes + '}');
      } else if (match.probes > 0
          && (nearestFailed < 0 || match.failed.length < nearestFailed)) {
        nearestFailed = match.failed.length;
        nearestKey = key;
      }
    }
    if (parts.length === 0 && nearestKey !== '') {
      parts.push('{"key": "' + nearestKey + '", "matched": false, "probesFailed": '
          + nearestFailed + '}');
    }
  } finally {
    releaseImage(img);
  }
  return parts.join(', ');
}
