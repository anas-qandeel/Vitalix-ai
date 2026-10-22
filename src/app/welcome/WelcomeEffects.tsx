'use client';

import { useEffect } from 'react';

// السلوك الوحيد الذي يحتاج المتصفح: نسخ الهاتف والبريد، وإخفاء زر واتساب العائم عند ظهور قسم التواصل.
// الصفحة نفسها خادمية، فنتعامل مع عناصرها عبر DOM مباشرة ونفكّ كل شيء عند الخروج.
export default function WelcomeEffects() {
  useEffect(() => {
    const cleanups: Array<() => void> = [];

    // الصنف vx-js يفعّل الحالات الابتدائية للحركة في CSS؛ بدون JavaScript تبقى الصفحة كاملة الظهور
    const root = document.querySelector<HTMLElement>('.vx-welcome');
    root?.classList.add('vx-js');
    cleanups.push(() => root?.classList.remove('vx-js'));

    // كل عنصر توضيحي (شاشة/رسالة/ملف/هاتف) يُشغَّل بمفرده عند ظهوره، كي لا تبدأ حركة السفلي قبل أن يصل إليه الزائر
    const arts = document.querySelectorAll<HTMLElement>(
      '.vx-welcome .module-art > .screen, .vx-welcome .module-art > .chat, .vx-welcome .module-art > .doc, .vx-welcome .module-art > .phone',
    );
    if ('IntersectionObserver' in window) {
      const artIo = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (!e.isIntersecting) return;
            e.target.classList.add('is-in');
            artIo.unobserve(e.target);
          });
        },
        { threshold: 0.35, rootMargin: '0px 0px -12% 0px' },
      );
      arts.forEach((el) => artIo.observe(el));
      cleanups.push(() => artIo.disconnect());
    } else {
      arts.forEach((el) => el.classList.add('is-in'));
    }

    document.querySelectorAll<HTMLButtonElement>('.vx-welcome [data-copy]').forEach((btn) => {
      const onClick = () => {
        const label = btn.querySelector('.copy-label');
        const done = () => {
          if (label) label.textContent = 'تم النسخ';
          btn.classList.add('is-done');
          setTimeout(() => {
            if (label) label.textContent = 'نسخ';
            btn.classList.remove('is-done');
          }, 1800);
        };
        // إن فشل الحافظ نحدد النص ليتمكن المستخدم من نسخه يدوياً
        const selectIt = () => {
          const el = document.getElementById(btn.getAttribute('aria-controls') || '');
          if (!el) return;
          const r = document.createRange();
          r.selectNodeContents(el);
          const s = window.getSelection();
          s?.removeAllRanges();
          s?.addRange(r);
        };
        try {
          navigator.clipboard.writeText(btn.getAttribute('data-copy') || '').then(done, selectIt);
        } catch {
          selectIt();
        }
      };
      btn.addEventListener('click', onClick);
      cleanups.push(() => btn.removeEventListener('click', onClick));
    });

    const fab = document.querySelector<HTMLElement>('.vx-welcome .wa-float');
    const contact = document.getElementById('contact');
    if (fab && contact && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            const away = e.isIntersecting;
            fab.classList.toggle('is-away', away);
            fab.setAttribute('aria-hidden', away ? 'true' : 'false');
            fab.tabIndex = away ? -1 : 0;
          });
        },
        { threshold: 0.15 },
      );
      io.observe(contact);
      cleanups.push(() => io.disconnect());
    }

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return null;
}
