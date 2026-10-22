// بيانات التواصل التسويقية (صفحة /welcome) — مستقلة عن NEXT_PUBLIC_SUPPORT_WHATSAPP الذي يخدم
// بانر التجديد داخل لوحة الصيدلية، فلكل منهما رقمه وغايته
export const WHATSAPP_NUMBER = '962782277757';
export const PHONE_DISPLAY = '078 22 777 57';
export const PHONE_RAW = '0782277757';
export const SALES_EMAIL = 'sales@vitalix-ai.com';

// فارغة الآن عمداً: التذييل لا يعرض شيئاً حتى تُضاف حسابات حقيقية
export const SOCIAL_LINKS: { label: string; href: string }[] = [];

// المصدر يُلحق بنص الرسالة نفسها كي يعرف فريق المبيعات من أين جاء المهتم دون أي أداة قياس
export function waLink(source: string): string {
  const text = `مرحباً، شاهدت صفحة Vitalix-ai وأودّ الاستفسار عن عرض الإطلاق.\nالمصدر: ${source}`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}
