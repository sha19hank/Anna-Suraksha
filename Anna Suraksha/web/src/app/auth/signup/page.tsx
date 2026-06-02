'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Leaf } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';

type Step = 'register' | 'confirm';

export default function SignupPage() {
  const [step, setStep] = useState<Step>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const { register, confirm, login } = useAuth();
  const router = useRouter();

  const submitRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await register(email, password);
      setStep('confirm');
      toast.success('Check your email for a verification code');
    } catch (err: any) {
      toast.error(err.message ?? 'Registration failed');
    } finally { setBusy(false); }
  };

  const submitConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await confirm(email, code);
      await login(email, password);
      toast.success('Account verified — welcome!');
      router.push('/dashboard');
    } catch (err: any) {
      toast.error(err.message ?? 'Verification failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-4">
      <div className="absolute top-0 left-0 w-[480px] h-[480px] rounded-full bg-saffron/5 -translate-y-1/2 -translate-x-1/3 blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-sm">
        <div className="flex flex-col items-center mb-10 animate-fade-up">
          <div className="w-14 h-14 bg-leaf rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-leaf/20">
            <Leaf className="w-7 h-7 text-cream" />
          </div>
          <h1 className="font-display text-3xl font-bold text-earth">Anna Suraksha</h1>
          <p className="text-earth/50 font-body text-sm mt-1">Food intelligence for India</p>
        </div>

        <div className="bg-white/70 backdrop-blur-sm border border-earth/8 rounded-2xl p-8 shadow-sm animate-fade-up" style={{ animationDelay: '0.1s' }}>
          {step === 'register' ? (
            <>
              <h2 className="font-display text-xl font-semibold text-earth mb-6">Create account</h2>
              <form onSubmit={submitRegister} className="space-y-4">
                <div>
                  <label className="block text-xs font-body font-medium text-earth/60 mb-1.5 uppercase tracking-wider">Email</label>
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-4 py-2.5 rounded-xl bg-cream border border-earth/15 text-earth font-body text-sm placeholder:text-earth/30 focus:outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/15 transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-body font-medium text-earth/60 mb-1.5 uppercase tracking-wider">Password</label>
                  <input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    className="w-full px-4 py-2.5 rounded-xl bg-cream border border-earth/15 text-earth font-body text-sm placeholder:text-earth/30 focus:outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/15 transition-all" />
                </div>
                <Button type="submit" className="w-full" size="lg" loading={busy}>Create account</Button>
              </form>
            </>
          ) : (
            <>
              <h2 className="font-display text-xl font-semibold text-earth mb-2">Verify email</h2>
              <p className="text-sm text-earth/50 font-body mb-6">Enter the 6-digit code sent to <span className="text-leaf font-medium">{email}</span></p>
              <form onSubmit={submitConfirm} className="space-y-4">
                <input type="text" required maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full px-4 py-3 rounded-xl bg-cream border border-earth/15 text-earth font-mono text-2xl text-center tracking-[0.5em] placeholder:tracking-normal placeholder:text-earth/30 focus:outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/15 transition-all" />
                <Button type="submit" className="w-full" size="lg" loading={busy}>Verify & sign in</Button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-sm text-earth/50 mt-5 animate-fade-up" style={{ animationDelay: '0.2s' }}>
          Already have an account?{' '}
          <Link href="/auth/login" className="text-leaf font-medium hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
