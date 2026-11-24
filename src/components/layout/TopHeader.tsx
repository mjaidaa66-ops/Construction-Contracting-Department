import React, { useState } from 'react';
import {
  Bell,
  ChevronRight,
  Columns2,
  FileDown,
  FolderPlus,
  Globe,
  Menu,
  Moon,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Sun,
  UserCheck,
} from 'lucide-react';
import type { CloudSyncState } from '../../services/cloudSyncService';
import type { Language, Project, Role, ThemeMode } from '../../types/bunyan';
import { UI_TEXT } from '../../utils/i18n';
import type { ActiveModule } from './Sidebar';
import { BunyanLogo } from '../common/BunyanLogo';
import { CloudSyncStatusBadge } from './CloudSyncStatusBadge';

interface TopHeaderProps {
  activeModule: ActiveModule;
  lang: Language;
  onToggleLang: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  projects: Project[];
  activeProjectId: string;
  onSelectProject: (id: string) => void;
  currentRole: Role;
  userEmail?: string | null;
  syncState: CloudSyncState;
  onSyncNow: () => void;
  onOpenMobileNav: () => void;
  onOpenSearch: () => void;
  onOpenNotifications: () => void;
  alertsCount: number;
  onNavigateModule: (mod: ActiveModule) => void;
  onOpenExport: () => void;
}

const MODULE_GROUP_MAP: Record<ActiveModule, keyof typeof UI_TEXT.ar.navGroups> = {
  command: 'executive',
  projects: 'portfolio',
  financials: 'portfolio',
  documents: 'portfolio',
  reports: 'portfolio',
  studio: 'engineering',
  bim: 'engineering',
  takeoff: 'engineering',
  gis: 'gisPortal',
  government: 'gisPortal',
  settings: 'system',
};

