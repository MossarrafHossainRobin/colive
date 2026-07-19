export function bazarAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

export function isCurrentBazarEntry(entry) {
  return Boolean(entry) && entry.isDeleted !== true;
}

export function shouldCountBazarEntry(entry) {
  return isCurrentBazarEntry(entry) && entry.countInBazar !== false;
}

export function calculateMonthlyBazarTotals(entries = [], monthId = '') {
  return entries.reduce(
    (totals, entry) => {
      if (!isCurrentBazarEntry(entry)) return totals;
      if (monthId && String(entry.month || '') !== String(monthId)) return totals;

      const amount = bazarAmount(entry.amount);
      const memberId = entry.userId || entry.memberId || '';

      totals.rawHouse += amount;
      if (memberId) {
        totals.rawByMember[memberId] = (totals.rawByMember[memberId] || 0) + amount;
        totals.rawCountByMember[memberId] =
          (totals.rawCountByMember[memberId] || 0) + 1;
      }

      if (!shouldCountBazarEntry(entry)) {
        totals.excludedHouse += amount;
        if (memberId) {
          totals.excludedByMember[memberId] =
            (totals.excludedByMember[memberId] || 0) + amount;
        }
        return totals;
      }

      totals.house += amount;
      if (memberId) {
        totals.byMember[memberId] = (totals.byMember[memberId] || 0) + amount;
        totals.countByMember[memberId] =
          (totals.countByMember[memberId] || 0) + 1;
      }

      return totals;
    },
    {
      house: 0,
      rawHouse: 0,
      excludedHouse: 0,
      byMember: {},
      countByMember: {},
      rawByMember: {},
      rawCountByMember: {},
      excludedByMember: {},
    }
  );
}

export function calculateMemberMonthlyBazarTotal(
  entries = [],
  memberId,
  monthId = ''
) {
  if (!memberId) return 0;
  return calculateMonthlyBazarTotals(entries, monthId).byMember[memberId] || 0;
}
