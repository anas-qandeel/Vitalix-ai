'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getTenantContext } from '@/lib/tenant';
import { calcDaysLeft } from '@/lib/chronic';
import { getOverdueReasons, OPEN_REQUESTS_FILTER, OVERDUE_SUMMARY_SELECT, REQUESTS_CHANGED_EVENT } from '@/lib/request-overdue';
import { computeNotifications, SECTION_KEYS, type NotifyInput, type Role } from './engine';
import {
  mapBirthdays, mapCatalog, mapInventory, mapNotes, mapRefill, mapRequestNotes, mapRequests, mapSubscription,
  type ChronicMedRow, type GreetingRow, type NoteRow, type PatientBirthRow, type RequestNoteRow, type RequestRow, type StockRow,
} from './adapter';
import { buildConfig, NOTIFICATIONS_DEBUG, NOTIFICATIONS_ENABLED } from './config';
import { setNotificationSummary } from './store';
import { loadSeen, seenId, seenKeyOf, subscribeSeen } from './seen';

/**
 * مشغّل الإشعارات: لا يرسم شيئاً. يجلب بيانات الصيدلية (SELECT فقط، بجلسة المستخدم وRLS) ويحسب الملخص ويضعه في المتجر.
 * لا يكتب في القاعدة إطلاقاً — خصوصاً لا يستدعي upsertPipeline: مرحلة «بلا رد» يشتقّها المحرّك ولا تُحفظ من هنا.
 * الحالة كلها على مستوى الملف (لا useState) كي لا يضاعف React StrictMode الجلب ولا يتسرّب منه شيء.
 * الاشتراك لا يُجلب: يُدمج لحظة الحساب (compute) من قيمة الـ layout، فلا سباق مع أول جلب ولا شبكة لتغيّره.
 */

const DAY = 86_400_000;
const ROLES: readonly string[] = ['owner', 'pharmacist', 'assistant', 'staff'];
const SLOW_TICK_MS = 120_000;
// حدّ PostgREST الافتراضي للصفوف: بلوغه يعني احتمال قطع القائمة، فلا نبني عليها عدّاً ناقصاً
const ROW_CAP = 1000;

interface SubscriptionProps { status: string; expiryDate: string | null }

interface Cache {
  input: NotifyInput;
  role: Role;
  staffId: string | null;
  staffName: string | null;
  /** مفتاح «رأيتُ» (الصيدلية + الموظف) — انظر seen.ts */
  seenKey: string;
  sources: Record<string, string>;
}

let latestSub: SubscriptionProps = { status: '', expiryDate: null };
let cache: Cache | null = null;
let mounts = 0; // عدد المشغّلات المركّبة؛ عند 0 يُفرَّغ المتجر فلا تبقى أرقام مستخدم سابق على جهاز مشترك
let inflight = false;
let queued = false;
let lastStartAt = 0;
let generation = 0; // يبطل أي جلب بدأ قبل تسجيل الخروج (لا يُرفع عند unmount: StrictMode يركّب ويفكّ ويعيد فوراً)
let ownerKey: string | null = null;

interface Res { data: unknown; error: { code?: string; message?: string } | null; count?: number | null }

const run = (b: PromiseLike<Res>): Promise<Res> => Promise.resolve(b);

/**
 * نتيجة مصدر واحد أو null عند الفشل/التخطي. التحذير برمز الخطأ ورسالته فقط، بلا أي بيانات صفوف.
 * kind 'list': بلوغ ROW_CAP صفاً = ناقص (لا نبني عليه). kind 'count': القيمة من count.
 */
function ok(label: string, r: PromiseSettledResult<Res | null>, kind: 'list' | 'count', sources: Record<string, string>): Res | null {
  if (r.status === 'rejected') {
    console.warn('[notifications]', label, 'rejected');
    sources[label] = 'failed';
    return null;
  }
  if (r.value === null) { sources[label] = 'skipped'; return null; }
  if (r.value.error) {
    console.warn('[notifications]', label, r.value.error.code ?? '', r.value.error.message ?? '');
    sources[label] = 'failed';
    return null;
  }
  if (kind === 'list' && Array.isArray(r.value.data) && r.value.data.length >= ROW_CAP) {
    console.warn('[notifications]', label, 'row cap reached, treated as incomplete');
    sources[label] = 'capped';
    return null;
  }
  sources[label] = kind === 'count' ? `ok:${r.value.count ?? 0}` : `ok:${Array.isArray(r.value.data) ? r.value.data.length : 0}`;
  return r.value;
}

