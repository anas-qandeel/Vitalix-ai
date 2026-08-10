'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import DashboardHeader, { usePharmacyInfo, getActivePharmacist } from '../components/DashboardHeader';

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════
interface Patient {
  id: string;
  name: string;
  phone_number: string;
  gender: string;
  birth_date: string;
  height?: number | null;
  diagnosed_conditions?: string[] | null;
}

interface VisitationRecord {
  id: string;
  pharmacy_id: string;
  patient_id: string;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  sugar_value: number | null;
  sugar_test_type: string | null;
  weight: number | null;
  symptoms: string[] | null;
  had_stimulants: boolean;
  recent_exertion: boolean;
  recent_heavy_meal: boolean;
  is_stressed: boolean;
  took_medication: boolean;
  ai_report_output: string | null;
  heart_rate: number | null;
  performed_by: string | null;
  created_at: string;
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════
function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ar-EG', { numberingSystem: 'latn' });
}
function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true, numberingSystem: 'latn' });
}
function normalizePhone(phone: string): string {
  let c = phone.replace(/[^0-9]/g, '');
  if (c.startsWith('00962')) c = '0' + c.substring(5);
  else if (c.startsWith('962') && c.length > 10) c = '0' + c.substring(3);
  return c;
}
function normalizeAr(s: string): string {
  return s.trim()
    // توحيد الألف بكل أشكالها
    .replace(/[أإآٱٲٳٵ]/g, 'ا')
    // توحيد الهمزة المفردة والمتصلة
    .replace(/[ءؤئ]/g, 'ء')
    // توحيد التاء المربوطة
    .replace(/ة/g, 'ه')
    // توحيد الياء والألف المقصورة
    .replace(/[ىی]/g, 'ي')
    // توحيد الواو مع الهمزة
    .replace(/ؤ/g, 'و')
    // حذف التشكيل كاملاً (فتحة، ضمة، كسرة، شدة، سكون ...)
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // حذف المدة والصفة المشبهة
    .replace(/[\u0653-\u0655]/g, '')
    .toLowerCase();
}
function detectInputType(q: string): 'phone' | 'name' {
  const t = q.trim();
  if (!t) return 'phone';
  return /^[0-9+]/.test(t) ? 'phone' : 'name';
}

