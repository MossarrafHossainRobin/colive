export const YEARS = [2026, 2027, 2028, 2029, 2030];

export const MONTHS = [
  { value: 0, label: 'January' },
  { value: 1, label: 'February' },
  { value: 2, label: 'March' },
  { value: 3, label: 'April' },
  { value: 4, label: 'May' },
  { value: 5, label: 'June' },
  { value: 6, label: 'July' },
  { value: 7, label: 'August' },
  { value: 8, label: 'September' },
  { value: 9, label: 'October' },
  { value: 10, label: 'November' },
  { value: 11, label: 'December' },
];

export function safeDate(value) {
  if (!value) return null;
  if (value?.toDate) return value.toDate();

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

export function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function money(value) {
  return `৳${Math.round(Math.abs(numberValue(value))).toLocaleString()}`;
}

export function getMonthId(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function getMonthName(year, month) {
  return new Date(year, month).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

export function getMonthNameFromId(monthId) {
  if (!/^\d{4}-\d{2}$/.test(String(monthId))) return monthId || 'this month';

  const [year, month] = String(monthId).split('-').map(Number);
  return getMonthName(year, month - 1);
}

export function getUserPhoto(user) {
  return user?.photoURL || user?.photo || user?.avatar || '';
}

export function getUserName(user) {
  return user?.displayName || user?.name || user?.email?.split('@')[0] || 'User';
}

export function getInitial(name) {
  return String(name || 'U').charAt(0).toUpperCase();
}

export function getMemberId(member) {
  return member?.uid || member?.id;
}

export function getDeviceInfo() {
  if (typeof window === 'undefined') {
    return {
      isIOS: false,
      isStandalone: false,
      supportsPush: false,
      permission: 'default',
    };
  }

  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua);

  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  const supportsPush =
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window;

  return {
    isIOS,
    isStandalone,
    supportsPush,
    permission: 'Notification' in window ? Notification.permission : 'unsupported',
  };
}

export { isMemberOnline as isLive } from '@/lib/presence';

export function isPaidStatus(value) {
  const status = String(value || '').toLowerCase().trim();

  return [
    'paid',
    'fully_paid',
    'fully paid',
    'complete',
    'completed',
    'success',
    'successful',
    'successfully_paid',
    'successfully paid',
  ].includes(status);
}

export function isPartialStatus(value) {
  const status = String(value || '').toLowerCase().trim();

  return [
    'partial',
    'partially_paid',
    'partially paid',
    'part-paid',
  ].includes(status);
}

export function normalizeStatus(status, amount, paidAmount, dueAmount) {
  let cleanStatus = String(status || '').toLowerCase().trim();

  if (isPaidStatus(cleanStatus)) return 'paid';
  if (isPartialStatus(cleanStatus)) return 'partial';

  if (cleanStatus === 'unpaid') cleanStatus = 'pending';
  if (cleanStatus === 'due') cleanStatus = 'pending';

  if (!cleanStatus) {
    if (amount > 0 && dueAmount === 0) cleanStatus = 'paid';
    else if (paidAmount > 0 && dueAmount > 0) cleanStatus = 'partial';
    else cleanStatus = 'pending';
  }

  return cleanStatus;
}

export function normalizeBill(bill) {
  const amount = Math.ceil(numberValue(bill?.amount));
  const paidAmount = Math.ceil(numberValue(bill?.paidAmount));

  const dueAmount =
    bill?.dueAmount !== undefined && bill?.dueAmount !== null && bill?.dueAmount !== ''
      ? Math.max(0, Math.ceil(numberValue(bill.dueAmount)))
      : Math.max(0, amount - paidAmount);

  const status = normalizeStatus(bill?.status, amount, paidAmount, dueAmount);

  return {
    ...bill,
    displayAmount: amount,
    displayPaid: paidAmount,
    displayDue: dueAmount,
    displayStatus: status,
  };
}

export function isBillPaidFromDatabase(bill) {
  if (!bill) return false;

  if (bill.isPaid === true) return true;
  if (bill.paid === true) return true;
  if (bill.paymentCompleted === true) return true;
  if (bill.completed === true) return true;

  if (isPaidStatus(bill.status)) return true;
  if (isPaidStatus(bill.paymentStatus)) return true;
  if (isPaidStatus(bill.paidStatus)) return true;
  if (isPaidStatus(bill.billStatus)) return true;
  if (isPaidStatus(bill.rentStatus)) return true;

  if (
    bill?.dueAmount !== undefined &&
    bill?.dueAmount !== null &&
    bill?.dueAmount !== '' &&
    numberValue(bill.dueAmount) <= 0
  ) {
    return true;
  }

  return false;
}

export function isBillPartialFromDatabase(bill) {
  if (!bill) return false;

  if (isPartialStatus(bill.status)) return true;
  if (isPartialStatus(bill.paymentStatus)) return true;
  if (isPartialStatus(bill.paidStatus)) return true;
  if (isPartialStatus(bill.billStatus)) return true;

  return false;
}

export function getPaidDueStatusForShare(bill, share) {
  const cleanShare = Math.ceil(numberValue(share));

  // If admin/database marks this bill paid,
  // user page must show Paid even if paidAmount is 0.
  if (isBillPaidFromDatabase(bill)) {
    return {
      paid: cleanShare,
      due: 0,
      status: 'paid',
    };
  }

  const savedPaid = Math.ceil(numberValue(bill?.paidAmount));

  if (
    bill?.dueAmount !== undefined &&
    bill?.dueAmount !== null &&
    bill?.dueAmount !== ''
  ) {
    const databaseDue = Math.max(
      0,
      Math.min(cleanShare, Math.ceil(numberValue(bill.dueAmount)))
    );

    const paidFromDue = Math.max(0, cleanShare - databaseDue);

    return {
      paid: paidFromDue,
      due: databaseDue,
      status:
        databaseDue === 0
          ? 'paid'
          : paidFromDue > 0 || isBillPartialFromDatabase(bill)
            ? 'partial'
            : 'pending',
    };
  }

  const paid = Math.min(cleanShare, savedPaid);
  const due = Math.max(0, cleanShare - paid);

  return {
    paid,
    due,
    status:
      due === 0 && cleanShare > 0
        ? 'paid'
        : paid > 0 || isBillPartialFromDatabase(bill)
          ? 'partial'
          : 'pending',
  };
}

export function isRoomRentBill(bill) {
  const type = String(bill?.type || '').toLowerCase();
  const category = String(bill?.category || '').toLowerCase();
  const note = String(bill?.note || '').toLowerCase();

  const isExtraRent =
    type.includes('extra_rent') ||
    type.includes('extra rent') ||
    note.includes('extra house rent') ||
    note.includes('extra rent');

  if (isExtraRent) return false;

  return (
    category === 'rent' ||
    type.startsWith('rent_room') ||
    type === 'room_rent' ||
    type === 'house_rent' ||
    note.includes('house rent')
  );
}

export function getExpenseTitle(bill) {
  const type = String(bill?.type || '').toLowerCase();

  const labels = {
    electricity: 'Electricity Bill',
    current_bill: 'Electricity Bill',
    current: 'Electricity Bill',
    electric: 'Electricity Bill',
    internet: 'WiFi Bill',
    wifi: 'WiFi Bill',
    gas: 'Gas Bill',
    water: 'Water Kit',
    water_kit: 'Water Kit',
    dust: 'Dust Bill',
    khala: 'Khala Bill',
    extra_rent: 'Extra House Rent',
    eid_bonus: 'Bonus',
    bonus: 'Bonus',
  };

  if (labels[type]) return labels[type];

  if (isRoomRentBill(bill)) return bill?.note || 'House Rent';

  return (
    bill?.note ||
    String(bill?.type || 'Expense')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
  );
}

function firstPositiveNumber(values) {
  for (const value of values) {
    const number = numberValue(value);
    if (number > 0) return number;
  }

  return 0;
}

export function getExpenseMembersCount(bill, activeMembersCount) {
  if (isRoomRentBill(bill)) {
    return (
      numberValue(bill?.membersInRoom) ||
      numberValue(bill?.roomMembers) ||
      numberValue(bill?.roomMemberCount) ||
      1
    );
  }

  return (
    numberValue(bill?.totalMembers) ||
    numberValue(bill?.utilityMembers) ||
    numberValue(bill?.activeMembers) ||
    activeMembersCount ||
    1
  );
}

export function getExpenseTotalAmount(bill, activeMembersCount) {
  const amount = numberValue(bill?.amount);
  const membersCount = getExpenseMembersCount(bill, activeMembersCount);

  if (isRoomRentBill(bill)) {
    return Math.ceil(
      firstPositiveNumber([
        bill?.totalRoomRent,
        bill?.roomRent,
        bill?.rentTotal,
        bill?.totalRent,
      ]) ||
        amount * membersCount ||
        amount
    );
  }

  return Math.ceil(
    firstPositiveNumber([
      bill?.totalUtilityCost,
      bill?.utilityTotal,
      bill?.totalExpense,
      bill?.expenseTotal,
      bill?.totalAmount,
      bill?.originalAmount,
      bill?.originalTotal,
      bill?.totalCost,
      bill?.cost,
    ]) ||
      amount * membersCount ||
      amount
  );
}

export function buildHouseExpenseBreakdown(bills, activeMembersCount) {
  const rentRows = [];
  const sharedRows = [];

  bills.forEach((bill) => {
    const total = getExpenseTotalAmount(bill, activeMembersCount);

    if (total <= 0) return;

    const memberCount = getExpenseMembersCount(bill, activeMembersCount);

    if (isRoomRentBill(bill)) {
      const savedShare = numberValue(bill?.amount);
      const calculatedShare = Math.ceil(total / memberCount);
      const share = Math.ceil(savedShare || calculatedShare);

      const payment = getPaidDueStatusForShare(bill, share);

      rentRows.push({
        id: bill.id,
        bill,
        title: getExpenseTitle(bill),
        type: 'rent',
        memberCount,
        total,
        share,
        paid: payment.paid,
        due: payment.due,
        status: payment.status,
      });

      return;
    }

    const share = Math.round(total / memberCount);

    sharedRows.push({
      id: bill.id,
      bill,
      title: getExpenseTitle(bill),
      type: 'shared',
      memberCount,
      total,
      share,
    });
  });

  const groups = sharedRows.reduce((acc, row) => {
    const key = row.memberCount || activeMembersCount || 1;

    if (!acc[key]) acc[key] = [];
    acc[key].push(row);

    return acc;
  }, {});

  const adjustedSharedRows = [];

  Object.entries(groups).forEach(([memberCountText, rows]) => {
    const memberCount = Number(memberCountText) || activeMembersCount || 1;

    const totalUtility = rows.reduce((sum, row) => {
      return sum + numberValue(row.total);
    }, 0);

    // Admin logic:
    // Utility Per Member = ceil(total utility / utility members)
    const targetUtilityPerMember = Math.ceil(totalUtility / memberCount);

    const currentShareTotal = rows.reduce((sum, row) => {
      return sum + numberValue(row.share);
    }, 0);

    const difference = targetUtilityPerMember - currentShareTotal;

    const fixedRows = rows.map((row) => ({ ...row }));

    // Make visible row sum exactly same as admin Utility Per Member.
    if (fixedRows.length > 0 && difference !== 0) {
      fixedRows[fixedRows.length - 1].share += difference;
    }

    adjustedSharedRows.push(...fixedRows);
  });

  const finalSharedRows = adjustedSharedRows.map((row) => {
    const payment = getPaidDueStatusForShare(row.bill, row.share);

    return {
      ...row,
      paid: payment.paid,
      due: payment.due,
      status: payment.status,
    };
  });

  const rows = [...rentRows, ...finalSharedRows];

  const rentShare = rentRows.reduce((sum, row) => sum + numberValue(row.share), 0);

  const utilityShare = finalSharedRows.reduce((sum, row) => {
    return sum + numberValue(row.share);
  }, 0);

  const totalPayable = rows.reduce((sum, row) => {
    return sum + numberValue(row.share);
  }, 0);

  const totalPaid = rows.reduce((sum, row) => {
    return sum + numberValue(row.paid);
  }, 0);

  const totalDue = rows.reduce((sum, row) => {
    return sum + numberValue(row.due);
  }, 0);

  return {
    rows,
    rentShare: Math.ceil(rentShare),
    utilityShare: Math.ceil(utilityShare),
    totalPayable: Math.ceil(totalPayable),
    totalPaid: Math.ceil(totalPaid),
    totalDue: Math.ceil(totalDue),
    paidRows: rows.filter((row) => row.status === 'paid').length,
    pendingRows: rows.filter((row) => row.status !== 'paid').length,
    status:
      totalDue === 0 && totalPayable > 0
        ? 'paid'
        : totalPaid > 0
          ? 'partial'
          : 'pending',
  };
}

export function getExpenseSearchText(row) {
  return [
    row?.title,
    row?.bill?.type,
    row?.bill?.note,
    row?.bill?.category,
    row?.status,
    row?.total,
    row?.share,
    row?.paid,
    row?.due,
  ]
    .join(' ')
    .toLowerCase();
}

export function getStatusStyle(status) {
  if (status === 'paid') {
    return {
      label: 'Paid',
      className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      row: 'border-l-emerald-500 bg-emerald-50/20',
    };
  }

  if (status === 'partial') {
    return {
      label: 'Partial',
      className: 'bg-blue-100 text-blue-700 border-blue-200',
      row: 'border-l-blue-500 bg-blue-50/20',
    };
  }

  if (status === 'advance') {
    return {
      label: 'Advance',
      className: 'bg-purple-100 text-purple-700 border-purple-200',
      row: 'border-l-purple-500 bg-purple-50/20',
    };
  }

  return {
    label: 'Pending',
    className: 'bg-red-100 text-red-700 border-red-200',
    row: 'border-l-red-500 bg-red-50/20',
  };
}

export function getNotificationDate(notification) {
  return (
    safeDate(notification?.sentAt) ||
    safeDate(notification?.createdAt) ||
    safeDate(notification?.timestamp) ||
    safeDate(notification?.updatedAt)
  );
}

export function formatDhakaTime(value) {
  const date = safeDate(value);

  if (!date) return 'Time not available';

  return new Intl.DateTimeFormat('en-BD', {
    timeZone: 'Asia/Dhaka',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function formatShortTime(value) {
  const date = safeDate(value);

  if (!date) return 'Time not available';

  const diff = Date.now() - date.getTime();

  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;

  return new Intl.DateTimeFormat('en-BD', {
    timeZone: 'Asia/Dhaka',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function isBillNotification(notification) {
  const type = String(notification?.type || '').toLowerCase();

  const text = `${notification?.title || ''} ${notification?.body || ''} ${
    notification?.message || ''
  }`.toLowerCase();

  return (
    type === 'bill' ||
    type === 'payment' ||
    type === 'house_rent' ||
    type === 'rent' ||
    text.includes('house rent') ||
    text.includes('rent') ||
    text.includes('bill')
  );
}

export function getNotificationBody(notification) {
  return notification?.message || notification?.body || '';
}

export function getNotificationStatus(notification) {
  const data = notification?.data || {};
  const rawStatus = String(data.status || notification.status || '').toLowerCase();

  const text = `${notification?.title || ''} ${notification?.body || ''} ${
    notification?.message || ''
  }`.toLowerCase();

  const totalPayable = numberValue(data.totalPayable || data.total || data.amount);
  const paidAmount = numberValue(data.paidAmount || data.paid);
  const balance = numberValue(data.balance || data.dueAmount || data.due);

  if (balance < 0 || rawStatus === 'advance' || text.includes('advance')) return 'advance';

  if (
    isPaidStatus(rawStatus) ||
    text.includes('fully paid') ||
    text.includes('successfully paid') ||
    (totalPayable > 0 && balance === 0)
  ) {
    return 'paid';
  }

  if (
    isPartialStatus(rawStatus) ||
    text.includes('partially paid') ||
    (paidAmount > 0 && balance > 0)
  ) {
    return 'partial';
  }

  if (rawStatus === 'due' || text.includes('due')) return 'due';

  return 'unpaid';
}

export function getNotificationDesign(status) {
  const designs = {
    paid: {
      label: 'Paid Status',
      short: 'Paid',
      emoji: '✅',
      bubble: 'bg-emerald-50 border-emerald-200',
      badge: 'bg-emerald-600 text-white',
      text: 'text-emerald-800',
    },
    partial: {
      label: 'Partially Paid Status',
      short: 'Partial',
      emoji: '⚠️',
      bubble: 'bg-blue-50 border-blue-200',
      badge: 'bg-blue-600 text-white',
      text: 'text-blue-800',
    },
    unpaid: {
      label: 'Unpaid Status',
      short: 'Unpaid',
      emoji: '❌',
      bubble: 'bg-red-50 border-red-200',
      badge: 'bg-red-600 text-white',
      text: 'text-red-800',
    },
    due: {
      label: 'Due Status',
      short: 'Due',
      emoji: '⏰',
      bubble: 'bg-amber-50 border-amber-200',
      badge: 'bg-amber-600 text-white',
      text: 'text-amber-800',
    },
    advance: {
      label: 'Advance Status',
      short: 'Advance',
      emoji: '📈',
      bubble: 'bg-purple-50 border-purple-200',
      badge: 'bg-purple-600 text-white',
      text: 'text-purple-800',
    },
  };

  return designs[status] || designs.unpaid;
}

export function buildBillNotification(notification) {
  const data = notification?.data || {};
  const status = getNotificationStatus(notification);
  const design = getNotificationDesign(status);

  const username = data.name || data.displayName || data.username || 'Member';
  const month = data.monthId || data.month || notification.month || '';

  const monthText = /^\d{4}-\d{2}$/.test(String(month))
    ? getMonthNameFromId(month)
    : month || 'this month';

  const totalPayable = numberValue(data.totalPayable || data.total || data.amount);
  const paidAmount = numberValue(data.paidAmount || data.paid);
  const balance = numberValue(data.balance || data.dueAmount || data.due);

  let message = getNotificationBody(notification);

  if (status === 'paid') {
    message = `Dear ${username}, your house rent for ${monthText} has been successfully paid. Total payable was ${money(totalPayable)}, paid amount is ${money(paidAmount)}, and your current balance is ৳0. Thank you for completing your payment.`;
  } else if (status === 'partial') {
    message = `Dear ${username}, your house rent for ${monthText} has been partially paid. Total payable is ${money(totalPayable)}, paid amount is ${money(paidAmount)}, and remaining balance is ${money(balance)}. Please clear the due amount on time.`;
  } else if (status === 'unpaid') {
    message = `Dear ${username}, your house rent for ${monthText} has not been paid yet. This month you need to pay ${money(totalPayable || balance)}. Paid amount is ৳0, and your current balance is ${money(balance || totalPayable)}. Please complete your payment as soon as possible.`;
  } else if (status === 'due') {
    message = `Dear ${username}, your house rent payment for ${monthText} is due. You need to pay ${money(balance || totalPayable)} for this month. Please pay the due amount to keep your rent record updated.`;
  } else if (status === 'advance') {
    message = `Dear ${username}, your house rent for ${monthText} has been paid in advance. Your advance balance is +${money(balance)}. Thank you for keeping your rent record updated.`;
  }

  return {
    status,
    design,
    message,
    monthText,
    totalPayable,
    paidAmount,
    balance,
  };
}
