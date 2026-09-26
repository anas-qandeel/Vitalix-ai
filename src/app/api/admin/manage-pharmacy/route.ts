import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyPlatformAdmin } from '@/lib/verify-admin';

export async function PUT(request: Request) {
  const auth = await verifyPlatformAdmin(request, ['owner', 'support']);
  if (!auth.authorized) return auth.response;

  try {
    const body = await request.json();
    const { id, email } = body;

    if (!id) {
      return NextResponse.json({ error: 'معرف الصيدلية مطلوب' }, { status: 400 });
    }

    // ── قائمة سماح: الحقول القابلة للتعديل من لوحة الإدارة فقط ─────────────
    // المبالغ وتاريخ الانتهاء لم تعد تُعدَّل من هنا — مصدرها جدول subscriptions
    const patch: Record<string, string | number> = {};
    const str = (k: string, max = 120) => {
      const v = body[k];
      if (v === undefined) return;
      if (typeof v !== 'string') throw new Error(`قيمة ${k} غير صالحة`);
      patch[k] = v.trim().slice(0, max);
    };
    str('name'); str('pharmacist_name'); str('phone_number', 30); str('city_address', 200); str('country', 60);
    if (body.max_staff !== undefined) {
      const n = Number(body.max_staff);
      if (!Number.isInteger(n) || n < 1 || n > 100) return NextResponse.json({ error: 'عدد الموظفين بين 1 و100' }, { status: 400 });
      patch.max_staff = n;
    }
    if (body.status !== undefined) {
      if (body.status !== 'active' && body.status !== 'suspended') return NextResponse.json({ error: 'الحالة المسموح بها من هنا: تفعيل أو تعطيل فقط' }, { status: 400 });
      patch.status = body.status;
    }
    if (typeof patch.name === 'string') {
      if (!patch.name) return NextResponse.json({ error: 'اسم الصيدلية مطلوب' }, { status: 400 });
      patch.name = patch.name.startsWith('صيدلية') ? patch.name : `صيدلية ${patch.name}`;
    }
    if (Object.keys(patch).length === 0 && !(typeof email === 'string' && email.trim())) {
      return NextResponse.json({ error: 'لا حقول قابلة للتعديل في الطلب' }, { status: 400 });
    }
    // ────────────────────────────────────────────────────────────────────────

    // تحديث البريد الإلكتروني في Supabase Auth إن وُجد
    if (typeof email === 'string' && email.trim()) {
      const { error: emailError } = await supabaseAdmin.auth.admin.updateUserById(id, {
        email: email.trim(),
      });
      if (emailError) {
        return NextResponse.json(
          { error: `تعذر تحديث البريد الإلكتروني: ${emailError.message}` },
          { status: 400 }
        );
      }
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await supabaseAdmin
        .from('pharmacies')
        .update(patch)
        .eq('id', id);

      if (error) throw new Error(error.message);
    }

    return NextResponse.json({ success: true, message: 'تم تحديث بيانات الصيدلية بنجاح' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'حدث خطأ أثناء التحديث' }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyPlatformAdmin(request, ['owner']);
  if (!auth.authorized) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'معرف الصيدلية مطلوب' }, { status: 400 });
    }

    const { error: dbError } = await supabaseAdmin
      .from('pharmacies')
      .update({ status: 'archived' })
      .eq('id', id);

    if (dbError) throw new Error(dbError.message);

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(id, {
      ban_duration: '876000h',
    });

    if (authError) {
      console.warn('تحذير: تعذر حظر حساب المستخدم في الـ Auth:', authError.message);
    }

    return NextResponse.json({
      success: true,
      message: 'تم أرشفة الصيدلية والاحتفاظ بسجلاتها المالية، وحظر تسجيل الدخول بنجاح'
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'حدث خطأ أثناء عملية الأرشفة' }, { status: 400 });
  }
}
