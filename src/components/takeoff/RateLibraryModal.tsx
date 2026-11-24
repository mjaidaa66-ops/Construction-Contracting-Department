import React, { useState } from 'react';
import { AlertCircle, Plus, Search } from 'lucide-react';
import type { Language, RateLibraryItem, TakeoffCategory } from '../../types/bunyan';
import { CATEGORY_LABELS, formatAED } from '../../utils/i18n';
import { Button, EmptyState, Input, Modal, Select } from '../ui';

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
  const [newEquipmentRate, setNewEquipmentRate] = useState('0');
  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isAr = lang === 'ar';

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
    if (!newNameEn.trim() && !newNameAr.trim()) {
      setFormError(
        isAr
          ? 'يرجى إدخال اسم البند بالعربية أو الإنجليزية.'
          : 'Please enter an item name in Arabic or English.'
      );
      return;
    }

    const parsedRate = Number(newRate);
    const parsedEquipmentRate = Number(newEquipmentRate);
    if (!Number.isFinite(parsedRate) || parsedRate < 0) {
      setFormError(
        isAr
          ? 'سعر الوحدة يجب أن يكون رقماً غير سالب.'
          : 'Unit rate must be a non-negative number.'
      );
      return;
    }
    if (!Number.isFinite(parsedEquipmentRate) || parsedEquipmentRate < 0) {
      setFormError(
        isAr
          ? 'تكلفة المعدات يجب أن تكون رقماً غير سالب.'
          : 'Equipment rate must be a non-negative number.'
      );
      return;
    }

    const nextNum = rateLibrary.length + 1;
    onAddRate({
      id: `rl-${Date.now()}`,
      code: `RL-${String(nextNum).padStart(2, '0')}`,
      category: newCat,
      nameAr: newNameAr.trim() || newNameEn.trim(),
      nameEn: newNameEn.trim() || newNameAr.trim(),
      unit: newUnit,
      rateAed: parsedRate,
      equipmentRate: parsedEquipmentRate,
      materialSpec: 'Custom UAE Specification',
    });
    setNewNameAr('');
    setNewNameEn('');
    setNewEquipmentRate('0');
    setFormError(null);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-5xl"
      title={
        isAr
          ? 'دليل الأسعار الهندسية المعتمد بالإمارات (AED)'
          : 'UAE Standard Engineering Rate Library (AED)'
      }
      subtitle={`${rateLibrary.length} ${isAr ? 'بند قياسي معتمد' : 'standard engineering rate items'}`}
    >
      <div className="p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Input
              startIcon={<Search className="w-4 h-4" />}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isAr ? 'بحث بالكود أو البند أو المواصفة...' : 'Search code, item, spec...'}
            />
          </div>

          <Select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="w-52">
            <option value="all">{isAr ? 'جميع التخصصات' : 'All Categories'}</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {isAr ? v.ar : v.en}
              </option>
            ))}
          </Select>
        </div>

        <div className="max-h-[42vh] overflow-y-auto rounded-xl border border-[var(--border-hairline)]">
          {filtered.length === 0 ? (
            <EmptyState
              title={isAr ? 'لا توجد بنود أسعار مطابقة' : 'No Matching Rate Items'}
              description={
                isAr
                  ? 'جرب تغيير عبارة البحث أو التخصص الهندسي.'
                  : 'Try adjusting your search term or category filter.'
              }
              actionLabel={query || catFilter !== 'all' ? (isAr ? 'عرض الكل' : 'Show All') : undefined}
              onAction={
                query || catFilter !== 'all'
                  ? () => {
                      setQuery('');
                      setCatFilter('all');
                    }
                  : undefined
              }
            />
          ) : (
            <table className="w-full text-start text-xs">
              <thead className="bg-[var(--bg-surface-subtle)] border-b border-[var(--border-hairline)] text-[var(--text-muted)] sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2.5 text-start">{isAr ? 'الكود' : 'Code'}</th>
                  <th className="px-4 py-2.5 text-start">{isAr ? 'البند والمواصفة' : 'Description & Spec'}</th>
                  <th className="px-4 py-2.5 text-start">{isAr ? 'الوحدة' : 'Unit'}</th>
                  <th className="px-4 py-2.5 text-end">{isAr ? 'سعر الوحدة (د.إ)' : 'Unit Rate (AED)'}</th>
                  <th className="px-4 py-2.5 text-end">{isAr ? 'تكلفة المعدات (د.إ)' : 'Equipment Rate (AED)'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-[var(--bg-surface-subtle)] transition-colors">
                    <td className="px-4 py-2.5 font-mono font-bold text-[#B4863C] whitespace-nowrap">
                      {item.code}
                    </td>
                    <td className="px-4 py-2.5 min-w-[200px]">
                      <div className="font-semibold text-[var(--text-primary)]">
                        {isAr ? item.nameAr : item.nameEn}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">{item.materialSpec}</div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[var(--text-secondary)]">
                      {item.unit}
                    </td>
                    <td className="px-4 py-2.5 text-end whitespace-nowrap">
                      <input
                        type="number"
                        min={0}
                        step="1"
                        value={item.rateAed}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          onUpdateRate({
                            ...item,
                            rateAed: Number.isFinite(v) ? Math.max(0, v) : 0,
                          });
                        }}
                        className="w-24 px-2 py-1 text-end rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] font-mono tabular-nums font-semibold text-[var(--text-primary)]"
                        aria-label={`Unit rate for ${item.code}`}
                      />
                      <span dir="ltr" className="ms-1.5 text-[10px] text-[var(--text-muted)] font-mono">
                        {formatAED(item.rateAed, lang)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-end whitespace-nowrap">
                      <input
                        type="number"
                        min={0}
                        step="1"
                        value={item.equipmentRate ?? 0}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          onUpdateRate({
                            ...item,
                            equipmentRate: Number.isFinite(v) ? Math.max(0, v) : 0,
                          });
                        }}
                        className="w-24 px-2 py-1 text-end rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] font-mono tabular-nums font-semibold text-[var(--text-primary)]"
                        aria-label={`Equipment rate for ${item.code}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {formError && (
          <div
            role="alert"
            className="p-2.5 rounded-lg border border-rose-500/35 bg-rose-500/10 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* Add New Custom UAE Rate Row */}
        <form
          noValidate
          onSubmit={handleAdd}
          className="p-3.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2 text-xs items-end"
        >
          <label className="lg:col-span-3 space-y-1">
            <span className="text-[11px] text-[var(--text-muted)] block">
              {isAr ? 'اسم البند (عربي)' : 'Name (Arabic)'}
            </span>
            <input
              value={newNameAr}
              onChange={(e) => {
                setNewNameAr(e.target.value);
                setFormError(null);
              }}
              placeholder={isAr ? 'اسم البند بالعربية' : 'Arabic Item Name'}
              className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
            />
          </label>

          <label className="lg:col-span-3 space-y-1">
            <span className="text-[11px] text-[var(--text-muted)] block">
              {isAr ? 'اسم البند (إنجليزي)' : 'Name (English)'}
            </span>
            <input
              value={newNameEn}
              onChange={(e) => {
                setNewNameEn(e.target.value);
                setFormError(null);
              }}
              placeholder={isAr ? 'اسم البند بالإنجليزية' : 'English Item Name'}
              className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
            />
          </label>

          <label className="lg:col-span-2 space-y-1">
            <span className="text-[11px] text-[var(--text-muted)] block">
              {isAr ? 'التخصص' : 'Category'}
            </span>
            <select
              value={newCat}
              onChange={(e) => setNewCat(e.target.value as TakeoffCategory)}
              className="w-full h-8 px-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
            >
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {isAr ? v.ar : v.en}
                </option>
              ))}
            </select>
          </label>

          <label className="lg:col-span-1 space-y-1">
            <span className="text-[11px] text-[var(--text-muted)] block">
              {isAr ? 'الوحدة' : 'Unit'}
            </span>
            <select
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value as 'm' | 'm2' | 'm3' | 'ton' | 'unit')}
              className="w-full h-8 px-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] font-mono text-[var(--text-primary)]"
            >
              <option value="m3">m3</option>
              <option value="m2">m2</option>
              <option value="m">m</option>
              <option value="ton">ton</option>
              <option value="unit">unit</option>
            </select>
          </label>

          <label className="lg:col-span-1 space-y-1">
            <span className="text-[11px] text-[var(--text-muted)] block">
              {isAr ? 'السعر AED' : 'Rate AED'}
            </span>
            <input
              type="number"
              min={0}
              value={newRate}
              onChange={(e) => {
                setNewRate(e.target.value);
                setFormError(null);
              }}
              className="w-full h-8 px-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] font-mono tabular-nums text-[var(--text-primary)]"
              placeholder="AED"
            />
          </label>

          <label className="lg:col-span-1 space-y-1">
            <span className="text-[11px] text-[var(--text-muted)] block">
              {isAr ? 'المعدات AED' : 'Equip. AED'}
            </span>
            <input
              type="number"
              min={0}
              value={newEquipmentRate}
              onChange={(e) => {
                setNewEquipmentRate(e.target.value);
                setFormError(null);
              }}
              className="w-full h-8 px-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] font-mono tabular-nums text-[var(--text-primary)]"
              placeholder="0"
            />
          </label>

          <div className="lg:col-span-1">
            <Button type="submit" variant="primary" size="sm" className="w-full h-8" icon={<Plus className="w-3.5 h-3.5" />}>
              {isAr ? 'إضافة' : 'Add'}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
};
