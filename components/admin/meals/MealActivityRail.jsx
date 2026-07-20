'use client';

import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  CloudOff,
  FileUp,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { auditTimestamp } from '@/lib/adminAudit';

const ACTION_STYLES = {
  create: { label: 'Created', icon: Plus, className: 'bg-[#2563EB] text-white' },
  update: { label: 'Updated', icon: Pencil, className: 'bg-[#0891B2] text-white' },
  delete: { label: 'Deleted', icon: Trash2, className: 'bg-[#DC2626] text-white' },
  restore: { label: 'Restored', icon: RotateCcw, className: 'bg-[#16A34A] text-white' },
  notify: { label: 'Notified', icon: BellRing, className: 'bg-[#7C3AED] text-white' },
  import: { label: 'Imported', icon: FileUp, className: 'bg-[#334155] text-white' },
  publish_rate: { label: 'Published', icon: CheckCircle2, className: 'bg-[#F59E0B] text-slate-950' },
};

const DEFAULT_ACTION = {
  label: 'Changed',
  icon: Activity,
  className: 'bg-[#64748B] text-white',
};

const SYNC_STYLES = {
  synced: {
    label: 'All changes synced',
    detail: 'Workspace is up to date',
    icon: CheckCircle2,
    className: 'bg-[#16A34A] text-white',
  },
  syncing: {
    label: 'Syncing changes',
    detail: 'Saving in the background',
    icon: RefreshCw,
    className: 'bg-[#2563EB] text-white',
    spin: true,
  },
  offline: {
    label: 'Working offline',
    detail: 'Changes will sync when connected',
    icon: CloudOff,
    className: 'bg-[#F59E0B] text-slate-950',
  },
  error: {
    label: 'Sync needs attention',
    detail: 'Review unsaved changes',
    icon: AlertTriangle,
    className: 'bg-[#DC2626] text-white',
  },
};

function normalizedAction(item) {
  const value = String(item?.action || item?.type || 'update').toLowerCase();
  if (value.includes('delete')) return 'delete';
  if (value.includes('restore')) return 'restore';
  if (value.includes('create') || value.includes('added')) return 'create';
  if (value.includes('notify')) return 'notify';
  if (value.includes('import')) return 'import';
  if (value.includes('publish')) return 'publish_rate';
  return value === 'update' || value.includes('update') ? 'update' : value;
}

function normalizedSyncStatus(syncStatus) {
  const source = syncStatus && typeof syncStatus === 'object'
    ? syncStatus
    : { state: syncStatus };
  const wantedState = String(source.state || source.status || 'synced').toLowerCase();
  const state = wantedState === 'saving' || wantedState === 'pending'
    ? 'syncing'
    : wantedState === 'failed'
      ? 'error'
      : SYNC_STYLES[wantedState]
        ? wantedState
        : 'synced';

  return {
    ...SYNC_STYLES[state],
    ...source,
    state,
    label: source.label || SYNC_STYLES[state].label,
    detail: source.detail || SYNC_STYLES[state].detail,
  };
}

function itemTimestamp(item) {
  if (!item?.createdAt) return new Date();
  return auditTimestamp(item.createdAt);
}

