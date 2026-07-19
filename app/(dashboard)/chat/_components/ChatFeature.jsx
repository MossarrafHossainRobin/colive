'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import ChatShell from './ChatShell';
import Spinner from './common/Spinner';

export default function ChatFeature() {
  const { user, userData } = useAuth();
  const searchParams = useSearchParams();
  const [targetMember, setTargetMember] = useState(null);

  useEffect(() => {
    setTargetMember(searchParams.get('member') || null);
  }, [searchParams]);

  if (!user?.uid) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-white">
        <Spinner label="Checking account..." />
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden">
      <ChatShell user={user} userData={userData} targetMember={targetMember} />
    </div>
  );
}
