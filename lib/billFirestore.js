import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { sendAdminChatUpdate } from '@/lib/adminChatMessage';
import { isMemberAccountActive } from '@/lib/memberPolicy';

import {
  buildUtilityBreakdown,
  calculateMonthlySetup,
  getStatus,
  parsePaymentInput,
  previousMonthId,
  toNumber,
} from '@/lib/billCalculations';

function isActiveMember(user) {
  return isMemberAccountActive(user) && Boolean(user?.room);
}

function getMemberId(member) {
  return member?.uid || member?.id;
}

function isPreviousBalanceBill(bill) {
  return bill?.category === 'previous_balance' || bill?.type === 'previous_balance';
}

function isAdvancePaymentBill(bill) {
  return bill?.category === 'advance_payment' || bill?.type === 'advance_payment';
}

function rentTypeFromRoom(room) {
  return `rent_${String(room || '')
    .toLowerCase()
    .replace(/\s+/g, '')}`;
}

function groupByUserId(bills) {
  return bills.reduce((map, bill) => {
    if (!bill.userId) return map;

    if (!map[bill.userId]) {
      map[bill.userId] = [];
    }

    map[bill.userId].push(bill);
    return map;
  }, {});
}

function buildUsersById(users) {
  const map = {};

  users.forEach((user) => {
    if (user.id) map[user.id] = user;
    if (user.uid) map[user.uid] = user;
  });

  return map;
}

function getUniqueUtilityTotal(bills) {
  const utilityMap = {};

  bills
    .filter((bill) => bill.category === 'utility')
    .forEach((bill) => {
      if (!utilityMap[bill.type]) {
        const totalFromDb = toNumber(bill.totalUtilityCost);
        const fallbackTotal = toNumber(bill.amount) * toNumber(bill.totalMembers || 1);

        utilityMap[bill.type] = totalFromDb || fallbackTotal;
      }
    });

  return Object.values(utilityMap).reduce((sum, amount) => sum + amount, 0);
}

function getUtilityShare(bills, users) {
  const utilityBills = bills.filter((bill) => bill.category === 'utility');

  if (utilityBills.length === 0) return 0;

  const totalUtilityCost = getUniqueUtilityTotal(bills);

  const memberCountFromDb = toNumber(
    utilityBills.find((bill) => bill.totalMembers)?.totalMembers
  );

  const activeRoomMemberCount = users.filter(isActiveMember).length;

  const uniqueUtilityUsers = new Set(
    utilityBills.map((bill) => bill.userId).filter(Boolean)
  ).size;

  const memberCount = memberCountFromDb || activeRoomMemberCount || uniqueUtilityUsers || 1;

  return Math.ceil(totalUtilityCost / memberCount);
}

function getPaymentHistory(bills) {
  const histories = bills
    .map((bill) => (Array.isArray(bill.installmentHistory) ? bill.installmentHistory : []))
    .filter((history) => history.length > 0);

  if (histories.length > 0) {
    const longestHistory = histories.sort((a, b) => b.length - a.length)[0];

    return longestHistory
      .map((item) => {
        const amount = toNumber(item.amount || item.raw);

        if (!amount) return null;

        return {
          amount,
          raw: String(amount),
          createdAt: item.date || item.createdAt || new Date().toISOString(),
        };
      })
      .filter(Boolean);
  }

  const paidAmount = bills.reduce((sum, bill) => sum + toNumber(bill.paidAmount), 0);

  if (paidAmount > 0) {
    return [
      {
        amount: paidAmount,
        raw: String(paidAmount),
        createdAt: new Date().toISOString(),
      },
    ];
  }

  return [];
}

function getPreviousBalance({ previousBillsForUser, allPreviousBills, users }) {
  if (!previousBillsForUser.length) return 0;

  const previousRent = previousBillsForUser
    .filter((bill) => bill.category === 'rent')
    .reduce((sum, bill) => sum + toNumber(bill.amount), 0);

  const hasUtility = previousBillsForUser.some((bill) => bill.category === 'utility');

  const previousUtility = hasUtility ? getUtilityShare(allPreviousBills, users) : 0;

  const previousBalanceAdjustment = previousBillsForUser
    .filter(isPreviousBalanceBill)
    .reduce((sum, bill) => sum + toNumber(bill.amount), 0);

  const previousPaid = previousBillsForUser.reduce(
    (sum, bill) => sum + toNumber(bill.paidAmount),
    0
  );

  return Math.ceil(previousRent + previousUtility + previousBalanceAdjustment - previousPaid);
}

