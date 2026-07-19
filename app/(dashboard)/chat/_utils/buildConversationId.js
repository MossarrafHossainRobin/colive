export function buildConversationId(userId, otherUserId) {
  if (!userId || !otherUserId) return '';
  return [userId, otherUserId].sort().join('_');
}
