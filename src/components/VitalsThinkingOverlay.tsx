'use client';
import { useEffect, useRef, useState } from 'react';
type Props = {
  bpSystolic?: number | null;
  bpDiastolic?: number | null;
  heartRate?: number | null;
  sugarMgDl?: number | null;
  sugarType?: string | null;
  visitCount?: number;
  prevBpSys?: number | null;
  prevBpDia?: number | null;
  prevSugar?: number | null;
  patientName?: string | null;
};
export default function VitalsThinkingOverlay({ bpSystolic, bpDiastolic, heartRate, sugarMgDl, sugarType, visitCount = 0, prevBpSys, prevBpDia, prevSugar, patientName }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [phaseIdx, setPhaseIdx] = useState(0);
  // مراحل مبنية من بيانات المريض الفعلية — تعكس ما يُرسل للتحليل حقاً
  const PHASES: string[] = [
    'يقرأ القراءات الحالية…',
    visitCount > 0 ? `يقارن مع ${visitCount} زيارة سابقة…` : 'يفتح السجل الطبي…',
    'يحسب المؤشرات الاشتقاقية…',
    prevBpSys && bpSystolic ? `يرصد التغيّر منذ آخر قياس…` : 'يحلّل نمط القراءات…',
    'يزن عوامل القياس المؤثرة…',
    'يقرأ التشخيصات والأدوية المزمنة…',
    'يقرأ الحساسية وحالة الحمل والرضاعة…',
    'يصوغ الملخّص الذكي…',
    'يطابق كتالوج الصيدلية مع بطاقات الأمان…',
  ];
  // معادلات سريرية حقيقية محسوبة من قراءات هذا المريض — للعرض فقط، لا تُرسل للخادم
  const real: [string, 1 | 2 | 3][] = [];
  if (bpSystolic && bpDiastolic) {
    const map = Math.round(bpDiastolic + (bpSystolic - bpDiastolic) / 3);
    const pp = bpSystolic - bpDiastolic;
    real.push([`MAP = ${bpDiastolic} + (${bpSystolic}−${bpDiastolic})/3 ≈ ${map} mmHg`, 1]);
    real.push([`PP = ${bpSystolic} − ${bpDiastolic} = ${pp}`, 2]);
    if (prevBpSys && prevBpDia) {
      const d = bpSystolic - prevBpSys;
      real.push([`ΔSBP = ${bpSystolic} − ${prevBpSys} = ${d > 0 ? '+' : ''}${d}`, 1]);
    }
  }
  if (heartRate && bpSystolic) {
    // Shock Index = HR/SBP — مؤشر سريري حقيقي
    const si = Math.round((heartRate / bpSystolic) * 100) / 100;
    real.push([`SI = ${heartRate}/${bpSystolic} = ${si}`, 2]);
  }
  if (sugarMgDl && sugarMgDl > 0) {
    if (sugarType === 'fasting') {
      const a1c = Math.round(((sugarMgDl + 46.7) / 28.7) * 10) / 10;
      real.push([`eA1c ≈ (${sugarMgDl}+46.7)/28.7 ≈ ${a1c}%`, 1]);
      const eag = Math.round(28.7 * a1c - 46.7);
      real.push([`eAG = 28.7×${a1c} − 46.7 ≈ ${eag}`, 3]);
    }
    if (prevSugar) {
      const ds = sugarMgDl - prevSugar;
      real.push([`ΔGlu = ${ds > 0 ? '+' : ''}${ds} mg/dL`, 1]);
    }
  }
  if (visitCount > 1) real.push([`n = ${visitCount} visits → trend`, 2]);
  const GENERIC: [string, 1 | 2 | 3][] = [
    ['P(risk | x₁…xₙ)', 3], ['Σᵢ wᵢ·xᵢ + b', 3], ['argmaxθ L(θ|data)', 3], ['∇L → 0', 3],
    ['x̄ ± 1.96σ', 3], ['corr(SBP, HR)', 3], ['f: ℝⁿ → [0,1]', 3], ['∫₀ᵗ g(τ)dτ', 3],
  ];
  const pool: [string, 1 | 2 | 3][] = real.length ? [...real, ...GENERIC] : GENERIC;
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const timers: number[] = [];
    const spawn = () => {
      const [text, depth] = pool[Math.floor(Math.random() * pool.length)];
      const el = document.createElement('div');
      el.textContent = text;
      el.className = `vt-fl vt-d${depth}`;
      el.style.left = Math.random() < 0.5 ? `${2 + Math.random() * 22}%` : `${70 + Math.random() * 24}%`;
      const dur = depth === 1 ? 7 + Math.random() * 3 : depth === 2 ? 9 + Math.random() * 3 : 12 + Math.random() * 4;
      el.style.animationDuration = `${dur}s`;
      stage.appendChild(el);
      timers.push(window.setTimeout(() => el.remove(), dur * 1000 + 200));
    };
    for (let i = 0; i < 5; i++) timers.push(window.setTimeout(spawn, i * 500));
    const spawnInt = window.setInterval(spawn, 1100);
    const phaseInt = window.setInterval(() => setPhaseIdx(i => Math.min(i + 1, PHASES.length - 1)), 2000);
    for (let i = 0; i < 18; i++) {
      const s = document.createElement('div');
      s.className = 'vt-spark';
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
      stage.querySelectorAll('.vt-fl, .vt-spark').forEach(n => n.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="px-5 pt-3 pb-4">
      <style>{`
        .vt-stage{position:relative;height:320px;border-radius:14px;background:#F8FAFC;border:1px solid #E2E8F0;overflow:hidden;direction:rtl}
        .vt-fl{position:absolute;top:100%;z-index:1;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap;opacity:0;will-change:transform,opacity;pointer-events:none}
        .vt-d1{font-size:15px;color:#0F172A;animation:vt-rise linear infinite}
        .vt-d2{font-size:12px;color:#475569;animation:vt-rise-diag linear infinite}
        .vt-d3{font-size:11px;color:#94A3B8;animation:vt-rise linear infinite}
        @keyframes vt-rise{0%{transform:translateY(30px);opacity:0}12%{opacity:1}88%{opacity:1}100%{transform:translateY(-330px);opacity:0}}
        @keyframes vt-rise-diag{0%{transform:translate(0,30px);opacity:0}12%{opacity:.9}88%{opacity:.9}100%{transform:translate(-40px,-330px);opacity:0}}
        .vt-ekg{position:absolute;bottom:14px;left:0;right:0;height:44px;opacity:.5;pointer-events:none}
        .vt-ekg path{fill:none;stroke:#0D9488;stroke-width:1.5;stroke-dasharray:600;stroke-dashoffset:600;animation:vt-draw 3.2s linear infinite}
        @keyframes vt-draw{to{stroke-dashoffset:0}}
        .vt-ctr{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;pointer-events:none}
        .vt-halo{position:absolute;width:190px;height:190px;border-radius:50%;background:#E0F2FE;animation:vt-breathe 2.6s ease-in-out infinite}
        @keyframes vt-breathe{0%,100%{transform:scale(.85);opacity:.35}50%{transform:scale(1.08);opacity:.7}}
        .vt-core{position:relative;display:flex;flex-direction:column;align-items:center;gap:10px;padding:14px 20px;border-radius:16px;background:rgba(255,255,255,.8);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);border:1px solid rgba(226,232,240,.8)}
        .vt-steps{display:flex;flex-direction:column;gap:6px}
        .vt-step{display:flex;align-items:center;gap:8px;font-size:12px;color:#94A3B8;transition:color .4s}
        .vt-step.on{color:#0F172A;font-weight:700}
        .vt-step.done{color:#475569}
        .vt-dot{width:16px;height:16px;flex:none;display:flex;align-items:center;justify-content:center;color:#0D9488}
        .vt-dot span{width:7px;height:7px;border-radius:50%;background:#CBD5E1}
        .vt-step.on .vt-dot span{background:#0D9488;animation:vt-pulse 1.2s ease-in-out infinite}
        @keyframes vt-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.6)}}
        .vt-bar{width:180px;height:3px;border-radius:2px;background:#E2E8F0;overflow:hidden}
        .vt-bar::after{content:"";display:block;height:100%;width:45%;border-radius:2px;background:#0D9488;animation:vt-slide 1.8s ease-in-out infinite}
        @keyframes vt-slide{0%{transform:translateX(120%)}100%{transform:translateX(-260%)}}
        .vt-hint{font-size:12px;color:#94A3B8}
        .vt-spark{position:absolute;width:3px;height:3px;border-radius:50%;background:#0D9488;opacity:0;animation:vt-twinkle 3s ease-in-out infinite;pointer-events:none}
        @keyframes vt-twinkle{0%,100%{opacity:0;transform:scale(.5)}50%{opacity:.8;transform:scale(1.4)}}
        @media (prefers-reduced-motion: reduce){.vt-fl,.vt-spark{display:none}.vt-halo,.vt-bar::after,.vt-ekg path{animation:none}}
      `}</style>
      <div className="vt-stage" ref={stageRef} role="status" aria-live="polite">
        <svg className="vt-ekg" viewBox="0 0 600 44" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0,22 L80,22 L95,22 L102,8 L110,36 L118,22 L140,22 L200,22 L215,22 L222,6 L230,38 L238,22 L260,22 L330,22 L345,22 L352,10 L360,34 L368,22 L390,22 L460,22 L475,22 L482,7 L490,37 L498,22 L520,22 L600,22" />
        </svg>
        <div className="vt-ctr">
          <div className="vt-halo" />
          <div className="vt-core">
            <div className="vt-steps">
              {PHASES.map((p, i) => (
                <div key={p} className={`vt-step ${i < phaseIdx ? 'done' : i === phaseIdx ? 'on' : ''}`}>
                  <div className="vt-dot">
                    {i < phaseIdx ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
                    ) : <span />}
                  </div>
                  {p}
                </div>
              ))}
            </div>
            <div className="vt-bar" />
            <div className="vt-hint">عادةً 20–40 ثانية</div>
          </div>
        </div>
      </div>
    </div>
  );
}
