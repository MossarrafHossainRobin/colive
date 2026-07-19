'use client';

import { Clock3, FileSpreadsheet, RefreshCw, ShieldCheck } from 'lucide-react';
import { DEFAULT_MAINTENANCE_SETTINGS } from '@/lib/maintenanceMode';

export default function MaintenanceNotice({ settings }) {
  const notice = {
    ...DEFAULT_MAINTENANCE_SETTINGS,
    ...(settings || {}),
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#050505] text-white">
      <div className="relative flex min-h-screen items-center justify-center px-5 py-10">
        <div className="absolute inset-x-0 top-0 h-1 bg-[#1DBF73]" />

        <section className="relative w-full max-w-5xl">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div className="space-y-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-[#1DBF73]">
                <span className="h-2 w-2 rounded-full bg-[#1DBF73]" />
                NestHub system notice
              </div>

              <div className="space-y-4">
                <h1 className="max-w-3xl text-5xl font-black leading-[0.98] tracking-normal text-white sm:text-6xl lg:text-7xl">
                  {notice.title}
                </h1>
                <p className="max-w-2xl text-base font-medium leading-7 text-white/72 sm:text-lg">
                  {notice.message}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                  <Clock3 className="mb-3 h-5 w-5 text-[#1DBF73]" />
                  <p className="text-xs font-bold uppercase tracking-wide text-white/40">
                    Status
                  </p>
                  <p className="mt-1 text-sm font-black text-white">
                    {notice.etaLabel}
                  </p>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                  <FileSpreadsheet className="mb-3 h-5 w-5 text-[#1DBF73]" />
                  <p className="text-xs font-bold uppercase tracking-wide text-white/40">
                    Meals
                  </p>
                  <p className="mt-1 text-sm font-black text-white">
                    Use Excel sheet
                  </p>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                  <ShieldCheck className="mb-3 h-5 w-5 text-[#1DBF73]" />
                  <p className="text-xs font-bold uppercase tracking-wide text-white/40">
                    Access
                  </p>
                  <p className="mt-1 text-sm font-black text-white">
                    Admin controlled
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#1DBF73] px-5 py-3 text-sm font-black text-black transition hover:bg-white"
              >
                <RefreshCw className="h-4 w-4" />
                Check again
              </button>
            </div>

            <div className="relative mx-auto aspect-square w-full max-w-sm rounded-lg border border-white/10 bg-white/[0.03] p-5 shadow-2xl shadow-[#1DBF73]/10">
              <div className="flex h-full flex-col justify-between rounded-lg border border-[#1DBF73]/25 bg-black p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-[#1DBF73]" />
                    <span className="h-3 w-3 rounded-full bg-white/20" />
                    <span className="h-3 w-3 rounded-full bg-white/20" />
                  </div>
                  <span className="rounded-full bg-[#1DBF73]/10 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-[#1DBF73]">
                    Notice
                  </span>
                </div>

                <div className="space-y-4">
                  <div className="h-3 w-3/4 rounded-full bg-white/15" />
                  <div className="h-3 w-11/12 rounded-full bg-white/10" />
                  <div className="h-3 w-7/12 rounded-full bg-white/10" />
                </div>

                <div className="grid grid-cols-7 gap-2">
                  {Array.from({ length: 35 }).map((_, index) => (
                    <span
                      key={index}
                      className={`aspect-square rounded ${
                        index % 6 === 0 || index % 11 === 0
                          ? 'bg-[#1DBF73]'
                          : 'bg-white/10'
                      }`}
                    />
                  ))}
                </div>

                <div className="rounded-lg bg-[#1DBF73] p-4 text-black">
                  <p className="text-xs font-black uppercase tracking-wide">
                    Meal tracking continues
                  </p>
                  <p className="mt-1 text-sm font-black">
                    Keep today&apos;s lunch and dinner counts in the sheet.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
