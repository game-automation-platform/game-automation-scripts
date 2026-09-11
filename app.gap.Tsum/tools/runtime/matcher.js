// Template matching, mirroring runMatch() in api_image.cpp:377.
//
// The host converts both images to BGR, then picks between two OpenCV methods:
// TM_CCOEFF_NORMED normally, and TM_SQDIFF_NORMED (rescaled so 1.0 still means
// "perfect") when the template is nearly flat -- because CCOEFF divides by the
// template's standard deviation, so a single-colour template divides by ~zero
// and scores 1.0 everywhere, silently pinning the match to (0,0).
//
// Cost note: the correlation is naive, O(searchArea * templateArea * 3). That
// is fine for a `region`-restricted probe (a 100x80 window against a 48x32
// template is ~11M multiply-adds) and slow for a whole-frame search, which is
// why PageTemplate carries a `region`.

const kFlatTemplateStdDev = 1.0;  // api_image.cpp:367

/** Per-channel mean/stddev over a BGR view of a BGRA bitmap, as cv::meanStdDev. */
function meanStdDev(img) {
  const n = img.w * img.h;
  const sum = [0, 0, 0];
  const sumSq = [0, 0, 0];
  for (let p = 0; p < img.data.length; p += 4) {
    for (let c = 0; c < 3; c++) {
      const v = img.data[p + c];
      sum[c] += v;
      sumSq[c] += v * v;
    }
  }
  const mean = [0, 0, 0];
  const stddev = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    mean[c] = sum[c] / n;
    stddev[c] = Math.sqrt(Math.max(0, sumSq[c] / n - mean[c] * mean[c]));
  }
  return { mean, stddev };
}

/**
 * Integral images of the source over the 3 BGR channels, summed across
 * channels: `sum` and `sumSq` at (x, y) cover the rectangle [0,x) x [0,y).
 * These give any window's total and total-of-squares in O(1), which is what
 * makes the normalisation term cheap.
 */
function buildIntegrals(img) {
  const W = img.w + 1;
  const H = img.h + 1;
  const sum = new Float64Array(W * H);
  const sumSq = new Float64Array(W * H);
  for (let y = 0; y < img.h; y++) {
    let rowSum = 0;
    let rowSumSq = 0;
    for (let x = 0; x < img.w; x++) {
      const p = (y * img.w + x) * 4;
      let v = 0;
      let vSq = 0;
      for (let c = 0; c < 3; c++) {
        const s = img.data[p + c];
        v += s;
        vSq += s * s;
      }
      rowSum += v;
      rowSumSq += vSq;
      sum[(y + 1) * W + (x + 1)] = sum[y * W + (x + 1)] + rowSum;
      sumSq[(y + 1) * W + (x + 1)] = sumSq[y * W + (x + 1)] + rowSumSq;
    }
  }
  return { sum, sumSq, W };
}

function windowSum(integral, x, y, w, h) {
  const W = integral.W;
  const a = y * W + x;
  const b = y * W + (x + w);
  const c = (y + h) * W + x;
  const d = (y + h) * W + (x + w);
  return {
    sum: integral.sum[d] - integral.sum[b] - integral.sum[c] + integral.sum[a],
    sumSq: integral.sumSq[d] - integral.sumSq[b] - integral.sumSq[c] + integral.sumSq[a],
  };
}

/**
 * Score every valid placement of `target` inside `source`.
 * Returns {best: {x, y, score}, scores} or null when the match cannot run
 * (empty image, or a template larger than the source -- api_image.cpp:381).
 */
function matchTemplate(source, target) {
  if (!source.w || !source.h || !target.w || !target.h) return null;
  if (target.w > source.w || target.h > source.h) return null;

  const { stddev } = meanStdDev(target);
  const flat = stddev[0] + stddev[1] + stddev[2] < kFlatTemplateStdDev;

  const tn = target.w * target.h * 3;
  const outW = source.w - target.w + 1;
  const outH = source.h - target.h + 1;
  const integral = buildIntegrals(source);

  // Template statistics. For CCOEFF the template is mean-subtracted, which is
  // also why the numerator needs no window mean: sum(T' * (I - meanI))
  // == sum(T' * I) - meanI * sum(T') and sum(T') is zero by construction.
  const tMean = [0, 0, 0];
  {
    const s = [0, 0, 0];
    for (let p = 0; p < target.data.length; p += 4) {
      for (let c = 0; c < 3; c++) s[c] += target.data[p + c];
    }
    for (let c = 0; c < 3; c++) tMean[c] = s[c] / (target.w * target.h);
  }

  const tVals = new Float64Array(tn);        // mean-subtracted (CCOEFF) or raw (SQDIFF)
  let tEnergy = 0;                           // sum of tVals^2
  let tRawEnergy = 0;                        // sum of raw T^2, for SQDIFF
  for (let ty = 0, i = 0; ty < target.h; ty++) {
    for (let tx = 0; tx < target.w; tx++) {
      const p = (ty * target.w + tx) * 4;
      for (let c = 0; c < 3; c++, i++) {
        const raw = target.data[p + c];
        const v = flat ? raw : raw - tMean[c];
        tVals[i] = v;
        tEnergy += v * v;
        tRawEnergy += raw * raw;
      }
    }
  }

  const scores = new Float64Array(outW * outH);
  let bestScore = -Infinity;
  let bestX = -1;
  let bestY = -1;

  for (let oy = 0; oy < outH; oy++) {
    for (let ox = 0; ox < outW; ox++) {
      // sum(T * I) over the window, in the same channel order as tVals.
      let dot = 0;
      for (let ty = 0, i = 0; ty < target.h; ty++) {
        let sp = ((oy + ty) * source.w + ox) * 4;
        for (let tx = 0; tx < target.w; tx++, sp += 4) {
          dot += tVals[i] * source.data[sp] + tVals[i + 1] * source.data[sp + 1]
               + tVals[i + 2] * source.data[sp + 2];
          i += 3;
        }
      }

      const win = windowSum(integral, ox, oy, target.w, target.h);
      let score;
      if (flat) {
        // TM_SQDIFF_NORMED = sum((T-I)^2) / sqrt(sum(T^2) * sum(I^2)),
        // then the host reports 1 - that.
        const sqdiff = tRawEnergy - 2 * dot + win.sumSq;
        const denom = Math.sqrt(tRawEnergy * win.sumSq);
        score = denom > 0 ? 1 - sqdiff / denom : (sqdiff === 0 ? 1 : 0);
      } else {
        // TM_CCOEFF_NORMED. The window's variance term is
        // sum(I^2) - sum(I)^2 / n.
        const winVar = win.sumSq - (win.sum * win.sum) / tn;
        const denom = Math.sqrt(tEnergy * winVar);
        score = denom > 0 ? dot / denom : 0;
      }
      if (!Number.isFinite(score)) score = -1;  // cv::patchNaNs(result, -1.0f)
      scores[oy * outW + ox] = score;
      if (score > bestScore) {
        bestScore = score;
        bestX = ox;
        bestY = oy;
      }
    }
  }

  return { best: { x: bestX, y: bestY, score: bestScore }, scores, outW, outH };
}

module.exports = { matchTemplate, meanStdDev };
