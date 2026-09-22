'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { adminFetch } from '@/lib/admin-fetch';
import Toast, { useNotice } from '@/components/Toast';
import { ArrowRight } from '@phosphor-icons/react';

type Row = { id: string; pharmacy_id: string; pharmacy_name: string; brand_name: string; ingredients: string[]; reason: string; source: 'blocklist' | 'ai' | 'both'; matched_terms: string[]; image_url: string | null; created_at: string };

const SOURCE_LABELS: Record<Row['source'], string> = { blocklist: 'قائمة الحظر', ai: 'الذكاء الاصطناعي', both: 'كلاهما' };

export default function RejectionsPage() {
  const router = useRouter();
  const { notice, setNotice } = useNotice();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    const res = await adminFetch('/api/admin/rejections');
    if (!res.ok) {
      setNotice({ kind: 'err', text: 'تعذّر جلب السجل' });
    } else {
      const json = await res.json();
      setRows(json.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    const checkAdminPermission = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        router.push('/');
        return;
      }

      const { data: adminRecord, error } = await supabase
        .from('platform_admins')
        .select('role, name')
        .eq('user_id', session.user.id)
        .single();

      if (error || !adminRecord) {
        router.push('/dashboard');
        return;
      }

      load();
    };

    checkAdminPermission();
  }, [router]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.brand_name.toLowerCase().includes(q) ||
      r.pharmacy_name.toLowerCase().includes(q) ||
      r.matched_terms.some(t => t.toLowerCase().includes(q)) ||
      r.ingredients.some(i => i.toLowerCase().includes(q))
    );
  }, [rows, search]);

  return (
    <div dir="rtl" className="bg-slate-50 min-h-screen">
      <div className="max-w-3xl mx-auto p-4">
        <div className="flex items-center gap-3 mb-4">
          <button type="button" onClick={() => router.push('/admin')}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-500 hover:bg-slate-100 cursor-pointer">
            <ArrowRight size={16} weight="bold" aria-hidden="true" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-900">المنتجات المرفوضة</h1>
            <p className="text-xs text-slate-400">{rows.length} محاولة (آخر 200)</p>
          </div>
        </div>

        <p className="text-xs text-slate-400 mb-3">
          كل محاولة إدخال منتج رُفض لأنه دواء. راجع المصطلحات المطابقة لاكتشاف رفض خاطئ وصحّح قائمة الحظر.
        </p>

        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="بحث بالمنتج أو الصيدلية أو المصطلح…"
          className="w-full h-10 px-3 mb-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />

        {loading ? (
          <p className="text-sm text-slate-400">جارٍ التحميل…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">لا سجلات</p>
        ) : (
          filtered.map(row => (
            <div key={row.id} className="bg-white border border-slate-200 rounded-xl p-4 mb-2">
              <div className="flex items-start gap-3">
                {row.image_url && (
                  <img src={row.image_url} alt="" className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm text-slate-900">{row.brand_name}</span>
                    <span className="text-xs text-slate-400 shrink-0">{new Date(row.created_at).toLocaleDateString('en-GB')}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {row.pharmacy_name} · <span className="text-[10px] rounded-full px-2 py-0.5 bg-slate-100 text-slate-600">{SOURCE_LABELS[row.source]}</span>
                  </div>
                  {row.matched_terms.length > 0 && (
                    <div className="mt-1.5">
                      <span className="text-xs text-slate-400">المصطلحات المطابقة:</span>{' '}
                      {row.matched_terms.map(term => (
                        <span key={term} className="text-[11px] rounded-md px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-100 ml-1">{term}</span>
                      ))}
                    </div>
                  )}
                  {row.ingredients.length > 0 && (
                    <div className="mt-1.5">
                      <span className="text-xs text-slate-400">المكوّنات:</span>{' '}
                      <span className="text-xs text-slate-600">{row.ingredients.join('، ')}</span>
                    </div>
                  )}
                  <p className="text-xs text-slate-600 mt-1">{row.reason}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <Toast notice={notice} />
    </div>
  );
}
