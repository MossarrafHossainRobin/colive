export default function EmptyConversation({ mobile, onOpenSidebar }) {
  return (
    <div className="flex h-full flex-col bg-white">
      {mobile && (
        <div className="flex h-14 flex-shrink-0 items-center border-b border-gray-100 px-4 pt-[env(safe-area-inset-top)]">
          <button
            type="button"
            onClick={onOpenSidebar}
            className="h-10 w-10 rounded-full hover:bg-[#F0F2F5] flex items-center justify-center"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <p className="ml-2 font-semibold text-[#050505]">Chats</p>
        </div>
      )}

      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <div className="mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-[#F0F2F5]">
          <svg className="h-12 w-12 text-[#0084FF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-[#050505]">Select a conversation</h2>
        <p className="mt-2 max-w-xs text-sm text-[#65676B]">Choose a member from the chat list and start messaging.</p>
        {mobile && (
          <button
            type="button"
            onClick={onOpenSidebar}
            className="mt-5 rounded-full bg-[#0084FF] px-5 py-2.5 text-sm font-semibold text-white"
          >
            Open chat list
          </button>
        )}
      </div>
    </div>
  );
}
