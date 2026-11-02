/**
 * مركز الإشعارات — محوّلات البيانات (من صفوف قاعدة البيانات إلى مدخلات المحرّك).
 *
 * دوال نقية بالكامل: لا شبكة ولا React ولا Supabase ولا استيراد قيم من التطبيق، فتُفحص بـ node:test وحدها.
 * ما يلزمها من دوال النظام الحالية (calcDaysLeft، getOverdueReasons) يُمرَّر لها كمعاملات، فلا نسخ ثانية لقواعدها هنا.
 * الجلب (SELECT فقط) في NotificationsRuntime.tsx؛ هنا المنطق الذي يستحق الفحص فقط.
 *
 * مبدأ كل محوّل: يعيد undefined عندما لا يكفي المصدر (فشل جلب) كي لا يدّعي المحرّك أن «كل شيء مُنجَز».
 */
import type {
  BirthdayPatient,
  CatalogInput,
  InventoryItem,
  OpenNote,
  RefillPatient,
  RefillStage,
  RequestAttention,
  RequestNote,
  SubscriptionInput,
} from './engine';

const DAY = 86_400_000;
const AMMAN_OFFSET = 3 * 3_600_000;

// mirrors chronic/page.tsx:2191,2195 — `daysLeft <= 3` تعني «قارب النفاذ»
export const REFILL_WINDOW_DAYS = 3;
// mirrors chronic/page.tsx:1360 (calcInventory) — `if (d > 14) return;`
export const INVENTORY_WINDOW_DAYS = 14;

/** يوم تقويمي بتوقيت عمّان (UTC+3 ثابت كبقية النظام) كرقم صحيح */
function ammanDayNo(ms: number): number {
  return Math.floor((ms + AMMAN_OFFSET) / DAY);
}

/** أيام تقويمية بتوقيت عمّان منذ ISO حتى now؛ لا تقل عن 0 */
function ammanDaysSince(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, ammanDayNo(now) - ammanDayNo(t));
}

// PostgREST يعيد الجداول المضمّنة كائناً أو مصفوفة بحسب العلاقة، فنقبل الشكلين
type Nested<T> = T | T[] | null | undefined;

function asArray<T>(v: Nested<T>): T[] {
  if (Array.isArray(v)) return v;
  return v ? [v] : [];
}

function first<T>(v: Nested<T>): T | null {
  return asArray(v)[0] ?? null;
}

// ───────────────────────── أشكال الصفوف (أعمدتها كما في الاستعلامات) ─────────────────────────

export interface PipelineRow {
  payment_type: string | null;
  pipeline_stage: string | null;
  reminded_at: string | null;
  stage_changed_at: string | null;
}

/** chronic_medications مع المريض ومساره: select('patient_id, medication_name, next_refill_date, patients!inner(name, refill_tracking_pipeline(...))') */
export interface ChronicMedRow {
  patient_id: string;
  medication_name: string | null;
  next_refill_date: string | null;
  patients: Nested<{ name: string | null; refill_tracking_pipeline: Nested<PipelineRow> }>;
}

/** inventory_stock: select('med_key, confirmed_at, boxes_remaining') */
export interface StockRow {
  med_key: string;
  confirmed_at: string | null;
  boxes_remaining: number | null;
}

export interface RequestItemRow {
  id?: string;
  product_name?: string;
  stage: string;
  stage_changed_at?: string | null;
}

/** patient_requests مع بنوده: نفس OVERDUE_SUMMARY_SELECT في request-overdue.ts */
export interface RequestRow {
  id: string;
  status: string;
  deposit: number | null;
  deposit_returned: boolean | null;
  cancelled_at: string | null;
  patient: Nested<{ name: string | null }>;
  items: RequestItemRow[] | null;
}

export interface PatientBirthRow {
  id: string;
  name: string | null;
  birth_date: string | null;
}

export interface GreetingRow {
  patient_id: string;
}

/** patient_notes: بلا عمود body عمداً — نص الملاحظة لا يُجلب للإشعارات */
export interface NoteRow {
  id: string;
  patient_id: string;
  author_staff_id: string | null;
  author_name: string | null;
  created_at: string;
  closed_at: string | null;
  patient: Nested<{ name: string | null }>;
}

/**
 * patient_request_events بـ kind='note': بلا عمود body عمداً (نص الملاحظة لا يُجلب للإشعارات).
 * الكاتب بتضمين pharmacy_staff، والطلب (ومنه اسم المريض) بتضمين patient_requests!inner؛ الاستعلام يحصر المفتوحة وآخر 7 أيام.
 */
