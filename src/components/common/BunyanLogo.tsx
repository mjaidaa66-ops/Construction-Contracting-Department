import React from 'react';
import type { Language } from '../../types/bunyan';

export interface BunyanLogoProps {
  iconOnly?: boolean;
  lang?: Language;
  variant?: 'default' | 'print';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_MAP = {
  sm: { box: 'w-9 h-9', title: 'text-sm', sub: 'text-[10px]' },
  md: { box: 'w-11 h-11', title: 'text-base', sub: 'text-[11px]' },
  lg: { box: 'w-14 h-14', title: 'text-lg', sub: 'text-xs' },
} as const;

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
    <div className={`inline-flex items-center gap-2.5 select-none shrink-0 ${className}`}>
      <div
        className={`${dims.box} rounded-xl flex items-center justify-center shrink-0 border ${
          isPrint
            ? 'bg-[#0B1120] border-[#B4863C]'
            : 'bg-[#0B1120] border-[#B4863C]/45 shadow-[0_0_16px_rgba(180,134,60,0.18)]'
        }`}
      >
        <svg
          viewBox="0 0 64 64"
          className="w-[82%] h-[82%]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="Bunyan Core Architectural BIM Logo"
        >
          <defs>
            <linearGradient id="bunyanGoldGrad" x1="10" y1="8" x2="54" y2="56" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#D4AF37" />
              <stop offset="55%" stopColor="#B4863C" />
              <stop offset="100%" stopColor="#8F6726" />
            </linearGradient>
            <linearGradient id="bunyanCyanGrad" x1="16" y1="14" x2="48" y2="50" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#38BDF8" />
              <stop offset="100%" stopColor="#0284C7" />
            </linearGradient>
          </defs>

          {/* 3D Isometric BIM Outer Wireframe Hexagon */}
          <polygon
            points="32,5 55,18 55,46 32,59 9,46 9,18"
            stroke="url(#bunyanCyanGrad)"
            strokeOpacity="0.45"
            strokeWidth="1.5"
            strokeDasharray="3 2"
          />

          {/* BIM Structural Grid Axes */}
          <path
            d="M14 48 L32 39 L50 48 M32 9 L32 39"
            stroke="#38BDF8"
            strokeOpacity="0.55"
            strokeWidth="1.2"
          />

          {/* Emirati Interlocking Pointed Arch & Twin Engineering Towers */}
          <path
            d="M17 50 V27 C17 19 25 14 32 10 C39 14 47 19 47 27 V50"
            stroke="url(#bunyanGoldGrad)"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M23 50 V31 C23 25 27.5 21.5 32 19 C36.5 21.5 41 25 41 31 V50"
            stroke="url(#bunyanGoldGrad)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Central BIM Core Spire & Foundation Base */}
          <path
            d="M28 50 V34 L32 29 L36 34 V50"
            fill="url(#bunyanGoldGrad)"
            fillOpacity="0.22"
            stroke="#D4AF37"
            strokeWidth="1.6"
          />
          <line x1="12" y1="50" x2="52" y2="50" stroke="#D4AF37" strokeWidth="2.4" strokeLinecap="round" />

          {/* Technical Cyan BIM Control Nodes */}
          <circle cx="32" cy="10" r="2.2" fill="#38BDF8" />
          <circle cx="17" cy="27" r="1.8" fill="#38BDF8" />
          <circle cx="47" cy="27" r="1.8" fill="#38BDF8" />
          <circle cx="32" cy="39" r="2" fill="#D4AF37" stroke="#0B1120" strokeWidth="1" />
        </svg>
      </div>

      {!iconOnly && (
        <div className="min-w-0 leading-tight">
          <div
            className={`${dims.title} font-bold tracking-tight truncate ${
              isPrint ? 'text-slate-950' : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {lang === 'ar' ? 'منصة بنيان' : 'BUNYAN CORE'}
          </div>
          <div
            className={`${dims.sub} font-mono uppercase tracking-wider truncate ${
              isPrint ? 'text-[#9E7330]' : 'text-[#B4863C] dark:text-[#D4AF37]'
            }`}
          >
            {lang === 'ar' ? 'BUNYAN CORE · 5D BIM' : 'منصة بنيان · 5D BIM'}
          </div>
        </div>
      )}
    </div>
  );
};
