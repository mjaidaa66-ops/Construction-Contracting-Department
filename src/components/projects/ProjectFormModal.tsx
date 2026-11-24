import React, { useState } from 'react';
import { AlertCircle, FolderPlus } from 'lucide-react';
import type { Language, Project, ProjectStatus, ProjectType } from '../../types/bunyan';
import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from '../../utils/i18n';
import {
  generateGisPlotTakeoffSheet,
  generateProjectBimElements,
} from '../../utils/gisTakeoffGenerator';
import {
  validateProjectFormInput,
  type ProjectFormInput,
} from '../../utils/projectHelpers';
import { Button, Input, Modal, Select } from '../ui';

interface ProjectFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  initialProject?: Project | null;
  existingProjects?: Project[];
  onSave: (project: Project) => void;
}

export const ProjectFormModal: React.FC<ProjectFormModalProps> = ({
  isOpen,
  onClose,
  lang,
  initialProject,
  existingProjects = [],
  onSave,
}) => {
  const defaultCode = (() => {
    if (initialProject?.code) return initialProject.code;
    const nextIdx = existingProjects.length + 1;
    return `BNY-2026-${String(nextIdx).padStart(3, '0')}`;
  })();

  const [code, setCode] = useState(defaultCode);
  const [name, setName] = useState(initialProject?.name || '');
  const [nameEn, setNameEn] = useState(initialProject?.nameEn || '');
  const [projectType, setProjectType] = useState<ProjectType>(initialProject?.projectType || 'villa');
  const [status, setStatus] = useState<ProjectStatus>(initialProject?.status || 'under_construction');
  const [ownerName, setOwnerName] = useState(initialProject?.ownerName || '');
  const [ownerPhone, setOwnerPhone] = useState(initialProject?.ownerPhone || '+971 50 ');
  const [ownerEmail, setOwnerEmail] = useState(initialProject?.ownerEmail || '');
  const [ownerNationalId] = useState(initialProject?.ownerNationalId || '784-');
  const [consultantOffice, setConsultantOffice] = useState(initialProject?.consultantOffice || '');
  const [consultantEngineer] = useState(initialProject?.consultantEngineer || '');
  const [residentEngineer] = useState(initialProject?.residentEngineer || '');
  const [permitNumber, setPermitNumber] = useState(initialProject?.permitNumber || 'SHJ-BP-2026-');
  const [permitDate, setPermitDate] = useState(
    initialProject?.permitDate || new Date().toISOString().slice(0, 10)
  );
  const [permitExpiryDate, setPermitExpiryDate] = useState(
    initialProject?.permitExpiryDate || '2027-12-31'
  );
  const [licensingAuthority, setLicensingAuthority] = useState(
    initialProject?.licensingAuthority || 'بلدية مدينة الشارقة'
  );
  const [approvedBudget, setApprovedBudget] = useState(String(initialProject?.approvedBudget ?? 1800000));
  const [paidAmount, setPaidAmount] = useState(String(initialProject?.paidAmount ?? 0));
  const [actualProgress, setActualProgress] = useState(String(initialProject?.actualProgress ?? 15));
  const [plotNumber, setPlotNumber] = useState(initialProject?.gisData.plotNumber || '512-SHJ');
  const [sectorName, setSectorName] = useState(initialProject?.gisData.sectorName || 'الرحمانية');
  const [plotAreaSqFt, setPlotAreaSqFt] = useState(String(initialProject?.gisData.plotAreaSqFt ?? 10000));
  const [errors, setErrors] = useState<Partial<Record<keyof ProjectFormInput, string>>>({});

  const isAr = lang === 'ar';

  const clearFieldError = (field: keyof ProjectFormInput) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const validation = validateProjectFormInput(
      {
        code,
        name,
        nameEn,
        approvedBudget,
        paidAmount,
        actualProgress,
        plotNumber,
        plotAreaSqFt,
        permitDate,
        permitExpiryDate,
      },
      existingProjects,
      initialProject?.id,
      lang
    );

    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    const id = initialProject?.id || `proj-${Date.now()}`;
    const budgetVal = Number(approvedBudget);
    const paidVal = Number(paidAmount);
    const progressVal = Math.min(100, Math.max(0, Number(actualProgress)));
    const areaFt = Number(plotAreaSqFt);
    const areaM2 = Number((areaFt * 0.092903).toFixed(2));
    const side = Number(Math.sqrt(areaM2).toFixed(2));

    const project: Project = {
      id,
      ownerId: initialProject?.ownerId,
      code: code.trim(),
      name: name.trim() || nameEn.trim(),
      nameEn: nameEn.trim() || name.trim(),
      category: initialProject?.category || 'المشاريع الإنشائية',
      projectType,
      status,
      ownerName: ownerName.trim() || (isAr ? 'مالك المشروع' : 'Project Owner'),
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
      permitDate: permitDate || new Date().toISOString().slice(0, 10),
      permitExpiryDate: permitExpiryDate || '2027-12-31',
      licensingAuthority: licensingAuthority.trim(),
      approvedBudget: budgetVal,
      invoicedAmount: paidVal,
      paidAmount: paidVal,
      retentionPercentage: initialProject?.retentionPercentage ?? 10,
      actualProgress: progressVal,
      plannedProgress: initialProject?.plannedProgress ?? Math.max(progressVal, 20),
      phases: initialProject?.phases || [
        { id: 'ph-1', nameAr: 'الحفر والأساسات', nameEn: 'Excavation & Foundations', weightPercentage: 25, progressPercentage: 100, status: 'completed', startDate: '2026-02-01', endDate: '2026-03-15' },
        { id: 'ph-2', nameAr: 'الهيكل الخرساني', nameEn: 'RC Superstructure', weightPercentage: 35, progressPercentage: 30, status: 'in_progress', startDate: '2026-03-16', endDate: '2026-07-01' },
        { id: 'ph-3', nameAr: 'التشطيبات والـ MEP', nameEn: 'MEP & Finishes', weightPercentage: 40, progressPercentage: 0, status: 'not_started', startDate: '2026-07-02', endDate: '2026-12-01' },
      ],
      paymentMilestones: initialProject?.paymentMilestones || [
        { id: 'pm-1', titleAr: 'الدفعة المقدمة', titleEn: 'Advance Payment', percentage: 20, amountAed: Math.round(budgetVal * 0.2), dueDate: '2026-02-10', status: paidVal >= budgetVal * 0.2 ? 'paid' : 'pending' },
        { id: 'pm-2', titleAr: 'إنجاز الهيكل الخرساني', titleEn: 'Structure Completion', percentage: 40, amountAed: Math.round(budgetVal * 0.4), dueDate: '2026-07-10', status: 'pending' },
      ],
      documents: initialProject?.documents || [],
      gisData: initialProject?.gisData
        ? {
            ...initialProject.gisData,
            plotNumber: plotNumber.trim(),
            sectorName: sectorName.trim(),
            plotAreaSqFt: areaFt,
            plotAreaSqM: areaM2,
          }
        : {
            plotNumber: plotNumber.trim(),
            basinNumber: 'SHJ-01',
            sectorName: sectorName.trim() || 'الرحمانية',
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
      bimElements: initialProject?.bimElements,
      takeoffSheets: initialProject?.takeoffSheets,
      takeoffMeasurements: initialProject?.takeoffMeasurements || [],
      takeoffSummaryConfig: initialProject?.takeoffSummaryConfig || { overheadPercent: 10, profitPercent: 12, vatPercent: 5 },
    };

    if (!initialProject) {
      project.bimElements = generateProjectBimElements(project);
      project.takeoffSheets = [generateGisPlotTakeoffSheet(project)];
    }

    onSave(project);
    onClose();
  };

  const errorCount = Object.keys(errors).length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-3xl"
      icon={<FolderPlus className="w-4 h-4" />}
      title={
        initialProject
          ? isAr ? 'تعديل بيانات المشروع' : 'Edit Project'
          : isAr ? 'إنشاء مشروع إنشائي جديد' : 'Create Construction Project'
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {isAr ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button type="submit" form="bunyan-project-form">
            {isAr ? 'حفظ المشروع' : 'Save Project'}
          </Button>
        </>
      }
    >
      <form id="bunyan-project-form" noValidate onSubmit={handleSubmit} className="p-5 space-y-4">
        {errorCount > 0 && (
          <div
            role="alert"
            className="p-3 rounded-lg border border-rose-500/35 bg-rose-500/10 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>
              {isAr
                ? `يرجى تصحيح الحقول المحددة (${errorCount}) قبل حفظ المشروع.`
                : `Please resolve the ${errorCount} highlighted validation error(s) before saving.`}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            label={isAr ? 'كود المشروع' : 'Project Code'}
            required
            value={code}
            error={errors.code}
            onChange={(e) => {
              setCode(e.target.value);
              clearFieldError('code');
            }}
            className="font-mono"
          />
          <Select
            label={isAr ? 'نوع المشروع' : 'Project Type'}
            value={projectType}
            onChange={(e) => setProjectType(e.target.value as ProjectType)}
          >
            {Object.entries(PROJECT_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{isAr ? v.ar : v.en}</option>
            ))}
          </Select>
          <Select
            label={isAr ? 'الحالة' : 'Status'}
            value={status}
            onChange={(e) => setStatus(e.target.value as ProjectStatus)}
          >
            {Object.entries(PROJECT_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{isAr ? v.ar : v.en}</option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={isAr ? 'اسم المشروع (عربي)' : 'Project Name (Arabic)'}
            required
            value={name}
            error={errors.name}
            onChange={(e) => {
              setName(e.target.value);
              clearFieldError('name');
              clearFieldError('nameEn');
            }}
            placeholder="فيلا سكنية — مويلح"
          />
          <Input
            label={isAr ? 'اسم المشروع (إنجليزي)' : 'Project Name (English)'}
            required
            value={nameEn}
            error={errors.nameEn}
            onChange={(e) => {
              setNameEn(e.target.value);
              clearFieldError('name');
              clearFieldError('nameEn');
            }}
            placeholder="Residential Villa — Muwaileh"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input label={isAr ? 'اسم المالك' : 'Owner Name'} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
          <Input label={isAr ? 'هاتف المالك' : 'Owner Phone'} value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} className="font-mono" />
          <Input label={isAr ? 'بريد المالك' : 'Owner Email'} value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input label={isAr ? 'الاستشاري' : 'Consultant Office'} value={consultantOffice} onChange={(e) => setConsultantOffice(e.target.value)} />
          <Input label={isAr ? 'رقم رخصة البناء' : 'Permit Number'} value={permitNumber} onChange={(e) => setPermitNumber(e.target.value)} className="font-mono" />
          <Input label={isAr ? 'جهة الترخيص' : 'Licensing Authority'} value={licensingAuthority} onChange={(e) => setLicensingAuthority(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={isAr ? 'تاريخ إصدار الرخصة' : 'Permit Issue Date'}
            type="date"
            value={permitDate}
            onChange={(e) => {
              setPermitDate(e.target.value);
              clearFieldError('permitExpiryDate');
            }}
            className="font-mono"
          />
          <Input
            label={isAr ? 'تاريخ انتهاء الرخصة' : 'Permit Expiry Date'}
            type="date"
            value={permitExpiryDate}
            error={errors.permitExpiryDate}
            onChange={(e) => {
              setPermitExpiryDate(e.target.value);
              clearFieldError('permitExpiryDate');
            }}
            className="font-mono"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            label={isAr ? 'قيمة المشروع (د.إ)' : 'Project Value (AED)'}
            type="number"
            min={0}
            value={approvedBudget}
            error={errors.approvedBudget}
            onChange={(e) => {
              setApprovedBudget(e.target.value);
              clearFieldError('approvedBudget');
              clearFieldError('paidAmount');
            }}
            className="font-mono tabular-nums"
          />
          <Input
            label={isAr ? 'الدفعات المستلمة (د.إ)' : 'Payments Received (AED)'}
            type="number"
            min={0}
            value={paidAmount}
            error={errors.paidAmount}
            onChange={(e) => {
              setPaidAmount(e.target.value);
              clearFieldError('paidAmount');
            }}
            className="font-mono tabular-nums"
          />
          <Input
            label={isAr ? 'نسبة الإنجاز (%)' : 'Progress (%)'}
            type="number"
            min={0}
            max={100}
            value={actualProgress}
            error={errors.actualProgress}
            onChange={(e) => {
              setActualProgress(e.target.value);
              clearFieldError('actualProgress');
            }}
            className="font-mono tabular-nums"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            label={isAr ? 'رقم القطعة GIS' : 'GIS Plot No.'}
            value={plotNumber}
            error={errors.plotNumber}
            onChange={(e) => {
              setPlotNumber(e.target.value);
              clearFieldError('plotNumber');
            }}
            className="font-mono"
          />
          <Input label={isAr ? 'المنطقة / القطاع' : 'Sector / District'} value={sectorName} onChange={(e) => setSectorName(e.target.value)} />
          <Input
            label={isAr ? 'مساحة الأرض (قدم²)' : 'Plot Area (sq.ft)'}
            type="number"
            min={1}
            value={plotAreaSqFt}
            error={errors.plotAreaSqFt}
            onChange={(e) => {
              setPlotAreaSqFt(e.target.value);
              clearFieldError('plotAreaSqFt');
            }}
            className="font-mono tabular-nums"
          />
        </div>
      </form>
    </Modal>
  );
};
