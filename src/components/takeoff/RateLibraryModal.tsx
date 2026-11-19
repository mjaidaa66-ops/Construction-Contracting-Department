import React, { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { Language, RateLibraryItem, TakeoffCategory } from '../../types/bunyan';
import { CATEGORY_LABELS, formatAED } from '../../utils/i18n';
import { Button, Input, Modal, Select } from '../ui';

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-4xl"
      title={
        lang === 'ar'
          ? 'دليل الأسعار الهندسية المعتمد بالإمارات (AED)'
          : 'UAE Standard Engineering Rate Library (AED)'
      }
      subtitle={`${rateLibrary.length} ${lang === 'ar' ? 'بند قياسي معتمد' : 'standard engineering rate items'}`}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Input
              startIcon={<Search className="w-4 h-4" />}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={lang === 'ar' ? 'بحث بالكود أو البند أو المواصفة...' : 'Search code, item, spec...'}
            />
          </div>

          <Select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="w-52">
            <option value="all">{lang === 'ar' ? 'جميع التخصصات' : 'All Categories'}</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {lang === 'ar' ? v.ar : v.en}
              </option>
            ))}
          </Select>
        </div>

        <div className="max-h-[45vh] overflow-y-auto rounded-xl border border-[var(--border-hairline)]">
          <table className="w-full text-start text-xs">
            <thead className="bg-[var(--bg-surface-subtle)] border-b border-[var(--border-hairline)] text-[var(--text-muted)] sticky top-0">
              <tr>
                <th className="px-4 py-2.5 text-start">{lang === 'ar' ? 'الكود' : 'Code'}</th>
                <th className="px-4 py-2.5 text-start">{lang === 'ar' ? 'البند والمواصفة' : 'Description & Spec'}</th>
                <th className="px-4 py-2.5 text-start">{lang === 'ar' ? 'الوحدة' : 'Unit'}</th>
                <th className="px-4 py-2.5 text-end">{lang === 'ar' ? 'سعر الوحدة (د.إ)' : 'Unit Rate (AED)'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-[var(--bg-surface-subtle)] transition-colors">
                  <td className="px-4 py-2.5 font-mono font-bold text-[#B4863C] whitespace-nowrap">
                    {item.code}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-[var(--text-primary)]">
                      {lang === 'ar' ? item.nameAr : item.nameEn}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">{item.materialSpec}</div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[var(--text-secondary)]">
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
                      className="w-24 px-2 py-1 text-end rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] font-mono tabular-nums font-semibold text-[var(--text-primary)]"
                      aria-label={`Rate for ${item.code}`}
                    />
                    <span className="ms-1.5 text-[10px] text-[var(--text-muted)] font-mono">
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
          className="p-3.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] flex flex-wrap items-center gap-2 text-xs"
        >
          <input
            value={newNameAr}
            onChange={(e) => setNewNameAr(e.target.value)}
            placeholder={lang === 'ar' ? 'اسم البند بالعربية' : 'Arabic Item Name'}
            className="flex-1 min-w-[140px] px-3 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
          />
          <input
            value={newNameEn}
            onChange={(e) => setNewNameEn(e.target.value)}
            placeholder={lang === 'ar' ? 'اسم البند بالإنجليزية' : 'English Item Name'}
            className="flex-1 min-w-[140px] px-3 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
          />
          <select
            value={newCat}
            onChange={(e) => setNewCat(e.target.value as TakeoffCategory)}
            className="px-2.5 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
          >
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {lang === 'ar' ? v.ar : v.en}
              </option>
            ))}
          </select>
          <select
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value as 'm' | 'm2' | 'm3' | 'ton' | 'unit')}
            className="px-2.5 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] font-mono text-[var(--text-primary)]"
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
            className="w-24 px-2.5 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] font-mono tabular-nums text-[var(--text-primary)]"
            placeholder="AED"
          />
          <Button type="submit" variant="primary" size="sm" icon={<Plus className="w-3.5 h-3.5" />}>
            {lang === 'ar' ? 'إضافة بند' : 'Add Rate'}
          </Button>
        </form>
      </div>
    </Modal>
  );
};
