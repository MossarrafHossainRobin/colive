'use client';

import { useMemo, useState } from 'react';
import { Clock3, History, RotateCcw, Search } from 'lucide-react';
import { auditTimestamp } from '@/lib/adminAudit';
import { EmptyState, StatusPill, ToolbarButton } from './AdminUI';

function actionTone(action) {
  if (action === 'delete') return 'red';
  if (action === 'restore') return 'green';
  if (action === 'create') return 'blue';
  if (action === 'notify') return 'amber';
  return 'slate';
}

export default function ActivityPanel({ items = [], moduleName = 'Admin', onRestore }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => [
      item.summary,
      item.action,
      item.actorName,
      item.entityId,
    ].some((value) => String(value || '').toLowerCase().includes(query)));
  }, [items, search]);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <History className="h-4 w-4 text-slate-400" />
            Activity & version history
          </h2>
          <p className="mt-0.5 text-[10px] text-slate-400">Immutable {moduleName} changes, actors, and restore points.</p>
        </div>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search activity…"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-800 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 sm:w-64"
          />
        </label>
      </div>

      {!filtered.length ? (
        <EmptyState icon={Clock3} title="No activity yet" description="Saved edits, imports, deletes, restores, and notification sends will appear here." />
      ) : (
        <div className="max-h-[620px] overflow-auto">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-950">
              <tr className="border-b border-slate-200 dark:border-slate-800">
                {['When', 'Action', 'Change', 'Actor', 'Version'].map((label) => (
                  <th key={label} className="px-3 py-2 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</th>
                ))}
                <th className="px-3 py-2 text-right text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const when = auditTimestamp(item.createdAt);
                const canRestore = item.action === 'delete' && typeof onRestore === 'function';
                return (
                  <tr key={item.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70 dark:border-slate-800 dark:hover:bg-slate-800/40">
                    <td className="whitespace-nowrap px-3 py-3 text-[10px] text-slate-500 dark:text-slate-400">
                      <span className="block font-semibold text-slate-700 dark:text-slate-200">{when.toLocaleDateString()}</span>
                      {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-3 py-3"><StatusPill tone={actionTone(item.action)}>{item.action || 'update'}</StatusPill></td>
                    <td className="max-w-md px-3 py-3">
                      <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">{item.summary || `${item.entityType || 'Record'} changed`}</p>
                      <p className="mt-0.5 truncate font-mono text-[9px] text-slate-400">{item.entityId || 'batch'}</p>
                    </td>
                    <td className="px-3 py-3 text-[10px] font-medium text-slate-500 dark:text-slate-400">{item.actorName || 'Admin'}</td>
                    <td className="px-3 py-3 text-[10px] font-mono text-slate-400">{item.after?.version || item.metadata?.version || '—'}</td>
                    <td className="px-3 py-3 text-right">
                      {canRestore && <ToolbarButton icon={RotateCcw} onClick={() => onRestore(item)}>Restore</ToolbarButton>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
