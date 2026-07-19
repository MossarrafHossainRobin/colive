'use client';

import { useRouter } from 'next/navigation';
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  MessageCircle,
  ReceiptText,
  ShoppingBag,
  Sparkles,
  Trophy,
  Utensils,
} from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { isMemberAccountActive } from '@/lib/memberPolicy';
import { isMemberOnline } from '@/lib/presence';

const money = (value) =>
  `৳${Math.max(0, Number(value) || 0).toLocaleString('en-BD', {
    maximumFractionDigits: 0,
  })}`;

function StatRow({ icon: Icon, label, value, tone = 'slate' }) {
  const tones = {
    orange: 'bg-orange-50 text-orange-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    rose: 'bg-rose-50 text-rose-600',
    blue: 'bg-blue-50 text-blue-600',
    slate: 'bg-slate-100 text-slate-600',
  };

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">
          {label}
        </span>
        <span className="mt-0.5 block truncate text-sm font-black text-slate-900">
          {value}
        </span>
      </span>
    </div>
  );
}

export default function RightSidebar({
  userData,
  members = [],
  allStats = {},
  selectedMember,
  myStats,
  currentStats,
}) {
  const { language } = useLanguage();
  const router = useRouter();

  const isMe = selectedMember === 'me';
  const selectedUser = isMe
    ? userData
    : members.find((member) => member.id === selectedMember);
  const displayStats = isMe ? allStats.me || myStats : currentStats;
  const totalBazar = Number(displayStats?.bazar ?? myStats?.totalBazarCost) || 0;
  const highestBazar = Number(myStats?.highestBazar) || 0;
  const bazarPercentage =
    highestBazar > 0
      ? Math.min(100, Math.round((totalBazar / highestBazar) * 100))
      : 0;
  const due = Math.max(0, Number(displayStats?.dues) || 0);
  const online = isMemberOnline(selectedUser);
  const accountActive = isMemberAccountActive(selectedUser);
  const name =
    selectedUser?.displayName ||
    selectedUser?.name ||
    (language === 'bn' ? 'সদস্য' : 'Member');
  const firstName = name.trim().split(/\s+/)[0];

  const title =
    bazarPercentage >= 80
      ? language === 'bn'
        ? 'শীর্ষ অবদানকারী'
        : 'Top contributor'
      : bazarPercentage >= 50
        ? language === 'bn'
          ? 'দারুণ অবদান'
          : 'Strong contributor'
        : language === 'bn'
          ? 'উন্নতির পথে'
          : 'Growing contributor';

  return (
    <aside className="hidden h-full w-[300px] shrink-0 flex-col border-l border-slate-200 bg-white xl:flex 2xl:w-[340px]">
      <div className="border-b border-slate-100 p-5">
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            {selectedUser?.photo ? (
              <img
                src={selectedUser.photo}
                className="h-14 w-14 rounded-2xl object-cover ring-4 ring-slate-50"
                alt=""
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 text-lg font-black text-white ring-4 ring-slate-50">
                {name.charAt(0).toUpperCase()}
              </div>
            )}
            <span
              className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-[3px] border-white ${
                online ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            />
          </div>

          <div className="min-w-0 flex-1 pt-1">
            <p className="truncate text-base font-black text-slate-950">{name}</p>
            <p className="mt-0.5 truncate text-xs font-semibold text-slate-400">
              {selectedUser?.room || (language === 'bn' ? 'রুম নেই' : 'No room')}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span
                className={`rounded-full px-2 py-1 text-[9px] font-black ${
                  online
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {online ? 'ONLINE' : 'AWAY'}
              </span>
              <span
                className={`rounded-full px-2 py-1 text-[9px] font-black ${
                  accountActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-rose-50 text-rose-700'
                }`}
              >
                {accountActive ? 'ACTIVE MEMBER' : 'INACTIVE'}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            router.push(isMe ? '/chat' : `/chat?member=${selectedMember}`)
          }
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-bold text-white shadow-lg shadow-slate-950/10 transition hover:bg-blue-600"
        >
          <MessageCircle className="h-4 w-4" />
          {isMe ? 'Open messages' : `Message ${firstName}`}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50/70 p-4">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 p-4 text-white shadow-lg shadow-blue-600/15">
          <div className="flex items-center justify-between">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
              <Trophy className="h-[18px] w-[18px]" />
            </span>
            <Sparkles className="h-4 w-4 text-white/60" />
          </div>
          <p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-white/60">
            Monthly standing
          </p>
          <p className="mt-1 text-lg font-black">{title}</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-white transition-all duration-500"
              style={{ width: `${bazarPercentage}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] font-bold text-white/65">
            <span>{money(totalBazar)} contributed</span>
            <span>{bazarPercentage}% of top</span>
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Member snapshot
            </p>
            <Activity className="h-4 w-4 text-slate-300" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatRow
              icon={Utensils}
              label="Meals"
              value={displayStats?.meals || 0}
              tone="orange"
            />
            <StatRow
              icon={ShoppingBag}
              label="Bazar"
              value={money(totalBazar)}
              tone="emerald"
            />
            <StatRow
              icon={ReceiptText}
              label="Due"
              value={money(due)}
              tone={due > 0 ? 'rose' : 'blue'}
            />
            <StatRow
              icon={CalendarDays}
              label="Entries"
              value={displayStats?.bazarCount || 0}
              tone="slate"
            />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-100 bg-white p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Latest bazar
          </p>
          <div className="mt-3 flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <ShoppingBag className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-slate-900">
                {displayStats?.lastBazarPlace || 'No bazar yet'}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-slate-400">
                {displayStats?.lastBazarDate || 'No date available'}
              </p>
            </div>
          </div>
        </section>

        <section
          className={`rounded-3xl border p-4 ${
            due > 0
              ? 'border-rose-100 bg-rose-50'
              : 'border-emerald-100 bg-emerald-50'
          }`}
        >
          <div className="flex items-center gap-2">
            {due > 0 ? (
              <ReceiptText className="h-4 w-4 text-rose-600" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            )}
            <p
              className={`text-xs font-black ${
                due > 0 ? 'text-rose-700' : 'text-emerald-700'
              }`}
            >
              {due > 0 ? `${money(due)} payment pending` : 'All bills are clear'}
            </p>
          </div>
        </section>
      </div>
    </aside>
  );
}
