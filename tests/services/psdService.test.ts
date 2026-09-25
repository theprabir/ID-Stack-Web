import { describe, it, expect, beforeAll } from 'vitest';
import { parsePsdFile } from '@/services/psdService';
import { applyPsdColorModePatch } from '@/services/psdColorModePatch';

/**
 * Hand-forged minimal PSD files.
 * Layout: 8BPS header + empty color-mode/resources/layer sections +
 * RLE-compressed composite image data.
 */

/** Build a PSD buffer with the given color mode and channel count */
function forgePsd(options: {
  colorMode: number;
  channels: number;
  width?: number;
  height?: number;
}): File {
  const width = options.width ?? 4;
  const height = options.height ?? 4;
  const bytes: number[] = [];
  const push16 = (value: number): void => {
    bytes.push((value >> 8) & 255, value & 255);
  };
  const push32 = (value: number): void => {
    bytes.push((value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255);
  };

  // Header
  bytes.push(0x38, 0x42, 0x50, 0x53); // '8BPS'
  push16(1); // version
  for (let index = 0; index < 6; index += 1) bytes.push(0); // reserved
  push16(options.channels);
  push32(height);
  push32(width);
  push16(8); // bits per channel
  push16(options.colorMode);

  // Empty color mode data / image resources / layer & mask info sections
  push32(0);
  push32(0);
  push32(0);

  // Composite image data: RLE compression, one row-byte-count per channel per row
  push16(1);
  for (let channel = 0; channel < options.channels; channel += 1) {
    for (let row = 0; row < height; row += 1) push16(width);
  }
  // PackBits literal runs: header byte (width-1) then `width` literal bytes
  for (let channel = 0; channel < options.channels; channel += 1) {
    for (let row = 0; row < height; row += 1) {
      bytes.push(width - 1);
      for (let column = 0; column < width; column += 1) bytes.push(128);
    }
  }

  return new File([new Uint8Array(bytes)], `test-${options.colorMode}.psd`);
}

describe('psdService — color modes', () => {
  beforeAll(() => {
    applyPsdColorModePatch();
  });

  it('parses RGB PSD files past the color-mode check (sanity)', async () => {
    const file = forgePsd({ colorMode: 3, channels: 3 });
    // The forged file has no layers, so parsePsdFile stops at the layer check —
    // which proves the color-mode gate passed.
    await expect(parsePsdFile(file, 'front')).rejects.toThrow('has no layers');
  });

  it('parses CMYK PSD files past the color-mode check (print standard)', async () => {
    const file = forgePsd({ colorMode: 4, channels: 4 });
    // CMYK must NOT throw "Color mode not supported" — reaching the layer
    // check proves the CMYK whitelist patch works.
    await expect(parsePsdFile(file, 'front')).rejects.toThrow('has no layers');
  });

  it('rejects unsupported color modes with a clear error', async () => {
    const file = forgePsd({ colorMode: 9, channels: 1 }); // duotone
    await expect(parsePsdFile(file, 'front')).rejects.toThrow(/Color mode not supported/);
  });
});
