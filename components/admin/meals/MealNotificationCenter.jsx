'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  BellRing,
  Check,
  CheckCircle2,
  CreditCard,
  LifeBuoy,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquareText,
  PenLine,
  ReceiptText,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserCheck,
  Users,
  Utensils,
  X,
} from 'lucide-react';

const CHANNELS = [
  {
    id: 'inApp',
    label: 'In-App',
    description: 'Deliver to the NestHub notification center.',
    icon: BellRing,
    available: true,
    required: true,
    accent: 'bg-blue-600',
  },
  {
    id: 'push',
    label: 'Push',
    description: 'Send to members with registered devices.',
    icon: Smartphone,
    available: true,
    accent: 'bg-emerald-700',
  },
  {
    id: 'messenger',
    label: 'Messenger',
    description: 'Channel integration is not available yet.',
    icon: MessageSquareText,
    available: false,
    accent: 'bg-blue-700',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    description: 'Channel integration is not available yet.',
    icon: MessageCircle,
    available: false,
    accent: 'bg-green-700',
  },
  {
    id: 'sms',
    label: 'SMS',
    description: 'Channel integration is not available yet.',
    icon: Smartphone,
    available: false,
    accent: 'bg-cyan-700',
  },
  {
    id: 'email',
    label: 'Email',
    description: 'Channel integration is not available yet.',
    icon: Mail,
    available: false,
    accent: 'bg-violet-700',
  },
];

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getMemberId(member, index) {
  return String(
    member?.id ||
      member?.uid ||
      member?.userId ||
      member?.email ||
      `member-${index}`
  ).trim();
}

function getMemberName(member) {
  return String(
    member?.displayName ||
      member?.name ||
      member?.fullName ||
      member?.email ||
      'Member'
  ).trim();
}

function getMemberDetail(member) {
  return [member?.room, member?.email || member?.phone]
    .filter(Boolean)
    .join(' · ') || 'Member account';
}

function memberInitial(member) {
  return getMemberName(member).charAt(0).toUpperCase() || 'M';
}

function normalizeMetrics(summaryMetrics) {
  if (Array.isArray(summaryMetrics)) {
    return summaryMetrics
      .filter((metric) => metric && metric.label)
      .map((metric) => ({ label: metric.label, value: metric.value ?? '—' }));
  }

  if (summaryMetrics && typeof summaryMetrics === 'object') {
    return Object.entries(summaryMetrics).map(([label, value]) => ({ label, value }));
  }

  return [];
}

