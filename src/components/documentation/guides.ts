import userManualMd from '../../../docs/user_manual.md?raw';
import troubleshootingMd from '../../../docs/troubleshooting.md?raw';
import keyboardShortcutsMd from '../../../docs/keyboard_shortcuts.md?raw';
import developerManualMd from '../../../docs/developer_manual.md?raw';
import changelogMd from '../../../CHANGELOG.md?raw';

/** One readable guide bundled into the app */
export interface DocGuide {
  /** Unique key, also used as the `?guide=` query parameter */
  id: string;
  Icon: 'book' | 'lifebuoy' | 'keyboard' | 'code' | 'file';
  name: string;
  audience: string;
  description: string;
  /** Raw markdown source (bundled at build time via Vite `?raw`) */
  source: string;
  /** Absolute GitHub URL of the markdown source (fallback link) */
  githubUrl: string;
}

const REPO_DOCS = 'https://github.com/theprabir/ID-Stack-Web/blob/main';

/** All guides rendered inside the app, plus the changelog */
export const GUIDES: DocGuide[] = [
  {
    id: 'user_manual',
    Icon: 'book',
    name: 'User manual',
    audience: 'Users',
    description:
      'Every page and workflow: the PSD Studio wizard, uploads, placeholder picking, column mapping, batch generation and printing.',
    source: userManualMd,
    githubUrl: `${REPO_DOCS}/docs/user_manual.md`,
  },
  {
    id: 'troubleshooting',
    Icon: 'lifebuoy',
    name: 'Troubleshooting',
    audience: 'Users',
    description:
      'Symptom-first fixes for parsing, fonts, photos, generation and printing problems.',
    source: troubleshootingMd,
    githubUrl: `${REPO_DOCS}/docs/troubleshooting.md`,
  },
  {
    id: 'keyboard_shortcuts',
    Icon: 'keyboard',
    name: 'Keyboard shortcuts',
    audience: 'Everyone',
    description: 'The (currently minimal) PSD Studio keyboard reference — what works today.',
    source: keyboardShortcutsMd,
    githubUrl: `${REPO_DOCS}/docs/keyboard_shortcuts.md`,
  },
  {
    id: 'developer_manual',
    Icon: 'code',
    name: 'Developer manual',
    audience: 'Contributors',
    description:
      'Stack, architecture, services, data flow, PSD/CMYK/imposition internals, testing and release process.',
    source: developerManualMd,
    githubUrl: `${REPO_DOCS}/docs/developer_manual.md`,
  },
  {
    id: 'changelog',
    Icon: 'file',
    name: 'Changelog',
    audience: 'Everyone',
    description: 'What changed in every release, newest first.',
    source: changelogMd,
    githubUrl: `${REPO_DOCS}/CHANGELOG.md`,
  },
];

/** Find a guide by its id (URL parameter) */
export function findGuide(id: string | null): DocGuide | undefined {
  return GUIDES.find((guide) => guide.id === id);
}
