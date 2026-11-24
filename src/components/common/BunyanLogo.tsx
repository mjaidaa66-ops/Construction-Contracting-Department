import React from 'react';
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
        className={`${dims.box} aspect-square overflow-hidden flex items-center justify-center shrink-0 border ${
          isPrint
            ? 'bg-[#F1F3F5] border-slate-300 shadow-xs'
            : 'bg-[#F1F3F5] border-slate-300/90 dark:border-slate-400/35 shadow-sm'
        }`}
      >
        <img
          src={bunyanOfficialLogo}
          alt={lang === 'ar' ? 'شعار منصة بنيان الرسمي' : 'Bunyan Official Architectural Logo'}
          className="w-full h-full object-contain block"
          draggable={false}
        />
      </div>

      {!iconOnly && (
        <div className="min-w-0 leading-tight">
          <div
            className={`${dims.title} font-bold tracking-tight truncate ${
              isPrint ? 'text-slate-950' : 'text-[var(--text-primary)]'
            }`}
          >
            {lang === 'ar' ? 'منصة بنيان' : 'BUNYAN CORE'}
          </div>
          <div
            className={`${dims.sub} font-mono uppercase tracking-wider truncate ${
              isPrint ? 'text-slate-600' : 'text-slate-500 dark:text-slate-300'
            }`}
          >
            {lang === 'ar' ? 'BUNYAN · 5D BIM' : 'بنيان · 5D BIM'}
          </div>
        </div>
      )}
    </div>
  );
};
