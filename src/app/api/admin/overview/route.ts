import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyPlatformAdmin } from '@/lib/verify-admin';

// نظرة الإدارة: البطاقات + شريط الإجماليات من استعلام واحد (admin_pharmacy_overview). أي مسؤول يقرأ.
const DAY = 86400000;
const daysBetween = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / DAY);
// تاريخ اليوم بتوقيت عمّان (YYYY-MM-DD) — الخادم يعمل بتوقيت UTC
const ammanTodayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Amman' }).format(new Date());

export async function GET(request: Request) {
  const auth = await verifyPlatformAdmin(request);
  if (!auth.authorized) return auth.response;

  const [{ data: rows, error }, { data: settings }] = await Promise.all([
    supabaseAdmin.rpc('admin_pharmacy_overview'),
    supabaseAdmin.from('platform_settings').select('warn_days_before, currency').eq('id', true).single(),
  ]);
  if (error) { console.error('[admin/overview]', error.message); return NextResponse.json({ error: 'فشل جلب النظرة العامة' }, { status: 500 }); }

  const today = new Date();
  const todayISO = ammanTodayISO();
  const warn = settings?.warn_days_before ?? 14;
  const pharmacies = (rows || []).map((r: any) => {
    // فرق تاريخين كاملين (لا لحظة الآن) حتى لا يضيع يوم في منتصف النهار
    const daysLeft = r.sub_ends_on
      ? Math.round((Date.parse(r.sub_ends_on + 'T00:00:00Z') - Date.parse(todayISO + 'T00:00:00Z')) / DAY)
      : null;
    const lastVisit = r.last_visit_at ? new Date(r.last_visit_at) : null;
    const idleDays = lastVisit ? daysBetween(today, lastVisit) : null;
    const due = Number(r.sub_final_price ?? 0), paid = Number(r.sub_paid_amount ?? 0);
    return {
      ...r,
      days_left: daysLeft,
      expiring_soon: daysLeft != null && daysLeft >= 0 && daysLeft <= warn,
      idle_level: idleDays == null ? 'never' : idleDays > 30 ? 'critical' : idleDays > 14 ? 'warning' : 'ok',
      idle_days: idleDays,
      remaining: Math.max(0, Math.round((due - paid) * 100) / 100),
    };
  });

  const totals = {
    pharmacies: pharmacies.length,
    active: pharmacies.filter((p: any) => p.status === 'active').length,
    trial: pharmacies.filter((p: any) => p.status === 'trial').length,
    read_only: pharmacies.filter((p: any) => p.status === 'expired').length,
    collected: Math.round(pharmacies.reduce((s: number, p: any) => s + Number(p.sub_paid_amount ?? 0), 0) * 100) / 100,
    remaining: Math.round(pharmacies.reduce((s: number, p: any) => s + p.remaining, 0) * 100) / 100,
    expiring_30d: pharmacies.filter((p: any) => p.days_left != null && p.days_left >= 0 && p.days_left <= 30).length,
    idle: pharmacies.filter((p: any) => p.idle_level === 'warning' || p.idle_level === 'critical').length,
    currency: settings?.currency ?? 'JOD',
  };
  return NextResponse.json({ pharmacies, totals });
}
