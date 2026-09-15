'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getPharmacyId, getUserRole } from '@/lib/tenant';
import DashboardHeader from '@/app/dashboard/components/DashboardHeader';
import AppFooter from '@/app/components/AppFooter';
import SafetyProfileSummary from '@/components/SafetyProfileSummary';
import ProductModal, { type ProductRecord } from '@/components/ProductModal';
import {
  PRODUCT_KINDS, KIND_LABELS_AR, CATEGORIES_FOR_KIND, CATEGORY_LABELS_AR,
  type ProductKind, type ProductCategory,
} from '@/lib/catalog-taxonomy';

// ═══════════════════════════════════════════════════════
// كتالوج المنتجات — شاشة موحّدة (نسخة جديدة، عرض فقط في هذه الخطوة)
// ═══════════════════════════════════════════════════════
export default function PharmacyCatalogManagerPageV2() {
  const router = useRouter();
  const [items, setItems] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [pharmacyId, setPharmacyId] = useState('');
  const [userRole, setUserRole] = useState<string | null>(null);
  const canManage = userRole === 'owner' || userRole === 'pharmacist';

  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<ProductKind | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<ProductCategory | 'all'>('all');
  const [editItem, setEditItem] = useState<ProductRecord | null | 'new'>(null);
  const [deleteItem, setDeleteItem] = useState<ProductRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }
        const pid = await getPharmacyId();
        if (!pid) return;
        setPharmacyId(pid);
        setUserRole(await getUserRole());
        const { data } = await supabase
          .from('pharmacy_products')
          .select('*')
          .eq('pharmacy_id', pid)
          .neq('review_status', 'rejected_medicine')
          .order('created_at', { ascending: false });
        if (data) setItems(data as ProductRecord[]);
      } finally { setLoading(false); }
    };
    load();
  }, [router]);

  const total = items.length;
  const needsReview = items.filter(i => !i.profile_confirmed_at).length;

  const filtered = items.filter(i => {
    if (kindFilter !== 'all' && i.kind !== kindFilter) return false;
    if (categoryFilter !== 'all' && i.category !== categoryFilter) return false;
    if (search.trim() && !i.brand_name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  const availableCategories = kindFilter === 'all'
    ? (PRODUCT_KINDS.flatMap(k => CATEGORIES_FOR_KIND[k]).filter((c, idx, arr) => arr.indexOf(c) === idx))
    : CATEGORIES_FOR_KIND[kindFilter];

  return (
    <div className="min-h-screen bg-slate-50/50 antialiased" dir="rtl">
      <DashboardHeader breadcrumb="كتالوج المنتجات" onBack={() => router.back()} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 pb-12">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-lg font-bold text-slate-900">كتالوج المنتجات</h1>
            <p className="text-xs text-slate-400 mt-1">
              {total} منتج{needsReview > 0 ? ` · ${needsReview} بحاجة مراجعة` : ''}
            </p>
          </div>
          {canManage && (
            <button onClick={() => setEditItem('new')}
              className="px-4 py-2.5 bg-gradient-to-l from-slate-900 to-teal-800 hover:from-slate-800 hover:to-teal-700 text-white rounded-xl text-xs font-bold transition active:scale-[0.98] shadow-sm cursor-pointer">
              + إضافة منتج
            </button>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 mb-4 space-y-3">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم..."
            className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900 transition text-slate-900" />
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { setKindFilter('all'); setCategoryFilter('all'); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${kindFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>الكل</button>
            {PRODUCT_KINDS.map(k => (
              <button key={k} onClick={() => { setKindFilter(k); setCategoryFilter('all'); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${kindFilter === k ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{KIND_LABELS_AR[k]}</button>
            ))}
          </div>
          {availableCategories.length > 1 && (
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value as ProductCategory | 'all')}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900">
              <option value="all">كل الفئات</option>
              {availableCategories.map(c => <option key={c} value={c}>{CATEGORY_LABELS_AR[c]}</option>)}
            </select>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-slate-400 text-center py-12">جاري التحميل...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-12">لا توجد منتجات مطابقة</p>
        ) : (
          <div className="space-y-2">
            {filtered.map(item => (
              <div key={item.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-500 text-sm shrink-0 overflow-hidden">
                    {item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-cover" /> : item.brand_name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{item.brand_name}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{KIND_LABELS_AR[item.kind]} · {CATEGORY_LABELS_AR[item.category]}</p>
                  </div>
                  <div className="text-left shrink-0">
                    <p className="text-sm font-bold text-slate-900">{item.price} د.أ</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${item.profile_confirmed_at ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {item.profile_confirmed_at ? '✓ مؤكَّد' : 'بحاجة مراجعة'}
                    </span>
                  </div>
                </div>
                {item.clinical_profile && <SafetyProfileSummary profile={item.clinical_profile} />}
                {canManage && (
                  <div className="flex items-center gap-2 px-4 py-2.5 border-t border-slate-100">
                    <button onClick={() => setEditItem(item)}
                      className="text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer">تعديل</button>
                    <span className="text-slate-300">·</span>
                    <button onClick={() => setDeleteItem(item)}
                      className="text-xs font-bold text-rose-500 hover:text-rose-700 cursor-pointer">حذف</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      <AppFooter className="max-w-4xl mx-auto px-6 py-8 border-t border-slate-200/60 mt-4" />

      {editItem && (
        <ProductModal
          item={editItem === 'new' ? null : editItem}
          pharmacyId={pharmacyId}
          onClose={() => setEditItem(null)}
          onSaved={(saved) => {
            setItems(prev => prev.find(i => i.id === saved.id) ? prev.map(i => i.id === saved.id ? saved : i) : [saved, ...prev]);
            setEditItem(null);
          }}
        />
      )}

      {deleteItem && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeleteItem(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl border border-slate-200 p-6 text-center" onClick={e => e.stopPropagation()}>
            <h4 className="text-sm font-bold text-slate-900 mb-2">حذف «{deleteItem.brand_name}»؟</h4>
            <p className="text-xs text-slate-500 mb-6">هذا الإجراء لا يمكن التراجع عنه.</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setDeleteItem(null)} disabled={deleting}
                className="py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer">إلغاء</button>
              <button onClick={async () => {
                setDeleting(true);
                const { error } = await supabase.from('pharmacy_products').delete().eq('id', deleteItem.id);
                setDeleting(false);
                if (!error) { setItems(prev => prev.filter(i => i.id !== deleteItem.id)); setDeleteItem(null); }
              }} disabled={deleting}
                className="py-2.5 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition-colors cursor-pointer">
                {deleting ? 'جاري الحذف...' : 'حذف نهائياً'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
