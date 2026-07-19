import { formatMessageDate } from '../../_utils/formatChatTime';

export default function DateDivider({ timestamp }) {
  const label = formatMessageDate(timestamp);
  if (!label) return null;

  return (
    <div className="my-3 flex justify-center">
      <span className="rounded-full border border-gray-100 bg-white px-3 py-1 text-[12px] font-medium text-[#65676B] shadow-sm">
        {label}
      </span>
    </div>
  );
}
