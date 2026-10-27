'use client';

import { useEffect, useRef } from 'react';

// اسم الحدث الذي تُطلقه القائمة الجانبية حين تكون صفحة المزمنين مفتوحة أصلاً
export const OPEN_INVENTORY_EVENT = 'vd:open-inventory';

// يفتح تبويب «جهّز مخزونك» داخل صفحة المزمنين من خارجها:
//  (أ) عند الوصول إلى /dashboard/chronic?view=inventory (ثم يزيل الوسيط من الرابط كي لا يُعاد فتحه عند التحديث)
//  (ب) عند وصول الحدث أعلاه والصفحة مفتوحة أصلاً.
// لا يفعل شيئاً إن لم يصله أيٌّ منهما، فلا أثر له على الواجهة القديمة.
export function useInventoryDeepLink(open: () => void) {
  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; });

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('view') === 'inventory') {
      openRef.current();
      window.history.replaceState(null, '', window.location.pathname);
    }
    const onOpen = () => openRef.current();
    window.addEventListener(OPEN_INVENTORY_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_INVENTORY_EVENT, onOpen);
  }, []);
}
