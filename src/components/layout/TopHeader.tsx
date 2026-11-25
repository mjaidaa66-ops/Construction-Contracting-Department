import React, { useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Columns2,
  FileDown,
  FolderPlus,
  Globe,
  LogOut,
  Menu,
  Moon,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sun,
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
  firebaseUser?: User | null;
  userEmail?: string | null;
  syncState: CloudSyncState;
  onSyncNow: () => void;
  onSignInGoogle: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onOpenMobileNav: () => void;
  onOpenSearch: () => void;
  onOpenNotifications: () => void;
  alertsCount: number;
  onNavigateModule: (mod: ActiveModule) => void;
  onOpenExport: () => void;
}

const GoogleGlyph: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path
      fill="#4285F4"
      d="M23.745 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-8.97z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.3 0 6.08-1.09 8.1-2.96l-3.88-3.05c-1.08.72-2.45 1.16-4.22 1.16-3.24 0-5.99-2.19-6.97-5.13H1.03v3.14C3.04 21.14 7.21 24 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.03 14.02A7.2 7.2 0 0 1 4.65 12c0-.7.13-1.38.38-2.02V6.84H1.03A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.03 5.16l4-3.14z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.07 1.19 15.3 0 12 0 7.21 0 3.04 2.86 1.03 6.84l4 3.14c.98-2.94 3.73-5.23 6.97-5.23z"
    />
  </svg>
);

const MODULE_GROUP_MAP: Record<ActiveModule, keyof typeof UI_TEXT.ar.navGroups> = {
  dashboard: 'executive',
  command: 'executive',
  projects: 'portfolio',
  financials: 'portfolio',
  documents: 'portfolio',
  reports: 'portfolio',
  studio: 'engineering',
  bim: 'engineering',
  takeoff: 'engineering',
  gis: 'engineering',
  structural: 'engineering',
  government: 'system',
  accounts: 'system',
  settings: 'system',
};

