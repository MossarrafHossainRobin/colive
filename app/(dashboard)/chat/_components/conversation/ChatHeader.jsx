import Avatar from '../common/Avatar';
import IconButton from '../common/IconButton';
import { formatLastActive } from '../../_utils/formatChatTime';
import { getConversationName } from '../../_utils/conversationDisplay';

export default function ChatHeader({ activeChat, typingUsers = [], isBlocked, onBack, onInfo, onSearch }) {
  const otherUser = activeChat?.otherUser || {};
  const typing = typingUsers.length > 0;

  return (
    <div className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-gray-100 bg-white px-3 pt-[env(safe-area-inset-top)] lg:h-16 lg:px-4 lg:pt-0">
      <button
        type="button"
        onClick={onBack}
        className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-[#F0F2F5] lg:hidden"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <Avatar user={otherUser} size="md" showStatus />

      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[15px] font-bold text-[#050505]">
          {getConversationName(activeChat)}
        </h2>
        <p className={`truncate text-xs ${typing ? 'font-semibold text-[#0084FF]' : 'text-[#65676B]'}`}>
          {isBlocked ? 'Unavailable' : typing ? 'Typing...' : formatLastActive(otherUser)}
        </p>
      </div>

      <IconButton label="Search conversation" onClick={onSearch}>
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" />
        </svg>
      </IconButton>

      <IconButton label="Conversation info" onClick={onInfo}>
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 20a8 8 0 100-16 8 8 0 000 16z" />
        </svg>
      </IconButton>
    </div>
  );
}
