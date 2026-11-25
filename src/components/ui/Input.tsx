import React from 'react';
import { Search } from 'lucide-react';

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
        className={`w-full h-9 text-xs rounded-xl border bg-[var(--bg-surface-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/45 focus:border-[var(--accent-cyan)] bunyan-transition ${
          error ? 'border-[#FF405C]' : 'border-[var(--border-hairline)]'
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
      {error && <span className="text-[11px] text-[#FF405C] block">{error}</span>}
    </label>
  );
};

export interface SearchComponentProps extends React.InputHTMLAttributes<HTMLInputElement> {
  shortcutHint?: string;
}

export const SearchComponent: React.FC<SearchComponentProps> = ({
  shortcutHint,
  className = '',
  ...props
}) => (
  <div className="relative flex items-center">
    <span className="pointer-events-none absolute start-3 text-[var(--accent-cyan)] flex items-center">
      <Search className="w-3.5 h-3.5" />
    </span>
    <input
      className={`w-full h-9 ps-9 ${
        shortcutHint ? 'pe-14' : 'pe-3'
      } text-xs rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/45 focus:border-[var(--accent-cyan)] bunyan-transition ${className}`}
      {...props}
    />
    {shortcutHint && (
      <kbd
        dir="ltr"
        className="pointer-events-none absolute end-2.5 px-1.5 py-0.5 rounded bg-[var(--bg-surface-solid)] border border-[var(--border-hairline)] font-mono text-[10px] text-[var(--text-muted)]"
      >
        {shortcutHint}
      </kbd>
    )}
  </div>
);

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
      className={`w-full h-9 px-3 text-xs rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/45 focus:border-[var(--accent-cyan)] bunyan-transition ${className}`}
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
