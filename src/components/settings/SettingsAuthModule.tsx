import React, { useEffect, useState } from 'react';
import {
  Archive,
  Building2,
  CheckCircle2,
  Cpu,
  Download,
  Fingerprint,
  GitCompareArrows,
  LifeBuoy,
  LogIn,
  LogOut,
  Shield,
  ShieldCheck,
  Smartphone,
  UserCheck,
  XCircle,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { CloudSyncState } from '../../services/cloudSyncService';
import {
  FIRESTORE_DATABASE_ID,
  formatFirebaseAuthError,
  isAppCheckConfigured,
} from '../../services/firebase';
import type { WorkspaceSnapshotData } from '../../services/reconciliationAuditor';
import type { BackupData, CompanyProfile, Language, Project, Role } from '../../types/bunyan';
import { getRolePermissions, type RolePermissions } from '../../utils/rbacPermissions';
import { usePWAInstall } from '../../utils/usePWAInstall';
import { BunyanLogo } from '../common/BunyanLogo';
import { BackupSyncModal } from '../projects/BackupSyncModal';
import { ReconciliationAuditorPanel } from './ReconciliationAuditorPanel';
import {
  Button,
  Card,
  CardHeader,
  HolographicPanel,
  Input,
  StatusBadge,
  StatusIndicator,
  useToast,
} from '../ui';

interface SettingsAuthModuleProps {
  lang: Language;
  initialFocus?: 'accounts' | 'settings';
  currentRole: Role;
  onChangeRole: (role: Role) => void;
  companyProfile: CompanyProfile;
  onUpdateCompany: (profile: CompanyProfile) => void;
  biometricRegistered: boolean;
  onToggleBiometric: (next: boolean) => void;
  firebaseUser: User | null;
  firestoreConnected: boolean;
  syncState?: CloudSyncState;
  onSignInGoogle: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onSyncSeedToCloud: () => Promise<void>;
  backupData?: BackupData;
  onImportBackup?: (data: BackupData, mode?: 'merge' | 'replace') => void;
  cloudUid?: string | null;
  localWorkspace?: WorkspaceSnapshotData;
  onApplyPulledWorkspacePatch?: (patch: Partial<WorkspaceSnapshotData>) => void;
  onManifestAttached?: (updatedProject: Project) => void;
}

const PERMISSION_ROWS: Array<{
  key: keyof RolePermissions;
  ar: string;
  en: string;
}> = [
  { key: 'canManageProjects', ar: 'إنشاء وتعديل المشاريع والعقود', en: 'Create & Edit Projects' },
  { key: 'canDeleteProjects', ar: 'حذف المشاريع نهائياً', en: 'Delete Projects' },
  { key: 'canEditEngineering', ar: 'تعديل الحصر الهندسي و BIM 5D', en: 'Edit Engineering & 5D BIM' },
  { key: 'canEditFinancials', ar: 'تعديل المستخلصات والتدفقات المالية', en: 'Edit Financials & Claims' },
  { key: 'canViewFinancialReports', ar: 'اعتماد وعرض التقارير المالية', en: 'View & Audit Financial Reports' },
  { key: 'canManageGovernment', ar: 'إدارة معاملات بلدية الشارقة', en: 'Manage Municipal Portal' },
  { key: 'canManageCompanySettings', ar: 'تعديل إعدادات الشركة والضرائب', en: 'Manage Company & VAT Settings' },
  { key: 'canExportReports', ar: 'تصدير وطباعة التقارير الرسمية', en: 'Export & Print Official Reports' },
  { key: 'canManageTemplates', ar: 'إدارة قوالب وإعدادات مركز التقارير', en: 'Manage Report Templates & Settings' },
];

export const SettingsAuthModule: React.FC<SettingsAuthModuleProps> = ({
  lang,
  initialFocus = 'settings',
  currentRole,
  onChangeRole,
  companyProfile,
  onUpdateCompany,
  biometricRegistered,
  onToggleBiometric,
  firebaseUser,
  firestoreConnected,
  syncState,
  onSignInGoogle,
  onSignOut,
  onSyncSeedToCloud,
  backupData,
  onImportBackup,
  cloudUid = null,
  localWorkspace,
  onApplyPulledWorkspacePatch,
  onManifestAttached,
}) => {
  const [companyForm, setCompanyForm] = useState<CompanyProfile>(companyProfile);
  const [syncing, setSyncing] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const { pushToast } = useToast();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const isAr = lang === 'ar';
  const perms = getRolePermissions(currentRole);

  useEffect(() => {
    setCompanyForm(companyProfile);
  }, [companyProfile]);

  const handleSaveCompany = (e: React.FormEvent) => {
    e.preventDefault();
    if (!perms.canManageCompanySettings) {
      pushToast(
        isAr ? 'تعديل إعدادات الشركة متاح لدور المدير (Admin) فقط.' : 'Company settings require Admin role.',
        'error'
      );
      return;
    }
    onUpdateCompany(companyForm);
    pushToast(isAr ? 'تم حفظ ملف الشركة والرقم الضريبي' : 'Company profile saved', 'success');
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <HolographicPanel className="p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <BunyanLogo size="lg" lang={lang} />
          <div className="space-y-1">
            <StatusBadge
              tone="info"
              label={
                initialFocus === 'accounts'
                  ? isAr ? 'الحسابات والصلاحيات (RBAC)' : 'Accounts & Permissions (RBAC)'
                  : isAr ? 'الإعدادات والدعم الفني' : 'System Settings & Technical Support'
              }
            />
            <p className="text-xs text-[var(--text-secondary)] max-w-xl">
              {isAr
                ? 'إدارة تسجيل الدخول بحساب Google، والمزامنة الفورية مع Cloud Firestore، ومصفوفة صلاحيات الفريق، وملف المنشأة والدعم الفني.'
                : 'Manage Google Sign-in, automatic per-user Cloud Firestore sync, workspace RBAC permissions matrix, company profile, and system diagnostics.'}
            </p>
          </div>
        </div>
      </HolographicPanel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Firebase Google Authentication & Cloud Sync */}
        <Card padded className="space-y-4">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-[var(--accent-cyan)]" />
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              {isAr ? 'تسجيل الدخول بحساب جوجل والمزامنة السحابية' : 'Google Sign-In & Cloud Firestore Sync'}
            </h2>
          </div>

          {firebaseUser && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)]">
              {firebaseUser.photoURL ? (
                <img
                  src={firebaseUser.photoURL}
                  alt={firebaseUser.displayName || 'Google User'}
                  className="w-10 h-10 rounded-full object-cover border border-[var(--border-hairline)]"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#2563EB] to-[#0284C7] dark:from-[#38BDF8] dark:to-[#2563EB] text-white dark:text-[#090E1A] font-bold flex items-center justify-center">
                  {(firebaseUser.displayName || firebaseUser.email || 'G').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1 text-xs">
                <div className="font-bold text-[var(--text-primary)] truncate">
                  {firebaseUser.displayName || (isAr ? 'مستخدم منصة بنيان' : 'Bunyan User')}
                </div>
                <div dir="ltr" className="font-mono text-[11px] text-[var(--text-muted)] truncate">
                  {firebaseUser.email}
                </div>
              </div>
              <StatusIndicator
                tone={firebaseUser.emailVerified ? 'success' : 'warning'}
                label={firebaseUser.emailVerified ? (isAr ? 'موثق' : 'Verified') : (isAr ? 'غير موثق' : 'Unverified')}
              />
            </div>
          )}

          <div className="p-4 rounded-xl bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] text-xs space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)]">{isAr ? 'حالة الاتصال السحابي:' : 'Firestore Status:'}</span>
              <StatusIndicator
                tone={firestoreConnected && firebaseUser?.emailVerified ? 'success' : 'danger'}
                label={
                  firestoreConnected && firebaseUser?.emailVerified
                    ? isAr ? 'مسار سحابي موثق (Fail-Closed)' : 'Verified Cloud Path'
                    : firestoreConnected
                    ? isAr ? 'مقفل (بانتظار توثيق Google)' : 'Locked (Sign In Required)'
                    : isAr ? 'مقفل (السحابة غير متاحة)' : 'Locked (Cloud Unreachable)'
                }
              />
            </div>
            <div className="flex justify-between items-center gap-2">
              <span className="text-[var(--text-muted)]">{isAr ? 'الحساب المسجل:' : 'Signed-in Account:'}</span>
              <span dir="ltr" className="font-mono text-[var(--text-primary)] truncate">
                {firebaseUser?.email || (isAr ? 'غير مسجل (مقفل أمنياً)' : 'Not signed in (Fail-Closed)')}
              </span>
            </div>
            <div className="flex justify-between items-center gap-2">
              <span className="text-[var(--text-muted)]">{isAr ? 'قاعدة البيانات:' : 'Firestore DB:'}</span>
              <span dir="ltr" className="font-mono text-[10.5px] text-[var(--accent-cyan)] truncate max-w-[220px]">
                {FIRESTORE_DATABASE_ID}
              </span>
            </div>
            {syncState?.lastSyncedAt && (
              <div className="flex justify-between items-center gap-2">
                <span className="text-[var(--text-muted)]">{isAr ? 'آخر مزامنة:' : 'Last Synced:'}</span>
                <span dir="ltr" className="font-mono text-[11px] text-[var(--text-secondary)]">
                  {new Date(syncState.lastSyncedAt).toLocaleString(isAr ? 'ar-AE' : 'en-AE')}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {firebaseUser ? (
              <>
                <Button
                  variant="cyan"
                  loading={syncing}
                  icon={<CheckCircle2 className="w-4 h-4" />}
                  onClick={async () => {
                    setSyncing(true);
                    try {
                      await onSyncSeedToCloud();
                    } catch (err) {
                      pushToast(
                        err instanceof Error
                          ? err.message
                          : isAr
                          ? 'تعذر إتمام المزامنة السحابية'
                          : 'Cloud sync failed',
                        'error'
                      );
                    } finally {
                      setSyncing(false);
                    }
                  }}
                >
                  {syncing
                    ? isAr ? 'جاري المزامنة...' : 'Syncing...'
                    : isAr ? 'مزامنة المشاريع إلى Firestore' : 'Sync Workspace to Firestore'}
                </Button>
                <Button
                  variant="outline"
                  icon={<LogOut className="w-4 h-4" />}
                  onClick={async () => {
                    try {
                      await onSignOut();
                    } catch (err) {
                      pushToast(
                        err instanceof Error
                          ? err.message
                          : isAr
                          ? 'تعذر تسجيل الخروج'
                          : 'Sign out failed',
                        'error'
                      );
                    }
                  }}
                >
                  {isAr ? 'تسجيل الخروج' : 'Sign Out'}
                </Button>
              </>
            ) : (
              <Button
                variant="cyan"
                loading={signingIn}
                icon={<LogIn className="w-4 h-4" />}
                onClick={async () => {
                  setSigningIn(true);
                  try {
                    await onSignInGoogle();
                  } catch (err) {
                    pushToast(formatFirebaseAuthError(err, lang), 'error');
                  } finally {
                    setSigningIn(false);
                  }
                }}
              >
                {isAr ? 'تسجيل الدخول / إنشاء حساب عبر Google' : 'Sign In / Create Account with Google'}
              </Button>
            )}

            {backupData && onImportBackup && (
              <Button variant="outline" icon={<Archive className="w-4 h-4 text-[var(--accent-gold)]" />} onClick={() => setBackupOpen(true)}>
                {isAr ? 'النسخ الاحتياطي JSON' : 'JSON Backup & Restore'}
              </Button>
            )}

            {localWorkspace && (
              <Button
                variant="outline"
                icon={<GitCompareArrows className="w-4 h-4 text-[var(--accent-cyan)]" />}
                onClick={() => {
                  document
                    .getElementById('reconciliation-auditor')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                {isAr ? 'مدقق المطابقة السحابية' : 'Reconciliation Auditor'}
              </Button>
            )}

            {!isInstalled && isInstallable && (
              <Button
                variant="outline"
                icon={<Download className="w-4 h-4 text-[var(--accent-cyan)]" />}
                onClick={async () => {
                  const ok = await install();
                  if (ok) {
                    pushToast(isAr ? 'تم تثبيت تطبيق بنيان بنجاح' : 'Bunyan app installed', 'success');
                  }
                }}
              >
                {isAr ? 'تثبيت التطبيق (PWA)' : 'Install App (PWA)'}
              </Button>
            )}

            {!isInstalled && !isInstallable && isIOS && (
              <Button
                variant="outline"
                icon={<Smartphone className="w-4 h-4 text-[var(--accent-cyan)]" />}
                onClick={() =>
                  pushToast(
                    isAr
                      ? 'للتثبيت على iOS: اضغط زر المشاركة في Safari ثم اختر "إضافة إلى الشاشة الرئيسية".'
                      : 'To install on iOS: tap Share in Safari, then choose "Add to Home Screen".',
                    'info'
                  )
                }
              >
                {isAr ? 'تثبيت على iOS' : 'Install on iOS'}
              </Button>
            )}
          </div>
        </Card>

        {/* Role & Biometric Security */}
        <Card padded className="space-y-4">
          <div className="flex items-center gap-2.5">
            <UserCheck className="w-5 h-5 text-[var(--accent-cyan)]" />
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              {isAr ? 'الصلاحيات والتحقق الحيوي' : 'Role Access & Biometric Flag'}
            </h2>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-[var(--text-secondary)]">
              {isAr ? 'الدور الهندسي النشط (RBAC):' : 'Active Workspace Role:'}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['admin', 'engineer', 'accountant'] as Role[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onChangeRole(r)}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold capitalize bunyan-transition cursor-pointer ${
                    currentRole === r
                      ? 'border-[var(--accent-blue)]/60 bg-gradient-to-l from-[#2563EB] to-[#0284C7] dark:from-[#38BDF8] dark:to-[#2563EB] text-white dark:text-[#090E1A] font-bold'
                      : 'border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent-blue)]/45'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              {isAr
                ? 'تبديل الدور يتحكم بصلاحيات الواجهة المحلية فقط؛ بينما صلاحيات Firestore السحابية محمية بهوية Google الموثقة وقواعد المالك والمدير.'
                : 'Role switching controls local workspace UI permissions; cloud Firestore access is enforced server-side via verified Google identity and admin rules.'}
            </p>
          </div>

          <div className="pt-3 border-t border-[var(--border-hairline)] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs">
              <Fingerprint className={`w-5 h-5 ${biometricRegistered ? 'text-[#00E5A8]' : 'text-[var(--text-muted)]'}`} />
              <div>
                <div className="font-semibold text-[var(--text-primary)]">
                  {isAr ? 'توثيق البصمة / Passkey' : 'Biometric Verification'}
                </div>
                <div className="text-[var(--text-muted)]">
                  {biometricRegistered
                    ? isAr ? 'مفعل وموثق للموافقات المالية' : 'Registered for financial approvals'
                    : isAr ? 'غير مفعل' : 'Not registered'}
                </div>
              </div>
            </div>
            <Button
              variant={biometricRegistered ? 'outline' : 'secondary'}
              size="sm"
              onClick={() => onToggleBiometric(!biometricRegistered)}
            >
              {biometricRegistered ? (isAr ? 'مفعل' : 'Enabled') : (isAr ? 'تفعيل الآن' : 'Register')}
            </Button>
          </div>
        </Card>
      </div>

      {/* Cloud Snapshot Reconciliation Auditor */}
      {localWorkspace && onApplyPulledWorkspacePatch && (
        <ReconciliationAuditorPanel
          lang={lang}
          cloudUid={cloudUid}
          userEmail={firebaseUser?.email}
          currentRole={currentRole}
          isOnline={syncState?.isOnline ?? true}
          localWorkspace={localWorkspace}
          onApplyPulledWorkspacePatch={onApplyPulledWorkspacePatch}
          onManifestAttached={onManifestAttached}
          onSignInGoogle={onSignInGoogle}
        />
      )}

      {/* RBAC Permissions Matrix + System Support & Diagnostics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-7 overflow-hidden">
          <CardHeader
            icon={<ShieldCheck className="w-4 h-4" />}
            title={isAr ? 'مصفوفة الصلاحيات الفعّالة للدور النشط' : 'Active Role RBAC Permissions Matrix'}
            subtitle={
              isAr
                ? `الصلاحيات الفعلية المطبقة حالياً على دور (${currentRole})`
                : `Live capability enforcement for active role (${currentRole})`
            }
          />
          <div className="divide-y divide-[var(--border-hairline)] text-xs">
            {PERMISSION_ROWS.map((row) => {
              const allowed = perms[row.key];
              return (
                <div key={row.key} className="px-5 py-2.5 flex items-center justify-between gap-3">
                  <span className="font-medium text-[var(--text-primary)]">
                    {isAr ? row.ar : row.en}
                  </span>
                  {allowed ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-[#00E5A8] font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{isAr ? 'مسموح' : 'Allowed'}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[var(--text-muted)]">
                      <XCircle className="w-3.5 h-3.5 text-[#FF405C]" />
                      <span>{isAr ? 'مقيد' : 'Restricted'}</span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="lg:col-span-5 overflow-hidden">
          <CardHeader
            icon={<LifeBuoy className="w-4 h-4" />}
            title={isAr ? 'الدعم الفني وتشخيص النظام' : 'Technical Support & System Diagnostics'}
            subtitle={isAr ? 'بيانات البيئة السحابية والتطبيق المحلي PWA' : 'Cloud environment, offline persistence & compliance'}
          />
          <div className="p-5 space-y-3 text-xs">
            <div className="flex justify-between py-1.5 border-b border-[var(--border-hairline)]">
              <span className="text-[var(--text-muted)]">{isAr ? 'إصدار النظام' : 'Platform Build'}</span>
              <span dir="ltr" className="font-mono font-semibold text-[var(--accent-cyan)]">BUNYAN 5D · 2026.1</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-[var(--border-hairline)]">
              <span className="text-[var(--text-muted)]">{isAr ? 'سياسة الاتصال السحابي' : 'Cloud Sync Policy'}</span>
              <span className="font-semibold text-emerald-600 dark:text-[#00E5A8]">
                {isAr ? 'سحابي إلزامي (Fail-Closed · Memory)' : 'Strict Cloud-Only (Fail-Closed)'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-[var(--border-hairline)]">
              <span className="text-[var(--text-muted)]">{isAr ? 'حماية App Check' : 'Firebase App Check'}</span>
              <span
                className={`font-semibold ${
                  isAppCheckConfigured
                    ? 'text-emerald-600 dark:text-[#00E5A8]'
                    : 'text-amber-600 dark:text-[#FF9D42]'
                }`}
              >
                {isAppCheckConfigured
                  ? isAr
                    ? 'مفعل (reCAPTCHA v3)'
                    : 'Active (reCAPTCHA v3)'
                  : isAr
                  ? 'بانتظار مفتاح الموقع'
                  : 'Awaiting Site Key'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-[var(--border-hairline)]">
              <span className="text-[var(--text-muted)]">{isAr ? 'تثبيت PWA' : 'PWA Runtime'}</span>
              <span className="font-semibold text-[var(--text-primary)]">
                {isInstalled ? (isAr ? 'مثبت كتطبيق' : 'Installed') : (isAr ? 'متصفح الويب' : 'Web Browser')}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-[var(--border-hairline)]">
              <span className="text-[var(--text-muted)]">{isAr ? 'معيار الامتثال البلدي' : 'Compliance Standard'}</span>
              <span className="font-semibold text-[var(--text-primary)]">
                {isAr ? 'بلدية الشارقة · DTPS' : 'Sharjah Mun. · DTPS'}
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-[#2563EB]/25 dark:border-[#38BDF8]/25 bg-[#2563EB]/6 dark:bg-[#38BDF8]/8 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-[var(--text-primary)]">
                <Cpu className="w-4 h-4 text-[var(--accent-cyan)] shrink-0" />
                <span>{isAr ? 'إرشادات الدعم الفني السريع' : 'Quick Support Guidance'}</span>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                {isAr
                  ? 'في حال الحاجة لاستعادة نسخة احتياطية أو ترحيل بيانات المشاريع بين الأجهزة، استخدم "النسخ الاحتياطي JSON" أو سجّل الدخول بنفس حساب Google للمزامنة الفورية عبر السحابة.'
                  : 'To migrate projects across workstations or restore snapshots, use JSON Backup & Restore or sign in with your verified Google account for automatic Cloud Firestore sync.'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* UAE Company Profile Form */}
      <Card>
        <CardHeader
          icon={<Building2 className="w-5 h-5" />}
          title={isAr ? 'ملف المنشأة الهندسية والتراخيص' : 'UAE Company & Licensing Profile'}
          subtitle={isAr ? 'ترويسة التقارير الرسمية والرقم الضريبي UAE TRN' : 'Official PDF/Excel Report Header & Tax Registration'}
        />

        <form onSubmit={handleSaveCompany} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label={isAr ? 'اسم الشركة (عربي)' : 'Company Name (AR)'}
              value={companyForm.nameAr}
              onChange={(e) => setCompanyForm({ ...companyForm, nameAr: e.target.value })}
            />
            <Input
              label={isAr ? 'اسم الشركة (إنجليزي)' : 'Company Name (EN)'}
              value={companyForm.nameEn}
              onChange={(e) => setCompanyForm({ ...companyForm, nameEn: e.target.value })}
            />
            <Input
              label={isAr ? 'رقم الرخصة التجارية' : 'Trade License No.'}
              value={companyForm.licenseNumber}
              onChange={(e) => setCompanyForm({ ...companyForm, licenseNumber: e.target.value })}
              className="font-mono"
            />
            <Input
              label={isAr ? 'الرقم الضريبي UAE TRN' : 'UAE VAT TRN'}
              value={companyForm.trnNumber}
              onChange={(e) => setCompanyForm({ ...companyForm, trnNumber: e.target.value })}
              className="font-mono"
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" variant="cyan" disabled={!perms.canManageCompanySettings}>
              {isAr ? 'حفظ ملف المنشأة' : 'Save Company Profile'}
            </Button>
          </div>
        </form>
      </Card>

      {backupData && onImportBackup && (
        <BackupSyncModal
          isOpen={backupOpen}
          onClose={() => setBackupOpen(false)}
          lang={lang}
          backupData={backupData}
          onImportBackup={onImportBackup}
          canImport={perms.canManageProjects}
        />
      )}
    </div>
  );
};
