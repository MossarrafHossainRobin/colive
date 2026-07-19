'use client';

import Avatar from '../common/Avatar';

function getMemberName(member) {
  return (
    member?.name ||
    member?.displayName ||
    member?.fullName ||
    member?.email ||
    'Member'
  );
}

function getRoomLabel(member) {
  return (
    member?.roomName ||
    member?.roomNo ||
    member?.roomNumber ||
    member?.assignedRoom ||
    member?.room ||
    member?.roomId ||
    ''
  );
}

export default function ActiveMembersBar({
  members = [],
  currentUserId,
  onSelectMember,
}) {
  const validMembers = members
    .filter((member) => member?.id && member?.email)
    .filter((member) => member.id !== currentUserId)
    .sort((a, b) => {
      if (a?.isActive === b?.isActive) {
        return getMemberName(a).localeCompare(getMemberName(b));
      }

      return a?.isActive ? -1 : 1;
    });

  if (validMembers.length === 0) {
    return (
      <div className="px-4 pb-3">
        <div className="rounded-2xl bg-[#F0F2F5] px-4 py-4 text-center">
          <p className="text-[13px] font-medium text-[#65676B]">
            No members found
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-3">
      <div
        className="flex gap-3 overflow-x-auto pb-1"
        style={{
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {validMembers.map((member) => {
          const name = getMemberName(member);
          const firstName = name.split(' ')[0];
          const roomLabel = getRoomLabel(member);
          const isActive = member?.isActive === true;

          return (
            <button
              key={member.id}
              type="button"
              onClick={() => onSelectMember(member)}
              title={`${name} • ${isActive ? 'Active' : 'Away'}`}
              className="group min-w-[70px] max-w-[70px] flex flex-col items-center text-center active:scale-95 transition"
            >
              <div className="relative">
                <Avatar user={member} size="lg" showStatus />

                {member?.role === 'admin' && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#050505] text-white text-[9px] font-bold flex items-center justify-center border-2 border-white shadow-sm">
                    A
                  </span>
                )}
              </div>

              <span className="mt-1 text-[11px] leading-tight text-[#050505] font-semibold truncate w-full">
                {firstName}
              </span>

              <span
                className={`mt-0.5 px-1.5 py-0.5 rounded-full text-[8px] leading-none font-bold w-fit max-w-full truncate ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {isActive ? 'Active' : 'Away'}
              </span>

              {roomLabel && (
                <span className="mt-0.5 text-[8px] text-[#65676B] truncate w-full">
                  {roomLabel}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}