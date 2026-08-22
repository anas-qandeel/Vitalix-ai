/**
 * جدول التفاعلات الدوائية الغذائية — Vitalix.ai
 *
 * الغرض: إخراج التحذيرات الدوائية من يد النموذج اللغوي إلى استعلام حتمي،
 * على نفس مبدأ pharmacy_recommendations (راجع docs/schema.sql).
 * النموذج لا يخترع تفاعلاً — يقرأ ما يطابق أدوية المريض من هذا الجدول.
 *
 * سبب البناء: النموذج أنتج «يُمنع تناول الجريب فروت مع كريستور» — تعميم
 * خاطئ لقاعدة الستاتينات على روسوفاستاتين الذي لا يُستقلَب عبر CYP3A4.
 * الخطأ لم يكن هلوسة بل تطبيق قاعدة صنفية على عضو استثنائي فيها، وهو
 * نمط لا يمسكه أي تحقق من تفسير أسماء الأدوية.
 *
 * ⚠️ يحتاج توقيعاً صيدلانياً قبل الإنتاج. ليس تهرّباً من المسؤولية:
 * أنس هو الصيدلاني المرخّص والمسؤول قانونياً عن مخرجات المنصة أمام
 * قانون 24/2023 وإطار JFDA. المراجعة هنا مرور تدقيق على محتوى جاهز،
 * لا كتابة من الصفر. راجع خصوصاً: الأسماء التجارية الأردنية (قد تتغيّر
 * أو تختلف عن السوق المحلي)، ودرجات الخطورة، والصياغة الموجّهة للمريض.
 */

import type { SupplementCategory } from './supplement-categories';
import type { DrugClass } from './drug-classes';

// ═══════════════════════════════════════════════════════════════
// الأنواع
// ═══════════════════════════════════════════════════════════════

/** درجة الخطورة — تحدّد الصياغة ومدى الإلحاح */
export type InteractionSeverity =
  | 'critical'   // خطر فوري محتمل — يُذكر دائماً وبوضوح
  | 'important'  // يؤثر على فعالية الدواء أو يسبب نقصاً تراكمياً
  | 'minor';     // يستحق الذكر عند الملاءمة فقط

export interface FoodInteraction {
  /** الطعام أو المكوّن المعني */
  item: string;
  /** الآلية — سبب وجود هذا التفاعل. مطلوب: لا تفاعل بلا آلية معروفة */
  mechanism: string;
  severity: InteractionSeverity;
  /** الصياغة المعتمدة للمريض — تُستعمل كما هي أو يُعاد صوغها بلا تغيير المعنى */
  patientText: string;
}

export interface DrugEntry {
  /** الاسم العلمي بالإنجليزية — مفتاح المطابقة الأساسي */
  generic: string;
  /** الاسم العلمي بالعربية */
  genericAr: string;
  /** أسماء تجارية شائعة في الأردن — للمطابقة مع ما يدخله الصيدلاني */
  brands: string[];
  /** الصنف الدوائي */
  drugClass: string;
  /** رمز الصنف — مفتاح المطابقة للقواعد الصنفية. drugClass أعلاه للعرض فقط */
  classCode: DrugClass;
  /** ملاحظة استقلابية تفسّر التفاعلات — تمنع التعميم الخاطئ على الصنف */
  metabolismNote?: string;
  /** توقيت التناول إن كان مهماً */
  timing?: string;
  /** التفاعلات الغذائية */
  foods: FoodInteraction[];
  /** عناصر يستنزفها الدواء — تُربط بفئات المكملات */
  depletes?: SupplementCategory[];
  /** فئات مكملات يجب الحذر منها مع هذا الدواء */
  avoidSupplements?: SupplementCategory[];
}

// ═══════════════════════════════════════════════════════════════
// الجدول
// ═══════════════════════════════════════════════════════════════

