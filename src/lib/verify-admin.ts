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
