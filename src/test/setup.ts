import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../../public/locales/en/common.json';

// Initialise i18next for component tests with the English bundle.
void i18next.use(initReactI18next).init({
  resources: { en: { common: en } },
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: ['common'],
  interpolation: { escapeValue: false },
  returnNull: false,
  react: { useSuspense: false },
});

// jsdom does not implement matchMedia; components using prefers-color-scheme need it.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: (): void => {},
    removeListener: (): void => {},
    addEventListener: (): void => {},
    removeEventListener: (): void => {},
    dispatchEvent: (): boolean => false,
  }),
});

// ---- jsdom shim: File/Blob.arrayBuffer (implemented in browsers) ----
if (typeof Blob.prototype.arrayBuffer !== 'function') {
  Blob.prototype.arrayBuffer = function arrayBuffer(): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error ?? new Error('Blob read failed'));
      reader.readAsArrayBuffer(this);
    });
  };
}

// ---- jsdom shim: URL.createObjectURL / revokeObjectURL ----
// Always override: tests depend on deterministic blob:mock-N URLs that the
// Image shim below can "load".
let blobUrlCounter = 0;
URL.createObjectURL = function createObjectURL(): string {
  blobUrlCounter += 1;
  return `blob:mock-${blobUrlCounter}`;
};
URL.revokeObjectURL = function revokeObjectURL(): void {};

// ---- jsdom shim: Image loading (jsdom never fires load/error without a
// ---- canvas package). Patch the src setter on the prototype so every
// ---- Image "loads" with fixed 100×100 dimensions.
const imagePrototype = HTMLImageElement.prototype as unknown as Record<string, unknown>;
const srcDescriptor = Object.getOwnPropertyDescriptor(imagePrototype, 'src');
if (srcDescriptor) {
  Object.defineProperty(imagePrototype, 'src', {
    set(value: string) {
      (srcDescriptor.set as (v: string) => void)?.call(this, value);
      queueMicrotask(() => {
        Object.defineProperty(this, 'naturalWidth', { value: 100, configurable: true });
        Object.defineProperty(this, 'naturalHeight', { value: 100, configurable: true });
        (this as HTMLImageElement).dispatchEvent(new Event('load'));
      });
    },
    get() {
      return (srcDescriptor.get as () => string)?.call(this) ?? '';
    },
    configurable: true,
  });
}

// ---- jsdom shim: minimal Canvas 2D context (jsdom has no canvas package;
// ---- previewService logic is exercised with no-op draw calls) ----
function createMockContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const gradient = { addColorStop: (): void => {} };
  const noop = (): void => {};
  const context = {
    canvas,
    fillStyle: '#000000',
    strokeStyle: '#000000',
    globalAlpha: 1,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    setTransform: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    arcTo: noop,
    rect: noop,
    fill: noop,
    stroke: noop,
    clip: noop,
    fillRect: noop,
    strokeRect: noop,
    clearRect: noop,
    drawImage: noop,
    fillText: noop,
    strokeText: noop,
    setLineDash: noop,
    createLinearGradient: (): typeof gradient => gradient,
    createRadialGradient: (): typeof gradient => gradient,
    createPattern: (): null => null,
    measureText: (text: string): TextMetrics =>
      ({ width: text.length * 6 }) as unknown as TextMetrics,
    getImageData: (): ImageData =>
      ({
        data: new Uint8ClampedArray(Math.max(1, canvas.width * canvas.height * 4)),
        width: canvas.width,
        height: canvas.height,
      }) as unknown as ImageData,
    putImageData: noop,
  };
  return context as unknown as CanvasRenderingContext2D;
}

const originalGetContext = HTMLCanvasElement.prototype.getContext as unknown as (
  this: HTMLCanvasElement,
  contextId: string,
  ...rest: unknown[]
) => RenderingContext | null;

(HTMLCanvasElement.prototype as unknown as Record<string, unknown>).getContext = function (
  this: HTMLCanvasElement,
  contextId: string,
  ...rest: unknown[]
): RenderingContext | null {
  const context = originalGetContext.call(this, contextId, ...rest);
  if (context) return context;
  if (contextId === '2d') return createMockContext(this);
  return null;
};
