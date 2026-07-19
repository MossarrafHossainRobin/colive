export function getMemberName(member) {
  return member?.name || member?.displayName || member?.fullName || member?.email || 'Member';
}

export function getConversationNickname(conversation) {
  const otherUserId = conversation?.otherUser?.uid || conversation?.otherUser?.id;
  return otherUserId ? conversation?.convData?.nickname?.[otherUserId] || '' : '';
}

export function getConversationName(conversation) {
  return getConversationNickname(conversation) || getMemberName(conversation?.otherUser);
}

export function isConversationMuted(conversation, userId) {
  return Boolean(userId && conversation?.convData?.mutedBy?.includes(userId));
}

export function isConversationBlockedByMe(conversation, userId) {
  return Boolean(userId && conversation?.convData?.blockedBy?.includes(userId));
}

export function isConversationBlockedByThem(conversation, userId) {
  return Boolean(
    userId && conversation?.convData?.blockedBy?.some((id) => id !== userId)
  );
}
