'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { upsertPipeline } from '@/lib/pipeline';
import { useRouter } from 'next/navigation';
import DashboardHeader, { usePharmacyInfo } from '../components/DashboardHeader';
import AppFooter from '../../components/AppFooter';
import { getPharmacyId, getStaffId, getStaffName } from '@/lib/tenant';
import { normalizeAr } from '@/lib/arabic';
import { calcWeightGoals, getBMICategory } from '@/lib/weight-math';
import { detectTextDir } from '@/lib/text-direction';
import { normalizePhone, displayPhone, validatePhone } from '@/lib/phone';
import { SUPPLEMENT_CATEGORIES } from '@/lib/supplement-categories';
import WeightHistoryChart from '@/components/WeightHistoryChart';
import BpHistoryChart from '@/components/BpHistoryChart';
import SugarHistoryChart from '@/components/SugarHistoryChart';
import WeightThinkingOverlay from '@/components/WeightThinkingOverlay';
import VitalsThinkingOverlay from '@/components/VitalsThinkingOverlay';

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(SUPPLEMENT_CATEGORIES.map(c => [c.code, c.labelAr]));

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
  bp_sys1: number | null;
  bp_dia1: number | null;
  hr1: number | null;
  bp_sys2: number | null;
  bp_dia2: number | null;
  hr2: number | null;
  ai_report_output: string | null;
  heart_rate: number | null;
  performed_by: string | null;
  created_at: string;
}

