/**
 * 4-component Adobe CMYK JPEG encoder (v0.7.7).
 *
 * jpeg-js hardcodes 3-component (YCbCr) output, so its encoder is adapted here
 * for true CMYK: four components (ids 1–4, 1x1 sampling), no colour-space
 * conversion and the four standard Huffman tables. Following the Adobe
 * convention (APP14 transform=0), the input CMYK *ink* values (0 = no ink,
 * 255 = full ink) are stored **inverted** (255 − ink), as Photoshop and every
 * conforming decoder expect. The APP14 marker tells decoders to read the four
 * components as C, M, Y, K.
 *
 * PERFORMANCE (v0.7.7): the first version of this file built its Huffman and
 * bit-category tables — two `Map`s with 65 534 entries each — *inside* every
 * call, pushed output bytes into a `number[]`, and looked every symbol up
 * through a `Map`. On a 1011×638 card that cost 257 ms, and even a 32×24 test
 * image cost 56 ms. Those tables are constants, so they are now built once per
 * worker (typed arrays), the bit writer is an accumulator with a growable
 * `Uint8Array`, and the 8×8 block fetch is index math instead of per-pixel
 * `Math.min`. Output is byte-for-byte identical to v0.7.6 — enforced by
 * `tests/services/cmykJpegEncoderGolden.test.ts`.
 *
 * Adapted from the jpeg-js encoder (Adobe's public-domain JPEG port via
 * Andreas Ritter, MIT-licensed).
 */

const ZIG_ZAG = [
  0, 1, 5, 6, 14, 15, 27, 28, 2, 4, 7, 13, 16, 26, 29, 42, 3, 8, 12, 17, 25, 30, 41, 43, 9, 11, 18,
  24, 31, 40, 44, 53, 10, 19, 23, 32, 39, 45, 52, 54, 20, 22, 33, 38, 46, 51, 55, 60, 21, 34, 37,
  47, 50, 56, 59, 61, 35, 36, 48, 49, 57, 58, 62, 63,
];

