'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isMemberOnline } from '@/lib/presence';

function normalizeMember(docSnap) {
  const data = docSnap.data() || {};

  const id = data.uid || docSnap.id;

  const displayName =
    data.name ||
    data.displayName ||
    data.fullName ||
    data.email ||
    'Member';

  const room =
    data.roomName ||
    data.roomNo ||
    data.roomNumber ||
    data.assignedRoom ||
    data.room ||
    data.roomId ||
    '';

  const active = isMemberOnline(data);

  return {
    id,
    uid: id,
    ...data,
    name: displayName,
    displayName,
    room,
    isActive: active,
    presenceStatus: active ? 'active' : 'away',
    presenceLabel: active ? 'Active' : 'Away',
  };
}

export function useChatMembers(currentUser = null) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const currentUserId =
    typeof currentUser === 'string'
      ? currentUser
      : currentUser?.uid || currentUser?.id || null;

  useEffect(() => {
    const usersRef = collection(db, 'users');

    const unsubscribe = onSnapshot(
      usersRef,
      (snapshot) => {
        const list = snapshot.docs
          .map(normalizeMember)
          .filter((member) => member?.id && member?.email)
          .sort((a, b) => {
            if (a.isActive === b.isActive) {
              return (a.name || '').localeCompare(b.name || '');
            }

            return a.isActive ? -1 : 1;
          });

        setMembers(list);
        setLoading(false);
      },
      (error) => {
        console.error('Live members listener failed:', error);
        setMembers([]);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const otherMembers = useMemo(() => {
    if (!currentUserId) return members;
    return members.filter((member) => member.id !== currentUserId);
  }, [members, currentUserId]);

  return {
    members,
    otherMembers,
    loading,
  };
}
