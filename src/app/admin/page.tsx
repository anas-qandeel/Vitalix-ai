'use client';

import { useEffect, useState } from 'react';
import FeedbackInbox from './FeedbackInbox';
import AppFooter from '../components/AppFooter';
import { supabase } from '@/lib/supabase';
import { adminFetch } from '@/lib/admin-fetch';
import { useRouter } from 'next/navigation';

interface Pharmacy {
  id: string;
  name: string;
  pharmacist_name: string;
  phone_number: string;
  email?: string; // البريد الإلكتروني القادم ديناميكياً من auth.users عبر الـ View
  country: string;
  city_address: string;
  status: string;
  total_amount_due: number;
  paid_amount: number;
  expiry_date: string;
  second_payment_date?: string;
}

interface Feedback {
  id: string;
  pharmacy_id: string;
  pharmacy_name: string | null;
  pharmacist_name: string | null;
  type: string;
  message: string;
  rating: number | null;
  is_read: boolean;
  is_archived: boolean;
  status: string;
  admin_note: string | null;
  handled_by: string | null;
  handled_at: string | null;
  actions: Array<{ status: string; note: string | null; by: string | null; at: string }>;
  pharmacy_phone: string | null;
  created_at: string;
}

interface PlatformAdmin {
  id: string;
  user_id: string;
  role: string;
  name?: string;
  email?: string;
  created_at: string;
}

// دالة لتنسيق رقم الهاتف بالصيغة الدولية لفتح واتساب بسلاسة ودون تعليق
const formatWhatsAppNumber = (phone: string) => {
  let cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '962' + cleaned.substring(1);
  }
  return cleaned;
};

// تاريخ افتراضي بعد 30 يوماً للدفعة الثانية
const getDefaultSecondPaymentDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().split('T')[0];
};

function pluralizeDays(days: number): string {
  if (days === 1) return 'يوم واحد';
  if (days === 2) return 'يومان';
  if (days <= 10) return `${days} أيام`;
  return `${days} يوماً`;
}

