import React, { useMemo, useState } from 'react';
import { Eye, FileArchive, FilePlus2, FileText, Search, Upload } from 'lucide-react';
import type { Language, Project, ProjectDocument, Role } from '../../types/bunyan';
import { getRolePermissions } from '../../utils/rbacPermissions';
import { ensureProjectExistsInCloud, uploadChunkedDocument } from '../../services/firestoreStorage';
import { cacheBinaryLocally } from '../../services/cloudSyncService';
import { DocumentViewerModal } from '../projects/DocumentViewerModal';
import { Card, CardHeader, EmptyState, ErrorState, Input, Select, useToast } from '../ui';

interface DocumentsModuleProps {
  projects: Project[];
  activeProject: Project;
  lang: Language;
  currentRole?: Role;
  cloudUid?: string | null;
  onSelectProject: (id: string) => void;
  onSaveProject: (project: Project) => void;
}

export const DocumentsModule: React.FC<DocumentsModuleProps> = ({
  projects,
  activeProject,
  lang,
  currentRole = 'admin',
  cloudUid,
  onSelectProject,
  onSaveProject,
}) => {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [scope, setScope] = useState<'active' | 'all'>('all');
  const [viewingDoc, setViewingDoc] = useState<ProjectDocument | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { pushToast } = useToast();
  const isAr = lang === 'ar';
  const perms = useMemo(() => getRolePermissions(currentRole), [currentRole]);

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

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const base64DataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      let manifestId: string | undefined;
      if (cloudUid) {
        await ensureProjectExistsInCloud(activeProject, cloudUid);
        const manifest = await uploadChunkedDocument({
          ownerId: cloudUid,
          projectId: activeProject.id,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          base64DataUrl,
        });
        manifestId = manifest.id;
      }

      const docId = `doc-${Date.now()}`;
      await cacheBinaryLocally(docId, base64DataUrl);
      if (manifestId) {
        await cacheBinaryLocally(manifestId, base64DataUrl);
      }

      const newDoc: ProjectDocument = {
        id: docId,
        name: file.name,
        category: file.type.includes('pdf') ? 'architectural' : 'permit',
        mimeType: file.type || 'application/pdf',
        sizeBytes: file.size,
        uploadedAt: new Date().toISOString().slice(0, 10),
        manifestId,
        localDataUrl: base64DataUrl,
      };

      onSaveProject({
        ...activeProject,
        documents: [newDoc, ...activeProject.documents],
      });
      pushToast(
        isAr ? `تم حفظ المستند في المشروع ${activeProject.code}` : `Uploaded to ${activeProject.code}`,
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          icon={<FileArchive className="w-4 h-4" />}
          title={isAr ? 'أرشيف المخططات والوثائق الهندسية' : 'Central Engineering Documents Vault'}
          subtitle={
            isAr
              ? `الرفع للمشروع النشط: ${activeProject.code} · يدعم التجزئة السحابية 800KB في Firestore`
              : `Upload target: ${activeProject.code} · Supports 800KB Firestore chunked binary storage`
          }
          action={
            perms.canEditEngineering ? (
              <label className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-[#B4863C] text-white text-xs font-semibold hover:bg-[#9E7330] cursor-pointer bunyan-transition whitespace-nowrap">
                {uploading ? <Upload className="w-4 h-4 animate-bounce" /> : <FilePlus2 className="w-4 h-4" />}
                <span>
                  {uploading
                    ? isAr ? 'جاري التجزئة والرفع...' : 'Uploading...'
                    : isAr ? `رفع مستند إلى ${activeProject.code}` : `Upload to ${activeProject.code}`}
                </span>
                <input type="file" accept=".pdf,image/*" onChange={handleUpload} className="hidden" />
              </label>
            ) : null
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

                <div className="flex items-center gap-2 shrink-0">
                  {project.id !== activeProject.id && (
                    <button
                      type="button"
                      onClick={() => onSelectProject(project.id)}
                      className="text-[11px] font-mono text-[#B4863C] hover:underline cursor-pointer"
                    >
                      {project.code}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setViewingDoc(doc)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-primary)] hover:border-[#B4863C] cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#B4863C]" />
                    <span>{isAr ? 'معاينة' : 'View'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <DocumentViewerModal docItem={viewingDoc} onClose={() => setViewingDoc(null)} lang={lang} />
    </div>
  );
};
