'use client';

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

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
  const fmtD = (d: string) => { const t = new Date(d); return `${t.getFullYear()}/${t.getMonth() + 1}/${t.getDate()}`; }; // سنة/شهر/يوم بصرياً، فيُقرأ من اليمين: يوم ثم شهر ثم سنة
  const points = (sugarHistory ?? []).filter(v => v.sugar_value != null).slice(-8);
  if (points.length < 2) return null;

  const data = [...points].reverse().map((p, i) => {
    const type = p.sugar_test_type || 'random';
    return {
      idx: i,
      value: Number(p.sugar_value),
      type,
      color: TYPE_COLOR[type] || TYPE_COLOR.random,
      date: p.created_at,
      label: formatDate(p.created_at),
    };
  });

  const first = points[0];
  const last = points[points.length - 1];
  const usedTypes = Array.from(new Set(points.map(p => p.sugar_test_type || 'random')));

  const values = data.map(d => d.value);
  const minV = Math.min(...values), maxV = Math.max(...values);
  const padding = Math.max((maxV - minV) * 0.2, 8);

  const trendNode = (() => {
    const prev = points[points.length - 2];
    const sameType = (last.sugar_test_type || 'random') === (prev.sugar_test_type || 'random');
    if (!sameType) return <span className="text-[9px] text-slate-400">قراءتان مختلفتا النوع</span>;
    const diff = Number(last.sugar_value) - Number(prev.sugar_value);
    const improved = diff < 0;
    const trendColor = diff === 0 ? '#64748B' : improved ? '#0d9488' : '#E9A63A';
    return (
      <span className="text-xs font-black tabular-nums" style={{ color: trendColor }}>
        {diff === 0 ? 'مستقر' : <><span>{improved ? '▼' : '▲'}</span> <span dir="ltr" className="inline-block">{diff > 0 ? '+' : '-'}{Math.abs(diff)} mg/dL</span></>}
      </span>
    );
  })();

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
          {d.value} mg/dL
        </div>
        <div style={{ fontSize: 10, fontWeight: 600, color: d.color, marginTop: 3, textAlign: 'center' }}>
          {TYPE_LABEL[d.type] || TYPE_LABEL.random}
        </div>
        <div style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.6)', marginTop: 2, textAlign: 'center' }}>
          {d.label}
        </div>
      </div>
    );
  };

  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    return <circle cx={cx} cy={cy} r={4.5} fill={payload.color} stroke="#fff" strokeWidth={1.5} />;
  };
  const CustomActiveDot = (props: any) => {
    const { cx, cy, payload } = props;
    return <circle cx={cx} cy={cy} r={7} fill={payload.color} stroke="#fff" strokeWidth={2.5} />;
  };

  return (
    <div className="px-5 pt-3 pb-4 border-t border-slate-100">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-y-1">
        <div className="flex items-center gap-3">
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
        {trendNode}
      </div>
      <p className="text-[10px] text-slate-500 mb-2">النقاط بألوان مختلفة لأن أنواع القراءة (صائم/بعد الأكل/عشوائي) لها نطاقات طبيعية مختلفة ولا تُقارن مباشرة</p>

      <div style={{ width: '100%', height: 90 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <XAxis dataKey="idx" type="number" domain={[0, data.length - 1]} hide />
            <YAxis domain={[minV - padding, maxV + padding]} hide />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '3 3' }}
            />
            <Area
              type="linear"
              dataKey="value"
              stroke="#cbd5e1"
              strokeWidth={1.5}
              fill="none"
              dot={<CustomDot />}
              activeDot={<CustomActiveDot />}
              animationDuration={900}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] font-bold text-slate-400"><span dir="ltr" className="tabular-nums inline-block">{first.sugar_value} mg/dL</span><span className="text-slate-300"> · </span><span dir="ltr" className="tabular-nums inline-block">{fmtD(first.created_at)}</span></span>
        <span className="text-[10px] font-bold text-slate-400"><span dir="ltr" className="tabular-nums inline-block">{last.sugar_value} mg/dL</span><span className="text-slate-300"> · </span><span dir="ltr" className="tabular-nums inline-block">{fmtD(last.created_at)}</span></span>
      </div>
    </div>
  );
}
