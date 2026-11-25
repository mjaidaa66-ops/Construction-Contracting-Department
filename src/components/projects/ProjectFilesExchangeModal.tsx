import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckSquare,
  Download,
  Eye,
  FileArchive,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  FolderSync,
  Loader2,
  Printer,
  Square,
  Trash2,
  Upload,
} from 'lucide-react';
import type { CompanyProfile, Language, Project, ProjectDocument } from '../../types/bunyan';
import { downloadChunkedDocument, ensureProjectExistsInCloud, uploadChunkedDocument } from '../../services/firestoreStorage';
import { cacheSessionBinary, getCachedSessionBinary } from '../../services/cloudSyncService';
import {
  buildProjectDocumentsIndexCsv,
  buildProjectFilesBundle,
  exportProjectDocumentsToExcel,
  inferDocCategoryFromFilename,
  inferMimeTypeFromFilename,
  isSafeExportBinaryDataUrl,
  parseProjectFilesBundle,
} from '../../utils/projectFilesEngine';
import { BUNYAN_OFFICIAL_LOGO_SRC } from '../common/BunyanLogo';
import { Button, EmptyState, Modal, Select, useToast } from '../ui';

interface ProjectFilesExchangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  company: CompanyProfile;
  lang: Language;
  cloudUid?: string | null;
  canEditFiles: boolean;
  canExportFiles: boolean;
  canPrintFiles: boolean;
  onSaveProject: (project: Project) => void;
  onPreviewDocument: (docItem: ProjectDocument) => void;
  onLogFileAction?: (action: 'print' | 'xlsx' | 'csv' | 'archive', rowCount: number, titleAr: string, titleEn: string) => void;
}

