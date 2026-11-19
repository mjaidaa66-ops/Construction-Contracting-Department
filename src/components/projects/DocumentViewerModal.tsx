import React, { useEffect, useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import type { Language, ProjectDocument } from '../../types/bunyan';
import { downloadChunkedDocument } from '../../services/firestoreStorage';
import { Modal } from '../ui';

interface DocumentViewerModalProps {
  docItem: ProjectDocument | null;
  onClose: () => void;
  lang: Language;
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  docItem,
  onClose,
  lang,
}) => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!docItem) return;
      setError(null);
      if (docItem.localDataUrl) {
        setDataUrl(docItem.localDataUrl);
        return;
      }
      if (docItem.manifestId) {
        setLoading(true);
        try {
          const res = await downloadChunkedDocument(docItem.manifestId);
          if (active) {
            setDataUrl(res?.dataUrl || null);
          }
        } catch (err) {
          if (active) {
            setError(err instanceof Error ? err.message : 'Failed to load chunked document');
          }
        } finally {
          if (active) setLoading(false);
        }
      } else {
        setDataUrl(null);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [docItem]);

  if (!docItem) return null;

  const isImage = docItem.mimeType.startsWith('image/');
  const isPdf = docItem.mimeType === 'application/pdf';

  return (
    <Modal
      isOpen={Boolean(docItem)}
      onClose={onClose}
      maxWidthClass="max-w-4xl"
      icon={<FileText className="w-4 h-4" />}
      title={docItem.name}
      subtitle={`${docItem.category} · ${(docItem.sizeBytes / 1024).toFixed(1)} KB · ${docItem.uploadedAt}`}
      headerActions={
        dataUrl && (
          <a
            href={dataUrl}
            download={docItem.name}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#B4863C] text-white text-xs font-semibold hover:bg-[#9E7330]"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'تنزيل' : 'Download'}</span>
          </a>
        )
      }
    >
      <div className="p-6 bg-[var(--bg-surface-subtle)] flex items-center justify-center min-h-[420px]">
        {loading ? (
          <div className="flex flex-col items-center gap-2 text-xs text-[var(--text-muted)]">
            <Loader2 className="w-6 h-6 animate-spin text-[#B4863C]" />
            <span>
              {lang === 'ar'
                ? 'جاري تجميع أجزاء المستند من Firestore (800KB chunks)...'
                : 'Reassembling 800KB Firestore chunks...'}
            </span>
          </div>
        ) : error ? (
          <div className="text-xs text-rose-500 font-mono">{error}</div>
        ) : dataUrl && isImage ? (
          <img
            src={dataUrl}
            alt={docItem.name}
            className="max-w-full max-h-[65vh] rounded-lg border border-[var(--border-hairline)] object-contain"
          />
        ) : dataUrl && isPdf ? (
          <iframe
            src={dataUrl}
            title={docItem.name}
            className="w-full h-[65vh] rounded-lg border border-[var(--border-hairline)] bg-white"
          />
        ) : (
          <div className="text-center space-y-2 max-w-md">
            <FileText className="w-10 h-10 text-[#B4863C] mx-auto" />
            <div className="text-sm font-semibold text-[var(--text-primary)]">{docItem.name}</div>
            <p className="text-xs text-[var(--text-muted)]">
              {lang === 'ar'
                ? 'هذا سجل مرجعي لمستند بلدي معتمد. قم برفع ملف PDF أو صورة جديدة لاختبار التخزين المجزأ 800KB وعرضه مباشرة.'
                : 'Reference municipal archive record. Upload a live PDF or image file to test 800KB Firestore chunked binary storage and inline preview.'}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
};
