import React from 'react';
import {
  Box,
  Columns2,
  Compass,
  FileArchive,
  FileSpreadsheet,
  FolderKanban,
  Landmark,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Wallet,
  X,
} from 'lucide-react';
import type { Language } from '../../types/bunyan';
import { UI_TEXT } from '../../utils/i18n';
import { BunyanLogo } from '../common/BunyanLogo';

export type ActiveModule =
  | 'command'
  | 'projects'
  | 'financials'
  | 'documents'
  | 'studio'
  | 'bim'
  | 'takeoff'
  | 'gis'
  | 'government'
  | 'settings';

interface SidebarProps {
  activeModule: ActiveModule;
  onSelectModule: (m: ActiveModule) => void;
  lang: Language;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  companyName: string;
  projectsCount: number;
  alertsCount: number;
}

interface NavGroup {
  groupKey: keyof typeof UI_TEXT.ar.navGroups;
  items: Array<{
    id: ActiveModule;
    icon: React.ComponentType<{ className?: string }>;
  }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    groupKey: 'executive',
    items: [{ id: 'command', icon: LayoutDashboard }],
  },
  {
    groupKey: 'portfolio',
    items: [
      { id: 'projects', icon: FolderKanban },
      { id: 'financials', icon: Wallet },
      { id: 'documents', icon: FileArchive },
    ],
  },
  {
    groupKey: 'engineering',
    items: [
      { id: 'studio', icon: Columns2 },
      { id: 'bim', icon: Box },
      { id: 'takeoff', icon: FileSpreadsheet },
    ],
  },
  {
    groupKey: 'gisPortal',
    items: [
      { id: 'gis', icon: Compass },
      { id: 'government', icon: Landmark },
    ],
  },
  {
    groupKey: 'system',
    items: [{ id: 'settings', icon: Settings }],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  onSelectModule,
  lang,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  companyName,
  projectsCount,
  alertsCount,
}) => {
  const t = UI_TEXT[lang];

  const renderNavContent = (isCollapsedDesktop: boolean) => (
    <div className="flex flex-col h-full bg-[var(--bg-surface)] border-e border-[var(--border-hairline)]">
      {/* Brand Header */}
      <div
        className={`flex items-center h-16 border-b border-[var(--border-hairline)] shrink-0 ${
          isCollapsedDesktop ? 'justify-center px-2' : 'justify-between px-4'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <BunyanLogo iconOnly size="sm" />
          {!isCollapsedDesktop && (
            <div className="min-w-0">
              <div className="text-sm font-bold tracking-tight text-[var(--text-primary)] truncate">
                {t.appName}
              </div>
              <div className="text-[10.5px] font-mono text-[#B4863C] dark:text-[#C99A49] truncate">
                {lang === 'ar' ? '5D BIM · بلدية الشارقة' : '5D BIM · SHARJAH'}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-surface-subtle)]"
          aria-label="Close navigation"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Grouped Engineering Navigation */}
      <nav className="flex-1 px-2.5 py-4 space-y-5 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.groupKey} className="space-y-1">
            {!isCollapsedDesktop && (
              <div className="px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {t.navGroups[group.groupKey]}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = activeModule === item.id;
                const countHint =
                  item.id === 'projects'
                    ? projectsCount
                    : item.id === 'government' && alertsCount > 0
                    ? alertsCount
                    : null;

                return (
                  <button
                    key={item.id}
                    type="button"
                    title={isCollapsedDesktop ? t.nav[item.id] : undefined}
                    onClick={() => {
                      onSelectModule(item.id);
                      onCloseMobile();
                    }}
                    className={`w-full min-h-[40px] flex items-center rounded-lg text-xs font-semibold bunyan-transition whitespace-nowrap cursor-pointer ${
                      isCollapsedDesktop ? 'justify-center px-2' : 'justify-between px-3'
                    } ${
                      active
                        ? 'bg-[#B4863C] text-white shadow-xs'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Icon className="w-4 h-4 shrink-0" />
                      {!isCollapsedDesktop && (
                        <span className="truncate">{t.nav[item.id]}</span>
                      )}
                    </span>
                    {!isCollapsedDesktop && countHint !== null && (
                      <span
                        dir="ltr"
                        className={`font-mono tabular-nums text-[10.5px] ${
                          active ? 'text-white/90' : 'text-[var(--text-muted)]'
                        }`}
                      >
                        {countHint}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer Company Context & Collapse Control */}
      <div className="p-3 border-t border-[var(--border-hairline)] space-y-2.5 shrink-0">
        {!isCollapsedDesktop && (
          <div className="px-2 space-y-0.5 text-[11px]">
            <div className="font-semibold text-[var(--text-primary)] truncate">
              {companyName}
            </div>
            <div className="text-[var(--text-muted)] truncate">
              {lang === 'ar'
                ? 'معايير بلدية الشارقة · ضريبة 5%'
                : 'Sharjah Mun. · UAE VAT 5%'}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onToggleCollapse}
          className="hidden lg:flex w-full h-9 items-center justify-center gap-2 rounded-lg border border-[var(--border-hairline)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] bunyan-transition cursor-pointer"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsedDesktop ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <>
              <PanelLeftClose className="w-4 h-4" />
              <span>{lang === 'ar' ? 'طي القائمة' : 'Collapse'}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside
        className={`hidden lg:block shrink-0 h-screen sticky top-0 no-print bunyan-transition ${
          collapsed ? 'w-[72px]' : 'w-64'
        }`}
      >
        {renderNavContent(collapsed)}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10 shadow-2xl">
            {renderNavContent(false)}
          </div>
        </div>
      )}
    </>
  );
};
