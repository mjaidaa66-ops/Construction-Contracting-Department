import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  startIcon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  startIcon,
  className = '',
  id,
  ...props
}) => {
  const inputEl = (
    <div className="relative flex items-center">
      {startIcon && (
        <span className="pointer-events-none absolute start-3 text-[var(--text-muted)] flex items-center">
          {startIcon}
        </span>
      )}
      <input
        id={id}
        className={`w-full h-9 text-xs rounded-lg border bg-[var(--bg-surface-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[#B4863C]/60 focus:border-[#B4863C] bunyan-transition ${
          error ? 'border-rose-500' : 'border-[var(--border-hairline)]'
        } ${startIcon ? 'ps-9 pe-3' : 'px-3'} ${className}`}
        {...props}
      />
    </div>
  );

  if (!label && !error) return inputEl;

  return (
    <label className="block space-y-1.5 text-xs">
      {label && <span className="font-medium text-[var(--text-secondary)] block">{label}</span>}
      {inputEl}
      {error && <span className="text-[11px] text-rose-500 block">{error}</span>}
    </label>
  );
};

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export const Select: React.FC<SelectProps> = ({
  label,
  className = '',
  children,
  ...props
}) => {
  const sel = (
    <select
      className={`w-full h-9 px-3 text-xs rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#B4863C]/60 focus:border-[#B4863C] bunyan-transition ${className}`}
      {...props}
    >
      {children}
    </select>
  );

  if (!label) return sel;

  return (
    <label className="block space-y-1.5 text-xs">
      <span className="font-medium text-[var(--text-secondary)] block">{label}</span>
      {sel}
    </label>
  );
};
