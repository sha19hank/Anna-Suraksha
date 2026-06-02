import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTimeLeft(expiryIso: string): { label: string; urgent: boolean; expired: boolean } {
  const diff = new Date(expiryIso).getTime() - Date.now();
  if (diff < 0) return { label: 'Expired', urgent: true, expired: true };
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(h / 24);
  const urgent = h < 6;
  if (d > 0) return { label: `${d}d ${h % 24}h left`, urgent, expired: false };
  if (h > 0) return { label: `${h}h left`, urgent, expired: false };
  const m = Math.floor(diff / 60000);
  return { label: `${m}m left`, urgent: true, expired: false };
}

export function confidenceColor(pct: number): string {
  if (pct >= 80) return 'text-leaf';
  if (pct >= 60) return 'text-saffron';
  return 'text-red-600';
}
