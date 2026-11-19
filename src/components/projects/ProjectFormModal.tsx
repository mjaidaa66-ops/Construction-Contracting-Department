import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { Language, Project, ProjectStatus, ProjectType } from '../../types/bunyan';
import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from '../../utils/i18n';
import { generateSharjahVillaBimElements } from '../../utils/bimModelGenerator';
import { INITIAL_TAKEOFF_SHEETS } from '../../data/uaeSeedData';

interface ProjectFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  initialProject?: Project | null;
  onSave: (project: Project) => void;
}

export const ProjectFormModal: React.FC<ProjectFormModalProps> = ({
  isOpen,
  onClose,
  lang,
  initialProject,
  onSave,
}) => {
  const [code, setCode] = useState(initialProject?.code || `BNY-2026-00${Math.floor(Math.random() * 8 + 2)}`);
  const [name, setName] = useState(initialProject?.name || '');
  const [nameEn, setNameEn] = useState(initialProject?.nameEn || '');
  const [projectType, setProjectType] = useState<ProjectType>(initialProject?.projectType || 'villa');
  const [status, setStatus] = useState<ProjectStatus>(initialProject?.status || 'under_construction');
  const [ownerName, setOwnerName] = useState(initialProject?.ownerName || '');
  const [ownerPhone, setOwnerPhone] = useState(initialProject?.ownerPhone || '+971 50 ');
  const [ownerEmail, setOwnerEmail] = useState(initialProject?.ownerEmail || '');
  const [ownerNationalId, setOwnerNationalId] = useState(initialProject?.ownerNationalId || '784-');
  const [consultantOffice, setConsultantOffice] = useState(initialProject?.consultantOffice || '');
  const [consultantEngineer, setConsultantEngineer] = useState(initialProject?.consultantEngineer || '');
  const [residentEngineer, setResidentEngineer] = useState(initialProject?.residentEngineer || '');
  const [permitNumber, setPermitNumber] = useState(initialProject?.permitNumber || 'SHJ-BP-2026-');
  const [licensingAuthority, setLicensingAuthority] = useState(initialProject?.licensingAuthority || 'بلدية مدينة الشارقة');
  const [approvedBudget, setApprovedBudget] = useState(String(initialProject?.approvedBudget ?? 1800000));
  const [invoicedAmount, setInvoicedAmount] = useState(String(initialProject?.invoicedAmount ?? 0));
  const [paidAmount, setPaidAmount] = useState(String(initialProject?.paidAmount ?? 0));
  const [actualProgress, setActualProgress] = useState(String(initialProject?.actualProgress ?? 15));
  const [plotNumber, setPlotNumber] = useState(initialProject?.gisData.plotNumber || '512-SHJ');
  const [sectorName, setSectorName] = useState(initialProject?.gisData.sectorName || 'الرحمانية');
  const [plotAreaSqFt, setPlotAreaSqFt] = useState(String(initialProject?.gisData.plotAreaSqFt ?? 10000));

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = initialProject?.id || `proj-${Date.now()}`;
    const areaFt = Number(plotAreaSqFt) || 10000;
    const areaM2 = Number((areaFt * 0.092903).toFixed(2));
    const side = Number(Math.sqrt(areaM2).toFixed(2));

    const project: Project = {
      id,
      ownerId: initialProject?.ownerId,
      code: code.trim(),
      name: name.trim() || nameEn.trim() || 'مشروع إنشائي جديد',
      nameEn: nameEn.trim() || name.trim() || 'New Construction Project',
      category: 'المشاريع الإنشائية',
      projectType,
      status,
      ownerName: ownerName.trim() || 'مالك المشروع',
      ownerPhone: ownerPhone.trim(),
      ownerEmail: ownerEmail.trim(),
      ownerNationalId: ownerNationalId.trim(),
      consultantOffice: consultantOffice.trim() || 'مكتب الاستشارات الهندسية',
      consultantEngineer: consultantEngineer.trim() || 'م. الاستشاري',
      consultantPhone: initialProject?.consultantPhone || '+971 6 555 0100',
      consultantLicenseNo: initialProject?.consultantLicenseNo || 'SHJ-ENG-5001',
      residentEngineer: residentEngineer.trim() || 'م. المهندس المقيم',
      contractorBranch: initialProject?.contractorBranch || 'فرع الشارقة الرئيسي',
      permitNumber: permitNumber.trim(),
      permitDate: initialProject?.permitDate || new Date().toISOString().slice(0, 10),
      permitExpiryDate: initialProject?.permitExpiryDate || '2027-12-31',
      licensingAuthority: licensingAuthority.trim(),
      approvedBudget: Number(approvedBudget) || 0,
      invoicedAmount: Number(invoicedAmount) || 0,
      paidAmount: Number(paidAmount) || 0,
      retentionPercentage: initialProject?.retentionPercentage ?? 10,
      actualProgress: Math.min(100, Math.max(0, Number(actualProgress) || 0)),
      plannedProgress: initialProject?.plannedProgress ?? 20,
      phases: initialProject?.phases || [
        { id: 'ph-1', nameAr: 'الحفر والأساسات', nameEn: 'Excavation & Foundations', weightPercentage: 25, progressPercentage: 100, status: 'completed', startDate: '2026-02-01', endDate: '2026-03-15' },
        { id: 'ph-2', nameAr: 'الهيكل الخرساني', nameEn: 'RC Superstructure', weightPercentage: 35, progressPercentage: 30, status: 'in_progress', startDate: '2026-03-16', endDate: '2026-07-01' },
        { id: 'ph-3', nameAr: 'التشطيبات والـ MEP', nameEn: 'MEP & Finishes', weightPercentage: 40, progressPercentage: 0, status: 'not_started', startDate: '2026-07-02', endDate: '2026-12-01' },
      ],
      paymentMilestones: initialProject?.paymentMilestones || [
        { id: 'pm-1', titleAr: 'الدفعة المقدمة', titleEn: 'Advance Payment', percentage: 20, amountAed: (Number(approvedBudget) || 0) * 0.2, dueDate: '2026-02-10', status: 'paid' },
        { id: 'pm-2', titleAr: 'إنجاز الهيكل الخرساني', titleEn: 'Structure Completion', percentage: 40, amountAed: (Number(approvedBudget) || 0) * 0.4, dueDate: '2026-07-10', status: 'pending' },
      ],
      documents: initialProject?.documents || [],
      gisData: initialProject?.gisData
        ? { ...initialProject.gisData, plotNumber, sectorName, plotAreaSqFt: areaFt, plotAreaSqM: areaM2 }
        : {
            plotNumber,
            basinNumber: 'SHJ-01',
            sectorName,
            emirate: 'الشارقة / Sharjah',
            latitude: 25.3463,
            longitude: 55.4209,
            plotAreaSqFt: areaFt,
            plotAreaSqM: areaM2,
            builtUpAreaSqFt: Math.round(areaFt * 0.45),
            zoning: 'R-2 (سكني G+1)',
            setbacks: { front: 5, rear: 3, sideLeft: 3, sideRight: 3 },
            boundaryPoints: [
              { x: 0, y: 0, label: 'P1' },
              { x: side, y: 0, label: 'P2' },
              { x: side, y: side, label: 'P3' },
              { x: 0, y: side, label: 'P4' },
            ],
          },
      bimElements: initialProject?.bimElements || generateSharjahVillaBimElements(),
      takeoffSheets: initialProject?.takeoffSheets || INITIAL_TAKEOFF_SHEETS.map((s) => ({ ...s, projectId: id })),
      takeoffMeasurements: initialProject?.takeoffMeasurements || [],
      takeoffSummaryConfig: initialProject?.takeoffSummaryConfig || { overheadPercent: 10, profitPercent: 12, vatPercent: 5 },
    };

    onSave(project);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] p-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {initialProject
              ? lang === 'ar' ? 'تعديل بيانات المشروع' : 'Edit Project'
              : lang === 'ar' ? 'إنشاء مشروع إنشائي جديد' : 'Create Construction Project'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'كود المشروع' : 'Project Code'}</span>
              <input
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'نوع المشروع' : 'Project Type'}</span>
              <select
                value={projectType}
                onChange={(e) => setProjectType(e.target.value as ProjectType)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
              >
                {Object.entries(PROJECT_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'الحالة' : 'Status'}</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
              >
                {Object.entries(PROJECT_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'اسم المشروع (عربي)' : 'Project Name (Arabic)'}</span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="فيلا سكنية — مويلح"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'اسم المشروع (إنجليزي)' : 'Project Name (English)'}</span>
              <input
                required
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="Residential Villa — Muwaileh"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'اسم المالك' : 'Owner Name'}</span>
              <input
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'هاتف المالك' : 'Owner Phone'}</span>
              <input
                value={ownerPhone}
                onChange={(e) => setOwnerPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'بريد المالك' : 'Owner Email'}</span>
              <input
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'الاستشاري' : 'Consultant Office'}</span>
              <input
                value={consultantOffice}
                onChange={(e) => setConsultantOffice(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'رقم رخصة البناء' : 'Permit Number'}</span>
              <input
                value={permitNumber}
                onChange={(e) => setPermitNumber(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'جهة الترخيص' : 'Licensing Authority'}</span>
              <input
                value={licensingAuthority}
                onChange={(e) => setLicensingAuthority(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'الميزانية (د.إ)' : 'Budget (AED)'}</span>
              <input
                type="number"
                min={0}
                value={approvedBudget}
                onChange={(e) => setApprovedBudget(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'المستخلصات (د.إ)' : 'Invoiced (AED)'}</span>
              <input
                type="number"
                min={0}
                value={invoicedAmount}
                onChange={(e) => setInvoicedAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'المدفوع (د.إ)' : 'Paid (AED)'}</span>
              <input
                type="number"
                min={0}
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'نسبة الإنجاز (%)' : 'Progress (%)'}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={actualProgress}
                onChange={(e) => setActualProgress(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'رقم القطعة GIS' : 'GIS Plot No.'}</span>
              <input
                value={plotNumber}
                onChange={(e) => setPlotNumber(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'المنطقة / القطاع' : 'Sector / District'}</span>
              <input
                value={sectorName}
                onChange={(e) => setSectorName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'مساحة الأرض (قدم²)' : 'Plot Area (sq.ft)'}</span>
              <input
                type="number"
                min={100}
                value={plotAreaSqFt}
                onChange={(e) => setPlotAreaSqFt(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
              />
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {lang === 'ar' ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-[#B4863C] text-white font-semibold hover:bg-[#9E7330]"
            >
              {lang === 'ar' ? 'حفظ المشروع' : 'Save Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
