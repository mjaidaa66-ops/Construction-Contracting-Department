import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  padded?: boolean;
  glow?: 'none' | 'cyan' | 'gold' | 'emerald';
}

const GLOW_CLASSES: Record<NonNullable<CardProps['glow']>, string> = {
  none: '',
  cyan: 'border-[var(--border-hairline)] hover:border-[var(--border-strong)]',
  gold: 'border-[var(--border-hairline)] hover:border-[var(--accent-gold)]/45',
  emerald: 'border-[var(--border-hairline)] hover:border-[var(--accent-green)]/45',
};

export const Card: React.FC<CardProps> = ({
  interactive = false,
  padded = false,
  glow = 'none',
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`rounded-2xl border border-[var(--border-hairline)] bunyan-glass bunyan-neon-border bunyan-transition ${
        interactive
          ? 'hover:border-[var(--border-strong)] hover:-translate-y-0.5 hover:shadow-[var(--spatial-card-shadow)] cursor-pointer'
          : ''
      } ${GLOW_CLASSES[glow]} ${padded ? 'p-5' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const GlassCard = Card;

export interface HolographicPanelProps extends Omit<CardProps, 'title'> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  scanline?: boolean;
}

export const HolographicPanel: React.FC<HolographicPanelProps> = ({
  title,
  subtitle,
  icon,
  badge,
  action,
  scanline = false,
  className = '',
  children,
  ...props
}) => {
  return (
    <Card
      className={`relative overflow-hidden bunyan-spatial-card ${scanline ? 'bunyan-scanline' : ''} ${className}`}
      {...props}
    >
      {(title || action) && (
        <CardHeader title={title} subtitle={subtitle} icon={icon} badge={badge} action={action} />
      )}
      {children}
    </Card>
  );
};

export const CardHeader: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, icon, badge, action, className = '' }) => {
  return (
    <div
      className={`px-5 py-3.5 border-b border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-3 ${className}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && (
          <span className="shrink-0 w-8 h-8 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] flex items-center justify-center text-[var(--accent-cyan)]">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">{title}</h3>
            {badge}
          </div>
          {subtitle && (
            <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
    </div>
  );
};
