/**
 * Membership is admin-controlled and must never depend on browser presence.
 * `membershipStatus` is the authoritative field going forward. The legacy
 * fallback repairs records whose `isActive` value was previously overwritten
 * by the old presence heartbeat.
 */
export function isMembershipEnabled(member) {
  if (!member) return false;
  if (member.membershipStatus === 'disabled') return false;
  if (member.membershipStatus === 'active') return true;
  if (member.isActive !== false) return true;

  return Boolean(
    member.presenceUpdatedAt ||
      member.presenceStatus ||
      member.presenceMode
  );
}

export function isMemberAccountActive(member) {
  return isMembershipEnabled(member) && member?.isBlocked !== true;
}

export function membershipStatusFor(active) {
  return active ? 'active' : 'disabled';
}
