'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { db, setupPushNotifications, getFCMToken } from '@/lib/firebase';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  Bell,
  BellRing,
  CheckCheck,
  Clock,
  Home,
  Loader2,
  ReceiptText,
  Search,
  Smartphone,
  TrendingUp,
  Users,
  WalletCards,
  X,
} from 'lucide-react';

import {
  YEARS,
  MONTHS,
  safeDate,
  getMonthId,
  getMonthName,
  getUserPhoto,
  getUserName,
  getInitial,
  getMemberId,
  getDeviceInfo,
  isLive,
  normalizeBill,
  isRoomRentBill,
  getExpenseSearchText,
  getStatusStyle,
  getNotificationDate,
  formatDhakaTime,
  formatShortTime,
  isBillNotification,
  buildBillNotification,
} from './billMath';
import { isMemberAccountActive } from '@/lib/memberPolicy';

async function saveNotificationSettings(userId, enabled, token = '') {
  const device = getDeviceInfo();

  await setDoc(
    doc(db, 'notificationSettings', userId),
    {
      enabled,
      permission: device.permission,
      token,
      isStandalone: device.isStandalone,
      supportsPush: device.supportsPush,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

function safeDocId(value) {
  return String(value || '')
    .trim()
    .replace(/[^\w.-]/g, '_');
}

function num(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function taka(value) {
  return Math.round(num(value));
}

function money(value) {
  return `৳${Math.round(Math.abs(num(value))).toLocaleString()}`;
}

function isPaid(value) {
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
  ].includes(String(value || '').toLowerCase().trim());
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/bill/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getPreviousMonthId(monthId) {
  if (!/^\d{4}-\d{2}$/.test(String(monthId))) return '';

  const [year, month] = monthId.split('-').map(Number);

  if (month === 1) {
    return `${year - 1}-12`;
  }

  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

function isPreviousDueBill(bill) {
  const type = normalizeText(bill?.type);
  const category = normalizeText(bill?.category);
  const note = normalizeText(bill?.note || bill?.title || bill?.name);

  const text = `${type} ${category} ${note}`;

  return (
    text.includes('previous due') ||
    text.includes('previous balance') ||
    text.includes('balance forward') ||
    text.includes('carry forward') ||
    text.includes('old due') ||
    text.includes('old balance') ||
    text.includes('arrears') ||
    type === 'previous due' ||
    type === 'prev due' ||
    type === 'balance forward'
  );
}

function isMonthlySummaryRecord(bill) {
  if (!bill) return false;

  const type = normalizeText(bill?.type);
  const category = normalizeText(bill?.category);
  const note = normalizeText(bill?.note || bill?.title || bill?.name);

  const text = `${type} ${category} ${note}`;

  return (
    bill?.totalPayable !== undefined ||
    bill?.payableAmount !== undefined ||
    bill?.monthlyPayable !== undefined ||
    bill?.finalPayable !== undefined ||
    bill?.totalBill !== undefined ||
    bill?.grandTotal !== undefined ||
    bill?.totalPaid !== undefined ||
    bill?.totalDue !== undefined ||
    bill?.balance !== undefined ||
    bill?.remainingBalance !== undefined ||
    text.includes('monthly payment') ||
    text.includes('payment summary') ||
    text.includes('month summary') ||
    text.includes('bill summary') ||
    text.includes('house rent payment')
  );
}

function databaseBillPaid(bill, amount = 0) {
  const billAmount =
    taka(amount) ||
    taka(bill?.amount) ||
    taka(bill?.displayAmount) ||
    taka(bill?.totalPayable) ||
    taka(bill?.totalAmount) ||
    taka(bill?.payableAmount);

  const paidAmount =
    taka(bill?.paidAmount) ||
    taka(bill?.totalPaid) ||
    taka(bill?.paymentAmount) ||
    taka(bill?.receivedAmount) ||
    taka(bill?.amountPaid);

  const dueAmount =
    bill?.dueAmount !== undefined &&
    bill?.dueAmount !== null &&
    bill?.dueAmount !== ''
      ? taka(bill?.dueAmount)
      : null;

  if (isPaid(bill?.status)) return true;
  if (isPaid(bill?.paymentStatus)) return true;
  if (isPaid(bill?.paidStatus)) return true;
  if (isPaid(bill?.billStatus)) return true;

  if (bill?.isPaid === true) return true;
  if (bill?.paid === true) return true;
  if (bill?.paymentCompleted === true) return true;
  if (bill?.completed === true) return true;

  if (dueAmount !== null && dueAmount <= 0 && billAmount > 0) return true;
  if (billAmount > 0 && paidAmount >= billAmount) return true;

  return false;
}

function getBillPayableAmount(bill) {
  return taka(
    bill?.amount ||
      bill?.displayAmount ||
      bill?.totalPayable ||
      bill?.payableAmount ||
      bill?.monthlyPayable ||
      bill?.totalAmount ||
      bill?.shareAmount
  );
}

function getBillPaidAmount(bill) {
  const amount = getBillPayableAmount(bill);

  const paidAmount = taka(
    bill?.paidAmount ||
      bill?.totalPaid ||
      bill?.paymentAmount ||
      bill?.receivedAmount ||
      bill?.amountPaid
  );

  if (paidAmount > 0) return paidAmount;
  if (databaseBillPaid(bill, amount)) return amount;

  return 0;
}

function getSummaryTotal(bill) {
  return taka(
    bill?.totalPayable ||
      bill?.payableAmount ||
      bill?.monthlyPayable ||
      bill?.finalPayable ||
      bill?.totalBill ||
      bill?.grandTotal ||
      bill?.amount
  );
}

function getSummaryPaid(bill) {
  return taka(
    bill?.paidAmount ||
      bill?.totalPaid ||
      bill?.paymentAmount ||
      bill?.receivedAmount ||
      bill?.amountPaid ||
      bill?.paid
  );
}

function getSummaryDue(bill) {
  return taka(
    bill?.dueAmount ||
      bill?.totalDue ||
      bill?.balance ||
      bill?.remainingBalance ||
      bill?.remainingDue ||
      bill?.currentBalance
  );
}

function getSummaryPaidState(bills = [], totalPayable = 0) {
  const summaries = bills
    .filter(isMonthlySummaryRecord)
    .map((bill) => {
      const total = getSummaryTotal(bill) || taka(totalPayable);

      let paid = getSummaryPaid(bill);
      let due = getSummaryDue(bill);

      if (databaseBillPaid(bill, total)) {
        paid = total;
        due = 0;
      }

      if (paid <= 0 && total > 0 && due > 0) {
        paid = Math.max(0, total - due);
      }

      if (due <= 0 && total > 0 && paid > 0 && paid < total) {
        due = Math.max(0, total - paid);
      }

      return {
        total,
        paid,
        due,
      };
    })
    .filter((item) => item.total > 0 && (item.paid > 0 || item.due > 0));

  if (summaries.length === 0) return null;

  summaries.sort((a, b) => {
    const aDiff = Math.abs(a.total - totalPayable);
    const bDiff = Math.abs(b.total - totalPayable);

    if (aDiff !== bDiff) return aDiff - bDiff;

    return b.paid - a.paid;
  });

  return summaries[0];
}

function getTotalPaidFromBills(bills = [], totalPayable = 0) {
  const summary = getSummaryPaidState(bills, totalPayable);

  if (summary) {
    return Math.min(taka(totalPayable), Math.max(0, taka(summary.paid)));
  }

  const rowPaid = bills.reduce((sum, bill) => {
    if (isMonthlySummaryRecord(bill)) return sum;
    return sum + getBillPaidAmount(bill);
  }, 0);

  return Math.min(taka(totalPayable), Math.max(0, taka(rowPaid)));
}

function getRentTotal(bill) {
  const amount = taka(bill?.amount);

  const roomMembers =
    taka(bill?.membersInRoom) ||
    taka(bill?.roomMembers) ||
    taka(bill?.roomMemberCount) ||
    1;

  return taka(
    bill?.totalRoomRent ||
      bill?.roomRent ||
      bill?.rentTotal ||
      bill?.totalRent ||
      amount * roomMembers ||
      amount
  );
}

function makeRentRows(bills = []) {
  return bills
    .filter((bill) => {
      return isRoomRentBill(bill) && !isPreviousDueBill(bill);
    })
    .map((bill) => {
      const roomMembers =
        taka(bill?.membersInRoom) ||
        taka(bill?.roomMembers) ||
        taka(bill?.roomMemberCount) ||
        1;

      const total = getRentTotal(bill);
      const share = taka(bill?.amount) || taka(total / roomMembers);

      return {
        id: bill.id,
        bill,
        title: bill?.note || 'House Rent',
        type: 'rent',
        memberCount: roomMembers,
        total,
        share,
        paid: 0,
        due: share,
        status: 'pending',
      };
    });
}

function getPreviousDueAmount(bill) {
  return taka(
    bill?.previousDue ||
      bill?.manualPrevDue ||
      bill?.manualPreviousDue ||
      bill?.previousBalance ||
      bill?.balanceForward ||
      bill?.carryForward ||
      bill?.oldDue ||
      bill?.oldBalance ||
      bill?.totalAmount ||
      bill?.amount ||
      bill?.dueAmount
  );
}

function makePreviousDueRows(currentBills = []) {
  return currentBills
    .filter((bill) => isPreviousDueBill(bill) && !isMonthlySummaryRecord(bill))
    .map((bill) => {
      const share = getPreviousDueAmount(bill);

      if (share <= 0) return null;

      return {
        id: bill.id,
        bill,
        title: bill?.note || 'Previous Due',
        type: 'previous_due',
        memberCount: 1,
        total: share,
        share,
        paid: 0,
        due: share,
        status: 'pending',
      };
    })
    .filter(Boolean);
}

function getUtilityTitle(item) {
  return (
    item?.label ||
    item?.name ||
    String(item?.type || 'Utility')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
  );
}

function makeUtilityRows(individualUtility) {
  const items = Array.isArray(individualUtility?.utilityItems)
    ? individualUtility.utilityItems
    : [];

  const rows = items
    .map((item, index) => {
      const total = taka(item?.totalAmount);
      const share = taka(item?.shareAmount);

      if (total <= 0 && share <= 0) return null;

      return {
        id: item?.id || item?.type || item?.label || `utility-${index}`,
        bill: item,
        title: getUtilityTitle(item),
        type: 'utility',
        memberCount: taka(individualUtility?.utilityMembers),
        total,
        share,
        paid: 0,
        due: share,
        status: 'pending',
      };
    })
    .filter(Boolean);

  const targetUtilityShare = taka(individualUtility?.utilityShare);

  if (rows.length > 0 && targetUtilityShare > 0) {
    const currentUtilityShare = rows.reduce((sum, row) => {
      return sum + taka(row.share);
    }, 0);

    const difference = targetUtilityShare - currentUtilityShare;

    if (difference !== 0) {
      const lastIndex = rows.length - 1;
      const lastRow = rows[lastIndex];
      const newShare = Math.max(0, taka(lastRow.share + difference));

      rows[lastIndex] = {
        ...lastRow,
        share: newShare,
        due: newShare,
      };
    }
  }

  return rows;
}

function applyPaidAmountToRows(rows = [], totalPaidAmount = 0) {
  let remainingPaid = Math.max(0, taka(totalPaidAmount));

  return rows.map((row) => {
    const share = Math.max(0, taka(row.share));
    const paid = Math.min(share, remainingPaid);
    const due = Math.max(0, share - paid);

    remainingPaid = Math.max(0, remainingPaid - paid);

    return {
      ...row,
      share,
      paid,
      due,
      status: due === 0 && share > 0 ? 'paid' : paid > 0 ? 'partial' : 'pending',
    };
  });
}

function makeBreakdown({
  bills = [],
  previousBills = [],
  individualUtility = null,
}) {
  const rentRows = makeRentRows(bills);
  const previousDueRows = makePreviousDueRows(bills);
  const utilityRows = makeUtilityRows(individualUtility);

  const rawRows = [...rentRows, ...previousDueRows, ...utilityRows];

  const rawTotalPayable = rawRows.reduce((sum, row) => {
    return sum + taka(row.share);
  }, 0);

  const userTotalPaid = getTotalPaidFromBills(bills, rawTotalPayable);
  const rows = applyPaidAmountToRows(rawRows, userTotalPaid);

  const rentShare = rentRows.reduce((sum, row) => {
    return sum + taka(row.share);
  }, 0);

  const previousDueShare = previousDueRows.reduce((sum, row) => {
    return sum + taka(row.share);
  }, 0);

  const utilityShare =
    individualUtility?.utilityShare !== undefined &&
    individualUtility?.utilityShare !== null
      ? taka(individualUtility.utilityShare)
      : utilityRows.reduce((sum, row) => sum + taka(row.share), 0);

  const totalPayable = rows.reduce((sum, row) => {
    return sum + taka(row.share);
  }, 0);

  const totalPaid = rows.reduce((sum, row) => {
    return sum + taka(row.paid);
  }, 0);

  const totalDue = Math.max(0, totalPayable - totalPaid);

  return {
    rows,
    rentShare: taka(rentShare),
    previousDueShare: taka(previousDueShare),
    utilityShare: taka(utilityShare),
    totalPayable: taka(totalPayable),
    totalPaid: taka(totalPaid),
    totalDue: taka(totalDue),
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

export default function BillsPage() {
  const { user } = useAuth();
  const router = useRouter();

  const currentDate = new Date();
  const defaultYear = Math.min(Math.max(currentDate.getFullYear(), 2026), 2030);

  const [selectedYear, setSelectedYear] = useState(defaultYear);
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth());

  const [members, setMembers] = useState([]);
  const [currentBills, setCurrentBills] = useState([]);
  const [previousBills, setPreviousBills] = useState([]);
  const [individualUtility, setIndividualUtility] = useState(null);
  const [activeMemberId, setActiveMemberId] = useState(null);

  const [loadingBills, setLoadingBills] = useState(true);
  const [loadingPreviousBills, setLoadingPreviousBills] = useState(true);
  const [loadingUtility, setLoadingUtility] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({
    key: 'default',
    direction: 'asc',
  });

  const [billNotifications, setBillNotifications] = useState([]);
  const [notificationSettings, setNotificationSettings] = useState(null);
  const [deviceInfo, setDeviceInfo] = useState(getDeviceInfo());
  const [enablingNotification, setEnablingNotification] = useState(false);
  const [markingNotifications, setMarkingNotifications] = useState(false);

  const [showIssueModal, setShowIssueModal] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [issueForm, setIssueForm] = useState({
    type: 'billing_mistake',
    description: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const monthStr = getMonthId(selectedYear, selectedMonth);
  const previousMonthStr = getPreviousMonthId(monthStr);
  const monthName = getMonthName(selectedYear, selectedMonth);
  const targetUserId = activeMemberId || user?.uid;

  const activeMember = useMemo(() => {
    if (!activeMemberId) return null;
    return members.find((member) => getMemberId(member) === activeMemberId);
  }, [activeMemberId, members]);

  const targetUserName = activeMember
    ? activeMember.displayName || activeMember.name || 'Member'
    : getUserName(user);

  const targetUserPhoto = activeMember
    ? activeMember.photo || activeMember.photoURL || ''
    : getUserPhoto(user);

  const notificationEnabled =
    notificationSettings?.enabled === true &&
    notificationSettings?.permission === 'granted' &&
    deviceInfo.permission === 'granted';

  useEffect(() => {
    if (!db || !user?.uid) return;

    const usersQuery = query(collection(db, 'users'));

    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
      const rows = snapshot.docs
        .map((item) => ({
          id: item.id,
          ...item.data(),
        }))
        .filter((member) => {
          const memberId = getMemberId(member);
          return isMemberAccountActive(member) && member?.room && memberId !== user.uid;
        });

      setMembers(rows);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    if (!targetUserId || !db) return;

    setLoadingBills(true);

    const currentBillsQuery = query(
      collection(db, 'bills'),
      where('userId', '==', targetUserId),
      where('month', '==', monthStr)
    );

    const unsubscribe = onSnapshot(
      currentBillsQuery,
      (snapshot) => {
        const rows = snapshot.docs
          .map((item) =>
            normalizeBill({
              id: item.id,
              ...item.data(),
            })
          )
          .sort((a, b) => {
            const aTime = safeDate(a.createdAt)?.getTime() || 0;
            const bTime = safeDate(b.createdAt)?.getTime() || 0;
            return aTime - bTime;
          });

        setCurrentBills(rows);
        setLoadingBills(false);
      },
      (error) => {
        console.error('Bills listener error:', error);
        toast.error('Failed to load bills.');
        setLoadingBills(false);
      }
    );

    return () => unsubscribe();
  }, [targetUserId, monthStr]);

  useEffect(() => {
    if (!targetUserId || !previousMonthStr || !db) return;

    setLoadingPreviousBills(true);

    const previousBillsQuery = query(
      collection(db, 'bills'),
      where('userId', '==', targetUserId),
      where('month', '==', previousMonthStr)
    );

    const unsubscribe = onSnapshot(
      previousBillsQuery,
      (snapshot) => {
        const rows = snapshot.docs
          .map((item) =>
            normalizeBill({
              id: item.id,
              ...item.data(),
            })
          )
          .sort((a, b) => {
            const aTime = safeDate(a.createdAt)?.getTime() || 0;
            const bTime = safeDate(b.createdAt)?.getTime() || 0;
            return aTime - bTime;
          });

        setPreviousBills(rows);
        setLoadingPreviousBills(false);
      },
      (error) => {
        console.error('Previous bills listener error:', error);
        setPreviousBills([]);
        setLoadingPreviousBills(false);
      }
    );

    return () => unsubscribe();
  }, [targetUserId, previousMonthStr]);

  useEffect(() => {
    if (!targetUserId || !monthStr || !db) return;

    setLoadingUtility(true);

    const utilityDocId = `${safeDocId(monthStr)}_${safeDocId(targetUserId)}`;

    const unsubscribe = onSnapshot(
      doc(db, 'individualUserUtility', utilityDocId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setIndividualUtility(null);
          setLoadingUtility(false);
          return;
        }

        setIndividualUtility({
          id: snapshot.id,
          ...snapshot.data(),
        });

        setLoadingUtility(false);
      },
      (error) => {
        console.error('Individual utility listener error:', error);
        setIndividualUtility(null);
        setLoadingUtility(false);
        toast.error('Failed to load utility.');
      }
    );

    return () => unsubscribe();
  }, [targetUserId, monthStr]);

  useEffect(() => {
    if (!user?.uid || !db) return;

    setDeviceInfo(getDeviceInfo());

    const settingsUnsubscribe = onSnapshot(
      doc(db, 'notificationSettings', user.uid),
      (snapshot) => {
        setNotificationSettings(snapshot.exists() ? snapshot.data() : null);
      }
    );

    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const notificationsUnsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
      const rows = snapshot.docs.map((item) => {
        const data = item.data();

        return {
          id: item.id,
          ...data,
          createdAt: safeDate(data.createdAt),
          sentAt: safeDate(data.sentAt),
          timestamp: safeDate(data.timestamp),
          updatedAt: safeDate(data.updatedAt),
        };
      });

      setBillNotifications(rows.filter(isBillNotification));
    });

    return () => {
      settingsUnsubscribe();
      notificationsUnsubscribe();
    };
  }, [user?.uid]);

  useEffect(() => {
    function refreshDeviceInfo() {
      setDeviceInfo(getDeviceInfo());
    }

    window.addEventListener('focus', refreshDeviceInfo);

    return () => {
      window.removeEventListener('focus', refreshDeviceInfo);
    };
  }, []);

  const breakdown = useMemo(() => {
    return makeBreakdown({
      bills: currentBills,
      previousBills,
      individualUtility,
    });
  }, [currentBills, previousBills, individualUtility]);

  const visibleBreakdownRows = useMemo(() => {
    let rows = [...breakdown.rows];

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      rows = rows.filter((row) => getExpenseSearchText(row).includes(term));
    }

    rows.sort((a, b) => {
      if (sortConfig.key === 'title') {
        const result = a.title.localeCompare(b.title);
        return sortConfig.direction === 'asc' ? result : -result;
      }

      if (sortConfig.key === 'total') {
        const result = a.total - b.total;
        return sortConfig.direction === 'asc' ? result : -result;
      }

      if (sortConfig.key === 'share') {
        const result = a.share - b.share;
        return sortConfig.direction === 'asc' ? result : -result;
      }

      return 0;
    });

    return rows;
  }, [breakdown.rows, searchTerm, sortConfig]);

  const monthBillNotifications = useMemo(() => {
    return billNotifications.filter((notification) => {
      const dataMonth =
        notification?.data?.monthId ||
        notification?.data?.month ||
        notification?.month ||
        '';

      if (!dataMonth) return true;
      return dataMonth === monthStr;
    });
  }, [billNotifications, monthStr]);

  const unreadBillNotificationCount = monthBillNotifications.filter(
    (notification) => !notification.read
  ).length;

  function setYearMonthFromSelect(year, month) {
    setSelectedYear(Number(year));
    setSelectedMonth(Number(month));
  }

  function goToPrevMonth() {
    if (selectedYear === 2026 && selectedMonth === 0) return;

    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((year) => year - 1);
      return;
    }

    setSelectedMonth((month) => month - 1);
  }

  function goToNextMonth() {
    if (selectedYear === 2030 && selectedMonth === 11) return;

    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((year) => year + 1);
      return;
    }

    setSelectedMonth((month) => month + 1);
  }

  function handleSort(key) {
    setSortConfig((old) => ({
      key,
      direction: old.key === key && old.direction === 'asc' ? 'desc' : 'asc',
    }));
  }

  function openIssueModal(bill) {
    setSelectedRow(bill);
    setIssueForm({
      type: 'billing_mistake',
      description: '',
    });
    setShowIssueModal(true);
  }

  async function submitIssue() {
    if (!issueForm.description.trim()) {
      toast.error('Please describe the issue.');
      return;
    }

    setSubmitting(true);

    try {
      await addDoc(collection(db, 'reportedIssues'), {
        userId: user.uid,
        userName: getUserName(user),
        billId: selectedRow?.id || '',
        billMonth: monthStr,
        issueType: issueForm.type,
        description: issueForm.description,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast.success('Issue reported.');
      setShowIssueModal(false);
      setSelectedRow(null);
    } catch {
      toast.error('Failed to submit issue.');
    } finally {
      setSubmitting(false);
    }
  }

  const handleEnableNotifications = useCallback(async () => {
    if (!user?.uid) return;

    const latestDeviceInfo = getDeviceInfo();
    setDeviceInfo(latestDeviceInfo);

    if (!latestDeviceInfo.supportsPush) {
      toast.error('This browser does not support push notifications.');
      return;
    }

    if (latestDeviceInfo.isIOS && !latestDeviceInfo.isStandalone) {
      toast.error('On iPhone, add this app to Home Screen first.');
      return;
    }

    if (latestDeviceInfo.permission === 'denied') {
      toast.error('Notifications are blocked. Enable them from browser or phone settings.');
      await saveNotificationSettings(user.uid, false, '');
      return;
    }

    try {
      setEnablingNotification(true);

      const success = await setupPushNotifications(user.uid);

      if (!success) {
        await saveNotificationSettings(user.uid, false, '');
        toast.error('Please allow notification permission.');
        return;
      }

      const token = await getFCMToken(user.uid);

      await saveNotificationSettings(user.uid, true, token || '');
      setDeviceInfo(getDeviceInfo());

      toast.success('Bill notifications enabled.');
    } catch (error) {
      toast.error(error.message || 'Failed to enable notifications.');
    } finally {
      setEnablingNotification(false);
    }
  }, [user?.uid]);

  async function markNotificationRead(notificationId) {
    if (!notificationId) return;

    await updateDoc(doc(db, 'notifications', notificationId), {
      read: true,
      readAt: serverTimestamp(),
    });
  }

  async function handleBillNotificationClick(notification) {
    try {
      if (!notification.read) {
        await markNotificationRead(notification.id);
      }

      router.push('/notifications');
    } catch {
      toast.error('Failed to open notification.');
    }
  }

  async function markAllBillNotificationsRead() {
    const unread = monthBillNotifications.filter((notification) => !notification.read);

    if (unread.length === 0) return;

    try {
      setMarkingNotifications(true);

      const batch = writeBatch(db);

      unread.forEach((notification) => {
        batch.update(doc(db, 'notifications', notification.id), {
          read: true,
          readAt: serverTimestamp(),
        });
      });

      await batch.commit();
      toast.success('All bill notifications marked as read.');
    } catch {
      toast.error('Failed to mark notifications.');
    } finally {
      setMarkingNotifications(false);
    }
  }

  if (loadingBills || loadingPreviousBills || loadingUtility) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-gray-200 bg-white px-8 py-7 shadow-sm">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
          <p className="text-sm font-bold text-gray-500">Loading bills...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-5 sm:py-6 lg:px-8">
        <section className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5 lg:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                {targetUserPhoto ? (
                  <img
                    src={targetUserPhoto}
                    alt={targetUserName}
                    className="h-14 w-14 rounded-2xl object-cover ring-4 ring-emerald-50 sm:h-16 sm:w-16"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-xl font-black text-violet-700 ring-4 ring-violet-50 sm:h-16 sm:w-16">
                    {getInitial(targetUserName)}
                  </div>
                )}

                <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-white bg-emerald-500 shadow-sm" />
              </div>

              <div>
                <p className="text-xs font-black uppercase tracking-wide text-violet-600">
                  User Bills
                </p>

                <h1 className="mt-1 text-xl font-black text-gray-950 sm:text-3xl">
                  House Expense Breakdown
                </h1>

                <p className="mt-1 text-sm font-semibold text-gray-500">
                  {targetUserName} • Active now
                </p>

                <p className="mt-1 text-xs text-gray-400">
                  Month-wise rent, utility, payment, and due details.
                </p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-[110px_150px_auto_auto]">
              <select
                value={selectedYear}
                onChange={(event) =>
                  setYearMonthFromSelect(event.target.value, selectedMonth)
                }
                className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-black text-gray-800 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
              >
                {YEARS.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>

              <select
                value={selectedMonth}
                onChange={(event) =>
                  setYearMonthFromSelect(selectedYear, event.target.value)
                }
                className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-black text-gray-800 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
              >
                {MONTHS.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={goToPrevMonth}
                disabled={selectedYear === 2026 && selectedMonth === 0}
                className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-black text-gray-700 disabled:opacity-40"
              >
                Prev
              </button>

              <button
                type="button"
                onClick={goToNextMonth}
                disabled={selectedYear === 2030 && selectedMonth === 11}
                className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-black text-gray-700 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>

          <div className="mt-5 rounded-3xl border border-violet-100 bg-violet-50 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase text-violet-600">
                  Selected Month
                </p>

                <h2 className="text-xl font-black text-violet-900">
                  {monthName}
                </h2>
              </div>

              <div className="relative w-full lg:max-w-sm">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search rent, electricity, wifi, due..."
                  className="w-full rounded-2xl border border-violet-200 bg-white py-3 pl-11 pr-10 text-sm font-bold outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                />

                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:bg-gray-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase text-gray-500">
                <ReceiptText className="h-4 w-4" />
                Expenses
              </div>

              <p className="mt-2 text-xl font-black text-gray-950">
                {breakdown.rows.length}
              </p>

              <p className="mt-1 text-[10px] font-bold text-gray-400">
                All rows
              </p>
            </div>

            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase text-blue-600">
                <Home className="h-4 w-4" />
                Rent Share
              </div>

              <p className="mt-2 text-xl font-black text-blue-700">
                {money(breakdown.rentShare)}
              </p>

              <p className="mt-1 text-[10px] font-bold text-blue-400">
                Room share
              </p>
            </div>

            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase text-amber-600">
                <WalletCards className="h-4 w-4" />
                Utility
              </div>

              <p className="mt-2 text-xl font-black text-amber-700">
                {money(breakdown.utilityShare)}
              </p>

              <p className="mt-1 text-[10px] font-bold text-amber-400">
                Shared charge
              </p>
            </div>

            <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase text-violet-600">
                <ReceiptText className="h-4 w-4" />
                Payable
              </div>

              <p className="mt-2 text-xl font-black text-violet-700">
                {money(breakdown.totalPayable)}
              </p>

              <p className="mt-1 text-[10px] font-bold text-violet-400">
                All payable
              </p>
            </div>

            <div className="col-span-2 rounded-2xl border border-red-100 bg-red-50 p-4 lg:col-span-1">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase text-red-600">
                <TrendingUp className="h-4 w-4" />
                Due
              </div>

              <p className="mt-2 text-xl font-black text-red-700">
                {money(breakdown.totalDue)}
              </p>

              <p className="mt-1 text-[10px] font-bold text-red-400">
                Remaining balance
              </p>
            </div>
          </div>
        </section>

        {!notificationEnabled && (
          <section className="mt-4 rounded-3xl border border-violet-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                  <BellRing className="h-5 w-5" />
                </div>

                <div>
                  <h2 className="text-sm font-black text-gray-950">
                    Enable bill notifications
                  </h2>

                  <p className="mt-1 text-xs leading-5 text-gray-500 sm:text-sm">
                    Get instant alerts for paid, partial, due, unpaid, and advance bill status.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleEnableNotifications}
                disabled={enablingNotification}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-black text-white transition hover:bg-violet-700 disabled:opacity-60 sm:w-auto"
              >
                {enablingNotification ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Bell className="h-4 w-4" />
                )}

                {enablingNotification ? 'Enabling...' : 'Allow Notifications'}
              </button>
            </div>

            {deviceInfo.isIOS && !deviceInfo.isStandalone && (
              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <div className="flex gap-3">
                  <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />

                  <p className="text-xs leading-5 text-blue-700">
                    On iPhone, open in Safari, tap Share, add to Home Screen, then open from Home Screen and enable notifications.
                  </p>
                </div>
              </div>
            )}
          </section>
        )}

        {members.length > 0 && (
          <section className="mt-4 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-500" />

                <p className="text-xs font-black uppercase text-gray-500">
                  View member bills
                </p>
              </div>

              {activeMemberId && (
                <button
                  type="button"
                  onClick={() => setActiveMemberId(null)}
                  className="text-xs font-black text-violet-600 hover:underline"
                >
                  Show Mine
                </button>
              )}
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {members.map((member) => {
                const memberId = getMemberId(member);

                return (
                  <button
                    key={memberId}
                    type="button"
                    onClick={() => setActiveMemberId(memberId)}
                    className={`flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 transition ${
                      activeMemberId === memberId
                        ? 'border-violet-300 bg-violet-50 text-violet-700'
                        : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-white'
                    }`}
                  >
                    <div className="relative shrink-0">
                      {member.photo || member.photoURL ? (
                        <img
                          src={member.photo || member.photoURL}
                          alt={member.displayName || member.name || 'Member'}
                          className="h-9 w-9 rounded-full object-cover ring-2 ring-white"
                        />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-xs font-black text-gray-600 ring-2 ring-white">
                          {(member.displayName || member.name || '?')
                            .charAt(0)
                            .toUpperCase()}
                        </div>
                      )}

                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${
                          isLive(member) ? 'bg-emerald-500' : 'bg-gray-400'
                        }`}
                      />
                    </div>

                    <div className="min-w-0 text-left">
                      <p className="max-w-[120px] truncate text-xs font-black">
                        {member.displayName || member.name || 'Member'}
                      </p>

                      <p className="text-[10px] font-bold text-gray-400">
                        {member.room}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_390px]">
          <section className="min-w-0 rounded-3xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 p-4 sm:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-black text-gray-950">
                    House Expense Breakdown
                  </h2>

                  <p className="mt-1 text-xs text-gray-500">
                    Utility Share: {money(breakdown.utilityShare)} • Total Payable:{' '}
                    {money(breakdown.totalPayable)}
                  </p>

                  {!individualUtility && (
                    <p className="mt-1 text-xs font-bold text-amber-600">
                      No utility setup found for this month/user.
                    </p>
                  )}
                </div>

                {activeMember && (
                  <button
                    type="button"
                    onClick={() => setActiveMemberId(null)}
                    className="rounded-2xl bg-violet-50 px-4 py-2 text-xs font-black text-violet-700"
                  >
                    Back to My Bills
                  </button>
                )}
              </div>
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[850px] border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border-b border-gray-200 px-4 py-3 text-left text-[11px] font-black uppercase text-gray-500">
                      #
                    </th>

                    <th className="border-b border-gray-200 px-4 py-3 text-left text-[11px] font-black uppercase text-gray-500">
                      <button type="button" onClick={() => handleSort('title')}>
                        Expense
                      </button>
                    </th>

                    <th className="border-b border-gray-200 px-4 py-3 text-right text-[11px] font-black uppercase text-gray-500">
                      <button type="button" onClick={() => handleSort('total')}>
                        Total
                      </button>
                    </th>

                    <th className="border-b border-gray-200 px-4 py-3 text-right text-[11px] font-black uppercase text-gray-500">
                      <button type="button" onClick={() => handleSort('share')}>
                        Share
                      </button>
                    </th>

                    <th className="border-b border-gray-200 px-4 py-3 text-right text-[11px] font-black uppercase text-gray-500">
                      Paid
                    </th>

                    <th className="border-b border-gray-200 px-4 py-3 text-right text-[11px] font-black uppercase text-gray-500">
                      Due
                    </th>

                    <th className="border-b border-gray-200 px-4 py-3 text-center text-[11px] font-black uppercase text-gray-500">
                      Status
                    </th>

                    <th className="border-b border-gray-200 px-4 py-3 text-center text-[11px] font-black uppercase text-gray-500">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {visibleBreakdownRows.length > 0 ? (
                    <>
                      {visibleBreakdownRows.map((row, index) => {
                        const status = getStatusStyle(row.status);

                        return (
                          <tr
                            key={`${row.type}-${row.id}-${index}`}
                            className={`border-l-4 hover:bg-gray-50 ${status.row}`}
                          >
                            <td className="px-4 py-3 text-sm font-black text-gray-500">
                              {index + 1}
                            </td>

                            <td className="px-4 py-3">
                              <p className="text-sm font-black text-gray-900">
                                {row.title}
                              </p>

                              {row.type === 'rent' ? (
                                <p className="text-xs font-bold text-gray-400">
                                  Split by room members: {row.memberCount}
                                </p>
                              ) : row.type === 'previous_due' ? (
                                <p className="text-xs font-bold text-gray-400">
                                  Previous unpaid balance
                                </p>
                              ) : (
                                <p className="text-xs font-bold text-gray-400">
                                  Shared utility charge
                                </p>
                              )}
                            </td>

                            <td className="px-4 py-3 text-right text-sm font-black text-gray-900">
                              {money(row.total)}
                            </td>

                            <td className="px-4 py-3 text-right text-sm font-black text-violet-700">
                              {money(row.share)}
                            </td>

                            <td className="px-4 py-3 text-right text-sm font-black text-emerald-700">
                              {money(row.paid)}
                            </td>

                            <td className="px-4 py-3 text-right text-sm font-black text-red-700">
                              {row.due > 0 ? money(row.due) : '—'}
                            </td>

                            <td className="px-4 py-3 text-center">
                              <span
                                className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${status.className}`}
                              >
                                {status.label}
                              </span>
                            </td>

                            <td className="px-4 py-3 text-center">
                              {!activeMemberId && (
                                <button
                                  type="button"
                                  onClick={() => openIssueModal(row.bill)}
                                  className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-100"
                                >
                                  Report
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      <tr className="bg-gray-950 text-white">
                        <td className="px-4 py-4 text-sm font-black" colSpan={3}>
                          Total
                        </td>

                        <td className="px-4 py-4 text-right text-sm font-black">
                          {money(breakdown.totalPayable)}
                        </td>

                        <td className="px-4 py-4 text-right text-sm font-black text-emerald-300">
                          {money(breakdown.totalPaid)}
                        </td>

                        <td className="px-4 py-4 text-right text-sm font-black text-red-300">
                          {breakdown.totalDue > 0 ? money(breakdown.totalDue) : '—'}
                        </td>

                        <td className="px-4 py-4 text-center">
                          <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase text-gray-950">
                            {breakdown.status === 'paid'
                              ? 'Paid'
                              : breakdown.status === 'partial'
                                ? 'Partial'
                                : 'Pending'}
                          </span>
                        </td>

                        <td className="px-4 py-4" />
                      </tr>
                    </>
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-4 py-16 text-center">
                        <p className="text-sm font-bold text-gray-400">
                          {searchTerm
                            ? 'No matching expense found'
                            : 'No expense breakdown found for this month'}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 p-4 md:hidden">
              {visibleBreakdownRows.length > 0 ? (
                visibleBreakdownRows.map((row, index) => {
                  const status = getStatusStyle(row.status);

                  return (
                    <article
                      key={`${row.type}-${row.id}-${index}`}
                      className={`rounded-3xl border-l-4 border-r border-t border-b bg-white p-4 shadow-sm ${status.row}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase text-gray-400">
                            #{index + 1}
                          </p>

                          <h3 className="mt-1 text-sm font-black text-gray-950">
                            {row.title}
                          </h3>

                          <p className="mt-1 text-xs font-bold text-gray-400">
                            {row.type === 'rent'
                              ? `Split by room members: ${row.memberCount}`
                              : row.type === 'previous_due'
                                ? 'Previous unpaid balance'
                                : 'Shared utility charge'}
                          </p>
                        </div>

                        <span
                          className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${status.className}`}
                        >
                          {status.label}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <div className="rounded-2xl bg-gray-50 px-3 py-2">
                          <p className="text-[9px] font-black uppercase text-gray-400">
                            Total
                          </p>

                          <p className="mt-1 text-xs font-black text-gray-900">
                            {money(row.total)}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-violet-50 px-3 py-2">
                          <p className="text-[9px] font-black uppercase text-violet-500">
                            Share
                          </p>

                          <p className="mt-1 text-xs font-black text-violet-800">
                            {money(row.share)}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-emerald-50 px-3 py-2">
                          <p className="text-[9px] font-black uppercase text-emerald-500">
                            Paid
                          </p>

                          <p className="mt-1 text-xs font-black text-emerald-800">
                            {money(row.paid)}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-red-50 px-3 py-2">
                          <p className="text-[9px] font-black uppercase text-red-500">
                            Due
                          </p>

                          <p className="mt-1 text-xs font-black text-red-800">
                            {row.due > 0 ? money(row.due) : '—'}
                          </p>
                        </div>
                      </div>

                      {!activeMemberId && (
                        <button
                          type="button"
                          onClick={() => openIssueModal(row.bill)}
                          className="mt-3 w-full rounded-2xl bg-blue-50 py-2.5 text-xs font-black text-blue-700"
                        >
                          Report Issue
                        </button>
                      )}
                    </article>
                  );
                })
              ) : (
                <div className="rounded-3xl border border-dashed border-gray-200 p-8 text-center">
                  <ReceiptText className="mx-auto h-8 w-8 text-gray-300" />

                  <p className="mt-3 text-sm font-black text-gray-400">
                    {searchTerm ? 'No matching expense found' : 'No expense breakdown found'}
                  </p>
                </div>
              )}

              {visibleBreakdownRows.length > 0 && (
                <div className="rounded-3xl bg-gray-950 p-4 text-white">
                  <div className="flex items-center justify-between text-sm font-black">
                    <span>Total Payable</span>
                    <span>{money(breakdown.totalPayable)}</span>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-sm font-black text-emerald-300">
                    <span>Total Paid</span>
                    <span>{money(breakdown.totalPaid)}</span>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-sm font-black text-red-300">
                    <span>Total Due</span>
                    <span>{breakdown.totalDue > 0 ? money(breakdown.totalDue) : '—'}</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          <aside className="min-w-0 rounded-3xl border border-gray-200 bg-white shadow-sm lg:sticky lg:top-4 lg:self-start">
            <div className="border-b border-gray-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-[10px] font-black uppercase text-violet-700">
                    <Bell className="h-3.5 w-3.5" />
                    Bill Alerts
                  </div>

                  <h2 className="mt-2 text-base font-black text-gray-950">
                    Latest Notifications
                  </h2>

                  <p className="mt-1 text-xs text-gray-500">
                    {unreadBillNotificationCount > 0
                      ? `${unreadBillNotificationCount} unread for ${monthName}`
                      : `No unread alert for ${monthName}`}
                  </p>
                </div>

                {unreadBillNotificationCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllBillNotificationsRead}
                    disabled={markingNotifications}
                    className="rounded-2xl bg-gray-900 px-3 py-2 text-[10px] font-black text-white disabled:opacity-60"
                  >
                    {markingNotifications ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCheck className="h-4 w-4" />
                    )}
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-[650px] space-y-3 overflow-y-auto p-4">
              {monthBillNotifications.length > 0 ? (
                monthBillNotifications.map((notification) => {
                  const styled = buildBillNotification(notification);
                  const sentDate = getNotificationDate(notification);

                  return (
                    <article
                      key={notification.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleBillNotificationClick(notification)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          handleBillNotificationClick(notification);
                        }
                      }}
                      className="flex cursor-pointer gap-2.5 rounded-2xl p-1 transition hover:bg-gray-50"
                    >
                      <div
                        className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base text-white shadow-sm ${styled.design.badge}`}
                      >
                        {styled.design.emoji}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="text-xs font-black text-gray-900">
                            Bill Message
                          </span>

                          <span className="text-[10px] font-bold text-gray-400">
                            {formatShortTime(sentDate)}
                          </span>

                          {!notification.read && (
                            <span className="rounded-full bg-red-500 px-2 py-0.5 text-[9px] font-black uppercase text-white">
                              New
                            </span>
                          )}
                        </div>

                        <div
                          className={`rounded-[22px] rounded-tl-md border px-3 py-3 shadow-sm ${styled.design.bubble}`}
                        >
                          <p className="text-[10px] font-black uppercase tracking-wide text-gray-500">
                            House Expense
                          </p>

                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <span
                              className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${styled.design.badge}`}
                            >
                              {styled.design.short}
                            </span>

                            <span className="rounded-full bg-white/80 px-2.5 py-1 text-[9px] font-black uppercase text-gray-500">
                              {styled.monthText}
                            </span>
                          </div>

                          <h3 className={`mt-2 text-sm font-black ${styled.design.text}`}>
                            {styled.design.label}
                          </h3>

                          <p className="mt-2 whitespace-pre-line text-xs leading-5 text-gray-800">
                            {styled.message}
                          </p>

                          <div className="mt-3 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1 text-[10px] font-bold text-gray-400">
                              <Clock className="h-3 w-3" />
                              Sent {formatDhakaTime(sentDate)}
                            </div>

                            {!notification.read && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  markNotificationRead(notification.id);
                                }}
                                className="rounded-full bg-white px-3 py-1.5 text-[10px] font-black text-gray-700"
                              >
                                Mark read
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="rounded-3xl border border-dashed border-gray-200 p-8 text-center">
                  <Bell className="mx-auto h-8 w-8 text-gray-300" />

                  <p className="mt-3 text-sm font-black text-gray-400">
                    No bill notifications for {monthName}
                  </p>

                  <p className="mt-1 text-xs text-gray-400">
                    Paid, partial, due, and unpaid alerts will appear here.
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      <AnimatePresence>
        {showIssueModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-gray-950/50 px-0 sm:items-center sm:px-4"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setShowIssueModal(false);
              }
            }}
          >
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              className="w-full overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-md sm:rounded-3xl"
            >
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-500" />

                  <h3 className="text-sm font-black text-gray-950">
                    Report Issue
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => setShowIssueModal(false)}
                  className="rounded-xl p-2 text-gray-400 hover:bg-gray-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4 p-5">
                <div className="rounded-2xl bg-gray-50 p-3 text-xs font-bold text-gray-600">
                  Reference:{' '}
                  {selectedRow?.note || selectedRow?.label || selectedRow?.type || 'Bill'} —{' '}
                  {money(selectedRow?.amount || selectedRow?.shareAmount)}
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-black text-gray-700">
                    Issue Type
                  </label>

                  <select
                    value={issueForm.type}
                    onChange={(event) =>
                      setIssueForm((old) => ({
                        ...old,
                        type: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-gray-200 px-3 py-3 text-sm font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  >
                    <option value="billing_mistake">Billing mistake</option>
                    <option value="wrong_amount">Wrong amount</option>
                    <option value="wrong_payment">Wrong payment</option>
                    <option value="missing_payment">Missing payment</option>
                    <option value="general">General issue</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-black text-gray-700">
                    Description
                  </label>

                  <textarea
                    value={issueForm.description}
                    onChange={(event) =>
                      setIssueForm((old) => ({
                        ...old,
                        description: event.target.value,
                      }))
                    }
                    rows={4}
                    placeholder="Explain the problem clearly..."
                    className="w-full resize-none rounded-2xl border border-gray-200 px-3 py-3 text-sm font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-gray-100 bg-gray-50 p-5">
                <button
                  type="button"
                  onClick={() => setShowIssueModal(false)}
                  className="rounded-2xl border border-gray-200 bg-white py-3 text-sm font-black text-gray-700"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={submitIssue}
                  disabled={submitting}
                  className="rounded-2xl bg-blue-600 py-3 text-sm font-black text-white disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
