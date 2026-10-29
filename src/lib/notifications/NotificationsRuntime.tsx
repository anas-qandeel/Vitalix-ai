'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getTenantContext } from '@/lib/tenant';
import { calcDaysLeft } from '@/lib/chronic';
import { getOverdueReasons, OVERDUE_SUMMARY_SELECT, REQUESTS_CHANGED_EVENT } from '@/lib/request-overdue';
import { computeNotifications, type NotifyInput, type Role } from './engine';
import {
  mapBirthdays, mapCatalog, mapInventory, mapNotes, mapRefill, mapRequests, mapSubscription,
  type ChronicMedRow, type GreetingRow, type NoteRow, type PatientBirthRow, type RequestRow, type StockRow,
} from './adapter';
import { buildConfig, NOTIFICATIONS_ENABLED } from './config';
import { setNotificationSummary } from './store';

/**
 * مشغّل الإشعارات: لا يرسم شيئاً. يجلب بيانات الصيدلية (SELECT فقط، بجلسة المستخدم وRLS) ويحسب الملخص ويضعه في المتجر.
 * لا يكتب في القاعدة إطلاقاً — خصوصاً لا يستدعي upsertPipeline: مرحلة «بلا رد» يشتقّها المحرّك ولا تُحفظ من هنا.
 * الحالة كلها على مستوى الملف (لا useState) كي لا يضاعف React StrictMode الجلب ولا يتسرّب منه شيء.
 */

const DAY = 86_400_000;
const ROLES: readonly string[] = ['owner', 'pharmacist', 'assistant', 'staff'];
const SLOW_TICK_MS = 120_000;

interface SubscriptionProps { status: string; expiry: string | null }

let latestSub: SubscriptionProps = { status: '', expiry: null };
let inflight = false;
let queued = false;
let lastStartAt = 0;
let generation = 0; // يبطل أي جلب بدأ قبل تسجيل الخروج أو تغيّر المستخدم
let ownerKey: string | null = null;

interface Res { data: unknown; error: { code?: string; message?: string } | null; count?: number | null }

const run = (b: PromiseLike<Res>): Promise<Res> => Promise.resolve(b);

// فشل مصدر: تحذير بالرمز والرسالة فقط، بلا أي بيانات صفوف
function ok(label: string, r: PromiseSettledResult<Res | null>): Res | null {
  if (r.status === 'rejected') {
    console.warn('[notifications]', label, 'rejected');
    return null;
  }
  if (r.value === null) return null;
  if (r.value.error) {
    console.warn('[notifications]', label, r.value.error.code ?? '', r.value.error.message ?? '');
    return null;
  }
  return r.value;
}

const rowsOf = <T,>(r: Res | null): T[] => (r && Array.isArray(r.data) ? (r.data as T[]) : []);

