'use client';

import { Phone, EnvelopeSimple, MapPin, Users, Pulse, Package, Star, Warning, CaretLeft } from '@phosphor-icons/react';

export type OverviewRow = {
  id: string;
  name: string;
  pharmacist_name: string | null;
  phone_number: string | null;
  email: string | null;
  city_address: string | null;
  country: string | null;
  status: string;
  short_code: string | null;
  max_staff: number | null;
  created_at: string;
  sub_status: string | null;
  sub_ends_on: string | null;
  sub_plan_name: string | null;
  sub_lifetime: boolean | null;
  sub_final_price: number | null;
  sub_paid_amount: number | null;
  patients_count: number;
  chronic_count: number;
  visits_30d: number;
  last_visit_at: string | null;
  staff_active: number;
  last_activity_at: string | null;
  uncategorized_count: number;
  ai_tokens_30d: number;
  days_left: number | null;
  expiring_soon: boolean;
  idle_level: 'ok' | 'warning' | 'critical' | 'never';
  idle_days: number | null;
  remaining: number;
};

interface PharmacyCardProps {
  p: OverviewRow;
  currency: string;
  canManage: boolean;
  onOpen: (id: string) => void;
  onSubscribe: (p: OverviewRow) => void;
  onEdit: (p: OverviewRow) => void;
  onToggleSuspend: (p: OverviewRow) => void;
  onPassword: (p: OverviewRow) => void;
}

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

const BTN_BASE = 'h-8 px-3 rounded-lg text-xs font-bold cursor-pointer';

