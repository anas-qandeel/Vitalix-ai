'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from '@phosphor-icons/react';

// الزر للصيدلاني فقط: يظهر عند الفتح من النظام (?from=pharmacy)، أما رابط المريض على واتساب فلا يحمل المعامل
export function useFromPharmacy(): boolean {
  const [fromPharmacy, setFromPharmacy] = useState(false);
  useEffect(() => {
    setFromPharmacy(new URLSearchParams(window.location.search).get('from') === 'pharmacy');
  }, []);
  return fromPharmacy;
}

export default function BackToPharmacyBar() {
  const router = useRouter();
  const fromPharmacy = useFromPharmacy();
  if (!fromPharmacy) return null;

  const handleBack = () => {
    // وصول بالتنقل الداخلي: نعود للخلف لتبقى شاشة الفحوصات بحالتها
    if (window.history.length > 1) {
      router.back();
      return;
    }
    // نافذة/تبويب جديد بلا سجل: نحاول الإغلاق، وإن بقيت الصفحة مفتوحة ننتقل للوحة الصيدلية
    window.close();
    setTimeout(() => router.push('/dashboard'), 300);
  };

  return (
    <div dir="rtl" style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '8px 16px' }}>
        <button
          type="button"
          onClick={handleBack}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 48, padding: '0 18px',
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, cursor: 'pointer',
            fontSize: 14, fontWeight: 700, color: '#0f172a', fontFamily: 'inherit',
          }}
        >
          <ArrowRight size={18} weight="bold" aria-hidden="true" />
          رجوع للصيدلية
        </button>
      </div>
    </div>
  );
}
