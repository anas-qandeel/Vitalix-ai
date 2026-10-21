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
import { prepareRxFile, rxStoragePath, formatBytes, RX_BUCKET, RX_ACCEPT, type PreparedFile } from '@/lib/prescription-file';
import { useSubscriptionState, READ_ONLY_MESSAGE, friendlyError } from '@/lib/subscription-state';
import type { RowInput, CellDef, CellHookData } from 'jspdf-autotable';

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
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  file_mime: string | null;
}
// مرفق محفوظ فعلاً في التخزين وفي أعمدة file_* للوصفة
interface StoredFile { path: string; name: string; size: number; mime: string }
interface DrugRow { key: number; value: string }
// شريط اقتراح الملف مربوط بالوصفة (rxId) لا بالاسم وحده؛ match = نتيجة آخر فحص لملفات بنفس الاسم المطبّع
interface Suggest { rxId: string; name: string; match: 'none' | 'one' | 'many'; patientId: string | null }
// ملف مريض مطابق للاسم المكتوب؛ الهاتف وتاريخ الميلاد لتمييز الملفات المتشابهة
interface Candidate { id: string; name: string; phone_number: string; birth_date: string }

const MAX_DRUGS = 30;
const LIST_LIMIT = 1000;

type Period = 'today' | 'yesterday' | 'last7' | 'month' | 'custom';
const PERIODS: { v: Period; label: string }[] = [
  { v: 'today', label: 'اليوم' },
  { v: 'yesterday', label: 'أمس' },
  { v: 'last7', label: 'آخر 7 أيام' },
  { v: 'month', label: 'هذا الشهر' },
  { v: 'custom', label: 'مخصّص' },
];

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

/** حدود الفترة (شاملة) بتوقيت عمّان؛ null للمخصّص الناقص أو المقلوب */
function rangeFor(period: Period, today: string, customFrom: string, customTo: string): { from: string; to: string } | null {
  switch (period) {
    case 'today': return { from: today, to: today };
    case 'yesterday': { const y = shiftIso(today, -1); return { from: y, to: y }; }
    case 'last7': return { from: shiftIso(today, -6), to: today };
    case 'month': return { from: `${today.slice(0, 7)}-01`, to: today };
    default: return customFrom && customTo && customFrom <= customTo ? { from: customFrom, to: customTo } : null;
  }
}

/** مقاطع اليوم (الأربعاء، 21، أكتوبر، 2026) منفصلة بأرقام لاتينية، لرسمها مقطعاً مقطعاً في PDF */
function dayParts(iso: string): string[] {
  return new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', numberingSystem: 'latn' })
    .formatToParts(new Date(`${iso}T12:00:00`))
    .filter(p => p.type !== 'literal')
    .map(p => p.value);
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

const IconPaperclip = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" /></svg>
);
const IconDocument = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
);
const IconX = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
);
const IconDownload = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
);

const IconPrinter = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z" /></svg>
);

const INPUT = 'w-full h-11 px-3 text-sm bg-white border border-slate-200 rounded-xl focus:border-slate-900 focus:ring-1 focus:ring-slate-900 focus:outline-none transition text-right text-slate-900 placeholder:text-slate-400';
const BTN_SECONDARY = 'h-11 px-5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-sm font-bold transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';
const BTN_PRIMARY = 'h-11 px-6 bg-gradient-to-l from-slate-900 to-teal-800 hover:from-slate-800 hover:to-teal-700 text-white rounded-xl text-sm font-bold shadow-sm transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';

/** rows = null حين لا صيدلية للجلسة (لا شيء يُطبَّق على القائمة) */
async function fetchPrescriptions(from: string, to: string): Promise<{ rows: Rx[] | null; error: string | null }> {
  const pid = await getPharmacyId();
  if (!pid) return { rows: null, error: null };
  const { data, error } = await supabase
    .from('prescriptions')
    .select('id, entry_date, doctor_name, patient_name, patient_id, pharmacist_name, recorded_by, created_at, file_path, file_name, file_size, file_mime, prescription_items(id, drug_name, position)')
    .eq('pharmacy_id', pid)
    .gte('entry_date', from)
    .lte('entry_date', to)
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

/** يحمّل الصورة مسبقاً كي يظهر الفشل (رابط منتهٍ أو ملف مفقود) قبل فتح النافذة لا بعدها */
function preloadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('image load failed'));
    el.src = url;
  });
}

