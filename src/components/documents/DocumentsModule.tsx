import React, { useMemo, useState } from 'react';
import { Download, Eye, FileArchive, FilePlus2, FileText, FolderSync, Search, Trash2, Upload } from 'lucide-react';
import type { CompanyProfile, Language, Project, ProjectDocument, Role } from '../../types/bunyan';
import { DEFAULT_COMPANY_PROFILE } from '../../data/uaeSeedData';
import { getRolePermissions } from '../../utils/rbacPermissions';
import {
  inferDocCategoryFromFilename,
  inferMimeTypeFromFilename,
  isSafeExportBinaryDataUrl,
} from '../../utils/projectFilesEngine';
import {
  downloadChunkedDocument,
  ensureProjectExistsInCloud,
  uploadChunkedDocument,
} from '../../services/firestoreStorage';
import { cacheSessionBinary, getCachedSessionBinary } from '../../services/cloudSyncService';
import { DocumentViewerModal } from '../projects/DocumentViewerModal';
import { ProjectFilesExchangeModal } from '../projects/ProjectFilesExchangeModal';
import { Button, Card, CardHeader, EmptyState, ErrorState, Input, Select, useToast } from '../ui';

interface DocumentsModuleProps {
  projects: Project[];
  activeProject: Project;
  company?: CompanyProfile;
  lang: Language;
  currentRole?: Role;
  cloudUid?: string | null;
  onSelectProject: (id: string) => void;
  onSaveProject: (project: Project) => void;
  onLogDocumentAction?: (
    action: 'print' | 'pdf' | 'xlsx' | 'csv' | 'archive',
    project: Project,
    rowCount: number,
    titleAr: string,
    titleEn: string
  ) => void;
}

