'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { displayPhone } from '@/lib/phone';
import { calendarDaysSince } from '@/lib/calendar-days';
import { friendlyError, READ_ONLY_MESSAGE, useSubscriptionState } from '@/lib/subscription-state';
import { Phone, Package, X, ArrowsClockwise } from '@phosphor-icons/react';
import { RequestRow, RequestStatus, STATUS_META, fmtJd, remaining } from './shared';

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════
interface DetailItem {
  id: string;
  product_name: string;
  quantity: number;
  cancelled: boolean;
  cancel_reason: string | null;
  supplier: string | null;
  arrived: boolean;
}

interface DetailRequest {
  id: string;
  price: number | null;
  deposit: number | null;
  deposit_returned: boolean | null;
  status: RequestStatus;
  items: DetailItem[];
}

interface TimelineEvent {
  id: string;
  kind: string;
  body: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  staff: { name: string } | null;
}

const NOTE_MAX = 1000;
const EVENTS_SELECT = 'id, kind, body, details, created_at, staff:pharmacy_staff!patient_request_events_staff_id_fkey(name)';

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
const stageLabel = (v: unknown): string => STATUS_META[v as RequestStatus]?.label ?? str(v);

// تغيّر مبلغ: إضافة / حذف / تعديل
function moneyChange(label: string, d: Record<string, unknown>): string {
  const hadOld = d.old != null;
  const hasNew = d.new != null;
  if (!hadOld && hasNew) return `أضاف ${label} ${money(d.new)}`;
  if (hadOld && !hasNew) return `حذف ${label}`;
  if (hadOld && hasNew) return `غيّر ${label} من ${fmtJd(Number(d.old))} إلى ${money(d.new)}`;
  return `عدّل ${label}`;
}

// جملة عربية لكل نوع حدث؛ النوع المجهول يعطي سطراً عاماً ولا يكسر العرض أبداً
function describeEvent(ev: TimelineEvent): string {
  const d = (ev.details ?? {}) as Record<string, unknown>;
  const name = str(d.product_name);
  switch (ev.kind) {
    case 'created':
      return 'سجّل الطلب';
    case 'stage_change':
      return `غيّر المرحلة من ${stageLabel(d.from)} إلى ${stageLabel(d.to)}`;
    case 'price_change':
      return moneyChange('السعر الإجمالي', d);
    case 'deposit_change':
      return moneyChange('العربون', d);
    case 'deposit_return_change':
      if (d.new === true) return 'سجّل أن العربون أُعيد للمريض';
      if (d.new === false) return 'سجّل أن العربون لم يُعَد';
      return 'ألغى تسجيل إرجاع العربون';
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
    case 'item_arrival_change':
      return d.arrived === true ? `أشّر وصول ${name}` : `ألغى تأشير وصول ${name}`;
    default:
      return 'أجرى تحديثاً على الطلب';
  }
}

