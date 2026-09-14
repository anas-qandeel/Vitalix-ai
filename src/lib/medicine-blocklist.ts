import { normalizeAr } from '@/lib/arabic';

// ═══════════════════════════════════════════════════════════════════════
// حارس حتمي ضد إدخال الأدوية في كتالوج الصيدلية.
// مبدأ المنصة: لا اقتراح أدوية ولا علاج ولا تشخيص — الكتالوج للمنتجات الداعمة فقط.
// يعمل قبل وبعد حكم الذكاء الاصطناعي: أي مطابقة هنا = رفض، مهما قال النموذج.
// القائمة يملكها صيدلاني ويوسّعها بأسماء السوق المحلي.
// ═══════════════════════════════════════════════════════════════════════

// مواد فعالة (أسماء علمية) — لاتيني، تُطابَق على حدود الكلمة
const GENERIC_ACTIVES: string[] = [
  // مسكنات ومضادات التهاب
  'paracetamol', 'acetaminophen', 'ibuprofen', 'diclofenac', 'naproxen', 'aspirin', 'acetylsalicylic',
  'mefenamic', 'ketoprofen', 'celecoxib', 'tramadol', 'codeine',
  // مضادات هيستامين واحتقان
  'cetirizine', 'loratadine', 'desloratadine', 'fexofenadine', 'chlorpheniramine', 'diphenhydramine',
  'pseudoephedrine', 'phenylephrine',
  // جهاز هضمي
  'omeprazole', 'esomeprazole', 'pantoprazole', 'lansoprazole', 'ranitidine', 'famotidine',
  'loperamide', 'domperidone', 'metoclopramide', 'ondansetron', 'bisacodyl', 'mebeverine', 'hyoscine',
  // مضادات حيوية وفطريات وطفيليات
  'amoxicillin', 'clavulanate', 'azithromycin', 'clarithromycin', 'ciprofloxacin', 'levofloxacin',
  'metronidazole', 'cefixime', 'cefuroxime', 'doxycycline', 'nitrofurantoin', 'fluconazole',
  'terbinafine', 'clotrimazole', 'nystatin', 'ivermectin', 'albendazole', 'mebendazole', 'acyclovir',
  // قلب وضغط ودهون (تشمل جدول الأدوية المزمنة)
  'amlodipine', 'lisinopril', 'enalapril', 'ramipril', 'losartan', 'valsartan', 'candesartan',
  'bisoprolol', 'atenolol', 'metoprolol', 'carvedilol', 'hydrochlorothiazide', 'furosemide',
  'spironolactone', 'indapamide', 'atorvastatin', 'rosuvastatin', 'simvastatin', 'ezetimibe',
  'warfarin', 'clopidogrel', 'rivaroxaban', 'apixaban', 'digoxin', 'nitroglycerin', 'isosorbide',
  // سكري
  'metformin', 'gliclazide', 'glimepiride', 'glibenclamide', 'sitagliptin', 'vildagliptin',
  'linagliptin', 'empagliflozin', 'dapagliflozin', 'pioglitazone', 'insulin', 'liraglutide',
  'semaglutide', 'tirzepatide', 'dulaglutide',
  // وزن
  'orlistat', 'sibutramine', 'phentermine', 'lorcaserin', 'naltrexone', 'bupropion', 'topiramate',
  // غدد وهرمونات وستيرويدات
  'levothyroxine', 'carbimazole', 'methimazole', 'prednisolone', 'prednisone', 'dexamethasone',
  'hydrocortisone', 'betamethasone', 'estradiol', 'progesterone', 'testosterone', 'letrozole',
  // تنفسي وحساسية
  'salbutamol', 'budesonide', 'fluticasone', 'montelukast', 'theophylline',
  // أعصاب ونفسية
  'diazepam', 'alprazolam', 'clonazepam', 'zolpidem', 'sertraline', 'fluoxetine', 'escitalopram',
  'amitriptyline', 'gabapentin', 'pregabalin', 'carbamazepine', 'valproate', 'levetiracetam',
  // جلدية وأخرى
  'minoxidil', 'finasteride', 'hydroquinone', 'isotretinoin', 'tretinoin', 'sildenafil', 'tadalafil',
  'nicotine', 'allopurinol', 'colchicine', 'tamsulosin', 'oxybutynin',
];

// أسماء تجارية شائعة في الأردن (لاتيني وعربي) — الاحتواء بعد التطبيع
const BRAND_NAMES: string[] = [
  'panadol', 'بانادول', 'adol', 'ادول', 'revanin', 'ريفانين', 'cetal', 'سيتال', 'brufen', 'بروفين',
  'voltaren', 'فولتارين', 'cataflam', 'كاتافلام', 'olfen', 'اولفين', 'augmentin', 'اوغمنتين',
  'zithromax', 'زيثروماكس', 'flagyl', 'فلاجيل', 'nexium', 'نيكسيوم', 'losec', 'لوسيك',
  'glucophage', 'غلوكوفاج', 'جلوكوفاج', 'amlor', 'املور', 'norvasc', 'نورفاسك', 'concor', 'كونكور',
  'diovan', 'دايفان', 'ديوفان', 'co-diovan', 'crestor', 'كريستور', 'lipitor', 'ليبيتور',
  'januvia', 'جانوفيا', 'galvus', 'غالفس', 'جالفس', 'jardiance', 'جارديانس', 'ozempic', 'اوزمبيك',
  'saxenda', 'ساكسندا', 'wegovy', 'mounjaro', 'مونجارو', 'xenical', 'زينيكال', 'orlistat', 'refit',
  'euthyrox', 'يوثيروكس', 'ventolin', 'فنتولين', 'zyrtec', 'زيرتك', 'claritine', 'كلاريتين',
  'telfast', 'تلفاست', 'imodium', 'ايموديوم', 'motilium', 'موتيليوم', 'buscopan', 'بوسكوبان',
  'viagra', 'فياجرا', 'cialis', 'سياليس', 'lasix', 'لازكس', 'aspocid', 'اسبوسيد', 'plavix', 'بلافيكس',
];

export interface MedicineCheck { blocked: boolean; matched: string[] }

/** يفحص اسم المنتج ومكوناته ضد القائمتين — أي مطابقة = دواء */
export function looksLikeMedicine(brandName: string, ingredients: string[] = []): MedicineCheck {
  const matched = new Set<string>();
  const texts = [brandName, ...ingredients].map(t => normalizeAr(String(t ?? '')));
  for (const text of texts) {
    if (!text) continue;
    for (const g of GENERIC_ACTIVES) {
      if (new RegExp(`(^|[^a-z])${g}([^a-z]|$)`, 'i').test(text)) matched.add(g);
    }
    for (const b of BRAND_NAMES) {
      const nb = normalizeAr(b);
      if (nb.length >= 4 && text.includes(nb)) matched.add(b);
    }
  }
  return { blocked: matched.size > 0, matched: [...matched] };
}