export const DRUG_FOOD_INTERACTIONS: DrugEntry[] = [

  // ─────────────── السكري ───────────────
  {
    generic: 'metformin',
    genericAr: 'ميتفورمين',
    brands: ['Glucophage', 'غلوكوفاج', 'Cidophage', 'Galvus Met', 'غالفوس ميت', 'Janumet', 'جانوميت', 'Xigduo'],
    drugClass: 'بيغوانيد — خافض سكر',
    classCode: 'BIGUANIDE',
    timing: 'مع الطعام أو بعده مباشرة لتقليل الاضطراب الهضمي',
    foods: [
      {
        item: 'الكحول',
        mechanism: 'يزيد خطر الحُماض اللبني ويطيل تأثير خفض السكر',
        severity: 'critical',
        patientText: 'تجنّب الكحول تماماً مع هذا الدواء.',
      },
      {
        item: 'وجبة على معدة فارغة',
        mechanism: 'تناول الدواء بلا طعام يزيد الغثيان والإسهال',
        severity: 'minor',
        patientText: 'تناوله مع الطعام أو بعده مباشرة ليقلّ الانزعاج الهضمي.',
      },
    ],
    depletes: ['b12'],
  },
  {
    generic: 'gliclazide',
    genericAr: 'غليكلازيد',
    brands: ['Diamicron', 'دياميكرون'],
    drugClass: 'سلفونيل يوريا — خافض سكر',
    classCode: 'SULFONYLUREA',
    timing: 'مع وجبة الإفطار',
    foods: [
      {
        item: 'تخطّي الوجبات أو تأخيرها',
        mechanism: 'الدواء يحفّز إفراز الأنسولين بغضّ النظر عن مستوى السكر، فتخطّي الوجبة يسبب هبوطاً حاداً',
        severity: 'critical',
        patientText: 'لا تتخطَّ أي وجبة ولا تؤخّرها كثيراً — انتظام الوجبات ضروري مع هذا الدواء.',
      },
      {
        item: 'الكحول',
        mechanism: 'يعزّز هبوط السكر ويخفي أعراضه',
        severity: 'critical',
        patientText: 'تجنّب الكحول — يزيد خطر هبوط السكر.',
      },
    ],
  },
  {
    generic: 'glimepiride',
    genericAr: 'غليميبيريد',
    brands: ['Amaryl', 'أماريل'],
    drugClass: 'سلفونيل يوريا — خافض سكر',
    classCode: 'SULFONYLUREA',
    timing: 'مع أول وجبة رئيسية في اليوم',
    foods: [
      {
        item: 'تخطّي الوجبات',
        mechanism: 'تحفيز إفراز الأنسولين مستقل عن مستوى السكر',
        severity: 'critical',
        patientText: 'لا تتناوله دون وجبة — خطر هبوط السكر مرتفع.',
      },
    ],
  },
  {
    generic: 'vildagliptin',
    genericAr: 'فيلداغليبتين',
    brands: ['Galvus', 'غالفوس', 'Galvus Met', 'غالفوس ميت'],
    drugClass: 'مثبط DPP-4 — خافض سكر',
    classCode: 'DPP4_INHIBITOR',
    timing: 'مع الطعام أو بدونه؛ في التركيبة مع ميتفورمين يُفضّل مع الطعام',
    foods: [],
  },
  {
    generic: 'sitagliptin',
    genericAr: 'سيتاغليبتين',
    brands: ['Januvia', 'جانوفيا', 'Janumet', 'جانوميت'],
    drugClass: 'مثبط DPP-4 — خافض سكر',
    classCode: 'DPP4_INHIBITOR',
    foods: [],
  },
  {
    generic: 'empagliflozin',
    genericAr: 'إمباغليفلوزين',
    brands: ['Jardiance', 'جارديانس', 'Synjardy'],
    drugClass: 'مثبط SGLT2 — خافض سكر',
    classCode: 'SGLT2_INHIBITOR',
    foods: [
      {
        item: 'قلّة شرب الماء',
        mechanism: 'الدواء يطرح السكر في البول فيزيد إدرار البول وخطر الجفاف والالتهابات البولية',
        severity: 'important',
        patientText: 'احرص على شرب ماء كافٍ طوال اليوم مع هذا الدواء.',
      },
    ],
  },
  {
    generic: 'dapagliflozin',
    genericAr: 'داباغليفلوزين',
    brands: ['Forxiga', 'فورشيغا', 'Xigduo'],
    drugClass: 'مثبط SGLT2 — خافض سكر',
    classCode: 'SGLT2_INHIBITOR',
    foods: [
      {
        item: 'قلّة شرب الماء',
        mechanism: 'زيادة طرح السكر في البول ترفع خطر الجفاف والالتهابات البولية',
        severity: 'important',
        patientText: 'اشرب ماءً كافياً يومياً مع هذا الدواء.',
      },
    ],
  },

  // ─────────────── الضغط ───────────────
  {
    generic: 'lisinopril',
    genericAr: 'ليزينوبريل',
    brands: ['Zestril', 'زيستريل', 'Lisinopril'],
    drugClass: 'مثبط الإنزيم المحوّل للأنجيوتنسين (ACE)',
    classCode: 'ACE_INHIBITOR',
    metabolismNote: 'يقلّل طرح البوتاسيوم عبر الكلى',
    foods: [
      {
        item: 'بدائل الملح المحتوية على البوتاسيوم',
        mechanism: 'الدواء يحبس البوتاسيوم، وبدائل الملح تستبدل الصوديوم ببوتاسيوم فيتراكم ويسبب اضطراب نظم القلب',
        severity: 'critical',
        patientText: 'تجنّب بدائل الملح المحتوية على البوتاسيوم تماماً مع هذا الدواء.',
      },
      {
        item: 'الإفراط الشديد في مصادر البوتاسيوم',
        mechanism: 'الطعام الطبيعي آمن بكميات معتادة؛ الخطر من الإفراط غير المعتاد أو المكملات',
        severity: 'minor',
        patientText: 'الفواكه والخضار بكميات معتادة آمنة — تجنّب فقط الإفراط غير المعتاد أو مكملات البوتاسيوم بلا استشارة.',
      },
    ],
    avoidSupplements: ['magnesium_potassium'],
  },
  {
    generic: 'enalapril',
    genericAr: 'إنالابريل',
    brands: ['Angiotec', 'أنجيوتيك', 'Renitec', 'Enalapril'],
    drugClass: 'مثبط ACE',
    classCode: 'ACE_INHIBITOR',
    metabolismNote: 'يقلّل طرح البوتاسيوم عبر الكلى',
    foods: [
      {
        item: 'بدائل الملح المحتوية على البوتاسيوم',
        mechanism: 'حبس البوتاسيوم مع مصدر مركّز منه يؤدي إلى فرط بوتاسيوم الدم',
        severity: 'critical',
        patientText: 'تجنّب بدائل الملح المحتوية على البوتاسيوم مع هذا الدواء.',
      },
    ],
    avoidSupplements: ['magnesium_potassium'],
  },
  {
    generic: 'losartan',
    genericAr: 'لوسارتان',
    brands: ['Cozaar', 'كوزار', 'Losartan'],
    drugClass: 'حاصر مستقبلات الأنجيوتنسين (ARB)',
    classCode: 'ARB',
    metabolismNote: 'يقلّل طرح البوتاسيوم — نفس تحذير مثبطات ACE',
    foods: [
      {
        item: 'بدائل الملح المحتوية على البوتاسيوم',
        mechanism: 'حبس البوتاسيوم مع مصدر مركّز منه',
        severity: 'critical',
        patientText: 'تجنّب بدائل الملح المحتوية على البوتاسيوم.',
      },
    ],
    avoidSupplements: ['magnesium_potassium'],
  },
  {
    generic: 'valsartan',
    genericAr: 'فالسارتان',
    brands: ['Diovan', 'ديوفان', 'Exforge'],
    drugClass: 'حاصر مستقبلات الأنجيوتنسين (ARB)',
    classCode: 'ARB',
    foods: [
      {
        item: 'بدائل الملح المحتوية على البوتاسيوم',
        mechanism: 'حبس البوتاسيوم مع مصدر مركّز منه',
        severity: 'critical',
        patientText: 'تجنّب بدائل الملح المحتوية على البوتاسيوم.',
      },
    ],
    avoidSupplements: ['magnesium_potassium'],
  },
  {
    generic: 'olmesartan',
    genericAr: 'أولميسارتان',
    brands: ['Olmetec', 'أولميتك', 'Olmetran', 'Benicar'],
    drugClass: 'حاصر مستقبلات الأنجيوتنسين (ARB)',
    classCode: 'ARB',
    foods: [
      {
        item: 'بدائل الملح المحتوية على البوتاسيوم',
        mechanism: 'حبس البوتاسيوم مع مصدر مركّز منه',
        severity: 'critical',
        patientText: 'تجنّب بدائل الملح المحتوية على البوتاسيوم.',
      },
    ],
    avoidSupplements: ['magnesium_potassium'],
  },
  {
    generic: 'amlodipine',
    genericAr: 'أملوديبين',
    brands: ['Norvasc', 'نورفاسك', 'Amlor', 'Exforge'],
    drugClass: 'حاصر قنوات الكالسيوم',
    classCode: 'CCB',
    metabolismNote: 'يُستقلَب عبر CYP3A4 — تأثير الجريب فروت عليه موجود لكنه أقل وضوحاً من أدوية أخرى بنفس المسار',
    foods: [
      {
        item: 'الجريب فروت',
        mechanism: 'يثبّط CYP3A4 فيرفع تركيز الدواء وقد يزيد انخفاض الضغط والدوخة',
        severity: 'minor',
        patientText: 'قلّل الجريب فروت وعصيره مع هذا الدواء، وناقش الأمر مع صيدلانيك.',
      },
    ],
  },
  {
    generic: 'bisoprolol',
    genericAr: 'بيسوبرولول',
    brands: ['Concor', 'كونكور', 'Bisoprolol'],
    drugClass: 'حاصر بيتا',
    classCode: 'BETA_BLOCKER',
    foods: [
      {
        item: 'تخطّي الوجبات لدى مرضى السكري',
        mechanism: 'حاصرات بيتا تخفي أعراض هبوط السكر (الرجفة وتسارع النبض) فقد يتأخر انتباه المريض',
        severity: 'important',
        patientText: 'إن كنت مصاباً بالسكري، حافظ على انتظام وجباتك — هذا الدواء قد يخفي أعراض هبوط السكر.',
      },
    ],
  },
  {
    generic: 'atenolol',
    genericAr: 'أتينولول',
    brands: ['Tenormin', 'تينورمين', 'Atenolol'],
    drugClass: 'حاصر بيتا',
    classCode: 'BETA_BLOCKER',
    timing: 'يُفضّل ثبات العلاقة بالطعام — الطعام يقلّل امتصاصه قليلاً',
    foods: [
      {
        item: 'تخطّي الوجبات لدى مرضى السكري',
        mechanism: 'إخفاء أعراض هبوط السكر',
        severity: 'important',
        patientText: 'حافظ على انتظام وجباتك إن كنت مصاباً بالسكري.',
      },
    ],
  },
  {
    generic: 'hydrochlorothiazide',
    genericAr: 'هيدروكلوروثيازيد',
    brands: ['Hydrochlorothiazide', 'Co-Diovan', 'Co-Approvel', 'Exforge HCT'],
    drugClass: 'مدر بول ثيازيدي',
    classCode: 'THIAZIDE_DIURETIC',
    metabolismNote: 'يزيد طرح البوتاسيوم والماغنيسيوم، ويقلّل طرح الكالسيوم وحمض اليوريك',
    foods: [
      {
        item: 'الإفراط في الأطعمة الغنية بالبيورينات',
        mechanism: 'الدواء يقلّل طرح حمض اليوريك فقد يحفّز النقرس',
        severity: 'minor',
        patientText: 'قلّل اللحوم الحمراء والمشروبات المحلّاة إن كنت عرضة للنقرس.',
      },
    ],
    depletes: ['magnesium_potassium'],
  },
  {
    generic: 'indapamide',
    genericAr: 'إنداباميد',
    brands: ['Natrilix', 'ناتريليكس', 'Indapamide'],
    drugClass: 'مدر بول شبيه بالثيازيد',
    classCode: 'THIAZIDE_DIURETIC',
    foods: [],
    depletes: ['magnesium_potassium'],
  },
  {
    generic: 'furosemide',
    genericAr: 'فوروسيميد',
    brands: ['Lasix', 'لازكس', 'Furosemide'],
    drugClass: 'مدر بول عروي',
    classCode: 'LOOP_DIURETIC',
    metabolismNote: 'يزيد طرح البوتاسيوم والماغنيسيوم والكالسيوم',
    foods: [
      {
        item: 'قلّة السوائل',
        mechanism: 'إدرار قوي مع قلّة شرب يزيد خطر الجفاف واختلال الأملاح',
        severity: 'important',
        patientText: 'اتبع إرشادات طبيبك بخصوص كمية السوائل مع هذا الدواء.',
      },
    ],
    depletes: ['magnesium_potassium'],
  },
  {
    generic: 'spironolactone',
    genericAr: 'سبيرونولاكتون',
    brands: ['Aldactone', 'ألداكتون', 'Spironolactone'],
    drugClass: 'مدر بول حافظ للبوتاسيوم',
    classCode: 'MRA',
    metabolismNote: 'عكس المدرّات الأخرى — يحبس البوتاسيوم ولا يطرحه. لا يُعامَل معاملة الثيازيدات',
    foods: [
      {
        item: 'بدائل الملح المحتوية على البوتاسيوم',
        mechanism: 'الدواء يحبس البوتاسيوم أصلاً، فمصدر مركّز إضافي يسبب فرط بوتاسيوم خطر',
        severity: 'critical',
        patientText: 'تجنّب بدائل الملح المحتوية على البوتاسيوم تماماً مع هذا الدواء.',
      },
    ],
    avoidSupplements: ['magnesium_potassium'],
  },

  // ─────────────── الدهون ───────────────
  {
    generic: 'simvastatin',
    genericAr: 'سيمفاستاتين',
    brands: ['Zocor', 'زوكور', 'Simvastatin'],
    drugClass: 'ستاتين — خافض كوليسترول',
    classCode: 'STATIN',
    metabolismNote: 'يُستقلَب عبر CYP3A4 — الأكثر تأثراً بالجريب فروت بين الستاتينات',
    timing: 'مساءً',
    foods: [
      {
        item: 'الجريب فروت وعصيره',
        mechanism: 'يثبّط CYP3A4 فيرتفع تركيز الدواء ويزداد خطر الألم العضلي واعتلال العضلات',
        severity: 'critical',
        patientText: 'تجنّب الجريب فروت وعصيره مع هذا الدواء.',
      },
    ],
  },
  {
    generic: 'atorvastatin',
    genericAr: 'أتورفاستاتين',
    brands: ['Lipitor', 'ليبيتور', 'Atorva', 'Atorvastatin'],
    drugClass: 'ستاتين — خافض كوليسترول',
    classCode: 'STATIN',
    metabolismNote: 'يُستقلَب عبر CYP3A4 — يتأثر بالجريب فروت لكن بدرجة أقل من سيمفاستاتين',
    foods: [
      {
        item: 'الجريب فروت وعصيره',
        mechanism: 'تثبيط CYP3A4 يرفع تركيز الدواء',
        severity: 'important',
        patientText: 'قلّل الجريب فروت وعصيره مع هذا الدواء، وناقش الأمر مع صيدلانيك.',
      },
    ],
  },
  {
    generic: 'rosuvastatin',
    genericAr: 'روسوفاستاتين',
    brands: ['Crestor', 'كريستور', 'Rosuvastatin', 'Rosutec'],
    drugClass: 'ستاتين — خافض كوليسترول',
    classCode: 'STATIN',
    metabolismNote: '⚠️ لا يُستقلَب عبر CYP3A4 — لا يتفاعل مع الجريب فروت. لا تعمّم عليه قاعدة الستاتينات.',
    foods: [],
  },
  {
    generic: 'pravastatin',
    genericAr: 'برافاستاتين',
    brands: ['Pravachol', 'Pravastatin'],
    drugClass: 'ستاتين — خافض كوليسترول',
    classCode: 'STATIN',
    metabolismNote: '⚠️ لا يُستقلَب عبر CYP3A4 — لا يتفاعل مع الجريب فروت.',
    foods: [],
  },
  {
    generic: 'fenofibrate',
    genericAr: 'فينوفيبرات',
    brands: ['Lipanthyl', 'ليبانثيل', 'Fenofibrate'],
    drugClass: 'فيبرات — خافض دهون ثلاثية',
    classCode: 'FIBRATE',
    timing: 'مع الطعام — الامتصاص يتحسّن كثيراً مع وجبة',
    foods: [
      {
        item: 'تناوله على معدة فارغة',
        mechanism: 'امتصاص الدواء يعتمد على وجود الدهون في الوجبة',
        severity: 'important',
        patientText: 'تناوله مع وجبة رئيسية ليعمل بفعالية.',
      },
    ],
  },

  // ─────────────── التخثر ───────────────
  {
    generic: 'warfarin',
    genericAr: 'وارفارين',
    brands: ['Coumadin', 'كومادين', 'Marevan', 'Warfarin'],
    drugClass: 'مضاد تخثر — مضاد لفيتامين ك',
    classCode: 'VKA_ANTICOAGULANT',
    metabolismNote: 'يعمل بمعاكسة فيتامين ك؛ المطلوب ثبات المدخول لا منعه',
    foods: [
      {
        item: 'الخضار الورقية الغنية بفيتامين ك (سبانخ، ملفوف، بروكلي، بقدونس)',
        mechanism: 'فيتامين ك يعاكس عمل الدواء؛ التذبذب في الكمية — صعوداً أو هبوطاً — يزعزع استقرار التخثر',
        severity: 'critical',
        patientText: 'لا تمتنع عن الخضار الورقية، لكن حافظ على كمية ثابتة تقريباً كل أسبوع، ولا تغيّرها فجأة.',
      },
      {
        item: 'عصير التوت البري (كرانبيري)',
        mechanism: 'قد يزيد تأثير الدواء ويرفع خطر النزف',
        severity: 'important',
        patientText: 'تجنّب عصير التوت البري بكميات كبيرة.',
      },
      {
        item: 'مكملات الثوم والزنجبيل وفيتامين هـ بجرعات عالية',
        mechanism: 'تأثير إضافي مضاد للتخثر يرفع خطر النزف',
        severity: 'important',
        patientText: 'لا تبدأ أي مكمل عشبي أو فيتامين بجرعة عالية دون سؤال صيدلانيك.',
      },
    ],
    avoidSupplements: ['omega3'],
  },
  {
    generic: 'rivaroxaban',
    genericAr: 'ريفاروكسابان',
    brands: ['Xarelto', 'زاريلتو'],
    drugClass: 'مضاد تخثر فموي مباشر',
    classCode: 'DOAC',
    timing: 'جرعات 15 و20 ملغ تُؤخذ مع الطعام إلزامياً',
    foods: [
      {
        item: 'تناوله على معدة فارغة (جرعات 15 و20 ملغ)',
        mechanism: 'الامتصاص ينخفض بشكل ملحوظ بلا طعام فتقلّ الحماية من الجلطات',
        severity: 'critical',
        patientText: 'تناول هذا الدواء مع وجبة رئيسية دائماً — لا تأخذه على معدة فارغة.',
      },
    ],
  },
  {
    generic: 'clopidogrel',
    genericAr: 'كلوبيدوغريل',
    brands: ['Plavix', 'بلافكس', 'Clopidogrel'],
    drugClass: 'مضاد صفيحات',
    classCode: 'ANTIPLATELET',
    metabolismNote: 'يحتاج تفعيلاً عبر CYP2C19؛ بعض مثبطات مضخة البروتون تعيق هذا التفعيل',
    foods: [
      {
        item: 'عصير الجريب فروت',
        mechanism: 'قد يقلّل تفعيل الدواء فتضعف فعاليته',
        severity: 'important',
        patientText: 'تجنّب عصير الجريب فروت مع هذا الدواء.',
      },
    ],
  },

  // ─────────────── الغدة الدرقية ───────────────
  {
    generic: 'levothyroxine',
    genericAr: 'ليفوثيروكسين',
    brands: ['Eltroxin', 'إلتروكسين', 'Euthyrox', 'يوثيروكس', 'Levothyrox'],
    drugClass: 'هرمون درقي بديل',
    classCode: 'THYROID_HORMONE',
    metabolismNote: 'امتصاصه حساس جداً للطعام وللمعادن الثنائية التكافؤ',
    timing: 'على معدة فارغة صباحاً، قبل الإفطار بـ30 إلى 60 دقيقة',
    foods: [
      {
        item: 'القهوة',
        mechanism: 'تقلّل امتصاص الدواء بشكل ملحوظ إن تزامنت معه',
        severity: 'important',
        patientText: 'أخّر قهوة الصباح نصف ساعة على الأقل بعد تناول الدواء.',
      },
      {
        item: 'الكالسيوم والحديد (أطعمة أو مكملات)',
        mechanism: 'ترتبط بالدواء في الأمعاء وتمنع امتصاصه',
        severity: 'critical',
        patientText: 'افصل بين الدواء وأي مصدر للكالسيوم أو الحديد بأربع ساعات على الأقل.',
      },
      {
        item: 'فول الصويا ومنتجاتها',
        mechanism: 'تقلّل امتصاص الهرمون',
        severity: 'important',
        patientText: 'افصل منتجات الصويا عن موعد الدواء بأربع ساعات.',
      },
      {
        item: 'الألياف بكميات كبيرة مع موعد الدواء',
        mechanism: 'تبطئ وتقلّل الامتصاص',
        severity: 'minor',
        patientText: 'تناول وجبتك الغنية بالألياف بعد الدواء بساعة على الأقل.',
      },
    ],
    avoidSupplements: ['calcium', 'iron', 'fiber'],
  },

  // ─────────────── الجهاز الهضمي ───────────────
  {
    generic: 'omeprazole',
    genericAr: 'أوميبرازول',
    brands: ['Losec', 'لوزيك', 'Omeprazole', 'Risek'],
    drugClass: 'مثبط مضخة البروتون',
    classCode: 'PPI',
    metabolismNote: 'تقليل حموضة المعدة يعيق امتصاص عناصر تحتاج وسطاً حمضياً',
    timing: 'قبل الوجبة بـ30 إلى 60 دقيقة',
    foods: [
      {
        item: 'تناوله بعد الوجبة',
        mechanism: 'الدواء يحتاج أن يسبق الوجبة ليثبّط المضخات وهي نشطة',
        severity: 'important',
        patientText: 'تناوله قبل الوجبة بنصف ساعة لتحصل على أفضل فائدة.',
      },
    ],
    depletes: ['b12', 'magnesium_potassium', 'calcium', 'iron'],
  },
  {
    generic: 'rabeprazole',
    genericAr: 'رابيبرازول',
    brands: ['Pariet', 'باريت', 'Rabeprazole'],
    drugClass: 'مثبط مضخة البروتون',
    classCode: 'PPI',
    metabolismNote: 'نفس آلية الصنف — تقليل الحموضة يعيق امتصاص B12 والماغنيسيوم والحديد على المدى الطويل',
    timing: 'قبل الوجبة بـ30 دقيقة',
    foods: [
      {
        item: 'تناوله بعد الوجبة',
        mechanism: 'فعاليته أعلى حين يسبق الوجبة',
        severity: 'important',
        patientText: 'تناوله قبل الإفطار بنصف ساعة.',
      },
    ],
    depletes: ['b12', 'magnesium_potassium', 'calcium', 'iron'],
  },
  {
    generic: 'esomeprazole',
    genericAr: 'إيزوميبرازول',
    brands: ['Nexium', 'نيكسيوم', 'Esomeprazole'],
    drugClass: 'مثبط مضخة البروتون',
    classCode: 'PPI',
    timing: 'قبل الوجبة بساعة',
    foods: [],
    depletes: ['b12', 'magnesium_potassium', 'calcium', 'iron'],
  },
  {
    generic: 'pantoprazole',
    genericAr: 'بانتوبرازول',
    brands: ['Controloc', 'كونترولوك', 'Pantoprazole'],
    drugClass: 'مثبط مضخة البروتون',
    classCode: 'PPI',
    timing: 'قبل الوجبة',
    foods: [],
    depletes: ['b12', 'magnesium_potassium', 'calcium', 'iron'],
  },

  // ─────────────── النقرس والعظام ───────────────
  {
    generic: 'allopurinol',
    genericAr: 'ألوبيورينول',
    brands: ['Zyloric', 'زيلوريك', 'Allopurinol'],
    drugClass: 'خافض حمض اليوريك',
    classCode: 'XANTHINE_OXIDASE_INHIBITOR',
    timing: 'بعد الطعام',
    foods: [
      {
        item: 'اللحوم الحمراء والأعضاء والمأكولات البحرية',
        mechanism: 'غنية بالبيورينات التي ترفع حمض اليوريك وتعاكس هدف الدواء',
        severity: 'important',
        patientText: 'قلّل اللحوم الحمراء والكبد والمأكولات البحرية.',
      },
      {
        item: 'المشروبات المحلّاة بالفركتوز',
        mechanism: 'الفركتوز يرفع إنتاج حمض اليوريك',
        severity: 'important',
        patientText: 'تجنّب المشروبات الغازية والعصائر المحلّاة.',
      },
      {
        item: 'قلّة شرب الماء',
        mechanism: 'الترطيب الجيد يساعد على طرح حمض اليوريك',
        severity: 'important',
        patientText: 'اشرب ماءً وفيراً يومياً.',
      },
    ],
  },
  {
    generic: 'colchicine',
    genericAr: 'كولشيسين',
    brands: ['Colchicine', 'كولشيسين', 'Colchimax'],
    drugClass: 'مضاد التهاب النقرس',
    classCode: 'COLCHICINE',
    metabolismNote: 'يُستقلَب عبر CYP3A4 وناقل P-gp',
    foods: [
      {
        item: 'الجريب فروت وعصيره',
        mechanism: 'تثبيط CYP3A4 يرفع تركيز الدواء وهامش أمانه ضيق',
        severity: 'critical',
        patientText: 'تجنّب الجريب فروت وعصيره تماماً مع هذا الدواء.',
      },
    ],
  },
  {
    generic: 'alendronate',
    genericAr: 'أليندرونات',
    brands: ['Fosamax', 'فوساماكس', 'Alendronate'],
    drugClass: 'بيسفوسفونات — علاج هشاشة العظام',
    classCode: 'BISPHOSPHONATE',
    metabolismNote: 'امتصاصه ضعيف جداً ويُلغى تقريباً بأي طعام أو شراب غير الماء',
    timing: 'صباحاً على معدة فارغة، مع ماء عادي فقط، والبقاء منتصباً 30 دقيقة',
    foods: [
      {
        item: 'أي طعام أو شراب غير الماء العادي',
        mechanism: 'القهوة والعصير والحليب تمنع امتصاص الدواء شبه كلياً',
        severity: 'critical',
        patientText: 'تناوله مع ماء عادي فقط على معدة فارغة، ولا تأكل أو تشرب شيئاً لمدة 30 دقيقة بعده.',
      },
      {
        item: 'الكالسيوم في نفس التوقيت',
        mechanism: 'يرتبط بالدواء ويمنع امتصاصه',
        severity: 'critical',
        patientText: 'افصل مكمل الكالسيوم عن هذا الدواء بساعتين على الأقل.',
      },
    ],
  },

  // ─────────────── الكورتيزون ───────────────
  {
    generic: 'prednisolone',
    genericAr: 'بريدنيزولون',
    brands: ['Prednisolone', 'بريدنيزولون', 'Solupred', 'Hostacortin'],
    drugClass: 'كورتيكوستيرويد',
    classCode: 'CORTICOSTEROID',
    metabolismNote: 'يرفع سكر الدم، يحبس الصوديوم، ويزيد فقد الكالسيوم من العظام',
    timing: 'صباحاً مع الطعام',
    foods: [
      {
        item: 'الملح الزائد',
        mechanism: 'الدواء يحبس الصوديوم والماء فيرفع الضغط ويسبب انتفاخاً',
        severity: 'important',
        patientText: 'قلّل الملح والأطعمة المصنّعة أثناء فترة العلاج.',
      },
      {
        item: 'السكريات البسيطة',
        mechanism: 'الدواء يرفع سكر الدم، والسكريات تضاعف الأثر',
        severity: 'important',
        patientText: 'قلّل الحلويات والمشروبات المحلّاة، وراقب سكرك إن كنت مصاباً بالسكري.',
      },
    ],
    depletes: ['calcium', 'vitamin_d', 'magnesium_potassium'],
  },

  // ─────────────── البروستاتا ───────────────
  {
    generic: 'tamsulosin',
    genericAr: 'تامسولوسين',
    brands: ['Omnic', 'أومنيك', 'Flomax', 'Tamsulosin'],
    drugClass: 'حاصر ألفا — تضخم البروستاتا',
    classCode: 'ALPHA_BLOCKER',
    timing: 'بعد نفس الوجبة يومياً (عادة الإفطار) للحفاظ على ثبات الامتصاص',
    foods: [
      {
        item: 'تغيير توقيت الوجبة',
        mechanism: 'ثبات العلاقة بالطعام يحافظ على ثبات مستوى الدواء ويقلّل الدوخة',
        severity: 'minor',
        patientText: 'تناوله بعد نفس الوجبة كل يوم.',
      },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
// المطابقة
// ═══════════════════════════════════════════════════════════════

/**
 * يطابق نص دواء أدخله الصيدلاني مع مدخلة في الجدول.
 * المطابقة على الاسم العلمي والأسماء التجارية معاً، بلا حساسية لحالة الأحرف.
 * لا تصحيح إملائي ولا تخمين — ما لا يُطابق يُترك للنموذج مع تنبيه بأنه
 * غير معروف، فلا يُبنى تحذير على دواء لم يُتعرّف عليه.
 */
export function matchDrug(input: string): DrugEntry | null {
  const q = input.trim().toLowerCase();
  if (!q) return null;

  for (const entry of DRUG_FOOD_INTERACTIONS) {
    if (entry.generic.toLowerCase() === q || entry.genericAr === input.trim()) return entry;
    if (entry.brands.some(b => b.toLowerCase() === q)) return entry;
  }
  // مطابقة جزئية: اسم تجاري داخل نص مثل "Pariet 20mg Tablet"
  for (const entry of DRUG_FOOD_INTERACTIONS) {
    if (q.includes(entry.generic.toLowerCase())) return entry;
    if (entry.brands.some(b => b.length > 3 && q.includes(b.toLowerCase()))) return entry;
  }
  return null;
}

/**
 * يطابق نص دواء أدخله الصيدلاني مع كل المدخلات المطابِقة في الجدول — لا أول
 * مدخلة فقط. ضروري للأدوية المركّبة (مثل Galvus Met أو Co-Diovan) التي تحمل
 * أكثر من مادة فعّالة، فيُفقد نصف التفاعلات السريرية لو توقفنا عند أول تطابق.
 * نفس منطق matchDrug (تطابق تام أولاً، ثم جزئي) مع تجميع النتائج بلا تكرار.
 */
export function matchDrugAll(input: string): DrugEntry[] {
  const q = input.trim().toLowerCase();
  if (!q) return [];

  const results: DrugEntry[] = [];
  const seen = new Set<string>();

  for (const entry of DRUG_FOOD_INTERACTIONS) {
    if (seen.has(entry.generic)) continue;
    if (entry.generic.toLowerCase() === q || entry.genericAr === input.trim() || entry.brands.some(b => b.toLowerCase() === q)) {
      results.push(entry);
      seen.add(entry.generic);
    }
  }
  // مطابقة جزئية: اسم تجاري داخل نص مثل "Pariet 20mg Tablet"
  for (const entry of DRUG_FOOD_INTERACTIONS) {
    if (seen.has(entry.generic)) continue;
    if (q.includes(entry.generic.toLowerCase()) || entry.brands.some(b => b.length > 3 && q.includes(b.toLowerCase()))) {
      results.push(entry);
      seen.add(entry.generic);
    }
  }
  return results;
}

/** يطابق قائمة أدوية المريض ويفصل المعروف عن غير المعروف */
export function matchPatientDrugs(drugs: string[]): {
  matched: DrugEntry[];
  unknown: string[];
} {
  const matched: DrugEntry[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();

  for (const d of drugs) {
    const entries = matchDrugAll(d);
    if (entries.length > 0) {
      for (const entry of entries) {
        if (!seen.has(entry.generic)) { seen.add(entry.generic); matched.push(entry); }
      }
    } else {
      unknown.push(d);
    }
  }
  return { matched, unknown };
}