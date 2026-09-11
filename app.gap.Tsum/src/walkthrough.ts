// ---------------------------------------------------------------------------
// Walkthrough recorder: the human drives, the script writes down what happened.
//
// A mode rather than a task. With it on, `buildRun` registers nothing else and
// the recorder never calls `gPages.detect()` -- only `sweep()`, which scores the
// table without broadcasting. That is the whole contract: no subscription fires,
// so nothing taps, so what gets recorded is what the *person* did. A dispatch
// here would have `dismiss.magicalTime` cancelling dialogs out from under them.
//
// What comes out, per visit to a screen:
//
//   which page it was, and which `Page` entry matched
//   how long it was up
//   every tap made while it was up, in screen pixels *and* in the 1080x1920
//   logical space `Button` and `Page` are written in
//   which page followed
//   a frame, subject to the budgets below
//
// Which is the data `docs/transitions.json` is missing: it knows FriendPage
// leads to GiftHeart, and this says it does so when you tap (910, 656). That is
// an anchor, measured -- see BACKLOG.md on routing over declared edges.
//
// Taps are read off the raw Linux input stream by `pollTouchDown` (clickAssist.ts),
// which is why this is possible at all.
// ---------------------------------------------------------------------------

/** Frames kept per page name. Three drawings of a screen is plenty; a heart
 *  loop would otherwise write fifty of the same three. */
const WalkFramesPerPage = 3;
/** Unrecognised screens are the point of the exercise, so they get more. */
const WalkFramesPerUnknown = 12;
/** Hard stop for a session, in the spirit of `CorpusMaxPerSession`. */
const WalkMaxFrames = 200;
/** Visits between rewrites of the session file. There is no append native. */
const WalkFlushEvery = 10;
/** How long a touch poll blocks. Also the loop's cadence when nobody taps. */
const WalkTouchPollSec = 1;

Tsum.prototype.walkthroughDir = function() {
  return this.storagePath + '/' + Config.recordDir + '/walkthrough';
}

/**
 * Full-resolution screen pixels back to the 1080x1920 space the tables use.
 *
 * The inverse of `toRealXY`, and the reason a recorded tap is worth anything: a
 * position in device pixels describes one phone, where a logical one can be
 * pasted into `Button` or read as a `PageDef` anchor.
 */
Tsum.prototype.toLogicalXY = function(x, y) {
  return {
    x: Math.round((x + this.gameOffsetX) / this.captureGameRatio),
    y: Math.round((y + this.gameOffsetY) / this.captureGameRatio)
  };
}

/**
 * Keep the screen, if this page still has frame budget.
 *
 * Both views, as `saveCorpusFrame` writes them: the full-resolution picture a
 * human reads, and the matcher's own downscale so the harness replays the frame
 * the matcher really saw. Returns the basename written, or `''`.
 */
Tsum.prototype.walkSaveFrame = function(seq, page) {
  const budget = page === PageName.Unknown ? WalkFramesPerUnknown : WalkFramesPerPage;
  const taken = this._walkFrames[page] || 0;
  if (taken >= budget || this._walkFrameCount >= WalkMaxFrames) {
    return '';
  }

  let stamp = '' + seq;
  while (stamp.length < 5) {
    stamp = '0' + stamp;
  }
  const name = 'walk' + stamp + '_' + page;
  const base = this.walkthroughDir() + '/' + name;

  const full = this.dialogScreenshot(this.originScreenWidth, this.originScreenHeight);
  try {
    saveImage(full, base + '.png');
  } catch (e) {
    logWarn(Log.Walk.SaveFailed, 'Could not save a walkthrough frame',
      { file: base + '.png', errorText: '' + e });
    return '';
  } finally {
    releaseImage(full);
  }

  const scaled = this.screenshot();
  try {
    saveImage(scaled, base + '.scaled.png');
  } catch (e) {
    logWarn(Log.Walk.SaveFailed, 'Could not save a walkthrough frame',
      { file: base + '.scaled.png', errorText: '' + e });
  } finally {
    releaseImage(scaled);
  }

  // The same sidecar the corpus recorder writes, so a frame pulled off here is
  // replayable by the detection suite without anything else being done to it.
  try {
    writeFile(base + '.json', this.corpusSidecar('walk'));
  } catch (e) {
    logWarn(Log.Walk.SaveFailed, 'Could not save a walkthrough frame',
      { file: base + '.json', errorText: '' + e });
  }

  this._walkFrames[page] = taken + 1;
  this._walkFrameCount++;
  return name;
}

