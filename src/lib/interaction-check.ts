/**
 * فحص تفاعلات دواء–دواء في قائمة أدوية المريض — Vitalix.ai
 *
 * المدخل: أسماء أدوية كما كتبها الموظف (نصّ حرّ من medication_name).
 * المخرَج: التفاعلات المطابَقة، للصيدلاني فقط.
 *
 * حدود معروفة ومقبولة:
 * - المطابقة نصّية على generic وbrands. اسم خارج القائمة لا يُطابَق،
 *   فيصمت النظام. الصمت ليس شهادة بغياب التعارض، ويجب ألا تصوغه
 *   الواجهة هكذا أبداً.
 * - القائمة تمثّل ما يُصرف من هذه الصيدلية لا كل أدوية المريض.
 */

import { DRUG_FOOD_INTERACTIONS } from './drug-food-interactions';
import { DRUG_DRUG_INTERACTIONS } from './drug-drug-interactions';
import type { DrugDrugInteraction, InteractionParty } from './drug-drug-interactions';

/** دواء تعرّف عليه النظام من نصّ حرّ */
export interface MatchedDrug {
  /** النصّ كما كتبه الموظف — يُعرض للصيدلاني ليعرف أي سطر قُصد */
  inputText: string;
  generic: string;
  genericAr: string;
  classCode: string;
}

export interface FoundInteraction {
  interaction: DrugDrugInteraction;
  /** الدواءان المطابَقان اللذان أطلقا القاعدة */
  drugA: MatchedDrug;
  drugB: MatchedDrug;
}

/** تطبيع للمقارنة: حروف صغيرة، بلا تشكيل، وتوحيد الهمزات */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u064B-\u0652]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

/** يطابق نصّاً حرّاً بدواء من الجدول، أو null */
export function matchDrug(input: string): MatchedDrug | null {
  const n = normalize(input);
  if (!n) return null;

  for (const entry of DRUG_FOOD_INTERACTIONS) {
    const candidates = [entry.generic, entry.genericAr, ...entry.brands];
    for (const c of candidates) {
      const nc = normalize(c);
      // احتواء لا تطابق تام: «انجيوتيك 20 مغ» يطابق «انجيوتيك»
      if (nc.length >= 4 && n.includes(nc)) {
        return {
          inputText: input,
          generic: entry.generic,
          genericAr: entry.genericAr,
          classCode: entry.classCode,
        };
      }
    }
  }
  return null;
}

/** هل ينطبق طرف القاعدة على دواء مطابَق؟ */
function partyMatches(party: InteractionParty, drug: MatchedDrug): boolean {
  if (party.kind === 'drug') return party.generic === drug.generic;
  if (party.classCode !== drug.classCode) return false;
  // حارس التعميم الخاطئ
  return !party.except?.includes(drug.generic);
}

/**
 * الفحص الرئيسي. يستقبل أسماء الأدوية كما هي في قاعدة البيانات
 * ويُرجع كل تفاعل مطابَق.
 */
export function checkInteractions(medicationNames: string[]): FoundInteraction[] {
  const matched = medicationNames
    .map(matchDrug)
    .filter((d): d is MatchedDrug => d !== null);

  const found: FoundInteraction[] = [];

  for (let i = 0; i < matched.length; i++) {
    for (let j = i + 1; j < matched.length; j++) {
      const d1 = matched[i];
      const d2 = matched[j];
      if (d1.generic === d2.generic) continue;

      for (const rule of DRUG_DRUG_INTERACTIONS) {
        // القاعدة غير موجّهة: نجرّب الترتيبين
        if (partyMatches(rule.a, d1) && partyMatches(rule.b, d2)) {
          found.push({ interaction: rule, drugA: d1, drugB: d2 });
        } else if (partyMatches(rule.a, d2) && partyMatches(rule.b, d1)) {
          found.push({ interaction: rule, drugA: d2, drugB: d1 });
        }
      }
    }
  }

  return found;
}