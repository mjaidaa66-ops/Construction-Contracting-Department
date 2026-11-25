import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  Box,
  Cpu,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  Layers,
  Printer,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import type { Language, Project, Role } from '../../types/bunyan';
import type { EtabsAgentStatus } from '../../modules/structural/types/etabs.types';
import type {
  ImportStepState,
  NormalizedStructuralDataset,
  StructuralImportPreview,
  StructuralReportDocument,
} from '../../modules/structural/types/structural-results.types';
import {
  getStructuralRolePermissions,
  resolveStructuralRole,
  type StructuralImportJob,
  type StructuralModelRevision,
  type StructuralRole,
} from '../../modules/structural/types/structural.types';
import { buildStructuralProjectFromBunyanProject } from '../../modules/structural/services/structuralProject.service';
import { parseExportedEtabsTables } from '../../modules/structural/services/etabsTableParser.service';
import {
  buildImportPreview,
  confirmImportPreview,
} from '../../modules/structural/services/etabsImport.service';
import { generateStructuralReport } from '../../modules/structural/reports/structuralReport.service';
import {
  loadStructuralProjectBundleFromCloud,
  saveConfirmedStructuralRevisionToCloud,
  saveStructuralReportToCloud,
} from '../../services/structuralFirestoreService';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  HolographicPanel,
  SegmentedTabs,
  StatusIndicator,
  useToast,
} from '../ui';
import { ETABSConnectionPanel } from './ETABSConnectionPanel';
import { StructuralProjectOverview, getReliabilityTone } from './StructuralProjectOverview';
import { StructuralImportCenter } from './StructuralImportCenter';
import { StructuralDataInspector } from './StructuralDataInspector';
import { StructuralValidationPanel } from './StructuralValidationPanel';
import { StructuralImportHistory } from './StructuralImportHistory';

export type StructuralViewTab =
  | 'overview'
  | 'connection'
  | 'import'
  | 'model'
  | 'materials'
  | 'loads'
  | 'analysis'
  | 'design'
  | 'validation'
  | 'revisions'
  | 'reports';

interface StructuralWorkspaceProps {
  project: Project;
  lang: Language;
  currentRole: Role;
  cloudUid: string | null;
  actorName: string;
}

