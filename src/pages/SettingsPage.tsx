import { useCallback, useEffect, useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useUIStore, type ThemeId, type ThemeMode } from '@/stores/uiStore';
import { Button, ConfirmDialog, Label } from '@/components/ui';
import { RecentExports } from '@/components/common/RecentExports';
import { buildDiagnosticsArchive, getLogDirectory } from '@/services/diagnosticsService';
import {
  clearRecentExports,
  formatBytes,
  revealExportPath,
  saveExport,
  type SaveExportResult,
} from '@/services/exportService';
import { getStorageOverview, type StorageOverview } from '@/services/storageService';
import { logMessage } from '@/services/appLog';
import {
  Sun,
  Moon,
  Monitor,
  Save,
  ShieldCheck,
  Server,
  Info,
  Check,
  Palette,
  FolderOpen,
  FileArchive,
  Loader2,
  HardDrive,
  RefreshCw,
  Trash2,
} from 'lucide-react';

/** One labelled settings section card */
function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Sun;
  title: string;
  description: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section
      className="rounded-xl border bg-surface-panel transition-colors duration-300"
      aria-labelledby={`settings-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="flex items-start gap-3 border-b px-5 py-4">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2
            id={`settings-${title.toLowerCase().replace(/\s+/g, '-')}`}
            className="text-sm font-semibold"
          >
            {title}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

/** Static display metadata for each color palette */
const THEMES: Array<{
  id: ThemeId;
  label: string;
  description: string;
  /** [dark accent, dark surface, light accent, light surface] preview swatches */
  swatches: { darkAccent: string; darkSurface: string; lightAccent: string; lightSurface: string };
}> = [
  {
    id: 'classic',
    label: 'Classic',
    description: 'The original neutral look — cool greys with a blue accent.',
    swatches: {
      darkAccent: '#3B82F6',
      darkSurface: '#1A1A1A',
      lightAccent: '#6366F1',
      lightSurface: '#F5F5F5',
    },
  },
  {
    id: 'lime',
    label: 'Warm Lime',
    description: 'Warm lime #CFFF74 on olive ink #2F3A1D.',
    swatches: {
      darkAccent: '#CFFF74',
      darkSurface: '#232B15',
      lightAccent: '#2F3A1D',
      lightSurface: '#F3F6E8',
    },
  },
  {
    id: 'teal',
    label: 'Carbon Teal',
    description: 'Carbon teal #042F32 on mint foam #D6FFCB.',
    swatches: {
      darkAccent: '#D6FFCB',
      darkSurface: '#02191B',
      lightAccent: '#042F32',
      lightSurface: '#EDF7F1',
    },
  },
];

/** Mini UI mock rendered in a palette's actual dark or light colors */
function ThemeModePreview({ themeId, mode }: { themeId: ThemeId; mode: ThemeMode }): JSX.Element {
  const sw = THEMES.find((theme) => theme.id === themeId)!.swatches;
  const dark = mode === 'dark';
  const bg = dark ? sw.darkSurface : sw.lightSurface;
  const panel = dark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.85)';
  const accent = dark ? sw.darkAccent : sw.lightAccent;
  const text = dark ? 'rgba(255,255,255,0.62)' : 'rgba(0,0,0,0.5)';
  const border = dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)';
  return (
    <div className="mb-2 h-16 w-full overflow-hidden rounded-md border" style={{ background: bg }}>
      <div className="m-1.5 rounded p-1.5" style={{ background: panel }}>
        <div className="h-1.5 w-10 rounded-full" style={{ background: accent }} />
        <div className="mt-1 h-1 w-14 rounded-full" style={{ background: text }} />
        <div className="mt-2 flex gap-1">
          <div className="h-3 w-8 rounded" style={{ background: accent }} />
          <div className="h-3 w-8 rounded border" style={{ borderColor: border }} />
        </div>
      </div>
    </div>
  );
}

/** Selectable palette card: two-swatch preview + description */
function ThemePickerCard({
  theme: themeId,
  label,
  description,
  selected,
  onSelect,
}: {
  theme: ThemeId;
  label: string;
  description: string;
  selected: boolean;
  onSelect: (themeId: ThemeId) => void;
}): JSX.Element {
  const sw = THEMES.find((theme) => theme.id === themeId)!.swatches;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(themeId)}
      className={`group relative min-w-0 rounded-lg border-2 p-3 text-left transition-colors ${
        selected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/40 hover:bg-accent/5'
      }`}
    >
      {selected && (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-3 w-3" aria-hidden="true" />
        </span>
      )}
      <div className="mb-2 flex gap-1">
        <span
          className="h-8 flex-1 rounded-md border border-black/10"
          style={{ background: sw.darkAccent }}
          title="Dark mode accent"
        />
        <span
          className="h-8 flex-1 rounded-md border border-black/10"
          style={{ background: sw.lightAccent }}
          title="Light mode accent"
        />
      </div>
      <span className="block text-xs font-medium">{label}</span>
      <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
        {description}
      </span>
    </button>
  );
}

/** Selectable light/dark tile with a live preview of the current palette */
function ThemeTile({
  mode,
  icon: Icon,
  label,
  themeId,
  selected,
  onSelect,
}: {
  mode: ThemeMode;
  icon: typeof Sun;
  label: string;
  themeId: ThemeId;
  selected: boolean;
  onSelect: (mode: ThemeMode) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(mode)}
      className={`group relative min-w-0 rounded-lg border-2 p-3 text-left transition-colors ${
        selected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/40 hover:bg-accent/5'
      }`}
    >
      {selected && (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-3 w-3" aria-hidden="true" />
        </span>
      )}
      <ThemeModePreview themeId={themeId} mode={mode} />
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="text-xs font-medium">{label}</span>
      </div>
    </button>
  );
}

/**
 * Application settings: appearance (palette + mode) and privacy.
 * Changes apply instantly.
 */
export function SettingsPage(): JSX.Element {
  const { theme, setTheme } = useTheme();
  const themeId = useUIStore((state) => state.themeId);
  const setThemeId = useUIStore((state) => state.setThemeId);

  // --- Diagnostics (v0.7.5) ---------------------------------------------
  const [logDirectory, setLogDirectory] = useState<string | null>(null);
  const [isBuildingDiagnostics, setIsBuildingDiagnostics] = useState(false);
  const [diagnosticsResult, setDiagnosticsResult] = useState<SaveExportResult | null>(null);

  // --- Storage overview (v0.7.6) ----------------------------------------
  const [storage, setStorage] = useState<StorageOverview | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [confirmClearExports, setConfirmClearExports] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

  const refreshStorage = useCallback(async () => {
    setIsMeasuring(true);
    try {
      setStorage(await getStorageOverview());
      setStorageError(null);
    } catch (error) {
      // A blocked/failed IndexedDB read must not leave the section spinning,
      // and must not pretend the app uses zero bytes: say what went wrong.
      const message = error instanceof Error ? error.message : String(error);
      logMessage('warn', `Could not read local storage usage: ${message}`);
      setStorageError(message);
    } finally {
      setIsMeasuring(false);
    }
  }, []);

  useEffect(() => {
    void refreshStorage();
  }, [refreshStorage]);

  useEffect(() => {
    let active = true;
    void getLogDirectory().then((directory) => {
      if (active) setLogDirectory(directory);
    });
    return () => {
      active = false;
    };
  }, []);

  const storagePercent = storage
    ? Math.min(
        100,
        storage.quotaBytes > 0
          ? (storage.usageBytes / storage.quotaBytes) * 100
          : storage.usageBytes > 0
            ? 100
            : 0
      )
    : 0;

  const revealPath = async (path: string): Promise<void> => {
    setRevealError(null);
    if (!(await revealExportPath(path))) {
      setRevealError('Explorer could not be opened. The file is still on disk at the path shown.');
    }
  };

  const exportDiagnostics = useCallback(async () => {
    setIsBuildingDiagnostics(true);
    setDiagnosticsResult(null);
    try {
      const { blob, fileName } = await buildDiagnosticsArchive();
      setDiagnosticsResult(await saveExport(blob, fileName, 'diagnostics'));
    } catch (error) {
      setDiagnosticsResult({
        status: 'failed',
        path: null,
        fileName: 'id-stack-diagnostics.zip',
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsBuildingDiagnostics(false);
    }
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6 sm:p-8">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Personalise how ID Stack looks and behaves. Changes apply instantly.
        </p>
      </div>

      {/* Appearance */}
      <SettingsSection
        icon={Monitor}
        title="Appearance"
        description="Pick a color palette, then choose its light or dark mode."
      >
        <div className="space-y-4">
          {/* Palette picker */}
          <div>
            <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
              <Palette className="mr-1 inline h-3 w-3" aria-hidden="true" />
              Color palette
            </Label>
            <div role="radiogroup" aria-label="Color palette" className="grid grid-cols-3 gap-3">
              {THEMES.map((theme) => (
                <ThemePickerCard
                  key={theme.id}
                  theme={theme.id}
                  label={theme.label}
                  description={theme.description}
                  selected={themeId === theme.id}
                  onSelect={setThemeId}
                />
              ))}
            </div>
          </div>

          {/* Mode picker (previews follow the selected palette) */}
          <div>
            <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
              Mode
            </Label>
            <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-3">
              <ThemeTile
                mode="dark"
                icon={Moon}
                label="Dark"
                themeId={themeId}
                selected={theme === 'dark'}
                onSelect={setTheme}
              />
              <ThemeTile
                mode="light"
                icon={Sun}
                label="Light"
                themeId={themeId}
                selected={theme === 'light'}
                onSelect={setTheme}
              />
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* Exports: where files went + reveal in Explorer (v0.7.5) */}
      <SettingsSection
        icon={FolderOpen}
        title="Exports"
        description="Every file you saved, with the folder it went to."
      >
        <RecentExports />
      </SettingsSection>

      {/* Storage: what the app keeps on this PC (v0.7.6) */}
      <SettingsSection
        icon={HardDrive}
        title="Storage"
        description="Everything ID Stack stores locally, and how much room it uses."
      >
        <div className="space-y-3">
          {storage ? (
            <>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium">App storage</span>
                  <span className="text-muted-foreground">
                    {formatBytes(storage.usageBytes)}
                    {storage.quotaBytes > 0 ? ` of ${formatBytes(storage.quotaBytes)}` : ''}
                  </span>
                </div>
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-surface-card"
                  role="progressbar"
                  aria-label="App storage used"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(storagePercent)}
                  aria-valuetext={`${formatBytes(storage.usageBytes)} of ${
                    storage.quotaBytes > 0 ? formatBytes(storage.quotaBytes) : 'unknown quota'
                  }`}
                >
                  <div className="h-full bg-primary" style={{ width: `${storagePercent}%` }} />
                </div>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md border bg-surface-card px-2 py-1.5">
                  <dt className="text-[11px] text-muted-foreground">Fonts</dt>
                  <dd className="text-xs font-medium">{storage.fonts.count}</dd>
                  <dd className="text-[10px] text-muted-foreground">
                    {formatBytes(storage.fonts.bytes)}
                  </dd>
                </div>
                <div className="rounded-md border bg-surface-card px-2 py-1.5">
                  <dt className="text-[11px] text-muted-foreground">Projects</dt>
                  <dd className="text-xs font-medium">{storage.projects.count}</dd>
                  <dd className="text-[10px] text-muted-foreground">
                    {formatBytes(storage.projects.bytes)}
                  </dd>
                </div>
                <div className="rounded-md border bg-surface-card px-2 py-1.5">
                  <dt className="text-[11px] text-muted-foreground">Settings</dt>
                  <dd className="text-xs font-medium">{storage.keyValue.count}</dd>
                  <dd className="text-[10px] text-muted-foreground">
                    {formatBytes(storage.keyValue.bytes + storage.localStorageBytes)}
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            !storageError && <p className="text-xs text-muted-foreground">Measuring local storage…</p>
          )}
          {storageError && (
            <p className="text-[11px] text-destructive" role="alert">
              Could not read local storage usage: {storageError}. Exporting and saving still work;
              try Refresh.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void refreshStorage()} disabled={isMeasuring}>
              <RefreshCw className={isMeasuring ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmClearExports(true)}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Clear recent exports
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Uploaded fonts and settings stay on this PC. Photos and Excel data are held in memory
            for the current session only and are never uploaded.
          </p>
        </div>
      </SettingsSection>

      {/* Diagnostics: local logs, no telemetry (v0.7.5) */}
      <SettingsSection
        icon={FileArchive}
        title="Diagnostics"
        description="A local log and a one-click bundle for bug reports. Nothing is sent anywhere automatically."
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              variant="default"
              onClick={() => void exportDiagnostics()}
              disabled={isBuildingDiagnostics}
            >
              {isBuildingDiagnostics ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <FileArchive className="h-4 w-4" aria-hidden="true" />
              )}
              {isBuildingDiagnostics ? 'Building bundle…' : 'Export diagnostics (.zip)'}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (logDirectory) void revealPath(logDirectory);
              }}
              disabled={!logDirectory}
            >
              <FolderOpen className="h-4 w-4" aria-hidden="true" />
              Open log folder
            </Button>
          </div>
          <p className="break-all text-[11px] text-muted-foreground">
            {logDirectory
              ? `Logs: ${logDirectory}`
              : 'Log files are written by the installed desktop app; the browser dev server keeps none.'}
          </p>
          {diagnosticsResult && diagnosticsResult.status === 'saved' && diagnosticsResult.path && (
            <div className="flex items-center justify-between gap-2 rounded-md border bg-surface-card/60 px-2.5 py-2">
              <p className="min-w-0 flex-1 break-all text-[11px] text-muted-foreground">
                Saved to <span className="text-foreground">{diagnosticsResult.path}</span>
              </p>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  if (diagnosticsResult.path) void revealPath(diagnosticsResult.path);
                }}
              >
                <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                Show
              </Button>
            </div>
          )}
          {diagnosticsResult && diagnosticsResult.status === 'failed' && (
            <p className="text-[11px] text-destructive">
              Could not create the bundle: {diagnosticsResult.error ?? 'unknown error'}
            </p>
          )}
          {diagnosticsResult && diagnosticsResult.status === 'cancelled' && (
            <p className="text-[11px] text-muted-foreground">
              Save cancelled — nothing was written.
            </p>
          )}
          {revealError && (
            <p className="text-[11px] text-destructive" role="alert">
              {revealError}
            </p>
          )}
        </div>
      </SettingsSection>

      {/* Privacy */}
      <SettingsSection
        icon={ShieldCheck}
        title="Privacy & data"
        description="ID Stack is 100% local — nothing to configure, by design."
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-lg border bg-surface-card p-3">
            <Server className="h-4 w-4 text-primary" aria-hidden="true" />
            <p className="mt-1.5 text-xs font-medium">No server</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Designs and data stay on your device.
            </p>
          </div>
          <div className="rounded-lg border bg-surface-card p-3">
            <Save className="h-4 w-4 text-primary" aria-hidden="true" />
            <p className="mt-1.5 text-xs font-medium">Local storage</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Everything is saved on this PC.</p>
          </div>
          <div className="rounded-lg border bg-surface-card p-3">
            <Info className="h-4 w-4 text-primary" aria-hidden="true" />
            <p className="mt-1.5 text-xs font-medium">No account</p>
            <p className="mt-0.5 text-xs text-muted-foreground">No sign-up, no tracking, ever.</p>
          </div>
        </div>
      </SettingsSection>

      <ConfirmDialog
        open={confirmClearExports}
        title="Clear the recent-export list?"
        description="Only the list in this app is cleared. The files already saved on disk are not deleted and can still be opened from their folders."
        confirmLabel="Clear list"
        destructive
        onCancel={() => setConfirmClearExports(false)}
        onConfirm={() => {
          setConfirmClearExports(false);
          clearRecentExports();
          void refreshStorage();
        }}
      />
    </div>
  );
}
