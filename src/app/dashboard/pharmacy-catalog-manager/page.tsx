'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import DashboardHeader, { usePharmacyInfo } from '../components/DashboardHeader';
import AppFooter from '../../components/AppFooter';
import ImageUploadField from '@/components/ImageUploadField';
import { getPharmacyId, getUserRole } from '@/lib/tenant';
import { SUPPLEMENT_CATEGORIES } from '@/lib/supplement-categories';

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════
interface CatalogItem {
  id?: string;
  category: 'sugar_device' | 'sugar_strips' | 'bp_device' | 'weight_loss_med';
  brand_name: string;
  price: number;
  image_url: string | null;
  ai_pitch_prompt: string;
  is_active: boolean;
  created_at?: string;
}

const MAX_ITEMS = 10;

const CATEGORIES = [
  { value: 'sugar_device',    label: 'جهاز فحص السكري',       icon: '🩸' },
  { value: 'sugar_strips',    label: 'شرائح السكري',           icon: '💉' },
  { value: 'bp_device',       label: 'جهاز قياس الضغط',       icon: '🫀' },
  { value: 'weight_loss_med', label: 'منتجات إدارة الوزن',    icon: '⚖️' },
] as const;

const EMPTY_FORM: CatalogItem = {
  category: 'sugar_device',
  brand_name: '',
  price: 15,
  image_url: null,
  ai_pitch_prompt: '',
  is_active: true,
};

// تبويب "المكمّلات" — pharmacy_recommendations، فئات مفتوحة (15) بدل الأربع
// الثابتة، وبلا زر توليد بالذكاء الاصطناعي (الوصف يكتبه الصيدلاني يدوياً)
interface RecommendationItem {
  id?: string;
  category: string;
  product_name: string;
  price: number;
  image_url: string | null;
  ai_description: string;
  is_active: boolean;
  created_at?: string;
}

const EMPTY_SUPPLEMENT_FORM: RecommendationItem = {
  category: SUPPLEMENT_CATEGORIES[0].code,
  product_name: '',
  price: 15,
  image_url: null,
  ai_description: '',
  is_active: true,
};

