'use client';
import { useState } from 'react';
type SugarPoint = { sugar_value: number; sugar_test_type: string | null; created_at: string };
const TYPE_COLOR: Record<string, string> = {
  fasting: '#1e3a8a',
  postprandial: '#a855f7',
  random: '#64748b',
};
const TYPE_LABEL: Record<string, string> = {
  fasting: 'صائم',
  postprandial: 'بعد الأكل',
  random: 'عشوائي',
};
export default function SugarHistoryChart({
  sugarHistory,
  formatDate,
}: {
  sugarHistory: SugarPoint[] | null | undefined;
  formatDate: (d: string) => string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const fmtD = (d: string) => { const t = new Date(d); return `${t.getDate()}/${t.getMonth() + 1}/${t.getFullYear()}`; };
  const points = (sugarHistory ?? []).filter(v => v.sugar_value != null).slice(-8);
  if (points.length < 2) return null;
  const W = 300, H = 70, PADX = 8, PADY = 10;
  const plotW = W - PADX * 2, plotH = H - PADY * 2;
  const values = points.map(p => Number(p.sugar_value));
  const minV = Math.min(...values), maxV = Math.max(...values);
  const range = maxV - minV || 1;
  const isFlat = maxV === minV;
  const coords = points.map((p, i) => ({
    x: PADX + (1 - i / (points.length - 1)) * plotW,
    y: isFlat ? (PADY + plotH / 2) : PADY + (1 - (Number(p.sugar_value) - minV) / range) * plotH,
    color: TYPE_COLOR[p.sugar_test_type || 'random'] || TYPE_COLOR.random,
  }));
  const first = points[0];
  const last = points[points.length - 1];
  const usedTypes = Array.from(new Set(points.map(p => p.sugar_test_type || 'random')));
  return (
    <div className="px-5 pt-3 pb-4 border-t border-slate-100">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-y-1">
        <p className="text-xs font-bold text-slate-700">سجل السكري (آخر {points.length} زيارات)</p>
        <div className="flex items-center gap-2">
          {usedTypes.map(t => (
            <span key={t} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: TYPE_COLOR[t] }} />
              <span className="text-[9px] text-slate-400">{TYPE_LABEL[t]}</span>
            </span>
          ))}
        </div>
      </div>
      <p className="text-[9px] text-slate-400 mb-2">النقاط بألوان مختلفة لأن أنواع القراءة (صائم/بعد الأكل/عشوائي) لها نطاقات طبيعية مختلفة ولا تُقارن مباشرة</p>
      <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[70px] overflow-visible" preserveAspectRatio="none" onClick={() => setActiveIndex(null)} onMouseLeave={() => setActiveIndex(null)}>
        <line x1={PADX} y1={PADY + plotH / 2} x2={W - PADX} y2={PADY + plotH / 2} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3,3" />
        {coords.map((c, i) => i > 0 && (
          <line key={`l-${i}`} x1={coords[i - 1].x} y1={coords[i - 1].y} x2={c.x} y2={c.y} stroke="#cbd5e1" strokeWidth="1.5" />
        ))}
        {coords.map((c, i) => (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r={9} fill="transparent" onMouseEnter={() => setActiveIndex(i)} onTouchStart={(e) => { e.stopPropagation(); setActiveIndex(i === activeIndex ? null : i); }} style={{ cursor: 'pointer' }} />
            <circle cx={c.x} cy={c.y} r={activeIndex === i ? 5 : 4} fill={c.color} stroke="white" strokeWidth="1.5" />
          </g>
        ))}
      </svg>
        {activeIndex !== null && (
          <div
            className="absolute pointer-events-none bg-white border border-slate-200 rounded-xl shadow-md px-3 py-1.5 text-center whitespace-nowrap"
            style={{
              left: `${(coords[activeIndex].x / W) * 100}%`,
              top: `${(coords[activeIndex].y / H) * 100}%`,
              transform: 'translate(-50%, calc(-100% - 12px))',
            }}
          >
            <div className="text-sm font-black text-slate-900 tabular-nums leading-tight">{points[activeIndex].sugar_value} mg/dL</div>
            <div className="text-[10px] font-medium leading-tight mt-0.5" style={{ color: coords[activeIndex].color }}>
              {TYPE_LABEL[points[activeIndex].sugar_test_type || 'random']}
            </div>
            <div className="text-[10px] font-medium text-slate-400 leading-tight mt-0.5">{formatDate(points[activeIndex].created_at)}</div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] font-bold text-slate-400"><span dir="ltr" className="tabular-nums inline-block">{first.sugar_value} mg/dL</span><span className="text-slate-300"> · </span><span dir="ltr" className="tabular-nums inline-block">{fmtD(first.created_at)}</span></span>
        <span className="text-[10px] font-bold text-slate-400"><span dir="ltr" className="tabular-nums inline-block">{last.sugar_value} mg/dL</span><span className="text-slate-300"> · </span><span dir="ltr" className="tabular-nums inline-block">{fmtD(last.created_at)}</span></span>
      </div>
    </div>
  );
}
