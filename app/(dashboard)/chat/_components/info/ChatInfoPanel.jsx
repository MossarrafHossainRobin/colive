'use client';

import { useState } from 'react';
import {
  Bell,
  BellOff,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  Pencil,
  Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import MemberProfileCard from './MemberProfileCard';
import MemberActivityStats from './MemberActivityStats';
import MemberFinancialStats from './MemberFinancialStats';
import ChatPreferenceActions from './ChatPreferenceActions';
import { useChatPreferences } from '../../_hooks/useChatPreferences';
import { useMemberStats } from '../../_hooks/useMemberStats';

function hasOriginalEmail(member) {
  return typeof member?.email === 'string' && member.email.trim().includes('@');
}

function getSharedItems(activeChat, keys) {
  for (const key of keys) {
    if (Array.isArray(activeChat?.[key])) return activeChat[key];
    if (Array.isArray(activeChat?.convData?.[key])) return activeChat.convData[key];
  }
  return [];
}

function MissingMemberPanel() {
  return (
    <div className="flex h-full items-center justify-center bg-white p-8 text-center">
      <div>
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[#f0f2f5]">
          <span className="text-2xl font-bold text-[#65676b]">?</span>
        </div>
        <p className="text-[15px] font-semibold text-[#050505]">Profile unavailable</p>
        <p className="mt-1 text-[13px] leading-5 text-[#65676b]">
          This conversation is not connected to a member profile.
        </p>
      </div>
    </div>
  );
}

function QuickAction({ icon, label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-w-0 flex-1 flex-col items-center gap-2 px-1 py-2"
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-full transition group-hover:bg-[#d8dadf] ${active ? 'bg-[#e7f3ff] text-[#0084ff]' : 'bg-[#e4e6eb] text-[#050505]'}`}>
        {icon}
      </span>
      <span className="w-full truncate text-center text-[12px] font-medium text-[#050505]">
        {label}
      </span>
    </button>
  );
}

function InfoSection({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="border-t border-[#e4e6eb]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center justify-between px-4 py-3 text-left hover:bg-[#f2f2f2]"
      >
        <span className="text-[15px] font-semibold text-[#050505]">{title}</span>
        <ChevronDown className={`h-5 w-5 text-[#65676b] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-2 pb-3">{children}</div>}
    </section>
  );
}

function NicknameEditor({ value, onChange, onSave, onCancel, saving }) {
  return (
    <form onSubmit={onSave} className="px-2 pb-2">
      <label htmlFor="chat-nickname" className="mb-2 block text-[13px] font-medium text-[#65676b]">
        Nickname
      </label>
      <input
        id="chat-nickname"
        autoFocus
        value={value}
        maxLength={50}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Enter a nickname"
        className="h-10 w-full rounded-lg border border-[#ccd0d5] px-3 text-sm text-[#050505] outline-none focus:border-[#0084ff] focus:ring-2 focus:ring-[#0084ff]/20"
      />
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="h-9 px-3 text-sm font-semibold text-[#0084ff] hover:bg-[#f0f2f5]">
          Cancel
        </button>
        <button disabled={saving} type="submit" className="h-9 rounded-md bg-[#0084ff] px-4 text-sm font-semibold text-white hover:bg-[#0073e6] disabled:opacity-50">
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  );
}

function SettingRow({ icon, title, subtitle, onClick }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left hover:bg-[#f2f2f2]">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e4e6eb] text-[#050505]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-medium text-[#050505]">{title}</span>
        {subtitle && <span className="block truncate text-[12px] text-[#65676b]">{subtitle}</span>}
      </span>
    </button>
  );
}

function EmptySharedContent({ icon, label }) {
  return (
    <div className="flex flex-col items-center px-4 py-7 text-center text-[#65676b]">
      {icon}
      <p className="mt-2 text-[13px]">{label}</p>
    </div>
  );
}

function SharedContent({ activeChat }) {
  const [tab, setTab] = useState('media');
  const media = getSharedItems(activeChat, ['sharedMedia', 'media', 'photos', 'images']);
  const files = getSharedItems(activeChat, ['sharedFiles', 'files', 'attachments']);
  const links = getSharedItems(activeChat, ['sharedLinks', 'links']);

  return (
    <div>
      <div className="mb-2 grid grid-cols-3 border-b border-[#e4e6eb]">
        {['media', 'files', 'links'].map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`border-b-2 px-2 py-2 text-[13px] font-semibold capitalize ${tab === item ? 'border-[#0084ff] text-[#0084ff]' : 'border-transparent text-[#65676b] hover:bg-[#f2f2f2]'}`}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === 'media' && (media.length ? (
        <div className="grid grid-cols-3 gap-1 px-2">
          {media.slice(0, 12).map((item, index) => {
            const src = typeof item === 'string' ? item : item?.url || item?.src || item?.image;
            return (
              <a key={src || index} href={src || '#'} target={src ? '_blank' : undefined} rel="noreferrer" className="aspect-square overflow-hidden bg-[#f0f2f5]">
                {/* eslint-disable-next-line @next/next/no-img-element -- sources are user-provided remote URLs */}
                {src ? <img src={src} alt="Shared attachment" className="h-full w-full object-cover transition hover:opacity-90" /> : <span className="flex h-full items-center justify-center"><ImageIcon className="h-5 w-5" /></span>}
              </a>
            );
          })}
        </div>
      ) : <EmptySharedContent icon={<ImageIcon className="h-7 w-7" />} label="No photos or videos yet" />)}

      {tab === 'files' && (files.length ? (
        <div>
          {files.slice(0, 10).map((item, index) => {
            const href = typeof item === 'string' ? item : item?.url || item?.href;
            const name = typeof item === 'string' ? item.split('/').pop() : item?.name || item?.filename || 'Shared file';
            return (
              <a key={href || index} href={href || '#'} target={href ? '_blank' : undefined} rel="noreferrer" className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-[#f2f2f2]">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e4e6eb]"><FileText className="h-5 w-5" /></span>
                <span className="min-w-0 truncate text-[13px] font-medium">{name}</span>
              </a>
            );
          })}
        </div>
      ) : <EmptySharedContent icon={<FileText className="h-7 w-7" />} label="No shared files yet" />)}

      {tab === 'links' && (links.length ? (
        <div>
          {links.slice(0, 10).map((item, index) => {
            const href = typeof item === 'string' ? item : item?.url || item?.href;
            const title = typeof item === 'string' ? item : item?.title || href || 'Shared link';
            return (
              <a key={href || index} href={href || '#'} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-[#f2f2f2]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e4e6eb]"><LinkIcon className="h-5 w-5" /></span>
                <span className="min-w-0 truncate text-[13px] font-medium text-[#0084ff]">{title}</span>
              </a>
            );
          })}
        </div>
      ) : <EmptySharedContent icon={<LinkIcon className="h-7 w-7" />} label="No shared links yet" />)}
    </div>
  );
}

export default function ChatInfoPanel({
  user,
  activeChat,
  onSearchConversation,
  onConversationRemoved,
  showNestHubStats = false,
}) {
  const preferences = useChatPreferences({ activeChat, user });
  const otherUser = activeChat?.otherUser;
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [savingNickname, setSavingNickname] = useState(false);
  const [muteOverride, setMuteOverride] = useState(null);
  const [blockOverride, setBlockOverride] = useState(null);
  const { stats, loading } = useMemberStats(showNestHubStats && hasOriginalEmail(otherUser) ? otherUser.id : null);
  const liveMuted = muteOverride?.conversationId === activeChat?.id ? muteOverride.value : Boolean(preferences.muted);
  const liveBlocked = blockOverride?.conversationId === activeChat?.id ? blockOverride.value : Boolean(preferences.blocked);

  if (!activeChat) return null;
  if (!hasOriginalEmail(otherUser)) return <MissingMemberPanel />;

  async function handleSaveNickname(event) {
    event.preventDefault();
    setSavingNickname(true);
    try {
      await preferences.saveNickname(nicknameInput.trim());
      setEditingNickname(false);
      toast.success(nicknameInput.trim() ? 'Nickname saved' : 'Nickname removed');
    } catch (error) {
      toast.error('Could not save nickname');
      console.error(error);
    } finally {
      setSavingNickname(false);
    }
  }

  async function updatePreference(type, nextValue) {
    const setter = type === 'mute' ? setMuteOverride : setBlockOverride;
    const action = type === 'mute' ? preferences.mute : preferences.block;
    const previous = type === 'mute' ? liveMuted : liveBlocked;
    setter({ conversationId: activeChat.id, value: nextValue });
    try {
      await action(nextValue);
      toast.success(type === 'mute' ? (nextValue ? 'Notifications muted' : 'Notifications unmuted') : (nextValue ? 'Member blocked' : 'Member unblocked'));
    } catch (error) {
      setter({ conversationId: activeChat.id, value: previous });
      toast.error('Could not update this setting');
      console.error(error);
    }
  }

  function handleSearch() {
    if (onSearchConversation) return onSearchConversation(activeChat);
    window.dispatchEvent(new CustomEvent('nesthub:chat-search-request', { detail: { conversationId: activeChat.id, memberId: otherUser.id } }));
  }

  return (
    <aside className="h-full overflow-y-auto bg-white text-[#050505] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <MemberProfileCard member={otherUser} nickname={preferences.nickname} blocked={liveBlocked} muted={liveMuted} />

      <div className="grid grid-cols-3 px-5 pb-5">
        <QuickAction icon={liveMuted ? <BellOff className="h-[18px] w-[18px]" /> : <Bell className="h-[18px] w-[18px]" />} label={liveMuted ? 'Unmute' : 'Mute'} active={liveMuted} onClick={() => updatePreference('mute', !liveMuted)} />
        <QuickAction icon={<Search className="h-[18px] w-[18px]" />} label="Search" onClick={handleSearch} />
        <QuickAction icon={<Pencil className="h-[18px] w-[18px]" />} label="Nickname" active={editingNickname} onClick={() => { setNicknameInput(preferences.nickname || ''); setEditingNickname(true); }} />
      </div>

      <InfoSection title="Chat info" defaultOpen>
        {editingNickname ? (
          <NicknameEditor value={nicknameInput} onChange={setNicknameInput} onSave={handleSaveNickname} saving={savingNickname} onCancel={() => setEditingNickname(false)} />
        ) : (
          <SettingRow icon={<Pencil className="h-5 w-5" />} title="Nicknames" subtitle={preferences.nickname || 'Add a nickname'} onClick={() => { setNicknameInput(preferences.nickname || ''); setEditingNickname(true); }} />
        )}
      </InfoSection>

      <InfoSection title="Media, files and links">
        <SharedContent activeChat={activeChat} />
      </InfoSection>

      {showNestHubStats && (
        <>
          <InfoSection title="NestHub activity"><MemberActivityStats stats={stats} loading={loading} /></InfoSection>
          <InfoSection title="Financial summary"><MemberFinancialStats stats={stats} loading={loading} /></InfoSection>
        </>
      )}

      <InfoSection title="Privacy & support">
        <ChatPreferenceActions
          userId={user?.uid}
          conversationId={activeChat.id}
          pinned={activeChat.isPinned}
          archived={activeChat.isArchived}
          muted={liveMuted}
          blocked={liveBlocked}
          onMute={(value) => updatePreference('mute', value)}
          onBlock={(value) => updatePreference('block', value)}
          onConversationRemoved={onConversationRemoved}
        />
      </InfoSection>
    </aside>
  );
}
