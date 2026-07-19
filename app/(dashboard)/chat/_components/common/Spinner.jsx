export default function Spinner({ label = 'Loading...' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 text-[#65676B]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E4E6EB] border-t-[#0084FF]" />
      {label && <p className="text-sm font-medium">{label}</p>}
    </div>
  );
}
