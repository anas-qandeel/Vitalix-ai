/**
 * فحص تفاعلات دواء–دواء في قائمة أدوية المريض — Vitalix.ai
 *
 * المدخل: أسماء أدوية كما كتبها الموظف (نصّ حرّ من medication_name).
 * المخرَج: التفاعلات المطابَقة، للصيدلاني فقط.
 *
 * يدعم الأدوية المركّبة (مثل Co-Diovan أو Galvus Met) عبر matchDrugAll
 * من drug-food-interactions.ts — نصّ واحد قد يُطابق أكثر من جزيء فعّال،
 * فتُفحص التفاعلات بين كل مكوّنات القائمة لا بين الأسطر فقط.
 *
 * حدود معروفة ومقبولة:
 * - المطابقة نصّية على generic وbrands. اسم خارج القائمة لا يُطابَق،
 *   فيصمت النظام. الصمت ليس شهادة بغياب التعارض، ويجب ألا تصوغه
 *   الواجهة هكذا أبداً.
 * - القائمة تمثّل ما يُصرف من هذه الصيدلية لا كل أدوية المريض.
 */

import { DRUG_FOOD_INTERACTIONS, matchDrugAll } from './drug-food-interactions';
import { DRUG_DRUG_INTERACTIONS } from './drug-drug-interactions';
import type { DrugDrugInteraction, InteractionParty } from './drug-drug-interactions';

/** دواء تعرّف عليه النظام من نصّ حرّ */
export interface MatchedDrug {
  /** النصّ كما كتبه الموظف — يُعرض للصيدلاني ليعرف أي سطر قُصد */
  inputText: string;
  generic: string;
  genericAr: string;
  classCode: string;
  /** ترتيب النصّ في القائمة الأصلية — يُملأ في checkInteractions لا هنا */
  sourceIndex: number;
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

/**
 * يطابق نصّاً حرّاً بكل الأدوية المطابِقة له من الجدول — مركّب واحد
 * (مثل Co-Diovan) قد يحمل أكثر من جزيء فعّال، فتُرجَع مصفوفة لا دواء واحد.
 * sourceIndex غير مملوء هنا — يُملأ في checkInteractions.
 */
export function matchDrugs(input: string): Omit<MatchedDrug, 'sourceIndex'>[] {
  const direct = matchDrugAll(input);
  if (direct.length > 0) {
    return direct.map(e => ({
      inputText: input,
      generic: e.generic,
      genericAr: e.genericAr,
      classCode: e.classCode,
    }));
  }

  // طبقة احتياطية: matchDrugAll لا تُطبّع طرف الجدول (فهمزة واحدة في
  // اسم تجاري أو علمي عربي تُفشل التطابق، مثل «انجيوتيك» مقابل
  // «أنجيوتيك») ولا تطابق genericAr جزئياً (حلقتها الثانية تفحص فقط
  // generic الإنجليزي وbrands). هذا نفس منطق matchDrug القديم —
  // تطبيع الطرفين معاً بالاحتواء وحد أدنى 4 أحرف للمرشّح — لكن مع
  // تجميع كل الجدول المطابِق لا أول مدخلة فقط.
  const n = normalize(input);
  if (!n) return [];

  const fallback: Omit<MatchedDrug, 'sourceIndex'>[] = [];
  for (const entry of DRUG_FOOD_INTERACTIONS) {
    const candidates = [entry.generic, entry.genericAr, ...entry.brands];
    for (const c of candidates) {
      const nc = normalize(c);
      if (nc.length >= 4 && n.includes(nc)) {
        fallback.push({
          inputText: input,
          generic: entry.generic,
          genericAr: entry.genericAr,
          classCode: entry.classCode,
        });
        break;
      }
    }
  }
  return fallback;
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
  const matched: MatchedDrug[] = medicationNames.flatMap((name, sourceIndex) =>
    matchDrugs(name).map(d => ({ ...d, sourceIndex }))
  );

  const found: FoundInteraction[] = [];

  for (let i = 0; i < matched.length; i++) {
    for (let j = i + 1; j < matched.length; j++) {
      const d1 = matched[i];
      const d2 = matched[j];
      if (d1.generic === d2.generic) continue;
      // مكوّنان من نفس العلبة (مثل Co-Diovan) ليسا خطأ وصفة
      if (d1.sourceIndex === d2.sourceIndex) continue;

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