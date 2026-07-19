'use client';

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import {
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  Loader2,
  Lock,
  Power,
  Save,
  Search,
  ShieldCheck,
  UserCheck,
  UserX,
  Wrench,
} from 'lucide-react';
import {
  DEFAULT_MAINTENANCE_SETTINGS,
  MAINTENANCE_SETTINGS_HIDDEN_FIELDS,
  MAINTENANCE_SETTINGS_COLLECTION,
  MAINTENANCE_SETTINGS_ID,
  normalizeMaintenanceSettings,
} from '@/lib/maintenanceMode';
import { isMemberAccountActive } from '@/lib/memberPolicy';

const settingRef = () =>
  doc(db, MAINTENANCE_SETTINGS_COLLECTION, MAINTENANCE_SETTINGS_ID);

export default function SystemMaintenancePanel({ members = [] }) {
  const [settings, setSettings] = useState(DEFAULT_MAINTENANCE_SETTINGS);
  const [draft, setDraft] = useState(DEFAULT_MAINTENANCE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');

  useEffect(() => {
    return onSnapshot(
      settingRef(),
      (snapshot) => {
        const nextSettings = normalizeMaintenanceSettings(
          snapshot.exists() ? snapshot.data() : undefined
        );

        setSettings(nextSettings);
        setDraft(nextSettings);
        setLoading(false);
      },
      (error) => {
        console.error('Maintenance admin listener failed:', error);
        toast.error('Failed to load system notice settings');
        setLoading(false);
      }
    );
  }, []);

  const allowedUserIds = useMemo(
    () => new Set(settings.allowedUserIds || []),
    [settings.allowedUserIds]
  );

  const memberOptions = useMemo(() => {
    const term = memberSearch.trim().toLowerCase();

    return members
      .filter((member) => member.role !== 'admin')
      .filter((member) => {
        if (!term) return true;

        return `${member.name || ''} ${member.displayName || ''} ${
          member.email || ''
        } ${member.memberId || ''} ${member.room || ''}`
          .toLowerCase()
          .includes(term);
      });
  }, [members, memberSearch]);

  const activeMemberCount = members.filter(
    (member) => member.role !== 'admin' && isMemberAccountActive(member)
  ).length;
  const allowedCount = settings.allowedUserIds?.length || 0;

  const saveSettings = async (patch, successMessage) => {
    setSaving(true);

    try {
      await setDoc(
        settingRef(),
        {
          ...MAINTENANCE_SETTINGS_HIDDEN_FIELDS,
          ...patch,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (successMessage) toast.success(successMessage);
    } catch (error) {
      console.error('Maintenance settings save failed:', error);
      toast.error('Failed to save system notice');
    } finally {
      setSaving(false);
    }
  };

  const toggleMaintenance = () => {
    saveSettings(
      { enabled: !settings.enabled },
      !settings.enabled ? 'Notice page enabled' : 'Dashboard access restored'
    );
  };

  const saveNoticeCopy = (event) => {
    event.preventDefault();

    saveSettings(
      {
        title: draft.title,
        message: draft.message,
        etaLabel: draft.etaLabel,
      },
      'Notice page updated'
    );
  };

  const toggleMemberAccess = (memberId) => {
    const nextAllowed = allowedUserIds.has(memberId)
      ? settings.allowedUserIds.filter((id) => id !== memberId)
      : [...(settings.allowedUserIds || []), memberId];

    saveSettings(
      { allowedUserIds: nextAllowed },
      allowedUserIds.has(memberId) ? 'Member access removed' : 'Member access allowed'
    );
  };

  const allowAllActiveMembers = () => {
    const nextAllowed = members
      .filter((member) => member.role !== 'admin' && isMemberAccountActive(member))
      .map((member) => member.id);

    saveSettings({ allowedUserIds: nextAllowed }, 'Active members allowed');
  };

  const clearAllowedMembers = () => {
    saveSettings({ allowedUserIds: [] }, 'Member access cleared');
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase text-gray-400">
                System Notice
              </p>
              <p className="mt-1 text-2xl font-black text-gray-900">
                {settings.enabled ? 'On' : 'Off'}
              </p>
            </div>
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                settings.enabled ? 'bg-[#1DBF73] text-black' : 'bg-gray-100 text-gray-500'
              }`}
            >
              <Power className="h-5 w-5" />
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <FileSpreadsheet className="mb-3 h-5 w-5 text-[#1DBF73]" />
          <p className="text-2xl font-black text-gray-900">{allowedCount}</p>
          <p className="text-[10px] font-bold uppercase text-gray-400">
            Members allowed
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <ShieldCheck className="mb-3 h-5 w-5 text-gray-700" />
          <p className="text-2xl font-black text-gray-900">{activeMemberCount}</p>
          <p className="text-[10px] font-bold uppercase text-gray-400">
            Active members
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-black text-[#1DBF73]">
              <Wrench className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-black text-gray-950">
                Maintenance notice page
              </h2>
              <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-gray-500">
                When this is on, members see only the notice page. Admins always
                keep access, and selected members can continue using the app.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleMaintenance}
            disabled={saving}
            className={`inline-flex min-w-[148px] items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-black transition disabled:opacity-60 ${
              settings.enabled
                ? 'bg-black text-white hover:bg-gray-800'
                : 'bg-[#1DBF73] text-black hover:bg-[#19a463]'
            }`}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : settings.enabled ? (
              <Lock className="h-4 w-4" />
            ) : (
              <Power className="h-4 w-4" />
            )}
            {settings.enabled ? 'Turn off' : 'Turn on'}
          </button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <form
          onSubmit={saveNoticeCopy}
          className="rounded-lg border border-gray-200 bg-white p-4"
        >
          <div className="mb-4 flex items-center gap-2">
            <Clock3 className="h-5 w-5 text-[#1DBF73]" />
            <h3 className="text-sm font-black text-gray-900">Notice text</h3>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase text-gray-400">
                Headline
              </span>
              <input
                value={draft.title}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, title: event.target.value }))
                }
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-900 outline-none focus:border-[#1DBF73] focus:ring-2 focus:ring-[#1DBF73]/20"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase text-gray-400">
                Message
              </span>
              <textarea
                value={draft.message}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, message: event.target.value }))
                }
                rows={5}
                className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-semibold leading-6 text-gray-900 outline-none focus:border-[#1DBF73] focus:ring-2 focus:ring-[#1DBF73]/20"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase text-gray-400">
                Time label
              </span>
              <input
                value={draft.etaLabel}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    etaLabel: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-900 outline-none focus:border-[#1DBF73] focus:ring-2 focus:ring-[#1DBF73]/20"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-black px-4 py-3 text-sm font-black text-white transition hover:bg-gray-800 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save notice text
          </button>
        </form>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-black text-gray-900">
                Member access during notice
              </h3>
              <p className="mt-1 text-xs font-medium text-gray-500">
                Selected members can open dashboard, meals, bazar, bills, and chat.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={allowAllActiveMembers}
                disabled={saving}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-black text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Allow active
              </button>
              <button
                type="button"
                onClick={clearAllowedMembers}
                disabled={saving}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-black text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={memberSearch}
              onChange={(event) => setMemberSearch(event.target.value)}
              placeholder="Search members"
              className="h-11 w-full rounded-lg border border-gray-200 pl-9 pr-3 text-sm font-semibold text-gray-900 outline-none focus:border-[#1DBF73] focus:ring-2 focus:ring-[#1DBF73]/20"
            />
          </div>

          <div className="max-h-[470px] divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-100">
            {memberOptions.length > 0 ? (
              memberOptions.map((member) => {
                const allowed = allowedUserIds.has(member.id);

                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-3 p-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {member.photo ? (
                        <img
                          src={member.photo}
                          alt=""
                          className="h-10 w-10 rounded-lg object-cover"
                        />
                      ) : (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-sm font-black text-white">
                          {(member.displayName || member.name || 'M')
                            .charAt(0)
                            .toUpperCase()}
                        </span>
                      )}

                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-gray-900">
                          {member.displayName || member.name || 'Member'}
                        </p>
                        <p className="truncate text-xs font-semibold text-gray-400">
                          {member.memberId || member.email || member.room || 'No ID'}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleMemberAccess(member.id)}
                      disabled={saving}
                      className={`inline-flex h-9 min-w-[98px] items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-black transition disabled:opacity-60 ${
                        allowed
                          ? 'bg-[#1DBF73] text-black hover:bg-[#19a463]'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {allowed ? (
                        <UserCheck className="h-3.5 w-3.5" />
                      ) : (
                        <UserX className="h-3.5 w-3.5" />
                      )}
                      {allowed ? 'Allowed' : 'Blocked'}
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-14 text-center">
                <CheckCircle2 className="mb-2 h-8 w-8 text-gray-300" />
                <p className="text-sm font-bold text-gray-400">No members found</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
