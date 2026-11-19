import React, { useState } from 'react';
import {
  Archive,
  Edit3,
  Eye,
  FilePlus2,
  FolderOpen,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import type { BackupData, Language, Project, ProjectDocument } from '../../types/bunyan';
import { formatAED, PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from '../../utils/i18n';
import {
  ensureProjectExistsInCloud,
  uploadChunkedDocument,
} from '../../services/firestoreStorage';
import { BackupSyncModal } from './BackupSyncModal';
import { DocumentViewerModal } from './DocumentViewerModal';
import { ProjectFormModal } from './ProjectFormModal';

interface ProjectsModuleProps {
  projects: Project[];
  activeProjectId: string;
  onSelectProject: (id: string) => void;
  onSaveProject: (project: Project) => void;
  onDeleteProject: (id: string) => void;
  lang: Language;
  backupData: BackupData;
  onImportBackup: (data: BackupData) => void;
  cloudUid?: string | null;
}

export const ProjectsModule: React.FC<ProjectsModuleProps> = ({
  projects,
  activeProjectId,
  onSelectProject,
  onSaveProject,
  onDeleteProject,
  lang,
  backupData,
  onImportBackup,
  cloudUid,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<ProjectDocument | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0];

  const filtered = projects.filter((p) => {
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    const q = search.trim().toLowerCase();
    const matchesQuery =
      !q ||
      p.code.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.nameEn.toLowerCase().includes(q) ||
      p.ownerName.toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });

  const handleUploadDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeProject) return;
    setUploadingDoc(true);
    try {
      const reader = new FileReader();
      const base64DataUrl: string = await new Promise((resolve, reject) => {
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

      const newDoc: ProjectDocument = {
        id: `doc-${Date.now()}`,
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
    } finally {
      setUploadingDoc(false);
      e.target.value = '';
    }
  };

  const handleMilestoneToggle = (milestoneId: string) => {
    if (!activeProject) return;
    const nextMilestones = activeProject.paymentMilestones.map((m) => {
      if (m.id !== milestoneId) return m;
      const nextStatus =
        m.status === 'pending' ? 'invoiced' : m.status === 'invoiced' ? 'paid' : 'pending';
      return { ...m, status: nextStatus as 'pending' | 'invoiced' | 'paid' };
    });
    const paidSum = nextMilestones
      .filter((m) => m.status === 'paid')
      .reduce((acc, m) => acc + m.amountAed, 0);
    const invoicedSum = nextMilestones
      .filter((m) => m.status === 'paid' || m.status === 'invoiced')
      .reduce((acc, m) => acc + m.amountAed, 0);

    onSaveProject({
      ...activeProject,
      paymentMilestones: nextMilestones,
      paidAmount: Math.round(paidSum),
      invoicedAmount: Math.round(invoicedSum),
    });
  };

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={lang === 'ar' ? 'بحث بالكود أو الاسم أو المالك...' : 'Search code, project, owner...'}
              className="ps-9 pe-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2C] text-slate-900 dark:text-white w-64"
            />
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            {(['all', 'under_construction', 'permitting', 'completed'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {st === 'all'
                  ? lang === 'ar' ? 'الكل' : 'All'
                  : lang === 'ar' ? PROJECT_STATUS_LABELS[st].ar : PROJECT_STATUS_LABELS[st].en}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setBackupOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Archive className="w-4 h-4 text-[#B4863C]" />
            <span>{lang === 'ar' ? 'نسخ احتياطي JSON' : 'Backup & Sync'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingProject(null);
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#B4863C] text-white text-xs font-semibold hover:bg-[#9E7330] whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>{lang === 'ar' ? 'مشروع جديد' : 'New Project'}</span>
          </button>
        </div>
      </div>

      {/* Projects Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 text-start font-semibold">{lang === 'ar' ? 'الكود' : 'Code'}</th>
                <th className="px-4 py-3 text-start font-semibold">{lang === 'ar' ? 'المشروع والمالك' : 'Project & Owner'}</th>
                <th className="px-4 py-3 text-start font-semibold">{lang === 'ar' ? 'النوع' : 'Type'}</th>
                <th className="px-4 py-3 text-start font-semibold">{lang === 'ar' ? 'الميزانية' : 'Budget'}</th>
                <th className="px-4 py-3 text-start font-semibold">{lang === 'ar' ? 'الإنجاز' : 'Progress'}</th>
                <th className="px-4 py-3 text-start font-semibold">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                <th className="px-4 py-3 text-end font-semibold">{lang === 'ar' ? 'إجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => onSelectProject(p.id)}
                  className={`cursor-pointer transition-colors ${
                    p.id === activeProject?.id
                      ? 'bg-[#B4863C]/5'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <td className="px-4 py-3 font-mono font-semibold text-[#B4863C] whitespace-nowrap">
                    {p.code}
                  </td>
                  <td className="px-4 py-3 min-w-[240px]">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {lang === 'ar' ? p.name : p.nameEn}
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">
                      {p.ownerName} · {p.permitNumber}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-700 dark:text-slate-300">
                    {lang === 'ar' ? PROJECT_TYPE_LABELS[p.projectType].ar : PROJECT_TYPE_LABELS[p.projectType].en}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                    {formatAED(p.approvedBudget, lang)}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums whitespace-nowrap">
                    {p.actualProgress}%
                  </td>
                  <td className={`px-4 py-3 font-medium whitespace-nowrap ${PROJECT_STATUS_LABELS[p.status].tone}`}>
                    {lang === 'ar' ? PROJECT_STATUS_LABELS[p.status].ar : PROJECT_STATUS_LABELS[p.status].en}
                  </td>
                  <td className="px-4 py-3 text-end whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingProject(p);
                          setFormOpen(true);
                        }}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                        title={lang === 'ar' ? 'تعديل' : 'Edit'}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      {projects.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onDeleteProject(p.id)}
                          className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10"
                          title={lang === 'ar' ? 'حذف' : 'Delete'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Project Details: Payment Milestones & Chunked Document Archive */}
      {activeProject && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Financial Milestones */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {lang === 'ar' ? 'جدول الدفعات والمستخلصات (AED)' : 'Payment Milestones (AED)'}
              </h3>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {lang === 'ar' ? `الاستقطاع: ${activeProject.retentionPercentage}%` : `Retention: ${activeProject.retentionPercentage}%`}
              </span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {activeProject.paymentMilestones.map((m) => (
                <div key={m.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {lang === 'ar' ? m.titleAr : m.titleEn}
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-slate-500">
                      {m.percentage}% · {m.dueDate}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                      {formatAED(m.amountAed, lang)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleMilestoneToggle(m.id)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium border ${
                        m.status === 'paid'
                          ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                          : m.status === 'invoiced'
                          ? 'border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10'
                          : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {m.status === 'paid'
                        ? lang === 'ar' ? 'مدفوعة' : 'Paid'
                        : m.status === 'invoiced'
                        ? lang === 'ar' ? 'مفوترة' : 'Invoiced'
                        : lang === 'ar' ? 'مجدولة' : 'Pending'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Project Documents (Supports 800KB Firestore Chunked Upload) */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-[#B4863C]" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {lang === 'ar' ? 'أرشيف المخططات والوثائق' : 'Engineering Document Archive'}
                </h3>
              </div>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#B4863C] text-white text-xs font-semibold hover:bg-[#9E7330] cursor-pointer">
                {uploadingDoc ? <Upload className="w-3.5 h-3.5 animate-bounce" /> : <FilePlus2 className="w-3.5 h-3.5" />}
                <span>{uploadingDoc ? (lang === 'ar' ? 'جاري التجزئة...' : 'Uploading...') : (lang === 'ar' ? 'رفع مستند' : 'Upload File')}</span>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={handleUploadDocument}
                  className="hidden"
                />
              </label>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {activeProject.documents.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  {lang === 'ar' ? 'لا توجد وثائق مرفقة بعد.' : 'No documents uploaded yet.'}
                </div>
              ) : (
                activeProject.documents.map((d) => (
                  <div key={d.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                        {d.name}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-slate-500">
                        {d.category} · {(d.sizeBytes / 1024).toFixed(1)} KB · {d.uploadedAt}
                        {d.manifestId ? ' · Firestore Chunked' : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setViewingDoc(d)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5 text-[#B4863C]" />
                      <span>{lang === 'ar' ? 'عرض' : 'View'}</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <ProjectFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        lang={lang}
        initialProject={editingProject}
        onSave={onSaveProject}
      />

      <BackupSyncModal
        isOpen={backupOpen}
        onClose={() => setBackupOpen(false)}
        lang={lang}
        backupData={backupData}
        onImportBackup={onImportBackup}
      />

      <DocumentViewerModal
        docItem={viewingDoc}
        onClose={() => setViewingDoc(null)}
        lang={lang}
      />
    </div>
  );
};
