import React from 'react';
import {
  Columns2,
  Compass,
  Box,
  FileSpreadsheet,
  FolderKanban,
  Landmark,
  LayoutDashboard,
  Settings,
  X,
} from 'lucide-react';
import type { Language } from '../../types/bunyan';
import { UI_TEXT } from '../../utils/i18n';
import { BunyanLogo } from '../common/BunyanLogo';

export type ActiveModule =
  | 'command'
  | 'projects'
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
  mobileOpen: boolean;
  onCloseMobile: () => void;
  companyName: string;
}

const NAV_ITEMS: Array<{ id: ActiveModule; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'command', icon: LayoutDashboard },
  { id: 'projects', icon: FolderKanban },
  { id: 'studio', icon: Columns2 },
  { id: 'bim', icon: Box },
  { id: 'takeoff', icon: FileSpreadsheet },
  { id: 'gis', icon: Compass },
  { id: 'government', icon: Landmark },
  { id: 'settings', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  onSelectModule,
  lang,
  mobileOpen,
  onCloseMobile,
  companyName,
}) => {
  const t = UI_TEXT[lang];

  const navContent = (
    <div className="flex flex-col h-full bg-white dark:bg-[#0B1120] border-e border-slate-200 dark:border-[#B4863C]/25">
      <div className="flex items-center justify-between px-5 h-16 border-b border-slate-200 dark:border-[#B4863C]/25">
        <div className="flex items-center gap-3 min-w-0">
          <BunyanLogo iconOnly size="sm" />
          <div className="min-w-0">
            <div className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate">
              {t.appName}
            </div>
            <div className="text-[11px] font-mono text-[#B4863C] dark:text-[#D4AF37] truncate">
              {lang === 'ar' ? '5D BIM · بلدية الشارقة' : '5D BIM · SHARJAH'}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Close navigation"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeModule === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectModule(item.id);
                onCloseMobile();
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'bg-[#B4863C] text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{t.nav[item.id]}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 space-y-1">
        <div className="font-medium text-slate-700 dark:text-slate-200 truncate">
          {companyName}
        </div>
        <div>
          {lang === 'ar'
            ? 'معايير بلدية الشارقة · ضريبة 5%'
            : 'Sharjah Municipality · UAE VAT 5%'}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0 no-print">
        {navContent}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10">{navContent}</div>
        </div>
      )}
    </>
  );
};
