'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import DashboardHeader from '../components/DashboardHeader';
import AppFooter from '../../components/AppFooter';
import { getPharmacyId, getUserRole } from '@/lib/tenant';

interface ActivityEntry {
  id: string;
  created_at: string;
  staff_name: string;
  action: string;
  entity_type: string | null;
  entity_label: string | null;
  details: { patient_name?: string } | null;
}

const ACTION_LABELS: Record<string, string> = {
  medication_added: 'أضاف دواء',
  medication_updated: 'عدّل دواء',
  medication_deleted: 'حذف دواء',
  patient_added: 'أضاف مريضاً',
  patient_updated: 'عدّل بيانات مريض',
  patient_deleted: 'حذف مريضاً',
  catalog_added: 'أضاف جهازاً',
  catalog_updated: 'عدّل جهازاً',
  catalog_deactivated: 'أخفى جهازاً',
  catalog_deleted: 'حذف جهازاً',
  recommendation_added: 'أضاف مكمّلاً',
  recommendation_updated: 'عدّل مكمّلاً',
  recommendation_deactivated: 'أخفى مكمّلاً',
  recommendation_deleted: 'حذف مكمّلاً',
  reminder_sent: 'أرسل تذكير تجديد',
  reminder_opened: 'فتح رسالة تذكير',
  reminder_not_sent: 'أفاد بعدم الإرسال',
  birthday_greeting_sent: 'أرسل تهنئة عيد ميلاد',
};

type PeriodKey = '7d' | '30d' | '3m' | 'all';

const PERIOD_OPTIONS: { key: PeriodKey; label: string; days: number | null }[] = [
  { key: '7d', label: 'آخر ٧ أيام', days: 7 },
  { key: '30d', label: 'آخر ٣٠ يوماً', days: 30 },
  { key: '3m', label: 'آخر ٣ أشهر', days: 90 },
  { key: 'all', label: 'الكل', days: null },
];

const PERIOD_SUMMARY_LABELS: Record<PeriodKey, string> = {
  '7d': 'آخر ١٠٠ حركة خلال ٧ أيام',
  '30d': 'آخر ١٠٠ حركة خلال ٣٠ يوماً',
  '3m': 'آخر ١٠٠ حركة خلال ٣ أشهر',
  all: 'آخر ١٠٠ حركة',
};

const ENTITY_TYPE_OPTIONS: { key: string; label: string }[] = [
  { key: 'all', label: 'كل الحركات' },
  { key: 'medication', label: 'الأدوية' },
  { key: 'patient', label: 'المرضى' },
  { key: 'catalog', label: 'الكتالوج' },
  { key: 'recommendation', label: 'المكملات' },
  { key: 'reminder', label: 'التذكيرات' },
  { key: 'greeting', label: 'التهاني' },
];

function formatEntryTime(iso: string): string {
  return new Date(iso).toLocaleString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    numberingSystem: 'latn',
  });
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const actionLabel = ACTION_LABELS[entry.action] || entry.action;
  const patientName = entry.details?.patient_name;
  return (
    <div className="flex items-start gap-3 px-4 py-3 bg-white border border-slate-200 rounded-xl">
      <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-black shrink-0">
        {entry.staff_name?.charAt(0) || '؟'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-bold text-slate-900">{entry.staff_name}</p>
          <span className="text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-100 px-2 py-0.5 rounded-md">
            {actionLabel}
          </span>
        </div>
        <div className="mt-1 text-xs text-slate-500 font-semibold space-x-1 space-x-reverse">
          {entry.entity_label && <span>{entry.entity_label}</span>}
          {patientName && <span className="text-slate-400"> — {patientName}</span>}
        </div>
        <p className="mt-1 text-[10px] text-slate-400 tabular-nums">{formatEntryTime(entry.created_at)}</p>
      </div>
    </div>
  );
}

