/**
 * A QR encoder, small enough to inline into a page.
 *
 * No library on purpose: the settings page is opened from `file://` on a device
 * that is often offline, so everything it names has to end up inside
 * `dist/index.html` (`tools/inline/`). This is the least that encodes a share
 * code and nothing more.
 *
 * **Byte mode, error correction level M, versions 1-6** -- 106 characters at the
 * top end, against a share code's ~45 worst case (`SHARE_SLOTS`, settings.ts).
 * Two things fall out of stopping at 6: every block is the same length, so the
 * interleave is a plain transpose, and there is one alignment pattern rather
 * than a table of them. Both stop being true at version 7.
 *
 * The structure follows the reference implementation (Nayuki's qrcodegen):
 * function patterns first, codewords laid in a zigzag around them, then all
 * eight masks scored and the best kept.
 */

// --- The format ------------------------------------------------------------

/**
 * Per version, at level M: data codewords, EC codewords per block, block count.
 * The comment is the version's size and how many characters it carries.
 */
var QR_LEVEL_M: number[][] = [
    [16, 10, 1],    // 1: 21x21, 14 characters
    [28, 16, 1],    // 2: 25x25, 26
    [44, 26, 1],    // 3: 29x29, 42
    [64, 18, 2],    // 4: 33x33, 62
    [86, 24, 2],    // 5: 37x37, 84
    [108, 16, 4]    // 6: 41x41, 106
];

/** Level M's two bits in the format information. */
var QR_LEVEL_BITS = 0;

/** What the four mask rules cost: run, block, finder-like, imbalance. */
var QR_PENALTY = [3, 3, 40, 10];

/**
 * The run rule 3 punishes: a finder's own 1:1:3:1:1 with four light modules
 * beside it. Looked for forwards and backwards, along every row and column.
 */
var QR_FINDER_RUN = [true, false, true, true, true, false, true,
    false, false, false, false];

/** A code under construction: the modules, and which of them are patterns. */
interface QrGrid {
    size: number;
    /** `dark[y][x]` -- true where the module is dark. */
    dark: boolean[][];
    /** True for a function module, which the mask leaves alone. */
    fixed: boolean[][];
}

// --- Reed-Solomon ----------------------------------------------------------

/** Multiplies two GF(256) elements, in the field QR codes are defined over. */
function qrMultiply(x: number, y: number): number {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
        // Double, reducing by the field polynomial whenever that overflows.
        z = (z << 1) ^ ((z >>> 7) * 0x11D);
        z ^= ((y >>> i) & 1) * x;
    }
    return z;
}

/** The generator polynomial for `degree` EC codewords, leading 1 dropped. */
function qrDivisor(degree: number): number[] {
    var result: number[] = [];
    for (var i = 0; i < degree; i++) {
        result.push(0);
    }
    result[degree - 1] = 1;
    var root = 1;
    for (i = 0; i < degree; i++) {
        // Multiply what we have by (x - root), in place.
        for (var j = 0; j < degree; j++) {
            result[j] = qrMultiply(result[j], root);
            if (j + 1 < degree) {
                result[j] ^= result[j + 1];
            }
        }
        root = qrMultiply(root, 0x02);
    }
    return result;
}

/** One block's EC codewords: the remainder of dividing it by `divisor`. */
function qrRemainder(data: number[], divisor: number[]): number[] {
    var result: number[] = [];
    for (var i = 0; i < divisor.length; i++) {
        result.push(0);
    }
    for (i = 0; i < data.length; i++) {
        var factor = data[i] ^ result[0];
        result.shift();
        result.push(0);
        for (var j = 0; j < divisor.length; j++) {
            result[j] ^= qrMultiply(divisor[j], factor);
        }
    }
    return result;
}

// --- The message -----------------------------------------------------------

/**
 * The message as codewords: mode, length, the bytes, then the padding the
 * specification names -- a terminator, zeros to the next byte, and 0xEC / 0x11
 * alternating for whatever room is left.
 */
