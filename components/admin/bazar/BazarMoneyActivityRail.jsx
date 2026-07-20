'use client';

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CloudOff,
  History,
  RefreshCw,
  X,
} from 'lucide-react';
import { auditTimestamp } from '@/lib/adminAudit';
import { formatBazarMoney } from './BazarMoneyStatsCards';

const SYNC_STYLES = {
  synced: {
    label: 'All changes synced',
    detail: 'Workspace is up to date',
    icon: CheckCircle2,
    className: 'bg-[#16A34A] text-white',
  },
  syncing: {
    label: 'Saving changes',
    detail: 'Background sync in progress',
    icon: RefreshCw,
    className: 'bg-[#2563EB] text-white',
    spin: true,
  },
  offline: {
    label: 'Working offline',
    detail: 'Changes will sync when connected',
    icon: CloudOff,
    className: 'bg-[#D97706] text-white',
  },
  error: {
    label: 'Sync needs attention',
    detail: 'Some changes are not saved',
    icon: AlertTriangle,
    className: 'bg-[#DC2626] text-white',
  },
};

const MONEY_FIELD_PATTERN = /(balance|deposit|adjustment|amount|cost|collection|expense|carry|forward|fund|money)/i;

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function titleCase(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function fieldLabel(value) {
  if (value === 'previousBalance' || value === 'carryForward') {
    return 'Previous Meal Due / Advance';
  }
  return titleCase(value);
}

function normalizeSyncState(syncState) {
  const source = syncState && typeof syncState === 'object'
    ? syncState
    : { state: syncState };
  const requested = String(source.state || source.status || 'synced').toLowerCase();
  const state = ['saving', 'pending', 'loading'].includes(requested)
    ? 'syncing'
    : ['failed', 'failure'].includes(requested)
      ? 'error'
      : SYNC_STYLES[requested]
        ? requested
        : 'synced';

  return {
    ...SYNC_STYLES[state],
    ...source,
    state,
    label: source.label || SYNC_STYLES[state].label,
    detail: source.detail || SYNC_STYLES[state].detail,
  };
}

function readField(source, field) {
  if (!source || typeof source !== 'object' || !field) return undefined;
  if (Object.prototype.hasOwnProperty.call(source, field)) return source[field];

  return String(field)
    .split('.')
    .reduce((value, key) => (value && typeof value === 'object' ? value[key] : undefined), source);
}

function inferChangedField(before, after) {
  const ignored = new Set([
    'createdAt',
    'updatedAt',
    'version',
    'status',
    'isDeleted',
    'deletedAt',
    'restoredAt',
  ]);
  const priority = [
    'previousBalance',
    'carryForward',
    'currentDeposit',
    'adjustment',
    'individualBalance',
    'remarks',
    'reason',
    'amount',
  ];
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const changed = keys.filter((key) => {
    if (ignored.has(key)) return false;
    try {
      return JSON.stringify(before[key]) !== JSON.stringify(after[key]);
    } catch {
      return before[key] !== after[key];
    }
  });

  return priority.find((key) => changed.includes(key)) || changed[0];
}

function activityDetails(item) {
  const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  const before = item?.before && typeof item.before === 'object' ? item.before : {};
  const after = item?.after && typeof item.after === 'object' ? item.after : {};
  const fieldKey = firstDefined(
    item?.field,
    item?.fieldKey,
    metadata.field,
    metadata.fieldKey,
    inferChangedField(before, after)
  );
  const field = firstDefined(
    item?.fieldLabel,
    metadata.fieldLabel,
    fieldKey ? fieldLabel(fieldKey) : undefined,
    item?.entityType ? titleCase(item.entityType) : undefined,
    'Balance'
  );

  return {
    field,
    member: firstDefined(
      item?.memberName,
      metadata.memberName,
      after.memberName,
      before.memberName,
      after.paidByName,
      before.paidByName,
      after.toName,
      after.fromName,
      item?.entityId,
      'Bazar workspace'
    ),
    admin: firstDefined(
      item?.actorName,
      item?.adminName,
      metadata.adminName,
      item?.createdByName,
      'NestHub Admin'
    ),
    previousValue: firstDefined(
      item?.previousValue,
      item?.oldValue,
      metadata.previousValue,
      metadata.oldValue,
      readField(before, fieldKey),
      before.value
    ),
    newValue: firstDefined(
      item?.newValue,
      metadata.newValue,
      readField(after, fieldKey),
      after.value
    ),
    reason: firstDefined(
      item?.reason,
      metadata.reason,
      after.reason,
      item?.summary,
      'Manual update'
    ),
    action: titleCase(item?.action || item?.type || 'Updated'),
  };
}

function formatActivityValue(value, field) {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';

  const numericValue = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))
      ? Number(value)
      : null;

  if (numericValue !== null && MONEY_FIELD_PATTERN.test(field)) {
    return formatBazarMoney(numericValue);
  }

  if (typeof value === 'object') {
    const preferred = firstDefined(value.amount, value.value, value.label, value.name);
    if (preferred !== undefined) return formatActivityValue(preferred, field);

    try {
      return JSON.stringify(value);
    } catch {
      return 'Updated value';
    }
  }

  return String(value);
}

