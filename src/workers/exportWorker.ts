/**
 * Dedicated Web Worker for CPU-heavy batch export work (v0.7.8).
 *
 * Responsibilities moved off the main thread:
 * - ICC colour conversion (sRGB → CMYK, LittleCMS WASM) on the RGBA pixels read
 *   back from the card canvas;
 * - CMYK JPEG encoding (the 4-component JPEG compressor is pure CPU);
 * - DEFLATE of raw CMYK samples for PDF image XObjects.
 *
 * COLOUR IS EXACT. The transform uses `FLAGS_NOOPTIMIZE` (see
 * `cmykTransformFlags.ts`), which is what the presses are calibrated against.
 * To keep that affordable, the batch's first card becomes a PLATE: its RGBA and
 * its transformed CMYK stay cached here, and later cards only transform the
 * pixels that differ from it (see `cmykPlateSplice`). For any unchanged pixel
 * the cached CMYK is used, so the resulting buffer is byte-identical to a full
 * transform of the card. A worker without a plate simply transforms whole
 * cards — same output, no correctness dependency on cache state.
 *
 * Protocol — flat messages, no envelope:
 * - `{ id, type: 'encode-jpeg' | 'encode-card' | 'deflate', … }` → answered with
 *   `{ id, ok: true, result }` or `{ id, ok: false, error }`;
 * - `{ type: 'prime-plate', plateId, rgba }` → fire-and-forget (no id, no reply).
 *
 * Transferables (ArrayBuffers) are moved, never copied, so peak memory stays at
 * one card plus the cached plate.
 */

import * as encoder from '../services/cmykJpegEncoder';
import { spliceCardOntoPlate } from '../services/cmykPlateSplice';
import {
  cmsCreate_sRGBProfile,
  cmsOpenProfileFromMem,
  cmsCreateTransform,
  cmsDoTransform,
  CmsIntent,
  type cmsHTRANSFORM,
} from '@kittl/little-cms';
import { TYPE_RGB_8, TYPE_CMYK_8 } from '@kittl/little-cms/formats';
import { CMYK_TRANSFORM_FLAGS } from '../services/cmykTransformFlags';
import { loadLittleCms } from '../services/lcmsEngine';

/** Remember the batch's first card for later diffs */
interface PrimePlateRequest {
  type: 'prime-plate';
  plateId: string;
  rgba: ArrayBuffer;
}

/** Anything else carries an id and is answered */
type WorkerRequest =
  | PrimePlateRequest
  | {
      id: number;
      type: 'encode-jpeg';
      cmyk: ArrayBuffer;
      width: number;
      height: number;
      quality: number;
    }
  | {
      id: number;
      type: 'encode-card';
      rgba: ArrayBuffer;
      width: number;
      height: number;
      quality: number;
      wasmUrl: string;
      profileUrl: string;
      plateId: string;
    }
  | { id: number; type: 'deflate'; raw: ArrayBuffer };

/** Response for one request */
interface WorkerResponse {
  id: number;
  ok: boolean;
  /** Encoded bytes (transferred back; ArrayBuffer) */
  result?: ArrayBuffer;
  error?: string;
}

/** This worker's LittleCMS transform (created once, reused for every card) */
let transformHandle: cmsHTRANSFORM | null = null;
let enginePromise: Promise<cmsHTRANSFORM> | null = null;

/** A plate: the pixels it was captured from plus their exact CMYK */
interface PlateCache {
  rgba: Uint8Array;
  /** Lazily computed on first use (one full transform per worker per plate) */
  cmyk: Uint8Array | null;
}

/** Plates by id — a duplex job needs one per side */
const plates = new Map<string, PlateCache>();
const MAX_PLATES = 4;

/** Post to the main thread (the DOM lib types `self` as a Window here) */
function post(message: WorkerResponse, transfer: ArrayBuffer[] = []): void {
  (self as unknown as Worker).postMessage(message, transfer);
}

/** Minimal DEFLATE (zlib stream) via CompressionStream when available */
async function deflateRaw(raw: Uint8Array): Promise<Uint8Array> {
  // zlib wrapper (wbits=15) is what PDF FlateDecode expects.
  if (typeof CompressionStream === 'function') {
    const part: BlobPart = raw.buffer as ArrayBuffer;
    const stream = new Blob([part]).stream().pipeThrough(new CompressionStream('deflate'));
    const buffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(buffer);
  }
  throw new Error('CompressionStream unavailable in this browser.');
}

/**
 * Initialise LittleCMS inside this worker and create the sRGB→CMYK transform.
 *
 * @param wasmUrl - Absolute URL of the bundled lcms.wasm
 * @param profileUrl - Absolute URL of the bundled default_cmyk.icc
 * @returns The worker's transform handle
 */
