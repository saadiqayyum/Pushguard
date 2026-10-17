// Stroke-only mark drawn in currentColor so it follows the theme's text colour.
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" fill="none" stroke="currentColor" aria-hidden className={className}>
      <path d="M256 56 L424 122 V270 C424 372 356 430 256 462 C156 430 88 372 88 270 V122 Z" strokeWidth="30" strokeLinejoin="round" />
      <circle cx="256" cy="336" r="30" strokeWidth="26" />
      <path d="M256 302 V184" strokeWidth="26" strokeLinecap="round" />
      <path d="M208 220 L256 170 L304 220" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
