import { normalizeAr } from '@/lib/arabic';
import { supabaseAdmin } from '@/lib/supabase-admin';

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

type Blocklist = { generics: string[]; brands: string[] };

// ── مصدر القائمة: جدول medicine_blocklist (يملكه مالك المنصة) مع ذاكرة 5 دقائق؛
//    القائمتان المكتوبتان أعلاه احتياط فقط إن تعذّرت القراءة.
const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { list: Blocklist; at: number } | null = null;

async function loadBlocklist(): Promise<Blocklist> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.list;
  try {
    const { data, error } = await supabaseAdmin
      .from('medicine_blocklist')
      .select('term, term_type')
      .eq('is_active', true);
    if (error || !data || data.length === 0) throw error ?? new Error('empty blocklist');
    const list: Blocklist = {
      generics: data.filter(r => r.term_type === 'generic').map(r => String(r.term)),
      brands:   data.filter(r => r.term_type === 'brand').map(r => String(r.term)),
    };
    cached = { list, at: Date.now() };
    return list;
  } catch (e) {
    console.error('[medicine-blocklist] fallback to built-in list:', e);
    return { generics: GENERIC_ACTIVES, brands: BRAND_NAMES };
  }
}

/** المطابقة الحتمية ضد قائمة معطاة — نفس قاعدة الـtrigger في القاعدة */
function matchAgainst(list: Blocklist, brandName: string, ingredients: string[]): MedicineCheck {
  const matched = new Set<string>();
  const texts = [brandName, ...ingredients].map(t => normalizeAr(String(t ?? '')));
  for (const text of texts) {
    if (!text) continue;
    for (const g of list.generics) {
      if (new RegExp(`(^|[^a-z])${g}([^a-z]|$)`, 'i').test(text)) matched.add(g);
    }
    for (const b of list.brands) {
      const nb = normalizeAr(b);
      if (nb.length >= 4 && text.includes(nb)) matched.add(b);
    }
  }
  return { blocked: matched.size > 0, matched: [...matched] };
}

/** يفحص اسم المنتج ومكوناته ضد قائمة الجدول — أي مطابقة = دواء */
export async function looksLikeMedicine(brandName: string, ingredients: string[] = []): Promise<MedicineCheck> {
  return matchAgainst(await loadBlocklist(), brandName, ingredients);
}

/** نسخة متزامنة بالقائمة المكتوبة — للاختبارات الحتمية فقط */
export function looksLikeMedicineSync(brandName: string, ingredients: string[] = []): MedicineCheck {
  return matchAgainst({ generics: GENERIC_ACTIVES, brands: BRAND_NAMES }, brandName, ingredients);
}
