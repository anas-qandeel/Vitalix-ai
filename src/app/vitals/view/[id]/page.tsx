'use client';

import { useEffect, useState, use } from 'react';
import { Storefront, HeartStraight, Drop, Barbell, WhatsappLogo } from '@phosphor-icons/react';
import AppFooter from '../../../components/AppFooter';
import Disclaimer from '@/components/Disclaimer';
import { detectTextDir } from '@/lib/text-direction';
import BpHistoryChart from '@/components/BpHistoryChart';
import SugarHistoryChart from '@/components/SugarHistoryChart';
import { overallVisitStatus, type VitalLevel } from '@/lib/vitals-classify';

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
  heart_rate: number | null;
  is_dual_bp?: boolean | null;
  bp_sys1?: number | null;
  bp_dia1?: number | null;
  hr1?: number | null;
  bp_sys2?: number | null;
  bp_dia2?: number | null;
  hr2?: number | null;
  took_bp_medication?: boolean | null;
  took_sugar_medication?: boolean | null;
  bp_classification?: string | null;
  bp_classification_level?: string | null;
  sugar_classification?: string | null;
  sugar_classification_level?: string | null;
  heart_rate_classification?: string | null;
  heart_rate_classification_level?: string | null;
  classification_special_criteria?: string | null;
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

