import React, { useState } from 'react';
import {
  Activity,
  Box,
  ChevronDown,
  Columns2,
  Compass,
  Cpu,
  FileArchive,
  FileSpreadsheet,
  FolderKanban,
  Landmark,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Printer,
  Settings,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react';
import type { Language } from '../../types/bunyan';
import { UI_TEXT } from '../../utils/i18n';
import { BunyanLogo } from '../common/BunyanLogo';

export type ActiveModule =
  | 'dashboard'
  | 'command'
  | 'projects'
  | 'financials'
  | 'documents'
  | 'reports'
  | 'studio'
  | 'bim'
  | 'takeoff'
  | 'gis'
  | 'structural'
  | 'government'
  | 'accounts'
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
    items: [
      { id: 'dashboard', icon: Activity },
      { id: 'command', icon: LayoutDashboard },
    ],
  },
  {
    groupKey: 'portfolio',
    items: [
      { id: 'projects', icon: FolderKanban },
      { id: 'financials', icon: Wallet },
      { id: 'documents', icon: FileArchive },
      { id: 'reports', icon: Printer },
    ],
  },
  {
    groupKey: 'engineering',
    items: [
      { id: 'studio', icon: Columns2 },
      { id: 'bim', icon: Box },
      { id: 'takeoff', icon: FileSpreadsheet },
      { id: 'gis', icon: Compass },
      { id: 'structural', icon: Cpu },
    ],
  },
  {
    groupKey: 'system',
    items: [
      { id: 'government', icon: Landmark },
      { id: 'accounts', icon: ShieldCheck },
      { id: 'settings', icon: Settings },
    ],
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
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderNavContent = (isCollapsedDesktop: boolean) => (
    <div className="flex flex-col h-full bunyan-glass border-e border-[var(--border-hairline)] lg:rounded-2xl lg:border lg:shadow-[0_18px_50px_rgba(0,0,0,0.28)] overflow-hidden">
      {/* Brand Header */}
      <div
        className={`flex items-center h-16 border-b border-[var(--border-hairline)] shrink-0 relative ${
          isCollapsedDesktop ? 'justify-center px-2' : 'justify-between px-4'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <BunyanLogo iconOnly size="sm" lang={lang} />
          {!isCollapsedDesktop && (
            <div className="min-w-0">
              <div className="text-sm font-bold tracking-tight text-[var(--text-primary)] truncate">
                {t.appName}
              </div>
              <div className="text-[10.5px] font-mono text-[var(--accent-cyan)] truncate">
                {lang === 'ar' ? '5D BIM · بلدية الشارقة' : '5D BIM · SHARJAH'}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-surface-subtle)]"
          aria-label="Close navigation"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Grouped Engineering Navigation */}
      <nav className="flex-1 px-2.5 py-4 space-y-4 overflow-y-auto">
        {NAV_GROUPS.map((group) => {
          const isGroupClosed = !isCollapsedDesktop && Boolean(collapsedGroups[group.groupKey]);

          return (
            <div key={group.groupKey} className="space-y-1">
              {!isCollapsedDesktop && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.groupKey)}
                  className="w-full px-3 pb-1 flex items-center justify-between text-[10.5px] font-bold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--accent-cyan)] bunyan-transition cursor-pointer"
                >
                  <span>{t.navGroups[group.groupKey]}</span>
                  <ChevronDown
                    className={`w-3 h-3 transition-transform duration-200 ${
                      isGroupClosed ? '-rotate-90 rtl:rotate-90' : ''
                    }`}
                  />
                </button>
              )}

              {!isGroupClosed && (
                <div className="space-y-1">
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
                        className={`relative w-full min-h-[40px] flex items-center rounded-xl text-xs font-semibold bunyan-transition whitespace-nowrap cursor-pointer ${
                          isCollapsedDesktop ? 'justify-center px-2' : 'justify-between px-3'
                        } ${
                          active
                            ? 'bg-gradient-to-l from-[#0284C7]/18 to-[#1677FF]/12 dark:from-[#00F0FF]/16 dark:to-[#1677FF]/12 text-[#0284C7] dark:text-[#00F0FF] border border-[#0284C7]/35 dark:border-[#00F0FF]/40 shadow-[0_0_18px_rgba(0,240,255,0.14)]'
                            : 'text-[var(--text-secondary)] border border-transparent hover:bg-[var(--bg-surface-subtle)] hover:text-[var(--text-primary)] hover:border-[var(--border-hairline)]'
                        }`}
                      >
                        {active && !isCollapsedDesktop && (
                          <span
                            aria-hidden="true"
                            className="absolute start-0 top-2 bottom-2 w-1 rounded-full bg-[#0284C7] dark:bg-[#00F0FF] shadow-[0_0_10px_#00F0FF]"
                          />
                        )}
                        <span className="flex items-center gap-2.5 min-w-0">
                          <Icon
                            className={`w-4 h-4 shrink-0 ${
                              active ? 'text-[#0284C7] dark:text-[#00F0FF]' : ''
                            }`}
                          />
                          {!isCollapsedDesktop && (
                            <span className="truncate">{t.nav[item.id]}</span>
                          )}
                        </span>
                        {!isCollapsedDesktop && countHint !== null && (
                          <span
                            dir="ltr"
                            className={`font-mono tabular-nums text-[10.5px] px-1.5 py-0.5 rounded-md ${
                              active
                                ? 'bg-[#0284C7]/15 dark:bg-[#00F0FF]/18 text-[#0284C7] dark:text-[#00F0FF]'
                                : item.id === 'government'
                                ? 'bg-[#FF405C]/15 text-[#FF405C]'
                                : 'text-[var(--text-muted)]'
                            }`}
                          >
                            {countHint}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer Company Context & Collapse Control */}
      <div className="p-3 border-t border-[var(--border-hairline)] space-y-2.5 shrink-0 bg-[var(--bg-surface-subtle)]/50">
        {!isCollapsedDesktop && (
          <div className="px-2 space-y-0.5 text-[11px]">
            <div className="font-semibold text-[var(--text-primary)] truncate">
              {companyName}
            </div>
            <div className="text-[var(--text-muted)] truncate flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00E5A8] shrink-0" aria-hidden="true" />
              <span className="truncate">
                {lang === 'ar' ? 'معايير بلدية الشارقة · VAT 5%' : 'Sharjah Mun. · UAE VAT 5%'}
              </span>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onToggleCollapse}
          className="hidden lg:flex w-full h-9 items-center justify-center gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]/70 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--accent-cyan)] hover:border-[var(--accent-cyan)]/40 bunyan-transition cursor-pointer"
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
        className={`hidden lg:block shrink-0 h-screen sticky top-0 py-3 ps-3 no-print bunyan-transition ${
          collapsed ? 'w-[84px]' : 'w-[272px]'
        }`}
      >
        {renderNavContent(collapsed)}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-[#050B18]/75 backdrop-blur-xs"
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

export const SidebarNavigation = Sidebar;

