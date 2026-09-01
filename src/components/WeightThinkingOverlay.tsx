'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  weightKg?: number | null;
  heightCm?: number | null;
  ageYears?: number | null;
  gender?: string | null;
  sugarMgDl?: number | null;
  medications?: string[];
};

const PHASES = [
  'يقرأ القراءات…',
  'يحلّل الأدوية والتفاعلات…',
  'يطابق مع كتالوج الصيدلية…',
  'يصوغ الخطة الغذائية…',
  'يراجع الملاءمة الطبية…',
  'يُعدّ ملخّص الصيدلاني…',
];

const GENERIC: [string, 1 | 2 | 3][] = [
  ['ΔW/Δt ≤ 0.5–1 kg/wk', 2], ['Fiber ↑ → glucose ↓', 2], ['goal = 5% × W₀', 2],
  ['∂Risk/∂BMI', 3], ['Σᵢ wᵢ·xᵢ', 3], ['P(DDI | Rx)', 3], ['argmax θ', 3], ['∇L(θ)', 3], ['∫ intake dt', 3], ['x̄, σ²', 3],
];

export default function WeightThinkingOverlay({ weightKg, heightCm, ageYears, gender, sugarMgDl, medications = [] }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [phaseIdx, setPhaseIdx] = useState(0);

  // معادلات صيدلانية سريرية حقيقية محسوبة من بيانات المريض الحالي — للعرض فقط، لا تُرسل للخادم ولا تؤثر على التحليل
  const real: [string, 1 | 2 | 3][] = [];
  if (weightKg && heightCm) {
    const hM = heightCm / 100;
    const bmi = Math.round((weightKg / (hM * hM)) * 10) / 10;
    real.push([`BMI = ${weightKg} ÷ ${hM.toFixed(2)}² ≈ ${bmi}`, 1]);
    real.push([`goal = 5% × ${weightKg} = ${Math.round(weightKg * 0.05 * 10) / 10} kg`, 2]);
    if (ageYears) {
      // Mifflin-St Jeor: BMR = 10W + 6.25H − 5A + (5 ذكر | −161 أنثى)
      const isMale = gender === 'male' || gender === 'ذكر';
      const bmr = Math.round(10 * weightKg + 6.25 * heightCm - 5 * ageYears + (isMale ? 5 : -161));
      const tdee = Math.round(bmr * 1.375);
      real.push([`BMR = 10×${weightKg} + 6.25×${heightCm} − 5×${ageYears} ${isMale ? '+ 5' : '− 161'}`, 1]);
      real.push([`BMR ≈ ${bmr} kcal`, 1]);
      real.push([`TDEE = ${bmr} × 1.375 ≈ ${tdee}`, 2]);
      real.push([`target ≈ ${tdee} − 500 = ${tdee - 500} kcal/d`, 1]);
    }
  }
  if (sugarMgDl && sugarMgDl > 0) {
    // ADAG: HbA1c ≈ (FPG + 46.7) / 28.7
    const a1c = Math.round(((sugarMgDl + 46.7) / 28.7) * 10) / 10;
    real.push([`HbA1c ≈ (${sugarMgDl} + 46.7) / 28.7 ≈ ${a1c}%`, 2]);
  }
  for (const m of medications.slice(0, 4)) real.push([`${m} ✓`, 2]);
  const pool = real.length ? [...real, ...real, ...GENERIC] : GENERIC;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const timers: number[] = [];
    const spawn = () => {
      const [text, depth] = pool[Math.floor(Math.random() * pool.length)];
      const el = document.createElement('div');
      el.textContent = text;
      el.className = `wt-fl wt-d${depth}`;
      el.style.left = `${4 + Math.random() * 82}%`;
      const dur = depth === 1 ? 7 + Math.random() * 3 : depth === 2 ? 9 + Math.random() * 3 : 12 + Math.random() * 4;
      el.style.animationDuration = `${dur}s`;
      stage.appendChild(el);
      timers.push(window.setTimeout(() => el.remove(), dur * 1000 + 200));
    };
    for (let i = 0; i < 10; i++) timers.push(window.setTimeout(spawn, i * 350));
    const spawnInt = window.setInterval(spawn, 520);
    const phaseInt = window.setInterval(() => setPhaseIdx(i => (i + 1) % PHASES.length), 2800);
    for (let i = 0; i < 18; i++) {
      const s = document.createElement('div');
      s.className = 'wt-spark';
      s.style.left = `${Math.random() * 100}%`;
      s.style.top = `${Math.random() * 100}%`;
      s.style.animationDelay = `${Math.random() * 3}s`;
      s.style.animationDuration = `${2 + Math.random() * 3}s`;
      stage.appendChild(s);
    }
    return () => {
      window.clearInterval(spawnInt);
      window.clearInterval(phaseInt);
      timers.forEach(t => window.clearTimeout(t));
      stage.querySelectorAll('.wt-fl, .wt-spark').forEach(n => n.remove());
    };
    // pool يُعاد بناؤه كل render لكن محتواه ثابت خلال الانتظار — لا نضيفه للاعتماديات عمداً
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="px-5 pt-3 pb-4 border-t border-slate-100">
      <style>{`
        .wt-stage{position:relative;height:320px;border-radius:14px;background:#F8FAFC;border:1px solid #E2E8F0;overflow:hidden;direction:rtl}
        .wt-fl{position:absolute;top:100%;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap;opacity:0;will-change:transform,opacity;pointer-events:none}
        .wt-d1{font-size:15px;color:#0F172A;animation:wt-rise linear infinite}
        .wt-d2{font-size:12px;color:#475569;animation:wt-rise-diag linear infinite}
        .wt-d3{font-size:11px;color:#94A3B8;animation:wt-rise linear infinite}
        @keyframes wt-rise{0%{transform:translateY(30px);opacity:0}12%{opacity:1}88%{opacity:1}100%{transform:translateY(-330px);opacity:0}}
        @keyframes wt-rise-diag{0%{transform:translate(0,30px);opacity:0}12%{opacity:.9}88%{opacity:.9}100%{transform:translate(-40px,-330px);opacity:0}}
        .wt-ctr{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;pointer-events:none}
        .wt-halo{position:absolute;width:190px;height:190px;border-radius:50%;background:#E0F2FE;animation:wt-breathe 2.6s ease-in-out infinite}
        @keyframes wt-breathe{0%,100%{transform:scale(.85);opacity:.35}50%{transform:scale(1.08);opacity:.7}}
        .wt-core{position:relative;display:flex;flex-direction:column;align-items:center;gap:12px;padding:18px 28px;border-radius:16px;background:rgba(255,255,255,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);border:1px solid rgba(226,232,240,.8)}
        .wt-phase{font-size:16px;color:#0F172A;font-weight:700;min-height:22px;animation:wt-fade .5s ease}
        @keyframes wt-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        .wt-bar{width:180px;height:3px;border-radius:2px;background:#E2E8F0;overflow:hidden}
        .wt-bar::after{content:"";display:block;height:100%;width:45%;border-radius:2px;background:#0D9488;animation:wt-slide 1.8s ease-in-out infinite}
        @keyframes wt-slide{0%{transform:translateX(120%)}100%{transform:translateX(-260%)}}
        .wt-hint{font-size:12px;color:#94A3B8}
        .wt-spark{position:absolute;width:3px;height:3px;border-radius:50%;background:#0D9488;opacity:0;animation:wt-twinkle 3s ease-in-out infinite;pointer-events:none}
        @keyframes wt-twinkle{0%,100%{opacity:0;transform:scale(.5)}50%{opacity:.8;transform:scale(1.4)}}
        @media (prefers-reduced-motion: reduce){.wt-fl,.wt-spark{display:none}.wt-halo,.wt-bar::after{animation:none}}
      `}</style>
      <div className="wt-stage" ref={stageRef} role="status" aria-live="polite">
        <div className="wt-ctr">
          <div className="wt-halo" />
          <div className="wt-core">
            <div className="wt-phase" key={phaseIdx}>{PHASES[phaseIdx]}</div>
            <div className="wt-bar" />
            <div className="wt-hint">عادةً ٢٠–٤٠ ثانية</div>
          </div>
        </div>
      </div>
    </div>
  );
}
