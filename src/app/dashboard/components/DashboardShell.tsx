'use client';

import './dashboard-shell.css';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { DashboardSidebar, DashboardTopBar } from './DashboardSidebar';

type SbPref = 'auto' | 'expanded' | 'rail';

const KEY = 'vd-sb';

// تفضيل الطي المحفوظ؛ غيابه = auto (يتبع عرض الشاشة). كل وصول للتخزين داخل try لأنه قد يُحجب
function readPref(): SbPref {
  if (typeof window === 'undefined') return 'auto';
  try {
    const v = localStorage.getItem(KEY);
    return v === 'rail' || v === 'expanded' ? v : 'auto';
  } catch { return 'auto'; }
}

function savePref(v: SbPref) {
  try { localStorage.setItem(KEY, v); } catch { }
}

// عرض النافذة (لا الحاوية)، مثل نقاط التحوّل في dashboard-shell.css
function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * جذر القائمة الجانبية (.vd) وعمود المحتوى (.vd-colw). لا يُركَّب إلا بعد نجاح حارس dashboard/layout.tsx
 * (HTML الخادم هناك شاشة التحقق فقط)، فقراءة localStorage في مهيّئ الحالة لا تسبب hydration mismatch.
 * لا تضف هنا container-type ولا transform ولا filter ولا overflow ولا z-index: كلها تكسر نوافذ الصفحات الثابتة.
 */
export default function DashboardShell({ banner, children }: { banner?: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const [sb, setSb] = useState<SbPref>(readPref);
  // الدرج مفتوح فقط للمسار الذي فُتح فيه: تغيّر المسار يغلقه دون setState داخل effect
  const [openAt, setOpenAt] = useState<string | null>(null);
  const isXL = useMedia('(min-width:1280px)');
  const isLG = useMedia('(min-width:1024px)');
  const burgerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const expanded = sb === 'auto' ? isXL : sb === 'expanded';
  // بلا غطاء على سطح المكتب أبداً: .fixed.inset-0 يقفل تمرير الصفحة (globals.css)
  const drawerOpen = openAt === pathname && !isLG;

  // عبور 1024px والدرج مفتوح: يُصفَّر كي لا يعود مفتوحاً عند التصغير لاحقاً
  useEffect(() => {
    const m = window.matchMedia('(min-width:1024px)');
    const onChange = (e: MediaQueryListEvent) => { if (e.matches) setOpenAt(null); };
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }, []);

  useEffect(() => { if (drawerOpen) closeRef.current?.focus(); }, [drawerOpen]);

  const openDrawer = () => {
    if (window.matchMedia('(min-width:1024px)').matches) return;
    setOpenAt(pathname);
  };
  const closeDrawer = (restoreFocus: boolean) => {
    setOpenAt(null);
    if (restoreFocus) burgerRef.current?.focus();
  };
  const toggleSb = () => {
    const next: SbPref = expanded ? 'rail' : 'expanded';
    savePref(next);
    setSb(next);
  };

  return (
    <div className="vd" data-sb={sb} data-dr={drawerOpen ? 'open' : 'closed'}>
      <DashboardSidebar expanded={expanded} onToggle={toggleSb} drawerOpen={drawerOpen} onCloseDrawer={closeDrawer} closeRef={closeRef} />
      {drawerOpen && <div className="vd-scrim fixed inset-0" onClick={() => closeDrawer(false)} />}
      <div className="vd-colw">
        {banner}
        <DashboardTopBar onOpen={openDrawer} burgerRef={burgerRef} drawerOpen={drawerOpen} />
        {children}
      </div>
    </div>
  );
}
