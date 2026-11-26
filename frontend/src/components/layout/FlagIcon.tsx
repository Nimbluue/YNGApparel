export function IdFlag({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 18 12"
      width="18"
      height="12"
      aria-hidden="true"
      className={`shrink-0 ring-1 ring-black/10 ${className}`}
    >
      <rect width="18" height="6" y="0" fill="#CE1126" />
      <rect width="18" height="6" y="6" fill="#FFFFFF" />
    </svg>
  );
}

export function GbFlag({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 18 12"
      width="18"
      height="12"
      aria-hidden="true"
      className={`shrink-0 ring-1 ring-black/10 ${className}`}
    >
      <rect width="18" height="12" fill="#012169" />
      <path d="M0 0 L18 12 M18 0 L0 12" stroke="#FFFFFF" strokeWidth="2.2" />
      <path d="M0 0 L18 12 M18 0 L0 12" stroke="#C8102E" strokeWidth="1" />
      <path d="M9 0 V12 M0 6 H18" stroke="#FFFFFF" strokeWidth="3.2" />
      <path d="M9 0 V12 M0 6 H18" stroke="#C8102E" strokeWidth="1.8" />
    </svg>
  );
}
