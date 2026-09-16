/**
 * حلقة التعلّم — تلخيص أحداث المنتج للعرض في شاشة الكتالوج (لا يمس الترتيب ولا الاقتراح).
 * حتمي بالكامل من الأحداث المحفوظة؛ تنبيه المراجعة يظهر عند تكرار الاستبعاد.
 */
export interface ProductEventRow {
  product_id: string;
  event_type: string;
  patient_flags?: Record<string, unknown> | null;
}

export interface ProductSignals {
  inquired: number;
  excluded: number;
  /** تنبيه للصيدلاني إن استحق المنتج مراجعة بطاقته */
  review_hint: string | null;
}

export const REVIEW_THRESHOLD = 3;

const FLAG_LABELS_AR: Record<string, string> = {
  is_pregnant:  'حوامل',
  is_lactating: 'مرضعات',
  hypertension: 'مرضى ضغط',
  diabetes:     'مرضى سكري',
};

export function summarizeProductEvents(events: ProductEventRow[]): Map<string, ProductSignals> {
  const acc = new Map<string, { inquired: number; excluded: number; flagCounts: Record<string, number> }>();
  for (const e of events) {
    const cur = acc.get(e.product_id) ?? { inquired: 0, excluded: 0, flagCounts: {} };
    if (e.event_type === 'patient_inquired') cur.inquired++;
    if (e.event_type === 'pharmacist_excluded') {
      cur.excluded++;
      const flags = (e.patient_flags && typeof e.patient_flags === 'object' ? e.patient_flags : {}) as Record<string, unknown>;
      for (const key of Object.keys(FLAG_LABELS_AR)) {
        if (flags[key] === true) cur.flagCounts[key] = (cur.flagCounts[key] ?? 0) + 1;
      }
    }
    acc.set(e.product_id, cur);
  }
  const out = new Map<string, ProductSignals>();
  for (const [id, s] of acc) {
    let review_hint: string | null = null;
    if (s.excluded >= REVIEW_THRESHOLD) {
      // الصفة الأكثر تكراراً بين المستبعَدين إن بلغت العتبة، وإلا تنبيه عام
      const top = Object.entries(s.flagCounts).sort((a, b) => b[1] - a[1])[0];
      review_hint = top && top[1] >= REVIEW_THRESHOLD
        ? `راجع البطاقة — استُبعد ${top[1]} مرات لـ${FLAG_LABELS_AR[top[0]]}`
        : `راجع البطاقة — استُبعد ${s.excluded} مرات`;
    }
    out.set(id, { inquired: s.inquired, excluded: s.excluded, review_hint });
  }
  return out;
}
