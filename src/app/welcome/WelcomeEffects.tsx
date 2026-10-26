/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
'use client';

import { useEffect } from 'react';

// نسخة حرفية من سكربت النموذج المعتمد (تحسين تدريجي: المحتوى كله في HTML الخادم) ملفوفة بتنظيف كامل.
// أسطر واتساب الثابتة حُذفت لأن الروابط تُحقن من الخادم عبر waLink. تعطيل فحص الأنواع مقصود
// كي تبقى المنطقية حرفية بلا إعادة كتابة.
/* Vitalix-ai landing — v2. Progressive enhancement: every word of content is already in the HTML.
   JS adds: reveal-on-scroll, sequenced demo animations, hero "return paths", copy feedback. */
function boot(): () => void {
  const root = document.querySelector<HTMLElement>('.vx-welcome');
  if (!root) return () => {};
  // نتتبّع كل مؤقّت وإطار حركة ومراقب وطبقة قصاصات كي يزيلها التنظيف كلها
  const timers = new Set<number>();
  const frames = new Set<number>();
  const observers: IntersectionObserver[] = [];
  const layers = new Set<HTMLElement>();
  const setTimeout = (fn: () => void, ms?: number) => { const id = window.setTimeout(fn, ms); timers.add(id); return id; };
  const requestAnimationFrame = (fn: FrameRequestCallback) => { const id = window.requestAnimationFrame(fn); frames.add(id); return id; };
  const IO = (cb: IntersectionObserverCallback, opts?: IntersectionObserverInit) => { const o = new IntersectionObserver(cb, opts); observers.push(o); return o; };
  const $ = (s, c = root) => c.querySelector(s);
  const $$ = (s, c = root) => [...c.querySelectorAll(s)];
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)');
  const HAS_IO = 'IntersectionObserver' in window;
  const NS = 'http://www.w3.org/2000/svg';

  if (HAS_IO) root.classList.add('vx-js');

  /* ---- helpers ---- */
  const html = (str) => { const t = document.createElement('template'); t.innerHTML = str.trim(); return t.content.firstElementChild; };
  const CHECK = '<span class="vx-chk" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>';
  function seq(selector, scope, start = 0, d0 = 150) {
    $$(selector, scope).forEach((el, i) => {
      el.classList.add('vx-seq');
      el.style.setProperty('--s', String(start + i));
      el.style.setProperty('--d0', d0 + 'ms');
    });
  }
  function countText(el, from, dur, delay) {
    if (!el || RM.matches) return;
    const full = el.textContent;
    const nums = [...full.matchAll(/\d+(?:\.\d+)?/g)];
    if (!nums.length) return;
    const finals = nums.map(m => parseFloat(m[0]));
    const decs = nums.map(m => (m[0].split('.')[1] || '').length);
    const starts = from || finals.map(() => 0);
    const render = (e) => {
      let out = '', last = 0;
      nums.forEach((m, i) => {
        out += full.slice(last, m.index) + (starts[i] + (finals[i] - starts[i]) * e).toFixed(decs[i]);
        last = m.index + m[0].length;
      });
      el.textContent = out + full.slice(last);
    };
    render(0);
    const t0 = performance.now() + delay;
    const tick = (now) => {
      const t = Math.min(1, Math.max(0, (now - t0) / dur));
      if (t >= 1) { el.textContent = full; return; }
      render(1 - Math.pow(1 - t, 3));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  function burst(host) {
    if (RM.matches || !host) return;
    const r = host.getBoundingClientRect();
    const layer = document.createElement('div');
    layer.setAttribute('aria-hidden', 'true');
    layer.style.cssText = 'position:fixed;left:' + (r.left + r.width / 2) + 'px;top:' + (r.top + r.height / 2) + 'px;width:0;height:0;pointer-events:none;z-index:95';
    document.body.appendChild(layer);
    layers.add(layer);
    const cols = ['#5EEAD4', '#E0A33A', '#FFFFFF', '#FF9B85', '#0D9488'];
    for (let i = 0; i < 28; i++) {
      const s = document.createElement('i');
      s.style.cssText = 'position:absolute;width:8px;height:12px;border-radius:2px;background:' + cols[i % 5];
      layer.appendChild(s);
      const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 130;
      s.animate([
        { transform: 'translate(0,0) rotate(0)', opacity: 1 },
        { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d - 60}px) rotate(${Math.random() * 540}deg)`, opacity: 1, offset: .6 },
        { transform: `translate(${Math.cos(a) * d * 1.1}px,${Math.sin(a) * d + 130}px) rotate(900deg)`, opacity: 0 }
      ], { duration: 1200 + Math.random() * 600, easing: 'cubic-bezier(.2,.7,.3,1)' });
    }
    setTimeout(() => layer.remove(), 1900);
  }

  /* ---- Demo scaffolding: decorative, aria-hidden pieces injected only by JS ---- */
  function setupDemos() {
    // 1) chronic medication: "days left" bars drain to their real value
    const refill = $('.vx-refill-demo');
    if (refill) {
      const widths = ['3%', '12%', '40%'];
      $$('.vx-record', refill).forEach((rec, i) => {
        rec.appendChild(html('<span class="vx-life" aria-hidden="true"><b style="--w:' + widths[i] + '"></b></span>'));
      });
      seq('.vx-record', refill, 0, 120);
      seq('.vx-stock p', refill, 3, 120);
      $$('.vx-record', refill).forEach((rec, i) => rec.querySelector('.vx-life').style.setProperty('--s', String(i)));
    }
    // 2) readings: ECG trace, typing dots, rows
    const read = $('.vx-readings-demo');
    if (read) {
      const panel = $('[data-target="a"]', read);
      if (panel) panel.appendChild(html('<svg class="vx-ecg" viewBox="0 0 400 60" aria-hidden="true"><path pathLength="1" style="stroke-width:2" d="M0 36 H70 l7-5 7 5 H118 l8-3 8 3 H168 l9-28 12 50 10-40 7 18 H300 l8-4 8 4 H400"/></svg>'));
      seq('.vx-metrics > div', read, 0, 150);
      seq('.vx-ask', read, 3, 150);
      seq('.vx-review', read, 4, 150);
      const bubble = $('.vx-message-bubble', read);
      if (bubble) {
        const typing = html('<div class="vx-typing" hidden aria-hidden="true"><i></i><i style="animation-delay:.15s"></i><i style="animation-delay:.3s"></i></div>');
        bubble.parentNode.insertBefore(typing, bubble);
        bubble.classList.add('vx-seq'); bubble.style.setProperty('--s', '0'); bubble.style.setProperty('--d0', '2000ms');
        read._typing = typing;
      }
      seq('.vx-pdf tbody tr', read, 0, 2600);
    }
    // 3) weight: history line + dot
    const weight = $('.vx-weight-demo');
    if (weight) {
      const track = $('.vx-weight-track', weight);
      if (track) track.parentNode.insertBefore(html(
        '<svg class="vx-wchart" viewBox="0 0 300 70" aria-hidden="true"><defs><linearGradient id="vx-wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E0A33A" stop-opacity=".30"/><stop offset="1" stop-color="#E0A33A" stop-opacity="0"/></linearGradient></defs>' +
        '<path class="vx-warea" d="M6 10 C50 12 70 26 112 30 S190 46 230 50 S272 56 294 58 L294 70 L6 70Z"/>' +
        '<path class="vx-wline" pathLength="1" d="M6 10 C50 12 70 26 112 30 S190 46 230 50 S272 56 294 58"/>' +
        '<circle class="vx-wdot" cx="294" cy="58" r="5"/></svg>'), track);
      seq('.vx-weight-grid > div', weight, 0, 150);
      seq('.vx-patient-phone .vx-meal', weight, 0, 700);
    }
    // 4) catalog: scanner sweeps the box, safety cells + matches pop in
    const cat = $('.vx-catalog-demo');
    if (cat) {
      const head = $('.vx-product-head', cat);
      if (head) head.appendChild(html('<i class="vx-scan" aria-hidden="true"></i>'));
      seq('.vx-safety-grid > div', cat, 0, 1300);
      seq('.vx-match-row', cat, 0, 2300);
    }
    // 5) requests
    const orders = $('.vx-orders-demo');
    if (orders) { seq('.vx-record', orders, 0, 150); seq('.vx-message-bubble', orders, 3, 150); }
    // 6) prescription register
    const rx = $('.vx-rx-demo');
    if (rx) { seq('.vx-record', rx, 0, 150); seq('.vx-pdf tbody tr', rx, 0, 1200); }
    // 7) team: events slide in, PIN dots fill, then a check lands
    const team = $('.vx-team-demo');
    if (team) {
      seq('.vx-event', team, 0, 150);
      $$('.vx-dots i', team).forEach((d, i) => d.style.setProperty('--s', String(i)));
      const pin = $('.vx-pin', team);
      if (pin) pin.appendChild(html(CHECK));
    }
    // 8) birthdays
    const bd = $('.vx-birth-demo');
    if (bd) {
      seq('.vx-birthday-row', bd, 0, 150);
      seq('.vx-message', bd, 2, 150);
      $$('.vx-send', bd).forEach(btn => {
        btn.addEventListener('click', () => {
          if (btn.classList.contains('vx-sent')) return;
          btn.classList.add('vx-sent');
          const t = btn.querySelector('span');
          if (t) t.textContent = 'أُرسلت';
          burst(btn);
        });
      });
    }
    // AI protocol check marks
    $$('.vx-protocol li').forEach(li => li.appendChild(html(CHECK)));
    // boundary sentence: highlight the key clause only
    const strong = $('.vx-boundary strong');
    if (strong) {
      const bdi = strong.querySelector('bdi');
      const tn = bdi && bdi.nextSibling;
      if (tn && tn.nodeType === 3) {
        const i = tn.nodeValue.indexOf('.');
        if (i > 0) {
          const span = document.createElement('span');
          span.className = 'vx-hl';
          const first = document.createTextNode(tn.nodeValue.slice(0, i + 1));
          tn.nodeValue = tn.nodeValue.slice(i + 1);
          strong.insertBefore(span, bdi);
          span.append(bdi, first);
        }
      }
    }
  }

  function onPlay(stack) {
    const c = stack.classList;
    if (c.contains('vx-readings-demo')) {
      $$('.vx-metrics strong span', stack).forEach((el, i) => countText(el, null, 1300, 250 + i * 130));
      const typing = stack._typing || $('.vx-typing', stack);
      if (typing) {
        setTimeout(() => { typing.hidden = false; }, 900);
        setTimeout(() => { typing.hidden = true; }, 1950);
      }
    } else if (c.contains('vx-weight-demo')) {
      const cells = $$('.vx-weight-grid strong span', stack);
      countText(cells[1], [92.4], 1700, 500);
      countText($('.vx-weight-change span', stack), [0], 1700, 500);
    } else if (c.contains('vx-birth-demo')) {
      setTimeout(() => burst($('.vx-panel-title', stack)), 900);
    }
  }

  /* ---- Reveal-on-scroll: staggered, one-shot ---- */
  function setupReveals() {
    const groups = [
      ['.vx-section-head > *'], ['.vx-tools-intro .vx-section-wrap > *'], ['.vx-ai .vx-section-wrap > .vx-overline'], ['.vx-ai-heading > *'],
      ['.vx-why-item'], ['.vx-feature-copy > *'], ['.vx-demo-area', 's'], ['.vx-protocol'],
      ['.vx-founded-visual', 's'], ['.vx-founded > div:last-child > *'], ['.vx-specs li'], ['.vx-boundary'],
      ['.vx-start .vx-section-wrap > :not(ol)'], ['.vx-start-list li'],
      ['.vx-contact-header > *'], ['.vx-offer-benefits li'], ['.vx-contact-cta'], ['.vx-offer-note'], ['.vx-contact-card', 's']
    ];
    const seen = new Set();
    groups.forEach(([sel, mode]) => {
      const counts = new Map();
      $$(sel).forEach(el => {
        if (seen.has(el)) return; seen.add(el);
        const p = el.parentElement; const n = counts.get(p) || 0; counts.set(p, n + 1);
        el.setAttribute('data-r', mode || '');
        el.style.setProperty('--i', String(Math.min(n, 6)));
      });
    });
    const io = IO(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const el = e.target; io.unobserve(el);
        el.classList.add('vx-in');
        setTimeout(() => { el.removeAttribute('data-r'); el.style.removeProperty('--i'); }, 1800);
      });
    }, { rootMargin: '0px 0px -3% 0px', threshold: .04 });
    $$('[data-r]').forEach(el => io.observe(el));

    const playIO = IO(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const el = e.target; playIO.unobserve(el);
        el.classList.add('vx-play');
        if (el.classList.contains('vx-stack')) onPlay(el);
      });
    }, { threshold: .25 });
    $$('.vx-stack, .vx-protocol, .vx-start-list, .vx-boundary').forEach(el => playIO.observe(el));
  }

  /* ---- Scene buttons: switch the highlighted panel, replay a soft pulse ---- */
  $$('.vx-feature').forEach(section => {
    const demo = $('.vx-stack', section);
    const buttons = $$('.vx-switch', section);
    if (!demo || !buttons.length) return;
    demo.dataset.focus = buttons[0].dataset.scene;
    buttons.forEach(button => button.addEventListener('click', () => {
      const next = button.dataset.scene;
      demo.dataset.focus = next;
      buttons.forEach(b => {
        const pressed = b === button;
        b.classList.toggle('is-current', pressed);
        b.setAttribute('aria-pressed', String(pressed));
      });
      const panel = $('[data-target="' + next + '"]', demo);
      if (panel) { panel.classList.remove('vx-flash'); void panel.offsetWidth; panel.classList.add('vx-flash'); setTimeout(() => panel.classList.remove('vx-flash'), 1100); }
    }));
  });

  /* ---- Hero: patients travel their path into the pharmacy; the matching row lights up ---- */
  function heroPaths() {
    const map = $$('.vx-map').find(m => m.offsetParent !== null);
    if (!map || RM.matches) return;
    const paths = $$('path.vx-path', map), travs = $$('.vx-trav', map), nodes = $$('.vx-node', map);
    const rows = [$('.vx-demo-row-a'), $('.vx-demo-row-b'), $('.vx-demo-row-c')];
    const lens = paths.map(p => p.getTotalLength());
    const DUR = 2500, GAP = 1500, CYCLE = DUR + GAP * (paths.length - 1) + 3200;
    const state = paths.map(() => 0);
    let t0 = null, visible = true;
    IO(es => { visible = es[0].isIntersecting; }, { threshold: 0 }).observe(map);
    const ease = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    function ping(row) { if (!row) return; row.classList.remove('vx-ping'); void row.offsetWidth; row.classList.add('vx-ping'); setTimeout(() => row.classList.remove('vx-ping'), 1600); }
    function frame(ts) {
      requestAnimationFrame(frame);
      if (!visible || document.hidden) { t0 = null; return; }
      if (t0 === null) t0 = ts + 1300;
      const t = ts - t0;
      if (t < 0) return;
      const tt = t % CYCLE;
      paths.forEach((p, i) => {
        const local = (tt - i * GAP) / DUR, el = travs[i];
        if (local > 0 && local < 1) {
          if (!state[i]) { state[i] = 1; nodes[i].classList.remove('vx-go'); void nodes[i].offsetWidth; nodes[i].classList.add('vx-go'); }
          const pt = p.getPointAtLength(lens[i] * ease(local));
          el.style.left = pt.x + '%'; el.style.top = pt.y + '%';
          el.style.opacity = local < .08 ? String(local / .08) : local > .9 ? String((1 - local) / .1) : '1';
        } else {
          el.style.opacity = '0';
          if (state[i] && local >= 1) { state[i] = 0; ping(rows[i]); }
          else if (local <= 0) state[i] = 0;
        }
      });
    }
    requestAnimationFrame(frame);
  }

  /* ---- One shared scroll rAF: float button, header, progress, parallax. Native scroll untouched. ---- */
  const floatButton = $('.vx-float-wa');
  const contact = $('#contact');
  const heroMap = $('.vx-map-d');
  const heroScreen = $('.vx-hero-screen');
  let queued = false;
  function updateOnScroll() {
    queued = false;
    const y = window.scrollY || 0;
    const vh = window.innerHeight;
    const max = Math.max(1, document.documentElement.scrollHeight - vh);
    root.style.setProperty('--sp', Math.min(1, y / max).toFixed(4));
    root.classList.toggle('vx-scrolled', y > 12);
    if (floatButton && contact) {
      const top = contact.getBoundingClientRect().top;
      floatButton.classList.toggle('vx-active', y > vh * .82 && top > vh * .76);
    }
    updateNav(vh);
    if (!RM.matches) {
      const drift = Math.min(y, 900);
      if (heroMap) heroMap.style.setProperty('--map-drift', (drift * -.042).toFixed(1) + 'px');
      if (heroScreen) heroScreen.style.setProperty('--screen-y', (drift * -.018).toFixed(1) + 'px');
    }
  }
  /* ---- Tool navigation: highlight the chapter under a probe line. Computed from layout on every scroll frame
         (IntersectionObserver rootMargin is ignored inside cross-origin iframes, e.g. previews, so it can't be trusted). ---- */
  const toolNav = $('.vx-tool-nav');
  const navLinks = $$('.vx-tool-nav a');
  const chapters = $$('[data-tool]');
  let activeChapter = null;
  function updateNav(vh) {
    if (!toolNav || !chapters.length) return;
    const navBottom = Math.max(toolNav.getBoundingClientRect().bottom, 0);
    const probe = Math.min(navBottom, 160) + Math.max(40, (vh - 160) * .18);
    let current = null;
    for (const ch of chapters) {
      const r = ch.getBoundingClientRect();
      if (r.top <= probe && r.bottom > probe) { current = ch; break; }
    }
    if (current === activeChapter) return;
    activeChapter = current;
    navLinks.forEach(link => {
      const on = current && link.getAttribute('href') === '#' + current.id;
      if (on) {
        link.setAttribute('aria-current', 'true');
        const a = link.getBoundingClientRect(), b = toolNav.getBoundingClientRect();
        toolNav.scrollBy({ left: (a.left + a.width / 2) - (b.left + b.width / 2), behavior: RM.matches ? 'auto' : 'smooth' });
      } else link.removeAttribute('aria-current');
    });
  }

  const scrollRequested = () => { if (!queued) { queued = true; requestAnimationFrame(updateOnScroll); } };
  window.addEventListener('scroll', scrollRequested, { passive: true });
  window.addEventListener('resize', scrollRequested, { passive: true });
  const cleanupListeners = () => {
    window.removeEventListener('scroll', scrollRequested);
    window.removeEventListener('resize', scrollRequested);
  };
  updateOnScroll();

  /* ---- Copy buttons: Clipboard API + fallback, visible confirmation on the button and a toast ---- */
  const toast = $('.vx-toast');
  let toastTimer = 0;
  function feedback(str) {
    if (!toast) return;
    toast.textContent = str;
    toast.classList.add('vx-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('vx-show'), 2600);
  }
  function fallbackCopy(element, text) {
    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', '');
    input.style.cssText = 'position:absolute;left:-10000px;top:0';
    root.appendChild(input);
    input.select();
    let ok = false;
    try { ok = !!document.execCommand('copy'); } catch (err) { ok = false; }
    input.remove();
    if (!ok && element && window.getSelection) {
      const range = document.createRange();
      range.selectNodeContents(element);
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
    }
    return ok;
  }
  $$('[data-copy]').forEach(button => {
    const label = button.querySelector('.vx-copy-t');
    const original = label ? label.textContent : '';
    button.addEventListener('click', async () => {
      const source = $('#' + button.dataset.copy);
      if (!source) return;
      const text = source.textContent.trim();
      let copied = false;
      try {
        if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); copied = true; }
      } catch (err) { copied = false; }
      if (!copied) copied = fallbackCopy(source, text);
      feedback(copied ? 'تم النسخ' : 'تم تحديد النص؛ انسخه من جهازك');
      if (label) {
        button.classList.toggle('vx-copied', copied);
        label.textContent = copied ? 'تم النسخ' : 'حدّد وانسخ';
        setTimeout(() => { button.classList.remove('vx-copied'); label.textContent = original; }, 2000);
      }
    });
  });

  /* ---- Boot ---- */
  setupDemos();
  if (HAS_IO) setupReveals();
  heroPaths();
  const heroCount = $('[data-count]');
  if (heroCount) countText(heroCount, [0], 900, 1000);

  return () => {
    cleanupListeners();
    observers.forEach(o => o.disconnect());
    frames.forEach(id => window.cancelAnimationFrame(id));
    timers.forEach(id => window.clearTimeout(id));
    layers.forEach(l => l.remove());
  };
}

export default function WelcomeEffects() {
  useEffect(() => {
    // التأجيل يمنع ازدواج التشغيل في الوضع الصارم: التشغيل الأول يُلغى مؤقّته قبل أن يعمل
    let dispose: (() => void) | undefined;
    const t = window.setTimeout(() => { dispose = boot(); }, 0);
    return () => {
      window.clearTimeout(t);
      dispose?.();
    };
  }, []);

  return null;
}
