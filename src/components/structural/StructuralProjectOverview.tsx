import React from 'react';
import {
  Activity,
  Building2,
  Database,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import type { Language, Project } from '../../types/bunyan';
import type {
  DataReliabilityStatus,
  StructuralModelRevision,
  StructuralProject,
  StructuralRole,
  StructuralRolePermissions,
} from '../../modules/structural/types/structural.types';
import type { NormalizedStructuralDataset } from '../../modules/structural/types/structural-results.types';
import {
  Button,
  Card,
  HolographicPanel,
  Select,
  StatusIndicator,
  type StatusTone,
} from '../ui';

interface StructuralProjectOverviewProps {
  lang: Language;
  bunyanProject: Project;
  structuralProject: StructuralProject;
  activeRevision: StructuralModelRevision | null;
  activeDataset: NormalizedStructuralDataset | null;
  structuralRole: StructuralRole;
  permissions: StructuralRolePermissions;
  onChangeStructuralRole: (role: StructuralRole) => void;
  onStartImport: () => void;
  onOpenConnection: () => void;
}

export function getReliabilityTone(rel: DataReliabilityStatus): StatusTone {
  switch (rel) {
    case 'SOURCE_VERIFIED':
      return 'success';
    case 'DERIVED':
      return 'info';
    case 'UNVERIFIED':
      return 'warning';
    case 'FAILED':
      return 'danger';
    case 'MISSING':
    default:
      return 'neutral';
  }
}

export const StructuralProjectOverview: React.FC<StructuralProjectOverviewProps> = ({
  lang,
  bunyanProject,
  structuralProject,
  activeRevision,
  activeDataset,
  structuralRole,
  permissions,
  onChangeStructuralRole,
  onStartImport,
  onOpenConnection,
}) => {
  const roleOptions: Array<{ value: StructuralRole; ar: string; en: string }> = [
    { value: 'structural_engineer', ar: 'مهندس إنشائي (Structural Engineer)', en: 'Structural Engineer' },
    { value: 'project_engineer', ar: 'مهندس مشروع (Project Engineer)', en: 'Project Engineer' },
    { value: 'project_manager', ar: 'مدير مشروع (Project Manager)', en: 'Project Manager' },
    { value: 'administrator', ar: 'مدير النظام (Administrator)', en: 'Administrator' },
    { value: 'read_only_reviewer', ar: 'مراجع قراءة فقط (Read-only Reviewer)', en: 'Read-only Reviewer' },
  ];

  const reliability = activeRevision?.reliability || structuralProject.reliabilitySummary;

  return (
    <div className="space-y-4">
      <HolographicPanel
        title={lang === 'ar' ? structuralProject.name : structuralProject.nameEn}
        subtitle={`${bunyanProject.code} · ${structuralProject.structuralSystem} · ${structuralProject.designCode}`}
        icon={<Building2 className="w-4 h-4" />}
        badge={<StatusIndicator tone={getReliabilityTone(reliability)} label={reliability} />}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={onOpenConnection}>
              {lang === 'ar' ? 'مركز اتصال ETABS v20' : 'ETABS v20 Center'}
            </Button>
            {permissions.canStageImport && (
              <Button size="sm" variant="primary" onClick={onStartImport}>
                {lang === 'ar' ? 'بدء استيراد جديد' : 'New ETABS Import'}
              </Button>
            )}
          </div>
        }
      >
        <div className="p-5 space-y-5">
          {/* Role & Permission Context */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-center p-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)]">
            <div className="lg:col-span-2 space-y-1 text-xs">
              <div className="flex items-center gap-2 font-bold text-[var(--text-primary)]">
                <ShieldCheck className="w-4 h-4 text-[var(--accent-cyan)]" />
                <span>
                  {lang === 'ar'
                    ? 'صلاحيات الذكاء الإنشائي (RBAC)'
                    : 'Structural Intelligence Role & Access Control'}
                </span>
              </div>
              <p className="text-[var(--text-muted)]">
                {lang === 'ar'
                  ? 'يتم التحقق من الصلاحيات على واجهة التطبيق، خادم API (/api/structural)، وقواعد Cloud Firestore.'
                  : 'Permissions are enforced across UI controls, /api/structural backend routes, and Cloud Firestore security rules.'}
              </p>
            </div>
            <div>
              <Select
                label={lang === 'ar' ? 'الدور الإنشائي النشط' : 'Active Structural Role'}
                value={structuralRole}
                onChange={(e) => onChangeStructuralRole(e.target.value as StructuralRole)}
              >
                {roleOptions.map((r) => (
                  <option key={r.value} value={r.value}>
                    {lang === 'ar' ? r.ar : r.en}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {/* Engineering Summary KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <Card padded className="space-y-1">
              <div className="flex items-center justify-between text-[var(--text-muted)]">
                <span>{lang === 'ar' ? 'المراجعات المحفوظة' : 'Saved Revisions'}</span>
                <Database className="w-3.5 h-3.5 text-[var(--accent-cyan)]" />
              </div>
              <div dir="ltr" className="text-xl font-bold font-mono text-[var(--text-primary)]">
                {structuralProject.revisionCount}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] truncate">
                {activeRevision
                  ? `${lang === 'ar' ? 'النشطة:' : 'Active:'} #${activeRevision.revisionNumber}`
                  : lang === 'ar'
                  ? 'بانتظار أول استيراد'
                  : 'Awaiting first import'}
              </div>
            </Card>

            <Card padded className="space-y-1">
              <div className="flex items-center justify-between text-[var(--text-muted)]">
                <span>{lang === 'ar' ? 'الطوابق والشبكات' : 'Stories & Grids'}</span>
                <Layers className="w-3.5 h-3.5 text-[var(--accent-gold)]" />
              </div>
              <div dir="ltr" className="text-xl font-bold font-mono text-[var(--text-primary)]">
                {activeDataset ? `${activeDataset.stories.length} / ${activeDataset.grids.length}` : '0 / 0'}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                {activeDataset ? activeDataset.model.normalizedUnits : 'SI (kN-m)'}
              </div>
            </Card>

            <Card padded className="space-y-1">
              <div className="flex items-center justify-between text-[var(--text-muted)]">
                <span>{lang === 'ar' ? 'العناصر الإنشائية' : 'Frames & Areas'}</span>
                <Building2 className="w-3.5 h-3.5 text-[#00E5A8]" />
              </div>
              <div dir="ltr" className="text-xl font-bold font-mono text-[var(--text-primary)]">
                {activeDataset
                  ? `${activeDataset.frames.length + activeDataset.areas.length}`
                  : '0'}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                {activeDataset
                  ? `${activeDataset.frames.length} F · ${activeDataset.areas.length} A`
                  : lang === 'ar'
                  ? 'غير مستورد'
                  : 'Not imported'}
              </div>
            </Card>

            <Card padded className="space-y-1">
              <div className="flex items-center justify-between text-[var(--text-muted)]">
                <span>{lang === 'ar' ? 'حالة التحقق' : 'Validation State'}</span>
                <Activity className="w-3.5 h-3.5 text-[var(--accent-cyan)]" />
              </div>
              <div className="text-sm font-bold text-[var(--text-primary)] truncate">
                {activeDataset ? activeDataset.validation.status : 'MISSING'}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                {activeDataset
                  ? `${activeDataset.validation.errorCount} ERR · ${activeDataset.validation.warningCount} WARN`
                  : lang === 'ar'
                  ? 'لا توجد بيانات'
                  : 'No active revision'}
              </div>
            </Card>
          </div>
        </div>
      </HolographicPanel>
    </div>
  );
};
