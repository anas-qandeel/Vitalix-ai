import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyPlatformAdmin } from '@/lib/verify-admin';

export async function GET(request: Request) {
  const auth = await verifyPlatformAdmin(request);
  if (!auth.authorized) return auth.response;

  try {
    const { data, error } = await supabaseAdmin.rpc('get_pharmacy_admin_view');

    if (error) {
      return NextResponse.json({ error: 'فشل جلب بيانات الصيدليات' }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: 'فشل جلب بيانات الصيدليات' }, { status: 500 });
  }
}
