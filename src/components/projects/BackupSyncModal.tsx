import React, { useState } from 'react';
import { Download, Upload, X, CheckCircle2, AlertCircle } from 'lucide-react';
import type { BackupData, Language } from '../../types/bunyan';

interface BackupSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  backupData: BackupData;
  onImportBackup: (data: BackupData) => void;
}

export const BackupSyncModal: React.FC<BackupSyncModalProps> = ({
  isOpen,
  onClose,
  lang,
  backupData,
  onImportBackup,
}) => {
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

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
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BackupData;
      if (!parsed.projects || !Array.isArray(parsed.projects)) {
        throw new Error('Invalid Bunyan BackupData schema');
      }
      onImportBackup(parsed);
      setStatusMsg(
        lang === 'ar'
          ? `تمت استعادة ${parsed.projects.length} مشروع بنجاح.`
          : `Restored ${parsed.projects.length} project(s) from backup.`
      );
      setErrorMsg(null);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to parse JSON backup file'
      );
      setStatusMsg(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {lang === 'ar' ? 'النسخ الاحتياطي والمزامنة JSON' : 'JSON Backup & Data Sync'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          {lang === 'ar'
            ? 'يتيح هذا الأرشيف تصدير كافة بيانات المشاريع، حدود الأراضي GIS، عناصر 5D BIM، ومقايسات الحصر الهندسي في ملف JSON موحد واستعادته في أي وقت.'
            : 'Export all projects, GIS boundaries, 5D BIM elements, takeoff measurements, and UAE rate library into a portable JSON archive or restore from an existing backup.'}
        </p>

        <div className="grid grid-cols-2 gap-3 text-xs font-mono tabular-nums p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
          <div>
            <span className="text-slate-500">{lang === 'ar' ? 'المشاريع:' : 'Projects:'}</span>{' '}
            <span className="font-bold text-slate-900 dark:text-white">{backupData.projects.length}</span>
          </div>
          <div>
            <span className="text-slate-500">{lang === 'ar' ? 'المعاملات:' : 'Transactions:'}</span>{' '}
            <span className="font-bold text-slate-900 dark:text-white">{backupData.transactions.length}</span>
          </div>
          <div>
            <span className="text-slate-500">{lang === 'ar' ? 'بنود الأسعار:' : 'Rate Library:'}</span>{' '}
            <span className="font-bold text-slate-900 dark:text-white">{backupData.rateLibrary.length}</span>
          </div>
          <div>
            <span className="text-slate-500">{lang === 'ar' ? 'الإصدار:' : 'Schema:'}</span>{' '}
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
          <button
            type="button"
            onClick={handleExportJson}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#B4863C] text-white text-xs font-semibold hover:bg-[#9E7330] transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>{lang === 'ar' ? 'تصدير JSON الكامل' : 'Export Full JSON'}</span>
          </button>

          <label className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors">
            <Upload className="w-4 h-4 text-[#B4863C]" />
            <span>{lang === 'ar' ? 'استيراد نسخة JSON' : 'Import JSON Backup'}</span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleImportFile}
              className="hidden"
            />
          </label>
        </div>
      </div>
    </div>
  );
};
