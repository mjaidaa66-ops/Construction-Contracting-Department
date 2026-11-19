import React from 'react';
import { Globe, Menu, Moon, Sun, UserCheck } from 'lucide-react';
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
  onNavigateSettings: () => void;
}

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
  onNavigateSettings,
}) => {
  const t = UI_TEXT[lang];
  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0];

  return (
    <header className="h-16 px-4 lg:px-6 bg-white/95 dark:bg-[#0B1120]/90 backdrop-blur-md border-b border-slate-200 dark:border-[#B4863C]/25 flex items-center justify-between gap-3 sticky top-0 z-30 no-print">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="hidden md:flex items-center pe-3 border-e border-slate-200 dark:border-[#B4863C]/25">
          <BunyanLogo lang={lang} size="sm" />
        </div>

        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
            {t.nav[activeModule]}
          </span>
          {activeProject && (
            <>
              <span className="text-slate-400" aria-hidden="true">/</span>
              <select
                value={activeProject.id}
                onChange={(e) => onSelectProject(e.target.value)}
                aria-label={lang === 'ar' ? 'اختر المشروع النشط' : 'Select active project'}
                className="max-w-[160px] sm:max-w-[240px] truncate bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#B4863C]"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {lang === 'ar' ? p.name : p.nameEn}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <CloudSyncStatusBadge syncState={syncState} lang={lang} onSyncNow={onSyncNow} />

        <button
          type="button"
          onClick={onToggleLang}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          <Globe className="w-3.5 h-3.5 text-[#B4863C]" />
          <span>{lang === 'ar' ? 'EN' : 'العربية'}</span>
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          aria-label={lang === 'ar' ? 'تبديل المظهر' : 'Toggle theme'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-[#D4A853]" /> : <Moon className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={onNavigateSettings}
          className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
        >
          <UserCheck className="w-3.5 h-3.5 text-[#B4863C]" />
          <span className="capitalize">{currentRole}</span>
          {userEmail && <span className="text-slate-500 dark:text-slate-400 max-w-[110px] truncate">· {userEmail}</span>}
        </button>
      </div>
    </header>
  );
};