export default function SuperAdminPage() {
  const [activeTab, setActiveTab] = useState<'pharmacies' | 'expiring' | 'admins' | 'feedback'>('pharmacies');
  
  // حالات الصيدليات
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditPharmacyModalOpen, setIsEditPharmacyModalOpen] = useState(false);
  const [selectedPharmacyForEdit, setSelectedPharmacyForEdit] = useState<Pharmacy | null>(null);
  
  // حالات التجديد السريع مع الإدخال اليدوي للمدفوع
  const [isQuickRenewModalOpen, setIsQuickRenewModalOpen] = useState(false);
  const [selectedPharmacyForRenew, setSelectedPharmacyForRenew] = useState<Pharmacy | null>(null);
  const [renewPlan, setRenewPlan] = useState<'50' | '40' | '35' | '25'>('50');
  const [isQuickInstallment, setIsQuickInstallment] = useState(false);
  const [quickPaidAmount, setQuickPaidAmount] = useState<number>(25);
  const [quickSecondDate, setQuickSecondDate] = useState(getDefaultSecondPaymentDate());

  // حالات تسجيل الدفعة الثانية
  const [isSecondPaymentModalOpen, setIsSecondPaymentModalOpen] = useState(false);
  const [selectedPharmacyForSecondPayment, setSelectedPharmacyForSecondPayment] = useState<Pharmacy | null>(null);
  const [secondPaymentAmount, setSecondPaymentAmount] = useState<number>(0);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // حالات المسؤولين وصلاحيات الحساب الحالي
  const [admins, setAdmins] = useState<PlatformAdmin[]>([]);
  const [feedbackList, setFeedbackList] = useState<Feedback[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackTypeFilter, setFeedbackTypeFilter] = useState<string>('all');
  const [feedbackShowArchived, setFeedbackShowArchived] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<Feedback | null>(null);
  const [actionStatus, setActionStatus] = useState('');
  const [actionNote, setActionNote] = useState('');
  const [actionSaving, setActionSaving] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('support_admin'); 
  const [currentUserName, setCurrentUserName] = useState<string>('');
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('');
  
  // بيانات نموذج المسؤول الجديد
  const [adminFormData, setAdminFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'super_admin'
  });

  // تغيير كلمة المرور
  const [newPassword, setNewPassword] = useState('');
  // هدف تغيير كلمة المرور: قد يكون مسؤول نظام أو صيدلية (أو null = تغيير كلمة مرور المستخدم الحالي نفسه)
  const [passwordResetTarget, setPasswordResetTarget] = useState<{ user_id: string; label: string } | null>(null);

  const [editingAdminId, setEditingAdminId] = useState<string | null>(null);
  const [adminActionLoading, setAdminActionLoading] = useState(false);

  const router = useRouter();

  // نموذج إضافة صيدلية مع إدخال المبلغ المدفوع يدوياً
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    pharmacy_name: '',
    pharmacist_name: '',
    phone_number: '',
    country: 'الأردن',
    city_address: 'عمان',
    payment_plan: '50',
    is_installment: false,
    custom_paid_amount: 25,
    second_payment_date: getDefaultSecondPaymentDate(),
    trial_days: '30'
  });

  // نموذج تعديل صيدلية
  const [editPharmacyData, setEditPharmacyData] = useState({
    id: '',
    name: '',
    pharmacist_name: '',
    phone_number: '',
    city_address: '',
    status: 'active',
    paid_amount: 0,
    expiry_date: '',
    second_payment_date: ''
  });

  // 🎯 جلب الصيدليات المباشر بدون تكرار داتا من الـ View المعمارية
  const fetchPharmacies = async () => {
    const { data, error } = await supabase
      .from('admin_pharmacies_view') // 👈 تم التحديث للجلب من الـ View الموحدة
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setPharmacies(data as Pharmacy[]);
    }
  };

  // جلب المسؤولين
  const fetchAdmins = async () => {
    // نقرأ مباشرة من الـ View الجاهزة (تجلب البريد من auth.users)، بنفس نمط fetchPharmacies
    const { data, error } = await supabase
      .from('platform_admins_view')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) setAdmins(data as PlatformAdmin[]);
  };

  const fetchFeedback = async () => {
    setFeedbackLoading(true);
    try {
      const { data, error } = await supabase
        .from('feedback')
        .select('id, pharmacy_id, pharmacy_name, pharmacist_name, type, message, rating, is_read, is_archived, status, admin_note, handled_by, handled_at, actions, created_at')
        .order('created_at', { ascending: false });
      if (!error && data) {
        // جلب أرقام هواتف الصيدليات
        const ids = [...new Set((data as any[]).map(f => f.pharmacy_id).filter(Boolean))];
        const { data: phones } = await supabase
          .from('pharmacies').select('id, phone_number').in('id', ids);
        const phoneMap: Record<string, string> = {};
        (phones || []).forEach((p: any) => { phoneMap[p.id] = p.phone_number; });
        const enriched = (data as any[]).map(f => ({
          ...f,
          actions: Array.isArray(f.actions) ? f.actions : [],
          pharmacy_phone: phoneMap[f.pharmacy_id] || null,
        }));
        setFeedbackList(enriched as Feedback[]);
      }
    } catch { }
    finally { setFeedbackLoading(false); }
  };

  const markAsRead = async (id: string) => {
    const { error } = await supabase.from('feedback').update({ is_read: true }).eq('id', id);
    if (!error) setFeedbackList(prev => prev.map(f => f.id === id ? { ...f, is_read: true } : f));
  };

  // تعليم مقروء عند الدخول لـ tab
  const markAllReadOnTabOpen = async () => {
    const unread = feedbackList.filter(f => !f.is_read && !f.is_archived).map(f => f.id);
    if (!unread.length) return;
    const { error } = await supabase.from('feedback').update({ is_read: true }).in('id', unread);
    if (!error) setFeedbackList(prev => prev.map(f => unread.includes(f.id) ? { ...f, is_read: true } : f));
  };

  const toggleArchive = async (id: string, current: boolean) => {
    await supabase.from('feedback').update({ is_archived: !current, is_read: true }).eq('id', id);
    setFeedbackList(prev => prev.map(f => f.id === id ? { ...f, is_archived: !current, is_read: true } : f));
  };

  const handleSaveAction = async () => {
    if (!actionFeedback || !actionNote.trim() && actionStatus === (actionFeedback.status || 'new')) return;
    setActionSaving(true);
    try {
      const newAction = {
        status: actionStatus,
        note: actionNote.trim() || null,
        by: currentUserName || 'الأدمن',
        at: new Date().toISOString(),
      };
      const updatedActions = [...(actionFeedback.actions || []), newAction];
      await supabase.from('feedback').update({
        status: actionStatus,
        actions: updatedActions,
        handled_by: newAction.by,
        handled_at: newAction.at,
        is_read: true,
      }).eq('id', actionFeedback.id);
      setFeedbackList(prev => prev.map(f => f.id === actionFeedback.id ? {
        ...f, status: actionStatus,
        actions: updatedActions,
        handled_by: newAction.by,
        handled_at: newAction.at,
        is_read: true,
      } : f));
      setActionFeedback(null);
      setActionNote('');
    } catch { }
    finally { setActionSaving(false); }
  };

  const markAllRead = async () => {
    const unread = feedbackList.filter(f => !f.is_read).map(f => f.id);
    if (!unread.length) return;
    await supabase.from('feedback').update({ is_read: true }).in('id', unread);
    setFeedbackList(prev => prev.map(f => ({ ...f, is_read: true })));
  };

  useEffect(() => {
    const checkAdminPermission = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        router.push('/');
        return;
      }

      setCurrentUserId(session.user.id);

      const { data: adminRecord, error } = await supabase
        .from('platform_admins')
        .select('role, name')
        .eq('user_id', session.user.id)
        .single();

      if (error || !adminRecord) {
        router.push('/dashboard');
        return;
      }

      setUserRole(adminRecord.role);
      setCurrentUserName(adminRecord.name || session.user.user_metadata?.full_name || 'مسؤول النظام');
      setCurrentUserEmail(session.user.email || '');

      await Promise.all([fetchPharmacies(), fetchAdmins(), fetchFeedback()]);
      setLoading(false);
    };

    checkAdminPermission();
  }, [router]);

  // دالة مساعدة لحساب الإجمالي عند تغيير خطة إضافة صيدلية
  const handlePlanChangeForAdd = (plan: string) => {
    let total = 50;
    if (plan === '40') total = 40;
    else if (plan === '35') total = 35;
    else if (plan === '25') total = 25;
    else if (plan === 'trial_0') total = 0;

    setFormData({
      ...formData,
      payment_plan: plan,
      custom_paid_amount: total / 2
    });
  };

  // إضافة صيدلية جديدة
  const handleCreatePharmacy = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');

    try {
      let totalDue = 50;
      if (formData.payment_plan === '40') totalDue = 40;
      else if (formData.payment_plan === '35') totalDue = 35;
      else if (formData.payment_plan === '25') totalDue = 25;
      else if (formData.payment_plan === 'trial_0') totalDue = 0;

      let paid = totalDue;
      let secondDate = null;

      if (formData.payment_plan === 'trial_0') {
        paid = 0;
      } else if (formData.is_installment) {
        paid = Number(formData.custom_paid_amount) || 0;
        secondDate = formData.second_payment_date;

        // تحقق: المبلغ المدفوع أولاً يجب ألا يتجاوز إجمالي قيمة الخطة أبداً
        if (paid <= 0) {
          setErrorMsg('المبلغ المدفوع يجب أن يكون أكبر من صفر');
          setSubmitting(false);
          return;
        }
        if (paid > totalDue) {
          setErrorMsg(`المبلغ المدفوع لا يمكن أن يتجاوز إجمالي قيمة الخطة (${totalDue} JOD)`);
          setSubmitting(false);
          return;
        }
      }

      const res = await adminFetch('/api/admin/create-pharmacy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          total_amount_due: totalDue,
          paid_amount: paid,
          second_payment_date: secondDate,
          trial_days: formData.payment_plan === 'trial_0' ? formData.trial_days : '30'
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'فشلت عملية الإضافة');
      }

      await fetchPharmacies();
      setIsModalOpen(false);
      setFormData({
        email: '',
        password: '',
        pharmacy_name: '',
        pharmacist_name: '',
        phone_number: '',
        country: 'الأردن',
        city_address: 'عمان',
        payment_plan: '50',
        is_installment: false,
        custom_paid_amount: 25,
        second_payment_date: getDefaultSecondPaymentDate(),
        trial_days: '30'
      });
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // حفظ تعديل الصيدلية
  const handleUpdatePharmacy = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');

    try {
      const res = await adminFetch('/api/admin/manage-pharmacy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editPharmacyData),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'فشلت عملية التحديث');

      await fetchPharmacies();
      setIsEditPharmacyModalOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // عملية التجديد السريع مع الإدخال اليدوي للمدفوع
  const handleQuickRenewSubmit = async () => {
    if (!selectedPharmacyForRenew) return;

    let totalPlanAmount = 50;
    if (renewPlan === '40') totalPlanAmount = 40;
    else if (renewPlan === '35') totalPlanAmount = 35;
    else if (renewPlan === '25') totalPlanAmount = 25;

    // تحقق من صحة المبلغ المدفوع عند التقسيط قبل أي استدعاء للخادم
    if (isQuickInstallment) {
      const paidNow = Number(quickPaidAmount) || 0;
      if (paidNow <= 0) {
        setErrorMsg('المبلغ المدفوع يجب أن يكون أكبر من صفر');
        return;
      }
      if (paidNow > totalPlanAmount) {
        setErrorMsg(`المبلغ المدفوع لا يمكن أن يتجاوز قيمة الخطة (${totalPlanAmount} JOD)`);
        return;
      }
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      const currentExpiry = new Date(selectedPharmacyForRenew.expiry_date);
      const today = new Date();
      const baseDate = currentExpiry > today ? currentExpiry : today;

      const monthsToAdd = renewPlan === '25' ? 6 : 12;

      const amountToAdd = isQuickInstallment ? (Number(quickPaidAmount) || 0) : totalPlanAmount;
      const secondDateToSave = isQuickInstallment ? quickSecondDate : null;

      const newExpiryDate = new Date(baseDate);
      newExpiryDate.setMonth(newExpiryDate.getMonth() + monthsToAdd);
      const formattedExpiry = newExpiryDate.toISOString().split('T')[0];

      // إصلاح: paid_amount يمثل دفعة الدورة الحالية فقط (لم يعد يتراكم مع paid_amount القديم)،
      // لأن total_amount_due أيضاً يُستبدل بقيمة الخطة الجديدة في كل تجديد — إبقاء paid_amount
      // متراكماً كان يُنتج أرقاماً لا معنى لها مثل "150 / 50 JOD" بعد عدة تجديدات،
      // ويُفسد حساب "المبالغ المتبقية للتحصيل" في أعلى الصفحة.
      const newPaidAmount = amountToAdd;

      const res = await adminFetch('/api/admin/manage-pharmacy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedPharmacyForRenew.id,
          status: 'active',
          paid_amount: newPaidAmount,
          total_amount_due: totalPlanAmount,
          expiry_date: formattedExpiry,
          second_payment_date: secondDateToSave
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'فشلت عملية التجديد');

      await fetchPharmacies();
      setIsQuickRenewModalOpen(false);
      setSelectedPharmacyForRenew(null);
      setIsQuickInstallment(false);
      alert('تم تجديد الاشتراك وترحيل الأيام وتحديث الدفعة الثانية بنجاح! 🚀');
    } catch (err: any) {
      setErrorMsg(err.message || 'حدث خطأ أثناء التجديد');
    } finally {
      setSubmitting(false);
    }
  };

  // تعطيل أو تفعيل صيدلية سريعاً
  const handleTogglePharmacyStatus = async (pharmacy: Pharmacy) => {
    const newStatus = pharmacy.status === 'suspended' ? 'active' : 'suspended';
    const actionName = newStatus === 'suspended' ? 'تعطيل' : 'إعادة تفعيل';

    if (!confirm(`هل أنت تأكد من رغبتك في ${actionName} صيدلية ${pharmacy.name}؟`)) return;

    try {
      const res = await adminFetch('/api/admin/manage-pharmacy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pharmacy.id, status: newStatus }),
      });

      if (!res.ok) throw new Error('فشلت العملية');
      await fetchPharmacies();
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء تعديل الحالة');
    }
  };

  // تسجيل استلام الدفعة الثانية لصيدلية تدفع على قسطين
  const handleRecordSecondPayment = async () => {
    if (!selectedPharmacyForSecondPayment) return;
    setSubmitting(true);
    setErrorMsg('');

    try {
      const currentPaid = Number(selectedPharmacyForSecondPayment.paid_amount || 0);
      const totalDue = Number(selectedPharmacyForSecondPayment.total_amount_due || 0);
      const remaining = totalDue - currentPaid;
      const amountEntered = Number(secondPaymentAmount || 0);

      if (amountEntered <= 0) {
        setErrorMsg('المبلغ يجب أن يكون أكبر من صفر');
        setSubmitting(false);
        return;
      }
      if (amountEntered > remaining) {
        setErrorMsg(`المبلغ لا يمكن أن يتجاوز المتبقي الفعلي (${remaining.toFixed(2)} JOD)`);
        setSubmitting(false);
        return;
      }

      const newPaidAmount = currentPaid + amountEntered;

      // إن اكتمل السداد الكامل بهذه الدفعة، لا داعي لبقاء موعد دفعة ثانية معلّقة
      const isFullyPaidNow = newPaidAmount >= totalDue;

      const res = await adminFetch('/api/admin/manage-pharmacy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedPharmacyForSecondPayment.id,
          paid_amount: newPaidAmount,
          second_payment_date: isFullyPaidNow ? null : selectedPharmacyForSecondPayment.second_payment_date,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'فشل تسجيل الدفعة');

      await fetchPharmacies();
      setIsSecondPaymentModalOpen(false);
      setSelectedPharmacyForSecondPayment(null);
      alert('تم تسجيل الدفعة بنجاح! 💰');
    } catch (err: any) {
      setErrorMsg(err.message || 'حدث خطأ أثناء تسجيل الدفعة');
    } finally {
      setSubmitting(false);
    }
  };

  // حذف صيدلية نهائياً
  const handleDeletePharmacy = async (id: string, name: string) => {
    if (!confirm(`هل تريد أرشفة صيدلية "${name}"؟ سيتم حظر تسجيل دخولها فوراً، مع الاحتفاظ الكامل بسجلها المالي. يمكن الوصول إليها لاحقاً من فلتر "مؤرشف فقط"، ولا يحذفها هذا الإجراء نهائياً من قاعدة البيانات.`)) return;

    try {
      const res = await adminFetch(`/api/admin/manage-pharmacy?id=${id}`, {
        method: 'DELETE',
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'فشلت عملية الأرشفة');

      await fetchPharmacies();
      alert('تم أرشفة الصيدلية وحظر تسجيل دخولها بنجاح! 📦');
    } catch (err: any) {
      alert(err.message || 'فشلت عملية الأرشفة');
    }
  };

  // حفظ مسؤول جديد
  const handleSaveAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole !== 'super_admin') {
      alert('عذراً، هذه الصلاحية محصورة للسوبر أدمن فقط');
      return;
    }

    setAdminActionLoading(true);
    setErrorMsg('');

    try {
      if (editingAdminId) {
        const res = await adminFetch('/api/admin/create-platform-admin', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingAdminId, role: adminFormData.role, name: adminFormData.name })
        });

        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'فشلت عملية تحديث المسؤول');
      } else {
        const res = await adminFetch('/api/admin/create-platform-admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(adminFormData)
        });

        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'فشلت عملية إضافة المسؤول');
      }

      await fetchAdmins();
      setIsAdminModalOpen(false);
      setAdminFormData({ name: '', email: '', password: '', role: 'super_admin' });
      setEditingAdminId(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'حدث خطأ أثناء حفظ بيانات المسؤول');
    } finally {
      setAdminActionLoading(false);
    }
  };

  // تغيير كلمة المرور
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setErrorMsg('كلمة المرور يجب أن لا تقل عن 6 خانات');
      return;
    }

    setAdminActionLoading(true);
    setErrorMsg('');

    const targetUserId = passwordResetTarget?.user_id || currentUserId;

    try {
      const res = await adminFetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: targetUserId,
          newPassword: newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'فشلت عملية تغيير كلمة المرور');
      }

      alert('تم تحديث كلمة المرور بنجاح! 🔑');
      setIsPasswordModalOpen(false);
      setNewPassword('');
      setPasswordResetTarget(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'فشلت عملية تغيير كلمة المرور');
    } finally {
      setAdminActionLoading(false);
    }
  };

  // حذف مسؤول
  const handleDeleteAdmin = async (id: string) => {
    if (userRole !== 'super_admin') {
      alert('عذراً، لا تملك صلاحية حذف المسؤولين');
      return;
    }

    if (!confirm('هل أنت تأكد من رغبتك في إزالة صلاحية الأدمن عن هذا المستخدم؟')) return;

    try {
      const res = await adminFetch(`/api/admin/create-platform-admin?id=${id}`, {
        method: 'DELETE',
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'فشلت عملية الحذف');

      await fetchAdmins();
    } catch (err: any) {
      alert(err.message || 'فشلت عملية الحذف');
    }
  };

  // حساب الأيام المتبقية
  const getDaysLeft = (expiryDateStr: string) => {
    if (!expiryDateStr) return 999;
    const expiry = new Date(expiryDateStr);
    const today = new Date();
    const diffTime = expiry.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // تصفية الصيدليات العامة والبحث بالإيميل
  const filteredPharmacies = pharmacies.filter((p) => {
    const query = searchTerm.toLowerCase();
    const matchesSearch = 
      p.name.toLowerCase().includes(query) ||
      p.pharmacist_name.toLowerCase().includes(query) ||
      p.phone_number.includes(query) ||
      (p.email && p.email.toLowerCase().includes(query));

    // "الكل" هنا يعني كل الحالات التشغيلية (لا يشمل المؤرشف)، والمؤرشف له فلتر خاص أدناه
    const matchesStatus = statusFilter === 'all'
      ? p.status !== 'archived'
      : p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // تصفية صيدليات متابعة التجديد (نستبعد المؤرشفة، فلا معنى لتذكيرها بالتجديد)
  const expiringPharmacies = pharmacies.filter((p) => {
    const daysLeft = getDaysLeft(p.expiry_date);
    return daysLeft <= 10 && p.status !== 'archived';
  });

  // الحسابات المالية (نستبعد المؤرشفة من العدد والمستحقات الحالية؛ إجمالي المحصل يبقى شاملاً لأنه سجل تاريخي)
  const totalPharmacies = pharmacies.filter((p) => p.status !== 'archived').length;
  const totalPaid = pharmacies.reduce((acc, p) => acc + Number(p.paid_amount || 0), 0);
  const totalDue = pharmacies
    .filter((p) => p.status !== 'trial' && p.status !== 'archived')
    .reduce((acc, p) => acc + (Number(p.total_amount_due || 50) - Number(p.paid_amount || 0)), 0);

  // هل المسؤول يعدّل سجله الشخصي؟ نستخدمها لتعطيل تغيير الدور فقط (وليس الاسم) حماية من قفل النفس
  const isEditingSelf = editingAdminId
    ? admins.find((a) => a.id === editingAdminId)?.user_id === currentUserId
    : false;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] font-sans" dir="rtl">
        <p className="text-sm font-semibold text-slate-500 animate-pulse">جاري التحقق من صلاحيات المسؤول...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans antialiased text-slate-800" dir="rtl">
      {/* Header */}
      <header className="bg-[#0F172A] text-white border-b border-slate-800 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-[#0F172A] flex items-center justify-center shadow-md border border-slate-700/80">
              <svg className="w-5 h-5 text-white" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 8L14.5 25C14.8 25.6 15.6 25.6 15.9 25L20 17" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
                <path d="M24 6C24 9.3 26.7 12 30 12C26.7 12 24 14.7 24 18C24 14.7 21.3 12 18 12C21.3 12 24 9.3 24 6Z" fill="#2563EB" />
              </svg>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-black tracking-tight text-white">
                  Vitalix<span className="text-[#2563EB]">.ai</span>
                </span>
                <span className={`text-[10px] px-2.5 py-0.5 rounded-md font-bold border ${
                  userRole === 'super_admin' 
                    ? 'bg-[#2563EB]/15 text-[#3B82F6] border-[#2563EB]/30' 
                    : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                }`}>
                  {userRole === 'super_admin' ? 'Super Admin' : 'دعم فني'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">لوحة إدارة المنصة والاشتراكات المركزية</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5 px-3 py-1.5 bg-slate-800/80 rounded-xl border border-slate-700/80 text-right">
              <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 font-bold flex items-center justify-center text-xs border border-blue-500/30">
                {currentUserName ? currentUserName.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-bold text-white leading-tight">{currentUserName}</p>
                <p className="text-[10px] text-slate-400 font-mono dir-ltr">{currentUserEmail}</p>
              </div>
            </div>

            <button 
              onClick={() => {
                setErrorMsg('');
                setPasswordResetTarget(null);
                setIsPasswordModalOpen(true);
              }}
              className="text-xs font-semibold text-slate-300 bg-slate-800/80 hover:bg-slate-700 px-3.5 py-2.5 rounded-xl transition border border-slate-700/80 cursor-pointer"
            >
              🔑 تغيير كلمة المرور
            </button>

            <button 
              onClick={() => supabase.auth.signOut().then(() => router.push('/'))}
              className="text-xs font-semibold text-slate-300 bg-slate-800/80 hover:bg-rose-500/10 hover:text-rose-400 px-4 py-2.5 rounded-xl transition border border-slate-700/80 cursor-pointer"
            >
              تسجيل الخروج
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] transition hover:shadow-md">
            <p className="text-xs font-semibold text-slate-500">إجمالي الصيدليات</p>
            <p className="text-2xl font-bold text-[#0F172A] mt-1.5 tracking-tight">{totalPharmacies}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] transition hover:shadow-md">
            <p className="text-xs font-semibold text-slate-500">إجمالي المحصل (د.أ)</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1.5 tracking-tight">{totalPaid.toFixed(2)} <span className="text-xs text-slate-400 font-normal">JOD</span></p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500">المبالغ المتبقية للتحصيل</p>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">الفعالة فقط</span>
            </div>
            <p className="text-2xl font-bold text-amber-600 mt-1.5 tracking-tight">{totalDue.toFixed(2)} <span className="text-xs text-slate-400 font-normal">JOD</span></p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-200/80 gap-6 text-sm font-semibold overflow-x-auto">
          <button
            onClick={() => setActiveTab('pharmacies')}
            className={`pb-3 border-b-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'pharmacies'
                ? 'border-[#2563EB] text-[#2563EB]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            🏥 السجل العام للصيدليات
          </button>

          <button
            onClick={() => setActiveTab('expiring')}
            className={`pb-3 border-b-2 transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'expiring'
                ? 'border-amber-600 text-amber-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>⏳ متابعة التجديد والانتهاء</span>
            {expiringPharmacies.length > 0 && (
              <span className="bg-amber-100 text-amber-800 text-[11px] px-2 py-0.5 rounded-full font-bold">
                {expiringPharmacies.length}
              </span>
            )}
          </button>

          {userRole === 'super_admin' && (
            <button
              onClick={() => setActiveTab('admins')}
              className={`pb-3 border-b-2 transition cursor-pointer whitespace-nowrap ${
                activeTab === 'admins'
                  ? 'border-[#2563EB] text-[#2563EB]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              👥 إدارة مسؤولين النظام ({admins.length})
            </button>
          )}
          <button
            onClick={() => setActiveTab('feedback')}
            className={`pb-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'feedback'
                ? 'border-violet-600 text-violet-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            💡 اقتراحات المستخدمين
            {feedbackList.filter(f => !f.is_read && !f.is_archived).length > 0 && (
              <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold animate-pulse">
                {feedbackList.filter(f => !f.is_read && !f.is_archived).length}
              </span>
            )}
          </button>
        </div>

        {/* Tab 1: السجل العام للصيدليات */}
        {activeTab === 'pharmacies' && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-[#0F172A]">إدارة الصيدليات والاشتراكات</h3>
                <p className="text-xs text-slate-500 mt-0.5">قائمة كافة الصيدليات والبيانات المالية وأدوات الإدارة</p>
              </div>
              <button 
                onClick={() => {
                  setErrorMsg('');
                  setIsModalOpen(true);
                }}
                className="px-4 py-2.5 text-xs font-semibold text-white bg-[#2563EB] hover:bg-blue-700 rounded-xl transition cursor-pointer shadow-md shadow-blue-500/10 active:scale-95"
              >
                + إضافة صيدلية جديدة
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <input 
                type="text" 
                placeholder="🔍 بحث باسم الصيدلية، الصيدلي، الهاتف، أو الإيميل..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-80 px-3.5 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0F172A] transition"
              />
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full sm:w-44 px-3.5 py-2 text-xs border border-slate-200 rounded-xl font-medium bg-slate-50/50 focus:outline-none focus:border-[#0F172A] transition"
              >
                <option value="all">جميع الحالات (عدا المؤرشف)</option>
                <option value="trial">تجريبي فقط</option>
                <option value="active">نشط فقط</option>
                <option value="suspended">موقوف فقط</option>
                <option value="archived">مؤرشف فقط</option>
              </select>
            </div>

            <div className="overflow-x-auto border border-slate-200/70 rounded-xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 border-b border-slate-200/80 text-slate-600">
                  <tr>
                    <th className="px-5 py-3.5 font-semibold">اسم الصيدلية</th>
                    <th className="px-5 py-3.5 font-semibold">الصيدلي المسؤول</th>
                    <th className="px-5 py-3.5 font-semibold">رقم الهاتف والاتصال</th>
                    <th className="px-5 py-3.5 font-semibold">العنوان</th>
                    <th className="px-5 py-3.5 font-semibold">الحالة</th>
                    <th className="px-5 py-3.5 font-semibold">المدفوع / الإجمالي (متابعة الدفعة الثانية)</th>
                    <th className="px-5 py-3.5 font-semibold">تاريخ الانتهاء</th>
                    <th className="px-5 py-3.5 font-semibold text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredPharmacies.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-slate-400 font-normal">
                        لا يوجد نتائج مطابقة للبحث.
                      </td>
                    </tr>
                  ) : (
                    filteredPharmacies.map((p) => {
                      const isFounder = p.total_amount_due === 35;
                      const hasRemaining = p.paid_amount < p.total_amount_due && p.status !== 'trial';

                      return (
                        <tr key={p.id} className="hover:bg-slate-50/80 transition">
                          <td className="px-5 py-3.5 font-semibold text-[#0F172A]">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => router.push(`/admin/pharmacies/${p.id}`)}
                                className="hover:text-blue-600 hover:underline transition cursor-pointer text-right"
                                title="فتح كرت الصيدلية الكامل"
                              >
                                {p.name}
                              </button>
                              {isFounder && (
                                <span className="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded-full font-bold border border-amber-300">
                                  ⭐ مؤسس مدى الحياة
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-slate-700 font-medium">{p.pharmacist_name}</td>
                          
                          {/* عرض رقم الهاتف والبريد الإلكتروني المباشر من الـ View */}
                          <td className="px-5 py-3.5">
                            <div className="flex flex-col gap-1">
                              <a 
                                href={`tel:${p.phone_number}`} 
                                className="inline-flex items-center gap-1 font-mono text-blue-600 hover:underline font-bold dir-ltr"
                                title="اضغط للاتصال الهاتفي المباشر"
                              >
                                📞 {p.phone_number}
                              </a>
                              <div className="flex items-center gap-1 text-[11px] text-slate-500 font-sans">
                                <span>✉️</span>
                                <span className="truncate max-w-[170px] font-medium" title={p.email || 'غير مسجل'}>
                                  {p.email || 'غير مسجل'}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="px-5 py-3.5 text-slate-500 font-normal">
                            {p.city_address} - {p.country}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                              p.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' :
                              p.status === 'trial' ? 'bg-amber-50 text-amber-700 border border-amber-200/60' :
                              p.status === 'archived' ? 'bg-slate-100 text-slate-500 border border-slate-300/60' :
                              'bg-rose-50 text-rose-700 border border-rose-200/60'
                            }`}>
                              {p.status === 'active' ? 'نشط' : p.status === 'trial' ? 'تجريبي' : p.status === 'archived' ? '🗄️ مؤرشف' : 'موقوف'}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 font-semibold text-slate-800">
                            <div>
                              <span>{p.paid_amount} / {p.total_amount_due} JOD</span>
                              {hasRemaining && (
                                <div className="text-[10px] text-amber-600 font-bold mt-0.5">
                                  متبقي: {(p.total_amount_due - p.paid_amount).toFixed(2)} JOD
                                  {p.second_payment_date && (
                                    <span className="block text-slate-500 font-mono">
                                      استحقاق الدفعة 2: {p.second_payment_date}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-slate-500 font-normal">
                            {p.expiry_date}
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* زر التعديل */}
                              <button
                                onClick={() => {
                                  setErrorMsg('');
                                  setSelectedPharmacyForEdit(p);
                                  setEditPharmacyData({
                                    id: p.id,
                                    name: p.name,
                                    pharmacist_name: p.pharmacist_name,
                                    phone_number: p.phone_number,
                                    city_address: p.city_address,
                                    status: p.status,
                                    paid_amount: p.paid_amount,
                                    expiry_date: p.expiry_date,
                                    second_payment_date: p.second_payment_date || ''
                                  });
                                  setIsEditPharmacyModalOpen(true);
                                }}
                                className="px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-[11px] font-semibold transition cursor-pointer"
                                title="تعديل بيانات الصيدلية والتاريخ والمدفوعات"
                              >
                                ✏️ تعديل
                              </button>

                              {/* أزرار كلمة المرور والتعطيل/التفعيل تظهر فقط للصيدليات غير المؤرشفة —
                                  الصيدلية المؤرشفة حسابها في Auth محذوف أصلاً، ولا معنى لتغيير حالتها
                                  بعيداً عن الأرشفة عبر هذين الزرين */}
                              {p.status !== 'archived' && (
                                <>
                                  {/* زر تسجيل الدفعة الثانية — يظهر فقط عند وجود موعد دفعة معلّق ومبلغ متبقٍ فعلياً */}
                                  {p.second_payment_date && Number(p.paid_amount) < Number(p.total_amount_due) && (
                                    <button
                                      onClick={() => {
                                        setErrorMsg('');
                                        setSelectedPharmacyForSecondPayment(p);
                                        setSecondPaymentAmount(Number(p.total_amount_due) - Number(p.paid_amount));
                                        setIsSecondPaymentModalOpen(true);
                                      }}
                                      className="px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-[11px] font-semibold transition cursor-pointer"
                                      title="تسجيل استلام الدفعة الثانية المعلّقة"
                                    >
                                      💰 تسجيل الدفعة
                                    </button>
                                  )}

                                  {/* زر إعادة تعيين كلمة مرور الصيدلية (لحل مشكلة نسيان كلمة المرور) */}
                                  <button
                                    onClick={() => {
                                      setErrorMsg('');
                                      setNewPassword('');
                                      setPasswordResetTarget({ user_id: p.id, label: `صيدلية ${p.name}` });
                                      setIsPasswordModalOpen(true);
                                    }}
                                    className="px-2.5 py-1 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg text-[11px] font-semibold transition cursor-pointer"
                                    title="إعادة تعيين كلمة مرور دخول الصيدلية"
                                  >
                                    🔑 كلمة المرور
                                  </button>

                                  {/* زر التعطيل / التفعيل */}
                                  <button
                                    onClick={() => handleTogglePharmacyStatus(p)}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                                      p.status === 'suspended' 
                                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' 
                                        : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                                    }`}
                                    title={p.status === 'suspended' ? 'إعادة تفعيل' : 'تعطيل المؤقت'}
                                  >
                                    {p.status === 'suspended' ? '🔓 تفعيل' : '🔒 تعطيل'}
                                  </button>
                                </>
                              )}

                              {/* زر الأرشفة (للسوبر أدمن فقط) — يظهر فقط للحسابات الموقوفة (suspended).
                                  لا معنى لأرشفة حساب نشط أو تجريبي لا يزال يعمل فعلياً — يجب تعطيله أولاً */}
                              {userRole === 'super_admin' && p.status === 'suspended' && (
                                <button
                                  onClick={() => handleDeletePharmacy(p.id, p.name)}
                                  className="px-2.5 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg text-[11px] font-semibold transition cursor-pointer"
                                  title="أرشفة الصيدلية وحظر تسجيل دخولها (بدون حذف نهائي من القاعدة)"
                                >
                                  📦 أرشفة
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: متابعة التجديد والانتهاء */}
        {activeTab === 'expiring' && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] space-y-5">
            <div>
              <h3 className="text-lg font-bold text-[#0F172A]">⏳ متابعة الاشتراكات والتجديد الدوري</h3>
              <p className="text-xs text-slate-500 mt-0.5">شاشة فرز الاشتراكات التجريبية والمدفوعة مع معرفة نوع الاشتراك بدقة وتوفير التجديد الفوري</p>
            </div>

            <div className="overflow-x-auto border border-slate-200/70 rounded-xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-amber-50/50 border-b border-amber-200/60 text-slate-700">
                  <tr>
                    <th className="px-5 py-3.5 font-semibold">اسم الصيدلية</th>
                    <th className="px-5 py-3.5 font-semibold">الصيدلي المسؤول</th>
                    <th className="px-5 py-3.5 font-semibold">نوع الاشتراك المحدد</th>
                    <th className="px-5 py-3.5 font-semibold">المدة المتبقية</th>
                    <th className="px-5 py-3.5 font-semibold">تاريخ الانتهاء</th>
                    <th className="px-5 py-3.5 font-semibold text-center">أدوات الإجراء السريع (تجديد / واتساب / مكالمة)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {expiringPharmacies.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-slate-400 font-normal">
                        🎉 ممتاز! لا يوجد أي صيدلية قريبة من انتهاء الاشتراك حالياً.
                      </td>
                    </tr>
                  ) : (
                    expiringPharmacies.map((p) => {
                      const daysLeft = getDaysLeft(p.expiry_date);
                      const isTrial = p.status === 'trial';
                      
                      let subTypeText = 'اشتراك سنوي (50 JOD)';
                      if (p.total_amount_due === 40) subTypeText = 'اشتراك سنوي مخفض (40 JOD)';
                      else if (p.total_amount_due === 35) subTypeText = 'اشتراك مؤسس ثابت مدى الحياة (35 JOD)';
                      else if (p.total_amount_due === 25) subTypeText = 'اشتراك 6 أشهر (25 JOD)';
                      if (isTrial) subTypeText = 'فترة تجريبية مرنة';
                      
                      const trialMsg = `مرحباً د. ${p.pharmacist_name}، معك فريق منصة Vitalix.ai. نتمنى أن تجربة النظام نالت إعجابكم! أود التذكير بوجود ${daysLeft < 0 ? 'انتهت' : `متبقي ${pluralizeDays(daysLeft)} على`} الفترة التجريبية لصيدلية ${p.name}. نرحب بأسئلتكم ولترقية اشتراككم الآن.`;
                      const paidMsg = `مرحباً د. ${p.pharmacist_name}، معك إدارة منصة Vitalix.ai. نود تذكيركم بقرب موعد تجديد اشتراك صيدلية ${p.name} (${subTypeText}) بتاريخ ${p.expiry_date}. نسعد بخدمتكم وتجديد اشتراككم بنفس المزايا.`;

                      return (
                        <tr key={p.id} className="hover:bg-amber-50/30 transition">
                          <td className="px-5 py-3.5 font-bold text-[#0F172A]">{p.name}</td>
                          <td className="px-5 py-3.5 text-slate-700 font-medium">{p.pharmacist_name}</td>
                          <td className="px-5 py-3.5">
                            <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                              isTrial ? 'bg-amber-100 text-amber-800' : p.total_amount_due === 35 ? 'bg-amber-50 text-amber-800 border border-amber-300' : p.total_amount_due === 25 ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                            }`}>
                              {subTypeText}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 font-bold">
                            <span className={daysLeft <= 3 ? 'text-rose-600 animate-pulse' : 'text-amber-700'}>
                              {daysLeft < 0 ? 'منتهي كلياً' : `${pluralizeDays(daysLeft)} متبقية`}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-slate-500">
                            {p.expiry_date}
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {/* زر التجديد السريع الذكي */}
                              <button
                                onClick={() => {
                                  setErrorMsg('');
                                  setSelectedPharmacyForRenew(p);
                                  const planVal = p.total_amount_due === 35 ? '35' : p.total_amount_due === 40 ? '40' : p.total_amount_due === 25 ? '25' : '50';
                                  setRenewPlan(planVal);
                                  setIsQuickInstallment(false);
                                  setQuickPaidAmount(Number(p.total_amount_due || 50) / 2);
                                  setQuickSecondDate(getDefaultSecondPaymentDate());
                                  setIsQuickRenewModalOpen(true);
                                }}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-semibold transition shadow-sm active:scale-95 cursor-pointer"
                                title="تجديد الاشتراك وترحيل الأيام المتبقية تلقائياً"
                              >
                                ⚡ تجديد سريع
                              </button>

                              <a
                                href={`tel:${p.phone_number}`}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-[11px] font-semibold transition shadow-sm active:scale-95"
                                title="إجراء مكالمة هاتفية فورية"
                              >
                                📞 اتصل
                              </a>

                              <a
                                href={`https://wa.me/${formatWhatsAppNumber(p.phone_number)}?text=${encodeURIComponent(isTrial ? trialMsg : paidMsg)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-[11px] font-semibold transition shadow-sm active:scale-95"
                              >
                                💬 واتساب
                              </a>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: إدارة مسؤولين النظام */}
        {activeTab === 'admins' && userRole === 'super_admin' && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold text-[#0F172A]">إدارة مسؤولين النظام (Platform Admins)</h3>
                <p className="text-xs text-slate-500 mt-0.5">إضافة مسؤولين وتعيين الأسماء والأدوار للتحكم في المنصة</p>
              </div>
              <button
                onClick={() => {
                  setErrorMsg('');
                  setEditingAdminId(null);
                  setAdminFormData({ name: '', email: '', password: '', role: 'super_admin' });
                  setIsAdminModalOpen(true);
                }}
                className="px-4 py-2.5 text-xs font-semibold text-white bg-[#0F172A] hover:bg-slate-800 rounded-xl transition cursor-pointer shadow-md active:scale-95"
              >
                + إضافة مسؤول جديد
              </button>
            </div>

            <div className="overflow-x-auto border border-slate-200/70 rounded-xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 border-b border-slate-200/80 text-slate-600">
                  <tr>
                    <th className="px-5 py-3.5 font-semibold">اسم المسؤول</th>
                    <th className="px-5 py-3.5 font-semibold">البريد الإلكتروني</th>
                    <th className="px-5 py-3.5 font-semibold">الدور (Role)</th>
                    <th className="px-5 py-3.5 font-semibold">تاريخ الإضافة</th>
                    <th className="px-5 py-3.5 font-semibold text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {admins.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-slate-400 font-normal">
                        لا يوجد مسؤولين مضافين حالياً.
                      </td>
                    </tr>
                  ) : (
                    admins.map((adm) => (
                      <tr key={adm.id} className="hover:bg-slate-50/80 transition">
                        <td className="px-5 py-3.5 font-bold text-[#0F172A]">
                          {adm.name || 'مسؤول بدون اسم'}
                        </td>
                        <td className="px-5 py-3.5 text-blue-600 font-medium">
                          {adm.email || 'غير مسجل'}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                            adm.role === 'super_admin' ? 'bg-blue-50 text-blue-700 border border-blue-200/60' : 'bg-amber-50 text-amber-700 border border-amber-200/60'
                          }`}>
                            {adm.role === 'super_admin' ? 'سوبر أدمن' : 'دعم فني (support_admin)'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-slate-500">
                          {new Date(adm.created_at).toLocaleDateString('ar-EG')}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button 
                              onClick={() => {
                                setErrorMsg('');
                                setPasswordResetTarget({ user_id: adm.user_id, label: adm.name || adm.email || 'مسؤول النظام' });
                                setIsPasswordModalOpen(true);
                              }}
                              className="px-2.5 py-1 text-[11px] font-semibold text-amber-600 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                              title="تغيير كلمة المرور لهذا الأدمن"
                            >
                              🔑 كلمة المرور
                            </button>
                            <button 
                              onClick={() => {
                                setErrorMsg('');
                                setEditingAdminId(adm.id);
                                setAdminFormData({
                                  name: adm.name || '',
                                  email: adm.email || '',
                                  password: '',
                                  role: adm.role
                                });
                                setIsAdminModalOpen(true);
                              }}
                              className="px-2.5 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                              title={adm.user_id === currentUserId ? 'يمكنك تعديل اسمك فقط، لا صلاحيتك' : undefined}
                            >
                              {adm.user_id === currentUserId ? 'تعديل الاسم' : 'تعديل'}
                            </button>
                            {adm.user_id === currentUserId ? (
                              // حماية من قفل النفس خارج النظام: لا يمكنك حذف صلاحيتك الخاصة بنفسك
                              <span className="text-[11px] text-slate-400 font-medium px-2" title="لا يمكنك حذف صلاحيتك الخاصة — اطلب من مسؤول آخر">
                                🔒 غير قابل للحذف
                              </span>
                            ) : (
                              <button 
                                onClick={() => handleDeleteAdmin(adm.id)}
                                className="px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                              >
                                حذف
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      <AppFooter className="max-w-7xl mx-auto px-6 py-8 border-t border-slate-200/60 mt-4" />

      {/* Modal التجديد السريع الذكي */}
      {isQuickRenewModalOpen && selectedPharmacyForRenew && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-2xl p-6 space-y-5 shadow-xl border border-slate-100">
            <div className="flex items-center justify-between border-b pb-3.5">
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">⚡ تجديد سريع لصيدلية: {selectedPharmacyForRenew.name}</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">سيقوم النظام بترحيل الأيام المتبقية وإضافة الفترة الجديدة تلقائياً</p>
              </div>
              <button onClick={() => setIsQuickRenewModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm font-medium">✕</button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium">
                {errorMsg}
              </div>
            )}

            <div className="space-y-4">
              <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-100 text-xs text-blue-900 space-y-1">
                <p><strong>تاريخ الانتهاء الحالي:</strong> {selectedPharmacyForRenew.expiry_date}</p>
                <p><strong>المالك:</strong> د. {selectedPharmacyForRenew.pharmacist_name}</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">اختر خطة التجديد المدفوعة:</label>
                <select 
                  value={renewPlan} 
                  onChange={(e) => {
                    const newPlan = e.target.value as '50' | '40' | '35' | '25';
                    setRenewPlan(newPlan);
                    let t = 50;
                    if (newPlan === '40') t = 40;
                    else if (newPlan === '35') t = 35;
                    else if (newPlan === '25') t = 25;
                    setQuickPaidAmount(t / 2);
                  }} 
                  className="w-full px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl font-medium bg-slate-50/50 focus:outline-none focus:border-[#0F172A]"
                >
                  <option value="50">اشتراك سنوي كامل (50 دينار - 12 شهراً)</option>
                  <option value="40">اشتراك سنوي مخفض (40 دينار - 12 شهراً)</option>
                  <option value="35">⭐ عرض أول 100 صيدلية - مؤسس ثابت مدى الحياة (35 دينار)</option>
                  <option value="25">اشتراك نصف سنوي (25 دينار - 6 أشهر)</option>
                </select>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center gap-2.5">
                  <input 
                    type="checkbox" 
                    id="quickInstallment"
                    checked={isQuickInstallment}
                    onChange={(e) => setIsQuickInstallment(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <label htmlFor="quickInstallment" className="text-xs font-semibold text-slate-700 cursor-pointer">
                    تسهيل الدفع على دفعتين (تحديد المبلغ المدفوع يدوياً)
                  </label>
                </div>

                {isQuickInstallment && (
                  <div className="space-y-3 pt-1 border-t border-slate-200/60">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">💵 المبلغ المدفوع الآن (JOD) (افتراضياً نصف القيمة):</label>
                      <input 
                        type="number" 
                        value={quickPaidAmount} 
                        onChange={(e) => setQuickPaidAmount(Number(e.target.value))}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-bold text-emerald-700 focus:outline-none focus:border-blue-600"
                        placeholder="أدخل المبلغ المدفوع يدوياً"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        المبلغ المتبقي للتحصيل: <span className="font-bold text-amber-600">
                          {Math.max(0, (renewPlan === '35' ? 35 : renewPlan === '40' ? 40 : renewPlan === '25' ? 25 : 50) - (Number(quickPaidAmount) || 0))} JOD
                        </span>
                      </p>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">📅 تاريخ استحقاق الدفعة الثانية:</label>
                      <input 
                        type="date" 
                        value={quickSecondDate} 
                        onChange={(e) => setQuickSecondDate(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-medium focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2.5 pt-3 border-t border-slate-100">
                <button 
                  type="button" 
                  disabled={submitting} 
                  onClick={handleQuickRenewSubmit}
                  className="flex-1 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition rounded-xl shadow-md active:scale-95 cursor-pointer"
                >
                  {submitting ? 'جاري التحديث...' : 'تأكيد التجديد وترحيل الأيام 🚀'}
                </button>
                <button type="button" onClick={() => setIsQuickRenewModalOpen(false)} className="px-4 py-2.5 text-xs font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition cursor-pointer">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal تسجيل الدفعة الثانية */}
      {isSecondPaymentModalOpen && selectedPharmacyForSecondPayment && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-2xl p-6 space-y-4 shadow-xl border border-slate-100">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">تسجيل الدفعة الثانية</h3>
                <p className="text-[11px] text-emerald-600 font-medium">صيدلية: {selectedPharmacyForSecondPayment.name}</p>
              </div>
              <button onClick={() => setIsSecondPaymentModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm font-medium">✕</button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium">
                {errorMsg}
              </div>
            )}

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <p>الإجمالي: <strong>{selectedPharmacyForSecondPayment.total_amount_due} JOD</strong></p>
              <p>المدفوع سابقاً: <strong>{selectedPharmacyForSecondPayment.paid_amount} JOD</strong></p>
              <p className="text-amber-700">المتبقي المتوقع: <strong>{(Number(selectedPharmacyForSecondPayment.total_amount_due) - Number(selectedPharmacyForSecondPayment.paid_amount)).toFixed(2)} JOD</strong></p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0F172A] mb-1">💵 المبلغ المُستلَم الآن (JOD)</label>
              <input
                type="number"
                value={secondPaymentAmount}
                onChange={(e) => setSecondPaymentAmount(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-bold text-emerald-700 focus:outline-none focus:border-blue-600"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                معبَّأ افتراضياً بكامل المبلغ المتبقي — يمكنك تعديله إن استُلم مبلغ مختلف (مثلاً دفعة جزئية إضافية).
              </p>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                disabled={submitting || secondPaymentAmount <= 0}
                onClick={handleRecordSecondPayment}
                className="flex-1 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition rounded-xl shadow-md active:scale-95 cursor-pointer"
              >
                {submitting ? 'جاري التسجيل...' : 'تأكيد استلام الدفعة'}
              </button>
              <button type="button" onClick={() => setIsSecondPaymentModalOpen(false)} className="px-4 py-2.5 text-xs font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition cursor-pointer">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal إضافة صيدلية جديدة */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-lg w-full rounded-2xl p-6 space-y-5 shadow-xl border border-slate-100">
            <div className="flex items-center justify-between border-b pb-3.5">
              <h3 className="text-base font-bold text-[#0F172A]">إضافة صيدلية جديدة</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm font-medium">✕</button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleCreatePharmacy} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">اسم الصيدلية</label>
                  <input required type="text" value={formData.pharmacy_name} onChange={(e) => setFormData({...formData, pharmacy_name: e.target.value})} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0F172A] transition" placeholder="صيدلية الربيع" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">اسم الصيدلي</label>
                  <input required type="text" value={formData.pharmacist_name} onChange={(e) => setFormData({...formData, pharmacist_name: e.target.value})} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0F172A] transition" placeholder="د. أحمد" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">البريد الإلكتروني للدخول</label>
                  <input required type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0F172A] transition" placeholder="pharmacy@vitalix.ai" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">كلمة المرور الأولية</label>
                  <input required type="password" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0F172A] transition" placeholder="••••••••" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">رقم الهاتف (للاتصال والواتساب)</label>
                  <input required type="text" value={formData.phone_number} onChange={(e) => setFormData({...formData, phone_number: e.target.value})} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0F172A] transition" placeholder="0790000000" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">المدينة والعنوان</label>
                  <input required type="text" value={formData.city_address} onChange={(e) => setFormData({...formData, city_address: e.target.value})} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0F172A] transition" placeholder="عمان - ماركا" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">خطة الاشتراك والدفع</label>
                <select 
                  value={formData.payment_plan} 
                  onChange={(e) => handlePlanChangeForAdd(e.target.value)} 
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl font-medium bg-slate-50/50 focus:outline-none focus:border-[#0F172A] transition"
                >
                  <option value="50">اشتراك سنوي كامل (50 دينار - 12 شهراً)</option>
                  <option value="40">اشتراك سنوي مخفض (40 دينار - 12 شهراً)</option>
                  <option value="35">⭐ عرض أول 100 صيدلية - مؤسس ثابت مدى الحياة (35 دينار)</option>
                  <option value="25">اشتراك نصف سنوي (25 دينار - 6 أشهر)</option>
                  <option value="trial_0">فترة تجريبية (0 دينار - تجربة مرنة)</option>
                </select>
              </div>

              {formData.payment_plan !== 'trial_0' && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center gap-2.5">
                    <input 
                      type="checkbox" 
                      id="createInstallment"
                      checked={formData.is_installment}
                      onChange={(e) => setFormData({...formData, is_installment: e.target.checked})}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                    />
                    <label htmlFor="createInstallment" className="text-xs font-semibold text-slate-700 cursor-pointer">
                      تسهيل الدفع على دفعتين (تحديد المبلغ المدفوع يدوياً)
                    </label>
                  </div>

                  {formData.is_installment && (
                    <div className="space-y-3 pt-1 border-t border-slate-200/60">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">💵 المبلغ المدفوع الآن (JOD) (افتراضياً نصف القيمة):</label>
                        <input 
                          type="number" 
                          value={formData.custom_paid_amount} 
                          onChange={(e) => setFormData({...formData, custom_paid_amount: Number(e.target.value)})}
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-bold text-emerald-700 focus:outline-none focus:border-blue-600"
                          placeholder="أدخل المبلغ المدفوع يدوياً"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">
                          المبلغ المتبقي للتحصيل: <span className="font-bold text-amber-600">
                            {Math.max(0, (formData.payment_plan === '35' ? 35 : formData.payment_plan === '40' ? 40 : formData.payment_plan === '25' ? 25 : 50) - (Number(formData.custom_paid_amount) || 0))} JOD
                          </span>
                        </p>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">📅 تاريخ استحقاق الدفعة الثانية:</label>
                        <input 
                          type="date" 
                          value={formData.second_payment_date} 
                          onChange={(e) => setFormData({...formData, second_payment_date: e.target.value})}
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-medium focus:outline-none focus:border-blue-600"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {formData.payment_plan === 'trial_0' && (
                <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl space-y-1.5">
                  <label className="block text-xs font-bold text-amber-900">
                    ⏱️ تحديد مدة الفترة التجريبية المرنة (بالأيام):
                  </label>
                  <select 
                    value={formData.trial_days} 
                    onChange={(e) => setFormData({...formData, trial_days: e.target.value})}
                    className="w-full px-3 py-1.5 text-xs border border-amber-300 rounded-lg bg-white font-semibold text-amber-900 focus:outline-none"
                  >
                    <option value="7">7 أيام (فترة سريعة - أسبوع واحد)</option>
                    <option value="14">14 يوماً (أسبوعان)</option>
                    <option value="30">30 يوماً (شهر كامل - افتراضي)</option>
                    <option value="60">60 يوماً (شهريين - عرض خاص)</option>
                  </select>
                </div>
              )}

              <div className="flex gap-2.5 pt-3 border-t border-slate-100">
                <button type="submit" disabled={submitting} className="flex-1 py-2.5 text-xs font-semibold text-white bg-[#0F172A] hover:bg-slate-800 transition rounded-xl shadow-md active:scale-95 cursor-pointer">
                  {submitting ? 'جاري الإنشاء والربط...' : 'تأكيد وإضافة الصيدلية'}
                </button>
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2.5 text-xs font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200/80 transition cursor-pointer">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal تعديل بيانات صيدلية */}
      {isEditPharmacyModalOpen && selectedPharmacyForEdit && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-lg w-full rounded-2xl p-6 space-y-5 shadow-xl border border-slate-100">
            <div className="flex items-center justify-between border-b pb-3.5">
              <h3 className="text-base font-bold text-[#0F172A]">تعديل بيانات الصيدلية: {selectedPharmacyForEdit.name}</h3>
              <button onClick={() => setIsEditPharmacyModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm font-medium">✕</button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium">
                {errorMsg}
              </div>
            )}

            {selectedPharmacyForEdit.status === 'trial' && (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-semibold">
                ⏳ هذه الصيدلية لا تزال في الفترة التجريبية، ومتبقي لها{' '}
                {pluralizeDays(Math.max(0, getDaysLeft(selectedPharmacyForEdit.expiry_date)))}. عند تحويلها لحالة "نشط"،
                تأكد من إضافة هذه الأيام المتبقية لتاريخ الانتهاء الجديد حتى لا تفقد الصيدلية حقها في الفترة
                التجريبية الكاملة — الطريقة الأضمن لهذا هي استخدام "⚡ تجديد سريع" بدل التعديل اليدوي للتاريخ هنا.
              </div>
            )}

            <form onSubmit={handleUpdatePharmacy} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">اسم الصيدلية</label>
                  <input required type="text" value={editPharmacyData.name} onChange={(e) => setEditPharmacyData({...editPharmacyData, name: e.target.value})} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0F172A]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">اسم الصيدلي</label>
                  <input required type="text" value={editPharmacyData.pharmacist_name} onChange={(e) => setEditPharmacyData({...editPharmacyData, pharmacist_name: e.target.value})} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0F172A]" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">رقم الهاتف</label>
                  <input required type="text" value={editPharmacyData.phone_number} onChange={(e) => setEditPharmacyData({...editPharmacyData, phone_number: e.target.value})} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0F172A]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">العنوان والمدينة</label>
                  <input required type="text" value={editPharmacyData.city_address} onChange={(e) => setEditPharmacyData({...editPharmacyData, city_address: e.target.value})} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0F172A]" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">حالة الاشتراك</label>
                  <select value={editPharmacyData.status} onChange={(e) => setEditPharmacyData({...editPharmacyData, status: e.target.value})} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl font-medium bg-slate-50/50">
                    <option value="trial">تجريبي (trial)</option>
                    <option value="active">نشط (active)</option>
                    <option value="suspended">موقوف (suspended)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">المبلغ المدفوع (JOD)</label>
                  <input type="number" value={editPharmacyData.paid_amount} onChange={(e) => setEditPharmacyData({...editPharmacyData, paid_amount: Number(e.target.value)})} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0F172A]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">تاريخ الانتهاء</label>
                  <input type="date" value={editPharmacyData.expiry_date} onChange={(e) => setEditPharmacyData({...editPharmacyData, expiry_date: e.target.value})} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0F172A]" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">📅 تاريخ استحقاق الدفعة الثانية (إن وجد)</label>
                <input type="date" value={editPharmacyData.second_payment_date} onChange={(e) => setEditPharmacyData({...editPharmacyData, second_payment_date: e.target.value})} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0F172A]" />
              </div>

              <div className="flex gap-2.5 pt-3 border-t border-slate-100">
                <button type="submit" disabled={submitting} className="flex-1 py-2.5 text-xs font-semibold text-white bg-[#0F172A] hover:bg-slate-800 transition rounded-xl shadow-md cursor-pointer">
                  {submitting ? 'جاري التحديث...' : 'حفظ التعديلات'}
                </button>
                <button type="button" onClick={() => setIsEditPharmacyModalOpen(false)} className="px-4 py-2.5 text-xs font-semibold text-slate-600 bg-slate-100 rounded-xl cursor-pointer">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal إدارة المسؤولين */}
      {isAdminModalOpen && userRole === 'super_admin' && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-2xl p-6 space-y-5 shadow-xl border border-slate-100">
            <div className="flex items-center justify-between border-b pb-3.5">
              <h3 className="text-base font-bold text-[#0F172A]">
                {editingAdminId ? 'تعديل بيانات المسؤول' : 'إضافة مسؤول جديد للنظام'}
              </h3>
              <button onClick={() => setIsAdminModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm font-medium">✕</button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSaveAdmin} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">اسم المسؤول</label>
                <input required type="text" value={adminFormData.name} onChange={(e) => setAdminFormData({...adminFormData, name: e.target.value})} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0F172A]" placeholder="أنس قنديل" />
              </div>

              {!editingAdminId && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">البريد الإلكتروني</label>
                    <input required type="email" value={adminFormData.email} onChange={(e) => setAdminFormData({...adminFormData, email: e.target.value})} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0F172A]" placeholder="admin@vitalix.ai" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">كلمة المرور الأولية</label>
                    <input required type="password" value={adminFormData.password} onChange={(e) => setAdminFormData({...adminFormData, password: e.target.value})} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0F172A]" placeholder="••••••••" />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">دور المسؤول (Role)</label>
                <select 
                  value={adminFormData.role} 
                  onChange={(e) => setAdminFormData({...adminFormData, role: e.target.value})} 
                  disabled={isEditingSelf}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl font-medium bg-slate-50/50 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="super_admin">سوبر أدمن (super_admin)</option>
                  <option value="support_admin">أدمن دعم فني (support_admin)</option>
                </select>
                {isEditingSelf && (
                  <p className="text-[10px] text-slate-400 mt-1">لا يمكنك تغيير صلاحيتك الخاصة — اطلب من مسؤول آخر</p>
                )}
              </div>

              <div className="flex gap-2.5 pt-3 border-t border-slate-100">
                <button type="submit" disabled={adminActionLoading} className="flex-1 py-2.5 text-xs font-semibold text-white bg-[#0F172A] hover:bg-slate-800 transition rounded-xl shadow-md cursor-pointer">
                  {adminActionLoading ? 'جاري الحفظ...' : (editingAdminId ? 'حفظ التعديلات' : 'إنشاء وتعيين المسؤول')}
                </button>
                <button type="button" onClick={() => setIsAdminModalOpen(false)} className="px-4 py-2.5 text-xs font-semibold text-slate-600 bg-slate-100 rounded-xl cursor-pointer">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal تغيير كلمة المرور */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-2xl p-6 space-y-4 shadow-xl border border-slate-100">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">تغيير كلمة المرور</h3>
                {passwordResetTarget && (
                  <p className="text-[11px] text-blue-600 font-medium">
                    للحساب: {passwordResetTarget.label}
                  </p>
                )}
              </div>
              <button onClick={() => setIsPasswordModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm font-medium">✕</button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">كلمة المرور الجديدة</label>
                <input required type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0F172A]" placeholder="••••••••" />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button type="submit" disabled={adminActionLoading} className="flex-1 py-2.5 text-xs font-semibold text-white bg-[#0F172A] hover:bg-slate-800 transition rounded-xl shadow-md cursor-pointer">
                  {adminActionLoading ? 'جاري التحديث...' : 'تأكيد التغيير'}
                </button>
                <button type="button" onClick={() => setIsPasswordModalOpen(false)} className="px-4 py-2.5 text-xs font-semibold text-slate-600 bg-slate-100 rounded-xl cursor-pointer">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
        {/* Tab 4: اقتراحات المستخدمين */}
        {activeTab === 'feedback' && (
          <FeedbackInbox
            feedbackList={feedbackList}
            loading={feedbackLoading}
            adminName={currentUserName}
            onUpdate={updated => setFeedbackList(prev => prev.map(f => f.id === updated.id ? updated : f))}
            onDelete={id => setFeedbackList(prev => prev.filter(f => f.id !== id))}
            onMarkAllRead={markAllRead}
            onToggleArchived={() => setFeedbackShowArchived(v => !v)}
            showArchived={feedbackShowArchived}
          />
        )}


    </div>
  );
}