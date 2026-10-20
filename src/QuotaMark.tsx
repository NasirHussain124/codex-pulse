/** Quota meter / Q mark, shared with pulse.svg and the native app icons. */
export function QuotaMark({ size = 28 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true"><rect width="64" height="64" rx="18" fill="#353449" /><rect x="15" y="13" width="34" height="35" rx="11" stroke="#DED5FF" strokeWidth="5" /><path d="M24 26H40M24 35H33M39 42L50 52" stroke="#DED5FF" strokeWidth="5" strokeLinecap="round" /></svg>;
}
