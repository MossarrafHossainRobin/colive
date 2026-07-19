'use client';

import { useMemo } from 'react';
import {
  toggleBlock,
  toggleMute,
  saveNickname,
} from '../_services/preferenceService';

export function useChatPreferences({ activeChat, user }) {
  const preferences = useMemo(() => {
    const data = activeChat?.convData || {};
    const mutedBy = data.mutedBy || [];
    const blockedBy = data.blockedBy || [];

    return {
      muted: mutedBy.includes(user?.uid),
      blocked: blockedBy.includes(user?.uid),
      blockedByThem: blockedBy.some((id) => id !== user?.uid),
      nickname: data.nickname?.[activeChat?.otherUser?.id] || '',
    };
  }, [activeChat?.convData, activeChat?.otherUser?.id, user?.uid]);

  return {
    ...preferences,
    mute: (nextValue) => toggleMute(activeChat?.id, user?.uid, nextValue),
    block: (nextValue) => toggleBlock(activeChat?.id, user?.uid, nextValue),
    nickname: preferences.nickname,
    saveNickname: (nickname) => saveNickname(activeChat?.id, activeChat?.otherUser?.id, nickname),
  };
}
