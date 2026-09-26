import { describe, it, expect } from 'vitest';
import { ensureAdobeApp14Transform0 } from '@/services/cmykExportService';

/** Forge a minimal JPEG header: SOI + SOF0 + payload */
function forgeJpegBytes(withJfif = false): Uint8Array {
  const bytes: number[] = [0xff, 0xd8]; // SOI
  if (withJfif) {
    // Minimal APP0/JFIF segment — length must cover the whole segment.
    // bytes: FF E0 | len(2) | 'JFIF\0' (5) | version(2) units(1) Xden(2) Yden(2)
    //        | Xthumb(1) Ythumb(1) → total 16 bytes after the length field.
    bytes.push(0xff, 0xe0, 0x00, 0x10);
    bytes.push(0x4a, 0x46, 0x49, 0x46, 0x00); // 'JFIF\0'
    bytes.push(0x01, 0x01); // version 1.1
    bytes.push(0x00); // units
    bytes.push(0x00, 0x01, 0x00, 0x01); // Xden/Yden
    bytes.push(0x00, 0x00); // thumbnail dims
  }
  // SOF0 segment (length 8, as a stand-in frame marker)
  bytes.push(0xff, 0xc0, 0x00, 0x08, 0x01, 0x02, 0x03, 0x04);
  // Payload bytes
  bytes.push(0x11, 0x22, 0x33);
  return new Uint8Array(bytes);
}

describe('cmykExportService — Adobe APP14 patching', () => {
  it('inserts an APP14 transform=0 marker after SOI when missing', () => {
    const patched = ensureAdobeApp14Transform0(forgeJpegBytes());
    expect(patched.length).toBeGreaterThan(0);
    // After SOI, the next marker must be APP14.
    expect(patched[2]).toBe(0xff);
    expect(patched[3]).toBe(0xee);
    // Segment length = 14
    expect(((patched[4] ?? 0) << 8) | (patched[5] ?? 0)).toBe(14);
    // Adobe signature
    expect(patched[6]).toBe(0x41); // 'A'
    expect(patched[9]).toBe(0x62); // 'd'
    // Transform byte (last of the 16-byte segment, inserted at offset 2) = 0 → CMYK
    expect(patched[17]).toBe(0x00);
    // The original SOF0 must follow the inserted 16-byte marker (offset 2 + 16 = 18).
    expect(patched[18]).toBe(0xff);
    expect(patched[19]).toBe(0xc0);
  });

  it('inserts the APP14 marker after existing APP0/JFIF segments', () => {
    const patched = ensureAdobeApp14Transform0(forgeJpegBytes(true));
    // First marker stays APP0.
    expect(patched[2]).toBe(0xff);
    expect(patched[3]).toBe(0xe0);
    // Next marker is the inserted APP14 (2 + 2-byte length + 14-byte payload = offset 20).
    expect(patched[20]).toBe(0xff);
    expect(patched[21]).toBe(0xee);
  });

  it('resets the transform byte to 0 when an APP14 already exists', () => {
    const bytes: number[] = [0xff, 0xd8];
    // Proper 16-byte APP14 (length 14 = 2 length bytes + 12 payload) with transform=2 (YCCK).
    bytes.push(0xff, 0xee, 0x00, 0x0e, 0x41, 0x64, 0x6f, 0x62, 0x65, 0x00, 0x64, 0x00, 0x00, 0x00, 0x00, 0x02);
    bytes.push(0xff, 0xc0, 0x00, 0x08);
    const patched = ensureAdobeApp14Transform0(new Uint8Array(bytes));
    expect(patched.length).toBe(bytes.length); // no insertion
    expect(patched[17]).toBe(0x00); // transform byte (offset 2 + 15) patched to CMYK
    expect(patched[15]).toBe(0x00); // flags1 low unchanged (was already 0)
  });
});
