import React, { useEffect, useState } from 'react';
import {
  Archive,
  Building2,
  CheckCircle2,
  Download,
  Fingerprint,
  LogIn,
  LogOut,
  Shield,
  Smartphone,
  UserCheck,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { BackupData, CompanyProfile, Language, Role } from '../../types/bunyan';
import { getRolePermissions } from '../../utils/rbacPermissions';
import { usePWAInstall } from '../../utils/usePWAInstall';
import { BunyanLogo } from '../common/BunyanLogo';
import { BackupSyncModal } from '../projects/BackupSyncModal';
import { Button, Card, CardHeader, Input, StatusIndicator, useToast } from '../ui';

interface SettingsAuthModuleProps {
  lang: Language;
  currentRole: Role;
  onChangeRole: (role: Role) => void;
  companyProfile: CompanyProfile;
  onUpdateCompany: (profile: CompanyProfile) => void;
  biometricRegistered: boolean;
  onToggleBiometric: (next: boolean) => void;
  firebaseUser: User | null;
  firestoreConnected: boolean;
  onSignInGoogle: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onSyncSeedToCloud: () => Promise<void>;
  backupData?: BackupData;
  onImportBackup?: (data: BackupData, mode?: 'merge' | 'replace') => void;
}

export const SettingsAuthModule: React.FC<SettingsAuthModuleProps> = ({
  lang,
  currentRole,
  onChangeRole,
  companyProfile,
  onUpdateCompany,
  biometricRegistered,
  onToggleBiometric,
  firebaseUser,
  firestoreConnected,
  onSignInGoogle,
  onSignOut,
  onSyncSeedToCloud,
  backupData,
  onImportBackup,
}) => {
  const [companyForm, setCompanyForm] = useState<CompanyProfile>(companyProfile);
  const [syncing, setSyncing] = useState(false);
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
    <div className="space-y-6 max-w-5xl">
      <Card padded className="flex flex-wrap items-center justify-between gap-4 bg-[var(--bg-surface)]">
        <BunyanLogo size="lg" lang={lang} />
        <div className="text-xs text-[var(--text-secondary)] max-w-md">
          {isAr
            ? 'إدارة تسجيل الدخول وإنشاء الحساب السحابي، وصلاحيات المستخدمين، وإعدادات المنشأة المعتمدة.'
            : 'Manage Google account sign-in & registration, workspace RBAC permissions, and verified UAE company profile.'}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Firebase Google Authentication & Cloud Sync */}
        <Card padded className="space-y-4">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-[#B4863C]" />
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              {isAr ? 'تسجيل الدخول وإنشاء الحساب والمزامنة السحابية' : 'Sign In, Account Access & Cloud Sync'}
            </h2>
          </div>

          <div className="p-4 rounded-lg bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] text-xs space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)]">{isAr ? 'حالة الاتصال السحابي:' : 'Firestore Status:'}</span>
              <StatusIndicator
                tone={firestoreConnected ? 'success' : 'warning'}
                label={firestoreConnected ? (isAr ? 'متصل سحابياً' : 'Connected') : (isAr ? 'وضع التخزين المحلي' : 'Local Cache Mode')}
              />
            </div>
            <div className="flex justify-between items-center gap-2">
              <span className="text-[var(--text-muted)]">{isAr ? 'الحساب المسجل:' : 'Signed-in Account:'}</span>
              <span className="font-mono text-[var(--text-primary)] truncate">
                {firebaseUser?.email || (isAr ? 'غير مسجل (معاينة محلية)' : 'Not signed in (Local Preview)')}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {firebaseUser ? (
              <>
                <Button
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
                icon={<LogIn className="w-4 h-4" />}
                onClick={async () => {
                  try {
                    await onSignInGoogle();
                  } catch (err) {
                    pushToast(
                      err instanceof Error
                        ? err.message
                        : isAr
                        ? 'تعذر فتح نافذة تسجيل الدخول عبر Google'
                        : 'Google sign-in failed or was blocked',
                      'error'
                    );
                  }
                }}
              >
                {isAr ? 'تسجيل الدخول / إنشاء حساب عبر Google' : 'Sign In / Create Account with Google'}
              </Button>
            )}

            {backupData && onImportBackup && (
              <Button variant="outline" icon={<Archive className="w-4 h-4 text-[#B4863C]" />} onClick={() => setBackupOpen(true)}>
                {isAr ? 'النسخ الاحتياطي JSON' : 'JSON Backup & Restore'}
              </Button>
            )}

            {!isInstalled && isInstallable && (
              <Button
                variant="outline"
                icon={<Download className="w-4 h-4 text-[#B4863C]" />}
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
                icon={<Smartphone className="w-4 h-4 text-[#B4863C]" />}
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
            <UserCheck className="w-5 h-5 text-[#B4863C]" />
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
                  className={`py-2 px-3 rounded-lg border text-xs font-semibold capitalize bunyan-transition cursor-pointer ${
                    currentRole === r
                      ? 'border-[#B4863C] bg-[#B4863C] text-white'
                      : 'border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] hover:border-[#B4863C]'
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
              <Fingerprint className={`w-5 h-5 ${biometricRegistered ? 'text-emerald-500' : 'text-[var(--text-muted)]'}`} />
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
            <Button type="submit" disabled={!perms.canManageCompanySettings}>
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
