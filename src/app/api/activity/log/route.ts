import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// أفعال مسموحة فقط — الموظف لا يرسل نص فعل حراً، بل يختار من هذه القائمة المغلقة
const ALLOWED_ACTIONS = ['reminder_opened', 'reminder_not_sent'];

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      console.warn('activity/log: طلب بلا ترويسة Authorization');
      return NextResponse.json({ error: 'مطلوب رمز التوثيق' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      console.warn('activity/log: توكن غير صالح', authError?.message);
      return NextResponse.json({ error: 'رمز التوثيق غير صالح' }, { status: 401 });
    }

    // الموظف لا يخبرنا من هو — نستخرجه من توكنه لا من الطلب
    const { data: staff, error: staffError } = await supabaseAdmin
      .from('pharmacy_staff')
      .select('id, name, pharmacy_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (staffError || !staff) {
      console.warn('activity/log: لا يوجد موظف نشط لهذا المستخدم', user.id, staffError?.message);
      return NextResponse.json({ error: 'غير مصرّح' }, { status: 403 });
    }

    const body = await request.json();
    const { action, patient_id } = body;

    if (!ALLOWED_ACTIONS.includes(action)) {
      console.warn('activity/log: فعل غير مسموح', action);
      return NextResponse.json({ error: 'فعل غير صالح' }, { status: 400 });
    }

    if (!patient_id) {
      console.warn('activity/log: patient_id مفقود');
      return NextResponse.json({ error: 'مُعرّف المريض مطلوب' }, { status: 400 });
    }

    // التحقق أن المريض يخصّ صيدلية هذا الموظف قبل تسجيل أي حركة باسمه
    const { data: patient, error: patientError } = await supabaseAdmin
      .from('patients')
      .select('id, name')
      .eq('id', patient_id)
      .eq('pharmacy_id', staff.pharmacy_id)
      .maybeSingle();

    if (patientError || !patient) {
      console.warn('activity/log: المريض لا يخصّ صيدلية الموظف', patient_id, staff.pharmacy_id);
      return NextResponse.json({ error: 'غير مصرّح' }, { status: 403 });
    }

    // كل قيم الهوية من الخادم (staff, pharmacy) — لا شيء منها من جسم الطلب
    const { error: insertError } = await supabaseAdmin.from('activity_log').insert({
      pharmacy_id: staff.pharmacy_id,
      staff_id: staff.id,
      staff_name: staff.name,
      action,
      entity_type: 'reminder',
      entity_id: patient_id,
      entity_label: patient.name,
    });

    if (insertError) {
      console.error('activity/log: فشل الإدراج', insertError.message);
      return NextResponse.json({ error: 'تعذر تسجيل الحركة' }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    console.error('activity/log: خطأ غير متوقع', err?.message);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
