import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from 'firebase/app-check';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId || 'gifted-force-fxctm';
export const FIRESTORE_DATABASE_ID =
  firebaseConfig.firestoreDatabaseId || 'ai-studio-a758e3b4-81b5-47a3-a9ca-2d6487629b67';

const app = initializeApp({
  ...firebaseConfig,
  projectId: FIREBASE_PROJECT_ID,
});

// Conditional App Check initialization when a valid reCAPTCHA v3 site key is provisioned
const viteEnv =
  typeof import.meta !== 'undefined'
    ? (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    : undefined;
const configuredRecaptchaSiteKey = (
  firebaseConfig.recaptchaSiteKey ||
  viteEnv?.VITE_FIREBASE_APPCHECK_SITE_KEY ||
  ''
).trim();

let appCheckInstance: AppCheck | null = null;
if (typeof window !== 'undefined' && configuredRecaptchaSiteKey.length > 0) {
  try {
    appCheckInstance = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(configuredRecaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    console.error('Firebase App Check initialization failed:', err);
  }
}

export const appCheck = appCheckInstance;
export const isAppCheckConfigured = Boolean(appCheckInstance);

// Strict Cloud-Only Firestore instance (memoryLocalCache prevents stale IndexedDB fallbacks)
let dbInstance: Firestore;
try {
  dbInstance = initializeFirestore(
    app,
    {
      localCache: memoryLocalCache(),
      experimentalAutoDetectLongPolling: true,
    },
    FIRESTORE_DATABASE_ID
  );
} catch {
  dbInstance = getFirestore(app, FIRESTORE_DATABASE_ID);
}

export const db = dbInstance;
export const isFirestoreOfflinePersistenceEnabled = false;
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface CloudReachabilityReport {
  reachable: boolean;
  authenticated: boolean;
  emailVerified: boolean;
  appCheckActive: boolean;
  latencyMs: number;
  error: string | null;
}

/**
 * Enforces Fail-Closed cloud precondition before any Firestore read, write, or listener.
 */
export function assertVerifiedCloudPath(
  operationType: OperationType,
  path: string | null
): string {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    handleFirestoreError(
      new Error('FAIL_CLOSED_OFFLINE: Network connection is offline; cloud access blocked.'),
      operationType,
      path
    );
  }
  const user = auth.currentUser;
  if (!user) {
    handleFirestoreError(
      new Error('FAIL_CLOSED_UNAUTHENTICATED: Verified Google sign-in is required.'),
      operationType,
      path
    );
  }
  if (!user.emailVerified) {
    handleFirestoreError(
      new Error('FAIL_CLOSED_UNVERIFIED_EMAIL: Verified email token is required.'),
      operationType,
      path
    );
  }
  return user.uid;
}

/**
 * Probes live Firestore server connectivity directly via getDocFromServer.
 * Never swallows real server/network failures as true.
 */
export async function probeFirestoreServerReachability(): Promise<CloudReachabilityReport> {
  const start = Date.now();
  const user = auth.currentUser;
  const authenticated = Boolean(user);
  const emailVerified = Boolean(user?.emailVerified);

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      reachable: false,
      authenticated,
      emailVerified,
      appCheckActive: isAppCheckConfigured,
      latencyMs: Date.now() - start,
      error: 'Browser network is offline',
    };
  }

  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return {
      reachable: true,
      authenticated,
      emailVerified,
      appCheckActive: isAppCheckConfigured,
      latencyMs: Date.now() - start,
      error: null,
    };
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code || '')
        : '';
    const message = error instanceof Error ? error.message : String(error);
    const isOfflineOrUnavailable =
      code === 'unavailable' ||
      code === 'deadline-exceeded' ||
      message.includes('the client is offline') ||
      message.includes('Failed to get document from server');

    // When unauthenticated, Firestore rules reject /test/connection with permission-denied,
    // which confirms the Firestore server endpoint itself is reachable over TLS.
    if (!emailVerified && code === 'permission-denied') {
      return {
        reachable: true,
        authenticated,
        emailVerified,
        appCheckActive: isAppCheckConfigured,
        latencyMs: Date.now() - start,
        error: null,
      };
    }

    return {
      reachable: !isOfflineOrUnavailable && false,
      authenticated,
      emailVerified,
      appCheckActive: isAppCheckConfigured,
      latencyMs: Date.now() - start,
      error: message,
    };
  }
}

