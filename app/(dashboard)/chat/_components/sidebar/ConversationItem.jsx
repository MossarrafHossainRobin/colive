'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Archive,
  Bell,
  BellOff,
  CheckCheck,
  Ban,
  MoreHorizontal,
  Pin,
  PinOff,
  Trash2,
  X,
} from 'lucide-react';
import Avatar from '../common/Avatar';
import Badge from '../common/Badge';
import { formatConversationTime } from '../../_utils/formatChatTime';
import {
  getConversationName,
  isConversationBlockedByMe,
} from '../../_utils/conversationDisplay';

function getName(user) {
  return user?.name || user?.displayName || user?.fullName || 'Member';
}

function isMutedForUser(conversation, uid) {
  const data = conversation?.convData || conversation || {};
  return Array.isArray(data?.mutedBy) && data.mutedBy.includes(uid);
}

function getActions({
  muted,
  pinned,
  showArchived,
  onArchive,
  onUnarchive,
  onMute,
  onUnmute,
  onMarkRead,
  onPin,
  onDelete,
}) {
  return [
    {
      label: pinned ? 'Unpin chat' : 'Pin chat',
      icon: pinned ? PinOff : Pin,
      onClick: onPin,
      danger: false,
    },
    showArchived
      ? {
          label: 'Move to inbox',
          icon: Archive,
          onClick: onUnarchive,
          danger: false,
        }
      : {
          label: 'Archive chat',
          icon: Archive,
          onClick: onArchive,
          danger: false,
        },
    muted
      ? {
          label: 'Unmute chat',
          icon: Bell,
          onClick: onUnmute,
          danger: false,
        }
      : {
          label: 'Mute chat',
          icon: BellOff,
          onClick: onMute,
          danger: false,
        },
    {
      label: 'Mark as read',
      icon: CheckCheck,
      onClick: onMarkRead,
      danger: false,
    },
    {
      label: 'Delete chat',
      icon: Trash2,
      onClick: onDelete,
      danger: true,
    },
  ];
}

