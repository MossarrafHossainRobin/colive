function toMillis(value) {
  if (!value) return 0;

  if (typeof value === 'number') return value;

  if (value instanceof Date) {
    return value.getTime();
  }

  if (value?.toDate) {
    return value.toDate().getTime();
  }

  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  return 0;
}

function getConversationTime(conversation) {
  const data = conversation?.convData || conversation || {};

  return (
    toMillis(data.lastMessageAt) ||
    toMillis(data.updatedAt) ||
    toMillis(data.createdAt) ||
    toMillis(conversation?.lastMessageAt) ||
    toMillis(conversation?.updatedAt) ||
    0
  );
}

export function sortConversations(conversations = []) {
  return [...conversations].sort((a, b) => {
    const pinnedA = a?.isPinned === true;
    const pinnedB = b?.isPinned === true;

    if (pinnedA !== pinnedB) {
      return pinnedA ? -1 : 1;
    }

    const timeA = getConversationTime(a);
    const timeB = getConversationTime(b);

    if (timeA !== timeB) {
      return timeB - timeA;
    }

    const unreadA = Number(a?.unreadForMe || 0);
    const unreadB = Number(b?.unreadForMe || 0);

    if (unreadA !== unreadB) {
      return unreadB - unreadA;
    }

    const nameA =
      a?.otherUser?.name ||
      a?.otherUser?.displayName ||
      a?.otherUser?.email ||
      '';

    const nameB =
      b?.otherUser?.name ||
      b?.otherUser?.displayName ||
      b?.otherUser?.email ||
      '';

    return nameA.localeCompare(nameB);
  });
}

export default sortConversations;