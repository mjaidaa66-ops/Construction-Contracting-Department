import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'cyan' | 'gold';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-l from-[#1677FF] to-[#0284C7] dark:from-[#00C8E0] dark:to-[#1677FF] text-white dark:text-[#050B18] border border-transparent hover:brightness-110 dark:shadow-[0_0_18px_-4px_rgba(0,240,255,0.45)] active:scale-[0.98]',
  cyan:
    'bg-[#0284C7]/12 dark:bg-[#00F0FF]/14 text-[#0284C7] dark:text-[#00F0FF] border border-[#0284C7]/35 dark:border-[#00F0FF]/45 hover:bg-[#0284C7]/20 dark:hover:bg-[#00F0FF]/24 dark:shadow-[0_0_16px_-6px_rgba(0,240,255,0.45)] active:scale-[0.98]',
  gold:
    'bg-[#B4863C] dark:bg-[#D6A64F] text-white dark:text-[#050B18] border border-transparent hover:bg-[#9E7330] dark:hover:bg-[#E0B665] shadow-xs active:scale-[0.98]',
  secondary:
    'bg-slate-900 text-white dark:bg-[#101B30] dark:text-[#EEF6FF] border border-transparent dark:border-[#00F0FF]/25 hover:bg-slate-800 dark:hover:border-[#00F0FF]/55',
  outline:
    'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-subtle)]',
  ghost:
    'bg-transparent text-[var(--text-secondary)] border border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)]',
  danger:
    'bg-[#FF405C] text-white border border-transparent hover:bg-[#E12D48] shadow-xs',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-[11px] rounded-lg gap-1.5',
  sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-9 px-4 text-xs rounded-xl gap-2',
  lg: 'h-10 px-5 text-sm rounded-xl gap-2',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  disabled,
  children,
  className = '',
  type = 'button',
  ...props
}) => {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-semibold whitespace-nowrap shrink-0 bunyan-transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F0FF]/70 disabled:opacity-55 disabled:pointer-events-none cursor-pointer ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : icon}
      {children}
    </button>
  );
};

export const NeonButton = Button;
