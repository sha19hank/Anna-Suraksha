'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, ChevronDown } from 'lucide-react';
import { Navbar } from '@/components/ui/Navbar';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { api, type Analysis } from '@/lib/api';
import { formatTimeLeft, confidenceColor, cn } from '@/lib/utils';

function AnalysisRow({ a, expanded, onToggle }: { a: Analysis; expanded: boolean; onToggle: () => void }) {
  const { label, urgent, expired } = formatTimeLeft(a.expiryAtIso);
  return (
    <div className="border border-earth/8 rounded-xl overflow-hidden bg-white/50 hover:bg-white/80 transition-colors">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-5 py-4 text-left">
        <div className="flex items-center gap-3">
          <div className={cn('w-9 h-9 rounded-lg text-lg flex items-center justify-center flex-shrink-0',
            expired ? 'bg-red-50' : urgent ? 'bg-saffron/10' : 'bg-leaf/10')}>
            {expired ? '🗑️' : urgent ? '⚠️' : '✅'}
          </div>
          <div className="min-w-0">
            <p className="font-display font-semibold text-earth text-sm truncate">{a.foodType}</p>
            <p className="text-xs text-earth/40 font-mono">
              {new Date(a.createdAtIso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={cn('text-xs font-mono px-2 py-1 rounded-lg',
            expired ? 'bg-red-50 text-red-600' : urgent ? 'bg-saffron/10 text-saffron-dark' : 'bg-leaf/10 text-leaf')}>
            {label}
          </span>
          <ChevronDown className={cn('w-4 h-4 text-earth/30 transition-transform', expanded && 'rotate-180')} />
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 pt-1 border-t border-earth/6 space-y-3">
          {a.modelExplanation && (
            <div>
              <p className="text-xs uppercase tracking-widest text-earth/40 font-body mb-1">AI analysis</p>
              <p className="text-sm text-earth font-body leading-relaxed">{a.modelExplanation}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 text-xs">
            {a.visionTier && a.visionScore != null && (
              <div><span className="text-earth/40">Visual: </span>
                <span className="text-earth font-medium">{a.visionTier} ({a.visionScore}/100)</span>
              </div>
            )}
            {a.storageCondition && (
              <div><span className="text-earth/40">Storage: </span><span className="text-earth font-medium">{a.storageCondition}</span></div>
            )}
            {a.preparationTime && (
              <div><span className="text-earth/40">Prepared: </span><span className="text-earth font-medium">{a.preparationTime}</span></div>
            )}
            {a.rekognitionConfidence != null && (
              <div><span className="text-earth/40">Vision confidence: </span>
                <span className={cn('font-mono font-medium', confidenceColor(a.rekognitionConfidence))}>
                  {a.rekognitionConfidence.toFixed(0)}%
                </span>
              </div>
            )}
            {a.modelConfidence != null && (
              <div><span className="text-earth/40">AI confidence: </span>
                <span className={cn('font-mono font-medium', confidenceColor(a.modelConfidence))}>
                  {a.modelConfidence.toFixed(0)}%
                </span>
              </div>
            )}
          </div>
          <div>
            <p className="text-xs text-earth/30 font-mono">ID: {a.analysisId}</p>
            <p className="text-xs text-earth/30 font-mono">
              Expires: {new Date(a.expiryAtIso).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HistoryPage() {
  const { user, token, loading } = useAuth();
  const router = useRouter();
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [nextToken, setNextToken] = useState<string | undefined>();
  const [dataLoading, setDataLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { if (!loading && !user) router.push('/auth/login'); }, [loading, user, router]);

  const load = useCallback(async (nt?: string) => {
    if (!token) return;
    try {
      const r = await api.listAnalyses(token, nt);
      setAnalyses(prev => nt ? [...prev, ...r.analyses] : r.analyses);
      setNextToken(r.nextToken);
    } finally { setDataLoading(false); setLoadingMore(false); }
  }, [token]);

  useEffect(() => { if (token) load(); }, [token, load]);

  const loadMore = () => { setLoadingMore(true); load(nextToken); };

  if (loading || dataLoading) return (
    <div className="min-h-screen bg-cream"><Navbar />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="space-y-3">{[0,1,2,3].map(i => <div key={i} className="h-16 rounded-xl shimmer" />)}</div>
      </main>
    </div>
  );

  return (
    <div className="min-h-screen bg-cream">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-8 pb-24 sm:pb-8">
        <div className="mb-8 animate-fade-up">
          <p className="text-xs uppercase tracking-widest text-earth/40 font-body mb-1">Your scans</p>
          <h1 className="font-display text-4xl font-bold text-earth">History</h1>
          <p className="text-earth/50 font-body mt-1">{analyses.length} total scan{analyses.length !== 1 ? 's' : ''}</p>
        </div>

        {analyses.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-earth/15 rounded-2xl">
            <Clock className="w-10 h-10 text-earth/20 mx-auto mb-3" />
            <p className="font-display text-earth/40 font-medium">No history yet</p>
            <p className="text-sm text-earth/30 font-body mb-4">Your past scans will appear here</p>
            <Button size="sm" onClick={() => router.push('/scan')}>Start scanning</Button>
          </div>
        ) : (
          <div className="space-y-2 animate-fade-up">
            {analyses.map(a => (
              <AnalysisRow key={a.analysisId} a={a} expanded={expanded === a.analysisId}
                onToggle={() => setExpanded(expanded === a.analysisId ? null : a.analysisId)} />
            ))}
            {nextToken && (
              <div className="text-center pt-4">
                <Button variant="secondary" onClick={loadMore} loading={loadingMore} size="sm">Load more</Button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