/** The visit being recorded, or undefined before the first one. */
Tsum.prototype.walkCurrentVisit = function() {
  return this._walkVisits.length === 0
    ? undefined
    : this._walkVisits[this._walkVisits.length - 1];
}

/**
 * Note a tap against the screen it was made on.
 *
 * On the *current* visit rather than the next one: a tap is a thing done to the
 * page that is up, and it is that page's anchor even when it is what ends the
 * visit. Several can land on one screen -- a miss, then the button -- and all of
 * them are kept, because which one worked is not knowable from here.
 */
Tsum.prototype.walkRecordTap = function(point) {
  const visit = this.walkCurrentVisit();
  if (visit === undefined) {
    return;
  }
  const logical = this.toLogicalXY(point.x, point.y);
  visit.taps.push({
    x: Math.round(point.x), y: Math.round(point.y),
    lx: logical.x, ly: logical.y,
    ms: Date.now() - visit.at
  });
  logInfo(Log.Walk.Tap, { page: visit.page, x: logical.x, y: logical.y });
}

/**
 * Close the visit that was open and start one for `match`.
 *
 * Keyed on the page *name*, the way `PageRouter.observe` is: two entries under
 * one name are two fingerprints of the same screen, and treating a variant
 * flicker as a transition would invent edges that nothing navigated.
 */
Tsum.prototype.walkEnterPage = function(match) {
  const page = match === null ? PageName.Unknown : match.page.name;
  const current = this.walkCurrentVisit();
  if (current !== undefined && current.page === page) {
    return;
  }

  const now = Date.now();
  if (current !== undefined) {
    current.ms = now - current.at;
    current.to = page;
  }
  const seq = this._walkVisits.length;
  this._walkVisits.push({
    seq: seq,
    page: page,
    key: match === null ? '' : match.key,
    at: now,
    ms: 0,
    taps: [],
    to: '',
    frame: this.walkSaveFrame(seq, page)
  });
  logInfo(Log.Walk.Page, {
    page: page,
    seq: seq,
    from: current === undefined ? undefined : current.page,
    taps: current === undefined ? undefined : current.taps.length
  });
  if (this._walkVisits.length % WalkFlushEvery === 0) {
    this.walkFlush();
  }
}

/**
 * Rewrite the session file.
 *
 * Whole-file, because the host has `writeFile` and no append. Cheap enough at a
 * few hundred visits, and the flush cadence is what bounds how much a kill
 * mid-walk costs -- which is also why the geometry rides at the top rather than
 * being written once at the end.
 */
Tsum.prototype.walkFlush = function() {
  const session: WalkSession = {
    session: this._walkSession,
    startedAt: this._walkStartedAt,
    screen: { width: this.originScreenWidth, height: this.originScreenHeight },
    captureGameRatio: this.captureGameRatio,
    gameOffsetX: this.gameOffsetX,
    gameOffsetY: this.gameOffsetY,
    visits: this._walkVisits
  };
  try {
    writeFile(this.walkthroughDir() + '/' + this._walkSession + '.json',
      JSON.stringify(session));
  } catch (e) {
    logWarn(Log.Walk.SaveFailed, 'Could not write the walkthrough session',
      { file: this._walkSession, errorText: '' + e });
  }
}

Tsum.prototype.taskWalkthrough = function() {
  this._walkVisits = [];
  this._walkFrames = {};
  this._walkFrameCount = 0;
  this._walkStartedAt = Date.now();
  this._walkSession = 'walk_' + this._walkStartedAt;
  execute('mkdir -p ' + this.walkthroughDir());

  logInfo(Log.Walk.Start);
  // The screen the walk begins on is a visit like any other: whatever is tapped
  // first is a tap on it.
  this.walkEnterPage(gPages.sweep(1, 1000));

  while (this.isRunning) {
    const touch = this.pollTouchDown(WalkTouchPollSec);
    if (touch !== null) {
      this.walkRecordTap(touch);
    }
    // `sweep`, never `detect`: scoring the table is the whole job here, and a
    // broadcast would let the guard and dismiss bands tap.
    this.walkEnterPage(gPages.sweep(1, 300));
  }

  const last = this.walkCurrentVisit();
  if (last !== undefined && last.ms === 0) {
    last.ms = Date.now() - last.at;
  }
  this.walkFlush();
  logInfo(Log.Walk.Done, {
    visits: this._walkVisits.length,
    frames: this._walkFrameCount,
    session: this._walkSession
  });
}
