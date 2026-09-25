import { useSettingsStore } from '@/stores/settingsStore';
import { useTheme } from '@/hooks/useTheme';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Label,
  Select,
  Checkbox,
  Button,
} from '@/components/ui';
import { Sun, Moon } from 'lucide-react';

/**
 * Application settings: measurement units, auto-save and appearance.
 */
export function SettingsPage(): JSX.Element {
  const { theme, setTheme } = useTheme();
  const unit = useSettingsStore((state) => state.unit);
  const autoSave = useSettingsStore((state) => state.autoSave);
  const setUnit = useSettingsStore((state) => state.setUnit);
  const setAutoSave = useSettingsStore((state) => state.setAutoSave);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Units</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            <Label htmlFor="unit-select">Units</Label>
            <Select
              id="unit-select"
              value={unit}
              onChange={(event) => setUnit(event.target.value as 'mm' | 'inch')}
              className="max-w-xs"
            >
              <option value="mm">Millimetres (mm)</option>
              <option value="inch">Inches (in)</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose between dark and light interface</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant={theme === 'dark' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTheme('dark')}
            >
              <Moon className="h-4 w-4" aria-hidden="true" />
              Dark mode
            </Button>
            <Button
              variant={theme === 'light' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTheme('light')}
            >
              <Sun className="h-4 w-4" aria-hidden="true" />
              Light mode
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <Checkbox
              id="autosave-toggle"
              checked={autoSave}
              onChange={(event) => setAutoSave(event.target.checked)}
            />
            <div className="flex flex-col">
              <Label htmlFor="autosave-toggle">Auto-save templates</Label>
              <span className="text-xs text-muted-foreground">
                Save changes automatically while editing
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
