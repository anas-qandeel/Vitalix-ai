'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { adminFetch } from '@/lib/admin-fetch';
import Toast, { useNotice } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { ArrowRight, Star, Warning, Users } from '@phosphor-icons/react';
import type { OverviewRow } from '../../PharmacyCard';
import SubscriptionModal from '../../SubscriptionModal';
import PaymentModal from '../../PaymentModal';
import PharmacyPasswordModal from '../../PharmacyPasswordModal';

type PharmacyDetail = {
  id: string;
  user_id: string | null;
  name: string;
  pharmacist_name: string | null;
  phone_number: string | null;
  city_address: string | null;
  country: string | null;
  status: string;
  short_code: string | null;
  max_staff: number | null;
  must_change_password: boolean;
  created_at: string;
  email: string | null;
};

type Staff = {
  id: string;
  name: string;
  role: string;
  is_active: boolean;
  login_slug: string | null;
  phone: string | null;
  last_login_at: string | null;
  created_at: string;
};

type Sub = {
  id: string;
  pharmacy_id: string;
  plan_id: string | null;
  promotion_id: string | null;
  starts_on: string;
  ends_on: string;
  list_price: number;
  discount: number;
  final_price: number;
  paid_amount: number;
  status: string;
  note: string | null;
  created_at: string;
  plans: { name: string } | null;
  promotions: { name: string } | null;
};

