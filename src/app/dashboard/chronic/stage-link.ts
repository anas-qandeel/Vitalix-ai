'use client';

import { useCallback, useEffect, useRef } from 'react';

// مفاتيح تبويبات صفحة المزمنين الأربعة (نفس VISIBLE_STAGES في page.tsx)
export type StageHint = 'due' | 'messaged' | 'no_response' | 'renewed';
const STAGES: readonly StageHint[] = ['due', 'messaged', 'no_response', 'renewed'];

// الحدث الذي يطلقه مركز الإشعارات حين تكون صفحة المزمنين مفتوحة أصلاً (detail = مفتاح التبويب)
export const OPEN_STAGE_EVENT = 'vd:open-stage';

/** يقبل أحد المفاتيح الأربعة فقط، وأي شيء آخر ⇒ null (لا يُتَّخذ إجراء). */
export function parseStageHint(value: unknown): StageHint | null {
  return typeof value === 'string' ? (STAGES.find((s) => s === value) ?? null) : null;
}

/**
 * يقرأ ?stage= من العنوان الحالي ثم يزيله كي لا يُعاد تطبيقه عند التحديث، ويُبقي بقية الوسائط والـ hash كما هي حرفياً.
 * يُرجع null إن لم يوجد الوسيط أو كانت قيمته غير معروفة (ويُزال في الحالتين).
 */
export function takeStageHint(): StageHint | null {
  if (typeof window === 'undefined') return null;
  const { pathname, search, hash } = window.location;
  let raw: string | null = null;
  const rest: string[] = [];
  for (const part of search.replace(/^\?/, '').split('&')) {
    if (!part) continue;
    const i = part.indexOf('=');
    if ((i < 0 ? part : part.slice(0, i)) !== 'stage') { rest.push(part); continue; }
    if (raw === null) {
      try { raw = i < 0 ? '' : decodeURIComponent(part.slice(i + 1)); } catch { raw = ''; }
    }
  }
  if (raw === null) return null;
  window.history.replaceState(null, '', pathname + (rest.length ? '?' + rest.join('&') : '') + hash);
  return parseStageHint(raw);
}

/**
 * يربط صفحة المزمنين بمركز الإشعارات:
 *  (أ) عند أول تركيب: يقرأ ?stage= (ويزيله) ويحتفظ به لتختاره الصفحة بعد جلب بياناتها (تُرجِع getter له)
 *  (ب) والصفحة مفتوحة أصلاً: يستدعي onStage حين يصل حدث OPEN_STAGE_EVENT بمفتاح صالح.
 * لا يفعل شيئاً إن لم يصله أيٌّ من ذلك، فلا أثر له على الصفحة من دون مركز الإشعارات.
 * التلميح يبقى في ref الصفحة نفسها (لا متغيّر عام): تركيب جديد للصفحة ⇒ قراءة جديدة، وStrictMode لا يُضيعه.
 */
export function useStageLink(onStage: (stage: StageHint) => void): () => StageHint | null {
  const hint = useRef<StageHint | null>(null);
  const cb = useRef(onStage);
  useEffect(() => { cb.current = onStage; });

  useEffect(() => {
    const h = takeStageHint();
    if (h) hint.current = h;
    const handle = (e: Event) => {
      const s = parseStageHint((e as CustomEvent<unknown>).detail);
      if (s) cb.current(s);
    };
    window.addEventListener(OPEN_STAGE_EVENT, handle);
    return () => window.removeEventListener(OPEN_STAGE_EVENT, handle);
  }, []);

  return useCallback(() => hint.current, []);
}
