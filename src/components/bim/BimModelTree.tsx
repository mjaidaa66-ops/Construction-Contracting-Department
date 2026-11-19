import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, Layers, Search } from 'lucide-react';
import type { BimDiscipline, BimElement, Language } from '../../types/bunyan';

interface BimModelTreeProps {
  elements: BimElement[];
  selectedId: string | null;
  hiddenDisciplines: Set<BimDiscipline>;
  onSelectElement: (id: string) => void;
  onToggleDiscipline: (disc: BimDiscipline) => void;
  lang: Language;
}

const DISCIPLINE_ORDER: BimDiscipline[] = ['structural', 'architectural', 'mep', 'site'];

const DISC_LABELS: Record<BimDiscipline, { ar: string; en: string }> = {
  structural: { ar: 'الهيكل الإنشائي', en: 'Structural' },
  architectural: { ar: 'العناصر المعمارية', en: 'Architectural' },
  mep: { ar: 'الأعمال الكهروميكانيكية MEP', en: 'MEP Systems' },
  site: { ar: 'الموقع العام', en: 'Site & Grid' },
};

export const BimModelTree: React.FC<BimModelTreeProps> = ({
  elements,
  selectedId,
  hiddenDisciplines,
  onSelectElement,
  onToggleDiscipline,
  lang,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    structural: true,
    architectural: true,
    mep: true,
    site: false,
  });

  const q = searchQuery.trim().toLowerCase();

  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] flex flex-col h-[600px] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border-hairline)] space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#B4863C]" />
            <span className="text-xs font-bold text-[var(--text-primary)]">
              {lang === 'ar' ? 'شجرة نموذج 5D BIM' : 'BIM Hierarchy Tree'}
            </span>
          </div>
          <span className="text-[11px] font-mono tabular-nums text-[var(--text-muted)]">
            {elements.length}
          </span>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute top-1/2 -translate-y-1/2 start-2.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={lang === 'ar' ? 'تصفية العناصر أو GUID...' : 'Filter elements or GUID...'}
            className="w-full ps-8 pe-2.5 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[#B4863C]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1 text-xs">
        {DISCIPLINE_ORDER.map((disc) => {
          const items = elements.filter((e) => {
            if (e.discipline !== disc) return false;
            if (!q) return true;
            return (
              e.name.toLowerCase().includes(q) ||
              e.nameAr.toLowerCase().includes(q) ||
              e.guid.toLowerCase().includes(q) ||
              e.category.toLowerCase().includes(q)
            );
          });
          if (items.length === 0) return null;
          const isOpen = q ? true : !!expanded[disc];
          const isHidden = hiddenDisciplines.has(disc);

          return (
            <div key={disc} className="space-y-0.5">
              <div className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-[var(--bg-surface-subtle)] transition-colors">
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => ({ ...prev, [disc]: !prev[disc] }))}
                  className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)] min-w-0 flex-1 text-start"
                >
                  {isOpen ? (
                    <ChevronDown className="w-3.5 h-3.5 shrink-0 text-[var(--text-muted)]" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 shrink-0 text-[var(--text-muted)]" />
                  )}
                  <span className="truncate">
                    {lang === 'ar' ? DISC_LABELS[disc].ar : DISC_LABELS[disc].en}
                  </span>
                  <span className="font-mono text-[10px] text-[var(--text-muted)]">({items.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleDiscipline(disc)}
                  className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  title={isHidden ? 'Show discipline' : 'Hide discipline'}
                >
                  {isHidden ? (
                    <EyeOff className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  ) : (
                    <Eye className="w-3.5 h-3.5 text-[#B4863C]" />
                  )}
                </button>
              </div>

              {isOpen && (
                <div className="ps-4 space-y-0.5">
                  {items.map((el) => (
                    <button
                      key={el.id}
                      type="button"
                      onClick={() => onSelectElement(el.id)}
                      className={`w-full text-start px-2.5 py-1.5 rounded-lg truncate transition-colors ${
                        selectedId === el.id
                          ? 'bg-[#B4863C] text-white font-semibold'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {lang === 'ar' ? el.nameAr : el.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
