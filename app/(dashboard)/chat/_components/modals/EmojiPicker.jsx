import { EMOJI_GROUPS } from '../../_constants/emojis';
import { GIFS, STICKERS } from '../../_constants/gifs';

export default function EmojiPicker({ onEmojiSelect, onStickerSelect, onGifSelect, onClose }) {
  return (
    <div className="absolute bottom-[70px] left-3 right-3 z-50 rounded-3xl border border-gray-100 bg-white p-3 shadow-2xl lg:left-6 lg:right-auto lg:w-96">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold text-[#050505]">Emoji & media</p>
        <button type="button" onClick={onClose} className="h-8 w-8 rounded-full hover:bg-[#F0F2F5]">×</button>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-8 gap-1">
          {EMOJI_GROUPS.flat().map((emoji) => (
            <button key={emoji} type="button" onClick={() => onEmojiSelect(emoji)} className="h-9 rounded-xl text-xl hover:bg-[#F0F2F5]">
              {emoji}
            </button>
          ))}
        </div>

        <div>
          <p className="mb-1 text-xs font-bold uppercase text-[#65676B]">Stickers</p>
          <div className="flex flex-wrap gap-1">
            {STICKERS.map((sticker) => (
              <button key={sticker} type="button" onClick={() => onStickerSelect(sticker)} className="h-9 w-9 rounded-xl text-2xl hover:bg-[#F0F2F5]">
                {sticker}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-bold uppercase text-[#65676B]">GIFs</p>
          <div className="grid grid-cols-2 gap-2">
            {GIFS.map((gif) => (
              <button key={gif.url} type="button" onClick={() => onGifSelect(gif)} className="overflow-hidden rounded-xl border border-gray-100 text-left hover:bg-[#F0F2F5]">
                <img src={gif.url} alt={gif.label} className="h-20 w-full object-cover" />
                <p className="px-2 py-1 text-xs font-semibold text-[#050505]">{gif.label}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
