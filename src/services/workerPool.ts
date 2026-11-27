/**
 * Worker pool client for the batch export worker (v0.7.7).
 *
 * - Spawns `clamp(hardwareConcurrency − 1, 2, 8)` dedicated workers (Vite
 *   `new Worker(new URL(...))`) and keeps them warm for the whole session.
 * - A single FIFO queue dispatches one request per idle worker, so a page of
 *   cards is encoded on several cores at once. v0.7.6 used ONE worker, which
 *   made the imposed-sheet export single-threaded no matter the CPU.
 * - Promise-based request/response with id matching and transferables.
 * - Graceful degradation: every request can fall back to a main-thread
 *   implementation, so export NEVER fails just because workers are
 *   unavailable (older browsers, restrictive CSP, jsdom tests).
 * - A worker that crashes or times out is recreated; its request rejects and
 *   the caller falls back, and the rest of the pool keeps going.
 */
import { encodeCmykJpegBytes } from './cmykJpegEncoder';
import { logMessage } from './appLog';

/** Pending request bookkeeping */
interface Task {
  id: number;
  payload: ExportWorkerPayload;
  resolve: (value: ArrayBuffer) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
  settled: boolean;
}

/** One pool slot: a worker and the task it is currently running */
interface Slot {
  worker: Worker;
  task: Task | null;
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

/** Fire-and-forget message: cache this plate, do not reply */
export type PrimePlateRequest = {
  type: 'prime-plate';
  plateId: string;
  rgba: ArrayBuffer;
};

/** Request without the id (added by the pool) — declared separately because
 * Omit on a union collapses it to the shared keys only. */
type ExportWorkerPayload =
  | { type: 'encode-jpeg'; cmyk: ArrayBuffer; width: number; height: number; quality: number }
  | {
      type: 'encode-card';
      rgba: ArrayBuffer;
      width: number;
      height: number;
      quality: number;
      wasmUrl: string;
      profileUrl: string;
      plateId: string;
    }
  | { type: 'deflate'; raw: ArrayBuffer };

/** Idle/busy workers; created lazily by `ensureSlots` */
let slots: Slot[] = [];
/** Requests waiting for a free worker */
let queue: Task[] = [];
/** Every unsettled task by id (queue + running) */
const tasks = new Map<number, Task>();
let nextId = 1;
/** True when the pool could not be created at all (permanent fallback) */
let workerBroken = false;
/** Cached pool size so every request agrees on it */
let poolSizeCache = 0;
/** Primed plate messages, replayed to workers created after priming */
const pendingPlates: PrimePlateRequest[] = [];
/** Plates to keep primed (front and back, with room for a design change) */
const MAX_PLATES = 4;

/** Per-request watchdog: a wedged worker must not stall a whole job */
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Worker count for this machine.
 *
 * `hardwareConcurrency` counts SMT threads, not cores, and these jobs are pure
 * CPU + memory-bandwidth work carrying ~5 MB of pixel buffers each — so one
 * worker per TWO logical CPUs keeps the pool on real cores and avoids cache
 * thrash. Measured on a 2-core/4-thread laptop running the same 30-card imposed
 * job: 3 workers 4611 ms, 2 workers 3613 ms (pool of 3 was 27 % slower).
 *
 * Clamped to 2–8 so a 2-thread machine still overlaps one encode with the UI
 * and a many-core desktop does not spawn an unreasonable number of WASM heaps.
 */
function poolSize(): number {
  if (poolSizeCache > 0) return poolSizeCache;
  const threads =
    typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
      ? navigator.hardwareConcurrency
      : 4;
  poolSizeCache = Math.min(8, Math.max(2, Math.round(threads / 2)));
  return poolSizeCache;
}

/** Fail every unsettled task of a dying worker and free its slot */
function failSlot(slot: Slot, reason: string): void {
  slot.worker.terminate();
  const task = slot.task;
  slot.task = null;
  if (task) settleTask(task, new Error(reason));
  // Replace the dead worker so the pool keeps its width.
  const replacement = createWorker(slot);
  if (!replacement) {
    slots = slots.filter((entry) => entry !== slot);
    if (slots.length === 0) workerBroken = true;
  }
}

/** Mark a task done and stop its watchdog */
function settleTask(task: Task, error?: Error, result?: ArrayBuffer): void {
  if (task.settled) return;
  task.settled = true;
  tasks.delete(task.id);
  if (task.timer !== null) clearTimeout(task.timer);
  task.timer = null;
  if (error) task.reject(error);
  else task.resolve(result ?? new ArrayBuffer(0));
}

/** Create one worker (with its message handlers) for `slot` */
function createWorker(slot: Slot): boolean {
  try {
    const worker = new Worker(new URL('../workers/exportWorker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (
      event: MessageEvent<{ id: number; ok: boolean; result?: ArrayBuffer; error?: string }>
    ) => {
      const { id, ok, result, error } = event.data;
      const task = tasks.get(id);
      slot.task = null;
      if (task) {
        if (ok && result !== undefined) settleTask(task, undefined, result);
        else settleTask(task, new Error(error ?? 'Worker request failed.'));
      }
      dispatch();
    };
    worker.onerror = () => {
      // Recycle this worker: fail its request (the caller falls back) and
      // replace it. One broken worker must not degrade the whole pool.
      failSlot(slot, 'Export worker crashed.');
      dispatch();
    };
    slot.worker = worker;
    // A worker created after priming still needs the batch's plates. Posting
    // them here happens before any request can be dispatched to this worker.
    for (const message of pendingPlates) worker.postMessage(message);
    return true;
  } catch {
    return false;
  }
}

/** Create workers up to the pool width */
function ensureSlots(): void {
  if (workerBroken) return;
  const target = poolSize();
  while (slots.length < target) {
    const slot = { worker: null as unknown as Worker, task: null } as Slot;
    if (!createWorker(slot)) {
      // First worker failing means workers are unusable here; later failures
      // just leave the pool narrower.
      if (slots.length === 0) workerBroken = true;
      return;
    }
    slots.push(slot);
  }
}

/** Hand queued requests to idle workers */
function dispatch(): void {
  if (queue.length === 0) return;
  for (const slot of slots) {
    if (queue.length === 0) return;
    if (slot.task !== null) continue;
    const task = queue.shift();
    if (!task || task.settled) continue;
    slot.task = task;
    const transfer: ArrayBuffer[] =
      task.payload.type === 'encode-jpeg'
        ? [task.payload.cmyk]
        : task.payload.type === 'encode-card'
          ? [task.payload.rgba]
          : [task.payload.raw];
    try {
      slot.worker.postMessage({ ...task.payload, id: task.id } as ExportWorkerRequest, {
        transfer,
      });
    } catch {
      slot.task = null;
      settleTask(task, new Error('Export worker postMessage failed.'));
    }
  }
}

/** Post one request to the pool (or fall back) and await the bytes */
async function requestBytes(
  request: ExportWorkerPayload,
  fallback: () => Uint8Array | Promise<Uint8Array>
): Promise<Uint8Array> {
  if (workerBroken) return fallback();
  ensureSlots();
  if (slots.length === 0) {
    workerBroken = true;
    return fallback();
  }

  const id = nextId++;
  const promise = new Promise<ArrayBuffer>((resolve, reject) => {
    const task: Task = {
      id,
      payload: request,
      resolve,
      reject,
      timer: null,
      settled: false,
    };
    tasks.set(id, task);
    task.timer = setTimeout(() => {
      if (task.settled) return;
      // A wedged worker: drop it (and its request) so the job can continue.
      const owner = slots.find((slot) => slot.task === task);
      if (owner) failSlot(owner, 'Export worker timed out.');
      settleTask(task, new Error('Export worker timed out.'));
      dispatch();
    }, REQUEST_TIMEOUT_MS);
    queue.push(task);
    dispatch();
  });

  try {
    return new Uint8Array(await promise);
  } catch (error) {
    // Worker path failed — fall back rather than failing the batch, but say so:
    // a silent fallback hides a wedged or crashing worker behind a slow batch.
    logMessage(
      'warn',
      `Export worker failed (${error instanceof Error ? error.message : String(error)}); using the main thread.`
    );
    return fallback();
  }
}

/**
 * Encode CMYK samples as an Adobe CMYK JPEG in the worker pool.
 *
 * @param cmyk - Interleaved CMYK samples (not consumed; copied before transfer)
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
  // Copy into an exactly-sized buffer: the original is owned by the caller and
  // stays usable for the main-thread fallback after a transfer.
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
 * Convert a card canvas and encode it as an Adobe CMYK JPEG inside a worker:
 * RGBA readback happens on the main thread (the canvas lives there), but the
 * sRGB→CMYK ICC transform and the JPEG compression both run off it.
 *
 * `plateId` names the batch's first card, primed with `primeEncodePlate`; the
 * worker then transforms only the pixels that differ from it. Without a plate
 * the card is transformed in full, with identical output.
 *
 * The RGBA buffer is transferred, not copied; `fallback` must be able to
 * rebuild the result from the canvas when the worker path fails.
 *
 * @param rgba - Pixels from `getImageData` (consumed by the transfer)
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @param quality - JPEG quality 1–100
 * @param plateId - Id of the primed plate for this batch ('' = none)
 * @param wasmUrl - Absolute URL of the bundled lcms.wasm
 * @param profileUrl - Absolute URL of the bundled CMYK ICC profile
 * @param fallback - Main-thread encoder used when workers are unavailable
 * @returns CMYK JPEG bytes
 */
export async function encodeCardInWorker(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  quality: number,
  plateId: string,
  wasmUrl: string,
  profileUrl: string,
  fallback: () => Uint8Array | Promise<Uint8Array>
): Promise<Uint8Array> {
  return requestBytes(
    {
      type: 'encode-card',
      rgba: rgba.buffer as ArrayBuffer,
      width,
      height,
      quality,
      wasmUrl,
      profileUrl,
      plateId,
    },
    fallback
  );
}

/**
 * Send the batch's first card to every worker as the plate for later diffs.
 *
 * The buffer is only cloned by `postMessage`, never transferred, and the last
 * message is kept so a worker created later (after a crash, or after
 * `setWorkerPoolSize`) is primed before its first request. Priming is advisory:
 * a worker without the plate simply transforms whole cards, with identical
 * output.
 *
 * Workers are not created here — the next `encodeCardInWorker` creates them and
 * replays the stored message.
 *
 * @param plateId - Id the following `encodeCardInWorker` calls reference
 * @param rgba - Plate pixels (4 bytes per pixel); the caller keeps ownership
 */
export function primeEncodePlate(plateId: string, rgba: Uint8ClampedArray): void {
  // postMessage needs a whole buffer; a subarray view gets a copy instead.
  const whole = rgba.byteOffset === 0 && rgba.byteLength === rgba.buffer.byteLength;
  const buffer = whole
    ? (rgba.buffer as ArrayBuffer)
    : (new Uint8ClampedArray(rgba).buffer as ArrayBuffer);
  const message: PrimePlateRequest = { type: 'prime-plate', plateId, rgba: buffer };
  const existing = pendingPlates.findIndex((entry) => entry.plateId === plateId);
  if (existing >= 0) pendingPlates.splice(existing, 1);
  pendingPlates.push(message);
  while (pendingPlates.length > MAX_PLATES) pendingPlates.shift();
  for (const slot of slots) slot.worker.postMessage(message);
}

/**
 * DEFLATE raw bytes (zlib wrapper, PDF FlateDecode-compatible) in the pool.
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

/** Terminate every worker and reject everything pending (app teardown) */
export function disposeWorkerPool(): void {
  for (const [, task] of tasks) {
    if (task.timer !== null) clearTimeout(task.timer);
    task.settled = true;
    task.reject(new Error('Worker pool disposed.'));
  }
  tasks.clear();
  queue = [];
  for (const slot of slots) slot.worker.terminate();
  slots = [];
  // A disposed pool may be re-created later (tests, hot reload).
  workerBroken = false;
}

/** Test/monitoring hook: true when the pool fell back to the main thread */
export function isWorkerPoolDegraded(): boolean {
  return workerBroken;
}

/** Test/monitoring hook: how many workers this machine will use */
export function getWorkerPoolSize(): number {
  return poolSize();
}

/**
 * Override the pool width (tuning hook).
 *
 * On CPUs with SMT the thread count overstates the cores available for FP/JS
 * work, so the default `hardwareConcurrency − 1` can oversubscribe. This lets
 * a benchmark or a future adaptive policy pin a width; it takes effect for
 * requests that have not been dispatched yet.
 *
 * @param size - Worker count (clamped to 1–16)
 */
export function setWorkerPoolSize(size: number): void {
  const next = Math.max(1, Math.min(16, Math.floor(size)));
  if (next === poolSize()) return;
  // Retire idle workers so the new width takes effect; busy ones finish their
  // request first (their slot is dropped when they do).
  const retired = slots.filter((slot) => slot.task === null);
  slots = slots.filter((slot) => slot.task !== null);
  for (const slot of retired) {
    slot.worker.terminate();
  }
  poolSizeCache = next;
  workerBroken = false;
  dispatch();
}
