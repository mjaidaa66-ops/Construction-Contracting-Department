import React, { useState } from 'react';
import { BookOpen, Plus, Search, X } from 'lucide-react';
import type { Language, RateLibraryItem, TakeoffCategory } from '../../types/bunyan';
import { CATEGORY_LABELS, formatAED } from '../../utils/i18n';

interface RateLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  rateLibrary: RateLibraryItem[];
  onUpdateRate: (item: RateLibraryItem) => void;
  onAddRate: (item: RateLibraryItem) => void;
}

export const RateLibraryModal: React.FC<RateLibraryModalProps> = ({
  isOpen,
  onClose,
  lang,
  rateLibrary,
  onUpdateRate,
  onAddRate,
}) => {
  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState<string>('all');
  const [newNameAr, setNewNameAr] = useState('');
  const [newNameEn, setNewNameEn] = useState('');
  const [newCat, setNewCat] = useState<TakeoffCategory>('concrete');
  const [newUnit, setNewUnit] = useState<'m' | 'm2' | 'm3' | 'ton' | 'unit'>('m3');
  const [newRate, setNewRate] = useState('350');

  if (!isOpen) return null;

  const filtered = rateLibrary.filter((r) => {
    const matchCat = catFilter === 'all' || r.category === catFilter;
    const q = query.trim().toLowerCase();
    const matchQ =
      !q ||
      r.code.toLowerCase().includes(q) ||
      r.nameAr.toLowerCase().includes(q) ||
      r.nameEn.toLowerCase().includes(q) ||
      r.materialSpec.toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNameEn && !newNameAr) return;
    const nextNum = rateLibrary.length + 1;
    onAddRate({
      id: `rl-${Date.now()}`,
      code: `RL-${String(nextNum).padStart(2, '0')}`,
      category: newCat,
      nameAr: newNameAr.trim() || newNameEn.trim(),
      nameEn: newNameEn.trim() || newNameAr.trim(),
      unit: newUnit,
      rateAed: Number(newRate) || 0,
      materialSpec: 'Custom UAE Specification',
    });
    setNewNameAr('');
    setNewNameEn('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4">
      <div className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#B4863C]" />
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {lang === 'ar'
                ? 'دليل الأسعار الهندسية المعتمد بالإمارات (AED)'
                : 'UAE Standard Engineering Rate Library (AED)'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={lang === 'ar' ? 'بحث بالكود أو البند أو المواصفة...' : 'Search code, item, spec...'}
              className="w-full ps-9 pe-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
            />
          </div>

          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
          >
            <option value="all">{lang === 'ar' ? 'جميع التخصصات' : 'All Categories'}</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-start text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 sticky top-0">
              <tr>
                <th className="px-4 py-2.5 text-start">{lang === 'ar' ? 'الكود' : 'Code'}</th>
                <th className="px-4 py-2.5 text-start">{lang === 'ar' ? 'البند والمواصفة' : 'Description & Spec'}</th>
                <th className="px-4 py-2.5 text-start">{lang === 'ar' ? 'الوحدة' : 'Unit'}</th>
                <th className="px-4 py-2.5 text-end">{lang === 'ar' ? 'سعر الوحدة (د.إ)' : 'Unit Rate (AED)'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-2.5 font-mono font-bold text-[#B4863C] whitespace-nowrap">
                    {item.code}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {lang === 'ar' ? item.nameAr : item.nameEn}
                    </div>
                    <div className="text-[11px] text-slate-500">{item.materialSpec}</div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-slate-700 dark:text-slate-300">
                    {item.unit}
                  </td>
                  <td className="px-4 py-2.5 text-end">
                    <input
                      type="number"
                      min={0}
                      step="1"
                      value={item.rateAed}
                      onChange={(e) =>
                        onUpdateRate({ ...item, rateAed: Math.max(0, Number(e.target.value)) })
                      }
                      className="w-24 px-2 py-1 text-end rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono tabular-nums font-semibold text-slate-900 dark:text-white"
                      aria-label={`Rate for ${item.code}`}
                    />
                    <span className="ms-1.5 text-[10px] text-slate-400">
                      {formatAED(item.rateAed, lang)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add New Custom UAE Rate Row */}
        <form
          onSubmit={handleAdd}
          className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex flex-wrap items-center gap-2 text-xs"
        >
          <input
            value={newNameAr}
            onChange={(e) => setNewNameAr(e.target.value)}
            placeholder={lang === 'ar' ? 'اسم البند بالعربية' : 'Arabic Item Name'}
            className="flex-1 min-w-[150px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          />
          <input
            value={newNameEn}
            onChange={(e) => setNewNameEn(e.target.value)}
            placeholder={lang === 'ar' ? 'اسم البند بالإنجليزية' : 'English Item Name'}
            className="flex-1 min-w-[150px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          />
          <select
            value={newCat}
            onChange={(e) => setNewCat(e.target.value as TakeoffCategory)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          >
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</option>
            ))}
          </select>
          <select
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value as 'm' | 'm2' | 'm3' | 'ton' | 'unit')}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
          >
            <option value="m3">m3</option>
            <option value="m2">m2</option>
            <option value="m">m</option>
            <option value="ton">ton</option>
            <option value="unit">unit</option>
          </select>
          <input
            type="number"
            min={0}
            value={newRate}
            onChange={(e) => setNewRate(e.target.value)}
            className="w-24 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono tabular-nums"
            placeholder="AED"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-[#B4863C] text-white font-semibold hover:bg-[#9E7330]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'إضافة بند' : 'Add Rate'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
