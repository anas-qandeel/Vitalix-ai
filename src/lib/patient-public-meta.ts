import type { Metadata } from 'next';
import { supabaseAdmin } from '@/lib/supabase-admin';

// بيانات الصفحات العامة للمريض (title وog) تُبنى على الخادم باسم الصيدلية وحدها.
// الأمان هنا كما في /api/visit/[id]: الـ id هو UUID عشوائي، ونقرأ بـ service role اسم الصيدلية فقط.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PharmRow = { name: string | null; pharmacy_name: string | null } | null;

// الأولوية للعمود الأحدث name ثم pharmacy_name، وبصيغة «صيدلية X» كبقية المشروع
function displayName(p: PharmRow): string {
  const raw = (p?.name || p?.pharmacy_name || '').trim();
  if (!raw) return '';
  return raw.startsWith('صيدلية') ? raw : `صيدلية ${raw}`;
}

async function pharmacyNameFor(table: 'visitations' | 'weight_plans', id: string): Promise<string> {
  if (!UUID.test(id)) return '';
  try {
    const { data } = await supabaseAdmin
      .from(table)
      .select('pharmacy:pharmacies(name, pharmacy_name)')
      .eq('id', id)
      .maybeSingle();
    return displayName((data?.pharmacy ?? null) as unknown as PharmRow);
  } catch {
    return '';
  }
}

// لا أي ذكر للمنصة: لا manifest، وأيقونة محايدة، وبلا og:image، وبلا فهرسة (صفحة خاصة بمريض)
export async function patientPageMetadata(table: 'visitations' | 'weight_plans', id: string, suffix: string): Promise<Metadata> {
  const pharmacy = await pharmacyNameFor(table, id);
  const title = pharmacy ? `${pharmacy} — ${suffix}` : suffix;
  return {
    title,
    description: title,
    robots: { index: false, follow: false },
    manifest: null,
    appleWebApp: { title: pharmacy || suffix },
    openGraph: { title, description: title, type: 'website', ...(pharmacy ? { siteName: pharmacy } : {}) },
    twitter: { card: 'summary', title, description: title },
    icons: {
      icon: [{ url: '/patient-icon.svg', type: 'image/svg+xml' }],
      shortcut: '/patient-icon.svg',
      apple: [{ url: '/patient-apple-icon.png', sizes: '180x180', type: 'image/png' }],
    },
  };
}
