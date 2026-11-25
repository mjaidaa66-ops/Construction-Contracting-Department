# AL BUNYAN | 5D BIM — Google Cloud / Cloud Run Quota & Deployment Diagnostic Report

- **Report Type**: Read-Only Diagnostic (تشخيص فقط — بدون تعديل أي إعدادات أو ملفات تطبيق أو تنفيذ Deploy)
- **Date (UTC)**: 2026-11-25
- **Scope**: Google Cloud Project, Billing, Cloud Run Quotas, Cloud Build Quotas, Artifact Registry, Region Availability, and Failure Classification.

---

## 1. Executive Summary & Access Disclosure (ملخص تنفيذي وإفصاح الصلاحيات)

### صلاحية الوصول الفعلية من بيئة التشغيل الحالية
بعد الفحص الفعلي للأدوات المتاحة داخل بيئة AI Studio (Read-Only):
- أداة `gcloud`: **غير مثبتة** (`NOT_INSTALLED`).
- أدوات `docker` و`gsutil` و`bq`: **غير مثبتة** (`NOT_INSTALLED`).
- أداة `firebase`: مثبتة (`/usr/local/bin/firebase`) ولكن **`firebase login:list` أفادت بعدم وجود حساب مصرح به** (`No authorized accounts`).
- **النتيجة:** لا تتوفر من داخل هذه البيئة صلاحية قراءة حية لإعدادات Google Cloud Console الخاصة بحسابك أو بمشروعك (`Billing`, `IAM & Admin -> Quotas`, `Cloud Build`, `Artifact Registry`, أو `Cloud Run Revisions/Logs`).

### ما تم التحقق منه بالأدلة المباشرة المتوفرة
1. من متغيرات البيئة وMetadata Server (قراءة فقط): بيئة AI Studio الحالية تعمل على خدمة `ais-dev-fcxzxn3ctstwtxitympagp` في المنطقة **`europe-west2`**.
2. من ملفات المشروع (`.firebaserc`، `firebase-applet-config.json`، `.github/workflows/deploy.yml`): مشروع Google Cloud / Firebase المستهدف للنشر الخاص بك هو **`gifted-force-fxctm`**، ومسار النشر في `.github/workflows/deploy.yml` يستهدف خدمة `bunyan-core-system` في المنطقة **`us-central1`**.
3. من سجلات النشر الأخيرة المتاحة في الجلسة: آخر رسائل فشل Cloud Run المسجلة كانت **`Container called exit(1)`** بسبب خطأ **`ERR_MODULE_NOT_FOUND`** على Node.js v22.23.4 (وهو **Build / Container Startup Failure** وليس Quota Exceeded). أما إذا ظهر لديك خطأ **جديد** مرتبط بـ Quota أو Billing بعد التعديل الأخير، فإن تفاصيله غير ظاهرة من داخل هذه البيئة وتحتاج إلى تزويدنا بنص الخطأ أو لقطة الشاشة الموضحة أدناه.

---

## 2. Identified Google Cloud Projects & Regions (المشاريع والمناطق المستخدمة)

| Context | Project ID / Identifier | Project Number | Region | Service Name | Evidence Source |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **User Target Project (Firebase & CI/CD)** | `gifted-force-fxctm` | `10135495253` (from Firebase `appId` / `messagingSenderId`) | `us-central1` (per GitHub workflow) | `bunyan-core-system` | `.firebaserc`, `firebase-applet-config.json`, `.github/workflows/deploy.yml` |
| **AI Studio Hosted Preview / Shared Runtime** | `ais-europe-west2-d679570e05884` (managed runtime host) | `713883633251` | `europe-west2` | `ais-dev-fcxzxn3ctstwtxitympagp` (dev) / `ais-pre-...` (pre) | Container `env` (`K_SERVICE`, `APP_URL`) & GCE Metadata Server |

> **ملاحظة مهمة:** لم يتم تعديل أي اسم مشروع أو منطقة. يجب التأكد أولاً هل محاولة النشر التي فشلت تمت عبر **زر Deploy / Share داخل Google AI Studio** (مرتبط بمشروعك `gifted-force-fxctm` أو مشروع الاستضافة المرتبط به) أم عبر **GitHub Actions / `gcloud run deploy`** على `gifted-force-fxctm` في `us-central1`.

---

## 3. Diagnostic Findings Across the 6 Target Areas

