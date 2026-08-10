import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyPlatformAdmin } from '@/lib/verify-admin';

// يجلب بيانات صيدلية واحدة كاملة (مع البريد الإلكتروني) وإحصائيات مرتبطة بها —
// بصلاحيات السيرفر لأن سياسات RLS الحالية لا تسمح لمسؤول المنصة بقراءة جدول
// المرضى أو الزيارات مباشرة من المتصفح (هذه الجداول محصورة بالصيدلية المالكة فقط)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyPlatformAdmin(request);
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;

    const { data: pharmacy, error: pharmError } = await supabaseAdmin
      .from('admin_pharmacies_view')
      .select('*')
      .eq('id', id)
      .single();

    if (pharmError || !pharmacy) {
      return NextResponse.json({ error: 'لم يتم العثور على الصيدلية' }, { status: 404 });
    }

    const { count: patientCount } = await supabaseAdmin
      .from('patients')
      .select('*', { count: 'exact', head: true })
      .eq('pharmacy_id', id);

    const { count: visitCount } = await supabaseAdmin
      .from('visitations')
      .select('*', { count: 'exact', head: true })
      .eq('pharmacy_id', id);

    const { data: lastVisitRows } = await supabaseAdmin
      .from('visitations')
      .select('created_at')
      .eq('pharmacy_id', id)
      .order('created_at', { ascending: false })
      .limit(1);

    const { count: catalogCount } = await supabaseAdmin
      .from('pharmacy_catalog')
      .select('*', { count: 'exact', head: true })
      .eq('pharmacy_id', id)
      .eq('is_active', true);

    return NextResponse.json({
      pharmacy,
      stats: {
        patientCount: patientCount || 0,
        visitCount: visitCount || 0,
        lastVisitAt: lastVisitRows?.[0]?.created_at || null,
        activeCatalogCount: catalogCount || 0,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'حدث خطأ في الخادم' }, { status: 500 });
  }
}
