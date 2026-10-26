import type { Metadata } from 'next';
import { IBM_Plex_Mono } from 'next/font/google';
import './welcome.css';
import WelcomeEffects from './WelcomeEffects';
import { WELCOME_MARKUP } from './welcomeMarkup';
import { SALES_EMAIL, SOCIAL_LINKS, WHATSAPP_NUMBER, PHONE_DISPLAY, waLink } from '@/lib/contact';

// صفحة تسويقية عامة: خارج /dashboard عمداً كي لا ترث حارس تسجيل الدخول

// خط الأرقام في العروض التوضيحية فقط؛ يُعرَّض كمتغير CSS يستعمله .vx-welcome وحده
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--vx-mono',
  fallback: ['monospace'],
});

export const metadata: Metadata = {
  title: 'Vitalix-ai | تابع مرضاك بذكاء',
  description: 'Vitalix-ai برنامج تستخدمه أنت وفريقك في الصيدلية، يضمّ أدوات مستقلة لمتابعة مرضاك.',
  openGraph: {
    title: 'Vitalix-ai | تابع مرضاك بذكاء',
    description: 'Vitalix-ai برنامج تستخدمه أنت وفريقك في الصيدلية، يضمّ أدوات مستقلة لمتابعة مرضاك.',
    locale: 'ar_JO',
    type: 'website',
    url: 'https://www.vitalix-ai.com/welcome',
    images: [{ url: 'https://www.vitalix-ai.com/welcome/og.jpg', width: 1200, height: 630, alt: 'Vitalix-ai: تابع مرضاك بذكاء' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vitalix-ai | تابع مرضاك بذكاء',
    description: 'Vitalix-ai برنامج تستخدمه أنت وفريقك في الصيدلية، يضمّ أدوات مستقلة لمتابعة مرضاك.',
    images: ['https://www.vitalix-ai.com/welcome/og.jpg'],
  },
};

// المصدر يُلحق بنص رسالة واتساب، فلا يُقبل منه إلا رمز قصير آمن وإلا عاد إلى القيمة الافتراضية
function cleanSource(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && /^[a-z0-9_-]{1,20}$/i.test(v) ? v : 'web';
}

function escapeHtml(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const src = cleanSource((await searchParams).src);

  // المحتوى ثابت نملكه بالكامل؛ القيم المحقونة إما ثوابت من contact.ts أو مصدر مُنقّى بالقائمة البيضاء أعلاه
  const social = SOCIAL_LINKS.length
    ? `<span class="vx-footer-social">${SOCIAL_LINKS.map(
        (s) => `<a href="${escapeHtml(s.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.label)}</a>`,
      ).join('')}</span>`
    : '';
  const html = WELCOME_MARKUP
    .replace('{{WA_head}}', waLink(`${src}-head`))
    .replace('{{WA_hero}}', waLink(`${src}-hero`))
    .replace('{{WA_offer}}', waLink(`${src}-offer`))
    .replace('{{WA_float}}', waLink(`${src}-float`))
    .replace('{{PHONE_DISPLAY}}', PHONE_DISPLAY)
    .replace('tel:+{{WHATSAPP_NUMBER}}', `tel:+${WHATSAPP_NUMBER}`)
    .replace('mailto:{{SALES_EMAIL}}', `mailto:${SALES_EMAIL}`)
    .replace('{{SALES_EMAIL}}', SALES_EMAIL)
    .replace('<span class="vx-footer-trace"', `${social}<span class="vx-footer-trace"`);

  return (
    <div className={plexMono.variable} style={{ display: 'contents' }}>
      <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: html }} />
      <WelcomeEffects />
    </div>
  );
}
