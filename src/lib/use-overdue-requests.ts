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

interface Snapshot { requests: OverdueRequestSummary[]; loaded: boolean }

const EMPTY: Snapshot = { requests: [], loaded: false };
let cache: Snapshot = EMPTY;
let fetchedAt = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach(l => l());

async function refresh(force = false): Promise<void> {
  if (inflight) return inflight;
  if (!force && cache.loaded && Date.now() - fetchedAt < TTL_MS) return;
  inflight = (async () => {
    try {
      const { data, error } = await supabase.from('patient_requests').select(OVERDUE_SUMMARY_SELECT).or(OPEN_REQUESTS_FILTER);
      if (error) return; // فشل صامت: تبقى آخر قيمة معروفة
      cache = { requests: summarizeOverdue((data || []) as unknown as OverdueRequestRow[]), loaded: true };
      fetchedAt = Date.now();
      emit();
    } catch {
      /* فشل صامت */
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

// تغيير المستخدم أو خروجه يمسح الذاكرة كي لا تُعرض بيانات صيدلية سابقة (كما في tenant.ts)
if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange(event => {
    if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') return; // لا تغيّر في المستخدم
    cache = EMPTY;
    fetchedAt = 0;
    emit();
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

export function useOverdueRequests(): { requests: OverdueRequestSummary[]; count: number; loading: boolean } {
  const snap = useSyncExternalStore(subscribe, () => cache, () => EMPTY);
  useEffect(() => { void refresh(); }, []);
  return { requests: snap.requests, count: snap.requests.length, loading: !snap.loaded };
}
