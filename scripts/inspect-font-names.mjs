// One-off diagnostic: compare the TTF's internal font names with the
// PostScript/font names embedded in the sample PSD text layers.
import { readFileSync } from 'node:fs';

// --- 1. TTF name table (IDs 1 = family, 4 = full name, 6 = PostScript) ---
const buf = readFileSync('sample-data/jnv-sample/AKBALAN.TTF');
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

function readNameTable() {
  const numTables = view.getUint16(4);
  let nameOffset = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    const tag = String.fromCharCode(buf[rec], buf[rec + 1], buf[rec + 2], buf[rec + 3]);
    if (tag === 'name') nameOffset = view.getUint32(rec + 8);
  }
  if (nameOffset < 0) return {};
  const count = view.getUint16(nameOffset + 2);
  const stringOffset = nameOffset + view.getUint16(nameOffset + 4);
  const out = {};
  for (let i = 0; i < count; i++) {
    const r = nameOffset + 6 + i * 12;
    const platform = view.getUint16(r);
    const nameId = view.getUint16(r + 6);
    const length = view.getUint16(r + 8);
    const offset = view.getUint16(r + 10);
    if (![1, 4, 6, 16].includes(nameId)) continue;
    const bytes = new Uint8Array(buf.buffer, buf.byteOffset + stringOffset + offset, length);
    const text = platform === 0 || platform === 1
      ? String.fromCharCode(...bytes)
      : new TextDecoder('utf-16be').decode(bytes);
    const key = { 1: 'family(1)', 4: 'full(4)', 6: 'postscript(6)', 16: 'typo-family(16)' }[nameId];
    if (!out[key]) out[key] = new Set();
    out[key].add(`${text} [plat=${platform}]`);
  }
  return out;
}

console.log('=== AKBALAN.TTF name table ===');
const names = readNameTable();
for (const [k, v] of Object.entries(names)) console.log(k, '→', [...v].join(' | '));

// --- 2. PSD font names ---
console.log('\n=== front.psd text font names ===');
const { readPsd } = await import('ag-psd');
const psd = readPsd(new Uint8Array(readFileSync('sample-data/jnv-sample/front.psd')), {
  skipLayerImageData: true,
  skipCompositeImageData: true,
  skipThumbnail: true,
});

function walk(node, path = []) {
  const name = node?.name ?? '';
  const p = [...path, name];
  if (node?.text) {
    console.log(`layer "${p.join(' / ')}":`);
    console.log('  text       :', JSON.stringify(node.text.text?.slice(0, 60)));
    console.log('  font.name  :', node.text.style?.font?.name);
    console.log('  runs[0]    :', node.text.style?.font?.name, '| firstRun:', node.text.engineData?.styles?.[0]?.font?.name ?? node.text.style?.font?.name);
    if (node.text.engineData) {
      const ed = node.text.engineData;
      const fontNames = new Set();
      for (const st of ed.styles ?? []) if (st?.font?.name) fontNames.add(st.font.name);
      console.log('  engine fonts:', [...fontNames].join(', ') || '(none)');
      console.log('  sample     :', JSON.stringify((ed.contents ?? '').slice(0, 60)));
    }
  }
  for (const child of node?.children ?? []) walk(child, p);
}
walk(psd);