export interface RequestNoteRow {
  id: string;
  request_id: string;
  staff_id: string | null;
  created_at: string;
  staff: Nested<{ name: string | null }>;
  patient_requests: Nested<{ patient: Nested<{ name: string | null }> }>;
}

// ───────────────────────── المزمنون (قارب النفاذ + بلا رد) ─────────────────────────

const STORED_STAGES: readonly string[] = ['due', 'messaged', 'no_response', 'archived'];

/**
 * المرحلة كما تشتقّها صفحة المزمنين تماماً.
 * mirrors chronic/page.tsx:2182-2196 — لا نكتب 'no_response' هنا: المحرّك يشتقّها من reminded_at.
 */
function deriveStage(pipe: PipelineRow | null, daysLeft: number): RefillStage {
  if (!pipe) return daysLeft <= REFILL_WINDOW_DAYS ? 'due' : 'ok';
  const ps = pipe.pipeline_stage;
  if (ps === 'renewed') return daysLeft <= REFILL_WINDOW_DAYS ? 'due' : 'renewed';
  if (ps && STORED_STAGES.includes(ps)) return ps as RefillStage;
  // القيمة الافتراضية القديمة 'pending' (أو أي قيمة غريبة): لا تبويب لها في صفحة المزمنين، فلا إشعار
  return 'ok';
}

interface PatientState {
  patientId: string;
  name: string;
  daysLeft: number;
  stage: RefillStage;
  remindedAt: string | null;
  stageChangedAt: string | null;
}

/** مريض واحد لكل patient_id: أصغر daysLeft بين أدويته، ومساره النقدي (payment_type = 'cash' كالصفحة) */
function buildPatientStates(rows: ChronicMedRow[], daysLeftOf: (d: string) => number): Map<string, PatientState> {
  const min = new Map<string, { name: string; daysLeft: number; pipe: PipelineRow | null }>();
  for (const r of rows) {
    if (!r || !r.patient_id || !r.next_refill_date) continue;
    const d = daysLeftOf(r.next_refill_date);
    if (!Number.isFinite(d)) continue;
    const cur = min.get(r.patient_id);
    if (cur) {
      if (d < cur.daysLeft) cur.daysLeft = d;
      continue;
    }
    const p = first(r.patients);
    const cash = asArray(p?.refill_tracking_pipeline).find((x) => x && x.payment_type === 'cash') ?? null;
    min.set(r.patient_id, { name: (p?.name ?? '').trim(), daysLeft: d, pipe: cash });
  }
  const out = new Map<string, PatientState>();
  for (const [patientId, v] of min) {
    out.set(patientId, {
      patientId,
      name: v.name,
      daysLeft: v.daysLeft,
      stage: deriveStage(v.pipe, v.daysLeft),
      remindedAt: v.pipe?.reminded_at ?? null,
      stageChangedAt: v.pipe?.stage_changed_at ?? null,
    });
  }
  return out;
}

/**
 * مرضى المزمنين الذين قد يهمّون الجرس: daysLeft ≤ 3 (بما فيه السالب) أو مرحلتهم messaged/no_response.
 * البقية (مرحلة ok/renewed وأيامهم أكثر من 3) لا يستعملها المحرّك فلا تُمرَّر.
 */
export function mapRefill(rows: ChronicMedRow[], daysLeftOf: (d: string) => number): RefillPatient[] {
  const out: RefillPatient[] = [];
  for (const s of buildPatientStates(rows, daysLeftOf).values()) {
    if (s.daysLeft > REFILL_WINDOW_DAYS && s.stage !== 'messaged' && s.stage !== 'no_response') continue;
    out.push({
      patientId: s.patientId,
      name: s.name,
      daysLeft: s.daysLeft,
      stage: s.stage,
      remindedAt: s.remindedAt,
      stageChangedAt: s.stageChangedAt,
    });
  }
  return out;
}

// ───────────────────────── جهّز مخزونك ─────────────────────────

/**
 * أصناف نافذة الـ14 يوماً مجمّعة بالاسم المطبَّع، وconfirmed = «تأكيد ساري».
 * mirrors chronic/page.tsx:1344-1405 (calcInventory) و1309-1322 (fetchInventoryMaps):
 *  - مرضى المرحلة archived مستبعدون،
 *  - المفتاح trim().toLowerCase()، وأقرب موعد بين المرضى هو daysLeft الصنف،
 *  - التأكيد ساري عندما confirmed_at موجود وboxes_remaining > 0.
 */
