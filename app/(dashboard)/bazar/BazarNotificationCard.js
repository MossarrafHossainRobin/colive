'use client';

import {
  Bell,
  CheckCircle,
  Clock,
  MapPin,
  ShoppingCart,
  WalletCards,
} from 'lucide-react';

function safeDate(value) {
  if (!value) return null;

  if (value?.toDate) return value.toDate();

  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return new Date(`${value}T00:00:00+06:00`);
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function money(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return '৳0';

  return `৳${Math.round(Math.abs(number)).toLocaleString()}`;
}

function moneySigned(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return '৳0';

  if (number < 0) {
    return `+৳${Math.round(Math.abs(number)).toLocaleString()}`;
  }

  return `৳${Math.round(number).toLocaleString()}`;
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

function formatFullTime(dateValue) {
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

function formatDate(dateValue) {
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

function getMonthName(value) {
  if (!value) return '';

  const text = String(value);

  if (/^\d{4}-\d{2}$/.test(text)) {
    const [year, month] = text.split('-').map(Number);
    const date = new Date(year, month - 1, 1);

    return date.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  }

  return text;
}

function sanitizeText(text) {
  return String(text || '')
    .replace(/database/gi, 'record')
    .replace(/firestore/gi, 'record')
    .replace(/snapshot/gi, 'record')
    .replace(/admin/gi, 'team')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

function getNotificationKind(notification) {
  const data = notification?.data || {};

  const rawType = String(
    data.type ||
      data.action ||
      notification?.type ||
      notification?.category ||
      ''
  ).toLowerCase();

  const title = String(notification?.title || '').toLowerCase();
  const body = String(notification?.body || notification?.message || '').toLowerCase();

  if (
    rawType.includes('balance') ||
    title.includes('balance') ||
    body.includes('balance adjustment') ||
    body.includes('advance')
  ) {
    return 'balance';
  }

  return 'bazar';
}

function getStatus(notification) {
  const data = notification?.data || {};
  const rawStatus = String(data.status || notification?.status || '').toLowerCase();

  const total = Number(data.totalPayable || data.total || data.amount || 0);
  const paid = Number(data.paidAmount || data.paid || 0);
  const balance = Number(data.balance || data.due || data.dueAmount || 0);
  const advance = Number(data.advance || data.advanceAmount || 0);

  if (rawStatus.includes('advance') || advance > 0 || balance < 0) return 'advance';
  if (rawStatus.includes('paid') || (total > 0 && paid >= total && balance === 0)) return 'paid';
  if (rawStatus.includes('partial')) return 'partial';
  if (rawStatus.includes('due') || balance > 0) return 'due';

  return 'recorded';
}

function statusDesign(status, kind) {
  if (kind === 'bazar') {
    return {
      label: 'Bazar Added',
      badge: 'Bazar',
      icon: '🛒',
      avatar: 'bg-emerald-600',
      bubble: 'border-emerald-100 bg-emerald-50',
      badgeClass: 'bg-emerald-600 text-white',
      titleClass: 'text-emerald-800',
    };
  }

  if (status === 'paid') {
    return {
      label: 'Paid',
      badge: 'Paid',
      icon: '✅',
      avatar: 'bg-emerald-600',
      bubble: 'border-emerald-100 bg-emerald-50',
      badgeClass: 'bg-emerald-600 text-white',
      titleClass: 'text-emerald-800',
    };
  }

  if (status === 'advance') {
    return {
      label: 'Advance',
      badge: 'Advance',
      icon: '📈',
      avatar: 'bg-purple-600',
      bubble: 'border-purple-100 bg-purple-50',
      badgeClass: 'bg-purple-600 text-white',
      titleClass: 'text-purple-800',
    };
  }

  if (status === 'partial') {
    return {
      label: 'Partially Paid',
      badge: 'Partial',
      icon: '⚠️',
      avatar: 'bg-blue-600',
      bubble: 'border-blue-100 bg-blue-50',
      badgeClass: 'bg-blue-600 text-white',
      titleClass: 'text-blue-800',
    };
  }

  if (status === 'due') {
    return {
      label: 'Due',
      badge: 'Due',
      icon: '⏰',
      avatar: 'bg-amber-600',
      bubble: 'border-amber-100 bg-amber-50',
      badgeClass: 'bg-amber-600 text-white',
      titleClass: 'text-amber-800',
    };
  }

  return {
    label: 'Balance Update',
    badge: 'Update',
    icon: '💰',
    avatar: 'bg-violet-600',
    bubble: 'border-violet-100 bg-violet-50',
    badgeClass: 'bg-violet-600 text-white',
    titleClass: 'text-violet-800',
  };
}

function getItems(data) {
  if (Array.isArray(data.items)) return data.items;

  if (typeof data.items === 'string') {
    return data.items
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function buildDetails(notification) {
  const data = notification?.data || {};
  const body = sanitizeText(notification?.body || notification?.message || '');

  const kind = getNotificationKind(notification);
  const status = getStatus(notification);

  const amount =
    Number(data.amount || data.totalAmount || data.bazarAmount || notification?.amount || 0) ||
    0;

  const totalPayable =
    Number(data.totalPayable || data.total || data.payable || data.amount || 0) || amount;

  const paidAmount = Number(data.paidAmount || data.paid || 0) || 0;
  const balance = Number(data.balance || data.due || data.dueAmount || 0) || 0;
  const advance = Number(data.advance || data.advanceAmount || 0) || 0;

  const place =
    data.place ||
    data.market ||
    data.location ||
    notification?.place ||
    notification?.location ||
    '';

  const date =
    data.date ||
    data.bazarDate ||
    notification?.date ||
    notification?.bazarDate ||
    '';

  const month =
    getMonthName(data.monthId || data.month || notification?.monthId || notification?.month) ||
    (date ? getMonthName(String(date).slice(0, 7)) : '');

  const reason =
    sanitizeText(data.reason || data.notes || notification?.reason || notification?.notes || '') ||
    (kind === 'bazar' ? 'Bazar record has been added.' : 'Balance record has been updated.');

  const items = getItems(data);

  const title =
    notification?.title ||
    (kind === 'bazar' ? 'NestHub - Bazar Added' : 'NestHub - Balance Update');

  const message =
    body ||
    (kind === 'bazar'
      ? `Your bazar record has been added. Amount: ${money(amount)}.`
      : `Your balance record has been updated.`);

  return {
    kind,
    status,
    amount,
    totalPayable,
    paidAmount,
    balance,
    advance,
    place,
    date,
    month,
    reason,
    items,
    title,
    message,
  };
}

export default function BazarNotificationCard({
  notification,
  onOpen,
  onMarkRead,
}) {
  const sentDate = getNotificationDate(notification);
  const details = buildDetails(notification);
  const design = statusDesign(details.status, details.kind);

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
        className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base text-white shadow-sm ${design.avatar}`}
      >
        {design.icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-xs font-black text-gray-900">
            {details.kind === 'bazar' ? 'Bazar Message' : 'Balance Message'}
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
          className={`rounded-[22px] rounded-tl-md border px-3 py-3 shadow-sm ${design.bubble}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-gray-500">
                {details.kind === 'bazar' ? 'Bazar Record' : 'Balance Update'}
              </p>

              <h3 className={`mt-1 text-sm font-black ${design.titleClass}`}>
                {design.label}
              </h3>
            </div>

            <span
              className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${design.badgeClass}`}
            >
              {design.badge}
            </span>
          </div>

          {details.kind === 'bazar' ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-white/80 px-3 py-2">
                  <p className="text-[8px] font-black uppercase text-gray-400">
                    Amount
                  </p>
                  <p className="text-sm font-black text-emerald-700">
                    {money(details.amount)}
                  </p>
                </div>

                <div className="rounded-2xl bg-white/80 px-3 py-2">
                  <p className="text-[8px] font-black uppercase text-gray-400">
                    Date
                  </p>
                  <p className="text-xs font-black text-gray-800">
                    {formatDate(details.date || sentDate)}
                  </p>
                </div>
              </div>

              {(details.place || details.month) && (
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {details.place && (
                    <div className="rounded-2xl bg-white/80 px-3 py-2">
                      <p className="text-[8px] font-black uppercase text-gray-400">
                        Place
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-xs font-bold text-gray-700">
                        <MapPin className="h-3 w-3" />
                        {details.place}
                      </p>
                    </div>
                  )}

                  {details.month && (
                    <div className="rounded-2xl bg-white/80 px-3 py-2">
                      <p className="text-[8px] font-black uppercase text-gray-400">
                        Month
                      </p>
                      <p className="text-xs font-bold text-gray-700">
                        {details.month}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {details.items.length > 0 && (
                <div className="mt-3 rounded-2xl bg-white/80 px-3 py-2">
                  <p className="text-[8px] font-black uppercase text-gray-400">
                    Items
                  </p>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {details.items.map((item, index) => (
                      <span
                        key={`${item}-${index}`}
                        className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-600"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-white/80 px-3 py-2">
                <p className="text-[8px] font-black uppercase text-gray-400">
                  Total
                </p>
                <p className="text-sm font-black text-gray-900">
                  {money(details.totalPayable)}
                </p>
              </div>

              <div className="rounded-2xl bg-white/80 px-3 py-2">
                <p className="text-[8px] font-black uppercase text-gray-400">
                  Paid
                </p>
                <p className="text-sm font-black text-emerald-700">
                  {money(details.paidAmount)}
                </p>
              </div>

              <div className="rounded-2xl bg-white/80 px-3 py-2">
                <p className="text-[8px] font-black uppercase text-gray-400">
                  Balance
                </p>
                <p
                  className={`text-sm font-black ${
                    details.balance > 0
                      ? 'text-red-700'
                      : details.balance < 0
                        ? 'text-purple-700'
                        : 'text-gray-700'
                  }`}
                >
                  {moneySigned(details.balance)}
                </p>
              </div>

              <div className="rounded-2xl bg-white/80 px-3 py-2">
                <p className="text-[8px] font-black uppercase text-gray-400">
                  Status
                </p>
                <p className={`text-sm font-black ${design.titleClass}`}>
                  {design.badge}
                </p>
              </div>
            </div>
          )}

          <div className="mt-3 rounded-2xl bg-white/80 px-3 py-2">
            <p className="text-[9px] font-black uppercase text-gray-400">
              Reason
            </p>

            <p className="mt-1 text-xs font-bold text-gray-700">
              {details.reason}
            </p>
          </div>

          <p className="mt-3 whitespace-pre-line text-xs leading-5 text-gray-800">
            {details.message}
          </p>

          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 text-[10px] font-bold text-gray-400">
              <Clock className="h-3 w-3" />
              Sent {formatFullTime(sentDate)}
            </div>

            {!notification.read ? (
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
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-gray-400">
                <CheckCircle className="h-3 w-3" />
                Read
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}