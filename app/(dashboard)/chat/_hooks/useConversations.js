'use client';

import { useEffect, useMemo, useState } from 'react';
import { subscribeConversations } from '../_services/conversationService';
import { sortConversations } from '../_utils/sortConversations';

export function useConversations(user) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const userId =
    typeof user === 'string'
      ? user
      : user?.uid || user?.id || null;

  useEffect(() => {
    if (!userId) {
      setConversations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    const unsubscribe = subscribeConversations(
      userId,
      (items) => {
        setConversations(sortConversations(items || []));
        setLoading(false);
      },
      (err) => {
        console.error('Conversations listener failed:', err);
        setError(err?.message || 'Failed to load conversations');
        setLoading(false);
      }
    );

    return () => {
      unsubscribe?.();
    };
  }, [userId]);

  const unreadTotal = useMemo(() => {
    return conversations.reduce((total, conversation) => {
      return total + Number(conversation?.unreadForMe || 0);
    }, 0);
  }, [conversations]);

  return {
    conversations,
    loading,
    error,
    unreadTotal,
  };
}

export default useConversations;