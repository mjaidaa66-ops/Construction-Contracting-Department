import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  padded?: boolean;
}

export const Card: React.FC<CardProps> = ({
  interactive = false,
  padded = false,
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] bunyan-transition ${
        interactive
          ? 'hover:border-[#B4863C]/55 dark:hover:border-[#C99A49]/55 cursor-pointer'
          : ''
      } ${padded ? 'p-5' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, icon, action, className = '' }) => {
  return (
    <div
      className={`px-5 py-3.5 border-b border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-3 ${className}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && <span className="shrink-0 text-[#B4863C] dark:text-[#C99A49]">{icon}</span>}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
    </div>
  );
};
