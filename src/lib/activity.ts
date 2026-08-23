import { supabase } from '@/lib/supabase';

export const logActivity = async (action: string, patientId: string) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    await fetch('/api/activity/log', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, patient_id: patientId }),
    });
  } catch {
    // التسجيل لا يعطّل العمل: فشله لا يمنع فتح واتساب
  }
};