// ═══════════════════════════════════════════════════════
// MODAL
// ═══════════════════════════════════════════════════════
export default function RequestDetailsModal({ row, onClose, notify }: {
  row: RequestRow;
  onClose: () => void;
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
          .select('id, price, deposit, deposit_returned, status, items:patient_request_items(id, product_name, quantity, cancelled, cancel_reason, supplier, arrived)')
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
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const retry = () => {
    setLoading(true);
    setFailed(false);
    void fetchAll();
  };

  const addNote = async () => {
    if (saving) return;
    if (readOnly) { notify('err', READ_ONLY_MESSAGE); return; }
    const body = note.trim();
    if (!body) { notify('err', 'اكتب الملاحظة أولاً.'); return; }
    if (body.length > NOTE_MAX) { notify('err', `الملاحظة لا تتجاوز ${NOTE_MAX} حرف.`); return; }

    setSaving(true);
    try {
      // request_id و kind و body فقط — الصيدلية والمرحلة والموظف والوقت تضبطها القاعدة
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
        setEvents(await fetchEvents());
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

  // ترقيم الملاحظات وحدها بالترتيب الزمني (الأحداث مرتّبة تصاعدياً أصلاً)
  const noteNumbers = new Map<string, number>();
  events.forEach(ev => { if (ev.kind === 'note') noteNumbers.set(ev.id, noteNumbers.size + 1); });

  const status = detail?.status ?? row.status;
  const meta = STATUS_META[status];
  const hasPrice = detail?.price != null;
  const hasDeposit = detail?.deposit != null;
  const showReturned = detail?.status === 'cancelled' && hasDeposit && Number(detail.deposit) > 0 && detail.deposit_returned != null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white sm:rounded-2xl w-full sm:max-w-2xl h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 saas-slide-up overflow-hidden"
        onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="req-details-title">

        {/* الرأس */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="min-w-0">
            <h3 id="req-details-title" className="text-sm font-bold text-slate-900 truncate">{row.patient?.name ?? 'مريض غير معروف'}</h3>
            {row.patient?.phone_number && (
              <p className="flex items-center gap-1 mt-0.5 text-xs text-slate-500">
                <Phone size={14} weight="bold" className="shrink-0 text-slate-400" aria-hidden="true" />
                <span dir="ltr" className="tabular-nums">{displayPhone(row.patient.phone_number)}</span>
              </p>
            )}
            <p className="mt-1 text-[11px] text-slate-400">
              {row.creator?.name ? `سجّله ${row.creator.name} — ` : 'سُجّل بتاريخ '}
              <bdi className="tabular-nums">{formatDate(row.created_at)}</bdi>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${meta.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
              {meta.label}
            </span>
            <button type="button" onClick={onClose} aria-label="إغلاق"
              className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-colors cursor-pointer">
              <X size={16} weight="bold" aria-hidden="true" />
            </button>
          </div>
        </div>

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
              {/* الأصناف */}
              <section>
                <h4 className="text-xs font-bold text-slate-600 mb-2">الأصناف</h4>
                <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 space-y-2.5">
                  {detail.items.map(it => (
                    <div key={it.id} className="flex items-start gap-2">
                      <Package size={16} weight="bold" className="shrink-0 mt-0.5 text-slate-400" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm break-words ${it.cancelled ? 'line-through text-slate-400 font-medium' : 'font-semibold text-slate-800'}`}>
                          {it.product_name} × <span className="tabular-nums">{it.quantity}</span>
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5 break-words">{it.supplier ?? 'بلا مورد'}</p>
                        {it.cancelled && it.cancel_reason && (
                          <p className="text-xs text-rose-600 mt-0.5 break-words">السبب: {it.cancel_reason}</p>
                        )}
                      </div>
                      {it.cancelled && (
                        <span className="shrink-0 text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-full px-1.5 py-0.5">ملغى</span>
                      )}
                      {it.arrived && !it.cancelled && (
                        <span className="shrink-0 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5">وصل</span>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* المبالغ */}
              {(hasPrice || hasDeposit) && (
                <section>
                  <h4 className="text-xs font-bold text-slate-600 mb-2">المبالغ</h4>
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
                    {hasPrice && hasDeposit && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-200 text-xs text-teal-700">
                        المتبقي <span className="font-bold tabular-nums" dir="ltr">{fmtJd(remaining(detail.price as number, detail.deposit as number))}</span> د.أ
                      </span>
                    )}
                  </div>
                  {showReturned && (
                    <p className={`mt-2 text-xs font-bold ${detail.deposit_returned ? 'text-emerald-700' : 'text-rose-600'}`}>
                      العربون: {detail.deposit_returned ? 'أُعيد للمريض' : 'لم يُعَد'}
                    </p>
                  )}
                </section>
              )}

              {/* سجل المتابعة */}
              <section>
                <h4 className="text-xs font-bold text-slate-600 mb-3">سجل المتابعة</h4>
                {events.length === 0 ? (
                  <p className="text-xs text-slate-400">لا توجد أحداث بعد.</p>
                ) : (
                  <ol className="space-y-3">
                    {events.map(ev => {
                      const isNote = ev.kind === 'note';
                      return (
                        <li key={ev.id} className="flex items-start gap-3">
                          <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${isNote ? 'bg-teal-600' : 'bg-slate-300'}`} />
                          <div className="min-w-0 flex-1">
                            {isNote ? (
                              <div className="bg-teal-50 border border-teal-200 rounded-xl px-3 py-2.5">
                                <span className="text-[10px] font-semibold text-teal-700">ملاحظة <span className="tabular-nums">{noteNumbers.get(ev.id)}</span></span>
                                <p className="text-sm text-slate-800 mt-0.5 whitespace-pre-line break-words">{ev.body}</p>
                              </div>
                            ) : (
                              <p className="text-sm text-slate-700 break-words">{describeEvent(ev)}</p>
                            )}
                            <p className="text-[11px] text-slate-400 mt-1">
                              {ev.staff?.name ? `${ev.staff.name} · ` : ''}
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
                  <textarea id="req-detail-note" value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={NOTE_MAX} dir="auto"
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
      </div>
    </div>
  );
}
