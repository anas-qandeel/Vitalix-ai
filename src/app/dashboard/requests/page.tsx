'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import DashboardHeader, { usePharmacyInfo } from '../components/DashboardHeader';
import AppFooter from '../../components/AppFooter';
import Toast, { useNotice } from '@/components/Toast';
import AddPatientForm, { NewPatient } from '@/components/AddPatientForm';
import { getPharmacyId } from '@/lib/tenant';
import { normalizeAr } from '@/lib/arabic';
import { displayPhone, normalizePhone, toLatinDigits } from '@/lib/phone';
import { calendarDaysSince } from '@/lib/calendar-days';
import { getOverdueReasons, getExpectedChipLabel, notifyRequestsChanged, REQUESTS_CHANGED_EVENT } from '@/lib/request-overdue';
import { fetchProductStats, isFrequent, type ProductStat } from '@/lib/frequent-products';
import RequestDetailsModal from './RequestDetailsModal';
import ProductNameInput, { ProductHint } from './ProductNameInput';
import FrequentProductsPanel from './FrequentProductsPanel';
import RequestStatsPanel from './RequestStatsPanel';
import { CLOSED_WINDOW_DAYS, closedWindowStartIso, RequestRow, ItemStage, PatientMessageKind, STATUS_META, STAGE_META, requestTitle, isPendingRefund, fmtJd, paidTotal, remainingAmount, MONEY_RE, cleanNumberInput, INPUT_BASE, INPUT_CLS } from './shared';
import { friendlyError, READ_ONLY_MESSAGE, useSubscriptionState } from '@/lib/subscription-state';
import { Plus, MagnifyingGlass, Phone, Package, Clock, UserCircle, X, Notebook, UserPlus, ArrowsClockwise, WarningCircle } from '@phosphor-icons/react';

// ═══════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════
type Tab = 'open' | 'closed' | 'stock' | 'stats';

interface PickedPatient { id: string; name: string; phone_number: string }

// مرشحات PostgREST (شجرة or/and): المفتوحة = open أو ملغى بعربون لم يُعَد؛ المغلقة = مسلَّم أو ملغى ليس كذلك
// RLS تعزل الصيدلية؛ العمود المرتبط بالموظف والمريض عبر اسم القيد صراحةً
const REQUEST_SELECT = 'id, request_number, request_year, price, deposit, deposit_returned, status, created_at, delivered_at, cancelled_at, updated_at, patient:patients(name, phone_number), creator:pharmacy_staff!patient_requests_created_by_fkey(name), items:patient_request_items(id, product_name, quantity, supplier, stage, ordered_at, arrived_at, delivered_at, cancelled_at, cancel_reason, stage_changed_at), payments:patient_request_payments(amount)';

// حقول حساب التأخر فقط (استعلام خفيف على كل الطلبات المفتوحة)
const OVERDUE_SELECT = 'id, status, deposit, deposit_returned, cancelled_at, items:patient_request_items(stage, stage_changed_at)';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const OPEN_FILTER = 'status.eq.open,and(status.eq.cancelled,deposit.gt.0,deposit_returned.eq.false)';
const CLOSED_FILTER = 'status.eq.delivered,and(status.eq.cancelled,or(deposit.is.null,deposit.lte.0,deposit_returned.eq.true))';
// تسميات مختصرة لسطر التقدّم في بطاقة الطلب المفتوح
const PROGRESS_ORDER: { stage: ItemStage; label: string }[] = [
  { stage: 'delivered', label: 'سُلّم' },
  { stage: 'arrived', label: 'وصل' },
  { stage: 'ordered', label: 'طُلب' },
  { stage: 'recorded', label: 'مسجّل' },
];
// الافتراضي: كل ما أُغلق في النافذة (حتى 200)؛ البحث يتجاوز النافذة ويكتفي بـ 50 نتيجة
const CLOSED_WINDOW_LIMIT = 200;
const CLOSED_SEARCH_LIMIT = 50;
const SEARCH_DEBOUNCE_MS = 300;

// حقل الاستعلام للبحث بالمريض: inner join على المريض بالاسم الحقيقي للجدول (يُرشَّح عليه patients.col)، ثم نعيد تسميته patient
const PATIENT_EMBED = 'patient:patients(name, phone_number)';
const PATIENT_INNER_EMBED = 'patients!inner(name, phone_number)';

type ClosedSearch =
  | { kind: 'number'; number: number; year?: number }
  | { kind: 'phone'; term: string }
  | { kind: 'name'; term: string };

// null = لا بحث (نافذة آخر 30 يوماً)؛ 'short' = حرف واحد غير رقمي، لا يُطلق استعلام
function parseClosedSearch(raw: string): ClosedSearch | 'short' | null {
  const t = toLatinDigits(raw).trim();
  if (!t) return null;
  const full = /^(\d{1,9})\/(\d{4})$/.exec(t);
  if (full) return { kind: 'number', number: Number(full[1]), year: Number(full[2]) };
  if (/^\d+$/.test(t)) {
    if (t.length <= 4) return { kind: 'number', number: Number(t) };
    // نفس منطق بحث الهاتف في صفحة الفحوصات: تطبيع ثم حذف مفتاح الدولة، ونحذف الصفر البادئ أيضاً لأن المخزّن إما 962... أو 07...
    const n = normalizePhone(t);
    return { kind: 'phone', term: (n.startsWith('962') ? n.slice(3) : n).replace(/^0+/, '') };
  }
  if (t.length < 2) return 'short';
  // % و_ و\\ محارف بحث خاصة في ilike، فلا تُمرَّر كما هي
  return { kind: 'name', term: normalizeAr(t).replace(/[%_\\]/g, '') };
}
const MAX_ITEMS = 30;
// أسطر أسباب التأخر الظاهرة في بطاقة القائمة؛ الباقي يُلخَّص بسطر «و N غيرها» (النافذة تعرض الكل)
const MAX_CARD_REASONS = 3;

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════
function daysAgoLabel(iso: string): string {
  const d = Math.max(0, calendarDaysSince(iso));
  if (d === 0) return 'اليوم';
  if (d === 1) return 'منذ يوم واحد';
  if (d === 2) return 'منذ يومين';
  if (d <= 10) return `منذ ${d} أيام`;
  return `منذ ${d} يوماً`;
}