export function mapInventory(rows: ChronicMedRow[], stock: StockRow[], daysLeftOf: (d: string) => number): InventoryItem[] {
  const states = buildPatientStates(rows, daysLeftOf);
  const confirmedKeys = new Set<string>();
  for (const s of stock) {
    if (s && s.confirmed_at && Number(s.boxes_remaining) > 0) confirmedKeys.add(s.med_key);
  }
  const byKey = new Map<string, { daysLeft: number }>();
  for (const r of rows) {
    if (!r || !r.next_refill_date) continue;
    if (states.get(r.patient_id)?.stage === 'archived') continue;
    const d = daysLeftOf(r.next_refill_date);
    if (!Number.isFinite(d) || d > INVENTORY_WINDOW_DAYS) continue;
    const key = (r.medication_name ?? '').trim().toLowerCase();
    if (!key) continue;
    const cur = byKey.get(key);
    if (!cur) byKey.set(key, { daysLeft: d });
    else if (d < cur.daysLeft) cur.daysLeft = d;
  }
  const out: InventoryItem[] = [];
  for (const [key, v] of byKey) {
    out.push({
      key,
      // mirrors chronic/page.tsx:1395 — حرف أول كبير لكل كلمة (لا أثر له على العربية)
      name: key.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      daysLeft: v.daysLeft,
      confirmed: confirmedKeys.has(key),
    });
  }
  return out;
}

// ───────────────────────── طلبات المرضى ─────────────────────────

/** ما يلزم من getOverdueReasons: معرّفات البنود المتأخرة فقط */
export type OverdueReasonsFn = (
  req: { status: string; deposit: number | null; deposit_returned: boolean | null; cancelled_at: string | null; items: RequestItemRow[] },
  now: Date,
) => { itemIds: string[] }[];

/**
 * تصنيف الطلبات (الصفوف نفسها التي تجلبها شارة «طلبات المرضى» الحالية: المفتوحة، والملغاة بعربون لم يُردّ):
 *  1) أي سبب تأخر تعيده getOverdueReasons ⇒ overdue، أياً كانت حالة الطلب (الملغى بعربون معلّق «استرداد» منها)
 *  2) وإلا، لطلب مفتوح فقط: بند في recorded (لم يُطلب) أو arrived (لم يُسلَّم) ⇒ action
 *  3) وإلا بند في ordered (عند المورد ضمن المهلة) ⇒ follow_up (سطر هادئ في المحرّك لا يدخل الأرقام)
 * ageDays = أيام عمّان التقويمية: للملغى منذ cancelled_at، وللبقية منذ stage_changed_at لأقدم بند حسم الفئة.
 */
export function mapRequests(rows: RequestRow[], now: number, overdueReasons: OverdueReasonsFn): RequestAttention[] {
  const out: RequestAttention[] = [];
  const oldestAge = (list: RequestItemRow[]): number | null => {
    let best: number | null = null;
    for (const it of list) {
      const age = ammanDaysSince(it.stage_changed_at, now);
      if (age !== null && (best === null || age > best)) best = age;
    }
    return best;
  };
  for (const r of rows) {
    if (!r) continue;
    const all = (r.items ?? []).filter((it): it is RequestItemRow => !!it);
    const live = all.filter((it) => it.stage !== 'delivered' && it.stage !== 'cancelled');
    const patientName = (first(r.patient)?.name ?? '').trim();

    const reasons = overdueReasons(
      { status: r.status, deposit: r.deposit, deposit_returned: r.deposit_returned, cancelled_at: r.cancelled_at, items: all },
      new Date(now),
    );

    if (reasons.length > 0) {
      const ids = new Set(reasons.flatMap((x) => x.itemIds ?? []));
      const deciding = all.filter((it) => it.id !== undefined && ids.has(it.id));
      const sinceCancel = r.status !== 'open' ? ammanDaysSince(r.cancelled_at, now) : null;
      out.push({ id: r.id, patientName, kind: 'overdue', ageDays: sinceCancel ?? oldestAge(deciding) ?? oldestAge(live) ?? 0 });
      continue;
    }

    if (r.status !== 'open') continue; // الملغى والمُسلَّم بلا سبب تأخر: لا شيء ينتظر
    const act = live.filter((it) => it.stage === 'recorded' || it.stage === 'arrived');
    if (act.length > 0) {
      out.push({ id: r.id, patientName, kind: 'action', ageDays: oldestAge(act) ?? 0 });
      continue;
    }
    const wait = live.filter((it) => it.stage === 'ordered');
    if (wait.length > 0) out.push({ id: r.id, patientName, kind: 'follow_up', ageDays: oldestAge(wait) ?? 0 });
  }
  return out;
}

