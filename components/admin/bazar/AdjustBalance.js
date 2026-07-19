'use client';

import { useCallback, useMemo, useState } from 'react';
import { db } from '@/lib/firebase';
import {
  addDoc,
  collection,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { schedulePushNotification } from '@/lib/notificationPolicy';
import { isMemberAccountActive } from '@/lib/memberPolicy';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  LockKeyhole,
  ReceiptText,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';

const AGENT_BLUE = '#0057B8';
const AGENT_BLUE_DARK = '#00489A';
const AGENT_BLUE_SOFT = '#EAF3FF';

const QUICK_AMOUNTS = [50, 100, 500, 1000, 2000, 5000, 10000];

const STEPS = [
  { key: 'from', label: 'From' },
  { key: 'to', label: 'To' },
  { key: 'amount', label: 'Amount' },
  { key: 'review', label: 'Review' },
];

function toEnglishDigits(value) {
  return String(value || '')
    .replace(/[০-৯]/g, (digit) => String(digit.charCodeAt(0) - 0x09e6))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
}

function parseMoney(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const clean = toEnglishDigits(value)
    .replace(/,/g, '')
    .replace(/[৳\s]/g, '')
    .replace(/[^\d.-]/g, '');

  const number = Number(clean);

  return Number.isFinite(number) ? number : 0;
}

function normalizeAmountInput(value) {
  return toEnglishDigits(value)
    .replace(/[^\d]/g, '')
    .replace(/^0+(?=\d)/, '')
    .slice(0, 9);
}

function formatBDT(amount) {
  const number = parseMoney(amount);

  if (number < 0) {
    return `-৳${Math.abs(number).toLocaleString('bn-BD')}`;
  }

  return `৳${number.toLocaleString('bn-BD')}`;
}

function formatPlainBDT(amount) {
  return `৳${Math.abs(parseMoney(amount)).toLocaleString('bn-BD')}`;
}

function getMemberName(member) {
  return (
    member?.displayName ||
    member?.name ||
    member?.fullName ||
    member?.email ||
    'Member'
  );
}

function getMemberPhoto(member) {
  return member?.photoURL || member?.photo || member?.avatar || member?.image || '';
}

function getInitial(name) {
  return String(name || 'N').charAt(0).toUpperCase();
}

function isRoomMember(member) {
  return Boolean(String(member?.room || '').trim()) && isMemberAccountActive(member);
}

function getBazarUserId(item) {
  return item?.userId || item?.memberId || item?.uid || '';
}

function getAdjustmentFromId(item) {
  return item?.fromUserId || item?.fromMember || item?.senderId || item?.sourceUserId || '';
}

function getAdjustmentToId(item) {
  return item?.toUserId || item?.toMember || item?.receiverId || item?.targetUserId || '';
}

function getStepIndex(step) {
  return STEPS.findIndex((item) => item.key === step);
}

function NestHubLogo({ size = 'md' }) {
  const sizeClass =
    size === 'lg'
      ? 'h-16 w-16 text-xl'
      : size === 'sm'
        ? 'h-10 w-10 text-sm'
        : 'h-12 w-12 text-base';

  return (
    <div
      className={`flex ${sizeClass} items-center justify-center rounded-full font-black text-white shadow-sm`}
      style={{ backgroundColor: AGENT_BLUE }}
    >
      NH
    </div>
  );
}

function MemberAvatar({ member, selected = false }) {
  const name = getMemberName(member);
  const photo = getMemberPhoto(member);

  if (photo) {
    return (
      <img
        src={photo}
        alt={name}
        className={`h-12 w-12 rounded-full object-cover ring-2 ${
          selected ? 'ring-blue-500' : 'ring-white'
        }`}
      />
    );
  }

  return (
    <div
      className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-black ring-2 ${
        selected
          ? 'text-white ring-blue-200'
          : 'bg-blue-50 text-blue-700 ring-white'
      }`}
      style={selected ? { backgroundColor: AGENT_BLUE } : {}}
    >
      {getInitial(name)}
    </div>
  );
}

function StepDots({ currentStep }) {
  const activeIndex = getStepIndex(currentStep);

  return (
    <div className="flex items-center justify-center gap-2">
      {STEPS.map((step, index) => {
        const active = index === activeIndex;
        const completed = index < activeIndex;

        return (
          <div key={step.key} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-black transition ${
                active || completed
                  ? 'text-white'
                  : 'bg-white/20 text-white/70'
              }`}
              style={active || completed ? { backgroundColor: AGENT_BLUE_DARK } : {}}
            >
              {completed ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
            </div>

            {index < STEPS.length - 1 && (
              <div
                className={`h-0.5 w-6 rounded-full ${
                  completed ? 'bg-white' : 'bg-white/30'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function MemberSelectCard({
  member,
  selected,
  disabled,
  onClick,
  type = 'from',
  stats,
}) {
  const name = getMemberName(member);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${
        selected
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-200 bg-white hover:bg-blue-50/60'
      }`}
    >
      <MemberAvatar member={member} selected={selected} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black text-gray-950">
          {name}
        </p>

        <p className="mt-0.5 text-[11px] font-bold text-gray-400">
          Room {member.room || '—'}
        </p>

        {type === 'from' && (
          <p className="mt-1 text-[10px] font-black uppercase text-red-500">
            Sender
          </p>
        )}

        {type === 'to' && (
          <p className="mt-1 text-[10px] font-black uppercase text-blue-600">
            Receiver
          </p>
        )}
      </div>

      <div className="text-right">
        <p className="text-[10px] font-black uppercase text-gray-400">
          Month Balance
        </p>

        <p
          className={`text-sm font-black ${
            stats.balance < 0 ? 'text-red-600' : 'text-gray-900'
          }`}
        >
          {formatBDT(stats.balance)}
        </p>

        <p className="mt-0.5 text-[9px] font-bold text-gray-400">
          Bazar {formatBDT(stats.bazar)}
        </p>
      </div>
    </button>
  );
}

function NumberPad({ value, onChange }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫'];

  function handleKey(key) {
    if (key === '⌫') {
      onChange(String(value || '').slice(0, -1));
      return;
    }

    onChange(normalizeAmountInput(`${value || ''}${key}`));
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => handleKey(key)}
          className="rounded-2xl border border-gray-200 bg-white py-4 text-lg font-black text-gray-900 shadow-sm transition hover:bg-blue-50 active:scale-[0.97]"
        >
          {key}
        </button>
      ))}
    </div>
  );
}

