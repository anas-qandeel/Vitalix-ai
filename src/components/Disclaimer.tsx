type DisclaimerVariant = 'pharmacist' | 'patient' | 'pdf';

const TEXT: Record<DisclaimerVariant, string> = {
  pharmacist:
    'هذا التحليل أداة مساعدة مولَّدة بالذكاء الاصطناعي. راجعه بخبرتك قبل اعتماده أو تسليمه للمريض.',
  patient:
    'هذه المعلومات للتوعية والمتابعة فقط، وليست تشخيصاً طبياً ولا وصفة علاجية ولا بديلاً عن استشارة طبيبك أو صيدلانيك. لا توقف أو تغيّر أي دواء بناءً عليها. عند أي عرَض مقلق راجع أقرب مركز صحي فوراً.',
  pdf: 'تقرير مساعد مولَّد آلياً. لا يُعدّ تشخيصاً طبياً ولا بديلاً عن استشارة الطبيب.',
};

function IconInfo({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
      />
    </svg>
  );
}

export default function Disclaimer({ variant }: { variant: DisclaimerVariant }) {
  const text = TEXT[variant];

  if (variant === 'pharmacist') {
    return (
      <p className="flex items-start gap-1.5 text-xs text-slate-500">
        <IconInfo className="w-4 h-4 shrink-0 mt-0.5" />
        <span>{text}</span>
      </p>
    );
  }

  if (variant === 'patient') {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
        <p className="flex items-start gap-2 text-sm text-slate-600">
          <IconInfo className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{text}</span>
        </p>
      </div>
    );
  }

  return (
    <p className="flex items-start gap-1 text-[10px] text-slate-500 border-t border-slate-200 pt-2">
      <IconInfo className="w-3 h-3 shrink-0 mt-0.5" />
      <span>{text}</span>
    </p>
  );
}
