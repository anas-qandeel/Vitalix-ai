'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import DashboardHeader from '../components/DashboardHeader';
import AppFooter from '../../components/AppFooter';
import { getPharmacyId } from '@/lib/tenant';

interface PharmacyProfile {
  id: string;
  name: string;
  pharmacy_name: string | null;
  pharmacist_name: string;
  phone_number: string;
  country: string;
  city_address: string;
  status: string;
  subscription_type: string;
  total_amount_due: number;
  paid_amount: number;
  expiry_date: string;
  created_at: string;
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
  login_slug: string;
  is_active: boolean;
  must_change_pin: boolean;
  created_at: string;
}

const ROLE_LABELS: Record<string, string> = { pharmacist: 'صيدلاني', assistant: 'مساعد', staff: 'موظف' };

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active:    { label: 'نشط',     cls: 'bg-teal-50 text-teal-700 border-teal-200' },
    trial:     { label: 'تجريبي',  cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    suspended: { label: 'موقوف',   cls: 'bg-rose-50 text-rose-700 border-rose-200' },
    archived:  { label: 'مؤرشف',   cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  };
  const s = map[status] || { label: status, cls: 'bg-slate-100 text-slate-500 border-slate-200' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black border ${s.cls}`}>
      {s.label}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-100 last:border-0">
      <span className="text-xs font-semibold text-slate-400 shrink-0 w-32">{label}</span>
      <span className="text-xs font-black text-slate-800 text-left">{value}</span>
    </div>
  );
}

function StaffPinModal({ name, pin, onClose }: { name: string; pin: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { }
  };
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9999] flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl border border-slate-200" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-900">رمز الدخول لـ {name}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-colors shrink-0">✕</button>
        </div>
        <div className="px-6 py-6 text-center space-y-4">
          <p dir="ltr" className="text-4xl font-black tracking-widest text-slate-900">{pin}</p>
          <button onClick={handleCopy}
            className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition">
            {copied ? '✓ تم النسخ' : 'نسخ'}
          </button>
          <p className="text-[11px] text-slate-400">إن ضاع الرمز يمكنك تصفيره من قائمة الموظفين</p>
          <p className="text-[11px] text-slate-400">سيُطلب من الموظف تغيير الرمز عند أول دخول</p>
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<PharmacyProfile | null>(null);
  const [email, setEmail] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // حقول التعديل
  const [editPhone, setEditPhone] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editPharmacistName, setEditPharmacistName] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // فريق العمل
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('staff');
  const [addingStaff, setAddingStaff] = useState(false);
  const [staffError, setStaffError] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [pinModal, setPinModal] = useState<{ name: string; pin: string } | null>(null);
  const MAX_STAFF = 8;

  // إغلاق قائمة إجراءات الموظف عند النقر خارجها
  useEffect(() => {
    if (!openMenuId) return;
    const handler = () => setOpenMenuId(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [openMenuId]);

  // تغيير كلمة المرور
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState('');

  useEffect(() => {
    fetchProfile();
  }, []);

  const getAuthToken = async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  };

  // فريق العمل عبر مسار API بدل القراءة المباشرة من المتصفح — يتحقق من صلاحية المالك عبر التوكن
  const fetchStaffList = async () => {
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch('/api/staff', { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (res.ok) setStaff((json.staff as StaffMember[]) || []);
    } catch { }
  };

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/'); return; }
      const pid = await getPharmacyId();
      if (!pid) return;

      setEmail(session.user.email || '');

      const { data, error } = await supabase
        .from('pharmacies')
        .select('*')
        .eq('id', pid)
        .single();

      if (error || !data) throw new Error('تعذر تحميل بيانات الصيدلية');

      setProfile(data as PharmacyProfile);
      setEditPhone(data.phone_number || '');
      setEditCity(data.city_address || '');
      setEditPharmacistName(data.pharmacist_name || '');

      // تحميل فريق العمل عبر مسار API
      await fetchStaffList();
    } catch (err: any) {
      setErrorMsg(err.message || 'خطأ في التحميل');
    } finally {
      setLoading(false);
    }
  };

  // الأولوية: name (العمود الرسمي) ← pharmacy_name (fallback للسجلات القديمة فقط)
  const getPharmacyDisplayName = () => {
    if (!profile) return 'صيدليتك';
    const raw = profile.name || profile.pharmacy_name || '';
    if (!raw.trim()) return 'صيدليتك';
    return raw.startsWith('صيدلية') ? raw : `صيدلية ${raw}`;
  };

  const handleAddStaff = async () => {
    const name = newStaffName.trim();
    if (!name) return;
    if (staff.length >= MAX_STAFF) { setStaffError(`الحد الأقصى ${MAX_STAFF} صيادلة`); return; }
    if (staff.some(s => s.name === name)) { setStaffError('هذا الاسم مسجّل مسبقاً'); return; }
    setAddingStaff(true); setStaffError('');
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('انتهت الجلسة');
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, role: newStaffRole }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'تعذر الإضافة');
      setNewStaffName('');
      setNewStaffRole('staff');
      await fetchStaffList();
      setPinModal({ name: json.staff.name, pin: json.pin });
    } catch (e: any) { setStaffError(e.message || 'حدث خطأ'); }
    finally { setAddingStaff(false); }
  };

  const handleResetPin = async (member: StaffMember) => {
    setOpenMenuId(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('انتهت الجلسة');
      const res = await fetch(`/api/staff/${member.id}/reset-pin`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'تعذّر تصفير الرمز');
      await fetchStaffList();
      setPinModal({ name: json.staff.name, pin: json.pin });
    } catch (e: any) { setStaffError(e.message || 'حدث خطأ'); }
  };

  const handleToggleStatus = async (member: StaffMember) => {
    setOpenMenuId(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('انتهت الجلسة');
      const res = await fetch(`/api/staff/${member.id}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !member.is_active }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'تعذّر تحديث الحالة');
      await fetchStaffList();
    } catch (e: any) { setStaffError(e.message || 'حدث خطأ'); }
  };

  const getDaysLeft = () => {
    if (!profile?.expiry_date) return 0;
    return Math.max(0, Math.ceil((new Date(profile.expiry_date).getTime() - Date.now()) / 86400000));
  };

  const getAmountRemaining = () => {
    if (!profile) return 0;
    return Math.max(0, profile.total_amount_due - profile.paid_amount);
  };

  const pluralizeDays = (days: number): string => {
    if (days === 1) return 'يوم واحد';
    if (days === 2) return 'يومان';
    if (days <= 10) return `${days} أيام`;
    return `${days} يوماً`;
  };

  const handleSaveProfile = async () => {
    if (!profile) return;
    try {
      setSaving(true);
      setSuccessMsg('');
      setErrorMsg('');

      const { error } = await supabase
        .from('pharmacies')
        .update({
          phone_number: editPhone.trim(),
          city_address: editCity.trim(),
          pharmacist_name: editPharmacistName.trim(),
        })
        .eq('id', profile.id);

      if (error) throw new Error(error.message);

      setProfile((prev) => prev ? {
        ...prev,
        phone_number: editPhone.trim(),
        city_address: editCity.trim(),
        pharmacist_name: editPharmacistName.trim(),
      } : prev);

      setSuccessMsg('✅ تم حفظ البيانات بنجاح');
      setIsEditing(false);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'حدث خطأ أثناء الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    try {
      setPwLoading(true);
      setPwMsg('');
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setPwMsg('✅ تم إرسال رابط تغيير كلمة المرور إلى بريدك الإلكتروني');
    } catch {
      setPwMsg('❌ تعذر إرسال الرابط، حاول مجدداً');
    } finally {
      setPwLoading(false);
    }
  };

  const daysLeft = getDaysLeft();
  const isExpiringSoon = daysLeft <= 14;
  const amountRemaining = getAmountRemaining();

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

  return (
    <div className="min-h-screen bg-[#F0F4F8] antialiased text-slate-800" dir="rtl">
      <DashboardHeader breadcrumb="الملف الشخصي" onBack={() => router.push('/dashboard')} />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* ── رأس الصفحة ── */}
        <div className="bg-[#0F172A] text-white p-5 rounded-2xl shadow-lg relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{ backgroundImage: 'repeating-linear-gradient(135deg, #fff 0, #fff 1px, transparent 0, transparent 50%)', backgroundSize: '24px 24px' }} />
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-teal-400 to-teal-700 rounded-r-full" />
          <div className="relative flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-800 flex items-center justify-center text-xl font-black text-white shadow-lg shrink-0">
              {profile?.pharmacist_name?.trim().split(' ').map(w => w[0]).slice(0, 2).join('') || '؟'}
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-black truncate">د. {profile?.pharmacist_name || 'الصيدلي المسؤول'}</h1>
              <p className="text-sm text-teal-300 font-semibold truncate mt-0.5">{getPharmacyDisplayName()}</p>
              <p className="text-[11px] text-slate-400 mt-1">{email}</p>
            </div>
          </div>
        </div>

        {/* ── بطاقة الاشتراك ── */}
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-black text-[#0F172A]">حالة الاشتراك</h2>
            {profile && <StatusBadge status={profile.status} />}
          </div>
          <div className="px-5 py-2">
            <InfoRow label="تاريخ الانتهاء" value={
              <span className={isExpiringSoon ? 'text-amber-600' : 'text-slate-800'}>
                {profile?.expiry_date
                  ? new Date(profile.expiry_date).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', numberingSystem: 'latn' })
                  : '—'}
                {isExpiringSoon && (
                  <span className="mr-2 text-[10px] bg-amber-100 text-amber-700 font-black px-2 py-0.5 rounded-full border border-amber-200">
                    ⚠️ متبقي {pluralizeDays(daysLeft)}
                  </span>
                )}
              </span>
            } />
            <InfoRow label="إجمالي الاشتراك" value={`${profile?.total_amount_due ?? 0} JOD`} />
            <InfoRow label="المبلغ المدفوع" value={`${profile?.paid_amount ?? 0} JOD`} />
            {amountRemaining > 0 && (
              <InfoRow label="المتبقي" value={
                <span className="text-rose-600 font-black">{amountRemaining} JOD</span>
              } />
            )}
            <InfoRow label="تاريخ التسجيل" value={
              profile?.created_at
                ? new Date(profile.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', numberingSystem: 'latn' })
                : '—'
            } />
          </div>
        </div>

        {/* ── بيانات الصيدلية (قابلة للتعديل) ── */}
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-black text-[#0F172A]">بيانات الصيدلية</h2>
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="text-[11px] font-black text-teal-600 hover:text-teal-700 bg-teal-50 border border-teal-100 px-3 py-1.5 rounded-xl transition cursor-pointer"
              >
                ✏️ تعديل
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditPhone(profile?.phone_number || '');
                    setEditCity(profile?.city_address || '');
                    setEditPharmacistName(profile?.pharmacist_name || '');
                    setErrorMsg('');
                  }}
                  className="text-[11px] font-black text-slate-500 hover:text-slate-700 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="text-[11px] font-black text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 px-3 py-1.5 rounded-xl transition cursor-pointer"
                >
                  {saving ? 'جاري الحفظ...' : '💾 حفظ'}
                </button>
              </div>
            )}
          </div>

          <div className="px-5 py-2">
            {!isEditing ? (
              <>
                <InfoRow label="اسم الصيدلية" value={getPharmacyDisplayName()} />
                <InfoRow label="اسم الصيدلاني" value={profile?.pharmacist_name || '—'} />
                <InfoRow label="رقم الهاتف" value={profile?.phone_number || '—'} />
                <InfoRow label="الدولة" value={profile?.country || '—'} />
                <InfoRow label="المدينة / العنوان" value={profile?.city_address || '—'} />
                <InfoRow label="البريد الإلكتروني" value={email || '—'} />
              </>
            ) : (
              <div className="py-3 space-y-4">
                {/* اسم الصيدلاني */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-black text-slate-600">اسم الصيدلاني</label>
                  <input
                    type="text"
                    value={editPharmacistName}
                    onChange={(e) => setEditPharmacistName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none transition text-slate-800 font-semibold"
                    placeholder="اسم الصيدلاني"
                  />
                </div>
                {/* رقم الهاتف */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-black text-slate-600">رقم الهاتف</label>
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none transition text-slate-800 font-semibold"
                    placeholder="07XXXXXXXX"
                    dir="ltr"
                  />
                </div>
                {/* المدينة / العنوان */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-black text-slate-600">المدينة / العنوان</label>
                  <input
                    type="text"
                    value={editCity}
                    onChange={(e) => setEditCity(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none transition text-slate-800 font-semibold"
                    placeholder="عمان — شارع ..."
                  />
                </div>
                {/* رسالة الخطأ */}
                {errorMsg && (
                  <p className="text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-2 rounded-xl">{errorMsg}</p>
                )}
              </div>
            )}
          </div>

          {/* رسالة النجاح */}
          {successMsg && (
            <div className="mx-5 mb-4 text-[11px] font-bold text-teal-700 bg-teal-50 border border-teal-100 px-3 py-2 rounded-xl">
              {successMsg}
            </div>
          )}
        </div>

        {/* ── فريق العمل ── */}
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-black text-[#0F172A]">فريق العمل</h2>
              <p className="text-[10px] text-slate-400 mt-0.5">لكل موظف حساب دخول مستقل برمز خاص</p>
            </div>
            <span dir="ltr" className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg">
              {staff.length} / {MAX_STAFF}
            </span>
          </div>

          <div className="p-5 space-y-4">
            {/* الصيدلاني الرئيسي */}
            {profile && (
              <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center text-xs font-black shrink-0">
                  {profile.pharmacist_name?.charAt(0) || '؟'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{profile.pharmacist_name || '—'}</p>
                  <p className="text-[10px] text-slate-400">الصيدلاني الرئيسي — لا يمكن حذفه</p>
                </div>
                <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md shrink-0">رئيسي</span>
              </div>
            )}

            {/* بقية الفريق */}
            {staff.map(member => (
              <div key={member.id} className={`relative flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 rounded-xl ${!member.is_active ? 'opacity-60' : ''}`}>
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-black shrink-0">
                  {member.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-slate-900 truncate">{member.name}</p>
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md shrink-0">
                      {ROLE_LABELS[member.role] || member.role}
                    </span>
                    {!member.is_active && (
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md shrink-0">معطّل</span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">{member.login_slug}</p>
                </div>
                <div className="relative shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === member.id ? null : member.id); }}
                    className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors">
                    ⋯
                  </button>
                  {openMenuId === member.id && (
                    <div className="absolute left-0 top-9 z-20 w-40 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden" onClick={e => e.stopPropagation()}>
                      <button onClick={() => handleResetPin(member)}
                        className="w-full text-right px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors">
                        تصفير الرمز
                      </button>
                      <button onClick={() => handleToggleStatus(member)}
                        className="w-full text-right px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors border-t border-slate-100">
                        {member.is_active ? 'تعطيل' : 'تفعيل'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* إضافة صيدلاني جديد */}
            {staff.length < MAX_STAFF && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={newStaffName}
                  onChange={e => { setNewStaffName(e.target.value); setStaffError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleAddStaff()}
                  placeholder="اسم الصيدلاني الجديد"
                  className="flex-1 min-w-[140px] px-4 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:border-slate-900 focus:outline-none transition text-slate-800 font-semibold"
                />
                <select
                  value={newStaffRole}
                  onChange={e => setNewStaffRole(e.target.value)}
                  className="px-3 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:border-slate-900 focus:outline-none transition text-slate-800 font-semibold shrink-0"
                >
                  <option value="staff">موظف</option>
                  <option value="assistant">مساعد</option>
                  <option value="pharmacist">صيدلاني</option>
                </select>
                <button onClick={handleAddStaff} disabled={addingStaff || !newStaffName.trim()}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 shrink-0">
                  {addingStaff ? '...' : '+ إضافة'}
                </button>
              </div>
            )}

            {staff.length >= MAX_STAFF && (
              <p className="text-[11px] text-slate-400 text-center font-medium">
                تم الوصول للحد الأقصى ({MAX_STAFF} صيادلة)
              </p>
            )}

            {staffError && (
              <p className="text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-2 rounded-xl">{staffError}</p>
            )}
          </div>
        </div>

        {/* ── تغيير كلمة المرور ── */}
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h2 className="text-sm font-black text-[#0F172A]">كلمة المرور</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">سيُرسل رابط التغيير إلى بريدك الإلكتروني</p>
          </div>
          <div className="px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-600 font-semibold">{email}</p>
              <button
                onClick={handleResetPassword}
                disabled={pwLoading}
                className="shrink-0 text-[11px] font-black text-white bg-[#0F172A] hover:bg-slate-700 disabled:opacity-50 px-4 py-2 rounded-xl transition cursor-pointer"
              >
                {pwLoading ? 'جاري الإرسال...' : '🔑 إرسال رابط التغيير'}
              </button>
            </div>
            {pwMsg && (
              <p className={`mt-3 text-[11px] font-bold px-3 py-2 rounded-xl border ${
                pwMsg.startsWith('✅')
                  ? 'text-teal-700 bg-teal-50 border-teal-100'
                  : 'text-rose-600 bg-rose-50 border-rose-100'
              }`}>{pwMsg}</p>
            )}
          </div>
        </div>

      </main>

      {pinModal && (
        <StaffPinModal name={pinModal.name} pin={pinModal.pin} onClose={() => setPinModal(null)} />
      )}

      <AppFooter className="max-w-2xl mx-auto px-4 py-8 border-t border-slate-200/60 mt-2" />
    </div>
  );
}
