'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { onMessageListener } from '@/lib/firebase';

export default function ForegroundPushListener() {
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onMessageListener((payload) => {
      const data = payload?.data || {};
      const title = data.title || 'New message';
      const body = data.body || 'You have a new update';
      const url = data.url || '/notifications';

      toast.custom(
        (item) => (
          <button
            type="button"
            onClick={() => {
              toast.dismiss(item.id);
              router.push(url);
            }}
            className="flex w-[min(92vw,380px)] items-center gap-3 rounded-lg bg-white p-3 text-left shadow-2xl ring-1 ring-black/10"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0084ff] text-lg font-bold text-white">
              {data.type === 'chat' ? 'M' : 'N'}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-[#050505]">{title}</span>
              <span className="block truncate text-[13px] text-[#65676b]">{body}</span>
            </span>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#0084ff]" />
          </button>
        ),
        { duration: 5000, position: 'top-right' }
      );
    });

    return () => unsubscribe?.();
  }, [router]);

  return null;
}