function ReviewRow({ label, value, valueClass = 'text-gray-950' }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-gray-50 px-4 py-3">
      <p className="text-xs font-bold text-gray-500">
        {label}
      </p>

      <p className={`text-right text-sm font-black ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}

function BalanceBreakdown({ title, stats, afterBalance, amountPrefix }) {
  return (
    <div className="rounded-2xl bg-gray-50 p-3">
      <p className="text-[10px] font-black uppercase text-gray-400">
        {title}
      </p>

      <div className="mt-2 space-y-1.5 text-xs font-bold text-gray-600">
        <div className="flex justify-between">
          <span>Bazar Given</span>
          <span>{formatBDT(stats.bazar)}</span>
        </div>

        <div className="flex justify-between">
          <span>Received</span>
          <span>{formatBDT(stats.received)}</span>
        </div>

        <div className="flex justify-between">
          <span>Sent</span>
          <span>- {formatPlainBDT(stats.sent)}</span>
        </div>

        {amountPrefix && (
          <div className="flex justify-between">
            <span>This Payment</span>
            <span>{amountPrefix}</span>
          </div>
        )}
      </div>

      <div className="mt-2 border-t border-gray-200 pt-2">
        <div className="flex items-center justify-between gap-3 text-sm font-black">
          <span>Month Balance</span>
          <span className={afterBalance < 0 ? 'text-red-600' : 'text-blue-700'}>
            {formatBDT(afterBalance)}
          </span>
        </div>
      </div>
    </div>
  );
}

async function sendPushToUser(userId, payload) {
  try {
    const devicesSnap = await getDocs(collection(db, 'fcmTokens', userId, 'devices'));

    const requests = devicesSnap.docs
      .map((item) => item.data()?.token)
      .filter(Boolean)
      .map((token) => {
        return fetch('/api/send-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            title: payload.title,
            body: payload.body,
            url: '/bazar',
            type: 'balance_adjustment',
            timestamp: Date.now().toString(),
          }),
        }).catch(() => null);
      });

    await Promise.all(requests);
  } catch {
    // Push failure should not block the transfer.
  }
}

async function createBalanceNotification({
  userId,
  title,
  body,
  month,
  amount,
  reason,
  fromName,
  toName,
  previousBalance,
  newBalance,
  direction,
  isNegativeBalance = false,
}) {
  await addDoc(collection(db, 'notifications'), {
    userId,
    title,
    body,
    type: 'balance_adjustment',
    link: '/bazar',
    read: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    data: {
      type: 'balance_adjustment',
      action: direction === 'sent' ? 'nesthub_payment_sent' : 'nesthub_payment_received',
      transactionType: 'nesthub_payment',
      status: 'paid',
      month,
      monthId: month,
      transferAmount: amount,
      totalPayable: amount,
      paidAmount: amount,
      balance: 0,
      previousBalance,
      newBalance,
      fromName,
      toName,
      direction,
      reason,
      isNegativeBalance,
    },
  });
}

export default function AdjustBalance({
  members = [],
  bazars = [],
  adjustments = [],
  selectedMonth,
  onAdjust,
  notificationsEnabled = false,
}) {
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState('from');
  const [searchTerm, setSearchTerm] = useState('');

  const [form, setForm] = useState({
    fromMember: '',
    toMember: '',
    amount: '',
    reason: '',
  });

  const [loading, setLoading] = useState(false);
  const [successData, setSuccessData] = useState(null);

  const roomMembers = useMemo(() => {
    return members.filter(isRoomMember);
  }, [members]);

  const monthBazars = useMemo(() => {
    return bazars.filter((item) => {
      return !item.isDeleted && item.countInBazar !== false && String(item.month || '') === String(selectedMonth || '');
    });
  }, [bazars, selectedMonth]);

  const monthAdjustments = useMemo(() => {
    return adjustments.filter((item) => {
      return !item.isDeleted && String(item.month || '') === String(selectedMonth || '');
    });
  }, [adjustments, selectedMonth]);

  const monthlyStats = useMemo(() => {
    const map = {};

    roomMembers.forEach((member) => {
      map[member.id] = {
        bazar: 0,
        received: 0,
        sent: 0,
        balance: 0,
      };
    });

    monthBazars.forEach((item) => {
      const userId = getBazarUserId(item);

      if (!userId) return;

      if (!map[userId]) {
        map[userId] = {
          bazar: 0,
          received: 0,
          sent: 0,
          balance: 0,
        };
      }

      map[userId].bazar += parseMoney(item.amount);
    });

    monthAdjustments.forEach((item) => {
      const fromId = getAdjustmentFromId(item);
      const toId = getAdjustmentToId(item);
      const amount = parseMoney(item.amount);

      if (fromId) {
        if (!map[fromId]) {
          map[fromId] = {
            bazar: 0,
            received: 0,
            sent: 0,
            balance: 0,
          };
        }

        map[fromId].sent += amount;
      }

      if (toId) {
        if (!map[toId]) {
          map[toId] = {
            bazar: 0,
            received: 0,
            sent: 0,
            balance: 0,
          };
        }

        map[toId].received += amount;
      }
    });

    Object.keys(map).forEach((userId) => {
      map[userId].balance = map[userId].bazar + map[userId].received - map[userId].sent;
    });

    return map;
  }, [roomMembers, monthBazars, monthAdjustments]);

  const getMemberStats = useCallback((memberId) => {
    return (
      monthlyStats[memberId] || {
        bazar: 0,
        received: 0,
        sent: 0,
        balance: 0,
      }
    );
  }, [monthlyStats]);

  const filteredMembers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    if (!term) return roomMembers;

    return roomMembers.filter((member) => {
      const stats = getMemberStats(member.id);

      return [
        getMemberName(member),
        member.email,
        member.phone,
        member.room,
        formatBDT(stats.balance),
        stats.balance,
        formatBDT(stats.bazar),
        stats.bazar,
      ]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [roomMembers, searchTerm, getMemberStats]);

  const fromMember = useMemo(() => {
    return roomMembers.find((member) => member.id === form.fromMember) || null;
  }, [roomMembers, form.fromMember]);

  const toMember = useMemo(() => {
    return roomMembers.find((member) => member.id === form.toMember) || null;
  }, [roomMembers, form.toMember]);

  const amountNumber = parseMoney(form.amount);

  const fromStats = getMemberStats(form.fromMember);
  const toStats = getMemberStats(form.toMember);

  const fromBalance = fromStats.balance;
  const toBalance = toStats.balance;

  const newFromBalance = fromMember ? fromBalance - amountNumber : 0;
  const newToBalance = toMember ? toBalance + amountNumber : 0;

  const willGoNegative = Boolean(
    fromMember && amountNumber > 0 && newFromBalance < 0
  );

  const canReview =
    form.fromMember &&
    form.toMember &&
    form.fromMember !== form.toMember &&
    amountNumber > 0 &&
    form.reason.trim();

  function resetForm() {
    setStep('from');
    setSearchTerm('');
    setSuccessData(null);
    setForm({
      fromMember: '',
      toMember: '',
      amount: '',
      reason: '',
    });
  }

  function closeModal() {
    if (loading) return;

    setShowModal(false);

    setTimeout(resetForm, 180);
  }

  function goBack() {
    if (step === 'from') {
      closeModal();
      return;
    }

    if (step === 'to') setStep('from');
    if (step === 'amount') setStep('to');
    if (step === 'review') setStep('amount');
  }

  function goNext() {
    if (step === 'from') {
      if (!form.fromMember) {
        toast.error('যার থেকে টাকা কাটা হবে তাকে সিলেক্ট করুন');
        return;
      }

      setSearchTerm('');
      setStep('to');
      return;
    }

    if (step === 'to') {
      if (!form.toMember) {
        toast.error('যার অ্যাকাউন্টে টাকা যোগ হবে তাকে সিলেক্ট করুন');
        return;
      }

      if (form.fromMember === form.toMember) {
        toast.error('একই সদস্যকে From এবং To করা যাবে না');
        return;
      }

      setSearchTerm('');
      setStep('amount');
      return;
    }

    if (step === 'amount') {
      if (!amountNumber || amountNumber <= 0) {
        toast.error('সঠিক পরিমাণ দিন');
        return;
      }

      if (!form.reason.trim()) {
        toast.error('কারণ লিখুন');
        return;
      }

      setStep('review');
    }
  }

  async function handleTransfer() {
    if (!canReview) {
      toast.error('সব তথ্য পূরণ করুন');
      return;
    }

    try {
      setLoading(true);

      const amount = parseMoney(form.amount);
      const fromUserId = form.fromMember;
      const toUserId = form.toMember;
      const reason = form.reason.trim();

      const fromName = getMemberName(fromMember);
      const toName = getMemberName(toMember);

      const finalFromPreviousBalance = fromBalance;
      const finalToPreviousBalance = toBalance;
      const finalFromNewBalance = finalFromPreviousBalance - amount;
      const finalToNewBalance = finalToPreviousBalance + amount;
      const isNegative = finalFromNewBalance < 0;

      const adjustmentRef = await addDoc(collection(db, 'balanceAdjustments'), {
        fromMember: fromUserId,
        fromUserId,
        fromName,
        fromPreviousBalance: finalFromPreviousBalance,
        fromNewBalance: finalFromNewBalance,

        toMember: toUserId,
        toUserId,
        toName,
        toPreviousBalance: finalToPreviousBalance,
        toNewBalance: finalToNewBalance,

        amount,
        reason,
        month: selectedMonth,
        monthId: selectedMonth,
        type: 'nesthub_payment',
        status: 'completed',
        isDeleted: false,
        isNegativeBalance: isNegative,
        balanceMethod: 'month_wise_bazar_plus_transfer',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Data changes never notify automatically. This legacy delivery branch is
      // opt-in only; the Bazar workspace uses the review/confirm composer.
      if (notificationsEnabled) {
      const senderTitle = isNegative
        ? 'NestHub Payment Sent - Low Balance'
        : 'NestHub Payment Sent';

      const senderBody = isNegative
        ? `${fromName}, আপনার NestHub Wallet থেকে ${formatBDT(
            amount
          )} পাঠানো হয়েছে। গ্রহীতা: ${toName}। ${selectedMonth} মাসের বর্তমান ব্যালেন্স: ${formatBDT(
            finalFromNewBalance
          )}। আপনার ব্যালেন্স নেগেটিভ হয়েছে।`
        : `${fromName}, আপনার NestHub Wallet থেকে ${formatBDT(
            amount
          )} পাঠানো হয়েছে। গ্রহীতা: ${toName}। ${selectedMonth} মাসের বর্তমান ব্যালেন্স: ${formatBDT(
            finalFromNewBalance
          )}।`;

      const receiverTitle = 'NestHub Payment Received';

      const receiverBody = `${toName}, আপনার NestHub Wallet-এ ${formatBDT(
        amount
      )} যোগ হয়েছে। প্রেরক: ${fromName}। ${selectedMonth} মাসের বর্তমান ব্যালেন্স: ${formatBDT(
        finalToNewBalance
      )}।`;

      await Promise.all([
        createBalanceNotification({
          userId: fromUserId,
          title: senderTitle,
          body: senderBody,
          month: selectedMonth,
          amount,
          reason,
          fromName,
          toName,
          previousBalance: finalFromPreviousBalance,
          newBalance: finalFromNewBalance,
          direction: 'sent',
          isNegativeBalance: isNegative,
        }),

        createBalanceNotification({
          userId: toUserId,
          title: receiverTitle,
          body: receiverBody,
          month: selectedMonth,
          amount,
          reason,
          fromName,
          toName,
          previousBalance: finalToPreviousBalance,
          newBalance: finalToNewBalance,
          direction: 'received',
          isNegativeBalance: false,
        }),
      ]);

      await schedulePushNotification(() => Promise.all([
        sendPushToUser(fromUserId, {
          title: senderTitle,
          body: isNegative
            ? `আপনার ${selectedMonth} মাসের ব্যালেন্স থেকে ${formatBDT(
                amount
              )} পাঠানো হয়েছে। ব্যালেন্স নেগেটিভ হয়েছে।`
            : `আপনার ${selectedMonth} মাসের ব্যালেন্স থেকে ${formatBDT(
                amount
              )} পাঠানো হয়েছে। নতুন ব্যালেন্স: ${formatBDT(
                finalFromNewBalance
              )}`,
        }),

        sendPushToUser(toUserId, {
          title: receiverTitle,
          body: `আপনার ${selectedMonth} মাসের ব্যালেন্সে ${formatBDT(
            amount
          )} যোগ হয়েছে। নতুন ব্যালেন্স: ${formatBDT(finalToNewBalance)}`,
        }),
      ]));
      }

      const result = {
        id: adjustmentRef.id,
        fromUserId,
        toUserId,
        fromName,
        toName,
        amount,
        reason,
        month: selectedMonth,
        currentFromBalance: finalFromPreviousBalance,
        currentToBalance: finalToPreviousBalance,
        newFromBalance: finalFromNewBalance,
        newToBalance: finalToNewBalance,
        isNegative,
      };

      setSuccessData(result);

      toast.success(
        `NestHub Payment successful: ${fromName} → ${toName}`
      );

      if (onAdjust) {
        onAdjust();
      }
    } catch (error) {
      console.error('NestHub payment error:', error);
      toast.error(error.message || 'Payment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="w-full rounded-2xl px-4 py-4 text-white shadow-sm transition hover:shadow-md active:scale-[0.99]"
        style={{ backgroundColor: AGENT_BLUE }}
      >
        <div className="flex items-center gap-3">
          <NestHubLogo size="sm" />

          <div className="min-w-0 flex-1 text-left">
            <p className="text-[10px] font-black uppercase tracking-wide text-white/75">
              NestHub Agent
            </p>

            <p className="text-base font-black">
              NestHub Payment
            </p>

            <p className="mt-0.5 text-xs font-semibold text-white/80">
              Month-wise bazar balance transfer
            </p>
          </div>

          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
            <Send className="h-5 w-5" />
          </div>
        </div>
      </button>

      <AnimatePresence>
        {showModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-gray-950/60"
              onClick={closeModal}
            />

            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="fixed inset-0 z-50 flex items-end justify-center px-0 sm:items-center sm:px-4"
            >
              <div
                className="flex max-h-[96vh] w-full flex-col overflow-hidden rounded-t-[32px] bg-white shadow-2xl sm:max-w-md sm:rounded-[32px]"
                onClick={(event) => event.stopPropagation()}
              >
                <div
                  className="relative p-5 text-white"
                  style={{ backgroundColor: AGENT_BLUE }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <button
                      type="button"
                      onClick={goBack}
                      disabled={loading}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white disabled:opacity-50"
                    >
                      <ArrowLeft className="h-5 w-5" />
                    </button>

                    <div className="flex flex-1 flex-col items-center text-center">
                      <NestHubLogo size="lg" />

                      <h2 className="mt-3 text-xl font-black">
                        NestHub Payment
                      </h2>

                      <p className="mt-1 text-xs font-semibold text-white/80">
                        {selectedMonth} month-wise payment
                      </p>

                      <div className="mt-4">
                        <StepDots currentStep={step} />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={closeModal}
                      disabled={loading}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white disabled:opacity-50"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                  {successData ? (
                    <div className="py-6 text-center">
                      <div
                        className="mx-auto flex h-20 w-20 items-center justify-center rounded-full text-white"
                        style={{ backgroundColor: AGENT_BLUE }}
                      >
                        <CheckCircle2 className="h-10 w-10" />
                      </div>

                      <h3 className="mt-5 text-xl font-black text-gray-950">
                        Payment Successful
                      </h3>

                      <p className="mt-1 text-sm font-semibold text-gray-500">
                        Month-wise NestHub payment completed.
                      </p>

                      <div className="mt-5 space-y-2 rounded-3xl bg-gray-50 p-4 text-left">
                        <ReviewRow label="Month" value={successData.month} />
                        <ReviewRow label="From" value={successData.fromName} />
                        <ReviewRow label="To" value={successData.toName} />
                        <ReviewRow
                          label="Amount"
                          value={formatBDT(successData.amount)}
                          valueClass="text-blue-700"
                        />
                        <ReviewRow
                          label="Sender New Balance"
                          value={formatBDT(successData.newFromBalance)}
                          valueClass={
                            successData.newFromBalance < 0
                              ? 'text-red-600'
                              : 'text-gray-950'
                          }
                        />
                        <ReviewRow
                          label="Receiver New Balance"
                          value={formatBDT(successData.newToBalance)}
                          valueClass="text-blue-700"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={closeModal}
                        className="mt-5 w-full rounded-2xl py-3.5 text-sm font-black text-white transition"
                        style={{ backgroundColor: AGENT_BLUE }}
                      >
                        Done
                      </button>
                    </div>
                  ) : (
                    <>
                      {step === 'from' && (
                        <div>
                          <div className="mb-4">
                            <p className="text-[10px] font-black uppercase text-blue-600">
                              Step 1
                            </p>

                            <h3 className="mt-1 text-lg font-black text-gray-950">
                              টাকা কার কাছ থেকে কাটবেন?
                            </h3>

                            <p className="mt-1 text-xs font-semibold text-gray-500">
                              Showing {selectedMonth} month-wise bazar balance.
                            </p>
                          </div>

                          <div className="relative mb-4">
                            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                            <input
                              value={searchTerm}
                              onChange={(event) => setSearchTerm(event.target.value)}
                              placeholder="Search member, room, month balance..."
                              className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-11 pr-4 text-sm font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                            />
                          </div>

                          <div className="space-y-2">
                            {filteredMembers.map((member) => (
                              <MemberSelectCard
                                key={member.id}
                                member={member}
                                type="from"
                                selected={form.fromMember === member.id}
                                stats={getMemberStats(member.id)}
                                onClick={() => {
                                  setForm((old) => ({
                                    ...old,
                                    fromMember: member.id,
                                    toMember:
                                      old.toMember === member.id ? '' : old.toMember,
                                  }));
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {step === 'to' && (
                        <div>
                          <div className="mb-4">
                            <p className="text-[10px] font-black uppercase text-blue-600">
                              Step 2
                            </p>

                            <h3 className="mt-1 text-lg font-black text-gray-950">
                              টাকা কার অ্যাকাউন্টে যোগ হবে?
                            </h3>

                            <p className="mt-1 text-xs font-semibold text-gray-500">
                              Select receiver for {selectedMonth}.
                            </p>
                          </div>

                          <BalanceBreakdown
                            title={`From: ${getMemberName(fromMember)}`}
                            stats={fromStats}
                            afterBalance={fromBalance}
                          />

                          <div className="relative my-4">
                            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                            <input
                              value={searchTerm}
                              onChange={(event) => setSearchTerm(event.target.value)}
                              placeholder="Search receiver..."
                              className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-11 pr-4 text-sm font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                            />
                          </div>

                          <div className="space-y-2">
                            {filteredMembers.map((member) => (
                              <MemberSelectCard
                                key={member.id}
                                member={member}
                                type="to"
                                selected={form.toMember === member.id}
                                disabled={form.fromMember === member.id}
                                stats={getMemberStats(member.id)}
                                onClick={() => {
                                  setForm((old) => ({
                                    ...old,
                                    toMember: member.id,
                                  }));
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {step === 'amount' && (
                        <div>
                          <div className="mb-4">
                            <p className="text-[10px] font-black uppercase text-blue-600">
                              Step 3
                            </p>

                            <h3 className="mt-1 text-lg font-black text-gray-950">
                              কত টাকা পাঠাবেন?
                            </h3>

                            <p className="mt-1 text-xs font-semibold text-gray-500">
                              This payment will affect only {selectedMonth}.
                            </p>
                          </div>

                          <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                              <p className="text-[9px] font-black uppercase text-red-500">
                                From
                              </p>

                              <p className="mt-1 truncate text-sm font-black text-gray-950">
                                {getMemberName(fromMember)}
                              </p>

                              <p className="text-xs font-bold text-gray-500">
                                {formatBDT(fromBalance)}
                              </p>
                            </div>

                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50">
                              <ArrowRight className="h-5 w-5 text-blue-600" />
                            </div>

                            <div
                              className="rounded-2xl border p-3"
                              style={{
                                borderColor: '#BFDBFE',
                                backgroundColor: AGENT_BLUE_SOFT,
                              }}
                            >
                              <p className="text-[9px] font-black uppercase text-blue-600">
                                To
                              </p>

                              <p className="mt-1 truncate text-sm font-black text-gray-950">
                                {getMemberName(toMember)}
                              </p>

                              <p className="text-xs font-bold text-gray-500">
                                {formatBDT(toBalance)}
                              </p>
                            </div>
                          </div>

                          <div
                            className="mb-4 rounded-[28px] p-5 text-center text-white"
                            style={{ backgroundColor: AGENT_BLUE }}
                          >
                            <p className="text-[10px] font-black uppercase text-white/70">
                              Transfer Amount
                            </p>

                            <p className="mt-2 text-4xl font-black">
                              {form.amount ? formatBDT(amountNumber) : '৳০'}
                            </p>
                          </div>

                          <BalanceBreakdown
                            title="Receiver Balance Preview"
                            stats={toStats}
                            afterBalance={newToBalance}
                            amountPrefix={`+ ${formatPlainBDT(amountNumber)}`}
                          />

                          <div className="my-4 flex flex-wrap gap-2">
                            {QUICK_AMOUNTS.map((amount) => (
                              <button
                                key={amount}
                                type="button"
                                onClick={() =>
                                  setForm((old) => ({
                                    ...old,
                                    amount: String(amount),
                                  }))
                                }
                                className="rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-black text-blue-700 transition hover:bg-blue-100 active:scale-[0.97]"
                              >
                                {formatBDT(amount)}
                              </button>
                            ))}
                          </div>

                          <div className="mb-4">
                            <NumberPad
                              value={form.amount}
                              onChange={(value) =>
                                setForm((old) => ({ ...old, amount: value }))
                              }
                            />
                          </div>

                          <div>
                            <label className="text-xs font-black uppercase text-gray-500">
                              Reason
                            </label>

                            <input
                              type="text"
                              value={form.reason}
                              onChange={(event) =>
                                setForm((old) => ({
                                  ...old,
                                  reason: event.target.value,
                                }))
                              }
                              placeholder="Example: Bazar adjustment, due settlement..."
                              className="mt-1 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                            />
                          </div>

                          {willGoNegative && (
                            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
                              <div className="flex gap-3">
                                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />

                                <div>
                                  <p className="text-sm font-black text-red-700">
                                    Sender balance will be negative
                                  </p>

                                  <p className="mt-1 text-xs font-semibold leading-5 text-red-600">
                                    After this transfer, {getMemberName(fromMember)} {selectedMonth} balance will be{' '}
                                    {formatBDT(newFromBalance)}.
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {step === 'review' && (
                        <div>
                          <div className="mb-4 text-center">
                            <div
                              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full text-white"
                              style={{ backgroundColor: AGENT_BLUE }}
                            >
                              <ReceiptText className="h-8 w-8" />
                            </div>

                            <h3 className="mt-3 text-xl font-black text-gray-950">
                              Review Payment
                            </h3>

                            <p className="mt-1 text-xs font-semibold text-gray-500">
                              Check all month-wise details before confirming.
                            </p>
                          </div>

                          <div className="space-y-2">
                            <ReviewRow label="Month" value={selectedMonth} />
                            <ReviewRow label="From" value={getMemberName(fromMember)} />
                            <ReviewRow label="To" value={getMemberName(toMember)} />
                            <ReviewRow
                              label="Amount"
                              value={formatBDT(amountNumber)}
                              valueClass="text-blue-700"
                            />
                            <ReviewRow label="Reason" value={form.reason} />
                            <ReviewRow
                              label="Sender Balance Before"
                              value={formatBDT(fromBalance)}
                            />
                            <ReviewRow
                              label="Sender Balance After"
                              value={formatBDT(newFromBalance)}
                              valueClass={newFromBalance < 0 ? 'text-red-600' : 'text-gray-950'}
                            />
                            <ReviewRow
                              label="Receiver Balance Before"
                              value={formatBDT(toBalance)}
                            />
                            <ReviewRow
                              label="Receiver Balance After"
                              value={formatBDT(newToBalance)}
                              valueClass="text-blue-700"
                            />
                          </div>

                          <div
                            className="mt-4 rounded-2xl border p-4"
                            style={{
                              borderColor: '#BFDBFE',
                              backgroundColor: AGENT_BLUE_SOFT,
                            }}
                          >
                            <div className="flex gap-3">
                              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />

                              <p className="text-xs font-semibold leading-5 text-blue-700">
                                This payment will be saved under {selectedMonth}. Other months will not be changed.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {!successData && (
                  <div className="border-t border-gray-100 bg-white p-5">
                    {step === 'review' ? (
                      <button
                        type="button"
                        onClick={handleTransfer}
                        disabled={loading || !canReview}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-black text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                        style={{
                          backgroundColor: willGoNegative ? '#DC2626' : AGENT_BLUE,
                        }}
                      >
                        {loading ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <LockKeyhole className="h-5 w-5" />
                        )}

                        {loading
                          ? 'Processing Payment...'
                          : willGoNegative
                            ? 'Confirm With Negative Balance'
                            : 'Tap to Confirm Payment'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={goNext}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-black text-white transition"
                        style={{ backgroundColor: AGENT_BLUE }}
                      >
                        Continue
                        <ArrowRight className="h-5 w-5" />
                      </button>
                    )}

                    <div className="mt-3 flex items-center justify-center gap-2 text-[10px] font-bold text-gray-400">
                      <Smartphone className="h-3.5 w-3.5" />
                      NestHub Agent month-wise payment flow
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