const rowsOf = <T,>(r: Res | null): T[] => (r && Array.isArray(r.data) ? (r.data as T[]) : []);

async function loadInput(pid: string, role: Role, now: number): Promise<{ input: NotifyInput; sources: Record<string, string> }> {
  const sees = role === 'owner' || role === 'pharmacist'; // الكتالوج لهما وحدهما (كما في المحرّك)
  // الاستعلام يجلب أدوية ≤ اليوم+15 (بتاريخ UTC) احتياطاً لفارق اليوم المحلي؛ المحوّل يطبّق calcDaysLeft ≤ 14 بدقة
  const medsLimit = new Date(now + 15 * DAY).toISOString().slice(0, 10);
  const notesSince = new Date(now - 7 * DAY).toISOString();
  // mirrors dashboard/page.tsx:245-247,292: «اليوم» للميلاد بتوقيت جهاز المتصفح، وقراءة التهنئات بتاريخ UTC
  const device = new Date(now);
  const greetDate = device.toISOString().split('T')[0];
  const notRejected = 'rejected_medicine';

  // 9 استعلامات كحدّ أقصى (المالك والصيدلاني)، و7 لبقية الأدوار
  const [meds, stock, reqs, catA, catB, pats, greets, notes, reqNotes] = await Promise.allSettled<Res | null>([
    // المزمنون + المخزون معاً: أدوية فعّالة ضمن النافذة مع مسار المريض النقدي (mirrors chronic/page.tsx:2159-2163)
    run(supabase.from('chronic_medications')
      .select('patient_id, medication_name, next_refill_date, patients!inner(name, refill_tracking_pipeline(payment_type, pipeline_stage, reminded_at, stage_changed_at))')
      .eq('pharmacy_id', pid).eq('status', 'active').lte('next_refill_date', medsLimit)),
    // التأكيد الساري فقط (confirmed_at موجود وboxes_remaining > 0) — mirrors chronic/page.tsx:1309-1322
    run(supabase.from('inventory_stock').select('med_key, confirmed_at, boxes_remaining')
      .eq('pharmacy_id', pid).not('confirmed_at', 'is', null).gt('boxes_remaining', 0)),
    // الصفوف نفسها التي تعدّها شارة «طلبات المرضى» (use-overdue-requests.ts:57): المفتوحة + الملغاة بعربون لم يُرجَع
    run(supabase.from('patient_requests').select(OVERDUE_SUMMARY_SELECT).or(OPEN_REQUESTS_FILTER)),
    // الكتالوج: العدد الكلي + أحدث إضافة باستعلام واحد، وغير المؤكَّد باستعلام عدّ — mirrors pharmacy-catalog-manager/page.tsx:66-87
    sees ? run(supabase.from('pharmacy_products').select('created_at', { count: 'exact' })
      .eq('pharmacy_id', pid).neq('review_status', notRejected).order('created_at', { ascending: false }).limit(1)) : Promise.resolve(null),
    sees ? run(supabase.from('pharmacy_products').select('id', { count: 'exact', head: true })
      .eq('pharmacy_id', pid).neq('review_status', notRejected).is('profile_confirmed_at', null)) : Promise.resolve(null),
    // mirrors dashboard/page.tsx:253,289-292
    run(supabase.from('patients').select('id, name, birth_date').eq('pharmacy_id', pid).not('birth_date', 'is', null)),
    run(supabase.from('birthday_greetings').select('patient_id').eq('greeted_on', greetDate)),
    // بلا عمود body عمداً؛ اسم المريض بالتضمين (FK patient_id) فلا استعلام لكل ملاحظة
    run(supabase.from('patient_notes')
      .select('id, patient_id, author_staff_id, author_name, created_at, closed_at, patient:patients(name)')
      .is('closed_at', null).gte('created_at', notesSince).order('created_at', { ascending: false })),
    // ملاحظات الطلبات (kind='note'): بلا body عمداً؛ الكاتب بتضمين pharmacy_staff (نفس قيد النافذة)، والطلب المفتوح بنفس تعريف شارة «طلبات المرضى»
    run(supabase.from('patient_request_events')
      .select('id, request_id, staff_id, created_at, staff:pharmacy_staff!patient_request_events_staff_id_fkey(name), patient_requests!inner(patient:patients(name))')
      .eq('kind', 'note').gte('created_at', notesSince)
      .or(OPEN_REQUESTS_FILTER, { referencedTable: 'patient_requests' })
      .order('created_at', { ascending: false })),
  ]);

  const sources: Record<string, string> = {};
  const medsRes = ok('chronic_medications', meds, 'list', sources);
  const stockRes = ok('inventory_stock', stock, 'list', sources);
  const reqsRes = ok('patient_requests', reqs, 'list', sources);
  const catARes = ok('pharmacy_products', catA, 'count', sources);
  const catBRes = ok('pharmacy_products_unconfirmed', catB, 'count', sources);
  const patsRes = ok('patients', pats, 'list', sources);
  const greetsRes = ok('birthday_greetings', greets, 'list', sources);
  const notesRes = ok('patient_notes', notes, 'list', sources);
  const reqNotesRes = ok('patient_request_events', reqNotes, 'list', sources);

  const input: NotifyInput = {};
  if (medsRes) {
    const medRows = rowsOf<ChronicMedRow>(medsRes);
    input.refill = mapRefill(medRows, calcDaysLeft);
    if (stockRes) input.inventory = mapInventory(medRows, rowsOf<StockRow>(stockRes), calcDaysLeft);
  }
  if (reqsRes) input.requests = mapRequests(rowsOf<RequestRow>(reqsRes), now, getOverdueReasons);
  if (sees && catARes && catBRes) {
    const last = rowsOf<{ created_at: string }>(catARes)[0]?.created_at ?? null;
    input.catalog = mapCatalog(catARes.count ?? null, catBRes.count ?? null, last);
  }
  if (patsRes && greetsRes) {
    input.birthdays = mapBirthdays(rowsOf<PatientBirthRow>(patsRes), rowsOf<GreetingRow>(greetsRes), device.getMonth() + 1, device.getDate());
  }
  if (notesRes) input.notes = mapNotes(rowsOf<NoteRow>(notesRes));
  if (reqNotesRes) input.requestNotes = mapRequestNotes(rowsOf<RequestNoteRow>(reqNotesRes));
  return { input, sources };
}

