'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ChatHeader from './ChatHeader';
import MessageList from './MessageList';
import MessageComposer from './MessageComposer';
import EmptyConversation from './EmptyConversation';
import TypingIndicator from './TypingIndicator';
import ForwardMessageModal from '../modals/ForwardMessageModal';
import { useMessages } from '../../_hooks/useMessages';
import { useTypingStatus } from '../../_hooks/useTypingStatus';
import { useChatMembers } from '../../_hooks/useChatMembers';
import {
  sendTextMessage,
  sendReactionMessage,
  sendStickerMessage,
  sendGifMessage,
  reactToMessage,
  removeReaction,
  removeMessageForMe,
  unsendMessage,
  forwardMessage,
  markVisibleMessagesSeen,
} from '../../_services/messageService';
import { setTypingValue } from '../../_services/chatService';
import { getConversationName } from '../../_utils/conversationDisplay';

function makeTempId() {
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getSenderName(userData, user) {
  return (
    userData?.name ||
    userData?.displayName ||
    user?.displayName ||
    user?.email ||
    'User'
  );
}

function getSenderPhoto(userData, user) {
  return userData?.photo || userData?.photoURL || user?.photoURL || '';
}

function getMessageTime(message) {
  return (
    message?.createdAt?.toDate?.()?.getTime?.() ||
    message?.createdAt?.getTime?.() ||
    message?.localCreatedAt ||
    0
  );
}

function sameOptimisticMessage(realMessage, optimisticMessage) {
  if (!realMessage || !optimisticMessage) return false;
  if ((realMessage.senderId || '') !== (optimisticMessage.senderId || '')) {
    return false;
  }
  if ((realMessage.text || '') !== (optimisticMessage.text || '')) {
    return false;
  }
  if ((realMessage.type || 'text') !== (optimisticMessage.type || 'text')) {
    return false;
  }

  return true;
}

function buildSender(user, userData) {
  return {
    uid: user.uid,
    id: user.uid,
    name: getSenderName(userData, user),
    photo: getSenderPhoto(userData, user),
  };
}

function buildReplyData(replyingTo) {
  if (!replyingTo) return null;

  return {
    id: replyingTo.id,
    text: replyingTo.text || replyingTo.message || replyingTo.content || '',
    senderName: replyingTo.senderName || 'User',
    type: replyingTo.type || 'text',
  };
}

export default function ChatWindow({
  user,
  userData,
  activeChat,
  onBack,
  onInfo,
  mobile = false,
}) {
  const [text, setText] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [forwardMessageData, setForwardMessageData] = useState(null);
  const [sending, setSending] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const typingTimerRef = useRef(null);

  const conversationId = activeChat?.id || null;
  const userId = user?.uid;

  const { messages = [], loading } = useMessages(conversationId);
  const { typingUsers = [] } = useTypingStatus({
    conversationId,
    userId: user?.uid,
  });
  const { members = [] } = useChatMembers(user);

  const convData = activeChat?.convData || {};

  const isBlockedByMe = convData.blockedBy?.includes(user?.uid) || false;
  const isBlockedByThem =
    convData.blockedBy?.some((id) => id !== user?.uid) || false;
  const isConversationBlocked = isBlockedByMe || isBlockedByThem;

  const receiverId = useMemo(() => {
    if (!activeChat || !userId) return null;

    return (
      activeChat.otherUser?.uid ||
      activeChat.otherUser?.id ||
      activeChat.convData?.participants?.find((id) => id !== userId) ||
      null
    );
  }, [activeChat, userId]);

  const displayMessages = useMemo(() => {
    const localOnlyMessages = optimisticMessages.filter((optimisticMessage) => {
      return !messages.some((realMessage) =>
        sameOptimisticMessage(realMessage, optimisticMessage)
      );
    });

    return [...messages, ...localOnlyMessages].sort((a, b) => {
      return getMessageTime(a) - getMessageTime(b);
    });
  }, [messages, optimisticMessages]);

  const visibleMessages = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return displayMessages;
    return displayMessages.filter((message) =>
      String(message?.text || message?.message || message?.content || '')
        .toLowerCase()
        .includes(query)
    );
  }, [displayMessages, searchQuery]);

  const forwardMembers = useMemo(() => {
    return members.filter((member) => {
      const memberUid = member?.uid || member?.id;

      return memberUid && memberUid !== user?.uid;
    });
  }, [members, user?.uid]);

  useEffect(() => {
    function openConversationSearch(event) {
      if (event?.detail?.conversationId !== conversationId) return;
      setSearchOpen(true);
    }

    window.addEventListener('nesthub:chat-search-request', openConversationSearch);
    return () => window.removeEventListener('nesthub:chat-search-request', openConversationSearch);
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || !user?.uid || messages.length === 0) return;

    function markSeenWhenVisible() {
      if (document.visibilityState !== 'visible') return;
      markVisibleMessagesSeen(conversationId, messages, user.uid);
    }

    markSeenWhenVisible();
    document.addEventListener('visibilitychange', markSeenWhenVisible);
    return () => document.removeEventListener('visibilitychange', markSeenWhenVisible);
  }, [conversationId, messages, user?.uid]);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) {
        window.clearTimeout(typingTimerRef.current);
      }

      if (conversationId && user?.uid) {
        setTypingValue(conversationId, user.uid, false).catch(() => null);
      }
    };
  }, [conversationId, user?.uid]);

  async function stopTyping() {
    if (!conversationId || !user?.uid) return;

    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }

    await setTypingValue(conversationId, user.uid, false).catch(() => null);
  }

  async function handleTyping(value) {
    setText(value);

    if (!conversationId || !user?.uid || isConversationBlocked) return;

    setTypingValue(conversationId, user.uid, Boolean(value.trim())).catch(
      () => null
    );

    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
    }

    typingTimerRef.current = window.setTimeout(() => {
      setTypingValue(conversationId, user.uid, false).catch(() => null);
    }, 1000);
  }

  async function handleSend(event) {
    event?.preventDefault();

    const cleanText = text.trim();

    if (
      !cleanText ||
      !conversationId ||
      !user?.uid ||
      !receiverId ||
      isConversationBlocked
    ) {
      return;
    }

    const tempId = makeTempId();

    const optimisticMessage = {
      id: tempId,
      text: cleanText,
      type: 'text',
      senderId: user.uid,
      senderUid: user.uid,
      sender: buildSender(user, userData),
      senderName: getSenderName(userData, user),
      senderPhoto: getSenderPhoto(userData, user),
      createdAt: new Date(),
      localCreatedAt: Date.now(),
      reactions: {},
      seen: false,
      status: 'sending',
      unsent: false,
      deletedFor: [],
      replyTo: buildReplyData(replyingTo),
      isSticker: false,
      isGIF: false,
      isReaction: false,
      forwarded: false,
      optimistic: true,
    };

    setOptimisticMessages((prev) => [...prev, optimisticMessage]);
    setText('');
    setReplyingTo(null);
    setSending(true);
    stopTyping();

    try {
      await sendTextMessage({
        conversationId,
        text: cleanText,
        sender: buildSender(user, userData),
        receiverId,
        replyTo: buildReplyData(replyingTo),
      });

      window.setTimeout(() => {
        setOptimisticMessages((prev) =>
          prev.filter((message) => message.id !== tempId)
        );
      }, 900);
    } catch (error) {
      console.error('Send message failed:', error);

      setOptimisticMessages((prev) =>
        prev.map((message) =>
          message.id === tempId
            ? {
                ...message,
                status: 'failed',
              }
            : message
        )
      );
    } finally {
      setSending(false);
    }
  }

  async function handleQuickLike() {
    if (
      !conversationId ||
      !user?.uid ||
      !receiverId ||
      sending ||
      isConversationBlocked
    ) {
      return;
    }

    const tempId = makeTempId();

    const optimisticMessage = {
      id: tempId,
      text: '👍',
      type: 'reaction',
      senderId: user.uid,
      senderUid: user.uid,
      sender: buildSender(user, userData),
      senderName: getSenderName(userData, user),
      senderPhoto: getSenderPhoto(userData, user),
      createdAt: new Date(),
      localCreatedAt: Date.now(),
      reactions: {},
      seen: false,
      status: 'sending',
      unsent: false,
      deletedFor: [],
      replyTo: null,
      isSticker: false,
      isGIF: false,
      isReaction: true,
      forwarded: false,
      optimistic: true,
    };

    setOptimisticMessages((prev) => [...prev, optimisticMessage]);

    try {
      await sendReactionMessage({
        conversationId,
        emoji: '👍',
        sender: buildSender(user, userData),
        receiverId,
      });

      window.setTimeout(() => {
        setOptimisticMessages((prev) =>
          prev.filter((message) => message.id !== tempId)
        );
      }, 900);
    } catch (error) {
      console.error('Send like failed:', error);

      setOptimisticMessages((prev) =>
        prev.map((message) =>
          message.id === tempId ? { ...message, status: 'failed' } : message
        )
      );
    }
  }

  async function handleSticker(sticker) {
    if (!conversationId || !user?.uid || !receiverId || isConversationBlocked) {
      return;
    }

    await sendStickerMessage({
      conversationId,
      sticker,
      sender: buildSender(user, userData),
      receiverId,
    });
  }

  async function handleGif(gif) {
    if (
      !conversationId ||
      !user?.uid ||
      !receiverId ||
      !gif?.url ||
      isConversationBlocked
    ) {
      return;
    }

    await sendGifMessage({
      conversationId,
      gif,
      sender: buildSender(user, userData),
      receiverId,
    });
  }

  async function handleReact(messageId, emoji) {
    if (!conversationId || !messageId || !user?.uid || !emoji) return;
    if (String(messageId).startsWith('local-')) return;

    await reactToMessage(conversationId, messageId, user.uid, emoji);
  }

  async function handleRemoveReaction(messageId) {
    if (!conversationId || !messageId || !user?.uid) return;
    if (String(messageId).startsWith('local-')) return;

    await removeReaction(conversationId, messageId, user.uid);
  }

  async function handleRemoveForMe(messageId) {
    if (!conversationId || !messageId || !user?.uid) return;

    if (String(messageId).startsWith('local-')) {
      setOptimisticMessages((prev) =>
        prev.filter((message) => message.id !== messageId)
      );
      return;
    }

    await removeMessageForMe(conversationId, messageId, user.uid);
  }

  async function handleUnsend(messageId) {
    if (!conversationId || !messageId) return;

    if (String(messageId).startsWith('local-')) {
      setOptimisticMessages((prev) =>
        prev.filter((message) => message.id !== messageId)
      );
      return;
    }

    await unsendMessage(conversationId, messageId);
  }

  async function handleForward(targetMember) {
    if (!targetMember || !forwardMessageData || !user?.uid) return;

    const targetUid = targetMember?.uid || targetMember?.id;

    if (!targetUid) return;

    await forwardMessage({
      message: forwardMessageData,
      targetMember: {
        ...targetMember,
        id: targetUid,
        uid: targetUid,
      },
      currentUser: buildSender(user, userData),
    });

    setForwardMessageData(null);
  }

  if (!activeChat) {
    return (
      <div className="flex h-full w-full flex-col bg-white">
        <EmptyConversation mobile={mobile} onOpenSidebar={onBack} />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white">
      <ChatHeader
        user={user}
        activeChat={activeChat}
        typingUsers={typingUsers}
        isBlocked={isConversationBlocked}
        onBack={onBack}
        onInfo={onInfo}
        onSearch={() => setSearchOpen((value) => !value)}
      />

      {searchOpen && (
        <div className="flex h-12 flex-shrink-0 items-center gap-2 border-b border-gray-100 bg-white px-3">
          <svg className="h-4 w-4 text-[#65676b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" />
          </svg>
          <input
            autoFocus
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search in conversation"
            className="h-9 min-w-0 flex-1 rounded-full bg-[#f0f2f5] px-3 text-sm outline-none"
          />
          <button type="button" onClick={() => { setSearchOpen(false); setSearchQuery(''); }} className="px-2 text-sm font-semibold text-[#0084ff]">
            Close
          </button>
        </div>
      )}

      <div className="relative min-h-0 flex-1 bg-white">
        <MessageList
          user={user}
          activeChat={activeChat}
          messages={visibleMessages}
          loading={loading}
          currentUserId={user?.uid}
          otherUser={activeChat?.otherUser}
          onReply={setReplyingTo}
          onForward={setForwardMessageData}
          onReact={handleReact}
          onRemoveReaction={handleRemoveReaction}
          onRemoveForMe={handleRemoveForMe}
          onUnsend={handleUnsend}
        />

        {typingUsers.length > 0 && !isConversationBlocked && (
          <div className="pointer-events-none absolute bottom-2 left-4 z-20">
            <TypingIndicator />
          </div>
        )}
      </div>

      {isConversationBlocked ? (
        <div className="flex-shrink-0 border-t border-gray-200 bg-[#F0F2F5] px-4 py-3 text-center">
          <p className="text-[13px] font-semibold text-[#65676B]">
            {isBlockedByMe
              ? `You blocked ${getConversationName(activeChat)}`
              : 'This member is unavailable'}
          </p>
        </div>
      ) : (
        <MessageComposer
          text={text}
          setText={handleTyping}
          sending={sending}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
          onSubmit={handleSend}
          onQuickLike={handleQuickLike}
          onStopTyping={stopTyping}
          onSendSticker={handleSticker}
          onSendGif={handleGif}
        />
      )}

      {forwardMessageData && (
        <ForwardMessageModal
          members={forwardMembers}
          message={forwardMessageData}
          onClose={() => setForwardMessageData(null)}
          onForward={handleForward}
        />
      )}
    </div>
  );
}
