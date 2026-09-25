import { useTranslation } from 'react-i18next';
import { PenTool } from 'lucide-react';

/**
 * Template editor page. The Fabric.js canvas editor is implemented in Phase 2.
 */
export function EditorPage(): JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <PenTool className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-2xl font-semibold">{t('pages.editorTitle')}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t('pages.editorPlaceholder')}</p>
    </div>
  );
}
