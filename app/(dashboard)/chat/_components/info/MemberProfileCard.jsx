import Avatar from '../common/Avatar';
import { formatLastActive } from '../../_utils/formatChatTime';

function memberName(member) {
  return member?.name || member?.displayName || member?.fullName || 'Member';
}

export default function MemberProfileCard({ member, nickname, blocked, muted }) {
  const realName = memberName(member);
  const displayName = nickname || realName;
  const active = Boolean(member?.isActive || member?.online || member?.isOnline);

  return (
    <div className="px-5 pb-3 pt-7 text-center">
      <div className="flex justify-center">
        <Avatar user={member} size="xl" showStatus />
      </div>
      <h2 className="mt-3 truncate text-[17px] font-semibold leading-6 text-[#050505]">{displayName}</h2>
      {nickname && <p className="truncate text-[13px] text-[#65676b]">{realName}</p>}
      <p className="mt-1 text-[13px] text-[#65676b]">
        {blocked ? 'Blocked' : active ? 'Active now' : formatLastActive(member)}
        {muted && !blocked ? ' · Muted' : ''}
      </p>
    </div>
  );
}
