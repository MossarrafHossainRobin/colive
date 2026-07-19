export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const UTILITY_TYPES = [
  { value: 'khala', label: 'Khala Bill' },
  { value: 'electricity', label: 'Current Bill' },
  { value: 'dust', label: 'Dust Bill' },
  { value: 'internet', label: 'WiFi Bill' },
  { value: 'gas', label: 'Gas Bill' },
  { value: 'water', label: 'Water Kit' },
  { value: 'extra_rent', label: 'Extra House Rent' },
  { value: 'eid_bonus', label: 'Eid Bonus' },
];

export function getCurrentMonthId() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function generateMonthOptions(startYear = 2026, endYear = 2030) {
  const options = [];

  for (let year = startYear; year <= endYear; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const value = `${year}-${String(month).padStart(2, '0')}`;

      options.push({
        value,
        year,
        month,
        label: `${MONTH_NAMES[month - 1]} ${year}`,
        shortLabel: MONTH_NAMES[month - 1].slice(0, 3),
      });
    }
  }

  return options;
}

export function previousMonthId(monthId) {
  const [yearRaw, monthRaw] = String(monthId).split('-').map(Number);

  if (!yearRaw || !monthRaw) return '';

  if (monthRaw === 1) {
    return `${yearRaw - 1}-12`;
  }

  return `${yearRaw}-${String(monthRaw - 1).padStart(2, '0')}`;
}

export function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function formatTaka(value) {
  return `৳${Math.ceil(Math.abs(toNumber(value))).toLocaleString()}`;
}

export function formatSignedTaka(value) {
  const number = Math.ceil(toNumber(value));

  if (number < 0) {
    return `+৳${Math.abs(number).toLocaleString()}`;
  }

  return `৳${number.toLocaleString()}`;
}

export function parsePaymentInput(raw) {
  const value = String(raw || '')
    .replace(/,/g, '')
    .replace(/\s/g, '')
    .trim();

  if (!value) {
    return {
      valid: true,
      installments: [],
      total: 0,
      error: '',
    };
  }

  if (!/^\d+(\+\d+)*$/.test(value)) {
    return {
      valid: false,
      installments: [],
      total: 0,
      error: 'Use only numbers and plus signs. Example: 1000+1200+3000',
    };
  }

  const installments = value
    .split('+')
    .map(Number)
    .filter((amount) => amount > 0);

  return {
    valid: true,
    installments,
    total: installments.reduce((sum, amount) => sum + amount, 0),
    error: '',
  };
}

export function getPaymentText(payments = []) {
  if (!Array.isArray(payments)) return '';

  return payments
    .map((payment) => payment.amount)
    .filter(Boolean)
    .join('+');
}

export function getStatus(balance, netPayableBeforePayment, paidAmount) {
  if (balance < 0) return 'advance';
  if (netPayableBeforePayment > 0 && balance === 0) return 'paid';
  if (paidAmount > 0) return 'partial';

  return 'pending';
}

export function makeUtilityInputDefaults(existingBreakdown = []) {
  const map = Object.fromEntries(
    UTILITY_TYPES.map((item) => [
      item.value,
      {
        label: item.label,
        amount: '',
      },
    ])
  );

  existingBreakdown.forEach((item) => {
    if (map[item.type]) {
      map[item.type] = {
        label: item.label || item.note || map[item.type].label,
        amount: item.totalCost || item.totalUtilityCost || item.amount || '',
      };
    }
  });

  return map;
}

export function buildUtilityBreakdown(utilityInputs = {}) {
  return Object.entries(utilityInputs)
    .map(([type, item]) => ({
      type,
      label: item.label,
      totalCost: toNumber(item.amount),
    }))
    .filter((item) => item.totalCost > 0);
}

export function calculateMonthlySetup({ members, rentByRoom, utilityInputs, monthId }) {
  const activeMembers = members.filter((member) => {
    return isMemberAccountActive(member) && member.room;
  });

  const memberCount = activeMembers.length || 1;
  const utilityBreakdown = buildUtilityBreakdown(utilityInputs);

  const totalUtilityCost = utilityBreakdown.reduce(
    (sum, item) => sum + item.totalCost,
    0
  );

  const utilityShare = Math.ceil(totalUtilityCost / memberCount);

  return {
    month: monthId,
    activeMembers,
    memberCount,
    utilityBreakdown,
    totalUtilityCost,
    utilityShare,
    rentByRoom,
  };
}

export function calculateMemberMonth({
  member,
  setup,
  previousBalance = 0,
  paidAmount = 0,
  payments = [],
}) {
  const roomRentTotal = toNumber(setup.rentByRoom?.[member.room]);

  const membersInRoom =
    setup.activeMembers.filter((person) => person.room === member.room).length || 1;

  const roomRentShare = Math.ceil(roomRentTotal / membersInRoom);
  const utilityShare = Math.ceil(toNumber(setup.utilityShare));

  const currentMonthCharge = Math.ceil(roomRentShare + utilityShare);
  const previousDueOrAdvance = Math.ceil(toNumber(previousBalance));
  const netPayableBeforePayment = Math.ceil(
    currentMonthCharge + previousDueOrAdvance
  );

  const totalPayable = Math.max(0, netPayableBeforePayment);
  const balance = Math.ceil(netPayableBeforePayment - toNumber(paidAmount));

  return {
    userId: member.id,
    name: member.displayName || member.name || 'Member',
    room: member.room,
    month: setup.month,
    roomRent: roomRentShare,
    utility: utilityShare,
    previousBalance: previousDueOrAdvance,
    currentMonthCharge,
    totalPayable,
    paidAmount: toNumber(paidAmount),
    balance,
    status: getStatus(balance, netPayableBeforePayment, toNumber(paidAmount)),
    payments,
  };
}

export function recalculateMemberAfterPayment(memberRow, paidAmount, payments) {
  const netPayableBeforePayment = Math.ceil(
    toNumber(memberRow.currentMonthCharge || 0) +
      toNumber(memberRow.previousBalance || 0)
  );

  const totalPayable = Math.max(0, netPayableBeforePayment);
  const balance = Math.ceil(netPayableBeforePayment - toNumber(paidAmount));

  return {
    ...memberRow,
    totalPayable,
    paidAmount: toNumber(paidAmount),
    payments,
    balance,
    status: getStatus(balance, netPayableBeforePayment, toNumber(paidAmount)),
  };
}

export function calculateSummary(memberRows) {
  return memberRows.reduce(
    (summary, row) => {
      summary.totalRent += toNumber(row.roomRent);
      summary.totalUtility += toNumber(row.utility);
      summary.totalPayable += toNumber(row.totalPayable);
      summary.totalPaid += toNumber(row.paidAmount);

      if (row.balance > 0) {
        summary.totalDue += row.balance;
      }

      if (row.balance < 0) {
        summary.totalAdvance += Math.abs(row.balance);
      }

      return summary;
    },
    {
      totalRent: 0,
      totalUtility: 0,
      totalPayable: 0,
      totalPaid: 0,
      totalDue: 0,
      totalAdvance: 0,
    }
  );
}
import { isMemberAccountActive } from '@/lib/memberPolicy';
