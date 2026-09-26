/**
 * CMYK export engine (v0.4.2).
 *
 * Everything print shops need, 100% client-side:
 * 1. True ICC colour transform (sRGB → CMYK) via LittleCMS WASM, using the
 *    bundled Ghostscript default_cmyk.icc profile.
 * 2. True 4-component Adobe CMYK JPEG encoding (custom encoder — jpeg-js only
 *    writes YCbCr; its APP14 transform=0 marker identifies C, M, Y, K).
 * 3. Direct CMYK PDF export via pdf-lib: DeviceCMYK image XObject with an
 *    ICCBased colour space and a document OutputIntent — no Photoshop step.
 */
import { PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFString } from 'pdf-lib';
import { encodeCmykJpegBytes } from '@/services/cmykJpegEncoder';
import {
  initWasm,
  cmsCreate_sRGBProfile,
  cmsOpenProfileFromMem,
  cmsCreateTransform,
  cmsDoTransform,
  cmsDeleteTransform,
  cmsCloseProfile,
  CmsIntent,
  type cmsHPROFILE,
  type cmsHTRANSFORM,
} from '@kittl/little-cms';
import { TYPE_RGB_8, TYPE_CMYK_8 } from '@kittl/little-cms/formats';
import { FLAGS_NOOPTIMIZE } from '@kittl/little-cms/flags';
import cmykProfileUrl from '@/assets/profiles/default_cmyk.icc?url';
import lcmsWasmUrl from '@/assets/profiles/lcms.wasm?url';

/** The producer string written into exported PDF documents */
const PDF_PRODUCER = 'ID Stack v0.4.2';

/** Cached bundled CMYK ICC profile bytes */
let cmykProfileCache: Uint8Array | null = null;

/** Fetch and cache the bundled CMYK ICC profile */
async function getCmykProfileBytes(): Promise<Uint8Array> {
  if (cmykProfileCache) return cmykProfileCache;
  const response = await fetch(cmykProfileUrl);
  const buffer = await response.arrayBuffer();
  cmykProfileCache = new Uint8Array(buffer);
  return cmykProfileCache;
}

/** Live LittleCMS handles (created once per session) */
let transformHandle: cmsHTRANSFORM | null = null;
let srgbHandle: cmsHPROFILE | null = null;
let cmykHandle: cmsHPROFILE | null = null;

/**
 * Initialise LittleCMS WASM and the sRGB→CMYK transform.
 * Safe to call repeatedly; the transform is created once and reused.
 *
 * @throws Error when WASM init, profile loading or transform creation fails
 */
export async function initCmykEngine(): Promise<void> {
  if (transformHandle !== null) return;

  const initResult = await initWasm(new URL(lcmsWasmUrl, document.baseURI).href);
  if (initResult.error) {
    throw new Error(`LittleCMS failed to initialise: ${String(initResult.error)}`);
  }

  const srgb = cmsCreate_sRGBProfile();
  if (srgb.error) throw new Error('Failed to create the sRGB ICC profile.');
  srgbHandle = srgb.value;

  const cmykBytes = await getCmykProfileBytes();
  const cmyk = cmsOpenProfileFromMem(cmykBytes);
  if (cmyk.error) throw new Error('Failed to load the bundled CMYK ICC profile.');
  cmykHandle = cmyk.value;

  const transform = cmsCreateTransform(
    srgbHandle,
    TYPE_RGB_8,
    cmykHandle,
    TYPE_CMYK_8,
    CmsIntent.Percepttual,
    FLAGS_NOOPTIMIZE
  );
  if (transform.error) throw new Error('Failed to create the sRGB→CMYK colour transform.');
  transformHandle = transform.value;
}

/** Release all cached LittleCMS handles. */
export function disposeCmykEngine(): void {
  if (transformHandle !== null) {
    cmsDeleteTransform(transformHandle);
    transformHandle = null;
  }
  if (srgbHandle !== null) {
    cmsCloseProfile(srgbHandle);
    srgbHandle = null;
  }
  if (cmykHandle !== null) {
    cmsCloseProfile(cmykHandle);
    cmykHandle = null;
  }
}

/**
 * Convert canvas pixels to CMYK through the ICC transform.
 *
 * @param canvas - Source canvas (its RGB content is used; alpha is dropped)
 * @returns Interleaved CMYK bytes, 4 per pixel, top row first
 * @throws Error when the engine is not initialised or the transform fails
 */
