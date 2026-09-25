'use client';

import { useEffect, useRef, useState } from 'react';
import { adminFetch } from '@/lib/admin-fetch';
import { Bell, ArrowsClockwise } from '@phosphor-icons/react';

type Notice = { id: string; kind: string; pharmacy_id: string | null; message: string; is_read: boolean; created_at: string };

interface NotificationsBellProps {
  isOwner: boolean;
  onPharmacyClick?: (pharmacyId: string) => void;
}

export default function NotificationsBell({ isOwner, onPharmacyClick }: NotificationsBellProps) {
  const [items, setItems] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const res = await adminFetch('/api/admin/notifications');
    const json = await res.json();
    setItems(json.data || []);
    setUnread(json.unread || 0);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open]);

  // إغلاق القائمة بالنقر خارجها
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const markAllRead = async () => {
    await adminFetch('/api/admin/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });
    await load();
  };

  const runNow = async () => {
    setRunning(true);
    try {
      await adminFetch('/api/cron/subscriptions', { method: 'POST' });
      await load();
    } finally {
      setRunning(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative text-current cursor-pointer"
        aria-label="الإشعارات"
      >
        <Bell size={18} weight="bold" aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute mt-2 w-80 max-h-96 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-2xl z-[80] p-2">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="font-bold text-sm text-slate-900">الإشعارات</span>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button onClick={markAllRead} className="text-[11px] text-slate-500 hover:text-slate-700 cursor-pointer">
                  تعليم الكل كمقروء
                </button>
              )}
              {isOwner && (
                <button
                  onClick={runNow}
                  aria-label="تشغيل الجولة الآن"
                  title="تشغيل جولة الاشتراكات الآن"
                  className="text-slate-500 hover:text-slate-700 cursor-pointer"
                >
                  <ArrowsClockwise size={14} weight="bold" aria-hidden="true" className={running ? 'animate-spin' : ''} />
                </button>
              )}
            </div>
          </div>

          {items.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">لا إشعارات</p>
          ) : (
            items.map(n => (
              <div
                key={n.id}
                onClick={n.pharmacy_id && onPharmacyClick ? () => onPharmacyClick(n.pharmacy_id as string) : undefined}
                className={`px-3 py-2 rounded-lg mb-1 text-xs ${n.pharmacy_id && onPharmacyClick ? 'cursor-pointer' : ''} ${n.is_read ? 'bg-slate-50' : 'bg-amber-50 border border-amber-100'}`}
              >
                <p className="text-slate-700">{n.message}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{new Date(n.created_at).toLocaleDateString('en-GB')}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