export const DocumentsModule: React.FC<DocumentsModuleProps> = ({
  projects,
  activeProject,
  company,
  lang,
  currentRole = 'admin',
  cloudUid,
  onSelectProject,
  onSaveProject,
  onLogDocumentAction,
}) => {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [scope, setScope] = useState<'active' | 'all'>('all');
  const [viewingItem, setViewingItem] = useState<{ doc: ProjectDocument; project: Project } | null>(null);
  const [filesExchangeOpen, setFilesExchangeOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { pushToast } = useToast();
  const isAr = lang === 'ar';
  const perms = useMemo(() => getRolePermissions(currentRole), [currentRole]);

  const effectiveCompany: CompanyProfile = company || DEFAULT_COMPANY_PROFILE;

  const docs = useMemo(() => {
    const sourceProjects = scope === 'active' ? [activeProject] : projects;
    const list: Array<{ doc: ProjectDocument; project: Project }> = [];
    for (const p of sourceProjects) {
      for (const d of p.documents) {
        const matchCat = categoryFilter === 'all' || d.category === categoryFilter;
        const q = search.trim().toLowerCase();
        const matchQ =
          !q ||
          d.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q);
        if (matchCat && matchQ) list.push({ doc: d, project: p });
      }
    }
    return list;
  }, [projects, activeProject, scope, categoryFilter, search]);

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.readAsDataURL(file);
    });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    if (!perms.canEditEngineering) return;

    if (!cloudUid) {
      const msg = isAr
        ? 'يتطلب رفع المستندات تسجيل الدخول بحساب Google الموثق والاتصال بالسحابة.'
        : 'Verified cloud sign-in is required before uploading documents (Fail-Closed).';
      setUploadError(msg);
      pushToast(msg, 'error');
      return;
    }

    setUploading(true);
    setUploadError(null);
    try {
      const createdDocs: ProjectDocument[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const base64DataUrl = await readFileAsDataUrl(file);
        const mimeType = inferMimeTypeFromFilename(file.name, file.type);
        const category = inferDocCategoryFromFilename(file.name);

        await ensureProjectExistsInCloud(activeProject, cloudUid);
        const manifest = await uploadChunkedDocument({
          ownerId: cloudUid,
          projectId: activeProject.id,
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
        ...activeProject,
        documents: [...createdDocs, ...activeProject.documents],
      });
      pushToast(
        isAr
          ? `تم حفظ ${createdDocs.length} مستند في المشروع ${activeProject.code}`
          : `Uploaded ${createdDocs.length} file(s) to ${activeProject.code}`,
        'success'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setUploadError(msg);
      pushToast(msg, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleReplaceDocumentFile = async (docId: string, file: File) => {
    const targetProject = viewingItem?.project || activeProject;
    if (!perms.canEditEngineering) return;
    if (!cloudUid) {
      const msg = isAr
        ? 'يتطلب إرفاق الملفات تسجيل الدخول بحساب Google الموثق والاتصال بالسحابة.'
        : 'Verified cloud sign-in is required before attaching files (Fail-Closed).';
      setUploadError(msg);
      pushToast(msg, 'error');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const base64DataUrl = await readFileAsDataUrl(file);
      const mimeType = inferMimeTypeFromFilename(file.name, file.type);
      await ensureProjectExistsInCloud(targetProject, cloudUid);
      const manifest = await uploadChunkedDocument({
        ownerId: cloudUid,
        projectId: targetProject.id,
        fileName: file.name,
        mimeType,
        base64DataUrl,
      });
      const manifestId = manifest.id;

      await cacheSessionBinary(docId, base64DataUrl);
      await cacheSessionBinary(manifestId, base64DataUrl);

      let updatedDoc: ProjectDocument | null = null;
      const updatedProject: Project = {
        ...targetProject,
        documents: targetProject.documents.map((d) => {
          if (d.id !== docId) return d;
          updatedDoc = {
            ...d,
            name: file.name,
            mimeType,
            sizeBytes: file.size,
            uploadedAt: new Date().toISOString().slice(0, 10),
            manifestId: manifestId ?? d.manifestId,
            localDataUrl: base64DataUrl,
          };
          return updatedDoc;
        }),
      };

      onSaveProject(updatedProject);
      if (updatedDoc) {
        setViewingItem({ doc: updatedDoc, project: updatedProject });
      }
      pushToast(
        isAr ? 'تم إرفاق الملف الفعلي وعرضه داخل المنصة' : 'Actual file attached and rendered inline',
        'success'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to attach file';
      setUploadError(msg);
      pushToast(msg, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleExportSingleDoc = async (docItem: ProjectDocument, proj: Project) => {
    if (!perms.canExportReports) return;
    let resolved = docItem.localDataUrl;
    if (!resolved && docItem.manifestId) {
      resolved = (await getCachedSessionBinary(docItem.manifestId)) ?? undefined;
    }
    if (!resolved) {
      resolved = (await getCachedSessionBinary(docItem.id)) ?? undefined;
    }
    if (!resolved && docItem.manifestId) {
      try {
        const res = await downloadChunkedDocument(docItem.manifestId);
        if (res?.dataUrl) {
          resolved = res.dataUrl;
          await cacheSessionBinary(docItem.manifestId, res.dataUrl);
          await cacheSessionBinary(docItem.id, res.dataUrl);
        }
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Cloud download failed', 'error');
        resolved = undefined;
      }
    }

    if (resolved && isSafeExportBinaryDataUrl(resolved)) {
      const a = document.createElement('a');
      a.href = resolved;
      a.download = docItem.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    setViewingItem({ doc: docItem, project: proj });
    pushToast(
      isAr
        ? 'تم فتح الوثيقة الرسمية للعرض أو الطباعة أو التصدير بصيغة PDF.'
        : 'Opened official record inline for Print or PDF export.',
      'info'
    );
  };

  const handleDeleteDoc = (docId: string, proj: Project) => {
    if (!perms.canEditEngineering) return;
    onSaveProject({
      ...proj,
      documents: proj.documents.filter((d) => d.id !== docId),
    });
    if (viewingItem?.doc.id === docId) {
      setViewingItem(null);
    }
    pushToast(isAr ? 'تم حذف المستند من الأرشيف' : 'Document removed from vault', 'info');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          icon={<FileArchive className="w-4 h-4" />}
          title={isAr ? 'أرشيف المخططات والوثائق الهندسية' : 'Central Engineering Documents Vault'}
          subtitle={
            isAr
              ? `الرفع للمشروع النشط: ${activeProject.code} · عرض داخلي، استيراد، تصدير، وطباعة فورية`
              : `Active project: ${activeProject.code} · Inline preview, batch import/export & print`
          }
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                icon={<FolderSync className="w-3.5 h-3.5 text-[#B4863C]" />}
                onClick={() => setFilesExchangeOpen(true)}
              >
                {isAr ? 'استيراد / تصدير / طباعة' : 'Import / Export / Print'}
              </Button>
              {perms.canEditEngineering && (
                <label className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-[#B4863C] text-white text-xs font-semibold hover:bg-[#9E7330] cursor-pointer bunyan-transition whitespace-nowrap">
                  {uploading ? <Upload className="w-4 h-4 animate-bounce" /> : <FilePlus2 className="w-4 h-4" />}
                  <span>
                    {uploading
                      ? isAr ? 'جاري التجزئة والرفع...' : 'Uploading...'
                      : isAr ? `رفع مستندات إلى ${activeProject.code}` : `Upload to ${activeProject.code}`}
                  </span>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.svg,.dxf,.dwg,.ifc,.json,.csv,.txt,.xlsx,.docx"
                    onChange={handleUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          }
        />

        <div className="p-4 border-b border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] flex flex-wrap items-center gap-3">
          <div className="w-64 flex-1 sm:flex-none">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              startIcon={<Search className="w-3.5 h-3.5" />}
              placeholder={isAr ? 'بحث باسم الملف أو الكود...' : 'Search filename or code...'}
            />
          </div>

          <div className="w-44">
            <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="all">{isAr ? 'كل التصنيفات' : 'All Categories'}</option>
              <option value="permit">{isAr ? 'رخص البناء' : 'Permits'}</option>
              <option value="architectural">{isAr ? 'مخططات معمارية' : 'Architectural'}</option>
              <option value="structural">{isAr ? 'مخططات إنشائية' : 'Structural'}</option>
              <option value="mep">{isAr ? 'مخططات MEP' : 'MEP'}</option>
              <option value="contract">{isAr ? 'العقود' : 'Contracts'}</option>
              <option value="gis">{isAr ? 'وثائق GIS' : 'GIS Docs'}</option>
            </Select>
          </div>

          <div className="inline-flex rounded-lg border border-[var(--border-hairline)] p-0.5 bg-[var(--bg-surface)] text-xs font-semibold">
            <button
              type="button"
              onClick={() => setScope('all')}
              className={`px-3 py-1 rounded-md cursor-pointer ${
                scope === 'all' ? 'bg-[#B4863C] text-white' : 'text-[var(--text-secondary)]'
              }`}
            >
              {isAr ? 'كل المشاريع' : 'All Projects'}
            </button>
            <button
              type="button"
              onClick={() => setScope('active')}
              className={`px-3 py-1 rounded-md cursor-pointer ${
                scope === 'active' ? 'bg-[#B4863C] text-white' : 'text-[var(--text-secondary)]'
              }`}
            >
              {activeProject.code}
            </button>
          </div>
        </div>

        {uploadError && (
          <div className="p-4 border-b border-[var(--border-hairline)]">
            <ErrorState
              title={isAr ? 'فشل رفع المستند' : 'Document Upload Failed'}
              message={uploadError}
              retryLabel={isAr ? 'إغلاق' : 'Dismiss'}
              onRetry={() => setUploadError(null)}
            />
          </div>
        )}

        {docs.length === 0 ? (
          <EmptyState
            title={isAr ? 'لا توجد وثائق مطابقة' : 'No Matching Documents'}
            description={
              isAr
                ? 'ارفع مخططاً هندسياً بصيغة PDF أو صورة ليتم حفظه وعرضه مباشرة.'
                : 'Upload a PDF drawing or image to store and preview it inline.'
            }
            actionLabel={
              search || categoryFilter !== 'all' || scope === 'active'
                ? isAr
                  ? 'إعادة ضبط الفلاتر'
                  : 'Reset Filters'
                : undefined
            }
            onAction={
              search || categoryFilter !== 'all' || scope === 'active'
                ? () => {
                    setSearch('');
                    setCategoryFilter('all');
                    setScope('all');
                  }
                : undefined
            }
          />
        ) : (
          <div className="divide-y divide-[var(--border-hairline)]">
            {docs.map(({ doc, project }) => (
              <div
                key={`${project.id}-${doc.id}`}
                className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-[var(--bg-surface-subtle)] bunyan-transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="w-4 h-4 text-[#B4863C] shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                      {doc.name}
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-[var(--text-muted)] truncate">
                      {project.code} · {doc.category} · {(doc.sizeBytes / 1024).toFixed(1)} KB · {doc.uploadedAt}
                      {doc.manifestId ? ' · Cloud Chunked' : ''}
                    </div>
                  </div>
                </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {project.id !== activeProject.id && (
                      <button
                        type="button"
                        onClick={() => onSelectProject(project.id)}
                        className="text-[11px] font-mono text-[#B4863C] hover:underline cursor-pointer me-1"
                      >
                        {project.code}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setViewingItem({ doc, project })}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-primary)] hover:border-[#B4863C] cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 text-[#B4863C]" />
                      <span>{isAr ? 'فتح وعرض' : 'Open'}</span>
                    </button>
                    {perms.canExportReports && (
                      <button
                        type="button"
                        onClick={() => void handleExportSingleDoc(doc, project)}
                        className="p-1.5 rounded-lg border border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[#B4863C] cursor-pointer"
                        title={isAr ? 'تصدير الملف' : 'Export File'}
                        aria-label={isAr ? `تصدير ${doc.name}` : `Export ${doc.name}`}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {perms.canEditEngineering && (
                      <button
                        type="button"
                        onClick={() => handleDeleteDoc(doc.id, project)}
                        className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                        title={isAr ? 'حذف' : 'Delete'}
                        aria-label={isAr ? `حذف ${doc.name}` : `Delete ${doc.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

      <ProjectFilesExchangeModal
        isOpen={filesExchangeOpen}
        onClose={() => setFilesExchangeOpen(false)}
        project={activeProject}
        company={effectiveCompany}
        lang={lang}
        cloudUid={cloudUid}
        canEditFiles={perms.canEditEngineering}
        canExportFiles={perms.canExportReports}
        canPrintFiles={perms.canPrintReports}
        onSaveProject={onSaveProject}
        onPreviewDocument={(docItem) => setViewingItem({ doc: docItem, project: activeProject })}
        onLogFileAction={(action, rowCount, titleAr, titleEn) =>
          onLogDocumentAction?.(action, activeProject, rowCount, titleAr, titleEn)
        }
      />

      <DocumentViewerModal
        docItem={viewingItem?.doc || null}
        project={viewingItem?.project || activeProject}
        company={effectiveCompany}
        onClose={() => setViewingItem(null)}
        lang={lang}
        canUpload={perms.canEditEngineering}
        canPrint={perms.canPrintReports}
        canExport={perms.canExportReports}
        onReplaceDocumentFile={handleReplaceDocumentFile}
        onLogDocAction={(action, docItem) => {
          const targetProj = viewingItem?.project || activeProject;
          onLogDocumentAction?.(
            action,
            targetProj,
            1,
            `${docItem.name} (${targetProj.code})`,
            `${docItem.name} (${targetProj.code})`
          );
        }}
      />
    </div>
  );
};
