import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './Button';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  maxWidthClass?: string;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  maxWidthClass = 'max-w-2xl',
  headerActions,
  children,
  footer,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-[2px] p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`w-full ${maxWidthClass} max-h-[90vh] flex flex-col rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] shadow-xl overflow-hidden`}
      >
        <div className="px-5 py-4 border-b border-[var(--border-hairline)] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && <span className="text-[#B4863C] shrink-0">{icon}</span>}
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)] truncate">
                {title}
              </h3>
              {subtitle && (
                <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] bunyan-transition cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">{children}</div>

        {footer && (
          <div className="px-5 py-3.5 border-t border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] flex items-center justify-end gap-2.5 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/55 backdrop-blur-[1px] no-print"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md h-full bg-[var(--bg-surface)] border-s border-[var(--border-hairline)] shadow-2xl flex flex-col">
        <div className="px-5 py-4 border-b border-[var(--border-hairline)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && <span className="text-[#B4863C] shrink-0">{icon}</span>}
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">{title}</h3>
              {subtitle && (
                <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
            aria-label="Close drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = true,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-md"
      icon={<AlertTriangle className={`w-5 h-5 ${danger ? 'text-rose-500' : 'text-[#B4863C]'}`} />}
      title={title}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            size="sm"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="p-5 text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
        {message}
      </div>
    </Modal>
  );
};
