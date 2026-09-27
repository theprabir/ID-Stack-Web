import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { compositeDesign } from '@/services/psdCompositeService';
import type { PsdDesign, PsdLayerInfo, PsdPlaceholder } from '@/types/psd';

// Reuse the textClipping mock by importing the module that installs it is
// not possible (it installs in beforeAll of that file). So re-install a
// minimal clone here.
class Mock2D {
  canvas: any; fills: any[] = [];
  fillStyle = '#000'; strokeStyle = '#000'; globalAlpha = 1; globalCompositeOperation: any = 'source-over';
  font = '10px sans-serif'; textBaseline = 'alphabetic'; lineJoin = 'miter'; lineWidth = 1;
  shadowColor = 'transparent'; shadowBlur = 0; shadowOffsetX = 0; shadowOffsetY = 0;
  transformA = 1; transformE = 0; stack: any[] = [];
  constructor(c: any) { this.canvas = c; }
  save() { this.stack.push({ a: this.transformA, e: this.transformE }); }
  restore() { const s = this.stack.pop(); if (s) { this.transformA = s.a; this.transformE = s.e; } }
  beginPath() {} closePath() {} clip() {}
  translate(x: number) { this.transformE += this.transformA * x; }
  rotate() {} setTransform() {} setLineDash() {}
  scale(x: number) { this.transformA *= x; }
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
  createPattern() { return null; }
  measureText(t: string) { return { width: t.length * 6 } as any; }
  fillRect(x: number, y: number, w: number, h: number) { this.fills.push({ kind: 'rect', x: this.transformA * x + this.transformE, y, w: w * this.transformA, h, color: this.fillStyle, alpha: this.globalAlpha, composite: this.globalCompositeOperation }); }
  strokeRect(x: number, y: number, w: number, h: number) { this.fills.push({ kind: 'rect', x: this.transformA * x + this.transformE, y, w: w * this.transformA, h, color: this.strokeStyle, alpha: this.globalAlpha, composite: this.globalCompositeOperation }); }
  fillText(t: string, x: number, y: number) { const size = 10; this.fills.push({ kind: 'text', x: this.transformA * x + this.transformE, y: y - size * 0.8, w: t.length * 6 * this.transformA, h: size, color: this.fillStyle, alpha: this.globalAlpha, composite: this.globalCompositeOperation, text: t }); }
  strokeText(t: string, x: number, y: number) { this.fillText(t, x, y); }
  drawImage(img: any, ...args: any[]) {
    const src = img as any;
    const crop = args.length >= 8;
    this.fills.push({ kind: 'image', x: crop ? args[4] : args[0], y: crop ? args[5] : args[1], w: crop ? args[6] : (args[2] ?? src.width ?? 0), h: crop ? args[7] : (args[3] ?? src.height ?? 0), color: '#ffffff', alpha: this.globalAlpha, source: src instanceof HTMLCanvasElement ? src : undefined, composite: this.globalCompositeOperation, crop: crop ? { x: args[0], y: args[1], w: args[2], h: args[3] } : undefined });
  }
  clearRect(x: number, y: number, w: number, h: number) { this.fills.push({ kind: 'clear', x, y, w, h, color: 'transparent', alpha: 1, composite: 'source-over' }); }
  putImageData(image: any, dx: number, dy: number) { this.fills.push({ kind: 'put', x: dx, y: dy, w: image.width, h: image.height, color: 'transparent', alpha: 1, px: new Uint8ClampedArray(image.data), composite: 'source-over' }); }
  getImageData(sx: number, sy: number, w: number, h: number): any {
    const data = new Uint8ClampedArray(w * h * 4);
    const canvasWidth = this.canvas.width, canvasHeight = this.canvas.height;
    const paint = (record: any): void => {
      const left = Math.max(0, Math.floor(record.x - sx));
      const top = Math.max(0, Math.floor(record.y - sy));
      const right = Math.min(w, Math.ceil(record.x - sx + record.w));
      const bottom = Math.min(h, Math.ceil(record.y - sy + record.h));
      if (record.kind === 'image') {
        if (record.composite === 'destination-in') {
          if (record.source) {
            const sc: any = contextCache.get(record.source);
            if (sc) {
              const sim = sc.getImageData(0, 0, record.source.width, record.source.height);
              for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                const gx = sx + x, gy = sy + y;
                const sX = Math.floor(gx - record.x), sY = Math.floor(gy - record.y);
                const di = (y * w + x) * 4;
                if (sX < 0 || sY < 0 || sX >= sim.width || sY >= sim.height) { data[di + 3] = 0; continue; }
                const sa = sim.data[(sY * sim.width + sX) * 4 + 3] ?? 0;
                data[di + 3] = Math.floor((data[di + 3] ?? 0) * (sa / 255));
              }
            }
            return;
          }
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const inside = x >= left && x < right && y >= top && y < bottom;
            if (!inside) data[(y * w + x) * 4 + 3] = 0;
          }
          return;
        }
        const srcCtx: any = record.source ? contextCache.get(record.source) : undefined;
        if (srcCtx) {
          for (const sf of srcCtx.fills) {
            if (record.crop) {
              const l2 = Math.max(sf.x, record.crop.x), t2 = Math.max(sf.y, record.crop.y);
              const r2 = Math.min(sf.x + sf.w, record.crop.x + record.crop.w), b2 = Math.min(sf.y + sf.h, record.crop.y + record.crop.h);
              if (r2 <= l2 || b2 <= t2) continue;
              paint({ ...sf, x: l2 - record.crop.x + record.x, y: t2 - record.crop.y + record.y, w: r2 - l2, h: b2 - t2, alpha: sf.alpha * record.alpha });
              continue;
            }
            paint({ ...sf, x: sf.x + record.x, y: sf.y + record.y, alpha: sf.alpha * record.alpha });
          }
        }
        return;
      }
      let cr = 0, cg = 0, cb = 0, ca = 1;
      if (record.kind === 'put' && record.px) {
        for (let y = top; y < bottom && y < canvasHeight; y++) for (let x = left; x < right && x < canvasWidth; x++) {
          const i = (y * w + x) * 4;
          const sX = Math.floor(record.x - sx) + (x - left), sY = Math.floor(record.y - sy) + (y - top);
          const s = (sY * record.w + sX) * 4;
          data[i] = record.px[s] ?? 0; data[i+1] = record.px[s+1] ?? 0; data[i+2] = record.px[s+2] ?? 0; data[i+3] = record.px[s+3] ?? 0;
        }
        return;
      }
      const color = record.color as string;
      if (color === '#ffffff') { cr = cg = cb = 255; }
      else if (color === '#000000') { cr = cg = cb = 0; }
      const alpha = ca * record.alpha;
      for (let y = top; y < bottom && y < canvasHeight; y++) for (let x = left; x < right && x < canvasWidth; x++) {
        const i = (y * w + x) * 4;
        if (record.kind === 'clear') { data[i] = 0; data[i+1] = 0; data[i+2] = 0; data[i+3] = 0; continue; }
        const da = data[i+3]! / 255;
        const oa = alpha + da * (1 - alpha);
        if (oa <= 0) continue;
        data[i] = Math.round((cr * alpha + data[i]! * da * (1 - alpha)) / oa);
        data[i+1] = Math.round((cg * alpha + data[i+1]! * da * (1 - alpha)) / oa);
        data[i+2] = Math.round((cb * alpha + data[i+2]! * da * (1 - alpha)) / oa);
        data[i+3] = Math.round(oa * 255);
      }
    };
    for (const r of this.fills) paint(r);
    return { data, width: w, height: h };
  }
}
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const contextCache = new WeakMap<any, any>();
beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = function (this: any) {
    let c = contextCache.get(this);
    if (!c) { c = new Mock2D(this); contextCache.set(this, c); }
    return c;
  } as any;
});
afterAll(() => { HTMLCanvasElement.prototype.getContext = originalGetContext; });

describe('mask probe', () => {
  it('traces applyLayerMask on a half-white mask', async () => {
    const layer: PsdLayerInfo = {
      id: 'front/Name', name: 'Name', path: ['Name'], kind: 'text', hidden: false,
      bounds: { left: 270, top: 683, right: 314, bottom: 719 },
      opacity: 1, blendMode: 'normal', hasPixels: false, hasEffects: false, clipped: false, childCount: 0,
      text: { content: 'ID', fontSize: 50, fontFamily: 'ArialMT', color: '#e91e63', justification: 'left' } as any,
      maskCanvas: (() => { const c = document
