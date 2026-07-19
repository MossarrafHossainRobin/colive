function formatTk(value) {
  return `${Number(value || 0).toLocaleString('en-US')} Tk`;
}

function IconBill() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 3h10a2 2 0 012 2v16l-3-2-3 2-3-2-3 2-3-2V5a2 2 0 012-2z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}

function IconService() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.83-5.83M11.42 15.17l2.12-2.12m-2.12 2.12L3 6.75V3h3.75l8.42 8.42" />
    </svg>
  );
}

function IconCard() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8h18M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 15h4" />
    </svg>
  );
}

function IconWarning() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  );
}

function IconBalance() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m-4-8a4 4 0 118 0c0 2.5-4 2.5-4 5" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h16v16H4z" />
    </svg>
  );
}

function FinancialRow({ label, value, icon, loading, highlight = false }) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-2xl px-3 py-3 ${
        highlight ? 'bg-[#E7F3FF]' : 'bg-[#F7F8FA]'
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ${
            highlight ? 'text-[#0084FF]' : 'text-[#65676B]'
          }`}
        >
          {icon}
        </div>

        <span
          className={`truncate text-sm font-bold ${
            highlight ? 'text-[#0084FF]' : 'text-[#65676B]'
          }`}
        >
          {label}
        </span>
      </div>

      <span
        className={`shrink-0 text-sm font-extrabold ${
          highlight ? 'text-[#0084FF]' : 'text-[#050505]'
        }`}
      >
        {loading ? '...' : value}
      </span>
    </div>
  );
}

export default function MemberFinancialStats({ stats, loading }) {
  const bills = stats?.bills || 0;
  const serviceCharges = stats?.serviceCharges || 0;
  const balance = stats?.balance || 0;
  const deposit = stats?.deposit || stats?.paid || 0;
  const due = stats?.due || Math.max(0, bills + serviceCharges - deposit);

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-extrabold text-[#050505]">Financial</h4>
        <p className="mt-0.5 text-xs text-[#65676B]">
          Meal, bill, service and balance overview.
        </p>
      </div>

      <div className="space-y-2">
        <FinancialRow
          label="Bills"
          value={formatTk(bills)}
          icon={<IconBill />}
          loading={loading}
        />

        <FinancialRow
          label="Service"
          value={formatTk(serviceCharges)}
          icon={<IconService />}
          loading={loading}
        />

        <FinancialRow
          label="Deposit"
          value={formatTk(deposit)}
          icon={<IconCard />}
          loading={loading}
        />

        <FinancialRow
          label="Due"
          value={formatTk(due)}
          icon={<IconWarning />}
          loading={loading}
        />

        <FinancialRow
          label="Balance"
          value={formatTk(balance)}
          icon={<IconBalance />}
          loading={loading}
          highlight
        />
      </div>
    </div>
  );
}