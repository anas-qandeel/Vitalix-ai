'use client';

import React from 'react';
import WeightHistoryChart from '@/components/WeightHistoryChart';
import { getBMICategory } from '@/lib/weight-math';

export interface PharmacyProduct {
  category_code: string;
  reason:        string;
  instruction:   string;
  product: { product_name: string; price: number; image_url: string | null } | null;
}
export interface ProgressData {
  baselineWeight:    number;
  baselineDate:      string; // ISO
  previousWeight:    number;
  previousDate:      string; // ISO
  currentWeight:     number;
  diffFromPrevious:  number;
  daysSincePrevious: number;
  diffFromBaseline:  number;
  daysSinceBaseline: number;
  rateWarning:       boolean;
  dataSuspect?:      boolean; // نقصان وزن غير معقول سريرياً — لا تُعرض أرقام التقدّم للمريض
  weightHistory?:    { weight: number; created_at: string }[];
}
export interface NutritionData {
  personal_message:   string;
  smart_habits:       string[];
  breakfast:          string[];
  lunch:              string[];
  dinner:             string[];
  snacks:             string[];
  pharmacy_products:  PharmacyProduct[];
  medications_alert:  string;
  lab_alerts:         string[];
  progress?:          ProgressData | null;
}
export interface WeightPlan {
  id: string; weight_kg: number; height_cm: number; bmi: number; bmi_category: string;
  ideal_weight_min: number; ideal_weight_max: number; target_loss_kg: number;
  first_goal_kg: number; nutrition_plan: NutritionData | string | null; created_at: string;
}

export function parseNutrition(raw: NutritionData | string | null): NutritionData | null {
  if (!raw) return null;
  try {
    // الصفوف القديمة قد تحمل نصاً (قبل تحويل العمود إلى jsonb)، والجديدة تصل ككائن جاهز
    const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (p.breakfast && p.pharmacy_products) return p as NutritionData;
  } catch (e) {
    console.warn('[weight plan] فشل تحليل nutrition_plan:', e);
  }
  return null;
}

