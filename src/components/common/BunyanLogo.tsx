import React, { useId } from 'react';
import bunyanOfficialLogo from '../../assets/bunyan-official-logo.png';
import type { Language } from '../../types/bunyan';

export const BUNYAN_OFFICIAL_LOGO_SRC = bunyanOfficialLogo;

export interface BunyanLogoProps {
  iconOnly?: boolean;
  lang?: Language;
  variant?: 'default' | 'print';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
}

const SIZE_MAP = {
  xs: { box: 'w-8 h-8 rounded-lg', title: 'text-xs', sub: 'text-[9.5px]' },
  sm: { box: 'w-10 h-10 rounded-xl', title: 'text-sm', sub: 'text-[10px]' },
  md: { box: 'w-12 h-12 rounded-xl', title: 'text-base', sub: 'text-[11px]' },
  lg: { box: 'w-16 h-16 rounded-2xl', title: 'text-lg', sub: 'text-xs' },
  xl: { box: 'w-24 h-24 rounded-2xl', title: 'text-xl', sub: 'text-xs' },
  '2xl': { box: 'w-32 h-32 rounded-3xl', title: 'text-2xl', sub: 'text-sm' },
} as const;

const ArchitecturalSpatialMark: React.FC<{ className?: string }> = ({ className = 'w-full h-full' }) => {
  const uid = useId().replace(/:/g, '');
  const leftGrad = `bunyan-l-${uid}`;
  const rightGrad = `bunyan-r-${uid}`;
  const crownGrad = `bunyan-c-${uid}`;

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={leftGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
        <linearGradient id={rightGrad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1E3A8A" />
          <stop offset="100%" stopColor="#0F172A" />
        </linearGradient>
        <linearGradient id={crownGrad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#E6B863" />
          <stop offset="100%" stopColor="#B4863C" />
        </linearGradient>
      </defs>

      {/* Architectural Isometric Plinth */}
      <polygon
        points="32,56 10,45 32,34 54,45"
        fill="currentColor"
        className="text-slate-900/10 dark:text-sky-400/15"
      />

      {/* Primary Isometric Structural Mass — Left Illuminated Facade */}
      <polygon points="32,12 14,21 14,44 32,53" fill={`url(#${leftGrad})`} />

      {/* Secondary Extruded Structural Wing — Right Depth Plane */}
      <polygon points="32,12 50,21 50,44 32,53" fill={`url(#${rightGrad})`} />

      {/* Precision Stepped Roof Crown (Architectural Brass Accent) */}
      <polygon points="32,8 46,15 32,22 18,15" fill={`url(#${crownGrad})`} />

      {/* Curtain-Wall Structural Rib Lines */}
      <path
        d="M20 26 L20 43 M26 23 L26 47 M38 23 L38 47 M44 26 L44 43"
        stroke="rgba(255,255,255,0.45)"
        strokeWidth="1.35"
        strokeLinecap="round"
      />

      {/* Spatial Isometric Wireframe Edge Highlight */}
      <polyline
        points="14,21 32,30 50,21"
        fill="none"
        stroke="rgba(255,255,255,0.65)"
        strokeWidth="1.2"
      />
      <line x1="32" y1="30" x2="32" y2="53" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" />
    </svg>
  );
};

export const BunyanLogo: React.FC<BunyanLogoProps> = ({
  iconOnly = false,
  lang = 'ar',
  variant = 'default',
  size = 'md',
  className = '',
}) => {
  const dims = SIZE_MAP[size];
  const isPrint = variant === 'print';

  return (
    <div className={`inline-flex items-center gap-3 select-none shrink-0 ${className}`}>
      <div
        className={`${dims.box} aspect-square overflow-hidden flex items-center justify-center shrink-0 border relative ${
          isPrint
            ? 'bg-[#F1F3F5] border-slate-300 shadow-xs'
            : 'p-1 bg-gradient-to-br from-white via-[#F1F5F9] to-[#E2E8F0] dark:from-[#1B2741] dark:via-[#11192B] dark:to-[#090E1A] border-slate-300/80 dark:border-slate-600/40 shadow-[0_4px_14px_-4px_rgba(15,23,42,0.18),inset_0_1px_0_rgba(255,255,255,0.75)] dark:shadow-[0_6px_18px_-6px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.12)]'
        }`}
      >
        {isPrint ? (
          <img
            src={bunyanOfficialLogo}
            alt={lang === 'ar' ? 'شعار منصة بنيان الرسمي' : 'Bunyan Official Architectural Logo'}
            className="w-full h-full object-contain block"
            draggable={false}
          />
        ) : (
          <ArchitecturalSpatialMark className="w-full h-full drop-shadow-xs" />
        )}
      </div>

      {!iconOnly && (
        <div className="min-w-0 leading-tight">
          <div
            className={`${dims.title} font-bold tracking-tight truncate ${
              isPrint ? 'text-slate-950' : 'text-[var(--text-primary)]'
            }`}
          >
            {lang === 'ar' ? 'منصة بنيان' : 'BUNYAN'}
          </div>
          <div
            className={`${dims.sub} font-mono uppercase tracking-wider truncate ${
              isPrint ? 'text-slate-600' : 'text-[var(--accent-cyan)]'
            }`}
          >
            {lang === 'ar' ? '3D DIGITAL TWIN · 5D BIM' : '3D DIGITAL TWIN · 5D BIM'}
          </div>
        </div>
      )}
    </div>
  );
};
