import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, Layers } from 'lucide-react';
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    structural: true,
    architectural: true,
    mep: true,
    site: false,
  });

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] flex flex-col h-[520px] overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#B4863C]" />
          <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            {lang === 'ar' ? 'شجرة نموذج 5D BIM' : 'BIM Hierarchy Tree'}
          </span>
        </div>
        <span className="text-[11px] font-mono tabular-nums text-slate-500">
          {elements.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1 text-xs">
        {DISCIPLINE_ORDER.map((disc) => {
          const items = elements.filter((e) => e.discipline === disc);
          if (items.length === 0) return null;
          const isOpen = !!expanded[disc];
          const isHidden = hiddenDisciplines.has(disc);

          return (
            <div key={disc} className="space-y-0.5">
              <div className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/60">
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => ({ ...prev, [disc]: !prev[disc] }))}
                  className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200 min-w-0 flex-1 text-start"
                >
                  {isOpen ? (
                    <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  )}
                  <span className="truncate">
                    {lang === 'ar' ? DISC_LABELS[disc].ar : DISC_LABELS[disc].en}
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">({items.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleDiscipline(disc)}
                  className="p-1 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white"
                  title={isHidden ? 'Show discipline' : 'Hide discipline'}
                >
                  {isHidden ? <EyeOff className="w-3.5 h-3.5 text-slate-400" /> : <Eye className="w-3.5 h-3.5 text-[#B4863C]" />}
                </button>
              </div>

              {isOpen && (
                <div className="ps-4 space-y-0.5">
                  {items.map((el) => (
                    <button
                      key={el.id}
                      type="button"
                      onClick={() => onSelectElement(el.id)}
                      className={`w-full text-start px-2.5 py-1.5 rounded-md truncate transition-colors ${
                        selectedId === el.id
                          ? 'bg-[#B4863C] text-white font-medium'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/40'
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
