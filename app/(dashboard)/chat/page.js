import { Suspense } from 'react';
import ChatFeature from './_components/ChatFeature';
import ChatPageSkeleton from './_components/common/ChatPageSkeleton';

export const metadata = {
  title: 'Chat | NestHub',
  description: 'NestHub member messaging system',
};

export default function ChatPage() {
  return (
    <main className="h-[100dvh] w-full overflow-hidden bg-white lg:fixed lg:inset-0 lg:z-30">
      <Suspense fallback={<ChatPageSkeleton />}>
        <ChatFeature />
      </Suspense>
    </main>
  );
}