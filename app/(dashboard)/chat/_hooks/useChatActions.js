'use client';

import { useCallback } from 'react';
import {
  archiveConversation,
  markConversationRead,
  openOrCreateConversation,
  pinConversation,
} from '../_services/conversationService';

export function useChatActions(user) {
  const openChat = useCallback(
    async (memberId) => openOrCreateConversation(user?.uid, memberId),
    [user?.uid]
  );

  const markRead = useCallback(
    async (conversationId) => markConversationRead(conversationId, user?.uid),
    [user?.uid]
  );

  const archiveChat = useCallback(
    async (conversationId, archived = true) => archiveConversation(conversationId, user?.uid, archived),
    [user?.uid]
  );

  const pinChat = useCallback(
    async (conversationId, pinned = true) => pinConversation(conversationId, user?.uid, pinned),
    [user?.uid]
  );

  return { openChat, markRead, archiveChat, pinChat };
}
