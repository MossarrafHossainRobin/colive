export default function OnlineDot({ active, size = 'md' }) {
  const sizes = {
    sm: 'h-2.5 w-2.5',
    md: 'h-3 w-3',
    lg: 'h-3.5 w-3.5',
  };

  return (
    <span
      className={`${sizes[size] || sizes.md} rounded-full ring-2 ring-white ${
        active ? 'bg-[#31A24C]' : 'bg-gray-400'
      }`}
    />
  );
}
