export const PRESENCE_HEARTBEAT_MS = 30_000;
export const PRESENCE_ACTIVE_THRESHOLD_MS = 2 * 60_000;

export function presenceDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Account membership and browser presence are deliberately separate:
 * - isActive: admin-controlled account/member status
 * - isOnline: heartbeat-controlled browser presence
 */
export function isMemberOnline(member, now = Date.now()) {
  if (!member || member.presenceMode === 'away') return false;

  const hasCurrentPresenceField = member.isOnline !== undefined;
  const explicitlyOnline = hasCurrentPresenceField
    ? member.isOnline === true
    : member.presenceStatus === 'active' &&
      member.presenceUpdatedAt !== undefined;

  if (!explicitlyOnline) return false;

  const updatedAt = presenceDate(
    member.presenceUpdatedAt || member.lastSeen || member.lastActiveAt
  );

  if (!updatedAt) return false;

  return now - updatedAt.getTime() <= PRESENCE_ACTIVE_THRESHOLD_MS;
}

export function getPresenceLabel(member) {
  return isMemberOnline(member) ? 'Active' : 'Away';
}
