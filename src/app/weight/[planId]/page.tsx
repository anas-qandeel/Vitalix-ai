'use client';

import { useEffect, useState, use, useRef } from 'react';
import AppFooter from '../../components/AppFooter';
import Disclaimer from '@/components/Disclaimer';
import { SUPPLEMENT_CATEGORIES } from '@/lib/supplement-categories';
import { getBMICategory } from '@/lib/weight-math';
import WeightHistoryChart from '@/components/WeightHistoryChart';

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  SUPPLEMENT_CATEGORIES.map(c => [c.code, c.labelAr])
);

// ════════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════════
interface PharmacyProduct {
  category_code: string;
  reason:        string;
  instruction:   string;
  product: { product_name: string; price: number; image_url: string | null } | null;
}
interface ProgressData {
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
interface NutritionData {
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
interface WeightPlan {
  id: string; weight_kg: number; height_cm: number; bmi: number; bmi_category: string;
  ideal_weight_min: number; ideal_weight_max: number; target_loss_kg: number;
  first_goal_kg: number; nutrition_plan: NutritionData | string | null; created_at: string;
}
interface PatientInfo { name: string; gender: string; birth_date: string | null; }
interface PageData { plan: WeightPlan; patient: PatientInfo; pharmacyName: string; pharmacyPhone: string; }
interface PageProps { params: Promise<{ planId: string }>; }

// ════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('ar-EG', { numberingSystem: 'latn', year: 'numeric', month: 'long', day: 'numeric' });
}
function parseNutrition(raw: NutritionData | string | null): NutritionData | null {
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

// ════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ════════════════════════════════════════════════════════════════════════
function BMIBar({ bmi }: { bmi: number }) {
  const pos = Math.min(Math.max(((bmi - 10) / 35) * 100, 1), 99);
  return (
    <div dir="ltr">
      <div className="relative h-[14px] flex items-center">
        <div
          className="w-full h-2 rounded-full"
          style={{ background: 'linear-gradient(90deg, #85B7EB, #97C459 33%, #FAC775 66%, #F09595)' }}
        />
        <div
          className="absolute bg-white"
          style={{ left: `calc(${pos}% - 3.5px)`, top: 0, width: '3px', height: '14px', border: '2px solid #0b0b0b', borderRadius: '2px', boxSizing: 'content-box' }}
        />
      </div>
      <div className="flex justify-between mt-2">
        {['نحافة', 'طبيعي', 'زيادة', 'سمنة'].map((l) => (
          <span key={l} className="text-[9px] font-semibold text-slate-400">{l}</span>
        ))}
      </div>
    </div>
  );
}

type MealColor = { bg: string; border: string; headerBg: string; headerBorder: string; dot: string; };
function MealSection({ icon, title, color, items }: { icon: string; title: string; color: MealColor; items: string[]; }) {
  return (
    <div className={`bg-white border ${color.border} rounded-2xl shadow-sm overflow-hidden`}>
      <div className={`${color.headerBg} px-5 py-3.5 border-b ${color.headerBorder} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
          <p className="text-sm font-bold text-slate-900">{title}</p>
        </div>
        <span className="text-base">{icon}</span>
      </div>
      <ul className="px-5 py-4 space-y-3">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-3">
            <div className={`w-5 h-5 rounded-lg border ${color.border} ${color.bg} flex items-center justify-center shrink-0 mt-0.5`}>
              <span className="text-[9px] font-black text-slate-500">{i + 1}</span>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">{item}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// اللون بالاتجاه المطلوب لهذا المريض لا بإشارة الرقم دائماً: مريض النحافة
// هدفه الزيادة فزيادته إنجاز، وغيره هدفه النقصان — الصفر محايد في الحالتين.
// لا rose/red — الاتجاه غير المرغوب ليس فشلاً ولا يستحق لوناً تحذيرياً
function ProgressStat({ label, diff, days, goalDirection }: { label: string; diff: number; days: number; goalDirection: 'gain' | 'loss' }) {
  const isOnTrack = diff === 0 ? false : goalDirection === 'gain' ? diff > 0 : diff < 0;
  const color = isOnTrack
    ? { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700' }
    : { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700' };
  const valueText = diff === 0 ? 'ثبات' : `${diff > 0 ? '+' : ''}${diff} كغ`;
  return (
    <div className={`rounded-xl px-3 py-2.5 text-center border ${color.border} ${color.bg}`}>
      <p className="text-[9px] font-bold text-slate-400 mb-1">{label}</p>
      <p className={`text-lg font-black ${color.text}`}>{valueText}</p>
      <p className="text-[9px] text-slate-400 mt-0.5">خلال {days} يوماً</p>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="bg-slate-50/60 px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-slate-200 animate-pulse" />
        <div className="h-3 w-24 bg-slate-200 rounded animate-pulse" />
      </div>
      <div className="px-5 py-4 space-y-3">
        {[90, 75, 85, 65].map((w, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-lg bg-slate-100 animate-pulse shrink-0" />
            <div className="h-3 bg-slate-100 rounded animate-pulse" style={{ width:`${w}%`, animationDelay:`${i*0.1}s` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════
export default function WeightPlanPage({ params }: PageProps) {
  const { planId }  = use(params);
  const [loading,    setLoading]    = useState(true);
  const [pageData,   setPageData]   = useState<PageData | null>(null);
  const [error,      setError]      = useState('');
  const [newArrival, setNewArrival] = useState(false);
  const hadNutritionRef = useRef(false);
  const pollingRef      = useRef<NodeJS.Timeout | null>(null);

  const stopPolling = () => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
  };
  const fetchData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res  = await fetch(`/api/weight-plan?id=${planId}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'رابط غير صالح');
      const nowHas = !!data.plan?.nutrition_plan;
      if (!hadNutritionRef.current && nowHas) { setNewArrival(true); stopPolling(); setTimeout(() => setNewArrival(false), 3500); }
      hadNutritionRef.current = nowHas;
      setPageData(data);
    } catch (e: any) { setError(e.message); }
    finally { if (!silent) setLoading(false); }
  };

  useEffect(() => { fetchData(); return () => stopPolling(); }, [planId]);
  useEffect(() => {
    if (!pageData) return;
    if (!pageData.plan.nutrition_plan) {
      if (!pollingRef.current) pollingRef.current = setInterval(() => fetchData(true), 4000);
    } else { stopPolling(); }
  }, [pageData?.plan?.nutrition_plan]);

  if (loading) return (
    <div className="min-h-screen bg-slate-50/50 flex items-center justify-center" dir="rtl">
      <style jsx global>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&display=swap'); body{font-family:'IBM Plex Sans Arabic',system-ui,sans-serif;}`}</style>
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-slate-200 border-t-purple-600 rounded-full animate-spin" />
        <p className="text-xs font-bold text-slate-400 animate-pulse">جاري تحميل خطتك الصحية...</p>
      </div>
    </div>
  );
  if (error || !pageData) return (
    <div className="min-h-screen bg-slate-50/50 flex items-center justify-center p-6" dir="rtl">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm px-8 py-10 text-center max-w-xs w-full">
        <p className="text-3xl mb-3">⚠️</p>
        <p className="text-sm font-bold text-slate-900">تعذر تحميل الخطة</p>
        <p className="text-xs text-slate-400 mt-1">{error || 'الرابط غير صالح'}</p>
      </div>
    </div>
  );

  const { plan, patient, pharmacyName, pharmacyPhone } = pageData;
  const bmiStyle  = getBMICategory(plan.bmi);
  const nutrition = parseNutrition(plan.nutrition_plan);
  const hasData   = !!nutrition;
  const isSetback = !!nutrition?.progress && nutrition.progress.diffFromPrevious > 0;
  const age       = patient.birth_date ? new Date().getFullYear() - new Date(patient.birth_date).getFullYear() : null;
  const waPhone   = pharmacyPhone?.replace(/[^0-9]/g, '').replace(/^0/, '962') || '';

  const mealColors: Record<string, MealColor> = {
    breakfast: { bg:'bg-amber-50',  border:'border-amber-200',  headerBg:'bg-amber-50/60',  headerBorder:'border-amber-100',  dot:'bg-amber-500'  },
    lunch:     { bg:'bg-teal-50',   border:'border-teal-200',   headerBg:'bg-teal-50/60',   headerBorder:'border-teal-100',   dot:'bg-teal-500'   },
    dinner:    { bg:'bg-blue-50',   border:'border-blue-200',   headerBg:'bg-blue-50/60',   headerBorder:'border-blue-100',   dot:'bg-blue-500'   },
    snacks:    { bg:'bg-purple-50', border:'border-purple-200', headerBg:'bg-purple-50/60', headerBorder:'border-purple-100', dot:'bg-purple-500' },
  };

  return (
    <div className="min-h-screen bg-slate-50/50 antialiased text-slate-900 pb-20" dir="rtl">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&display=swap');
        body { font-family: 'IBM Plex Sans Arabic', system-ui, sans-serif; background: #F8FAFC; }
        @keyframes saasSlideUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .saas-slide-up { animation: saasSlideUp 0.25s ease both; }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        .fade-in { animation: fadeIn 0.3s ease both; }
      `}</style>

      {/* Toast */}
      {newArrival && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 saas-slide-up max-w-[calc(100vw-2rem)]">
          {/* اسم الصيدلية غير محدود الطول — max-w + truncate يمنعان تجاوز عرض الشاشة على الموبايل */}
          <div className="bg-teal-600 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-xl flex items-center gap-2">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="truncate">وصلت خطتك الشخصية من {pharmacyName}!</span>
          </div>
        </div>
      )}

      {/* Header — بهوية الصيدلية بالكامل، بلا أي ذكر لـ Vitalix.ai */}
      <header className="sticky top-0 z-30 overflow-hidden" style={{ background: '#0F6E56' }}>
        <svg className="absolute text-white pointer-events-none" style={{ left: '4%', top: '-10px', width: '78px', height: '78px', opacity: 0.13, transform: 'rotate(-10deg)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971Zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971Z" />
        </svg>
        <svg className="absolute text-white pointer-events-none hidden sm:block" style={{ left: '20%', bottom: '-6px', width: '44px', height: '44px', opacity: 0.11 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 6.5c-.9-1.2-2.3-2-3.8-2C5.9 4.5 4 6.8 4 10c0 5 3.5 9.5 7 9.5s7-4.5 7-9.5c0-3.2-1.9-5.5-4.2-5.5-1.5 0-2.9.8-3.8 2Z" />
          <path d="M12 6.5V4c0-.6.4-1.5 1.2-2" />
          <path d="M12 4c1 0 2 .3 2.5 1" />
        </svg>
        <svg className="absolute text-white pointer-events-none hidden sm:block" style={{ left: '32%', top: '4px', width: '40px', height: '40px', opacity: 0.1 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 19l6-6 4 4 8-8" />
          <circle cx="9" cy="13" r="1" fill="currentColor" stroke="none" />
          <circle cx="13" cy="17" r="1" fill="currentColor" stroke="none" />
          <circle cx="21" cy="9" r="1" fill="currentColor" stroke="none" />
        </svg>
        <svg className="absolute text-white pointer-events-none" style={{ right: '5%', bottom: '2px', width: '32px', height: '32px', opacity: 0.11, transform: 'rotate(25deg)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 4C10 4 4 10 4 18c0 1 0 2 .5 2.5C10 21 20 15 20 4Z" />
          <path d="M6 20c3-3 6-6 10-12" />
        </svg>
        <svg className="absolute text-white pointer-events-none hidden sm:block" style={{ right: '18%', top: '2px', width: '46px', height: '46px', opacity: 0.1 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="8" />
          <path d="M8 12c1-2 2-3 4-3s3 1 4 3" />
          <path d="M8 14c1 1 2 1.5 4 1.5s3-.5 4-1.5" />
        </svg>
        <div className="relative max-w-2xl mx-auto px-4 py-4 sm:py-5 flex items-center gap-3 sm:gap-4">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
            <svg className="text-white" style={{ width: '24px', height: '24px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 21V9l8-5 8 5v12" />
              <path d="M9 21v-6h6v6" />
              <path d="M9 12h.01M9 15h.01M15 12h.01M15 15h.01" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-[19px] sm:text-[24px] font-bold text-white truncate leading-tight">{pharmacyName}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[11px] text-teal-100/90">مستشارك الصحي الموثوق</span>
              <span className="text-[10px] text-white bg-white/15 px-2.5 py-0.5 rounded-full">خطة إدارة الوزن</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-5 space-y-4">

        {/* بطاقة المريض */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden saas-slide-up">
          <div className="bg-slate-50/50 px-5 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${patient.gender === 'female' ? 'bg-pink-50' : 'bg-blue-50'}`}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={patient.gender === 'female' ? '#993556' : '#185FA5'} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M6 21v-2a6 6 0 0112 0v2" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">{patient.name}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {patient.gender === 'female' ? 'أنثى' : 'ذكر'}{age ? ` · ${age} سنة` : ''} · {formatDate(plan.created_at)}
              </p>
            </div>
          </div>
        </div>

        {/* بطاقة تحليل الوزن */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden saas-slide-up">
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
                <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                  <p className="text-xs font-bold text-slate-700 text-center">نبدأ بـ {plan.first_goal_kg} كغ كهدف أول — والمسافة الكاملة {plan.target_loss_kg} كغ نقطعها خطوة خطوة</p>
                  <p className="text-[10px] text-slate-400 text-center mt-1">هذه النسبة الصغيرة تُحسّن طاقتك وتخفف الضغط على مفاصلك</p>
                </div>
              ) : (
                <div className="mt-4 bg-purple-50/60 border border-purple-100 rounded-xl px-4 py-3">
                  <p className="text-xs font-bold text-purple-900 text-center">تحتاج إنقاص {plan.target_loss_kg} كغ للوصول لوزنك المثالي — نبدأ بـ {plan.first_goal_kg} كغ كهدف أول خلال 4–8 أسابيع</p>
                  <p className="text-[10px] text-purple-600 text-center mt-1">هذه النسبة الصغيرة تُحسّن طاقتك وتخفف الضغط على مفاصلك</p>
                </div>
              )
            )}
            {plan.bmi_category === 'underweight' && (
              <div className="mt-4 bg-blue-50/60 border border-blue-100 rounded-xl px-4 py-3">
                <p className="text-xs font-bold text-blue-900 text-center">
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
              <div className="grid grid-cols-2 gap-3">
                <ProgressStat label="منذ البداية"   diff={nutrition.progress.diffFromBaseline} days={nutrition.progress.daysSinceBaseline} goalDirection={plan.bmi_category === 'underweight' ? 'gain' : 'loss'} />
                <ProgressStat label="منذ آخر زيارة" diff={nutrition.progress.diffFromPrevious} days={nutrition.progress.daysSincePrevious} goalDirection={plan.bmi_category === 'underweight' ? 'gain' : 'loss'} />
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

        {/* المحتوى الكامل */}
        {hasData ? (
          <div className="space-y-4 fade-in">

            {/* العادات الذكية */}
            {nutrition.smart_habits && nutrition.smart_habits.length > 0 && (
              <div className="bg-white border border-teal-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="bg-teal-50/60 px-5 py-3.5 border-b border-teal-100 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                  <p className="text-sm font-bold text-slate-900">عادات ذكية تُسرّع نتائجك</p>
                  <span className="text-base mr-auto">💡</span>
                </div>
                <ul className="px-5 py-4 space-y-3">
                  {nutrition.smart_habits.map((habit, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-[9px] font-black text-teal-600">{i + 1}</span>
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed">{habit}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* تحذير دوائي */}
            {nutrition.medications_alert && (
              <div className="bg-white border border-amber-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="bg-amber-50/60 px-5 py-3.5 border-b border-amber-100 flex items-center gap-2">
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

            {/* الفاصل — لا يظهر إذا وصلت كل قوائم الوجبات فارغة (مثال: حالة النحافة) */}
            {(nutrition.breakfast.length > 0 || nutrition.lunch.length > 0 || nutrition.dinner.length > 0 || nutrition.snacks.length > 0) && (
              <div className="flex items-center gap-2 px-1">
                <div className="flex-1 h-px bg-slate-200" />
                <p className="text-[11px] font-bold text-slate-400 whitespace-nowrap">اختر من هذه الخيارات يومياً</p>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
            )}

            {/* قوائم الوجبات */}
            {nutrition.breakfast.length > 0 && (
              <MealSection icon="☀️" title="خيارات الإفطار"      color={mealColors.breakfast} items={nutrition.breakfast} />
            )}
            {nutrition.lunch.length > 0 && (
              <MealSection icon="🍽️" title="خيارات الغداء"        color={mealColors.lunch}     items={nutrition.lunch}     />
            )}
            {nutrition.dinner.length > 0 && (
              <MealSection icon="🌙" title="خيارات العشاء"        color={mealColors.dinner}    items={nutrition.dinner}    />
            )}
            {nutrition.snacks.length > 0 && (
              <MealSection icon="🍎" title="وجبات خفيفة صحية"     color={mealColors.snacks}    items={nutrition.snacks}    />
            )}

            {/* منتجات الصيدلية — Trojan Horse */}
            {nutrition.pharmacy_products && nutrition.pharmacy_products.filter(p => CATEGORY_LABELS[p.category_code]).length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="bg-slate-50/50 px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">مقترحات من {pharmacyName}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">منتجات مختارة لحالتك تحديداً</p>
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {nutrition.pharmacy_products.filter(p => CATEGORY_LABELS[p.category_code]).map((prod, i) => (
                    <div key={i} className="px-5 py-4">
                      <div className="flex items-start gap-3">
                        <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-[10px] font-black text-slate-500">{i + 1}</span>
                        </div>
                        <div className="flex-1">
                          {prod.product ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-bold text-slate-900">{prod.product.product_name}</p>
                              <span className="text-xs font-bold text-slate-700 tabular-nums">{prod.product.price} د.أ</span>
                              <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-2 py-0.5">
                                متوفر في الصيدلية
                              </span>
                            </div>
                          ) : (
                            <div>
                              <p className="text-sm font-bold text-slate-900">{CATEGORY_LABELS[prod.category_code]}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">اسأل {pharmacyName} عن الخيارات المتاحة</p>
                            </div>
                          )}
                          <p className="text-xs text-slate-600 mt-1 leading-relaxed">{prod.reason}</p>
                          <p className="text-[10px] font-bold text-teal-700 mt-1.5 bg-teal-50 border border-teal-100 rounded-lg px-2.5 py-1 inline-block">
                            {prod.instruction}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {waPhone && (
                  <div className="px-5 pb-5 pt-2">
                    <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer"
                      className="w-full flex items-center justify-center gap-2 py-3 bg-[#25D366] hover:bg-[#20BD5A] text-white rounded-xl text-xs font-bold transition shadow-sm active:scale-[0.98]">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                      استشر {pharmacyName} الآن
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* فحوصات مطلوبة */}
            {nutrition.lab_alerts && nutrition.lab_alerts.length > 0 && (
              <div className="bg-white border border-blue-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="bg-blue-50/60 px-5 py-3.5 border-b border-blue-100 flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                  </svg>
                  <p className="text-sm font-bold text-slate-900">فحوصات يُنصح بإجرائها</p>
                </div>
                <ul className="px-5 py-4 space-y-2.5">
                  {nutrition.lab_alerts.map((alert, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-[9px] font-black text-blue-600">{i + 1}</span>
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed">{alert}</p>
                    </li>
                  ))}
                </ul>
                <div className="px-5 pb-4">
                  <p className="text-[11px] text-slate-400">هذه الفحوصات استرشادية — استشر {pharmacyName} للمزيد.</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* حالة الانتظار */
          <div className="space-y-4">
            <div className="bg-white border border-purple-200 rounded-2xl shadow-sm overflow-hidden saas-slide-up">
              <div className="bg-purple-50/60 px-5 py-3.5 border-b border-purple-100 flex items-center gap-2.5">
                <div className="w-3.5 h-3.5 border-2 border-purple-400 border-t-purple-700 rounded-full animate-spin shrink-0" />
                <div>
                  <p className="text-sm font-bold text-purple-900">مستشار التغذية يُعد خطتك الشخصية</p>
                  <p className="text-[10px] text-purple-500 mt-0.5">ستظهر هنا تلقائياً خلال لحظات</p>
                </div>
              </div>
              <div className="px-5 py-4 space-y-2.5">
                {[85, 70, 90, 65].map((w, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-lg bg-slate-100 animate-pulse shrink-0" />
                    <div className="h-3 bg-slate-100 rounded animate-pulse" style={{ width:`${w}%`, animationDelay:`${i*0.12}s` }} />
                  </div>
                ))}
              </div>
            </div>
            <SkeletonCard /><SkeletonCard />
          </div>
        )}

        <Disclaimer variant="patient" />

        {/* Footer */}
        <div className="text-center pt-2 pb-4">
          <AppFooter />
          <p className="text-[10px] text-slate-300 mt-2">أُعدّ هذا التقرير بواسطة {pharmacyName}</p>
        </div>
      </main>
    </div>
  );
}
