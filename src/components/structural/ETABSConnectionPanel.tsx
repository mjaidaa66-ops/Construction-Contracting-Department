import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  FileCode2,
  FolderOpen,
  Lock,
  RefreshCw,
  ShieldAlert,
  WifiOff,
} from 'lucide-react';
import type { Language } from '../../types/bunyan';
import type { EtabsAgentStatus } from '../../modules/structural/types/etabs.types';
import {
  Button,
  Card,
  CardHeader,
  HolographicPanel,
  Input,
  StatusIndicator,
} from '../ui';

interface ETABSConnectionPanelProps {
  lang: Language;
  status: EtabsAgentStatus | null;
  checking: boolean;
  canConnect: boolean;
  onRefreshStatus: () => Promise<void>;
  onOpenAuthorizedModel: (modelFilePath: string) => Promise<void>;
  onGoToFallbackImport: () => void;
}

export const ETABSConnectionPanel: React.FC<ETABSConnectionPanelProps> = ({
  lang,
  status,
  checking,
  canConnect,
  onRefreshStatus,
  onOpenAuthorizedModel,
  onGoToFallbackImport,
}) => {
  const [edbPath, setEdbPath] = useState('');
  const [openingModel, setOpeningModel] = useState(false);

  const isReady = Boolean(
    status?.agentReachable && status?.etabsV20Compatible && status?.activeInstanceRunning
  );

  const tone = !status || !status.agentReachable
    ? 'warning'
    : isReady
    ? 'success'
    : status.etabsInstalled
    ? 'info'
    : 'danger';

  const stateLabel = !status
    ? lang === 'ar'
      ? 'لم يتم الفحص بعد'
      : 'Not Checked'
    : status.connectionState;

  const handleOpenEdb = async () => {
    if (!edbPath.trim()) return;
    setOpeningModel(true);
    try {
      await onOpenAuthorizedModel(edbPath.trim());
    } finally {
      setOpeningModel(false);
    }
  };

  return (
    <div className="space-y-4">
      <HolographicPanel
        title={
          lang === 'ar'
            ? 'مركز اتصال CSI ETABS v20 OAPI (وكيل ويندوز الهندسي)'
            : 'CSI ETABS v20 OAPI Connection Center (Windows Agent)'
        }
        subtitle={
          lang === 'ar'
            ? 'اتصال حقيقي بواجهة البرمجة الرسمية ETABSv1.dll في وضع القراءة فقط — بدون أي بيانات وهمية'
            : 'Authentic read-only COM OAPI bridge via ETABSv1.dll — zero simulated ETABS states'
        }
        icon={<Cpu className="w-4 h-4" />}
        badge={<StatusIndicator tone={tone} label={stateLabel} />}
        action={
          <Button
            size="sm"
            variant="cyan"
            loading={checking}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={() => void onRefreshStatus()}
          >
            {lang === 'ar' ? 'فحص حالة الوكيل و ETABS' : 'Probe Agent & ETABS v20'}
          </Button>
        }
      >
        <div className="p-5 space-y-5">
          {/* Security & Read-Only Guardrail Notice */}
          <div className="p-3.5 rounded-xl border border-[#00E5A8]/30 bg-[#00E5A8]/8 flex items-start gap-3 text-xs">
            <Lock className="w-4 h-4 text-[#00E5A8] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold text-[var(--text-primary)]">
                {lang === 'ar'
                  ? 'حماية القراءة فقط وعزل المضيف المحلي (127.0.0.1:45820)'
                  : 'Read-Only Safety & Loopback Isolation (127.0.0.1:45820)'}
              </div>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                {lang === 'ar'
                  ? 'يعمل الوكيل بصلاحية قراءة فقط ولا يقوم بتشغيل التحليل أو تعديل ملفات .EDB تلقائياً. فتح أي ملف يتطلب تفويضاً صريحاً من المهندس.'
                  : 'The Windows Agent enforces read-only COM OAPI access. It never runs ETABS analysis or mutates .EDB files automatically.'}
              </p>
            </div>
          </div>

          {/* Diagnostic Matrix */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 text-xs">
            <Card padded className="space-y-1">
              <div className="text-[var(--text-muted)]">
                {lang === 'ar' ? 'حالة وكيل ويندوز' : 'Windows Agent'}
              </div>
              <div className="font-bold flex items-center gap-1.5 text-[var(--text-primary)]">
                {status?.agentReachable ? (
                  <CheckCircle2 className="w-4 h-4 text-[#00E5A8]" />
                ) : (
                  <WifiOff className="w-4 h-4 text-[#FF9D42]" />
                )}
                <span>
                  {status?.agentReachable
                    ? lang === 'ar'
                      ? `متصل (${status.agentVersion})`
                      : `Reachable (${status.agentVersion})`
                    : lang === 'ar'
                    ? 'غير متصل'
                    : 'Unavailable'}
                </span>
              </div>
            </Card>

            <Card padded className="space-y-1">
              <div className="text-[var(--text-muted)]">
                {lang === 'ar' ? 'تثبيت ETABS v20' : 'ETABS v20 Install'}
              </div>
              <div className="font-bold flex items-center gap-1.5 text-[var(--text-primary)]">
                {status?.etabsV20Compatible ? (
                  <CheckCircle2 className="w-4 h-4 text-[#00E5A8]" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-[#FF405C]" />
                )}
                <span>
                  {status?.etabsInstalled
                    ? `v${status.installedVersion} (${status.etabsV20Compatible ? 'Compatible' : 'Unsupported'})`
                    : lang === 'ar'
                    ? 'غير مكتشف'
                    : 'Not Detected'}
                </span>
              </div>
            </Card>

            <Card padded className="space-y-1">
              <div className="text-[var(--text-muted)]">
                {lang === 'ar' ? 'جلسة ETABS النشطة' : 'Active ETABS Instance'}
              </div>
              <div className="font-bold text-[var(--text-primary)] truncate">
                {status?.activeInstanceRunning
                  ? lang === 'ar'
                    ? 'نشط وجاهز للربط'
                    : 'Running & Attached'
                  : lang === 'ar'
                  ? 'لا توجد جلسة نشطة'
                  : 'No Running Instance'}
              </div>
            </Card>

            <Card padded className="space-y-1">
              <div className="text-[var(--text-muted)]">
                {lang === 'ar' ? 'النموذج المفتوح (.EDB)' : 'Active .EDB Model'}
              </div>
              <div className="font-bold font-mono text-[var(--accent-cyan)] truncate">
                {status?.activeModelName || (lang === 'ar' ? 'لا يوجد نموذج' : 'None Loaded')}
              </div>
            </Card>
          </div>

          {/* Authentic Status Message & Fallback Guidance */}
          <div className="p-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-[#FF9D42] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-[var(--text-primary)]">
                  {lang === 'ar' ? 'التشخيص الفعلي للاتصال:' : 'Live Connection Diagnostic:'}
                </div>
                <p className="text-[var(--text-secondary)]">
                  {status?.message ||
                    (lang === 'ar'
                      ? 'اضغط "فحص حالة الوكيل" للتحقق من وجود وكيل ويندوز على هذا الجهاز.'
                      : 'Click "Probe Agent & ETABS v20" to verify local Windows Agent and ETABS v20 availability.')}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="gold"
              icon={<FileCode2 className="w-3.5 h-3.5" />}
              onClick={onGoToFallbackImport}
            >
              {lang === 'ar' ? 'استخدام مسار الجداول المصدرة البديل' : 'Use Exported Tables Fallback'}
            </Button>
          </div>

          {/* Authorized .EDB Open Form (Only works when agent is genuinely reachable & role allows) */}
          <Card className="overflow-hidden">
            <CardHeader
              title={
                lang === 'ar'
                  ? 'فتح ملف .EDB محدد بتفويض المهندس'
                  : 'Open User-Selected .EDB Model (Authorized Workflow)'
              }
              subtitle={
                lang === 'ar'
                  ? 'يتطلب تشغيل Bunyan.EtabsAgent على جهاز ويندوز وتثبيت CSI ETABS v20'
                  : 'Requires active Windows Engineering Agent with CSI ETABS v20 installed'
              }
              icon={<FolderOpen className="w-4 h-4" />}
            />
            <div className="p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
              <div className="flex-1">
                <Input
                  label={lang === 'ar' ? 'المسار الكامل لملف .EDB على جهاز ويندوز' : 'Full Windows .EDB File Path'}
                  value={edbPath}
                  onChange={(e) => setEdbPath(e.target.value)}
                  placeholder="C:\Engineering\Models\SharjahTower_v20.edb"
                  dir="ltr"
                  disabled={!canConnect || !status?.agentReachable}
                />
              </div>
              <Button
                variant="primary"
                loading={openingModel}
                disabled={!canConnect || !status?.agentReachable || !edbPath.trim()}
                onClick={() => void handleOpenEdb()}
              >
                {lang === 'ar' ? 'فتح بتفويض القراءة فقط' : 'Authorize & Open .EDB'}
              </Button>
            </div>
          </Card>
        </div>
      </HolographicPanel>
    </div>
  );
};