function qrCodewords(bytes: number[], capacity: number): number[] {
    var bits: number[] = [];
    function push(value: number, width: number): void {
        for (var i = width - 1; i >= 0; i--) {
            bits.push((value >>> i) & 1);
        }
    }

    push(4, 4);                     // byte mode
    push(bytes.length, 8);          // one length byte, up to version 9
    for (var i = 0; i < bytes.length; i++) {
        push(bytes[i], 8);
    }
    push(0, Math.min(4, capacity * 8 - bits.length));
    push(0, (8 - bits.length % 8) % 8);

    var words: number[] = [];
    for (i = 0; i < bits.length; i += 8) {
        var word = 0;
        for (var b = 0; b < 8; b++) {
            word = (word << 1) | bits[i + b];
        }
        words.push(word);
    }
    for (i = 0; words.length < capacity; i++) {
        words.push(i % 2 === 0 ? 0xEC : 0x11);
    }
    return words;
}

/**
 * Data and EC codewords in the order the matrix wants them: one from each
 * block in turn. Every block is the same length at these six versions, so this
 * is a transpose and needs no short-block case.
 */
function qrInterleave(words: number[], ecPerBlock: number, blocks: number): number[] {
    var length = words.length / blocks;
    var divisor = qrDivisor(ecPerBlock);
    var data: number[][] = [];
    var ec: number[][] = [];
    for (var b = 0; b < blocks; b++) {
        var block = words.slice(b * length, (b + 1) * length);
        data.push(block);
        ec.push(qrRemainder(block, divisor));
    }

    var result: number[] = [];
    for (var i = 0; i < length; i++) {
        for (b = 0; b < blocks; b++) {
            result.push(data[b][i]);
        }
    }
    for (i = 0; i < ecPerBlock; i++) {
        for (b = 0; b < blocks; b++) {
            result.push(ec[b][i]);
        }
    }
    return result;
}

// --- The matrix ------------------------------------------------------------

/** An all-light grid of `size` square. */
function qrGrid(size: number): QrGrid {
    var dark: boolean[][] = [];
    var fixed: boolean[][] = [];
    for (var y = 0; y < size; y++) {
        var darkRow: boolean[] = [];
        var fixedRow: boolean[] = [];
        for (var x = 0; x < size; x++) {
            darkRow.push(false);
            fixedRow.push(false);
        }
        dark.push(darkRow);
        fixed.push(fixedRow);
    }
    return {size: size, dark: dark, fixed: fixed};
}

/**
 * Writes one function module. Out-of-range coordinates are dropped rather than
 * refused, because the finder pattern below draws a separator that hangs off
 * three of the code's four edges.
 */
function qrSetFixed(grid: QrGrid, x: number, y: number, dark: boolean): void {
    if (x < 0 || y < 0 || x >= grid.size || y >= grid.size) {
        return;
    }
    grid.dark[y][x] = dark;
    grid.fixed[y][x] = true;
}

/** A finder pattern and its separator, centred on (x, y). */
function qrFinder(grid: QrGrid, x: number, y: number): void {
    for (var dy = -4; dy <= 4; dy++) {
        for (var dx = -4; dx <= 4; dx++) {
            // Chebyshev distance from the centre: rings 2 and 4 are the light
            // ones, which makes 3:1:1:1:1:1 out to the separator.
            var ring = Math.max(Math.abs(dx), Math.abs(dy));
            qrSetFixed(grid, x + dx, y + dy, ring !== 2 && ring !== 4);
        }
    }
}

