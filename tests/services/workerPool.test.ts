/**
 * Worker pool request/response handshake.
 *
 * Regression: the pool stored each request under an incrementing `id` but sent
 * the payload without it. The worker echoes `request.id`, so every reply had
 * `id: undefined`, its pending promise was never settled, and each export
 * stalled for the full 60 s timeout before falling back to slow main-thread
 * encoding — the batch appeared frozen at 0/N.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Minimal Worker stand-in that answers like the real export worker */
class FakeWorker {
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: ErrorEvent) => void) | null = null;
  public static lastRequest: { id?: number; type?: string } | null = null;

  public postMessage(request: { id?: number; type?: string; cmyk?: ArrayBuffer }): void {
    FakeWorker.lastRequest = request;
    // Echo the id exactly like src/workers/exportWorker.ts does.
    setTimeout(() => {
      this.onmessage?.({
        data: { id: request.id, ok: true, result: new ArrayBuffer(4) },
      } as MessageEvent);
    }, 0);
  }

  public terminate(): void {
    // no-op
  }
}

describe('export worker pool handshake', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('includes the pending id in the message so the reply can be matched', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    vi.resetModules();
    const { encodeJpegInWorker } = await import('@/services/workerPool');

    const bytes = await encodeJpegInWorker(new Uint8Array(4 * 2 * 2), 2, 2, 90);

    expect(FakeWorker.lastRequest?.type).toBe('encode-jpeg');
    expect(typeof FakeWorker.lastRequest?.id).toBe('number');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(4);
  }, 2000);
});
