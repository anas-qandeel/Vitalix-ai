'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import ImageUploadField from '@/components/ImageUploadField';
import SafetyProfileSummary from '@/components/SafetyProfileSummary';
import SafetyProfileFields from '@/components/SafetyProfileFields';
import type { ClinicalProfile } from '@/lib/product-suitability';
import {
  PRODUCT_KINDS, KIND_LABELS_AR, CATEGORIES_FOR_KIND, CATEGORY_LABELS_AR,
  isProductKind, isProductCategory, type ProductKind, type ProductCategory,
} from '@/lib/catalog-taxonomy';
import { getStaffId } from '@/lib/tenant';

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════
export interface ProductRecord {
  id: string;
  kind: ProductKind;
  category: ProductCategory;
  brand_name: string;
  price: number;
  image_url: string | null;
  patient_pitch: string | null;
  clinical_profile: ClinicalProfile | null;
  profile_source: 'manual' | 'ai';
  profile_confirmed_at: string | null;
  profile_confirmed_by?: string | null;          // معرّف الموظف المؤكِّد (pharmacy_staff.id)
  confirmer?: { name: string } | null;            // يُملأ بالانضمام في شاشة الكتالوج
  review_status: 'ok' | 'needs_review' | 'rejected_medicine';
  is_active: boolean;
}

interface ProductModalProps {
  item: ProductRecord | null; // null = إضافة جديد
  pharmacyId: string;
  onClose: () => void;
  onSaved: (saved: ProductRecord) => void;
}

const EMPTY_PROFILE: ClinicalProfile = {
  active_ingredients: [], allergen_tags: [], pregnancy: 'unknown', lactation: 'unknown',
  min_age_years: null, contains_sugar: null, contains_sodium: null, contains_caffeine: null,
  avoid_with_conditions: [], interacts_with_generics: [], notes_for_pharmacist: null, confidence: {},
};

