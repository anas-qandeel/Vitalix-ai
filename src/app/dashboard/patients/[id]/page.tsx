'use client';

import React, { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import DashboardHeader, { usePharmacyInfo } from '../../components/DashboardHeader';
import AppFooter from '../../../components/AppFooter';
import Disclaimer from '@/components/Disclaimer';
import { getPharmacyId } from '@/lib/tenant';
import { detectTextDir } from '@/lib/text-direction';
import { normalizePhone, displayPhone, validatePhone } from '@/lib/phone';

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════
interface PatientDetail {
  id: string;
  name: string;
  phone_number: string;
  gender: string;
  birth_date: string;
  height: number | null;
  diagnosed_conditions: string[] | null;
  created_at: string;
}

interface Visit {
  id: string;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  heart_rate: number | null;
  is_dual_bp: boolean;
  sugar_value: number | null;
  sugar_test_type: string | null;
  weight: number | null;
  symptoms: string[] | null;
  had_stimulants: boolean;
  recent_exertion: boolean;
  recent_heavy_meal: boolean;
  is_stressed: boolean;
  took_medication: boolean;
  ai_report_output: string | null;
  performed_by: string | null;
  created_at: string;
}

interface ChronicMed {
  id: string;
  medication_name: string;
  daily_dosage: number | null;
  dosage_unit: string | null;
  pills_per_box: number | null;
  boxes_count: number | null;
}

interface WeightPlanProgress {
  diffFromPrevious: number;
  daysSincePrevious: number;
  diffFromBaseline: number;
  daysSinceBaseline: number;
}

interface WeightPlanNutrition {
  clinical_reasoning?: string;
  drug_matching?: { matched: string[]; unknown: string[] };
  progress?: WeightPlanProgress | null;
}

interface WeightPlan {
  id: string;
  weight_kg: number;
  bmi: number;
  bmi_category: string;
  target_loss_kg: number;
  first_goal_kg: number;
  nutrition_plan: WeightPlanNutrition | null;
  plan_generated_at: string | null;
  created_at: string;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('ar-EG', { numberingSystem: 'latn' });
}
function formatTime(d: string) {
  return new Date(d).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true, numberingSystem: 'latn' });
}
function calculateAge(birthDate: string) {
  const today = new Date(), birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}
function bmiCalc(weight: number | null, height: number | null) {
  if (!height || !weight) return null;
  return (weight / ((height / 100) ** 2)).toFixed(1);
}
function sugarTypeLabel(t: string | null) {
  if (t === 'fasting') return 'صائم';
  if (t === 'postprandial') return 'بعد الأكل';
  if (t === 'random') return 'عشوائي';
  return '';
}
function getVisitStatus(v: { bp_systolic: number | null; bp_diastolic: number | null; sugar_value: number | null }) {
  let level: 'normal' | 'medium' | 'high' = 'normal';
  if (v.bp_systolic) {
    if (v.bp_systolic >= 180 || (v.bp_diastolic ?? 0) >= 120 || v.bp_systolic < 90 || (v.bp_diastolic ?? 0) < 60) level = 'high';
    else if (v.bp_systolic >= 140 || (v.bp_diastolic ?? 0) >= 90) level = 'medium';
  }
  if (v.sugar_value) {
    const s = v.sugar_value;
    if (s >= 300 || s < 70) { if (level !== 'high') level = 'high'; }
    else if (s >= 180 && level === 'normal') level = 'medium';
  }
  if (level === 'high') return { dot: 'bg-rose-500', color: 'text-rose-600', label: 'يستدعي انتباهاً' };
  if (level === 'medium') return { dot: 'bg-amber-500', color: 'text-amber-600', label: 'يحتاج متابعة' };
  return { dot: 'bg-teal-500', color: 'text-teal-600', label: 'ضمن الطبيعي' };
}

