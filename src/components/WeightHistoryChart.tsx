'use client';

import { useId } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

type WeightPoint = { weight: number; created_at: string };

export default function WeightHistoryChart({
  weightHistory,
  formatDate,
}: {
  weightHistory: WeightPoint[] | null | undefined;
  formatDate: (d: string) => string;
}) {
  const gradientId = useId();
  const points = (weightHistory ?? []).filter(v => v.weight != null).slice(-8);
  if (points.length < 2) return null;

  const data = [...points].reverse().map((p, i) => ({
    idx: i,
    weight: Number(p.weight),
    date: p.created_at,
    label: formatDate(p.created_at),
  }));

  const first = points[0];
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const improved = Number(prev.weight) > Number(last.weight);
  const diff = Number(last.weight) - Number(prev.weight);
  const lineColor = diff === 0 ? '#64748B' : improved ? '#0d9488' : '#E9A63A';
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const diffLabel = `${diff > 0 ? '+' : diff < 0 ? '-' : ''}${fmt(Math.abs(diff))} كغ`;

  const weights = data.map(d => d.weight);
  const minW = Math.min(...weights), maxW = Math.max(...weights);
  const padding = Math.max((maxW - minW) * 0.25, 1);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const d = payload[0].payload;
    return (
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.92)',
          backdropFilter: 'blur(8px)',
          borderRadius: 12,
          padding: '8px 14px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
          {d.weight} كغ
        </div>
        <div style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
          {d.label}
        </div>
      </div>
    );
  };

  const fmtD = (d: string) => { const t = new Date(d); return `${t.getFullYear()}/${t.getMonth() + 1}/${t.getDate()}`; }; // سنة/شهر/يوم بصرياً، فيُقرأ من اليمين: يوم ثم شهر ثم سنة

  return (
    <div className="px-5 pt-3 pb-4 border-t border-slate-100">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-slate-700">سجل الوزن</p>
        <span className="text-xs font-black tabular-nums" style={{ color: lineColor }}>
          {diff === 0 ? 'مستقر' : `${improved ? '▼ ' : '▲ '}${diffLabel}`}
        </span>
      </div>

      <div style={{ width: '100%', height: 90 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity={0.28} />
                <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="idx" type="number" domain={[0, data.length - 1]} hide />
            <YAxis domain={[minW - padding, maxW + padding]} hide />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: lineColor, strokeWidth: 1, strokeDasharray: '3 3' }}
            />
            <Area
              type="monotone"
              dataKey="weight"
              stroke={lineColor}
              strokeWidth={3}
              fill={`url(#${gradientId})`}
              dot={{ r: 4, fill: lineColor, strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 7, fill: lineColor, strokeWidth: 3, stroke: '#fff' }}
              animationDuration={900}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-between mt-1">
        <span dir="rtl" className="text-[10px] font-bold text-slate-400"><span dir="ltr" className="tabular-nums inline-block">{first.weight}</span> كغ<span className="text-slate-300"> · </span><span dir="ltr" className="tabular-nums inline-block">{fmtD(first.created_at)}</span></span>
        <span dir="rtl" className="text-[10px] font-bold text-slate-400"><span dir="ltr" className="tabular-nums inline-block">{last.weight}</span> كغ<span className="text-slate-300"> · </span><span dir="ltr" className="tabular-nums inline-block">{fmtD(last.created_at)}</span></span>
      </div>
    </div>
  );
}
