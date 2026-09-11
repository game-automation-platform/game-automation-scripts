// Image decode/encode and the pixel operations the host shim needs.
//
// Everything in here speaks the same representation the app stores internally:
// BGRA, 8 bits per channel, interleaved, one Uint8Array per image. That is what
// `toBgra()` in api_common.cpp produces for every image the engine hands to a
// script, so matching it means `getImageColor` needs no per-image channel
// bookkeeping (see api_image.cpp:43 -- stored images are BGRA and reported as
// {r,g,b,a}).

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');

/** @typedef {{w: number, h: number, data: Uint8Array}} Bitmap  BGRA, 4 bytes/px. */

function rgbaToBgra(rgba) {
  const out = new Uint8Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    out[i] = rgba[i + 2];      // B
    out[i + 1] = rgba[i + 1];  // G
    out[i + 2] = rgba[i];      // R
    out[i + 3] = rgba[i + 3];  // A
  }
  return out;
}

function bgraToRgba(bgra) {
  return rgbaToBgra(bgra);  // the swap is its own inverse
}

/** Decode a .png/.jpg/.jpeg into a BGRA bitmap. */
function decodeFile(file) {
  const ext = path.extname(file).toLowerCase();
  const buf = fs.readFileSync(file);
  if (ext === '.png') {
    const png = PNG.sync.read(buf);
    return { w: png.width, h: png.height, data: rgbaToBgra(png.data) };
  }
  if (ext === '.jpg' || ext === '.jpeg') {
    // useTArray keeps the result a Uint8Array rather than a Buffer.
    const img = jpeg.decode(buf, { useTArray: true });
    return { w: img.width, h: img.height, data: rgbaToBgra(img.data) };
  }
  throw new Error('unsupported image type: ' + file + ' (want .png/.jpg/.jpeg)');
}

function encodePng(img) {
  const png = new PNG({ width: img.w, height: img.h });
  png.data = Buffer.from(bgraToRgba(img.data));
  return PNG.sync.write(png);
}

function writePng(img, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePng(img));
}

/** `(*src)(cv::Rect(x, y, w, h)).clone()` -- api_image.cpp:98. */
function crop(img, x, y, w, h) {
  const out = new Uint8Array(w * h * 4);
  for (let row = 0; row < h; row++) {
    const src = ((y + row) * img.w + x) * 4;
    out.set(img.data.subarray(src, src + w * 4), row * w * 4);
  }
  return { w, h, data: out };
}

/**
 * `cv::resize(..., cv::INTER_LINEAR)` -- api_image.cpp:110 and the resize step
 * inside getScreenshotModify (api_device.cpp:85).
 *
 * OpenCV maps destination to source with a half-pixel centre offset,
 * `sx = (dx + 0.5) * scale - 0.5`, and clamps the two edge cases to a pure copy
 * of the border pixel. Its 8-bit path then does the interpolation in 5-bit
 * fixed point where this uses floats, so results can differ by a unit; that is
 * what the detection suite's fidelity check measures rather than assumes.
 */
function resize(img, dstW, dstH) {
  if (dstW === img.w && dstH === img.h) {
    return { w: img.w, h: img.h, data: img.data.slice() };
  }
  const out = new Uint8Array(dstW * dstH * 4);
  const scaleX = img.w / dstW;
  const scaleY = img.h / dstH;

  // Row coefficients are the same for every column, so precompute them.
  const yIdx = new Int32Array(dstH * 2);
  const yFrac = new Float64Array(dstH);
  for (let dy = 0; dy < dstH; dy++) {
    let sy = (dy + 0.5) * scaleY - 0.5;
    let y0;
    if (sy < 0) { sy = 0; y0 = 0; } else { y0 = Math.floor(sy); }
    if (y0 >= img.h - 1) { y0 = img.h - 1; sy = y0; }
    yIdx[dy * 2] = y0;
    yIdx[dy * 2 + 1] = Math.min(y0 + 1, img.h - 1);
    yFrac[dy] = sy - y0;
  }

  for (let dx = 0; dx < dstW; dx++) {
    let sx = (dx + 0.5) * scaleX - 0.5;
    let x0;
    if (sx < 0) { sx = 0; x0 = 0; } else { x0 = Math.floor(sx); }
    if (x0 >= img.w - 1) { x0 = img.w - 1; sx = x0; }
    const x1 = Math.min(x0 + 1, img.w - 1);
    const fx = sx - x0;
    const gx = 1 - fx;

    for (let dy = 0; dy < dstH; dy++) {
      const y0 = yIdx[dy * 2];
      const y1 = yIdx[dy * 2 + 1];
      const fy = yFrac[dy];
      const gy = 1 - fy;

      const p00 = (y0 * img.w + x0) * 4;
      const p01 = (y0 * img.w + x1) * 4;
      const p10 = (y1 * img.w + x0) * 4;
      const p11 = (y1 * img.w + x1) * 4;
      const dst = (dy * dstW + dx) * 4;

      for (let c = 0; c < 4; c++) {
        const top = img.data[p00 + c] * gx + img.data[p01 + c] * fx;
        const bot = img.data[p10 + c] * gx + img.data[p11 + c] * fx;
        out[dst + c] = Math.round(top * gy + bot * fy);
      }
    }
  }
  return { w: dstW, h: dstH, data: out };
}

/**
 * The deliberate lossy pass in getScreenshotModify (api_device.cpp:88-94):
 * encode to JPEG at `quality`, decode straight back, restore alpha. The host
 * compresses here and the reference images shipped with existing scripts were
 * captured through that same path, so skipping it would make these frames
 * sharper than the table was authored against.
 *
 * jpeg-js is not libjpeg-turbo, so its artifacts differ in detail from the
 * device's. They are the same order of magnitude -- `fidelity.js` quantifies
 * the gap, and `--no-jpeg` isolates it.
 */
function jpegRoundTrip(img, quality) {
  const encoded = jpeg.encode({ data: Buffer.from(bgraToRgba(img.data)), width: img.w, height: img.h }, quality);
  const decoded = jpeg.decode(encoded.data, { useTArray: true });
  const data = rgbaToBgra(decoded.data);
  // cv::imdecode(..., IMREAD_COLOR) drops alpha and toBgra() puts back 255.
  for (let i = 3; i < data.length; i += 4) {
    data[i] = 255;
  }
  return { w: decoded.width, h: decoded.height, data };
}

/** BGRA -> single-channel luma, for the template matcher. */
function toGrayF64(img) {
  const out = new Float64Array(img.w * img.h);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    // Rec.601, the weighting cv::COLOR_BGR2GRAY uses.
    out[i] = 0.114 * img.data[p] + 0.587 * img.data[p + 1] + 0.299 * img.data[p + 2];
  }
  return out;
}

module.exports = {
  decodeFile,
  encodePng,
  writePng,
  crop,
  resize,
  jpegRoundTrip,
  toGrayF64,
  rgbaToBgra,
  bgraToRgba,
};
