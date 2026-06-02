'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Leaf, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const { login, loading } = useAuth();
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err: any) {
      toast.error(err.message ?? 'Login failed');
    }
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-4">
      {/* Background circles */}
      <div className="absolute top-0 right-0 w-[480px] h-[480px] rounded-full bg-leaf/5 -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full bg-saffron/5 translate-y-1/2 -translate-x-1/3 blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10 animate-fade-up">
          <div className="w-14 h-14 bg-leaf rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-leaf/20">
            <Leaf className="w-7 h-7 text-cream" />
          </div>
          <h1 className="font-display text-3xl font-bold text-earth">Anna Suraksha</h1>
          <p className="text-earth/50 font-body text-sm mt-1">Food intelligence for India</p>
        </div>

        {/* Card */}
        <div className="bg-white/70 backdrop-blur-sm border border-earth/8 rounded-2xl p-8 shadow-sm animate-fade-up" style={{ animationDelay: '0.1s' }}>
          <h2 className="font-display text-xl font-semibold text-earth mb-6">Sign in</h2>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs font-body font-medium text-earth/60 mb-1.5 uppercase tracking-wider">Email</label>
              <input
                type="email" required value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-2.5 rounded-xl bg-cream border border-earth/15 text-earth font-body text-sm placeholder:text-earth/30 focus:outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/15 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-body font-medium text-earth/60 mb-1.5 uppercase tracking-wider">Password</label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'} required value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 pr-10 rounded-xl bg-cream border border-earth/15 text-earth font-body text-sm placeholder:text-earth/30 focus:outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/15 transition-all"
                />
                <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-earth/30 hover:text-earth/60">
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" size="lg" loading={loading}>
              Sign in
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-earth/50 mt-5 animate-fade-up" style={{ animationDelay: '0.2s' }}>
          New here?{' '}
          <Link href="/auth/signup" className="text-leaf font-medium hover:underline">Create account</Link>
        </p>
      </div>
    </div>
  );
}
