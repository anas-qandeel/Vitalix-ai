'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import DashboardHeader, { usePharmacyInfo } from '../components/DashboardHeader';

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════
interface Patient {
  id: string;
  name: string;
  phone_number: string;
  gender: string;
  birth_date: string;
}

interface ChronicMed {
  id: string;
  patient_id: string;
  pharmacy_id: string;
  medication_name: string;
  pills_per_box: number;
  boxes_count: number;
  daily_dosage: number;
  dosage_unit: string;
  last_refill_date: string;
  next_refill_date: string;
  status: string;
}

type CareStage = 'due' | 'messaged' | 'no_response' | 'renewed' | 'archived';
type DisplayStage = CareStage | 'ok';

interface PipelineRecord {
  id: string;
  pipeline_stage: CareStage;
  reminded_at: string | null;
  updated_at: string;
  cycle_date: string;
  insurance_status: string | null;
}

interface CareCard {
  patient: Patient;
  meds: ChronicMed[];
  daysLeft: number;
  loyaltyMonths: number;
  stage: DisplayStage;
  pipeline: PipelineRecord | null;
  notes: string;
}

// ═══════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════
const MSG_EXPIRY_DAYS = Number(
  typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_MSG_EXPIRY_DAYS != null
    ? process.env.NEXT_PUBLIC_MSG_EXPIRY_DAYS
    : 5
);

// ── Toast ──
interface ToastMsg { id: number; text: string; type: 'success' | 'error' | 'info' }
let toastId = 0;

