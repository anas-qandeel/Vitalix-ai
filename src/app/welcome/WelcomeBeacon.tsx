'use client';

import { useEffect } from 'react';

// عدّاد زيارات داخلي مجهول: لا كوكيز ولا تخزين لمعرّف الزيارة ولا طرف ثالث.
// يرجع null فلا يغيّر شيئاً مرئياً في الصفحة.
const ENDPOINT = '/api/welcome-beacon';
const TAG_RE = /^[a-z0-9-]{1,24}$/;
const MAX_SECONDS = 1800;
const SEND_EVERY_MS = 20000;
// ترتيب الأقسام العشرة كما في الصفحة؛ يُحسب الفهرس n ابتداءً من 1
const SECTION_SELECTORS = [
  '.vx-hero', '#rival', '#demo', '#inbox', '#remember', '#rx', '#staff', '#faq', '#contact', '#start',
];

export default function WelcomeBeacon({ src: pageSrc }: { src: string }) {
  useEffect(() => {
    let optOut = false;
    try {
      if (new URLSearchParams(window.location.search).get('notrack') === '1') {
        localStorage.setItem('vx_notrack', '1');
        optOut = true;
      } else if (localStorage.getItem('vx_notrack') === '1') {
        optOut = true;
      }
    } catch {
      // التخزين غير متاح: نتابع بلا استثناء
    }
    if (optOut) return;
    if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') return;

    const visitId = crypto.randomUUID();
    const lowered = pageSrc.toLowerCase();
    const src = TAG_RE.test(lowered) ? lowered : 'web';
    // نقطة الكسر نفسها في welcome.css (max-width:767px)
    const device = window.matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop';

    // الوقت الفعلي: يتراكم فقط والتبويب ظاهر
    let accumulatedMs = 0;
    let visibleSince: number | null = document.visibilityState === 'visible' ? performance.now() : null;
    const activeSeconds = () => {
      const live = visibleSince !== null ? performance.now() - visibleSince : 0;
      return Math.min(MAX_SECONDS, Math.floor((accumulatedMs + live) / 1000));
    };

    let maxSection = 0;
    const waClicks = new Set<string>();
    let lastSent = '';

    const send = () => {
      const payload = {
        visit_id: visitId, src, device,
        active_seconds: activeSeconds(), max_section: maxSection, max_scroll_pct: maxScrollPct, wa_clicks: [...waClicks],
      };
      const key = JSON.stringify({ ...payload, visit_id: undefined });
      if (key === lastSent) return;
      lastSent = key;
      const body = JSON.stringify(payload);
      let queued = false;
      try {
        queued = typeof navigator.sendBeacon === 'function'
          && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain;charset=UTF-8' }));
      } catch {
        queued = false;
      }
      if (!queued) {
        fetch(ENDPOINT, {
          method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        }).catch(() => {});
      }
    };

    // القسم n «وصل» حين يظهر منه 40% من ارتفاعه أو 40% من ارتفاع الشاشة أيهما أصغر.
    // نحسبه من الإحداثيات عند كل تمرير: IntersectionObserver لا يستدعي إلا عند عبور عتبات نسبية ثابتة،
    // فلا يلتقط الأقسام الطويلة جداً (نسبة الظهور فيها تبقى دون العتبة التالية).
    const sections = SECTION_SELECTORS.map((s) => document.querySelector(s));
    let maxScrollPct = 0;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const vh = window.innerHeight;
      for (let i = maxSection; i < sections.length; i++) {
        const el = sections[i];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const visible = Math.min(r.bottom, vh) - Math.max(r.top, 0);
        if (visible >= Math.min(0.4 * r.height, 0.4 * vh) && visible > 0) maxSection = i + 1;
      }
      const doc = document.documentElement.scrollHeight;
      if (doc > 0) {
        const pct = Math.round(((window.scrollY + vh) / doc) * 100);
        maxScrollPct = Math.max(maxScrollPct, Math.min(100, Math.max(0, pct)));
      }
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    measure();

    const onClick = (ev: MouseEvent) => {
      const target = ev.target instanceof Element ? ev.target : null;
      const a = target?.closest('a[href]');
      if (!a) return;
      try {
        const url = new URL(a.getAttribute('href') || '', window.location.href);
        if (url.hostname !== 'wa.me' && url.hostname !== 'api.whatsapp.com') return;
        // الوسم يأتي من سطر «المصدر: {src}-{tag}» الذي يبنيه waLink؛ زر المشاركة بلا وسم فيُتجاهل
        const m = (url.searchParams.get('text') || '').match(/المصدر:\s*([a-z0-9_-]+)/i);
        if (!m) return;
        const full = m[1].toLowerCase();
        // المصدر نفسه قد يحوي شرطة (fb-b-float)، فنزيل البادئة الكاملة لا ما قبل أول شرطة
        const prefix = `${pageSrc.toLowerCase()}-`;
        const tag = full.startsWith(prefix) ? full.slice(prefix.length) : '';
        if (!TAG_RE.test(tag) || (waClicks.size >= 10 && !waClicks.has(tag))) return;
        waClicks.add(tag);
        send();
      } catch {
        // رابط غير صالح: لا شيء
      }
    };
    document.addEventListener('click', onClick, { capture: true, passive: true });

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (visibleSince !== null) {
          accumulatedMs += performance.now() - visibleSince;
          visibleSince = null;
        }
        send();
      } else if (visibleSince === null) {
        visibleSince = performance.now();
      }
    };
    const onPageHide = () => send();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);

    const first = setTimeout(send, 0);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') send();
    }, SEND_EVERY_MS);

    return () => {
      clearTimeout(first);
      clearInterval(interval);
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [pageSrc]);

  return null;
}
