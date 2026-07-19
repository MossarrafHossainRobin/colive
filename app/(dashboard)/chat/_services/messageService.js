import {
  addDoc,
  arrayUnion,
  collection,
  deleteField,
  doc,
  increment,
  getDocs,
  where,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CHAT_COLLECTIONS } from '../_constants/chatCollections';
import { buildConversationId } from '../_utils/buildConversationId';
import {
  notifyAdminActivity,
  notifyNewMessage,
} from './notificationService';
import { setTypingStatus, setTypingValue } from './chatService';

export function messagesCollection(conversationId) {
  return collection(
    db,
    CHAT_COLLECTIONS.CONVERSATIONS,
    conversationId,
    CHAT_COLLECTIONS.MESSAGES
  );
}

export function orderedMessagesQuery(conversationId) {
  return query(messagesCollection(conversationId), orderBy('createdAt', 'asc'));
}

export function messageDoc(conversationId, messageId) {
  return doc(
    db,
    CHAT_COLLECTIONS.CONVERSATIONS,
    conversationId,
    CHAT_COLLECTIONS.MESSAGES,
    messageId
  );
}

function conversationDoc(conversationId) {
  return doc(db, CHAT_COLLECTIONS.CONVERSATIONS, conversationId);
}

function getSenderUid(sender) {
  return sender?.uid || sender?.id || '';
}

function getSenderName(sender) {
  return sender?.name || sender?.displayName || sender?.email || 'User';
}

function getSenderPhoto(sender) {
  return sender?.photo || sender?.photoURL || '';
}

function getTargetUid(member) {
  return member?.uid || member?.id || '';
}

function getMessageText(message) {
  return message?.text || message?.message || message?.content || '';
}

async function updateConversationAfterSend({
  conversationId,
  senderId,
  receiverId,
  lastMessage,
  lastMessageType = 'text',
}) {
  if (!conversationId || !senderId) return;

  const payload = {
    lastMessage: lastMessage || '',
    lastMessageType,
    lastMessageAt: serverTimestamp(),
    lastSenderId: senderId || '',
    updatedAt: serverTimestamp(),

    // Messenger-like behavior:
    // If receiver deleted or archived this chat, new message brings it back.
    deletedFor: [],
    archivedBy: [],
  };

  if (receiverId) {
    payload[`unreadCount.${receiverId}`] = increment(1);
  }

  try {
    await updateDoc(conversationDoc(conversationId), payload);
  } catch (error) {
    console.error('Update conversation after send failed:', error);

    await setDoc(
      conversationDoc(conversationId),
      {
        lastMessage: lastMessage || '',
        lastMessageType,
        lastMessageAt: serverTimestamp(),
        lastSenderId: senderId || '',
        updatedAt: serverTimestamp(),
        unreadCount: receiverId ? { [receiverId]: 1 } : {},
        deletedFor: [],
        archivedBy: [],
      },
      { merge: true }
    );
  }
}

async function createMessage({
  conversationId,
  receiverId,
  sender,
  messageData,
  lastMessage,
  lastMessageType = 'text',
  notificationBody,
  notificationTitle,
  skipNotification = false,
}) {
  const senderUid = getSenderUid(sender);

  if (!conversationId || !senderUid) return null;

  const messagePayload = {
    ...messageData,

    senderId: senderUid,
    senderUid,
    sender: {
      id: senderUid,
      uid: senderUid,
      name: getSenderName(sender),
      photo: getSenderPhoto(sender),
    },
    senderName: getSenderName(sender),
    senderPhoto: getSenderPhoto(sender),

    receiverId: receiverId || '',

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),

    reactions: messageData.reactions || {},

    seen: false,
    seenBy: [senderUid],
    status: 'sent',

    unsent: false,

    // Remove for me uses this array.
    deletedFor: [],
  };

  const messageRef = await addDoc(
    messagesCollection(conversationId),
    messagePayload
  );

  await updateConversationAfterSend({
    conversationId,
    senderId: senderUid,
    receiverId,
    lastMessage,
    lastMessageType,
  });

  if (receiverId && !skipNotification) {
    await notifyNewMessage({
      receiverId,
      senderId: senderUid,
      senderName: notificationTitle || getSenderName(sender) || 'New message',
      senderPhoto: getSenderPhoto(sender),
      messageText: notificationBody || lastMessage || '',
      conversationId,
    }).catch((error) => {
      console.error('Notify new message failed:', error);
    });
  }

  return {
    id: messageRef.id,
    ...messagePayload,
  };
}

export async function sendTextMessage({
  conversationId,
  text,
  sender,
  receiverId,
  replyTo = null,
}) {
  const cleanText = String(text || '').trim();
  const senderUid = getSenderUid(sender);

  if (!conversationId || !cleanText || !senderUid) return null;

  return createMessage({
    conversationId,
    receiverId,
    sender,
    lastMessage: cleanText,
    lastMessageType: 'text',
    notificationBody: cleanText.substring(0, 100),
    messageData: {
      text: cleanText,
      type: 'text',
      replyTo,
      isSticker: false,
      isGIF: false,
      isReaction: false,
      forwarded: false,
    },
  });
}

