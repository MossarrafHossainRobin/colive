'use client';

import { useEffect, useMemo, useState } from 'react';
import ChatSidebar from './sidebar/ChatSidebar';
import ChatWindow from './conversation/ChatWindow';
import ChatInfoPanel from './info/ChatInfoPanel';
import { useChatMembers } from '../_hooks/useChatMembers';
import { useConversations } from '../_hooks/useConversations';
import { openOrCreateConversation } from '../_services/conversationService';
import { getConversationName } from '../_utils/conversationDisplay';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { markIncomingMessagesDelivered } from '../_services/messageService';

function getChatTitle(chat) {
  return getConversationName(chat) || 'Chat';
}

function toMillis(value) {
  if (!value) return 0;

  if (typeof value === 'number') return value;

  if (value instanceof Date) {
    return value.getTime();
  }

  if (value?.toDate) {
    return value.toDate().getTime();
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function getConversationTime(conversation) {
  const data = conversation?.convData || conversation || {};

  return (
    toMillis(data.lastMessageAt) ||
    toMillis(data.updatedAt) ||
    toMillis(data.createdAt) ||
    0
  );
}

function getLatestUnreadConversation(conversations, currentUserId) {
  if (!currentUserId) return null;

  const unreadConversations = conversations
    .filter((conversation) => {
      const data = conversation?.convData || {};
      const unreadForMe = Number(
        conversation?.unreadForMe || data?.unreadCount?.[currentUserId] || 0
      );

      const lastSenderId = data?.lastSenderId || '';

      return unreadForMe > 0 && lastSenderId && lastSenderId !== currentUserId;
    })
    .sort((a, b) => getConversationTime(b) - getConversationTime(a));

  return unreadConversations[0] || null;
}

export default function ChatShell({ user, userData, targetMember }) {
  const [activeChat, setActiveChat] = useState(null);
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const { members } = useChatMembers(user);
  const { conversations } = useConversations(user);
  const userId = user?.uid;
  const liveActiveChat = useMemo(() => {
    if (!activeChat?.id) return null;

    const subscribed = conversations.find((item) => item.id === activeChat.id);
    if (!subscribed) return activeChat;

    return {
      ...activeChat,
      ...subscribed,
      otherUser: {
        ...(activeChat.otherUser || {}),
        ...(subscribed.otherUser || {}),
      },
    };
  }, [activeChat, conversations]);

  const latestUnreadConversation = useMemo(() => {
    return getLatestUnreadConversation(conversations, userId);
  }, [conversations, userId]);

  const totalUnread = useMemo(() => {
    if (!userId) return 0;

    return conversations.reduce((total, conversation) => {
      const data = conversation?.convData || {};

      return (
        total +
        Number(conversation?.unreadForMe || data?.unreadCount?.[userId] || 0)
      );
    }, 0);
  }, [conversations, userId]);

  useEffect(() => {
    if (latestUnreadConversation) {
      const senderName = getChatTitle(latestUnreadConversation);
      const prefix = totalUnread > 0 ? `(${totalUnread}) ` : '';

      document.title = `${prefix}${senderName} messaged you | NestHub Messenger`;

      return;
    }

    if (liveActiveChat) {
      const name = getChatTitle(liveActiveChat);

      document.title = `${name} | NestHub Messenger`;

      return;
    }

    document.title = 'Chat | NestHub Messenger';
  }, [liveActiveChat, latestUnreadConversation, totalUnread]);

  useEffect(() => {
    if (!targetMember || !user?.uid) return;

    async function openTargetChat() {
      const chat = await openOrCreateConversation(user.uid, targetMember);

      if (chat) {
        setActiveChat(chat);
        setMobileThreadOpen(true);
        setShowInfo(false);
      }
    }

    openTargetChat();
  }, [targetMember, user?.uid]);

  useEffect(() => {
    if (!userId) return undefined;

    const presenceRef = doc(db, 'users', userId);

    function publishPresence() {
      return setDoc(
        presenceRef,
        {
          activeRoute: '/chat',
          activeConversationId: liveActiveChat?.id || '',
          chatVisible: document.visibilityState === 'visible',
          presenceUpdatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch(() => null);
    }

    publishPresence();
    document.addEventListener('visibilitychange', publishPresence);
    const heartbeat = window.setInterval(publishPresence, 45_000);

    return () => {
      document.removeEventListener('visibilitychange', publishPresence);
      window.clearInterval(heartbeat);
      setDoc(
        presenceRef,
        {
          activeRoute: '',
          activeConversationId: '',
          chatVisible: false,
          presenceUpdatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch(() => null);
    };
  }, [liveActiveChat?.id, userId]);

  useEffect(() => {
    if (!userId) return undefined;

    const incomingConversationIds = conversations
      .filter((conversation) => {
        const data = conversation?.convData || {};
        return data.lastSenderId && data.lastSenderId !== userId;
      })
      .map((conversation) => conversation.id);

    function acknowledgeDelivery() {
      if (document.visibilityState !== 'visible') return;
      incomingConversationIds.forEach((conversationId) => {
        markIncomingMessagesDelivered(conversationId, userId);
      });
    }

    acknowledgeDelivery();
    document.addEventListener('visibilitychange', acknowledgeDelivery);
    return () => document.removeEventListener('visibilitychange', acknowledgeDelivery);
  }, [conversations, userId]);

  const handleSelectChat = (chat) => {
    setActiveChat(chat);
    setMobileThreadOpen(true);
    setShowInfo(false);
  };

  const handleMobileBackToInbox = () => {
    setMobileThreadOpen(false);
    setShowInfo(false);
  };

  const cardClass =
    'bg-white rounded-[22px] shadow-[0_2px_12px_rgba(15,23,42,0.06)] border border-white/80 overflow-hidden min-h-0';

  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-[#F0F2F5]">
      {/* ================= MOBILE VIEW ================= */}
      <div className="relative h-full w-full overflow-hidden bg-white lg:hidden">
        <div className="absolute inset-0 z-10 bg-white pb-[72px]">
          <ChatSidebar
            user={user}
            conversations={conversations}
            members={members}
            activeChat={liveActiveChat}
            onConversationDeleted={(conversationId) => {
              if (liveActiveChat?.id === conversationId) {
                setActiveChat(null);
                setMobileThreadOpen(false);
                setShowInfo(false);
              }
            }}
            onSelectChat={handleSelectChat}
          />
        </div>

        {mobileThreadOpen && (
          <div className="fixed inset-0 z-[999] h-[100dvh] w-full bg-white overflow-hidden">
            <ChatWindow
              key={liveActiveChat?.id}
              user={user}
              userData={userData}
              activeChat={liveActiveChat}
              onBack={handleMobileBackToInbox}
              onInfo={() => setShowInfo(true)}
              mobile
            />
          </div>
        )}

        {showInfo && liveActiveChat && (
          <div className="fixed inset-0 z-[1000] h-[100dvh] w-full bg-white overflow-hidden">
            <div className="h-full flex flex-col">
              <div className="h-14 px-4 border-b border-gray-100 flex items-center gap-3 flex-shrink-0 bg-white">
                <button
                  type="button"
                  onClick={() => setShowInfo(false)}
                  className="w-9 h-9 rounded-full hover:bg-[#F0F2F5] flex items-center justify-center active:scale-95 transition"
                >
                  <svg
                    className="w-5 h-5 text-[#050505]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>

                <p className="font-semibold text-[#050505]">
                  Conversation Info
                </p>
              </div>

              <div className="flex-1 min-h-0 overflow-hidden">
                <ChatInfoPanel
                  user={user}
                  activeChat={liveActiveChat}
                  onConversationRemoved={() => {
                    setShowInfo(false);
                    setMobileThreadOpen(false);
                    setActiveChat(null);
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ================= DESKTOP VIEW ================= */}
      <div className={`hidden h-full w-full gap-4 p-4 lg:grid ${showInfo ? 'grid-cols-[340px_minmax(0,1fr)_320px]' : 'grid-cols-[340px_minmax(0,1fr)]'}`}>
        <section className={cardClass}>
          <ChatSidebar
            user={user}
            conversations={conversations}
            members={members}
            activeChat={liveActiveChat}
            onConversationDeleted={(conversationId) => {
              if (liveActiveChat?.id === conversationId) {
                setActiveChat(null);
                setShowInfo(false);
              }
            }}
            onSelectChat={(chat) => {
              setActiveChat(chat);
              setShowInfo(false);
            }}
          />
        </section>

        <section className={`${cardClass} bg-[#FFFFFF]`}>
          {liveActiveChat ? (
            <ChatWindow
              key={liveActiveChat?.id}
              user={user}
              userData={userData}
              activeChat={liveActiveChat}
              onInfo={() => setShowInfo((prev) => !prev)}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center px-8 text-center bg-white">
              <div className="w-24 h-24 rounded-full bg-[#F0F2F5] flex items-center justify-center mb-5">
                <span className="text-4xl">💬</span>
              </div>

              <h2 className="text-[22px] font-extrabold text-[#050505]">
                Select a conversation
              </h2>

              <p className="max-w-md text-[14px] text-[#65676B] mt-2 leading-relaxed">
                Choose a member from the left panel to start messaging. Your
                NestHub chat will appear here.
              </p>
            </div>
          )}
        </section>

        {showInfo && (
          <aside className={cardClass}>
            {liveActiveChat ? (
            <ChatInfoPanel
              user={user}
              activeChat={liveActiveChat}
              onConversationRemoved={() => {
                setShowInfo(false);
                setActiveChat(null);
              }}
            />
            ) : (
            <div className="h-full flex flex-col items-center justify-center px-6 text-center bg-white">
              <div className="w-16 h-16 rounded-full bg-[#F0F2F5] flex items-center justify-center mb-4">
                <span className="text-2xl">ℹ️</span>
              </div>

              <h3 className="text-[16px] font-bold text-[#050505]">
                Chat details
              </h3>

              <p className="text-[13px] text-[#65676B] mt-1 leading-relaxed">
                Member profile, activity, and conversation settings will appear
                here after selecting a chat.
              </p>
            </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
