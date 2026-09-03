'use client';
import { useState } from 'react';
type BpPoint = { bp_systolic: number; bp_diastolic: number; created_at: string };
export default function BpHistoryChart({
  bpHistory,
  formatDate,
}: {
  bpHistory: BpPoint[] | null | undefined;
  formatDate: (d: string) => string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const fmtD = (d: string) => { const t = new Date(d); return `${t.getDate()}/${t.getMonth() + 1}/${t.getFullYear()}`; };
  const points = (bpHistory ?? []).filter(v => v.bp_systolic != null && v.bp_diastolic != null).slice(-8);
  if (points.length < 2) return null;
  const W = 300, H = 70, PADX = 8, PADY = 10;
  const plotW = W - PADX * 2, plotH = H - PADY * 2;
  const allValues = points.flatMap(p => [Number(p.bp_systolic), Number(p.bp_diastolic)]);
  const minV = Math.min(...allValues), maxV = Math.max(...allValues);
  const range = maxV - minV || 1;
  const isFlat = maxV === minV;
  const buildCoords = (key: 'bp_systolic' | 'bp_diastolic') => points.map((p, i) => ({
    x: PADX + (1 - i / (points.length - 1)) * plotW,
    y: isFlat ? (PADY + plotH / 2) : PADY + (1 - (Number(p[key]) - minV) / range) * plotH,
  }));
  const buildPath = (coords: { x: number; y: number }[]) => {
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
    return path;
  };
  const sysCoords = buildCoords('bp_systolic');
  const diaCoords = buildCoords('bp_diastolic');
  const sysPath = buildPath(sysCoords);
  const diaPath = buildPath(diaCoords);
  const first = points[0];
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const diffSys = Number(last.bp_systolic) - Number(prev.bp_systolic);
  const improved = diffSys < 0;
  const trendColor = diffSys === 0 ? '#64748B' : improved ? '#1D9E75' : '#E9A63A';
  const diffLabel = `${diffSys > 0 ? '+' : diffSys < 0 ? '-' : ''}${Math.abs(diffSys)} مم زئبق`;
  const SYS_COLOR = '#1e3a8a';
  const DIA_COLOR = '#3b82f6';
  return (
    <div className="px-5 pt-3 pb-4 border-t border-slate-100">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <p className="text-xs font-bold text-slate-700">سجل الضغط (آخر {points.length} زيارات)</p>
          <div className="flex items-center gap-1.5">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: SYS_COLOR }} /><span className="text-[9px] text-slate-400">انقباضي</span></span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: DIA_COLOR }} /><span className="text-[9px] text-slate-400">انبساطي</span></span>
          </div>
        </div>
        <span className="text-xs font-black tabular-nums" style={{ color: trendColor }}>
          {diffSys === 0 ? 'مستقر' : `${improved ? '▼ ' : '▲ '}${diffLabel}`}
        </span>
      </div>
      <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[70px] overflow-visible" preserveAspectRatio="none" onClick={() => setActiveIndex(null)} onMouseLeave={() => setActiveIndex(null)}>
        <path d={diaPath} fill="none" stroke={DIA_COLOR} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d={sysPath} fill="none" stroke={SYS_COLOR} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {sysCoords.map((c, i) => (
          <g key={`sys-${i}`}>
            <circle cx={c.x} cy={c.y} r={7} fill="transparent" onMouseEnter={() => setActiveIndex(i)} onTouchStart={(e) => { e.stopPropagation(); setActiveIndex(i === activeIndex ? null : i); }} style={{ cursor: 'pointer' }} />
            <circle cx={c.x} cy={c.y} r={activeIndex === i ? 3.5 : 0} fill={SYS_COLOR} />
          </g>
        ))}
        {diaCoords.map((c, i) => (
          <circle key={`dia-${i}`} cx={c.x} cy={c.y} r={activeIndex === i ? 3 : 0} fill={DIA_COLOR} />
        ))}
      </svg>
        {activeIndex !== null && (
          <div
            className="absolute pointer-events-none bg-white border border-slate-200 rounded-xl shadow-md px-3 py-1.5 text-center whitespace-nowrap"
            style={{
              left: `${(sysCoords[activeIndex].x / W) * 100}%`,
              top: `${(sysCoords[activeIndex].y / H) * 100}%`,
              transform: 'translate(-50%, calc(-100% - 10px))',
            }}
          >
            <div className="text-sm font-black text-slate-900 tabular-nums leading-tight">{points[activeIndex].bp_systolic}/{points[activeIndex].bp_diastolic}</div>
            <div className="text-[10px] font-medium text-slate-400 leading-tight mt-0.5">{formatDate(points[activeIndex].created_at)}</div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] font-bold text-slate-400"><span dir="ltr" className="tabular-nums inline-block">{first.bp_systolic}/{first.bp_diastolic}</span><span className="text-slate-300"> · </span><span dir="ltr" className="tabular-nums inline-block">{fmtD(first.created_at)}</span></span>
        <span className="text-[10px] font-bold text-slate-400"><span dir="ltr" className="tabular-nums inline-block">{last.bp_systolic}/{last.bp_diastolic}</span><span className="text-slate-300"> · </span><span dir="ltr" className="tabular-nums inline-block">{fmtD(last.created_at)}</span></span>
      </div>
    </div>
  );
}