function relativeTime(value, now = Date.now()) {
  const difference = Math.max(0, now - value.getTime());
  const minutes = Math.floor(difference / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return value.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function itemSummary(item) {
  return item?.summary || item?.label || `${item?.entityType || 'Meal record'} changed`;
}

function itemIdentity(item, index) {
  return item?.id || `${item?.entityId || item?.mealId || 'activity'}-${item?.createdAt?.seconds || item?.createdAt || index}`;
}

export default function MealActivityRail({
  items = [],
  syncStatus = 'synced',
  onRestore,
  title = 'Recent activity',
  limit = 30,
  className = '',
}) {
  const [search, setSearch] = useState('');
  const reduceMotion = useReducedMotion();
  const sync = normalizedSyncStatus(syncStatus);
  const SyncIcon = sync.icon;

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const source = Array.isArray(items) ? items : [];
    const filtered = query
      ? source.filter((item) => [
        itemSummary(item),
        item.action,
        item.type,
        item.actorName,
        item.memberName,
        item.entityId,
        item.mealId,
        item.date,
      ].some((value) => String(value || '').toLowerCase().includes(query)))
      : source;

    return filtered.slice(0, Math.max(0, Number(limit) || 0));
  }, [items, limit, search]);

  return (
    <aside
      aria-label="Meal activity and synchronization"
      className={`flex min-h-[30rem] max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-950/5 dark:border-slate-700 dark:bg-slate-900 xl:max-h-[calc(100dvh-9rem)] xl:w-80 xl:flex-none ${className}`}
    >
      <header className="bg-[#1E293B] px-4 pb-4 pt-4 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Meal workspace</p>
            <h2 className="mt-1 flex items-center gap-2 text-base font-extrabold tracking-tight">
              <Activity aria-hidden="true" className="h-4 w-4 text-cyan-400" />
              {title}
            </h2>
          </div>
          <span className="rounded-lg bg-white/10 px-2 py-1 text-[10px] font-bold tabular-nums text-slate-200 ring-1 ring-inset ring-white/10">
            {items.length}
          </span>
        </div>

        <div
          role="status"
          aria-live="polite"
          className={`mt-3 flex items-center gap-2.5 rounded-xl px-3 py-2.5 shadow-sm ${sync.className}`}
        >
          <SyncIcon aria-hidden="true" className={`h-4 w-4 flex-none ${sync.spin && !reduceMotion ? 'animate-spin' : ''}`} />
          <span className="min-w-0">
            <span className="block truncate text-[11px] font-extrabold">{sync.label}</span>
            <span className="block truncate text-[9px] font-semibold opacity-75">{sync.detail}</span>
          </span>
        </div>
      </header>

      <div className="border-b border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <label className="relative block">
          <span className="sr-only">Search meal activity</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search changes"
            className="h-9 w-full rounded-xl border border-slate-300 bg-slate-50 pl-9 pr-9 text-xs font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#2563EB] focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-blue-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              title="Clear activity search"
              aria-label="Clear activity search"
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-200 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          )}
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 [scrollbar-color:rgb(148_163_184)_transparent]">
        {!filteredItems.length ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-5 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#334155] text-white shadow-lg">
              {search ? <Search aria-hidden="true" className="h-5 w-5" /> : <Activity aria-hidden="true" className="h-5 w-5" />}
            </span>
            <p className="mt-3 text-sm font-extrabold text-slate-900 dark:text-white">
              {search ? 'No matching changes' : 'No activity yet'}
            </p>
            <p className="mt-1 max-w-52 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
              {search ? 'Try a member, action, date, or record ID.' : 'Saved edits and other meal actions will appear here.'}
            </p>
          </div>
        ) : (
          <ol aria-label="Recent meal changes" className="relative space-y-2.5 before:absolute before:bottom-5 before:left-[1.15rem] before:top-5 before:w-px before:bg-slate-300 dark:before:bg-slate-700">
            <AnimatePresence initial={false}>
              {filteredItems.map((item, index) => {
                const action = normalizedAction(item);
                const style = ACTION_STYLES[action] || DEFAULT_ACTION;
                const ActionIcon = style.icon;
                const timestamp = itemTimestamp(item);
                const canRestore = action === 'delete' && Boolean(item?.entityId && item?.before) && typeof onRestore === 'function';
                const entityId = item.entityId || item.mealId || '';

                return (
                  <motion.li
                    layout={!reduceMotion}
                    key={itemIdentity(item, index)}
                    initial={reduceMotion ? false : { opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, x: -8 }}
                    transition={{ duration: reduceMotion ? 0 : 0.2, delay: reduceMotion ? 0 : Math.min(index, 8) * 0.025 }}
                    className="group relative flex gap-2.5"
                  >
                    <span className={`relative z-10 mt-2 flex h-9 w-9 flex-none items-center justify-center rounded-xl shadow-sm ring-4 ring-white dark:ring-slate-900 ${style.className}`}>
                      <ActionIcon aria-hidden="true" className="h-4 w-4" strokeWidth={2.25} />
                    </span>

                    <article className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white p-3 transition duration-200 group-hover:-translate-y-0.5 group-hover:border-blue-400 group-hover:shadow-md dark:border-slate-700 dark:bg-slate-950 dark:group-hover:border-blue-500">
                      <div className="flex items-start justify-between gap-2">
                        <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide ${style.className}`}>
                          {style.label}
                        </span>
                        <time
                          dateTime={timestamp.toISOString()}
                          title={timestamp.toLocaleString()}
                          className="flex-none text-[9px] font-semibold text-slate-400"
                        >
                          {relativeTime(timestamp)}
                        </time>
                      </div>
                      <p className="mt-2 line-clamp-2 text-[11px] font-bold leading-4 text-slate-900 dark:text-white">
                        {itemSummary(item)}
                      </p>
                      <div className="mt-2 flex min-w-0 items-center justify-between gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                        <span className="min-w-0 truncate text-[9px] font-semibold text-slate-500 dark:text-slate-400">
                          {item.actorName || item.memberName || 'NestHub Admin'}
                          {entityId ? ` · ${entityId}` : ''}
                        </span>
                        {canRestore && (
                          <button
                            type="button"
                            onClick={() => onRestore(item)}
                            title="Restore this deleted meal record"
                            className="inline-flex h-7 flex-none items-center gap-1 rounded-lg bg-[#16A34A] px-2 text-[9px] font-extrabold text-white shadow-sm transition hover:scale-[1.03] hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
                          >
                            <RotateCcw aria-hidden="true" className="h-3 w-3" />
                            Restore
                          </button>
                        )}
                      </div>
                    </article>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ol>
        )}
      </div>
    </aside>
  );
}
