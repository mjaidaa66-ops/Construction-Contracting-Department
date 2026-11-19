import React, { useEffect, useState } from 'react';
import { Building2, CheckCircle2, Fingerprint, LogIn, LogOut, Shield, UserCheck } from 'lucide-react';
import type { User } from 'firebase/auth';
import type { CompanyProfile, Language, Role } from '../../types/bunyan';

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
}) => {
  const [companyForm, setCompanyForm] = useState<CompanyProfile>(companyProfile);
  const [savedToast, setSavedToast] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setCompanyForm(companyProfile);
  }, [companyProfile]);

  const handleSaveCompany = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateCompany(companyForm);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2500);
  };

  const handleBiometricRegister = async () => {
    onToggleBiometric(!biometricRegistered);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Firebase Google Authentication & Cloud Sync */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#B4863C]" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {lang === 'ar' ? 'المصادقة السحابية ومزامنة Firestore' : 'Firebase Authentication & Cloud Sync'}
            </h2>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500">{lang === 'ar' ? 'حالة الاتصال السحابي:' : 'Firestore Status:'}</span>
              <span className={`font-semibold ${firestoreConnected ? 'text-emerald-500' : 'text-amber-500'}`}>
                {firestoreConnected ? (lang === 'ar' ? 'متصل' : 'Connected') : (lang === 'ar' ? 'وضع محلي' : 'Local Mode')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">{lang === 'ar' ? 'الحساب المسجل:' : 'Signed-in Account:'}</span>
              <span className="font-mono text-slate-900 dark:text-white">
                {firebaseUser?.email || (lang === 'ar' ? 'غير مسجل (معاينة محلية)' : 'Not signed in (Local Preview)')}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {firebaseUser ? (
              <>
                <button
                  type="button"
                  disabled={syncing}
                  onClick={async () => {
                    setSyncing(true);
                    try {
                      await onSyncSeedToCloud();
                    } finally {
                      setSyncing(false);
                    }
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#B4863C] text-white text-xs font-semibold hover:bg-[#9E7330] disabled:opacity-60"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{syncing ? (lang === 'ar' ? 'جاري المزامنة...' : 'Syncing...') : (lang === 'ar' ? 'مزامنة المشاريع إلى Firestore' : 'Sync Workspace to Firestore')}</span>
                </button>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <LogOut className="w-4 h-4" />
                  <span>{lang === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onSignInGoogle}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#B4863C] text-white text-xs font-semibold hover:bg-[#9E7330]"
              >
                <LogIn className="w-4 h-4" />
                <span>{lang === 'ar' ? 'تسجيل الدخول بحساب Google' : 'Sign in with Google'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Role & Biometric Security */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] p-6 space-y-4">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-[#B4863C]" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {lang === 'ar' ? 'الصلاحيات والتحقق الحيوي' : 'Role Access & Biometric Flag'}
            </h2>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
              {lang === 'ar' ? 'الدور الهندسي النشط (RBAC):' : 'Active Workspace Role:'}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['admin', 'engineer', 'accountant'] as Role[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onChangeRole(r)}
                  className={`py-2 px-3 rounded-lg border text-xs font-semibold capitalize transition-colors ${
                    currentRole === r
                      ? 'border-[#B4863C] bg-[#B4863C] text-white'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs">
              <Fingerprint className={`w-5 h-5 ${biometricRegistered ? 'text-emerald-500' : 'text-slate-400'}`} />
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  {lang === 'ar' ? 'توثيق البصمة / Passkey' : 'Biometric Verification'}
                </div>
                <div className="text-slate-500">
                  {biometricRegistered
                    ? lang === 'ar' ? 'مفعل وموثق للموافقات المالية' : 'Registered for approvals'
                    : lang === 'ar' ? 'غير مفعل' : 'Not registered'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleBiometricRegister}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                biometricRegistered
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
              }`}
            >
              {biometricRegistered ? (lang === 'ar' ? 'مفعل' : 'Enabled') : (lang === 'ar' ? 'تفعيل الآن' : 'Register')}
            </button>
          </div>
        </div>
      </div>

      {/* UAE Company Profile Form */}
      <form
        onSubmit={handleSaveCompany}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] p-6 space-y-4 text-xs"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#B4863C]" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {lang === 'ar' ? 'ملف المنشأة الهندسية والتراخيص' : 'UAE Company & Licensing Profile'}
            </h2>
          </div>
          {savedToast && (
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
              {lang === 'ar' ? 'تم حفظ ملف الشركة' : 'Profile Saved'}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="font-medium text-slate-600 dark:text-slate-300">{lang === 'ar' ? 'اسم الشركة (عربي)' : 'Company Name (AR)'}</span>
            <input
              value={companyForm.nameAr}
              onChange={(e) => setCompanyForm({ ...companyForm, nameAr: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            />
          </label>
          <label className="space-y-1">
            <span className="font-medium text-slate-600 dark:text-slate-300">{lang === 'ar' ? 'اسم الشركة (إنجليزي)' : 'Company Name (EN)'}</span>
            <input
              value={companyForm.nameEn}
              onChange={(e) => setCompanyForm({ ...companyForm, nameEn: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            />
          </label>
          <label className="space-y-1">
            <span className="font-medium text-slate-600 dark:text-slate-300">{lang === 'ar' ? 'رقم الرخصة التجارية' : 'Trade License No.'}</span>
            <input
              value={companyForm.licenseNumber}
              onChange={(e) => setCompanyForm({ ...companyForm, licenseNumber: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono"
            />
          </label>
          <label className="space-y-1">
            <span className="font-medium text-slate-600 dark:text-slate-300">{lang === 'ar' ? 'الرقم الضريبي UAE TRN' : 'UAE VAT TRN'}</span>
            <input
              value={companyForm.trnNumber}
              onChange={(e) => setCompanyForm({ ...companyForm, trnNumber: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono"
            />
          </label>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="px-5 py-2 rounded-lg bg-[#B4863C] text-white font-semibold hover:bg-[#9E7330]"
          >
            {lang === 'ar' ? 'حفظ ملف المنشأة' : 'Save Company Profile'}
          </button>
        </div>
      </form>
    </div>
  );
};
