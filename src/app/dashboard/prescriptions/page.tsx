'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import DashboardHeader, { usePharmacyInfo } from '../components/DashboardHeader';
import AppFooter from '../../components/AppFooter';
import DateField from '@/components/DateField';
import Toast, { useNotice } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { getPharmacyId, getTenantContext } from '@/lib/tenant';
import { normalizeAr } from '@/lib/arabic';
import { displayPhone } from '@/lib/phone';
import { formatIsoAsDmy } from '@/lib/date-input';
import { useSubscriptionState, READ_ONLY_MESSAGE, friendlyError } from '@/lib/subscription-state';

// ═══════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════
interface RxItem { id: string; drug_name: string; position: number }
interface Rx {
  id: string;
  entry_date: string;
  doctor_name: string;
  patient_name: string;
  patient_id: string | null;
  pharmacist_name: string;
  recorded_by: string;
  created_at: string;
  prescription_items: RxItem[];
}
interface DrugRow { key: number; value: string }
// شريط اقتراح الملف مربوط بالوصفة (rxId) لا بالاسم وحده؛ match = نتيجة آخر فحص لملفات بنفس الاسم المطبّع
interface Suggest { rxId: string; name: string; match: 'none' | 'one' | 'many'; patientId: string | null }
// ملف مريض مطابق للاسم المكتوب؛ الهاتف وتاريخ الميلاد لتمييز الملفات المتشابهة
interface Candidate { id: string; name: string; phone_number: string; birth_date: string }

const MAX_DRUGS = 30;
const LIST_LIMIT = 150;

// عدّاد مفاتيح صفوف الأدوية (React keys فقط — لا يُكتب في DOM فلا يسبّب اختلاف hydration)
let rowSeq = 0;
const newRow = (value = ''): DrugRow => ({ key: ++rowSeq, value });

// ═══════════════════════════════════════════════════════
// أدوات التاريخ — كلها بتوقيت عمّان كما في القاعدة (prescription_is_editable)
// ═══════════════════════════════════════════════════════
const ammanDay = (d: Date | string): string => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Amman' });

function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function formatDay(iso: string): string {
  // الظهر لا منتصف الليل كي لا يزحزح فرق التوقيت اليوم المعروض
  return new Date(`${iso}T12:00:00`).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', numberingSystem: 'latn' });
}

// h:mm مع ص/م بأرقام لاتينية وبلا صفر قبل الساعة، بتوقيت عمّان (الظهر 12:05 م، منتصف الليل 12:05 ص).
// كتبناها محلياً لأن formatTime12 في RequestDetailsModal خاصة بالملف وبالتوقيت المحلي، وبقية الصفحات تفرض ساعتين (01:16)
function formatTime(ts: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Amman', numberingSystem: 'latn' }).formatToParts(new Date(ts));
  const h = Number(parts.find(x => x.type === 'hour')?.value);
  const m = parts.find(x => x.type === 'minute')?.value ?? '00';
  return `${h % 12 || 12}:${m} ${h >= 12 ? 'م' : 'ص'}`;
}

/** رسالة القاعدة تأتي بصيغة «CODE: نص عربي»؛ يُعرض النص العربي وحده، ولا تُسرَّب رسائل إنجليزية تقنية للمستخدم */
function errText(err: unknown): string {
  const text = (err as { message?: string } | null)?.message ?? '';
  if (/SUBSCRIPTION_READ_ONLY/.test(text)) return friendlyError(text);
  const m = /^[A-Z_]+:\s*([\s\S]+)$/.exec(text);
  if (m) return m[1];
  if (/row-level security|permission denied/i.test(text)) {
    return 'لا تملك صلاحية هذا الإجراء — التعديل والحذف متاحان في يوم التسجيل فقط، لمن سجّل الوصفة أو للمالك.';
  }
  return 'تعذّر تنفيذ العملية، حاول مرة أخرى.';
}

// ═══════════════════════════════════════════════════════
// ICONS (Heroicons-style, strokeWidth 1.5)
// ═══════════════════════════════════════════════════════
const IconPlus = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
);
const IconTrash = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
);
const IconPencil = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
);
const IconOpen = ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
);