### 3.1 Billing Status & Project Linking (حالة الفوترة)
- **الحالة المرصودة من البيئة:** غير قابلة للاستعلام برمجياً من هنا لعدم وجود `gcloud` أو اعتماد OAuth/Service Account.
- **لماذا تعتبر الفوترة سبباً شائعاً لفشل Cloud Run / Cloud Build / Artifact Registry:**
  - حتى ضمن حدود الاستخدام المجاني (Free Tier)، تتطلب خدمات **Cloud Run** و**Cloud Build** و**Artifact Registry** ربط المشروع بحساب فوترة **نشط (Active Billing Account)** (أو قد تتوقف عند انتهاء رصيد Free Trial، أو رفض البطاقة، أو إغلاق/تعليق حساب الفوترة، أو تجاوز حد المشاريع المسموح ربطها بحساب الفوترة الواحد).
- **مكان الفحص في Google Cloud Console:**
  - `Billing` -> `Account management` (اختر المشروع `gifted-force-fxctm`).
  - أو مباشرةً: `https://console.cloud.google.com/billing/linkedaccount?project=gifted-force-fxctm`
  - تأكد من أن الحالة **Active** وليس **Suspended / Closed / Disabled** وأن المشروع مربوط فعلياً بحساب الفوترة.

### 3.2 Cloud Run Quotas in the Selected Region (حصص Cloud Run)
- **الحالة المرصودة من البيئة:** غير قابلة للاستعلام المباشر لعدم توفر صلاحية GCP IAM/API هنا.
- **مواصفات التشغيل الفعلية للتطبيق (من `Dockerfile` و`server.ts`):**
  - المنفذ: `8080` (`PORT` ديناميكي، ربط على `0.0.0.0`).
  - وقت التشغيل: `node:22-alpine`، خدمة خفيفة (Express + ملفات `dist/` الثابتة).
  - لا يطلب `Dockerfile` أو `.github/workflows/deploy.yml` مواصفات CPU/Memory ضخمة (يستخدم الإعداد الافتراضي لـ Cloud Run مثل `1 vCPU / 512 MiB` ما لم يتم تغييره في Console).
- **الحصص الواجب فحصها في Cloud Run:**
  - الخدمة في Console: **`Cloud Run Admin API`** (`run.googleapis.com`)
  - الحصص الحرجة لكل منطقة (`us-central1` أو `europe-west2`):
    1. `CPU allocation per region` / `Total CPU per region`
    2. `Memory allocation per region` / `Total memory per region`
    3. `Max instances per service` / `Total instances per region`
    4. `Services per region` / `Revisions per service`
    5. `Concurrent requests` / `Requests per minute`
- **مكان الفحص في Google Cloud Console:**
  - `IAM & Admin` -> `Quotas & System Limits`
  - فلترة: `Service: Cloud Run Admin API` + `Location: us-central1` (أو `europe-west2`).
  - الرابط المباشر: `https://console.cloud.google.com/iam-admin/quotas?project=gifted-force-fxctm`

### 3.3 Cloud Build Quotas (حصص عمليات البناء)
- **الحالة المرصودة من البيئة:** غير قابلة للاستعلام المباشر من هنا.
- **لماذا يتدخل Cloud Build في النشر:**
  - أي نشر عبر `gcloud run deploy --source .` (كما في `.github/workflows/deploy.yml` السطر 62) أو عبر نشر الكود المصدري يستخدم **Cloud Build** لبناء صورة Docker عبر `Dockerfile`.
- **الحصص الحرجة في Cloud Build:**
  - الخدمة في Console: **`Cloud Build API`** (`cloudbuild.googleapis.com`)
  - الحصص:
    1. `Concurrent builds` (عدد عمليات البناء المتزامنة؛ في المشاريع الجديدة أو المجانية أحياناً يكون منخفضاً أو `0` حتى تفعيل الفوترة/التحقق).
    2. `Concurrent builds of machine type E2_MEDIUM / N1_HIGHCPU_8` حسب نوع الماكينة المستخدمة.
    3. `Build requests per minute` / `Build duration`.
  - تحقّق أيضاً من: `Cloud Build` -> `History` لمعرفة هل فشل النشر داخل خطوة `Build` أم في خطوة `Deploy`.

### 3.4 Artifact Registry (تخزين ورفع Docker Image)
- **الحالة المرصودة من البيئة:** غير قابلة للاستعلام المباشر من هنا؛ لكن **إعدادات المشروع المحلي سليمة** لبناء Image صغيرة:
  - `.dockerignore` يستبعد `node_modules/`, `dist/`, `backups/`, `tests/`, `.git/` (مما يمنع تضخم سياق البناء).
  - `Dockerfile` ثنائي المراحل (`node:22-alpine`) يثبت `--omit=dev` فقط في مرحلة التشغيل.
