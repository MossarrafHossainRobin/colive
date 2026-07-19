function IconMeal() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 3v8a4 4 0 004 4m0 0v6m0-6a4 4 0 004-4V3M18 3v18" />
    </svg>
  );
}

function IconCart() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l2.2 11.2A2 2 0 009.16 16h7.68a2 2 0 001.96-1.6L20 8H6M9 21a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z" />
    </svg>
  );
}

function IconMessage() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h8M8 14h5M21 12a8.5 8.5 0 01-12.5 7.5L3 21l1.5-5.5A8.5 8.5 0 1121 12z" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3M4 9h16M5 5h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" />
    </svg>
  );
}

function StatCard({ label, value, icon, loading }) {
  return (
    <div className="rounded-2xl bg-[#F7F8FA] p-3">
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#65676B] shadow-sm">
        {icon}
      </div>

      <p className="text-xs font-bold text-[#65676B]">{label}</p>

      <p className="mt-1 text-base font-extrabold text-[#050505]">
        {loading ? '...' : value}
      </p>
    </div>
  );
}

export default function MemberActivityStats({ stats, loading }) {
  const cards = [
    {
      label: 'Meals',
      value: stats?.meals || 0,
      icon: <IconMeal />,
    },
    {
      label: 'Bazar',
      value: `${stats?.bazar || 0} Tk`,
      icon: <IconCart />,
    },
    {
      label: 'Messages',
      value: stats?.messages || stats?.totalMessages || 0,
      icon: <IconMessage />,
    },
    {
      label: 'Active days',
      value: stats?.activeDays || 0,
      icon: <IconCalendar />,
    },
  ];

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-extrabold text-[#050505]">Activity</h4>
        <p className="mt-0.5 text-xs text-[#65676B]">
          Member activity summary inside NestHub.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {cards.map((card) => (
          <StatCard
            key={card.label}
            label={card.label}
            value={card.value}
            icon={card.icon}
            loading={loading}
          />
        ))}
      </div>
    </div>
  );
}