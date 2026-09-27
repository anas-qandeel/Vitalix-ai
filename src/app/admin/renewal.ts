import type { OverviewRow } from './PharmacyCard';
import { formatPharmacistName } from '@/lib/name-format';
import { pluralizeDays } from '@/lib/chronic';

// رسائل التذكير بالتجديد — منسوخة من نصوص المالك في شاشة admin/page.tsx القديمة (تبويب "متابعة التجديد"،
// دالتا trialMsg وpaidMsg)، بفارق واحد: تُستخدم هنا اسم خطة الاشتراك الفعلي (sub_plan_name) بدل الأسعار
// الثابتة المكتوبة يدوياً هناك (subTypeText).

function formatWhatsAppNumber(phone: string): string {
  let cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0')) cleaned = '962' + cleaned.substring(1);
  return cleaned;
}

export function needsRenewalReminder(p: OverviewRow): boolean {
  if (!p.phone_number) return false;
  if (p.status === 'suspended' || p.status === 'archived') return false;
  if (p.expiring_soon) return true;
  if (p.status === 'grace' || p.status === 'expired') return true;
  if (typeof p.days_left === 'number' && p.days_left < 0) return true;
  return false;
}

function renewalMessage(p: OverviewRow): string {
  // اشتراكات منقولة من الأعمدة القديمة قد تكون مدفوعة بلا sub_plan_name — لا تُعامَل كتجريبية إن كان لها مبلغ مستحق
  const isTrial = !p.sub_plan_name && !(Number(p.sub_final_price) > 0);
  const ended = p.status === 'grace' || p.status === 'expired' || (typeof p.days_left === 'number' && p.days_left < 0);
  const name = formatPharmacistName(p.pharmacist_name);
  const date = p.sub_ends_on ? new Date(p.sub_ends_on).toLocaleDateString('en-GB') : '';
  const planPart = p.sub_plan_name ? ` (${p.sub_plan_name})` : '';
  const label = p.name.startsWith('صيدلية') ? p.name : `صيدلية ${p.name}`;

  if (isTrial && !ended) {
    const days = p.days_left ?? 0;
    const trialPart = days === 0
      ? `بأن الفترة التجريبية ل${label} تنتهي اليوم`
      : `بوجود متبقي ${pluralizeDays(days)} على الفترة التجريبية ل${label}`;
    return `مرحباً ${name}، معك فريق منصة Vitalix-ai. نتمنى أن تجربة النظام نالت إعجابكم! أود التذكير ${trialPart}. نرحب بأسئلتكم ولترقية اشتراككم الآن.`;
  }

  if (isTrial && ended) {
    return `مرحباً ${name}، معك فريق منصة Vitalix-ai. نتمنى أن تجربة النظام نالت إعجابكم! أود التذكير بانتهاء الفترة التجريبية ل${label}. نرحب بأسئلتكم ولترقية اشتراككم الآن.`;
  }

  if (!ended) {
    return `مرحباً ${name}، معك إدارة منصة Vitalix-ai. نود تذكيركم بقرب موعد تجديد اشتراك ${label}${planPart} بتاريخ ${date}. نسعد بخدمتكم وتجديد اشتراككم بنفس المزايا.`;
  }

  return `مرحباً ${name}، معك إدارة منصة Vitalix-ai. نود تذكيركم بانتهاء اشتراك ${label}${planPart} بتاريخ ${date}. نسعد بخدمتكم وتجديد اشتراككم بنفس المزايا.`;
}

export function renewalWhatsAppUrl(p: OverviewRow): string {
  return `https://wa.me/${formatWhatsAppNumber(p.phone_number || '')}?text=${encodeURIComponent(renewalMessage(p))}`;
}
