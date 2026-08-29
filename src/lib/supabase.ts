import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// اعتراض مركزي لكل استدعاءات Supabase من المتصفح.
// السبب: توكن مرفوض من السيرفر (401) لا يُطلق أي حدث في العميل — الجلسة تبدو
// سليمة محلياً بينما كل قراءة تفشل، فتظهر قيم افتراضية وبيانات فارغة بلا إشارة.
// هذه هي النقطة الوحيدة التي تمرّ بها كل الاستدعاءات، فالمعالجة فيها لا تتكرر.
let redirecting = false;

async function handleExpiredSession() {
  if (redirecting) return;
  const path = window.location.pathname;
  // الصفحات المحميّة فقط — صفحة المريض العامة وصفحات الدخول لا تتأثر
  if (!path.startsWith('/dashboard') && !path.startsWith('/admin')) return;
  redirecting = true;
  // مسح الجلسة الفاسدة إلزامي قبل التوجيه: تركها في localStorage يجعل
  // الصفحة الجذر تعتبر المستخدم مسجّلاً فتعيده للوحة — حلقة توجيه لا مخرج منها.
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // فشل signOut لا يمنع الخروج — نمسح تخزين الجلسة يدوياً
  }
  try {
    Object.keys(localStorage)
      .filter((k) => k.includes('auth-token'))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // تخزين محجوب — نمضي للتوجيه على أي حال
  }
  window.location.href = '/?expired=1';
}

const authedFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  if (res.status === 401 && typeof window !== 'undefined') {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    // استثناء مسارات المصادقة: 401 هناك تعني كلمة مرور خاطئة لا جلسة منتهية
    if (!url.includes('/auth/v1/')) {
      void handleExpiredSession();
    }
  }
  return res;
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: authedFetch },
});
