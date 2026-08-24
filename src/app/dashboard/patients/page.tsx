'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import DashboardHeader from '../components/DashboardHeader';
import AppFooter from '../../components/AppFooter';
import AddPatientForm from '@/components/AddPatientForm';
import { getPharmacyId, getUserRole } from '@/lib/tenant';
import { normalizeAr } from '@/lib/arabic';

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
// MAIN PAGE
// ═══════════════════════════════════════════════════════
const PAGE_SIZE = 30;

export default function PatientsListPage() {
  const router = useRouter();
  const [pharmacyId, setPharmacyId] = useState('');
  const [role, setRole] = useState('');
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // جلسة الصيدلية + الدور أولاً
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/'); return; }
      const [pid, r] = await Promise.all([getPharmacyId(), getUserRole()]);
      if (!pid) return;
      setPharmacyId(pid);
      setRole(r);
    })();
  }, []);

  // تأخير الكتابة في مربع البحث 300ms قبل الاستعلام من القاعدة
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // إعادة الجلب من الدفعة الأولى عند تغيّر الصيدلية أو نص البحث — لغير المالك، لا جلب
  // ولا عرض لأي مريض قبل بحث فعلي (مبدأ الحاجة للمعرفة)، لا تحميلاً صامتاً في الذاكرة
  useEffect(() => {
    if (!pharmacyId || !role) return;
    if (role !== 'owner' && !debouncedQuery) {
      setPatients([]);
      setHasMore(false);
      setLoading(false);
      return;
    }
    fetchPatients(pharmacyId, debouncedQuery, 0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pharmacyId, role, debouncedQuery]);

  // نجلب دفعة محدودة (PAGE_SIZE) فقط في كل استدعاء بدل كل المرضى دفعة واحدة
  const fetchPatients = async (pid: string, searchTerm: string, offset: number, append: boolean) => {
    append ? setLoadingMore(true) : setLoading(true);

    let q = supabase.from('patients')
      .select('id, name, phone_number, birth_date, gender')
      .eq('pharmacy_id', pid)
      .order('name', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    const digits = searchTerm.replace(/[^0-9]/g, '');
    if (searchTerm) {
      const normTerm = normalizeAr(searchTerm);
      q = digits
        ? q.or(`name_normalized.ilike.%${normTerm}%,phone_number.ilike.%${digits}%`)
        : q.ilike('name_normalized', `%${normTerm}%`);
    }

    const { data } = await q;
    const rows = (data as PatientRow[]) || [];
    setPatients(prev => append ? [...prev, ...rows] : rows);
    setHasMore(rows.length === PAGE_SIZE);

    // العدّاد الإجمالي عبر استعلام خفيف (count فقط بلا بيانات) — لا معنى له أثناء البحث
    if (!searchTerm) {
      const { count } = await supabase.from('patients')
        .select('id', { count: 'exact', head: true })
        .eq('pharmacy_id', pid);
      setTotalCount(count ?? 0);
    }

    append ? setLoadingMore(false) : setLoading(false);
  };

  const handleLoadMore = () => {
    if (!pharmacyId || loadingMore) return;
    fetchPatients(pharmacyId, debouncedQuery, patients.length, true);
  };

  return (
    <div className="min-h-screen bg-slate-50/50 antialiased pb-16" dir="rtl">
      <DashboardHeader breadcrumb="إدارة المرضى" onBack={() => router.push('/dashboard')} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-12">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900">إدارة المرضى</h1>
            {role === 'owner' && (
              <p className="text-sm text-slate-500 mt-1">{totalCount ?? '...'} مريض مسجّل في صيدليتك</p>
            )}
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
        ) : patients.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl py-16 flex flex-col items-center text-center gap-3 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center">
              {role !== 'owner' && !debouncedQuery ? (
                <IconSearch className="w-6 h-6 text-teal-600" />
              ) : (
                <IconUsers className="w-6 h-6 text-teal-600" />
              )}
            </div>
            <p className="text-sm font-semibold text-slate-700">
              {role !== 'owner' && !debouncedQuery
                ? 'ابحث باسم المريض أو رقم هاتفه للوصول إلى ملفه'
                : debouncedQuery ? 'لا نتائج مطابقة للبحث' : 'لا يوجد مرضى مسجّلون بعد'}
            </p>
          </div>
        ) : (
          <>
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm divide-y divide-slate-100 overflow-hidden">
              {patients.map(p => {
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

            {hasMore && (
              <button onClick={handleLoadMore} disabled={loadingMore}
                className="w-full mt-4 py-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                {loadingMore ? 'جاري التحميل...' : 'تحميل المزيد'}
              </button>
            )}
          </>
        )}
      </main>

      {showAddModal && (
        <AddPatientForm
          onClose={() => setShowAddModal(false)}
          onSaved={(p) => {
            setPatients(prev => [...prev, p].sort((a, b) => a.name.localeCompare(b.name, 'ar')));
            setTotalCount(c => (c ?? 0) + 1);
            setShowAddModal(false);
          }}
        />
      )}

      <AppFooter className="max-w-5xl mx-auto px-6 py-8 border-t border-slate-200/60 mt-4" />
    </div>
  );
}