export async function canvasToCmykBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  await initCmykEngine();
  if (transformHandle === null) throw new Error('CMYK engine not initialised.');

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable.');
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

  const pixelCount = canvas.width * canvas.height;
  // Tight RGB buffer: LittleCMS reads exactly 3 bytes per pixel for TYPE_RGB_8.
  const rgb = new Uint8Array(pixelCount * 3);
  const source = imageData.data;
  for (let p = 0, s = 0, d = 0; p < pixelCount; p += 1, s += 4, d += 3) {
    rgb[d] = source[s] ?? 0;
    rgb[d + 1] = source[s + 1] ?? 0;
    rgb[d + 2] = source[s + 2] ?? 0;
  }

  const result = cmsDoTransform(transformHandle, rgb, pixelCount);
  if (result.error) throw new Error(`ICC transform failed: ${String(result.error)}`);
  return result.value;
}

/** JPEG segment markers used by the APP14 patcher */
const MARKER_SOF_BASE = 0xc0;
const MARKER_SOF_MAX = 0xcf;
const MARKER_DHT = 0xc4;
const MARKER_JPG = 0xc8;
const MARKER_DAC = 0xcc;
const MARKER_SOS = 0xda;
const MARKER_APP14 = 0xee;

/** Find the byte offset after SOI and any existing APPn/COM markers */
function findHeaderInsertionOffset(bytes: Uint8Array): number {
  let offset = 2; // skip SOI
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1] ?? 0x00;
    const isHeaderMarker = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe; // APPn / COM
    if (!isHeaderMarker) break;
    const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
    offset += 2 + length;
  }
  return offset;
}

/** Build an Adobe APP14 marker with transform=0 (CMYK, not YCCK).
 *  Layout: FF EE | len=0x000E | 'Adobe' | version=0x0064 | flags0 | flags1 | transform
 *  (16 bytes total: 2 marker + 14 counted by the length field) */
function buildAdobeApp14Marker(): Uint8Array {
  const marker = new Uint8Array(16);
  marker[0] = 0xff;
  marker[1] = MARKER_APP14;
  marker[2] = 0x00; // segment length high
  marker[3] = 0x0e; // segment length low (14, counting the 2 length bytes)
  marker[4] = 0x41; // 'A'
  marker[5] = 0x64; // 'd'
  marker[6] = 0x6f; // 'o'
  marker[7] = 0x62; // 'b'
  marker[8] = 0x65; // 'e'
  marker[9] = 0x00; // version high
  marker[10] = 0x64; // version low (100)
  marker[11] = 0x00; // flags0 high
  marker[12] = 0x00; // flags0 low
  marker[13] = 0x00; // flags1 high
  marker[14] = 0x00; // flags1 low
  marker[15] = 0x00; // transform = 0 → CMYK
  return marker;
}

/**
 * Ensure the JPEG carries an Adobe APP14 marker with transform=0 so every
 * decoder (Photoshop, Acrobat, Ghostscript) treats the 4-component stream
 * as CMYK rather than YCCK.
 * @internal exported for unit testing
 */
export function ensureAdobeApp14Transform0(bytes: Uint8Array): Uint8Array {
  // Scan APPn/COM segments only (the header region before the first frame marker).
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1] ?? 0x00;
    if (marker === MARKER_APP14) {
      const patched = bytes.slice();
      patched[offset + 15] = 0x00; // transform byte (last of the 14-byte segment payload)
      return patched;
    }
    const isHeaderMarker = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;
    const isFrameMarker =
      (marker >= MARKER_SOF_BASE &&
        marker <= MARKER_SOF_MAX &&
        marker !== MARKER_DHT &&
        marker !== MARKER_JPG &&
        marker !== MARKER_DAC) ||
      marker === MARKER_SOS;
    if (!isHeaderMarker || isFrameMarker) break;
    const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
    offset += 2 + length;
  }

  const insertion = findHeaderInsertionOffset(bytes);
  const app14 = buildAdobeApp14Marker();
  const out = new Uint8Array(bytes.length + app14.length);
  out.set(bytes.subarray(0, insertion), 0);
  out.set(app14, insertion);
  out.set(bytes.subarray(insertion), insertion + app14.length);
  return out;
}

/**
 * Encode a canvas as a 4-component Adobe CMYK JPEG.
 *
 * The pixels are ICC-transformed to CMYK, then compressed with the local
 * 4-component JPEG encoder. The Adobe APP14 marker (transform=0) tells
 * decoders to read the four components as C, M, Y, K.
 *
 * @param canvas - Source canvas (RGB content)
 * @param quality - JPEG quality 0–1 (clamped)
 * @returns CMYK JPEG bytes
 */
