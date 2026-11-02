// يربط مركز الإشعارات بصفحة الطلبات حين تكون مفتوحة أصلاً.
// الرابط ?open=<id> تقرؤه الصفحة مرة واحدة عند التركيب فقط، فالضغط على سطر «ملاحظة على طلب» وأنت داخلها لا يفتح شيئاً.
// لذلك ترسل القائمة الجانبية هذا الحدث (detail = معرّف الطلب) وتفتح الصفحة الطلب عند وصوله.
// ملاحظة: صفحة الطلبات تكتب اسم الحدث والتحقق من المعرّف حرفياً عندها (بلا استيراد منه)؛ يفرض الفاحصُ والاختبارات تطابقهما مع ما هنا.
export const OPEN_REQUEST_EVENT = 'vd:open-request';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** هل هذه القيمة معرّف طلب صالح (UUID)؟ أي شيء آخر ⇒ false (لا يُتَّخذ إجراء). */
export function isRequestId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/**
 * معرّف الطلب من وسيط open في رابط سطر الإشعار (مثل /dashboard/requests?open=<uuid>)،
 * أو null إن لم يوجد الوسيط أو لم تكن قيمته معرّفاً صالحاً (فيرجع المستدعي إلى الانتقال العادي).
 */
export function requestIdOfHref(href: string): string | null {
  const hash = href.indexOf('#');
  const base = hash < 0 ? href : href.slice(0, hash); // ما بعد # ليس جزءاً من الاستعلام
  const q = base.indexOf('?');
  if (q < 0) return null;
  const raw = new URLSearchParams(base.slice(q + 1)).get('open');
  return isRequestId(raw) ? raw : null;
}
