/**
 * تطبيع النص العربي للبحث — نسخة واحدة معتمدة.
 * تطابق دالة normalize_ar في القاعدة (ترحيل 20260823_02).
 * أي تعديل هنا يستوجب تعديلها هناك أيضاً.
 */
export function normalizeAr(s: string): string {
  return s.trim()
    .replace(/[أإآٱٲٳٵ]/g, 'ا')
    .replace(/[ءؤئ]/g, 'ء')
    .replace(/ة/g, 'ه')
    .replace(/[ىی]/g, 'ي')
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[ٓ-ٕ]/g, '')
    .toLowerCase();
}
