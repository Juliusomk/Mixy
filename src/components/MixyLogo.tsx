import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { mediaUrl } from '../lib/api';
import type { VerificationType } from '../types/mixy';

export function MixyLogo({
  size = 'md',
  showTagline = false,
}: {
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
}) {
  const dimensions =
    size === 'lg' ? 'h-14 w-auto' : size === 'sm' ? 'h-8 w-auto' : 'h-10 w-auto';

  return (
    <div className="inline-flex flex-col items-start select-none shrink-0">
      <svg
        viewBox="0 0 180 68"
        className={dimensions}
        aria-label="MIXY"
        role="img"
      >
        <defs>
          <linearGradient id="mixyWordGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#f5d0fe" />
            <stop offset="100%" stopColor="#bae6fd" />
          </linearGradient>
          <linearGradient id="mixyWordGradLight" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#db2777" />
            <stop offset="55%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#0284c7" />
          </linearGradient>
          <linearGradient id="mixyCrownGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fde047" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
        </defs>
        {/* Tilted Golden Crown */}
        <g transform="translate(88, 2) rotate(10)">
          <path
            d="M4 18 L1 5 L11 12 L18 1 L25 12 L35 5 L32 18 Z"
            fill="url(#mixyCrownGrad)"
            stroke="#fef08a"
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <circle cx="1" cy="4" r="1.8" fill="#fef08a" />
          <circle cx="18" cy="1" r="2.2" fill="#fef08a" />
          <circle cx="35" cy="4" r="1.8" fill="#fef08a" />
        </g>
        {/* Expressive Script-Inspired Wordmark */}
        <text
          x="6"
          y="54"
          className="fill-[url(#mixyWordGradLight)] dark:fill-[url(#mixyWordGrad)]"
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 800,
            fontStyle: 'italic',
            fontSize: '46px',
            letterSpacing: '-0.03em',
          }}
        >
          Mixy
        </text>
      </svg>
      {showTagline && (
        <span className="text-[11px] font-medium tracking-widest text-slate-500 dark:text-slate-300/80 pl-1 -mt-1 whitespace-nowrap">
          Connect · Share · Vibe
        </span>
      )}
    </div>
  );
}

export function VerifiedBadge({
  className = 'w-4 h-4',
  verified = true,
  verificationType,
}: {
  className?: string;
  verified?: boolean;
  verificationType?: VerificationType | null;
}) {
  if (!verified) return null;
  const label =
    verificationType === 'official'
      ? 'Verified official account'
      : verificationType === 'creator'
        ? 'Verified creator account'
        : 'Verified account';

  return (
    <span
      className={`${className} inline-flex items-center justify-center shrink-0 align-middle select-none`}
      role="img"
      aria-label={label}
      title={label}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-[0_1px_1px_rgba(0,149,246,0.28)]"
      >
        <circle cx="12" cy="12" r="10.5" fill="#0095F6" />
        <circle cx="12" cy="12" r="10.5" stroke="#38BDF8" strokeOpacity="0.35" strokeWidth="1" />
        <path
          d="M8 12.4L10.7 15.1L16.3 9.3"
          stroke="#FFFFFF"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function UserVerifiedBadge({
  uid,
  username,
  fallback = false,
  className = 'w-3.5 h-3.5',
}: {
  uid?: string | null;
  username?: string | null;
  fallback?: boolean;
  className?: string;
}) {
  const { usersByUsername, getVerificationInfo } = useAuth();
  const resolvedUid =
    uid || (username ? usersByUsername.get(username.replace(/^@/, '').toLowerCase())?.uid : undefined);
  const info = getVerificationInfo(resolvedUid, fallback);
  if (!info.isVerified) return null;
  return (
    <VerifiedBadge
      className={className}
      verified={info.isVerified}
      verificationType={info.verificationType}
    />
  );
}

export function UserAvatar({
  src,
  name,
  size = 'md',
  hasStory = false,
  isOnline = false,
  verified = false,
  className = '',
}: {
  src?: string;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  hasStory?: boolean;
  isOnline?: boolean;
  verified?: boolean;
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);

  const sizeMap = {
    xs: 'w-7 h-7 text-xs',
    sm: 'w-9 h-9 text-xs',
    md: 'w-11 h-11 text-sm',
    lg: 'w-16 h-16 text-lg',
    xl: 'w-24 h-24 text-2xl',
  };

  const badgeSizeMap = {
    xs: 'w-3 h-3',
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
    xl: 'w-6 h-6',
  };

  const initials = (name || 'M')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  const resolvedSrc = mediaUrl(src);

  const inner = (
    <div
      className={`${sizeMap[size]} rounded-full overflow-hidden flex items-center justify-center font-bold text-white mixy-gradient-bg shrink-0 relative ${className}`}
    >
      {resolvedSrc && !imgError ? (
        <img
          src={resolvedSrc}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span>{initials || 'M'}</span>
      )}
    </div>
  );

  return (
    <div className="relative inline-flex shrink-0">
      {hasStory ? (
        <div className="p-[2.5px] rounded-full mixy-story-ring">
          <div className="p-[2px] rounded-full bg-white dark:bg-[#07070D]">
            {inner}
          </div>
        </div>
      ) : (
        inner
      )}
      {isOnline && (
        <span
          className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#07070D]"
          title="Active now"
        />
      )}
      {verified && (
        <span
          className={`absolute ${isOnline ? 'top-0 right-0' : 'bottom-0 right-0'} rounded-full bg-white dark:bg-[#07070D] p-[1.5px] flex items-center justify-center shadow-sm`}
        >
          <VerifiedBadge className={badgeSizeMap[size]} />
        </span>
      )}
    </div>
  );
}
