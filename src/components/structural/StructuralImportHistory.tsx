import React from 'react';
import { History, Lock } from 'lucide-react';
import type { Language } from '../../types/bunyan';
import type {
  StructuralImportJob,
  StructuralModelRevision,
} from '../../modules/structural/types/structural.types';
import { Button, Card, CardHeader, EmptyState, StatusIndicator } from '../ui';
import { getReliabilityTone } from './StructuralProjectOverview';

interface StructuralImportHistoryProps {
  lang: Language;
  revisions: StructuralModelRevision[];
  jobs: StructuralImportJob[];
  activeRevisionId: string | null;
  onSelectRevision: (revisionId: string) => void;
}

export const StructuralImportHistory: React.FC<StructuralImportHistoryProps> = ({
  lang,
  revisions,
  jobs,
  activeRevisionId,
  onSelectRevision,
}) => {
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <CardHeader
          title={lang === 'ar' ? 'سجل المراجعات غير القابلة للتعديل' : 'Immutable Model Revision History'}
          subtitle={
            lang === 'ar'
              ? 'كل عملية استيراد مؤكدة تحفظ لقطة إصدار مستقلة بدون استبدال المراجعات السابقة'
              : 'Every confirmed import creates a versioned immutable snapshot without overwriting prior revisions'
          }
          icon={<History className="w-4 h-4" />}
        />
        {revisions.length === 0 ? (
          <EmptyState
            icon={<History className="w-5 h-5" />}
            title={lang === 'ar' ? 'لا توجد مراجعات محفوظة' : 'No Revisions Saved Yet'}
            description={
              lang === 'ar'
                ? 'استخدم مركز الاستيراد لمعاينة وتأكيد أول مراجعة للنموذج الإنشائي.'
                : 'Use Structural Import Center to stage and confirm your first model revision.'
            }
          />
        ) : (
          <div className="divide-y divide-[var(--border-hairline)]">
            {revisions.map((rev) => {
              const isActive = rev.id === activeRevisionId;
              return (
                <div
                  key={rev.id}
                  className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                    isActive ? 'bg-[#0284C7]/8 dark:bg-[#00F0FF]/8' : ''
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-[var(--text-primary)]">{rev.label}</span>
                      <StatusIndicator tone={getReliabilityTone(rev.reliability)} label={rev.reliability} />
                      <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                        <Lock className="w-3 h-3" />
                        {lang === 'ar' ? 'غير قابل للتعديل' : 'Immutable'}
                      </span>
                    </div>
                    <div dir="ltr" className="text-[11px] font-mono text-[var(--text-muted)]">
                      {rev.id} · Hash: {rev.sourceHash} · By: {rev.createdByName} · {rev.createdAt}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      {rev.summary.stories} Stories · {rev.summary.frames} Frames · {rev.summary.areas} Areas ·{' '}
                      {rev.summary.materials} Materials · {rev.summary.loadCombinations} Combos
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={isActive ? 'cyan' : 'outline'}
                    onClick={() => onSelectRevision(rev.id)}
                  >
                    {isActive
                      ? lang === 'ar'
                        ? 'المراجعة النشطة'
                        : 'Active Revision'
                      : lang === 'ar'
                      ? 'تبديل العرض لهذه المراجعة'
                      : 'Inspect Revision'}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {jobs.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader title={lang === 'ar' ? 'سجل وظائف الاستيراد' : 'Import Job Execution Log'} />
          <div className="divide-y divide-[var(--border-hairline)] text-xs">
            {jobs.map((job) => (
              <div key={job.id} className="p-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-mono font-semibold text-[var(--text-primary)]">
                    {job.id} · {job.sourceMode}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    {job.sourceFileReference} · {job.startedAt}
                  </div>
                </div>
                <StatusIndicator
                  tone={job.status === 'CONFIRMED' ? 'success' : job.status === 'FAILED' ? 'danger' : 'warning'}
                  label={`${job.status} (${job.currentStep}/${job.totalSteps})`}
                />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
