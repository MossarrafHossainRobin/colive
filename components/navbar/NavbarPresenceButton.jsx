'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { db } from '@/lib/firebase';
import {
  isMemberOnline,
  PRESENCE_HEARTBEAT_MS,
} from '@/lib/presence';

export default function NavbarPresenceButton({ user }) {
  const pathname = usePathname() || '';

  const [status, setStatus] = useState('away');
  const [presenceMode, setPresenceMode] = useState('auto');
  const [saving, setSaving] = useState(false);

  const userRef = useMemo(() => {
    if (!user?.uid) return null;
    return doc(db, 'users', user.uid);
  }, [user?.uid]);

  const updatePresence = useCallback(
    async ({ online, mode = presenceMode }) => {
      if (!userRef || !user?.uid) return;

      const finalOnline = mode === 'away' ? false : online;

      await setDoc(
        userRef,
        {
          uid: user.uid,
          isOnline: finalOnline,
          presenceStatus: finalOnline ? 'active' : 'away',
          presenceMode: mode,
          activeRoute: finalOnline ? pathname : '',
          lastSeen: serverTimestamp(),
          presenceUpdatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setStatus(finalOnline ? 'active' : 'away');
      setPresenceMode(mode);
    },
    [userRef, user?.uid, pathname, presenceMode]
  );

  useEffect(() => {
    if (!userRef) return;

    const unsubscribe = onSnapshot(userRef, (snapshot) => {
      const data = snapshot.data();

      if (!data) return;

      setStatus(isMemberOnline(data) ? 'active' : 'away');
      setPresenceMode(data.presenceMode || 'auto');
    });

    return unsubscribe;
  }, [userRef]);

  useEffect(() => {
    if (!userRef || !user?.uid) return;

    let mounted = true;

    const markActive = async () => {
      if (!mounted) return;
      if (presenceMode === 'away') return;

      if (document.visibilityState === 'visible') {
        await updatePresence({ online: true, mode: 'auto' });
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        markActive();
      }
    };

    const handleFocus = () => {
      markActive();
    };

    markActive();

    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === 'visible' && presenceMode !== 'away') {
        markActive();
      }
    }, PRESENCE_HEARTBEAT_MS);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      mounted = false;

      window.clearInterval(heartbeat);

      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [userRef, user?.uid, updatePresence, presenceMode]);

  useEffect(() => {
    if (!userRef || !user?.uid) return;
    if (presenceMode === 'away') return;
    if (document.visibilityState !== 'visible') return;

    updatePresence({ online: true, mode: 'auto' }).catch((error) => {
      console.error('Route presence update failed:', error);
    });
  }, [pathname, userRef, user?.uid, presenceMode, updatePresence]);

  const handleTogglePresence = async () => {
    if (!userRef || saving) return;

    setSaving(true);

    try {
      if (status === 'active') {
        await updatePresence({ online: false, mode: 'away' });
      } else {
        await updatePresence({ online: true, mode: 'auto' });
      }
    } catch (error) {
      console.error('Presence toggle failed:', error);
    } finally {
      setSaving(false);
    }
  };

  const isActive = status === 'active';

  return (
    <button
      type="button"
      onClick={handleTogglePresence}
      disabled={saving}
      title={isActive ? 'Active now. Click to set Away.' : 'Away. Click to set Active.'}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition disabled:opacity-60 ${
        isActive
          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {saving ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : isActive ? (
        <CheckCircle className="w-3.5 h-3.5" />
      ) : (
        <XCircle className="w-3.5 h-3.5" />
      )}

      <span>{isActive ? 'Active' : 'Away'}</span>
    </button>
  );
}
