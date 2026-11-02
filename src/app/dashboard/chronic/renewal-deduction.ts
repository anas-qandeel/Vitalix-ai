/**
 * ما يُطرح من مخزون الرف عند حفظ تجديد في صفحة المزمنين.
 * القاعدة: تُطرح الأدوية التي حدّدها الصيدلاني للتجديد فقط، وبعدد العلب الذي أدخله في النافذة (لا كل أدوية المريض ولا العدد القديم المخزَّن).
 * دالة صرفة بلا أي اتصال: تستدعيها نافذة MedModal بعد نجاح الحفظ وتسلّم نتيجتها للصفحة، والصفحة هي التي تطرح من المخزون.
 */

export interface DeductionSource {
  medication_name: string;
  boxes_count: unknown;
  selected: boolean;
}

export interface InventoryDeduction {
  key: string;
  boxes: number;
}

/** مفتاح المخزون: الاسم بعد التقليم وبحروف صغيرة (كما في deductFromInventory ومسار الأرشفة). */
export function inventoryKey(name: string): string {
  return name.trim().toLowerCase();
}

/** عدد العلب المطروحة: لا يقل عن علبة واحدة، وأي قيمة غير رقمية (فراغ أو نص أو غياب) تُعدّ علبة واحدة. */
export function boxesToDeduct(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(1, n) : 1;
}

/**
 * ما يُطرح بعد حفظ ناجح في MedModal.
 * - تجديد (isRenewal): الأدوية المحدَّدة فقط، بالترتيب نفسه، وبما أدخله الصيدلاني من علب.
 * - تسجيل جديد أو نافذة بلا أدوية قائمة: لا شيء (لا مخزون صُرف لمريض جديد، وهذا ما كان يحدث فعلاً).
 */
export function renewalDeductions(meds: readonly DeductionSource[], isRenewal: boolean): InventoryDeduction[] {
  if (!isRenewal) return [];
  const out: InventoryDeduction[] = [];
  for (const m of meds) {
    if (!m.selected) continue;
    out.push({ key: inventoryKey(m.medication_name), boxes: boxesToDeduct(m.boxes_count) });
  }
  return out;
}
