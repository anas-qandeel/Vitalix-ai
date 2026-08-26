'use client';

import { useEffect, useState, use } from 'react';
import AppFooter from '../../../components/AppFooter';
import Disclaimer from '@/components/Disclaimer';
import { detectTextDir } from '@/lib/text-direction';

interface Patient {
  id: string;
  name: string;
  phone_number: string;
  gender: string;
  birth_date: string;
  height?: number | null;
}

interface VisitationRecord {
  id: string;
  pharmacy_id: string;
  patient_id: string;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  sugar_value: number | null;
  sugar_test_type: string | null;
  weight: number | null;
  symptoms: string[] | null;
  ai_report_output: string | null;
  created_at: string;
  patient?: Patient;
}

interface RecommendationItem {
  id: string;
  pharmacy_id: string;
  category: 'sugar_device' | 'sugar_strips' | 'bp_device' | 'weight_loss_med';
  brand_name: string;
  price: number;
  image_url?: string | null;
  ai_pitch_prompt: string;
  is_active: boolean;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ar-EG', { numberingSystem: 'latn' });
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    numberingSystem: 'latn',
  });
}

function sugarTypeLabel(t: string | null) {
  if (t === 'fasting') return 'صائم';
  if (t === 'postprandial') return 'بعد الأكل';
  return 'عشوائي';
}

function bmiCalc(weight: number | null, height?: number | null) {
  if (!weight || !height) return null;
  return (weight / (height / 100) ** 2).toFixed(1);
}

function getVisitStatus(v: { bp_systolic: number | null; bp_diastolic: number | null; sugar_value: number | null }) {
  let level: 'normal' | 'medium' | 'high' = 'normal';
  if (v.bp_systolic) {
    if (v.bp_systolic >= 180 || (v.bp_diastolic ?? 0) >= 120) level = 'high';
    else if (v.bp_systolic >= 140 || (v.bp_diastolic ?? 0) >= 90) level = 'medium';
  }
  if (v.sugar_value) {
    if (v.sugar_value >= 300) level = 'high';
    else if (v.sugar_value >= 180 && level === 'normal') level = 'medium';
  }
  if (level === 'high') return { label: 'يستدعي انتباهاً', chipBg: '#fee2e2', chipColor: '#991b1b' };
  if (level === 'medium') return { label: 'يحتاج متابعة', chipBg: '#fef3c7', chipColor: '#92400e' };
  return { label: 'ضمن الطبيعي', chipBg: '#d1fae5', chipColor: '#065f46' };
}

function IconHeart({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    </svg>
  );
}

function IconDroplet({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.75S6 10.5 6 14.25a6 6 0 0012 0C18 10.5 12 3.75 12 3.75z" />
    </svg>
  );
}

function IconScale({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" />
    </svg>
  );
}

