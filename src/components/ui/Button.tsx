import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-[#B4863C] text-white border border-transparent hover:bg-[#9E7330] active:scale-[0.99] shadow-xs',
  secondary:
    'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border border-transparent hover:bg-slate-800 dark:hover:bg-white',
  outline:
    'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-subtle)]',
  ghost:
    'bg-transparent text-[var(--text-secondary)] border border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)]',
  danger:
    'bg-rose-600 text-white border border-transparent hover:bg-rose-700',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-[11px] rounded-md gap-1.5',
  sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-9 px-4 text-xs rounded-lg gap-2',
  lg: 'h-10 px-5 text-sm rounded-lg gap-2',
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
      className={`inline-flex items-center justify-center font-semibold whitespace-nowrap shrink-0 bunyan-transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4863C]/70 disabled:opacity-55 disabled:pointer-events-none cursor-pointer ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : icon}
      {children}
    </button>
  );
};
