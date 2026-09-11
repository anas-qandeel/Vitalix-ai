'use client';

import { useId } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

type BpPoint = { bp_systolic: number; bp_diastolic: number; created_at: string };

export default function BpHistoryChart({
  bpHistory,
  formatDate,
}: {
  bpHistory: BpPoint[] | null | undefined;
  formatDate: (d: string) => string;
}) {
  const sysGradientId = useId();
  const diaGradientId = useId();
  const fmtD = (d: string) => { const t = new Date(d); return `${t.getFullYear()}/${t.getMonth() + 1}/${t.getDate()}`; }; // سنة/شهر/يوم بصرياً، فيُقرأ من اليمين: يوم ثم شهر ثم سنة
  const points = (bpHistory ?? []).filter(v => v.bp_systolic != null && v.bp_diastolic != null).slice(-8);
  if (points.length < 2) return null;

  const data = [...points].reverse().map((p, i) => ({
    idx: i,
    sys: Number(p.bp_systolic),
    dia: Number(p.bp_diastolic),
    date: p.created_at,
    label: formatDate(p.created_at),
  }));

  const first = points[0];
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const diffSys = Number(last.bp_systolic) - Number(prev.bp_systolic);
  const improved = diffSys < 0;
  const trendColor = diffSys === 0 ? '#64748B' : improved ? '#0d9488' : '#E9A63A';
  const diffLabel = `${diffSys > 0 ? '+' : diffSys < 0 ? '-' : ''}${Math.abs(diffSys)} مم زئبق`;

  const SYS_COLOR = '#1e3a8a';
  const DIA_COLOR = '#3b82f6';

  const allValues = data.flatMap(d => [d.sys, d.dia]);
  const minV = Math.min(...allValues), maxV = Math.max(...allValues);
  const padding = Math.max((maxV - minV) * 0.2, 4);

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
        <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', lineHeight: 1.2, direction: 'ltr', textAlign: 'center' }}>
          {d.sys}/{d.dia}
        </div>
        <div style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.6)', marginTop: 2, textAlign: 'center' }}>
          {d.label}
        </div>
      </div>
    );
  };

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

      <div style={{ width: '100%', height: 90 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id={sysGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SYS_COLOR} stopOpacity={0.22} />
                <stop offset="100%" stopColor={SYS_COLOR} stopOpacity={0} />
              </linearGradient>
              <linearGradient id={diaGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={DIA_COLOR} stopOpacity={0.15} />
                <stop offset="100%" stopColor={DIA_COLOR} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="idx" type="number" domain={[0, data.length - 1]} hide />
            <YAxis domain={[minV - padding, maxV + padding]} hide />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '3 3' }}
            />
            <Area
              type="monotone"
              dataKey="dia"
              stroke={DIA_COLOR}
              strokeWidth={2}
              fill={`url(#${diaGradientId})`}
              dot={{ r: 3, fill: DIA_COLOR, strokeWidth: 1.5, stroke: '#fff' }}
              activeDot={{ r: 6, fill: DIA_COLOR, strokeWidth: 2.5, stroke: '#fff' }}
              animationDuration={900}
              animationEasing="ease-out"
            />
            <Area
              type="monotone"
              dataKey="sys"
              stroke={SYS_COLOR}
              strokeWidth={2.5}
              fill={`url(#${sysGradientId})`}
              dot={{ r: 4, fill: SYS_COLOR, strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 7, fill: SYS_COLOR, strokeWidth: 3, stroke: '#fff' }}
              animationDuration={900}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] font-bold text-slate-400"><span dir="ltr" className="tabular-nums inline-block">{first.bp_systolic}/{first.bp_diastolic}</span><span className="text-slate-300"> · </span><span dir="ltr" className="tabular-nums inline-block">{fmtD(first.created_at)}</span></span>
        <span className="text-[10px] font-bold text-slate-400"><span dir="ltr" className="tabular-nums inline-block">{last.bp_systolic}/{last.bp_diastolic}</span><span className="text-slate-300"> · </span><span dir="ltr" className="tabular-nums inline-block">{fmtD(last.created_at)}</span></span>
      </div>
    </div>
  );
}