// أخطاء القاعدة إلى رسائل عربية مفهومة؛ نص الخطأ الخام لا يُعرض للمستخدم أبداً
function mapSaveError(err: { message?: string; details?: string } | null | undefined): string {
  const text = `${err?.message ?? ''} ${err?.details ?? ''}`;
  if (/SUBSCRIPTION_READ_ONLY/.test(text)) return friendlyError(err);
  if (/PATIENT_MISMATCH/.test(text)) return 'هذا المريض غير تابع لصيدليتك. اختر المريض من جديد.';
  if (/patient_requests_deposit_le_price/.test(text)) return 'لا يمكن أن يزيد العربون على السعر.';
  if (/ITEMS_REQUIRED/.test(text)) return `أضف صنفاً واحداً على الأقل، وحتى ${MAX_ITEMS} صنفاً في الطلب الواحد.`;
  if (/patient_request_items_quantity_check/.test(text)) return 'الكمية يجب أن تكون 1 أو أكثر.';
  if (/patient_request_items_product_name_check/.test(text)) return 'اسم كل صنف مطلوب ولا يتجاوز 200 حرف.';
  if (/patient_request_items_supplier_check/.test(text)) return 'اسم المورد لا يتجاوز 100 حرف.';
  if (/patient_requests_(price|deposit)_check/.test(text)) return 'السعر والعربون لا يمكن أن يكونا بالسالب.';
  if (/row-level security/i.test(text)) return 'تعذّر التحقق من هويتك كموظف. سجّل الدخول من جديد ثم أعد المحاولة.';
  return 'تعذّر حفظ الطلب. تحقّق من اتصالك ثم حاول مرة أخرى.';
}

