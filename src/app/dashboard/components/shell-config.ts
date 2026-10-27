// مفتاح القائمة الجانبية: يُقرأ من متغير البيئة NEXT_PUBLIC_USE_SIDEBAR وقت البناء (الصيغة حرفية كي يستبدلها Next.js).
// الافتراضي false = الهيدر العلوي الحالي. التجربة المحلية بتشغيل dev بالمتغير دون تعديل أي ملف،
// فلا خطر حفظ true في commit، والدمج في main لا يفعّل شيئاً في الإنتاج ما لم يُضبط المتغير هناك.
export const USE_SIDEBAR = process.env.NEXT_PUBLIC_USE_SIDEBAR === 'true';
