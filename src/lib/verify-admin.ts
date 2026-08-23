import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export interface AuthResult {
  authorized: boolean;
  user: any;
  response: NextResponse;
}

export async function verifyPlatformAdmin(request: Request): Promise<AuthResult> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return {
        authorized: false,
        user: null,
        response: NextResponse.json({ error: 'مطلوب رمز التوثيق' }, { status: 401 }),
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return {
        authorized: false,
        user: null,
        response: NextResponse.json({ error: 'رمز التوثيق غير صالح' }, { status: 401 }),
      };
    }

    // قفل مؤقت حتى إعادة بناء نظام أدوار المشرفين — القائمة من متغيّر بيئة
    const allowed = (process.env.PLATFORM_ADMIN_EMAILS || '')
      .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    if (!allowed.includes((user.email || '').toLowerCase())) {
      console.error('platform admin denied:', user.email);
      return {
        authorized: false,
        user: null,
        response: NextResponse.json({ error: 'غير مصرّح' }, { status: 403 }),
      };
    }

    return {
      authorized: true,
      user,
      response: null as unknown as NextResponse,
    };
  } catch (err) {
    return {
      authorized: false,
      user: null,
      response: NextResponse.json({ error: 'خطأ في التوثيق' }, { status: 500 }),
    };
  }
}

export const verifyAdmin = verifyPlatformAdmin;
