import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyPlatformAdmin } from '@/lib/verify-admin';
import { PERIODS, sinceFor, ammanWall, type Period } from '@/lib/welcome-period';
import {
  type FunnelRow, type DeviceTally, SECTION_NAMES, BUTTON_ORDER, BUTTON_LABEL, TABLE_SRCS,
  verdict, verdictText, reached, mobileShare, tallyVisit, waText, median,
} from '@/lib/welcome-stats';
import { fetchAllVisits } from '@/lib/welcome-visits-server';

// تصدير كل إحصاءات الإعلانات إلى Excel لمالك المنصة فقط. يُولَّد في الخادم بـexceljs ولا يُحمَّل في المتصفح.
const PERIOD_LABEL: Record<Period, string> = { today: 'اليوم', last_7_days: 'آخر 7 أيام', all_time: 'منذ البداية' };
const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
const DAY = 86400;

// Excel لا يحمل منطقة زمنية: نكتب الوقت الجداري لعمّان كأنه UTC فيراه القارئ كما هو في عمّان
const wallDate = (d: Date) => { const w = ammanWall(d); return new Date(Date.UTC(w.y, w.mo - 1, w.d)); };
const wallTime = (d: Date) => { const w = ammanWall(d); return (w.h * 3600 + w.mi * 60 + w.s) / DAY; };
const wallDateTime = (d: Date) => { const w = ammanWall(d); return new Date(Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s)); };

