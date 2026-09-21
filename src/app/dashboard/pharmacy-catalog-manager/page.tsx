'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getPharmacyId, getUserRole } from '@/lib/tenant';
import DashboardHeader from '@/app/dashboard/components/DashboardHeader';
import AppFooter from '@/app/components/AppFooter';
import SafetyProfileSummary from '@/components/SafetyProfileSummary';
import SafetyProfileFull from '@/components/SafetyProfileFull';
import ProductModal, { type ProductRecord } from '@/components/ProductModal';
import {
  PRODUCT_KINDS, KIND_LABELS_AR, CATEGORIES_FOR_KIND, CATEGORY_LABELS_AR,
  type ProductKind, type ProductCategory,
} from '@/lib/catalog-taxonomy';
import { summarizeProductEvents, type ProductSignals } from '@/lib/product-signals';
import { Plus } from '@phosphor-icons/react';

// ═══════════════════════════════════════════════════════
// كتالوج المنتجات — شاشة موحّدة (نسخة جديدة، عرض فقط في هذه الخطوة)
// ═══════════════════════════════════════════════════════
export default function PharmacyCatalogManagerPageV2() {
  const router = useRouter();
  const [items, setItems] = useState<ProductRecord[]>([]);
  const [signals, setSignals] = useState<Map<string, ProductSignals>>(new Map());
  const [loading, setLoading] = useState(true);
  const [pharmacyId, setPharmacyId] = useState('');
  const [userRole, setUserRole] = useState<string | null>(null);
  const canManage = userRole === 'owner' || userRole === 'pharmacist';

  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<ProductKind | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<ProductCategory | 'all'>('all');
  const [editItem, setEditItem] = useState<ProductRecord | null | 'new'>(null);
  const [deleteItem, setDeleteItem] = useState<ProductRecord | null>(null);
  const [viewItem, setViewItem] = useState<typeof deleteItem>(null);
  const [imageZoomed, setImageZoomed] = useState(false);
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
          .select('*, confirmer:pharmacy_staff!profile_confirmed_by(name)')
          .eq('pharmacy_id', pid)
          .neq('review_status', 'rejected_medicine')
          .order('created_at', { ascending: false });
        if (data) setItems(data as ProductRecord[]);
        // حلقة التعلّم: أحداث صيدليتك لآخر 90 يوماً (RLS تحصرها بصيدليتك) — للعرض فقط
        const since = new Date(Date.now() - 90 * 86400000).toISOString();
        const { data: events } = await supabase
          .from('catalog_product_events')
          .select('product_id, event_type, patient_flags')
          .eq('pharmacy_id', pid)
          .gte('created_at', since);
        if (events) setSignals(summarizeProductEvents(events));
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
              className="h-10 shrink-0 whitespace-nowrap px-3 sm:px-4 flex items-center justify-center gap-2 rounded-lg bg-teal-600 text-white text-xs sm:text-sm font-medium hover:bg-teal-700 transition-all shadow-sm cursor-pointer">
              <Plus size={16} weight="bold" /> إضافة منتج
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
                      {item.profile_confirmed_at ? `✓ مؤكَّد${item.confirmer?.name ? ' · ' + item.confirmer.name : ''} · بتاريخ ${new Date(item.profile_confirmed_at).getDate()}/${new Date(item.profile_confirmed_at).getMonth() + 1}` : 'بحاجة مراجعة'}
                    </span>
                  </div>
                </div>
                {item.clinical_profile && <SafetyProfileSummary profile={item.clinical_profile} />}
                {(() => {
                  const s = signals.get(item.id);
                  if (!s || (s.inquired === 0 && s.excluded === 0)) return null;
                  return (
                    <div className="px-4 pb-2.5 -mt-1 space-y-1">
                      <p className="text-[10px] text-slate-400">آخر 90 يوماً: استُفسر {s.inquired} · استُبعد {s.excluded}</p>
                      {s.review_hint && (
                        <p className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 inline-block">{s.review_hint}</p>
                      )}
                    </div>
                  );
                })()}
                <div className="flex items-center gap-2 px-4 py-2.5 border-t border-slate-100">
                  <button onClick={() => setViewItem(item)}
                    className="text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer">عرض</button>
                  {canManage && (
                    <>
                      <span className="text-slate-300">·</span>
                      <button onClick={() => setEditItem(item)}
                        className="text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer">تعديل</button>
                      <span className="text-slate-300">·</span>
                      <button onClick={() => setDeleteItem(item)}
                        className="text-xs font-bold text-rose-500 hover:text-rose-700 cursor-pointer">حذف</button>
                    </>
                  )}
                </div>
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
          onSaved={async (saved) => {
            // النموذج يعيد الصف بلا الضم؛ نعيد جلبه مع اسم المؤكِّد ليظهر فوراً
            const { data: fresh } = await supabase
              .from('pharmacy_products')
              .select('*, confirmer:pharmacy_staff!profile_confirmed_by(name)')
              .eq('id', saved.id)
              .maybeSingle();
            const row = (fresh ?? saved) as ProductRecord;
            setItems(prev => prev.find(i => i.id === row.id) ? prev.map(i => i.id === row.id ? row : i) : [row, ...prev]);
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
                className="h-10 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-all shadow-sm cursor-pointer">إلغاء</button>
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

      {viewItem && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => { setViewItem(null); setImageZoomed(false); }}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start justify-between gap-3 mb-4">
                <h4 className="text-sm font-bold text-slate-900">{viewItem.brand_name}</h4>
                <button onClick={() => { setViewItem(null); setImageZoomed(false); }}
                  className="w-7 h-7 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-colors shrink-0 cursor-pointer">✕</button>
              </div>
              {viewItem.image_url && (
                <button onClick={() => setImageZoomed(true)}
                  className="w-full h-40 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden mb-4 cursor-zoom-in">
                  <img src={viewItem.image_url} alt="" className="w-full h-full object-cover" />
                </button>
              )}
              {viewItem.clinical_profile
                ? <SafetyProfileFull profile={viewItem.clinical_profile} />
                : <p className="text-xs text-slate-400 text-center py-4">لا توجد بطاقة أمان لهذا المنتج</p>}
            </div>
          </div>
        </div>
      )}

      {imageZoomed && viewItem?.image_url && (
        <div className="fixed inset-0 bg-slate-900/80 z-[60] flex items-center justify-center p-4"
          onClick={() => setImageZoomed(false)}>
          <img src={viewItem.image_url} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
}