export const StructuralWorkspace: React.FC<StructuralWorkspaceProps> = ({
  project,
  lang,
  currentRole,
  cloudUid,
  actorName,
}) => {
  const { pushToast } = useToast();
  const [activeTab, setActiveTab] = useState<StructuralViewTab>('overview');
  const [structuralRole, setStructuralRole] = useState<StructuralRole>(() =>
    resolveStructuralRole(currentRole)
  );
  const permissions = useMemo(
    () => getStructuralRolePermissions(structuralRole),
    [structuralRole]
  );

  useEffect(() => {
    setStructuralRole(resolveStructuralRole(currentRole));
  }, [currentRole]);

  const ownerId = cloudUid || 'local_engineer';
  const baseStructuralProject = useMemo(
    () => buildStructuralProjectFromBunyanProject(project, ownerId),
    [project, ownerId]
  );

  const [revisions, setRevisions] = useState<StructuralModelRevision[]>([]);
  const [datasetsByRevision, setDatasetsByRevision] = useState<
    Record<string, NormalizedStructuralDataset>
  >({});
  const [reports, setReports] = useState<StructuralReportDocument[]>([]);
  const [jobs, setJobs] = useState<StructuralImportJob[]>([]);
  const [activeRevisionId, setActiveRevisionId] = useState<string | null>(null);

  const [agentStatus, setAgentStatus] = useState<EtabsAgentStatus | null>(null);
  const [checkingAgent, setCheckingAgent] = useState(false);
  const [preview, setPreview] = useState<StructuralImportPreview | null>(null);
  const [workflowSteps, setWorkflowSteps] = useState<ImportStepState[]>([]);
  const [busy, setBusy] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Hydrate strictly from Cloud Firestore (zero localStorage fallback)
  useEffect(() => {
    if (!cloudUid) {
      setRevisions([]);
      setDatasetsByRevision({});
      setReports([]);
      setJobs([]);
      setActiveRevisionId(null);
      return;
    }

    let cancelled = false;
    setWorkflowError(null);
    void loadStructuralProjectBundleFromCloud(cloudUid, baseStructuralProject.id)
      .then((remote) => {
        if (cancelled) return;
        const sortedRevs = [...remote.revisions].sort(
          (a, b) => (b.revisionNumber || 0) - (a.revisionNumber || 0)
        );
        setRevisions(sortedRevs);
        setDatasetsByRevision(remote.datasetsByRevision);
        setReports(remote.reports);
        setJobs(remote.importJobs);
        setActiveRevisionId(sortedRevs[0]?.id || null);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setWorkflowError(msg);
        pushToast(
          lang === 'ar'
            ? 'تعذر تحميل بيانات الهندسة الإنشائية من Cloud Firestore.'
            : 'Failed to load structural workspace from Cloud Firestore.',
          'error'
        );
      });

    return () => {
      cancelled = true;
    };
  }, [cloudUid, baseStructuralProject.id]);

  const authHeaders = useMemo(
    () => ({
      'Content-Type': 'application/json',
      'x-bunyan-uid': ownerId,
      'x-bunyan-user-name': actorName,
      'x-bunyan-structural-role': structuralRole,
    }),
    [ownerId, actorName, structuralRole]
  );

  const handleRefreshAgentStatus = useCallback(async () => {
    setCheckingAgent(true);
    try {
      const resp = await fetch('/api/structural/agent/status', {
        method: 'GET',
        headers: authHeaders,
      });
      const data = (await resp.json()) as EtabsAgentStatus;
      setAgentStatus(data);
    } catch {
      setAgentStatus({
        agentReachable: false,
        agentVersion: 'none',
        platform: 'unavailable',
        readOnlyMode: true,
        etabsInstalled: false,
        etabsV20Compatible: false,
        installedVersion: '',
        installPath: '',
        oapiDllPath: '',
        activeInstanceRunning: false,
        activeModelPath: '',
        activeModelName: '',
        modelLocked: false,
        connectionState: 'AGENT_UNAVAILABLE',
        message:
          lang === 'ar'
            ? 'تعذر الوصول إلى خادم الوكيل المحلي. يمكنك استخدام مسار استيراد جداول ETABS المصدرة.'
            : 'Unable to reach Windows Engineering Agent. Use the Exported ETABS Tables workflow.',
        checkedAtUtc: new Date().toISOString(),
      });
    } finally {
      setCheckingAgent(false);
    }
  }, [authHeaders, lang]);

  useEffect(() => {
    void handleRefreshAgentStatus();
  }, [handleRefreshAgentStatus]);

  const handleOpenAuthorizedEdb = async (modelFilePath: string) => {
    try {
      const resp = await fetch('/api/structural/agent/open-model', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ modelFilePath, authorizedByUser: true }),
      });
      const data = (await resp.json()) as EtabsAgentStatus & { error?: string };
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to open .EDB model.');
      }
      setAgentStatus(data);
      pushToast(
        lang === 'ar'
          ? 'تم فتح ملف .EDB عبر الوكيل بوضع القراءة فقط.'
          : 'Opened .EDB model in read-only mode via Windows Agent.',
        'success'
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to open .EDB file.', 'error');
    }
  };

  const handleRunLiveAgentImport = async (allowDuplicate: boolean) => {
    setBusy(true);
    setWorkflowError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const resp = await fetch('/api/structural/agent/extract-preview', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          projectId: baseStructuralProject.id,
          bunyanProjectId: project.id,
          allowDuplicate,
        }),
        signal: controller.signal,
      });
      const data = (await resp.json()) as StructuralImportPreview & { error?: string };
      if (!resp.ok) {
        throw new Error(data.error || 'Live ETABS extraction unavailable.');
      }
      setPreview(data);
      setWorkflowSteps(data.steps);
    } catch (err) {
      setWorkflowError(
        err instanceof Error ? err.message : 'ETABS v20 extraction failed.'
      );
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const handleUploadFallbackTables = async (params: {
    file: File;
    forceUnit: string;
    lengthUnit: string;
    sourceVersion: string;
    allowDuplicate: boolean;
  }) => {
    setBusy(true);
    setWorkflowError(null);
    try {
      const lower = params.file.name.toLowerCase();
      const parsed =
        lower.endsWith('.xlsx') || lower.endsWith('.xls')
          ? parseExportedEtabsTables({
              fileName: params.file.name,
              binaryBuffer: await params.file.arrayBuffer(),
              forceUnit: params.forceUnit,
              lengthUnit: params.lengthUnit,
              sourceVersion: params.sourceVersion,
            })
          : parseExportedEtabsTables({
              fileName: params.file.name,
              contentText: await params.file.text(),
              forceUnit: params.forceUnit,
              lengthUnit: params.lengthUnit,
              sourceVersion: params.sourceVersion,
            });

      const nextPreview = buildImportPreview({
        ownerId,
        projectId: baseStructuralProject.id,
        createdByUid: ownerId,
        createdByName: actorName,
        raw: parsed.payload,
        existingRevisions: revisions,
        allowDuplicate: params.allowDuplicate,
      });

      setPreview(nextPreview);
      setWorkflowSteps(nextPreview.steps);
      pushToast(
        lang === 'ar'
          ? `تم تحليل الجداول (${parsed.detectedTables.join(', ')}) بنجاح — بانتظار التأكيد`
          : `Parsed exported ETABS tables (${parsed.detectedTables.join(', ')}) — ready for review`,
        'success'
      );
    } catch (err) {
      setWorkflowError(
        err instanceof Error ? err.message : 'Failed to parse exported ETABS tables.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmSaveRevision = async (allowDuplicateOverride: boolean) => {
    if (!preview) return;
    setBusy(true);
    setWorkflowError(null);
    try {
      const result = confirmImportPreview({
        preview,
        confirmedByUser: true,
        allowDuplicateOverride,
      });

      if (!cloudUid) {
        throw new Error(
          lang === 'ar'
            ? 'مرفوض (Fail-Closed): يجب تسجيل الدخول بحساب Google الموثق والاتصال بـ Cloud Firestore قبل اعتماد أي مراجعة إنشائية.'
            : 'FAIL_CLOSED: Verified Google sign-in and active Cloud Firestore connection are required to commit structural revisions.'
        );
      }

      const nextRevisions = [result.dataset.revision, ...revisions];
      const nextDatasets = {
        ...datasetsByRevision,
        [result.dataset.revision.id]: result.dataset,
      };
      const nextReports = [result.report, ...reports];
      const nextJobs = [result.confirmedJob, ...jobs];

      const updatedStructuralProj = {
        ...baseStructuralProject,
        activeRevisionId: result.dataset.revision.id,
        revisionCount: nextRevisions.length,
        reliabilitySummary: result.dataset.validation.reliability,
      };

      await saveConfirmedStructuralRevisionToCloud({
        ownerId: cloudUid,
        structuralProject: updatedStructuralProj,
        dataset: result.dataset,
        report: result.report,
      });

      setRevisions(nextRevisions);
      setDatasetsByRevision(nextDatasets);
      setReports(nextReports);
      setJobs(nextJobs);
      setWorkflowSteps(result.steps);
      setActiveRevisionId(result.dataset.revision.id);
      setPreview(null);

      pushToast(
        lang === 'ar'
          ? `تم حفظ المراجعة #${result.dataset.revision.revisionNumber} ذرياً ومزامنتها مع Cloud Firestore.`
          : `Committed immutable revision #${result.dataset.revision.revisionNumber} atomically to Cloud Firestore.`,
        'success'
      );
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : 'Failed to save revision.');
    } finally {
      setBusy(false);
    }
  };

  const handleCancelWorkflow = () => {
    abortRef.current?.abort();
    setPreview(null);
    setWorkflowSteps([]);
    setWorkflowError(null);
  };

  const activeRevision =
    revisions.find((r) => r.id === activeRevisionId) || revisions[0] || null;
  const activeDataset = activeRevision
    ? datasetsByRevision[activeRevision.id] || null
    : null;

  const structuralProjectSummary = useMemo(
    () => ({
      ...baseStructuralProject,
      activeRevisionId: activeRevision?.id,
      revisionCount: revisions.length,
      reliabilitySummary: activeRevision?.reliability || 'MISSING',
    }),
    [baseStructuralProject, activeRevision, revisions.length]
  );

  const navTabs: Array<{ id: StructuralViewTab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: lang === 'ar' ? 'نظرة عامة' : 'Overview', icon: <Activity className="w-3.5 h-3.5" /> },
    { id: 'connection', label: lang === 'ar' ? 'اتصال ETABS v20' : 'ETABS Connection', icon: <Cpu className="w-3.5 h-3.5" /> },
    { id: 'import', label: lang === 'ar' ? 'مركز الاستيراد' : 'Import Center', icon: <Upload className="w-3.5 h-3.5" /> },
    { id: 'model', label: lang === 'ar' ? 'بيانات النموذج' : 'Model Data', icon: <Box className="w-3.5 h-3.5" /> },
    { id: 'materials', label: lang === 'ar' ? 'المواد والمقاطع' : 'Materials & Sections', icon: <Layers className="w-3.5 h-3.5" /> },
    { id: 'loads', label: lang === 'ar' ? 'الأحمال والتراكيب' : 'Loads & Combos', icon: <FileSpreadsheet className="w-3.5 h-3.5" /> },
    { id: 'analysis', label: lang === 'ar' ? 'نتائج التحليل' : 'Analysis Results', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { id: 'design', label: lang === 'ar' ? 'نتائج التصميم' : 'Design Results', icon: <ShieldCheck className="w-3.5 h-3.5" /> },
    { id: 'validation', label: lang === 'ar' ? 'مركز التحقق' : 'Validation Center', icon: <ShieldAlert className="w-3.5 h-3.5" /> },
    { id: 'revisions', label: lang === 'ar' ? 'تاريخ المراجعات' : 'Revisions', icon: <History className="w-3.5 h-3.5" /> },
    { id: 'reports', label: lang === 'ar' ? 'التقارير الإنشائية' : 'Structural Reports', icon: <FileText className="w-3.5 h-3.5" /> },
  ];

  const handleGenerateExtraReport = async (type: StructuralReportDocument['reportType']) => {
    if (!activeDataset) return;
    if (!cloudUid) {
      pushToast(
        lang === 'ar'
          ? 'مرفوض (Fail-Closed): يجب الاتصال بحساب Google الموثق لحفظ التقرير سحابياً.'
          : 'FAIL_CLOSED: Verified Google cloud session required to save structural reports.',
        'error'
      );
      return;
    }
    const docReport = generateStructuralReport({ dataset: activeDataset, reportType: type });
    try {
      await saveStructuralReportToCloud({
        ownerId: cloudUid,
        projectId: baseStructuralProject.id,
        revisionId: activeDataset.revision.id,
        report: docReport,
      });
      setReports((prev) => [docReport, ...prev]);
      pushToast(
        lang === 'ar' ? 'تم إصدار وحفظ التقرير الهندسي سحابياً.' : 'Structural report committed to Firestore.',
        'success'
      );
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : 'Failed to save structural report to Firestore.',
        'error'
      );
    }
  };

  const handleDownloadMarkdownReport = (rep: StructuralReportDocument) => {
    const blob = new Blob([rep.markdownContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${rep.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <SegmentedTabs
          value={activeTab}
          onChange={setActiveTab}
          items={navTabs}
          className="w-full"
        />
      </div>

      {activeTab === 'overview' && (
        <StructuralProjectOverview
          lang={lang}
          bunyanProject={project}
          structuralProject={structuralProjectSummary}
          activeRevision={activeRevision}
          activeDataset={activeDataset}
          structuralRole={structuralRole}
          permissions={permissions}
          onChangeStructuralRole={setStructuralRole}
          onStartImport={() => setActiveTab('import')}
          onOpenConnection={() => setActiveTab('connection')}
        />
      )}

      {activeTab === 'connection' && (
        <ETABSConnectionPanel
          lang={lang}
          status={agentStatus}
          checking={checkingAgent}
          canConnect={permissions.canConnectEtabsAgent}
          onRefreshStatus={handleRefreshAgentStatus}
          onOpenAuthorizedModel={handleOpenAuthorizedEdb}
          onGoToFallbackImport={() => setActiveTab('import')}
        />
      )}

      {activeTab === 'import' && (
        <StructuralImportCenter
          lang={lang}
          agentStatus={agentStatus}
          canStageImport={permissions.canStageImport}
          canConfirmRevision={permissions.canConfirmImportRevision}
          preview={preview}
          steps={workflowSteps}
          busy={busy}
          errorMessage={workflowError}
          onRunLiveAgentImport={handleRunLiveAgentImport}
          onUploadFallbackTables={handleUploadFallbackTables}
          onConfirmSaveRevision={handleConfirmSaveRevision}
          onCancelWorkflow={handleCancelWorkflow}
        />
      )}

      {(activeTab === 'model' || activeTab === 'materials' || activeTab === 'loads') && (
        <StructuralDataInspector
          lang={lang}
          dataset={activeDataset}
          sectionFocus={activeTab === 'materials' ? 'materials' : activeTab === 'loads' ? 'loads' : 'model'}
        />
      )}

      {activeTab === 'analysis' && (
        <HolographicPanel
          title={lang === 'ar' ? 'حالة نتائج التحليل الإنشائي (Phase 1 / Phase 2)' : 'Structural Analysis Status (Phase 1 / Phase 2 Boundary)'}
          subtitle={
            lang === 'ar'
              ? 'يعرض حالات التحليل الحقيقية المستخرجة من ETABS بدون توليد أو تلفيق أي قوى أو إزاحات'
              : 'Displays authentic load-case execution states from ETABS without fabricating modal or drift numbers'
          }
          icon={<BarChart3 className="w-4 h-4" />}
        >
          <div className="p-4 space-y-2.5 text-xs">
            {!activeDataset || activeDataset.analysisResults.length === 0 ? (
              <EmptyState
                icon={<BarChart3 className="w-5 h-5" />}
                title={lang === 'ar' ? 'لا توجد حالات تحليل مستخرجة' : 'No Analysis Case States Extracted'}
                description={
                  lang === 'ar'
                    ? 'استورد نموذجاً أولاً أو انتظر المرحلة الثانية لاستخراج نتائج الإجهادات والانزياح.'
                    : 'Import a structural model first; full dynamic response extraction ships in Phase 2.'
                }
              />
            ) : (
              activeDataset.analysisResults.map((res) => (
                <div key={res.id} className="p-3 rounded-xl border border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-mono font-bold text-[var(--text-primary)]">{res.caseName}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      {String(res.summaryMetrics.caseType || '')} · {String(res.summaryMetrics.note || '')}
                    </div>
                  </div>
                  <StatusIndicator
                    tone={res.status === 'AVAILABLE_FROM_SOURCE' ? 'success' : 'neutral'}
                    label={res.status}
                  />
                </div>
              ))
            )}
          </div>
        </HolographicPanel>
      )}

      {activeTab === 'design' && (
        <Card className="overflow-hidden">
          <CardHeader
            title={lang === 'ar' ? 'نتائج التصميم الإنشائي (المرحلة الثانية)' : 'Structural Code-Check Design Results (Phase 2)'}
            icon={<ShieldCheck className="w-4 h-4" />}
            badge={<StatusIndicator tone="neutral" label="NOT_RUN_PHASE_2_PENDING" />}
          />
          <EmptyState
            icon={<ShieldCheck className="w-5 h-5" />}
            title={lang === 'ar' ? 'محرك التحقق والتصميم الكامل مجدول للمرحلة الثانية' : 'Automated Design Checking Scheduled for Phase 2'}
            description={
              lang === 'ar'
                ? 'تركز المرحلة الأولى على الاتصال الموثوق بـ ETABS v20، توحيد الوحدات، المعاينة والتأكيد، وسجل المراجعات بدون أي نتائج تصميم مختلقة.'
                : 'Phase 1 delivers authentic ETABS v20 connectivity, SI normalization, validation, and immutable revisions without fabricating concrete/steel design ratios.'
            }
          />
        </Card>
      )}

      {activeTab === 'validation' && (
        <StructuralValidationPanel
          lang={lang}
          validation={activeDataset?.validation || null}
        />
      )}

      {activeTab === 'revisions' && (
        <StructuralImportHistory
          lang={lang}
          revisions={revisions}
          jobs={jobs}
          activeRevisionId={activeRevisionId}
          onSelectRevision={(id) => {
            setActiveRevisionId(id);
            setActiveTab('model');
          }}
        />
      )}

      {activeTab === 'reports' && (
        <HolographicPanel
          title={lang === 'ar' ? 'التقارير الإنشائية وسجلات التدقيق' : 'Structural Engineering Reports & Audit Trail'}
          icon={<FileText className="w-4 h-4" />}
          action={
            activeDataset && permissions.canExportReports ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => handleGenerateExtraReport('VALIDATION_SUMMARY')}>
                  {lang === 'ar' ? 'إصدار تقرير التحقق' : 'Validation Report'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleGenerateExtraReport('MODEL_INVENTORY')}>
                  {lang === 'ar' ? 'إصدار تقرير الحصر' : 'Inventory Report'}
                </Button>
              </div>
            ) : null
          }
        >
          <div className="p-4 space-y-3 text-xs">
            {reports.length === 0 ? (
              <EmptyState
                icon={<FileText className="w-5 h-5" />}
                title={lang === 'ar' ? 'لا توجد تقارير إنشائية بعد' : 'No Structural Reports Generated Yet'}
                description={
                  lang === 'ar'
                    ? 'يتم إنشاء تقرير تدقيق الاستيراد تلقائياً عند تأكيد أي مراجعة نموذج (الخطوة 11).'
                    : 'Import audit reports are generated automatically in Step 11 when a revision is confirmed.'
                }
              />
            ) : (
              reports.map((rep) => (
                <Card key={rep.id} padded className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-[var(--text-primary)]">
                        {lang === 'ar' ? rep.titleAr : rep.titleEn}
                      </div>
                      <div dir="ltr" className="text-[11px] font-mono text-[var(--text-muted)]">
                        {rep.id} · {rep.generatedAt}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusIndicator tone={getReliabilityTone(rep.reliability)} label={rep.reliability} />
                      <Button
                        size="xs"
                        variant="outline"
                        icon={<Download className="w-3.5 h-3.5" />}
                        onClick={() => handleDownloadMarkdownReport(rep)}
                      >
                        Markdown
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        icon={<Printer className="w-3.5 h-3.5" />}
                        onClick={() => window.print()}
                      >
                        {lang === 'ar' ? 'طباعة' : 'Print'}
                      </Button>
                    </div>
                  </div>
                  <pre
                    dir="ltr"
                    className="p-3 rounded-xl bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] text-[11px] font-mono overflow-x-auto whitespace-pre-wrap"
                  >
                    {rep.markdownContent}
                  </pre>
                </Card>
              ))
            )}
          </div>
        </HolographicPanel>
      )}
    </div>
  );
};
