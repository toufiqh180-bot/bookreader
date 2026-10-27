/**
 * The BookReader mark: the app icon's open book on its blue tile, drawn
 * small enough for toolbars and headers. The full-detail icon lives in
 * build/icon.svg.
 */
import { useId } from 'react';
import { cn } from '@/lib/cn';

export function Logo({ className }: { className?: string }) {
  const id = useId(); // unique gradient ids when several logos are on screen
  return (
    <svg viewBox="0 0 64 64" className={cn('size-6 shrink-0', className)} role="img" aria-label="BookReader">
      <defs>
        <linearGradient id={`${id}-tile`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3D8BFF" />
          <stop offset="1" stopColor="#1748C9" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14.5" fill={`url(#${id}-tile)`} />
      <path d="M32 20.5c-4.6-3.3-11.4-4.2-17.5-2.3v25.5c6.1-1.8 12.9-.9 17.5 2.3z" fill="#fff" />
      <path d="M32 20.5c4.6-3.3 11.4-4.2 17.5-2.3v25.5c-6.1-1.8-12.9-.9-17.5 2.3z" fill="#EAF0FF" />
      <path d="M44.7 18.5l3-.3v9.8l-1.5-1.5-1.5 1.5z" fill="#FF8A24" />
      <path
        d="M18 25.5c3.6-.8 7.4-.5 10.5.7M18 30c3.6-.8 7.4-.5 10.5.7M18 34.5c3-.6 5.6-.5 8 .2"
        stroke="#9CB3EE"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/** Logo + name, for headers and the splash screen. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5 font-semibold tracking-tight', className)}>
      <Logo className="size-8" />
      BookReader
    </span>
  );
}
