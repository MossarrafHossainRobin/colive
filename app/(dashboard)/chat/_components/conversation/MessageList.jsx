'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import MessageBubble from './MessageBubble';

function getMessageTime(message) {
  if (!message) return 0;

  if (typeof message?.createdAt === 'number') return message.createdAt;

  if (message?.createdAt?.toDate) {
    return message.createdAt.toDate().getTime();
  }

  if (message?.createdAt instanceof Date) {
    return message.createdAt.getTime();
  }

  if (message?.localCreatedAt) return message.localCreatedAt;

  return 0;
}

function getDateKey(message) {
  const time = getMessageTime(message);

  if (!time) return '';

  return new Date(time).toDateString();
}

function formatDateLabel(message) {
  const time = getMessageTime(message);

  if (!time) return '';

  const date = new Date(time);
  const today = new Date();
  const yesterday = new Date();

  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
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

function isSameSender(current, previous) {
  if (!current || !previous) return false;

  const currentSender = getMessageSenderId(current);
  const previousSender = getMessageSenderId(previous);

  return Boolean(
    currentSender &&
      previousSender &&
      String(currentSender) === String(previousSender)
  );
}

function isCloseTime(current, previous) {
  if (!current || !previous) return false;

  const currentTime = getMessageTime(current);
  const previousTime = getMessageTime(previous);

  if (!currentTime || !previousTime) return false;

  return Math.abs(currentTime - previousTime) < 1000 * 60 * 4;
}

function LoadingMessages() {
  return (
    <div className="flex h-full flex-col justify-end gap-3 px-4 py-5">
      {[1, 2, 3, 4, 5].map((item) => (
        <div
          key={item}
          className={`flex ${
            item % 2 === 0 ? 'justify-end' : 'justify-start'
          }`}
        >
          <div
            className={`h-9 animate-pulse rounded-3xl bg-[#F0F2F5] ${
              item % 2 === 0 ? 'w-40' : 'w-56'
            }`}
          />
        </div>
      ))}
    </div>
  );
}

function EmptyMessages() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[#F0F2F5] text-3xl">
        💬
      </div>

      <h3 className="text-[17px] font-bold text-[#050505]">
        Start the conversation
      </h3>

      <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-[#65676B]">
        Send a message, emoji, sticker, or GIF.
      </p>
    </div>
  );
}

export default function MessageList({
  user,
  activeChat,
  messages = [],
  loading = false,
  currentUserId,
  otherUser,
  onReply,
  onForward,
  onReact,
  onRemoveReaction,
  onRemoveForMe,
  onUnsend,
  onEdit,
  onPin,
}) {
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const lastMessageKeyRef = useRef('');
  const tickingRef = useRef(false);
  const nearBottomRef = useRef(true);

  const [isNearBottom, setIsNearBottom] = useState(true);
  const [newMessageCount, setNewMessageCount] = useState(0);

  const myUserId = currentUserId || user?.uid || user?.id || '';

  const sortedMessages = useMemo(() => {
    return messages
      .filter((message) => !message?.deletedFor?.includes(myUserId))
      .sort((a, b) => getMessageTime(a) - getMessageTime(b));
  }, [messages, myUserId]);

  const lastMessage = sortedMessages[sortedMessages.length - 1] || null;
  const latestOutgoingIndex = sortedMessages.findLastIndex(
    (message) => String(getMessageSenderId(message)) === String(myUserId)
  );

  const lastMessageKey = lastMessage
    ? `${lastMessage.id || ''}-${lastMessage.localCreatedAt || ''}-${getMessageTime(
        lastMessage
      )}`
    : '';

  const scrollToBottom = (behavior = 'auto') => {
    bottomRef.current?.scrollIntoView({
      behavior,
      block: 'end',
    });
  };

  const updateNearBottom = () => {
    const element = scrollRef.current;

    if (!element) return;

    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;

    const nextNearBottom = distanceFromBottom < 160;

    if (nearBottomRef.current !== nextNearBottom) {
      nearBottomRef.current = nextNearBottom;
      setIsNearBottom(nextNearBottom);
    }

    if (nextNearBottom) {
      setNewMessageCount((prev) => (prev === 0 ? prev : 0));
    }
  };

  const handleScroll = () => {
    if (tickingRef.current) return;

    tickingRef.current = true;

    window.requestAnimationFrame(() => {
      updateNearBottom();
      tickingRef.current = false;
    });
  };

  useEffect(() => {
    if (!lastMessageKey || !lastMessage) return;

    const previousKey = lastMessageKeyRef.current;

    if (!previousKey) {
      lastMessageKeyRef.current = lastMessageKey;

      window.setTimeout(() => {
        scrollToBottom('auto');
      }, 40);

      return;
    }

    if (previousKey === lastMessageKey) return;

    lastMessageKeyRef.current = lastMessageKey;

    const messageSenderId = getMessageSenderId(lastMessage);
    const messageIsMine =
      String(messageSenderId) === String(myUserId) ||
      String(messageSenderId) === String(user?.uid) ||
      String(messageSenderId) === String(user?.email);

    if (nearBottomRef.current || messageIsMine) {
      window.setTimeout(() => {
        scrollToBottom('smooth');
      }, 30);

      setNewMessageCount(0);
    } else {
      setNewMessageCount((prev) => prev + 1);
    }
  }, [lastMessageKey, lastMessage, myUserId, user?.uid, user?.email]);

  if (loading) {
    return <LoadingMessages />;
  }

  if (!sortedMessages.length) {
    return <EmptyMessages />;
  }

  return (
    <div className="relative h-full min-h-0 bg-white">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-2 py-4 sm:px-4"
      >
        <div className="mx-auto flex max-w-4xl flex-col">
          {sortedMessages.map((message, index) => {
            const previousMessage = sortedMessages[index - 1];
            const nextMessage = sortedMessages[index + 1];

            const showDateDivider =
              index === 0 || getDateKey(message) !== getDateKey(previousMessage);

            const compactTop =
              isSameSender(message, previousMessage) &&
              isCloseTime(message, previousMessage) &&
              !showDateDivider;

            const compactBottom =
              isSameSender(message, nextMessage) &&
              isCloseTime(message, nextMessage);

            return (
              <div key={message.id || `${getMessageTime(message)}-${index}`}>
                {showDateDivider && (
                  <div className="my-4 flex justify-center">
                    <span className="rounded-full bg-[#F0F2F5] px-3 py-1 text-[11px] font-semibold text-[#65676B]">
                      {formatDateLabel(message)}
                    </span>
                  </div>
                )}

                <MessageBubble
                  message={message}
                  user={user}
                  activeChat={activeChat}
                  currentUserId={myUserId}
                  otherUser={otherUser || activeChat?.otherUser}
                  compactTop={compactTop}
                  compactBottom={compactBottom}
                  showDeliveryStatus={index === latestOutgoingIndex}
                  onReply={onReply}
                  onForward={onForward}
                  onReact={onReact}
                  onRemoveReaction={onRemoveReaction}
                  onRemoveForMe={onRemoveForMe}
                  onUnsend={onUnsend}
                  onEdit={onEdit}
                  onPin={onPin}
                />
              </div>
            );
          })}

          <div ref={bottomRef} className="h-3" />
        </div>
      </div>

      {newMessageCount > 0 && !isNearBottom && (
        <button
          type="button"
          onClick={() => {
            scrollToBottom('smooth');
            nearBottomRef.current = true;
            setIsNearBottom(true);
            setNewMessageCount(0);
          }}
          className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#0084FF] px-4 py-2 text-[13px] font-bold text-white shadow-xl transition active:scale-95"
        >
          <ChevronDown className="h-4 w-4" />

          {newMessageCount === 1
            ? 'New message'
            : `${newMessageCount} new messages`}
        </button>
      )}
    </div>
  );
}