// خريطة الحالات وfmtDate وdaysLeftColor منسوخة حرفياً من PharmacyCard.tsx — لا تُعدَّل هناك
const STATUS: Record<string, { label: string; cls: string }> = {
  trial: { label: 'تجريبي', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  active: { label: 'نشط', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  grace: { label: 'مهلة', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  expired: { label: 'قراءة فقط', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  suspended: { label: 'معطّلة', cls: 'bg-slate-200 text-slate-700 border-slate-300' },
};

function daysLeftColor(days: number | null): string {
  if (days === null) return 'text-slate-400';
  if (days < 0) return 'text-rose-600';
  if (days <= 7) return 'text-rose-600';
  if (days <= 30) return 'text-amber-600';
  return 'text-emerald-600';
}

function fmtDate(x: string): string {
  return new Date(x).toLocaleDateString('en-GB');
}

const ROLE_LABELS: Record<string, string> = { owner: 'المالك', pharmacist: 'صيدلاني', assistant: 'مساعد', staff: 'موظف' };

const BTN_BASE = 'h-8 px-3 rounded-lg text-xs font-bold cursor-pointer';

export default function PharmacyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { notice, setNotice } = useNotice();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [role, setRole] = useState<string>('support');
  const canManage = role === 'owner' || role === 'support';
  const isOwner = role === 'owner';

  const [loading, setLoading] = useState(true);
  const [pharmacy, setPharmacy] = useState<PharmacyDetail | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [overview, setOverview] = useState<OverviewRow | null>(null);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [currency, setCurrency] = useState('JOD');

  const [subModal, setSubModal] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<Sub | null>(null);
  const [pwModal, setPwModal] = useState(false);

  const [form, setForm] = useState({ name: '', pharmacist_name: '', phone_number: '', email: '', city_address: '', country: '', max_staff: '' });
  const [saving, setSaving] = useState(false);

  const load = async (initial = false) => {
    // شاشة التحميل الكاملة للفتح الأول فقط؛ إعادة الجلب بعد إجراء تحدّث البيانات في مكانها (وإلا يُمحى الـToast)
    if (initial) setLoading(true);
    const [detailRes, overviewRes, subsRes] = await Promise.all([
      adminFetch(`/api/admin/pharmacy-detail/${id}`),
      adminFetch('/api/admin/overview'),
      adminFetch(`/api/admin/subscriptions?pharmacy_id=${id}`),
    ]);
    if (!detailRes.ok || !overviewRes.ok || !subsRes.ok) {
      setNotice({ kind: 'err', text: 'تعذّر جلب البيانات' });
      setLoading(false);
      return;
    }
    const [detailJson, overviewJson, subsJson] = await Promise.all([
      detailRes.json().catch(() => ({})),
      overviewRes.json().catch(() => ({})),
      subsRes.json().catch(() => ({})),
    ]);

    const p: PharmacyDetail | undefined = detailJson.pharmacy;
    if (!p) { setPharmacy(null); setLoading(false); return; }

    setPharmacy(p);
    setStaff(detailJson.staff ?? []);
    setOverview((overviewJson.pharmacies ?? []).find((r: OverviewRow) => r.id === id) ?? null);
    setCurrency(overviewJson.totals?.currency ?? 'JOD');
    setSubs(subsJson.data ?? []);
    setForm({
      name: p.name,
      pharmacist_name: p.pharmacist_name ?? '',
      phone_number: p.phone_number ?? '',
      email: p.email ?? '',
      city_address: p.city_address ?? '',
      country: p.country ?? '',
      max_staff: p.max_staff != null ? String(p.max_staff) : '',
    });
    setLoading(false);
  };

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/'); return; }

      const { data: adminRecord, error } = await supabase
        .from('platform_admins')
        .select('role, name')
        .eq('user_id', session.user.id)
        .single();

      if (error || !adminRecord) { router.push('/dashboard'); return; }

      setRole(adminRecord.role);
      load(true);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const latestSub = subs[0] ?? null;

  const handleSaveForm = async () => {
    if (saving || !pharmacy) return;
    const name = form.name.trim();
    const mail = form.email.trim();
    if (!name) { setNotice({ kind: 'err', text: 'اسم الصيدلية مطلوب' }); return; }
    if (mail && !/^\S+@\S+\.\S+$/.test(mail)) { setNotice({ kind: 'err', text: 'صيغة البريد الإلكتروني غير صحيحة' }); return; }
    const maxStaff = Number(form.max_staff);
    if (!Number.isInteger(maxStaff) || maxStaff < 1 || maxStaff > 100) { setNotice({ kind: 'err', text: 'عدد الموظفين بين 1 و100' }); return; }

    setSaving(true);
    const payload: Record<string, unknown> = {
      id: pharmacy.id,
      name,
      pharmacist_name: form.pharmacist_name.trim(),
      phone_number: form.phone_number.trim(),
      city_address: form.city_address.trim(),
      country: form.country.trim(),
      max_staff: maxStaff,
    };
    if (mail && mail !== (pharmacy.email ?? '')) payload.email = mail;

    const res = await adminFetch('/api/admin/manage-pharmacy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setNotice({ kind: 'err', text: json.error || 'فشل حفظ التعديلات' });
      setSaving(false);
      return;
    }
    setNotice({ kind: 'ok', text: 'تم حفظ التعديلات' });
    setSaving(false);
    load();
  };

  const handleToggleSuspend = async () => {
    if (!pharmacy) return;
    const suspending = pharmacy.status !== 'suspended';
    const ok = await confirm({
      title: pharmacy.status === 'suspended' ? `تفعيل «${pharmacy.name}»؟` : `تعطيل «${pharmacy.name}»؟`,
      message: pharmacy.status === 'suspended' ? 'ستعود الصيدلية للعمل فوراً.' : 'لن يستطيع أحد من الصيدلية الدخول حتى التفعيل. لا تُحذف أي بيانات.',
      confirmText: pharmacy.status === 'suspended' ? 'تفعيل' : 'تعطيل',
      destructive: suspending,
    });
    if (!ok) return;

    const res = await adminFetch('/api/admin/manage-pharmacy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: pharmacy.id, status: pharmacy.status === 'suspended' ? 'active' : 'suspended' }),
    });
    setNotice(res.ok
      ? { kind: 'ok', text: pharmacy.status === 'suspended' ? 'تم التفعيل' : 'تم التعطيل' }
      : { kind: 'err', text: 'فشلت العملية' });
    load();
  };

  const handleArchive = async () => {
    if (!pharmacy) return;
    const ok = await confirm({
      title: `أرشفة «${pharmacy.name}»؟`,
      message: 'تُخفى الصيدلية من القوائم ويُحظر دخول حسابها. تبقى بياناتها وسجلاتها المالية محفوظة. لا يمكن التراجع من اللوحة.',
      confirmText: 'أرشفة',
      destructive: true,
    });
    if (!ok) return;

    const res = await adminFetch(`/api/admin/manage-pharmacy?id=${pharmacy.id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setNotice({ kind: 'ok', text: json.message || 'تم أرشفة الصيدلية' });
      router.push('/admin/v2');
    } else {
      setNotice({ kind: 'err', text: json.error || 'فشلت عملية الأرشفة' });
    }
  };

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-400">جارٍ التحميل…</p>
      </div>
    );
  }

  if (!pharmacy) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center space-y-3 max-w-sm w-full">
          <p className="text-sm font-bold text-slate-900">الصيدلية غير موجودة</p>
          <button onClick={() => router.push('/admin/v2')}
            className="h-10 px-4 rounded-lg bg-slate-900 text-white text-sm font-bold cursor-pointer">
            العودة
          </button>
        </div>
      </div>
    );
  }

  const headerStatus = STATUS[pharmacy.status] ?? { label: pharmacy.status, cls: 'bg-slate-100 text-slate-600 border-slate-200' };
  const isArchived = pharmacy.status === 'archived';
  const canAct = canManage && !isArchived;

  return (
    <div dir="rtl" className="bg-slate-50 min-h-screen">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 flex-wrap">
        <button onClick={() => router.push('/admin/v2')}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900 text-sm font-semibold cursor-pointer">
          <ArrowRight size={14} weight="bold" aria-hidden="true" />
          الصيدليات
        </button>
        <div className="h-5 w-px bg-slate-200" />
        <h1 className="font-bold text-slate-900">{pharmacy.name}</h1>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${headerStatus.cls}`}>{headerStatus.label}</span>
        {pharmacy.short_code && <span className="font-mono text-[10px] text-slate-400">{pharmacy.short_code}</span>}
      </header>

      <div className="max-w-5xl mx-auto p-4 space-y-4">
        {isArchived && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-3 text-sm font-bold">
            هذه الصيدلية مؤرشفة — حسابها محظور والبيانات محفوظة للقراءة
          </div>
        )}

        {/* الاشتراك */}
        <section className="bg-white rounded-2xl border border-slate-200 p-4">
          <h2 className="text-sm font-bold text-slate-900 mb-3">الاشتراك</h2>
          {overview ? (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${(STATUS[overview.sub_status ?? ''] ?? { cls: 'bg-slate-100 text-slate-600 border-slate-200' }).cls}`}>
                    {(STATUS[overview.sub_status ?? ''] ?? { label: overview.sub_status ?? '—' }).label}
                  </span>
                  <span className="text-sm text-slate-700">{overview.sub_plan_name || 'بلا خطة (تجريبي)'}</span>
                  {overview.sub_lifetime && (
                    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                      <Star size={12} weight="fill" aria-hidden="true" />
                      مؤسس
                    </span>
                  )}
                </div>
                {canAct && (
                  <div className="flex gap-2">
                    <button onClick={() => setSubModal(true)} className={`${BTN_BASE} bg-slate-900 text-white hover:bg-slate-800`}>
                      اشتراك / تجديد
                    </button>
                    <button
                      onClick={() => latestSub && setPaymentTarget(latestSub)}
                      disabled={!latestSub || overview.remaining <= 0}
                      className={`${BTN_BASE} bg-white border border-slate-200 text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      تسجيل دفعة
                    </button>
                  </div>
                )}
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-xs flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-700">{overview.sub_ends_on && `ينتهي ${fmtDate(overview.sub_ends_on)}`}</span>
                  <span className={`font-bold ${daysLeftColor(overview.days_left)}`}>
                    {overview.days_left === null ? '—' : overview.days_left < 0 ? `منتهٍ منذ ${-overview.days_left} يوم` : `${overview.days_left} يوم`}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-500">
                  <span>مدفوع {(overview.sub_paid_amount ?? 0).toLocaleString('en-US')} / {(overview.sub_final_price ?? 0).toLocaleString('en-US')} {currency}</span>
                  {overview.remaining > 0 && <span className="text-amber-700 font-bold">متبقٍ {overview.remaining.toLocaleString('en-US')}</span>}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-400">لا بيانات اشتراك متاحة</p>
          )}
        </section>

        {/* الإحصائيات */}
        <section className="bg-white rounded-2xl border border-slate-200 p-4">
          <h2 className="text-sm font-bold text-slate-900 mb-3">الإحصائيات</h2>
          {overview ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="bg-slate-50 rounded-lg py-2">
                  <p className="font-bold text-sm text-slate-900">{overview.patients_count.toLocaleString('en-US')}</p>
                  <p className="text-[10px] text-slate-500">المرضى</p>
                </div>
                <div className="bg-slate-50 rounded-lg py-2">
                  <p className="font-bold text-sm text-slate-900">{overview.chronic_count.toLocaleString('en-US')}</p>
                  <p className="text-[10px] text-slate-500">مزمنون</p>
                </div>
                <div className="bg-slate-50 rounded-lg py-2">
                  <p className="font-bold text-sm text-slate-900">{overview.visits_30d.toLocaleString('en-US')}</p>
                  <p className="text-[10px] text-slate-500">زيارات 30 يوماً</p>
                </div>
                <div className="bg-slate-50 rounded-lg py-2">
                  <p className="font-bold text-sm text-slate-900">{overview.last_visit_at ? fmtDate(overview.last_visit_at) : '—'}</p>
                  <p className="text-[10px] text-slate-500">آخر زيارة</p>
                </div>
                <div className="bg-slate-50 rounded-lg py-2">
                  <p className="font-bold text-sm text-slate-900 flex items-center justify-center gap-1">
                    <Users size={12} weight="bold" aria-hidden="true" />
                    {overview.staff_active}/{overview.max_staff ?? '—'}
                  </p>
                  <p className="text-[10px] text-slate-500">موظفون</p>
                </div>
                <div className="bg-slate-50 rounded-lg py-2">
                  <p className="font-bold text-sm text-slate-900">{overview.last_activity_at ? fmtDate(overview.last_activity_at) : '—'}</p>
                  <p className="text-[10px] text-slate-500">آخر نشاط</p>
                </div>
                <div className="bg-slate-50 rounded-lg py-2">
                  <p className="font-bold text-sm text-slate-900">{overview.uncategorized_count.toLocaleString('en-US')}</p>
                  <p className="text-[10px] text-slate-500">منتجات غير مصنّفة</p>
                </div>
                <div className="bg-slate-50 rounded-lg py-2">
                  <p className="font-bold text-sm text-slate-900">{overview.ai_tokens_30d.toLocaleString('en-US')}</p>
                  <p className="text-[10px] text-slate-500">توكن الذكاء 30 يوماً</p>
                </div>
              </div>
              {(overview.idle_level === 'warning' || overview.idle_level === 'critical') && (
                <div className={`flex items-center gap-1.5 text-[11px] mt-3 ${overview.idle_level === 'critical' ? 'text-rose-700' : 'text-amber-700'}`}>
                  <Warning size={12} weight="bold" aria-hidden="true" />
                  خاملة منذ {overview.idle_days} يوماً
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-400">لا بيانات إحصائية متاحة</p>
          )}
        </section>

        {/* سجل الاشتراكات */}
        <section className="bg-white rounded-2xl border border-slate-200 p-4">
          <h2 className="text-sm font-bold text-slate-900 mb-3">سجل الاشتراكات</h2>
          {subs.length === 0 ? (
            <p className="text-sm text-slate-400">لا اشتراكات مسجّلة</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-100">
                    <th className="py-2 px-2 font-semibold">الخطة</th>
                    <th className="py-2 px-2 font-semibold">العرض</th>
                    <th className="py-2 px-2 font-semibold">من</th>
                    <th className="py-2 px-2 font-semibold">إلى</th>
                    <th className="py-2 px-2 font-semibold">الحالة</th>
                    <th className="py-2 px-2 font-semibold">المستحق</th>
                    <th className="py-2 px-2 font-semibold">المدفوع</th>
                    <th className="py-2 px-2 font-semibold">المتبقي</th>
                    <th className="py-2 px-2 font-semibold">ملاحظة</th>
                    <th className="py-2 px-2 font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map(s => {
                    const remaining = Math.max(0, Math.round((Number(s.final_price) - Number(s.paid_amount)) * 100) / 100);
                    const st = STATUS[s.status] ?? { label: s.status, cls: 'bg-slate-100 text-slate-600 border-slate-200' };
                    return (
                      <tr key={s.id} className="border-b border-slate-50 last:border-0">
                        <td className="py-2 px-2 text-slate-700">{s.plans?.name ?? 'تجريبي'}</td>
                        <td className="py-2 px-2 text-slate-500">{s.promotions?.name ?? '—'}</td>
                        <td className="py-2 px-2 text-slate-500 tabular-nums">{fmtDate(s.starts_on)}</td>
                        <td className="py-2 px-2 text-slate-500 tabular-nums">{fmtDate(s.ends_on)}</td>
                        <td className="py-2 px-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                        </td>
                        <td className="py-2 px-2 text-slate-700 tabular-nums">{s.final_price.toLocaleString('en-US')}</td>
                        <td className="py-2 px-2 text-emerald-700 tabular-nums">{s.paid_amount.toLocaleString('en-US')}</td>
                        <td className={`py-2 px-2 tabular-nums font-bold ${remaining > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{remaining.toLocaleString('en-US')}</td>
                        <td className="py-2 px-2 text-slate-500">{s.note ?? '—'}</td>
                        <td className="py-2 px-2">
                          {canAct && remaining > 0 && (
                            <button onClick={() => setPaymentTarget(s)} className={`${BTN_BASE} bg-white border border-slate-200 text-slate-700`}>
                              تسجيل دفعة
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* بيانات الصيدلية */}
        {!isArchived && (
          <section className="bg-white rounded-2xl border border-slate-200 p-4">
            <h2 className="text-sm font-bold text-slate-900 mb-3">بيانات الصيدلية</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-500 mb-1">اسم الصيدلية</span>
                <input type="text" value={form.name} disabled={!canManage} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900 disabled:opacity-60 disabled:cursor-not-allowed" />
              </label>
              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-500 mb-1">الصيدلاني المسؤول</span>
                <input type="text" value={form.pharmacist_name} disabled={!canManage} onChange={e => setForm(f => ({ ...f, pharmacist_name: e.target.value }))}
                  className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900 disabled:opacity-60 disabled:cursor-not-allowed" />
              </label>
              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-500 mb-1">رقم الهاتف</span>
                <input type="tel" inputMode="tel" value={form.phone_number} disabled={!canManage} onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))}
                  className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900 disabled:opacity-60 disabled:cursor-not-allowed" />
              </label>
              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-500 mb-1">البريد الإلكتروني للدخول</span>
                <input type="email" autoComplete="off" value={form.email} disabled={!canManage} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900 disabled:opacity-60 disabled:cursor-not-allowed" />
              </label>
              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-500 mb-1">المدينة والعنوان</span>
                <input type="text" value={form.city_address} disabled={!canManage} onChange={e => setForm(f => ({ ...f, city_address: e.target.value }))}
                  className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900 disabled:opacity-60 disabled:cursor-not-allowed" />
              </label>
              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-500 mb-1">الدولة</span>
                <input type="text" value={form.country} disabled={!canManage} onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                  className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900 disabled:opacity-60 disabled:cursor-not-allowed" />
              </label>
              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-500 mb-1">الحد الأقصى للموظفين</span>
                <input type="number" min={1} max={100} value={form.max_staff} disabled={!canManage} onChange={e => setForm(f => ({ ...f, max_staff: e.target.value }))}
                  className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900 disabled:opacity-60 disabled:cursor-not-allowed" />
              </label>
            </div>

            {pharmacy.must_change_password && (
              <p className="text-[11px] text-amber-600 mt-3">كلمة مرور المالك مؤقتة — سيُطلب تغييرها عند الدخول</p>
            )}

            {canManage && (
              <button onClick={handleSaveForm} disabled={saving}
                className="h-10 px-5 mt-4 flex items-center justify-center rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                حفظ التعديلات
              </button>
            )}
          </section>
        )}

        {/* الموظفون */}
        <section className="bg-white rounded-2xl border border-slate-200 p-4">
          <h2 className="text-sm font-bold text-slate-900 mb-3">
            الموظفون <span className="text-slate-400 font-normal">({staff.filter(s => s.is_active).length}/{pharmacy.max_staff ?? '—'})</span>
          </h2>
          {staff.length === 0 ? (
            <p className="text-sm text-slate-400">لا موظفون</p>
          ) : (
            <div className="flex flex-col gap-2">
              {staff.map(s => (
                <div key={s.id} className="flex items-center justify-between gap-2 flex-wrap bg-slate-50 rounded-xl p-3 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900">{s.name}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">{ROLE_LABELS[s.role] ?? s.role}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${s.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                      {s.is_active ? 'نشط' : 'موقوف'}
                    </span>
                    {s.phone && <span className="text-slate-500">{s.phone}</span>}
                  </div>
                  <span className="text-slate-400">{s.last_login_at ? fmtDate(s.last_login_at) : 'لم يسجّل دخولاً'}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* إجراءات */}
        {canAct && (
          <section className="bg-white rounded-2xl border border-slate-200 p-4">
            <h2 className="text-sm font-bold text-slate-900 mb-3">إجراءات</h2>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setPwModal(true)} className={`${BTN_BASE} bg-white border border-slate-200 text-slate-700`}>
                كلمة المرور
              </button>
              {pharmacy.status === 'suspended' ? (
                <button onClick={handleToggleSuspend} className={`${BTN_BASE} bg-emerald-600 text-white`}>
                  تفعيل
                </button>
              ) : (
                <button onClick={handleToggleSuspend} className={`${BTN_BASE} bg-white border border-rose-200 text-rose-600`}>
                  تعطيل
                </button>
              )}
              {isOwner && (
                <button onClick={handleArchive} className={`${BTN_BASE} bg-rose-600 text-white`}>
                  أرشفة الصيدلية
                </button>
              )}
            </div>
          </section>
        )}
      </div>

      {subModal && (
        <SubscriptionModal
          pharmacy={{ id: pharmacy.id, name: pharmacy.name, expiry_date: overview?.sub_ends_on ?? null, status: pharmacy.status }}
          onClose={() => setSubModal(false)}
          onSaved={() => { setNotice({ kind: 'ok', text: 'تم تحديث الاشتراك' }); load(); }}
        />
      )}
      {paymentTarget && (
        <PaymentModal
          subscription={{
            id: paymentTarget.id,
            final_price: paymentTarget.final_price,
            paid_amount: paymentTarget.paid_amount,
            label: `${paymentTarget.plans?.name ?? 'تجريبي'} · ${fmtDate(paymentTarget.starts_on)} – ${fmtDate(paymentTarget.ends_on)}`,
          }}
          currency={currency}
          onClose={() => setPaymentTarget(null)}
          onSaved={() => { setNotice({ kind: 'ok', text: 'تم تسجيل الدفعة' }); load(); }}
        />
      )}
      {pwModal && (
        <PharmacyPasswordModal pharmacy={{ id: pharmacy.id, name: pharmacy.name }} onClose={() => setPwModal(false)} />
      )}
      {confirmDialog}
      <Toast notice={notice} />
    </div>
  );
}
