'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy,
  Edit3,
  Forward,
  MoreHorizontal,
  Pin,
  Reply,
  Trash2,
  X,
} from 'lucide-react';
import MessageStatus from './MessageStatus';
import Avatar from '../common/Avatar';

const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍'];

function getName(user) {
  return (
    user?.name ||
    user?.displayName ||
    user?.fullName ||
    user?.email ||
    'Member'
  );
}

function getText(message) {
  return message?.text || message?.message || message?.content || '';
}

function getMessageId(message) {
  return message?.id || message?.messageId || message?.docId || '';
}

function getMessageSenderId(message) {
  return (
    message?.senderId ||
    message?.senderUid ||
    message?.senderUID ||
    message?.sender?.uid ||
    message?.sender?.id ||
    message?.uid ||
    message?.userId ||
    message?.from ||
    ''
  );
}

function isMyMessage(message, user, currentUserId) {
  const senderId = String(getMessageSenderId(message) || '');

  const possibleMyIds = [currentUserId, user?.uid, user?.id, user?.email]
    .filter(Boolean)
    .map((item) => String(item));

  return possibleMyIds.includes(senderId);
}

function getTime(message) {
  const date =
    message?.createdAt?.toDate?.() ||
    message?.createdAt ||
    (message?.localCreatedAt ? new Date(message.localCreatedAt) : null);

  if (!date) return '';

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function isImageUrl(value) {
  if (!value) return false;

  return /^https?:\/\/.+\.(gif|png|jpg|jpeg|webp)(\?.*)?$/i.test(value);
}

function isEmojiOnly(value) {
  const text = String(value || '').trim();

  if (!text) return false;
  if (text.length > 12) return false;
  if (/[a-zA-Z0-9]/.test(text)) return false;

  return /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text);
}

function isMobileViewport() {
  if (typeof window === 'undefined') return false;

  return window.innerWidth < 1024;
}

function normalizeReactionValue(value) {
  if (!value) return '';

  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'object') {
    return (
      value.emoji ||
      value.reaction ||
      value.value ||
      value.type ||
      ''
    ).trim();
  }

  return String(value).trim();
}

function getCurrentReaction(message, currentUserId, user, localReaction) {
  return (
    localReaction ||
    normalizeReactionValue(message?.reactions?.[currentUserId]) ||
    normalizeReactionValue(message?.reactions?.[user?.uid]) ||
    normalizeReactionValue(message?.reactions?.[user?.email]) ||
    ''
  );
}

function getReactionEntries({
  reactions,
  currentUserId,
  user,
  localReaction,
}) {
  if (!reactions && !localReaction) return [];

  const myKeys = [currentUserId, user?.uid, user?.email]
    .filter(Boolean)
    .map((item) => String(item));

  const countMap = new Map();

  if (Array.isArray(reactions)) {
    reactions.forEach((reaction) => {
      const emoji = normalizeReactionValue(reaction);

      if (!emoji) return;

      countMap.set(emoji, (countMap.get(emoji) || 0) + 1);
    });
  } else if (reactions && typeof reactions === 'object') {
    Object.entries(reactions).forEach(([reactorId, reaction]) => {
      if (localReaction && myKeys.includes(String(reactorId))) {
        return;
      }

      const emoji = normalizeReactionValue(reaction);

      if (!emoji) return;

      countMap.set(emoji, (countMap.get(emoji) || 0) + 1);
    });
  }

  if (localReaction) {
    countMap.set(localReaction, (countMap.get(localReaction) || 0) + 1);
  }

  return Array.from(countMap.entries()).map(([emoji, count]) => ({
    emoji,
    count,
  }));
}

function ReactionBar({
  message,
  currentUserId,
  user,
  localReaction,
  onChooseReaction,
  large = false,
}) {
  const messageId = getMessageId(message);
  const currentReaction = getCurrentReaction(
    message,
    currentUserId,
    user,
    localReaction
  );

  return (
    <div
      className={`flex items-center justify-center gap-1 rounded-full border border-gray-100 bg-white px-1.5 py-1 shadow-2xl ${
        large ? 'w-full max-w-[360px]' : ''
      }`}
    >
      {QUICK_REACTIONS.map((emoji, index) => {
        const active = currentReaction === emoji;

        return (
          <button
            key={`${emoji}-${index}`}
            type="button"
            disabled={!messageId || String(messageId).startsWith('local-')}
            onClick={(event) => {
              event.stopPropagation();

              if (!messageId) return;

              onChooseReaction?.(emoji);
            }}
            className={`flex items-center justify-center rounded-full text-[22px] transition hover:scale-125 active:scale-95 disabled:opacity-40 ${
              large ? 'h-10 w-10' : 'h-9 w-9'
            } ${active ? 'bg-[#E7F3FF]' : 'hover:bg-[#F0F2F5]'}`}
          >
            {emoji}
          </button>
        );
      })}
    </div>
  );
}

