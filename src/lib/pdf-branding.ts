// ترويسة وتذييل PDF موحّدان لأوراق الصيدلية الجدولية (jsPDF + jspdf-autotable، خط PlexArabic).
// للكود الجديد فقط: دالتا PDF القديمتان (patients/[id] و chronic) تحملان نسختهما الخاصة ولم تُمسّا.

import type { jsPDF } from 'jspdf';
import type { UserOptions } from 'jspdf-autotable';

export const PDF_FONT = 'PlexArabic';
export const PDF_MARGIN_X = 12;
/** أول y للجدول: يحجز الترويسة */
export const PDF_TOP = 42;
/** هامش سفلي يحجز التذييل */
export const PDF_BOTTOM = 22;

export type AutoTableFn = (doc: jsPDF, options: UserOptions) => void;

export interface PdfHeaderInfo {
  pharmacyName: string;
  title: string;
  /** سطر يمين أول، مقاطعه من اليمين لليسار، مثل ['الفترة:', 'من', '15/10/2026', 'إلى', '21/10/2026'] */
  periodParts: string[];
  /** سطر يمين ثانٍ، مثل ['عدد الوصفات:', '23'] */
  countParts: string[];
  /** سطر يسار، مثل ['تاريخ الإصدار:', '21/10/2026'] */
  issueParts: string[];
}

/** يحمّل jsPDF و autoTable ويسجّل خط PlexArabic (الخطوط القياسية لا تحوي عربية إطلاقاً) */
export async function createBrandedPdf(): Promise<{ pdf: jsPDF; autoTable: AutoTableFn }> {
  const { jsPDF: JsPDF } = await import('jspdf');
  const autoTableModule = await import('jspdf-autotable');
  const { PLEX_ARABIC_REGULAR_B64 } = await import('@/lib/pdf-arabic-font');
  const pdf = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  pdf.addFileToVFS('PlexArabic-Regular.ttf', PLEX_ARABIC_REGULAR_B64);
  pdf.addFont('PlexArabic-Regular.ttf', PDF_FONT, 'normal');
  pdf.setFont(PDF_FONT);
  return { pdf, autoTable: autoTableModule.default };
}

function partsWidth(pdf: jsPDF, parts: string[], gap: number): number {
  return parts.reduce((w, p) => w + pdf.getTextWidth(p), 0) + gap * Math.max(0, parts.length - 1);
}

/**
 * يرسم مقاطع من اليمين لليسار بمسافة صريحة بينها. الفصل ضروري لأن محرك bidi في jsPDF
 * يعكس ترتيب الأرقام والكلمات في السطر المختلط (عربي + أرقام) كما في دالتي PDF القديمتين
 */
export function drawRtlParts(pdf: jsPDF, parts: string[], xRight: number, y: number, gap = 1.3) {
  let x = xRight;
  for (const p of parts) {
    pdf.text(p, x, y, { align: 'right' });
    x -= pdf.getTextWidth(p) + gap;
  }
}

function drawBrandHeader(pdf: jsPDF, info: PdfHeaderInfo) {
  const w = pdf.internal.pageSize.getWidth();
  pdf.setFont(PDF_FONT);
  pdf.setFontSize(17); pdf.setTextColor(15, 23, 42);
  pdf.text(info.pharmacyName, w / 2, 15, { align: 'center' });
  pdf.setFontSize(9); pdf.setTextColor(71, 85, 105);
  pdf.text(info.title, w / 2, 21, { align: 'center' });
  pdf.setDrawColor(13, 148, 136); pdf.setLineWidth(0.4);
  pdf.line(PDF_MARGIN_X, 25, w - PDF_MARGIN_X, 25);

  pdf.setFontSize(8.5); pdf.setTextColor(51, 65, 85);
  drawRtlParts(pdf, info.periodParts, w - PDF_MARGIN_X, 32);
  drawRtlParts(pdf, info.countParts, w - PDF_MARGIN_X, 37);
  pdf.setFontSize(8); pdf.setTextColor(100, 116, 139);
  drawRtlParts(pdf, info.issueParts, PDF_MARGIN_X + partsWidth(pdf, info.issueParts, 1.3), 32);
}

function drawBrandFooter(pdf: jsPDF, pharmacyName: string, page: number, total: number) {
  const w = pdf.internal.pageSize.getWidth();
  const h = pdf.internal.pageSize.getHeight();
  pdf.setFont(PDF_FONT);
  pdf.setDrawColor(226, 232, 240); pdf.setLineWidth(0.2);
  pdf.line(PDF_MARGIN_X, h - 16, w - PDF_MARGIN_X, h - 16);
  pdf.setFontSize(6.5); pdf.setTextColor(100, 116, 139);
  pdf.text(pharmacyName, w / 2, h - 11, { align: 'center' });

  // فصل المقطع العربي عن اسم المنصة اللاتيني لتفادي انقلاب ترتيبهما في السطر المختلط
  pdf.setFontSize(6.2); pdf.setTextColor(148, 163, 184);
  const sigArabic = 'مصدر عبر منصة ';
  const sigLatin = 'Vitalix-ai';
  const sigGap = 1.2;
  const sigTotal = pdf.getTextWidth(sigArabic) + sigGap + pdf.getTextWidth(sigLatin);
  const sigStart = (w - sigTotal) / 2;
  pdf.text(sigArabic, sigStart + sigTotal, h - 7, { align: 'right' });
  pdf.text(sigLatin, sigStart, h - 7, { align: 'left' });

  // ترقيم الصفحات في الطرف الأيمن: «صفحة» ثم «1 / 3» كمقطعين منفصلين
  pdf.setFontSize(7); pdf.setTextColor(100, 116, 139);
  drawRtlParts(pdf, ['صفحة', `${page} / ${total}`], w - PDF_MARGIN_X, h - 7);
}

/**
 * يرسم الترويسة والتذييل على كل الصفحات بعد اكتمال الجدول (العدد الكلي للصفحات معروف عندها)
 * ثم يحفظ الملف. يجب أن يحجز الجدول مساحتهما بـ PDF_TOP و PDF_BOTTOM
 */
export function finishBrandedPdf(pdf: jsPDF, info: PdfHeaderInfo, filename: string) {
  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    drawBrandHeader(pdf, info);
    drawBrandFooter(pdf, info.pharmacyName, i, total);
  }
  pdf.save(filename);
}
