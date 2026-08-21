'use client';

import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

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

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
// حارس ضد الملفات الشاذة لا ضد صور المنتجات — الضغط بعد الرفع يتكفّل بتصغير
// صور الهواتف الحديثة (تتجاوز 5MB بسهولة) إلى ما دون الحد الفعلي المطلوب
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_COMPRESSED_BYTES = 2 * 1024 * 1024;

// حقل رفع صورة منتج/جهاز مشترك بين تبويبات الكتالوج — يتكفّل بالتحقق من النوع
// والحجم، الضغط قبل الرفع، الرفع إلى bucket واحد (catalog-images)، والمعاينة.
// رسالة الخطأ تُرفَع للأعلى عبر onError بدل أن يعرضها هذا المكوّن بنفسه، لأن
// النموذج الأب يعرضها ضمن نفس صندوق الخطأ المشترك مع أخطاء الحفظ الأخرى.
export default function ImageUploadField({ pharmacyId, value, onChange, onError }: {
  pharmacyId: string;
  value: string | null;
  onChange: (url: string | null) => void;
  onError: (message: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onError('');
    const ext = ALLOWED_IMAGE_TYPES[file.type];
    if (!ext) { onError('صيغة الصورة غير مدعومة — يُسمح فقط بـ JPG أو PNG أو WEBP'); return; }
    if (file.size > MAX_IMAGE_BYTES) { onError('حجم الصورة أكبر من الحد المسموح (20 ميغابايت)'); return; }
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
      onChange(publicUrl);
    } catch (e: any) { onError(e.message); }
    finally { setUploading(false); e.target.value = ''; }
  };

  return (
    <div className="flex items-center gap-3">
      {value ? (
        <div className="relative shrink-0">
          <img src={value} alt="" className="w-14 h-14 rounded-xl object-cover border border-slate-200" />
          <button type="button" onClick={() => onChange(null)}
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
          {uploading ? 'جاري الرفع...' : value ? 'تغيير الصورة' : 'رفع صورة'}
        </button>
        <p className="text-[10px] text-slate-400 mt-1">PNG / JPG · حد أقصى 20MB</p>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
    </div>
  );
}
