'use client';

import { useEffect, useRef } from 'react';

// أسماء الأحداث التي تُطلقها القائمة الجانبية حين تكون صفحة المزمنين مفتوحة أصلاً
export const OPEN_INVENTORY_EVENT = 'vd:open-inventory';
export const CLOSE_INVENTORY_EVENT = 'vd:close-inventory';

// حالة «جهّز مخزونك» (مفتوح/مغلق): تنشرها صفحة المزمنين وتقرؤها القائمة الجانبية لتلوّن البند الصحيح.
// متغيرات على مستوى الملف مع اشتراك بسيط، فلا تضيع الحالة مهما كان ترتيب تحميل الصفحة والقائمة.
// «pending» = طُلب الفتح من صفحة أخرى والصفحة لم تصل بعد: يمنع وميض «المزمنون» أثناء الانتقال، وينتهي بوصول الصفحة أو بعد مهلة قصيرة.
let inventoryOpen = false;
let pending = false;
let pendingTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

export const subscribeInventoryState = (cb: () => void) => {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
};
export const getInventoryOpen = () => inventoryOpen || pending;

function setState(nextOpen: boolean, nextPending: boolean) {
  const before = inventoryOpen || pending;
  inventoryOpen = nextOpen;
  pending = nextPending;
  if ((inventoryOpen || pending) !== before) listeners.forEach(l => l());
}
export function requestInventoryOpen() {
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => setState(inventoryOpen, false), 4000);
  setState(inventoryOpen, true);
}
export function cancelInventoryRequest() {
  clearTimeout(pendingTimer);
  setState(inventoryOpen, false);
}
const publish = (next: boolean) => setState(next, next ? false : pending);

// يربط صفحة المزمنين بالقائمة الجانبية:
//  (أ) فتح التبويب عند الوصول إلى /dashboard/chronic?view=inventory (ثم يزيل الوسيط من الرابط كي لا يُعاد فتحه عند التحديث)
//  (ب) فتحه عند وصول حدث الفتح، وإغلاقه عند وصول حدث الإغلاق، والصفحة مفتوحة أصلاً
//  (ج) نشر حالته الحالية للقائمة، وإعلان «مغلق» عند مغادرة الصفحة.
// لا يفعل شيئاً إن لم يصله أيٌّ من ذلك، فلا أثر له على الواجهة القديمة.
export function useInventoryDeepLink(isOpen: boolean, onOpen: () => void, onClose: () => void) {
  const openRef = useRef(onOpen);
  const closeRef = useRef(onClose);
  useEffect(() => { openRef.current = onOpen; closeRef.current = onClose; });

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('view') === 'inventory') {
      openRef.current();
      window.history.replaceState(null, '', window.location.pathname);
    }
    const handleOpen = () => openRef.current();
    const handleClose = () => closeRef.current();
    window.addEventListener(OPEN_INVENTORY_EVENT, handleOpen);
    window.addEventListener(CLOSE_INVENTORY_EVENT, handleClose);
    return () => {
      window.removeEventListener(OPEN_INVENTORY_EVENT, handleOpen);
      window.removeEventListener(CLOSE_INVENTORY_EVENT, handleClose);
      setState(false, pending);
    };
  }, []);

  useEffect(() => { publish(isOpen); }, [isOpen]);
}
