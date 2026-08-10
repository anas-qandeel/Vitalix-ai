import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyPlatformAdmin } from '@/lib/verify-admin';

export async function PUT(request: Request) {
  const auth = await verifyPlatformAdmin(request);
  if (!auth.authorized) return auth.response;

  try {
    const body = await request.json();
    const { id, email, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: 'معرف الصيدلية مطلوب' }, { status: 400 });
    }

    // ── فحص دفاعي: paid_amount لا يتجاوز total_amount_due ──────────────────
    // يحمي من أي استدعاء مباشر للـ API يتجاوز التحقق في الواجهة
    const totalDue  = updateData.total_amount_due  !== undefined ? Number(updateData.total_amount_due)  : null;
    const paidAmt   = updateData.paid_amount        !== undefined ? Number(updateData.paid_amount)        : null;

    if (totalDue !== null && paidAmt !== null) {
      if (isNaN(totalDue) || isNaN(paidAmt)) {
        return NextResponse.json(
          { error: 'قيم المبالغ غير صالحة' },
          { status: 400 }
        );
      }
      if (paidAmt < 0) {
        return NextResponse.json(
          { error: 'المبلغ المدفوع لا يمكن أن يكون سالباً' },
          { status: 400 }
        );
      }
      if (paidAmt > totalDue) {
        return NextResponse.json(
          { error: `المبلغ المدفوع (${paidAmt} JOD) لا يمكن أن يتجاوز إجمالي قيمة الخطة (${totalDue} JOD)` },
          { status: 400 }
        );
      }
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

    // توحيد اسم الصيدلية: إضافة "صيدلية" إن لم تبدأ بها
    if (typeof updateData.name === 'string') {
      const trimmedName = updateData.name.trim();
      updateData.name = trimmedName.startsWith('صيدلية') ? trimmedName : `صيدلية ${trimmedName}`;
    }

    const { error } = await supabaseAdmin
      .from('pharmacies')
      .update(updateData)
      .eq('id', id);

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, message: 'تم تحديث بيانات الصيدلية بنجاح' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'حدث خطأ أثناء التحديث' }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyPlatformAdmin(request);
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
