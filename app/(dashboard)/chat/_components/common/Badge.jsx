export default function Badge({ children, variant = 'blue' }) {
  const styles = {
    blue: 'bg-[#0084FF] text-white',
    gray: 'bg-[#E4E6EB] text-[#050505]',
    green: 'bg-green-50 text-green-700',
    red: 'bg-red-50 text-red-600',
    yellow: 'bg-yellow-50 text-yellow-700',
  };

  if (!children && children !== 0) return null;

  return (
    <span className={`inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${styles[variant] || styles.blue}`}>
      {children}
    </span>
  );
}