export const TopHeader: React.FC<TopHeaderProps> = ({
  activeModule,
  lang,
  onToggleLang,
  theme,
  onToggleTheme,
  projects,
  activeProjectId,
  onSelectProject,
  currentRole,
  userEmail,
  syncState,
  onSyncNow,
  onOpenMobileNav,
  onOpenSearch,
  onOpenNotifications,
  alertsCount,
  onNavigateModule,
  onOpenExport,
}) => {
  const t = UI_TEXT[lang];
  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0];
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);

  return (
    <header className="h-16 px-4 lg:px-6 bg-[var(--bg-surface)]/95 backdrop-blur-md border-b border-[var(--border-hairline)] flex items-center justify-between gap-3 sticky top-0 z-30 no-print">
      {/* Left / Start: Mobile Drawer Trigger + Breadcrumb + Active Project Selector */}
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="lg:hidden min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)]"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <BunyanLogo iconOnly size="xs" lang={lang} />

        {/* Contextual Breadcrumbs */}
        <nav
          aria-label="Breadcrumb"
          className="hidden sm:flex items-center gap-1.5 text-xs min-w-0"
        >
          <span className="text-[var(--text-muted)] whitespace-nowrap hidden xl:inline">
            {t.navGroups[MODULE_GROUP_MAP[activeModule]]}
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] hidden xl:inline rtl:rotate-180 shrink-0" />
          <span className="font-semibold text-[var(--text-primary)] whitespace-nowrap">
            {t.nav[activeModule]}
          </span>
        </nav>

        {activeProject && (
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="hidden sm:inline text-[var(--text-muted)]" aria-hidden="true">
              /
            </span>
            <select
              value={activeProject.id}
              onChange={(e) => onSelectProject(e.target.value)}
              aria-label={lang === 'ar' ? 'اختر المشروع النشط' : 'Select active project'}
              className="h-8 max-w-[155px] sm:max-w-[230px] truncate bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-lg px-2.5 text-xs font-medium text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#B4863C]/60"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {lang === 'ar' ? p.name : p.nameEn}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right / End: Global Search, Quick Actions, Notifications, Sync Badge, Locale, Theme, User */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Global Command Search Trigger */}
        <button
          type="button"
          onClick={onOpenSearch}
          className="inline-flex items-center gap-2 h-8 px-2.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] bunyan-transition cursor-pointer whitespace-nowrap"
          title={lang === 'ar' ? 'بحث مركزي (Ctrl+K)' : 'Global Search (Ctrl+K)'}
        >
          <Search className="w-3.5 h-3.5 text-[#B4863C]" />
          <span className="hidden md:inline">
            {lang === 'ar' ? 'بحث سريع...' : 'Search...'}
          </span>
          <kbd
            dir="ltr"
            className="hidden xl:inline-block px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-hairline)] font-mono text-[10px] text-[var(--text-muted)]"
          >
            ⌘K
          </kbd>
        </button>

        {/* Quick Actions Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setQuickMenuOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-[#B4863C] text-white text-xs font-semibold hover:bg-[#9E7330] bunyan-transition cursor-pointer whitespace-nowrap"
            aria-expanded={quickMenuOpen}
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden xl:inline">{lang === 'ar' ? 'إجراء سريع' : 'Quick Action'}</span>
          </button>

          {quickMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setQuickMenuOpen(false)}
                aria-hidden="true"
              />
              <div className="absolute end-0 mt-1.5 w-56 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-elevated)] shadow-xl z-50 py-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    onNavigateModule('projects');
                    setQuickMenuOpen(false);
                  }}
                  className="w-full px-3.5 py-2 flex items-center gap-2.5 text-start text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                >
                  <FolderPlus className="w-3.5 h-3.5 text-[#B4863C]" />
                  <span>{lang === 'ar' ? 'إدارة المشاريع وإنشاء مشروع' : 'Manage & Create Project'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onNavigateModule('studio');
                    setQuickMenuOpen(false);
                  }}
                  className="w-full px-3.5 py-2 flex items-center gap-2.5 text-start text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                >
                  <Columns2 className="w-3.5 h-3.5 text-[#B4863C]" />
                  <span>{lang === 'ar' ? 'فتح استوديو 2D + 3D BIM' : 'Open 2D+3D BIM Studio'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onNavigateModule('reports');
                    setQuickMenuOpen(false);
                  }}
                  className="w-full px-3.5 py-2 flex items-center gap-2.5 text-start text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-[#B4863C]" />
                  <span>{lang === 'ar' ? 'فتح مركز التقارير والطباعة' : 'Open Reports & Print Center'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onOpenExport();
                    setQuickMenuOpen(false);
                  }}
                  className="w-full px-3.5 py-2 flex items-center gap-2.5 text-start text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5 text-[#B4863C]" />
                  <span>{lang === 'ar' ? 'تصدير مقايسة PDF / Excel' : 'Export Official PDF / Excel'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSyncNow();
                    setQuickMenuOpen(false);
                  }}
                  className="w-full px-3.5 py-2 flex items-center gap-2.5 text-start text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-[#B4863C]" />
                  <span>{lang === 'ar' ? 'مزامنة سحابية فورية' : 'Sync Workspace Now'}</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Notifications Drawer Trigger */}
        <button
          type="button"
          onClick={onOpenNotifications}
          className="relative h-8 w-8 flex items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] bunyan-transition cursor-pointer shrink-0"
          aria-label={lang === 'ar' ? 'التنبيهات' : 'Notifications'}
        >
          <Bell className="w-4 h-4" />
          {alertsCount > 0 && (
            <span
              dir="ltr"
              className="absolute -top-1 -end-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white font-mono text-[9.5px] font-bold flex items-center justify-center"
            >
              {alertsCount > 9 ? '9+' : alertsCount}
            </span>
          )}
        </button>

        <div className="hidden md:block">
          <CloudSyncStatusBadge syncState={syncState} lang={lang} onSyncNow={onSyncNow} />
        </div>

        <button
          type="button"
          onClick={onToggleLang}
          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--border-strong)] bunyan-transition whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Globe className="w-3.5 h-3.5 text-[#B4863C]" />
          <span>{lang === 'ar' ? 'EN' : 'العربية'}</span>
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          className="h-8 w-8 flex items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-[var(--text-primary)] hover:border-[var(--border-strong)] bunyan-transition shrink-0 cursor-pointer"
          aria-label={lang === 'ar' ? 'تبديل المظهر' : 'Toggle theme'}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-[#C99A49]" />
          ) : (
            <Moon className="w-4 h-4 text-slate-700" />
          )}
        </button>

        <button
          type="button"
          onClick={() => onNavigateModule('settings')}
          className="hidden sm:inline-flex items-center gap-2 h-8 px-2.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-xs font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)] bunyan-transition whitespace-nowrap shrink-0 cursor-pointer"
        >
          <UserCheck className="w-3.5 h-3.5 text-[#B4863C]" />
          <span className="capitalize">{currentRole}</span>
          {userEmail && (
            <span className="hidden xl:inline text-[var(--text-muted)] max-w-[100px] truncate">
              · {userEmail}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};