function IconDownload({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}

function IconWhatsapp({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

/**
 * يحوّل عنصر DOM إلى ملف PDF ويُنزّله، مع دعم صفحات متعددة إن كان المحتوى أطول من صفحة A4 واحدة.
 */
async function renderElementToPdf(container: HTMLElement, filename: string) {
  await new Promise((resolve) => setTimeout(resolve, 150));

  const html2canvasModule: any = await import('html2canvas-pro');
  const html2canvas = html2canvasModule.default || html2canvasModule;
  const jspdfModule: any = await import('jspdf');
  const JsPDF = jspdfModule.jsPDF || jspdfModule.default;

  const canvas = await html2canvas(container, {
    scale: 2,
    windowWidth: 700,
    useCORS: true,
    backgroundColor: '#ffffff',
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.98);
  const pdf = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position -= pageHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  pdf.save(filename);
}

/**
 * توليد PDF لجدول طويل مع تكرار الهيدر في كل صفحة.
 */
async function renderHistoryTableToPdf(
  headerHtml: string,
  theadHtml: string,
  rowsHtml: string[],
  footerHtml: string,
  filename: string
) {
  const containerWidthPx = 700;
  const baseStyle = `position: fixed; top: -99999px; left: 0; width: ${containerWidthPx}px; background: #fff; font-family: system-ui, -apple-system, sans-serif; padding: 35px; color: #0F172A;`;

  const html2canvasModule: any = await import('html2canvas-pro');
  const html2canvas = html2canvasModule.default || html2canvasModule;
  const jspdfModule: any = await import('jspdf');
  const JsPDF = jspdfModule.jsPDF || jspdfModule.default;

  const pdf = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageWidthMM = pdf.internal.pageSize.getWidth();
  const pageHeightMM = pdf.internal.pageSize.getHeight();
  const mmPerPx = pageWidthMM / containerWidthPx;
  const maxContentHeightPx = pageHeightMM / mmPerPx;

  const tableOpenHtml = `<table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; text-align: right;"><thead>${theadHtml}</thead><tbody>`;
  const tableCloseHtml = `</tbody></table>`;

  const pageContainer = document.createElement('div');
  pageContainer.setAttribute('dir', 'rtl');
  pageContainer.style.cssText = baseStyle;
  document.body.appendChild(pageContainer);

  let rowIndex = 0;
  let pageNum = 0;

  while (rowIndex < rowsHtml.length || pageNum === 0) {
    const includedRows: number[] = [];
    let testIndex = rowIndex;

    while (testIndex < rowsHtml.length) {
      const candidateRows = [...includedRows, testIndex];
      pageContainer.innerHTML = `${headerHtml}${tableOpenHtml}${candidateRows.map((i) => rowsHtml[i]).join('')}${tableCloseHtml}`;
      const heightPx = pageContainer.offsetHeight;

      if (heightPx > maxContentHeightPx && includedRows.length > 0) {
        break;
      }
      includedRows.push(testIndex);
      testIndex++;
    }

    if (includedRows.length === 0 && testIndex < rowsHtml.length) {
      includedRows.push(testIndex);
      testIndex++;
    }

    const isLastPage = rowIndex + includedRows.length >= rowsHtml.length;
    pageContainer.innerHTML = `
      ${headerHtml}${tableOpenHtml}${includedRows.map((i) => rowsHtml[i]).join('')}${tableCloseHtml}
      ${isLastPage ? footerHtml : ''}
    `;

    await new Promise((resolve) => setTimeout(resolve, 100));

    const canvas = await html2canvas(pageContainer, {
      scale: 2,
      windowWidth: containerWidthPx,
      useCORS: true,
      backgroundColor: '#ffffff',
    });
    const imgData = canvas.toDataURL('image/jpeg', 0.98);
    const imgWidth = pageWidthMM;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    if (pageNum > 0) pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);

    rowIndex += includedRows.length;
    pageNum++;
  }

  document.body.removeChild(pageContainer);
  pdf.save(filename);
}

export default function SingleVitalViewPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const visitId = resolvedParams.id;

  const [loading, setLoading] = useState(true);
  const [pdfGenerating, setPdfGenerating] = useState<'report' | 'history' | null>(null);
  const [currentVisit, setCurrentVisit] = useState<VisitationRecord | null>(null);
  const [patientHistory, setPatientHistory] = useState<VisitationRecord[]>([]);
  const [pharmacyName, setPharmacyName] = useState<string>('');
  const [pharmacyPhone, setPharmacyPhone] = useState<string>('');
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchVisitDetails = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/visit/${visitId}`, { cache: 'no-store' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'لم يتم العثور على التقرير المطلوب أو أن الرابط غير صالح.');
      }

      setCurrentVisit(data.visit);
      setPharmacyName(data.pharmacyName || '');
      setPharmacyPhone(data.pharmacyPhone || '');
      setPatientHistory(data.history || []);
      setRecommendations(data.recommendations || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'حدث خطأ أثناء تحميل السجل الطبي');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visitId) {
      fetchVisitDetails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitId]);

  // نضمن أن الزيارة الحالية موجودة دائماً في القائمة حتى لو لم يُرجعها التاريخ
  const allVisits = (() => {
    const base = patientHistory.length > 0 ? patientHistory : [];
    if (!currentVisit) return base;
    const alreadyIncluded = base.some((v) => v.id === currentVisit.id);
    return alreadyIncluded ? base : [currentVisit, ...base];
  })();
  const [showAllVisits, setShowAllVisits] = useState(false);
  const [visitFilter, setVisitFilter] = useState<'all' | 'bp' | 'sugar' | 'weight'>('all');
  const VISITS_PREVIEW = 3;

  // تطبيق الفلتر — زيارة تظهر إذا احتوت على القراءة المطلوبة (وليس بالضرورة أن تكون الزيارة مخصصة لها فقط)
  const filteredVisits = allVisits.filter((v) => {
    if (visitFilter === 'bp')     return v.bp_systolic != null;
    if (visitFilter === 'sugar')  return v.sugar_value != null;
    if (visitFilter === 'weight') return v.weight != null;
    return true;
  });
  const visitsToShow = showAllVisits ? filteredVisits : filteredVisits.slice(0, VISITS_PREVIEW);
  const currentStatus = currentVisit ? getVisitStatus(currentVisit) : null;
  const currentBmi = currentVisit ? bmiCalc(currentVisit.weight, currentVisit.patient?.height) : null;

  // اسم الصيدلية المعروض: إذا جاء بدون "صيدلية" نضيفها، وإذا كان فارغاً نضع fallback
  const displayPharmacyName = pharmacyName
    ? (pharmacyName.startsWith('صيدلية') ? pharmacyName : `صيدلية ${pharmacyName}`)
    : 'صيدليتك المعتمدة';

  const handlePrintCurrentVisit = async () => {
    if (!currentVisit) return;
    setPdfGenerating('report');
    const patientName = currentVisit.patient?.name || 'المريض';
    const visitDate = formatDate(currentVisit.created_at);
    const visitTime = formatTime(currentVisit.created_at);

    const container = document.createElement('div');
    container.setAttribute('dir', 'rtl');
    container.style.cssText =
      'position: fixed; top: -99999px; left: 0; width: 700px; background: #fff; font-family: system-ui, -apple-system, sans-serif; padding: 35px; color: #0F172A; line-height: 1.6;';
    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0D9488; padding-bottom: 12px; margin-bottom: 20px;">
        <div style="font-size: 22px; font-weight: 900; color: #0F172A;">Vitalix<span style="color: #0D9488;">.ai</span></div>
        <div style="background: #F0FDFA; border: 1px solid #CCFBF1; color: #0F766E; padding: 6px 14px; border-radius: 10px; font-size: 12px; font-weight: bold;">🏥 ${displayPharmacyName}</div>
      </div>
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; padding: 12px 18px; border-radius: 12px; margin-bottom: 20px; font-size: 12px; display: flex; justify-content: space-between; font-weight: bold;">
        <div>المريض: ${patientName}</div>
        <div>تاريخ الفحص: ${visitDate} (${visitTime})</div>
      </div>
      <div style="background: #FFFFFF; border: 1px solid #CBD5E1; padding: 22px; border-radius: 12px; font-family: monospace; white-space: pre-line; font-size: 13px; line-height: 1.8;">${currentVisit.ai_report_output}</div>
      <div style="margin-top: 35px; border-top: 1px solid #E2E8F0; padding-top: 12px; text-align: center; font-size: 11px; color: #64748B;">تم توثيق وصدور هذا التقرير آلياً عبر منصة Vitalix.ai لصالح (${displayPharmacyName})</div>
    `;
    document.body.appendChild(container);

    try {
      await renderElementToPdf(container, `تقرير-${patientName}.pdf`);
    } catch (err: any) {
      console.error('[PDF] خطأ فعلي أثناء التوليد:', err);
      alert('حدث خطأ أثناء توليد ملف PDF:\n' + (err?.message || String(err)));
    } finally {
      document.body.removeChild(container);
      setPdfGenerating(null);
    }
  };

  const handlePrintDoctorHistory = async () => {
    if (!currentVisit) return;
    setPdfGenerating('history');
    const patientName = currentVisit.patient?.name || 'المريض';

    const headerHtml = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #059669; padding-bottom: 12px; margin-bottom: 20px;">
        <div style="font-size: 22px; font-weight: 900; color: #0F172A;">Vitalix<span style="color: #0D9488;">.ai</span></div>
        <div style="background: #ECFDF5; border: 1px solid #A7F3D0; color: #065F46; padding: 6px 14px; border-radius: 10px; font-size: 12px; font-weight: bold;">👨‍⚕️ سجل القراءات الكاملة للطبيب المعالج</div>
      </div>
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; padding: 12px 18px; border-radius: 12px; margin-bottom: 20px; font-size: 12px; display: flex; justify-content: space-between; font-weight: bold;">
        <div>اسم المريض: ${patientName}</div>
        <div>جهة التوثيق: ${displayPharmacyName}</div>
      </div>
    `;

    const theadHtml = `
      <tr>
        <th style="background-color: #F1F5F9; border: 1px solid #CBD5E1; padding: 10px; font-weight: bold;">التاريخ والوقت</th>
        <th style="background-color: #F1F5F9; border: 1px solid #CBD5E1; padding: 10px; font-weight: bold;">ضغط الدم (SYS/DIA)</th>
        <th style="background-color: #F1F5F9; border: 1px solid #CBD5E1; padding: 10px; font-weight: bold;">السكري (mg/dL)</th>
        <th style="background-color: #F1F5F9; border: 1px solid #CBD5E1; padding: 10px; font-weight: bold;">الوزن (kg)</th>
        <th style="background-color: #F1F5F9; border: 1px solid #CBD5E1; padding: 10px; font-weight: bold;">الأعراض الملاحظة</th>
      </tr>
    `;

    const footerHtml = `<div style="margin-top: 35px; border-top: 1px solid #E2E8F0; padding-top: 12px; text-align: center; font-size: 11px; color: #64748B;">تم توثيق سجل القراءات السابقة آلياً عبر منصة Vitalix.ai لصالح (${displayPharmacyName})</div>`;

    try {
      const pdfVisits = filteredVisits;
      if (pdfVisits.length === 0) {
        const container = document.createElement('div');
        container.setAttribute('dir', 'rtl');
        container.style.cssText =
          'position: fixed; top: -99999px; left: 0; width: 700px; background: #fff; font-family: system-ui, -apple-system, sans-serif; padding: 35px; color: #0F172A;';
        container.innerHTML = `
          ${headerHtml}
          <div style="padding: 30px; text-align: center; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; color: #64748B; font-size: 12px;">
            لا توجد قراءات موثقة لهذا المريض.
          </div>
          ${footerHtml}
        `;
        document.body.appendChild(container);
        try {
          await renderElementToPdf(container, `سجل-قراءات-${patientName}.pdf`);
        } finally {
          document.body.removeChild(container);
        }
      } else {
        const rowsHtml = pdfVisits.map((visit: VisitationRecord) => `
          <tr style="${visit.id === currentVisit.id ? 'background-color: #F0FDFA;' : ''}">
            <td style="padding: 10px; border: 1px solid #E2E8F0; font-family: monospace;">
              ${formatDate(visit.created_at)} (${formatTime(visit.created_at)})${visit.id === currentVisit.id ? ' — الحالية' : ''}
            </td>
            <td style="padding: 10px; border: 1px solid #E2E8F0; font-family: monospace; font-weight: bold; color: ${visit.bp_systolic && visit.bp_systolic >= 140 ? '#DC2626' : '#1D4ED8'};">
              ${visit.bp_systolic && visit.bp_diastolic ? `${visit.bp_systolic} / ${visit.bp_diastolic} mmHg` : '-'}
            </td>
            <td style="padding: 10px; border: 1px solid #E2E8F0; font-family: monospace; font-weight: bold; color: ${visit.sugar_value && visit.sugar_value >= 180 ? '#D97706' : '#059669'};">
              ${visit.sugar_value ? `${visit.sugar_value} (${sugarTypeLabel(visit.sugar_test_type)})` : '-'}
            </td>
            <td style="padding: 10px; border: 1px solid #E2E8F0; font-family: monospace; font-weight: bold; color: #7E22CE;">
              ${visit.weight ? `${visit.weight} kg` : '-'}
            </td>
            <td style="padding: 10px; border: 1px solid #E2E8F0; font-size: 11px;">
              ${visit.symptoms && visit.symptoms.length > 0 ? visit.symptoms.join(' ، ') : 'لا يوجد أعراض'}
            </td>
          </tr>
        `);

        await renderHistoryTableToPdf(headerHtml, theadHtml, rowsHtml, footerHtml, `سجل-قراءات-${patientName}.pdf`);
      }
    } catch (err: any) {
      console.error('[PDF] خطأ فعلي أثناء التوليد:', err);
      alert('حدث خطأ أثناء توليد ملف PDF:\n' + (err?.message || String(err)));
    } finally {
      setPdfGenerating(null);
    }
  };

  const handleOrderRecommendation = (item: RecommendationItem) => {
    const rawPhone = pharmacyPhone || currentVisit?.patient?.phone_number || '';
    const formattedPhone = rawPhone.replace(/[^0-9]/g, '');
    const cleanPhone = formattedPhone.startsWith('0') ? '962' + formattedPhone.substring(1) : formattedPhone;
    const patientName = currentVisit?.patient?.name || 'المريض';

    const text =
`مرحباً ${displayPharmacyName} 👋
أنا المريض (${patientName})، أود الاستفسار وطلب التوصية الطبية الموضحة في تقريري الطبي:
📦 الجهاز/المنتج: ${item.brand_name}
💰 السعر: ${item.price} دينار

يرجى تأكيد التوفر، وشكراً! 🌿`;

    const encodedMessage = encodeURIComponent(text)
      .replace(/!/g, '%21')
      .replace(/'/g, '%27')
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29')
      .replace(/\*/g, '%2A');

    const whatsappUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
  };

  /* ─── شاشة التحميل ─── */
  if (loading) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-4 p-4"
        dir="rtl"
        style={{ background: '#f8fafc', fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
      >
        <div
          className="w-12 h-12 rounded-full border-4 animate-spin"
          style={{ borderColor: '#e2e8f0', borderTopColor: '#0d9488' }}
        />
        <p style={{ color: '#64748b', fontSize: 14, fontWeight: 600 }}>جاري تحميل السجل الطبي الموثق...</p>
      </div>
    );
  }

  /* ─── شاشة الخطأ ─── */
  if (errorMsg || !currentVisit) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        dir="rtl"
        style={{ background: '#f8fafc', fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
      >
        <div
          className="w-full max-w-sm text-center space-y-4 p-8"
          style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}
        >
          <div style={{ fontSize: 48 }}>⚠️</div>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a' }}>تعذر عرض التقرير</h2>
          <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>{errorMsg || 'التقرير المطلوب غير موجود'}</p>
        </div>
      </div>
    );
  }

  /* ─── الصفحة الرئيسية ─── */
  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100vh',
        background: '#f8fafc',
        fontFamily: "'IBM Plex Sans Arabic', sans-serif",
        color: '#0f172a',
        paddingBottom: 64,
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap');

        @keyframes saasSlideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(1.4); }
        }
        .slide-up { animation: saasSlideUp 0.25s ease both; }
        .pulse-dot { animation: pulseDot 2s ease-in-out infinite; }

        /* ─── هيدر جرادييت ─── */
        .page-header {
          background: linear-gradient(135deg, #0f172a 0%, #115e59 100%);
          position: relative;
          overflow: hidden;
        }
        .page-header::before {
          content: '';
          position: absolute;
          width: 280px; height: 280px;
          border-radius: 50%;
          background: rgba(255,255,255,0.04);
          top: -80px; right: -80px;
          pointer-events: none;
        }
        .page-header::after {
          content: '';
          position: absolute;
          width: 180px; height: 180px;
          border-radius: 50%;
          background: rgba(255,255,255,0.03);
          bottom: -60px; left: -40px;
          pointer-events: none;
        }

        /* ─── section title ─── */
        .section-title {
          font-size: 13px;
          font-weight: 600;
          color: #0d9488;
          text-transform: uppercase;
          letter-spacing: 1px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .section-title::after {
          content: '';
          flex: 1;
          height: 1px;
          background: #e2e8f0;
        }

        /* ─── status chip ─── */
        .chip {
          display: inline-block;
          border-radius: 20px;
          padding: 3px 12px;
          font-size: 11px;
          font-weight: 600;
        }

        /* ─── card ─── */
        .vcard {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 20px;
          transition: box-shadow 0.2s ease;
        }
        .vcard:hover { box-shadow: 0 4px 20px rgba(0,0,0,0.06); }

        /* ─── تحسينات الجدول للموبايل ─── */
        @media (max-width: 640px) {
          .history-table thead { display: none; }
          .history-table tbody tr {
            display: block;
            border: 1px solid #e2e8f0;
            border-radius: 16px;
            margin-bottom: 12px;
            padding: 14px;
            background: #fff;
          }
          .history-table tbody td {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px 0;
            border: none;
            font-size: 13px;
          }
          .history-table tbody td::before {
            content: attr(data-label);
            font-weight: 600;
            color: #64748b;
            font-size: 11px;
            flex-shrink: 0;
            margin-left: 8px;
          }
        }

        /* ─── pdf overlay ─── */
        .pdf-overlay {
          position: fixed; inset: 0;
          background: rgba(255,255,255,0.92);
          backdrop-filter: blur(6px);
          z-index: 9999;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          gap: 16px;
        }

        /* ─── btn primary ─── */
        .btn-primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 20px;
          background: #0f172a;
          color: #fff;
          border: none;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s, transform 0.1s;
          font-family: inherit;
          white-space: nowrap;
        }
        .btn-primary:hover { background: #1e293b; }
        .btn-primary:active { transform: scale(0.97); }
        .btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }

        /* على الشاشات الضيقة جداً (~320px) padding الأفقي الأصلي (20px) + النص nowrap
           يجعل الزر أعرض من مساحة البطاقة المتاحة (main padding 16px + section padding 24px
           من كل جهة = 80px، فتبقى ~240px فقط على شاشة 320px) — نقلّص الـ padding الأفقي
           والخط لضمان عدم تجاوز الزر لحدود البطاقة، ونزيد الـ padding العمودي قليلاً
           لتقريب ارتفاع منطقة اللمس من 40px بدل ~35px الحالية */
        @media (max-width: 400px) {
          .btn-primary {
            padding: 12px 14px;
            font-size: 12px;
            gap: 6px;
          }
        }

        .btn-whatsapp {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 12px;
          background: #16a34a;
          color: #fff;
          border: none;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s, transform 0.1s;
          font-family: inherit;
          margin-top: 16px;
        }
        .btn-whatsapp:hover { background: #15803d; }
        .btn-whatsapp:active { transform: scale(0.97); }
      `}</style>

      {/* ─── PDF overlay ─── */}
      {pdfGenerating && (
        <div className="pdf-overlay">
          <div
            className="w-12 h-12 rounded-full border-4 animate-spin"
            style={{ borderColor: '#e2e8f0', borderTopColor: '#0d9488' }}
          />
          <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>جاري تحضير ملف PDF...</p>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          HEADER — gradient مع هيكل واضح الأولويات
      ══════════════════════════════════════════════ */}
      <header className="page-header">
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 16px', position: 'relative', zIndex: 1 }}>

          {/* ── شريط علوي: لوجو صغير فقط ── */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px 0 12px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
                <path d="M6 8L14.5 25C14.8 25.6 15.6 25.6 15.9 25L20 17" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
                <path d="M24 6C24 9.3 26.7 12 30 12C26.7 12 24 14.7 24 18C24 14.7 21.3 12 18 12C21.3 12 24 9.3 24 6Z" fill="#2dd4bf" />
              </svg>
              <span style={{ fontWeight: 700, fontSize: 15, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.2px' }}>
                Vitalix<span style={{ color: '#2dd4bf' }}>.ai</span>
              </span>
              <span
                className="pulse-dot"
                style={{ width: 6, height: 6, borderRadius: '50%', background: '#2dd4bf', display: 'inline-block' }}
              />
            </div>
          </div>

          {/* ── اسم الصيدلية — بارز في المنتصف ── */}
          <div style={{ padding: '20px 0 8px', textAlign: 'center' }}>
            {/* أيقونة الصيدلية */}
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: 'rgba(45,212,191,0.15)',
              border: '1px solid rgba(45,212,191,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 12px',
            }}>
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#2dd4bf" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5A.75.75 0 0114.25 12h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
              </svg>
            </div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4, fontWeight: 500 }}>
              تقريرك الطبي من
            </p>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.3px' }}>
              {displayPharmacyName}
            </h2>
          </div>

          {/* ── بيانات المريض — كارد أبيض شفاف ── */}
          <div style={{
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 16,
            padding: '16px 18px',
            margin: '16px 0 24px',
          }}>
            {/* اسم المريض + status */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: 'rgba(255,255,255,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 17, fontWeight: 800, color: '#fff', flexShrink: 0,
                }}>
                  {(currentVisit.patient?.name || 'م').trim().charAt(0)}
                </div>
                <div>
                  <p style={{ fontSize: 17, fontWeight: 700, color: '#fff', margin: 0 }}>
                    {currentVisit.patient?.name || 'المريض'}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    {/* أيقونة تقويم SVG */}
                    <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.5)" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                    </svg>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                      {formatDate(currentVisit.created_at)}
                    </span>
                    {/* أيقونة ساعة SVG */}
                    <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.5)" strokeWidth={2} style={{ marginRight: 4 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                      {formatTime(currentVisit.created_at)}
                    </span>
                  </div>
                </div>
              </div>
              {currentStatus && (
                <span className="chip" style={{ background: currentStatus.chipBg, color: currentStatus.chipColor, flexShrink: 0 }}>
                  {currentStatus.label}
                </span>
              )}
            </div>

            {/* قراءات — pills بأيقونات SVG */}
            {(currentVisit.bp_systolic != null || currentVisit.sugar_value != null || currentVisit.weight != null) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                {currentVisit.bp_systolic != null && currentVisit.bp_diastolic != null && (
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 600, color: '#fff',
                  }}>
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#f87171" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                    </svg>
                    {currentVisit.bp_systolic}/{currentVisit.bp_diastolic}
                    <span style={{ fontSize: 10, opacity: 0.6 }}>mmHg</span>
                  </span>
                )}
                {currentVisit.sugar_value != null && (
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 600, color: '#fff',
                  }}>
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#34d399" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.75S6 10.5 6 14.25a6 6 0 0012 0C18 10.5 12 3.75 12 3.75z" />
                    </svg>
                    {currentVisit.sugar_value}
                    <span style={{ fontSize: 10, opacity: 0.6 }}>({sugarTypeLabel(currentVisit.sugar_test_type)})</span>
                  </span>
                )}
                {currentVisit.weight != null && (
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 600, color: '#fff',
                  }}>
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#c084fc" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" />
                    </svg>
                    {currentVisit.weight} kg
                    {currentBmi && <span style={{ fontSize: 10, opacity: 0.6 }}>— BMI {currentBmi}</span>}
                  </span>
                )}
                {currentVisit.symptoms && currentVisit.symptoms.map((s, i) => (
                  <span key={i} style={{
                    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 20, padding: '5px 12px', fontSize: 12, color: 'rgba(255,255,255,0.7)',
                  }}>
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>

        </div>
      </header>

      {/* ══════════════════════════════════════════════
          MAIN CONTENT
      ══════════════════════════════════════════════ */}
      <main
        className="slide-up"
        style={{ maxWidth: 860, margin: '0 auto', padding: '28px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}
      >

        {/* ─── 1. التقرير الطبي ─── */}
        <section className="vcard" style={{ padding: '24px 24px 28px' }}>
          {/* section title */}
          <div style={{ marginBottom: 20 }}>
            <p className="section-title">📋 سجل قراءات الفحص الحالي</p>
          </div>

          {/* زر التنزيل */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button
              className="btn-primary"
              onClick={handlePrintCurrentVisit}
              disabled={pdfGenerating !== null}
            >
              <IconDownload className="w-4 h-4" />
              {pdfGenerating === 'report' ? 'جاري التحضير...' : 'تنزيل سجل القراءات (PDF)'}
            </button>
          </div>

          {/* نص التقرير */}
          <div
            dir={detectTextDir(currentVisit.ai_report_output)}
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 14,
              padding: '20px 22px',
              fontSize: 14,
              color: '#334155',
              lineHeight: 1.9,
              whiteSpace: 'pre-line',
              textAlign: detectTextDir(currentVisit.ai_report_output) === 'ltr' ? 'left' : 'right',
            }}
          >
            {currentVisit.ai_report_output}
          </div>
        </section>

        {/* ─── 2. التوصيات الذكية ─── */}
        {recommendations.length > 0 && (
          <section className="vcard" style={{ padding: '24px 24px 28px' }}>
            <div style={{ marginBottom: 6 }}>
              <p className="section-title">💡 توصية صيدلانية لمتابعة حالتك</p>
            </div>
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 20, lineHeight: 1.6 }}>
              بناءً على قراءاتك الحالية، يوصي فريق ({displayPharmacyName}) بالخيارات التالية:
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
                gap: 16,
              }}
            >
              {recommendations.map((item) => {
                const isWeightLoss = item.category === 'weight_loss_med';
                return (
                  <div
                    key={item.id}
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 16,
                      padding: 18,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    }}
                  >
                    {/* صورة / أيقونة + اسم + سعر */}
                    <div
                      style={{
                        display: 'flex',
                        gap: 12,
                        alignItems: 'center',
                        background: '#fff',
                        border: '1px solid #e2e8f0',
                        borderRadius: 12,
                        padding: '12px 14px',
                        marginBottom: 12,
                      }}
                    >
                      {isWeightLoss ? (
                        <span style={{ fontSize: 28, flexShrink: 0 }}>⚖️</span>
                      ) : item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.brand_name}
                          style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 10, flexShrink: 0, border: '1px solid #e2e8f0' }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 54, height: 54, background: '#f1f5f9',
                            borderRadius: 10, display: 'flex', alignItems: 'center',
                            justifyContent: 'center', fontSize: 22, flexShrink: 0,
                          }}
                        >
                          🩺
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', margin: 0, lineHeight: 1.3 }}>
                          {item.brand_name}
                        </p>
                        <span
                          style={{
                            display: 'inline-block',
                            marginTop: 6,
                            background: '#f0fdfa',
                            border: '1px solid #ccfbf1',
                            color: '#0f766e',
                            borderRadius: 8,
                            padding: '2px 10px',
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {item.price} JOD
                        </span>
                      </div>
                    </div>

                    {/* النص التسويقي */}
                    <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.7, marginBottom: 0 }}>
                      {item.ai_pitch_prompt}
                    </p>

                    {/* زر واتساب */}
                    <button
                      className="btn-whatsapp"
                      onClick={() => handleOrderRecommendation(item)}
                    >
                      <IconWhatsapp className="w-4 h-4" />
                      طلب عبر WhatsApp
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ─── 3. سجل القراءات الكاملة ─── */}
        <section className="vcard" style={{ padding: '24px 24px 28px' }}>
          <div style={{ marginBottom: 6 }}>
            <p className="section-title">📈 سجل القراءات الكاملة للطبيب المعالج</p>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
              مرتب تسلسلياً حسب الخط الزمني، ويشمل الزيارة الحالية
            </p>
            <button
              className="btn-primary"
              onClick={handlePrintDoctorHistory}
              disabled={pdfGenerating !== null}
            >
              <IconDownload className="w-4 h-4" />
              {pdfGenerating === 'history' ? 'جاري التحضير...' : 'تنزيل تقرير الطبيب (PDF)'}
            </button>
          </div>

          {/* ── أزرار الفلترة ── */}
          {(() => {
            const filters: { key: 'all' | 'bp' | 'sugar' | 'weight'; label: string; count: number }[] = [
              { key: 'all',    label: 'الكل',      count: allVisits.length },
              { key: 'bp',     label: 'ضغط الدم',  count: allVisits.filter(v => v.bp_systolic != null).length },
              { key: 'sugar',  label: 'السكري',    count: allVisits.filter(v => v.sugar_value != null).length },
              { key: 'weight', label: 'الوزن',     count: allVisits.filter(v => v.weight != null).length },
            ];
            return (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {filters.map((f) => {
                  const active = visitFilter === f.key;
                  return (
                    <button
                      key={f.key}
                      onClick={() => { setVisitFilter(f.key); setShowAllVisits(false); }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '6px 14px',
                        borderRadius: 20,
                        border: active ? '1.5px solid #0d9488' : '1.5px solid #e2e8f0',
                        background: active ? '#f0fdfa' : '#fff',
                        color: active ? '#0f766e' : '#64748b',
                        fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'inherit',
                        transition: 'all 0.15s',
                      }}
                    >
                      {f.label}
                      <span style={{
                        background: active ? '#0d9488' : '#f1f5f9',
                        color: active ? '#fff' : '#94a3b8',
                        borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700,
                      }}>
                        {f.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })()}

          {filteredVisits.length > 0 ? (
            <>
              {/* ─ جدول عادي على الشاشات الكبيرة ─ */}
              <div style={{ overflowX: 'auto' }}>
                <table
                  className="history-table"
                  style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'right' }}
                >
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      {['التاريخ والوقت', 'ضغط الدم', 'السكري', 'الوزن', 'الأعراض'].map((h) => (
                        <th
                          key={h}
                          style={{ padding: '12px 14px', fontWeight: 600, color: '#64748b', fontSize: 12 }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visitsToShow.map((visit) => {
                      const isCurrent = visit.id === currentVisit.id;
                      return (
                        <tr
                          key={visit.id}
                          style={{
                            background: isCurrent ? '#f0fdfa' : 'transparent',
                            borderBottom: '1px solid #f1f5f9',
                            transition: 'background 0.15s',
                          }}
                        >
                          {/* التاريخ */}
                          <td
                            data-label="التاريخ"
                            style={{ padding: '12px 14px', color: '#334155', verticalAlign: 'middle' }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <div>
                                <span style={{ fontWeight: 600 }}>{formatDate(visit.created_at)}</span>
                                <span style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                  {formatTime(visit.created_at)}
                                </span>
                              </div>
                              {isCurrent && (
                                <span
                                  className="chip"
                                  style={{ background: '#ccfbf1', color: '#0f766e', fontSize: 10, padding: '2px 8px' }}
                                >
                                  الحالية
                                </span>
                              )}
                            </div>
                          </td>

                          {/* ضغط الدم */}
                          <td data-label="ضغط الدم" style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                            {visit.bp_systolic && visit.bp_diastolic ? (
                              <span
                                className="chip"
                                style={
                                  visit.bp_systolic >= 140 || visit.bp_diastolic >= 90
                                    ? { background: '#fee2e2', color: '#991b1b' }
                                    : { background: '#eff6ff', color: '#1d4ed8' }
                                }
                              >
                                {visit.bp_systolic}/{visit.bp_diastolic}
                                <span style={{ fontSize: 9, opacity: 0.7, marginRight: 3 }}>mmHg</span>
                              </span>
                            ) : (
                              <span style={{ color: '#cbd5e1' }}>—</span>
                            )}
                          </td>

                          {/* السكري */}
                          <td data-label="السكري" style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                            {visit.sugar_value ? (
                              <span
                                className="chip"
                                style={
                                  visit.sugar_value >= 180
                                    ? { background: '#fef3c7', color: '#92400e' }
                                    : { background: '#d1fae5', color: '#065f46' }
                                }
                              >
                                {visit.sugar_value}
                                <span style={{ fontSize: 9, opacity: 0.7, marginRight: 3 }}>
                                  ({sugarTypeLabel(visit.sugar_test_type)})
                                </span>
                              </span>
                            ) : (
                              <span style={{ color: '#cbd5e1' }}>—</span>
                            )}
                          </td>

                          {/* الوزن */}
                          <td data-label="الوزن" style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                            {visit.weight ? (
                              <span className="chip" style={{ background: '#f3e8ff', color: '#6b21a8' }}>
                                {visit.weight}
                                <span style={{ fontSize: 9, opacity: 0.7, marginRight: 3 }}>kg</span>
                              </span>
                            ) : (
                              <span style={{ color: '#cbd5e1' }}>—</span>
                            )}
                          </td>

                          {/* الأعراض */}
                          <td data-label="الأعراض" style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                            {visit.symptoms && visit.symptoms.length > 0 ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                {visit.symptoms.map((s, i) => (
                                  <span
                                    key={i}
                                    style={{
                                      background: '#f1f5f9',
                                      border: '1px solid #e2e8f0',
                                      color: '#475569',
                                      borderRadius: 8,
                                      padding: '2px 8px',
                                      fontSize: 11,
                                      fontWeight: 500,
                                    }}
                                  >
                                    {s}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span style={{ fontSize: 12, color: '#94a3b8' }}>لا يوجد أعراض</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* زر عرض الكل / إخفاء */}
              {filteredVisits.length > VISITS_PREVIEW && (
                <button
                  onClick={() => setShowAllVisits((v) => !v)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    width: '100%',
                    marginTop: 12,
                    padding: '10px 0',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#0d9488',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: 'background 0.15s',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = '#f0fdfa')}
                  onMouseOut={(e) => (e.currentTarget.style.background = '#f8fafc')}
                >
                  {showAllVisits ? (
                    <>
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                      </svg>
                      إخفاء الزيارات القديمة
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                      عرض جميع الزيارات ({filteredVisits.length})
                    </>
                  )}
                </button>
              )}
            </>
          ) : (
            <div
              style={{
                padding: '36px 20px',
                textAlign: 'center',
                background: '#f8fafc',
                border: '1px dashed #e2e8f0',
                borderRadius: 14,
                color: '#94a3b8',
                fontSize: 13,
              }}
            >
              {visitFilter === 'all'
                ? 'لا توجد قراءات موثقة لهذا المريض حتى الآن.'
                : 'لا توجد زيارات تحتوي على هذا النوع من القراءات.'}
            </div>
          )}
        </section>

        {/* ─── Footer ─── */}
        <footer style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', paddingTop: 8, paddingBottom: 8 }}>
          تم توثيق الفحص وسجل القراءات آلياً عبر منصة{' '}
          <span style={{ color: '#0d9488', fontWeight: 600 }}>Vitalix.ai</span>{' '}
          لصالح ({displayPharmacyName})
        </footer>
        <Disclaimer variant={detectTextDir(currentVisit.ai_report_output) === 'ltr' ? 'patient-en' : 'patient'} />
        <AppFooter className="pb-8" />
      </main>
    </div>
  );
}
