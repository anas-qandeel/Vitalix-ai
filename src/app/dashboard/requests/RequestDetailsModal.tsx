'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { displayPhone } from '@/lib/phone';
import { calendarDaysSince } from '@/lib/calendar-days';
import { friendlyError, READ_ONLY_MESSAGE, useSubscriptionState } from '@/lib/subscription-state';
import { useConfirm } from '@/components/ConfirmDialog';
import ProductNameInput, { ProductHint } from './ProductNameInput';
import type { ProductStat } from '@/lib/frequent-products';
import { normalizePhone, validatePhone } from '@/lib/phone';
import { getOverdueReasons, getItemOverdue, getExpectedChipLabel, notifyRequestsChanged } from '@/lib/request-overdue';
import PatientNotesBanner from '@/components/PatientNotesBanner';
import { Phone, Package, X, ArrowsClockwise, PencilSimple, Plus, WhatsappLogo, WarningCircle } from '@phosphor-icons/react';
import {
  RequestRow, RequestStatus, RequestItem, ItemStage, STATUS_META, STAGE_META, STAGE_RANK, stageTime, requestTitle,
  fmtJd, paidTotal, remainingAmount, isPendingRefund, buildPatientMessage, PatientMessageKind, MONEY_RE, cleanNumberInput, INPUT_BASE, INPUT_CLS,
} from './shared';

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════
interface DetailRequest {
  id: string;
  request_number: number;
  request_year: number;
  price: number | null;
  deposit: number | null;
  deposit_returned: boolean | null;
  cancel_reason: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  status: RequestStatus;
  items: RequestItem[];
  payments: { amount: number }[];
}

interface TimelineEvent {
  id: string;
  kind: string;
  body: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  staff_id: string | null;
  staff: { name: string } | null;
}

// سطر في السجل: حدث واحد أو مجموعة أحداث متتالية لتغيّر مرحلة أصناف بالانتقال نفسه
interface TimelineLine {
  key: string;
  ev: TimelineEvent;
  names: string[];
}

const NOTE_MAX = 1000;
const CANCEL_REASON_MAX = 300;
const GROUP_WINDOW_MS = 5000;
const EVENTS_SELECT = 'id, kind, body, details, created_at, staff_id, staff:pharmacy_staff!patient_request_events_staff_id_fkey(name)';
const DETAIL_SELECT = 'id, request_number, request_year, price, deposit, deposit_returned, cancel_reason, delivered_at, cancelled_at, status, items:patient_request_items(id, product_name, quantity, supplier, stage, ordered_at, arrived_at, delivered_at, cancelled_at, cancel_reason, stage_before_cancel, stage_changed_at), payments:patient_request_payments(amount)';

const SUPPLIER_MAX = 100;
const PRODUCT_NAME_MAX = 200;
const MAX_ITEMS = 30;

// أنماط نافذة اختيار الأصناف: طلب من المورد / وصول / تسليم للمريض
type ChooseMode = 'order' | 'arrive' | 'deliver';

const CHOOSE_TITLES: Record<ChooseMode, string> = {
  order: 'ما الأصناف التي طُلبت من المورد؟',
  arrive: 'ما الأصناف التي وصلت؟',
  deliver: 'ما الأصناف التي سيستلمها المريض الآن؟',
};

const CONFLICT_MESSAGE = 'تغيّر هذا الطلب من موظف آخر. أعد فتحه.';

// أخطاء القاعدة إلى رسائل عربية؛ نص الخطأ الخام لا يُعرض أبداً
function mapActionError(err: { message?: string; details?: string } | null | undefined): string {
  const text = `${err?.message ?? ''} ${err?.details ?? ''}`;
  if (/SUBSCRIPTION_READ_ONLY/.test(text)) return friendlyError(err);
  if (/REQUEST_CLOSED/.test(text)) return 'أُغلق هذا الطلب. أعد فتحه لرؤية آخر حالة.';
  if (/STATUS_NOT_ALLOWED/.test(text)) return 'هذا التغيير في حالة الطلب غير مسموح.';
  if (/REQUEST_HAS_DELIVERIES/.test(text)) return 'لا يمكن إلغاء طلب سُلّمت بعض أصنافه — ألغِ الأصناف المتبقية بدلاً من ذلك.';
  if (/PRICE_BELOW_PAID/.test(text)) return 'السعر الإجمالي أقل من العربون مع ما دُفع عند التسليم.';
  if (/PRICE_REQUIRED/.test(text)) return 'لا يمكن مسح السعر الإجمالي بعد تحصيل دفعة. عدّله بدلاً من ذلك.';
  if (/DEPOSIT_RETURN_FINAL/.test(text)) return 'تسجيل إعادة العربون نهائي ولا يمكن التراجع عنه.';
  if (/REMAINING_NOT_SETTLED/.test(text)) return 'المتبقي على المريض لا يساوي صفراً. عدّل السعر الإجمالي أولاً ثم أعد المحاولة.';
  if (/REQUEST_NOT_CANCELLED/.test(text)) return 'الطلب ليس ملغى. أعد فتحه لرؤية آخر حالة.';
  if (/DEPOSIT_ALREADY_RETURNED/.test(text)) return 'أُرجع العربون للمريض، فلا يمكن إعادة تفعيل الطلب. سجّل طلباً جديداً.';
  if (/REOPEN_ITEMS_REQUIRED/.test(text)) return 'اختر صنفاً واحداً على الأقل لإعادته.';
  if (/REOPEN_ITEMS_INVALID/.test(text)) return 'بعض الأصناف المختارة لا يمكن إعادتها. أعد فتح الطلب وحاول مرة أخرى.';
  if (/REOPEN_REASON_REQUIRED/.test(text)) return 'اكتب سبب إعادة التفعيل (حتى 300 حرف).';
  if (/IMMUTABLE_FIELD/.test(text)) return 'لا يمكن تغيير الصيدلية أو المريض أو رقم الطلب أو المنشئ.';
  if (/patient_requests_cancel_needs_reason/.test(text)) return 'اكتب سبب إلغاء الطلب.';
  if (/patient_requests_cancel_deposit_answer/.test(text)) return 'حدّد هل أُعيد العربون للمريض.';
  if (/patient_requests_deposit_le_price/.test(text)) return 'لا يمكن أن يزيد العربون على السعر.';
  if (/patient_requests_(price|deposit)_check/.test(text)) return 'السعر والعربون لا يمكن أن يكونا بالسالب.';
  if (/ITEMS_NOT_ARRIVED/.test(text)) return 'يمكن تسليم الأصناف التي وصلت فقط. أعد فتح الطلب وحاول مرة أخرى.';
  if (/AMOUNT_REQUIRED/.test(text)) return 'أدخل المبلغ المستلم الآن (يمكن أن يكون صفراً).';
  if (/AMOUNT_EXCEEDS_REMAINING/.test(text)) return 'المبلغ أكبر من المتبقي على المريض.';
  if (/AMOUNT_MUST_SETTLE/.test(text)) return 'هذا آخر تسليم: يجب تحصيل المتبقي كاملاً. إن أعطيت خصماً فعدّل السعر الإجمالي أولاً.';
  if (/ITEM_IMMUTABLE/.test(text)) return 'لا يمكن تعديل اسم الصنف أو كميته.';
  if (/ITEM_FINAL/.test(text)) return 'هذا الصنف مسلَّم أو ملغى ولا يمكن تعديله.';
  if (/ITEM_STAGE_NOT_ALLOWED/.test(text)) return 'هذا الانتقال بين المراحل غير مسموح.';
  if (/ITEM_CANCEL_REASON_REQUIRED|patient_request_items_cancel_needs_reason/.test(text)) return 'اكتب سبب إلغاء الصنف.';
  if (/DELIVERY_VIA_FUNCTION/.test(text)) return 'التسليم يتم من زر «تسليم للمريض» فقط.';
  if (/patient_request_items_supplier_check/.test(text)) return `اسم المورد لا يتجاوز ${SUPPLIER_MAX} حرف.`;
  if (/patient_request_items_product_name_check/.test(text)) return `اسم الصنف مطلوب ولا يتجاوز ${PRODUCT_NAME_MAX} حرف.`;
  if (/patient_request_items_quantity_check/.test(text)) return 'الكمية يجب أن تكون 1 أو أكثر.';
  if (/row-level security|STAFF_REQUIRED/i.test(text)) return 'تعذّر التحقق من هويتك كموظف. سجّل الدخول من جديد ثم أعد المحاولة.';
  // رمز غير مُعرَّف: نعرض النص العربي الذي بعد الرمز في رسالة القاعدة بدل الرسالة العامة
  const afterCode = text.match(/\b[A-Z][A-Z_]{3,}:\s*([^\n]*[\u0600-\u06FF][^\n]*)/);
  if (afterCode) return afterCode[1].trim();
  return 'تعذّر تنفيذ الإجراء. تحقّق من اتصالك ثم حاول مرة أخرى.';
}

// عدد الأصناف بنحو عربي سليم: صنف واحد / صنفان / 3 أصناف / 11 صنفاً
function countPhrase(n: number): string {
  if (n === 1) return 'صنف واحد';
  if (n === 2) return 'صنفين';
  if (n <= 10) return `${n} أصناف`;
  return `${n} صنفاً`;
}

// الأصناف المؤهلة لكل إجراء
function eligibleFor(mode: ChooseMode, items: RequestItem[]): RequestItem[] {
  if (mode === 'order') return items.filter(it => it.stage === 'recorded');
  // الوصول بعد الطلب من المورد فقط
  if (mode === 'arrive') return items.filter(it => it.stage === 'ordered');
  return items.filter(it => it.stage === 'arrived');
}

