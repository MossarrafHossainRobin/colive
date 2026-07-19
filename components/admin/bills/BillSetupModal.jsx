'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calculator,
  Home,
  Save,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { saveMonthlySetup } from '@/lib/billFirestore';
import {
  calculateMonthlySetup,
  makeUtilityInputDefaults,
  toNumber,
} from '@/lib/billCalculations';
import { sendAdminChatUpdate } from '@/lib/adminChatMessage';
import { isMemberAccountActive } from '@/lib/memberPolicy';

function cleanAmount(value) {
  return String(value || '').replace(/[^\d]/g, '');
}

function formatMoney(value) {
  return `৳${Math.ceil(toNumber(value)).toLocaleString()}`;
}

function isEligibleMember(member) {
  return isMemberAccountActive(member) && Boolean(member?.room);
}

function getMemberId(member) {
  return member?.uid || member?.id || member?.userId || '';
}

function getMemberName(member) {
  return (
    member?.displayName ||
    member?.name ||
    member?.fullName ||
    member?.email?.split('@')[0] ||
    'Member'
  );
}

function makeSafeDocId(value) {
  return String(value || '')
    .trim()
    .replace(/[^\w.-]/g, '_');
}

function buildIndividualUtilityDistribution({ monthId, members, utilityInputs }) {
  const utilityMembers = members.length || 1;

  const utilityItems = Object.entries(utilityInputs)
    .map(([type, item]) => {
      const totalAmount = Math.ceil(toNumber(item?.amount));

      return {
        type,
        label:
          item?.label ||
          String(type)
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (char) => char.toUpperCase()),
        totalAmount,
      };
    })
    .filter((item) => item.totalAmount > 0);

  const totalUtilityCost = utilityItems.reduce(
    (sum, item) => sum + toNumber(item.totalAmount),
    0
  );

  const utilityShare = Math.ceil(totalUtilityCost / utilityMembers);

  const distributedItems = utilityItems.map((item) => ({
    ...item,
    rawShare: item.totalAmount / utilityMembers,
    shareAmount: Math.round(item.totalAmount / utilityMembers),
  }));

  const currentShareTotal = distributedItems.reduce(
    (sum, item) => sum + toNumber(item.shareAmount),
    0
  );

  const difference = utilityShare - currentShareTotal;

  if (distributedItems.length > 0 && difference !== 0) {
    distributedItems[distributedItems.length - 1].shareAmount += difference;
  }

  const finalItems = distributedItems.map((item) => ({
    ...item,
    paidAmount: 0,
    dueAmount: item.shareAmount,
    status: item.shareAmount > 0 ? 'pending' : 'paid',
  }));

  const userDocuments = members
    .map((member) => {
      const userId = getMemberId(member);

      if (!userId) return null;

      const totalUserUtility = finalItems.reduce(
        (sum, item) => sum + toNumber(item.shareAmount),
        0
      );

      return {
        docId: `${makeSafeDocId(monthId)}_${makeSafeDocId(userId)}`,
        data: {
          monthId,
          userId,
          userName: getMemberName(member),
          userEmail: member?.email || '',
          room: member?.room || '',
          photoURL: member?.photoURL || member?.photo || '',

          utilityMembers,
          totalUtilityCost,
          utilityShare: totalUserUtility,

          utilityItems: finalItems,

          totalPayable: totalUserUtility,
          paidAmount: 0,
          dueAmount: totalUserUtility,
          status: totalUserUtility > 0 ? 'pending' : 'paid',

          source: 'admin_monthly_setup_modal',
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
      };
    })
    .filter(Boolean);

  return {
    utilityMembers,
    totalUtilityCost,
    utilityShare,
    utilityItems: finalItems,
    userDocuments,
  };
}

