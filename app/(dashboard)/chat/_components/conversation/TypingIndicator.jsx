export default function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 rounded-2xl bg-[#F0F2F5] px-3 py-2 shadow-sm">
      {[0, 1, 2].map((item) => (
        <span
          key={item}
          className="h-2 w-2 animate-bounce rounded-full bg-[#65676B]"
          style={{ animationDelay: `${item * 120}ms` }}
        />
      ))}
    </div>
  );
}
