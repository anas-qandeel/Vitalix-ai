'use client';

// مكوّنات واجهة صفحة الدخول فقط (زينة ورسائل دوّارة) — لا تستقبل أي شيء من منطق الدخول
// ولا تستدعي Supabase. الدوّار يُشارك حالته بين نسختي العنوان (المكتب والجوال) عبر Context
// لأن النسختين في موضعين مختلفين من الـ DOM.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import './login.css';

const DUR = 7000;

const SLIDES = [
  { tag: 'Vitalix-ai', title: 'ثماني أدوات تعمل معاً لمتابعة مرضاك', text: 'نرافقك من أول رسالة حتى يصبح النظام جزءاً من عمل صيدليتك اليومي.', icon: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z' },
  { tag: 'الأدوية المزمنة', title: 'مريضك المزمن يبقى مريضك', text: 'يحسب النظام متى سينتهي كل دواء ويخبرك قبل نفاده بأيام، فتجهّز علبته قبل أن يأتي.', icon: 'M10.5 20.5a4.95 4.95 0 0 1-7-7l10-10a4.95 4.95 0 0 1 7 7zM8.5 8.5l7 7' },
  { tag: 'الذكاء الاصطناعي', title: 'الذكاء الاصطناعي يشرح للمريض قراءاته', text: 'ملخّص موثوق بلغة بسيطة يخبر المريض هل قراءته طبيعية أم مرتفعة، تراجعه أنت ثم ترسله على واتساب باسم صيدليتك.', icon: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z' },
  { tag: 'الوزن والتغذية', title: 'صيدليتك تقدّم خدمة متابعة الوزن والتغذية', text: 'نظام غذائي وعادات يومية تناسب هدف المريض، مع مراعاة أدويته وحساسياته والحمل والإرضاع.', icon: 'M20 4c-9 0-14 4-14 10 0 2 1 4 3 5 6 2 11-3 11-15zM4 20c2-5 5-8 9-10' },
  { tag: 'بطاقة الأمان', title: 'فرص بيع أكثر، بمنتجات تناسب كل مريض', text: 'صوّر علبة أي منتج على رفّ صيدليتك، فتجهّز بطاقة أمان بمكوّناته وما فيه من مسبّبات حساسية، وتؤكّدها أنت.', icon: 'M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6zM9 12l2.2 2.2L15.5 10' },
  { tag: 'طلبات المرضى', title: 'دواء مريضك غير متوفر؟ تابعه حتى يصل', text: 'يقدّر النظام موعد وصول الطلب وينبّهك عند التأخر، وتجد رسالة المريض جاهزة عند وصوله.', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2' },
  { tag: 'سجل الوصفات', title: 'سجل وصفاتك جاهز عندما تطلبه لجنة التفتيش', text: 'سجّل كل وصفة باسم الطبيب والصيدلي، وصدّر ملف PDF يحمل اسم صيدليتك لتسلّمه للجنة التفتيش التابعة لوزارة الصحة.', icon: 'M7 3.5h7l4 4V20.5H7zM14 3.5v4h4M9.5 12.5h5M9.5 16h5' },
  { tag: 'حسابات الموظفين', title: 'كل موظف بحسابه، وكل خطوة مسجّلة باسمه', text: 'يدخل كل موظف برمز خاص من 6 أرقام، فتعرف من خدم كل مريض ومتى.', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20c.5-4 3.6-6 7.5-6s7 2 7.5 6' },
  { tag: 'أعياد الميلاد', title: 'تهنئة من صيدليتك في يوم ميلاد مريضك', text: 'بضغطة زر تصله تهنئة على واتساب من صيدليتك، فيشعر أن صيدليته تعرفه وتهتم به.', icon: 'M4 11h16v9H4zM3 8h18v3H3zM12 8v12M12 8c-1-3-4-4-5-2.5S9 8 12 8zM12 8c1-3 4-4 5-2.5S15 8 12 8z' },
];
const N = SLIDES.length;

interface CarouselCtx {
  idx: number;
  prev: number;
  paused: boolean;
  go: (i: number) => void;
  pause: () => void;
  resume: () => void;
}
const Ctx = createContext<CarouselCtx | null>(null);

function useCarousel() {
  const c = useContext(Ctx);
  if (!c) throw new Error('LoginCarouselProvider مفقود');
  return c;
}

// مؤقت واحد 7 ثوانٍ؛ يتوقف عند hover/focus ويستأنف بالزمن المتبقي. مع reduced-motion لا تشغيل تلقائي
export function LoginCarouselProvider({ children }: { children: React.ReactNode }) {
  const [idx, setIdx] = useState(0);
  const [prev, setPrev] = useState(-1);
  const [paused, setPaused] = useState(false);
  const remain = useRef(DUR);
  const started = useRef(0);

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    started.current = Date.now();
    const t = setTimeout(() => {
      remain.current = DUR;
      setPrev(idx);
      setIdx((idx + 1) % N);
    }, remain.current);
    return () => clearTimeout(t);
  }, [idx, paused]);

  const go = useCallback((i: number) => {
    remain.current = DUR;
    setPrev(idx);
    setIdx(((i % N) + N) % N);
  }, [idx]);

  const pause = useCallback(() => {
    setPaused((p) => {
      if (!p) remain.current = Math.max(400, remain.current - (Date.now() - started.current));
      return true;
    });
  }, []);
  const resume = useCallback(() => setPaused(false), []);

  return <Ctx.Provider value={{ idx, prev, paused, go, pause, resume }}>{children}</Ctx.Provider>;
}

export function LoginBackground() {
  return (
    <div className="vx-bg" aria-hidden="true">
      <span className="vx-blob vx-b1" /><span className="vx-blob vx-b2" /><span className="vx-blob vx-b3" />
      <span className="vx-blob vx-b4" /><span className="vx-blob vx-b5" /><span className="vx-grain" />
    </div>
  );
}

// شاشة التحقق/التحميل — النص يُمرَّر من الصفحة كما هو
export function LoginStatusScreen({ text }: { text: string }) {
  return (
    <div className="vx-root" dir="rtl">
      <LoginBackground />
      <div className="vx-status"><p>{text}</p></div>
    </div>
  );
}

export function LoginBrandMark() {
  return (
    <div className="vx-brandrow">
      <svg className="vx-tile" viewBox="0 0 192 192" aria-hidden="true" focusable="false">
        <rect width="192" height="192" rx="44" fill="#0F172A" />
        <path d="M37.4 51.2L90.7 156.5L120 102.8" fill="none" stroke="#fff" strokeWidth="20.6" strokeLinecap="round" strokeLinejoin="round" />
        <path className="vx-star" d="M144 41Q149.2 66.8 175 72Q149.2 77.2 144 103Q138.8 77.2 113 72Q138.8 66.8 144 41Z" fill="#0D9488" />
      </svg>
      <div className="vx-lock">
        <div className="vx-word" dir="ltr">Vitalix<b>-ai</b></div>
        <p className="vx-tagline">تابع مرضاك بذكاء</p>
      </div>
    </div>
  );
}

function Avatar({ kind }: { kind: 'a' | 'b' }) {
  return kind === 'a' ? (
    <svg className="vx-ava" viewBox="4 4 40 40" aria-hidden="true" focusable="false">
      <rect x="19.5" y="28" width="9" height="10" rx="3.5" fill="#E3A982" />
      <path d="M4 48c0-8.8 8.2-13 20-13s20 4.2 20 13z" fill="#0F766E" />
      <path d="M19 35.6l5 6 5-6" fill="none" stroke="#fff" strokeOpacity=".9" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="14.6" cy="21.6" r="2.3" fill="#E3A982" /><circle cx="33.4" cy="21.6" r="2.3" fill="#E3A982" />
      <ellipse cx="24" cy="21" rx="9.4" ry="10.8" fill="#F0C09A" />
      <path d="M14.3 19.8C13 10.8 18.2 6.6 24.2 6.6s11.4 4.2 9.5 13.2c-.6-3.6-2.2-5.7-5-6.6-3.8 1.6-8.4 1.7-12.2.5-.9 1.3-1.9 3.1-2.2 6.1z" fill="#2A211B" />
      <circle cx="20.2" cy="22" r="1.2" fill="#2A211B" /><circle cx="27.8" cy="22" r="1.2" fill="#2A211B" />
      <path d="M20.8 27q3.2 2.8 6.4 0" fill="none" stroke="#9A5B43" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ) : (
    <svg className="vx-ava" viewBox="4 4 40 40" aria-hidden="true" focusable="false">
      <path d="M11.4 22C11 11.6 16.4 6 24 6s13 5.6 12.6 16c-.2 6.2 1 10.2-1.4 14-1.7 2.7-4.6 2.9-6.2 2.9H19c-1.6 0-4.5-.2-6.2-2.9-2.4-3.8-1.2-7.8-1.4-14z" fill="#3B2A24" />
      <rect x="19.6" y="28" width="8.8" height="10" rx="3.5" fill="#E3A982" />
      <path d="M4 48c0-8.8 8.2-13 20-13s20 4.2 20 13z" fill="#E0A33A" />
      <path d="M19 35.6l5 6 5-6" fill="none" stroke="#fff" strokeOpacity=".92" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="24" cy="21.4" rx="9.1" ry="10.6" fill="#F0C09A" />
      <path d="M14.8 21.4C14.2 12.4 18.6 8.8 24 8.8s9.8 3.6 9.2 12.6c-2.2-2.4-3.9-5.6-4.9-7.6-3.7 3-8.6 4.4-13.5 7.6z" fill="#3B2A24" />
      <circle cx="20.2" cy="22.4" r="1.2" fill="#2A211B" /><circle cx="27.8" cy="22.4" r="1.2" fill="#2A211B" />
      <path d="M20.8 27.4q3.2 2.8 6.4 0" fill="none" stroke="#B0534A" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function Slot({ angle, delay, kind }: { angle: number; delay: string; kind: 'a' | 'b' }) {
  return (
    <span className="vx-slot" style={{ ['--a' as string]: `${angle}deg`, ['--dl' as string]: delay }}>
      <span className="vx-chip"><Avatar kind={kind} /></span>
    </span>
  );
}

function slideClass(k: number, idx: number, prev: number) {
  return 'vx-slide' + (k === idx ? ' is-on' : k === prev ? ' is-prev' : '');
}

const pad = (n: number) => (n < 10 ? '0' : '') + n;

// جهة العلامة (المكتب): المدار + الرسائل الدوّارة + النقاط والعدّاد
export function LoginBrandAside() {
  const { idx, prev, go, pause, resume, paused } = useCarousel();
  return (
    <aside className="vx-brand">
      <div className="vx-stage" aria-hidden="true">
        <div className="vx-orbit">
          <span className="vx-halo" />
          <div className="vx-rings">
            <div className="vx-ring vx-r0"><span className="vx-dot" /></div>
            <div className="vx-ring vx-r1"><span className="vx-dot" />
              <Slot angle={24} delay=".9s" kind="a" />
              <Slot angle={204} delay="1.15s" kind="b" />
            </div>
            <div className="vx-ring vx-r2"><span className="vx-dot" />
              <Slot angle={112} delay="1.4s" kind="b" />
              <Slot angle={292} delay="1.65s" kind="a" />
            </div>
            <div className="vx-ring vx-r3"><span className="vx-dot" /></div>
          </div>
          <div className="vx-core">
            <svg viewBox="0 0 192 192" focusable="false">
              <rect width="192" height="192" rx="44" fill="#0F172A" />
              <path className="vx-v" pathLength={1} d="M37.4 51.2L90.7 156.5L120 102.8" fill="none" stroke="#fff" strokeWidth="20.6" strokeLinecap="round" strokeLinejoin="round" />
              <path className="vx-star" d="M144 41Q149.2 66.8 175 72Q149.2 77.2 144 103Q138.8 77.2 113 72Q138.8 66.8 144 41Z" fill="#2DD4BF" />
            </svg>
          </div>
        </div>
      </div>
      <div
        className={'vx-copy' + (paused ? ' is-paused' : '')}
        style={{ ['--dur' as string]: '7s' }}
        onMouseEnter={pause}
        onMouseLeave={resume}
        onFocus={pause}
        onBlur={resume}
      >
        <div className="vx-slides">
          {SLIDES.map((s, k) => (
            <div key={s.tag} className={slideClass(k, idx, prev)} aria-hidden={k !== idx}>
              <span className="vx-tag">
                <i><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={s.icon} /></svg></i>
                {s.tag}
              </span>
              <h2>{s.title}</h2>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
        <div className="vx-nav" role="group" aria-label="رسائل عن النظام">
          {SLIDES.map((s, k) => (
            <button
              key={s.tag}
              type="button"
              className={'vx-dotb' + (k === idx ? ' is-on' : '')}
              aria-label={`عرض الرسالة ${k + 1}: ${s.tag}`}
              aria-current={k === idx}
              onClick={() => { if (k !== idx) go(k); }}
            >
              <span className="vx-dotfill" />
            </button>
          ))}
          <span className="vx-count">{pad(idx + 1)} / {pad(N)}</span>
        </div>
      </div>
    </aside>
  );
}

// العنوان الدوّار المختصر تحت البطاقة (الجوال)
export function LoginCaptionMobile() {
  const { idx, prev } = useCarousel();
  return (
    <div className="vx-copy-m" aria-live="off">
      <div className="vx-slides">
        {SLIDES.map((s, k) => (
          <div key={s.tag} className={slideClass(k, idx, prev)} aria-hidden={k !== idx}>
            <h2>{s.title}</h2>
          </div>
        ))}
      </div>
    </div>
  );
}

// فوتر خاص بصفحة الدخول — نفس نص ونفس ترتيب AppFooter.tsx (الذي لا يُعدَّل لأنه مشترك مع صفحات أخرى)
// والتغيير الوحيد: القلب صار SVG بدل رمز نصي. رابط الخصوصية مخفي افتراضياً كما في hidePrivacy، ويظهر عند showPrivacy
export function LoginFooter({ showPrivacy = false }: { showPrivacy?: boolean }) {
  return (
    <footer className="vx-foot">
      <p>
        <span style={{ direction: 'ltr', unicodeBidi: 'bidi-override' }}>
          {/* keep in sync with AppFooter.tsx */}
          Vitalix<span className="vx-foot-ai">-ai</span> — v1.4.0
        </span>
        <span>· © {new Date().getFullYear()} جميع الحقوق محفوظة</span>
        {showPrivacy && (
          <>
            <span>·</span>
            <a href="/privacy">سياسة الخصوصية</a>
          </>
        )}
      </p>
      <div className="vx-made" style={{ direction: 'ltr', unicodeBidi: 'bidi-override' }}>
        Made <svg className="vx-heart" width="11" height="11" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20.5s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.7a4.3 4.3 0 0 1 7.5 2.8c0 5.4-7.5 10-7.5 10z" fill="#F43F5E" /></svg> in <b>ΛMMΛN</b>
      </div>
    </footer>
  );
}