// ═══════════════════════════════════════════════════════
// ProductModal — نموذج موحّد لإضافة/تعديل منتج في الكتالوج
// ═══════════════════════════════════════════════════════
export default function ProductModal({ item, pharmacyId, onClose, onSaved }: ProductModalProps) {
  const isEdit = !!item?.id;

  const [kind, setKind] = useState<ProductKind>(item?.kind ?? 'supplement');
  const [category, setCategory] = useState<ProductCategory>(item?.category ?? 'uncategorized');
  const [brandName, setBrandName] = useState(item?.brand_name ?? '');
  const [price, setPrice] = useState(String(item?.price ?? 15));
  const [imageUrl, setImageUrl] = useState<string | null>(item?.image_url ?? null);
  const patientPitch = item?.patient_pitch ?? ''; // الحقل لم يعد يُعرض في أي مكان؛ نُبقي القيمة القديمة كما هي عند الحفظ

  const [profile, setProfile] = useState<ClinicalProfile | null>(item?.clinical_profile ?? null);
  const [profileSource, setProfileSource] = useState<'manual' | 'ai'>(item?.profile_source ?? 'manual');

  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState('');
  const [rejected, setRejected] = useState<{ reason: string; detail?: string } | null>(null);
  // إقرار المراجعة: يُصفَّر عند كل بناء جديد للبطاقة، ويمنع الحفظ حتى يُعلَّم
  const [reviewed, setReviewed] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const handleBuildProfile = async () => {
    if (!brandName.trim()) { setBuildError('أدخل اسم المنتج أولاً'); return; }
    setBuilding(true); setBuildError(''); setRejected(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('انتهت الجلسة');
      const res = await fetch('/api/catalog/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ brand_name: brandName.trim(), image_url: imageUrl || undefined, category }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذّر بناء بطاقة الأمان');
      setReviewed(false);
      if (data.rejected) { setRejected({ reason: data.reason, detail: data.detail }); return; }
      setProfile(data.profile as ClinicalProfile);
      setProfileSource('ai');
      if (isProductKind(data.suggested_kind)) setKind(data.suggested_kind);
      if (isProductCategory(data.suggested_category)) setCategory(data.suggested_category);
    } catch (e: unknown) { setBuildError((e as Error)?.message || 'تعذّر بناء بطاقة الأمان'); }
    finally { setBuilding(false); }
  };

  const handleSave = async (withProfile: boolean) => {
    if (!brandName.trim()) { setSaveError('اسم المنتج مطلوب'); return; }
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) { setSaveError('السعر غير صحيح'); return; }
    setSaving(true); setSaveError('');
    try {
      const confirmedBy = withProfile && profile ? await getStaffId() : null;
      const payload = {
        pharmacy_id: pharmacyId,
        kind, category,
        brand_name: brandName.trim(),
        price: priceNum,
        image_url: imageUrl || null,
        patient_pitch: patientPitch.trim() || null,
        clinical_profile: withProfile && profile ? profile : (item?.clinical_profile ?? EMPTY_PROFILE),
        profile_source: withProfile && profile ? profileSource : (item?.profile_source ?? 'manual'),
        profile_confirmed_at: withProfile && profile ? new Date().toISOString() : (item?.profile_confirmed_at ?? null),
        profile_confirmed_by: withProfile && profile ? confirmedBy : (item?.profile_confirmed_by ?? null),
        review_status: withProfile && profile ? 'ok' : 'needs_review',
        is_active: item?.is_active ?? true,
      };
      if (isEdit && item?.id) {
        const { data, error } = await supabase.from('pharmacy_products').update(payload).eq('id', item.id).select().single();
        if (error) throw error;
        onSaved(data as ProductRecord);
      } else {
        const { data, error } = await supabase.from('pharmacy_products').insert(payload).select().single();
        if (error) throw error;
        onSaved(data as ProductRecord);
      }
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      // 23505 = القيد الفريد uniq_products_pharmacy_name: الاسم نفسه موجود في كتالوج هذه الصيدلية
      const isDuplicate = err?.code === '23505' || /uniq_products_pharmacy_name|duplicate key/i.test(err?.message || '');
      setSaveError(isDuplicate
        ? 'هذا المنتج موجود في كتالوجك بالاسم نفسه — عدّل المنتج الموجود بدل إضافته مرة أخرى.'
        : (err?.message || 'تعذر الحفظ'));
      setSaving(false);
    }
  };

  const availableCategories = CATEGORIES_FOR_KIND[kind];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg shadow-2xl border border-slate-200 max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{isEdit ? 'تعديل المنتج' : 'إضافة منتج جديد'}</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">{isEdit ? brandName : 'أضف منتجاً للكتالوج'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-colors text-sm cursor-pointer">✕</button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">اسم المنتج</label>
            <input type="text" value={brandName} onChange={e => setBrandName(e.target.value)} placeholder="مثال: فيتامين D3 5000"
              className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900 transition text-slate-900" />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">صورة المنتج <span className="font-normal text-slate-400">(اختياري — ترفع دقة بطاقة الأمان)</span></label>
            <ImageUploadField pharmacyId={pharmacyId} value={imageUrl} onChange={setImageUrl} onError={setBuildError} />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">السعر (د.أ)</label>
            <input type="number" value={price} onChange={e => setPrice(e.target.value)}
              className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900 transition text-slate-900" />
          </div>

          {/* ── بطاقة الأمان: البناء بالذكاء الاصطناعي ── */}
          <div className="border-t border-slate-100 pt-4">
            <button type="button" onClick={handleBuildProfile} disabled={building || !brandName.trim()}
              className="w-full py-3 bg-gradient-to-l from-slate-900 to-teal-800 hover:from-slate-800 hover:to-teal-700 text-white rounded-xl text-sm font-bold transition active:scale-[0.98] disabled:opacity-50 shadow-sm cursor-pointer">
              {building ? 'جاري البناء...' : '✨ بناء بطاقة الأمان بالذكاء الاصطناعي'}
            </button>
            {buildError && <p className="text-xs text-rose-600 font-medium bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg mt-2">{buildError}</p>}
            {rejected && (
              <div className="mt-2 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2.5">
                <p className="text-xs font-bold text-rose-800">{rejected.reason}</p>
                {rejected.detail && <p className="text-[11px] text-rose-600 mt-1">{rejected.detail}</p>}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">النوع</label>
            <div className="grid grid-cols-2 gap-2">
              {PRODUCT_KINDS.map(k => (
                <button key={k} type="button" onClick={() => { setKind(k); if (!CATEGORIES_FOR_KIND[k].includes(category)) setCategory('uncategorized'); }}
                  className={`py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${kind === k ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                  {KIND_LABELS_AR[k]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">الفئة</label>
            <select value={category} onChange={e => isProductCategory(e.target.value) && setCategory(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900 transition text-slate-900">
              {availableCategories.map(c => <option key={c} value={c}>{CATEGORY_LABELS_AR[c]}</option>)}
            </select>
          </div>

          {/* ── ملخص بطاقة الأمان + التفاصيل المطوية ── */}
          {profile && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <SafetyProfileSummary profile={profile} />
              <details open className="border-t border-slate-100">
                <summary className="px-4 py-2.5 text-xs font-bold text-slate-600 cursor-pointer select-none">بطاقة الأمان ▾</summary>
                <div className="px-4 pb-4">
                  <SafetyProfileFields profile={profile} onChange={setProfile} />
                </div>
              </details>
              <label className="flex items-start gap-2 px-4 py-3 border-t border-slate-100 bg-slate-50 cursor-pointer select-none">
                <input type="checkbox" className="mt-0.5 accent-teal-700" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />
                <span className="text-xs font-bold text-slate-700">راجعتُ بطاقة الأمان بخبرتي وأعتمدها باسمي</span>
              </label>
            </div>
          )}

          {saveError && <p className="text-xs text-rose-600 font-medium bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">{saveError}</p>}
        </div>

        <div className="px-5 pb-5 pt-2 border-t border-slate-100 space-y-2 sticky bottom-0 bg-white">
          <button type="button" onClick={() => handleSave(true)} disabled={saving || !brandName.trim() || !!rejected || (!!profile && !reviewed)}
            className="w-full py-3 bg-gradient-to-l from-slate-900 to-teal-800 hover:from-slate-800 hover:to-teal-700 text-white rounded-xl text-sm font-bold transition active:scale-[0.98] disabled:opacity-50 shadow-sm cursor-pointer">
            {saving ? 'جاري الحفظ...' : profile ? 'تأكيد بطاقة الأمان وحفظ المنتج' : 'حفظ المنتج'}
          </button>
          {!profile && !rejected && (
            <button type="button" onClick={() => handleSave(false)} disabled={saving || !brandName.trim()}
              className="w-full py-2 bg-white border border-slate-200 text-slate-500 rounded-xl text-xs font-bold hover:bg-slate-50 transition cursor-pointer">
              حفظ بلا بطاقة أمان الآن — يظهر «بحاجة مراجعة» حتى تُبنى لاحقاً
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
