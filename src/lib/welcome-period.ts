// بداية الفترة لإحصاءات /welcome: مطابقة لتعريف welcome_funnel في القاعدة، وتُستعمل في أكثر من مسار أدمن
export const PERIODS = ['today', 'last_7_days', 'all_time'] as const;
export type Period = typeof PERIODS[number];

const ammanParts = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Amman', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).reduce<Record<string, string>>((acc, p) => { acc[p.type] = p.value; return acc; }, {});

// منتصف ليل اليوم بتوقيت عمّان، مطابقاً لتعريف الـview (date_trunc بتوقيت Asia/Amman)؛
// نجرّب الإزاحتين الممكنتين بدل تثبيت +3 كي لا ينكسر إن عاد التوقيت الصيفي
function ammanMidnight(now: Date): Date {
  const p = ammanParts(now);
  for (const offsetH of [3, 2]) {
    const guess = new Date(Date.UTC(+p.year, +p.month - 1, +p.day) - offsetH * 3600_000);
    const g = ammanParts(guess);
    if (g.hour === '00' && g.day === p.day) return guess;
  }
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day) - 3 * 3600_000);
}

export function sinceFor(period: Period): string | null {
  const now = new Date();
  if (period === 'today') return ammanMidnight(now).toISOString();
  if (period === 'last_7_days') return new Date(now.getTime() - 7 * 86400_000).toISOString();
  return null;
}

// الوقت الجداري بتوقيت عمّان لأي لحظة (للتقارير: خلايا Excel لا تحمل منطقة زمنية فنكتب ما يراه القارئ في عمّان)
export function ammanWall(d: Date) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Amman', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).reduce<Record<string, string>>((acc, x) => { acc[x.type] = x.value; return acc; }, {});
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}
