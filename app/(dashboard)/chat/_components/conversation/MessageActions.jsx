import { QUICK_REACTIONS } from '../../_constants/emojis';

export default function MessageActions({ isMine, onReply, onForward, onReact, onUnsend }) {
  return (
    <div className={`absolute top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-full bg-white p-1 shadow-lg ring-1 ring-black/5 group-hover:flex ${isMine ? 'right-full mr-2' : 'left-full ml-2'}`}>
      {QUICK_REACTIONS.slice(0, 3).map((emoji) => (
        <button key={emoji} type="button" onClick={() => onReact(emoji)} className="h-7 w-7 rounded-full hover:bg-[#F0F2F5]">
          {emoji}
        </button>
      ))}
      <button type="button" onClick={onReply} className="h-7 w-7 rounded-full text-xs hover:bg-[#F0F2F5]">↩</button>
      <button type="button" onClick={onForward} className="h-7 w-7 rounded-full text-xs hover:bg-[#F0F2F5]">↗</button>
      {isMine && <button type="button" onClick={onUnsend} className="h-7 w-7 rounded-full text-xs text-red-500 hover:bg-red-50">×</button>}
    </div>
  );
}
