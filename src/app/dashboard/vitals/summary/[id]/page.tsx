'use client';
import { useEffect, useState, use } from 'react';
import { supabase } from '@/lib/supabase';
import { getPharmacyId } from '@/lib/tenant';
import BpHistoryChart from '@/components/BpHistoryChart';
import SugarHistoryChart from '@/components/SugarHistoryChart';
import WeightHistoryChart from '@/components/WeightHistoryChart';
import Link from 'next/link';

interface VisitationRecord {
  id: string;
  patient_id: string;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  heart_rate: number | null;
  is_dual_bp: boolean | null;
  bp_sys1: number | null;
  bp_dia1: number | null;
  hr1: number | null;
  bp_sys2: number | null;
  bp_dia2: number | null;
  hr2: number | null;
  sugar_value: number | null;
  sugar_test_type: string | null;
  weight: number | null;
  symptoms: string[] | null;
  had_stimulants: boolean;
  recent_exertion: boolean;
  recent_heavy_meal: boolean;
  is_stressed: boolean;
  took_bp_medication: boolean | null;
  took_sugar_medication: boolean | null;
  pharmacist_summary: string | null;
  medications_alert: string | null;
  recommendations_snapshot: { id: string; category: string; brand_name: string; price: number | null; ai_pitch_prompt: string | null; excluded: boolean }[] | null;
  ai_report_output: string | null;
  performed_by: string | null;
  created_at: string;
}
interface Patient { id: string; name: string; }
interface WeightPlan {
  id: string;
  weight_kg: number;
  bmi: number;
  bmi_category: string;
  ideal_weight_min: number;
  ideal_weight_max: number;
  target_loss_kg: number;
  first_goal_kg: number;
  nutrition_plan: { clinical_reasoning?: string; pharmacy_products?: { category_code: string; reason: string }[]; lab_alerts?: string[] } | null;
  created_at: string;
}

const bpSymptomsList = ['صداع', 'دوخة', 'زغللة عين', 'طنين أذن', 'ألم بالصدر', 'ضيق تنفس'];
const sugarSymptomsList = ['عطش شديد', 'تبول متكرر', 'جفاف فم', 'خدران أطراف', 'تعرق بارد', 'جوع مفاجئ'];
const FACTOR_LABEL: Record<string, string> = {
  had_stimulants: 'شرب قهوة / شاي / مكيّف',
  recent_exertion: 'مجهود بدني مؤخراً',
  recent_heavy_meal: 'تناول وجبة دسمة مؤخراً',
  is_stressed: 'يشعر بتوتر أو قلق',
};
function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ar-EG', { numberingSystem: 'latn' });
}