function activityDate(item) {
  const rawValue = firstDefined(item?.createdAt, item?.updatedAt, item?.date);
  if (!rawValue) return null;
  const value = auditTimestamp(rawValue);
  return Number.isNaN(value.getTime()) || value.getTime() === 0 ? null : value;
}

function formatDate(value) {
  if (!value) return 'Date unavailable';
  return value.toLocaleString('en-BD', {
    timeZone: 'Asia/Dhaka',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function itemKey(item, index) {
  return item?.id || `${item?.entityId || item?.memberName || 'activity'}-${item?.createdAt?.seconds || item?.createdAt || index}`;
}

export default function BazarMoneyActivityRail({
  activity = [],
  syncState = 'synced',
  open,
  onClose,
  className = '',
}) {
  const items = Array.isArray(activity) ? activity : [];
  const sync = normalizeSyncState(syncState);
  const SyncIcon = sync.icon;
  const isDrawerControlled = typeof open === 'boolean';
  const drawerOpen = isDrawerControlled ? open : true;

  return (
    <>
      {isDrawerControlled && drawerOpen && typeof onClose === 'function' && (
        <button
          type="button"
          aria-label="Close balance history"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[1px] xl:hidden"
        />
      )}

      <aside
        aria-label="Bazar balance activity history"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && drawerOpen && typeof onClose === 'function') onClose();
        }}
        className={`${
          isDrawerControlled
            ? 'fixed inset-y-0 right-0 z-50 h-dvh w-[min(24rem,calc(100vw-1.25rem))] xl:sticky xl:top-4 xl:z-auto xl:h-[calc(100dvh-2rem)] xl:w-80'
            : 'relative max-h-[calc(100dvh-2rem)] w-full xl:sticky xl:top-4 xl:w-80'
        } ${
          isDrawerControlled
            ? 'border-l border-slate-200 dark:border-slate-700 xl:rounded-2xl xl:border'
            : 'rounded-2xl border border-slate-200 dark:border-slate-700'
        } ${isDrawerControlled && !drawerOpen ? 'translate-x-full xl:translate-x-0' : 'translate-x-0'} flex min-h-[28rem] flex-col overflow-hidden bg-white shadow-2xl shadow-slate-950/15 transition-transform duration-200 motion-reduce:transition-none dark:bg-slate-900 ${className}`}
      >
        <header className="bg-[#1E293B] px-4 pb-4 pt-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
                Bazar money
              </p>
              <h2 className="mt-1 flex items-center gap-2 text-base font-extrabold tracking-tight">
                <History aria-hidden="true" className="h-4 w-4 text-cyan-400" />
                Balance history
              </h2>
              <p className="mt-1 text-[10px] font-medium text-slate-400">
                Personal adjustments and saved edits
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="rounded-lg bg-white/10 px-2 py-1 text-[10px] font-bold tabular-nums text-slate-200 ring-1 ring-inset ring-white/10">
                {items.length}
              </span>
              {typeof onClose === 'function' && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close balance history"
                  title="Close history"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 xl:hidden"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div
            role="status"
            aria-live="polite"
            className={`mt-3 flex items-center gap-2.5 rounded-xl px-3 py-2.5 shadow-sm ${sync.className}`}
          >
            <SyncIcon aria-hidden="true" className={`h-4 w-4 flex-none ${sync.spin ? 'animate-spin motion-reduce:animate-none' : ''}`} />
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-extrabold">{sync.label}</span>
              <span className="block truncate text-[9px] font-semibold opacity-80">{sync.detail}</span>
            </span>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 [scrollbar-color:rgb(148_163_184)_transparent]">
          {items.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-5 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#334155] text-white shadow-lg">
                <History aria-hidden="true" className="h-5 w-5" />
              </span>
              <p className="mt-3 text-sm font-extrabold text-slate-900 dark:text-white">
                No balance history yet
              </p>
              <p className="mt-1 max-w-52 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                Saved deposits, carry-forwards, adjustments, and remarks will appear here.
              </p>
            </div>
          ) : (
            <ol aria-label="Recent Bazar money changes" className="space-y-2.5">
              {items.map((item, index) => {
                const details = activityDetails(item);
                const timestamp = activityDate(item);
                const previousValue = formatActivityValue(details.previousValue, details.field);
                const newValue = formatActivityValue(details.newValue, details.field);

                return (
                  <li key={itemKey(item, index)}>
                    <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-cyan-400 hover:shadow-md dark:border-slate-700 dark:bg-slate-950 dark:hover:border-cyan-600">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-extrabold text-slate-900 dark:text-white" title={String(details.member)}>
                            {details.member}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="rounded-md bg-[#7C3AED] px-1.5 py-0.5 text-[9px] font-extrabold text-white">
                              {details.field}
                            </span>
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              {details.action}
                            </span>
                          </div>
                        </div>
                        <History aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none text-slate-300 dark:text-slate-600" />
                      </div>

                      <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-900">
                        <div className="min-w-0">
                          <dt className="text-[8px] font-extrabold uppercase tracking-wide text-slate-400">
                            Previous Value
                          </dt>
                          <dd className="mt-0.5 truncate text-[11px] font-bold tabular-nums text-slate-700 dark:text-slate-200" title={previousValue}>
                            {previousValue}
                          </dd>
                        </div>
                        <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" />
                        <div className="min-w-0 text-right">
                          <dt className="text-[8px] font-extrabold uppercase tracking-wide text-slate-400">
                            New Value
                          </dt>
                          <dd className="mt-0.5 truncate text-[11px] font-bold tabular-nums text-cyan-700 dark:text-cyan-300" title={newValue}>
                            {newValue}
                          </dd>
                        </div>
                      </dl>

                      <div className="mt-2.5 rounded-lg border border-orange-100 bg-orange-50 px-2.5 py-2 dark:border-orange-950 dark:bg-orange-950/30">
                        <p className="text-[8px] font-extrabold uppercase tracking-wide text-[#EA580C]">
                          Reason
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-[10px] font-semibold leading-4 text-slate-700 dark:text-slate-300" title={String(details.reason)}>
                          {details.reason}
                        </p>
                      </div>

                      <div className="mt-2.5 flex items-end justify-between gap-3 border-t border-slate-100 pt-2 dark:border-slate-800">
                        <div className="min-w-0">
                          <p className="text-[8px] font-extrabold uppercase tracking-wide text-slate-400">Admin</p>
                          <p className="truncate text-[9px] font-bold text-slate-600 dark:text-slate-300" title={String(details.admin)}>
                            {details.admin}
                          </p>
                        </div>
                        <div className="flex-none text-right">
                          <p className="text-[8px] font-extrabold uppercase tracking-wide text-slate-400">Date</p>
                          <time
                            dateTime={timestamp?.toISOString()}
                            className="block text-[9px] font-semibold text-slate-500 dark:text-slate-400"
                            title={formatDate(timestamp)}
                          >
                            {formatDate(timestamp)}
                          </time>
                        </div>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </aside>
    </>
  );
}
