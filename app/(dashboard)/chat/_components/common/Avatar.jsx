'use client';

export default function Avatar({
  user,
  size = 'md',
  showStatus = false,
  showRing = true,
  className = '',
}) {
  const name =
    user?.name ||
    user?.displayName ||
    user?.fullName ||
    user?.email ||
    'U';

  const photo =
    user?.photo ||
    user?.photoURL ||
    user?.avatar ||
    user?.image ||
    '';

  const isActive = user?.isActive === true;
  const initial = name.charAt(0).toUpperCase();

  const sizeMap = {
    xs: 'w-7 h-7 text-[11px]',
    sm: 'w-9 h-9 text-sm',
    md: 'w-11 h-11 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-20 h-20 text-2xl',
  };

  const dotMap = {
    xs: 'w-2.5 h-2.5',
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
    lg: 'w-3.5 h-3.5',
    xl: 'w-5 h-5',
  };

  return (
    <div className={`relative inline-flex flex-shrink-0 ${className}`}>
      {photo ? (
        <img
          src={photo}
          alt={name}
          className={`${sizeMap[size] || sizeMap.md} rounded-full object-cover bg-[#E4E6EB] ${
            showRing ? 'ring-2 ring-white shadow-sm' : ''
          }`}
        />
      ) : (
        <div
          className={`${sizeMap[size] || sizeMap.md} rounded-full bg-gradient-to-br from-[#0084FF] via-[#4F46E5] to-[#7C3AED] text-white font-bold flex items-center justify-center ${
            showRing ? 'ring-2 ring-white shadow-sm' : ''
          }`}
        >
          {initial}
        </div>
      )}

      {showStatus && (
        <span
          title={isActive ? 'Active' : 'Away'}
          className={`absolute bottom-0 right-0 ${dotMap[size] || dotMap.md} rounded-full border-2 border-white shadow-sm ${
            isActive ? 'bg-emerald-500' : 'bg-gray-400'
          }`}
        />
      )}
    </div>
  );
}