async function saveIndividualUserUtilityDistribution({
  monthId,
  members,
  utilityInputs,
}) {
  const distribution = buildIndividualUtilityDistribution({
    monthId,
    members,
    utilityInputs,
  });

  const batch = writeBatch(db);

  distribution.userDocuments.forEach(({ docId, data }) => {
    batch.set(doc(db, 'individualUserUtility', docId), data, { merge: true });
  });

  batch.set(
    doc(db, 'individualUserUtility', `${makeSafeDocId(monthId)}_summary`),
    {
      type: 'monthly_summary',
      monthId,
      utilityMembers: distribution.utilityMembers,
      totalUtilityCost: distribution.totalUtilityCost,
      utilityShare: distribution.utilityShare,
      utilityItems: distribution.utilityItems,
      totalUsers: distribution.userDocuments.length,
      source: 'admin_monthly_setup_modal',
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  await batch.commit();

  return distribution;
}

export default function BillSetupModal({
  open,
  onClose,
  monthId,
  members = [],
  rooms = [],
  existingSetup,
}) {
  const [rentByRoom, setRentByRoom] = useState({});
  const [utilityInputs, setUtilityInputs] = useState(makeUtilityInputDefaults());
  const [saving, setSaving] = useState(false);

  const eligibleMembers = useMemo(() => {
    return members.filter(isEligibleMember);
  }, [members]);

  const roomsWithMembers = useMemo(() => {
    const roomMap = new Map();

    eligibleMembers.forEach((member) => {
      const room = member.room;
      if (!room) return;

      if (!roomMap.has(room)) {
        roomMap.set(room, {
          room,
          count: 0,
        });
      }

      roomMap.get(room).count += 1;
    });

    return Array.from(roomMap.values()).sort((a, b) =>
      String(a.room).localeCompare(String(b.room))
    );
  }, [eligibleMembers]);

  const totalRoomRentInput = useMemo(() => {
    return Object.values(rentByRoom).reduce((sum, value) => sum + toNumber(value), 0);
  }, [rentByRoom]);

  const totalUtilityInput = useMemo(() => {
    return Object.values(utilityInputs).reduce(
      (sum, item) => sum + toNumber(item.amount),
      0
    );
  }, [utilityInputs]);

  const individualUtilityPreview = useMemo(() => {
    return buildIndividualUtilityDistribution({
      monthId,
      members: eligibleMembers,
      utilityInputs,
    });
  }, [monthId, eligibleMembers, utilityInputs]);

  useEffect(() => {
    if (!open) return;

    const nextRentByRoom = {};

    roomsWithMembers.forEach(({ room }) => {
      nextRentByRoom[room] = existingSetup?.rentByRoom?.[room] ?? '';
    });

    setRentByRoom(nextRentByRoom);
    setUtilityInputs(makeUtilityInputDefaults(existingSetup?.utilityBreakdown || []));
  }, [open, monthId, roomsWithMembers, existingSetup]);

  const preview = useMemo(() => {
    return calculateMonthlySetup({
      members: eligibleMembers,
      rentByRoom,
      utilityInputs,
      monthId,
    });
  }, [eligibleMembers, rentByRoom, utilityInputs, monthId]);

  if (!open) return null;

  async function handleSave() {
    if (eligibleMembers.length === 0) {
      toast.error('No active room-assigned members found.');
      return;
    }

    try {
      setSaving(true);

      await saveMonthlySetup({
        monthId,
        members: eligibleMembers,
        rentByRoom,
        utilityInputs,
      });

      const distribution = await saveIndividualUserUtilityDistribution({
        monthId,
        members: eligibleMembers,
        utilityInputs,
      });

      await Promise.all(
        distribution.userDocuments.map(({ data }) => {
          const member = eligibleMembers.find(
            (item) => getMemberId(item) === data.userId
          );

          return sendAdminChatUpdate({
            member,
            category: 'bill',
            title: `Bill updated for ${monthId}`,
            summary: 'Your monthly bill information has been updated.',
            fields: [
              { label: 'Month', value: monthId },
              { label: 'Room', value: data.room },
              {
                label: 'Utility amount',
                value: `Tk ${Number(data.utilityShare || 0).toLocaleString('en-US')}`,
              },
              {
                label: 'Amount due',
                value: `Tk ${Number(data.dueAmount || 0).toLocaleString('en-US')}`,
              },
              { label: 'Status', value: data.status },
            ],
            details: data,
            notify: true,
          }).catch((error) => console.error('Bill chat update failed:', error));
        })
      );

      toast.success(
        `Monthly setup saved. Utility distributed to ${distribution.userDocuments.length} users.`
      );

      onClose();
    } catch (error) {
      toast.error(error.message || 'Failed to save bill setup.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-gray-950/60 px-0 sm:items-center sm:px-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-5xl sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-gray-100 bg-white px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-green-700">
                <Calculator className="h-3.5 w-3.5" />
                Monthly Setup
              </div>

              <h2 className="mt-2 text-xl font-black text-gray-950 sm:text-2xl">
                Bill Setup for {monthId}
              </h2>

              <p className="mt-1 text-xs font-medium text-gray-500 sm:text-sm">
                Rent is divided by room. Utility is divided among active members who have a room assigned.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-gray-200 bg-white p-2 text-gray-600 transition hover:bg-gray-50"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-gray-500">
                <Users className="h-3.5 w-3.5" />
                Members
              </div>

              <p className="mt-1 text-lg font-black text-gray-950">
                {eligibleMembers.length}
              </p>
            </div>

            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-blue-600">
                <Home className="h-3.5 w-3.5" />
                Room Rent
              </div>

              <p className="mt-1 text-lg font-black text-blue-700">
                {formatMoney(totalRoomRentInput)}
              </p>
            </div>

            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-amber-600">
                <Zap className="h-3.5 w-3.5" />
                Utility
              </div>

              <p className="mt-1 text-lg font-black text-amber-700">
                {formatMoney(totalUtilityInput)}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-gray-50 px-4 py-4 sm:px-6 sm:py-6">
          <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
            <section className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-black text-gray-950">
                    <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                      <Home className="h-4 w-4" />
                    </span>
                    Room Rent
                  </h3>

                  <p className="mt-1 text-xs text-gray-500">
                    Each room rent is divided only among members of that room.
                  </p>
                </div>
              </div>

              {roomsWithMembers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-red-200 bg-red-50 p-4">
                  <div className="flex gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />

                    <div>
                      <p className="text-sm font-black text-red-700">
                        No active room found
                      </p>

                      <p className="mt-1 text-xs text-red-600">
                        Add active members and assign room names first.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {roomsWithMembers.map(({ room, count }) => {
                    const roomTotal = toNumber(rentByRoom[room]);
                    const perMember = count > 0 ? Math.ceil(roomTotal / count) : 0;

                    return (
                      <div
                        key={room}
                        className="rounded-2xl border border-gray-200 bg-gray-50 p-3"
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-black text-gray-900">
                              {room}
                            </p>

                            <p className="text-[11px] font-medium text-gray-500">
                              {count} member{count > 1 ? 's' : ''}
                            </p>
                          </div>

                          <div className="rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-black text-blue-700">
                            Per member: {formatMoney(perMember)}
                          </div>
                        </div>

                        <input
                          type="text"
                          inputMode="numeric"
                          value={rentByRoom[room] ?? ''}
                          onChange={(event) =>
                            setRentByRoom((old) => ({
                              ...old,
                              [room]: cleanAmount(event.target.value),
                            }))
                          }
                          onWheel={(event) => event.currentTarget.blur()}
                          placeholder="Enter total room rent"
                          className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-black text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4">
                <h3 className="flex items-center gap-2 text-base font-black text-gray-950">
                  <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
                    <Zap className="h-4 w-4" />
                  </span>
                  Utility Breakdown
                </h3>

                <p className="mt-1 text-xs text-gray-500">
                  Each utility type is stored separately for every user.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(utilityInputs).map(([type, item]) => (
                  <label
                    key={type}
                    className="rounded-2xl border border-gray-200 bg-gray-50 p-3"
                  >
                    <span className="text-xs font-black text-gray-700">
                      {item.label}
                    </span>

                    <input
                      type="text"
                      inputMode="numeric"
                      value={item.amount ?? ''}
                      onChange={(event) =>
                        setUtilityInputs((old) => ({
                          ...old,
                          [type]: {
                            ...old[type],
                            amount: cleanAmount(event.target.value),
                          },
                        }))
                      }
                      onWheel={(event) => event.currentTarget.blur()}
                      placeholder="Total cost"
                      className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-black text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
                    />
                  </label>
                ))}
              </div>
            </section>
          </div>

          <section className="mt-5 rounded-3xl border border-green-200 bg-green-50 p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-green-100 text-green-700">
                <Calculator className="h-4 w-4" />
              </div>

              <div>
                <h3 className="text-sm font-black text-green-900">
                  Live Calculation Preview
                </h3>

                <p className="text-xs text-green-700">
                  Preview updates instantly and will be saved user-wise.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-2xl bg-white p-3">
                <p className="text-[10px] font-black uppercase text-gray-500">
                  Total Utility
                </p>

                <p className="mt-1 text-lg font-black text-amber-700">
                  {formatMoney(individualUtilityPreview.totalUtilityCost)}
                </p>
              </div>

              <div className="rounded-2xl bg-white p-3">
                <p className="text-[10px] font-black uppercase text-gray-500">
                  Utility Members
                </p>

                <p className="mt-1 text-lg font-black text-gray-950">
                  {individualUtilityPreview.utilityMembers}
                </p>
              </div>

              <div className="rounded-2xl bg-white p-3">
                <p className="text-[10px] font-black uppercase text-gray-500">
                  Utility Per User
                </p>

                <p className="mt-1 text-lg font-black text-green-700">
                  {formatMoney(individualUtilityPreview.utilityShare)}
                </p>
              </div>

              <div className="rounded-2xl bg-white p-3">
                <p className="text-[10px] font-black uppercase text-gray-500">
                  User Docs
                </p>

                <p className="mt-1 text-lg font-black text-blue-700">
                  {individualUtilityPreview.userDocuments.length}
                </p>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-green-200 bg-white">
              <div className="grid grid-cols-[1fr_90px_90px] gap-2 border-b border-green-100 bg-green-50 px-3 py-2 text-[10px] font-black uppercase text-green-800">
                <div>Utility Type</div>
                <div className="text-right">Total</div>
                <div className="text-right">Per User</div>
              </div>

              {individualUtilityPreview.utilityItems.length > 0 ? (
                individualUtilityPreview.utilityItems.map((item) => (
                  <div
                    key={item.type}
                    className="grid grid-cols-[1fr_90px_90px] gap-2 border-b border-gray-100 px-3 py-2 last:border-b-0"
                  >
                    <div className="text-xs font-black text-gray-800">
                      {item.label}
                    </div>

                    <div className="text-right text-xs font-black text-gray-700">
                      {formatMoney(item.totalAmount)}
                    </div>

                    <div className="text-right text-xs font-black text-green-700">
                      {formatMoney(item.shareAmount)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-3 py-4 text-center text-xs font-bold text-gray-400">
                  No utility amount added yet.
                </div>
              )}
            </div>

            <div className="mt-3 rounded-2xl border border-green-200 bg-white px-3 py-2 text-xs text-green-800">
              <b>Saved collection:</b> individualUserUtility • one document per user per month.
            </div>
          </section>
        </div>

        <div className="border-t border-gray-100 bg-white p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-gray-200 bg-white py-3 text-sm font-black text-gray-700 transition hover:bg-gray-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || eligibleMembers.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-green-600 py-3 text-sm font-black text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Month'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
