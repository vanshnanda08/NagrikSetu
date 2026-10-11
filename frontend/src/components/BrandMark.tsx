/**
 * The NagrikSetu pin-and-bridge mark. The pin and bridge swap colours in dark
 * mode (the "reversed" logo) so the mark never sinks into the page; the
 * colours live in --logo-* tokens for that reason.
 */
export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M24 2C14.6 2 7 9.2 7 18.2c0 8.6 10.4 18.4 17 27.8 6.6-9.4 17-19.2 17-27.8C41 9.2 33.4 2 24 2z"
        fill="var(--logo-pin)"
      />
      <g stroke="var(--logo-bridge)" strokeWidth="2.6" strokeLinecap="round">
        <path d="M12 22Q24 8 36 22" />
        <path d="M10 22h28" />
        <path d="M18 22v-5.2M24 22v-7M30 22v-5.2" strokeWidth="2" />
      </g>
      <circle cx="12" cy="22" r="2.9" fill="#e8761e" />
      <circle cx="36" cy="22" r="2.9" fill="#e8761e" />
      <path d="M17.5 29.5Q24 33.5 30.5 29.5" stroke="#5aa9d6" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