/** يدمج الاشتراك (بلا شبكة) مع آخر مدخلات مجلوبة ويكتب الملخص. الاشتراك غير المحمَّل لا يُحسب «نشطاً» أبداً. */
function compute(): void {
  if (!cache || mounts === 0) return;
  const now = Date.now();
  const input: NotifyInput = { ...cache.input };
  // «رأيتُ» (لهذا الموظف على هذا الجهاز): ملاحظة فُتحت شاشتها لا تبقى في الجرس؛ الملاحظة نفسها لا تُمَسّ
  const seen = loadSeen(cache.seenKey);
  if (input.notes) input.notes = input.notes.filter((n) => !seen.has(seenId('pn', n.id)));
  if (input.requestNotes) input.requestNotes = input.requestNotes.filter((n) => !seen.has(seenId('rn', n.id)));
  if (cache.role === 'owner') {
    const sub = mapSubscription(latestSub.status, latestSub.expiryDate, now);
    if (sub) input.subscription = sub; else delete input.subscription;
  }
  const summary = computeNotifications(
    input,
    { now, role: cache.role, staffId: cache.staffId, staffName: cache.staffName },
    buildConfig(),
  );
  setNotificationSummary(summary);
  if (NOTIFICATIONS_DEBUG) {
    // أرقام وحالات فقط: لا عناوين ولا تفاصيل ولا أسماء ولا معرّفات ولا أي بيانات صفوف
    console.info('[notifications] debug', {
      sources: cache.sources,
      total: summary.total,
      complete: summary.complete,
      allClear: summary.allClear,
      sections: Object.fromEntries(SECTION_KEYS.map((k) => [k, summary.bySection[k].badge])),
      lines: summary.lines.map((l) => ({ kind: l.kind, count: l.count, badge: l.badge })),
    });
  }
}

