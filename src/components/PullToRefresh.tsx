'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

// المسافات كلها بعد التخفيف (damping) لا حركة الإصبع الخام: العتبة 64px بعد التخفيف أي ~128px إصبعاً
const DAMPING = 0.5;
const THRESHOLD = 64;
const MAX_PULL = 100;
const REFRESH_OFFSET = 64;
const HIDDEN_SHIFT = 48;
// ارتجاف الإصبع في بداية اللمس لا يُعدّ تمريراً للأعلى
const UP_TOLERANCE = 8;

type Phase = 'idle' | 'pulling' | 'ready' | 'refreshing';

// التطبيق المثبّت فقط: في المتصفح العادي يعمل التحديث الأصلي. وضع العرض لا يتغيّر أثناء الجلسة فلا اشتراك
// يُقرأ بـ useSyncExternalStore بدل effect+setState (تفادياً لـ react-hooks/set-state-in-effect ولعدم اختلال الهيدرة)
const subscribeNoop = () => () => {};
const getStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
const getStandaloneServer = () => false;

// السحب فوق حقل إدخال يخص المؤشر والتحديد، لا الصفحة
const isEditable = (el: Element | null) =>
  !!el?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');

// حاوية داخلية قابلة للتمرير ومُمرَّرة لأسفل: السحب داخلها يعيدها للأعلى ولا يخص الصفحة
function insideScrolledContainer(el: Element | null) {
  for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight && n.scrollTop > 0) return true;
  }
  return false;
}

/**
 * سحب-للتحديث للتطبيق المثبّت (PWA standalone) فقط. globals.css يعطّل التحديث الأصلي عمداً
 * (overscroll-behavior-y: contain)، فنوفّره بمؤشرنا. لا preventDefault أبداً: المستمعون passive
 * ولا يمسّون التمرير العادي. يتوقف عند وجود أي نافذة (.fixed.inset-0) أو حقل إدخال أو حاوية ممرَّرة.
 * المؤشر نفسه لا يحمل inset-0 كي لا يُفعّل قفل body:has(.fixed.inset-0) في globals.css.
 */
export default function PullToRefresh() {
  const enabled = useSyncExternalStore(subscribeNoop, getStandalone, getStandaloneServer);
  const [offset, setOffset] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const startY = useRef<number | null>(null);
  const pulled = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const reset = () => {
      startY.current = null;
      pulled.current = 0;
      setPhase('idle');
      setOffset(0);
    };

    const onStart = (e: TouchEvent) => {
      startY.current = null;
      if (busy.current || e.touches.length !== 1) return;
      if (window.scrollY > 0) return;
      if (document.querySelector('.fixed.inset-0')) return;
      const target = e.target instanceof Element ? e.target : null;
      if (isEditable(target) || isEditable(document.activeElement) || insideScrolledContainer(target)) return;
      startY.current = e.touches[0].clientY;
    };

    const onMove = (e: TouchEvent) => {
      if (busy.current || startY.current === null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (e.touches.length !== 1 || dy < -UP_TOLERANCE || window.scrollY > 0 || document.querySelector('.fixed.inset-0')) {
        reset();
        return;
      }
      const next = Math.min(Math.max(dy, 0) * DAMPING, MAX_PULL);
      pulled.current = next;
      setOffset(Math.round(next));
      setPhase(next >= THRESHOLD ? 'ready' : next > 0 ? 'pulling' : 'idle');
    };

    const onEnd = () => {
      if (busy.current || startY.current === null) return;
      const ready = pulled.current >= THRESHOLD;
      startY.current = null;
      if (!ready) { reset(); return; }
      busy.current = true;
      setPhase('refreshing');
      setOffset(REFRESH_OFFSET);
      window.location.reload();
    };

    const opts = { passive: true } as const;
    document.addEventListener('touchstart', onStart, opts);
    document.addEventListener('touchmove', onMove, opts);
    document.addEventListener('touchend', onEnd, opts);
    document.addEventListener('touchcancel', reset, opts);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', reset);
    };
  }, [enabled]);

  if (!enabled) return null;

  const dragging = phase === 'pulling' || phase === 'ready';
  const label = phase === 'refreshing' ? 'جارٍ التحديث…' : phase === 'ready' ? 'أفلت للتحديث' : 'اسحب للتحديث';

  return (
    // z-[45]: فوق الهيدر (z-40) وتحت النوافذ (z-50)، وpointer-events-none فلا يعترض لمساً.
    // top ثابت لا env(safe-area-inset-top): viewportFit غير مضبوط على cover ولا يستعمل المشروع env() في أي مكان،
    // فنتبع أسلوبه: تحت الهيدر الثابت (شريط 4px + 64px + حد 1px) بهامش 8px كي لا يغطّي أزراره
    <div dir="rtl" role="status" aria-hidden={phase === 'idle'}
      className={`pointer-events-none fixed left-1/2 z-[45] ${dragging ? '' : 'transition-[transform,opacity] duration-200 motion-reduce:transition-none'}`}
      style={{
        top: '77px',
        transform: `translate(-50%, ${offset - HIDDEN_SHIFT}px)`,
        opacity: phase === 'refreshing' ? 1 : Math.min(offset / 60, 1),
      }}>
      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-full shadow-sm px-4 py-2 text-xs font-bold text-slate-700">
        {phase === 'refreshing' ? (
          <div className="w-4 h-4 border-2 border-slate-200 border-t-teal-600 rounded-full animate-spin motion-reduce:animate-none" />
        ) : (
          <svg className={`w-4 h-4 transition-transform motion-reduce:transition-none ${phase === 'ready' ? 'rotate-180 text-teal-600' : 'text-slate-500'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
          </svg>
        )}
        <span>{label}</span>
      </div>
    </div>
  );
}