function translateUnit(u: string | null): string {
  if (!u) return '';
  const map: Record<string, string> = {
    pill: 'حبة', tablet: 'حبة', capsule: 'كبسولة',
    ml: 'مل', mg: 'مغ', drop: 'قطرة', sachet: 'كيس',
    patch: 'لصقة', injection: 'حقنة', puff: 'بخة',
  };
  return map[u.toLowerCase()] ?? u;
}

// ═══════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════
function IconPhone({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-2.896-1.596-5.265-3.965-6.861-6.861l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    </svg>
  );
}
function IconWhatsApp({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
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
function IconChevron({ className = 'w-4 h-4', open = false }: { className?: string; open?: boolean }) {
  return (
    <svg className={`${className} transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
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

// ═══════════════════════════════════════════════════════
// PDF — منسوختان من src/app/vitals/view/[id]/page.tsx (نفس آلية "تنزيل تقرير الطبيب")
// ═══════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════
export default function PatientCardPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const patientId = resolvedParams.id;
  const router = useRouter();
  const { pharmacyName } = usePharmacyInfo();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [expandedVisitId, setExpandedVisitId] = useState<string | null>(null);
  const [visitFilter, setVisitFilter] = useState<'all' | 'bp' | 'sugar' | 'weight'>('all');
  const [showAllVisits, setShowAllVisits] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [chronicMeds, setChronicMeds] = useState<ChronicMed[]>([]);
  const [weightPlans, setWeightPlans] = useState<WeightPlan[]>([]);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [heightInput, setHeightInput] = useState('');
  const [savingHeight, setSavingHeight] = useState(false);
  const [editingHeight, setEditingHeight] = useState(false);

  const [editingInfo, setEditingInfo] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editGender, setEditGender] = useState('male');
  const [editDob, setEditDob] = useState('');
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoErr, setInfoErr] = useState('');

  useEffect(() => { fetchData(); }, [patientId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/'); return; }
      const pid = await getPharmacyId();
      if (!pid) throw new Error('تعذّر تحديد الصيدلية');

      const { data: patientData, error: patientError } = await supabase
        .from('patients').select('*').eq('id', patientId).eq('pharmacy_id', pid).single();
      if (patientError || !patientData) throw new Error('لم يتم العثور على هذا المريض');

      setPatient(patientData as PatientDetail);
      setHeightInput(patientData.height ? String(patientData.height) : '');

      const { data: visitsData } = await supabase
        .from('visitations').select('*').eq('patient_id', patientId).eq('pharmacy_id', pid).order('created_at', { ascending: false });
      setVisits((visitsData as Visit[]) || []);

      const { data: medsData } = await supabase
        .from('chronic_medications')
        .select('id, medication_name, daily_dosage, dosage_unit, pills_per_box, boxes_count')
        .eq('patient_id', patientId)
        .eq('pharmacy_id', pid)
        .eq('status', 'active');
      setChronicMeds((medsData as ChronicMed[]) || []);

      // خطط إدارة الوزن السابقة — استعلام مباشر كبقية الصفحة، RLS تعزل بالصيدلية
      const { data: weightPlansData } = await supabase
        .from('weight_plans')
        .select('id, weight_kg, bmi, bmi_category, target_loss_kg, first_goal_kg, nutrition_plan, plan_generated_at, created_at')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });
      setWeightPlans((weightPlansData as WeightPlan[]) || []);

    } catch (err: any) {
      setErrorMsg(err.message || 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveHeight = async () => {
    if (!patient) return;
    setSavingHeight(true);
    try {
      const newHeight = heightInput ? Number(heightInput) : null;
      await supabase.from('patients').update({ height: newHeight }).eq('id', patient.id);
      setPatient({ ...patient, height: newHeight });
    } catch { alert('تعذر حفظ الطول'); }
    finally { setSavingHeight(false); }
  };

  const startEditInfo = () => {
    if (!patient) return;
    setEditName(patient.name);
    setEditPhone(patient.phone_number);
    setEditGender(patient.gender);
    setEditDob(patient.birth_date);
    setInfoErr('');
    setEditingInfo(true);
  };

  const saveInfo = async () => {
    if (!patient) return;
    if (!editName.trim()) { setInfoErr('يرجى إدخال اسم المريض'); return; }
    const phoneCheck = validatePhone(editPhone);
    if (!phoneCheck.valid) { setInfoErr(phoneCheck.message || 'رقم الهاتف غير صحيح'); return; }
    setSavingInfo(true); setInfoErr('');
    try {
      const updated = {
        name: editName.trim(),
        phone_number: normalizePhone(editPhone),
        gender: editGender,
        birth_date: editDob,
      };
      const { error } = await supabase.from('patients').update(updated).eq('id', patient.id);
      if (error) throw new Error('تعذر الحفظ — تأكد من عدم تكرار رقم الهاتف');
      setPatient({ ...patient, ...updated });
      setEditingInfo(false);
    } catch (e: any) { setInfoErr(e.message); }
    finally { setSavingInfo(false); }
  };

  const filteredVisits = visits.filter((v) => {
    if (visitFilter === 'bp')     return v.bp_systolic != null;
    if (visitFilter === 'sugar')  return v.sugar_value != null;
    if (visitFilter === 'weight') return v.weight != null;
    return true;
  });
  const VISITS_PREVIEW = 5;
  const visitsToShow = showAllVisits ? filteredVisits : filteredVisits.slice(0, VISITS_PREVIEW);

  const handleDownloadHistoryPdf = async () => {
    if (!patient) return;
    setPdfGenerating(true);

    const headerHtml = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #059669; padding-bottom: 12px; margin-bottom: 20px;">
        <div style="font-size: 22px; font-weight: 900; color: #0F172A;">Vitalix<span style="color: #0D9488;">.ai</span></div>
        <div style="background: #ECFDF5; border: 1px solid #A7F3D0; color: #065F46; padding: 6px 14px; border-radius: 10px; font-size: 12px; font-weight: bold;">👨‍⚕️ سجل القراءات الكاملة للطبيب المعالج</div>
      </div>
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; padding: 12px 18px; border-radius: 12px; margin-bottom: 20px; font-size: 12px; display: flex; justify-content: space-between; font-weight: bold;">
        <div>اسم المريض: ${patient.name}</div>
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

    const footerHtml = `<div style="margin-top: 35px; border-top: 1px solid #E2E8F0; padding-top: 12px; text-align: center; font-size: 11px; color: #64748B;">تم توثيق سجل القراءات آلياً عبر منصة Vitalix.ai لصالح (${pharmacyName})</div>`;

    try {
      if (filteredVisits.length === 0) {
        const container = document.createElement('div');
        container.setAttribute('dir', 'rtl');
        container.style.cssText =
          'position: fixed; top: -99999px; left: 0; width: 700px; background: #fff; font-family: system-ui, -apple-system, sans-serif; padding: 35px; color: #0F172A;';
        container.innerHTML = `
          ${headerHtml}
          <div style="padding: 30px; text-align: center; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; color: #64748B; font-size: 12px;">
            لا توجد قراءات موثقة لهذا المريض ضمن هذا الفلتر.
          </div>
          ${footerHtml}
        `;
        document.body.appendChild(container);
        try {
          await renderElementToPdf(container, `سجل-قراءات-${patient.name}.pdf`);
        } finally {
          document.body.removeChild(container);
        }
      } else {
        const rowsHtml = filteredVisits.map((visit) => `
          <tr>
            <td style="padding: 10px; border: 1px solid #E2E8F0; font-family: monospace;">
              ${formatDate(visit.created_at)} (${formatTime(visit.created_at)})
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

        await renderHistoryTableToPdf(headerHtml, theadHtml, rowsHtml, footerHtml, `سجل-قراءات-${patient.name}.pdf`);
      }
    } catch (err: any) {
      console.error('[PDF] خطأ فعلي أثناء التوليد:', err);
      alert('حدث خطأ أثناء توليد ملف PDF:\n' + (err?.message || String(err)));
    } finally {
      setPdfGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50/50 flex items-center justify-center" dir="rtl">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="min-h-screen bg-slate-50/50 flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white border border-slate-200 p-6 rounded-2xl max-w-sm w-full text-center space-y-3 shadow-sm">
          <p className="text-sm text-rose-600 font-bold">{errorMsg}</p>
          <button onClick={() => router.push('/dashboard/vitals')} className="text-xs text-teal-600 font-semibold">← العودة</button>
        </div>
      </div>
    );
  }

  const age = calculateAge(patient.birth_date);
  const lastVisit = visits[0];
  const conditions = patient.diagnosed_conditions || [];
  const whatsappUrl = `https://wa.me/${normalizePhone(patient.phone_number)}`;
  const callUrl = `tel:+${normalizePhone(patient.phone_number)}`;

  return (
    <div className="min-h-screen bg-slate-50/50 antialiased pb-16" dir="rtl">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&display=swap');
        body { font-family: 'IBM Plex Sans Arabic', system-ui, sans-serif; }
        @keyframes saasSlideUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .slide-up { animation: saasSlideUp 0.25s ease both; }
      `}</style>

      <DashboardHeader breadcrumb="كرت المريض" onBack={() => router.back()} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-12 slide-up">

        {/* ── هوية المريض — يمتد فوق العمودين ── */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {editingInfo ? (
              <div className="flex-1 space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="الاسم الكامل"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
                  <input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="رقم الهاتف" dir="ltr"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900 font-mono text-left" />
                </div>
                <p className="text-[11px] text-slate-400">للأرقام خارج الأردن ابدأ بمفتاح الدولة — مثال: 00966501234567</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="flex bg-slate-100 p-1 rounded-lg w-fit">
                    {[{ v: 'male', l: 'ذكر' }, { v: 'female', l: 'أنثى' }].map(g => (
                      <button key={g.v} type="button" onClick={() => setEditGender(g.v)}
                        className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${editGender === g.v ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>
                        {g.l}
                      </button>
                    ))}
                  </div>
                  <input type="date" value={editDob} onChange={e => setEditDob(e.target.value)}
                    className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
                </div>
                {infoErr && <p className="text-xs text-rose-600 font-medium bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">{infoErr}</p>}
                <div className="flex gap-2">
                  <button onClick={saveInfo} disabled={savingInfo}
                    className="px-4 py-2 bg-gradient-to-l from-slate-900 to-teal-800 text-white rounded-lg text-xs font-bold disabled:opacity-50 cursor-pointer">
                    {savingInfo ? 'جاري الحفظ...' : 'حفظ'}
                  </button>
                  <button onClick={() => setEditingInfo(false)}
                    className="px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold cursor-pointer">
                    إلغاء
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center text-xl font-black shrink-0">
                  {patient.name.trim().charAt(0)}
                </div>
                <div>
                  <h1 className="text-lg font-bold text-slate-900">{patient.name}</h1>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className="text-[11px] font-medium text-slate-500">
                      {patient.gender === 'female' ? 'أنثى' : 'ذكر'}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="text-[11px] font-medium text-slate-500">{age} سنة</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-[11px] font-medium text-slate-500">منذ {formatDate(patient.created_at)}</span>
                    {conditions.includes('hypertension') && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                        <IconHeart className="w-3 h-3" /> ضغط
                      </span>
                    )}
                    {conditions.includes('diabetes') && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                        <IconDroplet className="w-3 h-3" /> سكري
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* أزرار التواصل */}
            <div className="flex items-center gap-2 shrink-0">
              {!editingInfo && (
                <button onClick={startEditInfo}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition cursor-pointer">
                  ✎ تعديل
                </button>
              )}
              <a href={callUrl}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition">
                <IconPhone className="w-3.5 h-3.5" />
                <span className="font-mono">{displayPhone(patient.phone_number)}</span>
              </a>
              <a href={whatsappUrl} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 px-3.5 py-2 bg-[#25D366] hover:bg-[#20BD5A] text-white rounded-xl text-xs font-bold transition shadow-sm">
                <IconWhatsApp className="w-3.5 h-3.5" />
                <span>واتساب</span>
              </a>
            </div>
          </div>

          {/* إحصاءات سريعة */}
          <div className="border-t border-slate-100 grid grid-cols-3 divide-x divide-x-reverse divide-slate-100">
            <div className="px-5 py-3.5 text-center">
              <p className="text-[10px] font-bold text-slate-400 mb-1">إجمالي الزيارات</p>
              <p className="text-sm font-black text-slate-900">{visits.length}</p>
            </div>
            <div className="px-5 py-3.5 text-center">
              <p className="text-[10px] font-bold text-slate-400 mb-1">آخر زيارة</p>
              <p className="text-sm font-black text-slate-900">{lastVisit ? formatDate(lastVisit.created_at) : '—'}</p>
            </div>
            {/* خانة الطول التفاعلية */}
            <div className="px-4 py-3 text-center">
              <p className="text-[10px] font-bold text-slate-400 mb-1.5">الطول</p>
              {editingHeight ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number" value={heightInput} autoFocus
                    onChange={e => setHeightInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { handleSaveHeight(); setEditingHeight(false); } if (e.key === 'Escape') setEditingHeight(false); }}
                    placeholder="سم"
                    className="w-full px-2 py-1 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900 transition font-mono text-center text-slate-900"
                  />
                  <button onClick={async () => { await handleSaveHeight(); setEditingHeight(false); }}
                    disabled={savingHeight}
                    className="px-2 py-1 bg-slate-900 text-white rounded-lg text-[10px] font-bold shrink-0 transition disabled:opacity-50">
                    {savingHeight ? '...' : '✓'}
                  </button>
                </div>
              ) : patient.height ? (
                <button onClick={() => setEditingHeight(true)}
                  className="group flex items-center justify-center gap-1 mx-auto">
                  <span className="text-sm font-black text-slate-900 group-hover:text-slate-600 transition">{patient.height} سم</span>
                  <svg className="w-3 h-3 text-slate-300 group-hover:text-slate-500 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              ) : (
                <button onClick={() => setEditingHeight(true)}
                  className="text-[11px] font-bold text-slate-400 hover:text-teal-600 transition">
                  + إضافة
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ════ عمودان ════ */}
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5 items-start">

          {/* ══ العمود الأيمن: البيانات الثابتة ══ */}
          <div className="space-y-4 lg:sticky lg:top-4 self-start min-w-0">

            {/* الأدوية المزمنة */}
            {chronicMeds.length > 0 && (
              <div className="bg-white border border-amber-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 bg-amber-50/40 border-b border-amber-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                    </svg>
                    <p className="text-sm font-bold text-slate-900">الأدوية المزمنة</p>
                    <span className="text-[11px] font-bold text-amber-700">{chronicMeds.length} دواء</span>
                  </div>
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-md">للاطلاع فقط</span>
                </div>
                <div className="p-4 space-y-2">
                  {chronicMeds.map(med => (
                    <div key={med.id} className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
                      <span className="text-xs font-bold text-slate-800">{med.medication_name}</span>
                      {med.daily_dosage && med.dosage_unit && (
                        <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-md shrink-0">
                          {med.daily_dosage} {translateUnit(med.dosage_unit)}/يوم
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* حالة: لا أدوية مزمنة */}
            {chronicMeds.length === 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm px-5 py-4 text-center">
                <p className="text-xs text-slate-400 font-medium">لا توجد أدوية مزمنة مسجلة</p>
              </div>
            )}
          </div>

          {/* ══ العمود الأيسر: السجل الطبي ══ */}
          <div>
        {/* ── السجل الطبي ── */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm font-bold text-slate-900">السجل الطبي الكامل</p>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-400">{visits.length} زيارة</span>
              {visits.length > 0 && (
                <button
                  onClick={handleDownloadHistoryPdf}
                  disabled={pdfGenerating}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-l from-slate-900 to-teal-800 hover:from-slate-800 hover:to-teal-700 text-white rounded-lg text-[11px] font-bold transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                  <IconDownload className="w-3.5 h-3.5" />
                  {pdfGenerating ? 'جاري التحضير...' : 'تنزيل PDF'}
                </button>
              )}
            </div>
          </div>

          {visits.length > 0 && (
            <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap gap-2">
              {([
                { key: 'all', label: 'الكل', count: visits.length },
                { key: 'bp', label: 'ضغط', count: visits.filter(v => v.bp_systolic != null).length },
                { key: 'sugar', label: 'سكري', count: visits.filter(v => v.sugar_value != null).length },
                { key: 'weight', label: 'وزن', count: visits.filter(v => v.weight != null).length },
              ] as const).map(f => {
                const active = visitFilter === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => { setVisitFilter(f.key); setShowAllVisits(false); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border transition cursor-pointer ${
                      active ? 'bg-teal-50 border-teal-600 text-teal-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}>
                    {f.label}
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${active ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                      {f.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {visits.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-slate-400 font-medium">لا توجد زيارات موثَّقة بعد</p>
            </div>
          ) : filteredVisits.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-slate-400 font-medium">لا توجد زيارات تحتوي على هذا النوع من القراءات</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {visitsToShow.map((v, idx) => {
                const isOpen = expandedVisitId === v.id;
                const bmi = bmiCalc(v.weight, patient.height);
                const vstatus = getVisitStatus(v);
                const factors = [
                  v.had_stimulants && 'منبهات',
                  v.recent_exertion && 'مجهود بدني',
                  v.recent_heavy_meal && 'وجبة دسمة',
                  v.is_stressed && 'توتر',
                  v.took_medication && 'أخذ الدواء',
                ].filter(Boolean) as string[];

                return (
                  <div key={v.id}>
                    {/* رأس الزيارة */}
                    <button
                      onClick={() => setExpandedVisitId(isOpen ? null : v.id)}
                      className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50/60 transition-colors text-right">
                      <div className="flex items-center gap-3 flex-wrap min-w-0">
                        <div className="flex flex-col items-start">
                          <span className="text-[11px] font-bold text-slate-400">{formatDate(v.created_at)} — {formatTime(v.created_at)}</span>
                          {idx === 0 && (
                            <span className="text-[9px] font-bold text-teal-600 mt-0.5">الأحدث</span>
                          )}
                          {v.performed_by && (
                            <span className="text-[9px] text-slate-400 mt-0.5">بواسطة: {v.performed_by}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {v.bp_systolic && (
                            <span className="flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg">
                              <IconHeart className="w-3 h-3" />
                              {v.bp_systolic}/{v.bp_diastolic}
                              {v.is_dual_bp && <span className="text-[9px] text-blue-400 font-normal">مزدوج</span>}
                            </span>
                          )}
                          {v.heart_rate && (
                            <span className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg border ${
                              v.heart_rate < 60 ? 'text-amber-700 bg-amber-50 border-amber-100' :
                              v.heart_rate > 100 ? 'text-rose-700 bg-rose-50 border-rose-100' :
                              'text-rose-700 bg-rose-50 border-rose-100'
                            }`}>
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z"/>
                              </svg>
                              {v.heart_rate} <span className="text-[9px] font-normal opacity-70">ن/د</span>
                            </span>
                          )}
                          {v.sugar_value && (
                            <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg">
                              <IconDroplet className="w-3 h-3" />
                              {v.sugar_value}
                              {v.sugar_test_type && <span className="text-[9px] text-emerald-400 font-normal">{sugarTypeLabel(v.sugar_test_type)}</span>}
                            </span>
                          )}
                          {v.weight && (
                            <span className="flex items-center gap-1 text-xs font-bold text-purple-700 bg-purple-50 border border-purple-100 px-2.5 py-1 rounded-lg">
                              <IconScale className="w-3 h-3" />
                              {v.weight} kg
                              {bmi && <span className="text-[9px] text-purple-400 font-normal">BMI {bmi}</span>}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {(v.bp_systolic || v.sugar_value) && (
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${vstatus.dot}`} />
                            <span className={`text-[10px] font-bold hidden sm:block ${vstatus.color}`}>{vstatus.label}</span>
                          </div>
                        )}
                        <IconChevron className="w-4 h-4 text-slate-400 shrink-0" open={isOpen} />
                      </div>
                    </button>

                    {/* تفاصيل الزيارة */}
                    {isOpen && (
                      <div className="px-5 pb-5 space-y-3 border-t border-slate-100 bg-slate-50/30">

                        {/* الأعراض */}
                        {v.symptoms && v.symptoms.length > 0 && (
                          <div className="pt-4">
                            <p className="text-[10px] font-bold text-slate-400 mb-2">الأعراض المصاحبة</p>
                            <div className="flex flex-wrap gap-1.5">
                              {v.symptoms.map(s => (
                                <span key={s} className="text-[11px] font-bold text-slate-700 bg-white border border-slate-200 px-2.5 py-1 rounded-lg">{s}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* العوامل المؤثرة */}
                        {factors.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 mb-2">عوامل مؤثرة على القراءة</p>
                            <div className="flex flex-wrap gap-1.5">
                              {factors.map(f => (
                                <span key={f} className="text-[11px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg">{f}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* التقرير الذكي */}
                        {v.performed_by && (
                          <p className="text-[10px] text-slate-400 font-medium pt-2 border-t border-slate-100">
                            أجرى هذا الفحص: <span className="font-bold text-slate-600">{v.performed_by}</span>
                          </p>
                        )}
                        {v.ai_report_output && (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-[10px] font-bold text-slate-400">التقرير الذكي</p>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={(e) => { e.stopPropagation(); window.open(`/vitals/view/${v.id}`, '_blank'); }}
                                  className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg hover:bg-teal-100 transition cursor-pointer">
                                  عرض صفحة المريض
                                </button>
                                <a href={`https://wa.me/${normalizePhone(patient.phone_number)}?text=${encodeURIComponent(v.ai_report_output)}`}
                                  target="_blank" rel="noreferrer"
                                  className="flex items-center gap-1 text-[10px] font-bold text-[#25D366] hover:underline">
                                  <IconWhatsApp className="w-3 h-3" />
                                  إرسال للمريض
                                </a>
                              </div>
                            </div>
                            <div
                              className="bg-white border border-slate-200 rounded-xl p-4 text-[11px] text-slate-700 leading-relaxed font-medium"
                              dir={detectTextDir(v.ai_report_output)}
                              style={{ textAlign: detectTextDir(v.ai_report_output) === 'ltr' ? 'left' : 'right' }}
                            >
                              {v.ai_report_output}
                            </div>
                            <div className="mt-3">
                              <Disclaimer variant="pharmacist" />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {filteredVisits.length > VISITS_PREVIEW && (
            <div className="px-5 py-3 border-t border-slate-100">
              <button
                onClick={() => setShowAllVisits(v => !v)}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-slate-50 hover:bg-teal-50 border border-slate-200 hover:border-teal-200 rounded-xl text-xs font-bold text-teal-700 transition cursor-pointer">
                {showAllVisits ? (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                    </svg>
                    إخفاء الزيارات القديمة
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                    عرض جميع الزيارات ({filteredVisits.length})
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* ── خطط إدارة الوزن ── */}
        {weightPlans.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mt-4">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm font-bold text-slate-900">خطط إدارة الوزن</p>
              <span className="text-[11px] font-bold text-slate-400">{weightPlans.length} خطة</span>
            </div>
            <div className="divide-y divide-slate-100">
              {weightPlans.map((wp) => {
                const isOpen = expandedPlanId === wp.id;
                const nutrition = wp.nutrition_plan;
                return (
                  <div key={wp.id}>
                    {/* رأس الخطة */}
                    <div
                      onClick={() => setExpandedPlanId(isOpen ? null : wp.id)}
                      className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50/60 transition-colors cursor-pointer">
                      <div className="flex items-center gap-3 flex-wrap min-w-0">
                        <span className="text-[11px] font-bold text-slate-400">{formatDate(wp.created_at)}</span>
                        <span className="flex items-center gap-1 text-xs font-bold text-purple-700 bg-purple-50 border border-purple-100 px-2.5 py-1 rounded-lg">
                          <IconScale className="w-3 h-3" />
                          {wp.weight_kg} kg
                          <span className="text-[9px] text-purple-400 font-normal">BMI {wp.bmi}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); window.open(`/weight/${wp.id}`, '_blank'); }}
                          className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg hover:bg-teal-100 transition cursor-pointer">
                          فتح الخطة
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); window.open(`https://api.whatsapp.com/send?phone=${normalizePhone(patient.phone_number)}&text=${encodeURIComponent(`مرحباً ${patient.name} 😊\nمعكم ${pharmacyName}.\nخطتك الغذائية بتاريخ ${formatDate(wp.created_at)}:\n${window.location.origin}/weight/${wp.id}\nنسعد بخدمتكم دائماً 💚`)}`, '_blank'); }}
                          className="text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-lg hover:bg-green-100 transition cursor-pointer">
                          إرسال واتساب
                        </button>
                        <IconChevron className="w-4 h-4 text-slate-400 shrink-0" open={isOpen} />
                      </div>
                    </div>

                    {/* تفاصيل الخطة — للمراجعة الصيدلانية */}
                    {isOpen && (
                      <div className="px-5 pb-5 space-y-3 border-t border-slate-100 bg-slate-50/30 pt-4">
                        {!nutrition ? (
                          <p className="text-xs text-slate-400 font-medium">لم تُولَّد بعد</p>
                        ) : !nutrition.clinical_reasoning && !nutrition.drug_matching && !nutrition.progress ? (
                          <p className="text-xs text-slate-400 font-medium">خطة أُنشئت قبل إضافة التحليل السريري — لا تفاصيل مراجعة لها</p>
                        ) : (
                          <>
                            {nutrition.clinical_reasoning && (
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 mb-2">التحليل السريري</p>
                                <div className="bg-white border border-slate-200 rounded-xl p-4 text-[11px] text-slate-700 leading-relaxed font-medium">
                                  {nutrition.clinical_reasoning}
                                </div>
                              </div>
                            )}

                            {nutrition.drug_matching && (
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 mb-2">مطابقة الأدوية</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {nutrition.drug_matching.matched.map((m) => (
                                    <span key={m} className="text-[11px] font-bold text-slate-700 bg-white border border-slate-200 px-2.5 py-1 rounded-lg">{m}</span>
                                  ))}
                                  {nutrition.drug_matching.unknown.map((u) => (
                                    <span key={u} className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">{u}</span>
                                  ))}
                                </div>
                                {nutrition.drug_matching.unknown.length > 0 && (
                                  <p className="text-[10px] text-amber-600 font-medium mt-1.5">لم يطابقها النظام — تحذيراتها لم تصل الخطة</p>
                                )}
                              </div>
                            )}

                            {nutrition.progress && (
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 mb-2">التقدّم</p>
                                <div className="flex flex-wrap gap-1.5">
                                  <span className="text-[11px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg">
                                    منذ آخر زيارة: {nutrition.progress.diffFromPrevious > 0 ? '+' : ''}{nutrition.progress.diffFromPrevious} كغ خلال {nutrition.progress.daysSincePrevious} يوماً
                                  </span>
                                  <span className="text-[11px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg">
                                    منذ البداية: {nutrition.progress.diffFromBaseline > 0 ? '+' : ''}{nutrition.progress.diffFromBaseline} كغ خلال {nutrition.progress.daysSinceBaseline} يوماً
                                  </span>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
          </div>
        </div>

      </main>

      <AppFooter className="max-w-5xl mx-auto px-6 py-8 border-t border-slate-200/60 mt-4" />
    </div>
  );
}
