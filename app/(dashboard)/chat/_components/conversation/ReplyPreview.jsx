export default function ReplyPreview({ message, onCancel }) {
  if (!message) return null;

  return (
    <div className="flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-2">
      <div className="h-9 w-1 rounded-full bg-[#0084FF]" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-[#0084FF]">Replying to {message.senderName || 'message'}</p>
        <p className="truncate text-sm text-[#65676B]">{message.text || 'Message'}</p>
      </div>
      <button type="button" onClick={onCancel} className="h-8 w-8 rounded-full hover:bg-[#F0F2F5]">×</button>
    </div>
  );
}
