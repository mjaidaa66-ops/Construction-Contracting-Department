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
          className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas,#090E1A)] bunyan-holo-grid p-6 text-[var(--text-primary,#F1F5F9)]"
        >
          <div className="max-w-lg w-full rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface,#11192B)] backdrop-blur-xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <div>
                <h2 className="text-base sm:text-lg font-bold">
                  استعادة النظام الهندسي · Application Recovery
                </h2>
                <p className="text-xs text-[var(--text-muted,#8496B0)]">
                  Organization | 3D Digital Twin & 5D BIM Platform
                </p>
              </div>
            </div>
            <p
              dir="ltr"
              className="text-xs text-[var(--text-secondary,#CBD5E1)] bg-[var(--bg-surface-subtle,#0D1424)] border border-[var(--border-hairline)] rounded-xl p-3 font-mono break-all"
            >
              {this.state.message}
            </p>
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, message: '' })}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-bold rounded-xl bg-gradient-to-l from-[#2563EB] to-[#0284C7] text-white hover:brightness-110 transition-all cursor-pointer"
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
