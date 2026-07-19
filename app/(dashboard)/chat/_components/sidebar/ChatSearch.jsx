'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import Avatar from '../common/Avatar';

function getName(member) {
  return (
    member?.name ||
    member?.displayName ||
    member?.fullName ||
    'Member'
  );
}

function MemberSuggestionItem({ member, onClick }) {
  const name = getName(member);

  return (
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        onClick(member);
      }}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-[#F0F2F5] active:scale-[0.99] transition text-left"
    >
      <div className="relative flex-shrink-0">
        <Avatar user={member} size="md" showStatus />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-[#050505] truncate">
          {name}
        </p>
      </div>
    </button>
  );
}

export default function ChatSearch({
  value,
  onChange,
  suggestions = [],
  recentMembers = [],
  onSelectMember,
  onClearRecent,
}) {
  const [focused, setFocused] = useState(false);
  const wrapperRef = useRef(null);

  const query = value.trim();

  const showingSuggestions = focused && query.length > 0;
  const showingRecent =
    focused && query.length === 0 && recentMembers.length > 0;

  const visibleList = showingSuggestions
    ? suggestions.slice(0, 8)
    : recentMembers.slice(0, 6);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setFocused(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (member) => {
    onSelectMember?.(member);
    setFocused(false);
  };

  return (
    <div ref={wrapperRef} className="relative px-4 pb-3">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#65676B]" />

        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setFocused(true)}
          placeholder="Search name"
          className="w-full h-10 pl-10 pr-10 rounded-full bg-[#F0F2F5] text-[15px] text-[#050505] placeholder:text-[#65676B] outline-none focus:bg-white focus:ring-2 focus:ring-[#0084FF]/20 transition"
        />

        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full hover:bg-[#E4E6EB] flex items-center justify-center transition"
          >
            <X className="w-4 h-4 text-[#65676B]" />
          </button>
        )}
      </div>

      {(showingSuggestions || showingRecent) && (
        <div className="absolute left-4 right-4 top-[48px] z-[80] rounded-3xl bg-white border border-gray-100 shadow-2xl p-2 max-h-[420px] overflow-y-auto">
          <div className="flex items-center justify-between px-2 pb-1">
            <p className="text-[12px] font-bold text-[#65676B]">
              {showingSuggestions ? 'Suggestions' : 'Recent searches'}
            </p>

            {showingRecent && (
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onClearRecent?.();
                }}
                className="text-[12px] font-semibold text-[#0084FF] hover:underline"
              >
                Clear
              </button>
            )}
          </div>

          {visibleList.length > 0 ? (
            <div className="space-y-1">
              {visibleList.map((member) => (
                <MemberSuggestionItem
                  key={member.id || member.uid || member.email}
                  member={member}
                  onClick={handleSelect}
                />
              ))}
            </div>
          ) : (
            <div className="px-4 py-8 text-center">
              <p className="text-[14px] font-semibold text-[#050505]">
                No member found
              </p>

              <p className="text-[12px] text-[#65676B] mt-1">
                Try searching by member name.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}