function getManualPreviousBalanceFromCurrentMonth(memberBills) {
  const previousBalanceBills = memberBills.filter(isPreviousBalanceBill);

  if (previousBalanceBills.length === 0) return null;

  return previousBalanceBills.reduce((sum, bill) => sum + toNumber(bill.amount), 0);
}

function buildLegacyMemberRows({ monthId, currentBills, previousBills, users }) {
  const usersById = buildUsersById(users);

  const currentByUser = groupByUserId(currentBills);
  const previousByUser = groupByUserId(previousBills);

  const utilityShare = getUtilityShare(currentBills, users);
  const userIds = Object.keys(currentByUser);

  return userIds.map((userId) => {
    const user = usersById[userId] || {};
    const memberBills = currentByUser[userId] || [];

    const rentBills = memberBills.filter((bill) => bill.category === 'rent');
    const utilityBills = memberBills.filter((bill) => bill.category === 'utility');
    const previousBalanceBills = memberBills.filter(isPreviousBalanceBill);
    const advancePaymentBills = memberBills.filter(isAdvancePaymentBill);

    const roomRent = rentBills.reduce((sum, bill) => sum + toNumber(bill.amount), 0);

    const utility = utilityBills.length > 0 ? utilityShare : 0;

    const autoPreviousBalance = getPreviousBalance({
      previousBillsForUser: previousByUser[userId] || [],
      allPreviousBills: previousBills,
      users,
    });

    const manualPreviousBalance = getManualPreviousBalanceFromCurrentMonth(memberBills);

    const previousBalance =
      manualPreviousBalance !== null ? manualPreviousBalance : autoPreviousBalance;

    const currentMonthCharge = Math.ceil(roomRent + utility);

    const netPayableBeforePayment = Math.ceil(currentMonthCharge + previousBalance);

    const totalPayable = Math.max(0, netPayableBeforePayment);

    const paidAmount = memberBills.reduce(
      (sum, bill) => sum + toNumber(bill.paidAmount),
      0
    );

    const balance = Math.ceil(netPayableBeforePayment - paidAmount);

    return {
      userId,
      month: monthId,
      name: user.displayName || user.name || memberBills[0]?.name || 'Member',
      room: user.room || memberBills[0]?.room || '',
      roomRent,
      utility,
      previousBalance,
      currentMonthCharge,
      totalPayable,
      paidAmount,
      balance,
      status: getStatus(balance, netPayableBeforePayment, paidAmount),
      payments: getPaymentHistory(memberBills),

      rentBills,
      utilityBills,
      previousBalanceBills,
      advancePaymentBills,
      rawBills: memberBills,
    };
  });
}

export function listenUsers(callback) {
  return onSnapshot(collection(db, 'users'), (snapshot) => {
    callback(
      snapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      }))
    );
  });
}

export function listenMonthSetup(monthId, callback) {
  const billsQuery = query(collection(db, 'bills'), where('month', '==', monthId));

  return onSnapshot(billsQuery, (snapshot) => {
    const bills = snapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    }));

    const rentByRoom = {};
    const utilityMap = {};

    bills.forEach((bill) => {
      if (bill.category === 'rent') {
        if (!rentByRoom[bill.room]) {
          rentByRoom[bill.room] =
            toNumber(bill.totalRoomRent) ||
            toNumber(bill.amount) * toNumber(bill.membersInRoom || 1);
        }
      }

      if (bill.category === 'utility') {
        if (!utilityMap[bill.type]) {
          utilityMap[bill.type] = {
            type: bill.type,
            label: bill.note || bill.type,
            totalCost:
              toNumber(bill.totalUtilityCost) ||
              toNumber(bill.amount) * toNumber(bill.totalMembers || 1),
          };
        }
      }
    });

    callback({
      id: monthId,
      month: monthId,
      rentByRoom,
      utilityBreakdown: Object.values(utilityMap),
    });
  });
}

