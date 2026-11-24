import React, { useMemo, useState } from 'react';
import {
  Archive,
  ArrowUpDown,
  Building2,
  CheckCircle2,
  Edit3,
  Eye,
  FilePlus2,
  FolderOpen,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  TrendingUp,
  Upload,
  Wallet,
} from 'lucide-react';
import type { BackupData, Language, Project, ProjectDocument, ProjectType, Role } from '../../types/bunyan';
import { formatAED, PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from '../../utils/i18n';
import { getRolePermissions } from '../../utils/rbacPermissions';
import {
  computePortfolioKpis,
  extractUniqueClients,
  extractUniqueLocations,
  filterAndSortProjects,
  type ProjectSortField,
  type SortDirection,
} from '../../utils/projectHelpers';
import {
  ensureProjectExistsInCloud,
  uploadChunkedDocument,
} from '../../services/firestoreStorage';
import { cacheBinaryLocally } from '../../services/cloudSyncService';
import { BackupSyncModal } from './BackupSyncModal';
import { DocumentViewerModal } from './DocumentViewerModal';
import { ProjectFormModal } from './ProjectFormModal';
import {
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  SegmentedTabs,
  Select,
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
  onImportBackup: (data: BackupData, mode?: 'merge' | 'replace') => void;
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
  const [typeFilter, setTypeFilter] = useState<ProjectType | 'all'>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<ProjectSortField>('updatedAt');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  const [formOpen, setFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<ProjectDocument | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const { pushToast } = useToast();

  const isAr = lang === 'ar';
  const perms = useMemo(() => getRolePermissions(currentRole), [currentRole]);
  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0];

  const locationOptions = useMemo(() => extractUniqueLocations(projects), [projects]);
  const clientOptions = useMemo(() => extractUniqueClients(projects), [projects]);

  const filtered = useMemo(
    () =>
      filterAndSortProjects(
        projects,
        {
          query: search,
          status: statusFilter as Project['status'] | 'all',
          projectType: typeFilter,
          location: locationFilter,
          client: clientFilter,
          sortField,
          sortDir,
        },
        lang
      ),
    [projects, search, statusFilter, typeFilter, locationFilter, clientFilter, sortField, sortDir, lang]
  );

  const kpis = useMemo(() => computePortfolioKpis(filtered), [filtered]);
  const hasActiveFilters =
    Boolean(search.trim()) ||
    statusFilter !== 'all' ||
    typeFilter !== 'all' ||
    locationFilter !== 'all' ||
    clientFilter !== 'all';

  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setTypeFilter('all');
    setLocationFilter('all');
    setClientFilter('all');
    setSortField('updatedAt');
    setSortDir('desc');
  };

  const handleUploadDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeProject) return;
    setUploadingDoc(true);
    setUploadError(null);
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
      pushToast(isAr ? 'تم إرفاق المستند بنجاح' : 'Document uploaded successfully', 'success');
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : isAr
          ? 'تعذر رفع المستند'
          : 'Document upload failed';
      setUploadError(msg);
      pushToast(msg, 'error');
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
      {/* Portfolio KPI Summary Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card padded>
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>{isAr ? 'المشاريع المعروضة' : 'Matching Projects'}</span>
            <Building2 className="w-4 h-4 text-[#B4863C]" />
          </div>
          <div dir="ltr" className="text-xl font-bold font-mono tabular-nums text-[var(--text-primary)] mt-1.5">
            {kpis.totalProjects}{' '}
            <span className="text-xs font-normal text-[var(--text-muted)]">
              / {projects.length}
            </span>
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-1">
            {kpis.activeProjects} {isAr ? 'قيد التنفيذ' : 'active'} · {kpis.completedProjects} {isAr ? 'مكتمل' : 'done'}
          </div>
        </Card>

        <Card padded>
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>{isAr ? 'إجمالي الميزانية' : 'Portfolio Budget'}</span>
            <Wallet className="w-4 h-4 text-[#B4863C]" />
          </div>
          <div dir="ltr" className="text-lg sm:text-xl font-bold font-mono tabular-nums text-[var(--text-primary)] mt-1.5 truncate">
            {formatAED(kpis.totalBudgetAed, lang)}
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-1">
            {isAr ? 'متبقي:' : 'Remaining:'}{' '}
            <span dir="ltr" className="font-mono">{formatAED(kpis.remainingAed, 'en')}</span>
          </div>
        </Card>

        <Card padded>
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>{isAr ? 'الدفعات المستلمة' : 'Payments Received'}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div dir="ltr" className="text-lg sm:text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1.5 truncate">
            {formatAED(kpis.totalPaidAed, lang)}
          </div>
          <div dir="ltr" className="text-[11px] font-mono text-[var(--text-muted)] mt-1">
            {kpis.collectionRatePct}% {isAr ? 'نسبة التحصيل' : 'collection rate'}
          </div>
        </Card>

        <Card padded>
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>{isAr ? 'متوسط الإنجاز' : 'Average Progress'}</span>
            <TrendingUp className="w-4 h-4 text-[#B4863C]" />
          </div>
          <div dir="ltr" className="text-xl font-bold font-mono tabular-nums text-[#B4863C] dark:text-[#C99A49] mt-1.5">
            {kpis.averageProgressPct}%
          </div>
          <div className="w-full h-1.5 rounded-full bg-[var(--bg-surface-subtle)] mt-2 overflow-hidden">
            <div
              className="h-full bg-[#B4863C] rounded-full bunyan-transition"
              style={{ width: `${Math.min(100, Math.max(0, kpis.averageProgressPct))}%` }}
            />
          </div>
        </Card>
      </div>

      {/* Multi-Criteria Filter, Sort & Action Toolbar */}
      <Card padded className="space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-full sm:w-64">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                startIcon={<Search className="w-3.5 h-3.5" />}
                placeholder={isAr ? 'بحث بالكود أو الاسم أو المالك أو القطعة...' : 'Search code, project, client, plot...'}
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
                { id: 'suspended', label: isAr ? PROJECT_STATUS_LABELS.suspended.ar : PROJECT_STATUS_LABELS.suspended.en },
              ]}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
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
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-[var(--border-hairline)]">
          <div className="w-44">
            <Select
              aria-label={isAr ? 'نوع المشروع' : 'Filter by Type'}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as ProjectType | 'all')}
            >
              <option value="all">{isAr ? 'كل أنواع المشاريع' : 'All Project Types'}</option>
              {Object.entries(PROJECT_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {isAr ? v.ar : v.en}
                </option>
              ))}
            </Select>
          </div>

          <div className="w-44">
            <Select
              aria-label={isAr ? 'المنطقة / القطاع' : 'Filter by Sector'}
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
            >
              <option value="all">{isAr ? 'كل المناطق والقطاعات' : 'All Sectors / Locations'}</option>
              {locationOptions.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </Select>
          </div>

          <div className="w-48">
            <Select
              aria-label={isAr ? 'المالك / العميل' : 'Filter by Client'}
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
            >
              <option value="all">{isAr ? 'كل الملاك والعملاء' : 'All Clients / Owners'}</option>
              {clientOptions.map((client) => (
                <option key={client} value={client}>
                  {client}
                </option>
              ))}
            </Select>
          </div>

          <div className="w-44">
            <Select
              aria-label={isAr ? 'ترتيب حسب' : 'Sort By'}
              value={sortField}
              onChange={(e) => setSortField(e.target.value as ProjectSortField)}
            >
              <option value="updatedAt">{isAr ? 'ترتيب: الأحدث تحديثاً' : 'Sort: Recently Updated'}</option>
              <option value="approvedBudget">{isAr ? 'ترتيب: قيمة المشروع' : 'Sort: Budget (AED)'}</option>
              <option value="paidAmount">{isAr ? 'ترتيب: الدفعات المستلمة' : 'Sort: Payments Received'}</option>
              <option value="actualProgress">{isAr ? 'ترتيب: نسبة الإنجاز' : 'Sort: Progress %'}</option>
              <option value="code">{isAr ? 'ترتيب: الكود' : 'Sort: Code'}</option>
              <option value="name">{isAr ? 'ترتيب: الاسم' : 'Sort: Name'}</option>
            </Select>
          </div>

          <Button
            variant="outline"
            size="sm"
            icon={<ArrowUpDown className="w-3.5 h-3.5" />}
            onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
            aria-label={isAr ? 'عكس اتجاه الترتيب' : 'Toggle sort direction'}
          >
            {sortDir === 'desc' ? (isAr ? 'تنازلي' : 'Desc') : (isAr ? 'تصاعدي' : 'Asc')}
          </Button>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw className="w-3.5 h-3.5" />}
              onClick={handleResetFilters}
            >
              {isAr ? 'إعادة ضبط الفلاتر' : 'Reset Filters'}
            </Button>
          )}
        </div>
      </Card>

      {/* Projects Portfolio DataTable */}
      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            title={isAr ? 'لا توجد مشاريع مطابقة' : 'No Matching Projects'}
            description={
              isAr
                ? 'لم يتم العثور على مشاريع تطابق الفلاتر أو عبارة البحث الحالية.'
                : 'No construction projects matched your current search or filter criteria.'
            }
            actionLabel={hasActiveFilters ? (isAr ? 'إعادة ضبط الفلاتر' : 'Reset Filters') : undefined}
            onAction={hasActiveFilters ? handleResetFilters : undefined}
          />
        ) : (
          <div className="overflow-x-auto max-h-[460px]">
            <table className="w-full text-start text-xs">
              <thead className="bg-[var(--bg-surface-subtle)] border-b border-[var(--border-hairline)] text-[var(--text-muted)] sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-start font-semibold">{isAr ? 'الكود' : 'Code'}</th>
                  <th className="px-4 py-3 text-start font-semibold">{isAr ? 'المشروع والمالك' : 'Project & Owner'}</th>
                  <th className="px-4 py-3 text-start font-semibold">{isAr ? 'النوع والقطاع' : 'Type & Sector'}</th>
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
                      <div>{isAr ? PROJECT_TYPE_LABELS[p.projectType].ar : PROJECT_TYPE_LABELS[p.projectType].en}</div>
                      <div className="text-[11px] text-[var(--text-muted)]">{p.gisData.sectorName}</div>
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
                            aria-label={isAr ? `تعديل ${p.code}` : `Edit ${p.code}`}
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
                            aria-label={isAr ? `حذف ${p.code}` : `Delete ${p.code}`}
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
                <span dir="ltr" className="text-xs font-mono tabular-nums text-[var(--text-muted)]">
                  {formatAED(activeProject.paidAmount, lang)} / {formatAED(activeProject.approvedBudget, lang)}
                </span>
              }
            />
            <div className="divide-y divide-[var(--border-hairline)]">
              {activeProject.paymentMilestones.length === 0 ? (
                <EmptyState
                  title={isAr ? 'لا توجد دفعات مجدولة' : 'No Payment Milestones'}
                  description={
                    isAr
                      ? 'لم يتم تسجيل مراحل دفع لهذا المشروع بعد.'
                      : 'No payment milestones are registered for this project yet.'
                  }
                />
              ) : (
                activeProject.paymentMilestones.map((m) => (
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
                ))
              )}
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

            <div className="divide-y divide-[var(--border-hairline)]">
              {activeProject.documents.length === 0 ? (
                <EmptyState
                  title={isAr ? 'لا توجد وثائق مرفقة بعد' : 'No Documents Uploaded'}
                  description={
                    isAr
                      ? 'ارفع ملفات PDF أو صوراً هندسية لحفظها في الأرشيف السحابي للمشروع.'
                      : 'Upload architectural PDFs or site photos to store them in this project archive.'
                  }
                />
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
        existingProjects={projects}
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