export async function sendAdminActivityMessage({
  conversationId,
  title,
  text,
  pushBody,
  updateUrl,
  category,
  details = {},
  sender,
  receiverId,
  notify = true,
}) {
  const senderUid = getSenderUid(sender);
  if (!conversationId || !receiverId || !senderUid || !text) return null;

  const message = await createMessage({
    conversationId,
    receiverId,
    sender,
    lastMessage: title || 'NestHub update',
    lastMessageType: 'admin_activity',
    notificationBody: pushBody || title || 'You have a new NestHub update',
    notificationTitle: `${getSenderName(sender)} • ${title || 'NestHub update'}`,
    skipNotification: true,
    messageData: {
      text,
      type: 'admin_activity',
      adminActivity: {
        title: title || 'NestHub update',
        category: category || 'general',
        details,
      },
      replyTo: null,
      isSticker: false,
      isGIF: false,
      isReaction: false,
      forwarded: false,
    },
  });

  if (notify) {
    await notifyAdminActivity({
      receiverId,
      senderId: senderUid,
      senderName: getSenderName(sender),
      senderPhoto: getSenderPhoto(sender),
      updateTitle: title || 'NestHub update',
      updateBody: pushBody || title || 'Your information has been updated.',
      updateUrl,
      conversationId,
    }).catch((error) => {
      console.error('Notify admin activity failed:', error);
    });
  }

  return message;
}

export async function sendReactionMessage({
  conversationId,
  emoji = '👍',
  sender,
  receiverId,
}) {
  const senderUid = getSenderUid(sender);

  if (!conversationId || !senderUid) return null;

  return createMessage({
    conversationId,
    receiverId,
    sender,
    lastMessage: emoji,
    lastMessageType: 'reaction',
    notificationBody: emoji,
    messageData: {
      text: emoji,
      type: 'reaction',
      replyTo: null,
      isReaction: true,
      isSticker: false,
      isGIF: false,
      forwarded: false,
    },
  });
}

export async function sendStickerMessage({
  conversationId,
  sticker,
  sender,
  receiverId,
}) {
  const senderUid = getSenderUid(sender);

  if (!conversationId || !sticker || !senderUid) return null;

  return createMessage({
    conversationId,
    receiverId,
    sender,
    lastMessage: 'Sent a sticker',
    lastMessageType: 'sticker',
    notificationBody: 'Sent a sticker',
    messageData: {
      text: sticker,
      type: 'sticker',
      replyTo: null,
      isSticker: true,
      isGIF: false,
      isReaction: false,
      forwarded: false,
    },
  });
}

export async function sendGifMessage({
  conversationId,
  gif,
  sender,
  receiverId,
}) {
  const senderUid = getSenderUid(sender);

  if (!conversationId || !gif?.url || !senderUid) return null;

  return createMessage({
    conversationId,
    receiverId,
    sender,
    lastMessage: 'Sent a GIF',
    lastMessageType: 'gif',
    notificationBody: 'Sent a GIF',
    messageData: {
      text: gif.url,
      gifLabel: gif.label || 'GIF',
      type: 'gif',
      replyTo: null,
      isGIF: true,
      isSticker: false,
      isReaction: false,
      forwarded: false,
    },
  });
}

export async function reactToMessage(conversationId, messageId, userId, emoji) {
  if (!conversationId || !messageId || !userId || !emoji) return null;

  if (String(messageId).startsWith('local-')) return null;

  await updateDoc(messageDoc(conversationId, messageId), {
    [`reactions.${userId}`]: emoji,
    updatedAt: serverTimestamp(),
  });

  return {
    messageId,
    userId,
    emoji,
  };
}

export async function removeReaction(conversationId, messageId, userId) {
  if (!conversationId || !messageId || !userId) return null;

  if (String(messageId).startsWith('local-')) return null;

  await updateDoc(messageDoc(conversationId, messageId), {
    [`reactions.${userId}`]: deleteField(),
    updatedAt: serverTimestamp(),
  });

  return {
    messageId,
    userId,
  };
}

export async function removeMessageForMe(conversationId, messageId, userId) {
  if (!conversationId || !messageId || !userId) return null;

  if (String(messageId).startsWith('local-')) return null;

  await updateDoc(messageDoc(conversationId, messageId), {
    deletedFor: arrayUnion(userId),
    updatedAt: serverTimestamp(),
  });

  return {
    messageId,
    userId,
  };
}

