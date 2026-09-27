'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ArrowRight } from '@phosphor-icons/react';
import FeedbackList from '../FeedbackList';

export default function AdminFeedbackPage() {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);

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
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  return (
    <div dir="rtl" className="bg-slate-50 min-h-screen">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 flex-wrap">
        <button onClick={() => router.push('/admin')}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900 text-sm font-semibold cursor-pointer">
          <ArrowRight size={14} weight="bold" aria-hidden="true" />
          الصيدليات
        </button>
        <div className="h-5 w-px bg-slate-200" />
        <h1 className="font-bold text-slate-900">اقتراحات المستخدمين</h1>
      </header>

      <div className="max-w-4xl mx-auto p-4">
        {role && <FeedbackList isOwner={role === 'owner'} />}
      </div>
    </div>
  );
}
