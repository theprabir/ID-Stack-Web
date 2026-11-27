import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The loader is the only caller of `initWasm`; replace it with a spy. */
const { initWasm } = vi.hoisted(() => ({ initWasm: vi.fn() }));

vi.mock('@kittl/little-cms', () => ({ initWasm }));

/** Fresh copy of the loader (module-level state must not leak between tests) */
async function freshLoader(): Promise<typeof import('@/services/lcmsEngine')> {
  vi.resetModules();
  return import('@/services/lcmsEngine');
}

const WASM_URL = 'http://localhost/assets/lcms.wasm';

describe('lcmsEngine — shared WASM loader', () => {
  beforeEach(() => {
    initWasm.mockReset();
  });

  it('loads once and lets concurrent callers share the in-flight load', async () => {
    initWasm.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({}), 20);
        })
    );
    const loader = await freshLoader();

    await Promise.all([
      loader.loadLittleCms(WASM_URL),
      loader.loadLittleCms(WASM_URL),
      loader.loadLittleCms(WASM_URL),
    ]);

    // Three concurrent exports must not create three WASM heaps.
    expect(initWasm).toHaveBeenCalledTimes(1);
    expect(initWasm).toHaveBeenCalledWith(WASM_URL);
    expect(loader.isLittleCmsReady()).toBe(true);

    // Already loaded: later calls are free.
    await loader.loadLittleCms(WASM_URL);
    expect(initWasm).toHaveBeenCalledTimes(1);
  });

  it('retries a failed asset fetch with a cache-busting URL', async () => {
    initWasm
      .mockResolvedValueOnce({ error: new Error('Aborted(both async and sync fetching of the wasm failed)') })
      .mockResolvedValueOnce({});
    const loader = await freshLoader();

    await expect(loader.loadLittleCms(WASM_URL)).resolves.toBeUndefined();

    expect(initWasm).toHaveBeenCalledTimes(2);
    expect(initWasm.mock.calls[0]?.[0]).toBe(WASM_URL);
    expect(initWasm.mock.calls[1]?.[0]).toBe(`${WASM_URL}?lcmsAttempt=2`);
    expect(loader.isLittleCmsReady()).toBe(true);
  });

  it('reports an actionable error after every attempt fails, then allows a retry', async () => {
    initWasm.mockResolvedValue({ error: new Error('fetch failed') });
    const loader = await freshLoader();

    await expect(loader.loadLittleCms(WASM_URL)).rejects.toThrow(
      /could not load its WASM module .*Reload the app/
    );
    expect(initWasm).toHaveBeenCalledTimes(3);
    expect(loader.isLittleCmsReady()).toBe(false);

    // A later export starts a fresh set of attempts instead of staying broken.
    initWasm.mockReset();
    initWasm.mockResolvedValue({});
    await expect(loader.loadLittleCms(WASM_URL)).resolves.toBeUndefined();
    expect(initWasm).toHaveBeenCalledTimes(1);
  }, 15_000);
});
