'use client';

import { useEffect, useState, use } from 'react';

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

// تنسيق موحّد للتاريخ والوقت: عربي في الصياغة، لكن بأرقام إنجليزية (numberingSystem: 'latn').
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
  const [pharmacyName, setPharmacyName] = useState<string>('صيدليتك المعتمدة');
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
      setPharmacyName(data.pharmacyName || 'صيدليتك المعتمدة');
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

  const previousVisits = patientHistory.filter((visit) => visit.id !== currentVisit?.id);

  const handlePrintCurrentVisit = async () => {
    if (!currentVisit) return;
    setPdfGenerating('report');
    const patientName = currentVisit.patient?.name || 'المريض';
    const visitDate = formatDate(currentVisit.created_at);
    const visitTime = formatTime(currentVisit.created_at);

    const container = document.createElement('div');
    container.setAttribute('dir', 'rtl');
    container.style.cssText =
      'position: fixed; top: 0; left: 0; width: 700px; background: #fff; font-family: system-ui, -apple-system, sans-serif; padding: 35px; color: #0F172A; line-height: 1.6;';
    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0D9488; padding-bottom: 12px; margin-bottom: 20px;">
        <div style="font-size: 22px; font-weight: 900; color: #0F172A;">Vitalix<span style="color: #0D9488;">.ai</span></div>
        <div style="background: #F0FDFA; border: 1px solid #CCFBF1; color: #0F766E; padding: 6px 14px; border-radius: 10px; font-size: 12px; font-weight: bold;">🏥 ${pharmacyName}</div>
      </div>
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; padding: 12px 18px; border-radius: 12px; margin-bottom: 20px; font-size: 12px; display: flex; justify-content: space-between; font-weight: bold;">
        <div>المريض: ${patientName}</div>
        <div>تاريخ الفحص: ${visitDate} (${visitTime})</div>
      </div>
      <div style="background: #FFFFFF; border: 1px solid #CBD5E1; padding: 22px; border-radius: 12px; font-family: monospace; white-space: pre-line; font-size: 13px; line-height: 1.8;">${currentVisit.ai_report_output}</div>
      <div style="margin-top: 35px; border-top: 1px solid #E2E8F0; padding-top: 12px; text-align: center; font-size: 11px; color: #64748B;">تم توثيق وصدور هذا التقرير آلياً عبر منصة Vitalix.ai لصالح (${pharmacyName})</div>
    `;
    document.body.appendChild(container);

    try {
      await renderElementToPdf(container, `تقرير-${patientName}.pdf`);
    } catch (err: any) {
      console.error('[PDF] خطأ فعلي أثناء التوليد:', err);
      alert('حدث خطأ أثناء توليد ملف PDF:\n' + (err?.message || String(err)) + '\n\nيرجى إرسال هذه الرسالة كما هي.');
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
        <div style="background: #ECFDF5; border: 1px solid #A7F3D0; color: #065F46; padding: 6px 14px; border-radius: 10px; font-size: 12px; font-weight: bold;">👨‍⚕️ سجل القراءات السابقة للطبيب المعالج</div>
      </div>
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; padding: 12px 18px; border-radius: 12px; margin-bottom: 20px; font-size: 12px; display: flex; justify-content: space-between; font-weight: bold;">
        <div>اسم المريض: ${patientName}</div>
        <div>جهة التوثيق: ${pharmacyName}</div>
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

    const footerHtml = `<div style="margin-top: 35px; border-top: 1px solid #E2E8F0; padding-top: 12px; text-align: center; font-size: 11px; color: #64748B;">تم توثيق سجل القراءات السابقة آلياً عبر منصة Vitalix.ai لصالح (${pharmacyName})</div>`;

    try {
      if (previousVisits.length === 0) {
        const container = document.createElement('div');
        container.setAttribute('dir', 'rtl');
        container.style.cssText =
          'position: fixed; top: 0; left: 0; width: 700px; background: #fff; font-family: system-ui, -apple-system, sans-serif; padding: 35px; color: #0F172A;';
        container.innerHTML = `
          ${headerHtml}
          <div style="padding: 30px; text-align: center; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; color: #64748B; font-size: 12px;">
            لا توجد قراءات سابقة موثقة لهذا المريض.
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
        const rowsHtml = previousVisits.map((visit) => `
          <tr>
            <td style="padding: 10px; border: 1px solid #E2E8F0; font-family: monospace;">
              ${formatDate(visit.created_at)} (${formatTime(visit.created_at)})
            </td>
            <td style="padding: 10px; border: 1px solid #E2E8F0; font-family: monospace; font-weight: bold; color: ${visit.bp_systolic && visit.bp_systolic >= 140 ? '#DC2626' : '#1D4ED8'};">
              ${visit.bp_systolic && visit.bp_diastolic ? `${visit.bp_systolic} / ${visit.bp_diastolic} mmHg` : '-'}
            </td>
            <td style="padding: 10px; border: 1px solid #E2E8F0; font-family: monospace; font-weight: bold; color: ${visit.sugar_value && visit.sugar_value >= 180 ? '#D97706' : '#059669'};">
              ${visit.sugar_value ? `${visit.sugar_value} (${visit.sugar_test_type === 'fasting' ? 'صائم' : 'عشوائي'})` : '-'}
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
      alert('حدث خطأ أثناء توليد ملف PDF:\n' + (err?.message || String(err)) + '\n\nيرجى إرسال هذه الرسالة كما هي.');
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
`مرحباً ${pharmacyName} 👋
أنا المريض (${patientName})، أود الاستفسار وطلب التوصية الطبية الموضحة في تقريري الطبي:
📦 الجهاز/المنتج: ${item.brand_name}
💰 السعر: ${item.price} دينار

يرجى تأكيد التوفر والتوصيل، وشكراً! 🌿`;

    const encodedMessage = encodeURIComponent(text)
      .replace(/!/g, '%21')
      .replace(/'/g, '%27')
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29')
      .replace(/\*/g, '%2A');

    const whatsappUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-500 font-sans p-4" dir="rtl">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-teal-600 rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-medium">جاري تحميل السجل الطبي الموثق...</p>
      </div>
    );
  }

  if (errorMsg || !currentVisit) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans" dir="rtl">
        <div className="bg-white border border-slate-200 p-8 rounded-3xl max-w-md w-full text-center space-y-4 shadow-sm">
          <div className="text-5xl">⚠️</div>
          <h2 className="text-lg font-bold text-slate-800">تعذر عرض التقرير</h2>
          <p className="text-sm text-slate-500">{errorMsg || 'التقرير المطلوب غير موجود'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased pb-16" dir="rtl">
      {/* طبقة تحميل PDF */}
      {pdfGenerating && (
        <div className="fixed inset-0 bg-white/90 backdrop-blur-sm z-[9999] flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-teal-600 rounded-full animate-spin"></div>
          <p className="text-sm font-bold text-slate-700">جاري تحضير ملف PDF احترافي...</p>
        </div>
      )}

      {/* الهيدر العلوي */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-6 py-4 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0F172A] flex items-center justify-center shadow-sm border border-slate-800 shrink-0">
              <svg 
                className="w-5 h-5 text-white" 
                viewBox="0 0 32 32" 
                fill="none" 
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M6 8L14.5 25C14.8 25.6 15.6 25.6 15.9 25L20 17" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
                <path d="M24 6C24 9.3 26.7 12 30 12C26.7 12 24 14.7 24 18C24 14.7 21.3 12 18 12C21.3 12 24 9.3 24 6Z" fill="#0D9488" />
              </svg>
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight text-slate-900 font-brand">
                Vitalix<span className="text-teal-600">.ai</span>
              </span>
              <p className="text-[10px] text-slate-500 font-medium -mt-1">صحتك.. متابعة باستمرار</p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 text-slate-700 px-4 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm">
            <span>🏥</span>
            <span>{pharmacyName}</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pt-8 space-y-6">
        
        {/* 1. كارت تفاصيل الزيارة والتقرير المباشر */}
        <section className="bg-white border border-slate-200 p-6 sm:p-8 rounded-3xl shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <h1 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>تفاصيل الزيارة والفحص الحالي</span>
              </h1>
              <p className="text-xs text-slate-500 mt-1 tabular-nums">
                📅 {formatDate(currentVisit.created_at)} - ⏰ {formatTime(currentVisit.created_at)}
              </p>
            </div>

            <button
              onClick={handlePrintCurrentVisit}
              disabled={pdfGenerating !== null}
              className="px-5 py-2.5 bg-gradient-to-l from-slate-900 to-teal-800 hover:from-slate-800 hover:to-teal-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-all shadow-sm cursor-pointer flex items-center justify-center gap-2 active:scale-95"
            >
              <span>📄</span>
              <span>{pdfGenerating === 'report' ? 'جاري التحضير...' : 'تنزيل التقرير (PDF)'}</span>
            </button>
          </div>

          <div className="p-6 bg-slate-50/80 rounded-2xl border border-slate-200 text-sm text-slate-700 leading-loose shadow-sm">
            {currentVisit.ai_report_output}
          </div>
        </section>

        {/* 2. كارت التوصيات الذكية */}
        {recommendations.length > 0 && (
          <section className="bg-white border border-slate-200 p-6 sm:p-8 rounded-3xl shadow-sm space-y-6 no-print">
            <div className="border-b border-slate-100 pb-5">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span className="text-teal-600">💡</span>
                <span>توصية صيدلانية لمتابعة حالتك الصحية من المنزل</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                بناءً على قراءاتك الحالية، يوصي فريق ({pharmacyName}) بالخيارات التالية للمتابعة:
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {recommendations.map((item) => {
                const isWeightLoss = item.category === 'weight_loss_med';

                return (
                  <div 
                    key={item.id} 
                    className="bg-slate-50 border border-slate-200 rounded-3xl p-5 flex flex-col justify-between shadow-sm hover:shadow-md transition-all duration-300"
                  >
                    <div className="space-y-4">
                      {isWeightLoss ? (
                        <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">⚖️</span>
                            <div>
                              <span className="text-sm font-bold text-slate-900 block">{item.brand_name}</span>
                              <span className="text-xs text-slate-500 font-medium">إدارة الوزن والآيض المعتمد</span>
                            </div>
                          </div>
                          <span className="text-sm font-bold text-slate-900 tabular-nums bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                            {item.price} JOD
                          </span>
                        </div>
                      ) : (
                        <div className="flex gap-4 items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                          {item.image_url ? (
                            <img 
                              src={item.image_url} 
                              alt={item.brand_name} 
                              className="w-16 h-16 object-cover rounded-xl border border-slate-100 shrink-0" 
                            />
                          ) : (
                            <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center font-bold text-2xl shrink-0">
                              🩺
                            </div>
                          )}
                          <div className="space-y-2 flex-1">
                            <span className="text-sm font-bold text-slate-900 block">{item.brand_name}</span>
                            <span className="inline-block text-xs font-bold text-slate-800 tabular-nums bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                              {item.price} JOD
                            </span>
                          </div>
                        </div>
                      )}

                      <p className="text-xs text-slate-600 leading-relaxed font-sans px-1">
                        {item.ai_pitch_prompt}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOrderRecommendation(item)}
                      className="mt-6 w-full py-3 bg-gradient-to-l from-slate-900 to-teal-800 hover:from-slate-800 hover:to-teal-700 text-white rounded-xl text-sm font-medium transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                    >
                      <span>💬</span>
                      <span>طلب الجهاز عبر WhatsApp</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 3. سجل القراءات السابقة للطبيب المعالج */}
        <section className="bg-white border border-slate-200 p-6 sm:p-8 rounded-3xl shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>📈 سجل القراءات السابقة للطبيب المعالج</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">مرتب تسلسلياً حسب الخط الزمني للفحوصات السابقة</p>
            </div>

            <button
              onClick={handlePrintDoctorHistory}
              disabled={pdfGenerating !== null}
              className="px-5 py-2.5 bg-gradient-to-l from-slate-900 to-teal-800 hover:from-slate-800 hover:to-teal-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-all shadow-sm cursor-pointer flex items-center justify-center gap-2 active:scale-95"
            >
              <span>👨‍⚕️</span>
              <span>{pdfGenerating === 'history' ? 'جاري التحضير...' : 'تنزيل تقرير الطبيب (PDF)'}</span>
            </button>
          </div>

          {previousVisits.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <th className="p-4 font-semibold rounded-r-2xl">التاريخ والوقت</th>
                    <th className="p-4 font-semibold">ضغط الدم</th>
                    <th className="p-4 font-semibold">السكري</th>
                    <th className="p-4 font-semibold">الوزن</th>
                    <th className="p-4 font-semibold rounded-l-2xl">الأعراض الملاحظة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previousVisits.map((visit) => (
                    <tr key={visit.id} className="hover:bg-slate-50/50 text-slate-700 transition-colors">
                      <td className="p-4 tabular-nums">
                        {formatDate(visit.created_at)}
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          {formatTime(visit.created_at)}
                        </span>
                      </td>
                      <td className="p-4 tabular-nums">
                        {visit.bp_systolic && visit.bp_diastolic ? (
                          <span className={`inline-flex items-center px-3 py-1 rounded-xl text-sm font-semibold ${visit.bp_systolic >= 140 || visit.bp_diastolic >= 90 ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-blue-50 text-blue-700 border border-blue-100'}`}>
                            {visit.bp_systolic} / {visit.bp_diastolic}
                            <span className="text-[10px] ml-1 opacity-70">mmHg</span>
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="p-4 tabular-nums">
                        {visit.sugar_value ? (
                          <span className={`inline-flex items-center px-3 py-1 rounded-xl text-sm font-semibold ${visit.sugar_value >= 180 ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
                            {visit.sugar_value}
                            <span className="text-[10px] ml-1 opacity-70">({visit.sugar_test_type === 'fasting' ? 'صائم' : 'عشوائي'})</span>
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="p-4 tabular-nums">
                        {visit.weight ? (
                          <span className="inline-flex items-center px-3 py-1 rounded-xl text-sm font-semibold bg-purple-50 text-purple-700 border border-purple-100">
                            {visit.weight}
                            <span className="text-[10px] ml-1 opacity-70">kg</span>
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="p-4">
                        {visit.symptoms && visit.symptoms.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {visit.symptoms.map((s, i) => (
                              <span key={i} className="bg-slate-100 border border-slate-200 text-slate-600 px-2.5 py-1 rounded-lg text-xs font-medium">
                                {s}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">لا يوجد أعراض</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 text-sm bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              لا توجد قراءات سابقة موثقة لهذا المريض حتى الآن.
            </div>
          )}
        </section>

        <footer className="text-center text-xs text-slate-400 pt-4 pb-8">
          تم توثيق الفحص وسجل القراءات آلياً عبر منصة Vitalix.ai لصالح ({pharmacyName})
        </footer>
      </main>
    </div>
  );
}