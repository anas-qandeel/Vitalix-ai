'use client';

import { Sparkle, Check } from '@phosphor-icons/react';
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

/**
 * زر موحّد لكل إجراء يستدعي الذكاء الاصطناعي في المنصة.
 * الشكل: إطار متدرج يدور ببطء + أيقونة تنبض؛ أثناء التحميل: لمعان عابر ونص بديل.
 * لا يحمل أي منطق — الحالة تأتي من الشاشة المستخدمة له.
 */
/** كرات ضبابية خلف النص — الأبعاد والمسارات مختلفة عمداً لتبدو حرّة لا متكررة */
const ORBS = [
  { width: 64, height: 64, top: -26, right: '4%', background: '#2dd4bf', '--d': '8s', '--dx': '-48px', '--dy': '12px' },
  { width: 44, height: 44, top: 4, right: '32%', background: '#a78bfa', '--d': '11s', '--dx': '36px', '--dy': '-14px' },
  { width: 56, height: 56, top: -18, left: '18%', background: '#22d3ee', '--d': '9s', '--dx': '30px', '--dy': '16px' },
  { width: 36, height: 36, top: 14, left: '2%', background: '#2dd4bf', '--d': '13s', '--dx': '-26px', '--dy': '-10px' },
  { width: 48, height: 48, top: -10, right: '60%', background: '#818cf8', '--d': '10s', '--dx': '20px', '--dy': '18px' },
] as unknown as CSSProperties[];

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  loadingText?: string;
  done?: boolean;
  size?: 'md' | 'lg';
  children: ReactNode;
};

export default function AiActionButton({
  loading = false,
  loadingText = 'يحلّل...',
  done = false,
  size = 'md',
  className = '',
  children,
  disabled,
  ...rest
}: Props) {
  const height = size === 'lg' ? 'h-14' : 'h-11';
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`ai-btn relative w-full ${height} rounded-xl p-[2px] text-sm font-semibold text-white transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed ${loading ? 'ai-btn-loading' : ''} ${className}`}>
      <span className="relative flex h-full w-full items-center justify-center gap-2 overflow-hidden rounded-[10px] bg-slate-900 px-4">
        {ORBS.map((style, i) => <span key={i} className="ai-orb" style={style} aria-hidden="true" />)}
        {loading ? (
          <Sparkle size={18} weight="fill" className="ai-btn-spark shrink-0" />
        ) : done ? (
          <Check size={18} weight="bold" className="shrink-0" />
        ) : (
          <Sparkle size={18} weight="fill" className="ai-btn-pulse shrink-0" />
        )}
        <span>{loading ? loadingText : children}</span>
        {loading && <span className="ai-btn-shimmer" aria-hidden="true" />}
      </span>
    </button>
  );
}
