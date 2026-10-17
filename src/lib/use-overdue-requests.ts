'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';
import {
  OPEN_REQUESTS_FILTER, OVERDUE_SUMMARY_SELECT, REQUESTS_CHANGED_EVENT, summarizeOverdue,
  type OverdueRequestRow, type OverdueRequestSummary,
} from '@/lib/request-overdue';

// الطلبات المتأخرة لكل من يحتاجها (بطاقة الرئيسية وعدّاد القائمة العلوية).
// ذاكرة على مستوى الوحدة تُشارَك بين كل المكوّنات: استعلام خفيف واحد للطلبات المفتوحة، صالح 60 ثانية،
// فلا يتكرر مع كل تنقل (الهيدر يُعاد تركيبه في كل صفحة). لا استطلاع دوري: التحديث عند التركيب إن قدم،
// وعند عودة النافذة للواجهة، وفوراً عند حدث requests:changed بعد أي كتابة في شاشات الطلبات.

const TTL_MS = 60_000;

// settled: انتهت أول محاولة جلب للمستخدم الحالي (نجحت أو فشلت) — تعتمد عليها الصفحة كي لا تنتظر للأبد عند الفشل
// loaded: توجد بيانات صحيحة فعلاً
interface Snapshot { requests: OverdueRequestSummary[]; loaded: boolean; settled: boolean }

const EMPTY: Snapshot = { requests: [], loaded: false, settled: false };
let cache: Snapshot = EMPTY;
let fetchedAt = 0;
let inflight: Promise<void> | null = null;
// صاحب الذاكرة الحالية، وعدّاد أجيال يبطل أي جلب بدأ لمستخدم آخر فلا تُنسب بيانات مستخدم لغيره
let ownerId: string | null = null;
let generation = 0;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach(l => l());

// تفريغ كامل وربط الذاكرة بمستخدم جديد (أو بلا أحد)
function resetFor(uid: string | null) {
  generation++;
  inflight = null; // الجلب الجاري للمستخدم السابق لن يُعتمد، فلا يحجب جلباً جديداً
  cache = EMPTY;
  fetchedAt = 0;
  ownerId = uid;
  emit();
}

async function currentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

async function refresh(force = false): Promise<void> {
  if (inflight) return inflight;
  if (!force && cache.loaded && Date.now() - fetchedAt < TTL_MS) return;
  inflight = (async () => {
    let gen = generation;
    try {
      const uid = await currentUserId();
      if (uid !== ownerId) resetFor(uid);
      gen = generation;
      if (!uid) return; // لا جلسة: لا استعلام (الحارس سيعيد التوجيه)
      const { data, error } = await supabase.from('patient_requests').select(OVERDUE_SUMMARY_SELECT).or(OPEN_REQUESTS_FILTER);
      if (gen !== generation) return; // تغيّر المستخدم أثناء الجلب
      // تحقق أخير: الجلسة التي أجابت الاستعلام هي نفسها صاحبة الذاكرة
      if ((await currentUserId()) !== uid || gen !== generation) return;
      if (error) return; // فشل صامت: تبقى آخر قيمة معروفة
      cache = { requests: summarizeOverdue((data || []) as unknown as OverdueRequestRow[]), loaded: true, settled: true };
      fetchedAt = Date.now();
      emit();
    } catch {
      /* فشل صامت */
    } finally {
      if (gen === generation) {
        inflight = null; // نفس الجيل: الجلب الجاري هو هذا الجلب (أي تغيير مستخدم يصفّره ويرفع الجيل)
        if (!cache.settled) { cache = { ...cache, settled: true }; emit(); }
      }
    }
  })();
  return inflight;
}

/** يبدأ الجلب مبكراً (من layout) ليكون جاهزاً قبل رسم الصفحات؛ يحترم مدة الصلاحية. */
export function prefetchOverdue(): Promise<void> {
  return refresh();
}

// الخروج يمسح الذاكرة؛ وأي حدث آخر لا يمسحها إلا إذا اختلف معرّف المستخدم عن صاحبها
// (SIGNED_IN يُعاد إطلاقه عند عودة التبويب لنفس المستخدم، ومسحه حينها كان يجعل كل تنقل بارداً)
if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') { resetFor(null); return; }
    const uid = session?.user.id ?? null;
    if (!uid || uid === ownerId) return;
    resetFor(uid);
    if (listeners.size > 0) void refresh(true);
  });
  const staleRefresh = () => { if (listeners.size > 0) void refresh(); };
  window.addEventListener('focus', staleRefresh);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') staleRefresh(); });
  window.addEventListener(REQUESTS_CHANGED_EVENT, () => { if (listeners.size > 0) void refresh(true); });
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
};

export function useOverdueRequests(): { requests: OverdueRequestSummary[]; count: number; loading: boolean; settled: boolean } {
  const snap = useSyncExternalStore(subscribe, () => cache, () => EMPTY);
  useEffect(() => { void refresh(); }, []);
  return { requests: snap.requests, count: snap.requests.length, loading: !snap.loaded, settled: snap.settled };
}
