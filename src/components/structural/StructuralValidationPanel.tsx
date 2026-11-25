import React from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import type { Language } from '../../types/bunyan';
import type { StructuralValidation } from '../../modules/structural/types/structural.types';
import { Card, CardHeader, EmptyState, StatusIndicator } from '../ui';
import { getReliabilityTone } from './StructuralProjectOverview';

interface StructuralValidationPanelProps {
  lang: Language;
  validation: StructuralValidation | null;
}

export const StructuralValidationPanel: React.FC<StructuralValidationPanelProps> = ({
  lang,
  validation,
}) => {
  if (!validation) {
    return (
      <Card>
        <EmptyState
          icon={<ShieldAlert className="w-5 h-5" />}
          title={lang === 'ar' ? 'لا يوجد تقرير تحقق بعد' : 'No Validation Audit Yet'}
          description={
            lang === 'ar'
              ? 'ستظهر هنا نتائج التحقق من اكتمال الطوابق، ترابط العناصر، المواد، الأحمال، وموثوقية البيانات.'
              : 'Story continuity, frame/area connectivity, material links, load combos, and reliability verdicts appear here after import.'
          }
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={lang === 'ar' ? 'مركز التحقق الهندسي وموثوقية البيانات' : 'Engineering Validation & Reliability Center'}
        subtitle={`${validation.errorCount} Errors · ${validation.warningCount} Warnings · Checked ${validation.checkedAt}`}
        icon={<ShieldAlert className="w-4 h-4" />}
        badge={<StatusIndicator tone={getReliabilityTone(validation.reliability)} label={validation.reliability} />}
      />
      <div className="p-4 space-y-2.5 text-xs">
        {validation.issues.length === 0 ? (
          <div className="p-4 rounded-xl border border-[#00E5A8]/30 bg-[#00E5A8]/10 flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[#00E5A8]" />
            <span className="font-semibold text-[var(--text-primary)]">
              {lang === 'ar'
                ? 'اجتاز النموذج الإنشائي جميع فحوصات الاكتمال والترابط بدون أخطاء أو تحذيرات.'
                : 'Structural model passed all completeness and integrity checks with zero warnings.'}
            </span>
          </div>
        ) : (
          validation.issues.map((issue) => (
            <div
              key={issue.id}
              className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                issue.severity === 'ERROR'
                  ? 'border-[#FF405C]/35 bg-[#FF405C]/10'
                  : 'border-[#FF9D42]/35 bg-[#FF9D42]/10'
              }`}
            >
              <AlertTriangle
                className={`w-4 h-4 shrink-0 mt-0.5 ${
                  issue.severity === 'ERROR' ? 'text-[#FF405C]' : 'text-[#FF9D42]'
                }`}
              />
              <div className="space-y-0.5 min-w-0">
                <div className="font-mono font-bold text-[var(--text-primary)]">
                  [{issue.severity}] {issue.code} · {issue.entityType} ({issue.entityId})
                </div>
                <p className="text-[var(--text-secondary)]">
                  {lang === 'ar' ? issue.messageAr : issue.messageEn}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
};
