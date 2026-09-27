/**
 * Debug dump: parse the sample PSD and print every text layer's raw
 * engine metadata (fonts, justification, style runs) so the placeholder
 * pipeline can be compared against ground truth.
 * Usage: node scripts/dump-psd-text.mjs [path-to-psd]
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const agpsd = require('ag-psd');

// Same CMYK whitelist patch the app applies (src/services/psdColorModePatch.ts)
const psdReader = require('ag-psd/dist/psdReader.js');
const readerModule = psdReader.createReader ? psdReader : psdReader.default;
if (Array.isArray(readerModule.supportedColorModes) && !readerModule.supportedColorModes.includes(4)) {
  readerModule.supportedColorModes.push(4);
}

const file = process.argv[2] ?? 'sample-data/demopsd.psd';
const buffer = readFileSync(file);
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const psd = agpsd.readPsd(arrayBuffer, { skipThumbnail: true, skipLinkedFilesData: true, skipLayerImageData: true, skipCompositeImageData: true });

console.log(`PSD: ${file} — ${psd.width}x${psd.height}, resolution:`, psd.imageResources?.resolutionInfo);

const walk = (layers, depth = 0) => {
  for (const layer of layers ?? []) {
    const pad = '  '.repeat(depth);
    console.log(`${pad}- "${layer.name}" kind=${layer.text ? 'TEXT' : layer.children ? 'group' : 'raster'} clipping=${layer.clipping} opacity=${layer.opacity} blend=${layer.blendMode}`);
    if (layer.text) {
      const t = layer.text;
      console.log(`${pad}  content: ${JSON.stringify(t.text)}`);
      console.log(`${pad}  transform: ${JSON.stringify(t.transform)}`);
      console.log(`${pad}  shapeType: ${t.shapeType} boxBounds: ${JSON.stringify(t.boxBounds)}`);
      console.log(`${pad}  paragraphStyle: ${JSON.stringify(t.paragraphStyle)}`);
      console.log(`${pad}  paragraphStyleRuns: ${JSON.stringify(t.paragraphStyleRuns)}`);
      console.log(`${pad}  style: ${JSON.stringify(t.style)}`);
      console.log(`${pad}  styleRuns:`);
      for (const run of t.styleRuns ?? []) {
        console.log(`${pad}    len=${run.length} font=${run.style?.font?.name} size=${run.style?.fontSize} tracking=${run.style?.tracking} hScale=${run.style?.horizontalScale} vScale=${run.style?.verticalScale} fauxB=${run.style?.fauxBold} fauxI=${run.style?.fauxItalic} caps=${run.style?.fontCaps} baselineShift=${run.style?.baselineShift} kerning=${run.style?.kerning} autoKern=${run.style?.autoKerning} underline=${run.style?.underline} fill=${JSON.stringify(run.style?.fillColor)}`);
      }
    }
    if (layer.effects) {
      console.log(`${pad}  effects: ${JSON.stringify(layer.effects).slice(0, 400)}`);
    }
    walk(layer.children, depth + 1);
  }
};
walk(psd.children);
