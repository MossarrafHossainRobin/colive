export function toDate(value) {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
}

export function formatMessageTime(timestamp) {
  const date = toDate(timestamp);
  if (!date || Number.isNaN(date.getTime())) return '';

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatConversationTime(timestamp) {
  const date = toDate(timestamp);
  if (!date || Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return 'Now';
  if (diffMinutes < 60) return `${diffMinutes}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' });

  return date.toLocaleDateString([], {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
  });
}

export function formatMessageDate(timestamp) {
  const date = toDate(timestamp);
  if (!date || Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) return 'Today';

  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);

  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) return 'Yesterday';

  return date.toLocaleDateString([], {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatMessageDateKey(timestamp) {
  const date = toDate(timestamp);
  if (!date || Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function formatLastSeen(timestamp) {
  const date = toDate(timestamp);
  if (!date || Number.isNaN(date.getTime())) return 'Offline';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return 'Active now';
  if (diffMinutes < 60) return `Active ${diffMinutes}m ago`;
  if (diffHours < 24) return `Active ${diffHours}h ago`;
  if (diffDays === 1) return 'Active yesterday';

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function formatLastActive(userOrTimestamp) {
  if (!userOrTimestamp) return 'Offline';

  if (typeof userOrTimestamp === 'object' && isMemberOnline(userOrTimestamp)) {
    return 'Active now';
  }

  if (typeof userOrTimestamp === 'object') {
    return formatLastSeen(
      userOrTimestamp.lastSeen ||
        userOrTimestamp.presenceUpdatedAt ||
        userOrTimestamp.updatedAt
    );
  }

  return formatLastSeen(userOrTimestamp);
}

export function formatMemberJoined(timestamp) {
  const date = toDate(timestamp);
  if (!date || Number.isNaN(date.getTime())) return 'Not available';

  return date.toLocaleDateString([], {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}
import { isMemberOnline } from '@/lib/presence';
