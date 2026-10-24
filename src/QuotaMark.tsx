/** Original Q / dual-window meter. Shared geometry with the native icons. */
export function QuotaMark({ size = 28 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true"><rect width="64" height="64" rx="19" fill="#25212E" /><circle cx="30" cy="30" r="17" stroke="#DDCFFF" strokeWidth="6.5" /><path d="M30 13A17 17 0 0 1 47 30" stroke="#86D8BD" strokeWidth="6.5" strokeLinecap="round" /><path d="M40 40L49 49" stroke="#DDCFFF" strokeWidth="6.5" strokeLinecap="round" /><path d="M24 27H36M24 34H31" stroke="#DDCFFF" strokeWidth="4" strokeLinecap="round" /></svg>;
}