export default function ActivityLogPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  const [period, setPeriod] = useState<PeriodKey>('30d');
  const [entityType, setEntityType] = useState('all');
  const [staffFilter, setStaffFilter] = useState('all');

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (!authorized) return;
    fetchActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized, period, entityType]);

  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/'); return; }

      const role = await getUserRole();
      // حارس الدور هنا مجرد إخفاء بصري — الحماية الفعلية على مستوى RLS في قاعدة البيانات
      if (role !== 'owner') { setAuthorized(false); return; }

      const pid = await getPharmacyId();
      if (!pid) return;

      setAuthorized(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'خطأ في التحميل');
    } finally {
      setLoading(false);
    }
  };

  const fetchActivity = async () => {
    try {
      setErrorMsg('');

      const periodOption = PERIOD_OPTIONS.find(p => p.key === period) || PERIOD_OPTIONS[1];

      // الفترة ونوع الحركة يُرشَّحان في الاستعلام — الفهرس (pharmacy_id, created_at desc) مبني لهذا
      // لا تمرير pharmacy_id في where — RLS تتكفّل بعزل بيانات كل صيدلية
      let query = supabase
        .from('activity_log')
        .select('id, created_at, staff_name, action, entity_type, entity_label, details')
        .order('created_at', { ascending: false })
        .limit(100);

      if (periodOption.days !== null) {
        query = query.gte('created_at', new Date(Date.now() - periodOption.days * 86400000).toISOString());
      }
      if (entityType !== 'all') {
        query = query.eq('entity_type', entityType);
      }

      const { data, error } = await query;

      if (error) throw new Error('تعذر تحميل سجل النشاط');

      setEntries((data as ActivityEntry[]) || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'خطأ في التحميل');
    }
  };

  // قائمة الموظفين للترشيح تُبنى من النتائج نفسها لا باستعلام منفصل
  const staffOptions = Array.from(new Set(entries.map(e => e.staff_name).filter(Boolean)));

  // ترشيح الموظف يقع في المتصفح فقط — القائمة والنتائج من نفس الاستعلام
  const filteredEntries = staffFilter === 'all' ? entries : entries.filter(e => e.staff_name === staffFilter);

  const isDefaultFilters = period === '30d' && entityType === 'all' && staffFilter === 'all';

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F0F4F8] flex items-center justify-center" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
          <p className="text-xs font-bold text-slate-400">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-[#F0F4F8] antialiased text-slate-800" dir="rtl">
        <DashboardHeader breadcrumb="سجل النشاط" onBack={() => router.push('/dashboard')} />
        <main className="max-w-2xl mx-auto px-4 py-6">
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm px-5 py-10 text-center">
            <p className="text-sm font-bold text-slate-600">هذه الصفحة للمالك فقط</p>
          </div>
        </main>
        <AppFooter className="max-w-2xl mx-auto px-4 py-8 border-t border-slate-200/60 mt-2" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0F4F8] antialiased text-slate-800" dir="rtl">
      <DashboardHeader breadcrumb="سجل النشاط" onBack={() => router.push('/dashboard')} />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h2 className="text-sm font-black text-[#0F172A]">سجل نشاط الصيدلية</h2>
            <p className="text-[10px] text-slate-400 mt-0.5">{PERIOD_SUMMARY_LABELS[period]}</p>
          </div>

          <div className="px-5 py-3.5 border-b border-slate-100 space-y-3">
            <div className="flex flex-wrap gap-2">
              {PERIOD_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setPeriod(opt.key)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                    period === opt.key
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                value={staffFilter}
                onChange={(e) => setStaffFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:border-slate-900 focus:ring-1 focus:ring-slate-900 focus:outline-none transition text-slate-700 font-semibold"
              >
                <option value="all">كل الموظفين</option>
                {staffOptions.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>

              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:border-slate-900 focus:ring-1 focus:ring-slate-900 focus:outline-none transition text-slate-700 font-semibold"
              >
                {ENTITY_TYPE_OPTIONS.map(opt => (
                  <option key={opt.key} value={opt.key}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="p-5 space-y-3">
            {errorMsg && (
              <p className="text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-2 rounded-xl">{errorMsg}</p>
            )}

            {!errorMsg && filteredEntries.length === 0 && (
              <p className="text-xs font-bold text-slate-400 text-center py-6">
                {isDefaultFilters ? 'لا توجد حركات مسجّلة بعد' : 'لا توجد حركات في هذه الفترة'}
              </p>
            )}

            {filteredEntries.map(entry => (
              <ActivityRow key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      </main>

      <AppFooter className="max-w-2xl mx-auto px-4 py-8 border-t border-slate-200/60 mt-2" />
    </div>
  );
}
