// أدوات حقل التاريخ يوم/شهر/سنة — منطق نقي بلا اعتماديات، ويُختبر بشكل حتمي.
// القيمة المخزَّنة والمُرسَلة دائماً yyyy-mm-dd؛ الكتابة والعرض dd/mm/yyyy.

/** يحوّل الأرقام العربية والفارسية إلى لاتينية */
export function toLatinDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, ch => {
    const c = ch.charCodeAt(0);
    return String(c >= 0x06f0 ? c - 0x06f0 : c - 0x0660);
  });
}

const pad2 = (p: string) => p.padStart(2, '0');
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** dd/mm/yyyy ← yyyy-mm-dd (تُقبل البادئة إن لحقها وقت)؛ فراغ إن لم تصلح */
export function formatIsoAsDmy(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** yyyy-mm-dd ← dd/mm/yyyy؛ فراغ إن كان النص ناقصاً أو التاريخ مستحيلاً (31/02) أو السنة خارج 1900–2100 */
export function parseDmyToIso(text: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) return '';
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (year < 1900 || year > 2100) return '';
  if (month < 1 || month > 12) return '';
  if (day < 1 || day > daysInMonth(year, month)) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * يرتّب ما يكتبه المستخدم: prev النص السابق، raw ما صار في الحقل بعد الضغطة.
 * - تاريخ كامل بفواصل (لصق، أو تعديل جزء في المنتصف): يُتمّ الصفر ويُرتَّب، وتُقبل صيغة yyyy-mm-dd.
 * - فاصل كُتب في آخر النص: يُتمّ الجزء الحالي بصفر إن كان رقماً واحداً (5/ ← 05/).
 * - غير ذلك: تدفّق أرقام يُقسَّم تلقائياً dd/mm/yyyy بحد أقصى 8 أرقام.
 */
export function maskTypedDate(prev: string, raw: string): string {
  const s = toLatinDigits(raw);
  const parts = s.split(/\D+/).filter(Boolean);

  if (/\D/.test(s) && parts.length === 3) {
    if (parts[2].length === 4 && parts[0].length <= 2 && parts[1].length <= 2) {
      return `${pad2(parts[0])}/${pad2(parts[1])}/${parts[2]}`;
    }
    if (parts[0].length === 4 && parts[1].length <= 2 && parts[2].length <= 2) {
      return `${pad2(parts[2])}/${pad2(parts[1])}/${parts[0]}`;
    }
  }

  if (prev && s.length === prev.length + 1 && s.startsWith(prev) && /[/\-.\s]$/.test(s)) {
    const segs = prev.split('/');
    if (segs.length < 3 && /^\d{1,2}$/.test(segs[segs.length - 1])) {
      segs[segs.length - 1] = pad2(segs[segs.length - 1]);
      return segs.join('/') + '/';
    }
  }

  const d = s.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}
