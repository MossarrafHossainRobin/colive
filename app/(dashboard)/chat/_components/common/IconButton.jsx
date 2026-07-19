export default function IconButton({ children, label, className = '', ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-[#65676B] transition hover:bg-[#F0F2F5] hover:text-[#050505] active:scale-95 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
