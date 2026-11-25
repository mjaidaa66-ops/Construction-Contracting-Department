import React, { useEffect, useMemo, useState } from 'react';
import {
  Compass,
  FileSpreadsheet,
  FolderKanban,
  Landmark,
  Search,
  Wallet,
} from 'lucide-react';
import type { GovernmentTransaction, Language, Project } from '../../types/bunyan';
import { UI_TEXT } from '../../utils/i18n';
import type { ActiveModule } from './Sidebar';
import { Modal } from '../ui';

interface GlobalCommandModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  projects: Project[];
  transactions: GovernmentTransaction[];
  onSelectProject: (id: string) => void;
  onNavigate: (mod: ActiveModule) => void;
}

export const GlobalCommandModal: React.FC<GlobalCommandModalProps> = ({
  isOpen,
  onClose,
  lang,
  projects,
  transactions,
  onSelectProject,
  onNavigate,
}) => {
  const [query, setQuery] = useState('');
  const t = UI_TEXT[lang];

  useEffect(() => {
    if (isOpen) setQuery('');
  }, [isOpen]);

  const q = query.trim().toLowerCase();

  const matchedProjects = useMemo(() => {
    if (!q) return projects.slice(0, 6);
    return projects
      .filter(
        (p) =>
          p.code.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.nameEn.toLowerCase().includes(q) ||
          p.gisData.plotNumber.toLowerCase().includes(q) ||
          p.gisData.sectorName.toLowerCase().includes(q) ||
          p.ownerName.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [projects, q]);

  const matchedTransactions = useMemo(() => {
    if (!q) return transactions.slice(0, 4);
    return transactions
      .filter(
        (tx) =>
          tx.transactionNumber.toLowerCase().includes(q) ||
          tx.serviceName.toLowerCase().includes(q) ||
          (tx.serviceNameEn || '').toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [transactions, q]);

  const modulesList: ActiveModule[] = [
    'dashboard',
    'command',
    'projects',
    'financials',
    'documents',
    'reports',
    'studio',
    'bim',
    'takeoff',
    'gis',
    'structural',
    'government',
    'accounts',
    'settings',
  ];

  const matchedModules = useMemo(() => {
    if (!q) return modulesList.slice(0, 6);
    return modulesList.filter((m) => t.nav[m].toLowerCase().includes(q) || m.includes(q));
  }, [q, t]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      icon={<Search className="w-4 h-4" />}
      title={lang === 'ar' ? 'البحث المركزي والتنقل السريع' : 'Global Command Search'}
      subtitle={
        lang === 'ar'
          ? `ابحث في ${projects.length} مشروعاً، قطع الأراضي، المعاملات الحكومية، أو انتقل لأي وحدة`
          : `Search across ${projects.length} projects, GIS plots, municipal transactions, or workspace modules`
      }
    >
      <div className="p-4 space-y-4">
        <div className="relative">
          <Search className="w-4 h-4 text-[var(--accent-cyan)] absolute top-1/2 -translate-y-1/2 start-3" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              lang === 'ar'
                ? 'اكتب كود المشروع، رقم قطعة الأرض، اسم المالك، أو رقم المعاملة...'
                : 'Type project code, plot number, owner, or transaction ref...'
            }
            className="w-full h-10 ps-9 pe-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/45"
          />
        </div>

        {/* Modules */}
        {matchedModules.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              {lang === 'ar' ? 'وحدات المنصة' : 'Workspace Modules'}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {matchedModules.map((mod) => (
                <button
                  key={mod}
                  type="button"
                  onClick={() => {
                    onNavigate(mod);
                    onClose();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] hover:border-[var(--accent-cyan)]/50 text-xs font-medium text-[var(--text-primary)] cursor-pointer bunyan-transition"
                >
                  {mod === 'financials' ? (
                    <Wallet className="w-3.5 h-3.5 text-[var(--accent-cyan)]" />
                  ) : mod === 'gis' ? (
                    <Compass className="w-3.5 h-3.5 text-[var(--accent-cyan)]" />
                  ) : (
                    <FileSpreadsheet className="w-3.5 h-3.5 text-[var(--accent-cyan)]" />
                  )}
                  <span>{t.nav[mod]}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Projects */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {lang === 'ar' ? `المشاريع وقطع الأراضي (${matchedProjects.length})` : `Projects & Plots (${matchedProjects.length})`}
          </div>
          {matchedProjects.length === 0 ? (
            <div className="text-xs text-[var(--text-muted)] py-3">
              {lang === 'ar' ? 'لا توجد مشاريع مطابقة.' : 'No matching projects.'}
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-hairline)] rounded-xl border border-[var(--border-hairline)] overflow-hidden">
              {matchedProjects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelectProject(p.id);
                    onNavigate('projects');
                    onClose();
                  }}
                  className="w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-start hover:bg-[var(--bg-surface-subtle)] cursor-pointer bunyan-transition"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FolderKanban className="w-4 h-4 text-[var(--accent-cyan)] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                        {lang === 'ar' ? p.name : p.nameEn}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] truncate">
                        <span className="font-mono">{p.code}</span> ·{' '}
                        {lang === 'ar' ? 'قطعة' : 'Plot'} {p.gisData.plotNumber} · {p.gisData.sectorName}
                      </div>
                    </div>
                  </div>
                  <span dir="ltr" className="text-[11px] font-mono tabular-nums text-[var(--accent-cyan)] shrink-0">
                    {p.actualProgress}%
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Municipal Transactions */}
        {matchedTransactions.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              {lang === 'ar' ? 'المعاملات الحكومية' : 'Municipal Clearances'}
            </div>
            <div className="divide-y divide-[var(--border-hairline)] rounded-xl border border-[var(--border-hairline)] overflow-hidden">
              {matchedTransactions.map((tx) => (
                <button
                  key={tx.id}
                  type="button"
                  onClick={() => {
                    onSelectProject(tx.projectId);
                    onNavigate('government');
                    onClose();
                  }}
                  className="w-full px-3.5 py-2 flex items-center justify-between gap-3 text-start hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Landmark className="w-3.5 h-3.5 text-[var(--accent-gold)] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                        {lang === 'ar' ? tx.serviceName : tx.serviceNameEn || tx.serviceName}
                      </div>
                      <div className="text-[11px] font-mono text-[var(--text-muted)]">
                        {tx.transactionNumber} · {tx.lastUpdatedDate}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
