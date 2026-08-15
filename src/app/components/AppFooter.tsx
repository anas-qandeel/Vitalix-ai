'use client';

// فوتر موحّد لكل صفحات النظام (لوحة الصيدلية، الأدمن، وصفحات المريض العامة) — مصدر واحد
// لرقم الإصدار وسنة الحقوق، بدل تكراره يدوياً في كل صفحة واحتمال اختلافه بينها
export default function AppFooter({ className = '' }: { className?: string }) {
  return (
    <footer className={`text-center flex flex-col items-center justify-center gap-2 ${className}`}>
      <p className="text-[11px] text-slate-400 font-medium">
        Vitalix<span className="text-slate-900">.ai</span> — v1.0.0 · © {new Date().getFullYear()} جميع الحقوق محفوظة
      </p>
      <div className="text-[11px] text-slate-500 font-medium select-none" style={{ direction: 'ltr', unicodeBidi: 'bidi-override' }}>
        Made <span className="text-rose-500 text-[10px]">♥</span> in <span className="font-bold tracking-wider text-slate-700">ΛMMΛN</span>
      </div>
    </footer>
  );
}
