import React from 'react';
import type { Language } from '../../types/bunyan';
import type { ReportChartSeries } from '../../types/reports';
import { formatAED } from '../../utils/i18n';

interface ReportVisualChartsProps {
  series: ReportChartSeries[];
  lang: Language;
  printableMode?: boolean;
}

function formatChartVal(
  val: number,
  format: ReportChartSeries['valueFormat'],
  lang: Language
): string {
  if (format === 'currency') {
    if (Math.abs(val) >= 1_000_000) {
      return `${(val / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(val) >= 1_000) {
      return `${Math.round(val / 1_000)}K`;
    }
    return formatAED(val, lang);
  }
  if (format === 'percent') return `${Math.round(val)}%`;
  return String(Math.round(val));
}

const DonutSvgChart: React.FC<{
  chart: ReportChartSeries;
  lang: Language;
  printableMode?: boolean;
}> = ({ chart, lang, printableMode }) => {
  const isAr = lang === 'ar';
  const total = chart.data.reduce((s, d) => s + Math.max(0, d.value), 0);
  const radius = 44;
  const circumference = 2 * Math.PI * radius;

  let cumulative = 0;

  return (
    <div
      style={
        printableMode
          ? {
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '8px',
              padding: '14px',
              breakInside: 'avoid',
            }
          : undefined
      }
      className={
        printableMode
          ? ''
          : 'rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4'
      }
    >
      <div
        style={printableMode ? { fontSize: '12px', fontWeight: 700, color: '#0F172A', marginBottom: '12px' } : undefined}
        className={printableMode ? '' : 'text-xs font-bold text-[var(--text-primary)] mb-3'}
      >
        {isAr ? chart.titleAr : chart.titleEn}
      </div>

      {total === 0 ? (
        <div
          style={printableMode ? { fontSize: '11px', color: '#64748B', padding: '16px 0' } : undefined}
          className={printableMode ? '' : 'text-xs text-[var(--text-muted)] py-6 text-center'}
        >
          {isAr ? 'لا توجد بيانات كافية للرسم' : 'No data available'}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <svg width="116" height="116" viewBox="0 0 116 116" aria-label={isAr ? chart.titleAr : chart.titleEn}>
            <circle
              cx="58"
              cy="58"
              r={radius}
              fill="none"
              stroke={printableMode ? '#E2E8F0' : '#33415533'}
              strokeWidth="16"
            />
            {chart.data.map((seg) => {
              const frac = seg.value / total;
              const dash = frac * circumference;
              const offset = -cumulative * circumference;
              cumulative += frac;
              return (
                <circle
                  key={seg.key}
                  cx="58"
                  cy="58"
                  r={radius}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth="16"
                  strokeDasharray={`${dash} ${circumference}`}
                  strokeDashoffset={offset}
                  transform="rotate(-90 58 58)"
                />
              );
            })}
            <text
              x="58"
              y="56"
              textAnchor="middle"
              fontSize="15"
              fontWeight="700"
              fill={printableMode ? '#0F172A' : 'currentColor'}
              fontFamily="JetBrains Mono, monospace"
            >
              {total}
            </text>
            <text
              x="58"
              y="70"
              textAnchor="middle"
              fontSize="9"
              fill="#64748B"
            >
              {isAr ? 'الإجمالي' : 'TOTAL'}
            </text>
          </svg>

          <div style={{ flex: 1, minWidth: '140px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {chart.data.map((seg) => {
              const pct = Math.round((seg.value / total) * 100);
              return (
                <div
                  key={seg.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    fontSize: '11px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                    <span
                      style={{
                        width: '9px',
                        height: '9px',
                        borderRadius: '2px',
                        backgroundColor: seg.color,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={
                        printableMode
                          ? { color: '#334155', fontWeight: 500 }
                          : undefined
                      }
                      className={printableMode ? '' : 'text-[var(--text-secondary)] truncate'}
                    >
                      {isAr ? seg.labelAr : seg.labelEn}
                    </span>
                  </div>
                  <span
                    dir="ltr"
                    style={
                      printableMode
                        ? { fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: '#0F172A' }
                        : undefined
                    }
                    className={printableMode ? '' : 'font-mono tabular-nums font-semibold text-[var(--text-primary)]'}
                  >
                    {seg.value} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const VerticalBarSvgChart: React.FC<{
  chart: ReportChartSeries;
  lang: Language;
  printableMode?: boolean;
}> = ({ chart, lang, printableMode }) => {
  const isAr = lang === 'ar';
  const maxVal = Math.max(
    1,
    ...chart.data.flatMap((d) => [d.value, d.secondaryValue || 0])
  );

  return (
    <div
      style={
        printableMode
          ? {
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '8px',
              padding: '14px',
              breakInside: 'avoid',
            }
          : undefined
      }
      className={
        printableMode
          ? ''
          : 'rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4'
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <div
          style={printableMode ? { fontSize: '12px', fontWeight: 700, color: '#0F172A' } : undefined}
          className={printableMode ? '' : 'text-xs font-bold text-[var(--text-primary)]'}
        >
          {isAr ? chart.titleAr : chart.titleEn}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '10px', color: '#64748B' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '8px', height: '8px', backgroundColor: '#059669', borderRadius: '2px' }} />
            {chart.valueFormat === 'currency'
              ? isAr ? 'المحصّل' : 'Received'
              : isAr ? 'الفعلي' : 'Actual'}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '8px', height: '8px', backgroundColor: '#94A3B8', borderRadius: '2px' }} />
            {chart.valueFormat === 'currency'
              ? isAr ? 'الميزانية' : 'Budget'
              : isAr ? 'المخطط' : 'Planned'}
          </span>
        </div>
      </div>

      {chart.data.length === 0 ? (
        <div
          style={printableMode ? { fontSize: '11px', color: '#64748B', padding: '16px 0' } : undefined}
          className={printableMode ? '' : 'text-xs text-[var(--text-muted)] py-6 text-center'}
        >
          {isAr ? 'لا توجد بيانات' : 'No data'}
        </div>
      ) : (
        <div
          dir="ltr"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${chart.data.length}, minmax(0, 1fr))`,
            gap: '8px',
            alignItems: 'end',
            height: '132px',
            paddingTop: '18px',
            borderBottom: `1px solid ${printableMode ? '#CBD5E1' : '#33415555'}`,
          }}
        >
          {chart.data.map((d) => {
            const h1 = Math.max(4, Math.round((d.value / maxVal) * 86));
            const h2 =
              d.secondaryValue !== undefined
                ? Math.max(4, Math.round((d.secondaryValue / maxVal) * 86))
                : 0;
            return (
              <div
                key={d.key}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  height: '100%',
                  gap: '4px',
                }}
              >
                <div style={{ fontSize: '9px', fontFamily: 'JetBrains Mono, monospace', color: '#64748B' }}>
                  {formatChartVal(d.value, chart.valueFormat, lang)}
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '88px' }}>
                  {d.secondaryValue !== undefined && (
                    <div
                      style={{
                        width: '10px',
                        height: `${h2}px`,
                        backgroundColor: '#94A3B8',
                        borderRadius: '2px 2px 0 0',
                      }}
                      title={`${d.labelEn}: ${d.secondaryValue}`}
                    />
                  )}
                  <div
                    style={{
                      width: '10px',
                      height: `${h1}px`,
                      backgroundColor: '#059669',
                      borderRadius: '2px 2px 0 0',
                    }}
                    title={`${d.labelEn}: ${d.value}`}
                  />
                </div>
                <div
                  style={{
                    fontSize: '9.5px',
                    fontFamily: 'JetBrains Mono, monospace',
                    color: printableMode ? '#334155' : '#94A3B8',
                    paddingBottom: '4px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '100%',
                  }}
                >
                  {isAr ? d.labelAr : d.labelEn}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const ReportVisualCharts: React.FC<ReportVisualChartsProps> = ({
  series,
  lang,
  printableMode = false,
}) => {
  if (!series || series.length === 0) return null;
  return (
    <div
      style={
        printableMode
          ? {
              display: 'grid',
              gridTemplateColumns: series.length > 1 ? 'repeat(2, minmax(0, 1fr))' : '1fr',
              gap: '12px',
              marginBottom: '16px',
            }
          : undefined
      }
      className={
        printableMode
          ? ''
          : `grid grid-cols-1 ${series.length > 1 ? 'lg:grid-cols-2' : ''} gap-4`
      }
    >
      {series.map((chart) =>
        chart.kind === 'donut' ? (
          <DonutSvgChart key={chart.id} chart={chart} lang={lang} printableMode={printableMode} />
        ) : (
          <VerticalBarSvgChart key={chart.id} chart={chart} lang={lang} printableMode={printableMode} />
        )
      )}
    </div>
  );
};
