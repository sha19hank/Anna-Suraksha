'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ScanLine, Utensils, TrendingUp, Clock, ChevronRight, AlertTriangle } from 'lucide-react';
import { Navbar } from '@/components/ui/Navbar';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { api, type Analysis } from '@/lib/api';
import { formatTimeLeft, confidenceColor, cn } from '@/lib/utils';

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white/60 backdrop-blur-sm border border-earth/8 rounded-2xl p-5 animate-fade-up">
      <p className="text-xs uppercase tracking-widest text-earth/40 font-body mb-1">{label}</p>
      <p className="font-display text-3xl font-bold text-earth">{value}</p>
      {sub && <p className="text-xs text-earth/50 mt-1 font-body">{sub}</p>}
    </div>
  );
}

function AnalysisCard({ a }: { a: Analysis }) {
  const { label, urgent, expired } = formatTimeLeft(a.expiryAtIso);
  return (
    <Link href={`/history`} className="group flex items-center justify-between bg-white/60 hover:bg-white/90 border border-earth/8 rounded-xl p-4 transition-all hover:shadow-sm">
      <div className="flex items-center gap-3">
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center text-lg', expired ? 'bg-red-50' : urgent ? 'bg-saffron/10' : 'bg-leaf/10')}>
          {expired ? '🗑️' : urgent ? '⚠️' : '✅'}
        </div>
        <div>
          <p className="font-display font-semibold text-earth text-sm">{a.foodType}</p>
          <p className="text-xs text-earth/40 font-mono">{new Date(a.createdAtIso).toLocaleDateString('en-IN')}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn('text-xs font-mono font-medium px-2 py-1 rounded-lg',
          expired ? 'bg-red-50 text-red-600' : urgent ? 'bg-saffron/10 text-saffron-dark' : 'bg-leaf/10 text-leaf'
        )}>{label}</span>
        <ChevronRight className="w-4 h-4 text-earth/20 group-hover:text-earth/40 transition-colors" />
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const { user, token, loading } = useAuth();
  const router = useRouter();
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.push('/auth/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (!token) return;
    api.listAnalyses(token).then(r => { setAnalyses(r.analyses); setDataLoading(false); }).catch(() => setDataLoading(false));
  }, [token]);

  const expiring = analyses.filter(a => {
    const h = (new Date(a.expiryAtIso).getTime() - Date.now()) / 3600000;
    return h > 0 && h < 24;
  });
  const expired = analyses.filter(a => new Date(a.expiryAtIso) < new Date());
  const safe = analyses.length - expiring.length - expired.length;

  if (loading) return <div className="min-h-screen bg-cream flex items-center justify-center"><div className="w-8 h-8 border-2 border-leaf border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-cream">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-8 pb-24 sm:pb-8">
        {/* Header */}
        <div className="mb-8 animate-fade-up">
          <p className="text-xs uppercase tracking-widest text-earth/40 font-body mb-1">Good day</p>
          <h1 className="font-display text-4xl font-bold text-earth">
            {user?.signInDetails?.loginId?.split('@')[0] ?? 'Welcome back'}
          </h1>
          <p className="text-earth/50 font-body mt-1">Here's your food intelligence overview</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatCard label="Total scans" value={analyses.length} />
          <StatCard label="Safe" value={safe} sub="items ok" />
          <StatCard label="Expiring soon" value={expiring.length} sub="within 24h" />
          <StatCard label="Expired" value={expired.length} sub="items" />
        </div>

        {/* Quick actions */}
        <div className="grid sm:grid-cols-2 gap-4 mb-8 animate-fade-up" style={{ animationDelay: '0.15s' }}>
          <Link href="/scan" className="group bg-leaf text-cream rounded-2xl p-6 flex items-center justify-between hover:bg-leaf-dark transition-all hover:shadow-lg hover:shadow-leaf/20 active:scale-[0.98]">
            <div>
              <p className="font-display text-xl font-bold">Scan food</p>
              <p className="text-cream/70 text-sm font-body mt-0.5">Upload a photo to check freshness</p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
              <ScanLine className="w-6 h-6" />
            </div>
          </Link>
          <Link href="/surplus" className="group bg-saffron text-white rounded-2xl p-6 flex items-center justify-between hover:bg-saffron-dark transition-all hover:shadow-lg hover:shadow-saffron/20 active:scale-[0.98]">
            <div>
              <p className="font-display text-xl font-bold">Surplus board</p>
              <p className="text-white/70 text-sm font-body mt-0.5">List or claim surplus food</p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
              <Utensils className="w-6 h-6" />
            </div>
          </Link>
        </div>

        {/* Alert banner */}
        {expiring.length > 0 && (
          <div className="bg-saffron/10 border border-saffron/20 rounded-xl p-4 flex gap-3 mb-6 animate-fade-up">
            <AlertTriangle className="w-5 h-5 text-saffron flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-display font-semibold text-earth text-sm">{expiring.length} item{expiring.length > 1 ? 's' : ''} expiring within 24 hours</p>
              <p className="text-earth/60 text-xs font-body mt-0.5">Consider listing them as surplus or using them now.</p>
            </div>
          </div>
        )}

        {/* Recent analyses */}
        <div className="animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold text-earth">Recent scans</h2>
            <Link href="/history" className="text-xs text-leaf font-medium hover:underline flex items-center gap-1">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          {dataLoading ? (
            <div className="space-y-3">
              {[0,1,2].map(i => <div key={i} className="h-16 rounded-xl shimmer" />)}
            </div>
          ) : analyses.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-earth/15 rounded-2xl">
              <ScanLine className="w-10 h-10 text-earth/20 mx-auto mb-3" />
              <p className="font-display text-earth/40 font-medium">No scans yet</p>
              <p className="text-sm text-earth/30 font-body mb-4">Scan your first food item to get started</p>
              <Button size="sm" onClick={() => router.push('/scan')}>Scan now</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {analyses.slice(0, 5).map(a => <AnalysisCard key={a.analysisId} a={a} />)}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