export function listenMonthlyMembers(monthId, callback) {
  const previousId = previousMonthId(monthId);

  let currentBills = [];
  let previousBills = [];
  let users = [];

  let currentReady = false;
  let previousReady = false;
  let usersReady = false;

  function emit() {
    if (!currentReady || !previousReady || !usersReady) return;

    const rows = buildLegacyMemberRows({
      monthId,
      currentBills,
      previousBills,
      users,
    });

    callback(rows);
  }

  const usersUnsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
    users = snapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    }));

    usersReady = true;
    emit();
  });

  const currentUnsubscribe = onSnapshot(
    query(collection(db, 'bills'), where('month', '==', monthId)),
    (snapshot) => {
      currentBills = snapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      }));

      currentReady = true;
      emit();
    }
  );

  const previousUnsubscribe = onSnapshot(
    query(collection(db, 'bills'), where('month', '==', previousId)),
    (snapshot) => {
      previousBills = snapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      }));

      previousReady = true;
      emit();
    }
  );

  return () => {
    usersUnsubscribe();
    currentUnsubscribe();
    previousUnsubscribe();
  };
}

export async function saveMonthlySetup({
  monthId,
  members,
  rentByRoom,
  utilityInputs,
}) {
  const setup = calculateMonthlySetup({
    members,
    rentByRoom,
    utilityInputs,
    monthId,
  });

  const activeMembers = setup.activeMembers.filter(isActiveMember);
  const utilityBreakdown = buildUtilityBreakdown(utilityInputs);

  const existingSnapshot = await getDocs(
    query(collection(db, 'bills'), where('month', '==', monthId))
  );

  const existingBills = existingSnapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  }));

  const existingMap = new Map();

  existingBills.forEach((bill) => {
    existingMap.set(`${bill.userId}:${bill.category}:${bill.type}`, bill);
  });

  const desiredKeys = new Set();
  const batch = writeBatch(db);

  Object.entries(rentByRoom || {}).forEach(([room, totalRoomRent]) => {
    const rentAmount = toNumber(totalRoomRent);

    if (rentAmount <= 0) return;

    const membersInRoom = activeMembers.filter((member) => member.room === room);
    const perMemberRent = Math.ceil(rentAmount / (membersInRoom.length || 1));
    const type = rentTypeFromRoom(room);

    membersInRoom.forEach((member) => {
      const userId = getMemberId(member);

      if (!userId) return;

      const key = `${userId}:rent:${type}`;
      desiredKeys.add(key);

      const existing = existingMap.get(key);

      const ref = existing
        ? doc(db, 'bills', existing.id)
        : doc(collection(db, 'bills'));

      const paidAmount = toNumber(existing?.paidAmount);
      const dueAmount = Math.max(0, perMemberRent - paidAmount);

      batch.set(
        ref,
        {
          userId,
          month: monthId,
          type,
          note: `House Rent - ${room}`,
          category: 'rent',
          amount: perMemberRent,
          paidAmount,
          dueAmount,
          status:
            paidAmount >= perMemberRent
              ? 'paid'
              : paidAmount > 0
                ? 'partial'
                : 'pending',
          room,
          totalRoomRent: rentAmount,
          membersInRoom: membersInRoom.length,
          installmentHistory: existing?.installmentHistory || [],
          createdAt: existing?.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
  });

  activeMembers.forEach((member) => {
    const userId = getMemberId(member);

    if (!userId) return;

    utilityBreakdown.forEach((item) => {
      if (item.totalCost <= 0) return;

      const perItemShare = Math.ceil(item.totalCost / (activeMembers.length || 1));

      const key = `${userId}:utility:${item.type}`;
      desiredKeys.add(key);

      const existing = existingMap.get(key);

      const ref = existing
        ? doc(db, 'bills', existing.id)
        : doc(collection(db, 'bills'));

      const paidAmount = toNumber(existing?.paidAmount);
      const dueAmount = Math.max(0, perItemShare - paidAmount);

      batch.set(
        ref,
        {
          userId,
          month: monthId,
          type: item.type,
          note: item.label,
          category: 'utility',
          amount: perItemShare,
          paidAmount,
          dueAmount,
          status:
            paidAmount >= perItemShare
              ? 'paid'
              : paidAmount > 0
                ? 'partial'
                : 'pending',
          room: member.room || '',
          totalUtilityCost: item.totalCost,
          totalMembers: activeMembers.length,
          installmentHistory: existing?.installmentHistory || [],
          createdAt: existing?.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
  });

  existingBills.forEach((bill) => {
    if (isPreviousBalanceBill(bill) || isAdvancePaymentBill(bill)) {
      return;
    }

    const key = `${bill.userId}:${bill.category}:${bill.type}`;

    if (!desiredKeys.has(key)) {
      batch.delete(doc(db, 'bills', bill.id));
    }
  });

  await batch.commit();
}

export async function saveMemberPreviousBalance({
  monthId,
  memberRow,
  previousBalance,
}) {
  const amount = Math.ceil(toNumber(previousBalance));

  const existingBills = Array.isArray(memberRow.rawBills) ? memberRow.rawBills : [];
  const existingPreviousBill = existingBills.find(isPreviousBalanceBill);

  const batch = writeBatch(db);

  if (amount === 0) {
    if (existingPreviousBill?.id) {
      batch.delete(doc(db, 'bills', existingPreviousBill.id));
    }

    await batch.commit();
    await sendPaymentNotificationSafe({
      monthId,
      memberRow: {
        ...memberRow,
        previousBalance: 0,
        balance: Math.ceil(
          toNumber(memberRow.currentMonthCharge) -
            toNumber(memberRow.paidAmount)
        ),
      },
    });
    return;
  }

  const ref = existingPreviousBill?.id
    ? doc(db, 'bills', existingPreviousBill.id)
    : doc(collection(db, 'bills'));

  const oldPaid = toNumber(existingPreviousBill?.paidAmount);
  const paidAmount = amount > 0 ? Math.min(oldPaid, amount) : 0;
  const dueAmount = amount > 0 ? Math.max(0, amount - paidAmount) : 0;

  batch.set(
    ref,
    {
      userId: memberRow.userId,
      month: monthId,
      type: 'previous_balance',
      note: amount > 0 ? 'Previous Due' : 'Previous Advance',
      category: 'previous_balance',
      amount,
      paidAmount,
      dueAmount,
      status:
        amount < 0
          ? 'advance'
          : paidAmount >= amount
            ? 'paid'
            : paidAmount > 0
              ? 'partial'
              : 'pending',
      room: memberRow.room || '',
      installmentHistory: existingPreviousBill?.installmentHistory || [],
      createdAt: existingPreviousBill?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await batch.commit();
  await sendPaymentNotificationSafe({
    monthId,
    memberRow: {
      ...memberRow,
      previousBalance: amount,
      balance: Math.ceil(
        toNumber(memberRow.currentMonthCharge) +
          amount -
          toNumber(memberRow.paidAmount)
      ),
    },
  });
}

export async function saveMemberPayment({ monthId, memberRow, rawPayment }) {
  const parsed = parsePaymentInput(rawPayment);

  if (!parsed.valid) {
    throw new Error(parsed.error);
  }

  const payments = parsed.installments.map((amount) => ({
    amount,
    raw: String(amount),
    date: new Date().toISOString(),
  }));

  const batch = writeBatch(db);

  let remaining = parsed.total;

  const rentBills = Array.isArray(memberRow.rentBills) ? memberRow.rentBills : [];
  const utilityBills = Array.isArray(memberRow.utilityBills) ? memberRow.utilityBills : [];

  let previousBalanceBills = Array.isArray(memberRow.previousBalanceBills)
    ? [...memberRow.previousBalanceBills]
    : [];

  const advancePaymentBills = Array.isArray(memberRow.advancePaymentBills)
    ? memberRow.advancePaymentBills
    : [];

  if (previousBalanceBills.length === 0 && toNumber(memberRow.previousBalance) !== 0) {
    const previousBalanceRef = doc(collection(db, 'bills'));

    const previousBalanceBill = {
      id: previousBalanceRef.id,
      ref: previousBalanceRef,
      userId: memberRow.userId,
      month: monthId,
      type: 'previous_balance',
      note: memberRow.previousBalance > 0 ? 'Previous Due' : 'Previous Advance',
      category: 'previous_balance',
      amount: toNumber(memberRow.previousBalance),
      paidAmount: 0,
      dueAmount: memberRow.previousBalance > 0 ? toNumber(memberRow.previousBalance) : 0,
      status: memberRow.previousBalance < 0 ? 'advance' : 'pending',
      room: memberRow.room || '',
    };

    batch.set(previousBalanceRef, {
      ...previousBalanceBill,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    previousBalanceBills = [previousBalanceBill];
  }

  const payableBills = [...previousBalanceBills, ...rentBills, ...utilityBills];

  payableBills.forEach((bill) => {
    const ref = bill.ref || doc(db, 'bills', bill.id);
    const billAmount = Math.max(0, toNumber(bill.amount));
    const pay = Math.min(remaining, billAmount);

    remaining -= pay;

    batch.set(
      ref,
      {
        paidAmount: pay,
        dueAmount: Math.max(0, billAmount - pay),
        status:
          toNumber(bill.amount) < 0
            ? 'advance'
            : pay >= billAmount
              ? 'paid'
              : pay > 0
                ? 'partial'
                : 'pending',
        installmentHistory: payments,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });

  const existingAdvanceBill = advancePaymentBills[0];

  if (remaining > 0) {
    const advanceRef = existingAdvanceBill?.id
      ? doc(db, 'bills', existingAdvanceBill.id)
      : doc(collection(db, 'bills'));

    batch.set(
      advanceRef,
      {
        userId: memberRow.userId,
        month: monthId,
        type: 'advance_payment',
        note: 'Advance Payment',
        category: 'advance_payment',
        amount: 0,
        paidAmount: remaining,
        dueAmount: 0,
        status: 'advance',
        room: memberRow.room || '',
        installmentHistory: payments,
        createdAt: existingAdvanceBill?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } else if (existingAdvanceBill?.id) {
    batch.delete(doc(db, 'bills', existingAdvanceBill.id));
  }

  await batch.commit();

  await sendPaymentNotificationSafe({
    monthId,
    memberRow: {
      ...memberRow,
      paidAmount: parsed.total,
      payments,
      balance: Math.ceil(
        toNumber(memberRow.currentMonthCharge) +
          toNumber(memberRow.previousBalance) -
          parsed.total
      ),
    },
  });
}

export async function sendManualBillNotification({ monthId, memberRow }) {
  return sendBillNotificationCore({
    monthId,
    memberRow,
    mode: 'manual',
  });
}

export async function sendAllBillNotifications({ monthId, rows = [] }) {
  const validRows = rows.filter((row) => row?.userId);

  const results = await Promise.allSettled(
    validRows.map((row) =>
      sendBillNotificationCore({
        monthId,
        memberRow: row,
        mode: 'manual_all',
      })
    )
  );

  const sent = results.filter((item) => item.status === 'fulfilled').length;
  const failed = results.filter((item) => item.status === 'rejected').length;

  return {
    total: validRows.length,
    sent,
    failed,
  };
}

async function sendPaymentNotificationSafe({ monthId, memberRow }) {
  try {
    await sendBillNotificationCore({
      monthId,
      memberRow,
      mode: 'auto_payment',
    });
  } catch (error) {
    console.error('Payment notification failed:', error);
  }
}

function getBillStatusText(memberRow) {
  const balance = Math.ceil(toNumber(memberRow.balance));

  if (balance < 0) {
    return {
      label: 'ADVANCE PAID',
      emoji: '📈',
      line: `Advance balance: +৳${Math.abs(balance).toLocaleString()}`,
    };
  }

  if (balance === 0 && toNumber(memberRow.totalPayable) > 0) {
    return {
      label: 'FULLY PAID',
      emoji: '✅',
      line: 'No due amount',
    };
  }

  if (toNumber(memberRow.paidAmount) > 0) {
    return {
      label: 'PARTIALLY PAID',
      emoji: '⚠️',
      line: `Due amount: ৳${Math.max(0, balance).toLocaleString()}`,
    };
  }

  return {
    label: 'NOT PAID',
    emoji: '❌',
    line: `Total due: ৳${Math.max(0, balance).toLocaleString()}`,
  };
}

function formatPreviousBalance(value) {
  const amount = Math.ceil(toNumber(value));

  if (amount < 0) {
    return `+৳${Math.abs(amount).toLocaleString()} advance`;
  }

  return `৳${amount.toLocaleString()}`;
}

async function sendBillNotificationCore({ monthId, memberRow, mode = 'manual' }) {
  if (!memberRow?.userId) {
    throw new Error('Invalid member information.');
  }

  const balance = Math.ceil(toNumber(memberRow.balance));
  const status = getBillStatusText(memberRow);

  const title = 'NestHub - Bill Update';

  const body = [
    `${status.emoji} House Rent: ${status.label}`,
    '',
    `Dear ${memberRow.name || 'Member'},`,
    '',
    `${monthId} Bill Details:`,
    `Status: ${status.label}`,
    status.line,
    '',
    '📋 Breakdown:',
    `Room Rent: ৳${toNumber(memberRow.roomRent).toLocaleString()}`,
    `Utility: ৳${toNumber(memberRow.utility).toLocaleString()}`,
    `Previous Due/Advance: ${formatPreviousBalance(memberRow.previousBalance)}`,
    `Total Payable: ৳${toNumber(memberRow.totalPayable).toLocaleString()}`,
    `Paid: ৳${toNumber(memberRow.paidAmount).toLocaleString()}`,
    balance < 0
      ? `Advance: +৳${Math.abs(balance).toLocaleString()}`
      : balance > 0
        ? `Due: ৳${balance.toLocaleString()}`
        : 'Settled: ৳0',
    '',
    '- NestHub Team',
  ].join('\n');

  await addDoc(collection(db, 'notifications'), {
    userId: memberRow.userId,
    title: 'House Rent Bill Update',
    message: `${monthId} bill status: ${status.label}. ${status.line}`,
    type: 'bill',
    read: false,
    url: '/dashboard',
    mode,
    data: {
      monthId,
      userId: memberRow.userId,
      name: memberRow.name || 'Member',
      room: memberRow.room || '',
      roomRent: toNumber(memberRow.roomRent),
      utility: toNumber(memberRow.utility),
      previousBalance: toNumber(memberRow.previousBalance),
      totalPayable: toNumber(memberRow.totalPayable),
      paidAmount: toNumber(memberRow.paidAmount),
      balance,
      status: status.label,
    },
    createdAt: serverTimestamp(),
  });

  await sendAdminChatUpdate({
    member: {
      id: memberRow.userId,
      name: memberRow.name || 'Member',
      room: memberRow.room || '',
    },
    category: 'bill',
    title,
    summary: `Your monthly bill status is ${status.label}.`,
    fields: [
      { label: 'Room rent', value: `Tk ${toNumber(memberRow.roomRent).toLocaleString('en-US')}` },
      { label: 'Utility', value: `Tk ${toNumber(memberRow.utility).toLocaleString('en-US')}` },
      { label: 'Previous due/advance', value: formatPreviousBalance(memberRow.previousBalance) },
      { label: 'Total payable', value: `Tk ${toNumber(memberRow.totalPayable).toLocaleString('en-US')}` },
      { label: 'Paid', value: `Tk ${toNumber(memberRow.paidAmount).toLocaleString('en-US')}` },
      { label: 'Balance', value: `Tk ${balance.toLocaleString('en-US')}` },
    ],
    details: {
      monthId,
      mode,
      status: status.label,
      balance,
      notificationText: body,
    },
    notify: true,
  }).catch((error) => console.error('Bill chat update failed:', error));

  return {
    success: true,
    userId: memberRow.userId,
    name: memberRow.name || 'Member',
  };
}
