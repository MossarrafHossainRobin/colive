export default function ArchivedChatsView({ archived = [], onBack, onSelectChat }) {
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex h-14 items-center gap-3 border-b border-gray-100 px-4">
        <button type="button" onClick={onBack} className="h-9 w-9 rounded-full hover:bg-[#F0F2F5] flex items-center justify-center">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-lg font-bold text-[#050505]">Archived chats</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {archived.length === 0 ? (
          <p className="text-center text-sm text-[#65676B] mt-10">No archived chats.</p>
        ) : (
          <div className="space-y-2">
            {archived.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onSelectChat(conversation)}
                className="w-full rounded-xl px-3 py-3 text-left hover:bg-[#F0F2F5]"
              >
                <p className="font-semibold text-[#050505]">{conversation.otherUser?.name || 'Member'}</p>
                <p className="truncate text-sm text-[#65676B]">{conversation.convData?.lastMessage || 'No messages yet'}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
