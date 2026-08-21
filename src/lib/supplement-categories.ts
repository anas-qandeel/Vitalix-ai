// قائمة مغلقة للفئات السريرية التي يسمح للذكاء الاصطناعي باقتراحها ضمن خطط
// التغذية — النموذج يرى الرموز فقط ولا يرى كتالوج الصيدلية ولا يسمّي منتجاً،
// المطابقة بمنتج فعلي تتم لاحقاً عبر استعلام حتمي على pharmacy_recommendations
// (راجع القرار المعماري الموثّق في docs/schema.sql).
export const SUPPLEMENT_CATEGORIES = [
  { code: 'b12',                  labelAr: 'فيتامين B12' },
  { code: 'omega3',               labelAr: 'أوميغا 3' },
  { code: 'fiber',                labelAr: 'ألياف غذائية' },
  { code: 'vitamin_d',            labelAr: 'فيتامين D' },
  { code: 'calcium',              labelAr: 'كالسيوم' },
  { code: 'magnesium_potassium',  labelAr: 'ماغنيسيوم وبوتاسيوم' },
  { code: 'protein',              labelAr: 'بروتين' },
  { code: 'sugar_substitute',     labelAr: 'بديل السكر الطبيعي' },
  { code: 'blood_sugar_support',  labelAr: 'دعم توازن سكر الدم' },
  { code: 'zinc_selenium',        labelAr: 'زنك وسيلينيوم' },
  { code: 'probiotic',            labelAr: 'بروبيوتيك' },
  { code: 'iron',                 labelAr: 'حديد' },
  { code: 'appetite_stimulant',   labelAr: 'فاتح شهية' },
  { code: 'satiety_aid',          labelAr: 'مساعد على الشبع' },
  { code: 'multivitamin',         labelAr: 'فيتامينات متعددة' },
] as const;

export type SupplementCategory = typeof SUPPLEMENT_CATEGORIES[number]['code'];

export function isValidCategory(code: string): code is SupplementCategory {
  return SUPPLEMENT_CATEGORIES.some(c => c.code === code);
}