- **ما يجب فحصه في Artifact Registry:**
  - الخدمة في Console: **`Artifact Registry API`** (`artifactregistry.googleapis.com`) — تأكد أنها **Enabled**.
  - المستودع الافتراضي الذي ينشئه Cloud Run عند `--source .`: `cloud-run-source-deploy` في نفس المنطقة (`us-central1` أو `europe-west2`).
  - الصلاحيات اللازمة لحساب النشر / Cloud Build Service Account: `roles/artifactregistry.writer` (أو `roles/artifactregistry.createOnPushWriter` عند أول نشر).
  - الحصص: `Storage per region` و`Requests per minute`.
  - مكان الفحص: `Artifact Registry` -> `Repositories` (`https://console.cloud.google.com/artifacts?project=gifted-force-fxctm`).

### 3.5 Region Review (`us-central1` vs `europe-west2`)
- **في `.github/workflows/deploy.yml`:** المنطقة المحددة هي **`us-central1`** (منطقة Tier-1 أساسية تدعم Cloud Run وCloud Build وArtifact Registry بالكامل وتتوفر فيها معظم الحصص الافتراضية).
- **في AI Studio Preview/Shared:** المنطقة المشغلة للمعاينة هي **`europe-west2`** (لندن، منطقة Tier-1 تدعم Cloud Run بالكامل أيضاً).
- **ملاحظة:** يجب التأكد من تطابق منطقة `Cloud Run` مع منطقة مستودع `Artifact Registry` إذا كان هناك مستودع مخصص، وكذلك التحقق في صفحة Quotas أن الفلتر يشمل **نفس المنطقة التي فشل فيها النشر**.

---

## 4. Actual Error Message from Latest Accessible Deployment Logs (رسالة الخطأ الفعلية المتاحة)

من سجلات النشر التي وردت في هذه المحادثة (أحدث رسائل متاحة لدينا):

```text
Deployment logs: The live Cloud Run service is in a failed state.
Container called exit(1).
Node.js v22.23.4
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/workspace/src/modules/structural/adapters/etabs.adapter' imported from /workspace/src/modules/structural/routes/structural.routes.ts
```

- **اسم الحصة المتجاوزة في السجلات المتاحة:** **لا توجد حصة متجاوزة مسجلة في هذا السجل**؛ الفشل الموثق كان خطأ تشغيل حاوية (`Container called exit(1)`) ناتجاً عن استيراد TypeScript بدون امتداد `.ts` تحت Node.js 22 Native ESM.
- **تنبيه مهم:** إذا ظهرت لك **الآن** رسالة خطأ جديدة بعد عملية نشر لاحقة (تذكر كلمة `Quota exceeded` أو `Billing` أو `PERMISSION_DENIED` أو `RESOURCE_EXHAUSTED`)، فهي **لم تصل إلى بيئة التحرير هذه** بعد، ولا يمكن تحديد اسم الحصة الرقمي (`Quota metric name`) أو قيمتها الحالية (`Current usage`) أو الحد المسموح بها (`Limit`) دون قراءة تلك الرسالة من شاشة النشر أو Cloud Logging.

---

## 5. Failure Classification Matrix (التمييز الدقيق بين أنواع الأعطال)

