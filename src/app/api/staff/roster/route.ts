import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// تصريح صريح: لا يُخزَّن مؤقتاً — قائمة الموظفين قد تتغيّر (إضافة/تعطيل) ويجب أن تكون محدّثة دائماً
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * مسار عام (بدون تسجيل دخول) يعرض أسماء موظفي صيدلية ليختار الموظف اسمه
 * قبل إدخال PIN على جهاز الصيدلية المشترك. الأمان هنا ليس السرّية — الأسماء
 * تُعرض أصلاً على الشاشة قبل أي مصادقة (قرار متفق عليه) — لذا يكفي إعادة
 * الحقول اللازمة للاختيار فقط: لا id ولا user_id ولا أي بيانات تعريفية أعمق.
 */
export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get('code') || '').trim();

  if (!code || code.length !== 6) {
    return NextResponse.json({ error: 'كود غير صالح' }, { status: 400 });
  }

  // الصيدلية عبر الكود القصير (غير حساس لحالة الأحرف)
  const { data: pharmacy } = await supabaseAdmin
    .from('pharmacies')
    .select('id, name, pharmacy_name')
    .ilike('short_code', code)
    .single();

  if (!pharmacy) {
    return NextResponse.json({ error: 'كود الصيدلية غير صحيح' }, { status: 404 });
  }

  // الأولوية: name (العمود الرسمي) ← pharmacy_name (fallback للسجلات القديمة)
  const rawName = pharmacy.name || pharmacy.pharmacy_name || '';
  const pharmacyName = rawName.trim()
    ? (rawName.startsWith('صيدلية') ? rawName : `صيدلية ${rawName}`)
    : 'صيدليتك';

  // استبعاد المالك متعمّد: login_slug is null للمالك دائماً
  const { data: staff, error } = await supabaseAdmin
    .from('pharmacy_staff')
    .select('name, login_slug, role')
    .eq('pharmacy_id', pharmacy.id)
    .eq('is_active', true)
    .not('login_slug', 'is', null)
    .order('login_slug', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'تعذّر جلب قائمة الموظفين' }, { status: 500 });
  }

  return NextResponse.json({ pharmacy: { name: pharmacyName }, staff: staff || [] });
}