// ═══════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════
function IconSearch({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}
function IconHeart({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    </svg>
  );
}
function IconDroplet({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.75S6 10.5 6 14.25a6 6 0 0012 0C18 10.5 12 3.75 12 3.75z" />
    </svg>
  );
}
function IconScale({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" />
    </svg>
  );
}
function IconUser({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}
function IconPhone({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-2.896-1.596-5.265-3.965-6.861-6.861l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    </svg>
  );
}
function IconArrowLeft({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  );
}
function IconCheck({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
function IconChevronDown({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
function IconPlus({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════
// MODAL: مريض جديد
// ═══════════════════════════════════════════════════════
function NewPatientModal({ phone, onClose, onCreated }: {
  phone: string;
  onClose: () => void;
  onCreated: (p: Patient) => void;
}) {
  const [name, setName] = useState('');
  const [gender, setGender] = useState('male');
  const [dob, setDob] = useState('1975-01-01');
  const [conditions, setConditions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const toggleCondition = (key: string) => {
    setConditions(prev => prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]);
  };

  const save = async () => {
    if (!name.trim()) { setErr('يرجى إدخال اسم المريض'); return; }
    setSaving(true); setErr('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('انتهت الجلسة');
      const { data, error } = await supabase.from('patients').insert({
        pharmacy_id: session.user.id,
        name: name.trim(),
        phone_number: normalizePhone(phone),
        gender,
        birth_date: dob,
        diagnosed_conditions: conditions,
      }).select().single();
      if (error || !data) throw new Error('تعذر الحفظ');
      onCreated(data as Patient);
    } catch (e: any) { setErr(e.message); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl border border-slate-200 saas-slide-up" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900">تسجيل مريض جديد</h3>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">{phone}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-colors text-sm">✕</button>
        </div>

        <div className="p-5 space-y-4">

          {/* الاسم */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">الاسم الكامل</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900 transition text-slate-900"
            />
          </div>

          {/* الجنس + تاريخ الميلاد */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">الجنس</label>
              <div className="flex bg-slate-100 p-1 rounded-lg">
                {[{ v: 'male', l: 'ذكر' }, { v: 'female', l: 'أنثى' }].map(g => (
                  <button key={g.v} onClick={() => setGender(g.v)}
                    className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${gender === g.v ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>
                    {g.l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">تاريخ الميلاد</label>
              <input type="date" value={dob} onChange={e => setDob(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
            </div>
          </div>

          {/* التشخيصات */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2">التشخيصات المزمنة <span className="font-normal text-slate-400">(اختياري)</span></label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'hypertension', label: 'ضغط الدم', icon: <IconHeart className="w-3.5 h-3.5" /> },
                { key: 'diabetes', label: 'السكري', icon: <IconDroplet className="w-3.5 h-3.5" /> },
              ].map(({ key, label, icon }) => {
                const active = conditions.includes(key);
                return (
                  <button key={key} onClick={() => toggleCondition(key)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                      active ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}>
                    {icon}
                    <span>{active ? '✓ ' : ''}{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {err && <p className="text-xs text-rose-600 font-medium bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">{err}</p>}
        </div>

        <div className="px-5 pb-5">
          <button onClick={save} disabled={saving || !name.trim()}
            className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold transition active:scale-[0.98] disabled:opacity-50 shadow-sm">
            {saving ? 'جاري الحفظ...' : 'حفظ وبدء الفحص'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════
export default function VitalsPage() {
  const router = useRouter();
  const { pharmacyName } = usePharmacyInfo();
  const searchRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  // ── حالة البحث ──
  const [searchQuery, setSearchQuery] = useState('');
  const [allPatients, setAllPatients] = useState<Patient[]>([]);
  const [nameResults, setNameResults] = useState<Patient[]>([]);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const [searchingPatient, setSearchingPatient] = useState(false);
  const [showNewPatientModal, setShowNewPatientModal] = useState(false);

  // ── المريض والزيارات ──
  const [currentPatient, setCurrentPatient] = useState<Patient | null>(null);
  const [patientHistory, setPatientHistory] = useState<VisitationRecord[]>([]);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  // ── الفحوصات ──
  const [isDualBp, setIsDualBp] = useState(true);
  const [activeTests, setActiveTests] = useState({ bp: false, sugar: false, weight: false });
  const [bpSys1, setBpSys1] = useState('');
  const [heartRate, setHeartRate] = useState('');
  const [heartRate2, setHeartRate2] = useState('');
  const [bpDia1, setBpDia1] = useState('');
  const [bpSys2, setBpSys2] = useState('');
  const [bpDia2, setBpDia2] = useState('');
  const [sugarValue, setSugarValue] = useState('');
  const [sugarType, setSugarType] = useState('');
  const [weightValue, setWeightValue] = useState('');
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);

  // ── الإرسال والتقرير ──
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [latestGeneratedReport, setLatestGeneratedReport] = useState<string | null>(null);
  const [latestVisitId, setLatestVisitId] = useState<string | null>(null);

  // ── العوامل المؤثرة ──
  const [bpFactors, setBpFactors] = useState<string[]>([]);
  const [sugarFactors, setSugarFactors] = useState<string[]>([]);

  const bpSymptomsList = ['صداع', 'دوخة', 'زغللة عين', 'طنين أذن', 'ألم بالصدر', 'ضيق تنفس'];
  const bpFactorsList = [
    { key: 'had_stimulants', label: 'شرب قهوة / شاي / مكيّف' },
    { key: 'recent_exertion', label: 'مجهود بدني مؤخراً' },
    { key: 'is_stressed', label: 'يشعر بتوتر أو قلق' },
    { key: 'took_medication', label: 'أخذ دواء الضغط اليوم' },
  ];
  const sugarFactorsList = [
    { key: 'recent_heavy_meal', label: 'تناول وجبة دسمة مؤخراً' },
    { key: 'is_stressed', label: 'يشعر بتوتر أو قلق' },
    { key: 'took_medication', label: 'أخذ دواء السكري اليوم' },
  ];
  const sugarSymptomsList = ['عطش شديد', 'تبول متكرر', 'جفاف فم', 'خدران أطراف', 'تعرق بارد', 'جوع مفاجئ'];

  // ── حساب المتوسطات ──
  const finalHeartRate = isDualBp && heartRate && heartRate2
    ? Math.round((Number(heartRate) + Number(heartRate2)) / 2)
    : heartRate.trim() ? Number(heartRate) : null;

  const finalSys = isDualBp && bpSys1 && bpSys2
    ? Math.round((Number(bpSys1) + Number(bpSys2)) / 2)
    : Number(bpSys1);
  const finalDia = isDualBp && bpDia1 && bpDia2
    ? Math.round((Number(bpDia1) + Number(bpDia2)) / 2)
    : Number(bpDia1);

  const hasAnyReading = (activeTests.bp && bpSys1) || (activeTests.sugar && sugarValue) || (activeTests.weight && weightValue);

  // ── تحميل كاش المرضى ──
  useEffect(() => {
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const { data } = await supabase
          .from('patients')
          .select('id, name, phone_number, gender, birth_date, height, diagnosed_conditions')
          .eq('pharmacy_id', session.user.id);
        if (data) setAllPatients(data as Patient[]);
      } catch (e) { console.error(e); }
    };
    load();
  }, []);

  // ── إغلاق dropdown خارجه ──
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setNameResults([]);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // ── استعادة مريض من sessionStorage ──
  useEffect(() => {
    const saved = sessionStorage.getItem('vitalix_current_patient');
    if (saved) {
      try {
        const { patient, history, searchQuery: savedQuery } = JSON.parse(saved);
        setCurrentPatient(patient);
        setPatientHistory(history || []);
        // استعادة طريقة البحث الأصلية (رقم هاتف أو اسم)
        setSearchQuery(savedQuery || patient.name || '');
      } catch { }
      sessionStorage.removeItem('vitalix_current_patient');
    }
  }, []);

  // ── تحميل تاريخ مريض ──
  const loadHistory = async (p: Patient) => {
    const { data } = await supabase.from('visitations').select('*').eq('patient_id', p.id).order('created_at', { ascending: false });
    if (data) setPatientHistory(data as VisitationRecord[]);
  };

  // ── اختيار مريض ──
  // keepQuery=true عند البحث برقم الهاتف → يبقي الرقم في الحقل بدون استبداله بالاسم
  const selectPatient = async (p: Patient, keepQuery = false) => {
    setCurrentPatient(p);
    if (!keepQuery) setSearchQuery(p.name);
    setNameResults([]);
    // إعادة تعيين الفحوصات لكل مريض جديد
    setIsDualBp(true);
    setActiveTests({ bp: false, sugar: false, weight: false });
    setBpSys1(''); setBpDia1(''); setBpSys2(''); setBpDia2(''); setHeartRate(''); setHeartRate2('');
    setSugarValue(''); setSugarType(''); setWeightValue('');
    setSelectedSymptoms([]); setBpFactors([]); setSugarFactors([]);
    setErrorMsg(''); setSoftWarningMsg(''); setSoftWarningConfirmed(false);
    setLatestGeneratedReport(null); setLatestVisitId(null);
    setSearchingPatient(true);
    try { await loadHistory(p); } catch { }
    finally { setSearchingPatient(false); }
  };

  // ── البحث الموحّد ──
  const handleSearch = async (value: string) => {
    setSearchQuery(value);
    setErrorMsg('');
    setNameResults([]);

    if (!value.trim()) {
      setCurrentPatient(null);
      setPatientHistory([]);
      return;
    }

    const type = detectInputType(value);

    if (type === 'phone') {
      // إذا غيّر المستخدم للرقم → امسح المريض الحالي
      setCurrentPatient(null);
      const digits = value.replace(/\D/g, '');
      if (digits.length < 8) return;
      setSearchingPatient(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const { data: found } = await supabase.from('patients').select('*')
          .eq('pharmacy_id', session.user.id).eq('phone_number', normalizePhone(value));
        if (found && found.length > 0) {
          await selectPatient(found[0] as Patient, true); // keepQuery=true يحافظ على رقم الهاتف في الحقل
        }
        // إذا لم يجد → سيظهر زر "مريض جديد" تلقائياً
      } catch { }
      finally { setSearchingPatient(false); }
      return;
    }

    // بحث بالاسم — من الكاش المحلي فقط مع تطبيع الهمزات
    // ilike في Supabase لا يدعم تطبيع الهمزات العربية لذا نعتمد على الكاش+normalizeAr
    if (value.trim().length < 1) { setHighlightedIdx(-1); return; }
    setHighlightedIdx(-1);
    setCurrentPatient(null);
    const normQ = normalizeAr(value);
    const matches = allPatients.filter(p => normalizeAr(p.name).includes(normQ));
    setNameResults(matches);
  };

  // ── إنشاء مريض جديد من Modal ──
  const handleNewPatientCreated = (p: Patient) => {
    setCurrentPatient(p);
    setSearchQuery(p.name);
    setAllPatients(prev => [...prev, p]);
    setShowNewPatientModal(false);
  };

  // ── حساب الحالة الكلية ──
  const getStatus = () => {
    let level: 'normal' | 'medium' | 'high' = 'normal';
    if (activeTests.bp && bpSys1) {
      if (finalSys >= 180 || finalDia >= 120 || finalSys < 90 || finalDia < 60) level = 'high';
      else if (finalSys >= 140 || finalDia >= 90) level = 'medium';
    }
    if (activeTests.sugar && sugarValue) {
      const s = Number(sugarValue);
      if (s >= 300 || s < 70) level = 'high';
      else if (s >= 180 && level !== 'high') level = 'medium';
    }
    if (level === 'high') return { label: 'يستدعي انتباهاً', color: 'text-rose-600', dot: 'bg-rose-500', border: 'border-rose-200', bg: 'bg-rose-50' };
    if (level === 'medium') return { label: 'يحتاج متابعة', color: 'text-amber-600', dot: 'bg-amber-500', border: 'border-amber-200', bg: 'bg-amber-50' };
    return { label: 'ضمن الطبيعي', color: 'text-teal-600', dot: 'bg-teal-500', border: 'border-teal-200', bg: 'bg-teal-50' };
  };

  // ═══════════════════════════════════════════════════════════════
  // VALIDATION — حدود علمية مستندة من ADA / AHA / WHO
  // ═══════════════════════════════════════════════════════════════

  // Hard limits: مستحيل فيزيائياً أو خطأ إدخال مؤكد
  const HARD = {
    sys:    { min: 50,  max: 300 },  // AHA: < 50 shock/artifact, > 300 documented extreme
    dia:    { min: 30,  max: 200 },  // diastolic < 30 → cardiogenic shock
    sugar:      { min: 20,  max: 800 },  // < 20 fatal hypoglycemia, > 800 HHNS extreme
    weight:     { min: 20,  max: 500 },  // < 20 kg not survivable ambulatory, > 500 kg extreme obesity
    heart_rate: { min: 30,  max: 250 },  // < 30 not compatible with perfusion, > 250 extreme tachyarrhythmia
  };

  // Soft warnings: حرج طبياً يستدعي تأكيد الصيدلي
  const SOFT = {
    sys:    { min: 70,  max: 180 },  // AHA: < 70 shock zone, ≥ 180 hypertensive crisis
    dia:    { min: 40,  max: 120 },  // < 40 severe hypotension, ≥ 120 hypertensive emergency
    sugar:      { min: 54,  max: 400 },  // ADA Level-2 hypo < 54, > 400 severe hyperglycemia
    weight:     { min: 30,  max: 250 },  // < 30 kg extreme underweight, > 250 kg morbid obesity grade III
    heart_rate: { min: 40,  max: 150 },  // < 40 severe bradycardia, > 150 significant tachycardia
  };

  type ValidationResult = { type: 'ok' } | { type: 'hard'; msg: string } | { type: 'soft'; msg: string };

  const validateReadings = (): ValidationResult => {
    if (activeTests.bp && bpSys1) {
      const s = finalSys, d = finalDia;
      if (s < HARD.sys.min || s > HARD.sys.max)
        return { type: 'hard', msg: `قراءة الضغط الانقباضي (${s}) خارج النطاق المقبول طبياً (${HARD.sys.min}–${HARD.sys.max} mmHg). يرجى إعادة القياس.` };
      if (bpDia1 && (d < HARD.dia.min || d > HARD.dia.max))
        return { type: 'hard', msg: `قراءة الضغط الانبساطي (${d}) خارج النطاق المقبول طبياً (${HARD.dia.min}–${HARD.dia.max} mmHg). يرجى إعادة القياس.` };
      if (s < SOFT.sys.min || s > SOFT.sys.max || (bpDia1 && (d < SOFT.dia.min || d > SOFT.dia.max)))
        return { type: 'soft', msg: `قراءة الضغط (${s}/${d}) في النطاق الحرج. هل أنت متأكد من صحة الإدخال؟` };
    }
    if (activeTests.sugar && sugarValue) {
      const sv = Number(sugarValue);
      if (sv < HARD.sugar.min || sv > HARD.sugar.max)
        return { type: 'hard', msg: `قراءة السكري (${sv} mg/dL) خارج النطاق المقبول طبياً (${HARD.sugar.min}–${HARD.sugar.max}). يرجى إعادة القياس.` };
      if (sv < SOFT.sugar.min || sv > SOFT.sugar.max)
        return { type: 'soft', msg: `قراءة السكري (${sv} mg/dL) في النطاق الحرج. هل أنت متأكد من صحة الإدخال؟` };
    }
    if (activeTests.bp && finalHeartRate !== null) {
      if (finalHeartRate < HARD.heart_rate.min || finalHeartRate > HARD.heart_rate.max)
        return { type: 'hard', msg: `معدل النبض (${finalHeartRate}) خارج النطاق المقبول طبياً (${HARD.heart_rate.min}–${HARD.heart_rate.max} نبضة/دقيقة). يرجى التحقق من الإدخال.` };
      if (finalHeartRate < SOFT.heart_rate.min || finalHeartRate > SOFT.heart_rate.max)
        return { type: 'soft', msg: `معدل النبض (${finalHeartRate}) في النطاق الحرج. هل أنت متأكد من صحة الإدخال؟` };
    }
    if (activeTests.weight && weightValue) {
      const w = Number(weightValue);
      if (w < HARD.weight.min || w > HARD.weight.max)
        return { type: 'hard', msg: `قيمة الوزن (${w} kg) خارج النطاق المقبول (${HARD.weight.min}–${HARD.weight.max} kg). يرجى التحقق من الإدخال.` };
      if (w < SOFT.weight.min || w > SOFT.weight.max)
        return { type: 'soft', msg: `قيمة الوزن (${w} kg) تستدعي الانتباه. هل أنت متأكد من صحة الإدخال؟` };
    }
    return { type: 'ok' };
  };

  const [softWarningConfirmed, setSoftWarningConfirmed] = useState(false);
  const [softWarningMsg, setSoftWarningMsg] = useState('');

  // إعادة تصفير تأكيد التحذير عند تغيير القراءات
  const resetSoftWarning = () => { setSoftWarningConfirmed(false); setSoftWarningMsg(''); };

  // ── حفظ الزيارة ──
  const handleSave = async () => {
    if (latestVisitId) { setErrorMsg('تم حفظ هذه الزيارة مسبقاً.'); return; }
    if (!currentPatient) return;

    // ── Validation ──
    const validation = validateReadings();
    if (validation.type === 'hard') {
      setErrorMsg(validation.msg);
      return;
    }
    if (validation.type === 'soft' && !softWarningConfirmed) {
      setSoftWarningMsg(validation.msg);
      return;
    }

    setSubmitting(true); setErrorMsg(''); setSoftWarningMsg('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('انتهت الجلسة');

      const visitPayload = {
        bp_systolic: activeTests.bp ? finalSys : null,
        bp_diastolic: activeTests.bp ? finalDia : null,
        heart_rate: activeTests.bp && finalHeartRate ? finalHeartRate : null,
        is_dual_bp: activeTests.bp ? isDualBp : false,
        sugar_value: activeTests.sugar ? Number(sugarValue) : null,
        sugar_test_type: activeTests.sugar ? sugarType : null,
        weight: activeTests.weight ? Number(weightValue) : null,
        symptoms: selectedSymptoms.length > 0 ? selectedSymptoms : null,
        performed_by: getActivePharmacist() || null,
        had_stimulants: bpFactors.includes('had_stimulants') || sugarFactors.includes('had_stimulants'),
        recent_exertion: bpFactors.includes('recent_exertion'),
        recent_heavy_meal: sugarFactors.includes('recent_heavy_meal'),
        is_stressed: bpFactors.includes('is_stressed') || sugarFactors.includes('is_stressed'),
        took_medication: bpFactors.includes('took_medication') || sugarFactors.includes('took_medication'),
      };

      let report = '';
      try {
        const res = await fetch('/api/generate-ai-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patient: currentPatient, currentVisit: visitPayload, history: patientHistory, pharmacyName }),
        });
        if (res.ok) { const d = await res.json(); if (d.report) report = d.report; }
      } catch { }

      if (!report) {
        const parts: string[] = [];
        if (visitPayload.bp_systolic && visitPayload.bp_diastolic) {
          const s = visitPayload.bp_systolic, d = visitPayload.bp_diastolic;
          if (s >= 180 || d >= 120) parts.push(`ضغط الدم (${s}/${d}) مرتفع جداً، يُنصح بمراجعة الطبيب فوراً.`);
          else if (s >= 140 || d >= 90) parts.push(`ضغط الدم (${s}/${d}) أعلى من الطبيعي، يُنصح بالمتابعة.`);
          else parts.push(`ضغط الدم (${s}/${d}) ضمن الطبيعي.`);
        }
        if (visitPayload.sugar_value) {
          const sv = visitPayload.sugar_value;
          if (sv < 70 || sv >= 300) parts.push(`سكري الدم (${sv}) خارج النطاق الطبيعي.`);
          else if (sv >= 180) parts.push(`سكري الدم (${sv}) أعلى قليلاً من الطبيعي.`);
          else parts.push(`سكري الدم (${sv}) ضمن الطبيعي.`);
        }
        if (parts.length === 0) parts.push('تم توثيق الزيارة بنجاح ولا توجد قراءات خارج الطبيعي.');
        report = `مرحباً ${currentPatient.name}، من فريق ${pharmacyName || 'صيدليتك'} 👋 ${parts.join(' ')}`;
      }

      setLatestGeneratedReport(report);
      const { data: inserted, error: visitError } = await supabase.from('visitations').insert({
        pharmacy_id: session.user.id,
        patient_id: currentPatient.id,
        ...visitPayload,
        ai_report_output: report,
      }).select().single();
      if (visitError) throw new Error('تعذر حفظ بيانات الفحص');
      if (inserted) {
        setLatestVisitId(inserted.id);
        setPatientHistory([inserted as VisitationRecord, ...patientHistory]);
        // تمرير تلقائي إلى التقرير بعد لحظة قصيرة للسماح بالrender
        setTimeout(() => {
          reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 150);
      }
    } catch (e: any) { setErrorMsg(e.message || 'حدث خطأ'); }
    finally { setSubmitting(false); }
  };

  const sendWhatsApp = () => {
    if (!latestVisitId || !currentPatient) return;
    const phone = currentPatient.phone_number.replace(/[^0-9]/g, '');
    const cleanPhone = phone.startsWith('0') ? '962' + phone.substring(1) : phone;
    const visitUrl = `${window.location.origin}/dashboard/vitals/view/${latestVisitId}`;
    const msg = `مرحباً ${currentPatient.name} 👋\nتم توثيق فحوصاتك الحيوية لدى ${pharmacyName}.\n\nرابط تقريرك الطبي:\n${visitUrl}\n\n🔒 رابط آمن ومخصص لك\n\nمع تحيات فريق ${pharmacyName} 🌿`;
    window.open(`https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`, '_blank');
  };

  const handlePrintPDF = () => {
    const w = window.open('', '_blank');
    if (!w || !currentPatient) return;
    w.document.write(`<html dir="rtl" lang="ar"><head><title>تقرير فحص - ${currentPatient.name}</title><style>body{font-family:system-ui,sans-serif;padding:40px;color:#0F172A}.header{border-bottom:2px solid #0F172A;padding-bottom:15px;margin-bottom:20px;display:flex;justify-content:space-between}.title{font-size:20px;font-weight:900}.box{background:#F8FAFC;border:1px solid #E2E8F0;padding:20px;border-radius:12px;white-space:pre-line;font-size:13px;line-height:1.7}.footer{margin-top:30px;font-size:11px;color:#64748B;text-align:center;border-top:1px solid #E2E8F0;padding-top:10px}</style></head><body><div class="header"><div class="title">Vitalix<span style="color:#0D9488">.ai</span></div><div>🏥 ${pharmacyName}</div></div><div class="box">${latestGeneratedReport}</div><div class="footer">صدر هذا التقرير عبر منصة Vitalix.ai لصالح (${pharmacyName})</div><script>window.onload=function(){window.print();window.close()}</script></body></html>`);
    w.document.close();
  };

  const handleNewVisit = () => {
    setCurrentPatient(null);
    setPatientHistory([]);
    setSearchQuery('');
    setNameResults([]);
    setActiveTests({ bp: false, sugar: false, weight: false });
    setBpSys1(''); setBpDia1(''); setBpSys2(''); setBpDia2(''); setHeartRate(''); setHeartRate2('');
    setSugarValue(''); setSugarType(''); setWeightValue('');
    setSelectedSymptoms([]);
    setBpFactors([]); setSugarFactors([]);
    setIsDualBp(true);
    setLatestGeneratedReport(null);
    setLatestVisitId(null);
    setErrorMsg('');
  };

  // ── حالة متغيرات البحث ──
  const isPhoneInput = detectInputType(searchQuery) === 'phone';
  const phoneDigits = searchQuery.replace(/\D/g, '');
  const canShowNewPatient = isPhoneInput && phoneDigits.length >= 8 && !currentPatient && nameResults.length === 0 && !searchingPatient;
  const showNoResults = !isPhoneInput && searchQuery.trim().length >= 1 && !currentPatient && nameResults.length === 0 && !searchingPatient;

  const status = getStatus();

  return (
    <div className="min-h-screen bg-slate-50/50 antialiased text-slate-900 pb-20" dir="rtl">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&display=swap');
        body { font-family: 'IBM Plex Sans Arabic', system-ui, sans-serif; }
        @keyframes saasSlideUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .saas-slide-up { animation: saasSlideUp 0.25s ease both; }
        .num-input { appearance:textfield; -moz-appearance:textfield; }
        .num-input::-webkit-outer-spin-button,.num-input::-webkit-inner-spin-button { -webkit-appearance:none; margin:0; }
      `}</style>

      <DashboardHeader />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-12 space-y-6">

        {/* ── عنوان الصفحة ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">تسجيل فحص جديد</h1>
            <p className="text-sm text-slate-500 mt-1">ابحث عن مريض أو سجّل مريضاً جديداً ثم أدخل القراءات</p>
          </div>
          {latestVisitId && (
            <button onClick={handleNewVisit}
              className="h-10 px-5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition shadow-sm flex items-center gap-2">
              <IconPlus className="w-4 h-4" />
              فحص جديد
            </button>
          )}
        </div>

        {/* ════════════════════════════════════════════════════
            LAYOUT: عمودان على الشاشة الكبيرة
        ════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5 items-start">

          {/* ══ العمود الأيمن: المريض ══ */}
          <div className="space-y-4 sticky top-4 self-start">

            {/* بطاقة البحث */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-visible">
              <div className="px-5 py-4 border-b border-slate-100">
                <p className="text-sm font-bold text-slate-900">بحث عن المريض</p>
              </div>

              <div className="p-5 space-y-4">
                {/* حقل البحث */}
                <div ref={searchRef} className="relative">
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <IconSearch className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => handleSearch(e.target.value)}
                    onKeyDown={e => {
                      if (!nameResults.length) return;
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setHighlightedIdx(i => Math.min(i + 1, nameResults.length - 1));
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setHighlightedIdx(i => Math.max(i - 1, 0));
                      } else if (e.key === 'Enter' && highlightedIdx >= 0) {
                        e.preventDefault();
                        selectPatient(nameResults[highlightedIdx]);
                      } else if (e.key === 'Escape') {
                        setNameResults([]);
                        setHighlightedIdx(-1);
                      }
                    }}
                    placeholder="ابحث بالاسم أو رقم الهاتف"
                    autoFocus
                    dir="auto"
                    className="w-full pr-10 pl-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-slate-900 transition"
                  />
                  {searchingPatient && (
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                  )}

                  {/* Dropdown نتائج */}
                  {nameResults.length >= 1 && !currentPatient && (
                    <div className="absolute top-full mt-1 right-0 left-0 z-30 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                        <p className="text-[11px] font-semibold text-slate-500">{nameResults.length} نتيجة — اختر المريض</p>
                        <p className="text-[10px] text-slate-400">تحقق من رقم الهاتف</p>
                      </div>
                      <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                        {nameResults.map((p, idx) => {
                          const age = p.birth_date ? new Date().getFullYear() - new Date(p.birth_date).getFullYear() : null;
                          const isHighlighted = idx === highlightedIdx;
                          return (
                            <button key={p.id}
                              onClick={() => selectPatient(p)}
                              onMouseEnter={() => setHighlightedIdx(idx)}
                              className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-right group ${isHighlighted ? 'bg-teal-50' : 'hover:bg-teal-50/40'}`}>
                              <div className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm font-bold transition-colors shrink-0 ${isHighlighted ? 'bg-teal-100 border-teal-200 text-teal-700' : 'bg-slate-100 border-slate-200 text-slate-600 group-hover:bg-teal-100 group-hover:border-teal-200 group-hover:text-teal-700'}`}>
                                {p.name.charAt(0)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-900 truncate">{p.name}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-xs font-bold text-slate-600 font-mono bg-slate-100 px-2 py-0.5 rounded-md">{p.phone_number}</span>
                                  {age && <span className="text-[10px] text-slate-400">{age} سنة</span>}
                                </div>
                              </div>
                              {isHighlighted && (
                                <span className="text-[10px] font-bold text-teal-600 bg-teal-100 px-2 py-0.5 rounded-md shrink-0">Enter ↵</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* لا نتائج */}
                  {showNoResults && (
                    <p className="mt-1.5 text-[11px] text-slate-400 text-center">لم يُعثر على مريض بهذا الاسم</p>
                  )}
                </div>

                {/* زر تسجيل مريض جديد (رقم هاتف غير موجود) */}
                {canShowNewPatient && (
                  <button onClick={() => setShowNewPatientModal(true)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 border border-dashed border-slate-300 hover:border-slate-900 hover:bg-white rounded-xl transition-all group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                        <IconPlus className="w-4 h-4" />
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-900">تسجيل مريض جديد</p>
                        <p className="text-[11px] text-slate-400 font-mono">{searchQuery}</p>
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-slate-300 group-hover:text-slate-900 rotate-180 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}

                {/* بطاقة المريض المختار */}
                {currentPatient && (
                  <div className="rounded-xl border border-teal-200 bg-teal-50/40 overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3.5">
                      <div className="w-10 h-10 rounded-full bg-white border border-teal-200 flex items-center justify-center font-bold text-teal-700 text-base shadow-sm shrink-0">
                        {currentPatient.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{currentPatient.name}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {currentPatient.gender === 'female' ? 'أنثى' : 'ذكر'} ·{' '}
                          {new Date().getFullYear() - new Date(currentPatient.birth_date).getFullYear()} سنة
                          {patientHistory.length > 0 && <span className="text-teal-600 font-semibold"> · {patientHistory.length} زيارة</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => {
                          sessionStorage.setItem('vitalix_current_patient', JSON.stringify({ patient: currentPatient, history: patientHistory, searchQuery }));
                          router.push(`/dashboard/patients/${currentPatient.id}`);
                        }} className="text-[10px] font-bold text-slate-600 bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 transition shadow-sm">
                          السجل
                        </button>
                        <div className="w-7 h-7 rounded-lg bg-teal-500 text-white flex items-center justify-center shadow-sm">
                          <IconCheck className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </div>

                    {/* التشخيصات */}
                    <div className="px-4 pb-3.5 flex items-center gap-2 flex-wrap">
                      {[
                        { key: 'hypertension', label: 'ضغط', icon: <IconHeart className="w-3 h-3" /> },
                        { key: 'diabetes', label: 'سكري', icon: <IconDroplet className="w-3 h-3" /> },
                      ].map(({ key, label, icon }) => {
                        const active = currentPatient.diagnosed_conditions?.includes(key);
                        return (
                          <button key={key}
                            onClick={async () => {
                              const cur = currentPatient.diagnosed_conditions || [];
                              const updated = cur.includes(key) ? cur.filter(c => c !== key) : [...cur, key];
                              setCurrentPatient({ ...currentPatient, diagnosed_conditions: updated });
                              await supabase.from('patients').update({ diagnosed_conditions: updated }).eq('id', currentPatient.id);
                            }}
                            className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all ${
                              active ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-400'
                            }`}>
                            {icon}
                            <span>{active ? '✓ ' : ''}{label}</span>
                          </button>
                        );
                      })}
                      <span className="text-[10px] text-slate-400 mr-auto">اضغط لتعديل التشخيص</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* آخر الزيارات */}
            {currentPatient && patientHistory.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-900">آخر الزيارات</p>
                  {patientHistory.length > 2 && (
                    <button onClick={() => setIsHistoryModalOpen(true)}
                      className="text-[11px] font-bold text-teal-600 hover:text-teal-700 hover:underline">
                      عرض الكل ({patientHistory.length}) ←
                    </button>
                  )}
                </div>
                <div className="divide-y divide-slate-100">
                  {patientHistory.slice(0, 2).map((h, idx) => (
                    <div key={h.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] text-slate-400 font-mono">{formatDate(h.created_at)}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {h.bp_systolic && (
                            <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                              {h.bp_systolic}/{h.bp_diastolic}
                            </span>
                          )}
                          {h.heart_rate && (
                            <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">
                              ♥ {h.heart_rate}
                            </span>
                          )}
                          {h.sugar_value && (
                            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                              {h.sugar_value} mg/dL
                            </span>
                          )}
                          {h.weight && (
                            <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md">
                              {h.weight} kg
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-400">#{patientHistory.length - idx}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* ══ العمود الأيسر: الفحوصات ══ */}
          <div className="space-y-4">

            {/* حالة: لم يُختر مريض بعد */}
            {!currentPatient && !latestVisitId && (
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm py-20 flex flex-col items-center justify-center text-center px-6">
                <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-4">
                  <IconHeart className="w-7 h-7 text-slate-300" />
                </div>
                <p className="text-sm font-semibold text-slate-500">ابحث عن المريض أولاً</p>
                <p className="text-xs text-slate-400 mt-1.5">اختر مريضاً من قائمة البحث لبدء تسجيل الفحوصات</p>
              </div>
            )}

            {/* حالة: مريض مختار → نموذج الفحوصات */}
            {currentPatient && !latestVisitId && (
              <div className="space-y-4 saas-slide-up">

                {/* اختيار الفحوصات */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
                  <p className="text-sm font-bold text-slate-900 mb-4">اختر الفحوصات المجراة</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { key: 'bp', label: 'ضغط الدم', icon: <IconHeart className="w-5 h-5" />, activeClass: 'bg-blue-600 border-blue-600 text-white' },
                      { key: 'sugar', label: 'سكري الدم', icon: <IconDroplet className="w-5 h-5" />, activeClass: 'bg-emerald-600 border-emerald-600 text-white' },
                      { key: 'weight', label: 'الوزن', icon: <IconScale className="w-5 h-5" />, activeClass: 'bg-purple-600 border-purple-600 text-white' },
                    ].map(({ key, label, icon, activeClass }) => {
                      const active = activeTests[key as keyof typeof activeTests];
                      return (
                        <button key={key} onClick={() => {
                            const nowActive = !active;
                            setActiveTests({ ...activeTests, [key]: nowActive });
                            // عند إغلاق الفحص: تصفير قراءاته ومسح الأخطاء
                            if (!nowActive) {
                              if (key === 'bp') { setBpSys1(''); setBpDia1(''); setBpSys2(''); setBpDia2(''); }
                              if (key === 'sugar') { setSugarValue(''); setSugarType(''); }
                              if (key === 'weight') { setWeightValue(''); }
                              setErrorMsg('');
                              setSoftWarningMsg('');
                              setSoftWarningConfirmed(false);
                            }
                          }}
                          className={`flex flex-col items-center gap-2 py-4 rounded-xl border-2 text-xs font-bold transition-all ${active ? activeClass : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-white'}`}>
                          {icon}
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ضغط الدم */}
                {activeTests.bp && (
                  <div className="bg-white border border-blue-200 rounded-2xl shadow-sm overflow-hidden saas-slide-up">
                    <div className="bg-blue-50/60 px-5 py-3.5 border-b border-blue-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <IconHeart className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-bold text-slate-900">ضغط الدم</span>
                        <span className="text-[10px] text-slate-400">(mmHg)</span>
                      </div>
                      <button onClick={() => setIsDualBp(!isDualBp)}
                        className={`flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all ${isDualBp ? 'bg-white text-blue-700 border-blue-200 shadow-sm' : 'bg-transparent text-slate-500 border-slate-200 hover:bg-white'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isDualBp ? 'bg-blue-500' : 'bg-slate-300'}`} />
                        قياس مزدوج
                      </button>
                    </div>
                    <div className="p-5">
                      <div className={`grid ${isDualBp ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
                        {/* القراءة الأولى */}
                        <div className="space-y-3">
                          {isDualBp && <p className="text-[10px] font-bold text-slate-400 text-center uppercase tracking-wider">القراءة الأولى</p>}
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { label: 'SYS', val: bpSys1, set: setBpSys1, ph: '120' },
                              { label: 'DIA', val: bpDia1, set: setBpDia1, ph: '80' },
                            ].map(({ label, val, set, ph }) => (
                              <div key={label}>
                                <p className="text-[10px] font-bold text-slate-400 text-center mb-1.5">{label}</p>
                                <input type="number" placeholder={ph} value={val} min="0" onKeyDown={e => ["-","e","E","+"].includes(e.key) && e.preventDefault()} onChange={e => { set(e.target.value); resetSoftWarning(); }} onWheel={e => e.currentTarget.blur()}
                                  className="w-full px-2 py-3 text-2xl font-black text-center bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 transition num-input placeholder:text-slate-200" />
                              </div>
                            ))}
                          </div>
                        </div>
                        {/* القراءة الثانية */}
                        {isDualBp && (
                          <div className="space-y-3">
                            <p className="text-[10px] font-bold text-slate-400 text-center uppercase tracking-wider">القراءة الثانية</p>
                            <div className="grid grid-cols-2 gap-2">
                              {[
                                { label: 'SYS', val: bpSys2, set: setBpSys2, ph: '120' },
                                { label: 'DIA', val: bpDia2, set: setBpDia2, ph: '80' },
                              ].map(({ label, val, set, ph }) => (
                                <div key={label}>
                                  <p className="text-[10px] font-bold text-slate-400 text-center mb-1.5">{label}</p>
                                  <input type="number" placeholder={ph} value={val} min="0" onKeyDown={e => ["-","e","E","+"].includes(e.key) && e.preventDefault()} onChange={e => set(e.target.value)} onWheel={e => e.currentTarget.blur()}
                                    className="w-full px-2 py-3 text-2xl font-black text-center bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 transition num-input placeholder:text-slate-200" />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* متوسط */}
                      {isDualBp && bpSys1 && bpSys2 && (
                        <div className="mt-4 flex items-center justify-between bg-blue-600 text-white px-4 py-2.5 rounded-xl">
                          <span className="text-xs font-bold opacity-80">المتوسط المعتمد</span>
                          <span className="text-xl font-black tabular-nums">{finalSys} <span className="text-blue-300">/</span> {finalDia}</span>
                        </div>
                      )}

                      {/* نبضات القلب */}
                      <div className="mt-4 pt-4 border-t border-slate-100">
                        <div className="flex items-center justify-between mb-3">
                          <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 text-rose-500" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z"/>
                            </svg>
                            معدل النبض
                          </label>
                          <span className="text-[10px] text-slate-400">نبضة / دقيقة · الطبيعي 60–100</span>
                        </div>

                        {isDualBp ? (
                          <div className="grid grid-cols-2 gap-3">
                            {[
                              { label: 'القراءة الأولى', val: heartRate, set: setHeartRate },
                              { label: 'القراءة الثانية', val: heartRate2, set: setHeartRate2 },
                            ].map(({ label, val, set }) => (
                              <div key={label}>
                                <p className="text-[10px] font-bold text-slate-400 text-center mb-1.5">{label}</p>
                                <input
                                  type="number" placeholder="72" value={val} min="0"
                                  onKeyDown={e => ["-","e","E","+"].includes(e.key) && e.preventDefault()}
                                  onChange={e => set(e.target.value)}
                                  onWheel={e => e.currentTarget.blur()}
                                  className="w-full px-2 py-2.5 text-xl font-black text-center bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-rose-400 transition num-input placeholder:text-slate-200"
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <input
                            type="number" placeholder="مثال: 72" value={heartRate} min="0"
                            onKeyDown={e => ["-","e","E","+"].includes(e.key) && e.preventDefault()}
                            onChange={e => setHeartRate(e.target.value)}
                            onWheel={e => e.currentTarget.blur()}
                            className="w-36 px-3 py-2.5 text-lg font-black text-center bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-rose-400 transition num-input placeholder:text-slate-200"
                          />
                        )}

                        {/* متوسط النبض — يظهر فقط للقياس المزدوج */}
                        {isDualBp && heartRate && heartRate2 && finalHeartRate !== null && (
                          <div className="flex items-center justify-between bg-rose-600 text-white px-4 py-2 rounded-xl mt-3">
                            <span className="text-xs font-bold opacity-80">متوسط النبض المعتمد</span>
                            <span className="text-lg font-black tabular-nums">{finalHeartRate} <span className="text-rose-300 text-xs font-normal">نبضة/دقيقة</span></span>
                          </div>
                        )}
                      </div>

                      {/* تنبيه عند إلغاء القياس المزدوج */}
                      {!isDualBp && (
                        <div className="mt-4 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                          <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                          </svg>
                          <p className="text-[11px] text-amber-900 leading-relaxed">
                            <span className="font-bold">تنبيه:</span> إلغاء القياس المزدوج قد يؤثر على دقة التقييم. وفقاً للإرشادات الطبية، يُفضل دائماً أخذ قراءتين يفصل بينهما دقيقة للحصول على نتيجة أكثر موثوقية.
                          </p>
                        </div>
                      )}

                      {/* دليل إرشاد القياس المزدوج */}
                      {isDualBp && (
                        <div className="mt-4 bg-blue-50/60 border border-blue-100 rounded-xl px-4 py-3.5 space-y-2.5">
                          <p className="text-[11px] font-bold text-blue-800 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                            </svg>
                            خطوات القياس المزدوج الدقيق
                          </p>
                          <div className="space-y-1.5">
                            {[
                              { n: '١', text: 'سجّل القراءة الأولى للمراجع.' },
                              { n: '٢', text: 'اطلب منه الانتظار بهدوء لمدة دقيقة واحدة.' },
                              { n: '٣', text: 'خذ القراءة الثانية وسجّلها.' },
                            ].map(({ n, text }) => (
                              <div key={n} className="flex items-start gap-2">
                                <span className="w-4 h-4 rounded-full bg-blue-200 text-blue-800 text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">{n}</span>
                                <p className="text-[11px] text-blue-800">{text}</p>
                              </div>
                            ))}
                          </div>
                          <p className="text-[10px] text-blue-600 border-t border-blue-100 pt-2">
                            سيحسب النظام تلقائياً متوسط القراءتين لضمان دقة السجل.
                          </p>
                        </div>
                      )}

                      {/* الأعراض */}
                      <div className="mt-4 pt-4 border-t border-slate-100">
                        <p className="text-[11px] font-bold text-slate-500 mb-2">أعراض مصاحبة <span className="font-normal">(اختياري)</span></p>
                        <div className="flex flex-wrap gap-1.5">
                          {bpSymptomsList.map(s => {
                            const sel = selectedSymptoms.includes(s);
                            return (
                              <button key={s} onClick={() => setSelectedSymptoms(prev => sel ? prev.filter(x => x !== s) : [...prev, s])}
                                className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition ${sel ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-white'}`}>
                                {sel ? '✓ ' : ''}{s}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* العوامل المؤثرة على ضغط الدم */}
                      <div className="mt-4 pt-4 border-t border-slate-100">
                        <p className="text-[11px] font-bold text-slate-500 mb-2">عوامل مؤثرة على القراءة <span className="font-normal">(اختياري)</span></p>
                        <div className="flex flex-wrap gap-1.5">
                          {bpFactorsList.map(f => {
                            const sel = bpFactors.includes(f.key);
                            return (
                              <button key={f.key} onClick={() => setBpFactors(prev => sel ? prev.filter(x => x !== f.key) : [...prev, f.key])}
                                className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition ${sel ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-white'}`}>
                                {sel ? '✓ ' : ''}{f.label}
                              </button>
                            );
                          })}
                        </div>
                        {bpFactors.length > 0 && (
                          <p className="text-[10px] text-slate-400 mt-2">
                            سيذكر التقرير الذكي هذه العوامل عند تحليل القراءة
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* سكري الدم */}
                {activeTests.sugar && (
                  <div className="bg-white border border-emerald-200 rounded-2xl shadow-sm overflow-hidden saas-slide-up">
                    <div className="bg-emerald-50/60 px-5 py-3.5 border-b border-emerald-100 flex items-center gap-2">
                      <IconDroplet className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm font-bold text-slate-900">سكري الدم</span>
                      <span className="text-[10px] text-slate-400">(mg/dL)</span>
                    </div>
                    <div className="p-5 space-y-4">
                      {/* نوع القياس */}
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { v: 'fasting', l: 'صائم', d: '+8 ساعات' },
                          { v: 'postprandial', l: 'بعد الأكل', d: 'ساعتان' },
                          { v: 'random', l: 'عشوائي', d: 'أي وقت' },
                        ].map(({ v, l, d }) => {
                          const sel = sugarType === v;
                          return (
                            <button key={v} onClick={() => setSugarType(v)}
                              className={`flex flex-col gap-0.5 p-2.5 rounded-xl border-2 text-right transition ${sel ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-emerald-300 hover:bg-white'}`}>
                              <span className="text-xs font-bold">{l}</span>
                              <span className={`text-[9px] font-medium ${sel ? 'text-emerald-100' : 'text-slate-400'}`}>{d}</span>
                            </button>
                          );
                        })}
                      </div>
                      {/* القراءة */}
                      <input type="number" placeholder="0" value={sugarValue} disabled={!sugarType}
                        min="0" onKeyDown={e => ["-","e","E","+"].includes(e.key) && e.preventDefault()} onChange={e => { setSugarValue(e.target.value); resetSoftWarning(); }} onWheel={e => e.currentTarget.blur()}
                        className="w-full px-4 py-4 text-4xl font-black text-center bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 transition num-input placeholder:text-slate-200 disabled:opacity-40" />
                      {/* الأعراض */}
                      <div className="pt-3 border-t border-slate-100">
                        <p className="text-[11px] font-bold text-slate-500 mb-2">أعراض مصاحبة <span className="font-normal">(اختياري)</span></p>
                        <div className="flex flex-wrap gap-1.5">
                          {sugarSymptomsList.map(s => {
                            const sel = selectedSymptoms.includes(s);
                            return (
                              <button key={s} onClick={() => setSelectedSymptoms(prev => sel ? prev.filter(x => x !== s) : [...prev, s])}
                                className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition ${sel ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-white'}`}>
                                {sel ? '✓ ' : ''}{s}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* العوامل المؤثرة على السكري */}
                      <div className="pt-3 border-t border-slate-100">
                        <p className="text-[11px] font-bold text-slate-500 mb-2">عوامل مؤثرة على القراءة <span className="font-normal">(اختياري)</span></p>
                        <div className="flex flex-wrap gap-1.5">
                          {sugarFactorsList.map(f => {
                            const sel = sugarFactors.includes(f.key);
                            return (
                              <button key={f.key} onClick={() => setSugarFactors(prev => sel ? prev.filter(x => x !== f.key) : [...prev, f.key])}
                                className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition ${sel ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-white'}`}>
                                {sel ? '✓ ' : ''}{f.label}
                              </button>
                            );
                          })}
                        </div>
                        {sugarFactors.length > 0 && (
                          <p className="text-[10px] text-slate-400 mt-2">
                            سيذكر التقرير الذكي هذه العوامل عند تحليل القراءة
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* الوزن */}
                {activeTests.weight && (
                  <div className="bg-white border border-purple-200 rounded-2xl shadow-sm overflow-hidden saas-slide-up">
                    <div className="bg-purple-50/60 px-5 py-3.5 border-b border-purple-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <IconScale className="w-4 h-4 text-purple-600" />
                        <span className="text-sm font-bold text-slate-900">الوزن</span>
                        <span className="text-[10px] text-slate-400">(kg)</span>
                      </div>
                    </div>
                    <div className="p-5">
                      <input type="number" placeholder="0" value={weightValue}
                        min="0" onKeyDown={e => ["-","e","E","+"].includes(e.key) && e.preventDefault()} onChange={e => { setWeightValue(e.target.value); resetSoftWarning(); }} onWheel={e => e.currentTarget.blur()}
                        className="w-full px-4 py-4 text-4xl font-black text-center bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 transition num-input placeholder:text-slate-200" />
                    </div>
                  </div>
                )}

                {/* لا فحص مختار */}
                {!activeTests.bp && !activeTests.sugar && !activeTests.weight && (
                  <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl py-10 text-center">
                    <p className="text-sm text-slate-400 font-medium">اختر نوع الفحص من الأعلى</p>
                  </div>
                )}

                {/* مؤشر الحالة — يظهر فقط بعد توليد التقرير */}

                {/* Hard Error */}
                {errorMsg && (
                  <div className="bg-rose-50 border border-rose-200 px-4 py-3.5 rounded-xl flex items-start gap-3">
                    <svg className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                    <div>
                      <p className="text-xs font-bold text-rose-700">{errorMsg}</p>
                      <p className="text-[10px] text-rose-500 mt-0.5">لم يتم الحفظ — يرجى تصحيح القراءة أولاً</p>
                    </div>
                  </div>
                )}

                {/* Soft Warning — يطلب تأكيداً من الصيدلي */}
                {softWarningMsg && !softWarningConfirmed && (
                  <div className="bg-amber-50 border-2 border-amber-300 px-4 py-4 rounded-xl space-y-3">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                      <div>
                        <p className="text-xs font-bold text-amber-800">{softWarningMsg}</p>
                        <p className="text-[10px] text-amber-600 mt-1">إذا كانت القراءة صحيحة، اضغط تأكيد الحفظ للمتابعة.</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setSoftWarningConfirmed(true); setSoftWarningMsg(''); handleSave(); }}
                        className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition">
                        تأكيد الحفظ رغم القراءة الحرجة
                      </button>
                      <button
                        onClick={() => { setSoftWarningMsg(''); setSoftWarningConfirmed(false); }}
                        className="px-4 py-2.5 bg-white border border-amber-300 text-amber-700 rounded-xl text-xs font-bold transition hover:bg-amber-50">
                        مراجعة القراءة
                      </button>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleSave}
                  disabled={submitting || !hasAnyReading || !!softWarningMsg}
                  className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-sm font-black transition shadow-sm active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2">
                  {submitting ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>جاري التحليل والحفظ...</span></>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                      <span>توليد التقرير الذكي وحفظ الزيارة</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* ══ التقرير بعد الحفظ ══ */}
            {latestVisitId && latestGeneratedReport && (
              <div ref={reportRef} className="space-y-4 saas-slide-up scroll-mt-24">
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M6 8L14.5 25C14.8 25.6 15.6 25.6 15.9 25L20 17" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
                          <path d="M24 6C24 9.3 26.7 12 30 12C26.7 12 24 14.7 24 18C24 14.7 21.3 12 18 12C21.3 12 24 9.3 24 6Z" fill="#2563EB" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">التقرير الطبي الذكي</h3>
                        <p className="text-[10px] text-slate-400 mt-0.5">Vitalix AI · {currentPatient?.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${status.border} ${status.bg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${status.dot}`} />
                        <span className={`text-[10px] font-bold ${status.color}`}>{status.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-[10px] font-bold text-emerald-600">تم الحفظ</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-5">
                    <p className="text-sm text-slate-700 leading-relaxed font-medium bg-slate-50 border border-slate-100 rounded-xl p-4">
                      {latestGeneratedReport}
                    </p>
                  </div>
                  <div className="px-5 pb-5 grid grid-cols-2 gap-3">
                    <button onClick={handlePrintPDF}
                      className="flex items-center justify-center gap-2 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition hover:bg-slate-50 shadow-sm">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
                      </svg>
                      طباعة PDF
                    </button>
                    <button onClick={sendWhatsApp}
                      className="flex items-center justify-center gap-2 py-3 bg-[#25D366] hover:bg-[#20BD5A] text-white rounded-xl text-xs font-bold transition shadow-sm">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                      </svg>
                      إرسال WhatsApp
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* ════ Modal: مريض جديد ════ */}
      {showNewPatientModal && (
        <NewPatientModal
          phone={searchQuery}
          onClose={() => setShowNewPatientModal(false)}
          onCreated={handleNewPatientCreated}
        />
      )}

      {/* ════ Modal: سجل الزيارات ════ */}
      {isHistoryModalOpen && currentPatient && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setIsHistoryModalOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900">سجل الزيارات الكامل</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">{currentPatient.name} — {patientHistory.length} زيارة</p>
              </div>
              <button onClick={() => setIsHistoryModalOpen(false)} className="w-8 h-8 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-full flex items-center justify-center transition">✕</button>
            </div>
            <div className="overflow-y-auto p-5 space-y-3 bg-slate-50/50 flex-1">
              {patientHistory.map((v, idx) => (
                <div key={v.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">{formatDate(v.created_at)} — {formatTime(v.created_at)}</span>
                    <span className="text-slate-400 text-xs font-bold">#{patientHistory.length - idx}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {v.bp_systolic && <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg">ض: {v.bp_systolic}/{v.bp_diastolic}</span>}
                    {v.sugar_value && <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">س: {v.sugar_value}</span>}
                    {v.weight && <span className="text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-lg">{v.weight} kg</span>}
                  </div>
                  {v.ai_report_output && (
                    <p className="text-[11px] text-slate-600 leading-relaxed bg-slate-50 border border-slate-100 p-3 rounded-lg">{v.ai_report_output}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <footer className="max-w-5xl mx-auto px-6 py-8 text-center border-t border-slate-200/60 mt-4 flex flex-col items-center gap-1.5">
        <div className="text-[11px] text-slate-500 font-medium select-none" style={{ direction: 'ltr', unicodeBidi: 'bidi-override' }}>
          Made <span className="text-rose-500">♥</span> in <span className="font-bold tracking-wider text-slate-700">ΛMMΛN</span>
        </div>
        <p className="text-[11px] text-slate-400 font-medium">
          Vitalix<span className="text-slate-900">.ai</span> — v1.0.0 · © {new Date().getFullYear()} جميع الحقوق محفوظة
        </p>
      </footer>
    </div>
  );
}
