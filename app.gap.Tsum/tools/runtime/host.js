// A Node stand-in for the Game Automation Platform host API, faithful to
// the semantics in `../../../../game-automation-app/app/src/main/cpp`.
//
// The point of shimming the *host* rather than reimplementing the matcher is
// that `load.js` then runs the real, built `PageRouter.sweep` against saved
// screenshots. Nothing about page classification is duplicated here; if this
// file and the device disagree, the disagreement is confined to the ~15
// primitives below, and the detection suite's fidelity check measures it.
//
// Two host conventions are reproduced deliberately because the script depends
// on both: images are integer handles, and `0` means "no image" (which is what
// `openImage` returns for a missing file, and what roundStats.ts:284 works
// around). Keeping the handle model also makes leak detection free -- the
// harness asserts `liveImages() === 0` after each frame, the same check
// `tools/e2e-test.js` makes on-device.

const fs = require('fs');
const os = require('os');
const path = require('path');
const imageio = require('./imageio');
const { matchTemplate } = require('./matcher');

/** `JS_ToInt32` truncates toward zero; several call sites pass fractional sizes. */
function argInt(v, dflt) {
  if (v === undefined || v === null) return dflt === undefined ? 0 : dflt;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function createHost(options) {
  const opts = options || {};
  const quiet = opts.quiet !== false;
  const useJpeg = opts.jpeg !== false;

  // Handle 0 is reserved for "no image", so allocation starts at 1.
  const images = new Map();
  let nextHandle = 1;
  let peakLive = 0;

  const logLines = [];
  const calls = Object.create(null);
  const noted = (name) => { calls[name] = (calls[name] || 0) + 1; };

  let capture = null;          // Bitmap the fake screen returns
  let screenSize = { width: 0, height: 0 };
  const storagePath = opts.storagePath || path.join(os.tmpdir(), 'gap-runtime-storage');

  function put(img) {
    if (!img) return 0;
    const h = nextHandle++;
    images.set(h, img);
    if (images.size > peakLive) peakLive = images.size;
    return h;
  }

  function get(handle, who) {
    const img = images.get(handle);
    if (!img) throw new Error(who + ': invalid image handle ' + handle);
    return img;
  }

  const globals = {
    // --- capture -----------------------------------------------------------
    getScreenSize: () => ({ width: screenSize.width, height: screenSize.height }),
    getDeviceSize: () => ({ width: screenSize.width, height: screenSize.height }),
    getVirtualButtonHeight: () => 0,

    getScreenshot: () => {
      noted('getScreenshot');
      if (!capture) return 0;
      return put({ w: capture.w, h: capture.h, data: capture.data.slice() });
    },

    // api_device.cpp:59 -- crop, then resize, then a deliberate JPEG round-trip.
    getScreenshotModify: (x, y, w, h, outW, outH, quality) => {
      noted('getScreenshotModify');
      if (!capture) return 0;
      let cx = Math.max(0, argInt(x));
      let cy = Math.max(0, argInt(y));
      let cw = argInt(w);
      let ch = argInt(h);
      const rw = argInt(outW);
      const rh = argInt(outH);
      const q = argInt(quality, 100);

      if (cw <= 0) cw = capture.w - cx;
      if (ch <= 0) ch = capture.h - cy;
      cx = Math.min(cx, Math.max(0, capture.w - 1));
      cy = Math.min(cy, Math.max(0, capture.h - 1));
      cw = Math.max(1, Math.min(cw, capture.w - cx));
      ch = Math.max(1, Math.min(ch, capture.h - cy));

      let out = imageio.crop(capture, cx, cy, cw, ch);
      if (rw > 0 && rh > 0 && (rw !== out.w || rh !== out.h)) {
        out = imageio.resize(out, rw, rh);
      }
      if (useJpeg && q > 0 && q < 100) {
        out = imageio.jpegRoundTrip(out, q);
      }
      return put(out);
    },

    // --- image handles -----------------------------------------------------
    releaseImage: (handle) => {
      if (handle === 0) return;          // releasing "no image" is a no-op on-device
      images.delete(handle);
    },
    clone: (handle) => put(cloneOf(get(handle, 'clone'))),
    cloneImage: (handle) => put(cloneOf(get(handle, 'cloneImage'))),

    getImageSize: (handle) => {
      const img = get(handle, 'getImageSize');
      return { width: img.w, height: img.h };
    },
    getImageWidth: (handle) => get(handle, 'getImageWidth').w,
    getImageHeight: (handle) => get(handle, 'getImageHeight').h,

    // api_image.cpp:43 -- out of bounds reports all zeros rather than throwing,
    // which is what makes Tsum.getColor's `Math.max(rxy.x, 0)` clamp silent.
    getImageColor: (handle, x, y) => pixelAt(get(handle, 'getImageColor'), x, y),

    // api_image.cpp:62 -- the batched form PageRouter.score and findTsums actually
    // use. On-device its value is collapsing N engine crossings into one; here
    // it is a plain map, and exists so the harness runs the same code path.
    getImageColors: (handle, points) => {
      const img = get(handle, 'getImageColors');
      if (!Array.isArray(points)) {
        throw new TypeError('getImageColors: expected an array of {x, y}');
      }
      return points.map((p) => pixelAt(img, p && p.x, p && p.y));
    },

    cropImage: (handle, x, y, w, h) => {
      const img = get(handle, 'cropImage');
      let cx = Math.max(0, argInt(x));
      let cy = Math.max(0, argInt(y));
      let cw = argInt(w);
      let chh = argInt(h);
      cx = Math.min(cx, Math.max(0, img.w - 1));
      cy = Math.min(cy, Math.max(0, img.h - 1));
      cw = Math.min(cw, img.w - cx);
      chh = Math.min(chh, img.h - cy);
      if (cw <= 0 || chh <= 0) return 0;   // api_image.cpp:96
      return put(imageio.crop(img, cx, cy, cw, chh));
    },

    resizeImage: (handle, w, h) => {
      const img = get(handle, 'resizeImage');
      const rw = argInt(w);
      const rh = argInt(h);
      if (rw <= 0 || rh <= 0) return 0;    // api_image.cpp:107
      return put(imageio.resize(img, rw, rh));
    },

    openImage: (p) => {
      noted('openImage');
      try {
        if (!fs.existsSync(p)) return 0;   // the host returns 0 on failure
        return put(imageio.decodeFile(p));
      } catch (e) {
        return 0;
      }
    },

    saveImage: (handle, p) => {
      const img = get(handle, 'saveImage');
      imageio.writePng(img, p);
    },

    getBase64FromImage: (handle) =>
      imageio.encodePng(get(handle, 'getBase64FromImage')).toString('base64'),

    getImageFromBase64: (b64) => {
      noted('getImageFromBase64');
      try {
        const clean = String(b64).replace(/^data:[^,]*,/, '');
        const buf = Buffer.from(clean, 'base64');
        const tmp = path.join(os.tmpdir(), 'gap-runtime-b64-' + process.pid + '.png');
        fs.writeFileSync(tmp, buf);
        const img = imageio.decodeFile(tmp);
        fs.unlinkSync(tmp);
        return put(img);
      } catch (e) {
        return 0;
      }
    },

    // --- masks and blobs ---------------------------------------------------
    //
    // api_image.cpp:223 -- bounds are per BGRA channel, in that order, and the
    // result is a single-channel mask of 0 / 255. A 1-channel Mat reports
    // through setPixelColor as r = g = b = v (api_image.cpp:580), so the mask is
    // kept here as a grey BGRA bitmap: crop, resize and getImageColors then all
    // read it exactly as the device does.
    inRange: (handle, bLo, gLo, rLo, aLo, bHi, gHi, rHi, aHi) =>
      put(rangeMask(get(handle, 'inRange'),
        [argInt(bLo, 0), argInt(gLo, 0), argInt(rLo, 0), argInt(aLo, 0)],
        [argInt(bHi, 255), argInt(gHi, 255), argInt(rHi, 255), argInt(aHi, 255)], true)),

    outRange: (handle, bLo, gLo, rLo, aLo, bHi, gHi, rHi, aHi) =>
      put(rangeMask(get(handle, 'outRange'),
        [argInt(bLo, 0), argInt(gLo, 0), argInt(rLo, 0), argInt(aLo, 0)],
        [argInt(bHi, 255), argInt(gHi, 255), argInt(rHi, 255), argInt(aHi, 255)], false)),

    // api_image.cpp:330 -- RETR_EXTERNAL bounding boxes over the non-zero pixels,
    // filtered by area (`maxArea` of 0 means no upper bound).
    //
    // One divergence, deliberate: `area` here is the component's pixel count,
    // where cv::contourArea is the area of the traced outline polygon and so
    // runs about half a perimeter smaller. Nothing in the scripts uses `area`
    // for anything but a floor of a few pixels against speckle (roundStats.ts
    // passes 2), and the two agree well before that matters.
    findContours: (handle, minArea, maxArea) => {
      const blobs = connectedBoxes(get(handle, 'findContours'));
      const min = Number(minArea) || 0;
      const max = Number(maxArea) || 0;
      return blobs.filter((b) => b.area >= min && (max <= 0 || b.area <= max));
    },

    // --- matching ----------------------------------------------------------
    findImage: (srcHandle, tgtHandle) => {
      noted('findImage');
      const r = matchTemplate(get(srcHandle, 'findImage'), get(tgtHandle, 'findImage'));
      // RBM reads `.score` unconditionally, so the full shape always comes back.
      if (!r) return { x: -1, y: -1, score: -1 };
      return r.best;
    },

    findImages: (srcHandle, tgtHandle, scoreLimit, countLimit, withoutOverlap) => {
      noted('findImages');
      const source = get(srcHandle, 'findImages');
      const target = get(tgtHandle, 'findImages');
      const r = matchTemplate(source, target);
      if (!r) return [];
      const limit = scoreLimit === undefined ? 0.8 : Number(scoreLimit);
      const maxCount = countLimit === undefined ? 10 : argInt(countLimit);
      const noOverlap = withoutOverlap === undefined ? true : !!withoutOverlap;

      const hits = [];
      for (let y = 0; y < r.outH; y++) {
        for (let x = 0; x < r.outW; x++) {
          const score = r.scores[y * r.outW + x];
          if (score >= limit) hits.push({ x, y, score });
        }
      }
      hits.sort((a, b) => b.score - a.score);
      const kept = [];
      for (const hit of hits) {
        if (kept.length >= maxCount) break;
        if (noOverlap && kept.some((k) =>
          Math.abs(k.x - hit.x) < target.w && Math.abs(k.y - hit.y) < target.h)) {
          continue;
        }
        kept.push(hit);
      }
      return kept;
    },

    // api_image.cpp:472 -- resizes the target to the source, then reports the
    // single best TM_CCOEFF_NORMED score. Answers "same picture?", not "where".
    getIdentityScore: (aHandle, bHandle) => {
      noted('getIdentityScore');
      const lhs = get(aHandle, 'getIdentityScore');
      let rhs = get(bHandle, 'getIdentityScore');
      if (!lhs.w || !lhs.h || !rhs.w || !rhs.h) return -1;
      if (rhs.w !== lhs.w || rhs.h !== lhs.h) rhs = imageio.resize(rhs, lhs.w, lhs.h);
      const r = matchTemplate(lhs, rhs);
      return r ? r.best.score : -1;
    },

    // --- system ------------------------------------------------------------
    getStoragePath: () => storagePath,
    // A fixed 12-hex id, the shape the host's DeviceIdentity produces, so a
    // round id minted in the harness has the device half every real one has.
    getDeviceId: () => '0badc0ffee00',
    sleep: () => {},                        // the harness has no real time to pass
    execute: (cmd) => { noted('execute:' + String(cmd).split(' ')[0]); return ''; },
    readFile: (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; } },
    writeFile: (p, content) => {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, String(content));
    },
    httpClient: () => '',
    getUserPlan: () => -1,
    sendNormalMessage: () => '',
    // The floating banner has no screen out here; a script may still call it.
    showBanner: () => {},
    // Same: nothing is listening for events in the harness. Stubbed rather than
    // left out so `ts.emit`'s typeof guard is not what the harness is testing.
    emitEvent: () => {},

    // --- input: recorded, never performed ----------------------------------
    // A classifier must not tap. If one of these fires during an eval it means
    // the harness wandered out of pure detection, so they are counted and the
    // caller can assert on it.
    tap: () => noted('tap'),
    tapDown: () => noted('tapDown'),
    tapUp: () => noted('tapUp'),
    tapMove: () => noted('tapMove'),
    moveTo: () => noted('moveTo'),
    swipe: () => noted('swipe'),
    press: () => noted('press'),
    keycode: () => noted('keycode'),
    typing: () => noted('typing'),

    console: {
      log: (...a) => { logLines.push(a.join(' ')); if (!quiet) console.log(...a); },
      info: (...a) => { logLines.push(a.join(' ')); if (!quiet) console.info(...a); },
      warn: (...a) => { logLines.push(a.join(' ')); if (!quiet) console.warn(...a); },
      error: (...a) => { logLines.push(a.join(' ')); if (!quiet) console.error(...a); },
      debug: (...a) => { logLines.push(a.join(' ')); },
    },
  };

  // Colour probes against the live screen (api_device.cpp). Unused by
  // PageRouter.sweep, which works off a frame it already captured, but a real
  // part of the API surface. getColors takes one frame for the whole list,
  // which is the only reason it exists alongside getColor.
  globals.getColor = (x, y) => {
    if (!capture) return { r: 0, g: 0, b: 0, a: 0 };
    const h = put(capture);
    try { return globals.getImageColor(h, x, y); } finally { images.delete(h); }
  };
  globals.getColors = (points) => {
    if (!Array.isArray(points)) {
      throw new TypeError('getColors: expected an array of {x, y}');
    }
    if (!capture) return points.map(() => ({ r: 0, g: 0, b: 0, a: 0 }));
    const h = put(capture);
    try { return globals.getImageColors(h, points); } finally { images.delete(h); }
  };

  /** inRange/outRange: 0 / 255 per pixel, held as grey BGRA. See the callers above. */
  function rangeMask(img, lo, hi, inside) {
    const out = new Uint8Array(img.w * img.h * 4);
    for (let i = 0; i < out.length; i += 4) {
      let within = true;
      for (let c = 0; c < 4 && within; c++) {
        const v = img.data[i + c];
        if (v < lo[c] || v > hi[c]) within = false;
      }
      const v = (within === inside) ? 255 : 0;
      out[i] = v; out[i + 1] = v; out[i + 2] = v; out[i + 3] = 255;
    }
    return { w: img.w, h: img.h, data: out };
  }

  /**
   * One bounding box per 8-connected run of non-zero pixels.
   *
   * That is what RETR_EXTERNAL contours come to for a binary mask: a hole inside
   * a blob is an inner contour and never reported, and the outer contour of one
   * component has exactly this bounding rect. Iterative flood fill rather than
   * recursion -- a full-width glyph row is tens of thousands of pixels deep.
   */
  function connectedBoxes(img) {
    const w = img.w;
    const h = img.h;
    const seen = new Uint8Array(w * h);
    const boxes = [];
    const stack = [];
    for (let start = 0; start < w * h; start++) {
      if (seen[start]) continue;
      seen[start] = 1;
      // BGRA2GRAY, matching cvtColor's weights; a mask is grey either way.
      const p = start * 4;
      if (0.114 * img.data[p] + 0.587 * img.data[p + 1] + 0.299 * img.data[p + 2] < 0.5) continue;
      let minX = w, maxX = -1, minY = h, maxY = -1, area = 0;
      stack.push(start);
      while (stack.length) {
        const idx = stack.pop();
        const x = idx % w;
        const y = (idx - x) / w;
        area++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const n = ny * w + nx;
            if (seen[n]) continue;
            seen[n] = 1;
            const q = n * 4;
            if (0.114 * img.data[q] + 0.587 * img.data[q + 1] + 0.299 * img.data[q + 2] < 0.5) continue;
            stack.push(n);
          }
        }
      }
      boxes.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, area });
    }
    return boxes;
  }

  // Shared by getImageColor/getImageColors so both report a pixel identically,
  // mirroring setPixelColor in api_image.cpp.
  function pixelAt(img, x, y) {
    const ix = argInt(x);
    const iy = argInt(y);
    if (ix < 0 || iy < 0 || ix >= img.w || iy >= img.h) {
      return { r: 0, g: 0, b: 0, a: 0 };
    }
    const p = (iy * img.w + ix) * 4;
    return { b: img.data[p], g: img.data[p + 1], r: img.data[p + 2], a: img.data[p + 3] };
  }

  function cloneOf(img) {
    return { w: img.w, h: img.h, data: img.data.slice() };
  }

  return {
    globals,
    /** Point the fake screen at a bitmap and size the device to match it. */
    setCapture(bitmap) {
      capture = bitmap;
      screenSize = { width: bitmap.w, height: bitmap.h };
    },
    setScreenSize(width, height) { screenSize = { width, height }; },
    getCapture: () => capture,
    /** Handles still outstanding. Should be 0 between frames. */
    liveImages: () => images.size,
    peakImages: () => peakLive,
    resetPeak: () => { peakLive = images.size; },
    /** Adopt an external bitmap as a handle, for tools that build images directly. */
    putImage: (img) => put(img),
    getImage: (handle) => images.get(handle),
    calls,
    logLines,
    storagePath,
  };
}

module.exports = { createHost };