const STD_DC_LUMINANCE_NRCODES = [0, 0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const STD_DC_LUMINANCE_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const STD_AC_LUMINANCE_NRCODES = [0, 0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
const STD_AC_LUMINANCE_VALUES = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
  0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
  0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
  0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
  0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
  0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
  0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
];
const STD_DC_CHROMINANCE_NRCODES = [0, 0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
const STD_DC_CHROMINANCE_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const STD_AC_CHROMINANCE_NRCODES = [0, 0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77];
const STD_AC_CHROMINANCE_VALUES = [
  0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71,
  0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0,
  0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
  0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48,
  0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68,
  0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
  0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5,
  0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3,
  0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
  0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
];

const YQT = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113,
  92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];
const UVQT = [
  17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99,
  47, 66, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
];

/** Strict-mode helper: index into a fully-populated table */
function at<T>(table: readonly T[], index: number): T {
  const value = table[index];
  if (value === undefined) throw new Error(`JPEG table lookup out of range: ${index}`);
  return value;
}

/** A Huffman table flattened to typed arrays (symbol → code, code length) */
interface HuffmanTable {
  /** Huffman code per symbol (only meaningful where `lengths[symbol] > 0`) */
  codes: Int32Array;
  /** Code length per symbol; 0 marks a symbol the table never uses */
  lengths: Uint8Array;
}

/** Standard-table Huffman codes for one table (built once, shared) */
function buildHuffmanTable(
  nrcodes: readonly number[],
  stdTable: readonly number[]
): HuffmanTable {
  const codes = new Int32Array(256);
  const lengths = new Uint8Array(256);
  let codevalue = 0;
  let posInTable = 0;
  for (let k = 1; k <= 16; k += 1) {
    const count = at(nrcodes, k);
    for (let j = 1; j <= count; j += 1) {
      const symbol = at(stdTable, posInTable);
      codes[symbol] = codevalue;
      lengths[symbol] = k;
      posInTable += 1;
      codevalue += 1;
    }
    codevalue *= 2;
  }
  return { codes, lengths };
}

/** Per-image encoding tables (position-independent, built once per process) */
interface EncoderTables {
  luminanceDc: HuffmanTable;
  luminanceAc: HuffmanTable;
  chrominanceDc: HuffmanTable;
  chrominanceAc: HuffmanTable;
  /** Bit category (1–15) per value, indexed by `32767 + coefficient` */
  category: Int32Array;
  /** Amplitude bits per value, indexed by `32767 + coefficient` */
  bitcode: Int32Array;
}

let encoderTables: EncoderTables | null = null;

/**
 * Build the process-wide encoder tables.
 *
 * The Huffman codes, bit categories and amplitudes depend only on the JPEG
 * standard, never on the image or quality. Building them per call was the
 * single largest fixed cost of an encode (~30 ms).
 */
function getEncoderTables(): EncoderTables {
  if (encoderTables) return encoderTables;
  const category = new Int32Array(65535);
  const bitcode = new Int32Array(65535);
  let nrlower = 1;
  let nrupper = 2;
  for (let cat = 1; cat <= 15; cat += 1) {
    for (let nr = nrlower; nr < nrupper; nr += 1) {
      category[32767 + nr] = cat;
      bitcode[32767 + nr] = nr;
    }
    for (let nrneg = -(nrupper - 1); nrneg <= -nrlower; nrneg += 1) {
      category[32767 + nrneg] = cat;
      bitcode[32767 + nrneg] = nrupper - 1 + nrneg;
    }
    nrlower <<= 1;
    nrupper <<= 1;
  }
  encoderTables = {
    luminanceDc: buildHuffmanTable(STD_DC_LUMINANCE_NRCODES, STD_DC_LUMINANCE_VALUES),
    luminanceAc: buildHuffmanTable(STD_AC_LUMINANCE_NRCODES, STD_AC_LUMINANCE_VALUES),
    chrominanceDc: buildHuffmanTable(STD_DC_CHROMINANCE_NRCODES, STD_DC_CHROMINANCE_VALUES),
    chrominanceAc: buildHuffmanTable(STD_AC_CHROMINANCE_NRCODES, STD_AC_CHROMINANCE_VALUES),
    category,
    bitcode,
  };
  return encoderTables;
}

interface QuantTables {
  cTable: number[];
  kTable: number[];
  cDiv: Float64Array;
  kDiv: Float64Array;
}

/** Scaled quantisation tables per quality (only a few distinct qualities run) */
const quantCache = new Map<number, QuantTables>();

/** Build scaled quantisation tables (quality 1–100) and DCT divisors */
function buildQuantTables(quality: number): QuantTables {
  const cached = quantCache.get(quality);
  if (cached) return cached;
  const scale = quality < 50 ? Math.floor(5000 / quality) : Math.floor(200 - quality * 2);
  const cTable = new Array<number>(64).fill(0);
  const kTable = new Array<number>(64).fill(0);
  for (let i = 0; i < 64; i += 1) {
    const t = Math.floor((at(YQT, i) * scale + 50) / 100);
    cTable[at(ZIG_ZAG, i)] = Math.min(255, Math.max(1, t));
    const u = Math.floor((at(UVQT, i) * scale + 50) / 100);
    kTable[at(ZIG_ZAG, i)] = Math.min(255, Math.max(1, u));
  }
  const aasf = [
    1.0, 1.387039845, 1.306562965, 1.175875602, 1.0, 0.785694958, 0.5411961, 0.275899379,
  ];
  const cDiv = new Float64Array(64);
  const kDiv = new Float64Array(64);
  let k = 0;
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      cDiv[k] = 1.0 / (at(cTable, at(ZIG_ZAG, k)) * at(aasf, row) * at(aasf, col) * 8.0);
      kDiv[k] = 1.0 / (at(kTable, at(ZIG_ZAG, k)) * at(aasf, row) * at(aasf, col) * 8.0);
      k += 1;
    }
  }
  const tables: QuantTables = { cTable, kTable, cDiv, kDiv };
  // Quality is a percentage from the UI; keep the cache trivially small.
  if (quantCache.size > 16) quantCache.clear();
  quantCache.set(quality, tables);
  return tables;
}

/**
 * Encode interleaved 4-channel CMYK samples as an Adobe CMYK JPEG (transform=0).
 *
 * @param data - Interleaved CMYK ink values, 4 bytes per pixel (0 = no ink,
 *                255 = full ink), row-major. Stored inverted per the Adobe
 *                CMYK JPEG convention.
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @param quality - JPEG quality 1–100
 * @returns CMYK JPEG bytes (baseline, 4 components, APP14 transform=0)
 */