function ReactionSummary({
  reactions,
  isMine,
  currentUserId,
  user,
  localReaction,
}) {
  const entries = getReactionEntries({
    reactions,
    currentUserId,
    user,
    localReaction,
  });

  if (!entries.length) return null;

  const total = entries.reduce((sum, item) => sum + item.count, 0);

  return (
    <div
      className={`absolute -bottom-4 z-10 flex items-center gap-0.5 rounded-full border border-white bg-white px-1.5 py-0.5 text-[12px] shadow-md ${
        isMine ? 'right-1' : 'left-1'
      }`}
    >
      {entries.slice(0, 3).map((entry, index) => (
        <span key={`${entry.emoji}-${index}`}>{entry.emoji}</span>
      ))}

      {total > 1 && (
        <span className="ml-0.5 text-[10px] font-bold text-[#65676B]">
          {total}
        </span>
      )}
    </div>
  );
}

function ReplyPreviewInsideBubble({ replyTo, isMine, transparent }) {
  if (!replyTo) return null;

  return (
    <div
      className={`mb-1.5 max-w-full rounded-2xl border-l-4 px-3 py-2 text-left ${
        isMine
          ? 'border-white/70 bg-white/15 text-white'
          : 'border-[#0084FF] bg-white/70 text-[#050505]'
      } ${transparent ? 'border-[#0084FF] bg-[#F0F2F5] text-[#050505]' : ''}`}
    >
      <p className="text-[11px] font-bold opacity-80">
        {replyTo.senderName || 'User'}
      </p>

      <p className="line-clamp-2 text-[12px] opacity-90">
        {replyTo.text || 'Attachment'}
      </p>
    </div>
  );
}

