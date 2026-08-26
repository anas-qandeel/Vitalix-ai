'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { upsertPipeline } from '@/lib/pipeline';
import { getPharmacyId } from '@/lib/tenant';
import { normalizePhone, validatePhone } from '@/lib/phone';

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════
export interface NewPatient {
  id: string;
  name: string;
  phone_number: string;
  gender: string;
  birth_date: string;
  diagnosed_conditions: string[] | null;
}

interface AddPatientFormProps {
  onClose: () => void;
  onSaved: (patient: NewPatient) => void;
  /** تعبئة مسبقة (مثال: بحث بالهاتف في المزمنون/القياسات) */
  prefill?: { name?: string; phone_number?: string; gender?: string; birth_date?: string };
  /** يمنع تعديل الهاتف — للاستخدام عند إدخاله مسبقاً من صندوق بحث خارجي */
  lockPhone?: boolean;
  /** تمريره إن كان متوفراً بالفعل في الصفحة الأم بدل استدعاء getSession() مجدداً */
  pharmacyId?: string;
  title?: string;
  submitLabel?: string;
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════
function IconHeart({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    </svg>
  );
}
function IconDroplet({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.75S6 10.5 6 14.25a6 6 0 0012 0C18 10.5 12 3.75 12 3.75z" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════
// AddPatientForm — نموذج إضافة مريض موحّد
// ═══════════════════════════════════════════════════════
export default function AddPatientForm({
  onClose, onSaved, prefill, lockPhone = false, pharmacyId, title = 'إضافة مريض جديد', submitLabel = 'حفظ المريض',
}: AddPatientFormProps) {
  const [name, setName] = useState(prefill?.name || '');
  const [phone, setPhone] = useState(prefill?.phone_number || '');
  const [gender, setGender] = useState(prefill?.gender || 'male');
  const [dob, setDob] = useState(prefill?.birth_date || '1975-01-01');
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
      let pid = pharmacyId;
      if (!pid) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('انتهت الجلسة');
        const fromToken = await getPharmacyId();
        if (!fromToken) throw new Error('تعذّر تحديد الصيدلية');
        pid = fromToken;
      }
      const { data, error } = await supabase.from('patients').insert({
        pharmacy_id: pid,
        name: name.trim(),
        phone_number: normalizePhone(phone),
        gender,
        birth_date: dob,
        diagnosed_conditions: conditions,
      }).select().single();
      if (error || !data) throw new Error('تعذر الحفظ — تأكد من عدم تكرار رقم الهاتف');
      if (note.trim()) {
        await upsertPipeline(pid, data.id, 'due', {});
        await supabase.from('refill_tracking_pipeline').update({ insurance_status: note.trim() })
          .eq('pharmacy_id', pid).eq('patient_id', data.id).eq('payment_type', 'cash');
      }
      onSaved(data as NewPatient);
    } catch (e: any) { setErr(e.message); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl border border-slate-200 saas-slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-colors text-sm cursor-pointer">✕</button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">الاسم الكامل</label>
            <input autoFocus type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900 transition text-slate-900" />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">رقم الهاتف</label>
            <input type="tel" dir="ltr" value={phone} onChange={e => setPhone(e.target.value)} placeholder="07XXXXXXXX"
              readOnly={lockPhone}
              className={`w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900 transition text-slate-900 font-mono text-left ${lockPhone ? 'bg-slate-100 text-slate-500' : 'bg-slate-50'}`} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">الجنس</label>
              <div className="flex bg-slate-100 p-1 rounded-lg">
                {[{ v: 'male', l: 'ذكر' }, { v: 'female', l: 'أنثى' }].map(g => (
                  <button key={g.v} type="button" onClick={() => setGender(g.v)}
                    className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${gender === g.v ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>
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

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2">التشخيصات المزمنة <span className="font-normal text-slate-400">(اختياري)</span></label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'hypertension', label: 'ضغط الدم', icon: <IconHeart className="w-3.5 h-3.5" /> },
                { key: 'diabetes', label: 'السكري', icon: <IconDroplet className="w-3.5 h-3.5" /> },
              ].map(({ key, label, icon }) => {
                const active = conditions.includes(key);
                return (
                  <button key={key} type="button" onClick={() => toggleCondition(key)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      active ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}>
                    {icon}
                    <span>{active ? '✓ ' : ''}{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

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
            className="w-full py-3 bg-gradient-to-l from-slate-900 to-teal-800 hover:from-slate-800 hover:to-teal-700 text-white rounded-xl text-sm font-bold transition active:scale-[0.98] disabled:opacity-50 shadow-sm cursor-pointer">
            {saving ? 'جاري الحفظ...' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
