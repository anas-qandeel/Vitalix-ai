// بيانات التواصل التسويقية (صفحة /welcome) — مستقلة عن NEXT_PUBLIC_SUPPORT_WHATSAPP الذي يخدم
// بانر التجديد داخل لوحة الصيدلية، فلكل منهما رقمه وغايته
export const WHATSAPP_NUMBER = '962782277757';
export const PHONE_DISPLAY = '0782277757';
export const SALES_EMAIL = 'sales@vitalix-ai.com';

// المصدر يُلحق بنص الرسالة نفسها كي يعرف فريق المبيعات من أين جاء المهتم دون أي أداة قياس
export function waLink(source: string, topic?: string): string {
  const lines = [`مرحباً، أود الاستفسار عن Vitalix-ai${topic ? ` — ${topic}` : ''}`, `المصدر: ${source}`];
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join('\n'))}`;
}