/** The one alignment pattern versions 2-6 carry, centred on (x, y). */
function qrAlignment(grid: QrGrid, x: number, y: number): void {
    for (var dy = -2; dy <= 2; dy++) {
        for (var dx = -2; dx <= 2; dx++) {
            qrSetFixed(grid, x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
    }
}

/** The 15 format bits for `mask` at level M: BCH-coded, then masked. */
function qrFormatBits(mask: number): number {
    var data = (QR_LEVEL_BITS << 3) | mask;
    var rem = data;
    for (var i = 0; i < 10; i++) {
        rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    }
    return ((data << 10) | rem) ^ 0x5412;
}

/**
 * Both copies of the format information, and the module that is dark in every
 * code. Called once with a placeholder to reserve the area, then again for real
 * once a mask has been chosen.
 */
function qrDrawFormat(grid: QrGrid, mask: number): void {
    var bits = qrFormatBits(mask);
    var size = grid.size;
    function bit(index: number): boolean {
        return ((bits >>> index) & 1) !== 0;
    }

    // Around the top-left finder, the bits running down then left.
    for (var i = 0; i <= 5; i++) {
        qrSetFixed(grid, 8, i, bit(i));
    }
    qrSetFixed(grid, 8, 7, bit(6));
    qrSetFixed(grid, 8, 8, bit(7));
    qrSetFixed(grid, 7, 8, bit(8));
    for (i = 9; i < 15; i++) {
        qrSetFixed(grid, 14 - i, 8, bit(i));
    }

    // The second copy, split between the other two finders.
    for (i = 0; i < 8; i++) {
        qrSetFixed(grid, size - 1 - i, 8, bit(i));
    }
    for (i = 8; i < 15; i++) {
        qrSetFixed(grid, 8, size - 15 + i, bit(i));
    }
    qrSetFixed(grid, 8, size - 8, true);
}

/** Timing, finders, alignment, and the reserved format area. */
function qrDrawPatterns(grid: QrGrid, version: number): void {
    var size = grid.size;
    for (var i = 0; i < size; i++) {
        qrSetFixed(grid, 6, i, i % 2 === 0);
        qrSetFixed(grid, i, 6, i % 2 === 0);
    }
    // Over the timing pattern's ends, which is what the specification wants.
    qrFinder(grid, 3, 3);
    qrFinder(grid, size - 4, 3);
    qrFinder(grid, 3, size - 4);
    if (version >= 2) {
        // Exactly one, bottom right: the other three positions the table gives
        // for these versions fall inside a finder pattern and are skipped.
        qrAlignment(grid, size - 7, size - 7);
    }
    qrDrawFormat(grid, 0);
}

/**
 * Lays the codewords in: two columns at a time from the right, alternating up
 * and down, skipping the vertical timing pattern's column and every function
 * module. Anything left over stays light, which is what the specification's
 * remainder bits amount to.
 */
function qrDrawCodewords(grid: QrGrid, words: number[]): void {
    var size = grid.size;
    var i = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
        if (right === 6) {
            right = 5;
        }
        for (var vert = 0; vert < size; vert++) {
            for (var j = 0; j < 2; j++) {
                var x = right - j;
                var upward = ((right + 1) & 2) === 0;
                var y = upward ? size - 1 - vert : vert;
                if (!grid.fixed[y][x] && i < words.length * 8) {
                    grid.dark[y][x] = ((words[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
                    i++;
                }
            }
        }
    }
}

// --- Masking ---------------------------------------------------------------

/** True where mask `mask` inverts the module at (x, y). */
function qrMasked(mask: number, x: number, y: number): boolean {
    switch (mask) {
        case 0: return (x + y) % 2 === 0;
        case 1: return y % 2 === 0;
        case 2: return x % 3 === 0;
        case 3: return (x + y) % 3 === 0;
        case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
        case 5: return x * y % 2 + x * y % 3 === 0;
        case 6: return (x * y % 2 + x * y % 3) % 2 === 0;
        default: return ((x + y) % 2 + x * y % 3) % 2 === 0;
    }
}

/** Applies a mask over the data modules. Called twice, it removes it again. */
function qrApplyMask(grid: QrGrid, mask: number): void {
    for (var y = 0; y < grid.size; y++) {
        for (var x = 0; x < grid.size; x++) {
            if (!grid.fixed[y][x] && qrMasked(mask, x, y)) {
                grid.dark[y][x] = !grid.dark[y][x];
            }
        }
    }
}

/** True when `line` holds the finder-like run at `at`, read either way. */
function qrFinderRun(line: boolean[], at: number, reversed: boolean): boolean {
    for (var i = 0; i < QR_FINDER_RUN.length; i++) {
        var wanted = QR_FINDER_RUN[reversed ? QR_FINDER_RUN.length - 1 - i : i];
        if (line[at + i] !== wanted) {
            return false;
        }
    }
    return true;
}

/**
 * The specification's four penalty rules, lowest score winning. They exist to
 * keep a mask from producing something a scanner mistakes for a pattern, which
 * matters here because a share code is highly repetitive.
 */
function qrPenalty(grid: QrGrid): number {
    var size = grid.size;
    var score = 0;
    var x = 0;
    var y = 0;

    // 1 and 3, along every row and then every column.
    for (var pass = 0; pass < 2; pass++) {
        for (y = 0; y < size; y++) {
            var line: boolean[] = [];
            for (x = 0; x < size; x++) {
                line.push(pass === 0 ? grid.dark[y][x] : grid.dark[x][y]);
            }
            var run = 1;
            for (x = 1; x < size; x++) {
                if (line[x] !== line[x - 1]) {
                    run = 1;
                } else if (++run === 5) {
                    score += QR_PENALTY[0];
                } else if (run > 5) {
                    score++;
                }
            }
            for (x = 0; x + QR_FINDER_RUN.length <= size; x++) {
                if (qrFinderRun(line, x, false) || qrFinderRun(line, x, true)) {
                    score += QR_PENALTY[2];
                }
            }
        }
    }

    // 2: any 2x2 block of one colour.
    for (y = 0; y < size - 1; y++) {
        for (x = 0; x < size - 1; x++) {
            var colour = grid.dark[y][x];
            if (colour === grid.dark[y][x + 1] && colour === grid.dark[y + 1][x] &&
                colour === grid.dark[y + 1][x + 1]) {
                score += QR_PENALTY[1];
            }
        }
    }

    // 4: how far the dark share strays from half, in steps of five per cent.
    var darkCount = 0;
    for (y = 0; y < size; y++) {
        for (x = 0; x < size; x++) {
            if (grid.dark[y][x]) {
                darkCount++;
            }
        }
    }
    var total = size * size;
    score += (Math.ceil(Math.abs(darkCount * 20 - total * 10) / total) - 1) * QR_PENALTY[3];
    return score;
}

// --- The entry point -------------------------------------------------------

/**
 * `text` as a matrix of dark modules, indexed `[y][x]`, with no quiet zone --
 * whoever draws it owns that, because it is four modules of whatever colour the
 * light modules were drawn in.
 *
 * Undefined when the text does not fit version 6, or holds a character above
 * Latin-1: byte mode with no ECI declaration would read that as the wrong
 * character. A share code is ASCII by construction (`escapeShareText` escapes
 * the rest), so the second is a guard rather than a case to handle.
 */
function qrMatrix(text: string): boolean[][] | undefined {
    var bytes: number[] = [];
    for (var i = 0; i < text.length; i++) {
        var code = text.charCodeAt(i);
        if (code > 0xFF) {
            return undefined;
        }
        bytes.push(code);
    }

    var version = 0;
    for (i = 0; i < QR_LEVEL_M.length; i++) {
        // The mode indicator and the length byte are twelve bits between them.
        if (12 + bytes.length * 8 <= QR_LEVEL_M[i][0] * 8) {
            version = i + 1;
            break;
        }
    }
    if (version === 0) {
        return undefined;
    }

    var spec = QR_LEVEL_M[version - 1];
    var grid = qrGrid(version * 4 + 17);
    qrDrawPatterns(grid, version);
    qrDrawCodewords(grid, qrInterleave(qrCodewords(bytes, spec[0]), spec[1], spec[2]));

    var best = 0;
    var bestScore = -1;
    for (var mask = 0; mask < 8; mask++) {
        qrApplyMask(grid, mask);
        qrDrawFormat(grid, mask);
        var score = qrPenalty(grid);
        if (bestScore < 0 || score < bestScore) {
            bestScore = score;
            best = mask;
        }
        qrApplyMask(grid, mask);
    }
    qrApplyMask(grid, best);
    qrDrawFormat(grid, best);
    return grid.dark;
}