// ═══════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════
function IconPlus({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}
function IconPencil({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  );
}
function IconTrash({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}
function IconSparkles({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
    </svg>
  );
}
// ═══════════════════════════════════════════════════════
// ADD / EDIT MODAL
// ═══════════════════════════════════════════════════════
function ItemModal({ item, pharmacyId, onClose, onSaved }: {
  item: CatalogItem | null; // null = إضافة جديد
  pharmacyId: string;
  onClose: () => void;
  onSaved: (saved: CatalogItem) => void;
}) {
  const [form, setForm] = useState<CatalogItem>(item || EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLParagraphElement>(null);

  const isEdit = !!item?.id;

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const handleGeneratePitch = async () => {
    if (!form.brand_name.trim()) { setError('أدخل اسم المنتج أولاً'); return; }
    setGenerating(true); setError('');
    try {
      const res = await fetch('/api/generate-ai-pitch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: form.category, brandName: form.brand_name, imageUrl: form.image_url || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل التوليد');
      setForm(f => ({ ...f, ai_pitch_prompt: data.pitch }));
    } catch (e: any) { setError(e.message); }
    finally { setGenerating(false); }
  };

  const handleSave = async () => {
    if (!form.brand_name.trim()) { setError('اسم المنتج مطلوب'); return; }
    if (!form.ai_pitch_prompt.trim()) { setError('الوصف التسويقي مطلوب'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        pharmacy_id: pharmacyId,
        category: form.category,
        brand_name: form.brand_name.trim(),
        price: Number(form.price),
        image_url: form.category === 'weight_loss_med' ? null : (form.image_url || null),
        ai_pitch_prompt: form.ai_pitch_prompt.trim(),
        is_active: form.is_active,
      };
      if (isEdit && item?.id) {
        const { data, error } = await supabase.from('pharmacy_catalog').update(payload).eq('id', item.id).select().single();
        if (error) throw error;
        onSaved(data as CatalogItem);
      } else {
        const { data, error } = await supabase.from('pharmacy_catalog').insert(payload).select().single();
        if (error) throw error;
        onSaved(data as CatalogItem);
      }
    } catch (e: any) { setError(e.message); setSaving(false); }
  };

  const cat = CATEGORIES.find(c => c.value === form.category);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{isEdit ? 'تعديل المنتج' : 'إضافة منتج جديد'}</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">{isEdit ? form.brand_name : 'أضف منتجاً أو جهازاً للكتالوج'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition font-bold">✕</button>
        </div>

        <div className="p-6 space-y-4">
          {/* الفئة */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">الفئة</label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map(c => (
                <button key={c.value} type="button" onClick={() => setForm(f => ({ ...f, category: c.value as any }))}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-bold transition ${
                    form.category === c.value ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'
                  }`}>
                  <span>{c.icon}</span><span>{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* الاسم والسعر */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-1">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">اسم المنتج / الماركة</label>
              <input type="text" value={form.brand_name} onChange={e => setForm(f => ({ ...f, brand_name: e.target.value }))}
                placeholder="مثال: Omron HEM-7156"
                className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900 transition text-slate-900" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">السعر (JOD)</label>
              <input type="number" step="0.5" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900 transition font-mono text-slate-900" />
            </div>
          </div>

          {/* الصورة */}
          {form.category !== 'weight_loss_med' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">صورة المنتج <span className="font-normal text-slate-400">(اختياري)</span></label>
              <ImageUploadField
                pharmacyId={pharmacyId}
                value={form.image_url}
                onChange={(url) => setForm(f => ({ ...f, image_url: url }))}
                onError={setError}
              />
            </div>
          )}

          {/* الوصف التسويقي */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <label className="text-xs font-bold text-slate-700">الوصف التسويقي</label>
              <button type="button" onClick={handleGeneratePitch} disabled={generating}
                className="flex items-center gap-1.5 text-[11px] font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 px-3 py-1.5 rounded-lg transition disabled:opacity-50">
                <IconSparkles className="w-3.5 h-3.5" />
                {generating ? 'جاري التوليد...' : 'توليد بالذكاء الاصطناعي'}
              </button>
            </div>
            <textarea value={form.ai_pitch_prompt} onChange={e => setForm(f => ({ ...f, ai_pitch_prompt: e.target.value }))}
              rows={4} placeholder="سيُعرض هذا النص للمريض عند اقتراح المنتج..."
              className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900 transition resize-none text-slate-900 leading-relaxed" />
          </div>

          {/* الحالة */}
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <p className="text-xs font-bold text-slate-700">حالة المنتج</p>
              <p className="text-[10px] text-slate-400 mt-0.5">المنتجات المعطّلة لن تُقترح للمرضى</p>
            </div>
            <button type="button" onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border transition ${
                form.is_active ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-200 text-slate-500'
              }`}>
              {form.is_active ? '✓ مفعّل' : 'معطّل'}
            </button>
          </div>

          {error && <p ref={errorRef} className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2.5 rounded-xl">{error}</p>}

          <button type="button" onClick={handleSave} disabled={saving}
            className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold transition disabled:opacity-50 active:scale-[0.98]">
            {saving ? 'جاري الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إضافة للكتالوج'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// DELETE CONFIRM MODAL
// ═══════════════════════════════════════════════════════
function DeleteModal({ item, onClose, onDeleted }: {
  item: CatalogItem;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!item.id) return;
    setDeleting(true);
    const { error } = await supabase.from('pharmacy_catalog').delete().eq('id', item.id);
    if (!error) onDeleted(item.id);
    else { setDeleting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl border border-slate-200" onClick={e => e.stopPropagation()}>
        <div className="p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto">
            <IconTrash className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">حذف المنتج</p>
            <p className="text-xs text-slate-500 mt-1">هل تريد حذف <span className="font-bold text-slate-700">{item.brand_name}</span> نهائياً من الكتالوج؟</p>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-sm font-bold transition">
              إلغاء
            </button>
            <button onClick={handleDelete} disabled={deleting}
              className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold transition disabled:opacity-50">
              {deleting ? 'جاري الحذف...' : 'حذف نهائي'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// SUPPLEMENT ADD / EDIT MODAL — pharmacy_recommendations
// ═══════════════════════════════════════════════════════
function SupplementModal({ item, pharmacyId, onClose, onSaved }: {
  item: RecommendationItem | null; // null = إضافة جديد
  pharmacyId: string;
  onClose: () => void;
  onSaved: (saved: RecommendationItem) => void;
}) {
  const [form, setForm] = useState<RecommendationItem>(item || EMPTY_SUPPLEMENT_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLParagraphElement>(null);

  const isEdit = !!item?.id;

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const handleSave = async () => {
    if (!form.product_name.trim()) { setError('اسم المنتج مطلوب'); return; }
    if (!form.ai_description.trim()) { setError('الوصف مطلوب'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        pharmacy_id: pharmacyId,
        category: form.category,
        product_name: form.product_name.trim(),
        price: Number(form.price),
        image_url: form.image_url || null,
        ai_description: form.ai_description.trim(),
        is_active: form.is_active,
      };
      if (isEdit && item?.id) {
        const { data, error } = await supabase.from('pharmacy_recommendations').update(payload).eq('id', item.id).select().single();
        if (error) throw error;
        onSaved(data as RecommendationItem);
      } else {
        const { data, error } = await supabase.from('pharmacy_recommendations').insert(payload).select().single();
        if (error) throw error;
        onSaved(data as RecommendationItem);
      }
    } catch (e: any) { setError(e.message); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{isEdit ? 'تعديل المكمّل' : 'إضافة مكمّل جديد'}</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">{isEdit ? form.product_name : 'أضف مكمّلاً غذائياً لتوصيات المرضى'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition font-bold">✕</button>
        </div>

        <div className="p-6 space-y-4">
          {/* الفئة — select بدل شبكة أزرار: 15 فئة لا تصلح لشبكة كما في الأجهزة (4 فقط) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">الفئة</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900 transition text-slate-900">
              {SUPPLEMENT_CATEGORIES.map(c => (
                <option key={c.code} value={c.code}>{c.labelAr}</option>
              ))}
            </select>
          </div>

          {/* الاسم والسعر */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-1">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">اسم المنتج</label>
              <input type="text" value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))}
                placeholder="مثال: فيتامين D3 1000 وحدة"
                className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900 transition text-slate-900" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">السعر (JOD)</label>
              <input type="number" step="0.5" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900 transition font-mono text-slate-900" />
            </div>
          </div>

          {/* الصورة */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">صورة المنتج <span className="font-normal text-slate-400">(اختياري)</span></label>
            <ImageUploadField
              pharmacyId={pharmacyId}
              value={form.image_url}
              onChange={(url) => setForm(f => ({ ...f, image_url: url }))}
              onError={setError}
            />
          </div>

          {/* الوصف — يكتبه الصيدلاني يدوياً، بلا زر توليد بالذكاء الاصطناعي */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">الوصف</label>
            <textarea value={form.ai_description} onChange={e => setForm(f => ({ ...f, ai_description: e.target.value }))}
              rows={4} placeholder="سيُعرض هذا النص للمريض عند اقتراح المكمّل..."
              className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900 transition resize-none text-slate-900 leading-relaxed" />
          </div>

          {/* الحالة */}
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <p className="text-xs font-bold text-slate-700">حالة المنتج</p>
              <p className="text-[10px] text-slate-400 mt-0.5">المنتجات المعطّلة لن تُقترح للمرضى</p>
            </div>
            <button type="button" onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border transition ${
                form.is_active ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-200 text-slate-500'
              }`}>
              {form.is_active ? '✓ مفعّل' : 'معطّل'}
            </button>
          </div>

          {error && <p ref={errorRef} className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2.5 rounded-xl">{error}</p>}

          <button type="button" onClick={handleSave} disabled={saving}
            className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold transition disabled:opacity-50 active:scale-[0.98]">
            {saving ? 'جاري الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إضافة للتوصيات'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// SUPPLEMENT DELETE CONFIRM MODAL
// ═══════════════════════════════════════════════════════
function DeleteSupplementModal({ item, onClose, onDeleted }: {
  item: RecommendationItem;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!item.id) return;
    setDeleting(true);
    const { error } = await supabase.from('pharmacy_recommendations').delete().eq('id', item.id);
    if (!error) onDeleted(item.id);
    else { setDeleting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl border border-slate-200" onClick={e => e.stopPropagation()}>
        <div className="p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto">
            <IconTrash className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">حذف المكمّل</p>
            <p className="text-xs text-slate-500 mt-1">هل تريد حذف <span className="font-bold text-slate-700">{item.product_name}</span> نهائياً من التوصيات؟</p>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-sm font-bold transition">
              إلغاء
            </button>
            <button onClick={handleDelete} disabled={deleting}
              className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold transition disabled:opacity-50">
              {deleting ? 'جاري الحذف...' : 'حذف نهائي'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// IMAGE LIGHTBOX
// ═══════════════════════════════════════════════════════
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <img src={src} alt="" className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain" onClick={e => e.stopPropagation()} />
      <button onClick={onClose} className="absolute top-4 left-4 w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition font-bold">✕</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// CATALOG CARD
// ═══════════════════════════════════════════════════════
function CatalogCard({ item, onEdit, onDelete, onToggle, onImageClick }: {
  item: CatalogItem;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onImageClick: (url: string) => void;
}) {
  const cat = CATEGORIES.find(c => c.value === item.category);

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden shadow-sm transition-all ${
      item.is_active ? 'border-slate-200' : 'border-slate-100 opacity-60'
    }`}>
      {/* صورة أو placeholder */}
      <div className="h-36 bg-slate-50 border-b border-slate-100 flex items-center justify-center relative">
        {item.image_url ? (
          <img src={item.image_url} alt={item.brand_name}
            onClick={() => onImageClick(item.image_url!)}
            className="h-full w-full object-contain p-3 cursor-zoom-in" />
        ) : (
          <span className="text-4xl opacity-40">{cat?.icon}</span>
        )}
        {/* فئة badge */}
        <span className="absolute top-2 right-2 text-[10px] font-bold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-lg shadow-sm">
          {cat?.icon} {cat?.label}
        </span>
        {/* حالة badge */}
        <span className={`absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-lg border ${
          item.is_active ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-slate-100 text-slate-500 border-slate-200'
        }`}>
          {item.is_active ? 'مفعّل' : 'معطّل'}
        </span>
      </div>

      <div className="p-4 space-y-3">
        {/* الاسم والسعر */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-bold text-slate-900 leading-snug">{item.brand_name}</p>
          <span className="text-sm font-black text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-lg shrink-0 font-mono">
            {item.price} JOD
          </span>
        </div>

        {/* الوصف */}
        <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">{item.ai_pitch_prompt}</p>

        {/* أزرار */}
        <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
          <button onClick={onEdit}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition">
            <IconPencil className="w-3.5 h-3.5" />تعديل
          </button>
          <button onClick={onToggle}
            className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
              item.is_active
                ? 'bg-white text-slate-500 border-slate-200 hover:border-amber-400 hover:text-amber-600'
                : 'bg-white text-teal-600 border-slate-200 hover:border-teal-400'
            }`}>
            {item.is_active ? 'تعطيل' : 'تفعيل'}
          </button>
          <button onClick={onDelete}
            className="py-2 px-3 rounded-xl text-xs font-bold border border-slate-200 text-slate-400 hover:border-rose-300 hover:text-rose-600 hover:bg-rose-50 transition">
            <IconTrash className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// SUPPLEMENT CARD
// ═══════════════════════════════════════════════════════
function SupplementCard({ item, onEdit, onDelete, onToggle, onImageClick }: {
  item: RecommendationItem;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onImageClick: (url: string) => void;
}) {
  const cat = SUPPLEMENT_CATEGORIES.find(c => c.code === item.category);

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden shadow-sm transition-all ${
      item.is_active ? 'border-slate-200' : 'border-slate-100 opacity-60'
    }`}>
      {/* صورة أو placeholder */}
      <div className="h-36 bg-slate-50 border-b border-slate-100 flex items-center justify-center relative">
        {item.image_url ? (
          <img src={item.image_url} alt={item.product_name}
            onClick={() => onImageClick(item.image_url!)}
            className="h-full w-full object-contain p-3 cursor-zoom-in" />
        ) : (
          <span className="text-4xl opacity-40">💊</span>
        )}
        {/* فئة badge */}
        <span className="absolute top-2 right-2 text-[10px] font-bold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-lg shadow-sm">
          {cat?.labelAr ?? item.category}
        </span>
        {/* حالة badge */}
        <span className={`absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-lg border ${
          item.is_active ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-slate-100 text-slate-500 border-slate-200'
        }`}>
          {item.is_active ? 'مفعّل' : 'معطّل'}
        </span>
      </div>

      <div className="p-4 space-y-3">
        {/* الاسم والسعر */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-bold text-slate-900 leading-snug">{item.product_name}</p>
          <span className="text-sm font-black text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-lg shrink-0 font-mono">
            {item.price} JOD
          </span>
        </div>

        {/* الوصف */}
        <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">{item.ai_description}</p>

        {/* أزرار */}
        <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
          <button onClick={onEdit}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition">
            <IconPencil className="w-3.5 h-3.5" />تعديل
          </button>
          <button onClick={onToggle}
            className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
              item.is_active
                ? 'bg-white text-slate-500 border-slate-200 hover:border-amber-400 hover:text-amber-600'
                : 'bg-white text-teal-600 border-slate-200 hover:border-teal-400'
            }`}>
            {item.is_active ? 'تعطيل' : 'تفعيل'}
          </button>
          <button onClick={onDelete}
            className="py-2 px-3 rounded-xl text-xs font-bold border border-slate-200 text-slate-400 hover:border-rose-300 hover:text-rose-600 hover:bg-rose-50 transition">
            <IconTrash className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════
export default function PharmacyCatalogManagerPage() {
  const router = useRouter();
  const { pharmacyName } = usePharmacyInfo();

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pharmacyId, setPharmacyId] = useState('');
  const [userRole, setUserRole] = useState<string | null>(null);

  // تبويب الأجهزة أو المكمّلات
  const [activeTab, setActiveTab] = useState<'devices' | 'supplements'>('devices');

  // فلتر الفئة
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Modals — الأجهزة
  const [addEditItem, setAddEditItem] = useState<CatalogItem | null | 'new'>(null);
  const [deleteItem, setDeleteItem] = useState<CatalogItem | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // المكمّلات — pharmacy_recommendations
  const [supplements, setSupplements] = useState<RecommendationItem[]>([]);
  const [supplementCategoryFilter, setSupplementCategoryFilter] = useState<string>('all');
  const [addEditSupplement, setAddEditSupplement] = useState<RecommendationItem | null | 'new'>(null);
  const [deleteSupplement, setDeleteSupplement] = useState<RecommendationItem | null>(null);

  // تبويب المكمّلات يظهر فقط لـ owner/pharmacist — سياسة RLS تسمح لهما وحدهما
  // بالكتابة على pharmacy_recommendations؛ إخفاؤه عن غيرهما أفضل من عرض تبويب
  // يفشل الحفظ فيه صامتاً برفض RLS
  const canManageSupplements = userRole === 'owner' || userRole === 'pharmacist';

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }
        const pid = await getPharmacyId();
        if (!pid) return;
        setPharmacyId(pid);
        const role = await getUserRole();
        setUserRole(role);
        const { data } = await supabase
          .from('pharmacy_catalog')
          .select('*')
          .eq('pharmacy_id', pid)
          .order('created_at', { ascending: false });
        if (data) setItems(data as CatalogItem[]);

        if (role === 'owner' || role === 'pharmacist') {
          const { data: recData } = await supabase
            .from('pharmacy_recommendations')
            .select('*')
            .eq('pharmacy_id', pid)
            .order('created_at', { ascending: false });
          if (recData) setSupplements(recData as RecommendationItem[]);
        }
      } finally { setLoading(false); }
    };
    load();
  }, [router]);

  const handleSaved = (saved: CatalogItem) => {
    setItems(prev => {
      const exists = prev.find(i => i.id === saved.id);
      return exists
        ? prev.map(i => i.id === saved.id ? saved : i)
        : [saved, ...prev];
    });
    setAddEditItem(null);
  };

  const handleDeleted = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    setDeleteItem(null);
  };

  const handleToggle = async (item: CatalogItem) => {
    if (!item.id) return;
    const next = !item.is_active;
    await supabase.from('pharmacy_catalog').update({ is_active: next }).eq('id', item.id);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: next } : i));
  };

  const handleSupplementSaved = (saved: RecommendationItem) => {
    setSupplements(prev => {
      const exists = prev.find(i => i.id === saved.id);
      return exists
        ? prev.map(i => i.id === saved.id ? saved : i)
        : [saved, ...prev];
    });
    setAddEditSupplement(null);
  };

  const handleSupplementDeleted = (id: string) => {
    setSupplements(prev => prev.filter(i => i.id !== id));
    setDeleteSupplement(null);
  };

  const handleSupplementToggle = async (item: RecommendationItem) => {
    if (!item.id) return;
    const next = !item.is_active;
    await supabase.from('pharmacy_recommendations').update({ is_active: next }).eq('id', item.id);
    setSupplements(prev => prev.map(i => i.id === item.id ? { ...i, is_active: next } : i));
  };

  const filtered = items.filter(i => categoryFilter === 'all' || i.category === categoryFilter);
  const activeCount = items.filter(i => i.is_active).length;
  const capacity = Math.round((items.length / MAX_ITEMS) * 100);

  const filteredSupplements = supplements.filter(i => supplementCategoryFilter === 'all' || i.category === supplementCategoryFilter);
  const activeSupplementCount = supplements.filter(i => i.is_active).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50/50 flex items-center justify-center" dir="rtl">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 antialiased pb-16" dir="rtl">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&display=swap');
        body { font-family: 'IBM Plex Sans Arabic', system-ui, sans-serif; }
        @keyframes saasSlideUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .slide-up { animation: saasSlideUp 0.25s ease both; }
      `}</style>

      <DashboardHeader breadcrumb="كتالوج الأجهزة والمنتجات" onBack={() => router.push('/dashboard')} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-12 space-y-6 slide-up">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">الكتالوج والتوصيات</h1>
            <p className="text-sm text-slate-500 mt-1">الأجهزة والمنتجات المقترحة تلقائياً للمرضى بناءً على قراءاتهم</p>
          </div>
          {activeTab === 'devices' ? (
            <button onClick={() => setAddEditItem('new')} disabled={items.length >= MAX_ITEMS}
              className="flex items-center gap-2 h-10 px-5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
              <IconPlus className="w-4 h-4" />
              إضافة منتج
            </button>
          ) : (
            <button onClick={() => setAddEditSupplement('new')}
              className="flex items-center gap-2 h-10 px-5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold transition shadow-sm shrink-0 cursor-pointer">
              <IconPlus className="w-4 h-4" />
              إضافة مكمّل
            </button>
          )}
        </div>

        {/* ── تبويبات — تظهر فقط لمن يملك صلاحية كتابة على المكمّلات ── */}
        {canManageSupplements && (
          <div className="flex items-center gap-2 border-b border-slate-200">
            <button onClick={() => setActiveTab('devices')}
              className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition cursor-pointer ${
                activeTab === 'devices' ? 'border-teal-600 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}>
              الأجهزة
            </button>
            <button onClick={() => setActiveTab('supplements')}
              className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition cursor-pointer ${
                activeTab === 'supplements' ? 'border-teal-600 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}>
              المكمّلات
            </button>
          </div>
        )}

        {activeTab === 'devices' && (
          <>
            {/* ── إحصاءات ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'إجمالي المنتجات', value: `${items.length} / ${MAX_ITEMS}`, sub: capacity >= 80 ? 'قارب الامتلاء' : `${MAX_ITEMS - items.length} متبق` },
                { label: 'منتجات مفعّلة', value: activeCount.toString(), sub: 'تُقترح للمرضى' },
                { label: 'معطّلة', value: (items.length - activeCount).toString(), sub: 'لا تُعرض حالياً' },
              ].map(({ label, value, sub }) => (
                <div key={label} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
                  <p className="text-2xl font-black text-slate-900">{value}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>
                </div>
              ))}
            </div>

            {/* شريط سعة الكتالوج */}
            {items.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl px-5 py-3 shadow-sm flex items-center gap-4">
                <p className="text-[11px] font-bold text-slate-500 shrink-0">سعة الكتالوج</p>
                <div className="flex-1 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${capacity >= 100 ? 'bg-rose-500' : capacity >= 70 ? 'bg-amber-500' : 'bg-teal-500'}`}
                    style={{ width: `${capacity}%` }} />
                </div>
                <p className={`text-[11px] font-black shrink-0 ${capacity >= 100 ? 'text-rose-600' : 'text-slate-600'}`}>{capacity}%</p>
              </div>
            )}

            {/* ── فلاتر الفئة ── */}
            {items.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { v: 'all', l: 'الكل', count: items.length },
                  ...CATEGORIES.map(c => ({ v: c.value, l: `${c.icon} ${c.label}`, count: items.filter(i => i.category === c.value).length })).filter(c => c.count > 0),
                ].map(({ v, l, count }) => (
                  <button key={v} onClick={() => setCategoryFilter(v)}
                    className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border transition ${
                      categoryFilter === v ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                    }`}>
                    {l}
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${categoryFilter === v ? 'bg-white/20' : 'bg-slate-100'}`}>{count}</span>
                  </button>
                ))}
              </div>
            )}

            {/* ── الكتالوج ── */}
            {filtered.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-300 rounded-2xl py-20 flex flex-col items-center justify-center gap-3 text-center">
                <span className="text-4xl">📦</span>
                <p className="text-sm font-semibold text-slate-500">{items.length === 0 ? 'الكتالوج فارغ' : 'لا توجد منتجات في هذه الفئة'}</p>
                <p className="text-xs text-slate-400">
                  {items.length === 0 ? 'أضف أجهزة ومنتجات لتُقترح تلقائياً على مرضاك' : 'جرّب تغيير الفئة أو أضف منتجاً جديداً'}
                </p>
                {items.length === 0 && (
                  <button onClick={() => setAddEditItem('new')}
                    className="mt-2 flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition">
                    <IconPlus className="w-4 h-4" />إضافة أول منتج
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map(item => (
                  <CatalogCard
                    key={item.id}
                    item={item}
                    onEdit={() => setAddEditItem(item)}
                    onDelete={() => setDeleteItem(item)}
                    onToggle={() => handleToggle(item)}
                    onImageClick={setLightboxSrc}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'supplements' && canManageSupplements && (
          <>
            {/* ── إحصاءات — بلا حد أقصى، فلا شريط سعة هنا ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'إجمالي المكمّلات', value: supplements.length.toString(), sub: 'بلا حد أقصى' },
                { label: 'مكمّلات مفعّلة', value: activeSupplementCount.toString(), sub: 'تُقترح للمرضى' },
                { label: 'معطّلة', value: (supplements.length - activeSupplementCount).toString(), sub: 'لا تُعرض حالياً' },
              ].map(({ label, value, sub }) => (
                <div key={label} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
                  <p className="text-2xl font-black text-slate-900">{value}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>
                </div>
              ))}
            </div>

            {/* فلتر الفئة — select بدل شريط أزرار: 15 فئة كثيرة على أزرار أفقية
                خلافاً لفئات الأجهزة الأربع، والقائمة قابلة للنمو بلا حد أقصى */}
            {supplements.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-500 shrink-0">الفئة</label>
                <select value={supplementCategoryFilter} onChange={e => setSupplementCategoryFilter(e.target.value)}
                  className="text-xs font-bold px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900 transition text-slate-700">
                  <option value="all">الكل ({supplements.length})</option>
                  {SUPPLEMENT_CATEGORIES.map(c => {
                    const count = supplements.filter(i => i.category === c.code).length;
                    return count > 0 ? <option key={c.code} value={c.code}>{c.labelAr} ({count})</option> : null;
                  })}
                </select>
              </div>
            )}

            {/* ── المكمّلات ── */}
            {filteredSupplements.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-300 rounded-2xl py-20 flex flex-col items-center justify-center gap-3 text-center">
                <span className="text-4xl">💊</span>
                <p className="text-sm font-semibold text-slate-500">{supplements.length === 0 ? 'لا مكمّلات مضافة بعد' : 'لا توجد مكمّلات في هذه الفئة'}</p>
                <p className="text-xs text-slate-400">
                  {supplements.length === 0 ? 'أضف مكمّلات غذائية لتُقترح تلقائياً على مرضاك' : 'جرّب تغيير الفئة أو أضف مكمّلاً جديداً'}
                </p>
                {supplements.length === 0 && (
                  <button onClick={() => setAddEditSupplement('new')}
                    className="mt-2 flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition">
                    <IconPlus className="w-4 h-4" />إضافة أول مكمّل
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredSupplements.map(item => (
                  <SupplementCard
                    key={item.id}
                    item={item}
                    onEdit={() => setAddEditSupplement(item)}
                    onDelete={() => setDeleteSupplement(item)}
                    onToggle={() => handleSupplementToggle(item)}
                    onImageClick={setLightboxSrc}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <AppFooter className="max-w-5xl mx-auto px-6 py-8 border-t border-slate-200/60 mt-4" />

      {/* ── Modals ── */}
      {addEditItem !== null && (
        <ItemModal
          item={addEditItem === 'new' ? null : addEditItem}
          pharmacyId={pharmacyId}
          onClose={() => setAddEditItem(null)}
          onSaved={handleSaved}
        />
      )}
      {deleteItem && (
        <DeleteModal
          item={deleteItem}
          onClose={() => setDeleteItem(null)}
          onDeleted={handleDeleted}
        />
      )}
      {addEditSupplement !== null && (
        <SupplementModal
          item={addEditSupplement === 'new' ? null : addEditSupplement}
          pharmacyId={pharmacyId}
          onClose={() => setAddEditSupplement(null)}
          onSaved={handleSupplementSaved}
        />
      )}
      {deleteSupplement && (
        <DeleteSupplementModal
          item={deleteSupplement}
          onClose={() => setDeleteSupplement(null)}
          onDeleted={handleSupplementDeleted}
        />
      )}
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  );
}