// ═══════════════════════════════════════════════════════
// REQUEST CARD
// ═══════════════════════════════════════════════════════
function RequestCard({ row, onOpen }: { row: RequestRow; onOpen: () => void }) {
  const pendingRefund = isPendingRefund(row);
  const cancelled = row.status === 'cancelled';
  const meta = STATUS_META[row.status];
  const hasPrice = row.price != null;
  const hasDeposit = row.deposit != null;
  const paid = paidTotal(row.payments);
  const overdue = getOverdueReasons(row);
  const expectedLabel = (it: RequestRow['items'][number]) => getExpectedChipLabel(it);

  // سطر التقدّم للطلب المفتوح: الأعداد غير الصفرية لأصناف غير ملغاة
  const live = row.items.filter(it => it.stage !== 'cancelled');
  const progress = PROGRESS_ORDER
    .map(p => ({ label: p.label, n: live.filter(it => it.stage === p.stage).length }))
    .filter(p => p.n > 0);

  return (
    <div role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className={`bg-white border rounded-2xl shadow-sm hover:shadow-md transition-all p-4 sm:p-5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-slate-900 ${overdue.length > 0 ? 'border-rose-300' : 'border-slate-200'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-black text-slate-900 tabular-nums">{requestTitle(row.request_number, row.request_year)}</p>
          <p className="text-sm font-bold text-slate-900 truncate mt-0.5"><bdi>{row.patient?.name ?? 'مريض غير معروف'}</bdi></p>
          {row.patient?.phone_number && (
            <p className="flex items-center gap-1 mt-0.5 text-xs text-slate-500">
              <Phone size={14} weight="bold" className="shrink-0 text-slate-400" aria-hidden="true" />
              <span dir="ltr" className="tabular-nums">{displayPhone(row.patient.phone_number)}</span>
            </p>
          )}
        </div>
        <span className={`inline-flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold border ${meta.badge}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
          {pendingRefund ? 'ملغى — العربون لم يُعَد' : meta.label}
        </span>
      </div>

      {overdue.length > 0 && (
        <div className="mt-2 space-y-1">
          {overdue.slice(0, MAX_CARD_REASONS).map(r => (
            <p key={`${r.type}|${r.detail}`} className="flex items-start gap-1.5 text-xs font-bold text-rose-700">
              <WarningCircle size={14} weight="bold" className="shrink-0 mt-0.5" aria-hidden="true" />
              <span className="min-w-0 break-words">{r.label}</span>
            </p>
          ))}
          {overdue.length > MAX_CARD_REASONS && (
            <p className="text-xs text-slate-500">و {overdue.length - MAX_CARD_REASONS} غيرها</p>
          )}
        </div>
      )}

      {row.status === 'open' && progress.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          {progress.map((p, i) => (
            <span key={p.label}>{i > 0 && ' · '}{p.label} <span className="tabular-nums">{p.n}</span></span>
          ))}
        </p>
      )}

      {row.items.length > 0 && (
        <div className="mt-3 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 space-y-1.5">
          {row.items.map(it => (
            <div key={it.id} className="flex items-start gap-2">
              <Package size={16} weight="bold" className="shrink-0 mt-0.5 text-slate-400" aria-hidden="true" />
              <p className={`text-sm min-w-0 flex-1 break-words ${it.stage === 'cancelled' ? 'line-through text-slate-400 font-medium' : 'font-semibold text-slate-800'}`}>
                <bdi>{it.product_name}</bdi> × <span className="tabular-nums">{it.quantity}</span>
                {it.supplier && <span className="text-slate-400 font-medium"> · <bdi>{it.supplier}</bdi></span>}
              </p>
              <div className="shrink-0 flex flex-col items-end gap-1">
                <span className={`text-[10px] font-bold border rounded-full px-1.5 py-0.5 ${STAGE_META[it.stage].chip}`}>{STAGE_META[it.stage].label}</span>
                {expectedLabel(it) && (
                  <span className="text-[10px] font-medium text-slate-500 bg-white border border-slate-200 rounded-full px-1.5 py-0.5">{expectedLabel(it)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {(hasPrice || hasDeposit || paid > 0) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {hasPrice && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs text-slate-600">
              السعر الإجمالي <span className="font-bold text-slate-900 tabular-nums" dir="ltr">{fmtJd(row.price as number)}</span> د.أ
            </span>
          )}
          {hasDeposit && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs text-slate-600">
              العربون <span className="font-bold text-slate-900 tabular-nums" dir="ltr">{fmtJd(row.deposit as number)}</span> د.أ
            </span>
          )}
          {paid > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs text-slate-600">
              المدفوع <span className="font-bold text-slate-900 tabular-nums" dir="ltr">{fmtJd(paid)}</span> د.أ
            </span>
          )}
          {/* الطلب الملغى لا «متبقي» له: نعرض حالة العربون بدلاً منه */}
          {!cancelled && hasPrice && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-200 text-xs text-teal-700">
              المتبقي <span className="font-bold tabular-nums" dir="ltr">{fmtJd(remainingAmount(row.price as number, row.deposit, paid))}</span> د.أ
            </span>
          )}
          {cancelled && Number(row.deposit ?? 0) > 0 && (row.deposit_returned === false ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
              عربون بانتظار الإرجاع <span className="font-bold tabular-nums" dir="ltr">{fmtJd(row.deposit as number)}</span> د.أ
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500">
              أُعيد العربون <span className="font-bold tabular-nums" dir="ltr">{fmtJd(row.deposit as number)}</span> د.أ
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <Clock size={14} weight="bold" className="shrink-0 text-slate-400" aria-hidden="true" />
          {daysAgoLabel(row.created_at)}
        </span>
        {row.creator?.name && (
          <span className="inline-flex items-center gap-1 min-w-0">
            <UserCircle size={14} weight="bold" className="shrink-0 text-slate-400" aria-hidden="true" />
            <span className="truncate">سجّله <bdi>{row.creator.name}</bdi></span>
          </span>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// NEW REQUEST MODAL
// ═══════════════════════════════════════════════════════
function NewRequestModal({ pharmacyId, patient, onPatientChange, onNeedNewPatient, onClose, onSaved, notify, productStats }: {
  pharmacyId: string;
  productStats: ProductStat[];
  patient: PickedPatient | null;
  onPatientChange: (p: PickedPatient | null) => void;
  onNeedNewPatient: (prefill: { name?: string; phone_number?: string }) => void;
  onClose: () => void;
  onSaved: (requestId: string | null) => void;
  notify: (kind: 'ok' | 'err', text: string) => void;
}) {
  const { readOnly } = useSubscriptionState();

  // ── بحث المريض ──
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickedPatient[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const searchSeq = useRef(0);

  // ── بيانات الطلب ──
  // البنود: مفتاح ثابت لكل صف حتى لا تنتقل القيم بين الصفوف عند الحذف
  const [items, setItems] = useState<{ key: number; name: string; qty: string; supplier: string }[]>([{ key: 0, name: '', qty: '1', supplier: '' }]);
  const nextItemKey = useRef(1);
  const [price, setPrice] = useState('');
  const [deposit, setDeposit] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (highlightedIdx < 0) return;
    document.querySelector(`[data-request-result="${highlightedIdx}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIdx]);

  // بحث عند الطلب لا تحميل مسبق لقائمة المرضى — نفس نمط صفحة الفحوصات.
  // رقم التسلسل يتجاهل الردود المتأخرة حين يكتب الموظف أسرع من الشبكة
  const handleSearch = async (raw: string) => {
    let value = toLatinDigits(raw);
    if (/^[0-9+]/.test(value.trim())) value = value.replace(/[\s-]/g, '');
    setQuery(value);
    setResults([]);
    setHighlightedIdx(-1);
    setSearched(false);
    const seq = ++searchSeq.current;

    const trimmed = value.trim();
    if (!trimmed) { setSearching(false); return; }
    const isPhone = /^[0-9+]/.test(trimmed);
    if (isPhone ? trimmed.replace(/\D/g, '').length < 8 : trimmed.length < 2) { setSearching(false); return; }

    setSearching(true);
    try {
      let q = supabase.from('patients').select('id, name, phone_number').eq('pharmacy_id', pharmacyId);
      if (isPhone) {
        // بعض الأرقام مخزّنة بالصيغة المحلية القديمة (07...) وبعضها E.164 — نطابق على الجزء المشترك
        const norm = normalizePhone(trimmed);
        q = q.ilike('phone_number', `%${norm.startsWith('962') ? norm.slice(3) : norm}%`);
      } else {
        q = q.ilike('name_normalized', `%${normalizeAr(trimmed)}%`);
      }
      const { data, error } = await q.limit(20);
      if (seq !== searchSeq.current) return;
      if (error) { notify('err', 'تعذّر البحث عن المريض. حاول مرة أخرى.'); return; }
      const list = (data || []) as PickedPatient[];
      setResults(list);
      setSearched(true);
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  };

  const pick = (p: PickedPatient) => {
    onPatientChange(p);
    setResults([]);
    setQuery('');
    setSearched(false);
    setHighlightedIdx(-1);
  };

  const addItem = () => {
    // الصف الجديد يرث مورد الصف السابق (قابل للتغيير): الأصناف المتتالية غالباً من المورد نفسه
    setItems(prev => prev.length >= MAX_ITEMS ? prev : [...prev, { key: nextItemKey.current++, name: '', qty: '1', supplier: prev[prev.length - 1].supplier }]);
  };
  const updateItem = (key: number, patch: Partial<{ name: string; qty: string; supplier: string }>) => {
    setItems(prev => prev.map(it => it.key === key ? { ...it, ...patch } : it));
  };
  const removeItem = (key: number) => {
    setItems(prev => prev.length > 1 ? prev.filter(it => it.key !== key) : prev);
  };

  // الصفوف ذات الاسم الفارغ تُتجاهل عند الحفظ
  const filledItems = () => items.filter(it => it.name.trim());

  const validate = (): string | null => {
    if (!patient) return 'اختر المريض أولاً.';
    const filled = filledItems();
    if (filled.length === 0) return 'أضف صنفاً واحداً على الأقل.';
    for (const it of filled) {
      if (it.name.trim().length > 200) return 'اسم الصنف لا يتجاوز 200 حرف.';
      if (it.supplier.trim().length > 100) return 'اسم المورد لا يتجاوز 100 حرف.';
      const qty = cleanNumberInput(it.qty);
      if (!/^\d{1,6}$/.test(qty) || Number(qty) < 1) return `كمية «${it.name.trim()}» يجب أن تكون عدداً صحيحاً 1 أو أكثر.`;
    }
    const p = cleanNumberInput(price);
    const d = cleanNumberInput(deposit);
    if (p && !MONEY_RE.test(p)) return 'السعر غير صالح — أرقام فقط وحتى 3 منازل عشرية.';
    if (d && !MONEY_RE.test(d)) return 'العربون غير صالح — أرقام فقط وحتى 3 منازل عشرية.';
    if (p && d && Number(d) > Number(p)) return 'لا يمكن أن يزيد العربون على السعر.';
    if (note.trim().length > 1000) return 'الملاحظة لا تتجاوز 1000 حرف.';
    return null;
  };

  const save = async () => {
    if (saving) return;
    if (readOnly) { notify('err', READ_ONLY_MESSAGE); return; }
    const problem = validate();
    if (problem) { notify('err', problem); return; }
    if (!patient) return;

    const p = cleanNumberInput(price);
    const d = cleanNumberInput(deposit);
    setSaving(true);
    try {
      // استدعاء واحد ذرّي: الطلب وبنوده وملاحظته الأولى في معاملة واحدة؛
      // الصيدلية والحالة والموظف والتواقيت كلها تضبطها القاعدة
      const { data: newId, error } = await supabase.rpc('create_patient_request', {
        p_patient_id: patient.id,
        p_items: filledItems().map(it => ({
          product_name: it.name.trim(),
          quantity: Number(cleanNumberInput(it.qty)),
          supplier: it.supplier.trim() || null,
        })),
        p_price: p ? Number(p) : null,
        p_deposit: d ? Number(d) : null,
        p_note: note.trim() || null,
      });

      if (error) { notify('err', mapSaveError(error)); return; }
      onSaved(typeof newId === 'string' ? newId : null);
    } catch {
      notify('err', 'تعذّر حفظ الطلب. تحقّق من اتصالك ثم حاول مرة أخرى.');
    } finally {
      setSaving(false);
    }
  };

  const showNewPatientBtn = !patient && searched && !searching && results.length === 0 && query.trim().length > 0;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[92dvh] sm:max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 saas-slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <h3 className="text-sm font-bold text-slate-900">طلب جديد</h3>
          <button type="button" onClick={onClose} aria-label="إغلاق"
            className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-colors cursor-pointer">
            <X size={16} weight="bold" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* ── الخطوة 1: المريض ── */}
          <div>
            <p className="text-xs font-bold text-slate-600 mb-1.5">1. المريض</p>

            {patient ? (
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3">
                <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-sm font-bold text-slate-700 shrink-0">
                  {patient.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate"><bdi>{patient.name}</bdi></p>
                  <p dir="ltr" className="text-xs text-slate-500 tabular-nums text-right">{displayPhone(patient.phone_number)}</p>
                </div>
                <button type="button" onClick={() => onPatientChange(null)}
                  className="text-xs font-bold text-slate-500 hover:text-slate-900 px-2 py-1 transition-colors cursor-pointer">
                  تغيير
                </button>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <MagnifyingGlass size={16} weight="bold" className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" aria-hidden="true" />
                  <input type="text" value={query} onChange={e => handleSearch(e.target.value)}
                    onKeyDown={e => {
                      if (!results.length) return;
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setHighlightedIdx(i => Math.min(i + 1, results.length - 1));
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setHighlightedIdx(i => Math.max(i - 1, 0));
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        // أمان المريض: بلا تحديد، Enter يُظلّل الأول فقط ليراه الموظف؛ الضغطة التالية تختاره
                        if (highlightedIdx < 0) { setHighlightedIdx(0); return; }
                        const target = results[highlightedIdx];
                        if (target) pick(target);
                      } else if (e.key === 'Escape') {
                        setResults([]);
                        setHighlightedIdx(-1);
                      }
                    }}
                    placeholder="ابحث بالاسم أو رقم الهاتف" autoFocus
                    className={`${INPUT_CLS} pr-10 pl-9`} />
                  {searching && <div className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />}
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">للأرقام خارج الأردن ابدأ بمفتاح الدولة — مثال: 00966501234567</p>

                {results.length > 0 && (
                  <div className="mt-2 rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
                      <p className="text-[11px] font-semibold text-slate-500"><span className="tabular-nums">{results.length}</span> نتيجة — اختر المريض وتحقّق من رقم الهاتف</p>
                    </div>
                    <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                      {results.map((r, idx) => (
                        <button key={r.id} type="button" data-request-result={idx}
                          onClick={() => pick(r)} onMouseEnter={() => setHighlightedIdx(idx)}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-right transition-colors cursor-pointer ${idx === highlightedIdx ? 'bg-teal-50' : 'hover:bg-slate-50'}`}>
                          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">
                            {r.name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate"><bdi>{r.name}</bdi></p>
                            <p dir="ltr" className="text-xs text-slate-500 tabular-nums text-right">{displayPhone(r.phone_number)}</p>
                          </div>
                          {idx === highlightedIdx && (
                            <span className="text-[10px] font-bold text-teal-600 bg-teal-100 px-2 py-0.5 rounded-md shrink-0">Enter ↵</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {showNewPatientBtn && (
                  <div className="mt-2">
                    <p className="text-xs text-slate-500 mb-2">لم يُعثر على مريض مطابق. يمكنك تسجيله الآن ومتابعة الطلب.</p>
                    <button type="button" disabled={readOnly} title={readOnly ? READ_ONLY_MESSAGE : undefined}
                      onClick={() => {
                        const q = query.trim();
                        onNeedNewPatient(/^[0-9+]/.test(q) ? { phone_number: q } : { name: q });
                      }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-50 border border-dashed border-slate-300 hover:border-slate-900 hover:bg-white rounded-xl text-sm font-bold text-slate-900 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                      <UserPlus size={16} weight="bold" aria-hidden="true" />
                      تسجيل مريض جديد
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── الخطوة 2: الطلب ── */}
          {patient && (
            <div className="space-y-4">
              <p className="text-xs font-bold text-slate-600">2. الطلب</p>

              <div>
                <p className="block text-xs font-bold text-slate-600 mb-1.5">الأصناف المطلوبة</p>
                <div className="flex items-center gap-2 mb-1 text-[11px] text-slate-400">
                  <span className="flex-1 min-w-0">الصنف</span>
                  <span className="hidden sm:block w-32 shrink-0">المورد</span>
                  <span className="w-20 shrink-0 text-center">الكمية</span>
                  {items.length > 1 && <span className="w-9 shrink-0" aria-hidden="true" />}
                </div>
                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div key={it.key}>
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                      {/* autoFocus على كل صف عند ظهوره: الصف الجديد (بالزر أو Enter) يستقبل التركيز مباشرة */}
                      <ProductNameInput value={it.name} onChange={name => updateItem(it.key, { name })}
                        onEnter={() => { if (idx === items.length - 1 && it.name.trim()) addItem(); }}
                        stats={productStats} ariaLabel={`اسم الصنف ${idx + 1}`} maxLength={200} autoFocus />
                      {/* تحت sm يهبط المورد سطراً كاملاً أسفل الصف (basis-full + order-last)؛ من sm عرض ثابت في الصف نفسه */}
                      <input type="text" value={it.supplier} onChange={e => updateItem(it.key, { supplier: e.target.value })}
                        aria-label={`المورد ${idx + 1}`} placeholder="المورد" maxLength={100}
                        className={`${INPUT_BASE} order-last basis-full sm:order-none sm:basis-auto sm:w-32 sm:shrink-0 min-w-0`} />
                      <input type="text" inputMode="numeric" value={it.qty}
                        onChange={e => updateItem(it.key, { qty: cleanNumberInput(e.target.value) })}
                        aria-label={`الكمية ${idx + 1}`} className={`${INPUT_BASE} w-20 shrink-0 text-center tabular-nums`} />
                      {items.length > 1 && (
                        <button type="button" onClick={() => removeItem(it.key)} aria-label={`حذف الصنف ${idx + 1}`}
                          className="w-9 h-9 shrink-0 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-colors cursor-pointer">
                          <X size={14} weight="bold" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    <ProductHint value={it.name} stats={productStats} />
                    </div>
                  ))}
                </div>
                {items.length < MAX_ITEMS && (
                  <button type="button" onClick={addItem}
                    className="mt-2 inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer">
                    <Plus size={14} weight="bold" aria-hidden="true" /> إضافة صنف
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="req-price" className="block text-xs font-bold text-slate-600 mb-1.5">السعر الإجمالي بالدينار (اختياري)</label>
                  <input id="req-price" type="text" inputMode="decimal" placeholder="0.000" value={price}
                    onChange={e => setPrice(cleanNumberInput(e.target.value))} className={`${INPUT_CLS} text-center tabular-nums`} />
                </div>
                <div>
                  <label htmlFor="req-deposit" className="block text-xs font-bold text-slate-600 mb-1.5">العربون بالدينار (اختياري)</label>
                  <input id="req-deposit" type="text" inputMode="decimal" placeholder="0.000" value={deposit}
                    onChange={e => setDeposit(cleanNumberInput(e.target.value))} className={`${INPUT_CLS} text-center tabular-nums`} />
                </div>
              </div>

              <div>
                <label htmlFor="req-note" className="block text-xs font-bold text-slate-600 mb-1.5">ملاحظة المتابعة الأولى (اختياري)</label>
                <textarea id="req-note" value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={1000}
                  className={`${INPUT_CLS} resize-none`} />
                <p className="text-[11px] text-slate-400 mt-1">لا يمكن تعديل الملاحظة أو حذفها بعد حفظها.</p>
              </div>
            </div>
          )}
        </div>

        {patient && (
          <div className="px-5 py-4 border-t border-slate-100 shrink-0 grid grid-cols-2 gap-3">
            <button type="button" onClick={onClose}
              className="h-11 flex items-center justify-center rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-sm font-bold transition-all cursor-pointer">
              إلغاء
            </button>
            <button type="button" onClick={save} disabled={saving || readOnly} title={readOnly ? READ_ONLY_MESSAGE : undefined}
              className="h-11 flex items-center justify-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold transition-all active:scale-[0.98] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
              {saving ? 'جاري الحفظ...' : 'حفظ الطلب'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════
export default function RequestsPage() {
  const { readOnly } = useSubscriptionState();
  const { notice, setNotice } = useNotice();
  const [pharmacyId, setPharmacyId] = useState('');
  const [tab, setTab] = useState<Tab>('open');
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [overdueCount, setOverdueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const loadSeq = useRef(0);
  // نص البحث المعتمد بعد التأخير؛ مرجع (لا حالة) كي يقرأه load من أي استدعاء، حتى تحديث الإغلاق الصامت، دون إعادة إنشائه
  const closedSearchRef = useRef('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');

  // الأصناف المطلوبة بكثرة: تحميل واحد عند الدخول وآخر عند requests:changed، تغذّي الاقتراحات والتلميح والقسم الثالث
  const [productStats, setProductStats] = useState<ProductStat[] | null>(null);
  const [statsFailed, setStatsFailed] = useState(false);
  // تبويب الإحصائيات يُركَّب عند أول فتح ثم يبقى مخفياً عند مغادرته، فتبقى أرقامه مخزّنة لكل فترة
  const [statsOpened, setStatsOpened] = useState(false);
  const statsLoading = useRef(false);
  const statsAgain = useRef(false);

  const { pharmacyName } = usePharmacyInfo();
  const [selected, setSelected] = useState<RequestRow | null>(null);
  const [suggest, setSuggest] = useState<PatientMessageKind | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [patient, setPatient] = useState<PickedPatient | null>(null);
  const [newPatientPrefill, setNewPatientPrefill] = useState<{ name?: string; phone_number?: string } | null>(null);

  const notify = useCallback((kind: 'ok' | 'err', text: string) => setNotice({ kind, text }), [setNotice]);

  // showSpinner=false للتحميل الأول: الحالة الابتدائية loading=true أصلاً، ولا نستدعي setState داخل effect
  const load = useCallback(async (t: Tab, showSpinner = true) => {
    const seq = ++loadSeq.current;
    if (showSpinner) { setLoading(true); setLoadFailed(false); }
    try {
      const search = t === 'closed' ? parseClosedSearch(closedSearchRef.current) : null;
      const joined = search != null && search !== 'short' && search.kind !== 'number';
      const base = supabase.from('patient_requests').select(joined ? REQUEST_SELECT.replace(PATIENT_EMBED, PATIENT_INNER_EMBED) : REQUEST_SELECT);
      let listQuery;
      if (t === 'open') {
        // الأقدم أولاً: الطلب الأطول انتظاراً في الأعلى
        listQuery = base.or(OPEN_FILTER).order('created_at', { ascending: true }).order('created_at', { referencedTable: 'patient_request_items', ascending: true });
      } else {
        // updated_at للطلب المغلق لا يتغيّر إلا لحظة إغلاقه (التسليم أو الإلغاء أو تسجيل إرجاع العربون)، فهو «وقت الإغلاق»
        // الصالح للنافذة والترتيب (حارس القاعدة يمنع أي تعديل آخر على الطلب النهائي)
        let q = base.or(CLOSED_FILTER);
        if (search == null || search === 'short') {
          q = q.gte('updated_at', closedWindowStartIso());
        } else if (search.kind === 'number') {
          q = q.eq('request_number', search.number);
          if (search.year != null) q = q.eq('request_year', search.year);
        } else if (search.kind === 'phone') {
          q = q.ilike('patients.phone_number', `%${search.term}%`);
        } else {
          q = q.ilike('patients.name_normalized', `%${search.term}%`);
        }
        listQuery = q.order('updated_at', { ascending: false }).order('created_at', { referencedTable: 'patient_request_items', ascending: true })
          .limit(search == null || search === 'short' ? CLOSED_WINDOW_LIMIT : CLOSED_SEARCH_LIMIT);
      }
      // كل الطلبات المفتوحة بحقول التأخر فقط: العدّاد وعدد المتأخر لا يتأثران بالتبويب ولا بحد 50
      const overdueQuery = supabase.from('patient_requests').select(OVERDUE_SELECT).or(OPEN_FILTER);

      const [listRes, overdueRes] = await Promise.all([listQuery, overdueQuery]);
      if (seq !== loadSeq.current) return;
      if (listRes.error) throw listRes.error;
      setLoadFailed(false);
      let list = (listRes.data || []) as unknown as RequestRow[];
      // الاستعلام المربوط يعيد المريض باسم الجدول patients؛ نعيده إلى الحقل المعتاد patient
      if (joined) list = (list as unknown as (RequestRow & { patients?: RequestRow['patient'] })[]).map(({ patients, ...r }) => ({ ...r, patient: patients ?? r.patient }));
      if (t === 'open') {
        // المتأخر أولاً (الأكثر تأخراً أولاً) ثم الأقدم؛ sort ثابت فيبقى ترتيب created_at داخل كل مجموعة
        const top = (r: RequestRow) => getOverdueReasons(r)[0]?.lateness ?? null;
        list.sort((a, b) => {
          const la = top(a); const lb = top(b);
          if (la != null && lb != null) return lb - la;
          if (la != null) return -1;
          if (lb != null) return 1;
          return 0;
        });
      }
      setRows(list);
      if (!overdueRes.error) {
        const open = (overdueRes.data || []) as unknown as Parameters<typeof getOverdueReasons>[0][];
        setOpenCount(open.length);
        setOverdueCount(open.filter(r => getOverdueReasons(r).length > 0).length);
      }
    } catch {
      if (seq !== loadSeq.current) return;
      setLoadFailed(true);
      setNotice({ kind: 'err', text: 'تعذّر تحميل الطلبات. تحقّق من اتصالك ثم أعد المحاولة.' });
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [setNotice]);

  // التحميل الأول بعد معرّف الصيدلية داخل callback (لا setState متزامن في جسم الـ effect)
  useEffect(() => {
    getPharmacyId()
      .then(id => { if (id) setPharmacyId(id); })
      .finally(() => { load('open', false); });
  }, [load]);

  // التحميل لا يتداخل: حدث يصل أثناء جلب جارٍ يُعاد له الجلب مرة واحدة بعد انتهائه (الجلب الجاري قد يسبق حفظ الطلب)
  const loadStats = useCallback(async () => {
    if (statsLoading.current) { statsAgain.current = true; return; }
    statsLoading.current = true;
    try {
      do {
        statsAgain.current = false;
        try {
          setProductStats(await fetchProductStats());
          setStatsFailed(false);
        } catch {
          setStatsFailed(true); // استشاري: يبقى آخر ما حُمّل، ولا إشعار حاجب
        }
      } while (statsAgain.current);
    } finally {
      statsLoading.current = false;
    }
  }, []);

  useEffect(() => {
    void loadStats();
    const onChanged = () => { void loadStats(); };
    window.addEventListener(REQUESTS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(REQUESTS_CHANGED_EVENT, onChanged);
  }, [loadStats]);

  const frequentCount = productStats ? productStats.filter(isFrequent).length : null;

  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

  // تأخير 300ms قبل الاستعلام؛ الردود المتأخرة يتجاهلها loadSeq. حرف واحد غير رقمي لا يغيّر القائمة
  const onSearchChange = (value: string) => {
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      const trimmed = value.trim();
      if (parseClosedSearch(trimmed) === 'short') { setActiveSearch(trimmed); return; }
      closedSearchRef.current = trimmed;
      setActiveSearch(trimmed);
      load('closed');
    }, SEARCH_DEBOUNCE_MS);
  };

  const clearSearch = () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearchInput('');
    setActiveSearch('');
    if (closedSearchRef.current !== '') { closedSearchRef.current = ''; load('closed'); }
  };

  const switchTab = (t: Tab) => {
    if (t === tab) return;
    setTab(t);
    // «مطلوبة بكثرة» بياناتها من productStats و«الإحصائيات» تحمّلها لوحتها؛ لا قائمة طلبات لهما
    if (t === 'stats') setStatsOpened(true);
    if (t !== 'stock' && t !== 'stats') load(t);
  };

  // رابط مباشر ?open=<id>: يُقرأ مرة واحدة بعد أول تحميل (بلا useSearchParams فلا حاجة لـ Suspense)، يُجلب الطلب
  // بمعرّفه كي يُفتح ولو لم يكن في التبويب الحالي، ثم يُزال الوسيط من العنوان
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (loading || deepLinkDone.current) return;
    deepLinkDone.current = true;
    const params = new URLSearchParams(window.location.search);
    const id = params.get('open');
    if (!id) return;
    params.delete('open');
    const qs = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    const notFound = () => notify('err', 'الطلب غير موجود.');
    if (!UUID_RE.test(id)) { Promise.resolve().then(notFound); return; }
    supabase.from('patient_requests').select(REQUEST_SELECT).eq('id', id)
      .order('created_at', { referencedTable: 'patient_request_items', ascending: true }).maybeSingle()
      .then(({ data }) => { if (data) setSelected(data as unknown as RequestRow); else notFound(); },
            () => notFound());
  }, [loading, notify]);

  // إغلاق التفاصيل يحدّث القائمة بصمت (بلا مؤشر تحميل) لأن الموظف قد يكون أضاف ملاحظة أو غيّر بيانات
  const closeDetails = () => {
    setSelected(null);
    setSuggest(null);
    load(tab, false);
  };

  const closeModal = () => {
    setModalOpen(false);
    setPatient(null);
    setNewPatientPrefill(null);
  };

  const handleSaved = async (newId: string | null) => {
    closeModal();
    notify('ok', 'تم حفظ الطلب');
    notifyRequestsChanged();
    // الطلب الجديد «مسجّل» أي مفتوح — نعرض تبويب المفتوحة
    setTab('open');
    load('open');
    // نفتح تفاصيل الطلب الجديد فوراً مع اقتراح رسالة التأكيد؛ فشل الجلب لا يعطّل شيئاً
    if (!newId) return;
    try {
      const { data } = await supabase.from('patient_requests').select(REQUEST_SELECT).eq('id', newId)
        .order('created_at', { referencedTable: 'patient_request_items', ascending: true }).single();
      if (data) {
        setSuggest('confirmation');
        setSelected(data as unknown as RequestRow);
      }
    } catch { /* الاقتراح اختياري */ }
  };

  const searchActive = activeSearch !== '' && parseClosedSearch(activeSearch) !== 'short';
  const searchTooShort = activeSearch !== '' && parseClosedSearch(activeSearch) === 'short';

  const emptyText = tab === 'open'
    ? { title: 'لا توجد طلبات مفتوحة حالياً', hint: 'عندما يطلب مريض منتجاً غير متوفر، اضغط «طلب جديد» لتسجيله ومتابعته.' }
    : searchActive
      ? { title: 'لا توجد طلبات مغلقة مطابقة', hint: '' }
      : { title: `لا طلبات أُغلقت خلال آخر ${CLOSED_WINDOW_DAYS} يوماً.`, hint: 'للطلبات الأقدم استعمل البحث.' };

  return (
    <div className="min-h-screen bg-slate-50/50 antialiased text-slate-900 pb-20 overflow-x-hidden" dir="rtl">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&display=swap');
        body { font-family: 'IBM Plex Sans Arabic', system-ui, sans-serif; }
        @keyframes saasSlideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes saasFadeIn  { from { opacity: 0; } to { opacity: 1; } }
        .saas-slide-up { animation: saasSlideUp 0.25s ease both; }
        .saas-fade-in  { animation: saasFadeIn 0.2s ease both; }
      `}</style>

      <DashboardHeader />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">طلبات المرضى</h1>
            <p className="text-sm text-slate-500 mt-1">
              {openCount === null ? 'منتجات يطلبها المرضى وغير متوفرة في الصيدلية'
                : openCount > 0 ? <><span className="tabular-nums">{openCount}</span> طلب مفتوح بانتظار المتابعة</>
                : 'لا توجد طلبات مفتوحة'}
            </p>
          </div>
          <button type="button" onClick={() => setModalOpen(true)} disabled={readOnly || !pharmacyId} title={readOnly ? READ_ONLY_MESSAGE : undefined}
            className="h-10 shrink-0 whitespace-nowrap px-4 flex items-center justify-center gap-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-all shadow-sm active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
            <Plus size={16} weight="bold" aria-hidden="true" /> طلب جديد
          </button>
        </div>

        {/* على الجوال شبكة 2×2 بلا تمرير أفقي (التسمية تلتف إلى سطرين)، ومن sm فما فوق الصف الواحد كما كان */}
        <div className="grid grid-cols-2 gap-1 bg-slate-100 rounded-xl p-1 sm:inline-flex sm:max-w-full sm:overflow-x-auto" role="tablist">
          {([
            { key: 'open' as Tab, label: 'المفتوحة', count: openCount, late: overdueCount },
            { key: 'closed' as Tab, label: 'المغلقة', count: null, late: 0 },
            { key: 'stock' as Tab, label: 'مطلوبة بكثرة', count: frequentCount, late: 0 },
            { key: 'stats' as Tab, label: 'نتائجك', count: null, late: 0 },
          ]).map(t => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => switchTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-bold text-center sm:whitespace-nowrap sm:shrink-0 transition-all cursor-pointer ${tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>
              {t.label}
              {t.count != null && t.count > 0 && <span className="mr-1.5 text-xs font-black text-teal-700 tabular-nums">{t.count}</span>}
              {t.late > 0 && <span className="mr-1.5 text-xs font-black text-rose-600 tabular-nums">· متأخر {t.late}</span>}
            </button>
          ))}
        </div>

        {tab === 'closed' && (
          <div className="space-y-2">
            <div className="relative">
              <MagnifyingGlass size={16} weight="bold" className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" aria-hidden="true" />
              <input type="text" value={searchInput} onChange={e => onSearchChange(e.target.value)}
                placeholder="ابحث باسم المريض أو هاتفه أو رقم الطلب (مثل 5/2026)" aria-label="بحث في الطلبات المغلقة"
                className={`${INPUT_CLS} pr-10 pl-10`} />
              {searchInput !== '' && (
                <button type="button" onClick={clearSearch} aria-label="مسح البحث"
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer">
                  <X size={14} weight="bold" aria-hidden="true" />
                </button>
              )}
            </div>
            {searchTooShort ? (
              <p className="text-xs text-slate-400">اكتب حرفين على الأقل للبحث بالاسم.</p>
            ) : !searchActive && (
              <p className="text-xs text-slate-400">الطلبات التي أُغلقت خلال آخر <span className="tabular-nums">{CLOSED_WINDOW_DAYS}</span> يوماً</p>
            )}
          </div>
        )}

        {statsOpened && (
          <div hidden={tab !== 'stats'}>
            <RequestStatsPanel visible={tab === 'stats'} />
          </div>
        )}

        {tab === 'stats' ? null : tab === 'stock' ? (
          <FrequentProductsPanel stats={productStats} failed={statsFailed} onRetry={() => { void loadStats(); }} />
        ) : loading ? (
          <div className="py-16 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-teal-600 rounded-full animate-spin" />
            <p className="text-sm font-medium text-slate-500">جاري تحميل الطلبات...</p>
          </div>
        ) : loadFailed ? (
          <div className="bg-white border border-slate-200 rounded-2xl py-14 text-center shadow-sm px-6">
            <p className="text-sm font-medium text-slate-600">لم نتمكن من تحميل الطلبات.</p>
            <button type="button" onClick={() => load(tab)}
              className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-sm font-bold transition-all cursor-pointer">
              <ArrowsClockwise size={16} weight="bold" aria-hidden="true" /> إعادة المحاولة
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl py-14 text-center shadow-sm px-6 saas-slide-up">
            <Notebook size={32} weight="bold" className="mx-auto text-slate-300" aria-hidden="true" />
            <p className="text-sm font-bold text-slate-700 mt-3">{emptyText.title}</p>
            {emptyText.hint && <p className="text-xs text-slate-500 mt-1.5 max-w-sm mx-auto leading-relaxed">{emptyText.hint}</p>}
          </div>
        ) : (
          <div className="space-y-3 saas-slide-up" key={tab}>
            {rows.map(row => <RequestCard key={row.id} row={row} onOpen={() => setSelected(row)} />)}
            {tab === 'closed' && rows.length >= (searchActive ? CLOSED_SEARCH_LIMIT : CLOSED_WINDOW_LIMIT) && (
              <p className="text-[11px] text-slate-400 text-center">
                {searchActive ? <>تُعرض أحدث <span className="tabular-nums">{CLOSED_SEARCH_LIMIT}</span> نتيجة؛ ضيّق البحث للوصول لطلب أقدم.</>
                  : <>تُعرض آخر <span className="tabular-nums">{CLOSED_WINDOW_LIMIT}</span> طلباً مغلقاً.</>}
              </p>
            )}
          </div>
        )}
      </main>

      <AppFooter className="mt-10" />

      <Toast notice={notice} />

      {selected && (
        <RequestDetailsModal row={selected} pharmacyName={pharmacyName} suggestion={suggest} productStats={productStats ?? []} onClose={closeDetails} onChanged={() => load(tab, false)} notify={notify} />
      )}

      {modalOpen && pharmacyId && (
        <NewRequestModal
          pharmacyId={pharmacyId}
          patient={patient}
          onPatientChange={setPatient}
          onNeedNewPatient={setNewPatientPrefill}
          onClose={closeModal}
          onSaved={handleSaved}
          notify={notify}
          productStats={productStats ?? []}
        />
      )}

      {/* يُرسم بعد نافذة الطلب في الشجرة ليظهر فوقها (كلاهما z-50) */}
      {newPatientPrefill && (
        <AddPatientForm
          pharmacyId={pharmacyId}
          prefill={newPatientPrefill}
          onClose={() => setNewPatientPrefill(null)}
          onSaved={(p: NewPatient) => {
            setPatient({ id: p.id, name: p.name, phone_number: p.phone_number });
            setNewPatientPrefill(null);
          }}
        />
      )}
    </div>
  );
}
