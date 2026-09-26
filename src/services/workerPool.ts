/**
 * Worker pool client for the batch export worker (Phase 7).
 *
 * - Spawns one dedicated worker (Vite `new Worker(new URL(...))`).
 * - Promise-based request/response with id matching and transferables.
 * - Graceful degradation: every request can fall back to a main-thread
   implementation, so export NEVER fails just because workers are
   unavailable (older browsers, restrictive CSP, jsdom tests).
 * - Terminated pool recreates the worker on demand; errors reject only the
 *   affected request, then the worker is recycled.
 */
import { encodeCmykJpegBytes } from './cmykJpegEncoder';

/** Pending request bookkeeping */
interface Pending {
  resolve: (value: ArrayBuffer) => void;
  reject: (error: Error) => void;
}

export type ExportWorkerRequest =
  | {
      id: number;
      type: 'encode-jpeg';
      cmyk: ArrayBuffer;
      width: number;
      height: number;
      quality: number;
    }
  | { id: number; type: 'deflate'; raw: ArrayBuffer };

/** Request without the id (added by the pool) — declared separately because
 * Omit on a union collapses it to the shared keys only. */
type ExportWorkerPayload =
  | { type: 'encode-jpeg'; cmyk: ArrayBuffer; width: number; height: number; quality: number }
  | { type: 'deflate'; raw: ArrayBuffer };

/** Singleton worker + pending map */
let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map<number, Pending>();

/** Create the worker lazily via Vite's static worker import */
function ensureWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('../workers/exportWorker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (
      event: MessageEvent<{ id: number; ok: boolean; result?: ArrayBuffer; error?: string }>
    ) => {
      const { id, ok, result, error } = event.data;
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      if (ok && result !== undefined) entry.resolve(result);
      else entry.reject(new Error(error ?? 'Worker request failed.'));
    };
    worker.onerror = () => {
      // Recycle: fail everything pending and mark the pool unusable so
      // callers transparently fall back to the main thread.
      for (const [, entry] of pending) entry.reject(new Error('Export worker crashed.'));
      pending.clear();
      worker?.terminate();
      worker = null;
      workerBroken = true;
    };
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

/** Post one request to the worker (or fall back) and await the bytes */
async function requestBytes(
  request: ExportWorkerPayload,
  fallback: () => Uint8Array | Promise<Uint8Array>
): Promise<Uint8Array> {
  const active = ensureWorker();
  if (!active) return fallback();

  const id = nextId++;
  const promise = new Promise<ArrayBuffer>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    // Guard against a wedged worker: 60 s timeout per request.
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error('Export worker timed out.'));
      }
    }, 60_000);
  });

  const transfer: ArrayBuffer[] = [];
  if (request.type === 'encode-jpeg') transfer.push(request.cmyk);
  else transfer.push(request.raw);
  active.postMessage(request as ExportWorkerRequest, { transfer });

  try {
    return new Uint8Array(await promise);
  } catch {
    // Worker path failed — fall back rather than failing the batch.
    return fallback();
  }
}

/**
 * Encode CMYK samples as an Adobe CMYK JPEG in the worker.
 *
 * @param cmyk - Interleaved CMYK samples (transferred; consumed)
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @param quality - JPEG quality 1–100
 * @returns JPEG bytes
 */
export async function encodeJpegInWorker(
  cmyk: Uint8Array,
  width: number,
  height: number,
  quality: number
): Promise<Uint8Array> {
  // Copy into an exactly-sized buffer: the original is owned by the caller.
  const copy = cmyk.slice();
  const bytes = await requestBytes(
    {
      type: 'encode-jpeg',
      cmyk: copy.buffer as ArrayBuffer,
      width,
      height,
      quality,
    } as ExportWorkerPayload,
    () => encodeCmykJpegBytes(cmyk, width, height, quality)
  );
  return bytes;
}

/**
 * DEFLATE raw bytes (zlib wrapper, PDF FlateDecode-compatible) in the worker.
 *
 * @param raw - Raw bytes (copied; original stays owned by the caller)
 * @returns Deflated bytes
 */
export async function deflateInWorker(raw: Uint8Array): Promise<Uint8Array> {
  const copy: Uint8Array<ArrayBuffer> = raw.slice();
  const fallback = async (): Promise<Uint8Array> => {
    if (typeof CompressionStream === 'function') {
      const stream = new Blob([copy]).stream().pipeThrough(new CompressionStream('deflate'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    throw new Error('CompressionStream unavailable.');
  };
  return requestBytes(
    { type: 'deflate', raw: copy.buffer as ArrayBuffer } as ExportWorkerPayload,
    fallback
  );
}

/** Terminate the worker and reject everything pending (app teardown) */
export function disposeWorkerPool(): void {
  for (const [, entry] of pending) entry.reject(new Error('Worker pool disposed.'));
  pending.clear();
  worker?.terminate();
  worker = null;
}

/** Test/monitoring hook: true when the pool fell back to the main thread */
export function isWorkerPoolDegraded(): boolean {
  return workerBroken;
}
