import React, { useState } from 'react';
import { AlertCircle, Archive, CheckCircle2, Download, Upload } from 'lucide-react';
import type { BackupData, Language } from '../../types/bunyan';
import { validateAndSanitizeBackupData } from '../../utils/backupValidator';
import { Button, Modal } from '../ui';

interface BackupSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  backupData: BackupData;
  onImportBackup: (data: BackupData) => void;
  canImport?: boolean;
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
      lang === 'ar'
        ? 'تم تصدير النسخة الاحتياطية الكاملة بنجاح.'
        : 'Full JSON backup exported successfully.'
    );
    setErrorMsg(null);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!canImport) {
      setErrorMsg(
        lang === 'ar'
          ? 'صلاحية الدور الحالي لا تسمح باستيراد النسخ الاحتياطية.'
          : 'Current role does not have permission to restore backups.'
      );
      setStatusMsg(null);
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const validation = validateAndSanitizeBackupData(parsed);
      if (validation.ok === false) {
        throw new Error(validation.error);
      }
      onImportBackup(validation.data);
      const warningNote =
        validation.warnings.length > 0
          ? lang === 'ar'
            ? ` (تم تجاوز ${validation.warnings.length} سجل غير مكتمل)`
            : ` (${validation.warnings.length} malformed record(s) skipped)`
          : '';
      setStatusMsg(
        lang === 'ar'
          ? `تمت استعادة ${validation.data.projects.length} مشروع بنجاح.${warningNote}`
          : `Restored ${validation.data.projects.length} project(s) from backup.${warningNote}`
      );
      setErrorMsg(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to parse JSON backup file');
      setStatusMsg(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-lg"
      icon={<Archive className="w-4 h-4" />}
      title={lang === 'ar' ? 'النسخ الاحتياطي والمزامنة JSON' : 'JSON Backup & Data Sync'}
    >
      <div className="p-5 space-y-5">
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          {lang === 'ar'
            ? 'يتيح هذا الأرشيف تصدير كافة بيانات المشاريع، حدود الأراضي GIS، عناصر 5D BIM، ومقايسات الحصر الهندسي في ملف JSON موحد واستعادته في أي وقت.'
            : 'Export all projects, GIS boundaries, 5D BIM elements, takeoff measurements, and UAE rate library into a portable JSON archive or restore from an existing backup.'}
        </p>

        <div className="grid grid-cols-2 gap-3 text-xs font-mono tabular-nums p-4 rounded-lg bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)]">
          <div>
            <span className="text-[var(--text-muted)]">{lang === 'ar' ? 'المشاريع:' : 'Projects:'}</span>{' '}
            <span className="font-bold text-[var(--text-primary)]">{backupData.projects.length}</span>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">{lang === 'ar' ? 'المعاملات:' : 'Transactions:'}</span>{' '}
            <span className="font-bold text-[var(--text-primary)]">{backupData.transactions.length}</span>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">{lang === 'ar' ? 'بنود الأسعار:' : 'Rate Library:'}</span>{' '}
            <span className="font-bold text-[var(--text-primary)]">{backupData.rateLibrary.length}</span>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">{lang === 'ar' ? 'الإصدار:' : 'Schema:'}</span>{' '}
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
          <div className="flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <Button className="flex-1" icon={<Download className="w-4 h-4" />} onClick={handleExportJson}>
            {lang === 'ar' ? 'تصدير JSON الكامل' : 'Export Full JSON'}
          </Button>

          <label className="flex-1 h-9 inline-flex items-center justify-center gap-2 px-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-xs font-semibold text-[var(--text-primary)] hover:border-[#B4863C] cursor-pointer bunyan-transition">
            <Upload className="w-4 h-4 text-[#B4863C]" />
            <span>{lang === 'ar' ? 'استيراد نسخة JSON' : 'Import JSON Backup'}</span>
            <input type="file" accept=".json,application/json" onChange={handleImportFile} className="hidden" />
          </label>
        </div>
      </div>
    </Modal>
  );
};
