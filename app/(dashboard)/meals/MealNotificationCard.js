'use client'

import { Clock } from 'lucide-react';

function safeDate(value) {
  if (!value) return null;
  if (value?.toDate) return value.toDate();

  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return new Date(`${value}T00:00:00+06:00`);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mealNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Number(number.toFixed(2));
}

function formatMeal(value) {
  const number = mealNumber(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '৳0';
  return `৳${Math.round(number).toLocaleString()}`;
}

function moneyRate(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '৳0.00';

  return `৳${number.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatMealDate(dateValue) {
  const date = safeDate(dateValue);
  if (!date) return dateValue || 'Unknown date';

  return date.toLocaleDateString('en-US', {
    timeZone: 'Asia/Dhaka',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDhakaTime(dateValue) {
  const date = safeDate(dateValue);
  if (!date) return 'Unknown time';

  return date.toLocaleString('en-US', {
    timeZone: 'Asia/Dhaka',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortTime(dateValue) {
  const date = safeDate(dateValue);
  if (!date) return '';

  return date.toLocaleString('en-US', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getNotificationDate(notification) {
  return (
    safeDate(notification?.sentAt) ||
    safeDate(notification?.createdAt) ||
    safeDate(notification?.timestamp) ||
    safeDate(notification?.updatedAt) ||
    null
  );
}

function getNotificationText(notification) {
  const data = notification?.data || {};

  return [
    notification?.title,
    notification?.body,
    notification?.message,
    notification?.type,
    notification?.category,
    data.type,
    data.action,
    data.status,
  ]
    .join(' ')
    .toLowerCase();
}

function getNotificationType(notification) {
  const data = notification?.data || {};
  const rawType = String(
    data.type ||
      notification?.type ||
      notification?.category ||
      ''
  ).toLowerCase();

  const text = getNotificationText(notification);

  if (
    rawType === 'meal_payment' ||
    rawType === 'meal_payment_due' ||
    rawType === 'meal_payment_paid' ||
    rawType === 'meal_payment_advance' ||
    text.includes('meal payment') ||
    text.includes('payment summary') ||
    text.includes('payment due')
  ) {
    return 'payment';
  }

  if (
    rawType === 'meal_edited' ||
    rawType === 'meal_updated' ||
    text.includes('meal edited') ||
    text.includes('meal updated') ||
    text.includes('entry edited') ||
    text.includes('entry updated')
  ) {
    return 'edited';
  }

  return 'added';
}

function parseNumberFromText(text, patterns) {
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern);

    if (match?.[1]) {
      const number = Number(String(match[1]).replace(/,/g, ''));
      if (Number.isFinite(number)) return number;
    }
  }

  return 0;
}

function buildMealSnapshot(notification) {
  const data = notification?.data || {};
  const body = notification?.body || notification?.message || '';
  const type = getNotificationType(notification);

  const lunch = mealNumber(
    data.lunch ??
      notification?.lunch ??
      parseNumberFromText(body, [/lunch[:\s]+([0-9.]+)/i])
  );

  const dinner = mealNumber(
    data.dinner ??
      notification?.dinner ??
      parseNumberFromText(body, [/dinner[:\s]+([0-9.]+)/i])
  );

  const guestMeal = mealNumber(
    data.guestMeal ??
      notification?.guestMeal ??
      parseNumberFromText(body, [/guest(?:\s*meal)?[:\s]+([0-9.]+)/i])
  );

  const totalMeal =
    mealNumber(data.totalMeal ?? notification?.totalMeal) ||
    mealNumber(lunch + dinner + guestMeal);

  const mealRate = mealNumber(
    data.mealRateSnapshot ??
      data.mealRate ??
      notification?.mealRateSnapshot ??
      notification?.mealRate ??
      parseNumberFromText(body, [/meal rate[:\s]+৳?\s*([0-9,.]+)/i])
  );

  const entryCost =
    Number(data.entryCostSnapshot ?? data.entryCost ?? notification?.entryCostSnapshot) ||
    totalMeal * mealRate;

  const overallMeals = mealNumber(
    data.overallMealsSnapshot ??
      data.overallMeals ??
      notification?.overallMealsSnapshot ??
      notification?.overallMeals
  );

  const totalBazar =
    Number(data.totalBazarSnapshot ?? data.totalBazar ?? notification?.totalBazarSnapshot) ||
    0;

  const mealDate =
    data.date ||
    data.mealDate ||
    notification?.date ||
    notification?.mealDate ||
    '';

  const reason =
    data.reason ||
    notification?.reason ||
    data.notes ||
    notification?.notes ||
    (type === 'edited'
      ? 'Meal entry was updated.'
      : 'Meal entry was recorded.');

  const title =
    notification?.title ||
    (type === 'edited'
      ? 'NestHub - Meal Edited'
      : 'NestHub - Meal Added');

  const defaultBody =
    type === 'edited'
      ? `Your meal entry has been updated.\nLunch: ${formatMeal(lunch)}\nDinner: ${formatMeal(dinner)}\nGuest: ${formatMeal(guestMeal)}\nTotal: ${formatMeal(totalMeal)}`
      : `Your meal entry has been added.\nLunch: ${formatMeal(lunch)}\nDinner: ${formatMeal(dinner)}\nGuest: ${formatMeal(guestMeal)}\nTotal: ${formatMeal(totalMeal)}`;

  return {
    type,
    title,
    body: body || defaultBody,
    lunch,
    dinner,
    guestMeal,
    totalMeal,
    mealRate,
    entryCost,
    overallMeals,
    totalBazar,
    mealDate,
    reason,
  };
}

function buildPaymentSnapshot(notification) {
  const data = notification?.data || {};
  const body = notification?.body || notification?.message || '';

  const status = String(
    data.status ||
      notification?.status ||
      ''
  ).toLowerCase();

  const givenAmount =
    Number(data.givenAmount ?? data.paidAmount ?? data.paid ?? notification?.givenAmount) ||
    parseNumberFromText(body, [/given amount[:\s]+৳?\s*([0-9,.]+)/i]);

  const mealsTaken =
    mealNumber(data.mealsTaken ?? data.userMeal ?? notification?.mealsTaken) ||
    parseNumberFromText(body, [/meals taken[:\s]+([0-9.]+)/i]);

  const mealRate =
    mealNumber(data.mealRateSnapshot ?? data.mealRate ?? notification?.mealRate) ||
    parseNumberFromText(body, [/meal rate[:\s]+৳?\s*([0-9,.]+)/i]);

  const mealCost =
    Number(data.mealCostSnapshot ?? data.mealCost ?? data.payable ?? notification?.mealCost) ||
    parseNumberFromText(body, [/meal cost[:\s]+৳?\s*([0-9,.]+)/i]) ||
    parseNumberFromText(body, [/cost[:\s]+৳?\s*([0-9,.]+)/i]);

  const due =
    Number(data.due ?? data.dueAmount ?? notification?.due) ||
    parseNumberFromText(body, [/pending due[:\s]+৳?\s*([0-9,.]+)/i]);

  const advance =
    Number(data.advance ?? data.advanceAmount ?? notification?.advance) || 0;

  let statusLabel = 'Summary';

  if (status.includes('due') || due > 0 || body.toLowerCase().includes('pending due')) {
    statusLabel = 'Due';
  } else if (status.includes('advance') || advance > 0) {
    statusLabel = 'Advance';
  } else if (status.includes('paid')) {
    statusLabel = 'Paid';
  }

  return {
    title: notification?.title || 'NestHub - Meal Payment Summary',
    body,
    status,
    statusLabel,
    givenAmount,
    mealsTaken,
    mealRate,
    mealCost,
    due,
    advance,
  };
}

export default function MealNotificationCard({
  notification,
  onOpen,
  onMarkRead,
}) {
  const sentDate = getNotificationDate(notification);
  const notificationType = getNotificationType(notification);

  const mealSnapshot = buildMealSnapshot(notification);
  const paymentSnapshot = buildPaymentSnapshot(notification);

  const isPayment = notificationType === 'payment';
  const isEdited = notificationType === 'edited';

  const paymentStatusClass =
    paymentSnapshot.statusLabel === 'Paid'
      ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
      : paymentSnapshot.statusLabel === 'Advance'
        ? 'border-blue-100 bg-blue-50 text-blue-700'
        : paymentSnapshot.statusLabel === 'Due'
          ? 'border-red-100 bg-red-50 text-red-700'
          : 'border-gray-100 bg-gray-50 text-gray-700';

  const paymentBadgeClass =
    paymentSnapshot.statusLabel === 'Paid'
      ? 'bg-emerald-600 text-white'
      : paymentSnapshot.statusLabel === 'Advance'
        ? 'bg-blue-600 text-white'
        : paymentSnapshot.statusLabel === 'Due'
          ? 'bg-red-600 text-white'
          : 'bg-gray-700 text-white';

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen?.();
      }}
      className="flex cursor-pointer gap-2.5 rounded-2xl p-1 transition hover:bg-gray-50"
    >
      <div
        className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base text-white shadow-sm ${
          isPayment ? 'bg-red-500' : isEdited ? 'bg-blue-500' : 'bg-orange-500'
        }`}
      >
        {isPayment ? '💳' : isEdited ? '✏️' : '🍽️'}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-xs font-black text-gray-900">
            {isPayment ? 'Payment Message' : isEdited ? 'Meal Edited' : 'Meal Added'}
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

        {isPayment ? (
          <div
            className={`rounded-[22px] rounded-tl-md border px-3 py-3 shadow-sm ${paymentStatusClass}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wide opacity-70">
                  Meal Payment Summary
                </p>

                <h3 className="mt-1 text-sm font-black">
                  {paymentSnapshot.title}
                </h3>
              </div>

              <span
                className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${paymentBadgeClass}`}
              >
                {paymentSnapshot.statusLabel}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-white/80 px-3 py-2">
                <p className="text-[8px] font-black uppercase opacity-60">
                  Given Amount
                </p>
                <p className="text-sm font-black">
                  {money(paymentSnapshot.givenAmount)}
                </p>
              </div>

              <div className="rounded-2xl bg-white/80 px-3 py-2">
                <p className="text-[8px] font-black uppercase opacity-60">
                  Meals Taken
                </p>
                <p className="text-sm font-black">
                  {formatMeal(paymentSnapshot.mealsTaken)}
                </p>
              </div>

              <div className="rounded-2xl bg-white/80 px-3 py-2">
                <p className="text-[8px] font-black uppercase opacity-60">
                  Meal Rate
                </p>
                <p className="text-sm font-black">
                  {moneyRate(paymentSnapshot.mealRate)}/meal
                </p>
              </div>

              <div className="rounded-2xl bg-white/80 px-3 py-2">
                <p className="text-[8px] font-black uppercase opacity-60">
                  Meal Cost
                </p>
                <p className="text-sm font-black">
                  {money(paymentSnapshot.mealCost)}
                </p>
              </div>
            </div>

            <div className="mt-3 rounded-2xl bg-white/80 px-3 py-2">
              <p className="text-[9px] font-black uppercase opacity-60">
                Balance
              </p>

              <p className="mt-1 text-sm font-black">
                {paymentSnapshot.statusLabel === 'Due'
                  ? `Pending Due: ${money(paymentSnapshot.due)}`
                  : paymentSnapshot.statusLabel === 'Advance'
                    ? `Advance: ${money(paymentSnapshot.advance)}`
                    : paymentSnapshot.statusLabel === 'Paid'
                      ? 'Fully Paid'
                      : 'Payment summary'}
              </p>
            </div>

            <p className="mt-3 whitespace-pre-line text-xs leading-5 opacity-80">
              {paymentSnapshot.body || 'Meal payment notification sent by admin.'}
            </p>

            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 text-[10px] font-bold opacity-60">
                <Clock className="h-3 w-3" />
                Sent {formatDhakaTime(sentDate)}
              </div>

              {!notification.read && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onMarkRead?.();
                  }}
                  className="rounded-full bg-white px-3 py-1.5 text-[10px] font-black text-gray-700"
                >
                  Mark read
                </button>
              )}
            </div>
          </div>
        ) : (
          <div
            className={`rounded-[22px] rounded-tl-md border px-3 py-3 shadow-sm ${
              isEdited
                ? 'border-blue-100 bg-blue-50'
                : 'border-orange-100 bg-orange-50'
            }`}
          >
            <p
              className={`text-[10px] font-black uppercase tracking-wide ${
                isEdited ? 'text-blue-600' : 'text-orange-600'
              }`}
            >
              {isEdited ? 'Meal Entry Edited' : 'Meal Entry Added'}
            </p>

            <div className="mt-2 flex flex-wrap gap-1.5">
              <span
                className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase text-white ${
                  isEdited ? 'bg-blue-600' : 'bg-orange-600'
                }`}
              >
                Total {formatMeal(mealSnapshot.totalMeal)}
              </span>

              {mealSnapshot.mealDate && (
                <span className="rounded-full bg-white/80 px-2.5 py-1 text-[9px] font-black uppercase text-gray-500">
                  {formatMealDate(mealSnapshot.mealDate)}
                </span>
              )}

              <span className="rounded-full bg-white/80 px-2.5 py-1 text-[9px] font-black uppercase text-gray-500">
                Snapshot Saved
              </span>
            </div>

            <h3
              className={`mt-2 text-sm font-black ${
                isEdited ? 'text-blue-800' : 'text-orange-800'
              }`}
            >
              {mealSnapshot.title}
            </h3>

            <div className="mt-3 grid grid-cols-3 gap-1.5">
              <div className="rounded-2xl bg-white px-2 py-2">
                <p className="text-[8px] font-black uppercase text-orange-500">
                  Lunch
                </p>
                <p className="text-xs font-black text-orange-800">
                  {formatMeal(mealSnapshot.lunch)}
                </p>
              </div>

              <div className="rounded-2xl bg-white px-2 py-2">
                <p className="text-[8px] font-black uppercase text-blue-500">
                  Dinner
                </p>
                <p className="text-xs font-black text-blue-800">
                  {formatMeal(mealSnapshot.dinner)}
                </p>
              </div>

              <div className="rounded-2xl bg-white px-2 py-2">
                <p className="text-[8px] font-black uppercase text-purple-500">
                  Guest
                </p>
                <p className="text-xs font-black text-purple-800">
                  {formatMeal(mealSnapshot.guestMeal)}
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <div className="rounded-2xl bg-white/80 px-3 py-2">
                <p className="text-[8px] font-black uppercase text-gray-400">
                  Meal Rate Then
                </p>
                <p className="text-xs font-black text-gray-800">
                  {moneyRate(mealSnapshot.mealRate)}/meal
                </p>
              </div>

              <div className="rounded-2xl bg-white/80 px-3 py-2">
                <p className="text-[8px] font-black uppercase text-gray-400">
                  Entry Cost Then
                </p>
                <p className="text-xs font-black text-gray-800">
                  {money(mealSnapshot.entryCost)}
                </p>
              </div>
            </div>

            {(mealSnapshot.overallMeals > 0 || mealSnapshot.totalBazar > 0) && (
              <div className="mt-3 rounded-2xl bg-white/70 px-3 py-2">
                <p className="text-[9px] font-black uppercase text-gray-400">
                  Snapshot Formula
                </p>

                <p className="mt-1 text-xs font-bold leading-5 text-gray-700">
                  Total Bazar {money(mealSnapshot.totalBazar)} ÷ Overall Meals{' '}
                  {formatMeal(mealSnapshot.overallMeals)} ={' '}
                  {moneyRate(mealSnapshot.mealRate)}
                </p>
              </div>
            )}

            <div className="mt-3 rounded-2xl bg-white/80 px-3 py-2">
              <p className="text-[9px] font-black uppercase text-gray-400">
                Reason
              </p>

              <p className="mt-1 text-xs font-bold text-gray-700">
                {mealSnapshot.reason}
              </p>
            </div>

            <p className="mt-3 whitespace-pre-line text-xs leading-5 text-gray-800">
              {mealSnapshot.body}
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
                    onMarkRead?.();
                  }}
                  className="rounded-full bg-white px-3 py-1.5 text-[10px] font-black text-gray-700"
                >
                  Mark read
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}