// مكوّنات عرض صفحة /welcome — بلا حالة، تعمل داخل server component
import { Clock, Prescription, FilePdf, Warning, CheckCircle, WhatsappLogo } from '@phosphor-icons/react/ssr';

// نفس شعار Vitalix المستخدم في src/app/help/page.tsx — لا يُعاد رسمه من الصفر
export function VitalixMark({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${dark ? 'bg-white/10 ring-1 ring-white/15' : 'bg-slate-900'}`}>
      <svg className="w-5 h-5" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 8L14.5 25C14.8 25.6 15.6 25.6 15.9 25L20 17" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M24 6C24 9.3 26.7 12 30 12C26.7 12 24 14.7 24 18C24 14.7 21.3 12 18 12C21.3 12 24 9.3 24 6Z" fill="#0D9488" />
      </svg>
    </div>
  );
}

export function WaButton({ href, label, variant = 'primary', className = '' }: { href: string; label: string; variant?: 'primary' | 'light' | 'ghost'; className?: string }) {
  const styles = {
    primary: 'bg-teal-600 hover:bg-teal-500 text-white shadow-lg shadow-teal-900/20',
    light: 'bg-white hover:bg-slate-100 text-slate-900 shadow-lg shadow-slate-900/10',
    ghost: 'bg-white/10 hover:bg-white/15 text-white border border-white/20',
  }[variant];
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-2.5 rounded-2xl px-6 py-4 text-base font-bold cursor-pointer transition-all active:scale-[0.98] ${styles} ${className}`}
    >
      <WhatsappLogo size={22} weight="fill" aria-hidden="true" />
      <span>{label}</span>
    </a>
  );
}

export function SectionHead({ eyebrow, title, tone = 'light' }: { eyebrow?: string; title: string; tone?: 'light' | 'dark' }) {
  return (
    <div className="max-w-2xl mx-auto text-center mb-10 sm:mb-14">
      {eyebrow && (
        <span className={`inline-block text-xs font-bold tracking-wide rounded-full px-3 py-1 mb-4 ${tone === 'dark' ? 'bg-white/10 text-teal-300' : 'bg-teal-50 text-teal-700 border border-teal-100'}`}>
          {eyebrow}
        </span>
      )}
      <h2 className={`text-3xl sm:text-4xl font-black leading-tight ${tone === 'dark' ? 'text-white' : 'text-slate-900'}`}>{title}</h2>
    </div>
  );
}

// بطاقتا الواجهة العائمتان — أسماء وهمية فقط
export function HeroCards() {
  return (
    <div className="relative mx-auto w-full max-w-md h-[300px] sm:h-[340px]" aria-hidden="true">
      <div className="absolute inset-x-6 top-6 bottom-6 rounded-[32px] bg-teal-500/20 blur-3xl" />
      <div className="absolute top-0 right-0 left-6 sm:left-10 bg-white rounded-2xl shadow-2xl shadow-black/30 p-4 -rotate-2">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-[11px] font-bold text-slate-400">طلب مواد</span>
          <span className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-bold rounded-full px-2.5 py-0.5">
            <Warning size={12} weight="bold" /> متأخر
          </span>
        </div>
        <p className="text-base font-black text-slate-900">سارة خالد</p>
        <p className="text-sm text-slate-500 mt-0.5">صنفان بانتظار المستودع</p>
        <div className="mt-3 flex items-center gap-2 text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
          <Clock size={16} weight="bold" className="text-rose-500" />
          تجاوز موعد الوصول المتوقع
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-6 sm:right-10 bg-white rounded-2xl shadow-2xl shadow-black/30 p-4 rotate-2">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-teal-700">
            <Prescription size={16} weight="bold" /> وصفة موثقة
          </span>
          <CheckCircle size={20} weight="fill" className="text-emerald-500" />
        </div>
        <p className="text-base font-black text-slate-900">محمد يوسف</p>
        <p className="text-sm text-slate-500 mt-0.5">ثلاثة أدوية · صورة مرفقة</p>
      </div>
    </div>
  );
}

// إطار شاشة مبسّط لمحاكاة الواجهة
function Screen({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-lg shadow-slate-900/5 overflow-hidden" aria-hidden="true">
      <div className="flex items-center gap-1.5 px-4 py-3 bg-slate-50 border-b border-slate-200">
        <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
        <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
        <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
        <span className="text-xs font-bold text-slate-500 mr-2">{title}</span>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

export function RequestsMock() {
  return (
    <Screen title="طلبات المرضى">
      <div className="border border-rose-200 bg-rose-50/40 rounded-2xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-black text-slate-900">سارة خالد</p>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">طلب مواد رقم 5/2026</p>
          </div>
          <span className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-bold rounded-full px-2.5 py-0.5 shrink-0">
            <Warning size={12} weight="bold" /> متأخر
          </span>
        </div>
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between text-sm bg-white border border-slate-200 rounded-xl px-3 py-2">
            <span className="font-bold text-slate-700">صنف أول</span>
            <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">طُلب من المورد</span>
          </div>
          <div className="flex items-center justify-between text-sm bg-white border border-slate-200 rounded-xl px-3 py-2">
            <span className="font-bold text-slate-700">صنف ثانٍ</span>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">وصل</span>
          </div>
        </div>
        <div className="mt-3 inline-flex items-center gap-2 bg-slate-900 text-white text-xs font-bold rounded-xl px-3.5 py-2">
          <WhatsappLogo size={16} weight="fill" /> رسالة جاهزة للمريض
        </div>
      </div>
    </Screen>
  );
}

export function PrescriptionsMock() {
  return (
    <Screen title="سجل الوصفات">
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-sm font-black text-slate-900">اليوم</span>
        <span className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-1.5">
          <FilePdf size={16} weight="bold" className="text-teal-600" /> تصدير PDF
        </span>
      </div>
      <div className="space-y-2.5">
        {[
          { patient: 'محمد يوسف', items: ['دواء أول', 'دواء ثانٍ', 'دواء ثالث'] },
          { patient: 'ليلى أحمد', items: ['دواء أول', 'دواء ثانٍ'] },
        ].map((rx) => (
          <div key={rx.patient} className="border border-slate-200 rounded-2xl p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="font-black text-slate-900 text-sm">{rx.patient}</p>
              <span className="text-[11px] font-bold text-teal-700 bg-teal-50 border border-teal-100 rounded-full px-2 py-0.5">مرفق صورة</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {rx.items.map((d, i) => (
                <span key={i} className="text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">{d}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Screen>
  );
}
