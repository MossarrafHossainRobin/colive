'use client';

import { useMemo, useState } from 'react';
import {
  BellRing,
  Check,
  ChevronRight,
  Mail,
  MessageCircleMore,
  Send,
  Smartphone,
  Users,
  X,
} from 'lucide-react';

const channels = [
  { id: 'inApp', label: 'In-app', detail: 'Notification center', icon: BellRing, available: true },
  { id: 'push', label: 'Push', detail: 'Registered devices', icon: Smartphone, available: true },
  { id: 'email', label: 'Email', detail: 'Coming soon', icon: Mail, available: false },
  { id: 'sms', label: 'SMS', detail: 'Coming soon', icon: Smartphone, available: false },
  { id: 'whatsapp', label: 'WhatsApp', detail: 'Coming soon', icon: MessageCircleMore, available: false },
];

export default function NotificationReviewModal({
  open,
  onClose,
  moduleName,
  title,
  summary,
  dateLabel,
  metrics = [],
  changes = [],
  recipients = [],
  onConfirm,
  sending = false,
}) {
  const [selectedChannels, setSelectedChannels] = useState(['inApp', 'push']);
  const [confirmed, setConfirmed] = useState(false);

  const recipientLabel = useMemo(() => {
    if (!recipients.length) return 'No recipients selected';
    if (recipients.length === 1) return recipients[0].name || recipients[0].displayName || '1 member';
    return `${recipients.length} members`;
  }, [recipients]);

  if (!open) return null;

  const toggleChannel = (channel) => {
    if (!channel.available) return;
    setSelectedChannels((current) => (
      current.includes(channel.id)
        ? current.filter((item) => item !== channel.id)
        : [...current, channel.id]
    ));
  };

  const handleClose = () => {
    if (sending) return;
    setConfirmed(false);
    onClose();
  };

  const handleConfirm = async () => {
    if (!confirmed || !recipients.length || !selectedChannels.length) return;
    await onConfirm?.({ channels: selectedChannels });
    setConfirmed(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
      <button type="button" className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" onClick={handleClose} aria-label="Close notification preview" />
      <section className="relative flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 dark:border-slate-800 sm:px-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-600">Review before sending</p>
            <h2 className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{moduleName} notification</h2>
            <p className="mt-1 text-xs text-slate-400">Nothing is sent until you confirm this preview.</p>
          </div>
          <button type="button" onClick={handleClose} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[1.15fr_0.85fr]">
          <div className="border-b border-slate-200 p-4 dark:border-slate-800 lg:border-b-0 lg:border-r sm:p-5">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Message preview</p>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-emerald-600 text-white">
                  <BellRing className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-950 dark:text-white">{title}</h3>
                  <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-600 dark:text-slate-300">{summary}</p>
                  <p className="mt-2 text-[10px] font-medium text-slate-400">{dateLabel}</p>
                </div>
              </div>

              {metrics.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {metrics.map((metric) => (
                    <div key={metric.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{metric.label}</p>
                      <p className="mt-0.5 text-xs font-bold text-slate-900 dark:text-white">{metric.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Included changes</p>
                <span className="text-[10px] font-semibold text-slate-400">{changes.length} item(s)</span>
              </div>
              <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
                {changes.length ? changes.slice(0, 20).map((change, index) => (
                  <div key={change.id || `${change.type}-${index}`} className="flex items-start gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0 dark:border-slate-800">
                    <ChevronRight className="mt-0.5 h-3 w-3 flex-none text-slate-300" />
                    <p className="text-[11px] leading-4 text-slate-600 dark:text-slate-300">{change.label || change.summary || change.type || 'Data updated'}</p>
                  </div>
                )) : (
                  <p className="px-3 py-5 text-center text-xs text-slate-400">No unsent changes. You can still send the current summary.</p>
                )}
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Recipients</p>
            <div className="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300">
                <Users className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">{recipientLabel}</p>
                <p className="mt-0.5 text-[10px] text-slate-400">Active house members</p>
              </div>
            </div>

            <p className="mb-2 mt-5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Channels</p>
            <div className="space-y-2">
              {channels.map((channel) => {
                const Icon = channel.icon;
                const selected = selectedChannels.includes(channel.id);
                return (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => toggleChannel(channel)}
                    disabled={!channel.available}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                      !channel.available
                        ? 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-55 dark:border-slate-800 dark:bg-slate-950'
                        : selected
                          ? 'border-emerald-300 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/40'
                          : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="h-4 w-4 text-slate-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-bold text-slate-800 dark:text-slate-200">{channel.label}</span>
                      <span className="block text-[10px] text-slate-400">{channel.detail}</span>
                    </span>
                    <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${selected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                      {selected && <Check className="h-3 w-3" />}
                    </span>
                  </button>
                );
              })}
            </div>

            <label className="mt-5 flex cursor-pointer items-start gap-2 rounded-xl bg-amber-50 p-3 dark:bg-amber-950/30">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5" />
              <span className="text-[11px] leading-4 text-amber-800 dark:text-amber-200">
                I reviewed the figures, recipients, and message. Send this notification now.
              </span>
            </label>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950 sm:px-5">
          <p className="hidden text-[10px] text-slate-400 sm:block">Edits never trigger notifications automatically.</p>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={handleClose} disabled={sending} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Cancel</button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!confirmed || !recipients.length || !selectedChannels.length || sending}
              className="flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" />
              {sending ? 'Sending…' : 'Confirm & send'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
