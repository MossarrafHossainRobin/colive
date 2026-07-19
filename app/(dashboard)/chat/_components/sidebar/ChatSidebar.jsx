'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import {
  Archive,
  BellRing,
  Edit,
  LogOut,
  MessageCircle,
} from 'lucide-react';
import {
  arrayRemove,
  arrayUnion,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { auth, db, setupPushNotifications } from '@/lib/firebase';
import toast from 'react-hot-toast';
import ChatSearch from './ChatSearch';
import ActiveMembersBar from './ActiveMembersBar';
import ConversationList from './ConversationList';
import Spinner from '../common/Spinner';
import Avatar from '../common/Avatar';
import { openOrCreateConversation } from '../../_services/conversationService';
import { pinConversation } from '../../_services/conversationService';
import { getConversationName } from '../../_utils/conversationDisplay';

function getName(user) {
  return user?.name || user?.displayName || user?.fullName || 'Member';
}

function getMemberUid(member) {
  return member?.uid || member?.id || '';
}

function getRecentSearches(storageKey) {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch {
    return [];
  }
}

function getConversationTime(conversation) {
  return (
    conversation?.convData?.lastMessageAt?.toDate?.()?.getTime?.() ||
    conversation?.convData?.updatedAt?.toDate?.()?.getTime?.() ||
    conversation?.lastMessageAt?.toDate?.()?.getTime?.() ||
    conversation?.updatedAt?.toDate?.()?.getTime?.() ||
    0
  );
}

function matchSearch(value, query) {
  if (!query) return true;

  const name = getName(value).toLowerCase();

  return name.includes(query.toLowerCase());
}

function isArchivedForUser(conversation, uid) {
  const data = conversation?.convData || conversation || {};

  return Array.isArray(data.archivedBy) && data.archivedBy.includes(uid);
}

function isDeletedForUser(conversation, uid) {
  const data = conversation?.convData || conversation || {};

  return Array.isArray(data.deletedFor) && data.deletedFor.includes(uid);
}

function RailButton({ active, title, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition active:scale-95 ${
        active
          ? 'bg-white text-[#0084FF] shadow-sm'
          : 'text-[#65676B] hover:bg-white/80 hover:text-[#050505]'
      }`}
    >
      {active && (
        <span className="absolute left-[-8px] top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-[#0084FF]" />
      )}

      {children}
    </button>
  );
}

function MemberList({
  members = [],
  currentUserId,
  openingMemberId,
  onSelectMember,
}) {
  const visibleMembers = members.filter((member) => {
    const memberUid = getMemberUid(member);

    return memberUid && memberUid !== currentUserId;
  });

  if (visibleMembers.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-[#F0F2F5] flex items-center justify-center mb-3">
          <MessageCircle className="w-7 h-7 text-[#65676B]" />
        </div>

        <p className="text-[15px] font-semibold text-[#050505]">
          No members found
        </p>

        <p className="text-[13px] text-[#65676B] mt-1">
          Members from your database will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="px-2 py-2 space-y-0.5">
      {visibleMembers.map((member) => {
        const name = getName(member);
        const memberUid = getMemberUid(member);
        const isOpening = openingMemberId === memberUid;

        return (
          <button
            key={memberUid || member.email}
            type="button"
            onClick={() => onSelectMember(member)}
            disabled={isOpening}
            className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left hover:bg-[#F0F2F5] active:scale-[0.99] transition disabled:opacity-60"
          >
            <Avatar user={member} size="lg" showStatus />

            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-[#050505] truncate">
                {name}
              </p>

              <p className="text-[13px] text-[#65676B] truncate">
                {member?.isActive ? 'Available now' : 'Message this member'}
              </p>
            </div>

            {isOpening && <Spinner />}
          </button>
        );
      })}
    </div>
  );
}

function ProfileMenu({
  open,
  onClose,
  currentUser,
  dashboardPath,
  onLogout,
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;

    const handleClick = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClick);

    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className="absolute left-[62px] bottom-4 z-[150] w-72 rounded-2xl bg-white border border-gray-100 shadow-2xl overflow-hidden"
    >
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <Avatar user={currentUser} size="lg" showStatus />

          <div className="min-w-0">
            <p className="text-[15px] font-bold text-[#050505] truncate">
              {getName(currentUser)}
            </p>

            <p className="text-[12px] text-[#65676B] truncate">
              {currentUser?.email || 'NestHub member'}
            </p>
          </div>
        </div>
      </div>

      <div className="py-2">
        <Link
          href={dashboardPath}
          onClick={onClose}
          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[#F0F2F5] transition"
        >
          <span className="w-9 h-9 rounded-full bg-[#F0F2F5] flex items-center justify-center">
            <Image
              src="/icon-192x192.png"
              alt="NestHub"
              width={24}
              height={24}
              className="w-6 h-6 rounded-lg object-cover"
            />
          </span>

          <span className="text-[14px] font-semibold text-[#050505]">
            Go to dashboard
          </span>
        </Link>

      </div>

      <div className="border-t border-gray-100 py-2">
        <button
          type="button"
          onClick={onLogout}
          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-red-50 transition text-red-600"
        >
          <span className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center">
            <LogOut className="w-4 h-4" />
          </span>

          <span className="text-[14px] font-semibold">Log out</span>
        </button>
      </div>
    </div>
  );
}

export default function ChatSidebar({
  user,
  conversations = [],
  members = [],
  activeChat,
  onSelectChat,
  onConversationDeleted,
}) {
  const router = useRouter();
  const recentStorageKey = user?.uid
    ? `nesthub_chat_recent_searches_${user.uid}`
    : 'nesthub_chat_recent_searches_guest';

  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [newMessageMode, setNewMessageMode] = useState(false);
  const [inboxFilter, setInboxFilter] = useState('all');
  const [profileOpen, setProfileOpen] = useState(false);
  const [openingMemberId, setOpeningMemberId] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [enablingNotifications, setEnablingNotifications] = useState(false);
  const [recentSearchIds, setRecentSearchIds] = useState(() =>
    getRecentSearches(recentStorageKey)
  );

  const saveRecentIds = (ids) => {
    setRecentSearchIds(ids);

    try {
      window.localStorage.setItem(recentStorageKey, JSON.stringify(ids));
    } catch (error) {
      console.error('Save recent chat searches failed:', error);
    }
  };

  const pushRecentMember = (member) => {
    const id = getMemberUid(member);

    if (!id) return;

    const next = [id, ...recentSearchIds.filter((item) => item !== id)].slice(
      0,
      8
    );

    saveRecentIds(next);
  };

  const clearRecentSearches = () => {
    saveRecentIds([]);
  };

  const memberMap = useMemo(() => {
    const map = new Map();

    members
      .filter((member) => getMemberUid(member) && member?.email)
      .forEach((member) => {
        const memberUid = getMemberUid(member);

        map.set(memberUid, {
          ...member,
          id: memberUid,
          uid: memberUid,
        });

        if (member.id) {
          map.set(member.id, {
            ...member,
            id: memberUid,
            uid: memberUid,
          });
        }

        if (member.uid) {
          map.set(member.uid, {
            ...member,
            id: memberUid,
            uid: memberUid,
          });
        }
      });

    return map;
  }, [members]);

  const currentMember = useMemo(() => {
    if (!user?.uid) return null;

    return (
      memberMap.get(user.uid) || {
        id: user.uid,
        uid: user.uid,
        name: user.displayName || user.email || 'User',
        displayName: user.displayName || user.email || 'User',
        email: user.email || '',
        photo: user.photoURL || '',
        photoURL: user.photoURL || '',
        isActive: true,
      }
    );
  }, [memberMap, user]);

  const dashboardPath =
    currentMember?.role === 'admin' ? '/admin' : '/dashboard';

  const allOtherMembers = useMemo(() => {
    return members
      .filter((member) => getMemberUid(member) && member?.email)
      .filter((member) => getMemberUid(member) !== user?.uid)
      .map((member) => {
        const memberUid = getMemberUid(member);

        return {
          ...member,
          id: memberUid,
          uid: memberUid,
        };
      })
      .sort((a, b) => {
        if (a?.isActive === b?.isActive) {
          return getName(a).localeCompare(getName(b));
        }

        return a?.isActive ? -1 : 1;
      });
  }, [members, user?.uid]);

  const liveMembers = useMemo(() => {
    return allOtherMembers.filter((member) => matchSearch(member, searchQuery));
  }, [allOtherMembers, searchQuery]);

  const recentMembers = useMemo(() => {
    return recentSearchIds
      .map((id) => memberMap.get(id))
      .filter((member) => getMemberUid(member) && member?.email)
      .filter((member) => getMemberUid(member) !== user?.uid);
  }, [recentSearchIds, memberMap, user?.uid]);

  const liveConversations = useMemo(() => {
    return conversations
      .map((conversation) => {
        const oldOtherUser = conversation?.otherUser || {};
        const oldOtherUid = getMemberUid(oldOtherUser);

        const liveOtherUser =
          memberMap.get(oldOtherUid) ||
          memberMap.get(oldOtherUser.id) ||
          memberMap.get(oldOtherUser.uid) ||
          oldOtherUser;

        const finalOtherUid = getMemberUid(liveOtherUser) || oldOtherUid;

        return {
          ...conversation,
          otherUser: {
            ...oldOtherUser,
            ...liveOtherUser,
            id: finalOtherUid,
            uid: finalOtherUid,
          },
        };
      })
      .filter((conversation) => {
        const otherUser = conversation?.otherUser;

        if (!getMemberUid(otherUser) || !otherUser?.email) return false;
        if (isDeletedForUser(conversation, user?.uid)) return false;

        const archived = isArchivedForUser(conversation, user?.uid);

        if (showArchived) {
          if (!archived) return false;
        } else if (archived) {
          return false;
        }

        if (
          inboxFilter === 'unread' &&
          Number(conversation?.convData?.unreadCount?.[user?.uid] || 0) === 0
        ) {
          return false;
        }

        return (
          matchSearch(otherUser, searchQuery) ||
          getConversationName(conversation).toLowerCase().includes(searchQuery.toLowerCase())
        );
      })
      .sort((a, b) => {
        if (Boolean(a.isPinned) !== Boolean(b.isPinned)) {
          return a.isPinned ? -1 : 1;
        }
        return getConversationTime(b) - getConversationTime(a);
      });
  }, [conversations, inboxFilter, memberMap, searchQuery, showArchived, user?.uid]);

  const updateConversation = async (conversation, payload) => {
    if (!conversation?.id) return;

    setActionLoadingId(conversation.id);

    try {
      await updateDoc(doc(db, 'conversations', conversation.id), {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Conversation action failed:', error);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleArchive = async (conversation) => {
    if (!user?.uid) return;

    await updateConversation(conversation, {
      archivedBy: arrayUnion(user.uid),
    });
  };

  const handleUnarchive = async (conversation) => {
    if (!user?.uid) return;

    await updateConversation(conversation, {
      archivedBy: arrayRemove(user.uid),
    });
  };

  const handleMute = async (conversation) => {
    if (!user?.uid) return;

    await updateConversation(conversation, {
      mutedBy: arrayUnion(user.uid),
    });
  };

  const handleUnmute = async (conversation) => {
    if (!user?.uid) return;

    await updateConversation(conversation, {
      mutedBy: arrayRemove(user.uid),
    });
  };

  const handleMarkRead = async (conversation) => {
    if (!user?.uid || !conversation?.id) return;

    setActionLoadingId(conversation.id);

    try {
      await updateDoc(doc(db, 'conversations', conversation.id), {
        [`unreadCount.${user.uid}`]: 0,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Mark as read failed:', error);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handlePin = async (conversation) => {
    if (!user?.uid) return;
    setActionLoadingId(conversation.id);
    try {
      await pinConversation(conversation.id, user.uid, !conversation.isPinned);
    } catch (error) {
      console.error('Pin conversation failed:', error);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (conversation) => {
    if (!user?.uid) return;
    if (!window.confirm('Delete this conversation from your inbox?')) return;

    await updateConversation(conversation, {
      deletedFor: arrayUnion(user.uid),
      archivedBy: arrayRemove(user.uid),
    });
    onConversationDeleted?.(conversation.id);
  };

  const handleSelectMember = async (member) => {
    if (!user?.uid) return;

    const targetUid = getMemberUid(member);

    if (!targetUid) return;

    setOpeningMemberId(targetUid);
    pushRecentMember(member);

    try {
      const chat = await openOrCreateConversation(user.uid, targetUid);

      if (chat) {
        onSelectChat({
          ...chat,
          otherUser: {
            ...(chat.otherUser || {}),
            ...member,
            id: targetUid,
            uid: targetUid,
          },
        });

        setSearchQuery('');
        setNewMessageMode(false);
        setShowArchived(false);
      }
    } catch (error) {
      console.error('Open member conversation failed:', error);
    } finally {
      setOpeningMemberId(null);
    }
  };

  const handleSelectConversation = (conversation) => {
    if (conversation?.otherUser) {
      pushRecentMember(conversation.otherUser);
    }

    const otherUid = getMemberUid(conversation?.otherUser);

    setNewMessageMode(false);

    onSelectChat({
      ...conversation,
      otherUser: {
        ...(conversation.otherUser || {}),
        id: otherUid,
        uid: otherUid,
      },
    });
  };

  const handleNewMessage = () => {
    setShowArchived(false);
    setSearchQuery('');
    setNewMessageMode((prev) => !prev);
  };

  const handleEnableNotifications = async () => {
    if (!user?.uid || enablingNotifications) return;
    setEnablingNotifications(true);
    const enabled = await setupPushNotifications(user.uid);
    if (enabled) {
      toast.success('Message notifications enabled');
    } else {
      toast.error('Notifications could not be enabled');
    }
    setEnablingNotifications(false);
  };

  const handleLogout = async () => {
    try {
      if (user?.uid) {
        await updateDoc(doc(db, 'users', user.uid), {
          isOnline: false,
          presenceStatus: 'away',
          presenceMode: 'auto',
          activeRoute: '',
          lastSeen: serverTimestamp(),
          presenceUpdatedAt: serverTimestamp(),
        }).catch(() => null);
      }

      await signOut(auth);

      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <aside className="relative h-full w-full overflow-hidden bg-[#F0F2F5] lg:flex">
      <div className="hidden lg:flex w-[56px] h-full bg-[#F0F2F5] border-r border-[#DADDE1] flex-col items-center py-3">
        <div className="w-full flex flex-col items-center gap-1.5">
          <RailButton
            active={!showArchived && !newMessageMode}
            title="Chats"
            onClick={() => {
              setShowArchived(false);
              setNewMessageMode(false);
            }}
          >
            <MessageCircle className="w-5 h-5" />
          </RailButton>

          <RailButton
            active={showArchived}
            title="Archived chats"
            onClick={() => {
              setShowArchived(true);
              setNewMessageMode(false);
            }}
          >
            <Archive className="w-4 h-4" />
          </RailButton>
        </div>

        <div className="flex-1" />

        <div className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen((prev) => !prev)}
            title="Profile"
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition active:scale-95 ${
              profileOpen ? 'bg-white shadow-sm' : 'hover:bg-white/80'
            }`}
          >
            <Avatar user={currentMember} size="xs" showStatus />
          </button>
        </div>
      </div>

      <ProfileMenu
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        currentUser={currentMember}
        dashboardPath={dashboardPath}
        onLogout={handleLogout}
      />

      <div className="h-full min-w-0 flex-1 bg-white flex flex-col overflow-hidden lg:border-r lg:border-[#DADDE1]">
        <div className="flex-shrink-0 bg-white">
          <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-3">
            <h1 className="text-[28px] font-extrabold tracking-tight text-[#050505] leading-tight">
              {newMessageMode
                ? 'New message'
                : showArchived
                  ? 'Archived'
                  : 'Chats'}
            </h1>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={handleEnableNotifications}
                disabled={enablingNotifications}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f0f2f5] text-[#050505] transition hover:bg-[#e4e6eb] disabled:opacity-50"
                title="Enable message notifications"
              >
                <BellRing className="h-[18px] w-[18px]" />
              </button>

              <Link
                href={dashboardPath}
                title="Go to dashboard"
                className="w-9 h-9 rounded-full bg-[#F0F2F5] hover:bg-[#E4E6EB] flex items-center justify-center transition active:scale-95"
              >
                <Image
                  src="/icon-192x192.png"
                  alt="NestHub"
                  width={24}
                  height={24}
                  className="w-6 h-6 rounded-md object-cover"
                />
              </Link>

              <button
                type="button"
                onClick={handleNewMessage}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition active:scale-95 ${
                  newMessageMode
                    ? 'bg-[#0084FF] text-white'
                    : 'bg-[#F0F2F5] hover:bg-[#E4E6EB] text-[#050505]'
                }`}
                title={newMessageMode ? 'Close new message' : 'New message'}
              >
                <Edit className="w-[18px] h-[18px]" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowArchived((prev) => !prev);
                  setNewMessageMode(false);
                }}
                className={`lg:hidden w-9 h-9 rounded-full flex items-center justify-center transition active:scale-95 ${
                  showArchived
                    ? 'bg-[#0084FF] text-white'
                    : 'bg-[#F0F2F5] hover:bg-[#E4E6EB] text-[#050505]'
                }`}
                title={showArchived ? 'Back to chats' : 'Archived chats'}
              >
                <Archive className="w-4 h-4" />
              </button>
            </div>
          </div>

          <ChatSearch
            value={searchQuery}
            onChange={setSearchQuery}
            suggestions={liveMembers}
            recentMembers={recentMembers}
            onSelectMember={handleSelectMember}
            onClearRecent={clearRecentSearches}
          />

          {!newMessageMode && !showArchived && (
            <div className="flex gap-2 px-4 pb-3">
              {[
                { id: 'all', label: 'All' },
                { id: 'unread', label: 'Unread' },
              ].map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setInboxFilter(filter.id)}
                  className={`h-8 rounded-full px-4 text-[13px] font-semibold transition ${
                    inboxFilter === filter.id
                      ? 'bg-[#e7f3ff] text-[#0084ff]'
                      : 'bg-[#f0f2f5] text-[#050505] hover:bg-[#e4e6eb]'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          )}

          {!newMessageMode && !showArchived && (
            <div className="lg:hidden">
              <ActiveMembersBar
                members={liveMembers}
                currentUserId={user?.uid}
                onSelectMember={handleSelectMember}
              />
            </div>
          )}

          <div className="hidden lg:block h-px bg-[#E4E6EB]" />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pb-4 bg-white">
          {openingMemberId ? (
            <div className="py-10 flex flex-col items-center justify-center gap-3">
              <Spinner />

              <p className="text-[13px] text-[#65676B]">
                Opening conversation...
              </p>
            </div>
          ) : newMessageMode ? (
            <MemberList
              members={liveMembers}
              currentUserId={user?.uid}
              openingMemberId={openingMemberId}
              onSelectMember={handleSelectMember}
            />
          ) : (
            <ConversationList
              conversations={liveConversations}
              activeChat={activeChat}
              currentUserId={user?.uid}
              showArchived={showArchived}
              actionLoadingId={actionLoadingId}
              onSelectChat={handleSelectConversation}
              onArchive={handleArchive}
              onUnarchive={handleUnarchive}
              onMute={handleMute}
              onUnmute={handleUnmute}
              onMarkRead={handleMarkRead}
              onPin={handlePin}
              onDelete={handleDelete}
            />
          )}
        </div>
      </div>
    </aside>
  );
}
