// ═══════════════════════════════════════════════════════════════════════
// مصدر واحد لأنواع وفئات كتالوج المنتجات — يستورده المسار والمكوّنات والشاشة
// كي لا يختلف اسم أو تصنيف بين مكان وآخر.
// ═══════════════════════════════════════════════════════════════════════

export const PRODUCT_KINDS = ['supplement', 'device', 'consumable', 'medical_food'] as const;
export type ProductKind = typeof PRODUCT_KINDS[number];

export const KIND_LABELS_AR: Record<ProductKind, string> = {
  supplement: 'مكمّل غذائي',
  device: 'جهاز',
  consumable: 'مستلزم',
  medical_food: 'غذاء طبي',
};

export const PRODUCT_CATEGORIES = [
  'b12', 'omega3', 'fiber', 'vitamin_d', 'calcium', 'magnesium_potassium', 'protein',
  'sugar_substitute', 'blood_sugar_support', 'zinc_selenium', 'probiotic', 'iron',
  'appetite_stimulant', 'satiety_aid', 'multivitamin',
  'sugar_device', 'sugar_strips', 'bp_device', 'weight_scale', 'uncategorized',
] as const;
export type ProductCategory = typeof PRODUCT_CATEGORIES[number];

export const CATEGORY_LABELS_AR: Record<ProductCategory, string> = {
  b12: 'فيتامين B12',
  omega3: 'أوميغا 3',
  fiber: 'ألياف غذائية',
  vitamin_d: 'فيتامين D',
  calcium: 'كالسيوم',
  magnesium_potassium: 'ماغنيسيوم وبوتاسيوم',
  protein: 'بروتين',
  sugar_substitute: 'بديل السكر الطبيعي',
  blood_sugar_support: 'دعم توازن سكر الدم',
  zinc_selenium: 'زنك وسيلينيوم',
  probiotic: 'بروبيوتيك',
  iron: 'حديد',
  appetite_stimulant: 'فاتح شهية',
  satiety_aid: 'مساعد على الشبع',
  multivitamin: 'فيتامينات متعددة',
  sugar_device: 'جهاز فحص السكري',
  sugar_strips: 'شرائط السكري',
  bp_device: 'جهاز قياس الضغط',
  weight_scale: 'ميزان وزن',
  uncategorized: 'غير مصنّف',
};

// فئات كل نوع — تُستخدم لتضييق قائمة الفئات المعروضة حسب النوع المختار
export const CATEGORIES_FOR_KIND: Record<ProductKind, ProductCategory[]> = {
  supplement: ['b12', 'omega3', 'fiber', 'vitamin_d', 'calcium', 'magnesium_potassium', 'protein',
               'sugar_substitute', 'blood_sugar_support', 'zinc_selenium', 'probiotic', 'iron',
               'appetite_stimulant', 'satiety_aid', 'multivitamin', 'uncategorized'],
  device: ['sugar_device', 'bp_device', 'weight_scale', 'uncategorized'],
  consumable: ['sugar_strips', 'uncategorized'],
  medical_food: ['blood_sugar_support', 'protein', 'fiber', 'iron', 'calcium', 'multivitamin', 'uncategorized'],
};

export function isProductKind(v: unknown): v is ProductKind {
  return typeof v === 'string' && (PRODUCT_KINDS as readonly string[]).includes(v);
}
export function isProductCategory(v: unknown): v is ProductCategory {
  return typeof v === 'string' && (PRODUCT_CATEGORIES as readonly string[]).includes(v);
}
