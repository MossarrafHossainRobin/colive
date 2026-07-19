import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { openOrCreateConversation } from '@/app/(dashboard)/chat/_services/conversationService';
import { sendAdminActivityMessage as createAdminMessage } from '@/app/(dashboard)/chat/_services/messageService';

function memberName(member) {
  return member?.name || member?.displayName || member?.fullName || 'Member';
}

function money(value) {
  return `Tk ${Number(value || 0).toLocaleString('en-US')}`;
}

function updatePageForCategory(category) {
  const pages = {
    bill: '/bills',
    meal: '/meals',
    bazar: '/bazar',
    bazar_assignment: '/bazar',
    announcement: '/notifications',
    issue: '/notifications',
    profile: '/dashboard',
    membership: '/dashboard',
  };

  return pages[category] || '/notifications';
}

export async function sendAdminChatUpdate({
  member,
  category,
  title,
  summary,
  fields = [],
  details = {},
  notify = true,
}) {
  const adminUser = auth.currentUser;
  const memberId = member?.id || member?.uid || member?.userId;

  if (!adminUser?.uid || !memberId || adminUser.uid === memberId) return null;

  const adminSnapshot = await getDoc(doc(db, 'users', adminUser.uid)).catch(() => null);
  const adminData = adminSnapshot?.data?.() || {};
  const chat = await openOrCreateConversation(adminUser.uid, memberId);
  if (!chat) return null;

  const lines = [
    `Dear ${memberName(member)},`,
    '',
    summary,
    '',
    ...fields
      .filter((field) => field?.label && field?.value !== undefined && field?.value !== '')
      .map((field) => `${field.label}: ${field.value}`),
    '',
    'Regards,',
    'NestHub Admin',
  ];
  const fieldPreview = fields
    .filter((field) => field?.label && field?.value !== undefined && field?.value !== '')
    .slice(0, 3)
    .map((field) => `${field.label}: ${field.value}`)
    .join(' | ');

  return createAdminMessage({
    conversationId: chat.id,
    receiverId: memberId,
    sender: {
      id: adminUser.uid,
      uid: adminUser.uid,
      name: adminData.name || adminData.displayName || adminUser.displayName || 'NestHub Admin',
      photo: adminData.photo || adminData.photoURL || adminUser.photoURL || '',
    },
    title,
    text: lines.join('\n'),
    pushBody: [summary, fieldPreview].filter(Boolean).join(' '),
    updateUrl: details?.url || updatePageForCategory(category),
    category,
    details,
    notify,
  });
}

export const adminMessageFormat = { money, memberName };
