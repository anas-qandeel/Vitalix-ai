/**
 * الأصناف الدوائية — قائمة مغلقة | Vitalix.ai
 *
 * الغرض: مفتاح مطابقة حتمي للقواعد الصنفية في تفاعلات دواء–دواء،
 * على نمط supplement-categories.ts.
 *
 * سبب البناء: حقل drugClass في drug-food-interactions.ts نصّ حرّ
 * للعرض على البشر، وقد ورد صنف مثبطات ACE بصيغتين مختلفتين
 * ('مثبط ACE' و'مثبط الإنزيم المحوّل للأنجيوتنسين (ACE)') — أي أن
 * أي مطابقة نصّية عليه تفوت أحد الدوائين بصمت.
 *
 * قاعدة: هذا الحقل للمطابقة فقط. drugClass النصّي يبقى للعرض.
 */

export type DrugClass =
  // ─────────────── السكري ───────────────
  | 'BIGUANIDE'
  | 'SULFONYLUREA'
  | 'DPP4_INHIBITOR'
  | 'SGLT2_INHIBITOR'
  // ─────────────── الضغط والقلب ───────────────
  | 'ACE_INHIBITOR'
  | 'ARB'
  | 'MRA'                        // مضاد مستقبلات القشرانيات المعدنية — طرف في محور الرينين لا مجرد مدر
  | 'CCB'
  | 'BETA_BLOCKER'
  | 'THIAZIDE_DIURETIC'          // يشمل شبيه الثيازيد: ملف التفاعلات واحد
  | 'LOOP_DIURETIC'
  | 'ALPHA_BLOCKER'
  // ─────────────── الدهون ───────────────
  | 'STATIN'
  | 'FIBRATE'
  // ─────────────── التخثر ───────────────
  | 'VKA_ANTICOAGULANT'
  | 'DOAC'
  | 'ANTIPLATELET'
  // ─────────────── أخرى ───────────────
  | 'THYROID_HORMONE'
  | 'PPI'
  | 'XANTHINE_OXIDASE_INHIBITOR'
  | 'COLCHICINE'                 // جزيء واحد برمز خاص: تفاعلاته عبر CYP3A4 وP-gp لا يشاركه فيها صنف
  | 'BISPHOSPHONATE'
  | 'CORTICOSTEROID';

/** الأسماء العربية للعرض — لا تُستعمل في المطابقة */
export const DRUG_CLASS_LABELS: Record<DrugClass, string> = {
  BIGUANIDE: 'بيغوانيد',
  SULFONYLUREA: 'سلفونيل يوريا',
  DPP4_INHIBITOR: 'مثبط DPP-4',
  SGLT2_INHIBITOR: 'مثبط SGLT2',
  ACE_INHIBITOR: 'مثبط الإنزيم المحوّل للأنجيوتنسين',
  ARB: 'حاصر مستقبلات الأنجيوتنسين',
  MRA: 'مضاد مستقبلات القشرانيات المعدنية',
  CCB: 'حاصر قنوات الكالسيوم',
  BETA_BLOCKER: 'حاصر بيتا',
  THIAZIDE_DIURETIC: 'مدر بول ثيازيدي',
  LOOP_DIURETIC: 'مدر بول عروي',
  ALPHA_BLOCKER: 'حاصر ألفا',
  STATIN: 'ستاتين',
  FIBRATE: 'فيبرات',
  VKA_ANTICOAGULANT: 'مضاد تخثر — مضاد لفيتامين ك',
  DOAC: 'مضاد تخثر فموي مباشر',
  ANTIPLATELET: 'مضاد صفيحات',
  THYROID_HORMONE: 'هرمون درقي بديل',
  PPI: 'مثبط مضخة البروتون',
  XANTHINE_OXIDASE_INHIBITOR: 'مثبط أوكسيداز الزانثين',
  COLCHICINE: 'كولشيسين',
  BISPHOSPHONATE: 'بيسفوسفونات',
  CORTICOSTEROID: 'كورتيكوستيرويد',
};