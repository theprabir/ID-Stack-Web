import { useSettingsStore } from '@/stores/settingsStore';
import { useTheme } from '@/hooks/useTheme';
import { Label, Select, Checkbox } from '@/components/ui';
import { Sun, Moon, Ruler, Monitor, Save, ShieldCheck, Server, Info, Check } from 'lucide-react';

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

/** Clickable theme tile showing a mini preview of the mode */
function ThemeTile({
  mode,
  icon: Icon,
  label,
  selected,
  onSelect,
}: {
  mode: 'dark' | 'light';
  icon: typeof Sun;
  label: string;
  selected: boolean;
  onSelect: (mode: 'dark' | 'light') => void;
}): JSX.Element {
  const previewBg = mode === 'dark' ? 'bg-[#0F0F0F]' : 'bg-white';
  const previewPanel = mode === 'dark' ? 'bg-[#1A1A1A]' : 'bg-[#F5F5F5]';
  const previewAccent = mode === 'dark' ? 'bg-[#3B82F6]' : 'bg-[#2563EB]';
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
      {/* Mini UI preview */}
      <div className={`mb-2 h-16 w-full overflow-hidden rounded-md border ${previewBg}`}>
        <div className={`m-1.5 rounded ${previewPanel} p-1.5`}>
          <div className={`h-1.5 w-10 rounded-full ${previewAccent}`} />
          <div
            className={`mt-1 h-1 w-14 rounded-full ${mode === 'dark' ? 'bg-[#A0A0A0]' : 'bg-[#999999]'}`}
          />
          <div className="mt-2 flex gap-1">
            <div className={`h-3 w-8 rounded ${previewAccent}`} />
            <div
              className={`h-3 w-8 rounded border ${mode === 'dark' ? 'border-[#333333]' : 'border-[#D4D4D4]'}`}
            />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="text-xs font-medium">{label}</span>
      </div>
    </button>
  );
}

/**
 * Application settings: appearance, measurement units, editor behaviour and
 * privacy. Organised into labelled sections with visual theme previews.
 */
export function SettingsPage(): JSX.Element {
  const { theme, setTheme } = useTheme();
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
        description="Choose between the dark and light interface. Dark is the default."
      >
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-3">
          <ThemeTile
            mode="dark"
            icon={Moon}
            label="Dark"
            selected={theme === 'dark'}
            onSelect={setTheme}
          />
          <ThemeTile
            mode="light"
            icon={Sun}
            label="Light"
            selected={theme === 'light'}
            onSelect={setTheme}
          />
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
