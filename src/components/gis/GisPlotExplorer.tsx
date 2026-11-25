import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Compass, Layers, MapPin, Ruler, Search } from 'lucide-react';
import type { Language, Project } from '../../types/bunyan';
import { analyzeGisPlot, normalizeBoundaryPoints } from '../../utils/gisTakeoffGenerator';
import { Card, CardHeader, Input } from '../ui';

interface GisPlotExplorerProps {
  project: Project;
  projects?: Project[];
  lang: Language;
  canEdit?: boolean;
  onUpdateProject: (p: Project) => void;
  onSelectProject?: (id: string) => void;
}

const SETBACK_LABELS: Record<'front' | 'rear' | 'sideLeft' | 'sideRight', { ar: string; en: string }> = {
  front: { ar: 'الأمامي (م)', en: 'Front (m)' },
  rear: { ar: 'الخلفي (م)', en: 'Rear (m)' },
  sideLeft: { ar: 'الجانب الأيسر (م)', en: 'Left Side (m)' },
  sideRight: { ar: 'الجانب الأيمن (م)', en: 'Right Side (m)' },
};

export const GisPlotExplorer: React.FC<GisPlotExplorerProps> = ({
  project,
  projects = [],
  lang,
  canEdit = true,
  onUpdateProject,
  onSelectProject,
}) => {
  const { gisData } = project;
  const [showSetbacks, setShowSetbacks] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [plotSearch, setPlotSearch] = useState('');

  const isAr = lang === 'ar';

  const matchingPlots = useMemo(() => {
    const q = plotSearch.trim().toLowerCase();
    if (!q) return projects.slice(0, 8);
    return projects
      .filter(
        (p) =>
          p.gisData.plotNumber.toLowerCase().includes(q) ||
          p.gisData.sectorName.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q)
      )
      .slice(0, 10);
  }, [projects, plotSearch]);

  const survey = useMemo(() => analyzeGisPlot(gisData, 'north'), [gisData]);
  const pts = useMemo(() => normalizeBoundaryPoints(gisData), [gisData]);

  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));

  const plotW = Math.max(1, maxX - minX);
  const plotH = Math.max(1, maxY - minY);

  const svgW = 780;
  const svgH = 520;
  const pad = 74;
  const scale = Math.min((svgW - pad * 2) / plotW, (svgH - pad * 2) / plotH);

  const toSvg = (x: number, y: number) => ({
    sx: pad + (x - minX) * scale + ((svgW - pad * 2) - plotW * scale) / 2,
    sy: pad + (y - minY) * scale + ((svgH - pad * 2) - plotH * scale) / 2,
  });

  const polyStr = pts
    .map((p) => {
      const { sx, sy } = toSvg(p.x, p.y);
      return `${sx},${sy}`;
    })
    .join(' ');

  const insetPolySvg = survey.setbackPolygon.map((p) => toSvg(p.x, p.y));
  const insetPolyStr = insetPolySvg.map((p) => `${p.sx},${p.sy}`).join(' ');
  const envCentroid =
    insetPolySvg.length >= 3
      ? {
          cx: insetPolySvg.reduce((s, p) => s + p.sx, 0) / insetPolySvg.length,
          cy: insetPolySvg.reduce((s, p) => s + p.sy, 0) / insetPolySvg.length,
        }
      : { cx: svgW / 2, cy: svgH / 2 };

  const buildableAreaSqM = survey.buildableAreaM2;
  const coveragePct = survey.coveragePct;

  const handleSetbackChange = (field: keyof typeof gisData.setbacks, val: number) => {
    if (!canEdit) return;
    onUpdateProject({
      ...project,
      gisData: {
        ...gisData,
        setbacks: {
          ...gisData.setbacks,
          [field]: Math.max(0, Number.isFinite(val) ? val : 0),
        },
      },
    });
  };

  return (
    <div className="space-y-5">
      {/* Search & Quick Sharjah Plot Bar */}
      {projects.length > 0 && onSelectProject && (
        <Card padded className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="w-full md:w-80">
            <Input
              value={plotSearch}
              onChange={(e) => setPlotSearch(e.target.value)}
              startIcon={<Search className="w-3.5 h-3.5" />}
              placeholder={isAr ? 'ابحث برقم القطعة أو المنطقة (الرحمانية، مويلح...)' : 'Search plot number or Sharjah sector...'}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {matchingPlots.slice(0, 5).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectProject(p.id)}
                className={`px-2.5 py-1.5 rounded-xl border font-mono text-[11px] font-semibold cursor-pointer bunyan-transition ${
                  p.id === project.id
                    ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)] text-white'
                    : 'border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent-cyan)]/50'
                }`}
              >
                {p.gisData.plotNumber} · {p.gisData.sectorName}
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Dominant GIS Cadastral Viewport */}
        <Card className="xl:col-span-8 flex flex-col overflow-hidden">
          <CardHeader
            icon={<Compass className="w-4 h-4" />}
            title={
              isAr
                ? `مخطط الحدود المساحية GIS — قطعة ${gisData.plotNumber}`
                : `GIS Cadastral Plot Boundary — Plot ${gisData.plotNumber}`
            }
            subtitle={`${gisData.sectorName} · ${gisData.zoning} · ${
              survey.boundarySource === 'surveyed_polygon'
                ? isAr
                  ? 'مضلع مساحي فعلي'
                  : 'Surveyed Polygon'
                : isAr
                ? 'حدود تقديرية من المساحة'
                : 'Estimated Bounds'
            }`}
            action={
              <div className="flex items-center gap-1.5 text-xs">
                {[
                  { active: showSetbacks, toggle: () => setShowSetbacks(!showSetbacks), label: isAr ? 'الارتدادات' : 'Setbacks' },
                  { active: showDimensions, toggle: () => setShowDimensions(!showDimensions), label: isAr ? 'الأبعاد' : 'Dimensions' },
                  { active: showGrid, toggle: () => setShowGrid(!showGrid), label: isAr ? 'الشبكة' : 'Grid' },
                ].map((btn, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={btn.toggle}
                    className={`px-2.5 py-1 rounded-xl border text-[11px] font-semibold cursor-pointer bunyan-transition ${
                      btn.active
                        ? 'border-[var(--accent-cyan)]/55 bg-[#2563EB]/10 dark:bg-[#38BDF8]/15 text-[var(--accent-cyan)]'
                        : 'border-[var(--border-hairline)] text-[var(--text-muted)]'
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            }
          />

          <div className="bg-[#0C1424] p-4 flex-1 flex items-center justify-center min-h-[520px] relative">
            <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full max-h-[540px]">
              <defs>
                <pattern id="gisGrid" width="32" height="32" patternUnits="userSpaceOnUse">
                  <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(56,189,248,0.12)" strokeWidth="1" />
                </pattern>
              </defs>
              {showGrid && <rect width={svgW} height={svgH} fill="url(#gisGrid)" />}

              {/* Road Frontage Indicator */}
              <rect x={toSvg(minX, minY).sx} y={toSvg(minX, minY).sy - 36} width={plotW * scale} height="22" fill="rgba(56,189,248,0.08)" stroke="rgba(56,189,248,0.32)" strokeWidth="1" rx="4" />
              <text
                x={toSvg(minX + plotW / 2, minY).sx}
                y={toSvg(minX, minY).sy - 21}
                textAnchor="middle"
                fill="#38BDF8"
                fontSize="11"
                fontFamily="monospace"
              >
                {isAr ? 'شارع عرض 18 م (الواجهة الأمامية)' : '18m ACCESS ROAD (FRONTAGE)'}
              </text>

              {/* Plot Polygon */}
              <polygon
                points={polyStr}
                fill="rgba(214,166,79,0.12)"
                stroke="#D6A64F"
                strokeWidth="2.5"
              />

              {/* True Polygonal Inward-Offset Buildable Setback Envelope */}
              {showSetbacks && insetPolySvg.length >= 3 && (
                <>
                  <polygon
                    points={insetPolyStr}
                    fill="rgba(56,189,248,0.10)"
                    stroke="#38BDF8"
                    strokeWidth="2"
                    strokeDasharray="6 4"
                  />
                  <text
                    x={envCentroid.cx}
                    y={envCentroid.cy}
                    textAnchor="middle"
                    fill="#E2E8F0"
                    fontSize="12"
                    fontFamily="monospace"
                  >
                    {isAr ? 'النطاق المسموح للبناء' : 'BUILDABLE ENVELOPE'} ({buildableAreaSqM.toFixed(1)} m²)
                  </text>
                </>
              )}

              {/* Vertices, Edge Lengths & Survey Azimuths */}
              {pts.map((pt, idx) => {
                const p1 = toSvg(pt.x, pt.y);
                const next = pts[(idx + 1) % pts.length];
                const p2 = toSvg(next.x, next.y);
                const edgeSurvey = survey.edges[idx];
                const midX = (p1.sx + p2.sx) / 2;
                const midY = (p1.sy + p2.sy) / 2;
                return (
                  <g key={idx}>
                    <circle cx={p1.sx} cy={p1.sy} r="5.5" fill="#10B981" stroke="#090E1A" strokeWidth="1.5" />
                    <text x={p1.sx + 8} y={p1.sy - 8} fill="#F8FAFC" fontSize="10" fontFamily="monospace">
                      {pt.label || `P${idx + 1}`}
                    </text>
                    {showDimensions && edgeSurvey && (
                      <text x={midX} y={midY - 6} textAnchor="middle" fill="#FDE68A" fontSize="10.5" fontFamily="monospace">
                        {edgeSurvey.lengthM.toFixed(2)}m · {edgeSurvey.azimuthDeg.toFixed(0)}° ({edgeSurvey.bearingCardinal})
                      </text>
                    )}
                  </g>
                );
              })}

              {/* North Arrow */}
              <g transform={`translate(${svgW - 48}, 48)`}>
                <circle r="18" fill="rgba(9,14,26,0.9)" stroke="#38BDF8" strokeOpacity="0.45" strokeWidth="1" />
                <path d="M 0 -12 L 5 6 L 0 2 L -5 6 Z" fill="#38BDF8" />
                <text y="16" textAnchor="middle" fill="#CBD5E1" fontSize="9" fontFamily="monospace">N</text>
              </g>
            </svg>
          </div>
        </Card>

        {/* Plot Telemetry & Setbacks Panel */}
        <div className="xl:col-span-4 space-y-4">
          <Card>
            <CardHeader
              icon={<MapPin className="w-4 h-4" />}
              title={isAr ? 'البيانات المساحية والتنظيمية' : 'Cadastral & Zoning Data'}
            />
            <div className="p-5 space-y-2.5 text-xs">
              <div className="flex justify-between py-1.5 border-b border-[var(--border-hairline)]">
                <span className="text-[var(--text-muted)]">{isAr ? 'مصدر الإحداثيات' : 'Survey Reliability'}</span>
                <span
                  className={`px-2 py-0.5 rounded font-mono text-[10px] font-semibold ${
                    survey.reliability === 'verified_survey'
                      ? 'bg-emerald-500/15 text-emerald-500'
                      : survey.reliability === 'partial_estimate'
                      ? 'bg-amber-500/15 text-amber-500'
                      : 'bg-rose-500/15 text-rose-500'
                  }`}
                >
                  {survey.coordinateStatus === 'missing'
                    ? isAr
                      ? 'إحداثيات مفقودة'
                      : 'Missing Coords'
                    : survey.boundarySource === 'surveyed_polygon'
                    ? isAr
                      ? 'مضلع مساحي · UTM 40N'
                      : 'Surveyed · UTM 40N'
                    : isAr
                    ? 'حدود تقديرية'
                    : 'Estimated Bounds'}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[var(--border-hairline)]">
                <span className="text-[var(--text-muted)]">{isAr ? 'الإمارة / القطاع' : 'Emirate / Sector'}</span>
                <span className="font-semibold text-[var(--text-primary)]">{gisData.sectorName}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[var(--border-hairline)]">
                <span className="text-[var(--text-muted)]">{isAr ? 'رقم القطعة / الحوض' : 'Plot / Basin'}</span>
                <span dir="ltr" className="font-mono font-semibold text-[var(--accent-cyan)]">{gisData.plotNumber} / {gisData.basinNumber}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[var(--border-hairline)]">
                <span className="text-[var(--text-muted)]">{isAr ? 'الإحداثيات WGS84' : 'WGS84 Coordinates'}</span>
                {survey.coordinateStatus === 'missing' ? (
                  <span className="inline-flex items-center gap-1 text-rose-500 font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {isAr ? 'غير متوفرة' : 'Unavailable'}
                  </span>
                ) : (
                  <span dir="ltr" className="font-mono tabular-nums text-[var(--text-primary)]">
                    {survey.latitude!.toFixed(5)}, {survey.longitude!.toFixed(5)}
                  </span>
                )}
              </div>
              <div className="flex justify-between py-1.5 border-b border-[var(--border-hairline)]">
                <span className="text-[var(--text-muted)]">{isAr ? 'إسقاط UTM 40N' : 'UTM Zone 40N'}</span>
                {survey.utm40N ? (
                  <span dir="ltr" className="font-mono tabular-nums text-[11px] text-[var(--accent-cyan)]">
                    E:{survey.utm40N.eastingM.toFixed(2)} · N:{survey.utm40N.northingM.toFixed(2)}
                  </span>
                ) : (
                  <span className="text-[var(--text-muted)] font-mono">—</span>
                )}
              </div>
              <div className="flex justify-between py-1.5 border-b border-[var(--border-hairline)]">
                <span className="text-[var(--text-muted)]">{isAr ? 'المساحة المساحية / المعتمدة' : 'Surveyed / Plot Area'}</span>
                <span dir="ltr" className="font-mono tabular-nums font-semibold text-[var(--text-primary)]">
                  {survey.surveyedAreaM2.toFixed(1)} m² / {gisData.plotAreaSqM} m²
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[var(--border-hairline)]">
                <span className="text-[var(--text-muted)]">{isAr ? 'محيط القسيمة' : 'Plot Perimeter'}</span>
                <span dir="ltr" className="font-mono tabular-nums text-[var(--text-primary)]">
                  {survey.perimeterM.toFixed(2)} m
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[var(--border-hairline)]">
                <span className="text-[var(--text-muted)]">{isAr ? 'نسبة البناء المسموحة' : 'Max Envelope Coverage'}</span>
                <span dir="ltr" className="font-mono tabular-nums font-semibold text-[#00E5A8]">
                  {coveragePct.toFixed(1)}% ({buildableAreaSqM.toFixed(1)} m²)
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-[var(--text-muted)]">{isAr ? 'الاستعمال المعتمد' : 'Zoning'}</span>
                <span className="font-medium text-[var(--text-primary)]">{gisData.zoning}</span>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              icon={<Ruler className="w-4 h-4" />}
              title={isAr ? 'تعديل الارتدادات النظامية (م)' : 'Municipal Setbacks (m)'}
            />
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                {(['front', 'rear', 'sideLeft', 'sideRight'] as const).map((side) => (
                  <label key={side} className="space-y-1">
                    <span className="text-[var(--text-muted)] block">
                      {isAr ? SETBACK_LABELS[side].ar : SETBACK_LABELS[side].en}
                    </span>
                    <input
                      type="number"
                      step="0.5"
                      min={0}
                      disabled={!canEdit}
                      value={gisData.setbacks[side]}
                      onChange={(e) => handleSetbackChange(side, Number(e.target.value))}
                      className="w-full h-8 px-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-[var(--text-primary)] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/45 disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </label>
                ))}
              </div>

              <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-[#00E5A8]">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  {isAr
                    ? 'مطابق لاشتراطات الارتداد لدائرة التخطيط والمساحة بالشارقة'
                    : 'Compliant with Sharjah DTPS setback code'}
                </span>
              </div>
            </div>
          </Card>

          <Card padded className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-[var(--text-secondary)]">
              <Layers className="w-4 h-4 text-[var(--accent-cyan)]" />
              <span>{isAr ? 'مساحة البناء الحالية BUA' : 'Built-Up Area (BUA)'}</span>
            </div>
            <span dir="ltr" className="font-mono tabular-nums font-bold text-[var(--text-primary)]">
              {gisData.builtUpAreaSqFt.toLocaleString()} sq.ft
            </span>
          </Card>
        </div>
      </div>
    </div>
  );
};
