import { supabase } from "@/lib/supabase";

export type TenantContext = {
  pharmacyId: string | null;
  role: string;
  staffId: string | null;
  staffName: string | null;
};

const EMPTY: TenantContext = {
  pharmacyId: null,
  role: "none",
  staffId: null,
  staffName: null,
};

let cache: TenantContext | null = null;
let cachedUserId: string | null = null;

export function clearTenantCache() {
  cache = null;
  cachedUserId = null;
}

if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange(() => clearTenantCache());
}

/**
 * هوية المستخدم الحالي من التوكن.
 * pharmacyId و role يأتيان من app_metadata — يوقّعهما السيرفر ولا يمكن
 * تزويرهما من المتصفح، بخلاف localStorage.
 */
export async function getTenantContext(): Promise<TenantContext> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    clearTenantCache();
    return EMPTY;
  }

  if (cache && cachedUserId === session.user.id) return cache;

  const meta = (session.user.app_metadata ?? {}) as Record<string, unknown>;

  const { data: staff } = await supabase
    .from("pharmacy_staff")
    .select("id, name")
    .eq("user_id", session.user.id)
    .maybeSingle();

  cache = {
    pharmacyId: (meta.pharmacy_id as string) ?? null,
    role: (meta.role as string) ?? "none",
    staffId: staff?.id ?? null,
    staffName: staff?.name ?? null,
  };
  cachedUserId = session.user.id;
  return cache;
}

export async function getPharmacyId(): Promise<string | null> {
  return (await getTenantContext()).pharmacyId;
}

export async function getUserRole(): Promise<string> {
  return (await getTenantContext()).role;
}

/** مُعرّف الصف في pharmacy_staff — يُستخدم لعمود visitations.recorded_by */
export async function getStaffId(): Promise<string | null> {
  return (await getTenantContext()).staffId;
}

/** بديل getActivePharmacist — الاسم من قاعدة البيانات لا من localStorage */
export async function getStaffName(): Promise<string | null> {
  return (await getTenantContext()).staffName;
}