function DesktopActionMenu({
  open,
  muted,
  pinned,
  showArchived,
  triggerRef,
  onClose,
  onArchive,
  onUnarchive,
  onMute,
  onUnmute,
  onMarkRead,
  onPin,
  onDelete,
}) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event) => {
      const target = event.target;

      const clickedInsideMenu = menuRef.current?.contains(target);
      const clickedTriggerButton = triggerRef.current?.contains(target);

      // Important fix:
      // If user clicks the same 3-dot button again,
      // do not let outside-click listener close first and reopen again.
      if (clickedInsideMenu || clickedTriggerButton) return;

      onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [open, onClose, triggerRef]);

  if (!open) return null;

  const actions = getActions({
    muted,
    pinned,
    showArchived,
    onArchive,
    onUnarchive,
    onMute,
    onUnmute,
    onMarkRead,
    onPin,
    onDelete,
  });

  return (
    <div
      ref={menuRef}
      className="absolute right-3 top-11 z-[90] w-56 rounded-2xl bg-white border border-gray-100 shadow-2xl py-2 animate-[fadeIn_120ms_ease-out]"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={() => {
            action.onClick?.();
            onClose();
          }}
          className={`w-full px-3 py-2.5 flex items-center gap-3 text-left text-[14px] transition hover:bg-[#F0F2F5] active:scale-[0.99] ${
            action.danger ? 'text-red-600' : 'text-[#050505]'
          }`}
        >
          <span
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              action.danger ? 'bg-red-50' : 'bg-[#F0F2F5]'
            }`}
          >
            <action.icon className="w-4 h-4" />
          </span>

          <span className="font-medium">{action.label}</span>
        </button>
      ))}
    </div>
  );
}

function MobileActionSheet({
  open,
  muted,
  pinned,
  showArchived,
  otherUser,
  onClose,
  onArchive,
  onUnarchive,
  onMute,
  onUnmute,
  onMarkRead,
  onPin,
  onDelete,
}) {
  useEffect(() => {
    if (!open) return;

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const actions = getActions({
    muted,
    pinned,
    showArchived,
    onArchive,
    onUnarchive,
    onMute,
    onUnmute,
    onMarkRead,
    onPin,
    onDelete,
  });

  return (
    <div className="fixed inset-0 z-[1200] lg:hidden">
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 bg-black/35"
      />

      <div className="absolute left-0 right-0 bottom-0 rounded-t-[28px] bg-white shadow-2xl overflow-hidden animate-[slideUp_150ms_ease-out]">
        <div className="pt-3 pb-2 flex justify-center">
          <span className="w-10 h-1 rounded-full bg-[#DADDE1]" />
        </div>

        <div className="px-5 pb-4 border-b border-gray-100 flex items-center gap-3">
          <Avatar user={otherUser} size="lg" showStatus />

          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-bold text-[#050505] truncate">
              {getName(otherUser)}
            </p>

            <p className="text-[13px] text-[#65676B]">
              Conversation options
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-[#F0F2F5] flex items-center justify-center"
          >
            <X className="w-5 h-5 text-[#050505]" />
          </button>
        </div>

        <div className="px-2 py-2">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => {
                action.onClick?.();
                onClose();
              }}
              className={`w-full px-4 py-3.5 flex items-center gap-3 rounded-2xl text-left active:scale-[0.99] transition ${
                action.danger
                  ? 'text-red-600 active:bg-red-50'
                  : 'text-[#050505] active:bg-[#F0F2F5]'
              }`}
            >
              <span
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  action.danger ? 'bg-red-50' : 'bg-[#F0F2F5]'
                }`}
              >
                <action.icon className="w-5 h-5" />
              </span>

              <span className="text-[15px] font-semibold">
                {action.label}
              </span>
            </button>
          ))}
        </div>

        <div className="px-3 pb-5 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="w-full h-12 rounded-2xl bg-[#F0F2F5] text-[#050505] text-[15px] font-bold active:scale-[0.99] transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ConversationItem({
  conversation,
  active,
  currentUserId,
  showArchived = false,
  loading = false,
  onClick,
  onArchive,
  onUnarchive,
  onMute,
  onUnmute,
  onMarkRead,
  onPin,
  onDelete,
}) {
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  const triggerRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);

  const otherUser = conversation?.otherUser || {};
  const convData = conversation?.convData || conversation || {};

  if (!otherUser?.id || !otherUser?.email) return null;

  const name = getConversationName(conversation);
  const muted = isMutedForUser(conversation, currentUserId);
  const pinned = Boolean(conversation?.isPinned);
  const blocked = isConversationBlockedByMe(conversation, currentUserId);
  const unreadCount = Number(convData?.unreadCount?.[currentUserId] || 0);
  const lastMessage = convData?.lastMessage || 'Start conversation';
  const lastMessageType = convData?.lastMessageType || 'text';
  const sentByMe = convData?.lastSenderId === currentUserId;
  const lastMessageAt = convData?.lastMessageAt || convData?.updatedAt;
  const preview =
    lastMessageType === 'gif'
      ? 'Sent a GIF'
      : lastMessageType === 'sticker'
        ? 'Sent a sticker'
        : lastMessageType === 'reaction'
          ? lastMessage
          : lastMessage;

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTouchStart = () => {
    if (loading) return;

    longPressTriggeredRef.current = false;

    clearLongPressTimer();

    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      setMobileSheetOpen(true);

      if (navigator?.vibrate) {
        navigator.vibrate(12);
      }
    }, 500);
  };

  const handleTouchMove = () => {
    clearLongPressTimer();
  };

  const handleTouchEnd = () => {
    clearLongPressTimer();
  };

  const handleSelect = () => {
    if (loading) return;

    if (longPressTriggeredRef.current) {
      window.setTimeout(() => {
        longPressTriggeredRef.current = false;
      }, 0);

      return;
    }

    if (desktopMenuOpen) {
      setDesktopMenuOpen(false);
    }

    onClick?.(conversation);
  };

  const handleDesktopMenuClick = (event) => {
    event.preventDefault();
    event.stopPropagation();

    setDesktopMenuOpen((prev) => !prev);
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={handleSelect}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={clearLongPressTimer}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            handleSelect();
          }
        }}
        className={`group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-colors duration-100 outline-none cursor-pointer select-none ${
          active ? 'bg-[#E7F3FF]' : 'hover:bg-[#F0F2F5]'
        } ${loading ? 'opacity-60 pointer-events-none' : ''}`}
      >
        <Avatar user={otherUser} size="lg" showStatus />

        <div className="min-w-0 flex-1 lg:pr-9">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <h4
                className={`text-[15px] truncate ${
                  unreadCount > 0
                    ? 'font-extrabold text-[#050505]'
                    : 'font-semibold text-[#050505]'
                }`}
              >
                {name}
              </h4>

              {muted && (
                <BellOff className="w-3.5 h-3.5 text-[#65676B] flex-shrink-0" />
              )}
              {pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-[#65676b]" />}
              {blocked && <Ban className="h-3.5 w-3.5 shrink-0 text-[#e41e3f]" />}
            </div>

            {lastMessageAt && (
              <span
                className={`text-[11px] flex-shrink-0 ${
                  unreadCount > 0
                    ? 'text-[#0084FF] font-bold'
                    : 'text-[#65676B]'
                }`}
              >
                {formatConversationTime(lastMessageAt)}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 mt-0.5">
            <p
              className={`text-[13px] truncate ${
                unreadCount > 0
                  ? 'text-[#050505] font-semibold'
                  : 'text-[#65676B]'
              }`}
            >
              {blocked
                ? 'You blocked this member'
                : `${sentByMe ? 'You: ' : ''}${preview}`}
            </p>

            {unreadCount > 0 && (
              <Badge>{unreadCount > 99 ? '99+' : unreadCount}</Badge>
            )}
          </div>
        </div>

        {/* Desktop only three-dot menu button */}
        <button
          ref={triggerRef}
          type="button"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={handleDesktopMenuClick}
          className={`hidden lg:flex absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white border border-gray-100 shadow-sm hover:bg-[#E4E6EB] items-center justify-center transition-opacity duration-100 ${
            desktopMenuOpen
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100'
          }`}
          title="Conversation options"
        >
          <MoreHorizontal className="w-5 h-5 text-[#050505]" />
        </button>

        <DesktopActionMenu
          open={desktopMenuOpen}
          muted={muted}
          pinned={pinned}
          showArchived={showArchived}
          triggerRef={triggerRef}
          onClose={() => setDesktopMenuOpen(false)}
          onArchive={() => onArchive?.(conversation)}
          onUnarchive={() => onUnarchive?.(conversation)}
          onMute={() => onMute?.(conversation)}
          onUnmute={() => onUnmute?.(conversation)}
          onMarkRead={() => onMarkRead?.(conversation)}
          onPin={() => onPin?.(conversation)}
          onDelete={() => onDelete?.(conversation)}
        />
      </div>

      <MobileActionSheet
        open={mobileSheetOpen}
        muted={muted}
        pinned={pinned}
        showArchived={showArchived}
        otherUser={otherUser}
        onClose={() => setMobileSheetOpen(false)}
        onArchive={() => onArchive?.(conversation)}
        onUnarchive={() => onUnarchive?.(conversation)}
        onMute={() => onMute?.(conversation)}
        onUnmute={() => onUnmute?.(conversation)}
        onMarkRead={() => onMarkRead?.(conversation)}
        onPin={() => onPin?.(conversation)}
        onDelete={() => onDelete?.(conversation)}
      />
    </>
  );
}
