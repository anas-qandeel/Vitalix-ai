'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-fetch';
import Toast, { useNotice } from '@/components/Toast';
import { X } from '@phosphor-icons/react';

type Plan = { id: string; name: string; price: number; duration_months: number; free_months: number; seats_limit: number | null; lifetime_price: boolean; is_active: boolean; subscriptions_count: number };
type Promo = { id: string; name: string; discount_type: 'percent' | 'amount'; discount_value: number; code: string | null; is_active: boolean };
type Quote = { starts_on: string; ends_on: string; status: string; list_price: number; discount: number; final_price: number };

type Props = {
  pharmacy: { id: string; name: string; expiry_date: string | null; status: string };
  onClose: () => void;
  onSaved: () => void;
};

export default function SubscriptionModal({ pharmacy, onClose, onSaved }: Props) {
  const { notice, setNotice } = useNotice();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [currency, setCurrency] = useState('JOD');

  const [planId, setPlanId] = useState('');
  const [promoId, setPromoId] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [paidNow, setPaidNow] = useState('');
  const [note, setNote] = useState('');

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [plansRes, promosRes, settingsRes] = await Promise.all([
        adminFetch('/api/admin/plans'),
        adminFetch('/api/admin/promotions'),
        adminFetch('/api/admin/settings'),
      ]);
      if (!plansRes.ok || !promosRes.ok || !settingsRes.ok) {
        setNotice({ kind: 'err', text: 'تعذّر جلب البيانات' });
        return;
      }
      const [plansJson, promosJson, settingsJson] = await Promise.all([
        plansRes.json().catch(() => ({})),
        promosRes.json().catch(() => ({})),
        settingsRes.json().catch(() => ({})),
      ]);
      setPlans((plansJson.data ?? []).filter((p: Plan) => p.is_active));
      setPromos((promosJson.data ?? []).filter((p: Promo) => p.is_active));
      if (settingsJson.data?.currency) setCurrency(settingsJson.data.currency);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // معاينة حية عبر dry_run — كل الحسابات (التواريخ، الخصم، المستحق) تأتي من الخادم حصراً
  useEffect(() => {
    setQuoting(true);
    const t = setTimeout(async () => {
      const res = await adminFetch('/api/admin/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pharmacy_id: pharmacy.id,
          plan_id: planId || null,
          promotion_id: promoId || null,
          starts_on: startsOn || null,
          paid_now: 0,
          dry_run: true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setQuote(json.quote);
      } else {
        setQuote(null);
        setNotice({ kind: 'err', text: json.error || 'تعذّر حساب المعاينة' });
      }
      setQuoting(false);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, promoId, startsOn]);

  const handleConfirm = async () => {
    if (!quote || saving) return;
    setSaving(true);
    const res = await adminFetch('/api/admin/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pharmacy_id: pharmacy.id,
        plan_id: planId || null,
        promotion_id: promoId || null,
        starts_on: startsOn || null,
        paid_now: Number(paidNow || 0),
        note,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      onSaved();
      onClose();
    } else {
      setNotice({ kind: 'err', text: json.error || 'فشل تأكيد الاشتراك' });
    }
    setSaving(false);
  };

  return (
    <div dir="rtl" className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">اشتراك / تجديد</h3>
            <p className="text-xs text-slate-400 mt-1">
              {pharmacy.name} · الحالة الحالية: {pharmacy.status}
              {pharmacy.expiry_date && ` · ينتهي في ${pharmacy.expiry_date}`}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق"
            className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X size={16} weight="bold" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="block text-[11px] font-semibold text-slate-500 mb-1">الخطة</span>
            <select value={planId} onChange={e => setPlanId(e.target.value)}
              className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900">
              <option value="">تجريبي (بحسب إعدادات المنصة)</option>
              {plans.map(plan => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} — {plan.price} {currency} / {plan.duration_months} شهر
                  {plan.free_months > 0 ? ` +${plan.free_months} مجاناً` : ''}
                  {plan.seats_limit ? ` · ${plan.subscriptions_count}/${plan.seats_limit} مقعد` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-[11px] font-semibold text-slate-500 mb-1">العرض (اختياري)</span>
            <select value={promoId} onChange={e => setPromoId(e.target.value)} disabled={!planId}
              className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed">
              <option value="">بدون عرض</option>
              {promos.map(promo => (
                <option key={promo.id} value={promo.id}>
                  {promo.name} — {promo.discount_type === 'percent' ? `${promo.discount_value}%` : `${promo.discount_value} ${currency}`}
                  {promo.code ? ` (${promo.code})` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-[11px] font-semibold text-slate-500 mb-1">تاريخ البداية</span>
            <input type="date" value={startsOn} onChange={e => setStartsOn(e.target.value)}
              className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
            <span className="block text-[11px] text-slate-400 mt-1">اتركه فارغاً ليبدأ من اليوم أو من نهاية الاشتراك الحالي</span>
          </label>

          <label className="block">
            <span className="block text-[11px] font-semibold text-slate-500 mb-1">{`المدفوع الآن (${currency})`}</span>
            <input type="number" min={0} value={paidNow} onChange={e => setPaidNow(e.target.value)}
              className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
          </label>

          <label className="block">
            <span className="block text-[11px] font-semibold text-slate-500 mb-1">ملاحظة</span>
            <input type="text" value={note} onChange={e => setNote(e.target.value)}
              className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
          </label>

          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-sm">
            {quoting ? (
              <p className="text-slate-400">جارٍ الحساب…</p>
            ) : quote ? (
              <div className="space-y-1.5">
                <p className="text-slate-600">من {quote.starts_on} إلى {quote.ends_on}</p>
                <p className="text-slate-600">السعر: {quote.list_price} {currency}</p>
                <p className="text-slate-600">الخصم: {quote.discount} {currency}</p>
                <p className="font-bold text-slate-900">المستحق: {quote.final_price} {currency}</p>
                {quote.final_price > 0 && paidNow && (
                  <p className="text-slate-600">المتبقي بعد الدفعة: {(quote.final_price - Number(paidNow)).toFixed(2)} {currency}</p>
                )}
                {quote.status === 'trial' && (
                  <p className="text-amber-700">اشتراك تجريبي — لا مستحقات</p>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-5">
          <button type="button" onClick={onClose}
            className="h-10 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-all shadow-sm cursor-pointer">
            إلغاء
          </button>
          <button type="button" onClick={handleConfirm} disabled={!quote || saving}
            className="h-10 flex items-center justify-center rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all">
            تأكيد الاشتراك
          </button>
        </div>
      </div>

      <Toast notice={notice} />
    </div>
  );
}