// ───────────────────────── الكتالوج ─────────────────────────

/** أي عدّاد لم يُجلب (null) ⇒ undefined: لا نخمّن */
export function mapCatalog(total: number | null, unconfirmed: number | null, lastCreatedAt: string | null): CatalogInput | undefined {
  if (total === null || unconfirmed === null) return undefined;
  if (!Number.isFinite(total) || !Number.isFinite(unconfirmed)) return undefined;
  return { totalProducts: total, unconfirmed, lastAddedAt: lastCreatedAt };
}

// ───────────────────────── الاشتراك ─────────────────────────

/**
 * mirrors dashboard/layout.tsx:56-64 و DashboardHeader.tsx:121-128 و:428:
 *  active ⇒ نشط؛ grace/expired كما هما؛ أي حالة أخرى ⇒ «تجريبي».
 *  expiry هو pharmacies.expiry_date نفسه (لا تاريخ شريط التنبيه)؛ ولا تستعمل grace/expired الأيام أصلاً.
 *  daysLeft = max(0, ceil((expiry − الآن) / يوم)) أو null إن لم يُعرف التاريخ.
 */
export function mapSubscription(status: string | null | undefined, expiry: string | null | undefined, now: number): SubscriptionInput | undefined {
  if (!status) return undefined;
  const phase = status === 'active' ? 'active' : status === 'grace' ? 'grace' : status === 'expired' ? 'expired' : 'trial';
  const t = expiry ? Date.parse(expiry) : NaN;
  const daysLeft = Number.isFinite(t) ? Math.max(0, Math.ceil((t - now) / DAY)) : null;
  return { phase, daysLeft };
}

// ───────────────────────── أعياد الميلاد ─────────────────────────

/**
 * mirrors dashboard/page.tsx:282-293: مطابقة الشهر واليوم من نص birth_date (YYYY-MM-DD)،
 * و«اليوم» يُمرَّر من الخارج بالطريقة نفسها التي تختارها الرئيسية (جهاز المتصفح)، ثم استبعاد من هُنّئ اليوم.
 */
export function mapBirthdays(patients: PatientBirthRow[], greeted: GreetingRow[], month: number, day: number): BirthdayPatient[] {
  const done = new Set(greeted.map((g) => g.patient_id));
  const out: BirthdayPatient[] = [];
  for (const p of patients) {
    if (!p || !p.birth_date || done.has(p.id)) continue;
    const parts = p.birth_date.split('-');
    if (parts.length >= 3 && parseInt(parts[1]) === month && parseInt(parts[2]) === day) {
      out.push({ patientId: p.id, name: (p.name ?? '').trim() });
    }
  }
  return out;
}

// ───────────────────────── ملاحظات الكادر ─────────────────────────

/**
 * يحوّل ملاحظات الطلبات كما هي؛ المحرّك يصفّي بالعمر والكاتب نفسه. صف بلا طلب مضمَّن يُتجاهل:
 * لا نتحقق أن الطلب مفتوح ولا نعرف اسم مريضه، فلا نُنبّه به. لا نص ملاحظة هنا إطلاقاً.
 */
export function mapRequestNotes(rows: RequestNoteRow[]): RequestNote[] {
  const out: RequestNote[] = [];
  for (const n of rows) {
    if (!n || !n.id || !n.request_id) continue;
    const req = first(n.patient_requests);
    if (!req) continue;
    out.push({
      id: n.id,
      requestId: n.request_id,
      patientName: (first(req.patient)?.name ?? '').trim(),
      authorStaffId: n.staff_id ?? null,
      authorName: (first(n.staff)?.name ?? '').trim(),
      createdAt: n.created_at,
    });
  }
  return out;
}

/** يحوّل الصفوف كما هي؛ المحرّك يصفّي بالعمر والمُغلَق والكاتب نفسه. لا نص ملاحظة هنا إطلاقاً. */
export function mapNotes(rows: NoteRow[]): OpenNote[] {
  const out: OpenNote[] = [];
  for (const n of rows) {
    if (!n || !n.id) continue;
    out.push({
      id: n.id,
      patientId: n.patient_id,
      patientName: (first(n.patient)?.name ?? '').trim(),
      authorStaffId: n.author_staff_id ?? null,
      authorName: (n.author_name ?? '').trim(),
      createdAt: n.created_at,
      closedAt: n.closed_at ?? null,
    });
  }
  return out;
}