export async function testFirestoreConnection(): Promise<boolean> {
  const report = await probeFirestoreServerReachability();
  if (!report.reachable) {
    console.error('Firestore connection verification failed:', report.error);
  }
  return report.reachable;
}

const TRANSIENT_FIRESTORE_CODES = new Set([
  'unavailable',
  'aborted',
  'deadline-exceeded',
  'resource-exhausted',
  'internal',
]);

export function isTransientFirestoreError(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '').replace(/^firestore\//, '')
      : '';
  if (TRANSIENT_FIRESTORE_CODES.has(code)) return true;
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    msg.includes('unavailable') ||
    msg.includes('deadline-exceeded') ||
    msg.includes('aborted') ||
    msg.includes('resource-exhausted')
  );
}

/**
 * Smart exponential backoff with full jitter for transient Firestore contention/network blips.
 * Never retries permission, auth, or schema-validation errors.
 */
export async function withExponentialBackoff<T>(
  operation: (attempt: number) => Promise<T>,
  options?: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
  }
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 4;
  const baseDelayMs = options?.baseDelayMs ?? 250;
  const maxDelayMs = options?.maxDelayMs ?? 4000;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isTransientFirestoreError(error)) {
        throw error;
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw error;
      }
      const exp = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
      const jitter = Math.floor(Math.random() * Math.max(40, exp * 0.35));
      const delayMs = exp + jitter;
      options?.onRetry?.(attempt, delayMs, error);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

/**
 * Generates a deterministic idempotency key from entity namespace, ID, and payload.
 */
export function computeIdempotencyKey(
  namespace: string,
  entityId: string,
  payload: unknown
): string {
  const raw = `${namespace}:${entityId}:${JSON.stringify(payload ?? null)}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= (c + i) & 0xffff;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const hex = `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0)
    .toString(16)
    .padStart(8, '0')}`;
  return `${namespace}_${entityId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32)}_${hex}`;
}

export function formatFirebaseAuthError(error: unknown, lang: 'ar' | 'en' = 'ar'): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
  const msg = error instanceof Error ? error.message : String(error);

  if (code === 'auth/popup-blocked' || msg.includes('popup-blocked')) {
    return lang === 'ar'
      ? 'قام المتصفح بحظر نافذة تسجيل الدخول عبر Google. يرجى السماح بالنوافذ المنبثقة والمحاولة مرة أخرى.'
      : 'Browser blocked the Google sign-in popup. Please allow popups and retry.';
  }
  if (code === 'auth/popup-closed-by-user' || msg.includes('popup-closed-by-user')) {
    return lang === 'ar'
      ? 'تم إغلاق نافذة تسجيل الدخول قبل إتمام العملية.'
      : 'Google sign-in window was closed before completing.';
  }
  if (code === 'auth/unauthorized-domain' || msg.includes('unauthorized-domain')) {
    return lang === 'ar'
      ? 'نطاق التشغيل الحالي غير مضاف في قائمة النطاقات المصرح بها داخل Firebase Authentication.'
      : 'This domain is not authorized in Firebase Authentication settings.';
  }
  if (code === 'auth/network-request-failed' || msg.includes('network-request-failed')) {
    return lang === 'ar'
      ? 'تعذر الاتصال بخدمة المصادقة. تحقق من اتصال الإنترنت.'
      : 'Network error while signing in with Google. Check your connection.';
  }
  return msg || (lang === 'ar' ? 'تعذر تسجيل الدخول بحساب Google' : 'Google sign-in failed');
}

export async function signInWithGooglePopup(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}
