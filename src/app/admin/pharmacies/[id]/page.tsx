'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { adminFetch } from '@/lib/admin-fetch';

interface PharmacyDetail {
  id: string;
  name: string;
  pharmacist_name: string;
  phone_number: string;
  country: string;
  city_address: string;
  status: string;
  total_amount_due: number;
  paid_amount: number;
  expiry_date: string;
  second_payment_date?: string | null;
  created_at: string;
  email?: string;
}

interface Stats {
  patientCount: number;
  visitCount: number;
  lastVisitAt: string | null;
  activeCatalogCount: number;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ar-EG', { numberingSystem: 'latn' });
}

function getDaysLeft(expiryDateStr: string) {
  const expiry = new Date(expiryDateStr);
  const today = new Date();
  return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default function PharmacyCardPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const pharmacyId = resolvedParams.id;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [pharmacy, setPharmacy] = useState<PharmacyDetail | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [formData, setFormData] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [userRole, setUserRole] = useState('support_admin');

  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/');
        return;
      }

      const { data: adminRecord } = await supabase
        .from('platform_admins')
        .select('role')
        .eq('user_id', session.user.id)
        .single();

      if (!adminRecord) {
        router.push('/dashboard');
        return;
      }

      setUserRole(adminRecord.role);
      await fetchData();
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pharmacyId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await adminFetch(`/api/admin/pharmacy-detail/${pharmacyId}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'تعذر تحميل بيانات الصيدلية');

      setPharmacy(data.pharmacy);
      setStats(data.stats);
      setFormData({
        name: data.pharmacy.name,
        pharmacist_name: data.pharmacy.pharmacist_name,
        phone_number: data.pharmacy.phone_number,
        email: data.pharmacy.email || '',
        country: data.pharmacy.country,
        city_address: data.pharmacy.city_address,
        status: data.pharmacy.status,
        total_amount_due: data.pharmacy.total_amount_due,
        paid_amount: data.pharmacy.paid_amount,
        expiry_date: data.pharmacy.expiry_date,
        second_payment_date: data.pharmacy.second_payment_date || '',
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'حدث خطأ أثناء تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg('');

    try {
      const res = await adminFetch('/api/admin/manage-pharmacy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: pharmacyId,
          ...formData,
          second_payment_date: formData.second_payment_date || null,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'فشل حفظ التعديلات');

      await fetchData();
      alert('تم حفظ كل التعديلات بنجاح! ✅');
    } catch (err: any) {
      setErrorMsg(err.message || 'حدث خطأ أثناء الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      setErrorMsg('كلمة المرور يجب ألا تقل عن 6 خانات');
      return;
    }
    setResettingPassword(true);
    setErrorMsg('');

    try {
      const res = await adminFetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: pharmacyId, newPassword }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'فشلت عملية إعادة تعيين كلمة المرور');

      alert('تم تحديث كلمة مرور الصيدلية بنجاح! 🔑');
      setNewPassword('');
      setShowPasswordSection(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'حدث خطأ أثناء تغيير كلمة المرور');
    } finally {
      setResettingPassword(false);
    }
  };

  const handleArchive = async () => {
    if (!pharmacy) return;
    if (!confirm(`هل تريد أرشفة صيدلية "${pharmacy.name}"؟ سيتم حظر تسجيل دخولها فوراً، مع الاحتفاظ الكامل بسجلها المالي وبيانات مرضاها.`)) return;

    try {
      const res = await adminFetch(`/api/admin/manage-pharmacy?id=${pharmacyId}`, { method: 'DELETE' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'فشلت عملية الأرشفة');

      alert('تمت أرشفة الصيدلية بنجاح! 📦');
      router.push('/admin');
    } catch (err: any) {
      alert(err.message || 'فشلت عملية الأرشفة');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center" dir="rtl">
        <p className="text-sm font-bold text-slate-500 animate-pulse">جاري تحميل بيانات الصيدلية...</p>
      </div>
    );
  }

  if (!pharmacy || !formData) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white border border-slate-200 p-6 rounded-2xl max-w-md w-full text-center space-y-3 shadow-sm">
          <div className="text-3xl">⚠️</div>
          <p className="text-sm text-rose-600 font-bold">{errorMsg || 'تعذر إيجاد هذه الصيدلية'}</p>
          <button onClick={() => router.push('/admin')} className="text-xs text-blue-600 font-semibold cursor-pointer">← العودة للوحة الإدارة</button>
        </div>
      </div>
    );
  }

  const statusLabels: Record<string, string> = { active: 'نشط', trial: 'تجريبي', suspended: 'موقوف', archived: 'مؤرشف' };
  const statusColors: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    trial: 'bg-amber-50 text-amber-700 border-amber-200',
    suspended: 'bg-rose-50 text-rose-700 border-rose-200',
    archived: 'bg-slate-100 text-slate-500 border-slate-300',
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans antialiased text-slate-800 pb-16" dir="rtl">
      <header className="bg-[#0F172A] text-white border-b border-slate-800 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex flex-wrap items-center gap-4">
          <button onClick={() => router.push('/admin')} className="text-slate-300 hover:text-white text-sm font-semibold flex items-center gap-1.5 cursor-pointer">
            <span>→</span><span>رجوع للوحة الإدارة</span>
          </button>
          <div className="h-5 w-px bg-slate-700"></div>
          <h1 className="text-base font-bold flex items-center gap-2 min-w-0 flex-1">
            <span className="shrink-0">🏥 كرت الصيدلية:</span>
            <span className="truncate">{pharmacy.name}</span>
          </h1>
          <span className={`text-[10px] px-2.5 py-1 rounded-md font-bold border ${statusColors[pharmacy.status] || ''}`}>
            {statusLabels[pharmacy.status] || pharmacy.status}
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium">{errorMsg}</div>
        )}

        {/* إحصائيات سريعة للسياق */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
            <p className="text-[11px] text-slate-500 font-semibold">عدد المرضى المسجَّلين</p>
            <p className="text-xl font-bold text-[#0F172A] mt-1">{stats?.patientCount ?? 0}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
            <p className="text-[11px] text-slate-500 font-semibold">إجمالي الزيارات الموثَّقة</p>
            <p className="text-xl font-bold text-[#0F172A] mt-1">{stats?.visitCount ?? 0}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
            <p className="text-[11px] text-slate-500 font-semibold">آخر نشاط مسجَّل</p>
            <p className="text-sm font-bold text-[#0F172A] mt-1.5">{stats?.lastVisitAt ? formatDate(stats.lastVisitAt) : 'لا يوجد بعد'}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
            <p className="text-[11px] text-slate-500 font-semibold">منتجات الكتالوج الفعّالة</p>
            <p className="text-xl font-bold text-[#0F172A] mt-1">{stats?.activeCatalogCount ?? 0}</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* البيانات الأساسية */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-[#0F172A] border-b pb-2.5">📋 البيانات الأساسية</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">اسم الصيدلية</label>
                <input required type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0F172A]" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">اسم الصيدلي المسؤول</label>
                <input required type="text" value={formData.pharmacist_name} onChange={(e) => setFormData({ ...formData, pharmacist_name: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0F172A]" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">رقم الهاتف</label>
                <input required type="text" dir="ltr" value={formData.phone_number} onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl font-mono focus:outline-none focus:border-[#0F172A]" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">البريد الإلكتروني (حساب الدخول)</label>
                <input
                  type="email"
                  dir="ltr"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl font-mono focus:outline-none focus:border-[#0F172A]"
                />
                <p className="text-[10px] text-slate-400 mt-1">تغييره يُحدِّث بريد حساب دخول الصيدلية مباشرة — تأكد من صحته قبل الحفظ.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">الدولة</label>
                <input required type="text" value={formData.country} onChange={(e) => setFormData({ ...formData, country: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0F172A]" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">المدينة والعنوان</label>
                <input required type="text" value={formData.city_address} onChange={(e) => setFormData({ ...formData, city_address: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0F172A]" />
              </div>
            </div>
            <p className="text-[10px] text-slate-400 pt-1">تاريخ الانضمام للمنصة: {formatDate(pharmacy.created_at)}</p>
          </div>

          {/* الاشتراك والمالية */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-[#0F172A] border-b pb-2.5">💳 الاشتراك والمالية</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">حالة الاشتراك</label>
                <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl font-medium bg-slate-50/50">
                  <option value="trial">تجريبي</option>
                  <option value="active">نشط</option>
                  <option value="suspended">موقوف</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">الإجمالي المطلوب (JOD)</label>
                <input type="number" value={formData.total_amount_due} onChange={(e) => setFormData({ ...formData, total_amount_due: Number(e.target.value) })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0F172A]" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">المبلغ المدفوع (JOD)</label>
                <input type="number" value={formData.paid_amount} onChange={(e) => setFormData({ ...formData, paid_amount: Number(e.target.value) })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0F172A]" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">تاريخ الانتهاء</label>
                <input type="date" value={formData.expiry_date} onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0F172A]" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">📅 موعد الدفعة الثانية (إن وجد)</label>
                <input type="date" value={formData.second_payment_date} onChange={(e) => setFormData({ ...formData, second_payment_date: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0F172A]" />
              </div>
            </div>

            {pharmacy.status === 'trial' && (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-semibold">
                ⏳ متبقي {Math.max(0, getDaysLeft(pharmacy.expiry_date))} يوم من الفترة التجريبية. عند تحويلها لـ"نشط" من هنا يدويًا،
                تذكّر إضافة هذه الأيام لتاريخ الانتهاء الجديد — أو استخدم "⚡ تجديد سريع" من اللوحة الرئيسية لضمان الحساب الصحيح تلقائيًا.
              </div>
            )}
          </div>

          {/* إعادة تعيين كلمة المرور */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
            <button
              type="button"
              onClick={() => setShowPasswordSection(!showPasswordSection)}
              className="text-sm font-bold text-[#0F172A] flex items-center gap-2 cursor-pointer"
            >
              🔑 إعادة تعيين كلمة مرور الصيدلية {showPasswordSection ? '▲' : '▼'}
            </button>
            {showPasswordSection && (
              <div className="flex gap-2.5 items-end pt-2 border-t border-slate-100">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">كلمة المرور الجديدة</label>
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0F172A]" placeholder="••••••••" />
                </div>
                <button
                  type="button"
                  disabled={resettingPassword}
                  onClick={handleResetPassword}
                  className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-60 rounded-xl transition cursor-pointer"
                >
                  {resettingPassword ? 'جاري...' : 'تأكيد'}
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="px-6 py-2.5 text-xs font-semibold text-white bg-[#0F172A] hover:bg-slate-800 disabled:opacity-60 rounded-xl shadow-md transition cursor-pointer">
                {saving ? 'جاري الحفظ...' : '💾 حفظ كل التعديلات'}
              </button>
              <button type="button" onClick={() => router.push('/admin')} className="px-6 py-2.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer">
                إلغاء
              </button>
            </div>

            {userRole === 'super_admin' && pharmacy.status === 'suspended' && (
              <button type="button" onClick={handleArchive} className="px-4 py-2.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl transition cursor-pointer">
                📦 أرشفة هذه الصيدلية
              </button>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
