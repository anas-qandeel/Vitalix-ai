'use client';

import { useState } from 'react';

type WeightPoint = { weight: number; created_at: string };

export default function WeightHistoryChart({
  weightHistory,
  formatDate,
}: {
  weightHistory: WeightPoint[] | null | undefined;
  formatDate: (d: string) => string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const points = (weightHistory ?? []).filter(v => v.weight != null).slice(-8);
  if (points.length < 2) return null;

  const W = 300, H = 70, PADX = 8, PADY = 10;
  const plotW = W - PADX * 2, plotH = H - PADY * 2;
  const weights = points.map(p => Number(p.weight));
  const minW = Math.min(...weights), maxW = Math.max(...weights);
  const range = maxW - minW || 1;
  const isFlat = maxW === minW;
  const coords = points.map((p, i) => ({
    x: PADX + (1 - i / (points.length - 1)) * plotW,
    y: isFlat ? (PADY + plotH / 2) : PADY + (1 - (Number(p.weight) - minW) / range) * plotH,
  }));

  let path = `M ${coords[0].x},${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i === 0 ? i : i - 1];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2 < coords.length ? i + 2 : i + 1];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }

  const first = points[0];
  const last = points[points.length - 1];
  const improved = Number(first.weight) > Number(last.weight);
  const diff = Number(last.weight) - Number(first.weight);
  const lineColor = diff === 0 ? '#64748B' : improved ? '#1D9E75' : '#E9A63A';
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const diffLabel = `${diff > 0 ? '+' : diff < 0 ? '-' : ''}${fmt(Math.abs(diff))} كغ`;

  return (
    <div className="px-5 pt-3 pb-4 border-t border-slate-100">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-slate-700">سجل الوزن</p>
        <span className="text-xs font-black tabular-nums" style={{ color: lineColor }}>
          {diff === 0 ? 'مستقر' : `${improved ? '▼ ' : '▲ '}${diffLabel}`}
        </span>
      </div>
      <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[70px] overflow-visible" preserveAspectRatio="none" onClick={() => setActiveIndex(null)} onMouseLeave={() => setActiveIndex(null)}>
        <defs>
          <filter id="weightGlow" x="-30%" y="-60%" width="160%" height="220%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path d={path} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" filter={diff === 0 ? undefined : "url(#weightGlow)"} />
        {coords.map((c, i) => (
          <g key={i}>
            <circle
              cx={c.x} cy={c.y} r={7}
              fill="transparent"
              onMouseEnter={() => setActiveIndex(i)}
              onTouchStart={(e) => { e.stopPropagation(); setActiveIndex(i === activeIndex ? null : i); }}
              style={{ cursor: 'pointer' }}
            />
            <circle cx={c.x} cy={c.y} r={activeIndex === i ? 3.5 : 0} fill={lineColor} />
          </g>
        ))}
      </svg>
        {activeIndex !== null && (
          <div
            className="absolute pointer-events-none bg-white border border-slate-200 rounded-xl shadow-md px-3 py-1.5 text-center whitespace-nowrap"
            style={{
              left: `${(coords[activeIndex].x / W) * 100}%`,
              top: `${(coords[activeIndex].y / H) * 100}%`,
              transform: 'translate(-50%, calc(-100% - 10px))',
            }}
          >
            <div className="text-sm font-black text-slate-900 tabular-nums leading-tight">{points[activeIndex].weight} كغ</div>
            <div className="text-[10px] font-medium text-slate-400 leading-tight mt-0.5">{formatDate(points[activeIndex].created_at)}</div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] font-bold text-slate-400">{first.weight} كغ · {formatDate(first.created_at)}</span>
        <span className="text-[10px] font-bold text-slate-400">اليوم</span>
      </div>
    </div>
  );
}
