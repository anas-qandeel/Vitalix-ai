'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import DashboardHeader, { usePharmacyInfo, getActivePharmacist } from './components/DashboardHeader';
import AppFooter from '../components/AppFooter';
import { upsertPipeline } from '@/lib/pipeline';
import { Patient, ChronicMed, pluralizeDaysLeft } from '@/lib/chronic';
import WaMsgModal from '@/components/WaMsgModal';

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════
interface PharmacyDetails {
  id: string;
  pharmacist_name: string;
  expiry_date: string;
  status: string;
}
interface RealStats {
  totalPatients: number;
  totalVisits: number;
  visitsThisMonth: number;
  patientsWithVisits: number;
}
interface BirthdayPatient {
  id: string;
  name: string;
  phone_number: string;
  birth_date: string;
}
interface QuickAlert {
  id: string;
  patient_id: string;
  patient_name: string;
  phone: string;
  medication_name: string;
  days_left: number;
}

// ═══════════════════════════════════════════════════════
// SVG ICONS
// ═══════════════════════════════════════════════════════
function IconVitals({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}
function IconChronic({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
    </svg>
  );
}
function IconCatalog({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
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
function IconBell({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  );
}
function IconWhatsapp({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}
function IconCalendar({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  );
}
function IconClipboard({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
    </svg>
  );
}
function IconUsers({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════
function pluralizeDays(days: number): string {
  if (days === 1) return 'يوم واحد';
  if (days === 2) return 'يومان';
  if (days <= 10) return `${days} أيام`;
  return `${days} يوماً`;
}

// ═══════════════════════════════════════════════════════
// BIRTHDAY MODAL
// ═══════════════════════════════════════════════════════
function BirthdayModal({ patients, pharmacyName, onClose }: {
  patients: BirthdayPatient[];
  pharmacyName: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden border border-slate-200 saas-slide-up flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0">
              <IconCalendar className="w-4 h-4 text-rose-500" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">أعياد ميلاد اليوم</h3>
              <p className="text-xs text-slate-500 mt-0.5">{patients.length} {patients.length === 1 ? 'مريض' : 'مرضى'}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-colors">✕</button>
        </div>
        <div className="overflow-y-auto p-5 space-y-3 bg-slate-50/50">
          {patients.map(p => {
            const age = new Date().getFullYear() - new Date(p.birth_date).getFullYear();
            const msg = `🎉 كل عام وأنتم بخير ${p.name}!\nبمناسبة عيد ميلادك الكريم، يتقدم فريق ${pharmacyName} بأحر التهاني وأطيب الأمنيات بدوام الصحة والعافية. 💐`;
            return (
              <div key={p.id} className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3.5 shadow-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-semibold text-slate-600 text-sm shrink-0 border border-slate-200">
                    {p.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{p.name}</p>
                    <p className="text-xs font-medium text-rose-500 mt-1">{age} سنة اليوم</p>
                  </div>
                </div>
                <a href={`https://wa.me/962${p.phone_number.replace(/^0/, '')}?text=${encodeURIComponent(msg)}`}
                  target="_blank" rel="noreferrer" onClick={onClose}
                  className="shrink-0 flex items-center justify-center gap-1.5 h-9 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium transition-all shadow-sm">
                  <IconWhatsapp className="w-3.5 h-3.5" />
                  <span>تهنئة</span>
                </a>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════
export default function PharmacistDashboard() {
  const [pharmacy, setPharmacy]       = useState<PharmacyDetails | null>(null);
  const [loading, setLoading]         = useState(true);
  const [stats, setStats]             = useState<RealStats>({ totalPatients: 0, totalVisits: 0, visitsThisMonth: 0, patientsWithVisits: 0 });
  const [todayAlerts, setTodayAlerts] = useState<QuickAlert[]>([]);
  const [pharmacyId, setPharmacyId]   = useState('');
  const [confirmSent, setConfirmSent] = useState<{ patientId: string; patientName: string } | null>(null);
  const [waMsgModal, setWaMsgModal]   = useState<{ patient: Patient; meds: ChronicMed[] } | null>(null);
  const [birthdayPatients, setBirthdayPatients]   = useState<BirthdayPatient[]>([]);
  const [birthdayModalOpen, setBirthdayModalOpen] = useState(false);
  const [activePharmacist, setActivePharmacistDisplay] = useState(() => getActivePharmacist());

  // مزامنة تغيير الصيدلاني النشط فوراً دون reload
  useEffect(() => {
    const sync = () => setActivePharmacistDisplay(getActivePharmacist());
    window.addEventListener('storage', sync);
    // custom event للتحديث في نفس الـ tab
    window.addEventListener('vitalix_pharmacist_changed', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('vitalix_pharmacist_changed', sync);
    };
  }, []);
  const { pharmacyName } = usePharmacyInfo();
  const router = useRouter();

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/'); return; }
      const uid = session.user.id;
      setPharmacyId(uid);

      const today    = new Date();
      const todayMM  = today.getMonth() + 1;
      const todayDD  = today.getDate();

      const [pharmRes, patientsRes, allPatientsRes, visitsRes, monthVisitsRes, alertsRes] = await Promise.all([
        supabase.from('pharmacies').select('id, pharmacist_name, expiry_date, status').eq('id', uid).single(),
        supabase.from('patients').select('id', { count: 'exact', head: true }).eq('pharmacy_id', uid),
        supabase.from('patients').select('id, name, phone_number, birth_date').eq('pharmacy_id', uid),
        supabase.from('visitations').select('id, patient_id', { count: 'exact' }).eq('pharmacy_id', uid),
        supabase.from('visitations').select('id', { count: 'exact', head: true }).eq('pharmacy_id', uid)
          .gte('created_at', new Date(today.getFullYear(), today.getMonth(), 1).toISOString()),
        supabase.from('chronic_medications')
          .select('id, medication_name, next_refill_date, patient_id, patients!inner(name, phone_number)')
          .eq('pharmacy_id', uid).eq('status', 'active')
          .lte('next_refill_date', new Date(today.getTime() + 3 * 86400000).toISOString().split('T')[0])
          .gte('next_refill_date', new Date(today.getTime() - 3 * 86400000).toISOString().split('T')[0])
          .order('next_refill_date', { ascending: true })
          .limit(15), // أكبر من 5 لأن بعض النتائج ستُستثنى لاحقاً حسب مرحلتها في refill_tracking_pipeline
      ]);

      if (pharmRes.data) setPharmacy(pharmRes.data as PharmacyDetails);

      const uniquePatients = new Set((visitsRes.data || []).map((v: any) => v.patient_id));
      setStats({
        totalPatients:      patientsRes.count    || 0,
        totalVisits:        visitsRes.count      || 0,
        visitsThisMonth:    monthVisitsRes.count || 0,
        patientsWithVisits: uniquePatients.size,
      });

      const allPatients = (allPatientsRes.data as BirthdayPatient[]) || [];
      setBirthdayPatients(allPatients.filter(p => {
        if (!p.birth_date) return false;
        const parts = p.birth_date.split('-');
        return parts.length >= 3 && parseInt(parts[1]) === todayMM && parseInt(parts[2]) === todayDD;
      }));

      // نجلب مراحل المرضى الظاهرين في التنبيه من refill_tracking_pipeline
      // لاستثناء من تم التواصل معهم بالفعل (نفس منطق صفحة chronic)
      const alertPatientIds = ((alertsRes.data as any[]) || []).map(item => item.patient_id);
      const { data: pipelineData } = alertPatientIds.length
        ? await supabase.from('refill_tracking_pipeline')
            .select('patient_id, pipeline_stage')
            .eq('pharmacy_id', uid).eq('payment_type', 'cash')
            .in('patient_id', alertPatientIds)
        : { data: [] as any[] };

      const pipelineStageMap = new Map<string, string>();
      (pipelineData || []).forEach((row: any) => pipelineStageMap.set(row.patient_id, row.pipeline_stage));

      setTodayAlerts(
        ((alertsRes.data as any[]) || [])
          .filter(item => {
            const stage = pipelineStageMap.get(item.patient_id);
            return !stage || stage === 'due'; // بدون سجل = لم يبدأ التعامل بعد، أبقِه
          })
          .map(item => {
            const d = Math.ceil((new Date(item.next_refill_date).getTime() - today.getTime()) / 86400000);
            const patient = item.patients as { name: string; phone_number: string };
            return { id: item.id, patient_id: item.patient_id, patient_name: patient?.name || 'مريض', phone: patient?.phone_number || '', medication_name: item.medication_name, days_left: d };
          })
          .slice(0, 5)
      );
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleConfirmSent = async (confirmed: boolean) => {
    if (!confirmSent) return;
    const { patientId } = confirmSent;
    setConfirmSent(null);
    if (!confirmed) return; // لم يُرسَل — لا تغيير
    await upsertPipeline(pharmacyId, patientId, 'messaged', { reminded_at: new Date().toISOString() });
    setTodayAlerts(prev => prev.filter(a => a.patient_id !== patientId));
  };

  const openWaModal = async (item: QuickAlert) => {
    // نجلب كل الأدوية النشطة للمريض (وليس فقط الدواء المستحق قريباً) — نفس منطق WaMsgModal في chronic
    const { data } = await supabase.from('chronic_medications')
      .select('*')
      .eq('pharmacy_id', pharmacyId).eq('patient_id', item.patient_id).eq('status', 'active');
    setWaMsgModal({
      // gender/birth_date غير مستخدمين داخل WaMsgModal — قيم فارغة بدل استعلام إضافي
      patient: { id: item.patient_id, name: item.patient_name, phone_number: item.phone, gender: '', birth_date: '' },
      meds: (data as ChronicMed[]) || [],
    });
  };

  const handleWaConfirm = async (selectedMedIds: Set<string>, customMsg: string) => {
    if (!waMsgModal) return;
    const { patient } = waMsgModal;
    setWaMsgModal(null);
    window.open(`https://wa.me/962${patient.phone_number.replace(/^0/, '')}?text=${encodeURIComponent(customMsg)}`, '_blank');
    setTimeout(() => setConfirmSent({ patientId: patient.id, patientName: patient.name }), 1500);
  };

  const daysLeft       = !pharmacy?.expiry_date ? 0 : Math.max(0, Math.ceil((new Date(pharmacy.expiry_date).getTime() - Date.now()) / 86400000));
  const isExpiringSoon = daysLeft <= 14;

  if (loading) return (
    <div className="min-h-screen bg-slate-50/50 flex items-center justify-center" dir="rtl">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium text-slate-500">جاري تحميل لوحة التحكم...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50/50 antialiased text-slate-900 pb-20" dir="rtl">

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&display=swap');
        body { font-family: 'IBM Plex Sans Arabic', system-ui, sans-serif; }
        .tabular-nums { font-variant-numeric: tabular-nums; }
        @keyframes saasSlideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .saas-slide-up { animation: saasSlideUp 0.3s ease both; }
        .fu1 { animation: saasSlideUp 0.3s 0.00s ease both; }
        .fu2 { animation: saasSlideUp 0.3s 0.06s ease both; }
        .fu3 { animation: saasSlideUp 0.3s 0.12s ease both; }
        .fu4 { animation: saasSlideUp 0.3s 0.18s ease both; }
      `}</style>

      <DashboardHeader />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-12 space-y-8">

        {/* ═══ 4. تذكيرات الأدوية المزمنة ═══ */}
        <div className="fu1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className={`h-1 ${todayAlerts.length > 0 ? 'bg-amber-500' : 'bg-teal-500'}`} />
          {todayAlerts.length > 0 ? (
            <>
              <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                    <IconBell className="w-5 h-5 text-slate-700" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900">اتصل اليوم</h3>
                      {todayAlerts.length > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full text-[13px] font-bold text-white bg-amber-500">
                          {todayAlerts.length}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">مرضى يحتاجون تجديد دوائهم قريباً</p>
                  </div>
                </div>
                <button onClick={() => router.push('/dashboard/chronic')} className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 px-4 py-2 rounded-lg transition-colors shadow-sm self-start sm:self-auto">
                  إدارة المزمنين
                </button>
              </div>

              <div className="divide-y divide-slate-100">
                {todayAlerts.map(item => {
                  return (
                    <div key={item.id} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200 text-slate-500 font-semibold text-sm">
                          {item.patient_name.charAt(0)}
                        </div>
                        <div className="min-w-0 flex flex-col gap-1">
                          <p className="text-sm font-semibold text-slate-900 truncate">{item.patient_name}</p>
                          <div className="text-xs font-medium text-slate-500 flex items-center w-fit gap-1" dir="ltr">
                             <span className="truncate">{item.medication_name}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 sm:ml-0 ml-14">
                        <span className={`text-[11px] font-semibold px-3 py-1.5 rounded-md border tabular-nums ${
                          item.days_left <= 0  ? 'text-rose-700 bg-rose-50 border-rose-200' :
                          item.days_left <= 2  ? 'text-amber-700 bg-amber-50 border-amber-200' :
                          'text-slate-700 bg-slate-100 border-slate-200'
                        }`}>
                          {pluralizeDaysLeft(item.days_left)}
                        </span>
                        <button
                          onClick={() => openWaModal(item)}
                          className="flex items-center justify-center w-9 h-9 bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-all shadow-sm">
                          <IconWhatsapp className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="px-6 py-10 flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-slate-900">لا يوجد مرضى بحاجة للتذكير اليوم</h3>
            </div>
          )}
        </div>

        {/* ═══ 1. الترويسة الترحيبية + لوحة الإحصائيات (Hero Command Center) ═══ */}
        <div className="fu2 bg-white border border-slate-200 rounded-2xl relative overflow-hidden shadow-sm flex flex-col lg:flex-row">
          
          {/* الخط اللوني الجانبي للـ Branding */}
          <div className="absolute right-0 top-0 bottom-0 w-1.5 bg-teal-500 rounded-r-2xl z-10 hidden lg:block" />
          <div className="absolute right-0 left-0 top-0 h-1.5 bg-teal-500 rounded-t-2xl z-10 lg:hidden" />
          
          {/* الجانب الأيمن (الترحيب والهوية) */}
          <div className="p-6 md:p-8 flex flex-col justify-center min-w-[280px] lg:w-[320px] shrink-0 relative z-20">
            <p className="text-teal-600 text-[11px] font-bold mb-1.5 uppercase tracking-widest">مرحباً بعودتك</p>
            <h1 className="text-2xl font-black text-slate-900 truncate tracking-tight">د. {activePharmacist || pharmacy?.pharmacist_name || 'الصيدلي'}</h1>
            <p className="text-slate-500 text-xs mt-2 font-medium">
              {new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', numberingSystem: 'latn' })}
            </p>

            {isExpiringSoon && (
              <div className="mt-5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3 w-fit shadow-sm">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-600 shrink-0">
                  <IconBell className="w-4 h-4" />
                </span>
                <div>
                  <p className="text-amber-900 text-xs font-bold">تنبيه الاشتراك</p>
                  <p className="text-amber-700 text-[10px] mt-0.5 font-medium">ينتهي خلال {pluralizeDays(daysLeft)}</p>
                </div>
              </div>
            )}
          </div>

          {/* الجانب الأيسر (شبكة الإحصائيات المدمجة) */}
          <div className="flex-1 bg-slate-50/50 border-t lg:border-t-0 lg:border-r border-slate-200 grid grid-cols-2 lg:grid-cols-4 relative z-10">
            
            {/* إجمالي المرضى */}
            <div className="p-5 sm:p-6 flex flex-col justify-center border-b lg:border-b-0 border-l border-slate-200 hover:bg-slate-100/50 transition-colors">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                  <IconUsers className="w-3.5 h-3.5 text-slate-600" />
                </div>
                <span className="text-slate-600 text-xs font-bold">إجمالي المرضى</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-900 tabular-nums tracking-tight">{stats.totalPatients}</span>
              </div>
              <span className="text-[10px] font-medium text-slate-400 mt-1">مريض مسجّل</span>
            </div>

            {/* مرضى لهم فحوصات */}
            <div className="p-5 sm:p-6 flex flex-col justify-center border-b lg:border-b-0 lg:border-l border-slate-200 hover:bg-slate-100/50 transition-colors">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                  <IconClipboard className="w-3.5 h-3.5 text-slate-600" />
                </div>
                <span className="text-slate-600 text-xs font-bold">لهم فحوصات</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-900 tabular-nums tracking-tight">{stats.patientsWithVisits}</span>
              </div>
              <span className="text-[10px] font-medium text-slate-400 mt-1">يمتلكون سجل قياسات</span>
            </div>

            {/* فحوصات الشهر */}
            <div className="p-5 sm:p-6 flex flex-col justify-center border-l border-slate-200 hover:bg-slate-100/50 transition-colors">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                  <IconVitals className="w-3.5 h-3.5 text-slate-600" />
                </div>
                <span className="text-slate-600 text-xs font-bold">فحوصات الشهر</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-900 tabular-nums tracking-tight">{stats.visitsThisMonth}</span>
              </div>
              <span className="text-[10px] font-medium text-slate-400 mt-1">تمت خلال هذا الشهر</span>
            </div>

            {/* إجمالي الفحوصات */}
            <div className="p-5 sm:p-6 flex flex-col justify-center hover:bg-slate-100/50 transition-colors">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                  <IconChronic className="w-3.5 h-3.5 text-slate-600" />
                </div>
                <span className="text-slate-600 text-xs font-bold">إجمالي الفحوصات</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-900 tabular-nums tracking-tight">{stats.totalVisits}</span>
              </div>
              <span className="text-[10px] font-medium text-slate-400 mt-1">منذ بداية الاشتراك</span>
            </div>

          </div>
        </div>

        {/* ═══ 2. أعياد الميلاد ═══ */}
        {birthdayPatients.length > 0 && (
          <div className="fu3 bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center">
                  <IconCalendar className="w-5 h-5 text-rose-500" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">أعياد ميلاد اليوم</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{birthdayPatients.length} {birthdayPatients.length === 1 ? 'مريض' : 'مرضى'}</p>
                </div>
              </div>
              {birthdayPatients.length > 3 && (
                <button onClick={() => setBirthdayModalOpen(true)} className="text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-lg transition-colors">
                  عرض الكل ({birthdayPatients.length})
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {birthdayPatients.slice(0, 3).map(p => {
                const age = new Date().getFullYear() - new Date(p.birth_date).getFullYear();
                const msg = `🎉 كل عام وأنتم بخير ${p.name}!\nبمناسبة عيد ميلادك الكريم، يتقدم فريق ${pharmacyName} بأحر التهاني وأطيب الأمنيات بدوام الصحة والعافية. 💐`;
                return (
                  <div key={p.id} className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3.5 hover:bg-slate-100 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center font-semibold text-slate-600 text-sm shrink-0">
                        {p.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{p.name}</p>
                        <p className="text-[11px] font-medium text-rose-500 mt-0.5">{age} سنة اليوم</p>
                      </div>
                    </div>
                    <a href={`https://wa.me/962${p.phone_number.replace(/^0/, '')}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"
                      className="shrink-0 flex items-center justify-center w-8 h-8 bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-all shadow-sm">
                      <IconWhatsapp className="w-4 h-4" />
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ 3. بطاقات التنقل ═══ */}
        <div className="fu4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* الفحوصات */}
          <div onClick={() => router.push('/dashboard/vitals')}
            className="group bg-white border border-slate-200 rounded-xl p-6 cursor-pointer shadow-sm hover:shadow-md transition-all flex flex-col justify-between h-full">
            <div>
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 mb-4 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                <IconVitals className="w-6 h-6 text-slate-600 group-hover:text-white transition-colors" />
              </div>
              <h3 className="text-base font-bold text-slate-900">الفحوصات والتحليل الذكي</h3>
              <p className="text-sm text-slate-500 mt-2 leading-relaxed">قياس الضغط والسكري، تقرير AI مخصص، وإرسال فوري عبر WhatsApp.</p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-900 bg-slate-100 px-3 py-1.5 rounded-md tabular-nums">{stats.totalVisits} تقرير</span>
              <span className="text-sm font-medium text-slate-500 group-hover:text-slate-900 transition-colors flex items-center gap-1">
                دخول <IconArrow className="w-4 h-4 rotate-180" />
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {/* الأدوية المزمنة */}
            <div onClick={() => router.push('/dashboard/chronic')}
              className="group bg-white border border-slate-200 rounded-xl p-5 cursor-pointer shadow-sm hover:shadow-md transition-all flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                  <IconChronic className="w-6 h-6 text-slate-600 group-hover:text-white transition-colors" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">إدارة الأدوية المزمنة</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">متابعة مرضاك ومواعيد نفاذ أدويتهم.</p>
                </div>
              </div>
              <IconArrow className="w-5 h-5 text-slate-300 group-hover:text-slate-900 transition-colors shrink-0 rotate-180" />
            </div>

            {/* الكتالوج */}
            <div onClick={() => router.push('/dashboard/pharmacy-catalog-manager')}
              className="group bg-white border border-slate-200 rounded-xl p-5 cursor-pointer shadow-sm hover:shadow-md transition-all flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                  <IconCatalog className="w-6 h-6 text-slate-600 group-hover:text-white transition-colors" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">كتالوج الأجهزة (حد 10)</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">تعريف أجهزة القياس لاقتراحها تلقائياً.</p>
                </div>
              </div>
              <IconArrow className="w-5 h-5 text-slate-300 group-hover:text-slate-900 transition-colors shrink-0 rotate-180" />
            </div>
          </div>
        </div>

      </main>

      {birthdayModalOpen && (
        <BirthdayModal patients={birthdayPatients} pharmacyName={pharmacyName} onClose={() => setBirthdayModalOpen(false)} />
      )}

      {waMsgModal && (
        <WaMsgModal
          patient={waMsgModal.patient}
          meds={waMsgModal.meds}
          pharmacyName={pharmacyName}
          msgType="msg1"
          onClose={() => setWaMsgModal(null)}
          onConfirm={handleWaConfirm}
        />
      )}

      {confirmSent && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9998] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm border border-slate-200 overflow-hidden saas-slide-up">
            <div className="p-6 text-center">
              <h4 className="text-lg font-semibold text-slate-900 mb-2">هل تم الإرسال بنجاح؟</h4>
              <p className="text-sm text-slate-500 mb-6">يرجى التأكيد لنقل {confirmSent.patientName} إلى قائمة "تم الإرسال".</p>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => handleConfirmSent(false)} className="py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">لم يُرسَل</button>
                <button onClick={() => handleConfirmSent(true)} className="py-2.5 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition-colors">نعم، تم الإرسال ✓</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <AppFooter className="max-w-6xl mx-auto px-6 py-8 border-t border-slate-200/60 mt-4" />
    </div>
  );
}