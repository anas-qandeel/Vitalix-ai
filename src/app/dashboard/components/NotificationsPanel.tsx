'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useNotifications } from '@/lib/notifications/store';
import { counted, formatBadge, type LineKind, type NotificationLine, type Severity } from '@/lib/notifications/engine';
import { closeNotificationsPanel, useNotificationsPanelOpen } from '@/lib/notifications/panel-store';
import { refreshNotifications } from '@/lib/notifications/NotificationsRuntime';

// لوحة «مركز الإشعارات» والجرس. كل ما يُعرض هنا يأتي جاهزاً من المحرّك (engine.ts): العناوين والتفاصيل والترتيب والشدّة.
// لا جلب ولا كتابة هنا: اللوحة تقرأ المتجر فقط، وتطلب تحديثاً واحداً عند فتحها.

// ───────────────────────── نصوص وأرقام ─────────────────────────

const THINGS = { one: 'أمر واحد', two: 'أمران', few: 'أمور', many: 'أمراً', big: 'أمر' };

/** «أمر واحد ينتظركم» / «أمران ينتظرانكم» / «5 أمور تنتظركم» / «12 أمراً ينتظركم». */
export function waitingText(n: number): string {
  const verb = n === 2 ? 'ينتظرانكم' : n >= 3 && n <= 10 ? 'تنتظركم' : 'ينتظركم';
  return `${counted(n, THINGS)} ${verb}`;
}

/** عدد الإشعارات لقارئ الشاشة: إشعار واحد / إشعاران / 5 إشعارات / 12 إشعاراً. */
export function notifLabel(n: number): string {
  if (n === 1) return 'إشعار واحد';
  if (n === 2) return 'إشعاران';
  if (n <= 10) return `${n} إشعارات`;
  return `${n} إشعاراً`;
}

/** تحية بتوقيت عمّان (UTC+3 ثابت كبقية النظام). */
function greeting(): string {
  const h = (new Date().getUTCHours() + 3) % 24;
  return h >= 5 && h < 12 ? 'صباح الخير' : 'مساء الخير';
}

const GROUPS: { sev: Severity; label: string }[] = [
  { sev: 'urgent', label: 'عاجل' },
  { sev: 'action', label: 'يحتاج إجراءً' },
  { sev: 'info', label: 'للمتابعة' },
];

// ───────────────────────── الأيقونات (SVG مضمّن، بنفس خط وسماكة القائمة الجانبية) ─────────────────────────

function Svg({ children, ...rest }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      {children}
    </svg>
  );
}

/** ringKey: يرتفع كلما زاد العدد فيُعاد تركيب الأيقونة وتُعاد حركة الرنين مرة واحدة. */
export function BellIcon({ ringKey = 0 }: { ringKey?: number }) {
  return (
    <Svg key={ringKey} className={ringKey > 0 ? 'is-ring' : undefined}>
      <path d="M6 9a6 6 0 0 1 12 0c0 6.5 2.5 8.2 2.5 8.2h-17S6 15.5 6 9z" />
      <path d="M10 20.4a2.2 2.2 0 0 0 4 0" />
    </Svg>
  );
}

