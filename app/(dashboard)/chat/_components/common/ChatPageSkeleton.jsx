export default function ChatPageSkeleton() {
  return (
    <div className="h-[100dvh] w-full bg-[#F0F2F5] p-0 md:p-4">
      <div className="h-full grid grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)_340px]">
        <div className="hidden rounded-2xl bg-white p-4 lg:block">
          <div className="h-8 w-40 rounded-full bg-[#F0F2F5] animate-pulse" />
          <div className="mt-6 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-[#F0F2F5] animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-32 rounded bg-[#F0F2F5] animate-pulse" />
                  <div className="h-3 w-44 rounded bg-[#F0F2F5] animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex h-full flex-col bg-white md:rounded-2xl">
          <div className="h-14 border-b border-gray-100 px-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-[#F0F2F5] animate-pulse" />
            <div className="h-4 w-36 rounded bg-[#F0F2F5] animate-pulse" />
          </div>
          <div className="flex-1 p-4 space-y-4">
            <div className="h-10 w-52 rounded-2xl bg-[#F0F2F5] animate-pulse" />
            <div className="ml-auto h-10 w-48 rounded-2xl bg-[#E7F3FF] animate-pulse" />
            <div className="h-10 w-64 rounded-2xl bg-[#F0F2F5] animate-pulse" />
          </div>
          <div className="h-16 border-t border-gray-100 p-3">
            <div className="h-10 rounded-full bg-[#F0F2F5] animate-pulse" />
          </div>
        </div>

        <div className="hidden rounded-2xl bg-white lg:block" />
      </div>
    </div>
  );
}
