'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import DashboardHeader, { usePharmacyInfo } from '../components/DashboardHeader';
import AppFooter from '../../components/AppFooter';
import { getPharmacyId } from '@/lib/tenant';

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
function IconImage({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  );
}

// ضغط صورة المنتج قبل الرفع — الصيدلاني يصوّر بالهاتف (3-4MB) وكل عرض
// لصفحة مريض ينقل هذه الصورة، وحصة النقل من التخزين هي ما يُحاسب عليه
const CATALOG_IMAGE_MAX_DIMENSION = 800;

async function compressCatalogImage(file: File): Promise<Blob | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('تعذّرت قراءة الصورة'));
      el.src = objectUrl;
    });
    const longestSide = Math.max(img.width, img.height);
    const scale = longestSide > CATALOG_IMAGE_MAX_DIMENSION ? CATALOG_IMAGE_MAX_DIMENSION / longestSide : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.82));
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
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
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const isEdit = !!item?.id;

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const ALLOWED_IMAGE_TYPES: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  // حارس ضد الملفات الشاذة لا ضد صور المنتجات — الضغط بعد الرفع يتكفّل بتصغير
  // صور الهواتف الحديثة (تتجاوز 5MB بسهولة) إلى ما دون الحد الفعلي المطلوب
  const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
  const MAX_COMPRESSED_BYTES = 2 * 1024 * 1024;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const ext = ALLOWED_IMAGE_TYPES[file.type];
    if (!ext) { setError('صيغة الصورة غير مدعومة — يُسمح فقط بـ JPG أو PNG أو WEBP'); return; }
    if (file.size > MAX_IMAGE_BYTES) { setError('حجم الصورة أكبر من الحد المسموح (20 ميغابايت)'); return; }
    setUploading(true);
    try {
      let uploadBlob: Blob = file;
      let uploadExt = ext;
      try {
        const compressed = await compressCatalogImage(file);
        if (compressed) { uploadBlob = compressed; uploadExt = 'webp'; }
      } catch (compressErr) {
        console.warn('تعذّر ضغط الصورة، سيتم رفع الملف الأصلي بدلاً منها', compressErr);
      }
      if (uploadBlob.size > MAX_COMPRESSED_BYTES) {
        throw new Error('تعذّر ضغط الصورة إلى حجم مناسب — جرّب صورة أخرى');
      }
      const path = `${pharmacyId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${uploadExt}`;
      const { error: upErr } = await supabase.storage.from('catalog-images').upload(path, uploadBlob);
      if (upErr) throw new Error('تعذّر رفع الصورة');
      const { data: { publicUrl } } = supabase.storage.from('catalog-images').getPublicUrl(path);
      setForm(f => ({ ...f, image_url: publicUrl }));
    } catch (e: any) { setError(e.message); }
    finally { setUploading(false); e.target.value = ''; }
  };

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
              <div className="flex items-center gap-3">
                {form.image_url ? (
                  <div className="relative shrink-0">
                    <img src={form.image_url} alt="" className="w-14 h-14 rounded-xl object-cover border border-slate-200" />
                    <button type="button" onClick={() => setForm(f => ({ ...f, image_url: null }))}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-500 text-white rounded-full text-[10px] flex items-center justify-center font-bold">✕</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className="w-14 h-14 rounded-xl border-2 border-dashed border-slate-300 hover:border-slate-500 flex items-center justify-center text-slate-400 hover:text-slate-600 transition shrink-0">
                    <IconImage className="w-5 h-5" />
                  </button>
                )}
                <div className="flex-1">
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                    className="text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-4 py-2 rounded-xl transition disabled:opacity-50">
                    {uploading ? 'جاري الرفع...' : form.image_url ? 'تغيير الصورة' : 'رفع صورة'}
                  </button>
                  <p className="text-[10px] text-slate-400 mt-1">PNG / JPG · حد أقصى 20MB</p>
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </div>
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
// MAIN PAGE
// ═══════════════════════════════════════════════════════
export default function PharmacyCatalogManagerPage() {
  const router = useRouter();
  const { pharmacyName } = usePharmacyInfo();

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pharmacyId, setPharmacyId] = useState('');

  // فلتر الفئة
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Modals
  const [addEditItem, setAddEditItem] = useState<CatalogItem | null | 'new'>(null);
  const [deleteItem, setDeleteItem] = useState<CatalogItem | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }
        const pid = await getPharmacyId();
        if (!pid) return;
        setPharmacyId(pid);
        const { data } = await supabase
          .from('pharmacy_catalog')
          .select('*')
          .eq('pharmacy_id', pid)
          .order('created_at', { ascending: false });
        if (data) setItems(data as CatalogItem[]);
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

  const filtered = items.filter(i => categoryFilter === 'all' || i.category === categoryFilter);
  const activeCount = items.filter(i => i.is_active).length;
  const capacity = Math.round((items.length / MAX_ITEMS) * 100);

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
          <button onClick={() => setAddEditItem('new')} disabled={items.length >= MAX_ITEMS}
            className="flex items-center gap-2 h-10 px-5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
            <IconPlus className="w-4 h-4" />
            إضافة منتج
          </button>
        </div>

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
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  );
}
