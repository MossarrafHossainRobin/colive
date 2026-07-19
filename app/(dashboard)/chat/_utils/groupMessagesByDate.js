import { formatMessageDateKey } from './formatChatTime';

export function groupMessagesByDate(messages = []) {
  return messages.reduce((groups, message) => {
    const key = formatMessageDateKey(message.createdAt) || 'unknown';
    if (!groups[key]) groups[key] = [];
    groups[key].push(message);
    return groups;
  }, {});
}
