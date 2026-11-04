'use client';

import { useEffect } from 'react';

// عدّاد زيارات داخلي مجهول: لا كوكيز ولا تخزين لمعرّف الزيارة ولا طرف ثالث.
// يرجع null فلا يغيّر شيئاً مرئياً في الصفحة.
const ENDPOINT = '/api/welcome-beacon';
const TAG_RE = /^[a-z0-9-]{1,24}$/;
const MAX_SECONDS = 1800;
const SEND_EVERY_MS = 20000;
const SECTION_THRESHOLDS = [0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.6, 0.8, 1];
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
        active_seconds: activeSeconds(), max_section: maxSection, wa_clicks: [...waClicks],
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

    // القسم الأطول من شاشتين ونصف لا يبلغ 40% من نفسه، فيُحتسب أيضاً إن غطّى 40% من الشاشة
    const observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const n = SECTION_SELECTORS.findIndex((s) => document.querySelector(s) === e.target) + 1;
        if (n === 0 || n <= maxSection) continue;
        if (e.intersectionRatio >= 0.4 || e.intersectionRect.height >= 0.4 * window.innerHeight) {
          maxSection = n;
        }
      }
    }, { threshold: SECTION_THRESHOLDS });
    SECTION_SELECTORS.forEach((s) => {
      const el = document.querySelector(s);
      if (el) observer.observe(el);
    });

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
        const idx = full.indexOf('-');
        const tag = idx >= 0 ? full.slice(idx + 1) : '';
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
      observer.disconnect();
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [pageSrc]);

  return null;
}