async function loadInput(pid: string, role: Role, sub: SubscriptionProps, now: number): Promise<NotifyInput> {
  const sees = role === 'owner' || role === 'pharmacist'; // الكتالوج لهما وحدهما (كما في المحرّك)
  // الاستعلام يجلب أدوية ≤ اليوم+15 (بتاريخ UTC) احتياطاً لفارق اليوم المحلي؛ المحوّل يطبّق calcDaysLeft ≤ 14 بدقة
  const medsLimit = new Date(now + 15 * DAY).toISOString().slice(0, 10);
  const notesSince = new Date(now - 7 * DAY).toISOString();
  // mirrors dashboard/page.tsx:245-247,292: «اليوم» للميلاد بتوقيت جهاز المتصفح، وقراءة التهنئات بتاريخ UTC
  const device = new Date(now);
  const greetDate = device.toISOString().split('T')[0];
  const notRejected = 'rejected_medicine';

  // 8 استعلامات كحدّ أقصى (المالك والصيدلاني)، و6 لبقية الأدوار
  const [meds, stock, reqs, catA, catB, pats, greets, notes] = await Promise.allSettled<Res | null>([
    // المزمنون + المخزون معاً: أدوية فعّالة ضمن النافذة مع مسار المريض النقدي (mirrors chronic/page.tsx:2159-2163)
    run(supabase.from('chronic_medications')
      .select('patient_id, medication_name, next_refill_date, patients!inner(name, refill_tracking_pipeline(payment_type, pipeline_stage, reminded_at, stage_changed_at))')
      .eq('pharmacy_id', pid).eq('status', 'active').lte('next_refill_date', medsLimit)),
    // التأكيد الساري فقط (confirmed_at موجود وboxes_remaining > 0) — mirrors chronic/page.tsx:1309-1322
    run(supabase.from('inventory_stock').select('med_key, confirmed_at, boxes_remaining')
      .eq('pharmacy_id', pid).not('confirmed_at', 'is', null).gt('boxes_remaining', 0)),
    // نفس حقول طلبات الرئيسية والقائمة، لكن للمفتوحة فقط
    run(supabase.from('patient_requests').select(OVERDUE_SUMMARY_SELECT).eq('status', 'open')),
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
  ]);

  const medsRes = ok('chronic_medications', meds);
  const stockRes = ok('inventory_stock', stock);
  const reqsRes = ok('patient_requests', reqs);
  const catARes = sees ? ok('pharmacy_products', catA) : null;
  const catBRes = sees ? ok('pharmacy_products_unconfirmed', catB) : null;
  const patsRes = ok('patients', pats);
  const greetsRes = ok('birthday_greetings', greets);
  const notesRes = ok('patient_notes', notes);

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
  if (role === 'owner') input.subscription = mapSubscription(sub.status, sub.expiry, now);
  if (patsRes && greetsRes) {
    input.birthdays = mapBirthdays(rowsOf<PatientBirthRow>(patsRes), rowsOf<GreetingRow>(greetsRes), device.getMonth() + 1, device.getDate());
  }
  if (notesRes) input.notes = mapNotes(rowsOf<NoteRow>(notesRes));
  return input;
}

async function refresh(): Promise<void> {
  const gen = generation;
  const tenant = await getTenantContext();
  if (gen !== generation) return;
  if (!tenant.pharmacyId || !ROLES.includes(tenant.role)) {
    ownerKey = null;
    setNotificationSummary(null);
    return;
  }
  const role = tenant.role as Role;
  const key = `${tenant.pharmacyId}:${tenant.staffId ?? ''}:${role}`;
  if (key !== ownerKey) { ownerKey = key; setNotificationSummary(null); } // مستخدم مختلف: لا نُظهر أرقام من قبله
  const now = Date.now();
  const input = await loadInput(tenant.pharmacyId, role, latestSub, now);
  if (gen !== generation) return;
  setNotificationSummary(computeNotifications(input, { now, role, staffId: tenant.staffId }, buildConfig()));
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
  if (age < minAgeMs) return;
  void startRefresh();
}

export default function NotificationsRuntime({ subscription }: { subscription?: SubscriptionProps }) {
  const pathname = usePathname();
  const status = subscription?.status ?? '';
  const expiry = subscription?.expiry ?? null;

  // حالة الاشتراك من dashboard/layout.tsx (لا استعلام pharmacies هنا)؛ تغيّرها يعيد الحساب
  useEffect(() => {
    if (!NOTIFICATIONS_ENABLED) return;
    latestSub = { status, expiry };
    requestRefresh(2000);
  }, [status, expiry]);

  // عند التركيب وعند كل تنقل: بشرط مرور 10 ثوانٍ على آخر جلب
  useEffect(() => {
    if (!NOTIFICATIONS_ENABLED) return;
    requestRefresh(10_000);
  }, [pathname]);

  useEffect(() => {
    if (!NOTIFICATIONS_ENABLED) return;
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
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener(REQUESTS_CHANGED_EVENT, onRequestsChanged);
    // الخروج يفرّغ المتجر ويبطل أي جلب جارٍ
    const { data: auth } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        generation++;
        ownerKey = null;
        queued = false;
        lastStartAt = 0;
        setNotificationSummary(null);
      }
    });
    return () => {
      stopTimer();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener(REQUESTS_CHANGED_EVENT, onRequestsChanged);
      auth.subscription.unsubscribe();
    };
  }, []);

  return null;
}
