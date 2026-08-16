'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import DashboardHeader from '../components/DashboardHeader';
import AppFooter from '../../components/AppFooter';

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════
interface PatientRow {
  id: string;
  name: string;
  phone_number: string;
  birth_date: string;
  gender: string;
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════
function normalizePhone(phone: string): string {
  let c = phone.replace(/[^0-9]/g, '');
  if (c.startsWith('00962')) c = '0' + c.substring(5);
  else if (c.startsWith('962') && c.length > 10) c = '0' + c.substring(3);
  return c;
}
function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/[^0-9]/g, '');
  return digits.length >= 9 && digits.length <= 10;
}
function calculateAge(birthDate: string): number | null {
  if (!birthDate) return null;
  const today = new Date(), birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
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
function IconPlus({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}
function IconUsers({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  );
}
function IconArrow({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════
// MODAL: مريض جديد
// ═══════════════════════════════════════════════════════
function AddPatientModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (p: PatientRow) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('male');
  const [dob, setDob] = useState('1975-01-01');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    if (!name.trim()) { setErr('يرجى إدخال اسم المريض'); return; }
    if (!isValidPhone(phone)) { setErr('رقم هاتف غير صحيح — أرقام فقط بطول معقول'); return; }
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
        diagnosed_conditions: [],
      }).select().single();
      if (error || !data) throw new Error('تعذر الحفظ — تأكد من عدم تكرار رقم الهاتف');
      onCreated(data as PatientRow);
    } catch (e: any) { setErr(e.message); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl border border-slate-200 saas-slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">إضافة مريض جديد</h3>
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
              className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900 transition text-slate-900 font-mono text-left" />
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

          {err && <p className="text-xs text-rose-600 font-medium bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">{err}</p>}
        </div>

        <div className="px-5 pb-5">
          <button onClick={save} disabled={saving || !name.trim()}
            className="w-full py-3 bg-gradient-to-l from-slate-900 to-teal-800 hover:from-slate-800 hover:to-teal-700 text-white rounded-xl text-sm font-bold transition active:scale-[0.98] disabled:opacity-50 shadow-sm cursor-pointer">
            {saving ? 'جاري الحفظ...' : 'حفظ المريض'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════
export default function PatientsListPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => { fetchPatients(); }, []);

  const fetchPatients = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push('/'); return; }
    const { data } = await supabase.from('patients')
      .select('id, name, phone_number, birth_date, gender')
      .eq('pharmacy_id', session.user.id)
      .order('name', { ascending: true });
    setPatients((data as PatientRow[]) || []);
    setLoading(false);
  };

  const q = query.trim();
  const qDigits = q.replace(/[^0-9]/g, '');
  const filtered = patients.filter(p =>
    !q || p.name.includes(q) || (qDigits && p.phone_number.includes(qDigits))
  );

  return (
    <div className="min-h-screen bg-slate-50/50 antialiased pb-16" dir="rtl">
      <DashboardHeader breadcrumb="إدارة المرضى" onBack={() => router.push('/dashboard')} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-12">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900">إدارة المرضى</h1>
            <p className="text-sm text-slate-500 mt-1">{patients.length} مريض مسجّل في صيدليتك</p>
          </div>
          <button onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-l from-slate-900 to-teal-800 hover:from-slate-800 hover:to-teal-700 text-white rounded-xl text-sm font-bold shadow-sm transition active:scale-[0.98] cursor-pointer">
            <IconPlus className="w-4 h-4" />
            مريض جديد
          </button>
        </div>

        <div className="relative mb-6">
          <IconSearch className="w-5 h-5 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2" />
          <input
            type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="ابحث بالاسم أو رقم الهاتف..."
            className="w-full pr-12 pl-4 py-3.5 text-sm bg-white border border-slate-200 rounded-2xl focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition shadow-sm"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl py-16 flex flex-col items-center text-center gap-3 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center">
              <IconUsers className="w-6 h-6 text-teal-600" />
            </div>
            <p className="text-sm font-semibold text-slate-700">
              {patients.length === 0 ? 'لا يوجد مرضى مسجّلون بعد' : 'لا نتائج مطابقة للبحث'}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm divide-y divide-slate-100 overflow-hidden">
            {filtered.map(p => {
              const age = calculateAge(p.birth_date);
              return (
                <div key={p.id} onClick={() => router.push(`/dashboard/patients/${p.id}`)}
                  className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors cursor-pointer">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200 text-slate-500 font-semibold text-sm">
                      {p.name.trim().charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{p.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-500 font-mono" dir="ltr">{p.phone_number}</span>
                        {age !== null && (
                          <>
                            <span className="text-slate-300">·</span>
                            <span className="text-xs text-slate-500">{age} سنة</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <IconArrow className="w-4 h-4 text-slate-300 shrink-0 rotate-180" />
                </div>
              );
            })}
          </div>
        )}
      </main>

      {showAddModal && (
        <AddPatientModal
          onClose={() => setShowAddModal(false)}
          onCreated={(p) => { setPatients(prev => [...prev, p].sort((a, b) => a.name.localeCompare(b.name, 'ar'))); setShowAddModal(false); }}
        />
      )}

      <AppFooter className="max-w-5xl mx-auto px-6 py-8 border-t border-slate-200/60 mt-4" />
    </div>
  );
}
