import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unexpected application error',
    };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Bunyan ErrorBoundary:', error, info);
  }

  override render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          dir="auto"
          className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas,#050B18)] bunyan-holo-grid p-6 text-[var(--text-primary,#E8F1FF)]"
        >
          <div className="max-w-lg w-full rounded-2xl border border-[#0284C7]/35 dark:border-[#00F0FF]/35 bg-[var(--bg-surface,#101B30)] backdrop-blur-xl p-6 space-y-4 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
            <div className="flex items-center gap-3 text-[#FF405C]">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <div>
                <h2 className="text-base sm:text-lg font-bold">
                  استعادة النظام الهندسي · Application Recovery
                </h2>
                <p className="text-xs text-[var(--text-muted,#7E96BA)]">
                  BUNYAN | 5D BIM Digital Twin Workspace
                </p>
              </div>
            </div>
            <p
              dir="ltr"
              className="text-xs text-[var(--text-secondary,#A3B8D8)] bg-[var(--bg-surface-subtle,#0C1628)] border border-[var(--border-hairline,rgba(0,240,255,0.16))] rounded-xl p-3 font-mono break-all"
            >
              {this.state.message}
            </p>
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, message: '' })}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-bold rounded-xl bg-gradient-to-l from-[#1677FF] to-[#0284C7] dark:from-[#00F0FF] dark:to-[#1677FF] text-white dark:text-[#050B18] hover:brightness-110 transition-all cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>إعادة تحميل مساحة العمل · Reload Workspace</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
