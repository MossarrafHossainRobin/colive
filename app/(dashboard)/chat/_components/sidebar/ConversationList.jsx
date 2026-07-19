'use client';

import ConversationItem from './ConversationItem';

export default function ConversationList({
  conversations = [],
  activeChat,
  currentUserId,
  showArchived = false,
  actionLoadingId = null,
  onSelectChat,
  onArchive,
  onUnarchive,
  onMute,
  onUnmute,
  onMarkRead,
  onPin,
  onDelete,
}) {
  const validConversations = conversations.filter((conversation) => {
    const otherUser = conversation?.otherUser;
    return otherUser?.id && otherUser?.email;
  });

  if (validConversations.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-[#F0F2F5] flex items-center justify-center mb-3">
          <span className="text-2xl">{showArchived ? '📦' : '💬'}</span>
        </div>

        <p className="text-[15px] font-semibold text-[#050505]">
          {showArchived ? 'No archived chats' : 'No conversations yet'}
        </p>

        <p className="text-[13px] text-[#65676B] mt-1 leading-relaxed">
          {showArchived
            ? 'Archived conversations will appear here.'
            : 'Search a member to start chatting.'}
        </p>
      </div>
    );
  }

  return (
    <div className="px-2 py-2 space-y-0.5">
      {validConversations.map((conversation) => (
        <ConversationItem
          key={conversation.id}
          conversation={conversation}
          active={activeChat?.id === conversation.id}
          currentUserId={currentUserId}
          showArchived={showArchived}
          loading={actionLoadingId === conversation.id}
          onClick={onSelectChat}
          onArchive={onArchive}
          onUnarchive={onUnarchive}
          onMute={onMute}
          onUnmute={onUnmute}
          onMarkRead={onMarkRead}
          onPin={onPin}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