// ═══════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════
export default function PrescriptionsPage() {
  const { readOnly } = useSubscriptionState();
  const { pharmacistName, pharmacyName } = usePharmacyInfo();
  const { notice, setNotice } = useNotice();
  const { confirm, dialog } = useConfirm();

  // هوية المستخدم الحالي: تحدد من يرى أزرار التعديل والحذف (نفس شرط prescription_is_editable)
  const [staffId, setStaffId] = useState<string | null>(null);
  const [role, setRole] = useState('');
  const [staffName, setStaffName] = useState('');

  // ── القائمة ──
  const [list, setList] = useState<Rx[]>([]);
  // مفتاح الفترة التي تعرضها القائمة الآن؛ يختلف عن الفترة المطلوبة = جلب جارٍ (مشتق بدل setState داخل effect)
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  // كل ما جُلب في هذه الجلسة، لاقتراحات الأطباء والأدوية فقط (لا تضيق باختيار فترة قصيرة)
  const [pool, setPool] = useState<Map<string, Rx>>(() => new Map());
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

  // ── مرفق الوصفة ──
  const [attachment, setAttachment] = useState<{ prepared: PreparedFile; previewUrl: string | null } | null>(null);
  // عند التعديل: المرفق المحفوظ حالياً، وهل طُلبت إزالته عند الحفظ
  const [existingFile, setExistingFile] = useState<StoredFile | null>(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  // يُبطل تجهيز ملف سبقه اختيار أحدث
  const pickReqId = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // عرض المرفق: lightbox للصور، وحارس race لطلبات الرابط الموقّع
  const [lightbox, setLightbox] = useState<{ url: string; name: string; path: string } | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const signReqId = useRef(0);

  const today = ammanDay(new Date());
  const minDate = shiftIso(today, -7);
  const candidates = !linked && found && found.forKey === normalizeAr(patient) ? found.rows : [];

  // ── فلاتر القائمة ──
  const [period, setPeriod] = useState<Period>('last7');
  const [customFrom, setCustomFrom] = useState(() => shiftIso(ammanDay(new Date()), -6));
  const [customTo, setCustomTo] = useState(() => ammanDay(new Date()));
  const [search, setSearch] = useState('');
  const [fDoctor, setFDoctor] = useState('');
  const [fPharmacist, setFPharmacist] = useState('');
  const [fFile, setFFile] = useState<'all' | 'with' | 'without'>('all');
  const [fLink, setFLink] = useState<'all' | 'linked' | 'unlinked'>('all');
  const [exporting, setExporting] = useState(false);
  const exportingRef = useRef(false);
  const range = rangeFor(period, today, customFrom, customTo);
  const rangeFrom = range?.from ?? null;
  const rangeTo = range?.to ?? null;
  const rangeKey = range ? `${range.from}|${range.to}` : null;
  const loading = rangeKey !== null && loadedKey !== rangeKey;

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
  const applyResult = useCallback((myId: number, key: string, res: { rows: Rx[] | null; error: string | null }) => {
    if (myId !== loadReqId.current) return;
    if (res.error) {
      setLoadError(res.error);
    } else if (res.rows) {
      const rows = res.rows;
      setLoadError('');
      setList(rows);
      setPool(prev => {
        const next = new Map(prev);
        for (const r of rows) next.set(r.id, r);
        return next;
      });
    }
    setLoadedKey(key);
  }, []);

  // إعادة تحميل الفترة الحالية (بعد الحفظ والحذف والربط)
  const load = useCallback(async () => {
    if (!rangeFrom || !rangeTo) return;
    const myId = ++loadReqId.current;
    applyResult(myId, `${rangeFrom}|${rangeTo}`, await fetchPrescriptions(rangeFrom, rangeTo));
  }, [applyResult, rangeFrom, rangeTo]);

  // تغيّر الفترة = جلب جديد من القاعدة؛ الرد المتأخر لفترة سابقة يُبطله loadReqId
  useEffect(() => {
    if (!rangeFrom || !rangeTo) return;
    const myId = ++loadReqId.current;
    const key = `${rangeFrom}|${rangeTo}`;
    void fetchPrescriptions(rangeFrom, rangeTo).then(res => applyResult(myId, key, res));
  }, [applyResult, rangeFrom, rangeTo]);

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
    for (const r of pool.values()) {
      d.set(r.doctor_name, (d.get(r.doctor_name) ?? 0) + 1);
      for (const it of r.prescription_items) g.set(it.drug_name, (g.get(it.drug_name) ?? 0) + 1);
    }
    return { doctorSuggestions: rank(d), drugSuggestions: rank(g) };
  }, [pool]);

  // خيارا الطبيب والصيدلاني من الفترة المجلوبة؛ قيمة اختيار لم تعد موجودة بعد تغيير الفترة تُعامَل «الكل» (مشتق لا setState)
  const doctorOptions = useMemo(() => [...new Set(list.map(r => r.doctor_name))].sort((a, b) => a.localeCompare(b, 'ar')), [list]);
  const pharmacistOptions = useMemo(() => [...new Set(list.map(r => r.pharmacist_name))].sort((a, b) => a.localeCompare(b, 'ar')), [list]);
  const effDoctor = doctorOptions.includes(fDoctor) ? fDoctor : '';
  const effPharmacist = pharmacistOptions.includes(fPharmacist) ? fPharmacist : '';
  const hasActiveFilters = !!(search.trim() || effDoctor || effPharmacist || fFile !== 'all' || fLink !== 'all');

  // الفلاتر النصية والقوائم تُطبَّق في المتصفح على ما جُلب للفترة
  const filtered = useMemo(() => {
    const q = normalizeAr(search.trim());
    return list.filter(r => {
      if (effDoctor && r.doctor_name !== effDoctor) return false;
      if (effPharmacist && r.pharmacist_name !== effPharmacist) return false;
      if (fFile === 'with' && !r.file_path) return false;
      if (fFile === 'without' && r.file_path) return false;
      if (fLink === 'linked' && !r.patient_id) return false;
      if (fLink === 'unlinked' && r.patient_id) return false;
      if (q && !(
        normalizeAr(r.doctor_name).includes(q)
        || normalizeAr(r.patient_name).includes(q)
        || r.prescription_items.some(it => normalizeAr(it.drug_name).includes(q))
      )) return false;
      return true;
    });
  }, [list, search, effDoctor, effPharmacist, fFile, fLink]);

  const clearFilters = () => {
    setSearch('');
    setFDoctor('');
    setFPharmacist('');
    setFFile('all');
    setFLink('all');
  };

  const groups = useMemo(() => {
    const m = new Map<string, Rx[]>();
    for (const r of filtered) {
      const arr = m.get(r.entry_date);
      if (arr) arr.push(r); else m.set(r.entry_date, [r]);
    }
    return [...m.entries()];
  }, [filtered]);

  // تركيز آخر حقل دواء بعد إضافة صف
  useEffect(() => {
    if (!focusLastDrug.current) return;
    focusLastDrug.current = false;
    const last = drugs[drugs.length - 1];
    if (last) drugRefs.current[last.key]?.focus();
  }, [drugs]);

  const previewUrl = attachment?.previewUrl ?? null;
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lightbox]);

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
    pickReqId.current++;
    setPreparing(false);
    setAttachment(null);
    setExistingFile(null);
    setRemoveExisting(false);
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
    pickReqId.current++;
    setPreparing(false);
    setAttachment(null);
    setRemoveExisting(false);
    setExistingFile(r.file_path && r.file_name && r.file_size && r.file_mime
      ? { path: r.file_path, name: r.file_name, size: r.file_size, mime: r.file_mime } : null);
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

  // ── مرفق الوصفة: اختيار وتجهيز ──
  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFormError('');
    const myId = ++pickReqId.current;
    setPreparing(true);
    try {
      const prepared = await prepareRxFile(file);
      if (myId !== pickReqId.current) return;
      setAttachment({ prepared, previewUrl: prepared.mime.startsWith('image/') ? URL.createObjectURL(prepared.blob) : null });
    } catch (err) {
      if (myId === pickReqId.current) setFormError(err instanceof Error ? err.message : 'تعذّرت معالجة الملف.');
    } finally {
      if (myId === pickReqId.current) setPreparing(false);
    }
  };

  const removeAttachment = () => {
    pickReqId.current++;
    setPreparing(false);
    setAttachment(null);
  };

  // ── مرفق الوصفة: التخزين ──
  // حذف الكائن لا يُفشل العملية: الكائن اليتيم (بلا صف يشير إليه) يحق حذفه لاحقاً حسب سياسة التخزين
  const removeStored = async (path: string) => {
    try { await supabase.storage.from(RX_BUCKET).remove([path]); } catch { /* يتيم مسموح */ }
  };

  // قراءة file_path المخزَّن فعلاً: تحسم الحالة الغامضة (رد ضائع بعد نجاح الكتابة) قبل حذف أي ملف
  const readStoredPath = async (id: string): Promise<{ ok: boolean; exists: boolean; path: string | null }> => {
    const { data, error } = await supabase.from('prescriptions').select('file_path').eq('id', id).maybeSingle();
    if (error) return { ok: false, exists: false, path: null };
    return { ok: true, exists: !!data, path: data?.file_path ?? null };
  };

  // update_prescription لا تلمس أعمدة الملف، فتُحدَّث مباشرة (الأعمدة الأربعة معاً كما يشترط قيد الجدول)
  const applyFileColumns = async (id: string, f: StoredFile | null): Promise<boolean> => {
    const { data, error } = await supabase
      .from('prescriptions')
      .update({ file_path: f?.path ?? null, file_name: f?.name ?? null, file_size: f?.size ?? null, file_mime: f?.mime ?? null })
      .eq('id', id)
      .select('id');
    if (!error && data && data.length > 0) return true;
    const cur = await readStoredPath(id);
    return cur.ok && cur.exists && cur.path === (f?.path ?? null);
  };

  const uploadAttachment = async (pharmacyId: string, rxId: string): Promise<StoredFile | null> => {
    if (!attachment) return null;
    const { prepared } = attachment;
    const path = rxStoragePath(pharmacyId, rxId, prepared.mime);
    const { error } = await supabase.storage.from(RX_BUCKET).upload(path, prepared.blob, { contentType: prepared.mime, upsert: false });
    if (error) {
      setFormError('تعذّر رفع المرفق — تحقق من الاتصال وحاول مرة أخرى.');
      return null;
    }
    return { path, name: prepared.name, size: prepared.size, mime: prepared.mime };
  };

  // ── مرفق الوصفة: العرض ──
  const openAttachment = async (r: Rx) => {
    if (!r.file_path) return;
    const isPdf = r.file_mime === 'application/pdf';
    // تبويب PDF يُفتح فوراً داخل حدث النقر كي لا يحجبه المتصفح، ثم يُوجَّه للرابط بعد توقيعه
    const win = isPdf ? window.open('', '_blank') : null;
    const myId = ++signReqId.current;
    setOpeningId(r.id);
    try {
      const { data, error } = await supabase.storage.from(RX_BUCKET).createSignedUrl(r.file_path, 60);
      if (myId !== signReqId.current) { win?.close(); return; }
      if (error || !data?.signedUrl) {
        win?.close();
        setNotice({ kind: 'err', text: 'تعذّر عرض المرفق — قد يكون الملف غير موجود.' });
        return;
      }
      if (isPdf) {
        if (!win) {
          setNotice({ kind: 'err', text: 'منع المتصفح فتح تبويب جديد — اسمح بالنوافذ المنبثقة لهذا الموقع.' });
          return;
        }
        win.opener = null;
        win.location.href = data.signedUrl;
        return;
      }
      await preloadImage(data.signedUrl);
      if (myId !== signReqId.current) return;
      setLightbox({ url: data.signedUrl, name: r.file_name ?? 'وصفة', path: r.file_path });
    } catch {
      win?.close();
      if (myId === signReqId.current) setNotice({ kind: 'err', text: 'تعذّر عرض المرفق — قد يكون الملف غير موجود.' });
    } finally {
      if (myId === signReqId.current) setOpeningId(null);
    }
  };

  // رابط تحميل جديد عند الضغط: رابط المعاينة عمره 60 ثانية وقد يكون انتهى حين يضغط المستخدم
  const downloadAttachment = async () => {
    if (!lightbox || downloading) return;
    setDownloading(true);
    try {
      const { data, error } = await supabase.storage.from(RX_BUCKET).createSignedUrl(lightbox.path, 60, { download: lightbox.name });
      if (error || !data?.signedUrl) {
        setNotice({ kind: 'err', text: 'تعذّر تحميل المرفق، حاول مرة أخرى.' });
        return;
      }
      const a = document.createElement('a');
      a.href = data.signedUrl;
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setDownloading(false);
    }
  };

  // وصفة بتاريخ خارج الفترة المعروضة (إنشاءً أو تعديلاً) كانت ستغيب عن القائمة (ومعها شريط الاقتراح)؛ تُوسَّع الفترة لتشملها
  const ensureDateVisible = (date: string) => {
    if (rangeFrom && rangeTo && (date < rangeFrom || date > rangeTo)) {
      setPeriod('custom');
      setCustomFrom(date < rangeFrom ? date : rangeFrom);
      setCustomTo(date > rangeTo ? date : rangeTo);
    }
  };

  const handleSave = async () => {
    if (savingRef.current) return;
    setFormError('');
    if (readOnly) { setFormError(READ_ONLY_MESSAGE); return; }
    if (preparing) { setFormError('انتظر حتى ينتهي تجهيز الملف.'); return; }
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
        let uploaded: StoredFile | null = null;
        if (attachment) {
          const pid = await getPharmacyId();
          if (!pid) { setFormError('تعذّر تحديد الصيدلية، أعد تحميل الصفحة.'); return; }
          uploaded = await uploadAttachment(pid, editingId);
          if (!uploaded) return;
        }
        const { error } = await supabase.rpc('update_prescription', { p_id: editingId, ...params });
        if (error) {
          // الملف الجديد غير مشار إليه من أي صف بعد، فحذفه آمن مهما كان سبب الفشل
          if (uploaded) await removeStored(uploaded.path);
          throw error;
        }
        if (uploaded || (removeExisting && existingFile)) {
          const ok = await applyFileColumns(editingId, uploaded);
          if (!ok) {
            // الصف ما زال يشير للمرفق القديم (سليم)؛ الجديد غير مرتبط فيُحذف
            if (uploaded) await removeStored(uploaded.path);
            setFormError('حُفظت بيانات الوصفة، لكن تعذّر تحديث المرفق — أعد المحاولة من زر التعديل.');
            await load();
            return;
          }
          if (existingFile) await removeStored(existingFile.path);
        }
        setNotice({ kind: 'ok', text: 'تم تحديث الوصفة.' });
        resetForm();
        ensureDateVisible(entryDate);
      } else {
        const rxId = crypto.randomUUID();
        let uploaded: StoredFile | null = null;
        if (attachment) {
          const pid = await getPharmacyId();
          if (!pid) { setFormError('تعذّر تحديد الصيدلية، أعد تحميل الصفحة.'); return; }
          uploaded = await uploadAttachment(pid, rxId);
          if (!uploaded) return;
        }
        const { error } = await supabase.rpc('create_prescription', {
          p_id: rxId,
          ...params,
          ...(uploaded ? { p_file_path: uploaded.path, p_file_name: uploaded.name, p_file_size: uploaded.size, p_file_mime: uploaded.mime } : {}),
        });
        if (error && uploaded) {
          // رد ضائع بعد نجاح فعلي؟ إن وُجد الصف فالحفظ تم ولا يُحذف الملف (وإلا بقي سجل يشير إلى ملف مفقود)
          const cur = await readStoredPath(rxId);
          if (cur.ok && !cur.exists) { await removeStored(uploaded.path); throw error; }
          if (!(cur.ok && cur.exists)) throw error;
        } else if (error) {
          throw error;
        }
        setNotice({ kind: 'ok', text: 'تم حفظ الوصفة.' });
        // الاقتراح السابق ينتهي بحفظ سجل جديد؛ والجديد يُقترح فقط إن لم تكن الوصفة مربوطة
        const wasLinked = !!linked;
        setSuggest(null);
        suggestReqId.current++;
        resetForm();
        if (!wasLinked) void suggestCreateIfMissing(rxId, patientV);
        ensureDateVisible(entryDate);
      }
      await load();
    } catch (e) {
      setFormError(errText(e));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // ── PDF: النتائج المفلترة المعروضة، مجمّعة بالأيام، سطر لكل دواء ──
  const handleExportPdf = async () => {
    if (exportingRef.current || !rangeFrom || !rangeTo || filtered.length === 0) return;
    exportingRef.current = true;
    setExporting(true);
    try {
      const { createBrandedPdf, finishBrandedPdf, drawRtlParts, PDF_FONT, PDF_TOP, PDF_BOTTOM, PDF_MARGIN_X } = await import('@/lib/pdf-branding');
      const { pdf, autoTable } = await createBrandedPdf();

      // صف عنوان لكل يوم يُرسم مقاطعه يدوياً في didDrawCell (محتواه فارغ هنا)
      const dayRows = new Map<number, string[]>();
      const body: RowInput[] = [];
      // الورقة من الأقدم إلى الأحدث (الأيام ثم ترتيب التسجيل داخل اليوم) بنسخة محلية؛ ترتيب الشاشة (groups) لا يتغير
      const byDay = new Map<string, Rx[]>();
      for (const r of filtered) {
        const arr = byDay.get(r.entry_date);
        if (arr) arr.push(r); else byDay.set(r.entry_date, [r]);
      }
      const pdfGroups: [string, Rx[]][] = [...byDay.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([day, rows]): [string, Rx[]] => [day, [...rows].sort((x, y) => new Date(x.created_at).getTime() - new Date(y.created_at).getTime())]);
      // الوصفة كتلة واحدة: خلاياها المشتركة بـ rowSpan = عدد أدويتها في أول سطر، والأسطر التالية تحمل خلية الدواء وحدها
      // (autoTable يضعها تلقائياً في العمود التالي الحر). الترقيم متسلسل عبر الأيام، والتلوين يتناوب بين الوصفات
      let seq = 0;
      for (const [day, rows] of pdfGroups) {
        dayRows.set(body.length, dayParts(day));
        body.push([{ content: '', colSpan: 6, styles: { fillColor: [241, 245, 249] } }]);
        for (const r of rows) {
          seq += 1;
          const fill: [number, number, number] = seq % 2 ? [255, 255, 255] : [248, 250, 252];
          const drugs = r.prescription_items.length ? r.prescription_items.map(it => it.drug_name) : ['-'];
          const shared = (content: string): CellDef => ({ content, rowSpan: drugs.length, styles: { fillColor: fill } });
          drugs.forEach((drug, i) => {
            const drugCell: CellDef = { content: drug, styles: { fillColor: fill } };
            body.push(i === 0
              ? [shared(r.pharmacist_name), drugCell, shared(r.patient_name), shared(r.doctor_name), shared(formatIsoAsDmy(r.entry_date)), shared(String(seq))]
              : [drugCell]);
          });
        }
      }

      autoTable(pdf, {
        // الأعمدة من اليمين: م، التاريخ، الطبيب، المريض، الدواء، الصيدلاني (ترتيب المصفوفة من اليسار)
        head: [['اسم الصيدلاني', 'اسم الدواء', 'اسم المريض', 'اسم الطبيب', 'التاريخ', 'م']],
        body,
        startY: PDF_TOP,
        margin: { top: PDF_TOP, bottom: PDF_BOTTOM, left: PDF_MARGIN_X, right: PDF_MARGIN_X },
        // autoTable لا يقسم كتلة rowSpan بين صفحتين من تلقائه؛ 'avoid' يحمي الأسطر العادية أيضاً
        rowPageBreak: 'avoid',
        styles: { font: PDF_FONT, fontStyle: 'normal', fontSize: 8.5, halign: 'right', valign: 'middle', cellPadding: 2.2, textColor: [71, 85, 105], lineWidth: 0.1, lineColor: [226, 232, 240] },
        headStyles: { fillColor: [248, 250, 252], textColor: [51, 65, 85], fontStyle: 'normal', fontSize: 8.5, lineWidth: 0.1, lineColor: [203, 213, 225] },
        // المجموع 186 مم؛ عمود الرقم بحشو أصغر كي تتّسع أربع خانات (حتى 1000 وصفة) دون أن يتمدد العمود
        columnStyles: {
          0: { cellWidth: 26 }, 1: { cellWidth: 51 }, 2: { cellWidth: 36 }, 3: { cellWidth: 42 }, 4: { cellWidth: 22 },
          5: { cellWidth: 9, halign: 'center', cellPadding: 0.8, fontSize: 7.5 },
        },
        didDrawCell: (data: CellHookData) => {
          if (data.section !== 'body' || data.column.index !== 0) return;
          const parts = dayRows.get(data.row.index);
          if (!parts) return;
          pdf.setFont(PDF_FONT); pdf.setFontSize(9); pdf.setTextColor(15, 23, 42);
          drawRtlParts(pdf, parts, data.cell.x + data.cell.width - 3, data.cell.y + data.cell.height / 2 + 1.2);
        },
      });

      const dmy = (iso: string) => formatIsoAsDmy(iso);
      finishBrandedPdf(pdf, {
        pharmacyName: pharmacyName || 'صيدليتك',
        title: 'سجل الوصفات الطبية',
        periodParts: rangeFrom === rangeTo ? ['الفترة:', dmy(rangeFrom)] : ['الفترة:', 'من', dmy(rangeFrom), 'إلى', dmy(rangeTo)],
        countParts: ['عدد الوصفات:', String(filtered.length)],
        issueParts: ['تاريخ الإصدار:', dmy(today)],
      }, `سجل-الوصفات-${rangeFrom}${rangeFrom === rangeTo ? '' : `_${rangeTo}`}.pdf`);
    } catch (e) {
      console.error('[prescriptions] pdf failed:', e);
      setNotice({ kind: 'err', text: 'تعذّر إنشاء ملف PDF، حاول مرة أخرى.' });
    } finally {
      exportingRef.current = false;
      setExporting(false);
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
    // الصف أولاً ثم الملف: بعد حذف الصف يصير الملف يتيماً وتسمح السياسة بحذفه (وفشله لا يترك سجلاً يشير إليه)
    if (r.file_path) void removeStored(r.file_path);
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

          {/* ── مرفق الوصفة ── */}
          <div className="space-y-2">
            <input ref={fileInputRef} type="file" accept={RX_ACCEPT} className="hidden" onChange={e => void handleFilePick(e)} />
            {attachment ? (
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                {attachment.previewUrl ? (
                  <div role="img" aria-label="معاينة المرفق" className="w-12 h-12 rounded-lg border border-slate-200 bg-white bg-cover bg-center shrink-0"
                    style={{ backgroundImage: `url("${attachment.previewUrl}")` }} />
                ) : (
                  <div className="w-12 h-12 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-400 shrink-0"><IconDocument /></div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-800 truncate" dir="rtl"><bdi>{attachment.prepared.name}</bdi></p>
                  <p className="text-[11px] text-slate-400 tabular-nums"><bdi dir="ltr">{formatBytes(attachment.prepared.size)}</bdi></p>
                </div>
                <button type="button" onClick={removeAttachment}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-rose-600 cursor-pointer">
                  <IconX className="w-3.5 h-3.5" />
                  إزالة
                </button>
              </div>
            ) : existingFile && !removeExisting ? (
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <div className="w-12 h-12 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-400 shrink-0">
                  {existingFile.mime === 'application/pdf' ? <IconDocument /> : <IconPaperclip className="w-5 h-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-800 truncate" dir="rtl"><bdi>{existingFile.name}</bdi></p>
                  <p className="text-[11px] text-slate-400 tabular-nums"><bdi dir="ltr">{formatBytes(existingFile.size)}</bdi> · مرفق محفوظ</p>
                </div>
                <button type="button" onClick={() => setRemoveExisting(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-rose-600 cursor-pointer">
                  <IconX className="w-3.5 h-3.5" />
                  إزالة
                </button>
              </div>
            ) : existingFile && removeExisting ? (
              <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-3 py-2 text-xs font-bold">
                <span>سيُحذف المرفق الحالي عند الحفظ</span>
                <button type="button" onClick={() => setRemoveExisting(false)} className="underline underline-offset-2 hover:opacity-80 cursor-pointer">تراجع</button>
              </div>
            ) : null}
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={preparing || saving || readOnly}
              title={readOnly ? READ_ONLY_MESSAGE : undefined}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-teal-700 hover:text-teal-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
              <IconPaperclip />
              {preparing ? 'جاري تجهيز الملف...' : attachment || (existingFile && !removeExisting) ? 'استبدال المرفق' : 'إرفاق صورة الوصفة (اختياري)'}
            </button>
          </div>

          {formError && (
            <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-2.5 text-sm font-bold">{formError}</div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button type="button" onClick={() => void handleSave()} disabled={saving || readOnly || preparing}
              title={readOnly ? READ_ONLY_MESSAGE : undefined} className={BTN_PRIMARY}>
              {preparing ? 'جاري تجهيز الملف...' : saving ? 'جاري الحفظ...' : editingId ? 'حفظ التعديل' : 'حفظ الوصفة'}
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

        {/* ── فلاتر القائمة ── */}
        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="الفترة">
            {PERIODS.map(p => (
              <button key={p.v} type="button" onClick={() => setPeriod(p.v)} aria-pressed={period === p.v}
                className={`h-9 px-4 rounded-xl border text-xs font-bold transition active:scale-95 cursor-pointer ${
                  period === p.v ? 'bg-slate-900 border-slate-900 text-white' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}>
                {p.label}
              </button>
            ))}
          </div>

          {period === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="block text-xs font-bold text-slate-600 mb-1.5">من</span>
                <DateField value={customFrom} onChange={setCustomFrom} max={today} className={INPUT} />
              </div>
              <div>
                <span className="block text-xs font-bold text-slate-600 mb-1.5">إلى</span>
                <DateField value={customTo} onChange={setCustomTo} max={today} className={INPUT} />
              </div>
              {customFrom && customTo && customFrom > customTo && (
                <p className="sm:col-span-2 text-xs font-bold text-rose-600">تاريخ البداية بعد تاريخ النهاية.</p>
              )}
            </div>
          )}

          <input type="search" dir="rtl" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالطبيب أو المريض أو الدواء" className={INPUT} autoComplete="off" />

          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-3">
            <select value={effDoctor} onChange={e => setFDoctor(e.target.value)} className={INPUT} aria-label="الطبيب">
              <option value="">كل الأطباء</option>
              {doctorOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <select value={effPharmacist} onChange={e => setFPharmacist(e.target.value)} className={INPUT} aria-label="الصيدلاني">
              <option value="">كل الصيادلة</option>
              {pharmacistOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <select value={fFile} onChange={e => setFFile(e.target.value as 'all' | 'with' | 'without')} className={INPUT} aria-label="المرفق">
              <option value="all">مع مرفق وبلا مرفق</option>
              <option value="with">مع مرفق</option>
              <option value="without">بلا مرفق</option>
            </select>
            <select value={fLink} onChange={e => setFLink(e.target.value as 'all' | 'linked' | 'unlinked')} className={INPUT} aria-label="ربط الملف">
              <option value="all">مربوطة وغير مربوطة</option>
              <option value="linked">مربوطة بملف</option>
              <option value="unlinked">بلا ملف</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span className="font-bold tabular-nums">
                {filtered.length} {filtered.length === 1 ? 'وصفة' : 'وصفات'}{filtered.length !== list.length ? ` من ${list.length}` : ''}
              </span>
              {rangeFrom && rangeTo && (
                <span className="tabular-nums" dir="rtl">
                  {rangeFrom === rangeTo ? <bdi>{formatIsoAsDmy(rangeFrom)}</bdi> : <>من <bdi>{formatIsoAsDmy(rangeFrom)}</bdi> إلى <bdi>{formatIsoAsDmy(rangeTo)}</bdi></>}
                </span>
              )}
              {hasActiveFilters && (
                <button type="button" onClick={clearFilters} className="font-bold text-teal-700 hover:text-teal-900 underline underline-offset-2 cursor-pointer">
                  مسح الفلاتر
                </button>
              )}
            </div>
            <button type="button" onClick={() => void handleExportPdf()} disabled={exporting || loading || filtered.length === 0}
              className={`${BTN_SECONDARY} inline-flex items-center gap-2`}>
              <IconPrinter />
              {exporting ? 'جاري الإنشاء...' : 'طباعة / PDF'}
            </button>
          </div>
        </section>

        {/* ── القائمة مجمّعة بالأيام ── */}
        <section className="space-y-5">
          {!rangeKey ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-sm text-slate-500">
              حدّد تاريخ البداية والنهاية لعرض الوصفات.
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center gap-3 py-12">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-teal-600 rounded-full animate-spin" />
              <p className="text-xs font-bold text-slate-500">جاري التحميل...</p>
            </div>
          ) : loadError ? (
            <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm font-bold">{loadError}</div>
          ) : groups.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-sm text-slate-500">
              {list.length === 0 ? 'لا توجد وصفات في هذه الفترة.' : 'لا توجد وصفات تطابق الفلاتر المحددة.'}
            </div>
          ) : (
            <>
              {list.length >= LIST_LIMIT && (
                <div role="alert" className="bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-2.5 text-xs font-bold">
                  بلغ عدد الوصفات في هذه الفترة الحد الأقصى للعرض ({LIST_LIMIT} وصفة)، وقد توجد وصفات أقدم لم تظهر ولن تدخل ملف PDF — ضيّق الفترة للاطلاع عليها.
                </div>
              )}
              {groups.map(([day, rows]) => (
                <div key={day} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-5 py-3 bg-slate-50 border-b border-slate-200">
                    <h2 className="text-sm font-bold text-slate-900">
                      {day === today ? 'اليوم — ' : day === shiftIso(today, -1) ? 'أمس — ' : ''}{formatDay(day)}
                    </h2>
                    <span className="text-xs font-bold text-slate-500 tabular-nums">{rows.length} {rows.length === 1 ? 'وصفة' : 'وصفات'}</span>
                  </div>

                  {/* رؤوس الأعمدة — سطح المكتب فقط */}
                  <div className="hidden md:grid grid-cols-[1.2fr_1.2fr_2fr_1fr_124px] gap-4 px-5 py-2 text-[11px] font-bold text-slate-400 border-b border-slate-100">
                    <span>اسم الطبيب</span><span>اسم المريض</span><span>الأدوية</span><span>الصيدلاني</span><span />
                  </div>

                  <ul className="divide-y divide-slate-100">
                    {rows.map(r => {
                      const late = r.entry_date !== ammanDay(r.created_at);
                      const editable = canEdit(r);
                      return (
                        <li key={r.id} className="px-5 py-3.5 md:grid md:grid-cols-[1.2fr_1.2fr_2fr_1fr_124px] md:gap-4 md:items-start space-y-2 md:space-y-0">
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
                            {r.file_path && (
                              <button type="button" onClick={() => void openAttachment(r)} disabled={openingId === r.id}
                                aria-label="عرض مرفق الوصفة" title={r.file_name ?? undefined}
                                className="h-9 w-9 flex items-center justify-center rounded-xl border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 transition disabled:opacity-50 disabled:cursor-wait cursor-pointer">
                                <IconPaperclip />
                              </button>
                            )}
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
            </>
          )}
        </section>
      </main>

      {/* مكبّر صورة المرفق — في أعلى مستوى الصفحة كي لا تحبسه حاوية البطاقة */}
      {lightbox && (
        <div className="fixed inset-0 z-[70] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 saas-fade-in"
          onClick={() => setLightbox(null)} role="dialog" aria-modal="true" aria-label="معاينة مرفق الوصفة">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200">
              <span className="text-sm font-bold text-slate-800 truncate" dir="rtl"><bdi>{lightbox.name}</bdi></span>
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" onClick={() => void downloadAttachment()} disabled={downloading}
                  className="h-9 px-4 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                  <IconDownload />
                  {downloading ? 'جاري التحميل...' : 'تحميل'}
                </button>
                <button type="button" onClick={() => setLightbox(null)} aria-label="إغلاق"
                  className="h-9 w-9 flex items-center justify-center rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 transition cursor-pointer">
                  <IconX />
                </button>
              </div>
            </div>
            <div role="img" aria-label={lightbox.name} className="h-[70vh] bg-slate-100 bg-contain bg-center bg-no-repeat"
              style={{ backgroundImage: `url("${lightbox.url}")` }} />
          </div>
        </div>
      )}

      <Toast notice={notice} />
      {dialog}
      <AppFooter />
    </div>
  );
}