const KIND_ICON: Record<LineKind, ReactNode> = {
  refill_ran_out: <Svg><path d="M9.5 3h5" /><path d="M10.5 3v6.2L5.2 18.2A2 2 0 0 0 6.9 21h10.2a2 2 0 0 0 1.7-2.8L13.5 9.2V3" /><path d="M8 15h8" /></Svg>,
  refill_urgent: <Svg><path d="M9.5 3h5" /><path d="M10.5 3v6.2L5.2 18.2A2 2 0 0 0 6.9 21h10.2a2 2 0 0 0 1.7-2.8L13.5 9.2V3" /><path d="M8 15h8" /></Svg>,
  refill_soon: <Svg><path d="M9.5 3h5" /><path d="M10.5 3v6.2L5.2 18.2A2 2 0 0 0 6.9 21h10.2a2 2 0 0 0 1.7-2.8L13.5 9.2V3" /><path d="M8 15h8" /></Svg>,
  refill_no_response: <Svg><path d="M5 5.5h14A1.5 1.5 0 0 1 20.5 7v8a1.5 1.5 0 0 1-1.5 1.5H11l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5z" /><path d="M9 10.2c0-1 .9-1.7 1.9-1.7s1.9.7 1.9 1.6c0 1.2-1.6 1.3-1.6 2.4" /><path d="M11.2 14.6v.1" /></Svg>,
  inventory: <Svg><rect x="3.5" y="4" width="17" height="5" rx="1.5" /><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9" /><path d="M10 13h4" /></Svg>,
  requests_overdue: <Svg><rect x="5" y="4.5" width="14" height="16.5" rx="2.5" /><path d="M9 4.5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v.5" /><path d="M9 11h6M9 15h6" /></Svg>,
  requests_action: <Svg><rect x="5" y="4.5" width="14" height="16.5" rx="2.5" /><path d="M9 4.5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v.5" /><path d="M9 11h6M9 15h6" /></Svg>,
  requests_follow_up: <Svg><rect x="5" y="4.5" width="14" height="16.5" rx="2.5" /><path d="M9 4.5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v.5" /><path d="M9 11h6M9 15h6" /></Svg>,
  requests_neglected: <Svg><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.2 1.8" /></Svg>,
  catalog_review: <Svg><path d="M12 3 4 7.5v9L12 21l8-4.5v-9z" /><path d="M4 7.5 12 12l8-4.5M12 12v9" /></Svg>,
  catalog_empty: <Svg><path d="M12 3 4 7.5v9L12 21l8-4.5v-9z" /><path d="M4 7.5 12 12l8-4.5M12 12v9" /></Svg>,
  catalog_progress: <Svg><path d="M12 3 4 7.5v9L12 21l8-4.5v-9z" /><path d="M4 7.5 12 12l8-4.5M12 12v9" /></Svg>,
  catalog_idle: <Svg><path d="M12 3 4 7.5v9L12 21l8-4.5v-9z" /><path d="M4 7.5 12 12l8-4.5M12 12v9" /></Svg>,
  subscription: <Svg><rect x="3" y="5.5" width="18" height="13" rx="3" /><path d="M3 10h18M7 15h3" /></Svg>,
  birthdays: <Svg><rect x="3.5" y="9.5" width="17" height="11" rx="2" /><path d="M12 9.5V20.5M3.5 14h17" /><path d="M12 9.5C11 6 7 5.5 7 8c0 1.5 2 1.5 5 1.5zM12 9.5c1-3.5 5-4 5-1.5 0 1.5-2 1.5-5 1.5z" /></Svg>,
  notes: <Svg><path d="M5 4.5h14A1.5 1.5 0 0 1 20.5 6v10a1.5 1.5 0 0 1-1.5 1.5H10L5.5 21v-3.5H5A1.5 1.5 0 0 1 3.5 16V6A1.5 1.5 0 0 1 5 4.5z" /><path d="M8 9.5h8M8 13h5" /></Svg>,
};

const CHEVRON = (
  <svg className="vd-nlc" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="m14.5 6-6 6 6 6" />
  </svg>
);

// ───────────────────────── الشارة والجرس (تستعملهما القائمة الجانبية والشريط العلوي) ─────────────────────────

export function NotifBadge({ n, severity, label }: { n: number; severity: Severity | null; label: string }) {
  return <span className={`vd-bdg is-${severity ?? 'info'}`} aria-label={label}>{formatBadge(n)}</span>;
}

/** حالة الجرس: المجموع وأعلى شدّة، و«رنين» واحد حين يزيد العدد والقائمة مغلقة. */
export function useBellState(): { total: number; severity: Severity | null; ringKey: number } {
  const { summary } = useNotifications();
  const open = useNotificationsPanelOpen();
  const prev = useRef<number | null>(null);
  const [ringKey, setRingKey] = useState(0);
  const total = summary ? summary.total : 0;
  const has = summary !== null;
  useEffect(() => {
    if (!has) { prev.current = null; return; }
    const p = prev.current;
    prev.current = total;
    if (p !== null && total > p && !open) setRingKey((k) => k + 1);
  }, [has, total, open]);
  return { total, severity: summary ? summary.topSeverity : null, ringKey };
}

// ───────────────────────── اللوحة ─────────────────────────

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

function Skeleton() {
  return (
    <div className="vd-nsk" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="vd-nskr"><span className="vd-nski" /><span className="vd-nskt"><i /><i /></span></div>
      ))}
    </div>
  );
}

function Progress({ done, goal }: { done: number; goal: number }) {
  const pct = goal > 0 ? Math.max(0, Math.min(100, Math.round((done / goal) * 100))) : 0;
  return (
    <span className="vd-npg" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(done, goal)} aria-label={`${done} من ${goal}`}>
      <i style={{ width: `${pct}%` }} />
    </span>
  );
}

function Line({ line, onGo }: { line: NotificationLine; onGo: (l: NotificationLine) => void }) {
  return (
    <li>
      <button type="button" className={`vd-nl is-${line.severity}`} data-kind={line.kind} data-np-line onClick={() => onGo(line)}>
        <span className="vd-nli" aria-hidden="true">{KIND_ICON[line.kind]}</span>
        <span className="vd-nlt">
          <span className="vd-nl1">{line.title}</span>
          {line.detail && <span className="vd-nl2">{line.detail}</span>}
          {line.progress && <Progress done={line.progress.done} goal={line.progress.goal} />}
          {line.items && line.items.length > 0 && (
            <span className="vd-nch">
              {line.items.map((it, i) => <span key={`${i}-${it.label}`} className="vd-nc">{it.label}</span>)}
              {line.moreCount ? <span className="vd-nc is-more"><bdi dir="ltr">+{line.moreCount}</bdi></span> : null}
            </span>
          )}
        </span>
        {CHEVRON}
      </button>
    </li>
  );
}

