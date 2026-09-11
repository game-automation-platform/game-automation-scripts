// Utils

/**
 * Per-channel distance. A missing channel yields NaN, which is deliberate and
 * relied upon by both callers below -- see the note on `ColorLike`. The `!`s
 * say "undefined is possible here and NaN is the intended result", not "this
 * can never be undefined".
 */
function channelDiff(a: number | undefined, b: number | undefined): number {
  return Math.abs(a! - b!);
}

function isSameColor(c1: ColorLike, c2: ColorLike, diff?: number): boolean {
  if (diff === undefined) {
    diff = 20;
  }
  return channelDiff(c1.r, c2.r) <= diff
      && channelDiff(c1.g, c2.g) <= diff
      && channelDiff(c1.b, c2.b) <= diff;
}

function absColor(c1: ColorLike, c2: ColorLike): number {
  return channelDiff(c1.r, c2.r) + channelDiff(c1.g, c2.g) + channelDiff(c1.b, c2.b);
}