async function refresh(): Promise<void> {
  const gen = generation;
  const tenant = await getTenantContext();
  if (gen !== generation || mounts === 0) return;
  if (!tenant.pharmacyId || !ROLES.includes(tenant.role)) {
    ownerKey = null;
    cache = null;
    setNotificationSummary(null);
    return;
  }
  const role = tenant.role as Role;
  const key = `${tenant.pharmacyId}:${tenant.staffId ?? ''}:${role}`;
  if (key !== ownerKey) { ownerKey = key; cache = null; setNotificationSummary(null); } // مستخدم مختلف: لا أرقام من قبله
  const { input, sources } = await loadInput(tenant.pharmacyId, role, Date.now());
  if (gen !== generation || mounts === 0) return;
  cache = { input, role, staffId: tenant.staffId, staffName: tenant.staffName ?? null, seenKey: seenKeyOf(tenant), sources };
  compute();
}

async function startRefresh(): Promise<void> {
  inflight = true;
  lastStartAt = Date.now();
  try {
    await refresh();
  } catch (e) {
    console.warn('[notifications] refresh failed', e instanceof Error ? e.message : '');
  } finally {
    inflight = false;
    if (queued) { queued = false; void startRefresh(); } // محفّزات وصلت أثناء الجلب تُدمج في جلب لاحق واحد
  }
}

/** minAgeMs: لا جلب إن كان آخر بدء أحدث من ذلك؛ 0 = إجباري (بعد كتابة في الطلبات) */
function requestRefresh(minAgeMs: number): void {
  if (!NOTIFICATIONS_ENABLED) return;
  const age = Date.now() - lastStartAt;
  if (inflight) {
    // محفّز يرضيه الجلب الجاري (بدأ حديثاً) يُهمَل — وهذا ما يمنع تضاعف الجلب في StrictMode
    if (minAgeMs === 0 || age >= minAgeMs) queued = true;
    return;
  }
  if (age < minAgeMs && cache !== null) return; // بلا ذاكرة (مغادرة الداشبورد وعودة سريعة): لا نترك الجرس فارغاً بسبب المهلة
  void startRefresh();
}

/** يستدعيها مركز الإشعارات عند فتح اللوحة: جلب واحد إن مضى minAgeMs على آخر بدء، ويمرّ بالدمج والمنع الموجودين. */
export function refreshNotifications(minAgeMs = 0): void {
  requestRefresh(minAgeMs);
}

export default function NotificationsRuntime({ subscription }: { subscription?: SubscriptionProps }) {
  const pathname = usePathname();
  const status = subscription?.status ?? '';
  const expiryDate = subscription?.expiryDate ?? null;

  // الاشتراك من dashboard/layout.tsx: يُدمج في الحساب فوراً، بلا جلب ولا تحديد معدّل
  useEffect(() => {
    if (!NOTIFICATIONS_ENABLED) return;
    latestSub = { status, expiryDate };
    compute();
  }, [status, expiryDate]);

  // عند التركيب وعند كل تنقل: بشرط مرور 10 ثوانٍ على آخر جلب
  useEffect(() => {
    if (!NOTIFICATIONS_ENABLED) return;
    requestRefresh(10_000);
  }, [pathname]);

  useEffect(() => {
    if (!NOTIFICATIONS_ENABLED) return;
    mounts++;
    let timer: ReturnType<typeof setInterval> | undefined;
    const stopTimer = () => { if (timer !== undefined) { clearInterval(timer); timer = undefined; } };
    // لا مؤقت يعمل والتبويب مخفي
    const startTimer = () => {
      stopTimer();
      if (document.visibilityState === 'visible') timer = setInterval(() => requestRefresh(60_000), SLOW_TICK_MS);
    };
    const onFocus = () => requestRefresh(60_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') { requestRefresh(60_000); startTimer(); } else stopTimer();
    };
    const onRequestsChanged = () => requestRefresh(0);
    startTimer();
    const unsubSeen = subscribeSeen(compute); // «رأيتُ» من هذا التبويب أو غيره: إعادة حساب فورية بلا جلب
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener(REQUESTS_CHANGED_EVENT, onRequestsChanged);
    // الخروج يفرّغ المتجر والذاكرة ويبطل أي جلب جارٍ
    const { data: auth } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        generation++;
        ownerKey = null;
        queued = false;
        lastStartAt = 0;
        cache = null;
        setNotificationSummary(null);
      }
    });
    return () => {
      stopTimer();
      unsubSeen();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener(REQUESTS_CHANGED_EVENT, onRequestsChanged);
      auth.subscription.unsubscribe();
      mounts--;
      if (mounts === 0) { cache = null; ownerKey = null; setNotificationSummary(null); }
    };
  }, []);

  return null;
}
