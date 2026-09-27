'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { adminFetch } from '@/lib/admin-fetch';
import Toast, { useNotice } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import PharmacyCard, { type OverviewRow } from '../PharmacyCard';
import SubscriptionModal from '../SubscriptionModal';
import CreatePharmacyModal from '../CreatePharmacyModal';
import PharmacyPasswordModal from '../PharmacyPasswordModal';
import NotificationsBell from '../NotificationsBell';
import { MagnifyingGlass, Plus, SignOut } from '@phosphor-icons/react';

type Totals = {
  pharmacies: number;
  active: number;
  trial: number;
  read_only: number;
  collected: number;
  remaining: number;
  expiring_30d: number;
  idle: number;
  currency: string;
};

type StatusFilter = 'all' | 'trial' | 'active' | 'grace' | 'expired' | 'suspended';

export default function AdminV2Page() {
  const router = useRouter();
  const { notice, setNotice } = useNotice();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [role, setRole] = useState<string>('support');
  const [userName, setUserName] = useState('');

  const [rows, setRows] = useState<OverviewRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  const [subTarget, setSubTarget] = useState<OverviewRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [pwTarget, setPwTarget] = useState<OverviewRow | null>(null);

  const canManage = role === 'owner' || role === 'support';

  const load = async () => {
    setLoading(true);
    const res = await adminFetch('/api/admin/overview');
    if (!res.ok) {
      setNotice({ kind: 'err', text: 'تعذّر جلب البيانات' });
    } else {
      const json = await res.json();
      setRows(json.pharmacies);
      setTotals(json.totals);
    }
    setLoading(false);
  };

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/'); return; }

      const { data: adminRecord, error } = await supabase
        .from('platform_admins')
        .select('role, name')
        .eq('user_id', session.user.id)
        .single();

      if (error || !adminRecord) { router.push('/dashboard'); return; }

      setRole(adminRecord.role);
      setUserName(adminRecord.name || session.user.email || '');
      load();
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(p => {
      if (q) {
        const hay = `${p.name} ${p.pharmacist_name ?? ''} ${p.phone_number ?? ''} ${p.email ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (onlyAlerts) {
        const hasAlert = p.expiring_soon || p.idle_level === 'warning' || p.idle_level === 'critical' || p.uncategorized_count > 0 || p.remaining > 0;
        if (!hasAlert) return false;
      }
      return true;
    });
  }, [rows, search, statusFilter, onlyAlerts]);

  const onOpen = (id: string) => router.push(`/admin/pharmacies/${id}`);
  const onSubscribe = (p: OverviewRow) => setSubTarget(p);
  const onEdit = (p: OverviewRow) => router.push(`/admin/pharmacies/${p.id}`);
  const onPassword = (p: OverviewRow) => setPwTarget(p);

  const onToggleSuspend = async (p: OverviewRow) => {
    const suspending = p.status !== 'suspended';
    const ok = await confirm({
      title: p.status === 'suspended' ? `تفعيل «${p.name}»؟` : `تعطيل «${p.name}»؟`,
      message: p.status === 'suspended' ? 'ستعود الصيدلية للعمل فوراً.' : 'لن يستطيع أحد من الصيدلية الدخول حتى التفعيل. لا تُحذف أي بيانات.',
      confirmText: p.status === 'suspended' ? 'تفعيل' : 'تعطيل',
      destructive: suspending,
    });
    if (!ok) return;

    const res = await adminFetch('/api/admin/manage-pharmacy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, status: p.status === 'suspended' ? 'active' : 'suspended' }),
    });
    setNotice(res.ok
      ? { kind: 'ok', text: p.status === 'suspended' ? 'تم التفعيل' : 'تم التعطيل' }
      : { kind: 'err', text: 'فشلت العملية' });
    load();
  };

  const roleLabel = role === 'owner' ? 'المالك' : role === 'pharmacist' ? 'صيدلاني المنصة' : 'دعم فني';

  return (
    <div dir="rtl" className="bg-slate-50 min-h-screen">
      <header className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
        <div>
          <p className="font-bold">Vitalix-ai</p>
          <p className="text-[11px] text-slate-400">لوحة إدارة المنصة</p>
        </div>
        <div className="flex items-center gap-3">
          <NotificationsBell isOwner={role === 'owner'} onPharmacyClick={(id) => router.push(`/admin/pharmacies/${id}`)} />
          <span className="text-xs">{userName}</span>
          <span className="text-[10px] bg-slate-700 px-2 py-0.5 rounded-full">{roleLabel}</span>
          <button
            onClick={() => supabase.auth.signOut().then(() => router.push('/'))}
            aria-label="تسجيل الخروج"
            className="text-slate-300 hover:text-white cursor-pointer"
          >
            <SignOut size={16} weight="bold" aria-hidden="true" />
          </button>
        </div>
      </header>

      <nav className="bg-white border-b border-slate-200 px-4 flex gap-4 overflow-x-auto text-sm font-semibold">
        <button onClick={() => router.push('/admin/v2')} className="py-3 border-b-2 border-slate-900 text-slate-900 cursor-pointer whitespace-nowrap">
          الصيدليات
        </button>
        {(role === 'owner' || role === 'support') && (
          <button onClick={() => router.push('/admin/plans')} className="py-3 border-b-2 border-transparent text-slate-500 hover:text-slate-900 cursor-pointer whitespace-nowrap">
            الخطط والاشتراكات
          </button>
        )}
        {(role === 'owner' || role === 'pharmacist') && (
          <button onClick={() => router.push('/admin/blocklist')} className="py-3 border-b-2 border-transparent text-slate-500 hover:text-slate-900 cursor-pointer whitespace-nowrap">
            قائمة الحظر
          </button>
        )}
        {(role === 'owner' || role === 'pharmacist') && (
          <button onClick={() => router.push('/admin/rejections')} className="py-3 border-b-2 border-transparent text-slate-500 hover:text-slate-900 cursor-pointer whitespace-nowrap">
            المرفوضات
          </button>
        )}
        {role === 'owner' && (
          <button onClick={() => router.push('/admin/admins')} className="py-3 border-b-2 border-transparent text-slate-500 hover:text-slate-900 cursor-pointer whitespace-nowrap">
            المسؤولون
          </button>
        )}
        <button onClick={() => router.push('/admin/feedback')} className="py-3 border-b-2 border-transparent text-slate-500 hover:text-slate-900 cursor-pointer whitespace-nowrap">
          الاقتراحات
        </button>
      </nav>

      <div className="max-w-6xl mx-auto p-4">
        {totals && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-4">
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <p className="font-bold text-lg text-slate-900">{totals.pharmacies}</p>
              <p className="text-[10px] text-slate-500">الصيدليات</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <p className="font-bold text-lg text-slate-900">{totals.active}</p>
              <p className="text-[10px] text-slate-500">نشطة</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <p className="font-bold text-lg text-slate-900">{totals.trial}</p>
              <p className="text-[10px] text-slate-500">تجريبية</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <p className={`font-bold text-lg ${totals.read_only > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{totals.read_only}</p>
              <p className="text-[10px] text-slate-500">قراءة فقط</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <p className="font-bold text-lg text-emerald-700">{totals.collected} {totals.currency}</p>
              <p className="text-[10px] text-slate-500">محصَّل</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <p className={`font-bold text-lg ${totals.remaining > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{totals.remaining} {totals.currency}</p>
              <p className="text-[10px] text-slate-500">متبقٍ</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <p className={`font-bold text-lg ${totals.expiring_30d > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{totals.expiring_30d}</p>
              <p className="text-[10px] text-slate-500">تنتهي خلال 30 يوماً</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <p className={`font-bold text-lg ${totals.idle > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{totals.idle}</p>
              <p className="text-[10px] text-slate-500">خاملة</p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-[220px]">
            <MagnifyingGlass size={14} weight="bold" aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو الصيدلي أو الهاتف أو البريد…"
              className="w-full h-9 pr-9 pl-3 text-xs border border-slate-200 rounded-xl focus:border-slate-900 focus:ring-1 focus:ring-slate-900 focus:outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            className="h-9 px-3 text-xs border border-slate-200 rounded-xl focus:border-slate-900 focus:outline-none"
          >
            <option value="all">الكل</option>
            <option value="trial">تجريبي</option>
            <option value="active">نشط</option>
            <option value="grace">مهلة</option>
            <option value="expired">قراءة فقط</option>
            <option value="suspended">معطّلة</option>
          </select>
          <button
            onClick={() => setOnlyAlerts(o => !o)}
            className={`h-9 px-3 rounded-xl text-xs font-bold cursor-pointer border ${onlyAlerts ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200'}`}
          >
            التنبيهات فقط
          </button>
          {canManage && (
            <button
              onClick={() => setCreating(true)}
              className="h-9 px-3 rounded-xl text-xs font-bold cursor-pointer bg-teal-600 hover:bg-teal-700 text-white flex items-center gap-1.5"
            >
              <Plus size={14} weight="bold" aria-hidden="true" />
              إضافة صيدلية
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-slate-400 text-center py-12">جارٍ التحميل…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-12">لا صيدليات مطابقة</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map(p => (
              <PharmacyCard
                key={p.id}
                p={p}
                currency={totals?.currency ?? 'JOD'}
                canManage={canManage}
                onOpen={onOpen}
                onSubscribe={onSubscribe}
                onEdit={onEdit}
                onToggleSuspend={onToggleSuspend}
                onPassword={onPassword}
              />
            ))}
          </div>
        )}
      </div>

      {subTarget && (
        <SubscriptionModal
          pharmacy={{ id: subTarget.id, name: subTarget.name, expiry_date: subTarget.sub_ends_on, status: subTarget.status }}
          onClose={() => setSubTarget(null)}
          onSaved={load}
        />
      )}
      {creating && (
        <CreatePharmacyModal onClose={() => setCreating(false)} onSaved={load} />
      )}
      {pwTarget && (
        <PharmacyPasswordModal pharmacy={{ id: pwTarget.id, name: pwTarget.name }} onClose={() => setPwTarget(null)} />
      )}
      {confirmDialog}
      <Toast notice={notice} />
    </div>
  );
}
