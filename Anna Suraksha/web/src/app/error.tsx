'use client';
import { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-4 text-center gap-4">
      <AlertCircle className="w-12 h-12 text-saffron" />
      <h2 className="font-display text-2xl font-bold text-earth">Something went wrong</h2>
      <p className="text-earth/50 font-body text-sm max-w-sm">{error.message}</p>
      <button onClick={reset}
        className="px-5 py-2.5 bg-leaf text-cream font-display font-semibold rounded-xl hover:bg-leaf-dark transition-colors">
        Try again
      </button>
    </div>
  );
}
