type TimeLeft = { label: string; variant: 'safe' | 'warn' | 'expired' };

export function timeLeft(iso: string): TimeLeft {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return { label: 'Expired', variant: 'expired' };
  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(h / 24);
  const variant = h < 6 ? 'warn' : 'safe';
  if (d > 0) return { label: `${d}d ${h % 24}h`, variant };
  if (h > 0) return { label: `${h}h left`, variant };
  const m = Math.floor(ms / 60_000);
  return { label: `${m}m left`, variant: 'warn' };
}

export function fmtDate(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleString('en-IN', opts ?? { dateStyle: 'medium', timeStyle: 'short' });
}
