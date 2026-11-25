import React from 'react';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
  className = '',
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (val: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={`inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] ${className}`}
    >
      {items.map((item) => {
        const active = value === item.id;
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap bunyan-transition cursor-pointer ${
              active
                ? 'bg-gradient-to-l from-[#2563EB] to-[#0284C7] dark:from-[#3B82F6] dark:to-[#0284C7] text-white shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]/70'
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
            {typeof item.count === 'number' && (
              <span
                dir="ltr"
                className={`font-mono tabular-nums text-[11px] ${
                  active ? 'opacity-90' : 'text-[var(--text-muted)]'
                }`}
              >
                ({item.count})
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
