import React, { useState } from 'react';
import { ExternalLink, Landmark, Plus, Trash2, X } from 'lucide-react';
import type {
  GovernmentAuthority,
  GovernmentTransaction,
  Language,
  Project,
  TransactionStatus,
} from '../../types/bunyan';
import { AUTHORITY_LABELS, TX_STATUS_LABELS } from '../../utils/i18n';

interface GovernmentPortalProps {
  transactions: GovernmentTransaction[];
  projects: Project[];
  activeProjectId: string;
  lang: Language;
  onSaveTransaction: (tx: GovernmentTransaction) => void;
  onDeleteTransaction: (id: string) => void;
}

const PORTAL_URLS: Record<GovernmentAuthority, string> = {
  sharjah_municipality: 'https://portal.shjmun.gov.ae',
  sewa: 'https://www.sewa.gov.ae',
  szhp: 'https://www.szhp.gov.ae',
  civil_defense: 'https://www.dcd.gov.ae',
  planning_survey: 'https://www.sdtps.gov.ae',
  municipalities_affairs: 'https://www.dma.shj.ae',
  sharjah_housing: 'https://www.shd.gov.ae',
};

export const GovernmentPortal: React.FC<GovernmentPortalProps> = ({
  transactions,
  projects,
  activeProjectId,
  lang,
  onSaveTransaction,
  onDeleteTransaction,
}) => {
  const [filterAuth, setFilterAuth] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [authority, setAuthority] = useState<GovernmentAuthority>('sharjah_municipality');
  const [txNumber, setTxNumber] = useState(`MUN-2026-${Math.floor(1000 + Math.random() * 8999)}`);
  const [serviceName, setServiceName] = useState('');
  const [reviewEngineer, setReviewEngineer] = useState('م. عبيد الشامسي');
  const [status, setStatus] = useState<TransactionStatus>('in_review');
  const [notes, setNotes] = useState('');

  const filtered = transactions.filter((t) => {
    const matchAuth = filterAuth === 'all' || t.authority === filterAuth;
    return matchAuth;
  });

  const handleAddTx = (e: React.FormEvent) => {
    e.preventDefault();
    const today = new Date().toISOString().slice(0, 10);
    onSaveTransaction({
      id: `tx-${Date.now()}`,
      projectId: activeProjectId || projects[0]?.id || 'proj-01',
      authority,
      transactionNumber: txNumber.trim(),
      serviceName: serviceName.trim() || 'طلب اعتماد فني',
      serviceNameEn: serviceName.trim() || 'Technical Approval Request',
      status,
      submissionDate: today,
      lastUpdatedDate: today,
      reviewEngineer: reviewEngineer.trim(),
      notes: notes.trim(),
      officialPortalUrl: PORTAL_URLS[authority],
    });
    setServiceName('');
    setNotes('');
    setModalOpen(false);
  };

  const handleCycleStatus = (tx: GovernmentTransaction) => {
    const order: TransactionStatus[] = ['in_review', 'pending_inspection', 'action_required', 'approved'];
    const next = order[(order.indexOf(tx.status) + 1) % order.length];
    onSaveTransaction({
      ...tx,
      status: next,
      lastUpdatedDate: new Date().toISOString().slice(0, 10),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setFilterAuth('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium ${
              filterAuth === 'all'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {lang === 'ar' ? 'جميع الجهات' : 'All Authorities'}
          </button>
          {(['sharjah_municipality', 'sewa', 'civil_defense', 'planning_survey'] as GovernmentAuthority[]).map(
            (authKey) => (
              <button
                key={authKey}
                type="button"
                onClick={() => setFilterAuth(authKey)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap ${
                  filterAuth === authKey
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {lang === 'ar' ? AUTHORITY_LABELS[authKey].ar : AUTHORITY_LABELS[authKey].short}
              </button>
            )
          )}
        </div>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#B4863C] text-white text-xs font-semibold hover:bg-[#9E7330] whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{lang === 'ar' ? 'معاملة بلدية جديدة' : 'New Transaction'}</span>
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 text-start font-semibold">{lang === 'ar' ? 'رقم المعاملة' : 'Reference'}</th>
                <th className="px-4 py-3 text-start font-semibold">{lang === 'ar' ? 'الجهة الحكومية' : 'Authority'}</th>
                <th className="px-4 py-3 text-start font-semibold">{lang === 'ar' ? 'الخدمة والملاحظات' : 'Service & Notes'}</th>
                <th className="px-4 py-3 text-start font-semibold">{lang === 'ar' ? 'المهندس المراجع' : 'Reviewer'}</th>
                <th className="px-4 py-3 text-start font-semibold">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                <th className="px-4 py-3 text-end font-semibold">{lang === 'ar' ? 'البوابة / إجراء' : 'Portal / Action'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {filtered.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-mono font-semibold text-[#B4863C] whitespace-nowrap">
                    <div>{tx.transactionNumber}</div>
                    <div className="text-[11px] text-slate-500 font-normal">{tx.lastUpdatedDate}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-900 dark:text-slate-100">
                    <div className="flex items-center gap-2">
                      <Landmark className="w-3.5 h-3.5 text-[#B4863C] shrink-0" />
                      <span>{lang === 'ar' ? AUTHORITY_LABELS[tx.authority].ar : AUTHORITY_LABELS[tx.authority].en}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 min-w-[250px]">
                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                      {lang === 'ar' ? tx.serviceName : tx.serviceNameEn || tx.serviceName}
                    </div>
                    {tx.notes && <div className="text-slate-500 dark:text-slate-400 mt-0.5">{tx.notes}</div>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-700 dark:text-slate-300">
                    {tx.reviewEngineer}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleCycleStatus(tx)}
                      className={`px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 ${TX_STATUS_LABELS[tx.status].tone}`}
                      title={lang === 'ar' ? 'اضغط لتحديث الحالة' : 'Click to cycle status'}
                    >
                      {lang === 'ar' ? TX_STATUS_LABELS[tx.status].ar : TX_STATUS_LABELS[tx.status].en}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-end whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
                      <a
                        href={tx.officialPortalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <ExternalLink className="w-3 h-3 text-[#B4863C]" />
                        <span>{lang === 'ar' ? 'البوابة' : 'Portal'}</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => onDeleteTransaction(tx.id)}
                        className="p-1.5 rounded-md text-rose-500 hover:bg-rose-500/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {lang === 'ar' ? 'تسجيل معاملة حكومية جديدة' : 'Register Municipal Transaction'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddTx} className="space-y-3 text-xs">
              <label className="block space-y-1">
                <span className="font-medium text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'الجهة الحكومية' : 'Authority'}</span>
                <select
                  value={authority}
                  onChange={(e) => setAuthority(e.target.value as GovernmentAuthority)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  {Object.entries(AUTHORITY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="font-medium text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'رقم المعاملة' : 'Transaction No.'}</span>
                  <input
                    required
                    value={txNumber}
                    onChange={(e) => setTxNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="font-medium text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'الحالة' : 'Status'}</span>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as TransactionStatus)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                  >
                    {Object.entries(TX_STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block space-y-1">
                <span className="font-medium text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'اسم الخدمة المطلوبة' : 'Service Description'}</span>
                <input
                  required
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  placeholder={lang === 'ar' ? 'شهادة عدم ممانعة تمديد مياه' : 'Water Connection NOC'}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </label>

              <label className="block space-y-1">
                <span className="font-medium text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'المهندس المراجع' : 'Review Engineer'}</span>
                <input
                  value={reviewEngineer}
                  onChange={(e) => setReviewEngineer(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </label>

              <label className="block space-y-1">
                <span className="font-medium text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'ملاحظات المراجعة' : 'Review Notes'}</span>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
                >
                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#B4863C] text-white font-semibold hover:bg-[#9E7330]"
                >
                  {lang === 'ar' ? 'حفظ المعاملة' : 'Save Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