const INPUT = 'w-full h-11 px-3 text-sm bg-white border border-slate-200 rounded-xl focus:border-slate-900 focus:ring-1 focus:ring-slate-900 focus:outline-none transition text-right text-slate-900 placeholder:text-slate-400';
const BTN_PRIMARY = 'h-11 px-6 bg-gradient-to-l from-slate-900 to-teal-800 hover:from-slate-800 hover:to-teal-700 text-white rounded-xl text-sm font-bold shadow-sm transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';

/** rows = null حين لا صيدلية للجلسة (لا شيء يُطبَّق على القائمة) */
async function fetchPrescriptions(): Promise<{ rows: Rx[] | null; error: string | null }> {
  const pid = await getPharmacyId();
  if (!pid) return { rows: null, error: null };
  const { data, error } = await supabase
    .from('prescriptions')
    .select('id, entry_date, doctor_name, patient_name, patient_id, pharmacist_name, recorded_by, created_at, prescription_items(id, drug_name, position)')
    .eq('pharmacy_id', pid)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT);
  if (error) {
    console.error('[prescriptions] load failed:', error.message);
    return { rows: null, error: 'تعذّر تحميل سجل الوصفات، حاول تحديث الصفحة.' };
  }
  return {
    rows: ((data || []) as Rx[]).map(r => ({
      ...r,
      prescription_items: [...(r.prescription_items || [])].sort((a, b) => a.position - b.position),
    })),
    error: null,
  };
}