const ROLE_LABELS: Record<Role, { ar: string; en: string }> = {
  admin: { ar: 'مدير تنفيذي', en: 'Admin' },
  engineer: { ar: 'مهندس مقيم', en: 'Engineer' },
  accountant: { ar: 'محاسب مالي', en: 'Accountant' },
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
  firebaseUser,
  userEmail,
  syncState,
  onSyncNow,
  onSignInGoogle,
  onSignOut,
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
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  const effectiveEmail = firebaseUser?.email || userEmail || null;
  const displayName = firebaseUser?.displayName || effectiveEmail || ROLE_LABELS[currentRole][lang];
  const avatarInitials = (displayName || 'B').trim().slice(0, 1).toUpperCase();

  const formattedDate = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-AE' : 'en-AE', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }).format(new Date());
    } catch {
      return '';
    }
  }, [lang]);

  const handleGoogleSignInClick = async () => {
    setSigningIn(true);
    try {
      await onSignInGoogle();
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 no-print px-3 lg:px-6 pt-3">
      <div className="h-16 px-3 sm:px-5 bunyan-glass rounded-2xl border border-[var(--border-hairline)] shadow-[var(--spatial-card-shadow)] flex items-center justify-between gap-3">
        {/* Start: Mobile Drawer Trigger + Breadcrumb + Active Project Selector */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileNav}
            className="lg:hidden min-w-[42px] min-h-[42px] flex items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)]"
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
            <span className="font-bold text-[var(--text-primary)] whitespace-nowrap">
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
                className="h-8 max-w-[155px] sm:max-w-[230px] truncate bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-xl px-2.5 text-xs font-semibold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/45"
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

        {/* End: Date, Role Pill, Search, Quick Actions, Alerts, Sync, Locale, Theme, Google Account */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {formattedDate && (
            <div className="hidden 2xl:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-[11px] font-medium text-[var(--text-muted)] whitespace-nowrap">
              <CalendarDays className="w-3.5 h-3.5 text-[var(--accent-cyan)] shrink-0" />
              <span>{formattedDate}</span>
            </div>
          )}

          {/* Active Role Tag */}
          <button
            type="button"
            onClick={() => onNavigateModule('accounts')}
            title={lang === 'ar' ? 'إدارة الصلاحيات والأدوار' : 'Manage Roles & Permissions'}
            className="hidden xl:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl border border-[#2563EB]/25 dark:border-[#38BDF8]/30 bg-[#2563EB]/8 dark:bg-[#38BDF8]/10 text-[11px] font-semibold text-[#1D4ED8] dark:text-[#38BDF8] hover:border-[var(--accent-cyan)] bunyan-transition whitespace-nowrap cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>{ROLE_LABELS[currentRole][lang]}</span>
          </button>

          {/* Global Command Search Trigger */}
          <button
            type="button"
            onClick={onOpenSearch}
            className="inline-flex items-center gap-2 h-8 px-2.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-cyan)]/50 bunyan-transition cursor-pointer whitespace-nowrap"
            title={lang === 'ar' ? 'بحث مركزي (Ctrl+K)' : 'Global Search (Ctrl+K)'}
          >
            <Search className="w-3.5 h-3.5 text-[var(--accent-cyan)]" />
            <span className="hidden md:inline">
              {lang === 'ar' ? 'بحث ذكي...' : 'Search...'}
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
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-gradient-to-l from-[#2563EB] to-[#0284C7] dark:from-[#3B82F6] dark:to-[#0284C7] text-white text-xs font-bold hover:brightness-110 shadow-sm bunyan-transition cursor-pointer whitespace-nowrap"
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
                <div className="absolute end-0 mt-2 w-60 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface-elevated)] backdrop-blur-xl shadow-2xl z-50 py-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      onNavigateModule('projects');
                      setQuickMenuOpen(false);
                    }}
                    className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-start text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                  >
                    <FolderPlus className="w-3.5 h-3.5 text-[var(--accent-cyan)]" />
                    <span>{lang === 'ar' ? 'إدارة المشاريع وإنشاء مشروع' : 'Manage & Create Project'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onNavigateModule('studio');
                      setQuickMenuOpen(false);
                    }}
                    className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-start text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                  >
                    <Columns2 className="w-3.5 h-3.5 text-[var(--accent-cyan)]" />
                    <span>{lang === 'ar' ? 'فتح استوديو 2D + 3D BIM' : 'Open 2D+3D BIM Studio'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onNavigateModule('reports');
                      setQuickMenuOpen(false);
                    }}
                    className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-start text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-[var(--accent-gold)]" />
                    <span>{lang === 'ar' ? 'فتح مركز التقارير والطباعة' : 'Open Reports & Print Center'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenExport();
                      setQuickMenuOpen(false);
                    }}
                    className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-start text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                  >
                    <FileDown className="w-3.5 h-3.5 text-[var(--accent-gold)]" />
                    <span>{lang === 'ar' ? 'تصدير مقايسة PDF / Excel' : 'Export Official PDF / Excel'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSyncNow();
                      setQuickMenuOpen(false);
                    }}
                    className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-start text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-[#00E5A8]" />
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
            className="relative h-8 w-8 flex items-center justify-center rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent-cyan)] hover:border-[var(--accent-cyan)]/40 bunyan-transition cursor-pointer shrink-0"
            aria-label={lang === 'ar' ? 'التنبيهات' : 'Notifications'}
          >
            <Bell className="w-4 h-4" />
            {alertsCount > 0 && (
              <span
                dir="ltr"
                className="absolute -top-1 -end-1 min-w-[16px] h-4 px-1 rounded-full bg-[#FF405C] text-white font-mono text-[9.5px] font-bold flex items-center justify-center shadow-[0_0_8px_rgba(255,64,92,0.5)]"
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
            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-cyan)]/45 bunyan-transition whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5 text-[var(--accent-cyan)]" />
            <span>{lang === 'ar' ? 'EN' : 'العربية'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            className="h-8 w-8 flex items-center justify-center rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-[var(--text-primary)] hover:border-[var(--accent-cyan)]/45 bunyan-transition shrink-0 cursor-pointer"
            aria-label={lang === 'ar' ? 'تبديل المظهر' : 'Toggle theme'}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-[#D6A64F]" />
            ) : (
              <Moon className="w-4 h-4 text-slate-700" />
            )}
          </button>

          {/* Google Sign-In / Signed-in Account Menu */}
          {firebaseUser ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setAccountMenuOpen((v) => !v)}
                aria-expanded={accountMenuOpen}
                className="inline-flex items-center gap-2 h-8 px-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent-cyan)]/50 bunyan-transition whitespace-nowrap shrink-0 cursor-pointer"
              >
                {firebaseUser.photoURL ? (
                  <img
                    src={firebaseUser.photoURL}
                    alt={displayName}
                    className="w-5 h-5 rounded-full object-cover border border-[var(--border-hairline)]"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="w-5 h-5 rounded-full bg-gradient-to-br from-[#38BDF8] to-[#2563EB] text-white text-[10px] font-bold flex items-center justify-center">
                    {avatarInitials}
                  </span>
                )}
                <span className="hidden sm:inline max-w-[110px] truncate">{displayName}</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
              </button>

              {accountMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setAccountMenuOpen(false)}
                    aria-hidden="true"
                  />
                  <div className="absolute end-0 mt-2 w-64 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface-elevated)] backdrop-blur-xl shadow-2xl z-50 py-2 text-xs">
                    <div className="px-3.5 py-2 border-b border-[var(--border-hairline)] space-y-1">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#00E5A8] shrink-0" />
                        <span className="font-bold text-[var(--text-primary)] truncate">
                          {firebaseUser.displayName || (lang === 'ar' ? 'حساب Google موثق' : 'Verified Google Account')}
                        </span>
                      </div>
                      <div dir="ltr" className="text-[11px] font-mono text-[var(--text-muted)] truncate">
                        {effectiveEmail}
                      </div>
                      <div className="text-[10.5px] text-emerald-600 dark:text-[#00E5A8] font-medium">
                        {lang === 'ar'
                          ? 'المزامنة التلقائية عبر Cloud Firestore نشطة'
                          : 'Auto Cloud Firestore sync enabled'}
                      </div>
                    </div>

                    <div className="py-1">
                      <button
                        type="button"
                        onClick={() => {
                          onSyncNow();
                          setAccountMenuOpen(false);
                        }}
                        className="w-full px-3.5 py-2 flex items-center gap-2.5 text-start text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-[var(--accent-cyan)]" />
                        <span>{lang === 'ar' ? 'مزامنة جميع البيانات الآن' : 'Sync All Data Now'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onNavigateModule('accounts');
                          setAccountMenuOpen(false);
                        }}
                        className="w-full px-3.5 py-2 flex items-center gap-2.5 text-start text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent-cyan)]" />
                        <span>{lang === 'ar' ? 'الحسابات والصلاحيات' : 'Accounts & Permissions'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onNavigateModule('settings');
                          setAccountMenuOpen(false);
                        }}
                        className="w-full px-3.5 py-2 flex items-center gap-2.5 text-start text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                      >
                        <Settings className="w-3.5 h-3.5 text-[var(--accent-gold)]" />
                        <span>{lang === 'ar' ? 'الإعدادات والدعم الفني' : 'Settings & Support'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAccountMenuOpen(false);
                          void onSignOut();
                        }}
                        className="w-full px-3.5 py-2 flex items-center gap-2.5 text-start text-rose-600 dark:text-[#FF405C] hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button
              type="button"
              disabled={signingIn}
              onClick={() => void handleGoogleSignInClick()}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-cyan)]/50 hover:bg-[var(--bg-surface-subtle)] disabled:opacity-60 bunyan-transition whitespace-nowrap shrink-0 cursor-pointer"
              title={lang === 'ar' ? 'تسجيل الدخول بحساب جوجل للمزامنة السحابية' : 'Sign in with Google for Cloud Firestore sync'}
            >
              <GoogleGlyph className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">
                {signingIn
                  ? lang === 'ar' ? 'جاري الدخول...' : 'Signing in...'
                  : lang === 'ar' ? 'دخول Google' : 'Google Sign-in'}
              </span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export const CommandHeader = TopHeader;

