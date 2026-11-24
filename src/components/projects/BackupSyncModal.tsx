import React, { useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Download,
  GitMerge,
  RefreshCw,
  Upload,
} from 'lucide-react';
import type { BackupData, Language } from '../../types/bunyan';
import { validateAndSanitizeBackupData } from '../../utils/backupValidator';
import {
  analyzeBackupMergePreview,
  type BackupMergePreview,
} from '../../utils/projectHelpers';
import { Button, ErrorState, Modal } from '../ui';

interface BackupSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  backupData: BackupData;
  onImportBackup: (data: BackupData, mode?: 'merge' | 'replace') => void;
  canImport?: boolean;
}

interface StagedImportState {
  fileName: string;
  data: BackupData;
  warnings: string[];
  preview: BackupMergePreview;
}

export const BackupSyncModal: React.FC<BackupSyncModalProps> = ({
  isOpen,
  onClose,
  lang,
  backupData,
  onImportBackup,
  canImport = true,
}) => {
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [staged, setStaged] = useState<StagedImportState | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');

  const isAr = lang === 'ar';

  const handleExportJson = () => {
    const json = JSON.stringify(backupData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bunyan_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMsg(
      isAr
        ? 'تم تصدير النسخة الاحتياطية الكاملة بنجاح.'
        : 'Full JSON backup exported successfully.'
    );
    setErrorMsg(null);
  };

  const handleSelectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!canImport) {
      setErrorMsg(
        isAr
          ? 'صلاحية الدور الحالي لا تسمح باستيراد النسخ الاحتياطية.'
          : 'Current role does not have permission to restore backups.'
      );
      setStatusMsg(null);
      setStaged(null);
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const validation = validateAndSanitizeBackupData(parsed);
      if (validation.ok === false) {
        throw new Error(validation.error);
      }

      const preview = analyzeBackupMergePreview(backupData.projects, validation.data);
      setStaged({
        fileName: file.name,
        data: validation.data,
        warnings: validation.warnings,
        preview,
      });
      setStatusMsg(null);
      setErrorMsg(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to parse JSON backup file');
      setStatusMsg(null);
      setStaged(null);
    }
  };

  const handleConfirmImport = () => {
    if (!staged) return;
    onImportBackup(staged.data, importMode);
    const warningNote =
      staged.warnings.length > 0
        ? isAr
          ? ` (تم تجاوز ${staged.warnings.length} سجل غير مكتمل)`
          : ` (${staged.warnings.length} malformed record(s) skipped)`
        : '';
    setStatusMsg(
      isAr
        ? `تمت استعادة ${staged.data.projects.length} مشروع بنجاح (${importMode === 'merge' ? 'دمج ذكي' : 'استبدال كامل'}).${warningNote}`
        : `Restored ${staged.data.projects.length} project(s) via ${importMode === 'merge' ? 'Smart Merge' : 'Full Replace'}.${warningNote}`
    );
    setErrorMsg(null);
    setStaged(null);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-xl"
      icon={<Archive className="w-4 h-4" />}
      title={isAr ? 'النسخ الاحتياطي والمزامنة JSON' : 'JSON Backup & Data Sync'}
    >
      <div className="p-5 space-y-5">
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          {isAr
            ? 'يتيح هذا الأرشيف تصدير كافة بيانات المشاريع، حدود الأراضي GIS، عناصر 5D BIM، ومقايسات الحصر الهندسي في ملف JSON موحد واستعادته مع معاينة الدمج أو الاستبدال.'
            : 'Export all projects, GIS boundaries, 5D BIM elements, takeoff measurements, and UAE rate library into a portable JSON archive or restore with merge/replace preview.'}
        </p>

        <div className="grid grid-cols-2 gap-3 text-xs font-mono tabular-nums p-4 rounded-lg bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)]">
          <div>
            <span className="text-[var(--text-muted)]">{isAr ? 'المشاريع:' : 'Projects:'}</span>{' '}
            <span className="font-bold text-[var(--text-primary)]">{backupData.projects.length}</span>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">{isAr ? 'المعاملات:' : 'Transactions:'}</span>{' '}
            <span className="font-bold text-[var(--text-primary)]">{backupData.transactions.length}</span>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">{isAr ? 'بنود الأسعار:' : 'Rate Library:'}</span>{' '}
            <span className="font-bold text-[var(--text-primary)]">{backupData.rateLibrary.length}</span>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">{isAr ? 'الإصدار:' : 'Schema:'}</span>{' '}
            <span className="font-bold text-[#B4863C]">{backupData.version}</span>
          </div>
        </div>

        {statusMsg && (
          <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}

        {errorMsg && (
          <ErrorState
            title={isAr ? 'فشل التحقق من ملف النسخة الاحتياطية' : 'Backup Validation Failed'}
            message={errorMsg}
          />
        )}

        {staged && (
          <div className="p-4 rounded-xl border border-[#B4863C]/40 bg-[#B4863C]/5 space-y-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="font-bold text-[var(--text-primary)] truncate">
                {isAr ? `معاينة الاستيراد: ${staged.fileName}` : `Import Preview: ${staged.fileName}`}
              </div>
              <span className="font-mono text-[11px] text-[#B4863C] shrink-0">
                {staged.preview.totalIncomingProjects} {isAr ? 'مشروع' : 'projects'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono tabular-nums text-[11px]">
              <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-hairline)]">
                <div className="font-sans text-[var(--text-muted)]">{isAr ? 'مشاريع جديدة' : 'New Projects'}</div>
                <div className="font-bold text-emerald-600 dark:text-emerald-400">{staged.preview.newProjectsCount}</div>
              </div>
              <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-hairline)]">
                <div className="font-sans text-[var(--text-muted)]">{isAr ? 'تحديث مطابق' : 'Updates by ID'}</div>
                <div className="font-bold text-[var(--text-primary)]">{staged.preview.matchedByIdCount}</div>
              </div>
              <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-hairline)]">
                <div className="font-sans text-[var(--text-muted)]">{isAr ? 'بنود الأسعار / معاملات' : 'Rates / Tx'}</div>
                <div className="font-bold text-[var(--text-primary)]">
                  {staged.preview.ratesCount} / {staged.preview.transactionsCount}
                </div>
              </div>
            </div>

            {(staged.preview.codeCollisionCount > 0 || staged.warnings.length > 0) && (
              <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 space-y-1 text-[11px]">
                {staged.preview.codeCollisionCount > 0 && (
                  <div className="flex items-center gap-1.5 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {isAr
                        ? `تشابه أكواد مشاريع (${staged.preview.collidingCodes.join(', ')}) بمعرّفات مختلفة.`
                        : `Code overlap detected (${staged.preview.collidingCodes.join(', ')}) under different IDs.`}
                    </span>
                  </div>
                )}
                {staged.warnings.length > 0 && (
                  <div>
                    {isAr
                      ? `ملاحظة: سيتم تجاوز ${staged.warnings.length} سجل غير مكتمل أثناء الاستيراد.`
                      : `Note: ${staged.warnings.length} malformed record(s) were sanitized/skipped.`}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setImportMode('merge')}
                className={`p-2.5 rounded-lg border text-start transition-colors cursor-pointer ${
                  importMode === 'merge'
                    ? 'border-[#B4863C] bg-[#B4863C]/12 text-[var(--text-primary)]'
                    : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  <GitMerge className="w-3.5 h-3.5 text-[#B4863C]" />
                  <span>{isAr ? 'دمج مع المشاريع الحالية' : 'Merge with Existing'}</span>
                </div>
                <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                  {isAr ? 'إضافة الجديد وتحديث المطابق فقط' : 'Add new & update matching IDs'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setImportMode('replace')}
                className={`p-2.5 rounded-lg border text-start transition-colors cursor-pointer ${
                  importMode === 'replace'
                    ? 'border-rose-500 bg-rose-500/10 text-[var(--text-primary)]'
                    : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  <RefreshCw className="w-3.5 h-3.5 text-rose-500" />
                  <span>{isAr ? 'استبدال كامل للمحفظة' : 'Full Portfolio Replace'}</span>
                </div>
                <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                  {isAr ? 'استبدال القائمة بالنسخة المستوردة' : 'Overwrite workspace with backup'}
                </div>
              </button>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setStaged(null)}>
                {isAr ? 'إلغاء المعاينة' : 'Cancel Preview'}
              </Button>
              <Button variant="primary" size="sm" onClick={handleConfirmImport}>
                {isAr ? 'تأكيد الاستيراد' : 'Confirm Restore / Import'}
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <Button className="flex-1" icon={<Download className="w-4 h-4" />} onClick={handleExportJson}>
            {isAr ? 'تصدير JSON الكامل' : 'Export Full JSON'}
          </Button>

          <label className="flex-1 h-9 inline-flex items-center justify-center gap-2 px-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-xs font-semibold text-[var(--text-primary)] hover:border-[#B4863C] cursor-pointer bunyan-transition">
            <Upload className="w-4 h-4 text-[#B4863C]" />
            <span>{isAr ? 'اختيار ملف JSON' : 'Choose JSON File'}</span>
            <input type="file" accept=".json,application/json" onChange={handleSelectFile} className="hidden" />
          </label>
        </div>
      </div>
    </Modal>
  );
};