// ═══════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════
export default function PrescriptionsPage() {
  const { readOnly } = useSubscriptionState();
  const { pharmacistName } = usePharmacyInfo();
  const { notice, setNotice } = useNotice();
  const { confirm, dialog } = useConfirm();

  // هوية المستخدم الحالي: تحدد من يرى أزرار التعديل والحذف (نفس شرط prescription_is_editable)
  const [staffId, setStaffId] = useState<string | null>(null);
  const [role, setRole] = useState('');
  const [staffName, setStaffName] = useState('');

  // ── القائمة ──
  const [list, setList] = useState<Rx[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // يُبطل رد تحميل قديم وصل بعد أحدث منه فلا يستبدل القائمة
  const loadReqId = useRef(0);

  // ── النموذج ──
  const [editingId, setEditingId] = useState<string | null>(null);
  const [doctor, setDoctor] = useState('');
  const [patient, setPatient] = useState('');
  const [pharmacist, setPharmacist] = useState('');
  const [entryDate, setEntryDate] = useState(() => ammanDay(new Date()));
  const [drugs, setDrugs] = useState<DrugRow[]>(() => [newRow()]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const savingRef = useRef(false);
  const pharmacistTouched = useRef(false);
  const doctorRef = useRef<HTMLInputElement>(null);
  const drugRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const focusLastDrug = useRef(false);

  // ── ربط الوصفة بملف مريض ──
  // لا ربط تلقائي أبداً: المطابقات تُعرض للصيدلاني ولا يُربط إلا بضغطه، فالاسم المتكرر قد يعود لمريضين مختلفين
  const [linked, setLinked] = useState<{ id: string; name: string } | null>(null);
  // forKey = النص المطبَّع الذي جاءت منه النتيجة؛ تُهمل إن تغيّر النص بعدها (اشتقاق بدل setState داخل effect)
  const [found, setFound] = useState<{ forKey: string; rows: Candidate[] } | null>(null);
  const lookupReqId = useRef(0);

  // ── اقتراح إنشاء ملف لمريض غير مسجّل (بعد حفظ وصفة جديدة فقط) ──
  const [suggest, setSuggest] = useState<Suggest | null>(null);
  // يُبطل فحصاً معلّقاً عند حفظ وصفة أحدث أو إغلاق الشريط
  const suggestReqId = useRef(0);
  // فحص إعادة التركيز: حارس race منفصل + تخفيف focus/visibilitychange اللذين يقعان معاً عادةً
  const recheckReqId = useRef(0);
  const lastRecheckAt = useRef(0);
  const linkingRef = useRef(false);
  const [linking, setLinking] = useState(false);

  const today = ammanDay(new Date());
  const minDate = shiftIso(today, -7);
  const candidates = !linked && found && found.forKey === normalizeAr(patient) ? found.rows : [];

  // ── الهوية ──
  useEffect(() => {
    void getTenantContext().then(ctx => {
      setStaffId(ctx.staffId);
      setRole(ctx.role);
      setStaffName(ctx.staffName ?? '');
    });
  }, []);

  // اسم الصيدلاني الافتراضي: الموظف الحالي من قاعدة البيانات (لا localStorage)، ثم صيدلاني الصيدلية؛ ويبقى قابلاً للتعديل
  const defaultPharmacist = staffName || pharmacistName || '';
  useEffect(() => {
    if (!pharmacistTouched.current) setPharmacist(defaultPharmacist);
  }, [defaultPharmacist]);

  // ── تحميل القائمة ──
  // الجلب نفسه خارج المكوّن (fetchPrescriptions) كي يبقى setState في callback غير متزامن لا في جسم الـ effect
  const applyResult = useCallback((myId: number, res: { rows: Rx[] | null; error: string | null }) => {
    if (myId !== loadReqId.current) return;
    if (res.error) {
      setLoadError(res.error);
    } else if (res.rows) {
      setLoadError('');
      setList(res.rows);
    }
    setLoading(false);
  }, []);

  const load = useCallback(async () => {
    const myId = ++loadReqId.current;
    applyResult(myId, await fetchPrescriptions());
  }, [applyResult]);

  useEffect(() => {
    const myId = ++loadReqId.current;
    void fetchPrescriptions().then(res => applyResult(myId, res));
  }, [applyResult]);

  // ── البحث عن ملفات مطابقة تماماً للاسم المكتوب (بحث مؤجَّل 300ms مع حارس race) ──
  useEffect(() => {
    const q = patient.trim();
    const myId = ++lookupReqId.current;
    if (q.length < 2) return;
    const key = normalizeAr(q);
    const t = setTimeout(async () => {
      const pid = await getPharmacyId();
      if (myId !== lookupReqId.current || !pid) return;
      const { data, error } = await supabase
        .from('patients')
        .select('id, name, phone_number, birth_date')
        .eq('pharmacy_id', pid)
        // eq لا ilike: العمود مولَّد بدالة normalize_ar المطابقة لـ normalizeAr، والمطلوب مطابقة تامة فقط
        .eq('name_normalized', key)
        .limit(20);
      if (myId !== lookupReqId.current) return;
      if (error) { setFound(null); return; }
      // مطابقة تامة بعد التطبيع؛ الجزئية لا تُعرض لأنها ستُغرق الصيدلاني بملفات لا يقصدها
      const rows = ((data || []) as Candidate[]).filter(p => normalizeAr(p.name) === key).slice(0, 5);
      setFound({ forKey: key, rows });
    }, 300);
    return () => clearTimeout(t);
  }, [patient]);

  // ── اقتراحات الإدخال السريع: الأكثر تكراراً أولاً ──
  const { doctorSuggestions, drugSuggestions } = useMemo(() => {
    const rank = (counts: Map<string, number>) =>
      [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 100).map(([k]) => k);
    const d = new Map<string, number>();
    const g = new Map<string, number>();
    for (const r of list) {
      d.set(r.doctor_name, (d.get(r.doctor_name) ?? 0) + 1);
      for (const it of r.prescription_items) g.set(it.drug_name, (g.get(it.drug_name) ?? 0) + 1);
    }
    return { doctorSuggestions: rank(d), drugSuggestions: rank(g) };
  }, [list]);

  const groups = useMemo(() => {
    const m = new Map<string, Rx[]>();
    for (const r of list) {
      const arr = m.get(r.entry_date);
      if (arr) arr.push(r); else m.set(r.entry_date, [r]);
    }
    return [...m.entries()];
  }, [list]);

  // تركيز آخر حقل دواء بعد إضافة صف
  useEffect(() => {
    if (!focusLastDrug.current) return;
    focusLastDrug.current = false;
    const last = drugs[drugs.length - 1];
    if (last) drugRefs.current[last.key]?.focus();
  }, [drugs]);

  // نفس شرط prescription_is_editable في القاعدة: يوم التسجيل (لا entry_date) بتوقيت عمّان + المسجِّل أو المالك.
  // القاعدة هي المرجع؛ هذا لإخفاء الأزرار فقط، وأي رفض منها يُترجم برسالة عربية
  const canEdit = (r: Rx) =>
    !readOnly && ammanDay(r.created_at) === today && (r.recorded_by === staffId || role === 'owner');

  // ── عمليات النموذج ──
  const resetForm = () => {
    setFormError('');
    setEditingId(null);
    setDrugs([newRow()]);
    setDoctor('');
    setPatient('');
    setLinked(null);
    // الصيدلاني والتاريخ يبقيان: إدخال وصفات يوم سابق دفعة واحدة شائع
    requestAnimationFrame(() => doctorRef.current?.focus());
  };

  const addDrug = () => {
    if (drugs.length >= MAX_DRUGS) return;
    focusLastDrug.current = true;
    setDrugs(d => [...d, newRow()]);
  };

  const removeDrug = (key: number) => {
    setDrugs(d => (d.length <= 1 ? d : d.filter(r => r.key !== key)));
  };

  const setDrugValue = (key: number, value: string) => {
    setDrugs(d => d.map(r => (r.key === key ? { ...r, value } : r)));
  };

  const startEdit = (r: Rx) => {
    setFormError('');
    setEditingId(r.id);
    setDoctor(r.doctor_name);
    setPatient(r.patient_name);
    // الوصفة المربوطة سابقاً تظهر مربوطة، ويبقى الربط ما لم يتغير الاسم أو يُلغَ
    setLinked(r.patient_id ? { id: r.patient_id, name: r.patient_name } : null);
    pharmacistTouched.current = true;
    setPharmacist(r.pharmacist_name);
    setEntryDate(r.entry_date);
    setDrugs(r.prescription_items.length ? r.prescription_items.map(it => newRow(it.drug_name)) : [newRow()]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // فحص جديد من القاعدة لا الاعتماد على candidates: البحث المؤجَّل قد لا يكون انتهى عند الحفظ السريع،
  // وخطأ «لا يوجد ملف» لمريض مسجّل فعلاً أسوأ من عدم الاقتراح. أي فشل = لا اقتراح
  const suggestCreateIfMissing = async (rxId: string, name: string) => {
    const myId = ++suggestReqId.current;
    const pid = await getPharmacyId();
    if (myId !== suggestReqId.current || !pid) return;
    const { data, error } = await supabase
      .from('patients')
      .select('id')
      .eq('pharmacy_id', pid)
      .eq('name_normalized', normalizeAr(name))
      .limit(1);
    if (myId !== suggestReqId.current || error) return;
    if ((data || []).length === 0) setSuggest({ rxId, name, match: 'none', patientId: null });
  };

  // يظهر الشريط ما دامت الوصفة قائمة وغير مربوطة وباسمها المحفوظ في الشريط، ولا يظهر في وضع التعديل.
  // مشتق من list فيتحدّث تلقائياً بعد كل load() دون setState إضافي
  const suggestRx = suggest ? list.find(r => r.id === suggest.rxId) : undefined;
  const suggestVisible =
    suggest && !editingId && suggestRx && suggestRx.patient_id === null && suggestRx.patient_name === suggest.name
      ? suggest : null;
  const suggestRxId = suggestVisible?.rxId ?? null;
  const suggestNameVisible = suggestVisible?.name ?? null;

  // عودة التبويب للتركيز بعد إنشاء الملف في تبويب آخر: افحص من جديد ما دام الشريط ظاهراً
  useEffect(() => {
    if (!suggestRxId || !suggestNameVisible) return;
    const recheck = async () => {
      if (Date.now() - lastRecheckAt.current < 1000) return;
      lastRecheckAt.current = Date.now();
      const myId = ++recheckReqId.current;
      const pid = await getPharmacyId();
      if (myId !== recheckReqId.current || !pid) return;
      const { data, error } = await supabase
        .from('patients')
        .select('id')
        .eq('pharmacy_id', pid)
        .eq('name_normalized', normalizeAr(suggestNameVisible))
        .limit(2);
      if (myId !== recheckReqId.current || error) return;
      const rows = data || [];
      const match: Suggest['match'] = rows.length === 0 ? 'none' : rows.length === 1 ? 'one' : 'many';
      setSuggest(cur => (cur && cur.rxId === suggestRxId
        ? { ...cur, match, patientId: match === 'one' ? rows[0].id : null }
        : cur));
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void recheck(); };
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [suggestRxId, suggestNameVisible]);

  // ربط الوصفة بالملف عبر update_prescription بنفس بيانات الوصفة الحالية (البنود مرتبة بـ position من fetchPrescriptions)
  const linkSuggested = async () => {
    if (!suggestVisible || suggestVisible.match !== 'one' || !suggestVisible.patientId || !suggestRx) return;
    if (linkingRef.current) return;
    linkingRef.current = true;
    setLinking(true);
    try {
      const { error } = await supabase.rpc('update_prescription', {
        p_id: suggestRx.id,
        p_entry_date: suggestRx.entry_date,
        p_doctor: suggestRx.doctor_name,
        p_patient: suggestRx.patient_name,
        p_patient_id: suggestVisible.patientId,
        p_pharmacist: suggestRx.pharmacist_name,
        p_drugs: suggestRx.prescription_items.map(it => it.drug_name),
      });
      if (error) throw error;
      suggestReqId.current++;
      setSuggest(null);
      setNotice({ kind: 'ok', text: 'تم ربط الوصفة بملف المريض.' });
      await load();
    } catch (e) {
      // الرفض (مثلاً انتهى يوم الوصفة) يُعرض ويبقى الشريط
      setNotice({ kind: 'err', text: errText(e) });
    } finally {
      linkingRef.current = false;
      setLinking(false);
    }
  };

  const handleSave = async () => {
    if (savingRef.current) return;
    setFormError('');
    if (readOnly) { setFormError(READ_ONLY_MESSAGE); return; }
    const doctorV = doctor.trim();
    const pharmacistV = pharmacist.trim();
    const drugsV = drugs.map(r => r.value.trim()).filter(Boolean);
    const patientV = patient.trim();
    if (!doctorV) { setFormError('أدخل اسم الطبيب.'); return; }
    if (!patientV) { setFormError('أدخل اسم المريض.'); return; }
    if (!pharmacistV) { setFormError('أدخل اسم الصيدلاني.'); return; }
    if (!entryDate) { setFormError('أدخل تاريخاً صحيحاً بصيغة يوم/شهر/سنة.'); return; }
    if (entryDate > today || entryDate < minDate) {
      setFormError('تاريخ الوصفة يجب ألا يكون مستقبلياً ولا أقدم من 7 أيام.');
      return;
    }
    if (drugsV.length === 0) { setFormError('أضف دواءً واحداً على الأقل.'); return; }

    savingRef.current = true;
    setSaving(true);
    try {
      const params = {
        p_entry_date: entryDate,
        p_doctor: doctorV,
        p_patient: patientV,
        p_patient_id: linked?.id ?? null,
        p_pharmacist: pharmacistV,
        p_drugs: drugsV,
      };
      if (editingId) {
        const { error } = await supabase.rpc('update_prescription', { p_id: editingId, ...params });
        if (error) throw error;
        setNotice({ kind: 'ok', text: 'تم تحديث الوصفة.' });
        resetForm();
      } else {
        const rxId = crypto.randomUUID();
        const { error } = await supabase.rpc('create_prescription', { p_id: rxId, ...params });
        if (error) throw error;
        setNotice({ kind: 'ok', text: 'تم حفظ الوصفة.' });
        // الاقتراح السابق ينتهي بحفظ سجل جديد؛ والجديد يُقترح فقط إن لم تكن الوصفة مربوطة
        const wasLinked = !!linked;
        setSuggest(null);
        suggestReqId.current++;
        resetForm();
        if (!wasLinked) void suggestCreateIfMissing(rxId, patientV);
      }
      await load();
    } catch (e) {
      setFormError(errText(e));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleDelete = async (r: Rx) => {
    const ok = await confirm({
      title: 'حذف الوصفة؟',
      message: 'سيُحذف هذا السجل وأدويته نهائياً، ولا يمكن التراجع.',
      confirmText: 'حذف',
      destructive: true,
    });
    if (!ok) return;
    // select() بعد delete: RLS تُسقط الصف غير المسموح بصمت (صفر صفوف بلا خطأ)، فالفحص هنا يكشف الرفض
    const { data, error } = await supabase.from('prescriptions').delete().eq('id', r.id).select('id');
    if (error) { setNotice({ kind: 'err', text: errText(error) }); return; }
    if (!data || data.length === 0) {
      setNotice({ kind: 'err', text: 'لا يمكن حذف هذه الوصفة — الحذف متاح في يوم التسجيل فقط، لمن سجّلها أو للمالك.' });
      await load();
      return;
    }
    if (editingId === r.id) resetForm();
    setNotice({ kind: 'ok', text: 'تم حذف الوصفة.' });
    await load();
  };

  return (
    <div className="min-h-screen bg-slate-50/50 antialiased text-slate-900 pb-20" dir="rtl">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&display=swap');
        body { font-family: 'IBM Plex Sans Arabic', system-ui, sans-serif; }
        @keyframes saasFadeIn { from { opacity:0; } to { opacity:1; } }
        .saas-fade-in { animation: saasFadeIn 0.2s ease both; }
      `}</style>

      <DashboardHeader />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-12 space-y-6">

        {/* ── عنوان الصفحة ── */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">سجل الوصفات الطبية</h1>
          <p className="text-sm text-slate-500 mt-1">سجّل الوصفات التي صُرفت اليوم: الطبيب، المريض، الأدوية، والصيدلاني</p>
        </div>

        {/* ── النموذج ── */}
        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 sm:p-6 space-y-5">
          {editingId && (
            <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-2.5 text-sm font-bold">
              <span>أنت تعدّل وصفة مسجّلة</span>
              <button type="button" onClick={resetForm} className="underline underline-offset-2 hover:opacity-80 cursor-pointer">إلغاء التعديل</button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs font-bold text-slate-600 mb-1.5">اسم الطبيب <span className="text-rose-500">*</span></span>
              <input ref={doctorRef} type="text" dir="rtl" list="rx-doctors" maxLength={120} value={doctor}
                onChange={e => setDoctor(e.target.value)} placeholder="د. ..." className={INPUT} autoComplete="off" />
              <datalist id="rx-doctors">{doctorSuggestions.map(n => <option key={n} value={n} />)}</datalist>
            </label>

            <div>
              <label className="block">
                <span className="block text-xs font-bold text-slate-600 mb-1.5">اسم المريض <span className="text-rose-500">*</span></span>
                <input type="text" dir="rtl" maxLength={120} value={patient}
                  onChange={e => { setPatient(e.target.value); setLinked(null); }}
                  className={INPUT} autoComplete="off" />
              </label>
              <p className="mt-1.5 text-[11px] text-slate-400">ربط الوصفة بملف المريض اختياري</p>

              {linked && (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                  <span className="text-xs font-bold text-emerald-700">✓ مربوطة بملف المريض</span>
                  <a href={`/dashboard/patients/${linked.id}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 hover:text-teal-900 cursor-pointer">
                    فتح الملف
                    <IconOpen />
                  </a>
                  <button type="button" onClick={() => setLinked(null)}
                    className="text-[11px] font-bold text-slate-500 hover:text-rose-600 underline underline-offset-2 cursor-pointer">
                    إلغاء الربط
                  </button>
                </div>
              )}

              {candidates.length > 0 && (
                <div className="mt-2 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2.5 space-y-2">
                  <p className="text-xs font-bold text-teal-800">يوجد ملف مسجّل بهذا الاسم</p>
                  <ul className="space-y-1.5">
                    {candidates.map(c => (
                      <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <span className="text-[11px] text-slate-600 tabular-nums">
                          <bdi dir="ltr">{displayPhone(c.phone_number)}</bdi>
                          <span className="mx-1.5 text-slate-300">•</span>
                          <bdi dir="ltr">{formatIsoAsDmy(c.birth_date)}</bdi>
                        </span>
                        <button type="button" onClick={() => setLinked({ id: c.id, name: c.name })}
                          className="h-7 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold transition active:scale-95 cursor-pointer">
                          ربط بالملف
                        </button>
                        <a href={`/dashboard/patients/${c.id}`} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 hover:text-teal-900 cursor-pointer">
                          فتح الملف
                          <IconOpen />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <label className="block">
              <span className="block text-xs font-bold text-slate-600 mb-1.5">اسم الصيدلاني <span className="text-rose-500">*</span></span>
              <input type="text" dir="rtl" maxLength={120} value={pharmacist}
                onChange={e => { pharmacistTouched.current = true; setPharmacist(e.target.value); }}
                className={INPUT} autoComplete="off" />
            </label>

            <div>
              <span className="block text-xs font-bold text-slate-600 mb-1.5">تاريخ الوصفة <span className="text-rose-500">*</span></span>
              <DateField value={entryDate} onChange={setEntryDate} min={minDate} max={today} className={INPUT} />
              <p className="mt-1.5 text-[11px] text-slate-400">اليوم افتراضياً، ويُسمح بالرجوع حتى 7 أيام</p>
            </div>
          </div>

          {/* ── الأدوية ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-600">الأدوية <span className="text-rose-500">*</span></span>
              <span className="text-[11px] text-slate-400 tabular-nums">{drugs.length} / {MAX_DRUGS}</span>
            </div>
            <div className="space-y-2">
              {drugs.map((row, i) => (
                <div key={row.key} className="flex items-center gap-2">
                  <span className="w-6 text-center text-xs font-bold text-slate-400 tabular-nums shrink-0">{i + 1}</span>
                  <input
                    ref={el => { drugRefs.current[row.key] = el; }}
                    type="text" dir="rtl" list="rx-drugs" maxLength={150} value={row.value}
                    onChange={e => setDrugValue(row.key, e.target.value)}
                    onKeyDown={e => {
                      // Enter يفتح صف دواء جديداً بدل إرسال النموذج: أسرع للإدخال المتتابع
                      if (e.key === 'Enter') { e.preventDefault(); if (row.value.trim()) addDrug(); }
                    }}
                    placeholder="اسم الدواء" className={INPUT} autoComplete="off" />
                  <button type="button" onClick={() => removeDrug(row.key)} disabled={drugs.length <= 1}
                    aria-label="حذف الدواء"
                    className="h-11 w-11 shrink-0 flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
                    <IconTrash />
                  </button>
                </div>
              ))}
            </div>
            <datalist id="rx-drugs">{drugSuggestions.map(n => <option key={n} value={n} />)}</datalist>
            <button type="button" onClick={addDrug} disabled={drugs.length >= MAX_DRUGS}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-teal-700 hover:text-teal-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
              <IconPlus />
              دواء آخر
            </button>
          </div>

          {formError && (
            <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-2.5 text-sm font-bold">{formError}</div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button type="button" onClick={() => void handleSave()} disabled={saving || readOnly}
              title={readOnly ? READ_ONLY_MESSAGE : undefined} className={BTN_PRIMARY}>
              {saving ? 'جاري الحفظ...' : editingId ? 'حفظ التعديل' : 'حفظ الوصفة'}
            </button>
          </div>
        </section>

        {/* ── اقتراح إنشاء/ربط ملف مريض (لا إنشاء ولا ربط تلقائي) ── */}
        {suggestVisible && (
          <div role="status" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-teal-50 border border-teal-200 rounded-2xl px-5 py-3.5 saas-fade-in">
            <p className="text-sm font-bold text-teal-800">
              {suggestVisible.match === 'one' ? (
                <>تم إنشاء ملف المريض «<bdi>{suggestVisible.name}</bdi>». هل تربط الوصفة به؟</>
              ) : suggestVisible.match === 'many' ? (
                'يوجد أكثر من ملف بهذا الاسم، اربط الوصفة من زر التعديل لاختيار الملف الصحيح.'
              ) : (
                <>لا يوجد ملف مسجّل للمريض «<bdi>{suggestVisible.name}</bdi>». هل تريد إنشاءه؟</>
              )}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              {suggestVisible.match === 'none' && (
                <a href={`/dashboard/patients?new=${encodeURIComponent(suggestVisible.name)}`} target="_blank" rel="noopener noreferrer"
                  className="h-9 px-4 inline-flex items-center rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition active:scale-95 cursor-pointer">
                  إنشاء ملف المريض
                </a>
              )}
              {suggestVisible.match === 'one' && (
                <button type="button" onClick={() => void linkSuggested()} disabled={linking || readOnly}
                  title={readOnly ? READ_ONLY_MESSAGE : undefined}
                  className="h-9 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                  {linking ? 'جاري الربط...' : 'ربط الوصفة'}
                </button>
              )}
              <button type="button" onClick={() => { suggestReqId.current++; setSuggest(null); }}
                className="h-9 px-4 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold transition active:scale-95 cursor-pointer">
                إغلاق
              </button>
            </div>
          </div>
        )}

        {/* ── القائمة مجمّعة بالأيام ── */}
        <section className="space-y-5">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-12">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-teal-600 rounded-full animate-spin" />
              <p className="text-xs font-bold text-slate-500">جاري التحميل...</p>
            </div>
          ) : loadError ? (
            <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm font-bold">{loadError}</div>
          ) : groups.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-sm text-slate-500">
              لا توجد وصفات مسجّلة بعد. ابدأ بتسجيل أول وصفة من النموذج أعلاه.
            </div>
          ) : (
            <>
              {groups.map(([day, rows]) => (
                <div key={day} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-5 py-3 bg-slate-50 border-b border-slate-200">
                    <h2 className="text-sm font-bold text-slate-900">
                      {day === today ? 'اليوم — ' : day === shiftIso(today, -1) ? 'أمس — ' : ''}{formatDay(day)}
                    </h2>
                    <span className="text-xs font-bold text-slate-500 tabular-nums">{rows.length} {rows.length === 1 ? 'وصفة' : 'وصفات'}</span>
                  </div>

                  {/* رؤوس الأعمدة — سطح المكتب فقط */}
                  <div className="hidden md:grid grid-cols-[1.2fr_1.2fr_2fr_1fr_88px] gap-4 px-5 py-2 text-[11px] font-bold text-slate-400 border-b border-slate-100">
                    <span>اسم الطبيب</span><span>اسم المريض</span><span>الأدوية</span><span>الصيدلاني</span><span />
                  </div>

                  <ul className="divide-y divide-slate-100">
                    {rows.map(r => {
                      const late = r.entry_date !== ammanDay(r.created_at);
                      const editable = canEdit(r);
                      return (
                        <li key={r.id} className="px-5 py-3.5 md:grid md:grid-cols-[1.2fr_1.2fr_2fr_1fr_88px] md:gap-4 md:items-start space-y-2 md:space-y-0">
                          <div className="text-sm font-bold text-slate-900" dir="rtl">
                            <span className="md:hidden text-[11px] font-medium text-slate-400 block">الطبيب</span>
                            <bdi>{r.doctor_name}</bdi>
                          </div>
                          <div className="text-sm" dir="rtl">
                            <span className="md:hidden text-[11px] font-medium text-slate-400 block">المريض</span>
                            <bdi className="text-slate-800">{r.patient_name}</bdi>
                            {r.patient_id && (
                              <a href={`/dashboard/patients/${r.patient_id}`} target="_blank" rel="noopener noreferrer"
                                aria-label="فتح ملف المريض" className="inline-block ms-1.5 align-middle text-teal-600 hover:text-teal-800 cursor-pointer">
                                <IconOpen />
                              </a>
                            )}
                          </div>
                          <div>
                            <span className="md:hidden text-[11px] font-medium text-slate-400 block">الأدوية</span>
                            <ul className="space-y-0.5" dir="rtl">
                              {r.prescription_items.map(it => (
                                <li key={it.id} className="text-sm text-slate-700 flex gap-1.5">
                                  <span className="text-slate-300">•</span>
                                  <bdi>{it.drug_name}</bdi>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="text-sm text-slate-600" dir="rtl">
                            <span className="md:hidden text-[11px] font-medium text-slate-400 block">الصيدلاني</span>
                            <bdi>{r.pharmacist_name}</bdi>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] text-slate-400 tabular-nums">{formatTime(r.created_at)}</span>
                              {late && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">إدخال متأخر</span>
                              )}
                            </div>
                          </div>
                          <div className="flex md:justify-end items-center gap-1.5">
                            {editable && (
                              <>
                                <button type="button" onClick={() => startEdit(r)} aria-label="تعديل الوصفة"
                                  className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer">
                                  <IconPencil />
                                </button>
                                <button type="button" onClick={() => void handleDelete(r)} aria-label="حذف الوصفة"
                                  className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition cursor-pointer">
                                  <IconTrash />
                                </button>
                              </>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              {list.length >= LIST_LIMIT && (
                <p className="text-center text-xs text-slate-400">يُعرض آخر {LIST_LIMIT} وصفة فقط.</p>
              )}
            </>
          )}
        </section>
      </main>

      <Toast notice={notice} />
      {dialog}
      <AppFooter />
    </div>
  );
}
