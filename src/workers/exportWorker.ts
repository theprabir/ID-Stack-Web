/**
 * Dedicated Web Worker for CPU-heavy batch export work (Phase 7).
 *
 * Responsibilities moved off the main thread:
 * - CMYK JPEG encoding (the 4-component JPEG compressor is pure CPU)
 * - DEFLATE of raw CMYK samples for PDF image XObjects
 *
 * ICC colour conversion (LittleCMS WASM) stays on the main thread because it
 * is shared with the imposed-sheet pipeline and caches its transform handle;
 * the worker receives already-converted CMYK samples.
 *
 * Protocol: request → { id, type, payload } ; response → { id, ok, result }
 * or { id, ok: false, error }. Transferables (ArrayBuffers) are moved, never
 * copied, so peak memory stays at one card, not two.
 */

/** Any payload the worker understands */
type WorkerRequest =
  | {
      id: number;
      type: 'encode-jpeg';
      cmyk: ArrayBuffer;
      width: number;
      height: number;
      quality: number;
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

const encoder: typeof import('../services/cmykJpegEncoder') =
  await import('../services/cmykJpegEncoder');

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

self.onmessage = async (event: MessageEvent<WorkerRequest>): Promise<void> => {
  const request = event.data;
  try {
    if (request.type === 'encode-jpeg') {
      const bytes = encoder.encodeCmykJpegBytes(
        new Uint8Array(request.cmyk),
        request.width,
        request.height,
        request.quality
      );
      const response: WorkerResponse = {
        id: request.id,
        ok: true,
        result: bytes.buffer as ArrayBuffer,
      };
      (self as unknown as Worker).postMessage(response, [response.result!]);
      return;
    }

    if (request.type === 'deflate') {
      const deflated = await deflateRaw(new Uint8Array(request.raw));
      const response: WorkerResponse = {
        id: request.id,
        ok: true,
        result: deflated.buffer as ArrayBuffer,
      };
      (self as unknown as Worker).postMessage(response, [response.result!]);
      return;
    }

    throw new Error(`Unknown worker request type: ${String((request as { type?: string }).type)}`);
  } catch (error) {
    const response: WorkerResponse = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown worker error',
    };
    (self as unknown as Worker).postMessage(response);
  }
};

export {};