export default function MealNotificationCenter({
  open,
  onClose,
  members = [],
  defaultTitle = '',
  defaultMessage = '',
  summaryMetrics = [],
  onConfirm,
  sending = false,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const selectAllRef = useRef(null);
  const wasOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const sendingRef = useRef(sending);

  const normalizedMembers = useMemo(() => {
    const unique = new Map();
    members.forEach((member, index) => {
      const id = getMemberId(member, index);
      if (!id || unique.has(id)) return;
      unique.set(id, { id, member });
    });
    return [...unique.values()];
  }, [members]);

  const metrics = useMemo(() => normalizeMetrics(summaryMetrics), [summaryMetrics]);
  const templates = useMemo(() => [
    {
      id: 'payment_reminder',
      label: 'Payment Reminder',
      description: 'A concise reminder for an outstanding balance.',
      icon: CreditCard,
      title: 'Payment reminder from NestHub',
      message: 'Your account has an outstanding balance. Please review your latest statement and complete the payment when convenient.',
      color: 'bg-red-600',
    },
    {
      id: 'meal_summary',
      label: 'Meal Summary',
      description: 'Share the reviewed meal totals and published rate.',
      icon: Utensils,
      title: defaultTitle || 'Your NestHub meal summary is ready',
      message: defaultMessage || 'The monthly meal sheet has been reviewed. Open NestHub to see your latest meal totals and published meal rate.',
      color: 'bg-blue-600',
    },
    {
      id: 'monthly_bill',
      label: 'Monthly Bill',
      description: 'Let members know their monthly bill is ready.',
      icon: ReceiptText,
      title: 'Your monthly NestHub bill is ready',
      message: 'Your monthly bill has been prepared and reviewed. Open NestHub to see the complete calculation, payment status, and any outstanding balance.',
      color: 'bg-violet-600',
    },
    {
      id: 'custom_notice',
      label: 'Custom Notice',
      description: 'Write a message for this selected audience.',
      icon: PenLine,
      title: defaultTitle || 'Notice from NestHub',
      message: defaultMessage || '',
      color: 'bg-cyan-700',
    },
    {
      id: 'support',
      label: 'Support',
      description: 'Send guidance or follow up on a member request.',
      icon: LifeBuoy,
      title: 'NestHub support update',
      message: 'We have an update regarding your support request. Please open NestHub to review the details or reply if you still need help.',
      color: 'bg-amber-700',
    },
  ], [defaultMessage, defaultTitle]);

  const [notificationType, setNotificationType] = useState('meal_summary');
  const [title, setTitle] = useState(defaultTitle);
  const [message, setMessage] = useState(defaultMessage);
  const [selectedChannels, setSelectedChannels] = useState(() => new Set(['inApp', 'push']));
  const [selectedMemberIds, setSelectedMemberIds] = useState(() => new Set());
  const [recipientSearch, setRecipientSearch] = useState('');
  const [recipientFilter, setRecipientFilter] = useState('all');
  const [reviewed, setReviewed] = useState(false);

  useEffect(() => {
    onCloseRef.current = onClose;
    sendingRef.current = sending;
  }, [onClose, sending]);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setNotificationType('meal_summary');
      setTitle(defaultTitle || 'Your NestHub meal summary is ready');
      setMessage(defaultMessage || 'The monthly meal sheet has been reviewed. Open NestHub to see your latest meal totals and published meal rate.');
      setSelectedChannels(new Set(['inApp', 'push']));
      setSelectedMemberIds(new Set(normalizedMembers.map(({ id }) => id)));
      setRecipientSearch('');
      setRecipientFilter('all');
      setReviewed(false);
    }
    wasOpenRef.current = open;
  }, [defaultMessage, defaultTitle, normalizedMembers, open]);

  const memberIdSignature = normalizedMembers.map(({ id }) => id).join('\u0000');
  useEffect(() => {
    if (!open) return;
    const validIds = new Set(normalizedMembers.map(({ id }) => id));
    setSelectedMemberIds((current) => new Set(
      [...current].filter((id) => validIds.has(id))
    ));
  }, [memberIdSignature, normalizedMembers, open]);

  useEffect(() => {
    if (!open) return undefined;

    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const frame = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector('[data-autofocus]')?.focus();
    });

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (!sendingRef.current) onCloseRef.current?.();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR)]
        .filter((element) => element.getAttribute('aria-hidden') !== 'true');
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [open]);

  const filteredMembers = useMemo(() => {
    const query = recipientSearch.trim().toLowerCase();
    return normalizedMembers.filter(({ id, member }) => {
      const selected = selectedMemberIds.has(id);
      if (recipientFilter === 'selected' && !selected) return false;
      if (recipientFilter === 'unselected' && selected) return false;
      if (!query) return true;
      return [getMemberName(member), member?.room, member?.email, member?.phone]
        .some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [normalizedMembers, recipientFilter, recipientSearch, selectedMemberIds]);

  const selectedRecipients = useMemo(() => normalizedMembers
    .filter(({ id }) => selectedMemberIds.has(id))
    .map(({ member }) => member), [normalizedMembers, selectedMemberIds]);

  const allVisibleSelected = filteredMembers.length > 0 && filteredMembers.every(
    ({ id }) => selectedMemberIds.has(id)
  );
  const someVisibleSelected = filteredMembers.some(({ id }) => selectedMemberIds.has(id));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
    }
  }, [allVisibleSelected, someVisibleSelected]);

  if (!open) return null;

  const selectedTemplate = templates.find((template) => template.id === notificationType);
  const selectedChannelLabels = CHANNELS
    .filter((channel) => selectedChannels.has(channel.id))
    .map((channel) => channel.label);
  const canSend = Boolean(
    reviewed &&
      selectedRecipients.length &&
      selectedChannels.size &&
      title.trim() &&
      message.trim() &&
      typeof onConfirm === 'function' &&
      !sending
  );

  const close = () => {
    if (!sending) onClose?.();
  };

  const applyTemplate = (template) => {
    setNotificationType(template.id);
    setTitle(template.title);
    setMessage(template.message);
    setReviewed(false);
  };

  const toggleChannel = (channel) => {
    if (!channel.available || channel.required) return;
    setSelectedChannels((current) => {
      const next = new Set(current);
      if (next.has(channel.id)) next.delete(channel.id);
      else next.add(channel.id);
      return next;
    });
    setReviewed(false);
  };

  const toggleMember = (id) => {
    setSelectedMemberIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setReviewed(false);
  };

  const toggleVisibleMembers = () => {
    setSelectedMemberIds((current) => {
      const next = new Set(current);
      filteredMembers.forEach(({ id }) => {
        if (allVisibleSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
    setReviewed(false);
  };

  const sendNotification = async () => {
    if (!canSend) return;
    await onConfirm?.({
      channels: [...selectedChannels],
      recipients: selectedRecipients,
      notificationType,
      title: title.trim(),
      message: message.trim(),
    });
    setReviewed(false);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
        onClick={close}
        aria-label="Close notification center"
        tabIndex={-1}
      />

      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative flex max-h-[96dvh] w-full max-w-6xl flex-col overflow-hidden rounded-t-3xl border border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:max-h-[92dvh] sm:rounded-2xl"
      >
        <header className="flex flex-none items-start justify-between gap-4 border-b border-slate-700 bg-slate-900 px-4 py-4 text-white sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-950/30">
              <BellRing className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-300">
                <Sparkles className="h-3 w-3" /> Manual delivery
              </p>
              <h2 id={titleId} className="mt-1 text-lg font-bold tracking-tight sm:text-xl">
                Meal notification center
              </h2>
              <p id={descriptionId} className="mt-1 max-w-2xl text-xs leading-5 text-slate-300">
                Choose the audience, message, and available delivery channels. Nothing sends until you review and confirm.
              </p>
            </div>
          </div>
          <button
            data-autofocus
            type="button"
            onClick={close}
            disabled={sending}
            className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-slate-600 bg-slate-800 text-slate-200 transition hover:border-slate-500 hover:bg-slate-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40"
            aria-label="Close notification center"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:overflow-hidden">
          <div className="space-y-5 p-4 sm:p-5 lg:overflow-y-auto">
            <section aria-labelledby={`${titleId}-templates`}>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h3 id={`${titleId}-templates`} className="text-sm font-bold text-slate-950 dark:text-white">Notification template</h3>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Start with a reviewed message type, then edit it as needed.</p>
                </div>
                <span className="rounded-md bg-violet-600 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-white">
                  {selectedTemplate?.label || 'Custom'}
                </span>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {templates.map((template) => {
                  const Icon = template.icon;
                  const active = notificationType === template.id;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => applyTemplate(template)}
                      aria-pressed={active}
                      title={template.description}
                      className={`group rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
                        active
                          ? `${template.color} border-transparent text-white shadow-lg`
                          : 'border-slate-300 bg-white text-slate-800 hover:border-blue-500 hover:shadow-md dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200'
                      }`}
                    >
                      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${active ? 'bg-white/20' : template.color} text-white`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="mt-2 block text-[11px] font-bold leading-4">{template.label}</span>
                      <span className={`mt-1 block text-[9px] leading-4 ${active ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>
                        {template.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]" aria-labelledby={`${titleId}-compose`}>
              <div>
                <h3 id={`${titleId}-compose`} className="text-sm font-bold text-slate-950 dark:text-white">Compose message</h3>
                <div className="mt-3 space-y-3">
                  <label className="block">
                    <span className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      Title <span className="font-medium normal-case tracking-normal text-slate-400">{title.length}/100</span>
                    </span>
                    <input
                      value={title}
                      maxLength={100}
                      onChange={(event) => {
                        setTitle(event.target.value);
                        setReviewed(false);
                      }}
                      placeholder="Notification title"
                      className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      Message <span className="font-medium normal-case tracking-normal text-slate-400">{message.length}/600</span>
                    </span>
                    <textarea
                      value={message}
                      maxLength={600}
                      rows={6}
                      onChange={(event) => {
                        setMessage(event.target.value);
                        setReviewed(false);
                      }}
                      placeholder="Write the message members will receive…"
                      className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </label>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-950 dark:text-white">Delivery channels</h3>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {CHANNELS.map((channel) => {
                    const Icon = channel.icon;
                    const selected = selectedChannels.has(channel.id);
                    return (
                      <button
                        key={channel.id}
                        type="button"
                        disabled={!channel.available || channel.required}
                        onClick={() => toggleChannel(channel)}
                        aria-pressed={channel.available ? selected : undefined}
                        aria-label={`${channel.label}: ${channel.required ? 'required' : channel.available ? (selected ? 'selected' : 'not selected') : 'unavailable'}`}
                        title={channel.required ? `${channel.description} This channel is required by the current delivery service.` : channel.description}
                        className={`relative min-h-24 rounded-xl border p-3 text-left transition disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                          !channel.available
                            ? 'cursor-not-allowed border-slate-300 bg-slate-100 text-slate-400 opacity-75 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-500'
                            : selected
                              ? 'border-slate-900 bg-slate-900 text-white shadow-md dark:border-blue-500 dark:bg-blue-600'
                              : 'border-slate-300 bg-white text-slate-700 hover:border-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200'
                        }`}
                      >
                        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${channel.accent} text-white`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="mt-2 block text-[11px] font-bold">{channel.label}</span>
                        <span className={`mt-0.5 block text-[9px] leading-4 ${selected && channel.available ? 'text-slate-300 dark:text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                          {channel.required ? 'Required' : channel.available ? (selected ? 'Selected' : 'Available') : 'Unavailable'}
                        </span>
                        {selected && channel.available && (
                          <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                            <Check className="h-3 w-3" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section aria-labelledby={`${titleId}-recipients`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 id={`${titleId}-recipients`} className="text-sm font-bold text-slate-950 dark:text-white">Recipients</h3>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Search, filter, or narrow delivery to one member.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-[10px] font-bold text-white">
                    {selectedRecipients.length} selected
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMemberIds(new Set());
                      setReviewed(false);
                    }}
                    disabled={!selectedRecipients.length}
                    className="h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-[10px] font-bold text-slate-600 transition hover:border-red-600 hover:text-red-600 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                  >
                    Clear all
                  </button>
                </div>
              </div>

              <div className="mt-3 overflow-hidden rounded-xl border border-slate-300 dark:border-slate-700">
                <div className="grid gap-2 border-b border-slate-300 bg-slate-100 p-2.5 dark:border-slate-700 dark:bg-slate-950 sm:grid-cols-[minmax(0,1fr)_150px]">
                  <label className="relative block">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      value={recipientSearch}
                      onChange={(event) => setRecipientSearch(event.target.value)}
                      placeholder="Search name, room, email, or phone"
                      aria-label="Search recipients"
                      className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-xs font-medium text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </label>
                  <label>
                    <span className="sr-only">Filter recipients</span>
                    <select
                      value={recipientFilter}
                      onChange={(event) => setRecipientFilter(event.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      <option value="all">All recipients</option>
                      <option value="selected">Selected only</option>
                      <option value="unselected">Not selected</option>
                    </select>
                  </label>
                </div>

                <div className="flex items-center justify-between gap-3 border-b border-slate-300 bg-slate-800 px-3 py-2 text-white dark:border-slate-700">
                  <label className="flex cursor-pointer items-center gap-2 text-[11px] font-bold">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleVisibleMembers}
                      disabled={!filteredMembers.length}
                      className="h-4 w-4 rounded border-slate-400 accent-blue-600"
                    />
                    {allVisibleSelected ? 'Deselect visible' : 'Select visible'}
                  </label>
                  <span className="text-[10px] font-medium text-slate-300">{filteredMembers.length} shown</span>
                </div>

                <div className="max-h-64 overflow-y-auto bg-white dark:bg-slate-900">
                  {filteredMembers.length ? filteredMembers.map(({ id, member }) => {
                    const selected = selectedMemberIds.has(id);
                    return (
                      <div
                        key={id}
                        className={`flex items-center gap-3 border-b border-slate-200 px-3 py-2.5 last:border-b-0 dark:border-slate-800 ${selected ? 'bg-slate-100 dark:bg-slate-800' : 'bg-white dark:bg-slate-900'}`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleMember(id)}
                          aria-label={`Select ${getMemberName(member)}`}
                          className="h-4 w-4 flex-none rounded border-slate-400 accent-blue-600"
                        />
                        <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg text-xs font-bold text-white ${selected ? 'bg-blue-600' : 'bg-slate-600'}`}>
                          {memberInitial(member)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-bold text-slate-900 dark:text-white">{getMemberName(member)}</span>
                          <span className="mt-0.5 block truncate text-[10px] text-slate-500 dark:text-slate-400">{getMemberDetail(member)}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedMemberIds(new Set([id]));
                            setReviewed(false);
                          }}
                          className="flex h-8 flex-none items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-[10px] font-bold text-slate-700 transition hover:border-violet-600 hover:bg-violet-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                          aria-label={`Send only to ${getMemberName(member)}`}
                          title={`Select only ${getMemberName(member)}`}
                        >
                          <UserCheck className="h-3.5 w-3.5" /> Only
                        </button>
                      </div>
                    );
                  }) : (
                    <div className="flex min-h-32 flex-col items-center justify-center px-5 text-center">
                      <Users className="h-6 w-6 text-slate-400" />
                      <p className="mt-2 text-xs font-bold text-slate-700 dark:text-slate-300">No recipients match</p>
                      <button
                        type="button"
                        onClick={() => {
                          setRecipientSearch('');
                          setRecipientFilter('all');
                        }}
                        className="mt-2 text-[11px] font-bold text-blue-600 hover:underline"
                      >
                        Clear recipient filters
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>

          <aside className="border-t border-slate-300 bg-slate-100 p-4 dark:border-slate-700 dark:bg-slate-950 sm:p-5 lg:overflow-y-auto lg:border-l lg:border-t-0" aria-labelledby={`${titleId}-review`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-700 dark:text-violet-300">Final review</p>
                <h3 id={`${titleId}-review`} className="mt-1 text-base font-bold text-slate-950 dark:text-white">Message preview</h3>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white">
                <ShieldCheck className="h-4 w-4" />
              </span>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center gap-3 bg-slate-900 px-4 py-3 text-white">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600">
                  <BellRing className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-blue-300">NestHub</span>
                  <span className="block text-[9px] text-slate-300">Manual admin notification</span>
                </span>
              </div>
              <div className="p-4">
                <p className="break-words text-sm font-bold leading-5 text-slate-950 dark:text-white">
                  {title.trim() || 'Notification title'}
                </p>
                <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-slate-600 dark:text-slate-300">
                  {message.trim() || 'Your message preview will appear here.'}
                </p>

                {metrics.length > 0 && (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {metrics.slice(0, 6).map((metric, index) => (
                      <div key={`${metric.label}-${index}`} className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-2 dark:border-slate-700 dark:bg-slate-950">
                        <p className="truncate text-[8px] font-bold uppercase tracking-wide text-slate-500">{metric.label}</p>
                        <p className="mt-1 truncate text-[11px] font-bold text-slate-900 dark:text-white">{String(metric.value)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 space-y-2 rounded-xl border border-slate-300 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-3 text-[11px]">
                <span className="font-semibold text-slate-500 dark:text-slate-400">Recipients</span>
                <span className="font-bold text-slate-950 dark:text-white">{selectedRecipients.length} member{selectedRecipients.length === 1 ? '' : 's'}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[11px]">
                <span className="font-semibold text-slate-500 dark:text-slate-400">Channels</span>
                <span className="text-right font-bold text-slate-950 dark:text-white">{selectedChannelLabels.join(' + ') || 'None'}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[11px]">
                <span className="font-semibold text-slate-500 dark:text-slate-400">Type</span>
                <span className="text-right font-bold text-slate-950 dark:text-white">{selectedTemplate?.label || notificationType}</span>
              </div>
            </div>

            <label className={`mt-4 flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
              reviewed
                ? 'border-emerald-700 bg-emerald-700 text-white'
                : 'border-amber-500 bg-amber-500 text-slate-950'
            }`}>
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(event) => setReviewed(event.target.checked)}
                className="mt-0.5 h-4 w-4 flex-none accent-slate-900"
              />
              <span>
                <span className="flex items-center gap-1.5 text-[11px] font-bold">
                  {reviewed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  I reviewed this delivery
                </span>
                <span className={`mt-1 block text-[10px] leading-4 ${reviewed ? 'text-emerald-50' : 'text-slate-800'}`}>
                  Confirm the audience, channels, title, and message before sending.
                </span>
              </span>
            </label>

            {(!selectedRecipients.length || !selectedChannels.size || !title.trim() || !message.trim()) && (
              <div className="mt-3 rounded-lg border border-red-600 bg-red-600 px-3 py-2 text-[10px] font-semibold leading-4 text-white" role="status">
                {!selectedRecipients.length
                  ? 'Select at least one recipient.'
                  : !selectedChannels.size
                    ? 'Select at least one available channel.'
                    : !title.trim()
                      ? 'Add a notification title.'
                      : 'Add a notification message.'}
              </div>
            )}
          </aside>
        </div>

        <footer className="flex flex-none flex-col gap-3 border-t border-slate-300 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="flex items-center gap-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Manual send only. Editing meal data never triggers this action.
          </p>
          <div className="flex items-center gap-2 sm:justify-end">
            <button
              type="button"
              onClick={close}
              disabled={sending}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 sm:flex-none"
            >
              <X className="h-4 w-4" /> Cancel
            </button>
            <button
              type="button"
              onClick={sendNotification}
              disabled={!canSend}
              className="flex h-10 flex-[1.4] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:shadow-none dark:focus-visible:ring-offset-slate-900 sm:flex-none"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? 'Sending…' : `Send to ${selectedRecipients.length || 0}`}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
