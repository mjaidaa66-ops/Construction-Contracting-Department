import { initializeApp } from 'firebase/app';
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
  persistentLocalCache,
  persistentMultipleTabManager,
  persistentSingleTabManager,
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

let dbInstance: Firestore;
let offlinePersistenceActive = false;

try {
  dbInstance = initializeFirestore(
    app,
    {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
      experimentalAutoDetectLongPolling: true,
    },
    FIRESTORE_DATABASE_ID
  );
  offlinePersistenceActive = true;
} catch {
  try {
    dbInstance = initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentSingleTabManager({ forceOwnership: true }),
        }),
        experimentalAutoDetectLongPolling: true,
      },
      FIRESTORE_DATABASE_ID
    );
    offlinePersistenceActive = true;
  } catch {
    dbInstance = getFirestore(app, FIRESTORE_DATABASE_ID);
  }
}

export const db = dbInstance;
export const isFirestoreOfflinePersistenceEnabled = offlinePersistenceActive;
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

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration (client is offline).');
      return false;
    }
    return true;
  }
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
