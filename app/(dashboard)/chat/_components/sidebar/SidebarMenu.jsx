'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Archive,
  CheckCheck,
  Home,
  Settings,
  Users,
} from 'lucide-react';

export default function SidebarMenu({
  open,
  onClose,
  dashboardPath = '/dashboard',
  showArchived = false,
  onToggleArchived,
  onMarkAllRead,
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;

    const handleClick = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClick);

    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onClose]);

  if (!open) return null;

  const buttonClass =
    'w-full px-3 py-2.5 flex items-center gap-3 text-left text-[14px] text-[#050505] hover:bg-[#F0F2F5] transition';

  return (
    <div
      ref={ref}
      className="absolute right-4 top-16 z-[100] w-60 rounded-2xl bg-white border border-gray-100 shadow-2xl py-2"
    >
      <Link href={dashboardPath} onClick={onClose} className={buttonClass}>
        <span className="w-8 h-8 rounded-full bg-[#F0F2F5] flex items-center justify-center">
          <Home className="w-4 h-4 text-[#050505]" />
        </span>

        <span className="font-medium">Go to dashboard</span>
      </Link>

      <button
        type="button"
        onClick={() => {
          onToggleArchived?.();
          onClose();
        }}
        className={buttonClass}
      >
        <span className="w-8 h-8 rounded-full bg-[#F0F2F5] flex items-center justify-center">
          <Archive className="w-4 h-4 text-[#050505]" />
        </span>

        <span className="font-medium">
          {showArchived ? 'Back to inbox' : 'Archived chats'}
        </span>
      </button>

      <button
        type="button"
        onClick={() => {
          onMarkAllRead?.();
          onClose();
        }}
        className={buttonClass}
      >
        <span className="w-8 h-8 rounded-full bg-[#F0F2F5] flex items-center justify-center">
          <CheckCheck className="w-4 h-4 text-[#050505]" />
        </span>

        <span className="font-medium">Mark all as read</span>
      </button>

      <button type="button" onClick={onClose} className={buttonClass}>
        <span className="w-8 h-8 rounded-full bg-[#F0F2F5] flex items-center justify-center">
          <Users className="w-4 h-4 text-[#050505]" />
        </span>

        <span className="font-medium">Manage members</span>
      </button>

      <button type="button" onClick={onClose} className={buttonClass}>
        <span className="w-8 h-8 rounded-full bg-[#F0F2F5] flex items-center justify-center">
          <Settings className="w-4 h-4 text-[#050505]" />
        </span>

        <span className="font-medium">Chat settings</span>
      </button>
    </div>
  );
}