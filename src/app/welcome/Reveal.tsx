'use client';

import { useEffect, useRef, useState } from 'react';

// المحتوى ظاهر افتراضياً (يعمل بلا JavaScript وفي الـ SSR)، ولا يُخفى إلا بعد التركيب إن كان
// العنصر خارج الشاشة والمتصفح يدعم IntersectionObserver والمستخدم لم يطلب تقليل الحركة
export default function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'visible' | 'hidden' | 'shown'>('visible');

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    setState('hidden');
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState('shown');
          io.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${state === 'hidden' ? 'opacity-0 translate-y-6' : 'opacity-100 translate-y-0'} ${className}`}
      style={state === 'visible' ? undefined : { transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
