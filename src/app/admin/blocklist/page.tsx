'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { adminFetch } from '@/lib/admin-fetch';
import Toast, { useNotice } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { Plus, Trash, ArrowRight } from '@phosphor-icons/react';

type Row = { id: string; term: string; term_type: 'generic' | 'brand'; is_active: boolean; note: string | null; created_at: string };

export default function BlocklistPage() {
  const router = useRouter();
  const { notice, setNotice } = useNotice();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [newTerm, setNewTerm] = useState('');
  const [newType, setNewType] = useState<'generic' | 'brand'>('generic');
  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await adminFetch('/api/admin/blocklist');
    if (!res.ok) {
      setNotice({ kind: 'err', text: 'تعذّر جلب القائمة' });
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
    return rows.filter(r => r.term.toLowerCase().includes(q) || (r.note ?? '').toLowerCase().includes(q));
  }, [rows, search]);

  const genericCount = rows.filter(r => r.term_type === 'generic').length;
  const brandCount = rows.filter(r => r.term_type === 'brand').length;

  const addTerm = async () => {
    if (!newTerm.trim() || saving) return;
    setSaving(true);
    const res = await adminFetch('/api/admin/blocklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ term: newTerm, term_type: newType, note: newNote }),
    });
    const json = await res.json();
    if (res.ok) {
      setRows(prev => [json.data, ...prev]);
      setNewTerm('');
      setNewType('generic');
      setNewNote('');
      setNotice({ kind: 'ok', text: 'أُضيف المصطلح' });
    } else {
      setNotice({ kind: 'err', text: json.error || 'فشل الإضافة' });
    }
    setSaving(false);
  };

  const deleteRow = async (row: Row) => {
    const ok = await confirm({
      title: `حذف «${row.term}» من قائمة الحظر؟`,
      message: 'سيتوقف رفض المنتجات التي تطابق هذا المصطلح.',
      confirmText: 'حذف نهائياً',
      destructive: true,
    });
    if (!ok) return;
    const res = await adminFetch(`/api/admin/blocklist?id=${row.id}`, { method: 'DELETE' });
    if (res.ok) {
      setRows(prev => prev.filter(r => r.id !== row.id));
      setNotice({ kind: 'ok', text: 'حُذف المصطلح' });
    } else {
      setNotice({ kind: 'err', text: 'فشل الحذف' });
    }
  };

  return (
    <div dir="rtl" className="bg-slate-50 min-h-screen">
      <div className="max-w-3xl mx-auto p-4">
        <div className="flex items-center gap-3 mb-4">
          <button type="button" onClick={() => router.push('/admin')}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-500 hover:bg-slate-100 cursor-pointer">
            <ArrowRight size={16} weight="bold" aria-hidden="true" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-900">قائمة حظر الأدوية</h1>
            <p className="text-xs text-slate-400">{genericCount} اسم علمي · {brandCount} اسم تجاري · {rows.length} إجمالاً</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
          <div className="flex flex-col sm:flex-row gap-2 mb-2">
            <input type="text" value={newTerm} onChange={e => setNewTerm(e.target.value)}
              placeholder="الاسم العلمي أو التجاري"
              className="flex-1 h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setNewType('generic')}
                className={`h-10 px-3 rounded-lg text-xs font-bold cursor-pointer transition-all ${newType === 'generic' ? 'bg-slate-900 text-white' : 'bg-slate-50 border border-slate-200 text-slate-600'}`}>
                علمي
              </button>
              <button type="button" onClick={() => setNewType('brand')}
                className={`h-10 px-3 rounded-lg text-xs font-bold cursor-pointer transition-all ${newType === 'brand' ? 'bg-slate-900 text-white' : 'bg-slate-50 border border-slate-200 text-slate-600'}`}>
                تجاري
              </button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input type="text" value={newNote} onChange={e => setNewNote(e.target.value)}
              placeholder="ملاحظة (اختياري)"
              className="flex-1 h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
            <button type="button" onClick={addTerm} disabled={!newTerm.trim() || saving}
              className="h-10 px-4 flex items-center justify-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              <Plus size={14} weight="bold" aria-hidden="true" />
              إضافة
            </button>
          </div>
        </div>

        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="بحث…"
          className="w-full h-10 px-3 mb-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />

        {loading ? (
          <p className="text-sm text-slate-400">جارٍ التحميل…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">لا نتائج</p>
        ) : (
          filtered.map(row => (
            <div key={row.id} className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-bold text-sm text-slate-900">{row.term}</span>
                <span className="text-[10px] rounded-full px-2 py-0.5 bg-slate-100 text-slate-600">
                  {row.term_type === 'generic' ? 'علمي' : 'تجاري'}
                </span>
                {row.note && <span className="text-xs text-slate-400 truncate">{row.note}</span>}
              </div>
              <button type="button" onClick={() => deleteRow(row)} aria-label="حذف"
                className="text-rose-500 hover:text-rose-700 cursor-pointer shrink-0">
                <Trash size={14} weight="bold" aria-hidden="true" />
              </button>
            </div>
          ))
        )}
      </div>

      {confirmDialog}
      <Toast notice={notice} />
    </div>
  );
}
