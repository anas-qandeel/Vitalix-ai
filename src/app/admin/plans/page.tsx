'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { adminFetch } from '@/lib/admin-fetch';
import Toast, { useNotice } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { Plus, PencilSimple, Trash, ArrowRight } from '@phosphor-icons/react';

type Settings = { default_trial_days: number; grace_days: number; warn_days_before: number; currency: string };
type Plan = { id: string; name: string; price: number; duration_months: number; free_months: number; seats_limit: number | null; lifetime_price: boolean; note: string | null; is_active: boolean; subscriptions_count: number };
type Promo = { id: string; name: string; discount_type: 'percent' | 'amount'; discount_value: number; code: string | null; valid_from: string | null; valid_to: string | null; max_uses: number | null; used_count: number; is_active: boolean };

export default function PlansPage() {
  const router = useRouter();
  const { notice, setNotice } = useNotice();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [loading, setLoading] = useState(true);

  const [settings, setSettings] = useState<Settings>({ default_trial_days: 30, grace_days: 0, warn_days_before: 10, currency: 'JOD' });
  const [savingSettings, setSavingSettings] = useState(false);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [editingPlan, setEditingPlan] = useState<Partial<Plan> | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);

  const [promos, setPromos] = useState<Promo[]>([]);
  const [editingPromo, setEditingPromo] = useState<Partial<Promo> | null>(null);
  const [savingPromo, setSavingPromo] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    const [settingsRes, plansRes, promosRes] = await Promise.all([
      adminFetch('/api/admin/settings'),
      adminFetch('/api/admin/plans'),
      adminFetch('/api/admin/promotions'),
    ]);
    if (!settingsRes.ok || !plansRes.ok || !promosRes.ok) {
      setNotice({ kind: 'err', text: 'تعذّر جلب البيانات' });
    } else {
      const [settingsJson, plansJson, promosJson] = await Promise.all([
        settingsRes.json().catch(() => ({})),
        plansRes.json().catch(() => ({})),
        promosRes.json().catch(() => ({})),
      ]);
      if (settingsJson.data) setSettings(settingsJson.data);
      setPlans(plansJson.data ?? []);
      setPromos(promosJson.data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    const checkAdminPermission = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        router.push('/');
        return;
      }

      const { data: adminRecord, error } = await supabase
        .from('platform_admins')
        .select('role, name')
        .eq('user_id', session.user.id)
        .single();

      if (error || !adminRecord) {
        router.push('/dashboard');
        return;
      }
      if (adminRecord.role !== 'owner') {
        router.push('/admin');
        return;
      }

      loadAll();
    };

    checkAdminPermission();
  }, [router]);

  const saveSettings = async () => {
    setSavingSettings(true);
    const res = await adminFetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      if (json.data) setSettings(json.data);
      setNotice({ kind: 'ok', text: 'حُفظت الإعدادات' });
    } else {
      setNotice({ kind: 'err', text: json.error || 'فشل حفظ الإعدادات' });
    }
    setSavingSettings(false);
  };

  const savePlan = async () => {
    if (!editingPlan || savingPlan) return;
    setSavingPlan(true);
    const isEdit = !!editingPlan.id;
    const res = await adminFetch('/api/admin/plans', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingPlan),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setNotice({ kind: 'ok', text: isEdit ? 'حُدّثت الخطة' : 'أُنشئت الخطة' });
      setEditingPlan(null);
      loadAll();
    } else {
      setNotice({ kind: 'err', text: json.error || 'فشل حفظ الخطة' });
    }
    setSavingPlan(false);
  };

  const deletePlan = async (plan: Plan) => {
    const ok = await confirm({
      title: `حذف خطة «${plan.name}»؟`,
      message: 'إن كانت مستخدمة في اشتراكات قائمة ستُؤرشف بدل حذفها.',
      confirmText: 'حذف نهائياً',
      destructive: true,
    });
    if (!ok) return;
    const res = await adminFetch(`/api/admin/plans?id=${plan.id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setNotice({ kind: 'ok', text: json.archived ? 'أُرشفت (مستخدمة في اشتراكات قائمة)' : 'حُذفت الخطة' });
      loadAll();
    } else {
      setNotice({ kind: 'err', text: json.error || 'فشل الحذف' });
    }
  };

  const savePromo = async () => {
    if (!editingPromo || savingPromo) return;
    setSavingPromo(true);
    const isEdit = !!editingPromo.id;
    const res = await adminFetch('/api/admin/promotions', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingPromo),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setNotice({ kind: 'ok', text: isEdit ? 'حُدّث العرض' : 'أُنشئ العرض' });
      setEditingPromo(null);
      loadAll();
    } else {
      setNotice({ kind: 'err', text: json.error || 'فشل حفظ العرض' });
    }
    setSavingPromo(false);
  };

  const deletePromo = async (promo: Promo) => {
    const ok = await confirm({
      title: `حذف عرض «${promo.name}»؟`,
      message: 'إن كان مستخدماً في اشتراكات قائمة سيُؤرشف بدل حذفه.',
      confirmText: 'حذف نهائياً',
      destructive: true,
    });
    if (!ok) return;
    const res = await adminFetch(`/api/admin/promotions?id=${promo.id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setNotice({ kind: 'ok', text: json.archived ? 'أُرشفت (مستخدمة في اشتراكات قائمة)' : 'حُذف العرض' });
      loadAll();
    } else {
      setNotice({ kind: 'err', text: json.error || 'فشل الحذف' });
    }
  };

  return (
    <div dir="rtl" className="bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto p-4">
        <div className="flex items-center gap-3 mb-4">
          <button type="button" onClick={() => router.push('/admin')}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-500 hover:bg-slate-100 cursor-pointer">
            <ArrowRight size={16} weight="bold" aria-hidden="true" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-900">الخطط والاشتراكات</h1>
            <p className="text-xs text-slate-400">إصدار واحد للنظام بكل المميزات — الخطة تحدد شروط الدفع فقط</p>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">جارٍ التحميل…</p>
        ) : (
          <>
            {/* القسم 1 — إعدادات المنصة */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
              <h2 className="text-sm font-bold text-slate-900 mb-3">إعدادات المنصة</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">المدة التجريبية الافتراضية (يوم)</label>
                  <input type="number" min={0} value={settings.default_trial_days}
                    onChange={e => setSettings({ ...settings, default_trial_days: Number(e.target.value) })}
                    className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">أيام السماح بعد الانتهاء</label>
                  <input type="number" min={0} value={settings.grace_days}
                    onChange={e => setSettings({ ...settings, grace_days: Number(e.target.value) })}
                    className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">أيام التنبيه قبل الانتهاء</label>
                  <input type="number" min={0} value={settings.warn_days_before}
                    onChange={e => setSettings({ ...settings, warn_days_before: Number(e.target.value) })}
                    className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">العملة</label>
                  <input type="text" value={settings.currency}
                    onChange={e => setSettings({ ...settings, currency: e.target.value })}
                    className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
                </div>
              </div>
              <button type="button" onClick={saveSettings} disabled={savingSettings}
                className="h-9 px-4 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                حفظ الإعدادات
              </button>
            </div>

            {/* القسم 2 — الخطط */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-slate-900">الخطط</h2>
                <button type="button"
                  onClick={() => setEditingPlan({ name: '', price: 0, duration_months: 12, free_months: 0, seats_limit: null, lifetime_price: false, is_active: true, note: '' })}
                  className="h-8 px-3 flex items-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer transition-all">
                  <Plus size={14} weight="bold" aria-hidden="true" />
                  خطة جديدة
                </button>
              </div>

              {editingPlan && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5 mb-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <label className="block">
                      <span className="block text-[11px] font-semibold text-slate-500 mb-1">اسم الخطة</span>
                      <input type="text" value={editingPlan.name ?? ''} placeholder="الاسم"
                        onChange={e => setEditingPlan({ ...editingPlan, name: e.target.value })}
                        className="h-9 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900 w-full" />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-semibold text-slate-500 mb-1">{`السعر (${settings.currency})`}</span>
                      <input type="number" min={0} value={editingPlan.price ?? ''} placeholder={`السعر (${settings.currency})`}
                        onChange={e => setEditingPlan({ ...editingPlan, price: Number(e.target.value) })}
                        className="h-9 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900 w-full" />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-semibold text-slate-500 mb-1">المدة (أشهر)</span>
                      <input type="number" min={1} value={editingPlan.duration_months ?? ''} placeholder="المدة (أشهر)"
                        onChange={e => setEditingPlan({ ...editingPlan, duration_months: Number(e.target.value) })}
                        className="h-9 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900 w-full" />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-semibold text-slate-500 mb-1">أشهر مجانية</span>
                      <input type="number" min={0} value={editingPlan.free_months ?? ''} placeholder="أشهر مجانية"
                        onChange={e => setEditingPlan({ ...editingPlan, free_months: Number(e.target.value) })}
                        className="h-9 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900 w-full" />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-semibold text-slate-500 mb-1">المقاعد (فارغ = بلا حد)</span>
                      <input type="number" min={1} value={editingPlan.seats_limit ?? ''} placeholder="المقاعد (فارغ = بلا حد)"
                        onChange={e => setEditingPlan({ ...editingPlan, seats_limit: e.target.value === '' ? null : Number(e.target.value) })}
                        className="h-9 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900 w-full" />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-semibold text-slate-500 mb-1">ملاحظة</span>
                      <input type="text" value={editingPlan.note ?? ''} placeholder="ملاحظة"
                        onChange={e => setEditingPlan({ ...editingPlan, note: e.target.value })}
                        className="h-9 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900 w-full" />
                    </label>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={editingPlan.lifetime_price ?? false}
                        onChange={e => setEditingPlan({ ...editingPlan, lifetime_price: e.target.checked })}
                        className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500" />
                      سعر مثبّت مدى الحياة
                    </label>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={editingPlan.is_active ?? true}
                        onChange={e => setEditingPlan({ ...editingPlan, is_active: e.target.checked })}
                        className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500" />
                      نشطة
                    </label>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button type="button" onClick={savePlan} disabled={savingPlan}
                      className="h-9 px-4 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                      حفظ
                    </button>
                    <button type="button" onClick={() => setEditingPlan(null)}
                      className="h-9 px-4 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-bold cursor-pointer hover:bg-slate-100 transition-all">
                      إلغاء
                    </button>
                  </div>
                </div>
              )}

              {plans.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">لا خطط بعد — أنشئ أول خطة حين تكتمل دراسة التسعير.</p>
              ) : (
                plans.map(plan => (
                  <div key={plan.id} className="bg-slate-50 rounded-xl px-4 py-3 mb-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="font-bold text-sm text-slate-900">{plan.name}</span>
                      <span className="text-[10px] rounded-full px-2 py-0.5 bg-slate-100 text-slate-600">
                        {plan.price} {settings.currency} / {plan.duration_months} شهر
                      </span>
                      {plan.free_months > 0 && (
                        <span className="text-[10px] rounded-full px-2 py-0.5 bg-slate-100 text-slate-600">+{plan.free_months} مجاناً</span>
                      )}
                      {plan.seats_limit && (
                        <span className="text-[10px] rounded-full px-2 py-0.5 bg-slate-100 text-slate-600">{plan.subscriptions_count}/{plan.seats_limit} مقعد</span>
                      )}
                      {plan.lifetime_price && (
                        <span className="text-[10px] rounded-full px-2 py-0.5 bg-amber-50 text-amber-700">مثبّت مدى الحياة</span>
                      )}
                      {!plan.is_active && (
                        <span className="text-[10px] rounded-full px-2 py-0.5 bg-slate-200 text-slate-600">مؤرشفة</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button type="button" onClick={() => setEditingPlan(plan)} aria-label="تعديل"
                        className="text-slate-500 hover:text-slate-900 cursor-pointer">
                        <PencilSimple size={14} weight="bold" aria-hidden="true" />
                      </button>
                      <button type="button" onClick={() => deletePlan(plan)} aria-label="حذف"
                        className="text-rose-500 hover:text-rose-700 cursor-pointer">
                        <Trash size={14} weight="bold" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* القسم 3 — العروض */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-slate-900">العروض</h2>
                <button type="button"
                  onClick={() => setEditingPromo({ name: '', discount_type: 'percent', discount_value: 0, code: '', valid_from: '', valid_to: '', max_uses: null, is_active: true })}
                  className="h-8 px-3 flex items-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer transition-all">
                  <Plus size={14} weight="bold" aria-hidden="true" />
                  عرض جديد
                </button>
              </div>

              {editingPromo && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5 mb-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <label className="block">
                      <span className="block text-[11px] font-semibold text-slate-500 mb-1">اسم العرض</span>
                      <input type="text" value={editingPromo.name ?? ''} placeholder="الاسم"
                        onChange={e => setEditingPromo({ ...editingPromo, name: e.target.value })}
                        className="h-9 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900 w-full" />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-semibold text-slate-500 mb-1">نوع الخصم</span>
                      <div className="flex gap-1.5">
                        <button type="button" onClick={() => setEditingPromo({ ...editingPromo, discount_type: 'percent' })}
                          className={`flex-1 h-9 rounded-lg text-xs font-bold cursor-pointer transition-all ${editingPromo.discount_type === 'percent' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
                          نسبة %
                        </button>
                        <button type="button" onClick={() => setEditingPromo({ ...editingPromo, discount_type: 'amount' })}
                          className={`flex-1 h-9 rounded-lg text-xs font-bold cursor-pointer transition-all ${editingPromo.discount_type === 'amount' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
                          مبلغ
                        </button>
                      </div>
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-semibold text-slate-500 mb-1">قيمة الخصم</span>
                      <input type="number" min={0} value={editingPromo.discount_value ?? ''} placeholder="القيمة"
                        onChange={e => setEditingPromo({ ...editingPromo, discount_value: Number(e.target.value) })}
                        className="h-9 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900 w-full" />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-semibold text-slate-500 mb-1">الكود (اختياري)</span>
                      <input type="text" value={editingPromo.code ?? ''} placeholder="الكود (اختياري)"
                        onChange={e => setEditingPromo({ ...editingPromo, code: e.target.value })}
                        className="h-9 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900 w-full" />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-semibold text-slate-500 mb-1">صالح من</span>
                      <input type="date" value={editingPromo.valid_from ?? ''} placeholder="من تاريخ"
                        onChange={e => setEditingPromo({ ...editingPromo, valid_from: e.target.value })}
                        className="h-9 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900 w-full" />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-semibold text-slate-500 mb-1">صالح إلى</span>
                      <input type="date" value={editingPromo.valid_to ?? ''} placeholder="إلى تاريخ"
                        onChange={e => setEditingPromo({ ...editingPromo, valid_to: e.target.value })}
                        className="h-9 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900 w-full" />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-semibold text-slate-500 mb-1">حد الاستخدام (فارغ = بلا حد)</span>
                      <input type="number" min={1} value={editingPromo.max_uses ?? ''} placeholder="حد الاستخدام (فارغ = بلا حد)"
                        onChange={e => setEditingPromo({ ...editingPromo, max_uses: e.target.value === '' ? null : Number(e.target.value) })}
                        className="h-9 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900 w-full" />
                    </label>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={editingPromo.is_active ?? true}
                        onChange={e => setEditingPromo({ ...editingPromo, is_active: e.target.checked })}
                        className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500" />
                      نشط
                    </label>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button type="button" onClick={savePromo} disabled={savingPromo}
                      className="h-9 px-4 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                      حفظ
                    </button>
                    <button type="button" onClick={() => setEditingPromo(null)}
                      className="h-9 px-4 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-bold cursor-pointer hover:bg-slate-100 transition-all">
                      إلغاء
                    </button>
                  </div>
                </div>
              )}

              {promos.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">لا عروض حالياً</p>
              ) : (
                promos.map(promo => (
                  <div key={promo.id} className="bg-slate-50 rounded-xl px-4 py-3 mb-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="font-bold text-sm text-slate-900">{promo.name}</span>
                      <span className="text-[10px] rounded-full px-2 py-0.5 bg-slate-100 text-slate-600">
                        {promo.discount_type === 'percent' ? `${promo.discount_value}%` : `${promo.discount_value} ${settings.currency}`}
                      </span>
                      {promo.code && (
                        <span dir="ltr" className="text-[10px] font-mono rounded-full px-2 py-0.5 bg-slate-100 text-slate-600">{promo.code}</span>
                      )}
                      <span className="text-[10px] rounded-full px-2 py-0.5 bg-slate-100 text-slate-600">
                        {promo.used_count}/{promo.max_uses ?? '∞'} استخدام
                      </span>
                      {(promo.valid_from || promo.valid_to) && (
                        <span className="text-[10px] rounded-full px-2 py-0.5 bg-slate-100 text-slate-600">
                          من {promo.valid_from ?? '—'} إلى {promo.valid_to ?? '—'}
                        </span>
                      )}
                      {!promo.is_active && (
                        <span className="text-[10px] rounded-full px-2 py-0.5 bg-slate-200 text-slate-600">متوقف</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button type="button" onClick={() => setEditingPromo(promo)} aria-label="تعديل"
                        className="text-slate-500 hover:text-slate-900 cursor-pointer">
                        <PencilSimple size={14} weight="bold" aria-hidden="true" />
                      </button>
                      <button type="button" onClick={() => deletePromo(promo)} aria-label="حذف"
                        className="text-rose-500 hover:text-rose-700 cursor-pointer">
                        <Trash size={14} weight="bold" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {confirmDialog}
      <Toast notice={notice} />
    </div>
  );
}