type PharmacistSummary = {
  clinical_reasoning: string;
  medications_alert:  string;
  pharmacy_products:  { category_code: string; reason: string; instruction: string; product: { product_name: string; price: number; image_url: string | null } | null }[];
  lab_alerts:         string[];
};

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════
function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ar-EG', { numberingSystem: 'latn' });
}
function translateUnit(u: string | null): string {
  if (!u) return '';
  const map: Record<string, string> = {
    pill: 'حبة', tablet: 'حبة', capsule: 'كبسولة',
    ml: 'مل', mg: 'مغ', drop: 'قطرة', sachet: 'كيس',
    patch: 'لصقة', injection: 'حقنة', puff: 'بخة',
  };
  return map[u.toLowerCase()] ?? u;
}
function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true, numberingSystem: 'latn' });
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
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const toggleCondition = (key: string) => {
    setConditions(prev => prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]);
  };

  const save = async () => {
    if (!name.trim()) { setErr('يرجى إدخال اسم المريض'); return; }
    const phoneCheck = validatePhone(phone);
    if (!phoneCheck.valid) { setErr(phoneCheck.message || 'رقم الهاتف غير صحيح'); return; }
    setSaving(true); setErr('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('انتهت الجلسة');
      const pid = await getPharmacyId();
      if (!pid) return;
      const { data, error } = await supabase.from('patients').insert({
        pharmacy_id: pid,
        name: name.trim(),
        phone_number: normalizePhone(phone),
        gender,
        birth_date: dob,
        diagnosed_conditions: conditions,
      }).select().single();
      if (error || !data) throw new Error('تعذر الحفظ');
      if (note.trim()) {
        await upsertPipeline(pid, data.id, 'due', {});
        await supabase.from('refill_tracking_pipeline').update({ insurance_status: note.trim() })
          .eq('pharmacy_id', pid).eq('patient_id', data.id).eq('payment_type', 'cash');
      }
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

          {/* ملاحظة */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">ملاحظة <span className="font-normal text-slate-400">(اختياري)</span></label>
            <textarea value={note} onChange={e => setNote(e.target.value)}
              placeholder="مثال: خصم ثابت 10%"
              rows={2}
              className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900 transition text-slate-900 resize-none" />
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
// ══════════════════════════════════════════════════════════════════════
// HeightEditor — عرض وتعديل طول المريض داخل sidebar الفحوصات
// يظهر فقط عند تفعيل قياس الوزن
// ══════════════════════════════════════════════════════════════════════
function HeightEditor({
  patient,
  onUpdate,
}: {
  patient: { id: string; height?: number | null };
  onUpdate: (height: number) => void;
}) {
  const [editing, setEditing]   = useState(false);
  const [value, setValue]       = useState(patient.height ? String(patient.height) : '');
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) setTimeout(() => inputRef.current?.focus(), 50);
  }, [editing]);

  const handleSave = async () => {
    const h = Number(value);
    if (!h || h < 100 || h > 250) return;
    setSaving(true);
    const { error } = await supabase.from('patients').update({ height: h }).eq('id', patient.id);
    setSaving(false);
    if (!error) {
      onUpdate(h);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  const hasHeight = !!patient.height;

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {/* أيقونة الطول */}
          <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${hasHeight ? 'bg-teal-100' : 'bg-amber-100'}`}>
            <svg className={`w-3.5 h-3.5 ${hasHeight ? 'text-teal-600' : 'text-amber-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h4m0 0V3m0 4v4M3 17h4m0 0v4m0-4v-4M17 7h4m-4 0V3m0 4v4m4 6h-4m0 0v4m0-4v-4" />
            </svg>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500">الطول</p>
            {hasHeight ? (
              <p className="text-sm font-black text-slate-900">
                {patient.height} <span className="text-[10px] font-normal text-slate-400">سم</span>
                {saved && <span className="text-[10px] text-teal-600 font-bold mr-1">✓ تم الحفظ</span>}
              </p>
            ) : (
              <p className="text-[10px] font-bold text-amber-600">لم يُدخَل — مطلوب لحساب BMI</p>
            )}
          </div>
        </div>
        <button
          onClick={() => { setValue(patient.height ? String(patient.height) : ''); setEditing(true); }}
          className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition shrink-0 ${
            hasHeight
              ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              : 'bg-amber-500 border-amber-500 text-white hover:bg-amber-600'
          }`}>
          {hasHeight ? 'تعديل' : '+ إدخال الطول'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold text-slate-500">
        {hasHeight ? 'تعديل الطول' : 'إدخال الطول'} (سم)
      </p>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="number"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
          placeholder="مثال: 175"
          min="100" max="250"
          className="flex-1 px-3 py-2 text-sm font-bold text-center bg-white border-2 border-purple-400 rounded-xl focus:outline-none focus:border-purple-600 transition"
        />
        <button
          onClick={handleSave}
          disabled={saving || !value || Number(value) < 100}
          className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition disabled:opacity-50 shrink-0">
          {saving ? '...' : 'حفظ'}
        </button>
        <button
          onClick={() => setEditing(false)}
          className="px-3 py-2 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 transition shrink-0">
          إلغاء
        </button>
      </div>
      <p className="text-[9px] text-slate-400">بين 100 و250 سم · يُحفظ في ملف المريض تلقائياً</p>
    </div>
  );
}

export default function VitalsPage() {
  const router = useRouter();
  const { pharmacyName, pharmacyNameEn } = usePharmacyInfo();
  const searchRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const thinkingRef = useRef<HTMLDivElement>(null);

  // ── حالة البحث ──
  const [searchQuery, setSearchQuery] = useState('');
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
  const [latestPharmacistSummary, setLatestPharmacistSummary] = useState<string | null>(null);
  const [latestMedicationsAlert, setLatestMedicationsAlert] = useState<string | null>(null);
  const [isFallbackReport, setIsFallbackReport] = useState(false);
  const [latestVisitId, setLatestVisitId] = useState<string | null>(null);
  const [patientMedications, setPatientMedications] = useState<{ id: string; medication_name: string; daily_dosage: number | null; dosage_unit: string | null }[]>([]);
  const [reportExpanded, setReportExpanded] = useState(false);
  const [reportLanguage, setReportLanguage] = useState<'ar' | 'en'>('ar');
  // اسم الصيدلية للمخرجات الإنجليزية — الاسم الإنجليزي إن وُجد وإلا العربي كما هو الآن
  const pharmacyNameForOutput = reportLanguage === 'en' ? (pharmacyNameEn || pharmacyName) : pharmacyName;

  // ── نظام إدارة الوزن ────────────────────────────────────────────────
  // bmiLive     : BMI فوري أثناء الإدخال — لا AI
  // weightPlanId: ID السجل في weight_plans
  // weightPlanUrl: رابط صفحة المريض /weight/[planId]
  // weightStatus: 'idle'|'saving'|'generating'|'sent'|'error'
  const [bmiLive, setBmiLive] = useState<{
    value: number;
    label: string; labelShort: string;
    color: string; bgColor: string; borderColor: string; dot: string; emoji: string;
    idealMin: number; idealMax: number; toLoose: number; firstGoal: number;
  } | null>(null);
  const [weightPlanId,  setWeightPlanId]  = useState<string | null>(null);
  const [weightSummary, setWeightSummary] = useState<PharmacistSummary | null>(null);
  const [excludedProducts, setExcludedProducts] = useState<Set<number>>(new Set());
  const [excludedLabs,     setExcludedLabs]     = useState<Set<number>>(new Set());
  const [weightPlanUrl, setWeightPlanUrl] = useState<string | null>(null);
  const [weightStatus,  setWeightStatus]  = useState<'idle'|'saving'|'generating'|'sent'|'error'>('idle');
  // تأكيد مراجعة الصيدلاني لمحتوى التقرير قبل تسليمه للمريض — يُصفَّر مع كل خطة جديدة
  const [weightReviewed, setWeightReviewed] = useState(false);
  const [weightApproving, setWeightApproving] = useState(false);
  const [weightApproveError, setWeightApproveError] = useState('');
  const [weightSaving,     setWeightSaving]     = useState(false);
  const [savedExclusions,  setSavedExclusions]  = useState<string>('');  // بصمة آخر استثناءات حُفظت
  const [weightSaveError,  setWeightSaveError]  = useState('');
  const [weightWaMsg, setWeightWaMsg] = useState<string>('');
  const [weightDataSuspect, setWeightDataSuspect] = useState(false);

  // ── العوامل المؤثرة ──
  const [bpFactors, setBpFactors] = useState<string[]>([]);
  const [sugarFactors, setSugarFactors] = useState<string[]>([]);
  const [tookBpMed, setTookBpMed] = useState(false);
  const [tookSugarMed, setTookSugarMed] = useState(false);

  const bpSymptomsList = ['صداع', 'دوخة', 'زغللة عين', 'طنين أذن', 'ألم بالصدر', 'ضيق تنفس'];
  const bpFactorsList = [
    { key: 'had_stimulants', label: 'شرب قهوة / شاي / مكيّف' },
    { key: 'recent_exertion', label: 'مجهود بدني مؤخراً' },
    { key: 'is_stressed', label: 'يشعر بتوتر أو قلق' },
  ];
  const sugarFactorsList = [
    { key: 'recent_heavy_meal', label: 'تناول وجبة دسمة مؤخراً' },
    { key: 'is_stressed', label: 'يشعر بتوتر أو قلق' },
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

  // ── حساب BMI الفوري أثناء الإدخال ──
  useEffect(() => {
    const w = Number(weightValue);
    const h = currentPatient?.height ? Number(currentPatient.height) : null;
    if (!activeTests.weight || !w || !h || w < 10 || h < 50) { setBmiLive(null); return; }
    const { bmi, idealMin, idealMax, toLoose, firstGoal } = calcWeightGoals(w, h);
    // تصنيف BMI — من المصدر الموحّد في weight-math.ts
    const cat = getBMICategory(bmi);
    setBmiLive({ value: Math.round(bmi * 10) / 10, ...cat, idealMin, idealMax, toLoose, firstGoal });
  }, [weightValue, currentPatient?.height, activeTests.weight]);

  // ── إغلاق dropdown خارجه ──
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setNameResults([]);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // رسالة واتساب خطة الوزن — قالب واحد يُستدعى بعد التوليد وبعد الاستعادة من كرت المريض
  const buildWeightWaMsg = (planUrl: string, patient: Patient) => {
    const cleanPhone = normalizePhone(patient.phone_number);
    const msg =
`مرحباً ${patient.name} 👋
من فريق ${pharmacyName}

تم تحليل وزنك وإعداد خطتك الصحية الشخصية.
افتح الرابط أدناه لتطّلع على نتائجك وقائمة الأغذية المناسبة لك:

${planUrl}

مع تحيات ${pharmacyName} 💜`;
    return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`;
  };

  // يبني رسالة واتساب تلقائياً فقط بعد اكتمال اسم الصيدلية والمريض ورابط الخطة معاً —
  // مهما كان ترتيب اكتمالها (استعادة أو توليد جديد)، فلا تُبنى رسالة باسم صيدلية فارغ لأي صيدلية.
  useEffect(() => {
    if (!weightPlanUrl || !currentPatient || !pharmacyName) return;
    setWeightWaMsg(buildWeightWaMsg(weightPlanUrl, currentPatient));
  }, [weightPlanUrl, currentPatient, pharmacyName]);

  // استعادة خطة وزن محفوظة بعد العودة من كرت المريض: نقرأ من القاعدة مباشرة
  // (شاشة مصادَقة تحت RLS، كما يفعل كرت المريض) لا من GET العام الذي يحجب
  // clinical_reasoning. الملخص يُبنى من _all_products (النسخة الأصلية) والاستثناءات
  // المحفوظة تُستعاد من الفرق بينها وبين pharmacy_products الحالية.
  // patient يُمرَّر كمعامل بدل الاعتماد على currentPatient: هذه الدالة تُستدعى مباشرة
  // بعد setCurrentPatient في نفس الـ useEffect، وتحديث الحالة غير متزامن فلن تكون
  // currentPatient قد تحدّثت بعد عند التنفيذ.
  const restoreWeightPlan = async (planId: string, patient: Patient, savedWeight?: string) => {
    const { data: wp, error } = await supabase
      .from('weight_plans')
      .select('id, weight_kg, nutrition_plan, approved_at')
      .eq('id', planId)
      .single();
    if (error || !wp) {
      console.error('[vitals] restoreWeightPlan failed:', error);
      return;
    }
    const np = (wp.nutrition_plan ?? null) as any;
    setActiveTests(prev => ({ ...prev, weight: true }));
    setWeightValue(savedWeight ?? String(wp.weight_kg));
    setWeightPlanId(wp.id);
    const planUrl = `${window.location.origin}/weight/${wp.id}`;
    setWeightPlanUrl(planUrl);
    if (!np) {
      setWeightStatus('error');
      return;
    }
    const allProducts = np._all_products ?? np.pharmacy_products ?? [];
    const allLabs     = np._all_labs     ?? np.lab_alerts        ?? [];
    setWeightSummary({
      clinical_reasoning: np.clinical_reasoning ?? '',
      medications_alert:  np.medications_alert  ?? '',
      pharmacy_products:  allProducts,
      lab_alerts:         allLabs,
    });
    // الاستثناءات المحفوظة = عناصر النسخة الأصلية الغائبة عن النسخة الحالية
    const curP = new Set((np.pharmacy_products ?? []).map((p: any) => p.category_code));
    const curL = new Set(np.lab_alerts ?? []);
    const exP = new Set<number>(allProducts.map((p: any, i: number) => curP.has(p.category_code) ? -1 : i).filter((i: number) => i >= 0));
    const exL = new Set<number>(allLabs.map((l: string, i: number) => curL.has(l) ? -1 : i).filter((i: number) => i >= 0));
    setExcludedProducts(exP); setExcludedLabs(exL);
    setSavedExclusions(JSON.stringify({ p: [...exP].sort(), l: [...exL].sort() }));
    setWeightDataSuspect(!!np.progress?.dataSuspect);
    setWeightStatus('sent');
    // weightWaMsg يُبنى تلقائياً في useEffect مستقل بعد اكتمال pharmacyName (يمنع رسالة باسم صيدلية فارغ)
  };

  // ── استعادة مريض من sessionStorage ──
  useEffect(() => {
    const saved = sessionStorage.getItem('vitalix_current_patient');
    if (saved) {
      try {
        const { patient, history, searchQuery: savedQuery, weightPlanId: savedWeightPlanId, weightValue: savedWeightValue, latestVisitId: savedVisitId } = JSON.parse(saved);
        setCurrentPatient(patient);
        setPatientHistory(history || []);
        if (savedVisitId) {
          setLatestVisitId(savedVisitId);
          const v = (history || []).find((h: VisitationRecord) => h.id === savedVisitId);
          if (v?.ai_report_output) setLatestGeneratedReport(v.ai_report_output);
        }
        // استعادة طريقة البحث الأصلية (رقم هاتف أو اسم)
        setSearchQuery(savedQuery || patient.name || '');
        if (savedWeightPlanId) restoreWeightPlan(savedWeightPlanId, patient, savedWeightValue);
        const { activeTests: savedActiveTests, bpSys1: sBpSys1, bpDia1: sBpDia1, bpSys2: sBpSys2, bpDia2: sBpDia2, heartRate: sHr1, heartRate2: sHr2, sugarValue: sSugar, sugarType: sSugarType, isDualBp: sIsDualBp, selectedSymptoms: sSymptoms, bpFactors: sBpFactors, sugarFactors: sSugarFactors, tookBpMed: sTookBpMed, tookSugarMed: sTookSugarMed } = JSON.parse(saved);
        if (savedActiveTests) setActiveTests(savedActiveTests);
        if (sBpSys1) setBpSys1(sBpSys1);
        if (sBpDia1) setBpDia1(sBpDia1);
        if (sBpSys2) setBpSys2(sBpSys2);
        if (sBpDia2) setBpDia2(sBpDia2);
        if (sHr1) setHeartRate(sHr1);
        if (sHr2) setHeartRate2(sHr2);
        if (sSugar) setSugarValue(sSugar);
        if (sSugarType) setSugarType(sSugarType);
        if (sIsDualBp !== undefined) setIsDualBp(sIsDualBp);
        if (sSymptoms) setSelectedSymptoms(sSymptoms);
        if (sBpFactors) setBpFactors(sBpFactors);
        if (sSugarFactors) setSugarFactors(sSugarFactors);
        if (sTookBpMed !== undefined) setTookBpMed(sTookBpMed);
        if (sTookSugarMed !== undefined) setTookSugarMed(sTookSugarMed);
        const { latestPharmacistSummary: sPharmacistSummary, latestMedicationsAlert: sMedicationsAlert } = JSON.parse(saved);
        if (sPharmacistSummary) setLatestPharmacistSummary(sPharmacistSummary);
        if (sMedicationsAlert) setLatestMedicationsAlert(sMedicationsAlert);
      } catch (e) { console.error("[vitals] restore failed:", e); }
    }
  }, []);

  // مزامنة الشاشة مع sessionStorage: يُكتب عند كل تغيّر، ويُحذف حين لا يكون هناك مريض.
  // يجب أن يبقى بعد useEffect الاستعادي أعلاه: على أول تحميل يحذف المخزون قبل أن تُملأ الحالة، فلا بد أن يكون الاستعادي قد قرأه أولاً.
  useEffect(() => {
    if (!currentPatient) { sessionStorage.removeItem('vitalix_current_patient'); return; }
    sessionStorage.setItem('vitalix_current_patient', JSON.stringify({ patient: currentPatient, history: patientHistory, searchQuery, weightPlanId, weightValue, latestVisitId, activeTests, bpSys1, bpDia1, bpSys2, bpDia2, heartRate, heartRate2, sugarValue, sugarType, isDualBp, selectedSymptoms, bpFactors, sugarFactors, tookBpMed, tookSugarMed, latestPharmacistSummary, latestMedicationsAlert }));
  }, [currentPatient, patientHistory, searchQuery, weightPlanId, weightValue, latestVisitId, activeTests, bpSys1, bpDia1, bpSys2, bpDia2, heartRate, heartRate2, sugarValue, sugarType, isDualBp, selectedSymptoms, bpFactors, sugarFactors, tookBpMed, tookSugarMed, latestPharmacistSummary, latestMedicationsAlert]);

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
    setLatestPharmacistSummary(null); setLatestMedicationsAlert(null);
    setWeightPlanId(null); setWeightSummary(null); setExcludedProducts(new Set()); setExcludedLabs(new Set()); setWeightPlanUrl(null); setWeightStatus('idle'); setBmiLive(null); setWeightDataSuspect(false); setWeightReviewed(false); setWeightWaMsg(''); setWeightApproveError(''); setWeightSaving(false); setSavedExclusions(''); setWeightSaveError('');
    setReportLanguage('ar');
    setPatientMedications([]);
    setSearchingPatient(true);
    try {
      await loadHistory(p);
      const pid = await getPharmacyId();
      if (pid) {
        const { data: meds } = await supabase.from('chronic_medications').select('id, medication_name, daily_dosage, dosage_unit').eq('pharmacy_id', pid).eq('patient_id', p.id).eq('status', 'active');
        setPatientMedications(meds || []);
      }
    } catch { }
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
        const pid = await getPharmacyId();
        if (!pid) return;
        // بعض الأرقام مخزّنة بالصيغة المحلية القديمة (07...) وبعضها بصيغة E.164 الجديدة (962...)
        // لذا نطابق على الجزء المشترك بعد حذف مفتاح الدولة من قيمة البحث المطبّعة
        const normalizedSearch = normalizePhone(value);
        const searchTerm = normalizedSearch.startsWith('962') ? normalizedSearch.slice(3) : normalizedSearch;
        const { data: found } = await supabase.from('patients').select('*')
          .eq('pharmacy_id', pid).ilike('phone_number', `%${searchTerm}%`);
        if (found && found.length === 1) {
          await selectPatient(found[0] as Patient, true); // keepQuery=true يحافظ على رقم الهاتف في الحقل
        } else if (found && found.length > 1) {
          // أكثر من مريض بنفس الرقم — اعرضهم ليختار الصيدلي
          setNameResults(found as Patient[]);
          setHighlightedIdx(-1);
        }
        // إذا لم يجد → سيظهر زر "مريض جديد" تلقائياً
      } catch { }
      finally { setSearchingPatient(false); }
      return;
    }

    if (value.trim().length < 1) { setHighlightedIdx(-1); setNameResults([]); return; }
    setHighlightedIdx(-1);
    setCurrentPatient(null);
    setSearchingPatient(true);
    try {
      const pid = await getPharmacyId();
      if (!pid) { setNameResults([]); return; }
      const { data, error } = await supabase
        .from('patients')
        .select('id, name, phone_number, gender, birth_date, height, diagnosed_conditions')
        .eq('pharmacy_id', pid)
        .ilike('name_normalized', `%${normalizeAr(value)}%`)
        .limit(20);
      if (error) { console.error('[vitals] patient name search failed:', error.message); setNameResults([]); return; }
      setNameResults((data || []) as Patient[]);
    } finally { setSearchingPatient(false); }
  };

  // ── إنشاء مريض جديد من Modal ──
  const handleNewPatientCreated = (p: Patient) => {
    setCurrentPatient(p);
    setSearchQuery(p.name);
    setShowNewPatientModal(false);
  };

  // ── حساب الحالة الكلية ──
  const getStatus = () => {
    let level: 'normal' | 'medium' | 'high' = 'normal';

    // حساب عمر المريض لتطبيق استثناء فوق 60 سنة
    const patientAge = currentPatient?.birth_date
      ? new Date().getFullYear() - new Date(currentPatient.birth_date).getFullYear()
      : null;
    const isOver60 = patientAge !== null && patientAge > 60;
    const hasHypertension = currentPatient?.diagnosed_conditions?.includes('hypertension') ?? false;
    // استثناء: 150/90 مقبول لفوق 60 سنة أو المشخّص بارتفاع الضغط
    const bpHighThresholdSys = (isOver60 || hasHypertension) ? 150 : 140;
    const bpHighThresholdDia = (isOver60 || hasHypertension) ? 90 : 90;

    if (activeTests.bp && bpSys1) {
      if (finalSys >= 180 || finalDia >= 120 || finalSys < 90 || finalDia < 60) level = 'high';
      else if (finalSys > bpHighThresholdSys || finalDia > bpHighThresholdDia) level = 'medium';
    }
    if (activeTests.sugar && sugarValue) {
      const s = Number(sugarValue);
      if (s >= 300 || s < 70) level = 'high';
      else if (s >= 180 && level !== 'high') level = 'medium';
    }
    // الوزن / BMI — أي خروج عن النطاق الطبيعي يرفع المستوى
    if (activeTests.weight && weightValue && currentPatient?.height) {
      const h = Number(currentPatient.height) / 100;
      const bmiVal = Number(weightValue) / (h * h);
      if (bmiVal >= 30 && level !== 'high')                        level = 'high';   // سمنة → يستدعي انتباهاً
      else if (bmiVal >= 25 && level === 'normal')                 level = 'medium'; // زيادة وزن → يحتاج متابعة
      else if (bmiVal < 18.5 && level === 'normal')                level = 'medium'; // نحافة → يحتاج متابعة
      else if (bmiVal < 16 && level !== 'high')                    level = 'high';   // نحافة شديدة → يستدعي انتباهاً
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
  const handleSave = async (forceConfirmed = false) => {
    if (latestVisitId) { setErrorMsg('تم حفظ هذه الزيارة مسبقاً.'); return; }
    if (!currentPatient) return;

    // ── Validation ──
    const validation = validateReadings();
    if (validation.type === 'hard') {
      setErrorMsg(validation.msg);
      return;
    }
    if (validation.type === 'soft' && !softWarningConfirmed && !forceConfirmed) {
      setSoftWarningMsg(validation.msg);
      return;
    }

    setSubmitting(true); setErrorMsg(''); setSoftWarningMsg(''); setIsFallbackReport(false);
    setTimeout(() => { thinkingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 120);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('انتهت الجلسة');
      const pid = await getPharmacyId();
      if (!pid) { setErrorMsg('تعذّر تحديد الصيدلية — أعد تحميل الصفحة'); return; }
      const staffName = await getStaffName();

      const visitPayload = {
        bp_systolic: activeTests.bp ? finalSys : null,
        bp_diastolic: activeTests.bp ? finalDia : null,
        heart_rate: activeTests.bp && finalHeartRate ? finalHeartRate : null,
        is_dual_bp: activeTests.bp ? isDualBp : false,
        bp_sys1: activeTests.bp ? (Number(bpSys1) || null) : null,
        bp_dia1: activeTests.bp ? (Number(bpDia1) || null) : null,
        hr1: activeTests.bp ? (Number(heartRate) || null) : null,
        bp_sys2: activeTests.bp && isDualBp ? (Number(bpSys2) || null) : null,
        bp_dia2: activeTests.bp && isDualBp ? (Number(bpDia2) || null) : null,
        hr2: activeTests.bp && isDualBp ? (Number(heartRate2) || null) : null,
        sugar_value: activeTests.sugar ? Number(sugarValue) : null,
        sugar_test_type: activeTests.sugar ? sugarType : null,
        weight: activeTests.weight ? Number(weightValue) : null,
        symptoms: selectedSymptoms.length > 0 ? selectedSymptoms : null,
        performed_by: staffName,
        had_stimulants: bpFactors.includes('had_stimulants') || sugarFactors.includes('had_stimulants'),
        recent_exertion: bpFactors.includes('recent_exertion'),
        recent_heavy_meal: sugarFactors.includes('recent_heavy_meal'),
        is_stressed: bpFactors.includes('is_stressed') || sugarFactors.includes('is_stressed'),
        took_medication: tookBpMed || tookSugarMed,
        took_bp_medication: tookBpMed,
        took_sugar_medication: tookSugarMed,
      };

      // payload للـ AI فقط — يشمل الحقول الإضافية بدون إرسالها لـ DB
      const aiPayload = { ...visitPayload, took_bp_medication: tookBpMed, took_sugar_medication: tookSugarMed };
      // payload لـ DB فقط — بدون الحقول غير الموجودة في الجدول حتى يتم تنفيذ الـ migration
      const { took_bp_medication: _tbp, took_sugar_medication: _tsg, ...dbPayload } = visitPayload;

      let report = '';
      let pharmacistSummaryLocal: string | null = null;
      let medicationsAlertLocal: string | null = null;

      // الوزن وحده: لا نستدعي generate-ai-report — تقرير إدارة الوزن المنفصل يتولى ذلك
      const isWeightOnly = activeTests.weight && !activeTests.bp && !activeTests.sugar;

      if (!isWeightOnly) {
        try {
          const res = await fetch('/api/generate-ai-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patient: currentPatient, currentVisit: aiPayload, history: patientHistory, pharmacyName: pharmacyNameForOutput, language: reportLanguage }),
          });
          if (res.ok) {
            const d = await res.json();
            if (d.report) report = d.report;
            pharmacistSummaryLocal = d.pharmacistSummary || null;
            medicationsAlertLocal = d.medicationsAlert || null;
            setLatestPharmacistSummary(pharmacistSummaryLocal);
            setLatestMedicationsAlert(medicationsAlertLocal);
          }
        } catch (e) { console.error('[vitals] AI report request failed:', e); }

        if (!report) {
          setIsFallbackReport(true);
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
      }
      // الوزن وحده: نضع رسالة حفظ بسيطة بدلاً من تقرير AI
      if (isWeightOnly) {
        report = `مرحباً ${currentPatient.name}، من فريق ${pharmacyName || 'صيدليتك'} 👋 تم تسجيل وزنك بنجاح. راجع خطة إدارة الوزن أدناه للاطلاع على تحليلك الشخصي.`;
      }

      setLatestGeneratedReport(report);
      const staffId = await getStaffId();
      const { data: inserted, error: visitError } = await supabase.from('visitations').insert({
        pharmacy_id: pid,
        patient_id: currentPatient.id,
        ...dbPayload,
        ai_report_output: report,
        pharmacist_summary: pharmacistSummaryLocal,
        medications_alert: medicationsAlertLocal,
        recorded_by: staffId,
      }).select().single();
      if (visitError) throw new Error('تعذر حفظ بيانات الفحص');
      if (inserted) {
        setLatestVisitId(inserted.id);
        if (pharmacistSummaryLocal) setLatestPharmacistSummary(pharmacistSummaryLocal);
        if (medicationsAlertLocal) setLatestMedicationsAlert(medicationsAlertLocal);
        setPatientHistory([inserted as VisitationRecord, ...patientHistory]);
        // تمرير تلقائي إلى التقرير بعد لحظة قصيرة للسماح بالrender
        setTimeout(() => {
          reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 150);

        // ── نظام الوزن: POST weight_plan + PATCH nutrition (بالتوازي بعد الحفظ) ───
        if (activeTests.weight && weightValue && currentPatient?.height) {
          const { data: { session: s } } = await supabase.auth.getSession();
          const pid2 = await getPharmacyId();
          if (!pid2) { setWeightStatus('error'); console.error('[vitals] weight plan: pharmacy id missing'); return; }
          setWeightStatus('saving');

          // الخطوة 1: إنشاء weight_plan (فوري، بدون AI)
          const planRes = await fetch('/api/weight-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              patient_id:    currentPatient.id,
              pharmacy_id:   pid2,
              weight_kg:     Number(weightValue),
              height_cm:     Number(currentPatient.height),
              performed_by:  staffName,
              visitation_id: inserted.id,
            }),
          }).then(r => r.json()).catch((e) => { console.error('[vitals] weight-plan request failed:', e); return null; });

          if (planRes?.plan_id) {
            const planId  = planRes.plan_id;
            const planUrl = `${window.location.origin}/weight/${planId}`;
            setWeightPlanId(planId);
            setWeightPlanUrl(planUrl);
            setWeightStatus('generating');

            // الخطوة 2: توليد قائمة الأغذية (AI — في الخلفية)
            const age = currentPatient.birth_date
              ? new Date().getFullYear() - new Date(currentPatient.birth_date).getFullYear()
              : null;
            const { data: meds } = await supabase
              .from('chronic_medications')
              .select('medication_name')
              .eq('pharmacy_id', pid2)
              .eq('patient_id', currentPatient.id)
              .eq('status', 'active');
            const medications = (meds || []).map((m: any) => m.medication_name);

            fetch('/api/weight-plan', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                plan_id:              planId,
                patient_name:         currentPatient.name,
                age,
                gender:               currentPatient.gender,
                diagnosed_conditions: currentPatient.diagnosed_conditions || [],
                medications,
                pharmacy_name:        pharmacyName,
              }),
            })
              .then(r => r.json())
              .then(d => { if (d.success) { setWeightStatus('sent'); setWeightDataSuspect(!!d.dataSuspect); setWeightSummary(d.pharmacistSummary ?? null); } })
              .catch(() => setWeightStatus('error'));

            // الخطوة 3: فتح WhatsApp فوراً بعد إنشاء الـ plan_id
            // لا يُفتح واتساب تلقائياً: التسليم للمريض قرار الصيدلاني بعد مراجعة المحتوى.
            // تُحفظ الرسالة جاهزة ويُرسلها بزرّ صريح تحت البطاقة.
            // weightWaMsg يُبنى تلقائياً في useEffect مستقل بعد اكتمال pharmacyName (يمنع رسالة باسم صيدلية فارغ)
          } else {
            setWeightStatus('error');
          }
        }
      }
    } catch (e: any) { setErrorMsg(e.message || 'حدث خطأ'); }
    finally { setSubmitting(false); }
  };

  const sendWhatsApp = () => {
    if (!latestVisitId || !currentPatient) return;
    const cleanPhone = normalizePhone(currentPatient.phone_number);
    const visitUrl = `${window.location.origin}/vitals/view/${latestVisitId}`;
    const msg = reportLanguage === 'en'
      ? `Hello ${currentPatient.name} 👋\nYour vitals have been recorded at ${pharmacyNameForOutput}.\n\nYour medical report:\n${visitUrl}\n\n🔒 A secure link, personal to you\n\nBest regards, the ${pharmacyNameForOutput} team 🌿`
      : `مرحباً ${currentPatient.name} 👋\nتم توثيق فحوصاتك الحيوية لدى ${pharmacyName}.\n\nرابط تقريرك الطبي:\n${visitUrl}\n\n🔒 رابط آمن ومخصص لك\n\nمع تحيات فريق ${pharmacyName} 🌿`;
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
    setTookBpMed(false); setTookSugarMed(false);
    setIsDualBp(true);
    setLatestGeneratedReport(null);
    setLatestVisitId(null);
    setLatestPharmacistSummary(null); setLatestMedicationsAlert(null);
    setWeightPlanId(null); setWeightSummary(null); setExcludedProducts(new Set()); setExcludedLabs(new Set()); setWeightPlanUrl(null); setWeightStatus('idle'); setBmiLive(null); setWeightDataSuspect(false); setWeightReviewed(false); setWeightWaMsg(''); setWeightApproveError(''); setWeightSaving(false); setSavedExclusions(''); setWeightSaveError('');
    setReportLanguage('ar');
    setErrorMsg('');
  };

  // ── حالة متغيرات البحث ──
  const isPhoneInput = detectInputType(searchQuery) === 'phone';
  const phoneDigits = searchQuery.replace(/\D/g, '');
  const canShowNewPatient = isPhoneInput && phoneDigits.length >= 8 && !currentPatient && nameResults.length === 0 && !searchingPatient;
  const showNoResults = !isPhoneInput && searchQuery.trim().length >= 1 && !currentPatient && nameResults.length === 0 && !searchingPatient;

  const status = getStatus();

  const exclusionsKey = JSON.stringify({ p: [...excludedProducts].sort(), l: [...excludedLabs].sort() });
  const hasUnsavedExclusions = (excludedProducts.size > 0 || excludedLabs.size > 0 || savedExclusions !== '') && exclusionsKey !== savedExclusions;

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
          <div className="space-y-4 lg:sticky lg:top-4 self-start">

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
                                  <span className="text-xs font-bold text-slate-600 font-mono bg-slate-100 px-2 py-0.5 rounded-md">{displayPhone(p.phone_number)}</span>
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
                <p className="text-[11px] text-slate-400 mt-1.5">للأرقام خارج الأردن ابدأ بمفتاح الدولة — مثال: 00966501234567</p>

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

                    {/* ── عرض/تعديل الطول — يظهر عند تفعيل قياس الوزن فقط ── */}
                    {activeTests.weight && (
                      <div className="px-4 pb-3.5 border-t border-teal-100 pt-3">
                        <HeightEditor
                          patient={currentPatient}
                          onUpdate={(newHeight) => setCurrentPatient({ ...currentPatient, height: newHeight })}
                        />
                      </div>
                    )}
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
            {currentPatient && patientMedications.length > 0 && (
              <div className="bg-white border border-amber-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 bg-amber-50/40 border-b border-amber-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                    </svg>
                    <p className="text-sm font-bold text-slate-900">الأدوية المزمنة</p>
                    <span className="text-[11px] font-bold text-amber-700">{patientMedications.length} دواء</span>
                  </div>
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-md">للاطلاع فقط</span>
                </div>
                <div className="p-4 space-y-2">
                  {patientMedications.map(med => (
                    <div key={med.id} className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
                      <span className="text-xs font-bold text-slate-800">{med.medication_name}</span>
                      {med.daily_dosage && med.dosage_unit && (
                        <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-md shrink-0">
                          {med.daily_dosage} {translateUnit(med.dosage_unit)}/يوم
                        </span>
                      )}
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
                    <div className="bg-blue-50/60 px-5 py-3.5 border-b border-blue-100 flex flex-wrap items-center justify-between gap-2">
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
                      <div className={`grid ${isDualBp ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'} gap-4`}>
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
                                  className="w-full px-2 py-3 text-xl sm:text-2xl font-black text-center bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 transition num-input placeholder:text-slate-200" />
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
                                    className="w-full px-2 py-3 text-xl sm:text-2xl font-black text-center bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 transition num-input placeholder:text-slate-200" />
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
                            // إذا كان المريض صائماً — تعطيل خيار المنبهات تلقائياً
                            const disabledByFasting = f.key === 'had_stimulants' && activeTests.sugar && sugarType === 'fasting';
                            return (
                              <button key={f.key}
                                disabled={disabledByFasting}
                                title={disabledByFasting ? 'المريض صائم — لا يمكن اختيار المنبهات' : ''}
                                onClick={() => !disabledByFasting && setBpFactors(prev => sel ? prev.filter(x => x !== f.key) : [...prev, f.key])}
                                className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition ${
                                  disabledByFasting ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed line-through' :
                                  sel ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-white'
                                }`}>
                                {sel && !disabledByFasting ? '✓ ' : ''}{f.label}
                                {disabledByFasting && <span className="text-[9px] mr-1 no-underline">(صائم)</span>}
                              </button>
                            );
                          })}
                        </div>
                        {activeTests.sugar && sugarType === 'fasting' && bpFactors.includes('had_stimulants') && (
                          // إزالة المنبهات تلقائياً إذا اختار الصيدلاني "صائم" لاحقاً
                          <>{setBpFactors(prev => prev.filter(x => x !== 'had_stimulants'))}</>
                        )}
                        {bpFactors.length > 0 && (
                          <p className="text-[10px] text-slate-400 mt-2">
                            سيذكر التقرير الذكي هذه العوامل عند تحليل القراءة
                          </p>
                        )}

                        {/* دواء الضغط */}
                        {currentPatient?.diagnosed_conditions?.includes('hypertension') && (
                          <div className="mt-3 pt-3 border-t border-slate-100">
                            <button
                              onClick={() => setTookBpMed(!tookBpMed)}
                              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-xs font-bold transition ${
                                tookBpMed ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'
                              }`}>
                              <span>💊 أخذ دواء الضغط اليوم</span>
                              <span>{tookBpMed ? '✓ نعم' : 'لم يُحدَّد'}</span>
                            </button>
                          </div>
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
                        className="w-full px-4 py-4 text-3xl sm:text-4xl font-black text-center bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 transition num-input placeholder:text-slate-200 disabled:opacity-40" />
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
                            const disabledByFasting = f.key === 'recent_heavy_meal' && sugarType === 'fasting';
                            return (
                              <button key={f.key}
                                disabled={disabledByFasting}
                                title={disabledByFasting ? 'المريض صائم — لا يمكن اختيار وجبة دسمة' : ''}
                                onClick={() => !disabledByFasting && setSugarFactors(prev => sel ? prev.filter(x => x !== f.key) : [...prev, f.key])}
                                className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition ${
                                  disabledByFasting ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed line-through' :
                                  sel ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-white'
                                }`}>
                                {sel && !disabledByFasting ? '✓ ' : ''}{f.label}
                                {disabledByFasting && <span className="text-[9px] mr-1 no-underline">(صائم)</span>}
                              </button>
                            );
                          })}
                        </div>
                        {sugarType === 'fasting' && sugarFactors.includes('recent_heavy_meal') && (
                          <>{setSugarFactors(prev => prev.filter(x => x !== 'recent_heavy_meal'))}</>
                        )}
                        {sugarFactors.length > 0 && (
                          <p className="text-[10px] text-slate-400 mt-2">
                            سيذكر التقرير الذكي هذه العوامل عند تحليل القراءة
                          </p>
                        )}

                        {/* دواء السكري */}
                        {currentPatient?.diagnosed_conditions?.includes('diabetes') && (
                          <div className="mt-3 pt-3 border-t border-slate-100">
                            <button
                              onClick={() => setTookSugarMed(!tookSugarMed)}
                              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-xs font-bold transition ${
                                tookSugarMed ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'
                              }`}>
                              <span>💊 أخذ دواء السكري اليوم</span>
                              <span>{tookSugarMed ? '✓ نعم' : 'لم يُحدَّد'}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ══════════════════════════════════════════════
                    الوزن — النظام الذكي
                ══════════════════════════════════════════════ */}
                {activeTests.weight && (
                  <div className="bg-white border border-purple-200 rounded-2xl shadow-sm overflow-hidden saas-slide-up">

                    {/* Header */}
                    <div className="bg-purple-50/60 px-5 py-3.5 border-b border-purple-100 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <IconScale className="w-4 h-4 text-purple-600" />
                        <span className="text-sm font-bold text-slate-900">الوزن</span>
                        <span className="text-[10px] text-slate-400">(kg)</span>
                      </div>
                    </div>

                    <div className="p-5 space-y-4">

                      {/* حقل الوزن */}
                      <input
                        type="number" placeholder="0" value={weightValue}
                        min="0"
                        onKeyDown={e => ["-","e","E","+"].includes(e.key) && e.preventDefault()}
                        onChange={e => { setWeightValue(e.target.value); resetSoftWarning(); }}
                        onWheel={e => e.currentTarget.blur()}
                        className="w-full px-4 py-4 text-3xl sm:text-4xl font-black text-center bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 transition num-input placeholder:text-slate-200"
                      />

                      {/* تنبيه: لا يوجد طول مسجّل */}
                      {activeTests.weight && weightValue && !currentPatient?.height && (
                        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                          <svg className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                          </svg>
                          <div>
                            <p className="text-[10px] font-bold text-amber-800">لا يوجد طول مسجّل لهذا المريض</p>
                            <p className="text-[9px] text-amber-600 mt-0.5">
                              أضف الطول من{' '}
                              <button
                                onClick={() => {
                                  router.push(`/dashboard/patients/${currentPatient!.id}`);
                                }}
                                className="underline font-bold"
                              >
                                بطاقة المريض
                              </button>
                              {' '}لحساب BMI تلقائياً
                            </p>
                          </div>
                        </div>
                      )}

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
                      <p className="text-[10px] text-rose-500 mt-0.5">لم يتم الحفظ — تحقّق من الاتصال وأعد المحاولة</p>
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
                        onClick={() => { setSoftWarningConfirmed(true); setSoftWarningMsg(''); handleSave(true); }}
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

                <div className="flex items-center justify-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400">لغة التقرير:</span>
                  <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => setReportLanguage('ar')}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition cursor-pointer ${reportLanguage === 'ar' ? 'bg-white text-teal-700 border border-teal-200 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                      عربي
                    </button>
                    <button
                      type="button"
                      onClick={() => setReportLanguage('en')}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition cursor-pointer ${reportLanguage === 'en' ? 'bg-white text-teal-700 border border-teal-200 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                      <span dir="ltr">English</span>
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => handleSave()}
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
                {submitting && (activeTests.bp || activeTests.sugar) && (
                  <div ref={thinkingRef}>
                  <VitalsThinkingOverlay
                    bpSystolic={activeTests.bp && bpSys1 ? Number(bpSys1) : null}
                    bpDiastolic={activeTests.bp && bpDia1 ? Number(bpDia1) : null}
                    heartRate={activeTests.bp && heartRate ? Number(heartRate) : null}
                    sugarMgDl={activeTests.sugar && sugarValue ? Number(sugarValue) : null}
                    sugarType={activeTests.sugar ? sugarType : null}
                    visitCount={patientHistory.length}
                    prevBpSys={patientHistory.find(v => v.bp_systolic != null)?.bp_systolic ?? null}
                    prevBpDia={patientHistory.find(v => v.bp_diastolic != null)?.bp_diastolic ?? null}
                    prevSugar={patientHistory.find(v => v.sugar_value != null)?.sugar_value ?? null}
                    patientName={currentPatient?.name ?? null}
                  />
                  </div>
                )}
              </div>
            )}

            {/* ══ التقرير بعد الحفظ ══ */}
            {latestVisitId && latestGeneratedReport && (
              <div ref={reportRef} className="space-y-4 saas-slide-up scroll-mt-24">
                {/* بطاقة التقرير الطبي الذكي — تُخفى في مسار الوزن وحده لتفادي التكرار مع بطاقة خطة الوزن */}
                {!(activeTests.weight && !activeTests.bp && !activeTests.sugar) && (
                  <>
                    {isFallbackReport && (
                      <div className="mb-3 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-4 py-2.5 rounded-lg">
                        ⚠️ تعذّر توليد التقرير الذكي — هذا تقرير مختصر مبني على القراءات مباشرة. القراءة محفوظة.
                      </div>
                    )}
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
                        <p className="text-base font-black text-slate-900">{currentPatient?.name}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                          <span>{[activeTests.bp && 'ضغط', activeTests.sugar && 'سكري'].filter(Boolean).join(' · ')} · {formatDate(new Date().toISOString())}</span>
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span className="text-emerald-600 font-bold">تم الحفظ</span>
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${status.border} ${status.bg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${status.dot}`} />
                        <span className={`text-[10px] font-bold ${status.color}`}>{status.label}</span>
                      </div>
                    </div>
                  </div>
                  <div className="px-5 pt-4">
                    <div className={activeTests.bp && activeTests.sugar ? 'grid grid-cols-2 gap-4' : ''}>
                      {activeTests.bp && (
                        <div>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-[34px] font-black text-slate-900 leading-none">{finalSys}/{finalDia}</span>
                            <span className="text-sm text-slate-400">مم زئبق</span>
                          </div>
                          <div className="h-px bg-slate-200 my-3.5" />
                          <div className="flex text-center">
                            <div className="flex-1">
                              <p className="text-xl font-black text-slate-900">{finalHeartRate ?? '—'}</p>
                              <p className="text-[11px] text-slate-400 mt-0.5">نبض/دقيقة</p>
                            </div>
                            {activeTests.bp && (
                              <>
                                <div className="w-px bg-slate-200" />
                                <div className="flex-1">
                                  <p className={`text-xl font-black ${finalSys >= 140 || finalDia >= 90 ? 'text-amber-600' : 'text-teal-700'}`}>
                                    {finalSys >= 140 || finalDia >= 90 ? 'مرتفع' : 'طبيعي'}
                                  </p>
                                  <p className="text-[11px] text-slate-400 mt-0.5">تصنيف الضغط</p>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                      {activeTests.sugar && (
                        <div className={activeTests.bp ? 'border-r border-slate-200 pr-4' : ''}>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-[34px] font-black text-slate-900 leading-none">{sugarValue}</span>
                            <span className="text-sm text-slate-400">mg/dL</span>
                          </div>
                          <div className="h-px bg-slate-200 my-3.5" />
                          <div className="flex justify-center text-center">
                            <div>
                              <p className="text-base font-black text-slate-700">
                                {sugarType === 'fasting' ? 'صائم' : sugarType === 'postprandial' ? 'بعد الأكل' : 'عشوائي'}
                              </p>
                              <p className="text-[11px] text-slate-400 mt-0.5">نوع القراءة</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  {(latestPharmacistSummary || latestMedicationsAlert || selectedSymptoms.length > 0 || bpFactors.length > 0 || sugarFactors.length > 0) && (
                    <div className="px-5 pb-2">
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3">
                        <p className="text-xs font-bold text-slate-400">ملخص للصيدلاني — لا يصل للمريض</p>

                        <div className={activeTests.bp && activeTests.sugar ? 'grid grid-cols-2 gap-3 items-start' : ''}>
                        {/* قسم ضغط الدم */}
                        {activeTests.bp && (
                          <div className="space-y-2">
                            <p className="text-xs font-bold text-slate-500 border-b border-slate-200 pb-1">ضغط الدم</p>
                            {isDualBp ? (
                              <div className="text-xs text-slate-500 space-y-0.5">
                                <div className="flex gap-3">
                                  <span className="text-slate-400 font-bold">ق١:</span>
                                  <span>{bpSys1}/{bpDia1} مم{heartRate ? ` · نبض ${heartRate}` : ''}</span>
                                </div>
                                <div className="flex gap-3">
                                  <span className="text-slate-400 font-bold">ق٢:</span>
                                  <span>{bpSys2}/{bpDia2} مم{heartRate2 ? ` · نبض ${heartRate2}` : ''}</span>
                                </div>
                                <div className="flex gap-3 font-bold text-slate-700">
                                  <span className="text-slate-400">معدّل:</span>
                                  <span>{finalSys}/{finalDia} مم{finalHeartRate ? ` · نبض ${finalHeartRate}` : ''}</span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs text-slate-500">
                                <span className="text-slate-400 font-bold ml-2">قراءة مفردة:</span>
                                <span>{bpSys1}/{bpDia1} مم{heartRate ? ` · نبض ${heartRate}` : ''}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-bold text-slate-400">دواء الضغط:</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${tookBpMed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'}`}>
                                {tookBpMed ? 'أخذه ✓' : 'لم يأخذه'}
                              </span>
                            </div>
                            {selectedSymptoms.filter(s => bpSymptomsList.includes(s)).length > 0 && (
                              <div>
                                <p className="text-[9px] font-bold text-slate-400 mb-1">أعراض مصاحبة</p>
                                <div className="flex flex-wrap gap-1">
                                  {selectedSymptoms.filter(s => bpSymptomsList.includes(s)).map(s => (
                                    <span key={s} className="text-[10px] font-bold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-lg">{s}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {bpFactors.length > 0 && (
                              <div>
                                <p className="text-[9px] font-bold text-slate-400 mb-1">عوامل مؤثرة</p>
                                <div className="flex flex-wrap gap-1">
                                  {bpFactors.map(f => {
                                    const label = f === 'had_stimulants' ? 'شرب قهوة / شاي / مكيّف' : f === 'recent_exertion' ? 'مجهود بدني مؤخراً' : f === 'recent_heavy_meal' ? 'تناول وجبة دسمة مؤخراً' : f === 'is_stressed' ? 'يشعر بتوتر أو قلق' : f;
                                    return <span key={f} className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">{label}</span>;
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* قسم السكري */}
                        {activeTests.sugar && (
                          <div className={`space-y-2 ${activeTests.bp ? 'border-r border-slate-200 pr-3' : ''}`}>
                            <p className="text-xs font-bold text-slate-500 border-b border-slate-200 pb-1">السكري</p>
                            <div className="text-xs text-slate-500">
                              <span className="font-bold text-slate-700">{sugarValue}</span>
                              <span className="text-slate-400 mr-1"> mg/dL</span>
                              {sugarType && <span className="mr-2"> · {sugarType === 'fasting' ? 'صائم' : sugarType === 'postprandial' ? 'بعد الأكل' : 'عشوائي'}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-bold text-slate-400">دواء السكري:</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${tookSugarMed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'}`}>
                                {tookSugarMed ? 'أخذه ✓' : 'لم يأخذه'}
                              </span>
                            </div>
                            {selectedSymptoms.filter(s => sugarSymptomsList.includes(s)).length > 0 && (
                              <div>
                                <p className="text-[9px] font-bold text-slate-400 mb-1">أعراض مصاحبة</p>
                                <div className="flex flex-wrap gap-1">
                                  {selectedSymptoms.filter(s => sugarSymptomsList.includes(s)).map(s => (
                                    <span key={s} className="text-[10px] font-bold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-lg">{s}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {sugarFactors.length > 0 && (
                              <div>
                                <p className="text-[9px] font-bold text-slate-400 mb-1">عوامل مؤثرة</p>
                                <div className="flex flex-wrap gap-1">
                                  {sugarFactors.map(f => {
                                    const label = f === 'had_stimulants' ? 'شرب قهوة / شاي / مكيّف' : f === 'recent_exertion' ? 'مجهود بدني مؤخراً' : f === 'recent_heavy_meal' ? 'تناول وجبة دسمة مؤخراً' : f === 'is_stressed' ? 'يشعر بتوتر أو قلق' : f;
                                    return <span key={f} className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">{label}</span>;
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        </div>
                        {latestPharmacistSummary && (
                          <p className="text-sm text-slate-700 leading-relaxed font-medium">{latestPharmacistSummary}</p>
                        )}
                        {latestMedicationsAlert && (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            <p className="text-[9px] font-bold text-amber-700 mb-0.5">تنبيه الأدوية</p>
                            <p className="text-xs text-amber-800 leading-relaxed">{latestMedicationsAlert}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {activeTests.bp && <BpHistoryChart bpHistory={patientHistory.filter((v): v is VisitationRecord & { bp_systolic: number; bp_diastolic: number } => v.bp_systolic != null && v.bp_diastolic != null).slice().reverse()} formatDate={formatDate} />}
                  {activeTests.sugar && <SugarHistoryChart sugarHistory={patientHistory.filter((v): v is VisitationRecord & { sugar_value: number } => v.sugar_value != null).slice().reverse()} formatDate={formatDate} />}
                  <div className="px-5 py-2">
                    <button onClick={() => setReportExpanded(p => !p)}
                      className="w-full flex items-center justify-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-800 py-2.5 rounded-xl hover:bg-slate-50 border border-slate-200 transition">
                      {reportExpanded ? '▲ طيّ نص المريض' : '▼ عرض نص المريض للمراجعة قبل الإرسال'}
                    </button>
                  </div>
                  {reportExpanded && (
                  <div className="px-5 pb-3">
                    <p
                      className="text-sm text-slate-700 leading-relaxed font-medium bg-slate-50 border border-slate-100 rounded-xl p-4"
                      dir={detectTextDir(latestGeneratedReport)}
                      style={{ textAlign: detectTextDir(latestGeneratedReport) === 'ltr' ? 'left' : 'right' }}
                    >
                      {latestGeneratedReport}
                    </p>
                  </div>
                  )}
                  <div className="px-5 pb-5 space-y-3">
                    {/* زر عرض صفحة المريض */}
                    <button onClick={() => window.open(`${window.location.origin}/vitals/view/${latestVisitId}`, '_blank')}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition hover:bg-slate-50 shadow-sm">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
                      عرض صفحة المريض
                    </button>
                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={handlePrintPDF}
                        className="flex items-center justify-center gap-2 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition hover:bg-slate-50 shadow-sm">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
                        </svg>
                        طباعة PDF
                      </button>
                      {/* وزن وحده: WhatsApp يفتح تلقائياً عند الحفظ — هنا نعرض زر التقرير العام فقط */}
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
                  </>
                )}

                {/* ══ بطاقة الوزن — تظهر بعد بدء الحفظ ══ */}
                {activeTests.weight && weightValue && bmiLive && weightStatus !== 'idle' && (
                  <div className="bg-white border border-purple-200 rounded-2xl shadow-sm overflow-hidden saas-slide-up">

                    {/* ١. ترويسة: أيقونة شخص + اسم المريض + شارة الحالة */}
                    <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col items-start gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                          <svg className="w-5 h-5 text-slate-400" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="12" cy="8" r="3.5" />
                            <path d="M5 21c0-4.42 3.13-8 7-8s7 3.58 7 8" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-base font-black text-slate-900">{currentPatient?.name}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                            <span>فحص وزن · {formatDate(new Date().toISOString())}</span>
                            <span className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              <span className="text-emerald-600 font-bold">تم الحفظ</span>
                            </span>
                          </p>
                        </div>
                      </div>
                      {/* شارات: تصنيف BMI + الحالة العامة + تم الحفظ + حالة خطة الوزن */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${bmiLive.borderColor} ${bmiLive.bgColor}`}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${bmiLive.dot}`} />
                          <span className={`text-[10px] font-bold ${bmiLive.color}`}>{bmiLive.label}</span>
                        </div>
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${status.border} ${status.bg}`}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${status.dot}`} />
                          <span className={`text-[10px] font-bold ${status.color}`}>{status.label}</span>
                        </div>
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border shrink-0 ${
                          weightStatus === 'sent' ? 'bg-teal-50 border-teal-200'
                          : weightStatus === 'error' ? 'bg-rose-50 border-rose-200'
                          : 'bg-purple-50 border-purple-200'
                        }`}>
                          {weightStatus === 'sent' ? (
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
                          ) : weightStatus === 'error' ? (
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                          ) : (
                            <div className="w-2.5 h-2.5 border-2 border-purple-400 border-t-purple-700 rounded-full animate-spin shrink-0" />
                          )}
                          <span className={`text-[10px] font-bold ${
                            weightStatus === 'sent' ? 'text-teal-700' : weightStatus === 'error' ? 'text-rose-700' : 'text-purple-700'
                          }`}>
                            {weightStatus === 'sent' && 'الخطة جاهزة'}
                            {weightStatus === 'error' && 'تعذر التوليد'}
                            {(weightStatus === 'saving' || weightStatus === 'generating') && 'جاري التحضير'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* ٢. بطاقة أرقام موحّدة */}
                    <div className="px-5 pt-4">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[34px] font-black text-slate-900 leading-none">{weightValue}</span>
                        <span className="text-sm text-slate-400">كغ حالياً</span>
                        <span className={`mr-auto text-[13px] font-bold ${bmiLive.color}`}>BMI {bmiLive.value} · {bmiLive.labelShort}</span>
                      </div>
                      <div className="h-px bg-slate-200 my-3.5" />
                      {(() => {
                        const wv = Number(weightValue);
                        const overBy = wv - bmiLive.idealMax;
                        const underBy = bmiLive.idealMin - wv;
                        const diffValue = overBy > 0 ? overBy : underBy > 0 ? underBy : 0;
                        const diffLabel = overBy > 0 ? 'نقص مطلوب (كغ)' : underBy > 0 ? 'زيادة مطلوبة (كغ)' : '';
                        const idealMid = ((bmiLive.idealMin + bmiLive.idealMax) / 2).toFixed(1);
                        if (diffValue > 0) {
                          return (
                            <div className="flex text-center mb-4">
                              <div className="flex-1">
                                <p className="text-xl font-black text-slate-900">{diffValue.toFixed(1)}</p>
                                <p className="text-[11px] text-slate-400 mt-0.5">{diffLabel}</p>
                              </div>
                              <div className="w-px bg-slate-200" />
                              <div className="flex-1">
                                <p className="text-xl font-black text-slate-900">{bmiLive.firstGoal}</p>
                                <p className="text-[11px] text-slate-400 mt-0.5">الهدف المبدئي (كغ)</p>
                              </div>
                              <div className="w-px bg-slate-200" />
                              <div className="flex-1">
                                <p className="text-xl font-black text-slate-900">{idealMid}</p>
                                <p className="text-[11px] text-slate-400 mt-0.5">الوزن المثالي (كغ)</p>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div className="flex justify-center text-center mb-4">
                            <div>
                              <p className="text-base font-black text-teal-700">ضمن المثالي</p>
                              <p className="text-[11px] text-slate-400 mt-0.5">الحالة</p>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* ٣. مؤشر BMI — تدرّج مستمر مع مؤشر HTML */}
                    <div className="px-5 pt-4 pb-2" dir="ltr">
                      <div className="relative h-[14px] flex items-center">
                        <div
                          className="w-full h-2 rounded-full"
                          style={{ background: 'linear-gradient(90deg, #85B7EB, #97C459 33%, #FAC775 66%, #F09595)' }}
                        />
                        <div
                          className="absolute bg-white"
                          style={{ left: `calc(${Math.min(Math.max(((bmiLive.value - 10) / 35) * 100, 1), 99)}% - 3.5px)`, top: 0, width: '3px', height: '14px', border: '2px solid #0b0b0b', borderRadius: '2px', boxSizing: 'content-box' as const }}
                        />
                      </div>
                      <div className="flex justify-between mt-2">
                        {['نحافة', 'طبيعي', 'زيادة', 'سمنة'].map((l) => (
                          <span key={l} className="text-[9px] font-semibold text-slate-400">{l}</span>
                        ))}
                      </div>
                    </div>

                    <WeightHistoryChart weightHistory={patientHistory.filter((v): v is VisitationRecord & { weight: number } => v.weight != null).slice().reverse()} formatDate={formatDate} />

                    {/* ٥. ملخص للصيدلاني — clinical_reasoning + تنبيه الأدوية + المكمّلات والفحوصات بخانات اختيار (الاختيارات لا تُحفظ بعد) */}
                    {(weightStatus === 'saving' || weightStatus === 'generating') && (
                      <WeightThinkingOverlay
                        weightKg={weightValue ? Number(weightValue) : null}
                        heightCm={currentPatient?.height ? Number(currentPatient.height) : null}
                        ageYears={currentPatient?.birth_date ? Math.floor((Date.now() - new Date(currentPatient.birth_date).getTime()) / (365.25 * 86400000)) : null}
                        gender={currentPatient?.gender ?? null}
                        sugarMgDl={activeTests.sugar && sugarValue ? Number(sugarValue) : null}
                      />
                    )}
                    {weightStatus === 'sent' && weightSummary && (
                      <div className="px-5 pt-4">
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3">
                          <p className="text-[10px] font-bold text-slate-400">ملخص للصيدلاني — لا يصل للمريض</p>

                          {weightSummary.clinical_reasoning && (
                            <p className="text-sm text-slate-700 leading-relaxed font-medium">{weightSummary.clinical_reasoning}</p>
                          )}

                          {weightSummary.medications_alert && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                              <p className="text-[9px] font-bold text-amber-700 mb-0.5">تنبيه الأدوية</p>
                              <p className="text-xs text-amber-800 leading-relaxed">{weightSummary.medications_alert}</p>
                            </div>
                          )}

                          {weightSummary.pharmacy_products.length > 0 && (
                            <div>
                              <p className="text-[9px] font-bold text-slate-400 mb-1.5">المكمّلات المقترحة — أزل ما لا تريد وصوله للمريض</p>
                              <div className="space-y-1">
                                {weightSummary.pharmacy_products.map((p, i) => (
                                  <label key={i} className="flex items-start gap-2 cursor-pointer">
                                    <input type="checkbox" className="mt-0.5 accent-purple-600 shrink-0"
                                      checked={!excludedProducts.has(i)}
                                      onChange={() => setExcludedProducts(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })} />
                                    <span className={`text-xs leading-relaxed ${excludedProducts.has(i) ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                      <span className="font-bold">{p.product?.product_name ?? CATEGORY_LABELS[p.category_code] ?? p.category_code}</span>
                                      {p.product?.price != null && <span className="text-slate-400"> · {p.product.price} د.أ</span>}
                                      <span className="text-slate-500"> — {p.reason}</span>
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}

                          {weightSummary.lab_alerts.length > 0 && (
                            <div>
                              <p className="text-[9px] font-bold text-slate-400 mb-1.5">فحوصات يُنصح بها — أزل ما لا تريد وصوله للمريض</p>
                              <div className="space-y-1">
                                {weightSummary.lab_alerts.map((l, i) => (
                                  <label key={i} className="flex items-start gap-2 cursor-pointer">
                                    <input type="checkbox" className="mt-0.5 accent-purple-600 shrink-0"
                                      checked={!excludedLabs.has(i)}
                                      onChange={() => setExcludedLabs(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })} />
                                    <span className={`text-xs leading-relaxed ${excludedLabs.has(i) ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{l}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* تنبيه فرق وزن غير معتاد — أرقام التقدّم لم تُعرض للمريض */}
                    {weightDataSuspect && (
                      <div className="mx-5 mt-4 flex items-start gap-2 px-3 py-2.5 rounded-xl border bg-amber-50 border-amber-200 text-amber-800">
                        <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                        </svg>
                        <p className="text-[11px] font-bold">فرق وزن غير معتاد مقارنةً بالقراءات السابقة — راجع دقّة الوزن المُدخل. لم تُعرض أرقام التقدّم للمريض.</p>
                      </div>
                    )}

                    {/* ٦. معاينة ← اعتماد ← تسليم */}
                    {weightPlanUrl && (
                      <div className="mx-5 my-5 border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden">
                        {(hasUnsavedExclusions || savedExclusions !== '') && (
                          <div className="border-b border-slate-100">
                            {hasUnsavedExclusions ? (
                              <button
                                onClick={async () => {
                                  if (!weightPlanId) return;
                                  setWeightSaving(true); setWeightSaveError('');
                                  try {
                                    const r = await fetch('/api/weight-plan', {
                                      method: 'PUT',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ plan_id: weightPlanId, excluded_products: [...excludedProducts], excluded_labs: [...excludedLabs], finalize: false }),
                                    }).then(x => x.json());
                                    if (!r?.success) { setWeightSaveError('تعذّر حفظ الاستثناءات — تحقّق من الاتصال وأعد المحاولة.'); return; }
                                    setSavedExclusions(exclusionsKey);
                                  } catch {
                                    setWeightSaveError('تعذّر حفظ الاستثناءات — تحقّق من الاتصال وأعد المحاولة.');
                                  } finally { setWeightSaving(false); }
                                }}
                                disabled={weightSaving}
                                className="w-full flex items-center justify-center gap-2 py-3 text-xs font-bold bg-purple-50 hover:bg-purple-100 text-purple-700 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                                </svg>
                                {weightSaving ? 'جاري الحفظ…' : 'حفظ الاستثناءات'}
                              </button>
                            ) : (
                              <div className="flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-bold text-emerald-600 bg-emerald-50/50">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                الاستثناءات محفوظة
                              </div>
                            )}
                            {weightSaveError && (
                              <p className="px-4 py-2 text-[11px] font-bold text-rose-700 bg-rose-50 border-t border-rose-200">{weightSaveError}</p>
                            )}
                          </div>
                        )}
                        <button
                          onClick={() => window.open(weightPlanUrl, '_blank')}
                          className="w-full flex items-center justify-center gap-2 py-3 bg-white text-purple-700 text-xs font-bold transition hover:bg-purple-50 cursor-pointer">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                          معاينة خطة الوزن
                        </button>

                        <label className="flex items-start gap-2.5 px-4 py-3 bg-slate-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={weightReviewed}
                            onChange={(e) => setWeightReviewed(e.target.checked)}
                            className="mt-0.5 w-4 h-4 shrink-0 accent-teal-600 cursor-pointer"
                          />
                          <span className="text-[11px] font-bold text-slate-700 leading-relaxed">
                            راجعتُ الخطة بخبرتي وأعتمدها للمريض
                          </span>
                        </label>

                        {weightApproveError && (
                          <div className="px-4 py-2.5 bg-rose-50 border-b border-rose-200">
                            <p className="text-[11px] font-bold text-rose-700">{weightApproveError}</p>
                          </div>
                        )}

                        <div className="flex">
                          <button
                            onClick={async () => {
                              if (!weightWaMsg || !weightPlanId) return;
                              setWeightApproving(true);
                              setWeightApproveError('');
                              try {
                                const r = await fetch('/api/weight-plan', {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ plan_id: weightPlanId, excluded_products: [...excludedProducts], excluded_labs: [...excludedLabs] }),
                                }).then(x => x.json());
                                if (!r?.success) { setWeightApproveError('تعذّر حفظ اعتماد الخطة — لم تُرسل. تحقّق من الاتصال وأعد المحاولة.'); return; }
                                setSavedExclusions(exclusionsKey);
                                window.open(weightWaMsg, '_blank');
                              } catch {
                                setWeightApproveError('تعذّر حفظ اعتماد الخطة — لم تُرسل. تحقّق من الاتصال وأعد المحاولة.');
                              } finally {
                                setWeightApproving(false);
                              }
                            }}
                            disabled={!weightReviewed || !weightWaMsg || weightApproving}
                            className="flex-[2] flex items-center justify-center gap-2 py-3 border-l border-slate-200 text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed bg-[#25D366] hover:bg-[#20BD5A] text-white cursor-pointer">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                            إرسال للمريض
                          </button>
                          <button
                            onClick={handlePrintPDF}
                            disabled={!weightReviewed}
                            className="flex-1 flex items-center justify-center gap-2 py-3 text-slate-700 text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 cursor-pointer">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
                            </svg>
                            طباعة
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

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

      <AppFooter className="max-w-5xl mx-auto px-6 py-8 border-t border-slate-200/60 mt-4" />
    </div>
  );
}
