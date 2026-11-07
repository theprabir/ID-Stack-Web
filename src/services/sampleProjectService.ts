/**
 * Bundled demo project loader (v0.7.4).
 *
 * Loads the sample ID card that ships in `public/sample/` — the ABC Company
 * employee card front and back PSDs, a seven-employee Excel sheet and seven
 * photos — and wires the whole pipeline in one click: placeholders, column
 * mappings, photo matching and the imposition card size.
 *
 * This is the fastest way for a first-time user (or a reviewer) to see a real
 * card render without preparing files.
 */
import { usePsdStore } from '@/stores/psdStore';
import { useDataStore } from '@/stores/dataStore';
import { deriveCardSizeFromDesign } from './impositionTypes';

/** Sample assets served from the app's public folder */
const SAMPLE_BASE = `${import.meta.env.BASE_URL}sample/`;

/** Photos bundled with the demo (file base names match the "photo" column) */
const SAMPLE_PHOTOS = ['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg', '6.jpg', '7.jpg'];

/**
 * Which PSD layers become placeholders, and the Excel column each maps to.
 * Layer names match the sample front PSD exactly (compared case-insensitively).
 * `column` is optional: a layer the sheet has no data for is still offered as a
 * placeholder, but left unmapped so it prints blank instead of its sample text.
 */
const SAMPLE_PLACEHOLDERS: Array<{
  layerName: string;
  key: string;
  role: 'text' | 'photo' | 'barcode';
  column?: string;
}> = [
  { layerName: 'your name', key: 'Name', role: 'text', column: 'Name' },
  { layerName: 'job role', key: 'Job Role', role: 'text', column: 'Job Role' },
  { layerName: 'id no.', key: 'Employee ID', role: 'text', column: 'Employee ID' },
  { layerName: 'email address', key: 'Email', role: 'text', column: 'Email' },
  { layerName: 'phone number', key: 'Phone Number', role: 'text', column: 'Phone Number' },
  { layerName: 'photo', key: 'photo', role: 'photo', column: 'photo' },
  // The barcode art is replaced by a live EAN-13 symbol of the numeric Barcode
  // column — EAN-13 cannot encode the alphanumeric employee IDs.
  { layerName: 'barcode', key: 'Barcode', role: 'barcode', column: 'Barcode' },
];

/** Progress messages reported while the demo is being prepared */
export type SampleLoadReporter = (message: string) => void;

/** Fetch one demo asset as a File (throws a friendly message when missing) */
async function fetchSampleFile(path: string, type: string): Promise<File> {
  const response = await fetch(`${SAMPLE_BASE}${path}`);
  if (!response.ok) {
    throw new Error(
      `Could not load the demo file “${path}” (HTTP ${response.status}). The demo project is served with the app.`
    );
  }
  const blob = await response.blob();
  return new File([blob], path.split('/').pop() ?? path, { type });
}

/**
 * Load the bundled demo project into the stores.
 *
 * @param report - Optional progress reporter (drives the button's label)
 * @throws Error when an asset cannot be fetched or the design cannot be parsed
 */
export async function loadDemoProject(report: SampleLoadReporter = () => {}): Promise<void> {
  const psdStore = usePsdStore.getState();
  const dataStore = useDataStore.getState();

  // Start from a clean slate so the demo is deterministic.
  psdStore.resetProject();
  dataStore.clearAll();
  dataStore.clearExcel();

  report('Loading the demo designs…');
  const frontFile = await fetchSampleFile('front.psd', 'image/vnd.adobe.photoshop');
  await usePsdStore.getState().loadPsd(frontFile, 'front');
  let parsed = usePsdStore.getState();
  if (parsed.parseError || !parsed.project.front) {
    throw new Error(parsed.parseError ?? 'The demo front PSD could not be parsed.');
  }

  const backFile = await fetchSampleFile('back.psd', 'image/vnd.adobe.photoshop');
  await usePsdStore.getState().loadPsd(backFile, 'back');
  parsed = usePsdStore.getState();
  if (parsed.parseError || !parsed.project.back) {
    throw new Error(parsed.parseError ?? 'The demo back PSD could not be parsed.');
  }

  report('Choosing placeholders…');
  const design = usePsdStore.getState().project.front;
  if (!design) throw new Error('The demo design is unavailable.');
  const byName = new Map(design.layers.map((layer) => [layer.name.trim().toLowerCase(), layer]));
  const applied: Array<{ key: string; column: string }> = [];
  for (const spec of SAMPLE_PLACEHOLDERS) {
    const layer = byName.get(spec.layerName);
    if (!layer) continue; // Design variant without this layer — skip it.
    if (spec.role === 'photo' && !layer.hasPixels) continue;
    usePsdStore.getState().addPlaceholder(layer, 'front', spec.role);
    usePsdStore.getState().renamePlaceholderKey(layer.id, spec.key);
    if (spec.column) applied.push({ key: spec.key, column: spec.column });
  }
  if (applied.length === 0) {
    throw new Error('No placeholder layers were found in the demo design.');
  }

  report('Loading the employee sheet…');
  const excelFile = await fetchSampleFile(
    'employees.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  await useDataStore.getState().loadExcel(excelFile);
  if (useDataStore.getState().parseError) {
    throw new Error(useDataStore.getState().parseError ?? 'The demo sheet could not be read.');
  }

  report('Mapping columns…');
  for (const entry of applied) {
    useDataStore.getState().setMapping(entry.key, entry.column);
  }

  report('Loading photos…');
  const photoFiles: File[] = [];
  for (const name of SAMPLE_PHOTOS) {
    try {
      photoFiles.push(await fetchSampleFile(`photos/${name}`, 'image/jpeg'));
    } catch {
      // A missing sample photo must not abort the demo.
    }
  }
  if (photoFiles.length > 0) {
    await useDataStore.getState().loadPhotos(photoFiles);
    useDataStore.getState().setPhotoMatchMode('column', 'photo');
  }

  report('Preparing the print layout…');
  const current = usePsdStore.getState().impositionSettings;
  const size = deriveCardSizeFromDesign(
    design.width,
    design.height,
    'portrait',
    current.unit,
    design.horizontalResolution
  );
  usePsdStore.getState().setImpositionSettings({
    ...current,
    cardWidth: size.width,
    cardHeight: size.height,
    cardOrientation: 'portrait',
  });

  report('Demo project ready.');
}
