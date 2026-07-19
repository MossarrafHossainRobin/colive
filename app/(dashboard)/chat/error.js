'use client';

export default function ChatError({ error, reset }) {
  return (
    <div className="h-[100dvh] w-full flex items-center justify-center bg-[#F0F2F5] px-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-sm border border-gray-100">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
          <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-[#050505]">Chat could not load</h2>
        <p className="mt-2 text-sm text-[#65676B]">{error?.message || 'Something went wrong while loading the chat.'}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-full bg-[#0084FF] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0073dc]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
