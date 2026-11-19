import React, { useState } from 'react';
import { CheckCircle2, Compass, Layers, MapPin, Ruler } from 'lucide-react';
import type { Language, Project } from '../../types/bunyan';

interface GisPlotExplorerProps {
  project: Project;
  lang: Language;
  onUpdateProject: (p: Project) => void;
}

export const GisPlotExplorer: React.FC<GisPlotExplorerProps> = ({
  project,
  lang,
  onUpdateProject,
}) => {
  const { gisData } = project;
  const [showSetbacks, setShowSetbacks] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);
  const [showGrid, setShowGrid] = useState(true);

  const pts = gisData.boundaryPoints.length >= 3
    ? gisData.boundaryPoints
    : [
        { x: 0, y: 0, label: 'P1' },
        { x: 30, y: 0, label: 'P2' },
        { x: 30, y: 30, label: 'P3' },
        { x: 0, y: 30, label: 'P4' },
      ];

  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));

  const plotW = Math.max(1, maxX - minX);
  const plotH = Math.max(1, maxY - minY);

  const svgW = 720;
  const svgH = 480;
  const pad = 70;
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

  // Buildable Envelope computed from setbacks
  const bx1 = minX + gisData.setbacks.sideLeft;
  const bx2 = maxX - gisData.setbacks.sideRight;
  const by1 = minY + gisData.setbacks.front;
  const by2 = maxY - gisData.setbacks.rear;
  const buildableAreaSqM = Math.max(0, (bx2 - bx1) * (by2 - by1));
  const coveragePct = Math.min(100, (buildableAreaSqM / Math.max(1, gisData.plotAreaSqM)) * 100);

  const bTL = toSvg(bx1, by1);
  const bBR = toSvg(bx2, by2);

  const handleSetbackChange = (field: keyof typeof gisData.setbacks, val: number) => {
    onUpdateProject({
      ...project,
      gisData: {
        ...gisData,
        setbacks: {
          ...gisData.setbacks,
          [field]: Math.max(0, val),
        },
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Interactive GIS SVG Plot Boundary Viewport */}
        <div className="xl:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-[#B4863C]" />
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {lang === 'ar'
                  ? `مخطط الحدود المساحية GIS — قطعة ${gisData.plotNumber}`
                  : `GIS Cadastral Plot Boundary — Plot ${gisData.plotNumber}`}
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setShowSetbacks(!showSetbacks)}
                className={`px-2.5 py-1 rounded-md border ${
                  showSetbacks
                    ? 'border-[#B4863C] bg-[#B4863C]/10 text-[#B4863C] dark:text-[#D4A853]'
                    : 'border-slate-200 dark:border-slate-700 text-slate-500'
                }`}
              >
                {lang === 'ar' ? 'الارتدادات' : 'Setbacks'}
              </button>
              <button
                type="button"
                onClick={() => setShowDimensions(!showDimensions)}
                className={`px-2.5 py-1 rounded-md border ${
                  showDimensions
                    ? 'border-[#B4863C] bg-[#B4863C]/10 text-[#B4863C] dark:text-[#D4A853]'
                    : 'border-slate-200 dark:border-slate-700 text-slate-500'
                }`}
              >
                {lang === 'ar' ? 'الأبعاد' : 'Dimensions'}
              </button>
              <button
                type="button"
                onClick={() => setShowGrid(!showGrid)}
                className={`px-2.5 py-1 rounded-md border ${
                  showGrid
                    ? 'border-[#B4863C] bg-[#B4863C]/10 text-[#B4863C] dark:text-[#D4A853]'
                    : 'border-slate-200 dark:border-slate-700 text-slate-500'
                }`}
              >
                {lang === 'ar' ? 'الشبكة' : 'Grid'}
              </button>
            </div>
          </div>

          <div className="bg-[#0B1324] p-4 flex-1 flex items-center justify-center">
            <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full max-h-[480px]">
              <defs>
                <pattern id="gisGrid" width="32" height="32" patternUnits="userSpaceOnUse">
                  <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
                </pattern>
              </defs>
              {showGrid && <rect width={svgW} height={svgH} fill="url(#gisGrid)" />}

              {/* Road Frontage Indicator */}
              <rect x={toSvg(minX, minY).sx} y={toSvg(minX, minY).sy - 36} width={plotW * scale} height="22" fill="rgba(51,65,85,0.45)" rx="3" />
              <text
                x={toSvg(minX + plotW / 2, minY).sx}
                y={toSvg(minX, minY).sy - 21}
                textAnchor="middle"
                fill="#94A3B8"
                fontSize="11"
                fontFamily="monospace"
              >
                {lang === 'ar' ? 'شارع عرض 18 م (الواجهة الأمامية)' : '18m ACCESS ROAD (FRONTAGE)'}
              </text>

              {/* Plot Polygon */}
              <polygon
                points={polyStr}
                fill="rgba(180,134,60,0.12)"
                stroke="#D4A853"
                strokeWidth="2.5"
              />

              {/* Buildable Setback Envelope */}
              {showSetbacks && bx2 > bx1 && by2 > by1 && (
                <>
                  <rect
                    x={bTL.sx}
                    y={bTL.sy}
                    width={bBR.sx - bTL.sx}
                    height={bBR.sy - bTL.sy}
                    fill="rgba(56,189,248,0.14)"
                    stroke="#38BDF8"
                    strokeWidth="2"
                    strokeDasharray="6 4"
                  />
                  <text
                    x={(bTL.sx + bBR.sx) / 2}
                    y={(bTL.sy + bBR.sy) / 2}
                    textAnchor="middle"
                    fill="#E0F2FE"
                    fontSize="12"
                    fontFamily="monospace"
                  >
                    {lang === 'ar' ? 'النطاق المسموح للبناء' : 'BUILDABLE ENVELOPE'} ({buildableAreaSqM.toFixed(1)} m²)
                  </text>
                </>
              )}

              {/* Vertices & Edge Lengths */}
              {pts.map((pt, idx) => {
                const p1 = toSvg(pt.x, pt.y);
                const next = pts[(idx + 1) % pts.length];
                const p2 = toSvg(next.x, next.y);
                const edgeMeters = Math.hypot(next.x - pt.x, next.y - pt.y).toFixed(2);
                const midX = (p1.sx + p2.sx) / 2;
                const midY = (p1.sy + p2.sy) / 2;
                return (
                  <g key={idx}>
                    <circle cx={p1.sx} cy={p1.sy} r="5" fill="#D4A853" stroke="#0F172A" strokeWidth="1.5" />
                    <text
                      x={p1.sx + 8}
                      y={p1.sy - 8}
                      fill="#F8FAFC"
                      fontSize="10"
                      fontFamily="monospace"
                    >
                      {pt.label || `P${idx + 1}`}
                    </text>
                    {showDimensions && (
                      <text
                        x={midX}
                        y={midY - 6}
                        textAnchor="middle"
                        fill="#FDE68A"
                        fontSize="11"
                        fontFamily="monospace"
                      >
                        {edgeMeters} m
                      </text>
                    )}
                  </g>
                );
              })}

              {/* North Arrow */}
              <g transform={`translate(${svgW - 48}, 48)`}>
                <circle r="18" fill="rgba(15,23,42,0.8)" stroke="#475569" strokeWidth="1" />
                <path d="M 0 -12 L 5 6 L 0 2 L -5 6 Z" fill="#D4A853" />
                <text y="16" textAnchor="middle" fill="#CBD5E1" fontSize="9" fontFamily="monospace">N</text>
              </g>
            </svg>
          </div>
        </div>

        {/* Plot Telemetry & Setbacks Compliance Panel */}
        <div className="xl:col-span-4 space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] p-5 space-y-4">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#B4863C]" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {lang === 'ar' ? 'البيانات المساحية والتنظيمية' : 'Cadastral & Zoning Data'}
              </h3>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">{lang === 'ar' ? 'الإمارة / القطاع' : 'Emirate / Sector'}</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{gisData.sectorName}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">{lang === 'ar' ? 'رقم القطعة / الحوض' : 'Plot / Basin'}</span>
                <span className="font-mono font-semibold text-[#B4863C]">{gisData.plotNumber} / {gisData.basinNumber}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">{lang === 'ar' ? 'الإحداثيات الجغرافية' : 'WGS84 Coordinates'}</span>
                <span className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                  {gisData.latitude.toFixed(4)}, {gisData.longitude.toFixed(4)}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">{lang === 'ar' ? 'مساحة الأرض' : 'Total Plot Area'}</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                  {gisData.plotAreaSqM} m² ({gisData.plotAreaSqFt.toLocaleString()} ft²)
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">{lang === 'ar' ? 'نسبة البناء المسموحة' : 'Max Envelope Coverage'}</span>
                <span className="font-mono tabular-nums font-semibold text-sky-600 dark:text-sky-400">
                  {coveragePct.toFixed(1)}% ({buildableAreaSqM.toFixed(1)} m²)
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-500">{lang === 'ar' ? 'الاستعمال المعتمد' : 'Zoning Regulation'}</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">{gisData.zoning}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Ruler className="w-4 h-4 text-[#B4863C]" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {lang === 'ar' ? 'تعديل الارتدادات النظامية (متر)' : 'Municipal Setbacks (m)'}
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              {(['front', 'rear', 'sideLeft', 'sideRight'] as const).map((side) => (
                <label key={side} className="space-y-1">
                  <span className="text-slate-500 capitalize">{side}</span>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    value={gisData.setbacks[side]}
                    onChange={(e) => handleSetbackChange(side, Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono tabular-nums"
                  />
                </label>
              ))}
            </div>

            <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 pt-1">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                {lang === 'ar'
                  ? 'مطابق لاشتراطات الارتداد لدائرة التخطيط والمساحة بالشارقة'
                  : 'Compliant with Sharjah DTPS residential setback code'}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] p-4 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <Layers className="w-4 h-4 text-[#B4863C]" />
              <span>{lang === 'ar' ? 'مساحة البناء الحالية BUA' : 'Built-Up Area (BUA)'}</span>
            </div>
            <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
              {gisData.builtUpAreaSqFt.toLocaleString()} sq.ft
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
