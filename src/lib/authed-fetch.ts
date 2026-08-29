// استدعاء مسارات API المحميّة في لوحة الصيدلي.
// المسؤولية الإضافية على fetch العادي: عند انتهاء الجلسة أو غياب التوكن
// يُخرج المستخدم ويعيده لصفحة الدخول برسالة واضحة، بدل أن تختفي البيانات بصمت.
// ملاحظة: adminFetch في admin-fetch.ts يخدم شاشات الإشراف ووجهة توجيهه مختلفة — لا تدمجهما.
import { supabase } from '@/lib/supabase';

async function forceLogout() {
  try {
    await supabase.auth.signOut();
  } catch {
    // فشل signOut لا يمنع التوجيه — الجلسة منتهية أصلاً
  }
  if (typeof window !== 'undefined') {
    window.location.href = '/?expired=1';
  }
}

export async function authedFetch(url: string, options: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  if (!token) {
    await forceLogout();
    throw new Error('SESSION_EXPIRED');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...((options.headers as Record<string, string>) || {}),
  };

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    await forceLogout();
    throw new Error('SESSION_EXPIRED');
  }

  return res;
}