export default function VitalsSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [visit, setVisit] = useState<VisitationRecord | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [history, setHistory] = useState<VisitationRecord[]>([]);
  const [weightPlan, setWeightPlan] = useState<WeightPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const pid = await getPharmacyId();
        if (!pid) { setError('تعذّر تحديد الصيدلية.'); setLoading(false); return; }
        const { data: v, error: vErr } = await supabase
          .from('visitations').select('*').eq('id', id).eq('pharmacy_id', pid).single();
        if (vErr || !v) { setError('لم يتم العثور على هذه الزيارة.'); setLoading(false); return; }
        setVisit(v as VisitationRecord);
        const { data: p } = await supabase.from('patients').select('id, name').eq('id', v.patient_id).single();
        if (p) setPatient(p as Patient);
        const { data: hist } = await supabase
          .from('visitations').select('*').eq('patient_id', v.patient_id).eq('pharmacy_id', pid)
          .order('created_at', { ascending: false });
        if (hist) setHistory(hist as VisitationRecord[]);
        const { data: wp } = await supabase
          .from('weight_plans').select('*').eq('visitation_id', v.id).eq('pharmacy_id', pid).maybeSingle();
        if (wp) setWeightPlan(wp as WeightPlan);
      } catch {
        setError('حدث خطأ أثناء تحميل الزيارة.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-slate-400">جارٍ التحميل...</div>;
  }
  if (error || !visit) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-bold text-slate-600">{error || 'تعذّر تحميل الزيارة.'}</p>
        <Link href="/dashboard/vitals" className="text-xs font-bold text-teal-600 hover:underline">العودة لشاشة الفحوصات</Link>
      </div>
    );
  }

  const hasBp = visit.bp_systolic != null;
  const hasSugar = visit.sugar_value != null;
  const symptoms = visit.symptoms || [];
  const bpFactorsList = (['had_stimulants', 'recent_exertion', 'is_stressed'] as const).filter(k => (visit as any)[k]);
  const sugarFactorsList = (['had_stimulants', 'recent_heavy_meal', 'is_stressed'] as const).filter(k => (visit as any)[k]);

  return (
    <div className="min-h-screen bg-slate-50/50" dir="rtl">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <Link href="/dashboard/vitals" className="text-xs font-bold text-slate-500 hover:text-slate-700 flex items-center gap-1">
            ← العودة
          </Link>
          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
            عرض أرشيفي — قراءة فقط
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col items-start gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-slate-400" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="8" r="3.5" />
                  <path d="M5 21c0-4.42 3.13-8 7-8s7 3.58 7 8" />
                </svg>
              </div>
              <div>
                <p className="text-base font-black text-slate-900">{patient?.name || '—'}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {[hasBp && 'ضغط', hasSugar && 'سكري'].filter(Boolean).join(' · ')} · {formatDate(visit.created_at)}
                  {visit.performed_by && ` · بواسطة ${visit.performed_by}`}
                </p>
              </div>
            </div>
          </div>

          <div className="px-5 pt-4">
            <div className={hasBp && hasSugar ? 'grid grid-cols-2 gap-4' : ''}>
              {hasBp && (
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[34px] font-black text-slate-900 leading-none">{visit.bp_systolic}/{visit.bp_diastolic}</span>
                    <span className="text-sm text-slate-400">مم زئبق</span>
                  </div>
                  <div className="h-px bg-slate-200 my-3.5" />
                  <div className="flex text-center">
                    <div className="flex-1">
                      <p className="text-xl font-black text-slate-900">{visit.heart_rate ?? '—'}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">نبض/دقيقة</p>
                    </div>
                  </div>
                </div>
              )}
              {hasSugar && (
                <div className={hasBp ? 'border-r border-slate-200 pr-4' : ''}>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[34px] font-black text-slate-900 leading-none">{visit.sugar_value}</span>
                    <span className="text-sm text-slate-400">mg/dL</span>
                  </div>
                  <div className="h-px bg-slate-200 my-3.5" />
                  <div className="flex justify-center text-center">
                    <div>
                      <p className="text-base font-black text-slate-700">
                        {visit.sugar_test_type === 'fasting' ? 'صائم' : visit.sugar_test_type === 'postprandial' ? 'بعد الأكل' : 'عشوائي'}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">نوع القراءة</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {hasBp && <BpHistoryChart bpHistory={history.filter((v): v is VisitationRecord & { bp_systolic: number; bp_diastolic: number } => v.bp_systolic != null && v.bp_diastolic != null).slice().reverse()} formatDate={formatDate} />}
          {hasSugar && <SugarHistoryChart sugarHistory={history.filter((v): v is VisitationRecord & { sugar_value: number } => v.sugar_value != null).slice().reverse()} formatDate={formatDate} />}

          <div className="px-5 pb-2 pt-2">
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3">
              <p className="text-xs font-bold text-slate-400">ملخص للصيدلاني — لا يصل للمريض</p>
              <div className={hasBp && hasSugar ? 'grid grid-cols-2 gap-3 items-start' : ''}>
                {hasBp && (
                  <div className="space-y-2">
                    <p className="text-sm font-bold text-slate-700 border-b border-slate-200 pb-1">ضغط الدم</p>
                    {visit.is_dual_bp && visit.bp_sys1 && visit.bp_sys2 ? (
                      <div className="text-sm text-slate-700 space-y-0.5">
                        <div className="flex gap-3"><span className="text-slate-500 font-bold">ق١:</span><span>{visit.bp_sys1}/{visit.bp_dia1} مم{visit.hr1 ? ` · نبض ${visit.hr1}` : ''}</span></div>
                        <div className="flex gap-3"><span className="text-slate-500 font-bold">ق٢:</span><span>{visit.bp_sys2}/{visit.bp_dia2} مم{visit.hr2 ? ` · نبض ${visit.hr2}` : ''}</span></div>
                        <div className="flex gap-3 font-bold text-slate-900"><span className="text-slate-500">معدّل:</span><span>{visit.bp_systolic}/{visit.bp_diastolic} مم{visit.heart_rate ? ` · نبض ${visit.heart_rate}` : ''}</span></div>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-700">
                        <span className="text-slate-500 font-bold ml-2">قراءة مفردة:</span>
                        <span>{visit.bp_systolic}/{visit.bp_diastolic} مم{visit.heart_rate ? ` · نبض ${visit.heart_rate}` : ''}</span>
                      </div>
                    )}
                    {visit.took_bp_medication != null && (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-500">دواء الضغط:</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${visit.took_bp_medication ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'}`}>
                          {visit.took_bp_medication ? 'أخذه ✓' : 'لم يأخذه'}
                        </span>
                      </div>
                    )}
                    {symptoms.filter(s => bpSymptomsList.includes(s)).length > 0 && (
                      <div>
                        <p className="text-[11px] font-bold text-slate-500 mb-1">أعراض مصاحبة</p>
                        <div className="flex flex-wrap gap-1">
                          {symptoms.filter(s => bpSymptomsList.includes(s)).map(s => (
                            <span key={s} className="text-xs font-bold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-lg">{s}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {bpFactorsList.length > 0 && (
                      <div>
                        <p className="text-[11px] font-bold text-slate-500 mb-1">عوامل مؤثرة</p>
                        <div className="flex flex-wrap gap-1">
                          {bpFactorsList.map(f => (
                            <span key={f} className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">{FACTOR_LABEL[f]}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {hasSugar && (
                  <div className={`space-y-2 ${hasBp ? 'border-r border-slate-200 pr-3' : ''}`}>
                    <p className="text-sm font-bold text-slate-700 border-b border-slate-200 pb-1">السكري</p>
                    <div className="text-sm text-slate-700">
                      <span className="font-bold text-slate-900">{visit.sugar_value}</span>
                      <span className="text-slate-400 mr-1"> mg/dL</span>
                      <span className="mr-2"> · {visit.sugar_test_type === 'fasting' ? 'صائم' : visit.sugar_test_type === 'postprandial' ? 'بعد الأكل' : 'عشوائي'}</span>
                    </div>
                    {visit.took_sugar_medication != null && (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-500">دواء السكري:</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${visit.took_sugar_medication ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'}`}>
                          {visit.took_sugar_medication ? 'أخذه ✓' : 'لم يأخذه'}
                        </span>
                      </div>
                    )}
                    {symptoms.filter(s => sugarSymptomsList.includes(s)).length > 0 && (
                      <div>
                        <p className="text-[11px] font-bold text-slate-500 mb-1">أعراض مصاحبة</p>
                        <div className="flex flex-wrap gap-1">
                          {symptoms.filter(s => sugarSymptomsList.includes(s)).map(s => (
                            <span key={s} className="text-xs font-bold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-lg">{s}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {sugarFactorsList.length > 0 && (
                      <div>
                        <p className="text-[11px] font-bold text-slate-500 mb-1">عوامل مؤثرة</p>
                        <div className="flex flex-wrap gap-1">
                          {sugarFactorsList.map(f => (
                            <span key={f} className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">{FACTOR_LABEL[f]}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {visit.pharmacist_summary && (
                <p className="text-[15px] text-slate-800 leading-relaxed font-medium">{visit.pharmacist_summary}</p>
              )}
              {visit.medications_alert && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <p className="text-[11px] font-bold text-amber-700 mb-0.5">تنبيه الأدوية</p>
                  <p className="text-[13px] text-amber-800 leading-relaxed">{visit.medications_alert}</p>
                </div>
              )}
              {visit.recommendations_snapshot && visit.recommendations_snapshot.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-slate-500 mb-1.5">المنتجات المقترحة وقت الإرسال</p>
                  <div className="space-y-1">
                    {visit.recommendations_snapshot.map(p => (
                      <div key={p.id} className={`text-xs leading-relaxed ${p.excluded ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                        <span className="font-bold">{p.brand_name}</span>
                        {p.price != null && <span className="text-slate-400"> · <span dir="ltr" className="inline-block">{p.price}</span> د.أ</span>}
                        {p.excluded && <span className="text-[10px] text-rose-400 mr-1">(مُستبعد)</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {visit.ai_report_output && (
            <div className="px-5 pb-5 pt-2">
              <p className="text-[11px] font-bold text-slate-400 mb-2">النص المُرسَل للمريض</p>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm text-slate-700 leading-relaxed font-medium">
                {visit.ai_report_output}
              </div>
            </div>
          )}
        </div>

        {weightPlan && (
          <div className="bg-white border border-purple-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
              <p className="text-base font-black text-slate-900">{patient?.name || '—'}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">فحص وزن · {formatDate(weightPlan.created_at)}</p>
            </div>
            <div className="px-5 pt-4">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[34px] font-black text-slate-900 leading-none">{weightPlan.weight_kg}</span>
                <span className="text-sm text-slate-400">كغ حالياً</span>
                <span className="mr-auto text-[13px] font-bold text-purple-700">BMI {weightPlan.bmi} · {weightPlan.bmi_category}</span>
              </div>
              <div className="h-px bg-slate-200 my-3.5" />
              <div className="flex text-center mb-4">
                <div className="flex-1">
                  <p className="text-xl font-black text-slate-900">{weightPlan.target_loss_kg}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">الفرق عن المثالي (كغ)</p>
                </div>
                <div className="w-px bg-slate-200" />
                <div className="flex-1">
                  <p className="text-xl font-black text-slate-900">{weightPlan.first_goal_kg}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">الهدف المبدئي (كغ)</p>
                </div>
                <div className="w-px bg-slate-200" />
                <div className="flex-1">
                  <p className="text-xl font-black text-slate-900">{((weightPlan.ideal_weight_min + weightPlan.ideal_weight_max) / 2).toFixed(1)}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">الوزن المثالي (كغ)</p>
                </div>
              </div>
            </div>
            <WeightHistoryChart weightHistory={history.filter((v): v is VisitationRecord & { weight: number } => v.weight != null).slice().reverse()} formatDate={formatDate} />
            {weightPlan.nutrition_plan?.clinical_reasoning && (
              <div className="px-5 pb-2">
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-bold text-slate-400">ملخص للصيدلاني — لا يصل للمريض</p>
                  <p className="text-[15px] text-slate-800 leading-relaxed font-medium">{weightPlan.nutrition_plan.clinical_reasoning}</p>
                  {weightPlan.nutrition_plan.pharmacy_products && weightPlan.nutrition_plan.pharmacy_products.length > 0 && (
                    <div>
                      <p className="text-[11px] font-bold text-slate-500 mb-1.5">المكمّلات المقترحة</p>
                      <div className="space-y-1">
                        {weightPlan.nutrition_plan.pharmacy_products.map((p, i) => (
                          <p key={i} className="text-xs text-slate-700"><span className="font-bold">{p.category_code}</span> — {p.reason}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="px-5 pb-5 pt-2">
              <button onClick={() => window.open(`/weight/${weightPlan.id}`, '_blank')}
                className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-slate-200 text-purple-700 rounded-xl text-xs font-bold transition hover:bg-purple-50">
                عرض خطة الوزن الكاملة
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