export async function encodeCmykJpeg(
  canvas: HTMLCanvasElement,
  quality = 0.92
): Promise<Uint8Array> {
  await initCmykEngine();
  const cmyk = await canvasToCmykBytes(canvas);
  return encodeCmykJpegBytes(
    cmyk,
    canvas.width,
    canvas.height,
    Math.max(10, Math.min(100, Math.round(quality * 100)))
  );
}

/**
 * Build a CMYK PDF from one or more canvases: each canvas becomes one page
 * exactly the size of the canvas (in points), drawn as a full-bleed CMYK
 * image XObject (FlateDecode, ICCBased colour space holding the bundled
 * profile) with a GTS_PDFX OutputIntent. Print shops receive a genuine CMYK
 * document — no RGB round-trip, no Photoshop step.
 *
 * @param canvases - Source canvases (one per page, in page order)
 * @returns PDF file bytes
 */
async function buildCmykPdf(canvases: HTMLCanvasElement[]): Promise<Uint8Array> {
  await initCmykEngine();

  const profileBytes = await getCmykProfileBytes();
  const pdf = await PDFDocument.create();
  pdf.setProducer(PDF_PRODUCER);
  pdf.setCreator('ID Stack');

  // Shared ICCBased colour space [/ICCBased <ref to profile stream with N=4>]
  const profileStream = PDFRawStream.of(
    pdf.context.obj({ N: PDFNumber.of(4), Length: PDFNumber.of(profileBytes.length) }),
    profileBytes
  );
  const profileRef = pdf.context.register(profileStream);
  const iccBased = pdf.context.obj([PDFName.of('ICCBased'), profileRef]);

  for (const canvas of canvases) {
    // Canvas and PDF image data are both top-row-first — no row reordering.
    const cmyk = await canvasToCmykBytes(canvas);
    const { width, height } = canvas;

    const page = pdf.addPage([width, height]);

    // CMYK image XObject, full canvas size, Flate-compressed raw samples.
    const imageStream = pdf.context.flateStream(cmyk, {
      Type: 'XObject',
      Subtype: 'Image',
      Width: PDFNumber.of(width),
      Height: PDFNumber.of(height),
      ColorSpace: iccBased,
      BitsPerComponent: PDFNumber.of(8),
    });
    const imageRef = pdf.context.register(imageStream);

    // Page content draws the image full-bleed; resources reference it.
    // (Copied into a plain Uint8Array — pdf-lib's instanceof check rejects
    // cross-realm typed arrays, e.g. from jsdom's TextEncoder in tests.)
    const content = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;
    const contentStream = pdf.context.flateStream(
      new Uint8Array(new TextEncoder().encode(content)),
      {}
    );
    const contentRef = pdf.context.register(contentStream);

    const resources = pdf.context.obj({
      XObject: pdf.context.obj({ Im0: imageRef }),
    });
    const resourcesRef = pdf.context.register(resources);

    page.node.set(PDFName.of('Resources'), resourcesRef);
    page.node.set(PDFName.of('Contents'), contentRef);
  }

  // GTS_PDFX OutputIntent so print workflows recognise the CMYK target.
  const outputIntent = pdf.context.obj({
    Type: 'OutputIntent',
    S: PDFName.of('GTS_PDFX'),
    OutputConditionIdentifier: PDFString.of('CUSTOM_CMYK'),
    RegistryName: PDFString.of('http://www.color.org'),
    Info: PDFString.of('ID Stack CMYK export (coated-like generic CMYK)'),
    DestOutputProfile: profileRef,
  });
  const outputIntentRef = pdf.context.register(outputIntent);
  pdf.catalog.set(PDFName.of('OutputIntents'), pdf.context.obj([outputIntentRef]));

  return pdf.save({ useObjectStreams: false });
}

/**
 * Export a canvas as a direct CMYK PDF.
 *
 * @param canvas - Source canvas (RGB content)
 * @returns PDF file bytes
 */
export async function encodeCmykPdf(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return buildCmykPdf([canvas]);
}

/**
 * Export two canvases as a single two-page CMYK PDF (front + back of one
 * person's card) so each data row produces exactly one print-ready file.
 *
 * @param front - Front-face canvas
 * @param back - Back-face canvas
 * @returns PDF file bytes (page 1 = front, page 2 = back)
 */
export function encodeCmykPdfDoubleSided(
  front: HTMLCanvasElement,
  back: HTMLCanvasElement
): Promise<Uint8Array> {
  return buildCmykPdf([front, back]);
}
