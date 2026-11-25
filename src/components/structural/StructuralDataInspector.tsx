import React, { useState } from 'react';
import { Box, Layers, Scale } from 'lucide-react';
import type { Language } from '../../types/bunyan';
import type { NormalizedStructuralDataset } from '../../modules/structural/types/structural-results.types';
import { Card, CardHeader, EmptyState, SegmentedTabs, StatusIndicator } from '../ui';
import { getReliabilityTone } from './StructuralProjectOverview';

interface StructuralDataInspectorProps {
  lang: Language;
  dataset: NormalizedStructuralDataset | null;
  sectionFocus?: 'model' | 'materials' | 'loads';
}

export const StructuralDataInspector: React.FC<StructuralDataInspectorProps> = ({
  lang,
  dataset,
  sectionFocus = 'model',
}) => {
  const [subTab, setSubTab] = useState<'stories' | 'frames' | 'areas' | 'materials' | 'sections' | 'loads'>(
    sectionFocus === 'materials' ? 'materials' : sectionFocus === 'loads' ? 'loads' : 'stories'
  );

  if (!dataset) {
    return (
      <Card>
        <EmptyState
          icon={<Box className="w-5 h-5" />}
          title={lang === 'ar' ? 'لا يوجد نموذج إنشائي محمل' : 'No Structural Model Revision Loaded'}
          description={
            lang === 'ar'
              ? 'قم باستيراد نموذج من ETABS v20 أو رفع جداول ETABS المصدرة لعرض البيانات المعيارية ومصدر كل قيمة.'
              : 'Import an active CSI ETABS v20 model or exported ETABS tables to inspect normalized engineering entities and provenance.'
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          value={subTab}
          onChange={setSubTab}
          items={[
            { id: 'stories', label: lang === 'ar' ? 'الطوابق' : 'Stories', count: dataset.stories.length },
            { id: 'frames', label: lang === 'ar' ? 'الإطارات' : 'Frames', count: dataset.frames.length },
            { id: 'areas', label: lang === 'ar' ? 'البلاطات والحوائط' : 'Areas', count: dataset.areas.length },
            { id: 'materials', label: lang === 'ar' ? 'المواد' : 'Materials', count: dataset.materials.length },
            { id: 'sections', label: lang === 'ar' ? 'المقاطع' : 'Sections', count: dataset.sections.length },
            { id: 'loads', label: lang === 'ar' ? 'الأحمال والتراكيب' : 'Loads', count: dataset.loadCombinations.length },
          ]}
        />
        <StatusIndicator
          tone={getReliabilityTone(dataset.model.provenance.reliability)}
          label={`${dataset.model.sourceApplication} · ${dataset.model.originalUnits} → ${dataset.model.normalizedUnits}`}
        />
      </div>

      {subTab === 'stories' && (
        <Card className="overflow-hidden">
          <CardHeader
            title={lang === 'ar' ? 'جدول الطوابق والمناسيب' : 'Normalized Stories & Elevations'}
            subtitle={
              lang === 'ar'
                ? 'عرض القيمة المحولة (SI) مع الاحتفاظ بالقيمة والوحدة الأصلية من ETABS'
                : 'Displays SI normalized values alongside preserved raw ETABS values & units'
            }
            icon={<Layers className="w-4 h-4" />}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-[var(--bg-surface-subtle)] text-[var(--text-muted)] border-b border-[var(--border-hairline)]">
                <tr>
                  <th className="p-3 text-start">{lang === 'ar' ? 'الطابق' : 'Story'}</th>
                  <th className="p-3 text-start">{lang === 'ar' ? 'المنسوب (m)' : 'Elevation (m)'}</th>
                  <th className="p-3 text-start">{lang === 'ar' ? 'الارتفاع (m)' : 'Height (m)'}</th>
                  <th className="p-3 text-start">{lang === 'ar' ? 'القيمة الأصلية' : 'Raw ETABS Value'}</th>
                  <th className="p-3 text-start">{lang === 'ar' ? 'الموثوقية' : 'Reliability'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {dataset.stories.map((st) => (
                  <tr key={st.id} className="hover:bg-[var(--bg-surface-subtle)]/50">
                    <td className="p-3 font-semibold text-[var(--text-primary)]">{st.name}</td>
                    <td dir="ltr" className="p-3 font-mono">{st.elevationM.toFixed(3)} m</td>
                    <td dir="ltr" className="p-3 font-mono">{st.heightM.toFixed(3)} m</td>
                    <td dir="ltr" className="p-3 font-mono text-[var(--text-muted)]">
                      {st.rawHeight.rawValue} {st.rawHeight.rawUnit}
                    </td>
                    <td className="p-3">
                      <StatusIndicator tone={getReliabilityTone(st.provenance.reliability)} label={st.provenance.reliability} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {subTab === 'frames' && (
        <Card className="overflow-hidden">
          <CardHeader
            title={lang === 'ar' ? 'العناصر الإطارية (أعمدة / كمرات)' : 'Frame Elements (Columns / Beams)'}
            icon={<Box className="w-4 h-4" />}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-[var(--bg-surface-subtle)] text-[var(--text-muted)] border-b border-[var(--border-hairline)]">
                <tr>
                  <th className="p-3 text-start">{lang === 'ar' ? 'العنصر' : 'Element'}</th>
                  <th className="p-3 text-start">{lang === 'ar' ? 'الدور' : 'Role'}</th>
                  <th className="p-3 text-start">{lang === 'ar' ? 'الطابق' : 'Story'}</th>
                  <th className="p-3 text-start">{lang === 'ar' ? 'المقطع' : 'Section'}</th>
                  <th className="p-3 text-start">{lang === 'ar' ? 'الطول المشتق (DERIVED)' : 'Derived Length'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {dataset.frames.slice(0, 150).map((f) => (
                  <tr key={f.id}>
                    <td dir="ltr" className="p-3 font-mono font-semibold">{f.name}</td>
                    <td className="p-3">{f.elementRole}</td>
                    <td className="p-3">{f.story || '—'}</td>
                    <td dir="ltr" className="p-3 font-mono">{f.sectionName}</td>
                    <td dir="ltr" className="p-3 font-mono">
                      {f.derivedLengthM !== undefined ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span>{f.derivedLengthM.toFixed(3)} m</span>
                          <StatusIndicator tone="info" label="DERIVED" />
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {subTab === 'areas' && (
        <Card className="overflow-hidden">
          <CardHeader title={lang === 'ar' ? 'البلاطات والحوائط الإنشائية' : 'Area Elements (Slabs & Walls)'} />
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-[var(--bg-surface-subtle)] text-[var(--text-muted)] border-b border-[var(--border-hairline)]">
                <tr>
                  <th className="p-3 text-start">{lang === 'ar' ? 'المعرف' : 'Area'}</th>
                  <th className="p-3 text-start">{lang === 'ar' ? 'النوع' : 'Role'}</th>
                  <th className="p-3 text-start">{lang === 'ar' ? 'الطابق' : 'Story'}</th>
                  <th className="p-3 text-start">{lang === 'ar' ? 'المقطع' : 'Section'}</th>
                  <th className="p-3 text-start">{lang === 'ar' ? 'المساحة المسقطة (DERIVED)' : 'Derived Plan Area'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {dataset.areas.slice(0, 150).map((a) => (
                  <tr key={a.id}>
                    <td dir="ltr" className="p-3 font-mono font-semibold">{a.name}</td>
                    <td className="p-3">{a.elementRole}</td>
                    <td className="p-3">{a.story || '—'}</td>
                    <td dir="ltr" className="p-3 font-mono">{a.sectionName}</td>
                    <td dir="ltr" className="p-3 font-mono">
                      {a.derivedPlanAreaM2 !== undefined ? `${a.derivedPlanAreaM2.toFixed(3)} m2` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {subTab === 'materials' && (
        <Card className="overflow-hidden">
          <CardHeader title={lang === 'ar' ? 'خصائص المواد الإنشائية' : 'Structural Materials (SI MPa & Raw)'} icon={<Scale className="w-4 h-4" />} />
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-[var(--bg-surface-subtle)] text-[var(--text-muted)] border-b border-[var(--border-hairline)]">
                <tr>
                  <th className="p-3 text-start">{lang === 'ar' ? 'المادة' : 'Material'}</th>
                  <th className="p-3 text-start">{lang === 'ar' ? 'النوع' : 'Type'}</th>
                  <th className="p-3 text-start">E (MPa)</th>
                  <th className="p-3 text-start">fc / fy (MPa)</th>
                  <th className="p-3 text-start">{lang === 'ar' ? 'الوزن النوعي (kN/m3)' : 'Unit Weight'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {dataset.materials.map((m) => (
                  <tr key={m.id}>
                    <td dir="ltr" className="p-3 font-mono font-semibold">{m.name}</td>
                    <td className="p-3">{m.materialType}</td>
                    <td dir="ltr" className="p-3 font-mono">{m.modulusEMPa.toLocaleString()}</td>
                    <td dir="ltr" className="p-3 font-mono">{m.characteristicStrengthMPa.toFixed(2)}</td>
                    <td dir="ltr" className="p-3 font-mono">{m.unitWeightKNPerM3.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {subTab === 'sections' && (
        <Card className="overflow-hidden">
          <CardHeader title={lang === 'ar' ? 'المقاطع الإنشائية (Frame & Area)' : 'Structural Section Definitions'} />
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-[var(--bg-surface-subtle)] text-[var(--text-muted)] border-b border-[var(--border-hairline)]">
                <tr>
                  <th className="p-3 text-start">{lang === 'ar' ? 'المقطع' : 'Section'}</th>
                  <th className="p-3 text-start">{lang === 'ar' ? 'الفئة' : 'Category'}</th>
                  <th className="p-3 text-start">{lang === 'ar' ? 'المادة' : 'Material'}</th>
                  <th className="p-3 text-start">{lang === 'ar' ? 'العمق / السماكة (m)' : 'Depth / Thk (m)'}</th>
                  <th className="p-3 text-start">{lang === 'ar' ? 'العرض (m)' : 'Width (m)'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {dataset.sections.map((s) => (
                  <tr key={s.id}>
                    <td dir="ltr" className="p-3 font-mono font-semibold">{s.name}</td>
                    <td className="p-3">{s.category} ({s.shapeOrType})</td>
                    <td dir="ltr" className="p-3 font-mono">{s.materialName || '—'}</td>
                    <td dir="ltr" className="p-3 font-mono">{s.depthOrThicknessM.toFixed(4)}</td>
                    <td dir="ltr" className="p-3 font-mono">{s.widthM.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {subTab === 'loads' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="overflow-hidden">
            <CardHeader title={lang === 'ar' ? 'أنماط وحالات الأحمال' : 'Load Patterns & Cases'} />
            <div className="p-4 space-y-2 text-xs">
              {dataset.loadPatterns.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--border-hairline)]">
                  <span className="font-mono font-semibold">{p.name}</span>
                  <span className="text-[var(--text-muted)]">{p.patternType} · SW×{p.selfWeightMultiplier}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title={lang === 'ar' ? 'تراكيب الأحمال (Combinations)' : 'Load Combinations'} />
            <div className="p-4 space-y-2 text-xs">
              {dataset.loadCombinations.map((c) => (
                <div key={c.id} className="p-2.5 rounded-lg border border-[var(--border-hairline)] space-y-1">
                  <div className="font-mono font-semibold text-[var(--text-primary)]">{c.name}</div>
                  <div dir="ltr" className="text-[11px] font-mono text-[var(--text-muted)]">
                    {c.items.map((i) => `${i.scaleFactor}·${i.caseOrComboName}`).join(' + ')}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