function formatDateManual(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
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

// ── التصنيف المعتمد: يُقرأ محفوظاً من الزيارة كما اعتمده الصيدلاني لحظة الفحص —
// لا حساب محلي إطلاقاً. المرجع الوحيد: src/lib/vitals-classify.ts عبر ما حُفظ في DB.
// زيارة بلا تصنيف محفوظ (قبل تفعيل النظام) → بطاقة محايدة بلا شارة.
const LEVEL_STYLES: Record<string, { topColor: string; badgeBg: string; badgeColor: string }> = {
  green:  { topColor: '#0d9488', badgeBg: '#ccfbf1', badgeColor: '#0f766e' },
  yellow: { topColor: '#f59e0b', badgeBg: '#fef3c7', badgeColor: '#92400e' },
  red:    { topColor: '#ef4444', badgeBg: '#fee2e2', badgeColor: '#991b1b' },
};
const NEUTRAL_STYLE = { topColor: '#e2e8f0', badgeBg: '#f1f5f9', badgeColor: '#64748b' };

function storedVisitStatus(v: { bp_classification_level?: string | null; sugar_classification_level?: string | null; weight?: number | null; patient?: { height?: number | null } | null }) {
  const bmiRaw = (v.weight && v.patient?.height)
    ? v.weight / ((v.patient.height / 100) ** 2)
    : null;
  if (!v.bp_classification_level && !v.sugar_classification_level && bmiRaw === null) return null;
  const s = overallVisitStatus(
    (v.bp_classification_level as VitalLevel) ?? null,
    (v.sugar_classification_level as VitalLevel) ?? null,
    bmiRaw
  );
  const showReasons = s.reasons.length > 0 && s.label !== 'ضمن الطبيعي';
  if (s.level === 'high')   return { label: s.label, reasons: showReasons ? s.reasons : [], border: '#fecdd3', bg: '#fff1f2', dot: '#f43f5e', color: '#e11d48' };
  if (s.level === 'medium') return { label: s.label, reasons: showReasons ? s.reasons : [], border: '#fde68a', bg: '#fffbeb', dot: '#f59e0b', color: '#d97706' };
  return { label: s.label, reasons: [], border: '#99f6e4', bg: '#f0fdfa', dot: '#14b8a6', color: '#0d9488' };
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

function IconWhatsapp({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

export default function SingleVitalViewPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const visitId = resolvedParams.id;

  const [loading, setLoading] = useState(true);
  const [currentVisit, setCurrentVisit] = useState<VisitationRecord | null>(null);
  const [patientHistory, setPatientHistory] = useState<VisitationRecord[]>([]);
  const [pharmacyName, setPharmacyName] = useState<string>('');
  const [pharmacyPhone, setPharmacyPhone] = useState<string>('');
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [relatedWeightPlanId, setRelatedWeightPlanId] = useState<string | null>(null);
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
      setRelatedWeightPlanId(data.relatedWeightPlanId || null);
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
  const currentStatus = currentVisit ? storedVisitStatus(currentVisit) : null;
  const currentBmi = currentVisit ? bmiCalc(currentVisit.weight, currentVisit.patient?.height) : null;
  const patientAge = currentVisit?.patient?.birth_date
    ? new Date().getFullYear() - new Date(currentVisit.patient.birth_date).getFullYear()
    : null;

  // اسم الصيدلية المعروض: إذا جاء بدون "صيدلية" نضيفها، وإذا كان فارغاً نضع fallback
  const displayPharmacyName = pharmacyName
    ? (pharmacyName.startsWith('صيدلية') ? pharmacyName : `صيدلية ${pharmacyName}`)
    : 'صيدليتك المعتمدة';

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
        .slide-up { animation: saasSlideUp 0.25s ease both; }

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

      {/* ══════════════════════════════════════════════
          HEADER — gradient مع هيكل واضح الأولويات
      ══════════════════════════════════════════════ */}
      <header style={{ maxWidth: 860, margin: '0 auto', padding: '20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, background: '#0f172a', borderRadius: 11,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Storefront size={20} weight="duotone" color="#fff" />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayPharmacyName}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, color: '#64748b' }}>مستشارك الصحي الموثوق</span>
              <span style={{ fontSize: 11.5, color: '#475569', background: '#f1f5f9', padding: '3px 11px', borderRadius: 20 }}>نتائج الفحص</span>
            </div>
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════
          MAIN CONTENT
      ══════════════════════════════════════════════ */}
      <main
        className="slide-up"
        style={{ maxWidth: 860, margin: '0 auto', padding: '0 16px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}
      >

        {/* ─── بطاقة المريض ─── */}
        <div className="vcard" style={{ overflow: 'hidden', padding: 0 }}>
          <div style={{
            background: '#f8fafc', padding: '16px 20px', borderBottom: '1px solid #f1f5f9',
            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%', background: '#f1f5f9',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <svg style={{ width: 20, height: 20, color: '#94a3b8' }} viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="8" r="3.5" />
                  <path d="M5 21c0-4.42 3.13-8 7-8s7 3.58 7 8" />
                </svg>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#0f172a' }}>
                  {currentVisit.patient?.name || 'المريض'}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>
                  {currentVisit.patient?.gender === 'female' ? 'أنثى' : currentVisit.patient?.gender === 'male' ? 'ذكر' : ''}
                  {patientAge ? ` · ${patientAge} سنة` : ''}
                  {[currentVisit.bp_systolic != null && 'ضغط', currentVisit.sugar_value != null && 'سكري'].filter(Boolean).length > 0
                    ? ` · ${[currentVisit.bp_systolic != null && 'ضغط', currentVisit.sugar_value != null && 'سكري'].filter(Boolean).join(' · ')}`
                    : ''}
                  {' · '}
                  <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{formatDateManual(currentVisit.created_at)}</span>
                </p>
              </div>
            </div>
            {currentStatus && (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                  borderRadius: 8, border: `1px solid ${currentStatus.border}`, background: currentStatus.bg,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: currentStatus.dot, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: currentStatus.color }}>{currentStatus.label}</span>
                </div>
                {currentStatus.reasons.length > 0 && (
                  <span style={{ fontSize: 10, color: '#64748b' }}>
                    بسبب: {currentStatus.reasons.join('، ')}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ─── صف القراءات الموحد ─── */}
          {(currentVisit.bp_systolic != null || currentVisit.sugar_value != null) && (
          <div style={{ padding: '20px 20px 16px', borderTop: '1px solid #f1f5f9' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: (currentVisit.bp_systolic != null && currentVisit.sugar_value != null)
                ? 'repeat(2, minmax(0, 1fr))' : '1fr',
              gap: 16,
            }}>
              {currentVisit.bp_systolic != null && (
                <div>
                  <p style={{ margin: 0, lineHeight: 1 }}>
                    <span dir="ltr" style={{ fontSize: 34, fontWeight: 900, color: '#0f172a' }}>{currentVisit.bp_systolic}/{currentVisit.bp_diastolic}</span>
                    <span style={{ fontSize: 13, color: '#94a3b8', marginRight: 6 }}>مم زئبق</span>
                  </p>
                  {currentVisit.is_dual_bp && currentVisit.bp_sys1 != null && currentVisit.bp_sys2 != null && (
                    <p style={{ margin: '6px 0 0', fontSize: 11, color: '#94a3b8' }} dir="ltr">
                      {currentVisit.bp_sys1}/{currentVisit.bp_dia1} ← {currentVisit.bp_sys2}/{currentVisit.bp_dia2}
                    </p>
                  )}
                  <div style={{ height: 1, background: '#e2e8f0', margin: '14px 0' }} />
                  <div style={{ display: 'flex', textAlign: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: (currentVisit.heart_rate_classification_level === 'yellow' || currentVisit.heart_rate_classification_level === 'red') ? '#d97706' : '#0f172a' }}>
                        {currentVisit.heart_rate ?? '—'}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>
                        {currentVisit.heart_rate != null && currentVisit.heart_rate_classification ? `${currentVisit.heart_rate_classification} · نبض/دقيقة` : 'نبض/دقيقة'}
                      </p>
                    </div>
                    <div style={{ width: 1, background: '#e2e8f0' }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: currentVisit.bp_classification_level === 'red' ? '#e11d48' : currentVisit.bp_classification_level === 'yellow' ? '#d97706' : '#0f766e' }}>
                        {currentVisit.bp_classification ?? '—'}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>تصنيف الضغط</p>
                    </div>
                  </div>
                  {currentVisit.took_bp_medication != null && (
                    <p style={{ margin: '12px 0 0', fontSize: 11, color: '#94a3b8' }}>
                      دواء الضغط اليوم: <span style={{ fontWeight: 600, color: currentVisit.took_bp_medication ? '#0f766e' : '#94a3b8' }}>
                        {currentVisit.took_bp_medication ? 'أُخذ' : 'لم يُؤخذ'}
                      </span>
                    </p>
                  )}
                </div>
              )}
              {currentVisit.sugar_value != null && (
                <div style={(currentVisit.bp_systolic != null) ? { borderRight: '1px solid #e2e8f0', paddingRight: 16 } : undefined}>
                  <p style={{ margin: 0, lineHeight: 1 }}>
                    <span dir="ltr" style={{ fontSize: 34, fontWeight: 900, color: '#0f172a' }}>{currentVisit.sugar_value}</span>
                    <span style={{ fontSize: 13, color: '#94a3b8', marginRight: 6 }}>mg/dL</span>
                  </p>
                  <div style={{ height: 1, background: '#e2e8f0', margin: '14px 0' }} />
                  <div style={{ display: 'flex', textAlign: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#334155' }}>
                        {sugarTypeLabel(currentVisit.sugar_test_type)}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>نوع القراءة</p>
                    </div>
                    <div style={{ width: 1, background: '#e2e8f0' }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 16, fontWeight: 900, color: currentVisit.sugar_classification_level === 'red' ? '#e11d48' : currentVisit.sugar_classification_level === 'yellow' ? '#d97706' : '#0f766e' }}>
                        {currentVisit.sugar_classification ?? '—'}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>تصنيف السكري</p>
                    </div>
                  </div>
                  {currentVisit.took_sugar_medication != null && (
                    <p style={{ margin: '12px 0 0', fontSize: 11, color: '#94a3b8' }}>
                      دواء السكري اليوم: <span style={{ fontWeight: 600, color: currentVisit.took_sugar_medication ? '#0f766e' : '#94a3b8' }}>
                        {currentVisit.took_sugar_medication ? 'أُخذ' : 'لم يُؤخذ'}
                      </span>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          )}
          {patientHistory.filter(v => v.bp_systolic != null && v.bp_diastolic != null).length >= 2 && (
          <div style={{ padding: 16, borderTop: '1px solid #f1f5f9' }}>
            <BpHistoryChart
              bpHistory={patientHistory.filter((v): v is typeof v & { bp_systolic: number; bp_diastolic: number } => v.bp_systolic != null && v.bp_diastolic != null).slice().reverse()}
              formatDate={formatDate}
            />
          </div>
          )}
          {patientHistory.filter(v => v.sugar_value != null).length >= 2 && (
          <div style={{ padding: 16, borderTop: '1px solid #f1f5f9' }}>
            <SugarHistoryChart
              sugarHistory={patientHistory.filter((v): v is typeof v & { sugar_value: number } => v.sugar_value != null).slice().reverse()}
              formatDate={formatDate}
            />
          </div>
          )}
        </div>
        {currentVisit.classification_special_criteria && (
          <div style={{ padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 11.5, color: '#64748b', lineHeight: 1.6 }}>
            ℹ️ {currentVisit.classification_special_criteria}
          </div>
        )}

        {/* ─── رسالة الصيدلاني ─── */}
        <section className="vcard" style={{ padding: 0, overflow: 'hidden' }}>
          {/* رأس أخضر */}
          <div style={{
            background: '#f0fdf4', padding: '14px 20px',
            display: 'flex', alignItems: 'center', gap: 10,
            borderBottom: '1px solid #dcfce7',
          }}>
            <div style={{
              width: 32, height: 32, background: '#085041', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#14532d', margin: 0 }}>رسالة من {displayPharmacyName}</p>
              <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>موجّهة لك شخصياً</p>
            </div>
          </div>
          {/* نص الرسالة */}
          <div style={{ padding: '18px 20px 20px' }}>
            <div
              dir={detectTextDir(currentVisit.ai_report_output)}
              style={{
                fontSize: 14,
                color: '#334155',
                lineHeight: 1.9,
                whiteSpace: 'pre-line',
                textAlign: detectTextDir(currentVisit.ai_report_output) === 'ltr' ? 'left' : 'right',
              }}
            >
              {currentVisit.ai_report_output}
            </div>
            {currentVisit.symptoms && currentVisit.symptoms.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 6px' }}>الأعراض التي ذكرتها:</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {currentVisit.symptoms.map((s, i) => (
                    <span
                      key={i}
                      style={{
                        background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#475569',
                        borderRadius: 20, padding: '3px 11px', fontSize: 12,
                      }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {relatedWeightPlanId && (
          <section className="vcard" style={{ padding: '20px 24px' }}>
            <a href={`/weight/${relatedWeightPlanId}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', textDecoration: 'none', color: 'inherit' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>خطة إدارة الوزن من نفس الزيارة</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9m0 0v9m0-9L10.5 15" />
              </svg>
            </a>
          </section>
        )}

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

        {/* ─── 3. طلب السجل الكامل ─── */}
        <section className="vcard" style={{ padding: '24px 24px 28px', textAlign: 'center' }}>
          <div style={{ marginBottom: 16 }}>
            <p className="section-title">📋 سجل القراءات الكاملة للطبيب المعالج</p>
          </div>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px', lineHeight: 1.7 }}>
            يمكنك طلب سجلك الطبي الكامل من الصيدلية وسيصلك ملف PDF جاهز لتسليمه لطبيبك المعالج.
          </p>
          <button
            className="btn-whatsapp"
            onClick={() => {
              const rawPhone = pharmacyPhone || '';
              if (!rawPhone) return;
              const formattedPhone = rawPhone.replace(/[^0-9]/g, '');
              const cleanPhone = formattedPhone.startsWith('0') ? '962' + formattedPhone.substring(1) : formattedPhone;
              const text = `مرحباً، أنا ${currentVisit.patient?.name || 'المريض'}، أطلب سجلي الطبي الكامل بصيغة PDF.\nشكراً 🙏`;
              window.open(`https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`, '_blank');
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: '0 auto' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.135 1.535 5.879L.057 23.944l6.204-1.495A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.894a9.889 9.889 0 01-5.031-1.372l-.361-.214-3.741.981.999-3.648-.235-.374A9.861 9.861 0 012.106 12C2.106 6.58 6.58 2.106 12 2.106c5.42 0 9.894 4.474 9.894 9.894 0 5.42-4.474 9.894-9.894 9.894z"/>
            </svg>
            اطلب سجلك الطبي عبر واتساب
          </button>
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
