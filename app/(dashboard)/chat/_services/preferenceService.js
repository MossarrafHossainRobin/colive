import {
  archiveConversation,
  pinConversation,
  setBlocked,
  setConversationNickname,
  setMuted,
} from './conversationService';

export async function toggleArchive(conversationId, userId, archived) {
  return archiveConversation(conversationId, userId, archived);
}

export async function togglePin(conversationId, userId, pinned) {
  return pinConversation(conversationId, userId, pinned);
}

export async function toggleMute(conversationId, userId, muted) {
  return setMuted(conversationId, userId, muted);
}

export async function toggleBlock(conversationId, userId, blocked) {
  return setBlocked(conversationId, userId, blocked);
}

export async function saveNickname(conversationId, userId, nickname) {
  return setConversationNickname(conversationId, userId, nickname);
}