export async function unsendMessage(conversationId, messageId) {
  if (!conversationId || !messageId) return null;

  if (String(messageId).startsWith('local-')) return null;

  await updateDoc(messageDoc(conversationId, messageId), {
    text: '',
    message: '',
    content: '',
    reactions: {},
    unsent: true,
    status: 'unsent',
    updatedAt: serverTimestamp(),
  });

  return {
    messageId,
  };
}

export async function forwardMessage({ message, targetMember, currentUser }) {
  const currentUserUid = getSenderUid(currentUser);
  const targetUid = getTargetUid(targetMember);

  if (!message || !targetUid || !currentUserUid) return null;

  const conversationId = buildConversationId(currentUserUid, targetUid);
  const participants = [currentUserUid, targetUid].sort();

  await setDoc(
    conversationDoc(conversationId),
    {
      participants,
      unreadCount: {
        [currentUserUid]: 0,
        [targetUid]: 0,
      },
      deletedFor: [],
      archivedBy: [],
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  const text = getMessageText(message);

  const messagePayload = {
    text,
    senderId: currentUserUid,
    senderUid: currentUserUid,
    sender: {
      id: currentUserUid,
      uid: currentUserUid,
      name: getSenderName(currentUser),
      photo: getSenderPhoto(currentUser),
    },
    senderName: getSenderName(currentUser),
    senderPhoto: getSenderPhoto(currentUser),

    receiverId: targetUid,

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),

    forwarded: true,
    originalSenderId: message.senderId || message.senderUid || '',
    originalMessageId: message.id || '',

    reactions: {},
    seen: false,
    seenBy: [currentUserUid],
    status: 'sent',
    unsent: false,
    deletedFor: [],

    type: message.type || 'text',
    isSticker: Boolean(message.isSticker || message.type === 'sticker'),
    isGIF: Boolean(message.isGIF || message.type === 'gif'),
    isReaction: Boolean(message.isReaction || message.type === 'reaction'),
    replyTo: null,
  };

  const messageRef = await addDoc(
    messagesCollection(conversationId),
    messagePayload
  );

  await updateConversationAfterSend({
    conversationId,
    senderId: currentUserUid,
    receiverId: targetUid,
    lastMessage: 'Forwarded a message',
    lastMessageType: 'forward',
  });

  await notifyNewMessage({
    receiverId: targetUid,
    senderId: currentUserUid,
    senderName: getSenderName(currentUser),
    senderPhoto: getSenderPhoto(currentUser),
    messageText: text || 'Forwarded a message',
    conversationId,
  }).catch((error) => {
    console.error('Notify forwarded message failed:', error);
  });

  return {
    id: messageRef.id,
    ...messagePayload,
  };
}

export async function markVisibleMessagesSeen(
  conversationId,
  messages,
  currentUserId
) {
  if (!conversationId || !currentUserId || !Array.isArray(messages)) return;

  const incomingUnseenMessages = messages.filter((message) => {
    if (!message?.id) return false;
    if (String(message.id).startsWith('local-')) return false;
    if (message.unsent) return false;

    const senderId =
      message.senderId ||
      message.senderUid ||
      message.sender?.uid ||
      message.sender?.id ||
      '';

    if (senderId === currentUserId) return false;

    const alreadySeen =
      message.seenBy?.includes?.(currentUserId) ||
      message.seen === true ||
      message.status === 'seen';

    return !alreadySeen;
  });

  await Promise.all(
    incomingUnseenMessages.map((message) =>
      updateDoc(messageDoc(conversationId, message.id), {
        seen: true,
        seenBy: arrayUnion(currentUserId),
        seenAt: serverTimestamp(),
        status: 'seen',
        updatedAt: serverTimestamp(),
      }).catch(() => null)
    )
  );

  if (incomingUnseenMessages.length > 0) {
    await updateDoc(conversationDoc(conversationId), {
      [`unreadCount.${currentUserId}`]: 0,
      updatedAt: serverTimestamp(),
    }).catch(() => null);
  }
}

export async function markIncomingMessagesDelivered(conversationId, currentUserId) {
  if (!conversationId || !currentUserId) return;

  const snapshot = await getDocs(
    query(
      messagesCollection(conversationId),
      where('receiverId', '==', currentUserId),
      where('status', '==', 'sent')
    )
  ).catch(() => null);

  if (!snapshot || snapshot.empty) return;

  await Promise.all(
    snapshot.docs.map((item) =>
      updateDoc(item.ref, {
        delivered: true,
        deliveredAt: serverTimestamp(),
        deliveredBy: arrayUnion(currentUserId),
        status: 'delivered',
        updatedAt: serverTimestamp(),
      }).catch(() => null)
    )
  );
}

export const markIncomingMessagesSeen = markVisibleMessagesSeen;
export const removeMessage = removeMessageForMe;
export const deleteMessageForMe = removeMessageForMe;
export const removeMessageReaction = removeReaction;
export const addMessageReaction = reactToMessage;
export const sendMessage = sendTextMessage;
export { setTypingStatus, setTypingValue };
