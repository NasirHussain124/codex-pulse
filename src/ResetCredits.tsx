import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from './api';
import type { ResetReview } from './types';

export function ResetCredits({ accountId, disabled, notify }: { accountId: string; disabled: boolean; notify: (text: string) => void }) {
  const [review, setReview] = useState<ResetReview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [lastCredit, setLastCredit] = useState<string | null>(null);
  const [outcome, setOutcome] = useState('');
  useEffect(() => { setReview(null); setError(''); setLastCredit(null); setOutcome(''); }, [accountId]);
  const load = async () => {
    if (!api.resetReview || pending) return;
    setPending(true); setError('');
    try { const latest = await api.resetReview(accountId); setReview(latest); setLastCredit(latest.pendingCreditId || null); }
    catch (e) { setError((e as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, '')); }
    finally { setPending(false); }
  };
  const redeem = async (credit: string) => {
    if (!api.resetConsume || pending) return;
    setPending(true); setError('');
    try {
      const result = await api.resetConsume(accountId, credit);
      if (result.canceled) return;
      if (result.review) setReview(result.review);
      setLastCredit(null);
      const message = result.outcome === 'reset' || result.outcome === 'alreadyRedeemed' ? 'Reset verified. The latest provider limits are shown.' : result.outcome === 'nothingToReset' ? 'No eligible limit to reset. No credit was spent.' : 'No available reset credit. The account has been refreshed.';
      setOutcome(message); notify(message);
    } catch (e) { setLastCredit(credit); setError((e as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, '')); }
    finally { setPending(false); }
  };
  return <div className="reset-review">
    <button className="outline-btn wide" disabled={disabled || pending || !api.resetReview} onClick={() => void load()}><RefreshCw size={13} className={pending ? 'spin' : ''} />{pending ? 'Checking with Codex…' : 'Review available resets'}</button>
    {error && <p role="alert" className="reset-review-error">{error}</p>}
    {outcome && <p role="status">{outcome}</p>}
    {lastCredit && <button className="outline-btn wide" disabled={pending || disabled} onClick={() => void redeem(lastCredit)}>Check or retry the same redemption</button>}
    {review && <><p>{review.available === null ? 'Availability not reported' : `${review.available} resets reported`} · {new Date(review.readAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
      {review.windows.map((row, index) => <small key={index}>{row.durationMinutes === 300 ? '5h' : row.durationMinutes === 10080 ? '7 days' : `${row.durationMinutes} min`} · {Math.round(row.remainingPercent)}% remaining<br /></small>)}
      {!review.detailsKnown && <p className="fine-print">Codex returned a count only. Specific credits cannot be chosen until their details are available.</p>}
      {review.credits.map((credit, index) => {
        const expired = credit.expiresAt !== null && Date.parse(credit.expiresAt) <= Date.now();
        return <div className="reset-credit" key={credit.id}><div><strong>{index === 0 && credit.expiresAt ? 'Earliest expiry' : credit.title}</strong><small>{credit.expiresAt ? `${expired ? 'Expired' : 'Expires'} ${new Date(credit.expiresAt).toLocaleString()}` : 'Expiry not reported'}</small></div><button disabled={disabled || pending || expired || lastCredit !== null} onClick={() => void redeem(credit.id)}>Review & use</button></div>;
      })}
      {review.detailsKnown && !review.credits.length && <p className="fine-print">No available Codex reset details returned. Nothing will be redeemed.</p>}
    </>}
    <small className="fine-print">Requires a compatible official Codex CLI. Final confirmation happens in a Windows dialog. No reset is used automatically.</small>
  </div>;
}
