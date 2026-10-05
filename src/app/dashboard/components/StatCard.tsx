'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { CaretLeft } from '@phosphor-icons/react';

type Props = {
  href?: string; // إن وُجد فالبطاقة رابط، وإلا رقم فقط
  icon: ReactNode;
  label: string;
  value: number | string;
  hint?: string; // نص صغير بجانب الرقم
};

const BASE = 'bg-white p-4 sm:p-5';

export default function StatCard({ href, icon, label, value, hint }: Props) {
  const body = (
    <>
      <div className="flex items-center gap-2 mb-3.5">
        {icon}
        <span className="text-slate-600 text-[11.5px]">{label}</span>
        {href && <CaretLeft size={12} weight="bold" className="mr-auto text-slate-300 group-hover:text-slate-700 transition-colors" aria-hidden="true" />}
      </div>
      <div className="flex items-baseline gap-1.5">
        <p className="text-[28px] font-medium text-slate-900 leading-none tabular-nums">{value}</p>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </div>
    </>
  );
  if (!href) return <div className={BASE}>{body}</div>;
  return (
    <Link href={href} className={`group block ${BASE} hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-inset transition-colors`}>
      {body}
    </Link>
  );
}