function sheet(wb: ExcelJS.Workbook, name: string, headers: string[], widths: number[]) {
  const ws = wb.addWorksheet(name, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
  ws.columns = headers.map((h, i) => ({ header: h, width: widths[i] ?? 14 }));
  const head = ws.getRow(1);
  head.font = { bold: true };
  head.fill = HEADER_FILL;
  head.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  return ws;
}
const mmss = (sec: number | null | undefined) => (sec == null ? null : Number(sec) / DAY);

export async function GET(request: Request) {
  const auth = await verifyPlatformAdmin(request, ['owner']);
  if (!auth.authorized) return auth.response;

  const period = new URL(request.url).searchParams.get('period') as Period | null;
  if (!period || !PERIODS.includes(period)) {
    return NextResponse.json({ error: 'فترة غير صالحة' }, { status: 400 });
  }

  try {
    const now = new Date();
    const { data: funnelData, error } = await supabaseAdmin.from('welcome_funnel').select('*').eq('period', period);
    if (error) throw error;
    const funnel = (funnelData || []) as FunnelRow[];
    const visits = await fetchAllVisits(sinceFor(period));

    const devices: Record<string, DeviceTally> = {};
    const buttons: Record<string, Record<string, number>> = {};
    const reachedCount: Record<string, number[]> = {};
    const scrollBySrc: Record<string, number[]> = {};
    for (const v of visits) {
      tallyVisit(v, devices, buttons);
      (scrollBySrc[v.src] ||= []).push(v.max_scroll_pct);
      const r = (reachedCount[v.src] ||= Array(10).fill(0));
      for (let n = 1; n <= Math.min(10, v.max_section); n++) r[n - 1]++;
    }

    const row = (src: string) => funnel.find(f => f.src === src);
    const others = [...new Set([...funnel.map(f => f.src), ...visits.map(v => v.src)])]
      .filter(s => !TABLE_SRCS.includes(s)).sort();
    const srcs = [...TABLE_SRCS, ...others];
    const a = row('fb-a'), b = row('fb-b');

    const wb = new ExcelJS.Workbook();
    wb.created = now;

    // ورقة 1: ملخص (الصف الأول عناوين جدول المصادر، ثم بيانات التقرير تحتها)
    const s1 = sheet(wb, 'ملخص',
      ['المصدر', 'الزيارات', 'وسيط الوقت الفعلي (ثانية)', 'وسيط الوقت (د:ث)', 'زيارات واتساب', 'نسبة واتساب', 'نسبة الجوال', 'نسبة الحاسوب', 'وسيط أقصى نزول %'],
      [18, 12, 18, 16, 14, 14, 14, 14, 16]);
    for (const src of srcs) {
      const f = row(src);
      const share = mobileShare(devices[src]);
      const r = s1.addRow([
        src, f?.visits ?? 0, f?.median_active_seconds != null ? Number(f.median_active_seconds) : null,
        mmss(f?.median_active_seconds), f?.wa_visits ?? 0, f?.wa_pct != null ? Number(f.wa_pct) / 100 : null,
        share == null ? null : share / 100, share == null ? null : 1 - share / 100,
        median(scrollBySrc[src] || []),
      ]);
      r.getCell(4).numFmt = '[m]:ss';
      [6, 7, 8].forEach(c => { r.getCell(c).numFmt = '0.0%'; });
      r.getCell(9).numFmt = '0.#';
    }
    s1.addRow([]);
    const sinceIso = sinceFor(period);
    const firstVisit = visits.length ? new Date(visits[visits.length - 1].created_at) : null;
    const start = sinceIso ? new Date(sinceIso) : firstVisit;
    const meta: [string, Date | string | null, string?][] = [
      ['وقت توليد التقرير', wallDateTime(now), 'yyyy-mm-dd h:mm AM/PM'],
      ['الفترة', PERIOD_LABEL[period]],
      ['بداية الفترة', start ? wallDateTime(start) : '—', 'yyyy-mm-dd h:mm AM/PM'],
      ['نهاية الفترة', wallDateTime(now), 'yyyy-mm-dd h:mm AM/PM'],
      ['حكم المقارنة (fb-a / fb-b)', verdictText(verdict(a, b))],
    ];
    for (const [label, value, fmt] of meta) {
      const r = s1.addRow([label, value]);
      r.getCell(1).font = { bold: true };
      if (fmt && value instanceof Date) r.getCell(2).numFmt = fmt;
      r.getCell(2).alignment = { horizontal: 'right' };
    }
    s1.getColumn(2).width = 28;

    // ورقة 2: مسار الأقسام
    const heads2 = ['رقم القسم', 'القسم'];
    for (const src of srcs) heads2.push(`${src} — وصلوا`, `${src} — النسبة`);
    heads2.push('fb-a — الهبوط عن السابق (نقطة مئوية)', 'fb-b — الهبوط عن السابق (نقطة مئوية)');
    const s2 = sheet(wb, 'مسار الأقسام', heads2, [10, 22, ...srcs.flatMap(() => [12, 12]), 20, 20]);
    SECTION_NAMES.forEach((name, i) => {
      const n = i + 1;
      const cells: (string | number | null)[] = [n, name];
      for (const src of srcs) {
        const f = row(src);
        cells.push(f ? (reachedCount[src]?.[i] ?? 0) : null, f ? reached(f, n) / 100 : null);
      }
      for (const f of [a, b]) cells.push(f && n > 1 ? reached(f, n - 1) - reached(f, n) : null);
      const r = s2.addRow(cells);
      srcs.forEach((_, k) => { r.getCell(4 + k * 2).numFmt = '0.0%'; });
      r.getCell(3 + srcs.length * 2).numFmt = '0.0';
      r.getCell(4 + srcs.length * 2).numFmt = '0.0';
    });

    // ورقة 3: أزرار واتساب
    const s3 = sheet(wb, 'أزرار واتساب', ['الزر', ...srcs], [18, ...srcs.map(() => 12)]);
    const tags = [...BUTTON_ORDER, ...Object.keys(buttons).filter(t => !BUTTON_ORDER.includes(t)).sort()];
    for (const t of tags) s3.addRow([BUTTON_LABEL[t] || t, ...srcs.map(s => buttons[t]?.[s] ?? 0)]);

    // ورقة 4: كل الزيارات (الأحدث أولاً)
    const s4 = sheet(wb, 'كل الزيارات',
      ['الرقم المرجعي', 'تاريخ الدخول', 'وقت الدخول', 'المصدر', 'الجهاز', 'الوقت الفعلي (ثانية)', 'الوقت الفعلي (د:ث)',
        'مدة فتح الصفحة (ثانية)', 'مدة فتح الصفحة (د:ث)', 'أعمق قسم (رقم)', 'أعمق قسم', 'أقصى نزول %', 'أزرار واتساب', 'ضغط واتساب؟'],
      [14, 14, 14, 12, 10, 16, 16, 18, 18, 12, 22, 14, 24, 12]);
    for (const v of visits) {
      const created = new Date(v.created_at);
      const open = Math.max(0, Math.round((new Date(v.updated_at).getTime() - created.getTime()) / 1000));
      const r = s4.addRow([
        String(v.visit_id).slice(0, 8), wallDate(created), wallTime(created), v.src,
        v.device === 'mobile' ? 'جوال' : v.device === 'desktop' ? 'حاسوب' : '—',
        v.active_seconds, v.active_seconds / DAY, open, open / DAY,
        v.max_section, v.max_section > 0 ? SECTION_NAMES[v.max_section - 1] : 'لم يصل إلى أي قسم',
        v.max_scroll_pct,
        v.wa_clicks.length ? waText(v.wa_clicks) : 'لم يضغط', v.wa_clicks.length ? 'نعم' : 'لا',
      ]);
      r.getCell(2).numFmt = 'yyyy-mm-dd';
      r.getCell(3).numFmt = 'h:mm AM/PM';
      r.getCell(7).numFmt = '[m]:ss';
      r.getCell(9).numFmt = '[m]:ss';
    }
    s4.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 14 } };

    const buf = await wb.xlsx.writeBuffer();
    const w = ammanWall(now);
    const p2 = (n: number) => String(n).padStart(2, '0');
    const filename = `vitalix-ads-${w.y}-${p2(w.mo)}-${p2(w.d)}-${p2(w.h)}${p2(w.mi)}.xlsx`;
    return new Response(new Uint8Array(buf as ArrayBuffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'تعذّر توليد الملف' }, { status: 500 });
  }
}