export default function PharmacyCard({ p, currency, canManage, onOpen, onSubscribe, onEdit, onToggleSuspend, onPassword }: PharmacyCardProps) {
  const status = STATUS[p.status] ?? { label: p.status, cls: 'bg-slate-100 text-slate-600 border-slate-200' };
  const planLabel = p.sub_plan_name || (p.sub_status === 'trial' ? 'تجريبي' : 'بلا خطة');
  const daysText = p.days_left === null ? '—' : p.days_left < 0 ? `منتهٍ منذ ${-p.days_left} يوم` : `${p.days_left} يوم`;

  const hasAlerts = p.idle_level !== 'ok' || p.uncategorized_count > 0 || p.ai_tokens_30d > 0;

  return (
    <div dir="rtl" className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col gap-3">
      {/* الرأس */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => onOpen(p.id)} className="font-bold text-slate-900 cursor-pointer hover:underline">
            {p.name}
          </button>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${status.cls}`}>{status.label}</span>
          {p.sub_lifetime && (
            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
              <Star size={12} weight="fill" aria-hidden="true" />
              مؤسس
            </span>
          )}
        </div>
        {p.short_code && <span className="font-mono text-[10px] text-slate-400">{p.short_code}</span>}
      </div>

      {/* التواصل */}
      <div className="text-xs text-slate-600 flex flex-col gap-1">
        {p.pharmacist_name && <p>{p.pharmacist_name}</p>}
        {p.phone_number && (
          <p className="flex items-center gap-1.5">
            <Phone size={13} weight="bold" aria-hidden="true" />
            <a href={`tel:${p.phone_number}`} className="hover:underline">{p.phone_number}</a>
          </p>
        )}
        {p.email && (
          <p className="flex items-center gap-1.5">
            <EnvelopeSimple size={13} weight="bold" aria-hidden="true" />
            {p.email}
          </p>
        )}
        {p.city_address && (
          <p className="flex items-center gap-1.5">
            <MapPin size={13} weight="bold" aria-hidden="true" />
            {p.city_address}{p.country && p.country !== 'الأردن' ? ` - ${p.country}` : ''}
          </p>
        )}
      </div>

      {/* الاشتراك */}
      <div className="bg-slate-50 rounded-xl p-3 text-xs flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-slate-700">
            {planLabel}
            {p.sub_ends_on && <> · ينتهي {fmtDate(p.sub_ends_on)}</>}
          </span>
          <span className={`font-bold ${daysLeftColor(p.days_left)}`}>{daysText}</span>
        </div>
        <div className="flex items-center justify-between text-slate-500">
          <span>مدفوع {(p.sub_paid_amount ?? 0).toLocaleString('en-US')} / {(p.sub_final_price ?? 0).toLocaleString('en-US')} {currency}</span>
          {p.remaining > 0 && <span className="text-amber-700 font-bold">متبقٍ {p.remaining.toLocaleString('en-US')}</span>}
        </div>
      </div>

      {/* الإحصائيات */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="bg-slate-50 rounded-lg py-2">
          <p className="font-bold text-sm text-slate-900">{p.patients_count.toLocaleString('en-US')}</p>
          <p className="text-[10px] text-slate-500">المرضى</p>
        </div>
        <div className="bg-slate-50 rounded-lg py-2">
          <p className="font-bold text-sm text-slate-900">{p.chronic_count.toLocaleString('en-US')}</p>
          <p className="text-[10px] text-slate-500">مزمنون</p>
        </div>
        <div className="bg-slate-50 rounded-lg py-2">
          <p className="font-bold text-sm text-slate-900">{p.visits_30d.toLocaleString('en-US')}</p>
          <p className="text-[10px] text-slate-500">زيارات 30 يوماً</p>
        </div>
        <div className="bg-slate-50 rounded-lg py-2">
          <p className="font-bold text-sm text-slate-900 flex items-center justify-center gap-1">
            <Users size={12} weight="bold" aria-hidden="true" />
            {p.staff_active}/{p.max_staff ?? '—'}
          </p>
          <p className="text-[10px] text-slate-500">موظفون</p>
        </div>
      </div>

      {/* التنبيهات */}
      {hasAlerts && (
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          {p.idle_level === 'warning' && (
            <span className="flex items-center gap-1 text-amber-700">
              <Warning size={12} weight="bold" aria-hidden="true" />
              خاملة منذ {p.idle_days} يوماً
            </span>
          )}
          {p.idle_level === 'critical' && (
            <span className="flex items-center gap-1 text-rose-700">
              <Warning size={12} weight="bold" aria-hidden="true" />
              خاملة منذ {p.idle_days} يوماً
            </span>
          )}
          {p.idle_level === 'never' && (
            <span className="text-slate-400">لا زيارات مسجّلة</span>
          )}
          {p.uncategorized_count > 0 && (
            <span className="flex items-center gap-1 text-amber-700">
              <Package size={12} weight="bold" aria-hidden="true" />
              {p.uncategorized_count} منتج غير مصنّف
            </span>
          )}
          {p.ai_tokens_30d > 0 && (
            <span className="flex items-center gap-1 text-slate-500">
              <Pulse size={12} weight="bold" aria-hidden="true" />
              {p.ai_tokens_30d.toLocaleString('en-US')} توكن (30 يوماً)
            </span>
          )}
        </div>
      )}

      {/* الإجراءات */}
      <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-100">
        <button onClick={() => onOpen(p.id)} className={`${BTN_BASE} bg-white border border-slate-200 text-slate-700 flex items-center gap-1`}>
          التفاصيل
          <CaretLeft size={12} weight="bold" aria-hidden="true" />
        </button>
        {canManage && (
          <>
            <button onClick={() => onSubscribe(p)} className={`${BTN_BASE} bg-slate-900 text-white hover:bg-slate-800`}>
              اشتراك / تجديد
            </button>
            <button onClick={() => onEdit(p)} className={`${BTN_BASE} bg-white border border-slate-200 text-slate-700`}>
              تعديل
            </button>
            <button onClick={() => onPassword(p)} className={`${BTN_BASE} bg-white border border-slate-200 text-slate-700`}>
              كلمة المرور
            </button>
            {p.status === 'suspended' ? (
              <button onClick={() => onToggleSuspend(p)} className={`${BTN_BASE} bg-emerald-600 text-white`}>
                تفعيل
              </button>
            ) : (
              <button onClick={() => onToggleSuspend(p)} className={`${BTN_BASE} bg-white border border-rose-200 text-rose-600`}>
                تعطيل
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