function BMIBar({ bmi }: { bmi: number }) {
  const pos = Math.min(Math.max(((bmi - 10) / 35) * 100, 1), 99);
  const cat = getBMICategory(bmi);
  const DOT_COLOR: Record<string, string> = {
    'bg-blue-500': '#3b82f6',
    'bg-teal-500': '#14b8a6',
    'bg-amber-500': '#f59e0b',
    'bg-orange-500': '#f97316',
    'bg-rose-500': '#f43f5e',
  };
  const dotHex = DOT_COLOR[cat.dot] || '#0b0b0b';
  return (
    <div dir="ltr">
      <div className="relative h-[22px] flex items-center">
        <div
          className="w-full h-2.5 rounded-full"
          style={{ background: 'linear-gradient(90deg, #85B7EB, #97C459 33%, #FAC775 66%, #F09595)' }}
        />
        <div
          className="absolute rounded-full bg-white"
          style={{
            left: `calc(${pos}% - 11px)`, top: 0, width: 22, height: 22,
            border: `3px solid ${dotHex}`, boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
            animation: 'bmiDrop 0.6s ease-out',
          }}
        />
      </div>
      <style>{`@keyframes bmiDrop { from { transform: translateY(-8px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }`}</style>
      <div className="flex justify-between items-center mt-3">
        {['نحافة', 'طبيعي', 'زيادة', 'سمنة 1', 'سمنة 2+'].map((l) => {
          const isActive = l === (cat.labelShort === 'سمنة أولى' ? 'سمنة 1' : cat.labelShort === 'سمنة ثانية+' ? 'سمنة 2+' : cat.labelShort);
          return isActive ? (
            <span key={l} dir="rtl" className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cat.bgColor} ${cat.color}`}>{cat.labelShort}</span>
          ) : (
            <span key={l} className="text-[9px] font-medium text-slate-400">{l}</span>
          );
        })}
      </div>
    </div>
  );
}

// اللون بالاتجاه المطلوب لهذا المريض لا بإشارة الرقم دائماً: مريض النحافة
// هدفه الزيادة فزيادته إنجاز، وغيره هدفه النقصان — الصفر محايد في الحالتين.
// لا rose/red — الاتجاه غير المرغوب ليس فشلاً ولا يستحق لوناً تحذيرياً
function ProgressStat({ label, diff, days, goalDirection }: { label: string; diff: number; days: number; goalDirection: 'gain' | 'loss' }) {
  const isOnTrack = diff === 0 ? false : goalDirection === 'gain' ? diff > 0 : diff < 0;
  const valueColor = isOnTrack ? 'text-teal-700' : 'text-slate-900';
  const valueText = diff === 0 ? 'ثبات' : `${diff > 0 ? '+' : ''}${diff} كغ`;
  return (
    <div className="text-center">
      <p className="text-[11px] text-slate-400 mb-1">{label}</p>
      <p className={`text-xl font-black ${valueColor}`}>{valueText}</p>
      <p className="text-[10px] text-slate-400 mt-0.5">خلال {days} يوماً</p>
    </div>
  );
}

export default function WeightPlanReport({ plan, nutrition, formatDate, animate = true }: { plan: WeightPlan; nutrition: NutritionData | null; formatDate: (d: string) => string; animate?: boolean }) {
  const bmiStyle  = getBMICategory(plan.bmi);
  const hasData   = !!nutrition;
  const isSetback = !!nutrition?.progress && nutrition.progress.diffFromPrevious > 0;

  return (
    <>
      {/* بطاقة تحليل الوزن */}
      <div className={`bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden ${animate ? 'saas-slide-up' : ''}`}>
        <div className="px-5 pt-5">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm font-bold text-slate-900">تحليل وزنك الحالي</p>
            <span className={`w-2 h-2 rounded-full ${bmiStyle.dot}`} />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[34px] font-black text-slate-900 leading-none">{plan.weight_kg}</span>
            <span className="text-sm text-slate-400">كغ حالياً</span>
            <span className={`mr-auto text-[13px] font-bold ${bmiStyle.color}`}>BMI {plan.bmi} · {bmiStyle.labelShort}</span>
          </div>
          <div className="h-px bg-slate-200 my-3.5" />
          {plan.target_loss_kg > 0 ? (
            <div className="flex text-center mb-4">
              <div className="flex-1">
                <p className="text-xl font-black text-slate-900">{plan.target_loss_kg}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">نقص مطلوب (كغ)</p>
              </div>
              <div className="w-px bg-slate-200" />
              {plan.first_goal_kg < plan.target_loss_kg && (
                <>
                  <div className="flex-1">
                    <p className="text-xl font-black text-slate-900">{plan.first_goal_kg}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">الهدف المبدئي (كغ)</p>
                  </div>
                  <div className="w-px bg-slate-200" />
                </>
              )}
              <div className="flex-1">
                <p className="text-xl font-black text-slate-900">{((plan.ideal_weight_min + plan.ideal_weight_max) / 2).toFixed(1)}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">الوزن المثالي (كغ)</p>
              </div>
            </div>
          ) : plan.bmi_category === 'underweight' ? (
            <div className="flex text-center mb-4">
              <div className="flex-1">
                <p className="text-xl font-black text-slate-900">{(plan.ideal_weight_min - plan.weight_kg).toFixed(1)}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">زيادة مطلوبة (كغ)</p>
              </div>
              <div className="w-px bg-slate-200" />
              <div className="flex-1">
                <p className="text-xl font-black text-slate-900">—</p>
                <p className="text-[11px] text-slate-400 mt-0.5">الهدف المبدئي</p>
              </div>
              <div className="w-px bg-slate-200" />
              <div className="flex-1">
                <p className="text-xl font-black text-slate-900">{plan.ideal_weight_min}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">الوزن المثالي (كغ)</p>
              </div>
            </div>
          ) : (
            <div className="flex justify-center text-center mb-4">
              <div>
                <p className="text-base font-black text-teal-700">ضمن المثالي</p>
                <p className="text-[11px] text-slate-400 mt-0.5">الحالة</p>
              </div>
            </div>
          )}
          <BMIBar bmi={plan.bmi} />

          <WeightHistoryChart weightHistory={nutrition?.progress?.weightHistory} formatDate={formatDate} />

          <p className="text-[10px] text-slate-500 text-center mt-2">الوزن المثالي: {plan.ideal_weight_min}–{plan.ideal_weight_max} كغ</p>
          {plan.target_loss_kg > 0 && (
            isSetback ? (
              <div className="mt-4 bg-slate-50 rounded-xl px-4 py-3">
                <p className="text-xs font-bold text-slate-900 text-center">نبدأ بـ {plan.first_goal_kg} كغ كهدف أول — والمسافة الكاملة {plan.target_loss_kg} كغ نقطعها خطوة خطوة</p>
                <p className="text-[10px] text-slate-400 text-center mt-1">هذه النسبة الصغيرة تُحسّن طاقتك وتخفف الضغط على مفاصلك</p>
              </div>
            ) : (
              <div className="mt-4 bg-slate-50 rounded-xl px-4 py-3">
                <p className="text-xs font-bold text-slate-900 text-center">تحتاج إنقاص {plan.target_loss_kg} كغ للوصول لوزنك المثالي — نبدأ بـ {plan.first_goal_kg} كغ كهدف أول خلال 4–8 أسابيع</p>
                <p className="text-[10px] text-slate-400 text-center mt-1">هذه النسبة الصغيرة تُحسّن طاقتك وتخفف الضغط على مفاصلك</p>
              </div>
            )
          )}
          {plan.bmi_category === 'underweight' && (
            <div className="mt-4 bg-slate-50 rounded-xl px-4 py-3">
              <p className="text-xs font-bold text-slate-900 text-center">
                {(nutrition?.breakfast?.length ?? 0) > 0 || (nutrition?.lunch?.length ?? 0) > 0 || (nutrition?.dinner?.length ?? 0) > 0 || (nutrition?.snacks?.length ?? 0) > 0
                  ? 'وزنك أقل من المعدل الطبيعي — الخطة أدناه تساعدك على الوصول لوزن صحي تدريجياً. وإن كان هذا النقص حديثاً أو غير مبرَّر، يُنصح بمراجعة الطبيب.'
                  : 'وزنك أقل من المعدل الطبيعي — يُنصح بمراجعة الطبيب لتحديد السبب قبل البدء بأي خطة غذائية.'}
              </p>
            </div>
          )}
        </div>
        {/* بطاقة تقدّم المريض — تظهر فقط عند وجود خطة سابقة مؤهّلة للمقارنة */}
        {nutrition?.progress && !nutrition.progress.dataSuspect && (
          <div className="px-5 pt-4">
            <div className="flex text-center">
              <div className="flex-1">
                <ProgressStat label="منذ آخر زيارة" diff={nutrition.progress.diffFromPrevious} days={nutrition.progress.daysSincePrevious} goalDirection={plan.bmi_category === 'underweight' ? 'gain' : 'loss'} />
              </div>
              <div className="w-px bg-slate-200" />
              <div className="flex-1">
                <ProgressStat label="منذ البداية" diff={nutrition.progress.diffFromBaseline} days={nutrition.progress.daysSinceBaseline} goalDirection={plan.bmi_category === 'underweight' ? 'gain' : 'loss'} />
              </div>
            </div>
          </div>
        )}
        {/* الرسالة الشخصية */}
        {nutrition?.personal_message && (
          <div className="px-5 pb-4 pt-3">
            <p className="text-sm text-slate-700 leading-relaxed font-medium bg-slate-50 border border-slate-100 rounded-xl p-4">
              {nutrition.personal_message}
            </p>
          </div>
        )}
        {!nutrition?.personal_message && <div className="pb-4" />}
      </div>

      {hasData && (
        <div className={`space-y-4 ${animate ? 'fade-in' : ''}`}>

          {/* العادات الذكية */}
          {nutrition.smart_habits && nutrition.smart_habits.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                  <p className="text-sm font-bold text-slate-900">عادات ذكية تُسرّع نتائجك</p>
                </div>
                <svg className="w-[18px] h-[18px] text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" /></svg>
              </div>
              <ul className="px-5 py-4 space-y-3">
                {nutrition.smart_habits.map((habit, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[9px] font-black text-slate-400">{i + 1}</span>
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">{habit}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* تحذير دوائي */}
          {nutrition.medications_alert && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <p className="text-sm font-bold text-slate-900">تنبيه مهم بخصوص أدويتك</p>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm text-slate-700 leading-relaxed">{nutrition.medications_alert}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
