'use client';

import { useState, useEffect } from 'react';
import { Patient, ChronicMed, calcDaysLeft, pluralizeDays } from '@/lib/chronic';

export default function WaMsgModal({ patient, meds, pharmacyName, msgType, onClose, onConfirm }: {
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
  const names = previewMeds.map(m => m.medication_name).join(' و'); // لا يزال يُستخدم في msg2 فقط
  const firstName = patient.name.split(' ')[0];

  // حالة الدواء بصياغة القائمة (سطر لكل دواء): "يكفي {مدة}" بلا "كم"
  const medStatusForList = (m: ChronicMed): string => {
    const d = calcDaysLeft(m.next_refill_date);
    if (d < 0) return 'بحاجة للتجديد';
    if (d === 0) return 'ينفد اليوم';
    return `يكفي ${pluralizeDays(d)}`;
  };

  // حالة الدواء بصياغة الجملة المفردة: "يكفيكم {مدة}"
  const medStatusSingular = (m: ChronicMed): string => {
    const d = calcDaysLeft(m.next_refill_date);
    if (d < 0) return 'بحاجة للتجديد';
    if (d === 0) return 'ينفد اليوم';
    return `يكفيكم ${pluralizeDays(d)}`;
  };

  const previewMsg = msgType === 'msg1'
    ? previewMeds.length === 0
      ? `مرحباً ${firstName} 😊\nمعكم ${pharmacyName}.\nنودّ تذكيركم بمواعيد أدويتكم. نسعد بخدمتكم دائماً 💚`
      : previewMeds.length === 1
        ? `مرحباً ${firstName} 😊\nمعكم ${pharmacyName}.\nنودّ تذكيركم بأن دواء (${previewMeds[0].medication_name}) ${medStatusSingular(previewMeds[0])}. نسعد بخدمتكم دائماً 💚`
        : `مرحباً ${firstName} 😊\nمعكم ${pharmacyName}.\nنودّ تذكيركم بأدويتكم:\n${previewMeds.map(m => `- ${m.medication_name} — ${medStatusForList(m)}`).join('\n')}\nنسعد بخدمتكم دائماً 💚`
    : previewMeds.length > 1
      ? `مرحباً ${firstName}\nمعكم ${pharmacyName}.\nلاحظنا أن أدويتكم لم تُجدَّد بعد:\n${previewMeds.map(m => `- ${m.medication_name}`).join('\n')}\nونحب أن نطمئن — إن كان الأمر يحتاج ترتيباً من طرفنا فأخبرونا.\nنسعد بخدمتكم دائماً 💚`
      : `مرحباً ${firstName}\nمعكم ${pharmacyName}.\nلاحظنا أن (${names || '...'}) لم تُجدَّد بعد، ونحب أن نطمئن — إن كان الأمر يحتاج ترتيباً من طرفنا فأخبرونا.\nنسعد بخدمتكم دائماً 💚`;

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
