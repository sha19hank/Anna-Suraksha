import Link from 'next/link';
import { Leaf } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-4 text-center">
      <div className="w-14 h-14 bg-leaf/10 rounded-2xl flex items-center justify-center mb-6">
        <Leaf className="w-7 h-7 text-leaf" />
      </div>
      <h1 className="font-display text-5xl font-bold text-earth mb-2">404</h1>
      <p className="text-earth/50 font-body mb-8">This page doesn't exist.</p>
      <Link href="/dashboard"
        className="px-5 py-2.5 bg-leaf text-cream font-display font-semibold rounded-xl hover:bg-leaf-dark transition-colors">
        Go home
      </Link>
    </div>
  );
}