async function ensureEngine(wasmUrl: string, profileUrl: string): Promise<cmsHTRANSFORM> {
  if (transformHandle !== null) return transformHandle;
  if (!enginePromise) {
    enginePromise = (async () => {
      // Shared loader: single flight per worker + retry on a failed asset fetch.
      await loadLittleCms(wasmUrl);
      const srgb = cmsCreate_sRGBProfile();
      if (srgb.error) throw new Error('Failed to create the sRGB ICC profile.');
      const response = await fetch(profileUrl);
      const cmyk = cmsOpenProfileFromMem(new Uint8Array(await response.arrayBuffer()));
      if (cmyk.error) throw new Error('Failed to load the bundled CMYK ICC profile.');
      const transform = cmsCreateTransform(
        srgb.value,
        TYPE_RGB_8,
        cmyk.value,
        TYPE_CMYK_8,
        CmsIntent.Percepttual,
        CMYK_TRANSFORM_FLAGS
      );
      if (transform.error) throw new Error('Failed to create the sRGB→CMYK colour transform.');
      transformHandle = transform.value;
      return transform.value;
    })();
    enginePromise.catch(() => {
      enginePromise = null;
    });
  }
  return enginePromise;
}

/** Run the ICC transform over a tight RGB buffer */
function transformRgb(
  transform: cmsHTRANSFORM,
  rgb: Uint8Array,
  pixelCount: number
): Uint8Array {
  const result = cmsDoTransform(transform, rgb, pixelCount);
  if (result.error) throw new Error(`ICC transform failed: ${String(result.error)}`);
  return result.value;
}

/**
 * Repack RGBA pixels into a tight RGB buffer and run the ICC transform.
 *
 * Byte-for-byte the same loop as `cmykExportService`'s `canvasToCmykBytes`
 * (RGBA → 3 bytes per pixel, alpha dropped). The pixel count comes from the
 * buffer, which is always a whole card or a whole plate.
 */
function rgbaToCmyk(transform: cmsHTRANSFORM, rgba: Uint8Array): Uint8Array {
  const pixelCount = rgba.length / 4;
  const rgb = new Uint8Array(pixelCount * 3);
  for (let p = 0, s = 0, d = 0; p < pixelCount; p += 1, s += 4, d += 3) {
    rgb[d] = rgba[s] ?? 0;
    rgb[d + 1] = rgba[s + 1] ?? 0;
    rgb[d + 2] = rgba[s + 2] ?? 0;
  }
  return transformRgb(transform, rgb, pixelCount);
}

/** Encode one card's pixels, reusing the plate for unchanged areas */
async function encodeCard(request: Extract<WorkerRequest, { type: 'encode-card' }>): Promise<void> {
  const transform = await ensureEngine(request.wasmUrl, request.profileUrl);
  const rgba = new Uint8Array(request.rgba);
  let cmyk: Uint8Array | null = null;

  const cached = plates.get(request.plateId);
  if (cached) {
    if (!cached.cmyk) {
      // One full transform per worker per batch, then reused.
      cached.cmyk = rgbaToCmyk(transform, cached.rgba);
    }
    // Returns null for a card that cannot share this plate (e.g. another
    // size); the card is then transformed in full, with identical output.
    cmyk =
      spliceCardOntoPlate(rgba, { rgba: cached.rgba, cmyk: cached.cmyk }, (rgb, count) =>
        transformRgb(transform, rgb, count)
      )?.cmyk ?? null;
  }

  if (!cmyk) cmyk = rgbaToCmyk(transform, rgba);

  const bytes = encoder.encodeCmykJpegBytes(cmyk, request.width, request.height, request.quality);
  post({ id: request.id, ok: true, result: bytes.buffer as ArrayBuffer }, [
    bytes.buffer as ArrayBuffer,
  ]);
}

/** Dispatch one worker message */
async function handleRequest(request: WorkerRequest): Promise<void> {
  if (request.type === 'prime-plate') {
    // Fire-and-forget: keep this card for later cards to diff.
    plates.set(request.plateId, { rgba: new Uint8Array(request.rgba), cmyk: null });
    while (plates.size > MAX_PLATES) {
      const oldest = plates.keys().next();
      if (oldest.done) break;
      plates.delete(oldest.value);
    }
    return;
  }

  try {
    if (request.type === 'encode-card') {
      await encodeCard(request);
      return;
    }

    if (request.type === 'encode-jpeg') {
      const bytes = encoder.encodeCmykJpegBytes(
        new Uint8Array(request.cmyk),
        request.width,
        request.height,
        request.quality
      );
      post({ id: request.id, ok: true, result: bytes.buffer as ArrayBuffer }, [
        bytes.buffer as ArrayBuffer,
      ]);
      return;
    }

    if (request.type === 'deflate') {
      const bytes = await deflateRaw(new Uint8Array(request.raw));
      post({ id: request.id, ok: true, result: bytes.buffer as ArrayBuffer }, [
        bytes.buffer as ArrayBuffer,
      ]);
      return;
    }

    throw new Error(`Unknown worker request type: ${String((request as { type?: string }).type)}`);
  } catch (error) {
    post({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown worker error',
    });
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>): void => {
  void handleRequest(event.data);
};

export {};
