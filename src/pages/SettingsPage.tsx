import { useSettingsStore } from '@/stores/settingsStore';
import { useTheme } from '@/hooks/useTheme';
import { useUIStore, type ThemeId, type ThemeMode } from '@/stores/uiStore';
import { Label, Select, Checkbox } from '@/components/ui';
import {
  Sun,
  Moon,
  Ruler,
  Monitor,
  Save,
  ShieldCheck,
  Server,
  Info,
  Check,
  Palette,
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

/** One setting row: label + description on the left, control on the right */
function SettingRow({
  htmlFor,
  label,
  description,
  children,
}: {
  htmlFor?: string;
  label: string;
  description: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <Label htmlFor={htmlFor} className="text-sm">
          {label}
        </Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
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
 * Application settings: appearance (palette + mode), measurement units,
 * editor behaviour and privacy. Changes apply instantly.
 */
export function SettingsPage(): JSX.Element {
  const { theme, setTheme } = useTheme();
  const themeId = useUIStore((state) => state.themeId);
  const setThemeId = useUIStore((state) => state.setThemeId);
  const unit = useSettingsStore((state) => state.unit);
  const autoSave = useSettingsStore((state) => state.autoSave);
  const setUnit = useSettingsStore((state) => state.setUnit);
  const setAutoSave = useSettingsStore((state) => state.setAutoSave);

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

      {/* Editor */}
      <SettingsSection
        icon={Ruler}
        title="Editor"
        description="Measurement units and automatic saving for the template editor."
      >
        <div className="divide-y">
          <SettingRow
            htmlFor="unit-select"
            label="Measurement units"
            description="Used by rulers and property inputs in the editor."
          >
            <Select
              id="unit-select"
              value={unit}
              onChange={(event) => setUnit(event.target.value as 'mm' | 'inch')}
              className="w-44"
            >
              <option value="mm">Millimetres (mm)</option>
              <option value="inch">Inches (in)</option>
            </Select>
          </SettingRow>
          <SettingRow
            htmlFor="autosave-toggle"
            label="Auto-save templates"
            description="Save changes automatically while editing."
          >
            <Checkbox
              id="autosave-toggle"
              checked={autoSave}
              onChange={(event) => setAutoSave(event.target.checked)}
              className="h-5 w-5"
            />
          </SettingRow>
        </div>
      </SettingsSection>

      {/* Privacy */}
      <SettingsSection
        icon={ShieldCheck}
        title="Privacy & data"
        description="ID Stack is 100% client-side — nothing to configure, by design."
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
            <p className="mt-0.5 text-xs text-muted-foreground">
              Everything is saved in your browser.
            </p>
          </div>
          <div className="rounded-lg border bg-surface-card p-3">
            <Info className="h-4 w-4 text-primary" aria-hidden="true" />
            <p className="mt-1.5 text-xs font-medium">No account</p>
            <p className="mt-0.5 text-xs text-muted-foreground">No sign-up, no tracking, ever.</p>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