export function encodeCmykJpegBytes(
  data: Uint8Array,
  width: number,
  height: number,
  quality = 92
): Uint8Array {
  if (data.length < width * height * 4) {
    throw new Error('CMYK JPEG encoder: sample buffer smaller than the image.');
  }
  const q = Math.min(100, Math.max(1, quality));
  const { cTable, kTable, cDiv, kDiv } = buildQuantTables(q);
  const tables = getEncoderTables();
  const { category, bitcode } = tables;

  // --- Growable output buffer (one allocation per image, rarely regrown) ----
  let out = new Uint8Array(Math.max(4096, (width * height) >> 1));
  let outPos = 0;

  /** Emit one header byte (no 0xFF stuffing: headers are never bit-packed) */
  const emit = (value: number): void => {
    if (outPos >= out.length) {
      const grown = new Uint8Array(out.length * 2);
      grown.set(out, 0);
      out = grown;
    }
    out[outPos] = value & 0xff;
    outPos += 1;
  };
  /** Emit one entropy-coded byte, stuffing 0x00 after 0xFF as JPEG requires */
  const emitCoded = (value: number): void => {
    if (outPos + 1 >= out.length) {
      const grown = new Uint8Array(out.length * 2);
      grown.set(out, 0);
      out = grown;
    }
    out[outPos] = value & 0xff;
    outPos += 1;
    if (value === 0xff) {
      out[outPos] = 0;
      outPos += 1;
    }
  };
  const writeWord = (value: number): void => {
    emit((value >> 8) & 0xff);
    emit(value & 0xff);
  };

  // --- Bit writer: accumulate up to 24 bits, flush whole bytes -------------
  let bitBuffer = 0;
  let bitCount = 0;
  const writeBits = (code: number, length: number): void => {
    bitBuffer = (bitBuffer << length) | (code & ((1 << length) - 1));
    bitCount += length;
    while (bitCount >= 8) {
      bitCount -= 8;
      emitCoded((bitBuffer >>> bitCount) & 0xff);
    }
    bitBuffer &= (1 << bitCount) - 1;
  };
  const writeHuffman = (table: HuffmanTable, symbol: number): void => {
    const length = table.lengths[symbol] ?? 0;
    if (length === 0) throw new Error(`CMYK JPEG encoder: missing Huffman symbol ${symbol}.`);
    writeBits(table.codes[symbol] ?? 0, length);
  };

  // SOI + Adobe APP14 (transform=0: CMYK, not YCCK)
  writeWord(0xffd8);
  writeWord(0xffee);
  writeWord(14);
  emit(0x41); // 'A'
  emit(0x64); // 'd'
  emit(0x6f); // 'o'
  emit(0x62); // 'b'
  emit(0x65); // 'e'
  writeWord(0x0064); // version 100
  writeWord(0x0000); // flags0
  writeWord(0x0000); // flags1
  emit(0x00); // transform = 0

  // DQT: two tables (0 = C/K luminance-style, 1 = M/Y chrominance-style)
  writeWord(0xffdb);
  writeWord(132);
  emit(0);
  for (let i = 0; i < 64; i += 1) emit(at(cTable, i));
  emit(1);
  for (let j = 0; j < 64; j += 1) emit(at(kTable, j));

  // SOF0: baseline, 4 components (C=1, M=2, Y=3, K=4), all 1x1 sampling
  writeWord(0xffc0);
  writeWord(8 + 3 * 4); // segment length = 8 + 3 bytes per component
  emit(8); // precision
  writeWord(height);
  writeWord(width);
  emit(4); // nrofcomponents
  emit(1);
  emit(0x11);
  emit(0); // C: id, sampling, quant table 0
  emit(2);
  emit(0x11);
  emit(1); // M: id, sampling, quant table 1
  emit(3);
  emit(0x11);
  emit(1); // Y: id, sampling, quant table 1
  emit(4);
  emit(0x11);
  emit(0); // K: id, sampling, quant table 0

  // DHT: four standard tables (DC0/AC0 for C+K, DC1/AC1 for M+Y)
  writeWord(0xffc4);
  writeWord(0x01a2);
  emit(0x00);
  for (let i = 1; i <= 16; i += 1) emit(at(STD_DC_LUMINANCE_NRCODES, i));
  for (let j = 0; j <= 11; j += 1) emit(at(STD_DC_LUMINANCE_VALUES, j));
  emit(0x10);
  for (let k = 1; k <= 16; k += 1) emit(at(STD_AC_LUMINANCE_NRCODES, k));
  for (let l = 0; l <= 161; l += 1) emit(at(STD_AC_LUMINANCE_VALUES, l));
  emit(0x01);
  for (let m = 1; m <= 16; m += 1) emit(at(STD_DC_CHROMINANCE_NRCODES, m));
  for (let n = 0; n <= 11; n += 1) emit(at(STD_DC_CHROMINANCE_VALUES, n));
  emit(0x11);
  for (let o = 1; o <= 16; o += 1) emit(at(STD_AC_CHROMINANCE_NRCODES, o));
  for (let p = 0; p <= 161; p += 1) emit(at(STD_AC_CHROMINANCE_VALUES, p));

  // SOS: 4 components, DC/AC table selectors matching DHT
  writeWord(0xffda);
  writeWord(6 + 2 * 4); // segment length = 6 + 2 bytes per component
  emit(4); // nrofcomponents
  emit(1);
  emit(0x00); // C: DC0, AC0
  emit(2);
  emit(0x11); // M: DC1, AC1
  emit(3);
  emit(0x11); // Y: DC1, AC1
  emit(4);
  emit(0x00); // K: DC0, AC0
  emit(0); // Ss
  emit(0x3f); // Se
  emit(0); // Ah/Al

  const block = new Float64Array(64);
  const du = new Float64Array(64);
  /** Row base offsets for the current block (clamped at the bottom edge) */
  const rowOffsets = new Int32Array(8);

  /** Forward DCT + quantise + Huffman-encode one 8x8 block; returns new DC predictor */
  function processBlock(
    fdtbl: Float64Array,
    dc: number,
    htDc: HuffmanTable,
    htAc: HuffmanTable
  ): number {
    // Pass 1: rows
    for (let i = 0; i < 8; i += 1) {
      const off = i * 8;
      const d0 = block[off]!;
      const d1 = block[off + 1]!;
      const d2 = block[off + 2]!;
      const d3 = block[off + 3]!;
      const d4 = block[off + 4]!;
      const d5 = block[off + 5]!;
      const d6 = block[off + 6]!;
      const d7 = block[off + 7]!;
      const tmp0 = d0 + d7;
      const tmp7 = d0 - d7;
      const tmp1 = d1 + d6;
      const tmp6 = d1 - d6;
      const tmp2 = d2 + d5;
      const tmp5 = d2 - d5;
      const tmp3 = d3 + d4;
      const tmp4 = d3 - d4;
      const tmp10 = tmp0 + tmp3;
      const tmp13 = tmp0 - tmp3;
      const tmp11 = tmp1 + tmp2;
      const tmp12 = tmp1 - tmp2;
      block[off] = tmp10 + tmp11;
      block[off + 4] = tmp10 - tmp11;
      const z1 = (tmp12 + tmp13) * 0.707106781;
      block[off + 2] = tmp13 + z1;
      block[off + 6] = tmp13 - z1;
      const tmp10b = tmp4 + tmp5;
      const tmp11b = tmp5 + tmp6;
      const tmp12b = tmp6 + tmp7;
      const z5 = (tmp10b - tmp12b) * 0.382683433;
      const z2 = 0.5411961 * tmp10b + z5;
      const z4 = 1.306562965 * tmp12b + z5;
      const z3 = tmp11b * 0.707106781;
      const z11 = tmp7 + z3;
      const z13 = tmp7 - z3;
      block[off + 5] = z13 + z2;
      block[off + 3] = z13 - z2;
      block[off + 1] = z11 + z4;
      block[off + 7] = z11 - z4;
    }
    // Pass 2: columns
    for (let i = 0; i < 8; i += 1) {
      const d0 = block[i]!;
      const d1 = block[i + 8]!;
      const d2 = block[i + 16]!;
      const d3 = block[i + 24]!;
      const d4 = block[i + 32]!;
      const d5 = block[i + 40]!;
      const d6 = block[i + 48]!;
      const d7 = block[i + 56]!;
      const tmp0 = d0 + d7;
      const tmp7 = d0 - d7;
      const tmp1 = d1 + d6;
      const tmp6 = d1 - d6;
      const tmp2 = d2 + d5;
      const tmp5 = d2 - d5;
      const tmp3 = d3 + d4;
      const tmp4 = d3 - d4;
      const tmp10 = tmp0 + tmp3;
      const tmp13 = tmp0 - tmp3;
      const tmp11 = tmp1 + tmp2;
      const tmp12 = tmp1 - tmp2;
      block[i] = tmp10 + tmp11;
      block[i + 32] = tmp10 - tmp11;
      const z1 = (tmp12 + tmp13) * 0.707106781;
      block[i + 16] = tmp13 + z1;
      block[i + 48] = tmp13 - z1;
      const tmp10b = tmp4 + tmp5;
      const tmp11b = tmp5 + tmp6;
      const tmp12b = tmp6 + tmp7;
      const z5 = (tmp10b - tmp12b) * 0.382683433;
      const z2 = 0.5411961 * tmp10b + z5;
      const z4 = 1.306562965 * tmp12b + z5;
      const z3 = tmp11b * 0.707106781;
      const z11 = tmp7 + z3;
      const z13 = tmp7 - z3;
      block[i + 40] = z13 + z2;
      block[i + 24] = z13 - z2;
      block[i + 8] = z11 + z4;
      block[i + 56] = z11 - z4;
    }
    // Quantise
    for (let i = 0; i < 64; i += 1) {
      const v = block[i]! * fdtbl[i]!;
      block[i] = v > 0.0 ? Math.floor(v + 0.5) : Math.ceil(v - 0.5);
    }
    // Zig-zag reorder
    for (let j = 0; j < 64; j += 1) du[ZIG_ZAG[j]!] = block[j]!;

    const newDc = du[0]!;
    const diff = newDc - dc;
    if (diff === 0) {
      writeHuffman(htDc, 0);
    } else {
      const pos = 32767 + diff;
      const cat = category[pos]!;
      writeHuffman(htDc, cat);
      writeBits(bitcode[pos]!, cat);
    }
    let end0pos = 63;
    while (end0pos > 0 && du[end0pos] === 0) end0pos -= 1;
    if (end0pos === 0) {
      writeHuffman(htAc, 0x00);
      return newDc;
    }
    let i = 1;
    while (i <= end0pos) {
      const startpos = i;
      while (du[i] === 0 && i <= end0pos) i += 1;
      let nrzeroes = i - startpos;
      if (nrzeroes >= 16) {
        const lng = nrzeroes >> 4;
        for (let nrmarker = 1; nrmarker <= lng; nrmarker += 1) writeHuffman(htAc, 0xf0);
        nrzeroes &= 0xf;
      }
      const pos = 32767 + du[i]!;
      const cat = category[pos]!;
      writeHuffman(htAc, (nrzeroes << 4) + cat);
      writeBits(bitcode[pos]!, cat);
      i += 1;
    }
    if (end0pos !== 63) writeHuffman(htAc, 0x00);
    return newDc;
  }

  // Encode 8x8 blocks, channel order C, M, Y, K
  const divs = [cDiv, kDiv, kDiv, cDiv];
  const dcHts = [
    tables.luminanceDc,
    tables.chrominanceDc,
    tables.chrominanceDc,
    tables.luminanceDc,
  ];
  const acHts = [
    tables.luminanceAc,
    tables.chrominanceAc,
    tables.chrominanceAc,
    tables.luminanceAc,
  ];
  const dcs = [0, 0, 0, 0];
  const rowStride = width * 4;

  for (let by = 0; by < height; by += 8) {
    // Row base offsets for this block row, clamped at the bottom edge.
    for (let row = 0; row < 8; row += 1) {
      rowOffsets[row] = Math.min(height - 1, by + row) * rowStride;
    }
    for (let bx = 0; bx < width; bx += 8) {
      // Right-edge clamp for the last block of the row.
      const lastCol = Math.min(7, width - 1 - bx);
      const columnBase = bx * 4;
      for (let comp = 0; comp < 4; comp += 1) {
        // Extract the 8x8 block for this component.
        for (let pos = 0; pos < 64; pos += 1) {
          const row = pos >> 3;
          const col = pos & 7;
          const px = col <= lastCol ? col : lastCol;
          // Adobe convention: store the complement (255 − ink), then level-shift.
          block[pos] = 127 - data[rowOffsets[row]! + columnBase + px * 4 + comp]!;
        }
        dcs[comp] = processBlock(divs[comp]!, dcs[comp]!, dcHts[comp]!, acHts[comp]!);
      }
    }
  }

  // Bit alignment + EOI. v0.7.6 always padded to a full byte, which emits a
  // stuffed 0xFF 0x00 even when the stream is already byte-aligned; keep that
  // exactly so the output stays byte-identical to the previous encoder.
  const pad = 8 - bitCount;
  writeBits((1 << pad) - 1, pad);
  writeWord(0xffd9);

  return out.slice(0, outPos);
}
