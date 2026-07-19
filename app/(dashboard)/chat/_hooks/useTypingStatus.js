'use client';

import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CHAT_COLLECTIONS } from '../_constants/chatCollections';
import { setTypingStatus } from '../_services/chatService';

export function useTypingStatus({ conversationId, conversationIds = [], userId } = {}) {
  const [typingUsers, setTypingUsers] = useState([]);
  const [typingMap, setTypingMap] = useState({});

  const idsKey = useMemo(() => conversationIds.filter(Boolean).sort().join('|'), [conversationIds]);

  useEffect(() => {
    if (!conversationId) {
      setTypingUsers([]);
      return undefined;
    }

    const unsubscribe = onSnapshot(
      doc(db, CHAT_COLLECTIONS.TYPING_STATUS, conversationId),
      (snapshot) => {
        const data = snapshot.data() || {};
        const users = Object.entries(data)
          .filter(([key, value]) => key !== 'updatedAt' && key !== userId && value === true)
          .map(([key]) => key);
        setTypingUsers(users);
      },
      () => setTypingUsers([])
    );

    return unsubscribe;
  }, [conversationId, userId]);

  useEffect(() => {
    const ids = idsKey ? idsKey.split('|') : [];
    if (ids.length === 0) {
      setTypingMap({});
      return undefined;
    }

    const unsubscribes = ids.map((id) =>
      onSnapshot(
        doc(db, CHAT_COLLECTIONS.TYPING_STATUS, id),
        (snapshot) => {
          const data = snapshot.data() || {};
          const isTyping = Object.entries(data).some(
            ([key, value]) => key !== 'updatedAt' && key !== userId && value === true
          );

          setTypingMap((prev) => ({ ...prev, [id]: isTyping }));
        },
        () => setTypingMap((prev) => ({ ...prev, [id]: false }))
      )
    );

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [idsKey, userId]);

  return { typingUsers, typingMap, setTypingStatus };
}
