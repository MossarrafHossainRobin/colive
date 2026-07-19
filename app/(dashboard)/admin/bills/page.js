'use client';

import { useState } from 'react';
import { Plus, ReceiptText } from 'lucide-react';
import MonthSelector from '@/components/admin/bills/MonthSelector';
import BillSummaryCards from '@/components/admin/bills/BillSummaryCards';
import BillSetupModal from '@/components/admin/bills/BillSetupModal';
import MemberBillsTable from '@/components/admin/bills/MemberBillsTable';
import MemberBillsMobileCards from '@/components/admin/bills/MemberBillsMobileCards';
import { useBillsMonth } from '@/app/hooks/useBillsMonth';
import { getCurrentMonthId } from '@/lib/billCalculations';
import { AdminPageHeader } from '@/components/admin/ui/AdminUI';

export default function AdminBillsPage() {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthId());
  const [setupOpen, setSetupOpen] = useState(false);

  const {
    activeMembers,
    rooms,
    monthSetup,
    memberRows,
    summary,
    loading,
  } = useBillsMonth(selectedMonth);

  return (
    <main className="mx-auto max-w-7xl space-y-5 pb-12">
      <AdminPageHeader
        eyebrow="Finance / Bills"
        title="Monthly bills"
        description={`${selectedMonth} · ${activeMembers.length} active members · ${rooms.length} rooms. Configure and review one shared monthly calculation.`}
        icon={ReceiptText}
        actions={(
          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-xs font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            <Plus className="h-3.5 w-3.5" /> Setup month
          </button>
        )}
      />

      <section className="ml-auto max-w-sm">
        <MonthSelector value={selectedMonth} onChange={setSelectedMonth} />
      </section>

      <BillSummaryCards summary={summary} />

      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center font-bold text-gray-500">
          Loading monthly calculation...
        </div>
      ) : memberRows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-10 text-center">
          <h2 className="text-lg font-black text-gray-900">No calculation saved for {selectedMonth}</h2>
          <p className="text-sm text-gray-500 mt-1">
            Click “Setup Month” to create individual member calculations for this month.
          </p>
        </div>
      ) : (
        <>
          <MemberBillsTable monthId={selectedMonth} rows={memberRows} />
          <MemberBillsMobileCards monthId={selectedMonth} rows={memberRows} />
        </>
      )}

      <BillSetupModal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        monthId={selectedMonth}
        members={activeMembers}
        rooms={rooms}
        existingSetup={monthSetup}
      />
    </main>
  );
}
