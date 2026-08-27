// يمنع تكرار لقب "د." عند عرض اسم الصيدلاني: بعض الصيدلانيين يكتبون اللقب ضمن
// الاسم المخزَّن أصلاً (مثال: "د خالد")، فإضافة "د. " كبادئة بلا فحص تنتج "د. د خالد".
// formatPharmacistName تجرّد أي لقب موجود من بداية الاسم فقط قبل إعادة إضافته (أو لا).

const TITLE_RE = /^\s*(?:الدكتور|دكتور|د)(?=[\s.]|$)[\s.]*/;

export function formatPharmacistName(name: string | null | undefined, withTitle = true): string {
  if (!name) return '';

  const stripped = name.trim().replace(TITLE_RE, '').trim();
  if (!stripped) return '';

  return withTitle ? `د. ${stripped}` : stripped;
}
