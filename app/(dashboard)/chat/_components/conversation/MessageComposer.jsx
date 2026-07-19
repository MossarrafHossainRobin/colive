'use client';

import { useEffect, useRef, useState } from 'react';
import ReplyPreview from './ReplyPreview';
import { EMOJI_GROUPS, QUICK_REACTIONS } from '../../_constants/emojis';
import { GIFS as CHAT_GIFS, STICKERS as CHAT_STICKERS } from '../../_constants/gifs';
import { Plus } from 'lucide-react';

function ComposerIconButton({ active = false, title, disabled, children, onClick }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-50 ${
        active
          ? 'bg-[#E7F3FF] text-[#0084FF]'
          : 'text-[#0084FF] hover:bg-[#F0F2F5]'
      }`}
    >
      {children}
    </button>
  );
}

function PanelShell({ title, children }) {
  return (
    <div className="mx-3 mb-2 max-h-[260px] overflow-y-auto rounded-[22px] border border-gray-100 bg-white p-3 shadow-2xl">
      <p className="mb-2 px-1 text-[12px] font-bold uppercase tracking-wide text-[#65676B]">
        {title}
      </p>

      {children}
    </div>
  );
}

export default function MessageComposer({
  text = '',
  setText,
  sending = false,
  replyingTo,
  onCancelReply,
  onSubmit,
  onQuickLike,
  onEmojiToggle,
  onStopTyping,
  onSendSticker,
  onSendGif,
}) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState('Smileys');
  const [gifQuery, setGifQuery] = useState('');
  const [toolsOpen, setToolsOpen] = useState(false);

  const inputRef = useRef(null);

  const cleanText = text.trim();
  const hasText = cleanText.length > 0;

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === 'Escape') {
        closePanels();
      }
    }

    document.addEventListener('keydown', handleEscape);

    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  useEffect(() => {
    const input = inputRef.current;

    if (!input) return;

    input.style.height = '24px';
    input.style.height = `${Math.min(input.scrollHeight, 112)}px`;
  }, [text]);

  function closePanels() {
    setEmojiOpen(false);
    setStickerOpen(false);
    setGifOpen(false);
    setToolsOpen(false);
  }

  function handleTextChange(value) {
    setText?.(value);
  }

  function insertEmoji(emoji) {
    handleTextChange(`${text || ''}${emoji}`);
    inputRef.current?.focus();
  }

  function handleEmojiButtonClick() {
    setEmojiOpen((prev) => !prev);
    setStickerOpen(false);
    setGifOpen(false);

    onEmojiToggle?.();
  }

  function handleStickerButtonClick() {
    setStickerOpen((prev) => !prev);
    setEmojiOpen(false);
    setGifOpen(false);
  }

  function handleGifButtonClick() {
    setGifOpen((prev) => !prev);
    setEmojiOpen(false);
    setStickerOpen(false);
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (sending) return;

    if (!hasText) {
      onQuickLike?.();
      closePanels();
      inputRef.current?.focus();
      return;
    }

    onSubmit?.(event);
    closePanels();

    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event);
    }
  }

  function handleSendSticker(sticker) {
    if (sending) return;

    if (onSendSticker) {
      onSendSticker(sticker);
    } else {
      insertEmoji(sticker);
    }

    closePanels();
  }

  function handleSendGif(gif) {
    if (sending) return;

    if (onSendGif) {
      onSendGif(gif);
    } else {
      handleTextChange(`${text || ''}${gif.label || 'GIF'}`);
    }

    closePanels();
  }

  return (
    <div className="flex-shrink-0 border-t border-gray-100 bg-white pb-[env(safe-area-inset-bottom)]">
      {replyingTo && (
        <ReplyPreview
          message={replyingTo}
          onCancel={onCancelReply}
        />
      )}

      {emojiOpen && (
        <PanelShell title="Emojis">
          <div className="mb-2 flex gap-1 overflow-x-auto border-b border-gray-100 pb-2">
            {Object.keys(EMOJI_GROUPS).map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setEmojiCategory(category)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                  emojiCategory === category
                    ? 'bg-[#e7f3ff] text-[#0084ff]'
                    : 'text-[#65676b] hover:bg-[#f0f2f5]'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-8 gap-1 sm:grid-cols-10">
            {EMOJI_GROUPS[emojiCategory].map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => insertEmoji(emoji)}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-[22px] transition hover:bg-[#F0F2F5] active:scale-95"
              >
                {emoji}
              </button>
            ))}
          </div>
        </PanelShell>
      )}

      {stickerOpen && (
        <PanelShell title="Stickers">
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-7">
            {CHAT_STICKERS.map((sticker) => (
              <button
                key={sticker}
                type="button"
                onClick={() => handleSendSticker(sticker)}
                className="flex h-14 items-center justify-center rounded-2xl bg-[#F0F2F5] text-[28px] transition hover:bg-[#E4E6EB] active:scale-95"
              >
                {sticker}
              </button>
            ))}
          </div>
        </PanelShell>
      )}

      {gifOpen && (
        <PanelShell title="GIFs">
          <input
            value={gifQuery}
            onChange={(event) => setGifQuery(event.target.value)}
            placeholder="Search GIFs"
            className="mb-3 h-9 w-full rounded-full bg-[#f0f2f5] px-4 text-sm outline-none focus:ring-2 focus:ring-[#0084ff]/20"
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CHAT_GIFS.filter((gif) =>
              gif.label.toLowerCase().includes(gifQuery.toLowerCase())
            ).map((gif) => (
              <button
                key={gif.url}
                type="button"
                onClick={() => handleSendGif(gif)}
                className="overflow-hidden rounded-2xl bg-[#F0F2F5] text-left transition active:scale-[0.99]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- animated remote GIF */}
                <img
                  src={gif.url}
                  alt={gif.label}
                  className="h-24 w-full object-cover"
                  loading="lazy"
                />

                <p className="truncate px-2 py-1.5 text-[12px] font-semibold text-[#050505]">
                  {gif.label}
                </p>
              </button>
            ))}
          </div>
        </PanelShell>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex min-h-[58px] items-end gap-1 bg-white px-2 py-2 sm:px-3"
      >
        <ComposerIconButton
          title={toolsOpen ? 'Close more actions' : 'More actions'}
          active={toolsOpen}
          disabled={sending}
          onClick={() => {
            setToolsOpen((value) => !value);
            if (toolsOpen) closePanels();
          }}
        >
          <Plus className={`h-5 w-5 transition-transform ${toolsOpen ? 'rotate-45' : ''}`} />
        </ComposerIconButton>

        {toolsOpen && (
          <>
        <ComposerIconButton
          title="Emoji"
          active={emojiOpen}
          disabled={sending}
          onClick={handleEmojiButtonClick}
        >
          <svg
            className="h-[21px] w-[21px]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M14.828 14.828a4 4 0 0 1-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
        </ComposerIconButton>

        <ComposerIconButton
          title="Sticker"
          active={stickerOpen}
          disabled={sending}
          onClick={handleStickerButtonClick}
        >
          <span className="text-[19px] leading-none">✨</span>
        </ComposerIconButton>

        <ComposerIconButton
          title="GIF"
          active={gifOpen}
          disabled={sending}
          onClick={handleGifButtonClick}
        >
          <span className="text-[11px] font-black leading-none">GIF</span>
        </ComposerIconButton>
          </>
        )}

        <div className="min-w-0 flex-1 rounded-[22px] bg-[#F0F2F5] px-3 py-2 transition focus-within:ring-2 focus-within:ring-[#0084FF]/20">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(event) => handleTextChange(event.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={onStopTyping}
            disabled={sending}
            rows={1}
            placeholder="Aa"
            className="max-h-28 min-h-[24px] w-full resize-none bg-transparent text-[15px] leading-6 text-[#050505] outline-none placeholder:text-[#8A8D91] disabled:opacity-70"
          />

        </div>

        {!toolsOpen && (
          <ComposerIconButton
            title="Emoji"
            active={emojiOpen}
            disabled={sending}
            onClick={handleEmojiButtonClick}
          >
            <span className="text-[19px] leading-none">{QUICK_REACTIONS[0]}</span>
          </ComposerIconButton>
        )}

        <button
          type="submit"
          disabled={sending}
          title={hasText ? 'Send' : 'Send like'}
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-60 ${
            hasText
              ? 'bg-[#0084FF] text-white hover:bg-[#0077E6]'
              : 'text-[#0084FF] hover:bg-[#F0F2F5]'
          }`}
        >
          {hasText ? (
            <svg
              className="h-[18px] w-[18px]"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2 .01 7Z" />
            </svg>
          ) : (
            <span className="text-[21px] leading-none">👍</span>
          )}
        </button>
      </form>
    </div>
  );
}
