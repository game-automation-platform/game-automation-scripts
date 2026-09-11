// Cabbage Mickey — the skill buries Mickey among cabbages and the player has to
// find and tap him. This is the only skill that has to actually look at the
// board to aim.
//
// The search is a coarse grid over the play area looking for Mickey's face
// color on a blurred screenshot, retried up to five times while the cabbages
// keep shuffling. If he is never found the activation is written off and the
// bubbles are swept instead.

var CabbageMickeyFaceColor = {r: 245, g: 225, b: 210};

registerSkill({
  types: [SkillType.CabbageMickey],
  afterActivate: function(ts) {
    // wait for all cabbages being placed
    ts.sleep(3300);
    const startTime = Date.now();
    let foundMickey = false;
    let maybeMickey = null;
    let color = null;
    const maxTries = 5;
    for (let tries = 1; tries <= maxTries && !foundMickey; tries++) {
      ts.sleep(100);
      const img = ts.screenshot();
      try {
        smooth(img, 2, 5);
        for (let y = 720; y < 1380 && !foundMickey; y += 25) {
          for (let x = 120; x < 1000 && !foundMickey; x += 60) {
            maybeMickey = {x: x, y: y};
            color = ts.getColor(img, maybeMickey);
            foundMickey = foundMickey || isSameColor(CabbageMickeyFaceColor, color, 20);
            // NOTE: there used to be a four-point confirmation here -- up, down,
            // left and right of the hit. It never confirmed anything: all four
            // names aliased the one `maybeMickey` object and their offsets
            // cancelled in pairs (-10 then +10 on y, then the same on x), so
            // every read landed back on the centre pixel that had just matched,
            // at the same tolerance. `(A || A) && (A || A)` cannot turn a true
            // `foundMickey` false, so the step was incapable of rejecting a hit.
            //
            // Removed rather than repaired: the detection has been tuned around
            // this behaviour, and giving those four points real offsets would
            // change which frames pass. A genuine neighbourhood check is still
            // worth having -- it would just be a new tuning exercise, and it
            // should read its points in one `ts.getColors` batch when written.
            // Behaviour here is unchanged; four reads of an already-read pixel
            // are gone.
            if (ts.debug) {
              // logical width is 1080, screenshot usually 360, so reduce xy by factor 3
              drawCircle(img, x / 3, y / 3, 4, foundMickey ? 0 : 255, foundMickey ? 255 : 0, 0, 0);
            }
          }
        }
        if (!foundMickey) {
          // `shot` is a thunk, so the screenshot is only written when the
          // record is really going out -- and the field then carries where it
          // went, which is what you want in the log rather than "Saved".
          logDebug(Log.Skill.CabbageMickeyNotFound, {
            tries: tries,
            maxTries: maxTries,
            shot: function() {
              if (!ts.debug) { return undefined; }
              const path = getStoragePath() + "/tmp/boardImg-cabbageMickey_not_found-" + ts.runTimes + "-" + tries + ".jpg";
              saveImage(img, path);
              return path;
            },
          });
        } else {
          if (ts.debug) {
            saveImage(img, getStoragePath() + "/tmp/boardImg-cabbageMickey-" + ts.runTimes + "-" + tries + ".jpg");
          }
        }
      } finally {
        releaseImage(img);
      }
    }
    if (foundMickey && maybeMickey != null) {
      logDebug(Log.Skill.CabbageMickeyFound, {
        x: maybeMickey.x,
        y: maybeMickey.y,
        color: color,
        durationMs: Date.now() - startTime,
      });
      const tapXY = {x: maybeMickey.x + 15, y: maybeMickey.y + 15};
      for (let i = 0; i < 10; i++)
        ts.tap(tapXY);
      ts.sleep(1000);
    } else {
      // Deliberately not `sweepsBubbles: true`: this sweep is the write-off
      // path, not the choreography. Flagging the skill would tell the play loop
      // it never has to sweep after an activation, which is wrong on every run
      // where Mickey *was* found.
      ts.clearAllBubbles();
    }
  }
});
