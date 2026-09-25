import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IdCard, Layout, Settings, Info } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { cn } from '@/lib/utils';

interface SidebarItem {
  to: string;
  labelKey: string;
  Icon: typeof IdCard;
}

/**
 * Left navigation sidebar. Collapsible; state persists in uiStore.
 */
export function Sidebar(): JSX.Element {
  const { t } = useTranslation();
  const collapsed = useUIStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useUIStore((state) => state.setSidebarCollapsed);

  const items: SidebarItem[] = [
    { to: '/', labelKey: 'nav.editor', Icon: IdCard },
    { to: '/library', labelKey: 'nav.library', Icon: Layout },
    { to: '/settings', labelKey: 'nav.settings', Icon: Settings },
    { to: '/about', labelKey: 'nav.about', Icon: Info },
  ];

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r bg-surface-panel transition-all duration-200',
        collapsed ? 'w-14' : 'w-52'
      )}
    >
      <nav className="flex-1 p-2" aria-label={t('app.name')}>
        <ul className="flex flex-col gap-1">
          {items.map(({ to, labelKey, Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                title={t(labelKey)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-accent/10 hover:text-foreground',
                    collapsed && 'justify-center px-2'
                  )
                }
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                {!collapsed && <span className="truncate">{t(labelKey)}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t p-2">
        <button
          type="button"
          onClick={() => setSidebarCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          className="flex w-full items-center justify-center rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground"
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>
    </aside>
  );
}
