import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyPlatformAdmin } from '@/lib/verify-admin';

export async function GET(request: Request) {
  const auth = await verifyPlatformAdmin(request);
  if (!auth.authorized) return auth.response;

  try {
    const { data, error } = await supabaseAdmin.rpc('get_platform_admins_view');

    if (error) {
      return NextResponse.json({ error: 'فشل جلب بيانات المسؤولين' }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: 'فشل جلب بيانات المسؤولين' }, { status: 500 });
  }
}