function MessageContent({ message, isMine, transparent }) {
  const text = getText(message);

  if (message?.unsent) {
    return (
      <p className="text-[13px] italic text-[#65676B]">
        {isMine ? 'You unsent a message' : 'This message was unsent'}
      </p>
    );
  }

  const isGif = message?.isGIF || message?.type === 'gif';
  const isAdminActivity = message?.type === 'admin_activity';
  const isSticker = message?.isSticker || message?.type === 'sticker';
  const isReaction = message?.isReaction || message?.type === 'reaction';
  const emojiOnly = isEmojiOnly(text);

  if (isAdminActivity) {
    const activity = message?.adminActivity || {};
    const categoryStyles = {
      bazar: 'border-emerald-500 bg-emerald-50 text-emerald-800',
      bazar_assignment: 'border-amber-500 bg-amber-50 text-amber-800',
      meal: 'border-orange-500 bg-orange-50 text-orange-800',
      bill: 'border-blue-500 bg-blue-50 text-blue-800',
      service: 'border-violet-500 bg-violet-50 text-violet-800',
      announcement: 'border-rose-500 bg-rose-50 text-rose-800',
    };
    const style =
      categoryStyles[activity.category] ||
      'border-[#0084ff] bg-[#f0f7ff] text-[#050505]';

    return (
      <div className={`w-[min(72vw,360px)] border-l-4 px-4 py-3 ${style}`}>
        <p className="text-[11px] font-bold uppercase text-[#65676b]">
          NestHub update
        </p>
        <p className="mt-1 text-[15px] font-bold">{activity.title || 'Account update'}</p>
        <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-5 text-[#1c1e21]">
          {text}
        </p>
      </div>
    );
  }

  if (isGif || isImageUrl(text)) {
    return (
      <div className="overflow-hidden rounded-[18px] bg-transparent">
        {/* eslint-disable-next-line @next/next/no-img-element -- animated/user-provided media */}
        <img
          src={text}
          alt={message?.gifLabel || 'GIF'}
          className="max-h-64 max-w-[230px] rounded-[18px] object-cover sm:max-w-[320px]"
          loading="lazy"
        />
      </div>
    );
  }

  if (isSticker || isReaction || emojiOnly) {
    return (
      <span className="inline-block bg-transparent text-[42px] leading-none">
        {text}
      </span>
    );
  }

  return (
    <p
      className={`whitespace-pre-wrap break-words text-[15px] leading-[20px] ${
        isMine ? 'text-white' : 'text-[#050505]'
      } ${transparent ? 'text-[#050505]' : ''}`}
    >
      {text}
    </p>
  );
}

function ActionButton({ icon: Icon, label, danger = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-semibold transition active:scale-95 ${
        danger
          ? 'text-red-600 hover:bg-red-50'
          : 'text-[#050505] hover:bg-[#F0F2F5]'
      }`}
    >
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-full ${
          danger ? 'bg-red-50' : 'bg-[#F0F2F5]'
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>

      <span>{label}</span>
    </button>
  );
}

function DesktopActionMenu({
  message,
  isMine,
  onReply,
  onForward,
  onUnsend,
  onRemoveForMe,
  onEdit,
  onPin,
  onClose,
}) {
  const text = getText(message);
  const messageId = getMessageId(message);

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('Copy failed:', error);
    }

    onClose?.();
  }

  const actions = [
    {
      label: 'Reply',
      icon: Reply,
      show: true,
      onClick: () => onReply?.(message),
    },
    {
      label: 'Copy',
      icon: Copy,
      show: Boolean(text) && !message?.unsent,
      onClick: copyMessage,
    },
    {
      label: 'Forward',
      icon: Forward,
      show: !message?.unsent,
      onClick: () => onForward?.(message),
    },
    {
      label: 'Edit',
      icon: Edit3,
      show: isMine && Boolean(onEdit) && !message?.unsent,
      onClick: () => onEdit?.(message),
    },
    {
      label: 'Pin',
      icon: Pin,
      show: Boolean(onPin) && !message?.unsent,
      onClick: () => onPin?.(message),
    },
    {
      label: 'Remove for you',
      icon: Trash2,
      show:
        Boolean(messageId) &&
        !String(messageId).startsWith('local-'),
      danger: false,
      onClick: () => onRemoveForMe?.(messageId),
    },
    {
      label: 'Unsend for everyone',
      icon: Trash2,
      show:
        isMine &&
        !message?.unsent &&
        Boolean(messageId) &&
        !String(messageId).startsWith('local-'),
      danger: true,
      onClick: () => onUnsend?.(messageId),
    },
  ].filter((action) => action.show);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white py-1.5 shadow-2xl">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            action.onClick?.();
            onClose?.();
          }}
          className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-[13px] font-semibold transition hover:bg-[#F0F2F5] ${
            action.danger ? 'text-red-600' : 'text-[#050505]'
          }`}
        >
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-full ${
              action.danger ? 'bg-red-50' : 'bg-[#F0F2F5]'
            }`}
          >
            <action.icon className="h-4 w-4" />
          </span>

          <span>{action.label}</span>
        </button>
      ))}
    </div>
  );
}

function MobileMessagePanel({
  open,
  message,
  isMine,
  currentUserId,
  user,
  localReaction,
  onClose,
  onReply,
  onForward,
  onUnsend,
  onRemoveForMe,
  onEdit,
  onPin,
  onChooseReaction,
}) {
  const text = getText(message);
  const messageId = getMessageId(message);

  useEffect(() => {
    if (!open) return;

    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('Copy failed:', error);
    }

    onClose?.();
  }

  return (
    <div className="fixed inset-0 z-[1400] lg:hidden">
      <button
        type="button"
        aria-label="Close message panel"
        onClick={onClose}
        className="absolute inset-0 bg-black/35"
      />

      <div className="absolute bottom-0 left-0 right-0 rounded-t-[28px] bg-white shadow-2xl">
        <div className="flex justify-center px-4 pb-2 pt-3">
          <span className="h-1 w-10 rounded-full bg-[#DADDE1]" />
        </div>

        <div className="px-4 pb-4">
          {!message?.unsent && (
            <div className="mb-4 flex justify-center">
              <ReactionBar
                message={message}
                currentUserId={currentUserId}
                user={user}
                localReaction={localReaction}
                onChooseReaction={onChooseReaction}
                large
              />
            </div>
          )}

          <div className="mb-3 flex items-center justify-between">
            <p className="text-[15px] font-bold text-[#050505]">
              Message options
            </p>

            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F0F2F5]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1">
            <ActionButton
              icon={Reply}
              label="Reply"
              onClick={() => {
                onReply?.(message);
                onClose?.();
              }}
            />

            {text && !message?.unsent && (
              <ActionButton icon={Copy} label="Copy" onClick={copyMessage} />
            )}

            {!message?.unsent && (
              <ActionButton
                icon={Forward}
                label="Forward"
                onClick={() => {
                  onForward?.(message);
                  onClose?.();
                }}
              />
            )}

            {Boolean(onPin) && !message?.unsent && (
              <ActionButton
                icon={Pin}
                label="Pin"
                onClick={() => {
                  onPin?.(message);
                  onClose?.();
                }}
              />
            )}

            {isMine && Boolean(onEdit) && !message?.unsent && (
              <ActionButton
                icon={Edit3}
                label="Edit"
                onClick={() => {
                  onEdit?.(message);
                  onClose?.();
                }}
              />
            )}

            {isMine &&
              !message?.unsent &&
              Boolean(messageId) &&
              !String(messageId).startsWith('local-') && (
                <ActionButton
                  icon={Trash2}
                  label="Unsend everyone"
                  danger
                  onClick={() => {
                    onUnsend?.(messageId);
                    onClose?.();
                  }}
                />
              )}

            {Boolean(messageId) &&
              !String(messageId).startsWith('local-') && (
                <ActionButton
                  icon={Trash2}
                  label="Remove for you"
                  onClick={() => {
                    onRemoveForMe?.(messageId);
                    onClose?.();
                  }}
                />
              )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MessageBubble({
  message,
  user,
  activeChat,
  currentUserId,
  otherUser,
  compactTop = false,
  compactBottom = false,
  showDeliveryStatus = false,
  onReply,
  onForward,
  onReact,
  onRemoveReaction,
  onRemoveForMe,
  onUnsend,
  onEdit,
  onPin,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [desktopReactionOpen, setDesktopReactionOpen] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [localReaction, setLocalReaction] = useState('');

  const bubbleWrapRef = useRef(null);
  const longPressTimerRef = useRef(null);

  const messageId = getMessageId(message);
  const isMine = isMyMessage(message, user, currentUserId);

  const text = getText(message);
  const emojiOnly = isEmojiOnly(text);

  const transparent =
    message?.isSticker ||
    message?.isGIF ||
    message?.isReaction ||
    message?.type === 'admin_activity' ||
    message?.type === 'sticker' ||
    message?.type === 'gif' ||
    message?.type === 'reaction' ||
    emojiOnly;

  const sender = useMemo(() => {
    if (isMine) {
      return {
        name: user?.displayName || user?.email || 'You',
        photo: user?.photoURL || '',
      };
    }

    return otherUser || activeChat?.otherUser || {};
  }, [isMine, user, otherUser, activeChat]);

  useEffect(() => {
    if (!menuOpen && !desktopReactionOpen) return;

    const handlePointerDown = (event) => {
      if (
        bubbleWrapRef.current &&
        bubbleWrapRef.current.contains(event.target)
      ) {
        return;
      }

      setMenuOpen(false);
      setDesktopReactionOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);

    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [menuOpen, desktopReactionOpen]);

  function handleChooseReaction(emoji) {
    if (!messageId || String(messageId).startsWith('local-')) return;

    const currentReaction = getCurrentReaction(
      message,
      currentUserId,
      user,
      localReaction
    );

    if (currentReaction === emoji) {
      setLocalReaction('');
      onRemoveReaction?.(messageId);
    } else {
      setLocalReaction(emoji);
      onReact?.(messageId, emoji);
    }

    setDesktopReactionOpen(false);
    setMobilePanelOpen(false);
  }

  function openMobilePanel() {
    setMobilePanelOpen(true);
    setMenuOpen(false);
    setDesktopReactionOpen(false);
  }

  function handleBubbleClick() {
    if (isMobileViewport()) {
      openMobilePanel();
      return;
    }

    setDesktopReactionOpen((prev) => !prev);
  }

  function startLongPress() {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
    }

    longPressTimerRef.current = window.setTimeout(() => {
      openMobilePanel();

      if (navigator?.vibrate) {
        navigator.vibrate(12);
      }
    }, 320);
  }

  function clearLongPress() {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  const bubbleRadius = isMine
    ? `${compactTop ? 'rounded-tr-md' : 'rounded-tr-[22px]'} ${
        compactBottom ? 'rounded-br-md' : 'rounded-br-[22px]'
      } rounded-l-[22px]`
    : `${compactTop ? 'rounded-tl-md' : 'rounded-tl-[22px]'} ${
        compactBottom ? 'rounded-bl-md' : 'rounded-bl-[22px]'
      } rounded-r-[22px]`;

  const bubbleClass = transparent
    ? 'bg-transparent px-0 py-0 shadow-none'
    : isMine
      ? `bg-[#0084FF] px-3.5 py-2 shadow-sm ${bubbleRadius}`
      : `bg-[#F0F2F5] px-3.5 py-2 shadow-sm ${bubbleRadius}`;

  return (
    <>
      <div
        className={`group relative flex w-full gap-2 px-1 ${
          compactTop ? 'mt-0.5' : 'mt-2'
        } ${compactBottom ? 'mb-0.5' : 'mb-2'} ${
          isMine ? 'justify-end' : 'justify-start'
        }`}
      >
        {!isMine && (
          <div className="flex w-8 flex-shrink-0 items-end">
            {!compactBottom ? (
              <Avatar user={sender} size="xs" showStatus />
            ) : (
              <div className="h-8 w-8" />
            )}
          </div>
        )}

        <div
          ref={bubbleWrapRef}
          className={`relative flex max-w-[78%] flex-col ${
            isMine ? 'items-end' : 'items-start'
          } sm:max-w-[68%]`}
        >
          {!isMine && !compactTop && (
            <p className="mb-1 ml-2 text-[11px] font-semibold text-[#65676B]">
              {getName(sender)}
            </p>
          )}

          <div className="relative">
            {desktopReactionOpen && !message?.unsent && (
              <div
                className={`absolute z-50 hidden lg:flex ${
                  isMine ? 'right-0' : 'left-0'
                } -top-12`}
              >
                <ReactionBar
                  message={message}
                  currentUserId={currentUserId}
                  user={user}
                  localReaction={localReaction}
                  onChooseReaction={handleChooseReaction}
                />
              </div>
            )}

            <button
              type="button"
              onClick={handleBubbleClick}
              onTouchStart={startLongPress}
              onTouchEnd={clearLongPress}
              onTouchCancel={clearLongPress}
              className="relative block max-w-full text-left outline-none"
            >
              <div className={`relative ${bubbleClass}`}>
                <ReplyPreviewInsideBubble
                  replyTo={message?.replyTo}
                  isMine={isMine}
                  transparent={transparent}
                />

                <MessageContent
                  message={message}
                  isMine={isMine}
                  transparent={transparent}
                />

                <ReactionSummary
                  reactions={message?.reactions}
                  isMine={isMine}
                  currentUserId={currentUserId}
                  user={user}
                  localReaction={localReaction}
                />
              </div>
            </button>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen((prev) => !prev);
                setDesktopReactionOpen(false);
              }}
              className={`absolute top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#65676B] opacity-0 shadow-md transition hover:bg-[#F0F2F5] hover:text-[#050505] group-hover:opacity-100 lg:flex ${
                isMine ? '-left-10' : '-right-10'
              } ${menuOpen ? 'opacity-100' : ''}`}
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>

            {menuOpen && (
              <div
                className={`absolute z-50 mt-2 w-56 ${
                  isMine ? 'right-0' : 'left-0'
                }`}
              >
                <DesktopActionMenu
                  message={message}
                  isMine={isMine}
                  onReply={onReply}
                  onForward={onForward}
                  onUnsend={onUnsend}
                  onRemoveForMe={onRemoveForMe}
                  onEdit={onEdit}
                  onPin={onPin}
                  onClose={() => setMenuOpen(false)}
                />
              </div>
            )}
          </div>

          {!compactBottom && (
            <div
              className={`mt-1 flex items-center gap-1 px-2 text-[10px] text-[#8A8D91] ${
                isMine ? 'justify-end' : 'justify-start'
              }`}
            >
              <span>{getTime(message)}</span>

              {isMine && showDeliveryStatus && (
                <MessageStatus
                  status={message?.status}
                  seen={message?.seen}
                  seenUser={otherUser || activeChat?.otherUser}
                />
              )}
            </div>
          )}
        </div>

        {isMine && <div className="w-2 flex-shrink-0" />}
      </div>

      <MobileMessagePanel
        open={mobilePanelOpen}
        message={message}
        isMine={isMine}
        currentUserId={currentUserId}
        user={user}
        localReaction={localReaction}
        onClose={() => setMobilePanelOpen(false)}
        onReply={onReply}
        onForward={onForward}
        onUnsend={onUnsend}
        onRemoveForMe={onRemoveForMe}
        onEdit={onEdit}
        onPin={onPin}
        onChooseReaction={handleChooseReaction}
      />
    </>
  );
}
