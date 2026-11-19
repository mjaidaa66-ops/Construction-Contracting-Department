import React, { useMemo, useState } from 'react';
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
import type { BackupData, Language, Project, ProjectDocument, Role } from '../../types/bunyan';
import { formatAED, PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from '../../utils/i18n';
import { getRolePermissions } from '../../utils/rbacPermissions';
import {
  ensureProjectExistsInCloud,
  uploadChunkedDocument,
} from '../../services/firestoreStorage';
import { BackupSyncModal } from './BackupSyncModal';
import { DocumentViewerModal } from './DocumentViewerModal';
import { ProjectFormModal } from './ProjectFormModal';
import {
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Input,
  SegmentedTabs,
  StatusIndicator,
  useToast,
} from '../ui';

interface ProjectsModuleProps {
  projects: Project[];
  activeProjectId: string;
  onSelectProject: (id: string) => void;
  onSaveProject: (project: Project) => void;
  onDeleteProject: (id: string) => void;
  lang: Language;
  currentRole?: Role;
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
  currentRole = 'admin',
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
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const { pushToast } = useToast();

  const isAr = lang === 'ar';
  const perms = useMemo(() => getRolePermissions(currentRole), [currentRole]);
  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0];

  const filtered = projects.filter((p) => {
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    const q = search.trim().toLowerCase();
    const matchesQuery =
      !q ||
      p.code.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.nameEn.toLowerCase().includes(q) ||
      p.ownerName.toLowerCase().includes(q) ||
      p.gisData.plotNumber.toLowerCase().includes(q);
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
      pushToast(isAr ? 'تم إرفاق المستند بنجاح' : 'Document uploaded successfully', 'success');
    } finally {
      setUploadingDoc(false);
      e.target.value = '';
    }
  };

  const handleMilestoneToggle = (milestoneId: string) => {
    if (!activeProject) return;
    if (!perms.canEditFinancials) {
      pushToast(
        isAr ? 'تعديل الدفعات متاح للمدير والمحاسب فقط.' : 'Payment updates require Admin or Accountant role.',
        'error'
      );
      return;
    }
    const nextMilestones = activeProject.paymentMilestones.map((m) => {
      if (m.id !== milestoneId) return m;
      const nextStatus: 'pending' | 'paid' = m.status === 'paid' ? 'pending' : 'paid';
      return { ...m, status: nextStatus };
    });
    const paidSum = nextMilestones
      .filter((m) => m.status === 'paid')
      .reduce((acc, m) => acc + m.amountAed, 0);

    onSaveProject({
      ...activeProject,
      paymentMilestones: nextMilestones,
      paidAmount: Math.round(paidSum),
      invoicedAmount: Math.round(paidSum),
    });
  };

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <Card padded className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-full sm:w-64">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              startIcon={<Search className="w-3.5 h-3.5" />}
              placeholder={isAr ? 'بحث بالكود أو الاسم أو القطعة...' : 'Search code, project, plot...'}
            />
          </div>

          <SegmentedTabs
            value={statusFilter}
            onChange={setStatusFilter}
            items={[
              { id: 'all', label: isAr ? 'الكل' : 'All', count: projects.length },
              { id: 'under_construction', label: isAr ? PROJECT_STATUS_LABELS.under_construction.ar : PROJECT_STATUS_LABELS.under_construction.en },
              { id: 'permitting', label: isAr ? PROJECT_STATUS_LABELS.permitting.ar : PROJECT_STATUS_LABELS.permitting.en },
              { id: 'completed', label: isAr ? PROJECT_STATUS_LABELS.completed.ar : PROJECT_STATUS_LABELS.completed.en },
            ]}
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="md"
            icon={<Archive className="w-4 h-4 text-[#B4863C]" />}
            onClick={() => setBackupOpen(true)}
          >
            {isAr ? 'نسخ احتياطي JSON' : 'Backup JSON'}
          </Button>

          <Button
            size="md"
            disabled={!perms.canManageProjects}
            icon={<Plus className="w-4 h-4" />}
            onClick={() => {
              setEditingProject(null);
              setFormOpen(true);
            }}
          >
            {isAr ? 'مشروع جديد' : 'New Project'}
          </Button>
        </div>
      </Card>

      {/* Projects Portfolio DataTable */}
      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            title={isAr ? 'لا توجد مشاريع مطابقة' : 'No Matching Projects'}
            description={isAr ? 'جرب تعديل كلمات البحث أو الفلتر.' : 'Try adjusting your search or filter.'}
          />
        ) : (
          <div className="overflow-x-auto max-h-[460px]">
            <table className="w-full text-start text-xs">
              <thead className="bg-[var(--bg-surface-subtle)] border-b border-[var(--border-hairline)] text-[var(--text-muted)] sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-start font-semibold">{isAr ? 'الكود' : 'Code'}</th>
                  <th className="px-4 py-3 text-start font-semibold">{isAr ? 'المشروع والمالك' : 'Project & Owner'}</th>
                  <th className="px-4 py-3 text-start font-semibold">{isAr ? 'النوع' : 'Type'}</th>
                  <th className="px-4 py-3 text-end font-semibold">{isAr ? 'الميزانية' : 'Budget'}</th>
                  <th className="px-4 py-3 text-end font-semibold">{isAr ? 'الإنجاز' : 'Progress'}</th>
                  <th className="px-4 py-3 text-start font-semibold">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="px-4 py-3 text-end font-semibold">{isAr ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => onSelectProject(p.id)}
                    className={`cursor-pointer bunyan-transition ${
                      p.id === activeProject?.id
                        ? 'bg-[#B4863C]/8'
                        : 'hover:bg-[var(--bg-surface-subtle)]'
                    }`}
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-[#B4863C] whitespace-nowrap">
                      {p.code}
                    </td>
                    <td className="px-4 py-3 min-w-[240px]">
                      <div className="font-semibold text-[var(--text-primary)]">
                        {isAr ? p.name : p.nameEn}
                      </div>
                      <div className="text-[var(--text-muted)] mt-0.5">
                        {p.ownerName} · {p.permitNumber}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[var(--text-secondary)]">
                      {isAr ? PROJECT_TYPE_LABELS[p.projectType].ar : PROJECT_TYPE_LABELS[p.projectType].en}
                    </td>
                    <td dir="ltr" className="px-4 py-3 text-end font-mono tabular-nums font-semibold text-[var(--text-primary)] whitespace-nowrap">
                      {formatAED(p.approvedBudget, lang)}
                    </td>
                    <td dir="ltr" className="px-4 py-3 text-end font-mono tabular-nums whitespace-nowrap">
                      {p.actualProgress}%
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusIndicator
                        tone={
                          p.status === 'under_construction'
                            ? 'success'
                            : p.status === 'permitting'
                            ? 'warning'
                            : p.status === 'completed'
                            ? 'info'
                            : 'danger'
                        }
                        label={isAr ? PROJECT_STATUS_LABELS[p.status].ar : PROJECT_STATUS_LABELS[p.status].en}
                      />
                    </td>
                    <td className="px-4 py-3 text-end whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        {perms.canManageProjects && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingProject(p);
                              setFormOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                            title={isAr ? 'تعديل' : 'Edit'}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {perms.canDeleteProjects && projects.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(p)}
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                            title={isAr ? 'حذف' : 'Delete'}
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
        )}
      </Card>

      {/* Selected Project Details: Payment Milestones & Chunked Document Archive */}
      {activeProject && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader
              title={isAr ? 'جدول الدفعات المستلمة (AED)' : 'Project Payments (AED)'}
              subtitle={`${activeProject.code} · ${isAr ? activeProject.name : activeProject.nameEn}`}
              action={
                <span className="text-xs font-mono tabular-nums text-[var(--text-muted)]">
                  {formatAED(activeProject.paidAmount, lang)} / {formatAED(activeProject.approvedBudget, lang)}
                </span>
              }
            />
            <div className="divide-y divide-[var(--border-hairline)]">
              {activeProject.paymentMilestones.map((m) => (
                <div key={m.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                      {isAr ? m.titleAr : m.titleEn}
                    </div>
                    <div dir="ltr" className="text-[11px] font-mono tabular-nums text-[var(--text-muted)]">
                      {m.percentage}% · {m.dueDate}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span dir="ltr" className="text-xs font-mono tabular-nums font-semibold text-[var(--text-primary)]">
                      {formatAED(m.amountAed, lang)}
                    </span>
                    <button
                      type="button"
                      disabled={!perms.canEditFinancials}
                      onClick={() => handleMilestoneToggle(m.id)}
                      className={`px-2.5 py-1 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] ${
                        perms.canEditFinancials ? 'hover:border-[#B4863C] cursor-pointer' : 'opacity-65 cursor-not-allowed'
                      }`}
                    >
                      <StatusIndicator
                        tone={m.status === 'paid' ? 'success' : 'neutral'}
                        label={m.status === 'paid' ? (isAr ? 'مدفوعة' : 'Paid') : (isAr ? 'مجدولة' : 'Pending')}
                      />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader
              icon={<FolderOpen className="w-4 h-4" />}
              title={isAr ? 'أرشيف المخططات والوثائق' : 'Engineering Document Archive'}
              action={
                perms.canEditEngineering ? (
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#B4863C] text-white text-xs font-semibold hover:bg-[#9E7330] cursor-pointer">
                    {uploadingDoc ? <Upload className="w-3.5 h-3.5 animate-bounce" /> : <FilePlus2 className="w-3.5 h-3.5" />}
                    <span>{uploadingDoc ? (isAr ? 'جاري التجزئة...' : 'Uploading...') : (isAr ? 'رفع مستند' : 'Upload File')}</span>
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      onChange={handleUploadDocument}
                      className="hidden"
                    />
                  </label>
                ) : null
              }
            />

            <div className="divide-y divide-[var(--border-hairline)]">
              {activeProject.documents.length === 0 ? (
                <div className="p-8 text-center text-xs text-[var(--text-muted)]">
                  {isAr ? 'لا توجد وثائق مرفقة بعد.' : 'No documents uploaded yet.'}
                </div>
              ) : (
                activeProject.documents.map((d) => (
                  <div key={d.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                        {d.name}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-[var(--text-muted)]">
                        {d.category} · {(d.sizeBytes / 1024).toFixed(1)} KB · {d.uploadedAt}
                        {d.manifestId ? ' · Firestore Chunked' : ''}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="xs"
                      icon={<Eye className="w-3.5 h-3.5 text-[#B4863C]" />}
                      onClick={() => setViewingDoc(d)}
                    >
                      {isAr ? 'عرض' : 'View'}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      )}

      <ProjectFormModal
        key={editingProject?.id || (formOpen ? 'new-project' : 'closed')}
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        lang={lang}
        initialProject={editingProject}
        onSave={(p) => {
          onSaveProject(p);
          pushToast(isAr ? 'تم حفظ بيانات المشروع بنجاح' : 'Project saved', 'success');
        }}
      />

      <BackupSyncModal
        isOpen={backupOpen}
        onClose={() => setBackupOpen(false)}
        lang={lang}
        backupData={backupData}
        onImportBackup={onImportBackup}
        canImport={perms.canManageProjects}
      />

      <DocumentViewerModal
        docItem={viewingDoc}
        onClose={() => setViewingDoc(null)}
        lang={lang}
      />

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            onDeleteProject(deleteTarget.id);
            pushToast(isAr ? `تم حذف المشروع ${deleteTarget.code}` : `Deleted ${deleteTarget.code}`, 'info');
          }
        }}
        title={isAr ? 'تأكيد حذف المشروع' : 'Confirm Project Deletion'}
        message={
          deleteTarget
            ? isAr
              ? `هل أنت متأكد من حذف المشروع "${deleteTarget.name}" (${deleteTarget.code})؟ لا يمكن التراجع عن هذا الإجراء.`
              : `Delete project "${deleteTarget.nameEn}" (${deleteTarget.code})? This cannot be undone.`
            : ''
        }
        confirmLabel={isAr ? 'حذف نهائي' : 'Delete Project'}
        cancelLabel={isAr ? 'إلغاء' : 'Cancel'}
      />
    </div>
  );
};
