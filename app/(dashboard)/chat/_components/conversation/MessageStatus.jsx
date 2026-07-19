function seenPhoto(user) {
  return user?.photo || user?.photoURL || user?.avatar || user?.image || '';
}

export default function MessageStatus({ status, seen, seenUser }) {
  if (seen || status === 'seen') {
    const photo = seenPhoto(seenUser);
    const name = seenUser?.name || seenUser?.displayName || 'Seen';

    return photo ? (
      // eslint-disable-next-line @next/next/no-img-element -- user profile URLs may be remote
      <img
        src={photo}
        alt={`Seen by ${name}`}
        title={`Seen by ${name}`}
        className="h-4 w-4 rounded-full object-cover ring-1 ring-white"
      />
    ) : (
      <span
        title={`Seen by ${name}`}
        className="flex h-4 w-4 items-center justify-center rounded-full bg-[#0084ff] text-[8px] font-bold text-white"
      >
        {name.charAt(0).toUpperCase()}
      </span>
    );
  }

  if (status === 'sent') {
    return <span className="text-[10px] text-[#65676B]">Sent</span>;
  }

  if (status === 'delivered') {
    return <span className="text-[10px] text-[#65676B]">Delivered</span>;
  }

  if (status === 'failed') {
    return <span className="text-[10px] font-semibold text-red-500">Failed</span>;
  }

  return <span className="text-[10px] text-[#65676B]">Sending</span>;
}
