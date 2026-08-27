'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import DashboardHeader from '../components/DashboardHeader';
import AppFooter from '../../components/AppFooter';
import { getPharmacyId } from '@/lib/tenant';
import { formatPharmacistName } from '@/lib/name-format';

interface PharmacyProfile {
  id: string;
  name: string;
  pharmacy_name: string | null;
  name_en?: string | null;
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
  max_staff: number;
  short_code: string;
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
  phone: string | null;
  login_slug: string;
  is_active: boolean;
  must_change_pin: boolean;
  created_at: string;
}

const ROLE_LABELS: Record<string, string> = { pharmacist: 'صيدلاني', assistant: 'مساعد', staff: 'موظف' };

function IconWhatsapp({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

/** يبني رابط تعليمات الدخول عبر واتساب — لا يحوي رمز PIN إطلاقاً، رمز PIN يُنسخ من المودال ويُرسل منفصلاً. يحمل كود الصيدلية عمداً فهو ثابت لا سرّي */
function buildStaffLoginWaLink(phone: string, shortCode: string): string {
  const instructions = `للدخول إلى Vitalix:
1) افتح vitalix-ai.com
2) اضغط «دخول الموظفين برمز PIN»
3) كود الصيدلية: ${shortCode}
4) اختر اسمك من القائمة
سيُطلب منك رمز الدخول — احتفظ به ولا تشاركه مع أحد.`;
  return `https://wa.me/${phone.replace('+', '')}?text=${encodeURIComponent(instructions)}`;
}

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

function StaffPinModal({ name, pin, pharmacyCode, loginSlug, onClose }: { name: string; pin: string; pharmacyCode: string; loginSlug: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  // نص جاهز للإرسال للموظف عبر واتساب أو أي قناة أخرى — يحوي كل ما يحتاجه للدخول
  const instructions = `للدخول إلى Vitalix:
1) افتح vitalix-ai.com
2) اضغط «دخول الموظفين برمز PIN»
3) كود الصيدلية: ${pharmacyCode}
4) اختر اسمك من القائمة
5) الرمز: ${pin}
سيُطلب منك اختيار رمز جديد عند أول دخول.`;
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(instructions);
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
          <div className="space-y-1.5">
            <div className="flex items-center justify-center gap-2">
              <span className="text-[11px] font-bold text-slate-400">الموظف</span>
              <span className="font-bold text-slate-800">{name}</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="text-[11px] font-bold text-slate-400">كود الصيدلية</span>
              <span dir="ltr" className="font-mono font-bold text-slate-800">{pharmacyCode}</span>
            </div>
            <p className="text-xs font-bold text-slate-500 pt-1">الرمز:</p>
            <p className="text-4xl font-black tracking-widest text-slate-900">{pin}</p>
          </div>
          <button onClick={handleCopy}
            className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition">
            {copied ? '✓ تم النسخ' : 'نسخ التعليمات'}
          </button>
          <p className="text-[11px] text-slate-400">إن ضاع الرمز يمكنك تصفيره من قائمة الموظفين</p>
          <p className="text-[11px] text-slate-400">سيُطلب من الموظف تغيير الرمز عند أول دخول</p>
        </div>
      </div>
    </div>
  );
}

function StaffRow({
  member, shortCode, isMenuOpen, onToggleMenu, onResetPin, onToggleStatus, onDeleteRequest,
}: {
  member: StaffMember;
  shortCode?: string;
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  onResetPin: () => void;
  onToggleStatus: () => void;
  onDeleteRequest: () => void;
}) {
  return (
    <div className="relative flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 rounded-xl">
      {/* التعتيم يُطبَّق على محتوى الهوية فقط — وليس على الصف كله — حتى لا تُصبح قائمة ⋯ نصف شفافة معه */}
      <div className={`flex items-center gap-3 flex-1 min-w-0 ${!member.is_active ? 'opacity-60' : ''}`}>
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
      </div>
      {member.phone && shortCode && (
        <a href={buildStaffLoginWaLink(member.phone, shortCode)}
          target="_blank" rel="noreferrer"
          className="shrink-0 flex items-center justify-center w-7 h-7 bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-all shadow-sm">
          <IconWhatsapp className="w-3.5 h-3.5" />
        </a>
      )}
      <div className="relative shrink-0">
        <button onClick={(e) => { e.stopPropagation(); onToggleMenu(); }}
          className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors">
          ⋯
        </button>
        {isMenuOpen && (
          <div className="absolute left-0 top-9 z-20 w-40 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden" onClick={e => e.stopPropagation()}>
            <button onClick={onResetPin}
              className="w-full text-right px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors">
              تصفير الرمز
            </button>
            <button onClick={onToggleStatus}
              className="w-full text-right px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors border-t border-slate-100">
              {member.is_active ? 'تعطيل' : 'تفعيل'}
            </button>
            <button onClick={onDeleteRequest}
              className="w-full text-right px-4 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors border-t border-slate-100">
              حذف نهائي
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RotateCodeConfirmModal({ rotating, onConfirm, onCancel }: { rotating: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9999] flex items-end sm:items-center justify-center sm:p-4" onClick={onCancel}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl border border-slate-200" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-900">تبديل كود الصيدلية</h3>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm font-semibold text-slate-700 leading-relaxed">سيتغيّر كود صيدليتك، ولن يستطيع موظفوك الدخول بالكود القديم. ستحتاج إرسال الكود الجديد لكل موظف. هذا الإجراء لا يمكن التراجع عنه.</p>
          <div className="flex gap-2">
            <button onClick={onCancel}
              className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer">
              إلغاء
            </button>
            <button onClick={onConfirm} disabled={rotating}
              className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition cursor-pointer">
              {rotating ? 'جاري التبديل...' : 'تبديل الكود'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeleteStaffModal({ name, deleting, onConfirm, onCancel }: { name: string; deleting: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9999] flex items-end sm:items-center justify-center sm:p-4" onClick={onCancel}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl border border-slate-200" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-900">تأكيد الحذف</h3>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm font-semibold text-slate-700 leading-relaxed">سيُحذف {name} وحسابه نهائياً. لا يمكن التراجع.</p>
          <div className="flex gap-2">
            <button onClick={onCancel}
              className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer">
              إلغاء
            </button>
            <button onClick={onConfirm} disabled={deleting}
              className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition cursor-pointer">
              {deleting ? 'جاري الحذف...' : 'حذف'}
            </button>
          </div>
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
  const [editNameEn, setEditNameEn] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // فريق العمل
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('staff');
  const [addingStaff, setAddingStaff] = useState(false);
  const [staffError, setStaffError] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [pinModal, setPinModal] = useState<{ name: string; pin: string; pharmacyCode: string; loginSlug: string } | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [showRotateConfirm, setShowRotateConfirm] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteBlockedMsg, setDeleteBlockedMsg] = useState('');
  const [showInactive, setShowInactive] = useState(false);

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
      setEditNameEn(data.name_en || '');

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
    const activeCount = staff.filter(s => s.is_active).length;
    if (profile && activeCount >= profile.max_staff) { setStaffError(`الحد الأقصى ${profile.max_staff} صيادلة`); return; }
    if (staff.some(s => s.name === name)) { setStaffError('هذا الاسم مسجّل مسبقاً'); return; }
    setAddingStaff(true); setStaffError('');
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('انتهت الجلسة');
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, role: newStaffRole, phone: newStaffPhone.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'تعذر الإضافة');
      setNewStaffName('');
      setNewStaffPhone('');
      setNewStaffRole('staff');
      await fetchStaffList();
      setPinModal({ name: json.staff.name, pin: json.pin, pharmacyCode: json.pharmacy_code, loginSlug: json.staff.login_slug });
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
      setPinModal({ name: json.staff.name, pin: json.pin, pharmacyCode: json.pharmacy_code, loginSlug: json.staff.login_slug });
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

  const handleDeleteStaff = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('انتهت الجلسة');
      const res = await fetch(`/api/staff/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (res.ok) {
        setStaff(prev => prev.filter(s => s.id !== deleteTarget.id));
        setDeleteTarget(null);
        setDeleteBlockedMsg('');
        await fetchStaffList();
      } else if (res.status === 409) {
        // رسالة تعليمية تشرح للمالك سبب المنع (زيارات مسجّلة) — تبقى ظاهرة حتى يقرأها لا كتنبيه عابر
        setDeleteTarget(null);
        setDeleteBlockedMsg(json.error || 'تعذّر الحذف');
      } else {
        setDeleteTarget(null);
        setStaffError(json.error || 'تعذّر الحذف');
      }
    } catch (e: any) {
      setStaffError(e.message || 'حدث خطأ');
    } finally {
      setDeleting(false);
    }
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
          name_en: editNameEn.trim() || null,
        })
        .eq('id', profile.id);

      if (error) throw new Error(error.message);

      setProfile((prev) => prev ? {
        ...prev,
        phone_number: editPhone.trim(),
        city_address: editCity.trim(),
        pharmacist_name: editPharmacistName.trim(),
        name_en: editNameEn.trim() || null,
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

  const handleRotateCode = async () => {
    setRotating(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('انتهت الجلسة');
      const res = await fetch('/api/pharmacy/rotate-code', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'تعذّر تبديل الكود');

      setProfile((prev) => prev ? { ...prev, short_code: json.short_code } : prev);
      setSuccessMsg(`✅ تم تبديل الكود إلى ${json.short_code} — أرسل التعليمات الجديدة لموظفيك`);
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err: any) {
      setErrorMsg(err.message || 'حدث خطأ أثناء تبديل الكود');
    } finally {
      setShowRotateConfirm(false);
      setRotating(false);
    }
  };

  const handleResetPassword = async () => {
    try {
      setPwLoading(true);
      setPwMsg('');
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/confirm`,
      });
      if (error) {
        setPwMsg('❌ تعذر إرسال الرابط، حاول مجدداً');
        return;
      }
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
  const activeStaffCount = staff.filter(s => s.is_active).length;
  const activeMembers = staff.filter(s => s.is_active);
  const inactiveMembers = staff.filter(s => !s.is_active);

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
              <h1 className="text-base font-black truncate">{formatPharmacistName(profile?.pharmacist_name) || 'الصيدلي المسؤول'}</h1>
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
                    setEditNameEn(profile?.name_en || '');
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
                <InfoRow
                  label="الاسم بالإنجليزية"
                  value={
                    profile?.name_en
                      ? <span dir="ltr">{profile.name_en}</span>
                      : <span className="text-slate-400 font-semibold">لم يُحدَّد</span>
                  }
                />
                <InfoRow label="اسم الصيدلاني" value={profile?.pharmacist_name || '—'} />
                <InfoRow label="رقم الهاتف" value={profile?.phone_number || '—'} />
                <InfoRow label="الدولة" value={profile?.country || '—'} />
                <InfoRow label="المدينة / العنوان" value={profile?.city_address || '—'} />
                <InfoRow label="البريد الإلكتروني" value={email || '—'} />
                <div className="flex items-start justify-between gap-4 py-3">
                  <span className="text-xs font-semibold text-slate-400 shrink-0 w-32">كود الصيدلية</span>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-2">
                      <span dir="ltr" className="text-xs font-black text-slate-800 tracking-widest">{profile?.short_code || '—'}</span>
                      <button
                        onClick={async () => {
                          if (!profile?.short_code) return;
                          try {
                            await navigator.clipboard.writeText(profile.short_code);
                            setCodeCopied(true);
                            setTimeout(() => setCodeCopied(false), 2000);
                          } catch { }
                        }}
                        className="text-[10px] font-black text-teal-600 hover:text-teal-700 bg-teal-50 border border-teal-100 px-2 py-0.5 rounded-md transition cursor-pointer"
                      >
                        {codeCopied ? '✓' : 'نسخ'}
                      </button>
                      <button
                        onClick={() => setShowRotateConfirm(true)}
                        className="text-[10px] font-black text-slate-600 hover:text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md transition cursor-pointer"
                      >
                        تبديل
                      </button>
                    </div>
                    <span className="text-[10px] text-slate-400">يحتاجه موظفوك عند تسجيل الدخول</span>
                  </div>
                </div>
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
                {/* اسم الصيدلية بالإنجليزية */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-black text-slate-600">اسم الصيدلية بالإنجليزية (اختياري)</label>
                  <input
                    type="text"
                    value={editNameEn}
                    onChange={(e) => setEditNameEn(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none transition text-slate-800 font-semibold"
                    placeholder="Pharmacy Name in English"
                    dir="ltr"
                  />
                  <p className="text-[10px] text-slate-400">يُستخدم في التقارير والرسائل الإنجليزية — إن تُرك فارغاً يُستعمل الاسم العربي</p>
                </div>
              </div>
            )}
          </div>

          {/* رسالة الخطأ — تظهر بغضّ النظر عن وضع التعديل، تشمل أخطاء تبديل الكود */}
          {errorMsg && (
            <div className="mx-5 mb-4 text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-2 rounded-xl">
              {errorMsg}
            </div>
          )}

          {/* رسالة النجاح */}
          {successMsg && (
            <div className="mx-5 mb-4 text-[11px] font-bold text-teal-700 bg-teal-50 border border-teal-100 px-3 py-2 rounded-xl">
              {successMsg}
            </div>
          )}
        </div>

        {/* ── فريق العمل ── */}
        {/* بلا overflow-hidden هنا خلافاً لبقية البطاقات — قائمة ⋯ المنبثقة لآخر موظف في القسم المطوي تحتاج الخروج عن حدود البطاقة دون أن تُقصّ */}
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm">
          <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-black text-[#0F172A]">فريق العمل</h2>
              <p className="text-[10px] text-slate-400 mt-0.5">لكل موظف حساب دخول مستقل برمز خاص</p>
            </div>
            {profile && (
              <span dir="ltr" className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg">
                {activeStaffCount} / {profile.max_staff}
              </span>
            )}
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

            {/* رسالة منع الحذف — تعليمية، تبقى ظاهرة حتى يغلقها المالك بنفسه لا كتنبيه عابر */}
            {deleteBlockedMsg && (
              <div className="flex items-start gap-3 px-4 py-3.5 bg-rose-50 border border-rose-200 rounded-xl">
                <span className="text-base shrink-0">⚠️</span>
                <p className="flex-1 text-xs font-bold text-rose-700 leading-relaxed">{deleteBlockedMsg}</p>
                <button onClick={() => setDeleteBlockedMsg('')}
                  className="shrink-0 text-rose-400 hover:text-rose-600 transition-colors">✕</button>
              </div>
            )}

            {/* بقية الفريق — المفعّلون فقط */}
            {activeMembers.map(member => (
              <StaffRow
                key={member.id}
                member={member}
                shortCode={profile?.short_code}
                isMenuOpen={openMenuId === member.id}
                onToggleMenu={() => setOpenMenuId(openMenuId === member.id ? null : member.id)}
                onResetPin={() => handleResetPin(member)}
                onToggleStatus={() => handleToggleStatus(member)}
                onDeleteRequest={() => { setOpenMenuId(null); setDeleteTarget({ id: member.id, name: member.name }); }}
              />
            ))}

            {/* موظفون سابقون — معطّلون، مطويون افتراضياً */}
            {inactiveMembers.length > 0 && (
              <div className="border border-slate-200 rounded-xl">
                <button onClick={() => setShowInactive(v => !v)}
                  className={`w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-xs font-bold text-slate-600 cursor-pointer ${showInactive ? 'rounded-t-xl' : 'rounded-xl'}`}>
                  <span>موظفون سابقون ({inactiveMembers.length})</span>
                  <span className={`transition-transform ${showInactive ? 'rotate-180' : ''}`}>⌄</span>
                </button>
                {showInactive && (
                  <div className="p-3 space-y-3 bg-white border-t border-slate-200 rounded-b-xl">
                    {inactiveMembers.map(member => (
                      <StaffRow
                        key={member.id}
                        member={member}
                        shortCode={profile?.short_code}
                        isMenuOpen={openMenuId === member.id}
                        onToggleMenu={() => setOpenMenuId(openMenuId === member.id ? null : member.id)}
                        onResetPin={() => handleResetPin(member)}
                        onToggleStatus={() => handleToggleStatus(member)}
                        onDeleteRequest={() => { setOpenMenuId(null); setDeleteTarget({ id: member.id, name: member.name }); }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* إضافة صيدلاني جديد */}
            {profile && activeStaffCount < profile.max_staff && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={newStaffName}
                  onChange={e => { setNewStaffName(e.target.value); setStaffError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleAddStaff()}
                  placeholder="اسم الصيدلاني الجديد"
                  className="flex-1 min-w-[140px] px-4 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:border-slate-900 focus:outline-none transition text-slate-800 font-semibold"
                />
                <input
                  type="tel"
                  value={newStaffPhone}
                  onChange={e => { setNewStaffPhone(e.target.value); setStaffError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleAddStaff()}
                  placeholder="رقم الهاتف (اختياري)"
                  dir="ltr"
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

            {profile && activeStaffCount >= profile.max_staff && (
              <p className="text-[11px] text-slate-400 text-center font-medium">
                تم الوصول للحد الأقصى ({profile.max_staff} صيادلة)
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
        <StaffPinModal name={pinModal.name} pin={pinModal.pin} pharmacyCode={pinModal.pharmacyCode} loginSlug={pinModal.loginSlug} onClose={() => setPinModal(null)} />
      )}

      {deleteTarget && (
        <DeleteStaffModal name={deleteTarget.name} deleting={deleting} onConfirm={handleDeleteStaff} onCancel={() => setDeleteTarget(null)} />
      )}

      {showRotateConfirm && (
        <RotateCodeConfirmModal rotating={rotating} onConfirm={handleRotateCode} onCancel={() => setShowRotateConfirm(false)} />
      )}

      <AppFooter className="max-w-2xl mx-auto px-4 py-8 border-t border-slate-200/60 mt-2" />
    </div>
  );
}