function useToast() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const show = (text: string, type: ToastMsg['type'] = 'success') => {
    const id = ++toastId;
    setToasts(p => [...p, { id, text, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000);
  };
  return { toasts, show };
}

function ToastContainer({ toasts }: { toasts: ToastMsg[] }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-3 items-center pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={`saas-toast flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-xl border bg-white text-slate-800 text-sm font-medium ${
          t.type === 'success' ? 'border-emerald-200' :
          t.type === 'error'   ? 'border-rose-200' :
          'border-slate-200'
        }`}>
          <span className={`flex items-center justify-center w-6 h-6 rounded-full text-white text-xs ${
            t.type === 'success' ? 'bg-emerald-500' : t.type === 'error' ? 'bg-rose-500' : 'bg-slate-500'
          }`}>
            {t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'i'}
          </span>
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════
function normalizePhone(p: string): string {
  let c = p.replace(/[^0-9]/g, '');
  if (c.startsWith('00962')) c = '0' + c.substring(5);
  else if (c.startsWith('962') && c.length > 10) c = '0' + c.substring(3);
  return c;
}

function calcDaysLeft(d: string): number {
  const today = new Date(); today.setHours(0,0,0,0);
  const next = new Date(d); next.setHours(0,0,0,0);
  return Math.ceil((next.getTime() - today.getTime()) / 86400000);
}

function calcNextRefill(last: string, ppb: number, boxes: number, dose: number): string {
  const base = new Date(last || new Date().toISOString().split('T')[0]);
  if (isNaN(base.getTime())) return new Date().toISOString().split('T')[0];
  const days = Math.floor((ppb * boxes) / Math.max(dose, 0.5));
  base.setDate(base.getDate() + days);
  return base.toISOString().split('T')[0];
}

function calcLoyaltyMonths(meds: ChronicMed[]): number {
  if (!meds.length) return 0;
  const oldest = meds.reduce((a, b) =>
    new Date(a.last_refill_date) < new Date(b.last_refill_date) ? a : b
  );
  return Math.max(0, Math.floor(
    (Date.now() - new Date(oldest.last_refill_date).getTime()) / (1000 * 60 * 60 * 24 * 30)
  ));
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('ar-EG', {
    day: 'numeric', month: 'long', numberingSystem: 'latn',
  });
}

const UNITS: Record<string, string> = {
  pill: 'حبة', drop: 'قطرة', ml: 'مل',
  spoon: 'ملعقة', puff: 'بخة', patch: 'لصقة', unit: 'وحدة',
};

function buildWaLink(phone: string, msg: string): string {
  const clean = phone.replace(/[^0-9]/g, '');
  const withCode = clean.startsWith('0') ? '962' + clean.substring(1) : clean;
  return `https://api.whatsapp.com/send?phone=${withCode}&text=${encodeURIComponent(msg)}`;
}

function buildWaMsg1(patient: Patient, meds: ChronicMed[], pharmacyName: string): string {
  // نذكر فقط الأدوية التي تنفد خلال 3 أيام — نفس حد التظليل في الكارت
  const urgentMeds = meds.filter(m => calcDaysLeft(m.next_refill_date) <= 3);
  const targetMeds = urgentMeds.length > 0 ? urgentMeds : meds;
  const names = targetMeds.map(m => m.medication_name).join(' و');
  const firstName = patient.name.split(' ')[0];
  return `مرحباً ${firstName} 😊\nنتمنى أن تكونوا بأتم الصحة والعافية.\n\nنُبلّغكم من ${pharmacyName} بأن دواء (${names}) سيكفيكم لأيام قليلة.\n\nنحن هنا متى احتجتمونا 🌿`;
}

function buildWaMsg2(patient: Patient, meds: ChronicMed[], pharmacyName: string): string {
  // نفس المنطق — الأدوية الأكثر إلحاحاً فقط
  const urgentMeds = meds.filter(m => calcDaysLeft(m.next_refill_date) <= 3);
  const targetMeds = urgentMeds.length > 0 ? urgentMeds : meds;
  const names = targetMeds.map(m => m.medication_name).join(' و');
  const firstName = patient.name.split(' ')[0];
  return `مرحباً ${firstName} 🌿\nمعكم ${pharmacyName}.\n\nتذكّرنا بكم واحتفظنا بـ (${names}) جاهزاً لكم.\n\nعندما يناسبكم، نحن هنا 😊`;
}

function getTimeOfDay(): 'morning' | 'noon' | 'afternoon' | 'evening' {
  const h = new Date().getHours();
  if (h >= 6  && h < 11) return 'morning';
  if (h >= 11 && h < 14) return 'noon';
  if (h >= 14 && h < 18) return 'afternoon';
  return 'evening';
}

function pickRandom<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

function getSmartTip(card: CareCard): { icon: string; text: string; accent: string } | null {
  const { daysLeft, loyaltyMonths, stage, pipeline, patient } = card;
  const time = getTimeOfDay();
  const seed = patient.id.charCodeAt(0) + new Date().getDate();
  const firstName = patient.name.split(' ')[0];

  if (stage === 'due') {
    if (daysLeft <= 0) return {
      icon: '🚨',
      text: 'نفد الدواء اليوم — تواصل فوراً. المريض المزمن الذي ينقطع عن دوائه قد يلجأ لصيدلية أخرى ولا يعود.',
      accent: 'rose'
    };
    if (daysLeft === 1) return {
      icon: '⚡',
      text: 'يوم واحد فقط — أرسل الرسالة الآن. انتظار الغد يعني أن المريض ربما اشترى من مكان آخر.',
      accent: 'rose'
    };
    if (loyaltyMonths >= 12) return {
      icon: '⭐',
      text: `${firstName} مريض منتظم — رسالة تذكير بسيطة تكفي، علاقتك معه تتكلم عن نفسها.`,
      accent: 'teal'
    };
    if (loyaltyMonths >= 3) {
      const timeHints: Record<string, string> = {
        morning: 'أرسل الآن — الصباح أفضل وقت للتواصل قبل أن يبدأ يومه.',
        noon: 'أرسل رسالة الآن — الاتصال وقت الظهيرة مزعج، الواتساب أفضل.',
        afternoon: 'أرسل بعد الساعة 4 — معظم المرضى يقرؤون رسائلهم بعد الدوام.',
        evening: 'المساء وقت هادئ — رسالة قصيرة الآن ستُقرأ وتُرد غالباً.',
      };
      return { icon: '💡', text: timeHints[time], accent: 'amber' };
    }
    // مسجّل حديثاً في النظام
    return {
      icon: '📋',
      text: 'أرسل رسالة التذكير الآن — المريض الذي يتلقى تذكيراً من صيدليته يشعر أنه ليس مجرد زبون، بل شخص يُهتم بصحته. هذا الشعور هو ما يجعله يعود إليك دون أن يفكر في البديل.',
      accent: 'blue'
    };
  }

  if (stage === 'messaged' && pipeline?.reminded_at) {
    const daysSince = Math.floor((Date.now() - new Date(pipeline.reminded_at).getTime()) / 86400000);
    if (daysSince >= MSG_EXPIRY_DAYS) return {
      icon: '🔔',
      text: `مضت ${daysSince} أيام بدون رد — انقله الآن لقائمة "لم يستجيبوا" حتى لا يُنسى.`,
      accent: 'rose'
    };
    if (daysSince >= 3) return {
      icon: '📩',
      text: 'مضت 3 أيام — إذا أردت رسالة ثانية، غيّر الأسلوب: اسأل عن صحته أولاً دون ذكر الدواء.',
      accent: 'blue'
    };
    return {
      icon: '🕐',
      text: 'أُرسلت للتو — انتظر 24 ساعة قبل أي متابعة. الضغط المبكر يُنفّر المريض.',
      accent: 'teal'
    };
  }

  if (stage === 'no_response' && pipeline?.updated_at) {
    const daysSince = Math.floor((Date.now() - new Date(pipeline.updated_at).getTime()) / 86400000);
    if (daysSince >= 10) return {
      icon: '🔕',
      text: 'أكثر من 10 أيام. حاول مرة أخيرة عبر الاتصال المباشر — إذا لم يرد أغلق الملف.',
      accent: 'slate'
    };
    if (daysSince >= 7) return {
      icon: '📞',
      text: 'أسبوع بدون رد — اتصل به مباشرة. ابدأ بالسلام والسؤال عن صحته، ثم اكتشف بهدوء: هل اشترى من مكان آخر؟ هل تغيّر طبيبه؟ هل واجه مشكلة في الدواء؟ معرفة السبب تساعدك على استعادته.',
      accent: 'blue'
    };
    if (loyaltyMonths >= 6) return {
      icon: '💛',
      text: `${firstName} مريض منتظم لكنه لم يرد — اتصل به شخصياً، هذا النوع من المرضى يستحق الجهد.`,
      accent: 'amber'
    };
    return {
      icon: '☎️',
      text: 'جرّب الاتصال بدلاً من الرسالة — ابدأ بالسؤال عن صحته لا عن الدواء.',
      accent: 'blue'
    };
  }

  return null;
}

// ═══════════════════════════════════════════════════════
// DB HELPERS
// ═══════════════════════════════════════════════════════
async function upsertPipeline(
  pharmacyId: string,
  patientId: string,
  stage: CareStage,
  extra?: { reminded_at?: string }
): Promise<PipelineRecord | null> {
  const today = new Date().toISOString().split('T')[0];
  const row = { pharmacy_id: pharmacyId, patient_id: patientId, payment_type: 'cash', pipeline_stage: stage, cycle_date: today, ...extra };
  const { data: existing } = await supabase.from('refill_tracking_pipeline').select('id').eq('pharmacy_id', pharmacyId).eq('patient_id', patientId).eq('payment_type', 'cash').maybeSingle();
  if (existing?.id) {
    const { data } = await supabase.from('refill_tracking_pipeline').update({ pipeline_stage: stage, cycle_date: today, ...extra }).eq('id', existing.id).select().single();
    return data as PipelineRecord | null;
  } else {
    const { data } = await supabase.from('refill_tracking_pipeline').insert(row).select().single();
    return data as PipelineRecord | null;
  }
}

// ═══════════════════════════════════════════════════════
// MODAL: بحث / إضافة مريض
// ═══════════════════════════════════════════════════════
function AddPatientModal({ pharmacyId, onClose, onAdded, onRenew, prefill }: {
  pharmacyId: string;
  onClose: () => void;
  onAdded: (p: Patient, note?: string, isExistingPatient?: boolean) => void;
  onRenew: (p: Patient, meds: ChronicMed[]) => void;
  prefill?: { patient: Patient; meds: ChronicMed[] } | null; // بيانات المريض عند الرجوع
}) {
  const [query, setQuery]   = useState(prefill?.patient.phone_number || prefill?.patient.name || '');
  const [name, setName]     = useState(prefill?.patient.name || '');
  const [gender, setGender] = useState('male');
  const [dob, setDob]       = useState('1975-01-01');
  const [searching, setSearching] = useState(false);
  const [found, setFound]   = useState<Patient | null>(prefill?.patient || null);
  const [results, setResults] = useState<Patient[]>([]); // نتائج متعددة
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');
  const [patientNote, setPatientNote] = useState('');
  const [foundIsArchived, setFoundIsArchived]   = useState(false);
  const [foundMeds, setFoundMeds] = useState<ChronicMed[]>(prefill?.meds || []);
  const [allPatients, setAllPatients] = useState<Patient[]>([]); // كاش محلي للمرضى
  const [allMeds, setAllMeds]         = useState<ChronicMed[]>([]); // كاش الأدوية للبحث

  // ── تطبيع النص: يوحّد الهمزات ويزيل التشكيل ────────────────────────────
  const normalizeAr = (s: string) =>
    s.trim()
     .replace(/[أإآ]/g, 'ا')
     .replace(/ة/g, 'ه')
     .replace(/ى/g, 'ي')
     .replace(/[\u064B-\u065F]/g, '') // تشكيل
     .toLowerCase();

  // ── جلب كل مرضى الصيدلية وأدويتهم مرة واحدة عند الفتح ─────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const pid = pharmacyId || session?.user?.id || '';
        if (!pid) return;
        const [patientsRes, medsRes] = await Promise.all([
          supabase.from('patients').select('*').eq('pharmacy_id', pid),
          supabase.from('chronic_medications').select('*').eq('pharmacy_id', pid).eq('status', 'active'),
        ]);
        setAllPatients((patientsRes.data || []) as Patient[]);
        setAllMeds((medsRes.data || []) as ChronicMed[]);
      } catch (e) { console.error(e); }
    };
    load();
  }, [pharmacyId]);

  // ── كشف نوع الإدخال ─────────────────────────────────────────────────────
  const detectQueryType = (q: string): 'phone' | 'latin' | 'arabic' => {
    if (/^[\d\s\-+()]+$/.test(q)) return 'phone';
    if (/^[a-zA-Z0-9\s\-./]+$/.test(q)) return 'latin'; // إنجليزي → يبحث في الاسم والدواء معاً
    return 'arabic';
  };

  // ── البحث الذكي ──────────────────────────────────────────────────────────
  // هاتف  → بحث في رقم الهاتف
  // عربي  → بحث في اسم المريض (مع تطبيع الهمزات)
  // لاتيني → بحث في اسم المريض الإنجليزي + اسم الدواء معاً (بدون تمييز الكابيتل)
  const search = async (q: string) => {
    setQuery(q);
    setFound(null);
    setResults([]);
    setName('');
    setFoundMeds([]);
    setFoundIsArchived(false);

    const trimmed = q.trim();
    if (!trimmed) return;

    const qType = detectQueryType(trimmed);

    if (qType === 'phone'  && trimmed.replace(/\D/g, '').length < 3) return;
    if (qType !== 'phone'  && trimmed.length < 2) return;

    setSearching(true);
    try {
      let matches: Patient[] = [];

      if (qType === 'phone') {
        const norm = normalizePhone(trimmed);
        matches = allPatients.filter(r =>
          normalizePhone(r.phone_number).includes(norm) ||
          r.phone_number.includes(trimmed)
        );
      } else if (qType === 'latin') {
        const normQ = trimmed.toLowerCase();
        // أسماء المرضى الإنجليزية
        const byName = allPatients.filter(r =>
          r.name.toLowerCase().includes(normQ)
        );
        // مرضى يأخذون دواءً يطابق الاسم
        const matchedByDrug = new Set(
          allMeds
            .filter(m => m.medication_name.toLowerCase().includes(normQ))
            .map(m => m.patient_id)
        );
        const byDrug = allPatients.filter(r => matchedByDrug.has(r.id));
        // دمج بدون تكرار — الاسم أولاً ثم الدواء
        const seen = new Set(byName.map(r => r.id));
        matches = [...byName, ...byDrug.filter(r => !seen.has(r.id))];
      } else {
        // عربي
        const normQ = normalizeAr(trimmed);
        matches = allPatients.filter(r =>
          normalizeAr(r.name).includes(normQ)
        );
      }

      if (matches.length === 1) {
        await selectPatient(matches[0]);
      } else if (matches.length > 1) {
        setResults(matches);
      }
    } catch (e) { console.error(e); }
    finally { setSearching(false); }
  };

  // ── اختيار مريض من القائمة أو من التطابق الوحيد ────────────────────────
  const selectPatient = async (patient: Patient) => {
    setFound(patient);
    setName(patient.name);
    setResults([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const pid = pharmacyId || session?.user?.id || '';
      const [pipeRes, medsRes] = await Promise.all([
        supabase.from('refill_tracking_pipeline').select('pipeline_stage').eq('pharmacy_id', pid).eq('patient_id', patient.id).eq('payment_type', 'cash').maybeSingle(),
        supabase.from('chronic_medications').select('*').eq('pharmacy_id', pid).eq('patient_id', patient.id).eq('status', 'active'),
      ]);
      setFoundIsArchived(pipeRes.data?.pipeline_stage === 'archived');
      setFoundMeds((medsRes.data || []) as ChronicMed[]);
    } catch (e) { console.error(e); }
  };

  // ── هل المدخل رقم هاتف (لتحديد وضع تسجيل مريض جديد) ──────────────────
  const qType        = detectQueryType(query.trim());
  const isPhoneQuery = qType === 'phone';
  const phoneDigits  = query.trim().replace(/\D/g, '');
  const canRegisterNew = isPhoneQuery && phoneDigits.length >= 8 && !found && results.length === 0;

  // رسائل "لا نتائج" حسب نوع البحث
  const noResultsMsg =
    qType === 'phone'  ? 'لم يُعثر على مريض — أكمل رقم الهاتف لتسجيله' :
    qType === 'latin'  ? 'لا يوجد مريض أو دواء بهذا الاسم' :
    'لم يُعثر على مريض بهذا الاسم';

  const next = async () => {
    setErr('');
    if (found) { onAdded(found, patientNote.trim(), true); return; } // مريض موجود
    if (!canRegisterNew) { setErr('ابحث برقم الهاتف لتسجيل مريض جديد'); return; }
    if (!name.trim()) { setErr('يجب إدخال اسم المريض قبل المتابعة'); return; }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const pid = pharmacyId || session?.user?.id || '';
      const { data, error } = await supabase.from('patients').insert({
        pharmacy_id: pid, name: name.trim(), phone_number: normalizePhone(query), gender, birth_date: dob, diagnosed_conditions: [],
      }).select().single();
      if (error || !data) throw error;
      onAdded(data as Patient, patientNote.trim(), false); // مريض جديد
    } catch (e: any) { setErr(e.message || 'حدث خطأ'); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4 transition-all" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl border border-slate-200 saas-slide-up flex flex-col h-[82vh] sm:h-[78vh]" onClick={e => e.stopPropagation()}>

        {/* Header — ثابت */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
          <h3 className="text-base font-semibold text-slate-900">البحث عن مريض أو تسجيله</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-colors">✕</button>
        </div>

        {/* حقل البحث — ثابت تحت الهيدر */}
        <div className="px-6 pt-5 pb-3 shrink-0">
          <div className="relative">
            <label className="block text-xs font-semibold text-slate-600 mb-2">البحث بالاسم أو رقم الهاتف أو اسم الدواء</label>
            <input type="text" value={query} onChange={e => search(e.target.value)}
              placeholder="" autoFocus dir="auto"
              className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all text-slate-900 shadow-sm" />
            {searching && <div className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />}
          </div>
        </div>

        {/* المنطقة المتمرّرة — تمتد وتتقلص بهدوء دون تحريك الـ modal */}
        <div className="flex-1 overflow-y-auto px-6 pb-3 space-y-4">

          {/* ── نتائج متعددة ── */}
          {results.length > 1 && !found && (
            <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                <p className="text-[11px] font-semibold text-slate-500">
                  {results.length} نتائج
                  {qType === 'latin' ? ` — اسم أو دواء "${query.trim()}"` : ' — اختر المريض'}
                </p>
              </div>
              <div className="divide-y divide-slate-100">
                {results.map(r => {
                  // عند البحث اللاتيني: أظهر الأدوية المطابقة إن وُجدت
                  const matchedDrugs = qType === 'latin'
                    ? allMeds.filter(m => m.patient_id === r.id && m.medication_name.toLowerCase().includes(query.trim().toLowerCase()))
                    : [];
                  // هل الاسم نفسه يطابق أم الدواء فقط؟
                  const nameMatches = qType === 'latin' && r.name.toLowerCase().includes(query.trim().toLowerCase());
                  return (
                    <button key={r.id} onClick={() => selectPatient(r)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-right">
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-700 shrink-0">
                        {r.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{r.name}</p>
                        {!nameMatches && matchedDrugs.length > 0 ? (
                          <p className="text-[11px] text-violet-600 font-medium mt-0.5 truncate">
                            💊 {matchedDrugs.map(m => m.medication_name).join(' · ')}
                          </p>
                        ) : (
                          <p className="text-[11px] text-slate-400 font-mono mt-0.5">{r.phone_number}</p>
                        )}
                      </div>
                      <svg className="w-4 h-4 text-slate-300 shrink-0 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── مريض موجود — بطاقته ── */}
          {found ? (
            <div className={`rounded-xl border overflow-hidden ${foundIsArchived ? 'bg-amber-50/50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
              <div className="px-4 py-3 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${foundIsArchived ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-700'}`}>
                  {found.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${foundIsArchived ? 'text-amber-900' : 'text-slate-900'}`}>{found.name}</p>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">{found.phone_number}</p>
                  {foundIsArchived
                    ? <p className="text-xs text-amber-700 mt-0.5">🔄 كان متواجداً من قبل — سيُعاد تفعيل ملفه</p>
                    : <p className="text-xs text-slate-500 mt-0.5">{foundMeds.length} {foundMeds.length === 1 ? 'دواء مزمن مسجّل' : 'أدوية مزمنة مسجّلة'}</p>
                  }
                </div>
                <button onClick={() => { setFound(null); setResults([]); setFoundMeds([]); }}
                  className="text-[11px] text-slate-400 hover:text-slate-700 font-medium shrink-0 transition-colors px-2 py-2 -m-2">
                  تغيير
                </button>
              </div>
              {!foundIsArchived && foundMeds.length > 0 && (
                <div className="border-t border-slate-200 divide-y divide-slate-100">
                  {[...foundMeds].sort((a,b) => calcDaysLeft(a.next_refill_date) - calcDaysLeft(b.next_refill_date)).map(m => {
                    const d = calcDaysLeft(m.next_refill_date);
                    const unitLabel = UNITS[m.dosage_unit] || m.dosage_unit;
                    return (
                      <div key={m.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-800 truncate">{m.medication_name}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{m.daily_dosage} {unitLabel}/يوم</p>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                          d <= 0 ? 'bg-rose-100 text-rose-700' :
                          d <= 7 ? 'bg-amber-100 text-amber-700' :
                          d <= 14 ? 'bg-orange-100 text-orange-700' :
                          'bg-slate-100 text-slate-500'
                        }`}>
                          {d <= 0 ? 'نفد!' : `${d} ${d === 1 ? 'Day' : 'Days'}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : canRegisterNew ? (
            <div className="space-y-4 pt-1 border-t border-slate-100">
              <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                <span className="text-amber-500 text-sm shrink-0">⚠️</span>
                <p className="text-xs font-semibold text-amber-800">مريض جديد — يرجى إكمال البيانات قبل المتابعة</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">الاسم الكامل</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="الاسم الكامل"
                  className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all text-slate-900 shadow-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">الجنس</label>
                  <div className="flex bg-slate-100 p-1 rounded-lg">
                    {[{ v: 'male', l: 'ذكر' }, { v: 'female', l: 'أنثى' }].map(g => (
                      <button key={g.v} onClick={() => setGender(g.v)}
                        className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${gender === g.v ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
                        {g.l}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">تاريخ الميلاد</label>
                  <input type="date" value={dob} onChange={e => setDob(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all shadow-sm text-slate-900" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">ملاحظة <span className="font-normal text-slate-400">(اختياري)</span></label>
                <textarea value={patientNote} onChange={e => setPatientNote(e.target.value)}
                  placeholder="مثال: خصم ثابت 10%"
                  rows={2} className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all resize-none text-slate-900 shadow-sm" />
              </div>
            </div>
          ) : results.length === 0 && query.trim().length >= 2 && !searching ? (
            <p className="text-sm text-slate-400 text-center py-8">{noResultsMsg}</p>
          ) : query.trim().length < 2 ? (
            <p className="text-sm text-slate-400 text-center py-8">ابدأ بكتابة الاسم أو رقم الهاتف أو اسم الدواء للبحث</p>
          ) : null}
        </div>

        {/* الأزرار — ثابتة في الأسفل */}
        <div className="px-6 pb-6 pt-3 border-t border-slate-100 shrink-0 space-y-3">
          {/* رسالة الخطأ — ثابتة فوق الأزرار دائماً */}
          {err && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 px-4 py-3 rounded-lg">
              <span className="text-rose-500 shrink-0">⚠️</span>
              <p className="text-sm text-rose-700 font-medium">{err}</p>
            </div>
          )}
          {found && !foundIsArchived && foundMeds.length > 0 ? (
            <>
              <button onClick={() => onRenew(found, foundMeds)}
                className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold transition-all active:scale-[0.98] shadow-sm flex items-center justify-center gap-2">
                <span>🔄</span><span>تجديد الأدوية الموجودة</span>
              </button>
              <button onClick={next} disabled={saving}
                className="w-full py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-50 shadow-sm flex items-center justify-center gap-2">
                <span>＋</span><span>{saving ? 'جاري التحضير...' : 'إضافة دواء جديد لملف المريض'}</span>
              </button>
            </>
          ) : (found || canRegisterNew) ? (
            <button onClick={next} disabled={saving}
              className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
              {saving ? 'جاري التحضير...' : found ? 'التالي — تسجيل الأدوية' : 'التالي — تسجيل المريض'}
            </button>
          ) : null}
        </div>

      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MODAL: تسجيل / تجديد الأدوية — تجديد انتقائي بدون DELETE+INSERT
// ═══════════════════════════════════════════════════════
function MedModal({ patientId, pharmacyId, existingMeds, patientName, onClose, onSaved, onBack, isNewPatient }: {
  patientId: string; pharmacyId: string;
  existingMeds: ChronicMed[]; patientName: string;
  onClose: () => void; onSaved: () => void;
  onBack?: () => void;
  isNewPatient?: boolean; // لإظهار banner تأكيد التسجيل
}) {
  const isRenewal = existingMeds.length > 0;
  const today = new Date().toISOString().split('T')[0];
  const [deleting, setDeleting] = useState<string | null>(null);

  const [meds, setMeds] = useState(
    isRenewal
      ? [...existingMeds].sort((a, b) => calcDaysLeft(a.next_refill_date) - calcDaysLeft(b.next_refill_date)).map(m => {
          const willRenew = calcDaysLeft(m.next_refill_date) <= 7;

          // ── الحساب الصحيح للحبات المتبقية ──────────────────────────────────
          // المنطق: الحبات الكلية عند آخر صرف = pills_per_box × boxes_count
          // الحبات المستهلكة حتى اليوم = أيام مضت منذ last_refill_date × daily_dosage
          // الحبات المتبقية = الكلية - المستهلكة (لا تقل عن صفر)
          //
          // هذا أدق من حساب daysLeft × daily_dosage لأن next_refill_date
          // قد يتضمن بالفعل حبات متبقية من دورات سابقة فتكون القيمة مضخّمة.
          const totalPillsAtLastRefill = Number(m.pills_per_box) * Number(m.boxes_count);
          const lastRefillMs = m.last_refill_date
            ? new Date(m.last_refill_date).getTime()
            : Date.now();
          const daysSinceRefill = Math.max(
            0,
            Math.floor((Date.now() - lastRefillMs) / 86400000)
          );
          const pillsConsumed = Math.min(
            daysSinceRefill * Number(m.daily_dosage),
            totalPillsAtLastRefill
          );
          const autoRemaining = Math.max(0, Math.round(totalPillsAtLastRefill - pillsConsumed));
          // ────────────────────────────────────────────────────────────────────

          // احسب next_refill_date فوراً مع الحبات المتبقية + علبة جديدة
          const newBoxPills = Number(m.pills_per_box) * 1; // علبة واحدة افتراضي
          const totalPills = newBoxPills + autoRemaining;
          const newDays = Math.floor(totalPills / Math.max(Number(m.daily_dosage), 0.5));
          const newRefillDate = (() => {
            const d = new Date(today);
            d.setDate(d.getDate() + newDays);
            return d.toISOString().split('T')[0];
          })();
          return {
            id: m.id,
            medication_name: m.medication_name,
            pills_per_box: m.pills_per_box,
            boxes_count: 1, // افتراضي: علبة واحدة جديدة
            daily_dosage: m.daily_dosage,
            dosage_unit: m.dosage_unit,
            last_refill_date: today,
            next_refill_date: newRefillDate, // محسوبة من اللحظة الأولى
            selected: willRenew,
            original_next_refill: m.next_refill_date,
            remaining_pills: autoRemaining as number | null, // محسوبة بدقة من الصرف الفعلي
          };
        })
      : [{ id: '', medication_name: '', pills_per_box: 30, boxes_count: 1, daily_dosage: 1,
           dosage_unit: 'pill', last_refill_date: today, next_refill_date: '', selected: true,
           original_next_refill: '', remaining_pills: null as number | null }]
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // حساب next_refill_date مع مراعاة الحبات المتبقية إن وُجدت
  const calcNextRefillWithRemaining = (m: {
    pills_per_box: number; boxes_count: number;
    daily_dosage: number; remaining_pills?: number | null;
  }): string => {
    const base = today;
    const newBoxPills = Number(m.pills_per_box) * Number(m.boxes_count);
    const remaining = m.remaining_pills !== null && m.remaining_pills !== undefined && m.remaining_pills >= 0 ? Number(m.remaining_pills) : 0;
    const totalPills = newBoxPills + remaining;
    const days = Math.floor(totalPills / Math.max(Number(m.daily_dosage), 0.5));
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };

  const update = (idx: number, field: string, val: any) => {
    setMeds(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      if (['pills_per_box','boxes_count','daily_dosage','last_refill_date','remaining_pills'].includes(field)) {
        next[idx].last_refill_date = today;
        next[idx].next_refill_date = calcNextRefillWithRemaining(next[idx]);
      }
      return next;
    });
  };

  const toggleSelect = (idx: number) => {
    setMeds(prev => prev.map((m, i) => {
      if (i !== idx) return m;
      const nowSelected = !m.selected;
      if (nowSelected) {
        const newBoxPills = Number(m.pills_per_box) * Number(m.boxes_count);
        // نضيف الحبات المتبقية عند المريض (إن وُجدت) للحبات الجديدة
        const rem = m.remaining_pills !== null && m.remaining_pills >= 0 ? Number(m.remaining_pills) : 0;
        const days = Math.floor((newBoxPills + rem) / Math.max(Number(m.daily_dosage), 0.5));
        const d = new Date(today); d.setDate(d.getDate() + days);
        const newNext = d.toISOString().split('T')[0];
        return { ...m, selected: true, last_refill_date: today, next_refill_date: newNext, boxes_count: m.boxes_count };
      } else {
        const origMed = existingMeds[idx];
        const origLastRefill = origMed?.last_refill_date || today;
        const origNextRefill = m.original_next_refill ||
          calcNextRefill(origLastRefill, Number(m.pills_per_box), Number(m.boxes_count), Number(m.daily_dosage));
        return { ...m, selected: false, last_refill_date: origLastRefill, next_refill_date: origNextRefill };
      }
    }));
  };

  const deleteMed = async (medId: string, medName: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف "${medName}" من سجل المريض نهائياً؟`)) return;
    setDeleting(medId);
    try {
      const { error } = await supabase.from('chronic_medications').update({ status: 'deleted' }).eq('id', medId);
      if (error) throw error;
      setMeds(prev => prev.filter(m => m.id !== medId));
    } catch (e: any) { setErr(e.message || 'فشل الحذف'); }
    finally { setDeleting(null); }
  };

  const save = async () => {
    const selectedMeds = meds.filter(m => m.selected);
    if (selectedMeds.length === 0 && isRenewal) { setErr('اختر دواءً واحداً على الأقل لتجديده'); return; }
    if (meds.some(m => !m.medication_name.trim())) { setErr('أدخل اسم كل دواء'); return; }
    if (meds.some(m => Number(m.daily_dosage) <= 0)) { setErr('الجرعة يجب أن تكون أكبر من صفر'); return; }
    setSaving(true);
    try {
      if (isRenewal) {
        // تجديد انتقائي: UPDATE فقط للأدوية المحددة — الباقي لا يُمَس
        for (const m of selectedMeds) {
          const ppb = Number(m.pills_per_box);
          const rem = m.remaining_pills !== null && m.remaining_pills >= 0
            ? Number(m.remaining_pills) : 0;
          const newBoxesPills = ppb * Number(m.boxes_count);
          const totalPills = newBoxesPills + rem;
          const dose = Math.max(Number(m.daily_dosage), 0.5);

          // نحفظ totalPills كـ pills_per_box مع boxes_count=1
          // هذا يضمن: pills_per_box × boxes_count = totalPills بدون أي تقريب أو فقدان
          const newPillsPerBox = Math.round(totalPills);
          const newBoxesCount  = 1;

          const newDays = Math.floor(totalPills / dose);
          const d = new Date(today);
          d.setDate(d.getDate() + newDays);
          const newRefill = d.toISOString().split('T')[0];

          const { error } = await supabase.from('chronic_medications').update({
            pills_per_box: newPillsPerBox,
            boxes_count:   newBoxesCount,
            daily_dosage:  Number(m.daily_dosage),
            dosage_unit:   m.dosage_unit,
            last_refill_date: m.last_refill_date,
            next_refill_date: newRefill,
          }).eq('id', m.id);
          if (error) throw error;
        }
      } else {
        const rows = meds.map(m => ({
          patient_id: patientId, pharmacy_id: pharmacyId, medication_name: m.medication_name.trim(),
          pills_per_box: Number(m.pills_per_box), boxes_count: Number(m.boxes_count), daily_dosage: Number(m.daily_dosage),
          dosage_unit: m.dosage_unit, last_refill_date: m.last_refill_date,
          next_refill_date: m.next_refill_date ||
            calcNextRefill(m.last_refill_date, Number(m.pills_per_box), Number(m.boxes_count), Number(m.daily_dosage)),
          status: 'active',
        }));
        const { error } = await supabase.from('chronic_medications').insert(rows);
        if (error) throw error;
      }
      onSaved();
    } catch (e: any) { setErr(e.message || 'حدث خطأ'); setSaving(false); }
  };

  const selectedCount = meds.filter(m => m.selected).length;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4 transition-all" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xl max-h-[92vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col saas-slide-up" onClick={e => e.stopPropagation()}>

        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-3 bg-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {/* زر الرجوع — يظهر فقط عند الفتح من modal البحث */}
            {onBack && (
              <button onClick={onBack}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors shrink-0"
                title="رجوع">
                <svg className="w-4 h-4 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
            <div className="min-w-0">
              {/* truncate لاحتواء اسم مريض طويل بدل دفع زر الإغلاق خارج البطاقة */}
              <h3 className="text-base font-semibold text-slate-900 truncate">
                {isRenewal ? `تجديد أدوية ${patientName}` : `تسجيل أدوية ${patientName}`}
              </h3>
              <p className="text-xs text-slate-500 mt-1 truncate">
                {isRenewal ? 'اختر الأدوية التي جدّدها المريض فعلاً' : 'أدخل الأدوية والجرعات لمتابعتها'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-colors shrink-0">✕</button>
        </div>

        {/* ── banner تأكيد — يظهر فقط عند الفتح من modal البحث بوضع الإضافة ── */}
        {isNewPatient && !isRenewal && (
          <div className="mx-6 mt-4 flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-3 shrink-0">
            <span className="text-base shrink-0">✅</span>
            <div>
              <p className="text-xs font-bold text-emerald-800">تم تسجيل {patientName} بنجاح</p>
              <p className="text-[11px] text-emerald-700 mt-0.5">أضف أدويته المزمنة الآن لبدء متابعتها</p>
            </div>
          </div>
        )}

        {!isNewPatient && !isRenewal && (
          <div className="mx-6 mt-4 flex items-center gap-2.5 bg-blue-50 border border-blue-200 rounded-lg px-3.5 py-3 shrink-0">
            <span className="text-base shrink-0">💊</span>
            <div>
              <p className="text-xs font-bold text-blue-800">إضافة دواء جديد لـ {patientName}</p>
              <p className="text-[11px] text-blue-700 mt-0.5">أدخل الدواء الجديد وسيُضاف لسجله الحالي</p>
            </div>
          </div>
        )}

        {isRenewal && (
          <div className="mx-6 mt-4 flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-lg px-3.5 py-3 shrink-0">
            <span className="text-sm shrink-0">ℹ️</span>
            <p className="text-xs text-blue-800 leading-relaxed font-medium">
              اختر الأدوية التي اشتراها المريض اليوم — الحبات المتبقية محسوبة تلقائياً.
              الأدوية غير المحددة تبقى على مواعيدها دون تغيير.
            </p>
          </div>
        )}

        <div className="overflow-y-auto flex-1 p-6 space-y-4 bg-slate-50/50">
          {meds.map((m, idx) => {
            const daysRemaining = m.original_next_refill ? calcDaysLeft(m.original_next_refill) : null;
            const isSelected = m.selected;

            return (
              <div key={idx} className={`bg-white border rounded-xl overflow-hidden transition-all shadow-sm ${
                isRenewal ? (isSelected ? 'border-slate-800 ring-1 ring-slate-800/10' : 'border-slate-200 opacity-60 hover:opacity-100') : 'border-slate-200'
              }`}>

                {isRenewal && (
                  <div className="flex items-center gap-4 px-5 py-4 cursor-pointer select-none" onClick={() => toggleSelect(idx)}>
                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                      isSelected ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-300'
                    }`}>
                      {isSelected && <span className="text-white text-[10px] font-black">✓</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{m.medication_name}</p>
                      {daysRemaining !== null && (
                        <p className={`text-xs font-medium mt-1 ${
                          daysRemaining <= 0 ? 'text-rose-600' : daysRemaining <= 7 ? 'text-amber-600' : 'text-slate-500'
                        }`}>
                          {daysRemaining <= 0 ? 'نفد الدواء' :
                           daysRemaining <= 7 ? `⚠️ ينفد خلال ${daysRemaining} أيام` :
                           `✓ كافٍ لـ ${daysRemaining} يوم — لا يحتاج تجديد الآن`}
                        </p>
                      )}
                    </div>
                    {isSelected && (
                      <span className="text-[10px] font-semibold px-2 py-1 rounded-full border shrink-0 bg-slate-900 text-white border-slate-900">
                        سيُجدَّد ✓
                      </span>
                    )}
                    {/* زر الحذف — يوقف الـ click propagation لمنع toggle الاختيار */}
                    <button
                      onClick={e => { e.stopPropagation(); deleteMed(m.id, m.medication_name); }}
                      disabled={deleting === m.id || !m.id}
                      className="w-8 h-8 rounded-full bg-white border border-slate-200 hover:bg-rose-50 hover:border-rose-300 text-slate-400 hover:text-rose-500 flex items-center justify-center transition-all shrink-0 disabled:opacity-40"
                      title="حذف الدواء من السجل">
                      {deleting === m.id
                        ? <div className="w-3 h-3 border border-rose-400 border-t-transparent rounded-full animate-spin" />
                        : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                      }
                    </button>
                  </div>
                )}

                {(!isRenewal || isSelected) && (
                  <div className={`p-5 space-y-4 ${isRenewal ? 'border-t border-slate-100 bg-slate-50/50' : ''}`}>
                    {!isRenewal && (
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-slate-500">الدواء {idx + 1}</p>
                        {meds.length > 1 && (
                          <button onClick={() => setMeds(p => p.filter((_,i) => i !== idx))}
                            className="text-xs text-rose-500 hover:text-rose-700 font-medium transition-colors">إزالة</button>
                        )}
                      </div>
                    )}
                    {!isRenewal && (
                      <input type="text" value={m.medication_name} onChange={e => update(idx, 'medication_name', e.target.value)}
                        placeholder="اسم الدواء"
                        className="w-full px-4 py-2.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all text-slate-900 shadow-sm" />
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'حبات/علبة', field: 'pills_per_box', min: 1, step: 1 },
                        { label: 'عدد العلب',  field: 'boxes_count',  min: 1, step: 1 },
                        { label: 'جرعة/يوم',  field: 'daily_dosage', min: 0.5, step: 0.5 },
                      ].map(({ label, field, min, step }) => (
                        <div key={field}>
                          <label className="block text-[10px] font-medium text-slate-500 mb-1.5">{label}</label>
                          <input type="number" min={min} step={step} value={(m as any)[field]}
                            onChange={e => update(idx, field, e.target.value)}
                            className="w-full px-3 py-2 text-sm text-center bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition-all text-slate-900 shadow-sm" />
                        </div>
                      ))}
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500 mb-1.5">الوحدة</label>
                        <select value={m.dosage_unit} onChange={e => update(idx, 'dosage_unit', e.target.value)}
                          className="w-full px-2 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition-all text-slate-900 shadow-sm">
                          {Object.entries(UNITS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* ── حبات متبقية — محسوبة تلقائياً وقابلة للتعديل ── */}
                    {isRenewal && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-amber-800">
                            💊 حبات متبقية عند المريض
                          </label>
                          <span className="text-[10px] text-emerald-600 font-medium bg-emerald-100 px-2 py-0.5 rounded-full">محسوبة تلقائياً</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={m.remaining_pills ?? 0}
                            onChange={e => {
                              const val = e.target.value === '' ? 0 : Number(e.target.value);
                              update(idx, 'remaining_pills', val);
                            }}
                            className="w-24 px-3 py-2 text-sm text-center bg-white border border-amber-300 rounded-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 transition-all text-slate-900 shadow-sm font-semibold"
                          />
                          <div>
                            <p className="text-xs text-amber-800 font-medium">
                              {Number(m.remaining_pills) > 0 && Number(m.daily_dosage) > 0
                                ? `تكفيه ${Math.floor(Number(m.remaining_pills) / Number(m.daily_dosage))} يوم`
                                : 'لا يوجد متبقٍ'}
                            </p>
                            <p className="text-[10px] text-amber-600 mt-0.5">يمكنك تعديل هذا الرقم إذا كان غير دقيق</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {!isRenewal && (
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-2">تاريخ الصرف</label>
                        <input type="date" value={m.last_refill_date} onChange={e => update(idx, 'last_refill_date', e.target.value)}
                          className="w-full px-4 py-2.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition-all shadow-sm text-slate-900" />
                      </div>
                    )}
                    {m.next_refill_date && (
                      <div className="flex items-center justify-between bg-slate-100 rounded-lg px-4 py-3">
                        <div>
                          <p className="text-[10px] font-medium text-slate-500">موعد النفاذ</p>
                          <p className="text-sm font-semibold text-slate-900 mt-1">{fmtDate(m.next_refill_date)}</p>
                        </div>
                        <div className="text-left">
                          <p className="text-[10px] text-slate-500">يكفي لمدة</p>
                          <p className="text-sm font-bold text-slate-900 mt-1">
                            {Math.floor(
                              (Number(m.pills_per_box)*Number(m.boxes_count) +
                              (m.remaining_pills !== null && m.remaining_pills >= 0 ? Number(m.remaining_pills) : 0))
                              / Math.max(Number(m.daily_dosage), 0.5)
                            )} يوم
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {!isRenewal && (
            <button onClick={() => setMeds(p => [...p, {
              id: '', medication_name: '', pills_per_box: 30, boxes_count: 1, daily_dosage: 1,
              dosage_unit: 'pill', last_refill_date: today, next_refill_date: '', selected: true, original_next_refill: '', remaining_pills: null as number | null,
            }])} className="w-full py-3.5 border-2 border-dashed border-slate-300 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">
              + إضافة دواء آخر
            </button>
          )}
          {err && <p className="text-sm text-rose-600 font-medium bg-rose-50 border border-rose-200 px-4 py-3 rounded-lg">{err}</p>}
        </div>

        <div className="p-6 border-t border-slate-100 bg-white shrink-0">
          {isRenewal && (
            <p className="text-xs text-slate-400 text-center mb-3">
              {selectedCount === 0 ? 'لم تختر أي دواء بعد' :
               `سيُجدَّد ${selectedCount} ${selectedCount === 1 ? 'دواء' : 'أدوية'} من أصل ${meds.length}`}
            </p>
          )}
          <button onClick={save} disabled={saving || (isRenewal && selectedCount === 0)}
            className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
            {saving ? 'جاري الحفظ...' : isRenewal ? `حفظ وتجديد (${selectedCount})` : 'حفظ الأدوية'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// INVENTORY
// ═══════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════
// INVENTORY — منطق مُبسَّط وواضح
//
// الهدف الوحيد: تعرف الصيدلاني ماذا يحتاج يؤمن لمرضاه قبل أن ينفد دواؤهم
//
// القواعد:
//  1) تظهر فقط الأدوية التي تنفد ≤ 14 يوم (من عند أحد المرضى على الأقل)
//  2) "موجود ✓" = الدواء على الرف جاهز — ينتقل للقائمة الخضراء حتى يضغط الصيدلاني "تراجع"
//  3) "تراجع" = الدواء بيع أو لم يعد متوفراً — يعود للقائمة الحمراء
//  4) الأدوية الكافية (> 14 يوم) مخفية تماماً
// ═══════════════════════════════════════════════════════
interface InventoryItem {
  key: string;
  medication_name: string;
  patient_names: string[];
  patient_info: { id: string; name: string; boxes_per_cycle: number }[]; // أضفنا الكمية لكل مريض
  nearest_refill_days: number;
  boxes_needed_monthly: number;
  total_daily_dose: number;
  dosage_unit: string;
  is_urgent: boolean;
  confirmed_at: string | null;
  boxes_confirmed: number;   // الكمية المؤكدة أصلاً
  boxes_remaining: number;   // المتبقي بعد التجديدات
}

const LS_KEY = 'vitalix_inventory_confirmed';

type ConfirmedEntry = {
  confirmed_at: string;
  boxes_confirmed: number;  // الكمية التي أكد الصيدلاني وجودها
  boxes_remaining: number;  // ما تبقى بعد طرح المجدَّدين والمؤرشفين
};

function getConfirmedMap(): Record<string, ConfirmedEntry> {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    // migration: القيم القديمة كانت strings (تاريخ فقط) — نحوّلها للـ schema الجديد
    const migrated: Record<string, ConfirmedEntry> = {};
    for (const [key, val] of Object.entries(raw)) {
      if (typeof val === 'string') {
        // schema قديم — نحوّله بـ boxes افتراضية = 1
        migrated[key] = { confirmed_at: val, boxes_confirmed: 1, boxes_remaining: 1 };
      } else if (val && typeof val === 'object') {
        migrated[key] = val as ConfirmedEntry;
      }
    }
    // إذا تم migration → احفظ القيم المحوّلة
    if (Object.keys(migrated).length > 0) {
      localStorage.setItem(LS_KEY, JSON.stringify(migrated));
    }
    return migrated;
  } catch { return {}; }
}
function setConfirmedMap(map: Record<string, ConfirmedEntry>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(map)); } catch {}
}

// يُستدعى عند تجديد مريض أو أرشفته — يطرح كميته من boxes_remaining
// إذا وصل الرصيد لصفر → يُلغى التأكيد تلقائياً
function deductFromInventory(medKey: string, boxesToDeduct: number) {
  const map = getConfirmedMap();
  if (!map[medKey]) return;
  map[medKey].boxes_remaining = Math.max(0, map[medKey].boxes_remaining - boxesToDeduct);
  if (map[medKey].boxes_remaining <= 0) {
    delete map[medKey]; // الكمية نفدت → يعود للقائمة الحمراء
  } else {
    setConfirmedMap(map);
  }
  setConfirmedMap(map);
}

function calcInventory(cards: CareCard[]): InventoryItem[] {
  const confirmed = getConfirmedMap();
  const activeCards = cards.filter(c => c.stage !== ('archived' as DisplayStage));

  const map = new Map<string, {
    names: Map<string, { name: string; boxes_per_cycle: number }>;
    ppb_sum: number; ppb_count: number;
    total_daily: number;
    dosage_unit: string;
    nearest: number;
    urgent: boolean;
  }>();

  activeCards.forEach(card => {
    card.meds.forEach(med => {
      const d = calcDaysLeft(med.next_refill_date);
      if (d > 14) return;

      const key = med.medication_name.trim().toLowerCase();
      if (!map.has(key)) map.set(key, {
        names: new Map(), ppb_sum: 0, ppb_count: 0,
        total_daily: 0, dosage_unit: med.dosage_unit,
        nearest: d, urgent: false,
      });
      const e = map.get(key)!;
      // كمية علب هذا المريض = علبة واحدة افتراضياً (ما يحتاجه في دورة التجديد)
      const boxes_per_cycle = Math.max(1, Number(med.boxes_count));
      e.names.set(card.patient.id, { name: card.patient.name, boxes_per_cycle });
      e.ppb_sum  += Number(med.pills_per_box);
      e.ppb_count += 1;
      e.total_daily += Number(med.daily_dosage);
      if (d < e.nearest) e.nearest = d;
      if (d <= 7) e.urgent = true;
    });
  });

  const items: InventoryItem[] = [];
  map.forEach((v, key) => {
    const avg_ppb = v.ppb_sum / Math.max(v.ppb_count, 1);
    const displayName = key.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const entry = confirmed[key] || null;
    const confirmedAt = entry?.confirmed_at || null;
    const boxes_confirmed = entry?.boxes_confirmed || 0;
    const boxes_remaining = entry?.boxes_remaining || 0;
    const stillConfirmed = Boolean(confirmedAt) && boxes_remaining > 0;

    items.push({
      key, medication_name: displayName,
      patient_names: Array.from(v.names.values()).map(x => x.name),
      patient_info: Array.from(v.names.entries()).map(([id, x]) => ({ id, name: x.name, boxes_per_cycle: x.boxes_per_cycle })),
      nearest_refill_days: v.nearest,
      boxes_needed_monthly: Math.ceil((v.total_daily * 30) / Math.max(avg_ppb, 1)),
      total_daily_dose: Math.round(v.total_daily * 10) / 10,
      dosage_unit: v.dosage_unit,
      is_urgent: v.urgent,
      confirmed_at: stillConfirmed ? confirmedAt : null,
      boxes_confirmed,
      boxes_remaining,
    });
  });

  return items.sort((a, b) => {
    if (a.is_urgent !== b.is_urgent) return a.is_urgent ? -1 : 1;
    const aC = a.confirmed_at ? 1 : 0;
    const bC = b.confirmed_at ? 1 : 0;
    if (aC !== bC) return aC - bC;
    return a.nearest_refill_days - b.nearest_refill_days;
  });
}

// ── InventoryTab ────────────────────────────────────────────────────────────
// ── PatientMedsModal: عرض أدوية المريض المزمنة داخل المخزون ──────────────
function PatientMedsModal({ patient, cards, onClose }: {
  patient: { id: string; name: string };
  cards: CareCard[];
  onClose: () => void;
}) {
  const card = cards.find(c => c.patient.id === patient.id);
  if (!card) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9999] flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl border border-slate-200 overflow-hidden saas-slide-up flex flex-col max-h-[85vh] sm:max-h-[80vh]"
        onClick={e => e.stopPropagation()}>

        {/* Header — ثابت */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-semibold text-slate-600 text-sm shrink-0">
              {card.patient.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{card.patient.name}</p>
              <p className="text-xs text-slate-400 font-mono mt-0.5 truncate">{card.patient.phone_number}</p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-xs transition-colors shrink-0">✕</button>
        </div>

        {/* أدوية المريض المزمنة — قابلة للتمرير */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">الأدوية المزمنة المسجلة</p>
          {card.meds.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">لا توجد أدوية مسجلة</p>
          ) : (
            [...card.meds].sort((a, b) => calcDaysLeft(a.next_refill_date) - calcDaysLeft(b.next_refill_date)).map(m => {
              const d = calcDaysLeft(m.next_refill_date);
              const urgentStyle = d <= 0 ? 'bg-rose-50 border-rose-200' :
                                  d <= 3 ? 'bg-amber-50 border-amber-200' :
                                  d <= 7 ? 'bg-orange-50 border-orange-200' :
                                  'bg-white border-slate-200';
              const dayStyle = d <= 0 ? 'text-rose-600 font-bold' :
                               d <= 3 ? 'text-amber-700 font-semibold' :
                               d <= 7 ? 'text-orange-600 font-medium' :
                               'text-slate-400';
              const unitLabel = UNITS[m.dosage_unit] || m.dosage_unit;
              return (
                <div key={m.id} className={`border rounded-xl px-4 py-3 ${urgentStyle}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800 truncate">{m.medication_name}</p>
                    <span className={`text-xs shrink-0 ${dayStyle}`}>
                      {d <= 0 ? 'نفد!' : `${d} ${d === 1 ? 'Day' : 'Days'}`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1.5 text-[10px] text-slate-500">
                    <span>{m.daily_dosage} {unitLabel}/يوم · {m.boxes_count} {m.boxes_count === 1 ? 'علبة' : 'علب'}</span>
                    <span>ينفد {fmtDate(m.next_refill_date)}</span>
                  </div>
                  <div className="mt-1.5 text-[10px] text-slate-400">
                    آخر تجديد: {m.last_refill_date ? fmtDate(m.last_refill_date) : '—'}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer — ثابت */}
        <div className="px-4 py-3 border-t border-slate-100 shrink-0">
          <p className="text-[10px] text-slate-400 text-center">
            ولاء {calcLoyaltyMonths(card.meds)} شهر · {card.meds.length} {card.meds.length === 1 ? 'دواء مزمن' : 'أدوية مزمنة'}
          </p>
        </div>
      </div>
    </div>
  );
}

function InventoryTab({ cards, onClose }: {
  cards: CareCard[];
  onClose?: () => void;
}) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [activePatient, setActivePatient] = useState<{ id: string; name: string } | null>(null);
  const recompute = useCallback(() => setItems(calcInventory(cards)), [cards]);
  useEffect(() => { recompute(); }, [recompute]);

  // pending: الأدوية غير المؤكَّدة فقط
  // confirmedNow: كل الأدوية المؤكَّدة بغض النظر عن موعد نفاذها
  const pending      = items.filter(i => !i.confirmed_at);
  const confirmedNow = items.filter(i =>  i.confirmed_at);

  const handleConfirm = (item: InventoryItem) => {
    const map = getConfirmedMap();
    map[item.key] = {
      confirmed_at: new Date().toISOString(),
      boxes_confirmed: item.boxes_needed_monthly,
      boxes_remaining: item.boxes_needed_monthly,
    };
    setConfirmedMap(map);
    recompute();
  };

  const handleUnconfirm = (key: string) => {
    const map = getConfirmedMap();
    delete map[key];
    setConfirmedMap(map);
    recompute();
  };

  // لا توجد أدوية تنفد في الـ 14 يوم القادمة
  if (items.length === 0) return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 bg-slate-50 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-900">جهّز مخزونك</h3>
      </div>
      <div className="px-5 py-12 text-center space-y-2">
        <p className="text-2xl">✅</p>
        <p className="text-sm font-semibold text-slate-900">لا يوجد أدوية تنفد خلال 14 يوم</p>
        <p className="text-xs text-slate-400">ستظهر هنا الأدوية التي تقترب من النفاذ عند مرضاك</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 shadow-sm flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">
          {pending.length > 0
            ? `${pending.length} ${pending.length === 1 ? 'دواء يحتاج' : 'أدوية تحتاج'} تأميناً خلال 14 يوم`
            : 'كل الأدوية مؤكَّدة التوفر ✓'}
        </h3>
        {items.some(i => i.is_urgent && !i.confirmed_at) && (
          <span className="shrink-0 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
            ⚡ عاجل
          </span>
        )}
      </div>

      {/* ── الأدوية التي تحتاج تأمين ── */}
      {pending.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">تحتاج تأمين</p>
            <p className="text-[10px] text-slate-400">الكمية الشهرية</p>
          </div>
          <div className="divide-y divide-slate-100">
            {pending.map(item => {
              const unitLabel = UNITS[item.dosage_unit] || item.dosage_unit;
              const d = item.nearest_refill_days;
              return (
                <div key={item.key} className={`px-5 py-4 space-y-3 ${item.is_urgent ? 'bg-rose-50/40' : ''}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      {/* اسم الدواء + بادج عاجل */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-slate-900">{item.medication_name}</p>
                        {item.is_urgent && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">⚡ عاجل</span>
                        )}
                      </div>
                      {/* تفاصيل */}
                      <p className="text-xs text-slate-500">
                        {item.total_daily_dose} {unitLabel}/يوم ·{' '}
                        <span className={d <= 0 ? 'text-rose-700 font-bold' : d <= 3 ? 'text-rose-600 font-semibold' : d <= 7 ? 'text-amber-600 font-medium' : ''}>
                          {d <= 0 ? 'نفد اليوم!' : `أقرب نفاذ بعد ${d} ${d === 1 ? 'Day' : 'Days'}`}
                        </span>
                      </p>
                      {/* المرضى — يفتح modal أدوية المريض المزمنة */}
                      <div className="flex flex-wrap gap-1.5">
                        {(item.patient_info || []).map(p => (
                          <button key={p.id}
                            onClick={() => setActivePatient(p)}
                            className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer">
                            👤 {p.name}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* الكمية + زر التأكيد */}
                    <div className="flex items-center gap-3 shrink-0 pt-0.5">
                      <div className="text-center min-w-[2rem]">
                        <p className="text-xl font-bold text-slate-900 tabular">{item.boxes_needed_monthly}</p>
                        <p className="text-[9px] text-slate-400 mt-0.5">علبة</p>
                      </div>
                      <button onClick={() => handleConfirm(item)}
                        className="h-9 px-3.5 rounded-lg bg-white border border-slate-200 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 text-slate-600 text-xs font-semibold transition-all shadow-sm whitespace-nowrap">
                        موجود ✓
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── الأدوية المؤكَّدة التوفر ── */}
      {confirmedNow.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
            <p className="text-xs font-semibold text-emerald-700">تم التأكيد — موجود في المخزن</p>
            <p className="text-[10px] text-emerald-500">يعود للقائمة تلقائياً عند اقتراب النفاذ</p>
          </div>
          <div className="divide-y divide-slate-100">
            {confirmedNow.map(item => {
              const d = item.nearest_refill_days;
              const confirmedDate = item.confirmed_at
                ? new Date(item.confirmed_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', numberingSystem: 'latn' })
                : '';
              return (
                <div key={item.key} className="px-5 py-3.5 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                      <span className="text-emerald-600 text-xs font-bold">✓</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{item.medication_name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-[10px] text-slate-400">
                          تأكيد {confirmedDate} ·{' '}
                          <span className={d <= 3 ? 'text-rose-500 font-semibold' : ''}>
                            ينفد بعد {d} {d === 1 ? 'Day' : 'Days'}
                          </span>
                        </p>
                      </div>
                      {/* شريط تقدم الكمية المتبقية */}
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-400 rounded-full transition-all"
                            style={{ width: `${Math.min(100, (item.boxes_remaining / Math.max(item.boxes_confirmed, 1)) * 100)}%` }} />
                        </div>
                        <span className="text-[10px] text-slate-500 shrink-0 tabular-nums">
                          {item.boxes_remaining}/{item.boxes_confirmed} علبة
                        </span>
                      </div>
                    </div>
                    <button onClick={() => handleUnconfirm(item.key)}
                      className="text-[10px] text-slate-400 hover:text-rose-500 transition-colors font-medium shrink-0 cursor-pointer px-2 py-1.5 -m-1">
                      تراجع
                    </button>
                  </div>
                  {/* أسماء المرضى في قسم المؤكَّد — يفتح modal */}
                  <div className="flex flex-wrap gap-1.5 pr-9">
                    {(item.patient_info || []).map(p => (
                      <button key={p.id}
                        onClick={() => setActivePatient(p)}
                        className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors cursor-pointer">
                        👤 {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── تلميح ── */}
      <div className="flex items-start gap-2.5 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
        <span className="text-sm shrink-0">💡</span>
        <p className="text-xs text-slate-500 leading-relaxed">
          "موجود ✓" يعني أن الدواء جاهز على رف الصيدلية — اضغط "تراجع" إذا بيع الدواء قبل أن يحضر المريض.
        </p>
      </div>

      {/* ── Modal أدوية المريض المزمنة ── */}
      {activePatient && (
        <PatientMedsModal
          patient={activePatient}
          cards={cards}
          onClose={() => setActivePatient(null)}
        />
      )}

    </div>
  );
}

// ═══════════════════════════════════════════════════════
// TAB META
// ═══════════════════════════════════════════════════════
const VISIBLE_STAGES: CareStage[] = ['due','messaged','no_response','renewed'];

const TAB_META: Record<CareStage, { icon: string; label: string; activeBg: string; activeText: string; }> = {
  due:         { icon: '🔴', label: 'قارب على النفاذ', activeBg: 'bg-white shadow-sm ring-1 ring-slate-200', activeText: 'text-slate-900' },
  messaged:    { icon: '📤', label: 'أُرسلت الرسالة',  activeBg: 'bg-white shadow-sm ring-1 ring-slate-200', activeText: 'text-slate-900' },
  no_response: { icon: '🔔', label: 'لم يستجيبوا',     activeBg: 'bg-white shadow-sm ring-1 ring-slate-200', activeText: 'text-slate-900' },
  renewed:     { icon: '✅', label: 'جدّدوا دواءهم',   activeBg: 'bg-white shadow-sm ring-1 ring-slate-200', activeText: 'text-slate-900' },
  archived:    { icon: '🔇', label: 'فقدنا تواصلهم',  activeBg: 'bg-white shadow-sm ring-1 ring-slate-200', activeText: 'text-slate-900' },
};

function sortByPriority(cards: CareCard[], stage: CareStage): CareCard[] {
  return [...cards].sort((a, b) => {
    if (stage === 'due') return a.daysLeft - b.daysLeft;
    if (stage === 'messaged') {
      const dA = a.pipeline?.reminded_at ? Date.now() - new Date(a.pipeline.reminded_at).getTime() : 0;
      const dB = b.pipeline?.reminded_at ? Date.now() - new Date(b.pipeline.reminded_at).getTime() : 0;
      return dB - dA;
    }
    if (stage === 'no_response') {
      const dA = a.pipeline?.updated_at ? Date.now() - new Date(a.pipeline.updated_at).getTime() : 0;
      const dB = b.pipeline?.updated_at ? Date.now() - new Date(b.pipeline.updated_at).getTime() : 0;
      return dB - dA;
    }
    if (stage === 'renewed') return b.loyaltyMonths - a.loyaltyMonths;
    return 0;
  });
}

// ═══════════════════════════════════════════════════════
// NOTES FIELD
// ═══════════════════════════════════════════════════════
function NotesField({ notes, pipelineId, onSaved }: { notes: string; pipelineId?: string; onSaved: (n: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(notes);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      if (pipelineId) await supabase.from('refill_tracking_pipeline').update({ insurance_status: val.trim() || null }).eq('id', pipelineId);
      onSaved(val.trim()); setEditing(false);
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  if (!editing && !notes) return (
    <button onClick={e => { e.stopPropagation(); setEditing(true); }} className="text-xs text-slate-400 hover:text-slate-700 transition-colors py-1.5 -my-1.5">
      + إضافة ملاحظة
    </button>
  );

  if (!editing) return (
    <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex items-start justify-between gap-3">
      <p className="text-xs text-slate-600 leading-relaxed">{notes}</p>
      <button onClick={e => { e.stopPropagation(); setEditing(true); }} className="text-[10px] text-slate-400 hover:text-slate-700 font-medium shrink-0 transition-colors py-2 -my-2 px-1">تعديل</button>
    </div>
  );

  return (
    <div className="space-y-2" onClick={e => e.stopPropagation()}>
      <textarea value={val} onChange={e => setVal(e.target.value)} placeholder="اكتب ملاحظة..." rows={2} autoFocus
        className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900 transition-all resize-none shadow-sm" />
      <div className="flex gap-2">
        <button onClick={() => { setEditing(false); setVal(notes); }} className="flex-1 py-2.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors">إلغاء</button>
        <button onClick={save} disabled={saving} className="flex-1 py-2.5 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50 transition-colors">
          {saving ? 'جاري...' : 'حفظ'}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MODAL: تخصيص رسالة الواتساب مع الأدوية الاختيارية
// ═══════════════════════════════════════════════════════
function WaMsgModal({ patient, meds, pharmacyName, msgType, onClose, onConfirm }: {
  patient: Patient;
  meds: ChronicMed[];
  pharmacyName: string;
  msgType: 'msg1' | 'msg2';
  onClose: () => void;
  onConfirm: (selectedMedIds: Set<string>, customMsg: string) => void;
}) {
  const urgentMeds   = meds.filter(m => calcDaysLeft(m.next_refill_date) <= 3);
  const optionalMeds = meds.filter(m => { const d = calcDaysLeft(m.next_refill_date); return d > 3 && d <= 5; });

  const [optionalSelected, setOptionalSelected] = useState<Set<string>>(new Set());

  const toggleOptional = (id: string) => {
    setOptionalSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // معاينة الرسالة النهائية
  const previewMeds = [
    ...urgentMeds,
    ...optionalMeds.filter(m => optionalSelected.has(m.id)),
  ];
  const names = previewMeds.map(m => m.medication_name).join(' و');
  const firstName = patient.name.split(' ')[0];
  const previewMsg = msgType === 'msg1'
    ? `مرحباً ${firstName} 😊\nنتمنى أن تكونوا بأتم الصحة والعافية.\n\nنُبلّغكم من ${pharmacyName} بأن دواء (${names || '...'}) سيكفيكم لأيام قليلة.\n\nنحن هنا متى احتجتمونا 🌿`
    : `مرحباً ${firstName} 🌿\nمعكم ${pharmacyName}.\n\nتذكّرنا بكم واحتفظنا بـ (${names || '...'}) جاهزاً لكم.\n\nعندما يناسبكم، نحن هنا 😊`;

  const allSelectedIds = new Set([
    ...urgentMeds.map(m => m.id),
    ...optionalSelected,
  ]);

  const [customMsg, setCustomMsg] = useState(previewMsg);
  // تحديث الرسالة تلقائياً عند تغيير الأدوية المختارة — فقط إذا لم يعدّلها المستخدم يدوياً
  const [userEdited, setUserEdited] = useState(false);
  useEffect(() => { if (!userEdited) setCustomMsg(previewMsg); }, [previewMsg, userEdited]);

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9999] flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl border border-slate-200 saas-slide-up flex flex-col max-h-[88vh] sm:max-h-[82vh]" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900">تخصيص رسالة الواتساب</h3>
            <p className="text-xs text-slate-400 mt-0.5 truncate">{patient.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-colors shrink-0">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* الأدوية الحرجة — مُحددة دائماً */}
          {urgentMeds.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                أدوية ستُذكر في الرسالة · تنفد خلال 3 أيام أو أقل
              </p>
              <div className="space-y-2">
                {urgentMeds.map(m => {
                  const d = calcDaysLeft(m.next_refill_date);
                  return (
                    <div key={m.id} className="flex items-center justify-between bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{m.medication_name}</p>
                        <p className="text-[11px] text-rose-600 mt-0.5">{d <= 0 ? 'نفد!' : `ينفد خلال ${d} ${d === 1 ? 'يوم' : 'أيام'}`}</p>
                      </div>
                      <div className="w-5 h-5 rounded-md bg-slate-900 border border-slate-900 flex items-center justify-center shrink-0">
                        <span className="text-white text-[10px] font-black">✓</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* الأدوية الاختيارية — 4-5 أيام */}
          {optionalMeds.length > 0 && (
            <div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-3">
                <p className="text-xs font-semibold text-amber-800">أدوية تقترب من النفاذ · 4-5 أيام</p>
                <p className="text-[11px] text-amber-700 mt-1">يمكنك شمولها في الرسالة الآن. إذا اخترتها لن يُنبّه عنها مجدداً عند وصولها لـ 3 أيام.</p>
              </div>
              <div className="space-y-2">
                {optionalMeds.map(m => {
                  const d = calcDaysLeft(m.next_refill_date);
                  const checked = optionalSelected.has(m.id);
                  return (
                    <button key={m.id} onClick={() => toggleOptional(m.id)}
                      className={`w-full flex items-center justify-between rounded-lg px-4 py-2.5 border transition-all text-right ${
                        checked ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-200 hover:border-slate-400'
                      }`}>
                      <div>
                        <p className={`text-sm font-semibold ${checked ? 'text-white' : 'text-slate-900'}`}>{m.medication_name}</p>
                        <p className={`text-[11px] mt-0.5 ${checked ? 'text-slate-300' : 'text-amber-600'}`}>تنفد خلال {d} أيام</p>
                      </div>
                      <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                        checked ? 'bg-white border-white' : 'bg-white border-slate-300'
                      }`}>
                        {checked && <span className="text-slate-900 text-[10px] font-black">✓</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* الرسالة — قابلة للتعديل */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">نص الرسالة</p>
              {userEdited && (
                <button onClick={() => { setCustomMsg(previewMsg); setUserEdited(false); }}
                  className="text-[11px] text-slate-400 hover:text-slate-700 transition-colors">
                  ↩ إعادة الرسالة الأصلية
                </button>
              )}
            </div>
            <textarea
              value={customMsg}
              onChange={e => { setCustomMsg(e.target.value); setUserEdited(true); }}
              rows={6}
              dir="rtl"
              className="w-full px-4 py-3 text-xs text-slate-700 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 resize-none transition-all"
            />
            {userEdited && (
              <p className="text-[10px] text-amber-600 mt-1.5">✏️ تم تعديل الرسالة — الرسالة المُرسلة ستكون كما هي أعلاه</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-3 border-t border-slate-100 shrink-0">
          <button onClick={() => onConfirm(allSelectedIds, customMsg)}
            disabled={previewMeds.length === 0 || !customMsg.trim()}
            className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-40 shadow-sm flex items-center justify-center gap-2">
            <span>📲</span>
            <span>فتح الواتساب وإرسال الرسالة</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// PATIENT CARD
// ═══════════════════════════════════════════════════════
function PatientCard({ card, pharmacyName, onAction, onNotesUpdate }: {
  card: CareCard; pharmacyName: string;
  onAction: (a: 'send_msg1'|'send_msg2'|'renewed'|'no_response'|'retry'|'close'|'edit') => void;
  onNotesUpdate: (patientId: string, notes: string) => void;
  index: number;
}) {
  const [open, setOpen] = useState(false);
  const { patient, meds, daysLeft, stage, pipeline } = card;
  const tip = getSmartTip(card);

  const daysSinceMsg = pipeline?.reminded_at
    ? Math.floor((Date.now() - new Date(pipeline.reminded_at).getTime()) / 86400000) : 0;
  const showSecondMsg = stage === 'messaged' && daysSinceMsg >= 3;

  const badgeCls =
    stage === 'due' ? (daysLeft <= 0 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-100 text-slate-700 border-slate-200') :
    stage === 'messaged' ? 'bg-amber-50 text-amber-700 border-amber-200' :
    stage === 'renewed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    'bg-slate-50 text-slate-500 border-slate-200';

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 mb-3">
      <div className="flex items-center gap-4 px-5 py-4 cursor-pointer select-none" onClick={() => setOpen(o => !o)}>
        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-semibold text-slate-600 text-sm shrink-0 border border-slate-200">
          {patient.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{patient.name}</p>
          <p className="text-xs text-slate-500 truncate mt-1">{meds.map(m => m.medication_name).join(' · ')}</p>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-md border shrink-0 ${badgeCls}`}>
          {stage === 'renewed' ? 'مجدد ✓' :
           stage === 'messaged' ? 'تم الإرسال' :
           stage === 'no_response' ? 'بدون رد' :
           (daysLeft <= 0 ? 'نفد' : `${daysLeft} ${daysLeft === 1 ? 'Day' : 'Days'}`)}
        </span>
        <svg className={`w-5 h-5 text-slate-400 transition-transform duration-200 shrink-0 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {open && (
        <div className="border-t border-slate-100 px-5 pt-4 pb-5 space-y-4 bg-slate-50/30">
          <p className="text-xs text-slate-500 font-mono">{patient.phone_number}</p>
          <NotesField notes={card.notes} pipelineId={card.pipeline?.id} onSaved={(n) => onNotesUpdate(patient.id, n)} />

          {/* بادجات الأدوية مع Days */}
          <div className="flex flex-wrap gap-2">
            {meds.map(m => {
              const d = calcDaysLeft(m.next_refill_date);
              const badgeStyle =
                d <= 0 ? 'bg-rose-50 border-rose-200 text-rose-800' :
                d <= 3 ? 'bg-amber-50 border-amber-200 text-amber-900' :
                'bg-white border-slate-200 text-slate-700';
              const daysTextStyle =
                d <= 0 ? 'text-rose-500 font-semibold' :
                d <= 3 ? 'text-amber-600 font-semibold' :
                'text-slate-400';
              return (
                <span key={m.id} className={`text-xs font-medium px-2.5 py-1 rounded-md border shadow-sm flex items-center gap-1 ${badgeStyle}`} dir="ltr">
                  <span>{m.medication_name}</span>
                  <span className={daysTextStyle}>· {d <= 0 ? 'نفد' : `${d} ${d === 1 ? 'Day' : 'Days'}`}</span>
                </span>
              );
            })}
          </div>

          {/* النصيحة الذكية */}
          {tip && (
            <div className="flex items-start gap-3 rounded-lg px-4 py-3 bg-blue-50/50 border border-blue-100">
              <span className="text-base shrink-0">{tip.icon}</span>
              <p className="text-xs font-medium text-blue-900 leading-relaxed">{tip.text}</p>
            </div>
          )}

          {/* ── تفاصيل تبويب جدّدوا — كل دواء مستقل بتاريخه ── */}
          {stage === 'renewed' && (
            <div className="space-y-2">
              {meds.map(m => {
                const dLeft = calcDaysLeft(m.next_refill_date);
                const isClose = dLeft <= 7;
                return (
                  <div key={m.id} className={`border rounded-lg px-3.5 py-2.5 ${isClose ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-800 truncate">💊 {m.medication_name}</p>
                      <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${
                        dLeft <= 0 ? 'bg-rose-100 text-rose-700 border-rose-200' :
                        dLeft <= 7 ? 'bg-amber-100 text-amber-700 border-amber-200' :
                        'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>
                        {dLeft <= 0 ? 'نفد!' : `${dLeft} ${dLeft === 1 ? 'Day' : 'Days'}`}
                      </span>
                    </div>
                    <p className={`text-[10px] mt-1 ${isClose ? 'text-amber-700' : 'text-slate-400'}`}>
                      آخر تجديد: {m.last_refill_date ? fmtDate(m.last_refill_date) : '—'} · حتى {fmtDate(m.next_refill_date)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* الأزرار حسب المرحلة */}
          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            {(stage === 'due' || stage === 'ok') && (
              <>
                <button onClick={e => { e.stopPropagation(); onAction('send_msg1'); }}
                  className="flex-1 h-10 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors shadow-sm">
                  أرسل تذكيراً بالواتساب
                </button>
                <button onClick={e => { e.stopPropagation(); onAction('renewed'); }}
                  className="flex-1 h-10 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm">
                  تأكيد التجديد الآن
                </button>
              </>
            )}
            {stage === 'messaged' && (
              <>
                {showSecondMsg && (
                  <button onClick={e => { e.stopPropagation(); onAction('send_msg2'); }}
                    className="flex-1 h-10 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors shadow-sm">
                    إرسال الرسالة الثانية
                  </button>
                )}
                <button onClick={e => { e.stopPropagation(); onAction('renewed'); }}
                  className="flex-1 h-10 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm">
                  راجع وجدّد
                </button>
                <button onClick={e => { e.stopPropagation(); onAction('no_response'); }}
                  className="flex-1 h-10 bg-white border border-slate-200 text-slate-500 hover:text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
                  نقل إلى بدون رد
                </button>
              </>
            )}
            {stage === 'no_response' && (
              <>
                <a href={`tel:${patient.phone_number}`} onClick={e => e.stopPropagation()}
                  className="flex-1 h-10 flex items-center justify-center bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors shadow-sm">
                  اتصال هاتفي
                </a>
                <button onClick={e => { e.stopPropagation(); onAction('renewed'); }}
                  className="flex-1 h-10 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm">
                  راجع وجدّد
                </button>
                <button onClick={e => { e.stopPropagation(); onAction('close'); }}
                  className="flex-1 h-10 bg-white border border-dashed border-slate-300 text-slate-500 hover:text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
                  نقل إلى الأرشيف
                </button>
              </>
            )}
            {stage === 'renewed' && (
              <button onClick={e => { e.stopPropagation(); onAction('edit'); }}
                className="w-full h-10 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm">
                تعديل الأدوية
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════
export default function ChronicPage() {
  const [pharmacyId, setPharmacyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { pharmacyName } = usePharmacyInfo();
  const router = useRouter();

  const [cards, setCards] = useState<CareCard[]>([]);
  const [activeTab, setActiveTab] = useState<CareStage>('due');
  const [showInventory, setShowInventory] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [medModal, setMedModal] = useState<{ patient: Patient; meds: ChronicMed[]; isNewPatient?: boolean } | null>(null);
  const [medModalFromSearch, setMedModalFromSearch] = useState(false); // لتفعيل زر الرجوع
  const [searchPrefill, setSearchPrefill] = useState<{ patient: Patient; meds: ChronicMed[] } | null>(null); // بيانات المريض للاسترجاع
  const [waMsgModal, setWaMsgModal] = useState<{ card: CareCard; msgType: 'msg1' | 'msg2' } | null>(null);
  const [confirmSent, setConfirmSent] = useState<{ patientId: string; patientName: string } | null>(null);
  const { toasts, show: showToast } = useToast();

  const fetchAll = useCallback(async (preserveTab?: CareStage) => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/'); return; }
      const pid = session.user.id;
      setPharmacyId(pid);

      const { data: medsData } = await supabase.from('chronic_medications')
        .select('*, patients!inner(id, name, phone_number, gender, birth_date)')
        .eq('pharmacy_id', pid).eq('status', 'active');
      const { data: pipelineData } = await supabase.from('refill_tracking_pipeline')
        .select('*').eq('pharmacy_id', pid).eq('payment_type', 'cash');

      const patientMap = new Map<string, { patient: Patient; meds: ChronicMed[] }>();
      (medsData || []).forEach((row: any) => {
        const p: Patient = row.patients;
        const m: ChronicMed = { ...row };
        delete (m as any).patients;
        if (!patientMap.has(p.id)) patientMap.set(p.id, { patient: p, meds: [] });
        patientMap.get(p.id)!.meds.push(m);
      });

      const pipelineMap = new Map<string, PipelineRecord>();
      (pipelineData || []).forEach((row: any) => { pipelineMap.set(row.patient_id, row as PipelineRecord); });

      const list: CareCard[] = [];
      patientMap.forEach(({ patient, meds }) => {
        const daysLeft = Math.min(...meds.map(m => calcDaysLeft(m.next_refill_date)));
        const loyaltyMonths = calcLoyaltyMonths(meds);
        const pipeline = pipelineMap.get(patient.id) || null;
        let stage: DisplayStage;

        if (pipeline) {
          const ps = pipeline.pipeline_stage;
          if (ps === 'messaged' && pipeline.reminded_at) {
            const daysSince = Math.floor((Date.now() - new Date(pipeline.reminded_at).getTime()) / 86400000);
            if (daysSince >= MSG_EXPIRY_DAYS) { stage = 'no_response'; upsertPipeline(pid, patient.id, 'no_response'); }
            else stage = ps;
          } else if (ps === 'renewed') {
            if (daysLeft <= 3) { stage = 'due'; upsertPipeline(pid, patient.id, 'due'); }
            else stage = 'renewed';
          } else { stage = ps; }
        } else {
          stage = daysLeft <= 3 ? 'due' : 'ok';
        }

        const notes = pipeline?.insurance_status || '';
        list.push({ patient, meds, daysLeft, loyaltyMonths, stage, pipeline, notes });
      });

      list.sort((a, b) => a.daysLeft - b.daysLeft);
      setCards(list);
      // إذا كان preserveTab محدداً وفيه بيانات → نحتفظ بالتبويب الحالي
      // وإلا نذهب لأول تبويب فيه بيانات (السلوك الافتراضي عند التحميل الأول)
      if (preserveTab && list.some(c => c.stage === preserveTab)) {
        setActiveTab(preserveTab);
      } else {
        const firstWithData = VISIBLE_STAGES.find(s => list.some(c => c.stage === s));
        if (firstWithData) setActiveTab(firstWithData);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { fetchAll(); }, [fetchAll]);


  const handleWaConfirm = async (selectedMedIds: Set<string>, customMsg: string) => {
    if (!waMsgModal) return;
    const { card } = waMsgModal;
    setWaMsgModal(null);

    // استخدم الرسالة كما هي — سواء عدّلها المستخدم أم لا
    window.open(buildWaLink(card.patient.phone_number, customMsg), '_blank');

    // نُظهر تأكيد الإرسال — المريض لا يُنقل حتى يؤكد الصيدلاني
    setTimeout(() => setConfirmSent({ patientId: card.patient.id, patientName: card.patient.name }), 1500);
  };

  const handleConfirmSent = async (confirmed: boolean) => {
    if (!confirmSent) return;
    const { patientId } = confirmSent;
    setConfirmSent(null);
    if (!confirmed) { showToast('لم يتم إرسال الرسالة', 'error'); return; }
    showToast('تم إرسال الرسالة ✓');
    const now = new Date().toISOString();
    const updated = await upsertPipeline(pharmacyId, patientId, 'messaged', { reminded_at: now });
    setCards(prev => {
      const next = prev.map(c => c.patient.id === patientId
        ? { ...c, stage: 'messaged' as DisplayStage, pipeline: updated || c.pipeline } : c);
      if (next.filter(c => c.stage === 'due').length === 0) setTimeout(() => setActiveTab('messaged' as CareStage), 300);
      return next;
    });
  };

  const handleNotesUpdate = (patientId: string, notes: string) => {
    setCards(prev => prev.map(c => c.patient.id === patientId ? { ...c, notes } : c));
  };

  const handleAction = async (patientId: string, action: 'send_msg1'|'send_msg2'|'renewed'|'no_response'|'retry'|'close'|'edit') => {
    const card = cards.find(c => c.patient.id === patientId);
    if (!card) return;
    setActionLoading(patientId + action);
    try {
      if (action === 'send_msg1') {
        setWaMsgModal({ card, msgType: 'msg1' });
      } else if (action === 'send_msg2') {
        setWaMsgModal({ card, msgType: 'msg2' });
      } else if (action === 'no_response') {
        const updated = await upsertPipeline(pharmacyId, patientId, 'no_response');
        showToast('نُقل لقائمة "لم يستجيبوا"', 'info');
        setCards(prev => {
          const next = prev.map(c => c.patient.id === patientId ? { ...c, stage: 'no_response' as DisplayStage, pipeline: updated || c.pipeline } : c);
          if (next.filter(c => c.stage === 'messaged').length === 0) setTimeout(() => setActiveTab('no_response'), 300);
          return next;
        });
      } else if (action === 'retry') {
        const now = new Date().toISOString();
        const updated = await upsertPipeline(pharmacyId, patientId, 'messaged', { reminded_at: now });
        setCards(prev => {
          const next = prev.map(c => c.patient.id === patientId ? { ...c, stage: 'messaged' as DisplayStage, pipeline: updated || c.pipeline } : c);
          if (next.filter(c => c.stage === 'no_response').length === 0) setTimeout(() => setActiveTab('messaged'), 300);
          return next;
        });
      } else if (action === 'close') {
        const confirmed = window.confirm(`هل أنت متأكد من نقل ${card.patient.name} لقائمة الأرشيف؟`);
        if (!confirmed) return;
        // طرح أدوية هذا المريض من المخزون المؤكَّد قبل الأرشفة
        card.meds.forEach(med => {
          const key = med.medication_name.trim().toLowerCase();
          const boxes = Math.max(1, Number(med.boxes_count));
          deductFromInventory(key, boxes);
        });
        const updated = await upsertPipeline(pharmacyId, patientId, 'archived');
        showToast('نُقل للمحفوظات', 'info');
        setCards(prev => prev.map(c => c.patient.id === patientId ? { ...c, stage: 'archived' as DisplayStage, pipeline: updated || c.pipeline } : c));
      } else if (action === 'renewed' || action === 'edit') {
        setMedModal({ patient: card.patient, meds: card.meds });
      }
    } catch (e) { console.error('handleAction error:', e); }
    finally { setActionLoading(null); }
  };

  const byStage = (s: CareStage) => sortByPriority(cards.filter(c => c.stage === s), s);
  const total = cards.length;
  const activeCards = byStage(activeTab);

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center" dir="rtl">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium text-slate-500">جاري تحميل البيانات...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50/50 antialiased text-slate-900 pb-20" dir="rtl">

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&display=swap');
        body { font-family: 'IBM Plex Sans Arabic', system-ui, sans-serif; }
        .tabular { font-variant-numeric: tabular-nums; }
        @keyframes saasSlideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes saasFadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes softPulse   { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(1.02); } }
        .saas-slide-up     { animation: saasSlideUp 0.25s ease both; }
        .saas-fade-in      { animation: saasFadeIn 0.2s ease both; }
        .animate-soft-pulse { animation: softPulse 3s cubic-bezier(0.4,0,0.6,1) infinite; }
        .scrollbar-none::-webkit-scrollbar { display: none; }
        .scrollbar-none { scrollbar-width: none; }
      `}</style>

      <DashboardHeader />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 space-y-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">رعاية الأدوية المزمنة</h1>
            <p className="text-sm text-slate-500 mt-1">
              {total > 0 ? `${total} مريض مسجّل` : 'ابدأ بإدارة مرضاك المزمنين'}
            </p>
          </div>
          <div className="grid grid-cols-3 sm:flex sm:items-center gap-2 sm:gap-3">
            <button onClick={() => { setShowStats(v => !v); setShowInventory(false); }}
              className={`h-10 px-2 sm:px-4 flex items-center justify-center gap-2 rounded-lg text-xs sm:text-sm font-medium transition-all shadow-sm border ${
                showStats ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}>
              📊 نتائجك
            </button>
            <button onClick={() => { setShowInventory(v => !v); setShowStats(false); }}
              className={`h-10 px-2 sm:px-4 flex items-center justify-center gap-2 rounded-lg text-xs sm:text-sm font-medium transition-all shadow-sm border ${
                showInventory ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}>
              📦 جهّز مخزونك
            </button>
            <button onClick={() => setAddModal(true)}
              className="h-10 px-2 sm:px-4 flex items-center justify-center gap-2 rounded-lg bg-teal-600 text-white text-xs sm:text-sm font-medium hover:bg-teal-700 transition-all shadow-sm">
              متابعة مريض
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        {total > 0 && !showInventory && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                stage: 'due' as CareStage, count: byStage('due').length, label: 'قارب النفاذ',
                tooltip: {
                  title: 'الوقت المثالي للتواصل',
                  body: 'دواء هذا المريض على وشك النفاد — تواصل معه الآن ليجدد من صيدليتك قبل أن يلجأ لغيرك. المتابعة في هذه المرحلة هي الفرق بين مريض يبقى ومريض يغادر.',
                  color: 'rose',
                }
              },
              {
                stage: 'messaged' as CareStage, count: byStage('messaged').length, label: 'تم الإرسال',
                tooltip: {
                  title: 'في انتظار الرد',
                  body: 'أرسلت تذكيراً لهذا المريض — الآن انتظر تجاوبه. إذا لم يرد خلال 5 أيام سيُنقل تلقائياً لقائمة "بدون رد" لمتابعة إضافية.',
                  color: 'blue',
                }
              },
              {
                stage: 'no_response' as CareStage, count: byStage('no_response').length, label: 'بدون رد',
                tooltip: {
                  title: 'يستحق متابعة ثانية',
                  body: 'لم يرد على رسالتك الأولى — لكن هذا لا يعني رفضه. جرّب التواصل في وقت مختلف أو بأسلوب أكثر شخصية. المتابعة الثانية تُحدث فرقاً كبيراً.',
                  color: 'amber',
                }
              },
              {
                stage: 'renewed' as CareStage, count: byStage('renewed').length, label: 'تم التجديد',
                tooltip: {
                  title: 'مريض محافظ عليه',
                  body: 'جدّد هذا المريض من صيدليتك — هذا هو الهدف. استمر في المتابعة الدورية لتحافظ على ثقته ودوامه معك طوال العام.',
                  color: 'emerald',
                }
              },
            ].map(s => {
              const isUrgent  = s.stage === 'due'         && s.count > 0;
              const isWarning = s.stage === 'no_response' && s.count > 0;
              const tc = s.tooltip.color;
              const tooltipBorder = tc === 'rose' ? 'border-rose-100'    : tc === 'blue' ? 'border-blue-100'    : tc === 'amber' ? 'border-amber-100'    : 'border-emerald-100';
              const tooltipTitle  = tc === 'rose' ? 'text-rose-700'      : tc === 'blue' ? 'text-blue-700'      : tc === 'amber' ? 'text-amber-700'      : 'text-emerald-700';
              const tooltipDot    = tc === 'rose' ? 'bg-rose-400'        : tc === 'blue' ? 'bg-blue-400'        : tc === 'amber' ? 'bg-amber-400'        : 'bg-emerald-400';
              return (
                <div key={s.stage} className="relative group">
                  <button
                    onClick={() => { setActiveTab(s.stage); setShowInventory(false); setShowStats(false); }}
                    className={`w-full bg-white rounded-xl border p-5 shadow-sm flex flex-col justify-between hover:shadow-md transition-all text-right ${
                      activeTab === s.stage && !showInventory ? 'ring-2 ring-slate-900 border-transparent' : 'border-slate-200'
                    } ${isUrgent ? 'border-rose-200 bg-rose-50/30 animate-soft-pulse' : ''
                    } ${isWarning ? 'border-amber-200 bg-amber-50/30 animate-soft-pulse' : ''}`}>
                    <div className="flex items-center justify-between w-full">
                      <span className="text-sm font-medium text-slate-500">{s.label}</span>
                      {isUrgent  && <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />}
                      {isWarning && <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />}
                    </div>
                    <span className={`text-3xl font-bold mt-2 ${
                      isUrgent ? 'text-rose-700' : isWarning ? 'text-amber-700' : 'text-slate-900'
                    }`}>{s.count}</span>
                  </button>

                  {/* Tooltip — هادئ وبطيء */}
                  <div className="absolute bottom-full mb-3 right-0 w-64 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500 ease-in-out">
                    <div className={`bg-white border ${tooltipBorder} rounded-xl p-4 shadow-lg`} dir="rtl">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tooltipDot}`} />
                        <p className={`text-xs font-bold ${tooltipTitle} text-right`}>{s.tooltip.title}</p>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed text-right">{s.tooltip.body}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Inventory */}
        {showStats && total > 0 && (() => {
          const activePipelines = cards.filter(c => c.stage !== 'archived');
          const renewed     = cards.filter(c => c.stage === 'renewed');
          const messaged    = cards.filter(c => c.stage === 'messaged');
          const noResponse  = cards.filter(c => c.stage === 'no_response');
          const due         = cards.filter(c => c.stage === 'due');

          const totalMessaged = renewed.length + messaged.length + noResponse.length;
          const responseRate  = totalMessaged > 0 ? Math.round((renewed.length / totalMessaged) * 100) : 0;
          const AVG_VALUE     = 15;
          const savedRevenue  = renewed.length * AVG_VALUE;

          const medCount = new Map<string, number>();
          activePipelines.forEach(c => c.meds.forEach(m => {
            const k = m.medication_name.trim();
            medCount.set(k, (medCount.get(k) || 0) + 1);
          }));
          const topMeds = [...medCount.entries()].sort((a,b) => b[1]-a[1]).slice(0,5);
          const maxMedCount = topMeds[0]?.[1] || 1;

          const loyalPatients = [...activePipelines]
            .sort((a,b) => b.loyaltyMonths - a.loyaltyMonths).slice(0,3);

          const totalMedsCount = activePipelines.reduce((s,c) => s + c.meds.length, 0);
          const avgMeds = activePipelines.length > 0
            ? (totalMedsCount / activePipelines.length).toFixed(1) : '0';

          const atRisk = noResponse.filter(c =>
            c.pipeline?.updated_at &&
            Math.floor((Date.now() - new Date(c.pipeline.updated_at).getTime()) / 86400000) >= 7
          ).length;

          return (
            <div className="space-y-4 saas-slide-up" dir="rtl">

              {/* ── Hero — النتيجة الأهم ── */}
              <div className="relative bg-slate-900 rounded-2xl overflow-hidden">
                {/* خلفية زخرفية */}
                <div className="absolute inset-0 opacity-10">
                  <div className="absolute -top-8 -left-8 w-48 h-48 rounded-full bg-teal-400" />
                  <div className="absolute -bottom-12 -right-4 w-64 h-64 rounded-full bg-teal-600" />
                </div>
                <div className="relative px-6 py-7">
                  <p className="text-teal-400 text-[11px] font-bold uppercase tracking-widest mb-4">ملخص أداء الصيدلية</p>
                  <div className="flex items-center gap-5">
                    <div className="text-white">
                      <p className="text-5xl sm:text-7xl font-black tabular-nums leading-none">{renewed.length}</p>
                      <p className="text-slate-300 text-base mt-2 font-medium">مريض جدّد أدويته من صيدليتك</p>
                      <p className="text-slate-500 text-xs mt-1">نتيجة متابعتك المنتظمة ومبادرتك بالتواصل</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── KPIs ── */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    label: 'مرضى نشطون', value: activePipelines.length,
                    sub: 'مريض مزمن في قاعدة بياناتك', dim: false,
                    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
                  },
                  {
                    label: 'معدل الاستجابة', value: `${responseRate}%`,
                    sub: responseRate >= 70 ? 'ممتاز — استمر' : responseRate >= 40 ? 'جيد — يمكن تحسينه' : 'يحتاج مراجعة', dim: false,
                    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>
                  },
                  {
                    label: 'متوسط الأدوية', value: avgMeds,
                    sub: 'دواء مزمن لكل مريض', dim: false,
                    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" /></svg>
                  },
                  {
                    label: 'يحتاجون متابعة', value: atRisk,
                    sub: 'أكثر من أسبوع بدون رد', dim: atRisk > 0,
                    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                  },
                ].map(kpi => (
                  <div key={kpi.label} className={`rounded-xl p-4 border ${kpi.dim && atRisk > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{kpi.label}</p>
                      <span className={`${kpi.dim && atRisk > 0 ? 'text-amber-500' : 'text-slate-400'}`}>{kpi.icon}</span>
                    </div>
                    <p className={`text-3xl font-black tabular-nums ${kpi.dim && atRisk > 0 ? 'text-amber-700' : 'text-slate-900'}`}>{kpi.value}</p>
                    <p className={`text-[11px] mt-1.5 ${kpi.dim && atRisk > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{kpi.sub}</p>
                  </div>
                ))}
              </div>

              {/* ── معدل التحويل ── */}
              {totalMessaged > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4">رحلة المريض من التذكير للتجديد</p>
                  <div className="space-y-3">
                    {[
                      { label: 'تم إرسال تذكير', count: totalMessaged, color: 'bg-slate-200', textColor: 'text-slate-600' },
                      { label: 'جدّدوا بعد التذكير', count: renewed.length, color: 'bg-teal-500', textColor: 'text-teal-700' },
                    ].map(row => (
                      <div key={row.label}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs text-slate-600">{row.label}</span>
                          <span className={`text-xs font-bold ${row.textColor}`}>{row.count}</span>
                        </div>
                        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full ${row.color} rounded-full transition-all duration-700`}
                            style={{ width: `${(row.count / Math.max(totalMessaged, 1)) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">معدل التحويل الإجمالي</span>
                    <span className={`text-sm font-black ${responseRate >= 70 ? 'text-teal-600' : responseRate >= 40 ? 'text-amber-600' : 'text-rose-600'}`}>{responseRate}%</span>
                  </div>
                </div>
              )}

              {/* ── أكثر الأدوية شيوعاً ── */}
              {topMeds.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4">أكثر الأدوية شيوعاً عند مرضاك</p>
                  <div className="space-y-3.5">
                    {topMeds.map(([name, count], i) => (
                      <div key={name} className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-slate-300 w-4 shrink-0 tabular-nums">{i+1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-semibold text-slate-800 truncate">{name}</p>
                            <span className="text-[10px] text-slate-400 shrink-0 mr-2 tabular-nums">{count} مريض</span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-teal-500 rounded-full transition-all duration-500"
                              style={{ width: `${(count / maxMedCount) * 100}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5">
                    <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" /></svg>
                    تأكد من توفر هذه الأدوية دائماً — هي عصب مبيعاتك المزمنة
                  </p>
                </div>
              )}

              {/* ── أوفى المرضى ── */}
              {loyalPatients.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4">أكثر مرضاك وفاءً</p>
                  <div className="space-y-4">
                    {loyalPatients.map((c, i) => (
                      <div key={c.patient.id} className="flex items-center gap-4">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black shrink-0 tabular-nums ${
                          i === 0 ? 'bg-amber-100 text-amber-700' :
                          i === 1 ? 'bg-slate-100 text-slate-500' :
                          'bg-orange-50 text-orange-500'
                        }`}>
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{c.patient.name}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{c.meds.length} أدوية مزمنة</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-black text-slate-900 tabular-nums leading-none">{c.loyaltyMonths}</p>
                          <p className="text-[9px] text-slate-400 mt-0.5">شهر</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5">
                    <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    هؤلاء يثقون بصيدليتك — أولويتك أن يبقوا
                  </p>
                </div>
              )}

              {/* ── رسالة الختام ── */}
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-5 py-4">
                <p className="text-sm font-semibold text-slate-700 text-center">
                {renewed.length > 0
                    ? `${renewed.length} مريض اختار صيدليتك مرة أخرى — هذا دليل على أن متابعتك تُحدث فرقاً.`
                    : 'ابدأ بإرسال التذكيرات وسترى نتائجك هنا.'}
                </p>
              </div>

            </div>
          );
        })()}

        {showInventory && <InventoryTab cards={cards} onClose={() => setShowInventory(false)} />}

        {/* Patients List */}
        {!showInventory && !showStats && total > 0 && (
          <div className="space-y-6">
            <div className="saas-slide-up" key={activeTab}>
              {activeCards.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl py-16 text-center shadow-sm">
                  <p className="text-sm font-medium text-slate-500">لا يوجد مرضى في هذه القائمة حالياً</p>
                </div>
              ) : (
                <div>
                  {activeCards.map((card, idx) => (
                    <div key={card.patient.id} className="relative">
                      <PatientCard card={card} pharmacyName={pharmacyName} index={idx}
                        onAction={action => handleAction(card.patient.id, action)}
                        onNotesUpdate={handleNotesUpdate} />
                      {actionLoading?.startsWith(card.patient.id) && (
                        <div className="absolute inset-0 bg-white/60 rounded-xl flex items-center justify-center backdrop-blur-sm z-10">
                          <div className="w-6 h-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!showInventory && !showStats && total === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl py-24 text-center px-6 shadow-sm flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-2xl mb-4 text-slate-400">⌘</div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">لا توجد سجلات بعد</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">قم بإضافة مرضاك لتتبع الأدوية المزمنة والحصول على تنبيهات النفاذ التلقائية.</p>
            <button onClick={() => setAddModal(true)}
              className="h-10 px-6 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors shadow-sm">
              إضافة مريض جديد
            </button>
          </div>
        )}
      </main>

      {/* Archived */}
      {!showInventory && !showStats && (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-10 mt-8">
          <button onClick={() => setShowArchived(v => !v)}
            className="w-full h-12 flex items-center justify-center gap-2 border border-dashed border-slate-300 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors">
            الأرشيف ({cards.filter(c => c.stage === ('archived' as DisplayStage)).length})
          </button>
          {showArchived && (
            <div className="mt-4 saas-fade-in space-y-3">
              {cards.filter(c => c.stage === ('archived' as DisplayStage)).map(card => (
                <div key={card.patient.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{card.patient.name}</p>
                    <p className="text-xs text-slate-500 mt-1">{card.patient.phone_number}</p>
                  </div>
                  <button onClick={async () => {
                    const updated = await upsertPipeline(pharmacyId, card.patient.id, 'due');
                    setCards(prev => prev.map(c => c.patient.id === card.patient.id ? { ...c, stage: 'due' as DisplayStage, pipeline: updated || c.pipeline } : c));
                    setShowArchived(false); setActiveTab('due');
                  }} className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                    إعادة تفعيل
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* WaMsgModal — تخصيص رسالة الواتساب */}
      {waMsgModal && (
        <WaMsgModal
          patient={waMsgModal.card.patient}
          meds={waMsgModal.card.meds}
          pharmacyName={pharmacyName}
          msgType={waMsgModal.msgType}
          onClose={() => setWaMsgModal(null)}
          onConfirm={handleWaConfirm}
        />
      )}

      {/* Confirm Send Dialog */}
      {confirmSent && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9998] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm border border-slate-200 overflow-hidden saas-slide-up">
            <div className="p-6 text-center">
              <h4 className="text-lg font-semibold text-slate-900 mb-2">هل تم الإرسال بنجاح؟</h4>
              <p className="text-sm text-slate-500 mb-6">يرجى التأكيد لنقل {confirmSent.patientName} إلى قائمة "تم الإرسال".</p>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => handleConfirmSent(false)} className="py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">لم يُرسَل</button>
                <button onClick={() => handleConfirmSent(true)} className="py-2.5 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition-colors">نعم، تم الإرسال ✓</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} />

      {addModal && (
        <AddPatientModal pharmacyId={pharmacyId} onClose={() => { setAddModal(false); setSearchPrefill(null); }}
          prefill={searchPrefill}
          onAdded={async (p, note, isExistingPatient) => {
            setAddModal(false);
            if (note && note.trim()) {
              await upsertPipeline(pharmacyId, p.id, 'due', {});
              await supabase.from('refill_tracking_pipeline').update({ insurance_status: note.trim() })
                .eq('pharmacy_id', pharmacyId).eq('patient_id', p.id).eq('payment_type', 'cash');
            }
            setSearchPrefill({ patient: p, meds: [] });
            setMedModalFromSearch(true);
            // isNewPatient: true فقط للمرضى الجدد تماماً — الموجودون لديهم سجل سابق
            setMedModal({ patient: p, meds: [], isNewPatient: !isExistingPatient });
          }}
          onRenew={(p, meds) => {
            // احفظ بيانات المريض مع أدويته للرجوع إليها
            setSearchPrefill({ patient: p, meds });
            setAddModal(false);
            setMedModalFromSearch(true);
            setMedModal({ patient: p, meds });
          }}
        />
      )}

      {medModal && (
        <MedModal
          patientId={medModal.patient.id} pharmacyId={pharmacyId}
          existingMeds={medModal.meds} patientName={medModal.patient.name}
          isNewPatient={medModal.isNewPatient}
          onClose={() => {
            const wasNewPatient = medModal.isNewPatient;
            const currentTab = activeTab;
            setMedModal(null);
            setMedModalFromSearch(false);
            setSearchPrefill(null);
            // fetchAll فقط عند مريض جديد — مع الحفاظ على التبويب الحالي
            if (wasNewPatient) {
              setTimeout(() => fetchAll(currentTab), 100);
            }
          }}
          onBack={medModalFromSearch ? () => {
            // يعود لـ AddPatientModal مع استعادة بيانات المريض كاملةً
            setMedModal(null);
            setMedModalFromSearch(false);
            setAddModal(true);
            // searchPrefill يبقى كما هو — AddPatientModal سيقرأه
          } : undefined}
          onSaved={async () => {
            const patientId = medModal.patient.id;
            const savedMeds = medModal.meds;
            setMedModal(null);
            setMedModalFromSearch(false);
            setSearchPrefill(null);
            // طرح أدوية هذا المريض من المخزون المؤكَّد
            savedMeds.forEach(med => {
              const key = med.medication_name.trim().toLowerCase();
              const boxes = Math.max(1, Number(med.boxes_count));
              deductFromInventory(key, boxes);
            });
            const updated = await upsertPipeline(pharmacyId, patientId, 'renewed');
            showToast('تم الحفظ بنجاح ✓');
            setCards(prev => {
              const next = prev.map(c => c.patient.id === patientId
                ? { ...c, stage: 'renewed' as DisplayStage, pipeline: updated || c.pipeline } : c);
              if (next.filter(c => c.stage === activeTab).length === 0) setTimeout(() => setActiveTab('renewed'), 300);
              return next;
            });
            setTimeout(() => fetchAll('renewed'), 300);
          }}
        />
      )}
    </div>
  );
}
