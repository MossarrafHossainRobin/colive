'use client';

import { useState } from 'react';
import { Archive, Bell, BellOff, CircleOff, Pin, PinOff, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  archiveConversation,
  deleteConversationForUser,
  pinConversation,
} from '../../_services/conversationService';

function ActionRow({ icon, title, subtitle, danger, onClick, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left hover:bg-[#f2f2f2] disabled:opacity-50 ${danger ? 'text-[#e41e3f]' : 'text-[#050505]'}`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${danger ? 'bg-[#ffebeF]' : 'bg-[#e4e6eb]'}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-[14px] font-medium">{title}</span>
        {subtitle && <span className="block truncate text-[12px] text-[#65676b]">{subtitle}</span>}
      </span>
    </button>
  );
}

export default function ChatPreferenceActions({
  userId,
  conversationId,
  pinned,
  archived,
  muted,
  blocked,
  onMute,
  onBlock,
  onConversationRemoved,
}) {
  const [working, setWorking] = useState('');

  async function run(name, action, success, remove = false) {
    setWorking(name);
    try {
      await action();
      toast.success(success);
      if (remove) onConversationRemoved?.();
    } catch (error) {
      toast.error('Could not update the conversation');
      console.error(error);
    } finally {
      setWorking('');
    }
  }

  function handleDelete() {
    if (!window.confirm('Delete this conversation from your inbox? The other person will still have their copy.')) return;
    run('delete', () => deleteConversationForUser(conversationId, userId), 'Conversation deleted', true);
  }

  return (
    <div>
      <ActionRow
        icon={muted ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
        title={muted ? 'Unmute notifications' : 'Mute notifications'}
        subtitle={muted ? 'Start receiving message alerts' : 'Stop receiving message alerts'}
        onClick={() => onMute?.(!muted)}
      />
      <ActionRow
        icon={pinned ? <PinOff className="h-5 w-5" /> : <Pin className="h-5 w-5" />}
        title={pinned ? 'Unpin conversation' : 'Pin conversation'}
        onClick={() => run('pin', () => pinConversation(conversationId, userId, !pinned), pinned ? 'Conversation unpinned' : 'Conversation pinned')}
        disabled={working === 'pin'}
      />
      <ActionRow
        icon={<Archive className="h-5 w-5" />}
        title={archived ? 'Unarchive conversation' : 'Archive conversation'}
        onClick={() => run('archive', () => archiveConversation(conversationId, userId, !archived), archived ? 'Conversation unarchived' : 'Conversation archived', !archived)}
        disabled={working === 'archive'}
      />
      <ActionRow
        icon={<CircleOff className="h-5 w-5" />}
        title={blocked ? 'Unblock member' : 'Block member'}
        subtitle={blocked ? 'Allow this member to message you' : 'Stop messages from this member'}
        danger={!blocked}
        onClick={() => onBlock?.(!blocked)}
      />
      <ActionRow
        icon={<Trash2 className="h-5 w-5" />}
        title="Delete conversation"
        subtitle="Remove this chat from your inbox"
        danger
        onClick={handleDelete}
        disabled={working === 'delete'}
      />
    </div>
  );
}
