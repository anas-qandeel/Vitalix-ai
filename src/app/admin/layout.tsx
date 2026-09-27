'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { AdminProvider, ROLE_LABEL, canAccess, NAV, type AdminInfo } from './admin-context';
import NotificationsBell from './NotificationsBell';
import MyPasswordModal from './MyPasswordModal';
import { Key, SignOut } from '@phosphor-icons/react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [admin, setAdmin] = useState<AdminInfo | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

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

      setAdmin({ role: adminRecord.role, userName: adminRecord.name || session.user.email || '', userId: session.user.id });
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (!admin) return;
    if (!canAccess(pathname, admin.role)) router.replace('/admin');
  }, [admin, pathname, router]);

  const allowed = admin && canAccess(pathname, admin.role);

  if (!allowed) {
    return (
      <div dir="rtl" className="bg-slate-50 min-h-screen flex items-center justify-center">
        <p className="text-sm text-slate-400">جارٍ التحميل…</p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="bg-slate-50 min-h-screen">
      <header className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
        <div>
          <p className="font-bold">Vitalix-ai</p>
          <p className="text-[11px] text-slate-400">لوحة إدارة المنصة</p>
        </div>
        <div className="flex items-center gap-3">
          <NotificationsBell isOwner={admin.role === 'owner'} onPharmacyClick={(id) => router.push(`/admin/pharmacies/${id}`)} />
          <span className="text-xs">{admin.userName}</span>
          <span className="text-[10px] bg-slate-700 px-2 py-0.5 rounded-full">{ROLE_LABEL[admin.role]}</span>
          <button
            onClick={() => setChangingPassword(true)}
            aria-label="كلمة مروري"
            title="كلمة مروري"
            className="text-slate-300 hover:text-white cursor-pointer"
          >
            <Key size={16} weight="bold" aria-hidden="true" />
          </button>
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
        {NAV.filter(item => canAccess(item.href, admin.role)).map(item => {
          const isActive = item.href === '/admin'
            ? pathname === '/admin' || pathname.startsWith('/admin/pharmacies')
            : pathname.startsWith(item.href);
          return (
            <button key={item.href} onClick={() => router.push(item.href)}
              className={`py-3 border-b-2 cursor-pointer whitespace-nowrap ${isActive ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>
              {item.label}
            </button>
          );
        })}
      </nav>

      <AdminProvider value={admin}>{children}</AdminProvider>

      {changingPassword && <MyPasswordModal onClose={() => setChangingPassword(false)} />}
    </div>
  );
}