// التراجع خطوة واحدة: طُلب ← مسجّل، ووصل ← طُلب دائماً (كما في حارس القاعدة)
function previousStage(it: RequestItem): ItemStage | null {
  if (it.stage === 'ordered') return 'recorded';
  if (it.stage === 'arrived') return 'ordered';
  return null;
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// يوم/شهر/سنة بأرقام لاتينية — صيغة التواريخ الموحّدة في المنصة
function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// h:mm مع ص/م بأرقام لاتينية وبلا صفر قبل الساعة؛ الظهر 12:05 م ومنتصف الليل 12:05 ص.
// كتبناها محلياً لأن مساعدات الوقت الموجودة في الصفحات الأخرى تفرض ساعتين (01:16) ولا تطابق هذه الصيغة
function formatTime12(d: Date): string {
  const h = d.getHours();
  return `${h % 12 || 12}:${pad2(d.getMinutes())} ${h >= 12 ? 'م' : 'ص'}`;
}

// «اليوم 1:16 م» · «أمس 11:02 ص» · «13/10/2026 9:05 م» — بالتوقيت المحلي وأيام تقويمية
function formatEventTime(iso: string): string {
  const d = new Date(iso);
  const hm = formatTime12(d);
  const days = calendarDaysSince(iso);
  if (days === 0) return `اليوم ${hm}`;
  if (days === 1) return `أمس ${hm}`;
  return `${formatDate(iso)} ${hm}`;
}

const str = (v: unknown): string => (v == null ? '' : String(v));
const money = (v: unknown): string => `${fmtJd(Number(v))} د.أ`;
const stageLabel = (v: unknown): string => STAGE_META[v as ItemStage]?.label ?? str(v);

// تغيّر مبلغ: إضافة / حذف / تعديل
function moneyChange(label: string, d: Record<string, unknown>): string {
  const hadOld = d.old != null;
  const hasNew = d.new != null;
  if (!hadOld && hasNew) return `أضاف ${label} ${money(d.new)}`;
  if (hadOld && !hasNew) return `حذف ${label}`;
  if (hadOld && hasNew) return `غيّر ${label} من ${fmtJd(Number(d.old))} إلى ${money(d.new)}`;
  return `عدّل ${label}`;
}

// هل انتقال المرحلة تراجع؟ (رتبة الوجهة أصغر من رتبة المصدر)
function isBackward(d: Record<string, unknown>): boolean {
  const from = STAGE_RANK[d.from as ItemStage];
  const to = STAGE_RANK[d.to as ItemStage];
  return from != null && to != null && to < from;
}

// جملة انتقال مرحلة لصنف واحد أو مجموعة أصناف
function describeStageChange(d: Record<string, unknown>, names: string[]): string {
  const list = names.join('، ');
  const many = names.length > 1;
  if (isBackward(d)) {
    return many ? `تراجع: ${list} عادت إلى «${stageLabel(d.to)}»` : `تراجع: ${list} عاد إلى «${stageLabel(d.to)}»`;
  }
  switch (d.to) {
    case 'ordered':   return many ? `طلب من المورد: ${list}` : `طلب ${list} من المورد`;
    case 'arrived':   return many ? `سجّل وصول: ${list}` : `سجّل وصول ${list}`;
    case 'delivered': return many ? `سلّم للمريض: ${list}` : `سلّم ${list} للمريض`;
    default:          return many ? `غيّر مرحلة: ${list} إلى «${stageLabel(d.to)}»` : `غيّر مرحلة ${list} إلى «${stageLabel(d.to)}»`;
  }
}

// جملة عربية لكل نوع حدث؛ النوع المجهول يعطي سطراً عاماً ولا يكسر العرض أبداً
function describeLine(line: TimelineLine, requestYear: number | null): string {
  const ev = line.ev;
  const d = (ev.details ?? {}) as Record<string, unknown>;
  const name = str(d.product_name);
  switch (ev.kind) {
    case 'created':
      if (d.request_number == null) return 'سجّل طلب المواد';
      return `سجّل طلب المواد رقم ${str(d.request_number)}/${str(d.request_year ?? requestYear)}`;
    case 'status_change': {
      if (d.from === 'cancelled' && d.to === 'open') {
        const names = Array.isArray(d.items) ? (d.items as unknown[]).map(str).filter(Boolean) : [];
        return `أعاد تفعيل الطلب${names.length ? ` — الأصناف: ${names.join('، ')}` : ''} — السبب: ${str(d.reason)}`;
      }
      if (d.to === 'delivered') return 'اكتمل تسليم الطلب';
      if (d.to === 'cancelled') {
        const dep = d.deposit_returned === true ? ' — أُعيد العربون' : d.deposit_returned === false ? ' — لم يُعَد العربون' : '';
        return `ألغى الطلب — السبب: ${str(d.reason)}${dep}`;
      }
      return `غيّر حالة الطلب إلى «${STATUS_META[d.to as RequestStatus]?.label ?? str(d.to)}»`;
    }
    case 'item_stage_change':
      return describeStageChange(d, line.names);
    case 'payment': {
      const items = Array.isArray(d.items) ? (d.items as unknown[]).map(str).join('، ') : '';
      const head = Number(d.amount) > 0 ? `استلم ${money(d.amount)}` : 'سلّم دون تحصيل مبلغ';
      return items ? `${head} (${items})` : head;
    }
    case 'price_change':
      return moneyChange('السعر الإجمالي', d);
    case 'deposit_change':
      return moneyChange('العربون', d);
    case 'deposit_return_change':
      if (d.new === true) return 'سجّل أن العربون أُعيد للمريض';
      if (d.new === false) return 'سجّل أن العربون لم يُعَد';
      return 'ألغى تسجيل إعادة العربون';
    case 'message_sent': {
      const kind = d.message === 'arrival' ? 'أرسل رسالة الوصول' : d.message === 'confirmation' ? 'أرسل رسالة التأكيد' : 'أرسل رسالة للمريض';
      const amounts = d.amounts_included === true ? ' (مع المبالغ)' : d.amounts_included === false ? ' (بدون المبالغ)' : '';
      return kind + amounts;
    }
    case 'item_added':
      return `أضاف صنف ${name} × ${str(d.quantity)}`;
    case 'item_cancelled':
      return `ألغى صنف ${name} — السبب: ${str(d.reason)}`;
    case 'item_supplier_change':
      if (d.old == null && d.new != null) return `حدّد مورد ${name}: ${str(d.new)}`;
      if (d.new == null) return `حذف مورد ${name}`;
      return `غيّر مورد ${name} من ${str(d.old)} إلى ${str(d.new)}`;
    default:
      return 'أجرى تحديثاً على الطلب';
  }
}

// يدمج أحداث item_stage_change المتتالية (الوجهة والاتجاه والموظف نفسها خلال 5 ثوانٍ) في سطر واحد
function buildLines(events: TimelineEvent[]): TimelineLine[] {
  const lines: TimelineLine[] = [];
  let lastTime = 0;
  for (const ev of events) {
    const t = new Date(ev.created_at).getTime();
    const prev = lines[lines.length - 1];
    if (ev.kind === 'item_stage_change' && prev && prev.ev.kind === 'item_stage_change') {
      const pd = (prev.ev.details ?? {}) as Record<string, unknown>;
      const d = (ev.details ?? {}) as Record<string, unknown>;
      if (pd.to === d.to && isBackward(pd) === isBackward(d) && prev.ev.staff_id === ev.staff_id && t - lastTime <= GROUP_WINDOW_MS) {
        prev.names.push(str(d.product_name));
        lastTime = t;
        continue;
      }
    }
    lines.push({ key: ev.id, ev, names: ev.kind === 'item_stage_change' ? [str(((ev.details ?? {}) as Record<string, unknown>).product_name)] : [] });
    lastTime = t;
  }
  return lines;
}

// ═══════════════════════════════════════════════════════
// MODAL
// ═══════════════════════════════════════════════════════
export default function RequestDetailsModal({ row, pharmacyName, suggestion, onClose, onChanged, notify, productStats }: {
  row: RequestRow;
  // أسماء سبق طلبها وتلميح الأصناف كثيرة الطلب (تُحمَّل في صفحة الطلبات)
  productStats: ProductStat[];
  pharmacyName: string;
  // اقتراح رسالة يظهر كشريط عند الفتح (مثلاً بعد حفظ طلب جديد)
  suggestion?: PatientMessageKind | null;
  onClose: () => void;
  onChanged: () => void;
  notify: (kind: 'ok' | 'err', text: string) => void;
}) {
  const { readOnly } = useSubscriptionState();
  const [detail, setDetail] = useState<DetailRequest | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [acting, setActing] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  // رسائل المريض: شريط الاقتراح ونافذة المعاينة
  const [banner, setBanner] = useState<PatientMessageKind | null>(suggestion ?? null);
  const [preview, setPreview] = useState<PatientMessageKind | null>(null);
  const [includeAmounts, setIncludeAmounts] = useState(true);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenChosen, setReopenChosen] = useState<Set<string>>(new Set());
  const [cancelReason, setCancelReason] = useState('');
  const [depositAnswer, setDepositAnswer] = useState<'yes' | 'no' | ''>('');
  // اختيار الأصناف (طلب / وصول / تسليم)
  const [choose, setChoose] = useState<ChooseMode | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [amountInput, setAmountInput] = useState('');
  const [settleChecked, setSettleChecked] = useState(false);
  // إجراءات الأصناف
  const [supplierEditId, setSupplierEditId] = useState<string | null>(null);
  const [supplierInput, setSupplierInput] = useState('');
  const [itemCancel, setItemCancel] = useState<RequestItem | null>(null);
  const [itemCancelReason, setItemCancelReason] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSupplier, setNewSupplier] = useState('');
  const [newQty, setNewQty] = useState('1');
  const [editMoney, setEditMoney] = useState(false);
  const [priceInput, setPriceInput] = useState('');
  const [depositInput, setDepositInput] = useState('');

  const fetchEvents = useCallback(async () => {
    const { data, error } = await supabase
      .from('patient_request_events')
      .select(EVENTS_SELECT)
      .eq('request_id', row.id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []) as unknown as TimelineEvent[];
  }, [row.id]);

  // لا setState متزامن قبل أول await: التحميل الأول من الـ effect، وإعادة المحاولة تضبط الحالة بنفسها
  const fetchAll = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const [detailRes, evs] = await Promise.all([
        supabase
          .from('patient_requests')
          .select(DETAIL_SELECT)
          .eq('id', row.id)
          .order('created_at', { referencedTable: 'patient_request_items', ascending: true })
          .single(),
        fetchEvents(),
      ]);
      if (mine !== seq.current) return;
      if (detailRes.error) throw detailRes.error;
      setDetail(detailRes.data as unknown as DetailRequest);
      setEvents(evs);
      setFailed(false);
    } catch {
      if (mine !== seq.current) return;
      setFailed(true);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [row.id, fetchEvents]);

  // التحميل الأول عبر callback (لا setState متزامن في جسم الـ effect)
  useEffect(() => { Promise.resolve().then(fetchAll); }, [fetchAll]);

  useEffect(() => {
    // Escape يغلق الطبقة العليا فقط: نافذة التأكيد ونافذة الإلغاء لهما معالجهما، فلا تُغلق التفاصيل معهما
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !cancelOpen && !reopenOpen && !preview && !itemCancel && !choose && !confirmDialog) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, cancelOpen, reopenOpen, preview, itemCancel, choose, confirmDialog]);

  useEffect(() => {
    if (!cancelOpen && !reopenOpen && !preview && !itemCancel && !choose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || acting) return;
      setCancelOpen(false);
      setReopenOpen(false);
      setPreview(null);
      setItemCancel(null);
      setChoose(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [cancelOpen, reopenOpen, preview, itemCancel, choose, acting]);

  const retry = () => {
    setLoading(true);
    setFailed(false);
    void fetchAll();
  };

  // بعد كل إجراء ناجح: تحديث تفاصيل الطلب والسجل داخل النافذة ثم القائمة خلفها فوراً
  const refreshAll = async () => {
    await fetchAll();
    onChanged();
    notifyRequestsChanged(); // يحدّث عدّادات التأخر خارج هذه الشاشة
  };

  const addNote = async () => {
    if (saving) return;
    if (readOnly) { notify('err', READ_ONLY_MESSAGE); return; }
    const body = note.trim();
    if (!body) { notify('err', 'اكتب الملاحظة أولاً.'); return; }
    if (body.length > NOTE_MAX) { notify('err', `الملاحظة لا تتجاوز ${NOTE_MAX} حرف.`); return; }

    setSaving(true);
    try {
      // request_id و kind و body فقط — الصيدلية والموظف والوقت تضبطها القاعدة
      const { error } = await supabase.from('patient_request_events').insert({ request_id: row.id, kind: 'note', body });
      if (error) {
        const text = `${error.message ?? ''}`;
        if (/SUBSCRIPTION_READ_ONLY/.test(text)) notify('err', friendlyError(error));
        else if (/row-level security/i.test(text)) notify('err', 'تعذّر التحقق من هويتك كموظف. سجّل الدخول من جديد ثم أعد المحاولة.');
        else if (/patient_request_events_note_body/.test(text)) notify('err', `الملاحظة مطلوبة ولا تتجاوز ${NOTE_MAX} حرف.`);
        else notify('err', 'تعذّر حفظ الملاحظة. تحقّق من اتصالك ثم حاول مرة أخرى.');
        return;
      }
      setNote('');
      try {
        await refreshAll();
        notify('ok', 'تمت إضافة الملاحظة');
      } catch {
        notify('err', 'حُفظت الملاحظة، لكن تعذّر تحديث السجل. أعد فتح الطلب لرؤيتها.');
      }
    } catch {
      notify('err', 'تعذّر حفظ الملاحظة. تحقّق من اتصالك ثم حاول مرة أخرى.');
    } finally {
      setSaving(false);
    }
  };

  const isOpen = detail?.status === 'open';
  const isFinal = !!detail && !isOpen;
  const canAct = !!detail && isOpen && !readOnly;
  const hasDelivered = !!detail && detail.items.some(it => it.stage === 'delivered');
  // الأصناف القابلة للإعادة: ألغاها إلغاء الطلب نفسه (لها مرحلة سابقة محفوظة)
  const restorable = (detail?.items ?? []).filter(it => it.stage === 'cancelled' && it.stage_before_cancel != null);
  const depositPositive = !!detail && detail.deposit != null && Number(detail.deposit) > 0;

  // يحدّث الطلب؛ شرط .eq('status') يكشف تغيّر الحالة من موظف آخر (تحديث بصفر صفوف بلا خطأ)
  const runUpdate = async (patch: Record<string, unknown>, okText: string): Promise<boolean> => {
    if (!detail || acting) return false;
    if (readOnly) { notify('err', READ_ONLY_MESSAGE); return false; }
    setActing(true);
    try {
      const { data, error } = await supabase.from('patient_requests').update(patch)
        .eq('id', row.id).eq('status', detail.status).select('id');
      if (error) { notify('err', mapActionError(error)); return false; }
      if (!data || data.length === 0) { notify('err', CONFLICT_MESSAGE); return false; }
      notify('ok', okText);
      await refreshAll();
      return true;
    } catch {
      notify('err', 'تعذّر تنفيذ الإجراء. تحقّق من اتصالك ثم حاول مرة أخرى.');
      return false;
    } finally {
      setActing(false);
    }
  };

  const submitCancel = async () => {
    if (!detail) return;
    const reason = cancelReason.trim();
    if (!reason) { notify('err', 'اكتب سبب إلغاء الطلب.'); return; }
    if (reason.length > CANCEL_REASON_MAX) { notify('err', `سبب الإلغاء لا يتجاوز ${CANCEL_REASON_MAX} حرف.`); return; }
    if (depositPositive && !depositAnswer) { notify('err', 'حدّد هل أُعيد العربون للمريض.'); return; }
    // الحالة والسبب وإجابة العربون في تحديث واحد: القاعدة تشترطها معاً
    const patch: Record<string, unknown> = { status: 'cancelled', cancel_reason: reason };
    if (depositPositive) patch.deposit_returned = depositAnswer === 'yes';
    const ok = await runUpdate(patch, 'تم إلغاء الطلب');
    if (ok) { setCancelOpen(false); setCancelReason(''); setDepositAnswer(''); }
  };

  // إعادة تفعيل طلب ملغى: عبر الدالة وحدها (تعيد الأصناف إلى مراحلها قبل الإلغاء وتكتب حدثاً واحداً بالسبب)
  // ── رسائل المريض عبر واتساب (باسم الصيدلية) ──
  // الرقم يُتحقق ويُطبَّع بمساعد src/lib/phone نفسه الذي تستعمله بقية الشاشات
  const patientPhone = row.patient?.phone_number ?? '';
  const phoneOk = !!patientPhone && validatePhone(patientPhone).valid;
  const hasAmounts = !!detail && (detail.price != null || Number(detail.deposit ?? 0) > 0);

  const messageText = preview && detail
    ? buildPatientMessage({
        kind: preview,
        patientName: row.patient?.name ?? '',
        number: detail.request_number,
        year: detail.request_year,
        items: detail.items,
        price: detail.price,
        deposit: detail.deposit,
        paid: paidTotal(detail.payments),
        includeAmounts: hasAmounts && includeAmounts,
        pharmacyName,
      })
    : '';

  const openPreview = (kind: PatientMessageKind) => {
    setIncludeAmounts(true);
    setBanner(null);
    setPreview(kind);
  };

  const sendMessage = async () => {
    if (!detail || !preview || sendingMsg) return;
    if (!phoneOk) { notify('err', 'لا يوجد رقم هاتف صالح للمريض.'); return; }
    const kind = preview;
    const amountsFlag = hasAmounts && includeAmounts;
    // يُفتح واتساب أولاً وبشكل متزامن مع الضغطة حتى لا يحجبه المتصفح كنافذة منبثقة
    window.open(`https://wa.me/${normalizePhone(patientPhone)}?text=${encodeURIComponent(messageText)}`, '_blank', 'noopener,noreferrer');
    setSendingMsg(true);
    try {
      const { error } = await supabase.from('patient_request_events').insert({
        request_id: row.id, kind: 'message_sent', details: { message: kind, amounts_included: amountsFlag },
      });
      setPreview(null);
      if (error) {
        notify('err', 'فُتح واتساب، لكن تعذّر تسجيل الرسالة في السجل.');
      } else {
        await fetchAll();
        notifyRequestsChanged();
      }
    } catch {
      setPreview(null);
      notify('err', 'فُتح واتساب، لكن تعذّر تسجيل الرسالة في السجل.');
    } finally {
      setSendingMsg(false);
    }
  };

  const openReopen = () => {
    setReopenChosen(new Set(restorable.map(it => it.id)));
    setReopenOpen(true);
  };

  const toggleReopenChosen = (id: string) => {
    setReopenChosen(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const submitReopen = async () => {
    if (!detail || acting) return;
    if (readOnly) { notify('err', READ_ONLY_MESSAGE); return; }
    const reason = reopenReason.trim();
    if (!reason) { notify('err', 'اكتب سبب إعادة التفعيل.'); return; }
    if (reason.length > CANCEL_REASON_MAX) { notify('err', `سبب إعادة التفعيل لا يتجاوز ${CANCEL_REASON_MAX} حرف.`); return; }
    const ids = restorable.filter(it => reopenChosen.has(it.id)).map(it => it.id);
    if (ids.length === 0) { notify('err', 'اختر صنفاً واحداً على الأقل لإعادته.'); return; }
    setActing(true);
    try {
      const { error } = await supabase.rpc('reopen_patient_request', { p_request_id: row.id, p_reason: reason, p_item_ids: ids });
      if (error) { notify('err', mapActionError(error)); return; }
      setReopenOpen(false);
      setReopenReason('');
      notify('ok', 'أُعيد تفعيل الطلب.');
      await refreshAll();
    } catch {
      notify('err', 'تعذّر تنفيذ الإجراء. تحقّق من اتصالك ثم حاول مرة أخرى.');
    } finally {
      setActing(false);
    }
  };

  const markDepositReturned = async () => {
    if (!detail || acting) return;
    const ok = await confirm({ title: 'تأكيد تسليم العربون', message: `تأكيد تسليم العربون ${fmtJd(Number(detail.deposit))} د.أ للمريض؟ لا يمكن التراجع عن هذا.`, confirmText: 'تأكيد التسليم' });
    if (!ok) return;
    if (readOnly) { notify('err', READ_ONLY_MESSAGE); return; }
    setActing(true);
    try {
      const { data, error } = await supabase.from('patient_requests').update({ deposit_returned: true })
        .eq('id', row.id).select('id');
      if (error) { notify('err', mapActionError(error)); return; }
      if (!data || data.length === 0) { notify('err', CONFLICT_MESSAGE); return; }
      notify('ok', 'سُجّل إرجاع العربون');
      await refreshAll();
    } catch {
      notify('err', 'تعذّر تنفيذ الإجراء. تحقّق من اتصالك ثم حاول مرة أخرى.');
    } finally {
      setActing(false);
    }
  };

  const startEditMoney = () => {
    if (!detail) return;
    setPriceInput(detail.price != null ? String(detail.price) : '');
    setDepositInput(detail.deposit != null ? String(detail.deposit) : '');
    setEditMoney(true);
  };

  const saveMoney = async () => {
    if (!detail) return;
    const p = cleanNumberInput(priceInput);
    const d = cleanNumberInput(depositInput);
    if (p && !MONEY_RE.test(p)) { notify('err', 'السعر غير صالح — أرقام فقط وحتى 3 منازل عشرية.'); return; }
    if (d && !MONEY_RE.test(d)) { notify('err', 'العربون غير صالح — أرقام فقط وحتى 3 منازل عشرية.'); return; }
    if (p && d && Number(d) > Number(p)) { notify('err', 'لا يمكن أن يزيد العربون على السعر.'); return; }

    // نرسل الحقول المتغيّرة فقط؛ الحقل الفارغ = null
    const newPrice = p ? Number(p) : null;
    const newDeposit = d ? Number(d) : null;
    const patch: Record<string, unknown> = {};
    if (newPrice !== (detail.price != null ? Number(detail.price) : null)) patch.price = newPrice;
    if (newDeposit !== (detail.deposit != null ? Number(detail.deposit) : null)) patch.deposit = newDeposit;
    if (Object.keys(patch).length === 0) { setEditMoney(false); return; }

    const ok = await runUpdate(patch, 'تم تعديل المبالغ');
    if (ok) setEditMoney(false);
  };

  // ── خطة التسليم: هل الأصناف المختارة تغطي كل ما لم يُسلَّم بعد؟ (آخر تسليم) ──
  const deliveryPlan = () => {
    const items = detail?.items ?? [];
    const eligible = eligibleFor('deliver', items);
    const checked = eligible.filter(it => chosen.has(it.id));
    const undelivered = items.filter(it => it.stage !== 'cancelled' && it.stage !== 'delivered');
    const isFinalDelivery = checked.length > 0 && undelivered.every(it => chosen.has(it.id) && it.stage === 'arrived');
    const price = detail?.price != null ? Number(detail.price) : null;
    const deposit = detail?.deposit != null ? Number(detail.deposit) : 0;
    const paidSoFar = detail ? paidTotal(detail.payments) : 0;
    const remainingNow = price != null ? Math.max(remainingAmount(price, deposit, paidSoFar), 0) : null;
    return { eligible, checked, isFinalDelivery, price, deposit, paidSoFar, remainingNow };
  };

  const openChoose = (mode: ChooseMode) => {
    if (!detail) return;
    setChosen(new Set(eligibleFor(mode, detail.items).map(it => it.id)));
    setAmountInput('');
    setSettleChecked(false);
    setChoose(mode);
  };

  const toggleChosen = (id: string) => {
    setChosen(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // تحديث مرحلة عدة أصناف دفعة واحدة؛ أقل صفوف من المختار = تعارض مع موظف آخر
  const runBulkStage = async (mode: 'order' | 'arrive', ids: string[]): Promise<boolean> => {
    const target = mode === 'order' ? 'ordered' : 'arrived';
    const from = mode === 'order' ? 'recorded' : 'ordered';
    setActing(true);
    try {
      const { data, error } = await supabase.from('patient_request_items').update({ stage: target })
        .in('id', ids).eq('stage', from).select('id');
      if (error) { notify('err', mapActionError(error)); return false; }
      if (!data || data.length < ids.length) {
        notify('err', CONFLICT_MESSAGE);
        await refreshAll();
        return false;
      }
      notify('ok', mode === 'order' ? `سُجّل طلب ${countPhrase(ids.length)} من المورد.` : `سُجّل وصول ${countPhrase(ids.length)}.`);
      if (mode === 'arrive') setBanner('arrival'); // اقتراح رسالة الوصول
      await refreshAll();
      return true;
    } catch {
      notify('err', 'تعذّر تنفيذ الإجراء. تحقّق من اتصالك ثم حاول مرة أخرى.');
      return false;
    } finally {
      setActing(false);
    }
  };

  // التسليم عبر الدالة وحدها؛ المبلغ يُحسب بحسب نوع التسليم (آخر / جزئي) وفق قواعد القاعدة
  const runDelivery = async (ids: string[]): Promise<boolean> => {
    const plan = deliveryPlan();
    let amount: number;
    if (plan.isFinalDelivery && plan.price != null) {
      amount = plan.remainingNow ?? 0;
      if (amount > 0 && !settleChecked) { notify('err', 'أكّد استلام المبلغ المتبقي من المريض أولاً.'); return false; }
    } else if (plan.isFinalDelivery) {
      const a = cleanNumberInput(amountInput);
      if (a && !MONEY_RE.test(a)) { notify('err', 'المبلغ غير صالح — أرقام فقط وحتى 3 منازل عشرية.'); return false; }
      amount = a ? Number(a) : 0;
      if (plan.deposit > 0 && !settleChecked) { notify('err', 'أكّد خصم العربون من حساب المريض أولاً.'); return false; }
    } else {
      const a = cleanNumberInput(amountInput);
      if (!a) { notify('err', 'أدخل المبلغ المستلم الآن (يمكن أن يكون صفراً).'); return false; }
      if (!MONEY_RE.test(a)) { notify('err', 'المبلغ غير صالح — أرقام فقط وحتى 3 منازل عشرية.'); return false; }
      amount = Number(a);
      if (plan.remainingNow != null && amount > plan.remainingNow) { notify('err', 'المبلغ أكبر من المتبقي على المريض.'); return false; }
    }

    setActing(true);
    try {
      const { error } = await supabase.rpc('deliver_patient_request_items', {
        p_request_id: row.id, p_item_ids: ids, p_amount: amount,
      });
      if (error) { notify('err', mapActionError(error)); return false; }
      notify('ok', plan.isFinalDelivery ? 'اكتمل تسليم الطلب.' : 'تم التسليم.');
      await refreshAll();
      return true;
    } catch {
      notify('err', 'تعذّر تنفيذ الإجراء. تحقّق من اتصالك ثم حاول مرة أخرى.');
      return false;
    } finally {
      setActing(false);
    }
  };

  const confirmChoose = async () => {
    if (!detail || acting || !choose) return;
    if (readOnly) { notify('err', READ_ONLY_MESSAGE); return; }
    const ids = eligibleFor(choose, detail.items).filter(it => chosen.has(it.id)).map(it => it.id);
    if (ids.length === 0) return;
    const ok = choose === 'deliver' ? await runDelivery(ids) : await runBulkStage(choose, ids);
    if (ok) setChoose(null);
  };

  // ── إجراءات صنف واحد: كلها مشروطة بالمرحلة الحالية لكشف تغيّرها من موظف آخر ──
  const runItemUpdate = async (itemId: string, patch: Record<string, unknown>, guardStage: ItemStage, okText: string): Promise<boolean> => {
    if (acting) return false;
    if (readOnly) { notify('err', READ_ONLY_MESSAGE); return false; }
    setActing(true);
    try {
      const { data, error } = await supabase.from('patient_request_items').update(patch)
        .eq('id', itemId).eq('stage', guardStage).select('id');
      if (error) { notify('err', mapActionError(error)); return false; }
      if (!data || data.length === 0) { notify('err', CONFLICT_MESSAGE); await refreshAll(); return false; }
      notify('ok', okText);
      await refreshAll();
      return true;
    } catch {
      notify('err', 'تعذّر تنفيذ الإجراء. تحقّق من اتصالك ثم حاول مرة أخرى.');
      return false;
    } finally {
      setActing(false);
    }
  };

  const undoItem = async (it: RequestItem) => {
    const prev = previousStage(it);
    if (!prev || acting) return;
    const ok = await confirm({ title: 'تراجع عن المرحلة', message: `إرجاع ${it.product_name} إلى «${STAGE_META[prev].label}»؟`, confirmText: 'تراجع' });
    if (!ok) return;
    await runItemUpdate(it.id, { stage: prev }, it.stage, 'تم إرجاع الصنف.');
  };

  const startEditSupplier = (it: RequestItem) => {
    setSupplierEditId(it.id);
    setSupplierInput(it.supplier ?? '');
  };

  const saveSupplier = async (it: RequestItem) => {
    const value = supplierInput.trim();
    if (value.length > SUPPLIER_MAX) { notify('err', `اسم المورد لا يتجاوز ${SUPPLIER_MAX} حرف.`); return; }
    if ((value || null) === (it.supplier ?? null)) { setSupplierEditId(null); return; }
    const ok = await runItemUpdate(it.id, { supplier: value || null }, it.stage, 'تم تحديث مورد الصنف.');
    if (ok) setSupplierEditId(null);
  };

  const submitItemCancel = async () => {
    if (!itemCancel) return;
    const reason = itemCancelReason.trim();
    if (!reason) { notify('err', 'اكتب سبب إلغاء الصنف.'); return; }
    if (reason.length > CANCEL_REASON_MAX) { notify('err', `سبب الإلغاء لا يتجاوز ${CANCEL_REASON_MAX} حرف.`); return; }
    const ok = await runItemUpdate(itemCancel.id, { stage: 'cancelled', cancel_reason: reason }, itemCancel.stage, 'تم إلغاء الصنف. عدّل السعر الإجمالي إن تغيّر.');
    if (ok) { setItemCancel(null); setItemCancelReason(''); }
  };

  const startAddItem = () => {
    // المورد يُملأ مسبقاً من آخر صنف غير ملغى
    const live = detail?.items.filter(it => it.stage !== 'cancelled') ?? [];
    setNewName('');
    setNewQty('1');
    setNewSupplier(live[live.length - 1]?.supplier ?? '');
    setAddingItem(true);
  };

  const saveNewItem = async () => {
    if (acting) return;
    if (readOnly) { notify('err', READ_ONLY_MESSAGE); return; }
    const name = newName.trim();
    const supplier = newSupplier.trim();
    const qty = cleanNumberInput(newQty);
    if (!name) { notify('err', 'أدخل اسم الصنف.'); return; }
    if (name.length > PRODUCT_NAME_MAX) { notify('err', `اسم الصنف لا يتجاوز ${PRODUCT_NAME_MAX} حرف.`); return; }
    if (supplier.length > SUPPLIER_MAX) { notify('err', `اسم المورد لا يتجاوز ${SUPPLIER_MAX} حرف.`); return; }
    if (!/^\d{1,6}$/.test(qty) || Number(qty) < 1) { notify('err', 'الكمية يجب أن تكون عدداً صحيحاً 1 أو أكثر.'); return; }

    setActing(true);
    try {
      // request_id و product_name و quantity و supplier فقط — الصيدلية والمرحلة والموظف تضبطها القاعدة
      const { error } = await supabase.from('patient_request_items').insert({
        request_id: row.id, product_name: name, quantity: Number(qty), supplier: supplier || null,
      });
      if (error) { notify('err', mapActionError(error)); return; }
      setAddingItem(false);
      notify('ok', 'أُضيف الصنف. عدّل السعر الإجمالي إن تغيّر.');
      await refreshAll();
    } catch {
      notify('err', 'تعذّر تنفيذ الإجراء. تحقّق من اتصالك ثم حاول مرة أخرى.');
    } finally {
      setActing(false);
    }
  };

  // ترقيم الملاحظات وحدها بالترتيب الزمني (الأحداث مرتّبة تصاعدياً أصلاً)
  const noteNumbers = new Map<string, number>();
  events.forEach(ev => { if (ev.kind === 'note') noteNumbers.set(ev.id, noteNumbers.size + 1); });
  // إجابة العربون الأولى عند الإلغاء (old = null) داخلة في سطر «ألغى الطلب …» فلا تتكرر؛ التغييرات اللاحقة تبقى
  const lines = buildLines(events.filter(ev => !(ev.kind === 'deposit_return_change' && ((ev.details ?? {}) as Record<string, unknown>).old == null)));

  // أزرار التذييل: الأكثر تقدماً أولاً هو الرئيسي (تسليم ثم وصول ثم طلب)
  const stages = detail?.items.map(it => it.stage) ?? [];
  const footerActions: { key: ChooseMode; label: string }[] = [];
  if (stages.includes('recorded')) footerActions.push({ key: 'order', label: 'تسجيل طلب من المورد' });
  if (stages.includes('ordered')) footerActions.push({ key: 'arrive', label: 'تسجيل وصول' });
  if (stages.includes('arrived')) footerActions.push({ key: 'deliver', label: 'تسليم للمريض' });
  const primaryKey = footerActions[footerActions.length - 1]?.key;
  const allItemsCancelled = !!detail && isOpen && detail.items.length > 0 && detail.items.every(it => it.stage === 'cancelled');

  const status = detail?.status ?? row.status;
  const meta = STATUS_META[status];
  const pendingRefund = detail ? isPendingRefund(detail) : isPendingRefund(row);
  const requestNumber = detail?.request_number ?? row.request_number;
  const requestYear = detail?.request_year ?? row.request_year;
  // أسباب التأخر تُعاد حسابها عند كل رسم (أي بعد كل fetchAll)
  const overdueReasons = detail ? getOverdueReasons(detail) : [];
  const hasPrice = detail?.price != null;
  const hasDeposit = detail?.deposit != null;
  const paid = detail ? paidTotal(detail.payments) : 0;
  const showReturned = detail?.status === 'cancelled' && hasDeposit && Number(detail.deposit) > 0 && detail.deposit_returned != null;

  // نافذة الإلغاء ونافذة التأكيد تُرسمان خارج لوحة التفاصيل: حركة saas-slide-up تُبقي transform على اللوحة
  // فيصير position:fixed لأي ابن مقيّداً بها بدل الشاشة كلها
  return (
    <>
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white sm:rounded-2xl w-full sm:max-w-2xl h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 saas-slide-up overflow-hidden"
        onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="req-details-title">

        {/* الرأس */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="min-w-0">
            <h3 id="req-details-title" className="text-base font-black text-slate-900 tabular-nums">{requestTitle(requestNumber, requestYear)}</h3>
            <p className="text-sm font-bold text-slate-900 truncate mt-0.5"><bdi>{row.patient?.name ?? 'مريض غير معروف'}</bdi></p>
            {row.patient?.phone_number && (
              <p className="flex items-center gap-1 mt-0.5 text-xs text-slate-500">
                <Phone size={14} weight="bold" className="shrink-0 text-slate-400" aria-hidden="true" />
                <span dir="ltr" className="tabular-nums">{displayPhone(row.patient.phone_number)}</span>
              </p>
            )}
            <p className="mt-1 text-[11px] text-slate-400">
              {row.creator?.name ? <>سجّله <bdi>{row.creator.name}</bdi> — </> : 'سُجّل بتاريخ '}
              <bdi className="tabular-nums">{formatDate(row.created_at)}</bdi>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${meta.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
              {pendingRefund ? 'ملغى — العربون لم يُعَد' : meta.label}
            </span>
            <button type="button" onClick={onClose} aria-label="إغلاق"
              className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-colors cursor-pointer">
              <X size={16} weight="bold" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* ملاحظات الكادر للمريض — يُعاد تركيبها لكل مريض عبر key */}
        {row.patient_id && (
          <div className="px-5 pb-3 shrink-0 max-h-56 overflow-y-auto">
            <PatientNotesBanner key={row.patient_id} patientId={row.patient_id} className="mt-3" />
          </div>
        )}

        {/* المحتوى */}
        <div className="flex-1 min-w-0 overflow-y-auto p-5 space-y-6">
          {loading ? (
            <div className="py-16 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-teal-600 rounded-full animate-spin" />
              <p className="text-sm font-medium text-slate-500">جاري تحميل تفاصيل الطلب...</p>
            </div>
          ) : failed || !detail ? (
            <div className="py-14 text-center">
              <p className="text-sm font-medium text-slate-600">لم نتمكن من تحميل تفاصيل الطلب.</p>
              <button type="button" onClick={retry}
                className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-sm font-bold transition-all cursor-pointer">
                <ArrowsClockwise size={16} weight="bold" aria-hidden="true" /> إعادة المحاولة
              </button>
            </div>
          ) : (
            <>
              {overdueReasons.length > 0 && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2.5 space-y-1">
                  {overdueReasons.map(r => (
                    <p key={`${r.type}|${r.detail}`} className="flex items-start gap-1.5 text-sm font-bold text-rose-700">
                      <WarningCircle size={16} weight="bold" className="shrink-0 mt-0.5" aria-hidden="true" />
                      <span className="min-w-0 break-words">{r.label}</span>
                    </p>
                  ))}
                </div>
              )}

              {banner && phoneOk && !readOnly && (
                <div className="flex items-center gap-3 rounded-xl bg-teal-50 border border-teal-200 px-3 py-2.5">
                  <p className="flex-1 min-w-0 text-sm font-bold text-teal-800">
                    {banner === 'confirmation' ? 'أرسل للمريض رسالة تأكيد الطلب' : 'أرسل للمريض رسالة الوصول'}
                  </p>
                  <button type="button" onClick={() => openPreview(banner)}
                    className="h-9 shrink-0 px-3 flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all cursor-pointer">
                    <WhatsappLogo size={16} weight="bold" aria-hidden="true" /> معاينة وإرسال
                  </button>
                  <button type="button" onClick={() => setBanner(null)} aria-label="إخفاء"
                    className="w-8 h-8 shrink-0 rounded-full hover:bg-teal-100 text-teal-700 flex items-center justify-center transition-colors cursor-pointer">
                    <X size={14} weight="bold" aria-hidden="true" />
                  </button>
                </div>
              )}

              {allItemsCancelled && (
                <p className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium px-3 py-2">
                  كل الأصناف ملغاة — ألغِ الطلب.
                </p>
              )}

              {/* الأصناف */}
              <section>
                <h4 className="text-xs font-bold text-slate-600 mb-2">الأصناف</h4>
                <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 space-y-3">
                  {detail.items.map(it => {
                    const time = stageTime(it);
                    const cancelled = it.stage === 'cancelled';
                    const editable = canAct && it.stage !== 'cancelled' && it.stage !== 'delivered';
                    const prev = previousStage(it);
                    return (
                      <div key={it.id} className="flex items-start gap-2">
                        <Package size={16} weight="bold" className="shrink-0 mt-0.5 text-slate-400" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm break-words ${cancelled ? 'line-through text-slate-400 font-medium' : 'font-semibold text-slate-800'}`}>
                            <bdi>{it.product_name}</bdi> × <span className="tabular-nums">{it.quantity}</span>
                          </p>

                          {supplierEditId === it.id ? (
                            <div className="mt-1.5 flex flex-wrap items-center gap-2">
                              <input type="text" value={supplierInput} onChange={e => setSupplierInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void saveSupplier(it); } }}
                                aria-label="مورد الصنف" placeholder="المورد" maxLength={SUPPLIER_MAX} autoFocus
                                className={`${INPUT_BASE} flex-1 min-w-0 py-1.5`} />
                              <button type="button" onClick={() => saveSupplier(it)} disabled={acting}
                                className="h-9 shrink-0 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                                حفظ
                              </button>
                              <button type="button" onClick={() => setSupplierEditId(null)} disabled={acting}
                                className="h-9 shrink-0 px-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                                إلغاء
                              </button>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400 mt-0.5 break-words flex items-center gap-1.5">
                              <span className="min-w-0"><bdi>{it.supplier ?? 'بلا مورد'}</bdi></span>
                              {editable && (
                                <button type="button" onClick={() => startEditSupplier(it)} disabled={acting} aria-label="تعديل المورد"
                                  className="shrink-0 text-slate-400 hover:text-slate-900 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                                  <PencilSimple size={14} weight="bold" aria-hidden="true" />
                                </button>
                              )}
                            </p>
                          )}

                          {/* السبب لبند أُلغي فرادى فقط؛ بند ألغاه إلغاء الطلب سببه سبب الطلب فلا يُكرَّر */}
                          {cancelled && it.stage_before_cancel == null && it.cancel_reason && (
                            <p className="text-xs text-rose-600 mt-0.5 break-words">السبب: <bdi>{it.cancel_reason}</bdi></p>
                          )}

                          {editable && (
                            <button type="button" onClick={() => { setItemCancel(it); setItemCancelReason(''); }} disabled={acting}
                              className="mt-1.5 text-[11px] font-bold text-rose-600 hover:text-rose-700 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                              إلغاء الصنف
                            </button>
                          )}
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-1">
                          {getExpectedChipLabel(it) && (
                            <span className="text-[10px] font-medium text-slate-500 bg-white border border-slate-200 rounded-full px-2 py-0.5">{getExpectedChipLabel(it)}</span>
                          )}
                          {getItemOverdue(it, detail) && (
                            <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-2 py-0.5">متأخر: {getItemOverdue(it, detail)}</span>
                          )}
                          <span className={`text-[10px] font-bold border rounded-full px-2 py-0.5 ${STAGE_META[it.stage].chip}`}>
                            {STAGE_META[it.stage].label}
                            {time && <> — <bdi className="tabular-nums">{formatEventTime(time)}</bdi></>}
                          </span>
                          {editable && prev && (
                            <button type="button" onClick={() => undoItem(it)} disabled={acting}
                              className="text-[11px] text-slate-400 hover:text-slate-700 underline underline-offset-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                              تراجع
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {canAct && detail.items.length < MAX_ITEMS && (
                  addingItem ? (
                    <div className="mt-3 bg-white border border-slate-200 rounded-xl p-3 space-y-2">
                      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                        <ProductNameInput value={newName} onChange={setNewName} onEnter={() => { void saveNewItem(); }}
                          stats={productStats} ariaLabel="اسم الصنف الجديد" maxLength={PRODUCT_NAME_MAX} autoFocus />
                        <input type="text" value={newSupplier} onChange={e => setNewSupplier(e.target.value)}
                          aria-label="مورد الصنف الجديد" placeholder="المورد" maxLength={SUPPLIER_MAX}
                          className={`${INPUT_BASE} order-last basis-full sm:order-none sm:basis-auto sm:w-32 sm:shrink-0 min-w-0`} />
                        <input type="text" inputMode="numeric" value={newQty} onChange={e => setNewQty(cleanNumberInput(e.target.value))}
                          aria-label="كمية الصنف الجديد" className={`${INPUT_BASE} w-20 shrink-0 text-center tabular-nums`} />
                      </div>
                      <ProductHint value={newName} stats={productStats} />
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={saveNewItem} disabled={acting}
                          className="h-9 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-all active:scale-[0.98] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                          {acting ? 'جاري الحفظ...' : 'حفظ الصنف'}
                        </button>
                        <button type="button" onClick={() => setAddingItem(false)} disabled={acting}
                          className="h-9 px-4 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                          إلغاء
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={startAddItem} disabled={acting}
                      className="mt-3 inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                      <Plus size={14} weight="bold" aria-hidden="true" /> إضافة صنف
                    </button>
                  )
                )}
              </section>

              {/* المبالغ */}
              {(hasPrice || hasDeposit || paid > 0 || canAct) && (
                <section>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <h4 className="text-xs font-bold text-slate-600">المبالغ</h4>
                    {canAct && !editMoney && (
                      <button type="button" onClick={startEditMoney} disabled={acting}
                        className="text-xs font-bold text-teal-700 hover:text-teal-800 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                        تعديل
                      </button>
                    )}
                  </div>

                  {editMoney ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="req-edit-price" className="block text-xs font-bold text-slate-600 mb-1.5">السعر الإجمالي بالدينار</label>
                          <input id="req-edit-price" type="text" inputMode="decimal" placeholder="0.000" value={priceInput}
                            onChange={e => setPriceInput(cleanNumberInput(e.target.value))} className={`${INPUT_CLS} text-center tabular-nums`} />
                        </div>
                        <div>
                          <label htmlFor="req-edit-deposit" className="block text-xs font-bold text-slate-600 mb-1.5">العربون بالدينار</label>
                          <input id="req-edit-deposit" type="text" inputMode="decimal" placeholder="0.000" value={depositInput}
                            onChange={e => setDepositInput(cleanNumberInput(e.target.value))} className={`${INPUT_CLS} text-center tabular-nums`} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={saveMoney} disabled={acting}
                          className="h-9 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-all active:scale-[0.98] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                          {acting ? 'جاري الحفظ...' : 'حفظ'}
                        </button>
                        <button type="button" onClick={() => setEditMoney(false)} disabled={acting}
                          className="h-9 px-4 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                          إلغاء
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-400">اترك الحقل فارغاً لحذف القيمة.</p>
                    </div>
                  ) : (
                    <>
                      {pendingRefund && (
                        <div className="mb-3 rounded-xl bg-rose-50 border border-rose-200 p-3 space-y-3">
                          <p className="text-sm font-bold text-rose-700">
                            العربون <span className="tabular-nums" dir="ltr">{fmtJd(Number(detail.deposit))}</span> د.أ لم يُرجَع للمريض بعد.
                          </p>
                          {!readOnly && (
                            <div className="flex flex-wrap gap-2">
                              <button type="button" onClick={markDepositReturned} disabled={acting}
                                className="h-10 flex-1 min-w-[9rem] px-3 flex items-center justify-center rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold transition-all active:scale-[0.98] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                                سلّمتُ العربون للمريض
                              </button>
                              {restorable.length > 0 && (
                                <button type="button" onClick={openReopen} disabled={acting}
                                  className="h-10 flex-1 min-w-[9rem] px-3 flex items-center justify-center rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                                  إعادة تفعيل الطلب
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {(hasPrice || hasDeposit || paid > 0) ? (
                        <div className="flex flex-wrap gap-2">
                          {hasPrice && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs text-slate-600">
                              السعر الإجمالي <span className="font-bold text-slate-900 tabular-nums" dir="ltr">{fmtJd(detail.price as number)}</span> د.أ
                            </span>
                          )}
                          {hasDeposit && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs text-slate-600">
                              العربون <span className="font-bold text-slate-900 tabular-nums" dir="ltr">{fmtJd(detail.deposit as number)}</span> د.أ
                            </span>
                          )}
                          {paid > 0 && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs text-slate-600">
                              المدفوع عند التسليم <span className="font-bold text-slate-900 tabular-nums" dir="ltr">{fmtJd(paid)}</span> د.أ
                            </span>
                          )}
                          {/* الطلب الملغى لا «متبقي» له: نعرض حالة العربون بدلاً منه */}
                          {detail.status !== 'cancelled' && hasPrice && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-200 text-xs text-teal-700">
                              المتبقي <span className="font-bold tabular-nums" dir="ltr">{fmtJd(remainingAmount(detail.price as number, detail.deposit, paid))}</span> د.أ
                            </span>
                          )}
                          {showReturned && (detail.deposit_returned ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500">
                              أُعيد العربون <span className="font-bold tabular-nums" dir="ltr">{fmtJd(detail.deposit as number)}</span> د.أ
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                              عربون بانتظار الإرجاع <span className="font-bold tabular-nums" dir="ltr">{fmtJd(detail.deposit as number)}</span> د.أ
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400">لم تُسجَّل مبالغ لهذا الطلب.</p>
                      )}
                    </>
                  )}
                </section>
              )}

              {/* رسائل المريض */}
              {!readOnly && (isOpen || detail.items.some(it => it.stage === 'arrived')) && (
                <section>
                  <h4 className="text-xs font-bold text-slate-600 mb-2">رسائل المريض</h4>
                  <div className="flex flex-wrap gap-2">
                    {isOpen && (
                      <button type="button" onClick={() => openPreview('confirmation')} disabled={!phoneOk || acting}
                        className="h-10 flex-1 min-w-[9rem] px-3 flex items-center justify-center gap-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                        <WhatsappLogo size={16} weight="bold" aria-hidden="true" /> رسالة تأكيد الطلب
                      </button>
                    )}
                    {detail.items.some(it => it.stage === 'arrived') && (
                      <button type="button" onClick={() => openPreview('arrival')} disabled={!phoneOk || acting}
                        className="h-10 flex-1 min-w-[9rem] px-3 flex items-center justify-center gap-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                        <WhatsappLogo size={16} weight="bold" aria-hidden="true" /> رسالة الوصول
                      </button>
                    )}
                  </div>
                  {!phoneOk && <p className="mt-2 text-xs text-slate-400">لا يوجد رقم هاتف صالح للمريض.</p>}
                </section>
              )}

              {/* سجل المتابعة */}
              <section>
                <h4 className="text-xs font-bold text-slate-600 mb-3">سجل المتابعة</h4>
                {lines.length === 0 ? (
                  <p className="text-xs text-slate-400">لا توجد أحداث بعد.</p>
                ) : (
                  <ol className="space-y-3">
                    {lines.map(line => {
                      const ev = line.ev;
                      const isNote = ev.kind === 'note';
                      return (
                        <li key={line.key} className="flex items-start gap-3">
                          <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${isNote ? 'bg-teal-600' : 'bg-slate-300'}`} />
                          <div className="min-w-0 flex-1">
                            {isNote ? (
                              <div className="bg-teal-50 border border-teal-200 rounded-xl px-3 py-2.5">
                                <span className="text-[10px] font-semibold text-teal-700">ملاحظة <span className="tabular-nums">{noteNumbers.get(ev.id)}</span></span>
                                <p className="text-sm text-slate-800 mt-0.5 whitespace-pre-line break-words"><bdi>{ev.body}</bdi></p>
                              </div>
                            ) : (
                              <p className="text-sm text-slate-700 break-words">{describeLine(line, requestYear)}</p>
                            )}
                            <p className="text-[11px] text-slate-400 mt-1">
                              {ev.staff?.name ? <><bdi>{ev.staff.name}</bdi> · </> : ''}
                              <bdi className="tabular-nums">{formatEventTime(ev.created_at)}</bdi>
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}

                {/* إضافة ملاحظة */}
                <div className="mt-5 pt-4 border-t border-slate-100">
                  <label htmlFor="req-detail-note" className="block text-xs font-bold text-slate-600 mb-1.5">إضافة ملاحظة</label>
                  <textarea id="req-detail-note" value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={NOTE_MAX}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 focus:outline-none transition-all resize-none" />
                  <div className="flex items-center justify-between gap-3 mt-2">
                    <p className="text-[11px] text-slate-400">لا يمكن تعديل الملاحظة أو حذفها بعد حفظها.</p>
                    <button type="button" onClick={addNote} disabled={saving || readOnly} title={readOnly ? READ_ONLY_MESSAGE : undefined}
                      className="h-10 shrink-0 px-4 flex items-center justify-center rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold transition-all active:scale-[0.98] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                      {saving ? 'جاري الحفظ...' : 'إضافة ملاحظة'}
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>

        {/* التذييل: إجراءات الأصناف + إلغاء الطلب (مفتوح)، أو سطر الحالة النهائية */}
        {detail && !failed && canAct && (footerActions.length > 0 || !hasDelivered) && (
          <div className="px-5 py-4 border-t border-slate-100 shrink-0 bg-white space-y-2">
            {footerActions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {footerActions.map(a => (
                  <button key={a.key} type="button" onClick={() => openChoose(a.key)} disabled={acting}
                    className={`h-11 flex-1 min-w-[9rem] px-3 flex items-center justify-center rounded-xl text-sm font-bold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                      a.key === primaryKey
                        ? 'bg-teal-600 hover:bg-teal-700 text-white active:scale-[0.98]'
                        : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-700'
                    }`}>
                    {a.label}
                  </button>
                ))}
              </div>
            )}
            {!hasDelivered && (
              <button type="button" onClick={() => setCancelOpen(true)} disabled={acting}
                className="h-11 w-full flex items-center justify-center rounded-xl bg-white hover:bg-rose-50 border border-rose-200 text-rose-600 text-sm font-bold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                إلغاء الطلب
              </button>
            )}
          </div>
        )}
        {detail && !failed && isFinal && (
          <div className="px-5 py-3 border-t border-slate-100 shrink-0 bg-slate-50 space-y-2">
            <p className="text-xs text-slate-500 break-words">
              {detail.status === 'delivered'
                ? <>سُلّم للمريض{detail.delivered_at && <> — <bdi className="tabular-nums">{formatEventTime(detail.delivered_at)}</bdi></>}</>
                : <>أُلغي{detail.cancelled_at && <> — <bdi className="tabular-nums">{formatEventTime(detail.cancelled_at)}</bdi></>}{detail.cancel_reason && <> — السبب: <bdi>{detail.cancel_reason}</bdi></>}</>}
            </p>
            {/* إعادة التفعيل: طلب ملغى بلا عربون. مع عربون لم يُرجَع يظهر الزر في صندوق العربون، ومع عربون أُرجع لا إعادة */}
            {detail.status === 'cancelled' && !depositPositive && !readOnly && restorable.length > 0 && (
              <button type="button" onClick={openReopen} disabled={acting}
                className="h-10 w-full flex items-center justify-center rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                إعادة تفعيل الطلب
              </button>
            )}
            {detail.status === 'cancelled' && depositPositive && detail.deposit_returned === true && (
              <p className="text-xs text-slate-400">أُرجع العربون للمريض — لإعادة الطلب سجّل طلباً جديداً.</p>
            )}
          </div>
        )}
      </div>
    </div>

    {/* نافذة معاينة رسالة المريض */}
    {preview && detail && (
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[55] flex items-end sm:items-center justify-center sm:p-4" onClick={() => { if (!sendingMsg) setPreview(null); }}>
        <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[92dvh] flex flex-col shadow-2xl border border-slate-200 saas-slide-up" onClick={e => e.stopPropagation()}
          role="dialog" aria-modal="true" aria-labelledby="req-preview-title">
          <div className="px-5 py-4 border-b border-slate-100 shrink-0">
            <h3 id="req-preview-title" className="text-sm font-bold text-slate-900">{preview === 'confirmation' ? 'رسالة تأكيد الطلب' : 'رسالة الوصول'}</h3>
          </div>
          <div className="p-5 space-y-4 overflow-y-auto min-w-0">
            <div dir="rtl" className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-sm text-slate-800 whitespace-pre-line break-words leading-relaxed">
              {messageText}
            </div>
            {hasAmounts && (
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" className="mt-0.5 w-4 h-4 shrink-0 accent-teal-600"
                  checked={includeAmounts} onChange={e => setIncludeAmounts(e.target.checked)} />
                <span className="text-sm text-slate-800">تضمين المبالغ في الرسالة</span>
              </label>
            )}
          </div>
          <div className="px-5 py-4 border-t border-slate-100 grid grid-cols-2 gap-3 shrink-0">
            <button type="button" onClick={() => setPreview(null)} disabled={sendingMsg}
              className="h-11 flex items-center justify-center rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-sm font-bold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
              إلغاء
            </button>
            <button type="button" onClick={sendMessage} disabled={sendingMsg || !phoneOk}
              className="h-11 flex items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold transition-all active:scale-[0.98] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
              <WhatsappLogo size={18} weight="bold" aria-hidden="true" /> فتح واتساب
            </button>
          </div>
        </div>
      </div>
    )}

    {/* نافذة إعادة تفعيل الطلب */}
    {reopenOpen && (
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[55] flex items-end sm:items-center justify-center sm:p-4" onClick={() => { if (!acting) setReopenOpen(false); }}>
        <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl border border-slate-200 saas-slide-up" onClick={e => e.stopPropagation()}
          role="dialog" aria-modal="true" aria-labelledby="req-reopen-title">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 id="req-reopen-title" className="text-sm font-bold text-slate-900 tabular-nums">إعادة تفعيل طلب المواد رقم {requestNumber}/{requestYear}</h3>
          </div>
          <div className="p-5 space-y-4 max-h-[70dvh] overflow-y-auto min-w-0">
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-600">الأصناف التي تعود</p>
              {restorable.map(it => (
                <label key={it.id} className="flex items-start gap-2.5 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 w-4 h-4 shrink-0 accent-teal-600"
                    checked={reopenChosen.has(it.id)} disabled={acting} onChange={() => toggleReopenChosen(it.id)} />
                  <span className="text-sm text-slate-800 min-w-0 break-words">
                    <bdi>{it.product_name}</bdi> × <span className="tabular-nums">{it.quantity}</span>
                    {it.supplier && <span className="text-xs text-slate-400"> · <bdi>{it.supplier}</bdi></span>}
                    <span className="text-xs text-slate-400"> — يعود إلى «{STAGE_META[it.stage_before_cancel as ItemStage]?.label ?? it.stage_before_cancel}»</span>
                  </span>
                </label>
              ))}
            </div>
            <div>
            <label htmlFor="req-reopen-reason" className="block text-xs font-bold text-slate-600 mb-1.5">سبب إعادة التفعيل</label>
            <textarea id="req-reopen-reason" value={reopenReason} onChange={e => setReopenReason(e.target.value)} rows={3}
              maxLength={CANCEL_REASON_MAX} autoFocus placeholder="مثال: المورد وفّر الصنف" className={`${INPUT_CLS} resize-none`} />
            <p className="text-[11px] text-slate-400 mt-1">الأصناف غير المختارة تبقى ملغاة.</p>
            </div>
          </div>
          <div className="px-5 py-4 border-t border-slate-100 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setReopenOpen(false)} disabled={acting}
              className="h-11 flex items-center justify-center rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-sm font-bold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
              إلغاء
            </button>
            <button type="button" onClick={submitReopen} disabled={acting || reopenChosen.size === 0 || !reopenReason.trim()}
              className="h-11 flex items-center justify-center rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold transition-all active:scale-[0.98] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
              {acting ? 'جاري التنفيذ...' : 'إعادة التفعيل'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* نافذة إلغاء الطلب */}
    {cancelOpen && (
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[55] flex items-end sm:items-center justify-center sm:p-4" onClick={() => { if (!acting) setCancelOpen(false); }}>
        <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl border border-slate-200 saas-slide-up" onClick={e => e.stopPropagation()}
          role="dialog" aria-modal="true" aria-labelledby="req-cancel-title">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 id="req-cancel-title" className="text-sm font-bold text-slate-900">إلغاء الطلب</h3>
            <p className="text-xs text-slate-500 mt-1">الإلغاء نهائي ولا يمكن التراجع عنه.</p>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label htmlFor="req-cancel-reason" className="block text-xs font-bold text-slate-600 mb-1.5">سبب الإلغاء</label>
              <textarea id="req-cancel-reason" value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={3}
                maxLength={CANCEL_REASON_MAX} autoFocus className={`${INPUT_CLS} resize-none`} />
            </div>
            {depositPositive && (
              <fieldset>
                <legend className="block text-xs font-bold text-slate-600 mb-1.5">هل أُعيد العربون للمريض؟</legend>
                <div className="grid grid-cols-2 gap-2">
                  {([{ v: 'yes' as const, label: 'نعم' }, { v: 'no' as const, label: 'لا' }]).map(o => (
                    <button key={o.v} type="button" onClick={() => setDepositAnswer(o.v)} aria-pressed={depositAnswer === o.v}
                      className={`h-10 rounded-xl border text-sm font-bold transition-all cursor-pointer ${depositAnswer === o.v ? 'bg-slate-900 border-slate-900 text-white' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
          </div>
          <div className="px-5 py-4 border-t border-slate-100 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setCancelOpen(false)} disabled={acting}
              className="h-11 flex items-center justify-center rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-sm font-bold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
              رجوع
            </button>
            <button type="button" onClick={submitCancel} disabled={acting}
              className="h-11 flex items-center justify-center rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold transition-all active:scale-[0.98] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
              {acting ? 'جاري الإلغاء...' : 'تأكيد الإلغاء'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* نافذة اختيار الأصناف: طلب / وصول / تسليم */}
    {choose && detail && (() => {
      const eligible = eligibleFor(choose, detail.items);
      const checkedCount = eligible.filter(it => chosen.has(it.id)).length;
      const plan = deliveryPlan();
      const isDeliver = choose === 'deliver';
      // اشتراطات التسليم: تأكيد استلام المتبقي، أو خصم العربون، أو مبلغ جزئي إلزامي
      const needsSettle = isDeliver && plan.isFinalDelivery && (
        plan.price != null ? (plan.remainingNow ?? 0) > 0 : plan.deposit > 0
      );
      const partialNeedsAmount = isDeliver && !plan.isFinalDelivery;
      const confirmDisabled = acting || checkedCount === 0
        || (needsSettle && !settleChecked)
        || (partialNeedsAmount && amountInput.trim() === '');
      return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[55] flex items-end sm:items-center justify-center sm:p-4" onClick={() => { if (!acting) setChoose(null); }}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[92dvh] flex flex-col shadow-2xl border border-slate-200 saas-slide-up" onClick={e => e.stopPropagation()}
            role="dialog" aria-modal="true" aria-labelledby="req-choose-title">
            <div className="px-5 py-4 border-b border-slate-100 shrink-0">
              <h3 id="req-choose-title" className="text-sm font-bold text-slate-900">{CHOOSE_TITLES[choose]}</h3>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto min-w-0">
              <div className="space-y-2">
                {eligible.map(it => (
                  <label key={it.id} className="flex items-start gap-2.5 cursor-pointer">
                    <input type="checkbox" className="mt-0.5 w-4 h-4 shrink-0 accent-teal-600"
                      checked={chosen.has(it.id)} disabled={acting} onChange={() => toggleChosen(it.id)} />
                    <span className="text-sm text-slate-800 min-w-0 break-words">
                      <bdi>{it.product_name}</bdi> × <span className="tabular-nums">{it.quantity}</span>
                      {it.supplier && <span className="text-xs text-slate-400"> · <bdi>{it.supplier}</bdi></span>}
                    </span>
                  </label>
                ))}
              </div>

              {isDeliver && (
                <div className="space-y-3 bg-slate-50 border border-slate-100 rounded-xl p-3">
                  <div className="flex flex-wrap gap-2">
                    {plan.price != null && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs text-slate-600">
                        السعر الإجمالي <span className="font-bold text-slate-900 tabular-nums" dir="ltr">{fmtJd(plan.price)}</span> د.أ
                      </span>
                    )}
                    {detail.deposit != null && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs text-slate-600">
                        العربون <span className="font-bold text-slate-900 tabular-nums" dir="ltr">{fmtJd(plan.deposit)}</span> د.أ
                      </span>
                    )}
                    {plan.paidSoFar > 0 && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs text-slate-600">
                        المدفوع سابقاً <span className="font-bold text-slate-900 tabular-nums" dir="ltr">{fmtJd(plan.paidSoFar)}</span> د.أ
                      </span>
                    )}
                    {plan.price != null && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-200 text-xs text-teal-700">
                        المتبقي <span className="font-bold tabular-nums" dir="ltr">{fmtJd(plan.remainingNow ?? 0)}</span> د.أ
                      </span>
                    )}
                  </div>

                  {plan.isFinalDelivery && plan.price != null && (
                    <div className="space-y-2">
                      {(plan.remainingNow ?? 0) > 0 ? (
                        <label className="flex items-start gap-2.5 cursor-pointer">
                          <input type="checkbox" className="mt-0.5 w-4 h-4 shrink-0 accent-teal-600"
                            checked={settleChecked} disabled={acting} onChange={e => setSettleChecked(e.target.checked)} />
                          <span className="text-sm text-slate-800 min-w-0">
                            استلمتُ المبلغ المتبقي <span className="font-bold tabular-nums" dir="ltr">{fmtJd(plan.remainingNow ?? 0)}</span> د.أ من المريض
                          </span>
                        </label>
                      ) : (
                        <p className="text-sm font-bold text-emerald-700">المبلغ مدفوع بالكامل.</p>
                      )}
                      <p className="text-[11px] text-slate-400">لإعطاء خصم، عدّل السعر الإجمالي أولاً.</p>
                    </div>
                  )}

                  {plan.isFinalDelivery && plan.price == null && (
                    <div className="space-y-2">
                      <div>
                        <label htmlFor="req-deliver-amount" className="block text-xs font-bold text-slate-600 mb-1.5">المبلغ المستلم الآن (اختياري)</label>
                        <input id="req-deliver-amount" type="text" inputMode="decimal" placeholder="0.000" value={amountInput}
                          onChange={e => setAmountInput(cleanNumberInput(e.target.value))} className={`${INPUT_CLS} text-center tabular-nums`} />
                      </div>
                      {plan.deposit > 0 && (
                        <label className="flex items-start gap-2.5 cursor-pointer">
                          <input type="checkbox" className="mt-0.5 w-4 h-4 shrink-0 accent-teal-600"
                            checked={settleChecked} disabled={acting} onChange={e => setSettleChecked(e.target.checked)} />
                          <span className="text-sm text-slate-800 min-w-0">
                            خصمتُ العربون <span className="font-bold tabular-nums" dir="ltr">{fmtJd(plan.deposit)}</span> د.أ من حساب المريض
                          </span>
                        </label>
                      )}
                    </div>
                  )}

                  {!plan.isFinalDelivery && (
                    <div>
                      <label htmlFor="req-deliver-amount" className="block text-xs font-bold text-slate-600 mb-1.5">المبلغ المستلم الآن</label>
                      <input id="req-deliver-amount" type="text" inputMode="decimal" placeholder="0.000" value={amountInput}
                        onChange={e => setAmountInput(cleanNumberInput(e.target.value))} className={`${INPUT_CLS} text-center tabular-nums`} />
                      <p className="text-[11px] text-slate-400 mt-1">يمكن أن يكون صفراً إذا سيدفع المريض عند الاستلام الأخير.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-slate-100 grid grid-cols-2 gap-3 shrink-0">
              <button type="button" onClick={() => setChoose(null)} disabled={acting}
                className="h-11 flex items-center justify-center rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-sm font-bold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                إلغاء
              </button>
              <button type="button" onClick={confirmChoose} disabled={confirmDisabled}
                className="h-11 flex items-center justify-center rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold transition-all active:scale-[0.98] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                {acting ? 'جاري التنفيذ...' : 'تأكيد'}
              </button>
            </div>
          </div>
        </div>
      );
    })()}

    {/* نافذة إلغاء صنف */}
    {itemCancel && (
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[55] flex items-end sm:items-center justify-center sm:p-4" onClick={() => { if (!acting) setItemCancel(null); }}>
        <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl border border-slate-200 saas-slide-up" onClick={e => e.stopPropagation()}
          role="dialog" aria-modal="true" aria-labelledby="req-item-cancel-title">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 id="req-item-cancel-title" className="text-sm font-bold text-slate-900">إلغاء الصنف</h3>
            <p className="text-xs text-slate-500 mt-1 break-words"><bdi>{itemCancel.product_name}</bdi> × <span className="tabular-nums">{itemCancel.quantity}</span> — الإلغاء نهائي ولا يمكن التراجع عنه.</p>
          </div>
          <div className="p-5">
            <label htmlFor="req-item-cancel-reason" className="block text-xs font-bold text-slate-600 mb-1.5">سبب الإلغاء</label>
            <textarea id="req-item-cancel-reason" value={itemCancelReason} onChange={e => setItemCancelReason(e.target.value)} rows={3}
              maxLength={CANCEL_REASON_MAX} autoFocus className={`${INPUT_CLS} resize-none`} />
          </div>
          <div className="px-5 py-4 border-t border-slate-100 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setItemCancel(null)} disabled={acting}
              className="h-11 flex items-center justify-center rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-sm font-bold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
              رجوع
            </button>
            <button type="button" onClick={submitItemCancel} disabled={acting}
              className="h-11 flex items-center justify-center rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold transition-all active:scale-[0.98] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
              {acting ? 'جاري الإلغاء...' : 'تأكيد إلغاء الصنف'}
            </button>
          </div>
        </div>
      </div>
    )}

    {confirmDialog}
    </>
  );
}