| الفئة | المعنى والدلائل النصية النموذجية في Logs | هل ظهرت في السجلات المتاحة لدينا؟ | أين تفحصها وتصلحها في Console |
| :--- | :--- | :--- | :--- |
| **1. Quota Exceeded** | `RESOURCE_EXHAUSTED` / `Quota exceeded for quota metric '...' and limit '...'` (مثلاً `CPUs`, `Max instances`, `Concurrent builds`, `Artifact Registry storage`). | **لم تظهر في السجلات المتاحة** (تتطلب قراءة سجل المحاولة الجديدة إن وُجدت). | `IAM & Admin -> Quotas & System Limits` -> تصفية بالخدمة والمنطقة -> تحديد الحصة -> `Edit Quotas` (طلب زيادة الحصة أو تقليل `max-instances` / `cpu` في الخدمة إذا كانت الحصة كافية ولكن الطلب أعلى من الحد). |
| **2. Billing Account Issue** | `FAILED_PRECONDITION: Billing account ... is not open` / `The project must be linked to an active billing account` / `delinquent` / `FREE_TRIAL_EXPIRED`. | **غير مؤكد لعدم وجود وصول Console** (يتطلب تحققاً فورياً إذا كان الحساب أو البطاقة متوقفة). | `Billing -> Account management` + `Billing -> Billing accounts` -> ربط المشروع `gifted-force-fxctm` بحساب فوترة `Active` أو تحديث وسيلة الدفع. |
| **3. Permission Denied** | `PERMISSION_DENIED` (HTTP 403): نقص دور مثل `roles/run.admin`, `roles/cloudbuild.builds.editor`, `roles/artifactregistry.writer`, `roles/iam.serviceAccountUser` لحساب المستخدم أو `GCP_SA_KEY` أو Default Compute/Cloud Build Service Account. | **غير ظاهر في السجلات المتاحة** (لكن فحص `firebase projects:list` في Sandbox فشل لعدم وجود اعتماد داخل Sandbox فقط). | `IAM & Admin -> IAM` (راجع صلاحيات المستخدم وحساب الخدمة المستخدم في النشر، وكذلك `...@cloudbuild.gserviceaccount.com` و`...-compute@developer.gserviceaccount.com`). |
| **4. Service Usage Limit / Disabled API** | `SERVICE_DISABLED` / `API [run.googleapis.com / cloudbuild.googleapis.com / artifactregistry.googleapis.com] is not enabled` أو تجاوز `Service Usage` requests/min. | **غير ظاهر في السجلات المتاحة**. | `APIs & Services -> Enabled APIs & services` -> التأكد من تفعيل: `Cloud Run Admin API`, `Cloud Build API`, `Artifact Registry API`, `Service Usage API`. |
| **5. Build / Startup Failure** | فشل `npm run build` / `Dockerfile` أو إقلاع الحاوية (`Container called exit(1)`, `ERR_MODULE_NOT_FOUND`, فشل الاستماع على `0.0.0.0:$PORT`). | **نعم — هذا هو السبب الموثق حرفياً في السجلات السابقة (`ERR_MODULE_NOT_FOUND`)**، وقد تم إصلاحه في الكود و`Dockerfile`. | `Cloud Build -> History` (لفحص فشل البناء) أو `Cloud Run -> Service -> Logs` (لفحص `Container called exit(1)`). |

---

## 6. Read-Only Commands You Can Run (If You Have Local `gcloud` Access)

لتحديد الحصة المتجاوزة أو سبب الفشل بدقة 100% دون أي تعديل، يمكن تشغيل هذه الأوامر للقراءة فقط (Read-Only):

```bash
# 1. التحقق من المشروع والفوترة
gcloud config get-value project
gcloud billing projects describe gifted-force-fxctm

# 2. التحقق من تفعيل الـ APIs المطلوبة
gcloud services list --enabled --project=gifted-force-fxctm \
  --filter="config.name:(run.googleapis.com OR cloudbuild.googleapis.com OR artifactregistry.googleapis.com)"

# 3. قراءة آخر أخطاء النشر والبناء
gcloud logging read \
  'severity>=ERROR AND (resource.type="cloud_run_revision" OR resource.type="build" OR protoPayload.serviceName="run.googleapis.com")' \
  --project=gifted-force-fxctm --limit=20 --format="value(timestamp,protoPayload.status.message,textPayload)"

# 4. فحص حالة خدمة Cloud Run وآخر Revision
gcloud run services describe bunyan-core-system --project=gifted-force-fxctm --region=us-central1
gcloud run revisions list --service=bunyan-core-system --project=gifted-force-fxctm --region=us-central1
```

---

## 7. What Information to Share Next (إذا استمر فشل النشر الجديد)

لأن بيئة AI Studio هنا لا تملك صلاحية قراءة Google Cloud Console لحسابك، إذا واجهت رسالة فشل جديدة أثناء النشر، يُرجى تزويدنا بأيٍّ من التالي:
1. **النص الكامل لرسالة الخطأ** من شاشة Deploy في AI Studio أو من `Cloud Build -> History` / `Cloud Run -> Revisions -> Logs`.
2. لقطة شاشة أو نص من:
   - **`Billing -> Account management`** للمشروع `gifted-force-fxctm` (توضح حالة الفوترة: `Active` أم غير ذلك).
   - **`IAM & Admin -> Quotas & System Limits`** مع تصفية `Cloud Run Admin API` و`Cloud Build API` في المنطقة المستخدمة (توضح اسم الحصة التي وصلت `100%` أو حدها الحالي).
   - **`Cloud Run -> Service -> Revisions`** (توضح هل توقف النشر في `Build` أم في `Deploy / Health check`).

> **ملاحظة حول الترقية المدفوعة:** لا يُطلب أي ترقية مدفوعة بناءً على البيانات المتاحة حالياً؛ التطبيق يستهلك موارد قياسية منخفضة تقع عادةً ضمن النطاق الأساسي، وأي ترقية أو تعديل حصة لا ينبغي طلبه إلا إذا أظهر سجل Google Cloud الفعلي تجاوز حصة بعينها أو انتهاء صلاحية الفوترة المجانية.