export const ProjectFilesExchangeModal: React.FC<ProjectFilesExchangeModalProps> = ({
  isOpen,
  onClose,
  project,
  company,
  lang,
  cloudUid,
  canEditFiles,
  canExportFiles,
  canPrintFiles,
  onSaveProject,
  onPreviewDocument,
  onLogFileAction,
}) => {
  const isAr = lang === 'ar';
  const { pushToast } = useToast();
  const [tab, setTab] = useState<'manage' | 'import' | 'export'>('manage');
  const [importCategory, setImportCategory] = useState<'auto' | ProjectDocument['category']>('auto');
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(project.documents.map((d) => d.id))
  );

  useEffect(() => {
    setSelectedIds(new Set(project.documents.map((d) => d.id)));
  }, [project.id, project.documents]);

  useEffect(() => {
    const onAfterPrint = () => {
      document.body.classList.remove('bunyan-printing-project-files');
    };
    window.addEventListener('afterprint', onAfterPrint);
    return () => {
      window.removeEventListener('afterprint', onAfterPrint);
      onAfterPrint();
    };
  }, []);

  const selectedDocuments = useMemo(
    () => project.documents.filter((d) => selectedIds.has(d.id)),
    [project.documents, selectedIds]
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === project.documents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(project.documents.map((d) => d.id)));
    }
  };

  const resolveDocumentDataUrl = async (docItem: ProjectDocument): Promise<string | undefined> => {
    if (docItem.localDataUrl) return docItem.localDataUrl;
    if (docItem.manifestId) {
      const byManifest = await getCachedSessionBinary(docItem.manifestId);
      if (byManifest) return byManifest;
    }
    const byId = await getCachedSessionBinary(docItem.id);
    if (byId) return byId;
    if (docItem.manifestId) {
      try {
        const res = await downloadChunkedDocument(docItem.manifestId);
        if (res?.dataUrl) {
          await cacheSessionBinary(docItem.manifestId, res.dataUrl);
          await cacheSessionBinary(docItem.id, res.dataUrl);
          return res.dataUrl;
        }
      } catch {
        return undefined;
      }
    }
    return undefined;
  };

  const handleImportRawFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    if (!canEditFiles) {
      pushToast(
        isAr ? 'استيراد ملفات المشروع متاح للمدير والمهندس فقط.' : 'File import requires Admin or Engineer role.',
        'error'
      );
      return;
    }

    if (!cloudUid) {
      pushToast(
        isAr
          ? 'يتطلب استيراد الملفات تسجيل الدخول بحساب Google الموثق والاتصال بالسحابة.'
          : 'Verified cloud sign-in is required before importing files (Fail-Closed).',
        'error'
      );
      return;
    }

    setBusy(true);
    try {
      const createdDocs: ProjectDocument[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const base64DataUrl: string = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
          reader.readAsDataURL(file);
        });

        const mimeType = inferMimeTypeFromFilename(file.name, file.type);
        const category =
          importCategory === 'auto' ? inferDocCategoryFromFilename(file.name) : importCategory;

        await ensureProjectExistsInCloud(project, cloudUid);
        const manifest = await uploadChunkedDocument({
          ownerId: cloudUid,
          projectId: project.id,
          fileName: file.name,
          mimeType,
          base64DataUrl,
        });
        const manifestId = manifest.id;

        const docId = `doc-${Date.now()}-${i}`;
        await cacheSessionBinary(docId, base64DataUrl);
        await cacheSessionBinary(manifestId, base64DataUrl);

        createdDocs.push({
          id: docId,
          name: file.name,
          category,
          mimeType,
          sizeBytes: file.size,
          uploadedAt: new Date().toISOString().slice(0, 10),
          manifestId,
          localDataUrl: base64DataUrl,
        });
      }

      onSaveProject({
        ...project,
        documents: [...createdDocs, ...project.documents],
      });
      pushToast(
        isAr
          ? `تم استيراد ${createdDocs.length} ملف إلى أرشيف ${project.code}`
          : `Imported ${createdDocs.length} file(s) into ${project.code}`,
        'success'
      );
      setTab('manage');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'File import failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleImportBundleJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!canEditFiles) {
      pushToast(
        isAr ? 'استيراد حزمة الملفات متاح للمدير والمهندس فقط.' : 'Bundle import requires Admin or Engineer role.',
        'error'
      );
      return;
    }

    if (!cloudUid) {
      pushToast(
        isAr
          ? 'يتطلب استيراد الحزمة تسجيل الدخول بحساب Google الموثق والاتصال بالسحابة.'
          : 'Verified cloud sign-in is required before importing bundles (Fail-Closed).',
        'error'
      );
      return;
    }

    setBusy(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const result = parseProjectFilesBundle(parsed);
      if (result.ok === false) {
        throw new Error(result.error);
      }

      const importedDocs: ProjectDocument[] = [];
      for (let i = 0; i < result.bundle.documents.length; i++) {
        const entry = result.bundle.documents[i];
        const newId = `doc-imp-${Date.now()}-${i}`;
        let manifestId: string | undefined;

        if (entry.dataUrl) {
          await cacheSessionBinary(newId, entry.dataUrl);
          await ensureProjectExistsInCloud(project, cloudUid);
          const manifest = await uploadChunkedDocument({
            ownerId: cloudUid,
            projectId: project.id,
            fileName: entry.name,
            mimeType: entry.mimeType,
            base64DataUrl: entry.dataUrl,
          });
          manifestId = manifest.id;
          await cacheSessionBinary(manifestId, entry.dataUrl);
        }

        importedDocs.push({
          id: newId,
          name: entry.name,
          category: entry.category,
          mimeType: entry.mimeType,
          sizeBytes: entry.sizeBytes,
          uploadedAt: entry.uploadedAt,
          manifestId,
          localDataUrl: entry.dataUrl,
        });
      }

      onSaveProject({
        ...project,
        documents: [...importedDocs, ...project.documents],
      });
      pushToast(
        isAr
          ? `تم استيراد ${importedDocs.length} مستند من الحزمة بنجاح`
          : `Imported ${importedDocs.length} document(s) from bundle`,
        'success'
      );
      setTab('manage');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Bundle import failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleExportBundle = async () => {
    if (!canExportFiles) {
      pushToast(isAr ? 'التصدير غير مصرح به لهذا الدور.' : 'Export permission denied.', 'error');
      return;
    }
    const targetDocs = selectedDocuments.length > 0 ? selectedDocuments : project.documents;
    if (targetDocs.length === 0) return;

    setBusy(true);
    try {
      const binaries: Record<string, string> = {};
      for (const docItem of targetDocs) {
        const resolved = await resolveDocumentDataUrl(docItem);
        if (resolved && isSafeExportBinaryDataUrl(resolved)) {
          binaries[docItem.id] = resolved;
        }
      }
      const bundle = buildProjectFilesBundle({
        project,
        documents: targetDocs,
        binariesByDocId: binaries,
      });
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeCode = (project.code || project.id).replace(/[^a-zA-Z0-9_-]/g, '_');
      a.href = url;
      a.download = `Bunyan_Files_Bundle_${safeCode}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onLogFileAction?.(
        'archive',
        targetDocs.length,
        `حزمة ملفات ومستندات المشروع ${project.code}`,
        `Project Files Bundle ${project.code}`
      );
      pushToast(
        isAr
          ? `تم تصدير حزمة ${targetDocs.length} ملف بنجاح`
          : `Exported bundle with ${targetDocs.length} document(s)`,
        'success'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleExportSingleFile = async (docItem: ProjectDocument) => {
    if (!canExportFiles) return;
    const resolved = await resolveDocumentDataUrl(docItem);
    if (!resolved || !isSafeExportBinaryDataUrl(resolved)) {
      pushToast(
        isAr
          ? 'تم فتح الوثيقة الرسمية داخل المنصة — يمكنك الطباعة أو التصدير كـ PDF مباشرة.'
          : 'Opened official record inline — you can Print or Export PDF directly.',
        'info'
      );
      onPreviewDocument(docItem);
      return;
    }
    const a = document.createElement('a');
    a.href = resolved;
    a.download = docItem.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleExportExcelRegister = () => {
    if (!canExportFiles) return;
    const targetDocs = selectedDocuments.length > 0 ? selectedDocuments : project.documents;
    exportProjectDocumentsToExcel(project, targetDocs, company, lang);
    onLogFileAction?.(
      'xlsx',
      targetDocs.length,
      `سجل مستندات المشروع ${project.code}`,
      `Documents Register ${project.code}`
    );
    pushToast(isAr ? 'تم تصدير سجل المستندات إلى Excel' : 'Document register exported to Excel', 'success');
  };

  const handleExportCsvRegister = () => {
    if (!canExportFiles) return;
    const targetDocs = selectedDocuments.length > 0 ? selectedDocuments : project.documents;
    const csv = buildProjectDocumentsIndexCsv(project, targetDocs, lang);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeCode = (project.code || project.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    a.href = url;
    a.download = `Bunyan_Files_Register_${safeCode}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onLogFileAction?.(
      'csv',
      targetDocs.length,
      `سجل مستندات المشروع ${project.code}`,
      `Documents Register ${project.code}`
    );
    pushToast(isAr ? 'تم تصدير سجل المستندات إلى CSV' : 'Document register exported to CSV', 'success');
  };

  const handlePrintRegister = () => {
    if (!canPrintFiles) {
      pushToast(isAr ? 'الطباعة غير مصرح بها لهذا الدور.' : 'Print permission denied.', 'error');
      return;
    }
    document.body.classList.add('bunyan-printing-project-files');
    onLogFileAction?.(
      'print',
      project.documents.length,
      `سجل ملفات ومستندات المشروع ${project.code}`,
      `Documents Register ${project.code}`
    );
    window.print();
  };

  const handleDeleteDoc = (docId: string) => {
    if (!canEditFiles) return;
    onSaveProject({
      ...project,
      documents: project.documents.filter((d) => d.id !== docId),
    });
    pushToast(isAr ? 'تمت إزالة المستند من أرشيف المشروع' : 'Document removed from project', 'info');
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        maxWidthClass="max-w-4xl"
        icon={<FolderSync className="w-4 h-4" />}
        title={isAr ? `إدارة واستيراد وتصدير ملفات المشروع — ${project.code}` : `Project Files & Documents Manager — ${project.code}`}
        subtitle={isAr ? project.name : project.nameEn}
      >
        <div className="p-5 space-y-5 no-print">
          {/* Sub-tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-hairline)] pb-3">
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'manage' as const, ar: `عرض وإدارة الملفات (${project.documents.length})`, en: `View & Manage (${project.documents.length})`, icon: Eye },
                { id: 'import' as const, ar: 'استيراد ملفات وحزم', en: 'Import Files & Bundles', icon: Upload },
                { id: 'export' as const, ar: 'تصدير وطباعة السجل', en: 'Export & Print Register', icon: Download },
              ].map((t) => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                      active
                        ? 'bg-[#B4863C] text-white'
                        : 'bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-hairline)]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{isAr ? t.ar : t.en}</span>
                  </button>
                );
              })}
            </div>

            {canPrintFiles && (
              <Button size="xs" variant="outline" icon={<Printer className="w-3.5 h-3.5" />} onClick={handlePrintRegister}>
                {isAr ? 'طباعة سجل الملفات' : 'Print Register'}
              </Button>
            )}
          </div>

          {/* TAB 1: VIEW & MANAGE FILES */}
          {tab === 'manage' && (
            <div className="space-y-3">
              {project.documents.length === 0 ? (
                <EmptyState
                  title={isAr ? 'لا توجد ملفات في أرشيف هذا المشروع' : 'No Project Documents Yet'}
                  description={
                    isAr
                      ? 'انتقل إلى تبويب "استيراد ملفات وحزم" لإضافة ملفات PDF أو مخططات أو عقود وعرضها مباشرة.'
                      : 'Switch to Import Files to attach PDFs, CAD drawings, images, or contract bundles.'
                  }
                  actionLabel={isAr ? 'استيراد ملفات الآن' : 'Import Files'}
                  onAction={() => setTab('import')}
                />
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs px-1">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="inline-flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      {selectedIds.size === project.documents.length ? (
                        <CheckSquare className="w-4 h-4 text-[#B4863C]" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                      <span>
                        {isAr
                          ? `تحديد الكل (${selectedIds.size} / ${project.documents.length})`
                          : `Select All (${selectedIds.size} / ${project.documents.length})`}
                      </span>
                    </button>

                    {canExportFiles && (
                      <Button
                        size="xs"
                        disabled={busy || selectedDocuments.length === 0}
                        icon={busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileArchive className="w-3.5 h-3.5" />}
                        onClick={handleExportBundle}
                      >
                        {isAr ? `تصدير المحدد كحزمة (${selectedDocuments.length})` : `Export Selected (${selectedDocuments.length})`}
                      </Button>
                    )}
                  </div>

                  <div className="divide-y divide-[var(--border-hairline)] rounded-xl border border-[var(--border-hairline)] max-h-[380px] overflow-y-auto">
                    {project.documents.map((d) => {
                      const checked = selectedIds.has(d.id);
                      return (
                        <div
                          key={d.id}
                          className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-[var(--bg-surface-subtle)]"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => toggleSelect(d.id)}
                              className="shrink-0 cursor-pointer text-[var(--text-muted)]"
                              aria-label="Select document"
                            >
                              {checked ? (
                                <CheckSquare className="w-4 h-4 text-[#B4863C]" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                            <FileText className="w-4 h-4 text-[#B4863C] shrink-0" />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                                {d.name}
                              </div>
                              <div className="text-[11px] font-mono tabular-nums text-[var(--text-muted)] truncate">
                                {d.category} · {(d.sizeBytes / 1024).toFixed(1)} KB · {d.uploadedAt}
                                {d.manifestId ? ' · Cloud Chunked' : d.localDataUrl ? ' · Inline Ready' : ' · Official Record'}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              size="xs"
                              variant="primary"
                              icon={<Eye className="w-3.5 h-3.5" />}
                              onClick={() => onPreviewDocument(d)}
                            >
                              {isAr ? 'فتح وعرض' : 'Open Inline'}
                            </Button>
                            {canExportFiles && (
                              <Button
                                size="xs"
                                variant="outline"
                                icon={<Download className="w-3.5 h-3.5" />}
                                onClick={() => void handleExportSingleFile(d)}
                              >
                                {isAr ? 'تصدير' : 'Export'}
                              </Button>
                            )}
                            {canEditFiles && (
                              <button
                                type="button"
                                onClick={() => handleDeleteDoc(d.id)}
                                className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                                title={isAr ? 'حذف' : 'Delete'}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 2: IMPORT FILES & BUNDLES */}
          {tab === 'import' && (
            <div className="space-y-4">
              {!canEditFiles ? (
                <div className="p-4 rounded-lg border border-amber-500/35 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-300">
                  {isAr
                    ? 'صلاحية الدور الحالي لا تسمح باستيراد الملفات. يتطلب دور المدير أو المهندس.'
                    : 'Importing files requires Admin or Engineer permissions.'}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                        {isAr ? 'تصنيف المستندات المستوردة' : 'Imported Document Category'}
                      </label>
                      <Select
                        value={importCategory}
                        onChange={(e) =>
                          setImportCategory(e.target.value as 'auto' | ProjectDocument['category'])
                        }
                      >
                        <option value="auto">{isAr ? 'تحديد تلقائي من اسم وصيغة الملف' : 'Auto-detect from filename'}</option>
                        <option value="permit">{isAr ? 'رخص البناء' : 'Permits'}</option>
                        <option value="contract">{isAr ? 'عقود المقاولة' : 'Contracts'}</option>
                        <option value="architectural">{isAr ? 'مخططات معمارية' : 'Architectural'}</option>
                        <option value="structural">{isAr ? 'مخططات إنشائية' : 'Structural'}</option>
                        <option value="mep">{isAr ? 'مخططات MEP' : 'MEP'}</option>
                        <option value="gis">{isAr ? 'وثائق GIS' : 'GIS Docs'}</option>
                      </Select>
                    </div>
                  </div>

                  {/* Drag & Drop Multi-File Importer */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragActive(false);
                      if (e.dataTransfer.files?.length) {
                        void handleImportRawFiles(e.dataTransfer.files);
                      }
                    }}
                    className={`rounded-xl border-2 border-dashed p-6 text-center space-y-3 bunyan-transition ${
                      dragActive
                        ? 'border-[#B4863C] bg-[#B4863C]/10'
                        : 'border-[var(--border-strong)] bg-[var(--bg-surface-subtle)]'
                    }`}
                  >
                    <FilePlus2 className="w-8 h-8 text-[#B4863C] mx-auto" />
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-[var(--text-primary)]">
                        {isAr
                          ? 'اسحب وأفلت ملفات المشروع هنا أو اختر ملفات متعددة'
                          : 'Drag & drop project files here, or browse multiple files'}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        PDF · PNG / JPG / SVG · DXF / DWG / IFC · JSON / CSV / TXT / XLSX / DOCX
                      </div>
                    </div>

                    <label className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-[#B4863C] text-white text-xs font-semibold hover:bg-[#9E7330] cursor-pointer">
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      <span>{busy ? (isAr ? 'جاري الاستيراد...' : 'Importing...') : (isAr ? 'اختيار ملفات للاستيراد' : 'Select Files to Import')}</span>
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.svg,.dxf,.dwg,.ifc,.json,.csv,.txt,.xlsx,.docx"
                        onChange={(e) => {
                          if (e.target.files?.length) void handleImportRawFiles(e.target.files);
                          e.target.value = '';
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {/* Portable Bundle JSON Importer */}
                  <div className="p-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-[var(--text-primary)]">
                        {isAr ? 'استيراد حزمة ملفات مشروع كاملة (.json)' : 'Import Project Files Bundle (.json)'}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        {isAr
                          ? 'استعادة مستندات مصدّرة مسبقاً مع بياناتها الثنائية لعرضها مباشرة.'
                          : 'Restore previously exported bunyan-project-files-v1 JSON bundles with binaries.'}
                      </div>
                    </div>
                    <label className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text-primary)] hover:border-[#B4863C] cursor-pointer">
                      <FileArchive className="w-3.5 h-3.5 text-[#B4863C]" />
                      <span>{isAr ? 'اختيار ملف حزمة JSON' : 'Choose Bundle JSON'}</span>
                      <input type="file" accept=".json,application/json" onChange={handleImportBundleJson} className="hidden" />
                    </label>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 3: EXPORT & PRINT REGISTER */}
          {tab === 'export' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] space-y-3">
                <div className="text-xs font-bold text-[var(--text-primary)]">
                  {isAr ? 'تصدير حزمة ملفات المشروع (.json)' : 'Portable Files Bundle (.json)'}
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {isAr
                    ? `تصدير ${selectedDocuments.length || project.documents.length} مستند مع الملفات المخزنة في حزمة واحدة قابلة للاستيراد.`
                    : `Package ${selectedDocuments.length || project.documents.length} document(s) and binaries into one portable archive.`}
                </p>
                <Button size="sm" variant="primary" disabled={busy || !canExportFiles} icon={<FileArchive className="w-3.5 h-3.5" />} onClick={handleExportBundle}>
                  {isAr ? 'تصدير حزمة الملفات' : 'Export Files Bundle'}
                </Button>
              </div>

              <div className="p-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] space-y-3">
                <div className="text-xs font-bold text-[var(--text-primary)]">
                  {isAr ? 'تصدير سجل المستندات (Excel / CSV)' : 'Export Register (Excel / CSV)'}
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {isAr
                    ? 'جرد منظم لكافة مستندات المشروع وتواريخها وتصنيفاتها وأحجامها.'
                    : 'Structured register of all project documents, categories, sizes & cloud status.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={!canExportFiles} icon={<FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />} onClick={handleExportExcelRegister}>
                    Excel (.xlsx)
                  </Button>
                  <Button size="sm" variant="outline" disabled={!canExportFiles} icon={<Download className="w-3.5 h-3.5" />} onClick={handleExportCsvRegister}>
                    CSV (UTF-8)
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Isolated Printable Project Files Register Sheet */}
      {isOpen && (
        <div
          id="bunyan-project-files-print"
          dir={isAr ? 'rtl' : 'ltr'}
          className="hidden print:block"
          style={{
            backgroundColor: '#FFFFFF',
            color: '#0F172A',
            padding: '24px',
            fontFamily: isAr ? "'IBM Plex Sans Arabic', sans-serif" : "'Plus Jakarta Sans', sans-serif",
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #94A3B8', paddingBottom: '12px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img src={BUNYAN_OFFICIAL_LOGO_SRC} alt="Bunyan" style={{ width: '44px', height: '44px', objectFit: 'contain' }} />
              <div>
                <div style={{ fontSize: '14px', fontWeight: 800 }}>{isAr ? company.nameAr : company.nameEn}</div>
                <div style={{ fontSize: '11px', color: '#475569' }}>
                  {isAr ? `سجل ملفات ومستندات المشروع — ${project.code}` : `Project Files & Documents Register — ${project.code}`}
                </div>
              </div>
            </div>
            <div dir="ltr" style={{ fontSize: '10px', fontFamily: 'monospace', textAlign: 'right' }}>
              <div>{new Date().toISOString().slice(0, 10)}</div>
              <div>{project.documents.length} FILES</div>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', border: '1px solid #CBD5E1' }}>
            <thead style={{ backgroundColor: '#1E293B', color: '#FFFFFF' }}>
              <tr>
                <th style={{ padding: '7px 8px' }}>#</th>
                <th style={{ padding: '7px 8px', textAlign: isAr ? 'right' : 'left' }}>{isAr ? 'اسم الملف' : 'File Name'}</th>
                <th style={{ padding: '7px 8px' }}>{isAr ? 'التصنيف' : 'Category'}</th>
                <th style={{ padding: '7px 8px' }}>{isAr ? 'الحجم (KB)' : 'Size (KB)'}</th>
                <th style={{ padding: '7px 8px' }}>{isAr ? 'التاريخ' : 'Date'}</th>
              </tr>
            </thead>
            <tbody>
              {project.documents.map((d, idx) => (
                <tr key={d.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '6px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{idx + 1}</td>
                  <td style={{ padding: '6px 8px' }}>{d.name}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>{d.category}</td>
                  <td dir="ltr" style={{ padding: '6px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{(d.sizeBytes / 1024).toFixed(1)}</td>
                  <td dir="ltr" style={{ padding: '6px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{d.uploadedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};