export default function NotificationsPanel({ staffName, onGo }: { staffName: string | null; onGo: (line: NotificationLine) => void }) {
  const open = useNotificationsPanelOpen();
  const { summary } = useNotifications();
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  // عند الفتح: تحديث واحد (لا يتكرر إن كان آخر جلب حديثاً) ثم نقل التركيز إلى اللوحة
  useEffect(() => {
    if (!open) return;
    refreshNotifications(20_000);
    ref.current?.focus({ preventScroll: true });
  }, [open]);

  // أي انتقال بين الصفحات، أو مغادرة لوحة التحكم، يغلق اللوحة
  useEffect(() => { closeNotificationsPanel(false); }, [pathname]);
  useEffect(() => () => closeNotificationsPanel(false), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || ref.current?.contains(t)) return;
      if (t.closest('[data-np-toggle]') || t.closest('.vd-npscrim')) return; // الجرس يبدّل بنفسه، والغشاء يغلق بنقرته
      closeNotificationsPanel(false);
    };
    const onKey = (e: KeyboardEvent) => {
      const root = ref.current;
      if (!root) return;
      if (e.key === 'Escape') { e.preventDefault(); closeNotificationsPanel(true); return; }
      const active = document.activeElement as HTMLElement | null;
      if (e.key === 'Tab') {
        const els = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (!els.length) { e.preventDefault(); root.focus(); return; }
        const first = els[0];
        const last = els[els.length - 1];
        if (!active || !root.contains(active) || (e.shiftKey && (active === first || active === root))) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const lines = Array.from(root.querySelectorAll<HTMLElement>('[data-np-line]'));
        if (!lines.length || !active || !root.contains(active)) return;
        const i = lines.indexOf(active);
        let next: HTMLElement | undefined;
        if (i === -1) next = e.key === 'ArrowDown' ? lines[0] : undefined; // من اللوحة أو زر الإغلاق إلى أول سطر
        else next = lines[Math.max(0, Math.min(lines.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
        if (next) { e.preventDefault(); next.focus(); }
      }
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // على الجوال تُفتح كورقة سفلية: نمنع تحرّك الصفحة خلفها
  useEffect(() => {
    if (!open || typeof window === 'undefined' || !window.matchMedia('(max-width: 1023px)').matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const lines = summary ? summary.lines : [];
  const sums: Record<Severity, number> = { urgent: 0, action: 0, info: 0 };
  for (const l of lines) if (l.badge > 0) sums[l.severity] += l.badge;
  const total = summary ? summary.total : 0;
  const name = (staffName ?? '').trim();

  return (
    <>
      <div className="vd-npscrim" aria-hidden="true" onClick={() => closeNotificationsPanel(true)} />
      <div ref={ref} id="vd-np" className="vd-np" role="dialog" aria-modal="true" aria-labelledby="vd-np-t" aria-busy={summary === null} tabIndex={-1}>
        <div className="vd-nph">
          <span className="vd-nphi" aria-hidden="true"><BellIcon /></span>
          <div className="vd-npht">
            <h2 id="vd-np-t">مركز الإشعارات</h2>
            <p className="vd-npsub">{greeting()}{name ? `، ${name}` : ''}</p>
          </div>
          <button type="button" className="vd-npx" aria-label="إغلاق الإشعارات" onClick={() => closeNotificationsPanel(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        {summary && total > 0 && (
          <div className="vd-nps" role="status">
            <b>{waitingText(total)}</b>
            {GROUPS.map(({ sev, label }) => sums[sev] > 0 && <span key={sev} className={`vd-npp is-${sev}`}><i />{sums[sev]} {label}</span>)}
          </div>
        )}

        <div className="vd-npb">
          {!summary && <Skeleton />}

          {summary && summary.allClear && (
            <div className="vd-nok" role="status">
              <span className="vd-nok-i" aria-hidden="true"><Svg><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg></span>
              <div><b>{summary.encouragement}</b><p>سنُنبّهكم هنا فور أن يستجدّ شيء</p></div>
            </div>
          )}

          {summary && lines.length === 0 && !summary.allClear && <p className="vd-npe">لا إشعارات في البيانات المحمّلة حتى الآن.</p>}

          {GROUPS.map(({ sev, label }) => {
            const group = lines.filter((l) => l.severity === sev);
            if (!group.length) return null;
            return (
              <section key={sev} aria-labelledby={`vd-ng-${sev}`}>
                <h3 id={`vd-ng-${sev}`} className={`vd-ngh is-${sev}`}>{label}</h3>
                <ul className="vd-ng">
                  {group.map((l) => <Line key={l.id} line={l} onGo={onGo} />)}
                </ul>
              </section>
            );
          })}

          {summary && !summary.complete && (
            <p className="vd-npw" role="status">
              <Svg><path d="M12 4 3 19.5h18z" /><path d="M12 10v4.5M12 17.2v.1" /></Svg>
              تعذّر تحميل بعض البيانات، وقد تظهر إشعارات إضافية بعد التحديث.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
