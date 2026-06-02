'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import { Upload, Camera, AlertCircle, ChevronRight, RotateCcw } from 'lucide-react';
import { Navbar } from '@/components/ui/Navbar';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { api, type DetectResponse, type PredictResponse } from '@/lib/api';
import { cn, confidenceColor } from '@/lib/utils';
import toast from 'react-hot-toast';

type Stage = 'upload' | 'detecting' | 'questions' | 'predicting' | 'result' | 'error';

const STAGE_ORDER: Stage[] = ['upload', 'detecting', 'questions', 'predicting', 'result'];

export default function ScanPage() {
  const { user, token, loading } = useAuth();
  const router = useRouter();

  const [stage, setStage]   = useState<Stage>('upload');
  const [file, setFile]     = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [detect, setDetect] = useState<DetectResponse | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [phone, setPhone]   = useState('');
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [error, setError]   = useState('');

  // BUG FIX: Track object URL so we can revoke it and prevent memory leaks
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push('/auth/login');
  }, [loading, user, router]);

  // BUG FIX: Revoke object URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const onDrop = useCallback((files: File[]) => {
    const f = files[0];
    if (!f) return;
    // BUG FIX: Revoke previous URL before creating a new one
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = URL.createObjectURL(f);
    previewUrlRef.current = url;
    setFile(f);
    setPreview(url);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    maxFiles: 1,
    maxSize: 10_000_000,
    onDropRejected: () => toast.error('File must be an image under 10MB'),
  });

  const runDetect = async () => {
    if (!file || !token) return;
    setStage('detecting');
    try {
      const { uploadUrl, key } = await api.getUploadUrl(token, file.type);
      await api.uploadToS3(uploadUrl, file);
      const d = await api.detect(token, key);
      setDetect(d);
      setAnswers(new Array(d.questions.length).fill(''));
      if (d.status === 'NEED_INFO') {
        setStage('questions');
      } else {
        // BUG FIX: await runPredict — was called without await, causing race conditions
        await runPredict(d, []);
      }
    } catch (e: any) {
      if (e.message?.includes('Session expired')) {
        toast.error('Session expired — signing you in again…');
        router.push('/auth/login');
        return;
      }
      setError(e.message ?? 'Detection failed');
      setStage('error');
    }
  };

  // BUG FIX: Question → field mapping was hardcoded (ans[0]→preparationTime, ans[1]→storageCondition)
  // which was only correct for 'cooked' category. Now all answers are sent as userContext
  // so Bedrock can interpret them correctly regardless of food type.
  const runPredict = async (d: DetectResponse, ans: string[]) => {
    if (!token) return;
    setStage('predicting');
    try {
      // Build a rich context string from all answers rather than mapping to fixed fields
      const userContext = d.questions
        .map((q, i) => ans[i]?.trim() ? `${q}: ${ans[i].trim()}` : null)
        .filter(Boolean)
        .join(' | ');

      const p = await api.predict(token, {
        foodLabel:            d.foodLabel,
        s3Key:                d.s3Key,
        storageCondition:     userContext || undefined,   // packed into single context field
        preparationTime:      undefined,                  // context now merged into storageCondition
        phoneNumber:          phone.trim() || undefined,
        rekognitionConfidence: d.confidence,
        // BUG FIX: Pass vision data through to avoid a second Bedrock call in predict lambda
        visionScore:          d.vision?.score,
        visionTier:           d.vision?.tier,
        visionReason:         d.vision?.reason,
      });
      setResult(p);
      setStage('result');
    } catch (e: any) {
      setError(e.message ?? 'Prediction failed');
      setStage('error');
    }
  };

  const reset = () => {
    // BUG FIX: Revoke object URL on reset
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setStage('upload'); setFile(null); setPreview(null);
    setDetect(null); setAnswers([]); setResult(null); setError(''); setPhone('');
  };

  const expiryMs = result?.expiryAtIso ? new Date(result.expiryAtIso).getTime() - Date.now() : 0;
  const expiryH  = Math.floor(expiryMs / 3600000);
  const expiryD  = Math.floor(expiryH / 24);
  const urgent   = expiryH < 12 && expiryH >= 0;
  const expired  = expiryMs < 0;

  return (
    <div className="min-h-screen bg-cream">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-8 pb-24 sm:pb-8">
        <div className="mb-8 animate-fade-up">
          <p className="text-xs uppercase tracking-widest text-earth/40 font-body mb-1">AI Scanner</p>
          <h1 className="font-display text-4xl font-bold text-earth">Scan food</h1>
          <p className="text-earth/50 font-body mt-1">Upload a photo — we'll detect the food and predict freshness</p>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-8">
          {STAGE_ORDER.map((s, i) => (
            <div key={s} className={cn(
              'h-1.5 rounded-full transition-all duration-300',
              s === stage ? 'w-8 bg-leaf' :
              i < STAGE_ORDER.indexOf(stage) ? 'w-4 bg-leaf/40' : 'w-4 bg-earth/10'
            )} />
          ))}
        </div>

        {/* ── Upload ───────────────────────────────── */}
        {stage === 'upload' && (
          <div className="animate-fade-up space-y-5">
            <div
              {...getRootProps()}
              className={cn(
                'relative border-2 border-dashed rounded-2xl p-10 flex flex-col items-center gap-4 cursor-pointer transition-all',
                isDragActive ? 'border-leaf bg-leaf/5 scale-[1.01]'
                  : preview ? 'border-leaf bg-leaf/5'
                  : 'border-earth/15 hover:border-leaf/50 hover:bg-leaf/3'
              )}
            >
              <input {...getInputProps()} />
              {preview ? (
                <img src={preview} alt="Preview" className="w-full max-h-64 object-contain rounded-xl" />
              ) : (
                <>
                  <div className="w-14 h-14 bg-earth/5 rounded-2xl flex items-center justify-center">
                    <Upload className="w-7 h-7 text-earth/30" />
                  </div>
                  <div className="text-center">
                    <p className="font-display font-semibold text-earth">Drop photo here</p>
                    <p className="text-sm text-earth/40 font-body mt-1">or click to browse · JPG, PNG, WEBP up to 10 MB</p>
                  </div>
                </>
              )}
            </div>

            {preview && (
              <div>
                <label className="block text-xs uppercase tracking-widest text-earth/40 font-body mb-1.5">
                  Phone for SMS reminder (optional, India +91)
                </label>
                <input
                  type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full px-4 py-2.5 rounded-xl bg-white/60 border border-earth/15 text-earth font-body text-sm placeholder:text-earth/30 focus:outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/15 transition-all"
                />
              </div>
            )}

            <Button className="w-full" size="lg" onClick={runDetect} disabled={!file}>
              <Camera className="w-4 h-4" /> Analyse food
            </Button>
          </div>
        )}

        {/* ── Detecting / predicting ──────────────── */}
        {(stage === 'detecting' || stage === 'predicting') && (
          <div className="flex flex-col items-center gap-6 py-16 animate-fade-in">
            {preview && (
              <img src={preview} alt="Scanning" className="w-40 h-40 object-cover rounded-2xl shadow-lg opacity-60" />
            )}
            <div className="flex gap-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2.5 h-2.5 bg-leaf rounded-full animate-pulse-dot"
                  style={{ animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
            <div className="text-center">
              <p className="font-display text-lg font-semibold text-earth">
                {stage === 'detecting' ? 'Detecting food…' : 'Predicting freshness…'}
              </p>
              <p className="text-sm text-earth/40 font-body mt-1">
                {stage === 'detecting'
                  ? 'Rekognition + vision AI are scanning the image'
                  : 'Claude is calculating expiry from all available data'}
              </p>
            </div>
          </div>
        )}

        {/* ── Questions ────────────────────────────── */}
        {stage === 'questions' && detect && (
          <div className="animate-fade-up space-y-6">
            {/* Detection summary card */}
            <div className="bg-white/60 border border-earth/8 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-leaf/10 rounded-lg flex items-center justify-center text-lg">🔍</div>
                <div>
                  <p className="font-display font-semibold text-earth">{detect.foodLabel}</p>
                  <p className={cn('text-xs font-mono', confidenceColor(detect.confidence))}>
                    {detect.confidence.toFixed(0)}% Rekognition confidence · {detect.category}
                  </p>
                </div>
              </div>

              {/* BUG FIX: Now showing vision score in questions stage — was always hidden */}
              {detect.vision && (
                <div className="flex items-center gap-3 pt-2 border-t border-earth/8">
                  <span className="text-xl">{detect.vision.icon}</span>
                  <div>
                    <p className="text-sm font-display font-semibold text-earth">
                      Visual freshness: {detect.vision.tier} ({detect.vision.score}/100)
                    </p>
                    <p className="text-xs text-earth/50 font-body mt-0.5">{detect.vision.reason}</p>
                  </div>
                </div>
              )}
            </div>

            <div>
              <p className="font-display font-semibold text-earth mb-1">A few more details</p>
              <p className="text-sm text-earth/50 font-body mb-4">Help us give a more accurate estimate</p>
              <div className="space-y-4">
                {detect.questions.map((q, i) => (
                  <div key={i}>
                    <label className="block text-xs uppercase tracking-widest text-earth/40 font-body mb-1.5">
                      Q{i + 1}. {q}
                    </label>
                    <input
                      type="text"
                      value={answers[i] ?? ''}
                      onChange={e => {
                        const a = [...answers];
                        a[i] = e.target.value;
                        setAnswers(a);
                      }}
                      placeholder="Your answer…"
                      className="w-full px-4 py-2.5 rounded-xl bg-white/60 border border-earth/15 text-earth font-body text-sm placeholder:text-earth/30 focus:outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/15 transition-all"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => runPredict(detect, [])} className="flex-1">
                Skip
              </Button>
              <Button onClick={() => runPredict(detect, answers)} className="flex-1">
                Get prediction <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Result ───────────────────────────────── */}
        {stage === 'result' && result && (
          <div className="animate-fade-up space-y-4">
            {/* Hero card */}
            <div className={cn(
              'rounded-2xl p-7 text-center',
              expired ? 'bg-red-50 border border-red-100'
                : urgent ? 'bg-saffron/10 border border-saffron/20'
                : 'bg-leaf/10 border border-leaf/20'
            )}>
              <div className="text-5xl mb-3">{expired ? '🗑️' : urgent ? '⚠️' : '✅'}</div>
              <p className="font-display text-2xl font-bold text-earth mb-1">{result.foodLabel}</p>
              {expired ? (
                <p className="text-red-600 font-display font-semibold text-lg">Expired</p>
              ) : (
                <p className={cn('font-display font-semibold text-lg', urgent ? 'text-saffron-dark' : 'text-leaf')}>
                  {expiryD > 0 ? `${expiryD}d ${expiryH % 24}h` : `${expiryH}h`} remaining
                </p>
              )}
              <p className="text-earth/40 text-xs font-mono mt-1">
                Best before {new Date(result.expiryAtIso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </div>

            {/* Vision freshness (if available) — BUG FIX: was never shown in result */}
            {detect?.vision && (
              <div className="bg-white/60 border border-earth/8 rounded-2xl p-4 flex items-center gap-3">
                <span className="text-2xl">{detect.vision.icon}</span>
                <div>
                  <p className="text-sm font-display font-semibold text-earth">
                    Visual: {detect.vision.tier} · {detect.vision.score}/100
                  </p>
                  <p className="text-xs text-earth/50 font-body mt-0.5">{detect.vision.reason}</p>
                </div>
              </div>
            )}

            {/* AI explanation */}
            {result.model?.explanation && (
              <div className="bg-white/60 border border-earth/8 rounded-2xl p-5">
                <p className="text-xs uppercase tracking-widest text-earth/40 font-body mb-2">AI explanation</p>
                <p className="text-sm text-earth font-body leading-relaxed">{result.model.explanation}</p>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-earth/8">
                  <div className="h-1.5 flex-1 bg-earth/10 rounded-full">
                    <div
                      className="h-1.5 bg-leaf rounded-full"
                      style={{ width: `${result.model.modelConfidence}%` }}
                    />
                  </div>
                  <span className={cn('text-xs font-mono font-medium', confidenceColor(result.model.modelConfidence))}>
                    {result.model.modelConfidence.toFixed(0)}% confidence
                  </span>
                </div>
              </div>
            )}

            {/* BUG FIX: Only show reminder note when a phone number was provided */}
            {result.hasPhoneReminder && result.reminderAtIso && !expired && (
              <div className="bg-earth/5 border border-earth/8 rounded-xl p-4 flex items-center gap-3">
                <span className="text-lg">⏰</span>
                <p className="text-earth/60 font-body text-sm">
                  SMS reminder scheduled for{' '}
                  {new Date(result.reminderAtIso).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" onClick={reset} className="flex-1">
                <RotateCcw className="w-4 h-4" /> Scan another
              </Button>
              {urgent && !expired && (
                <Button variant="danger" onClick={() => router.push('/surplus')} className="flex-1">
                  List as surplus
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ── Error ────────────────────────────────── */}
        {stage === 'error' && (
          <div className="flex flex-col items-center gap-4 py-16 text-center animate-fade-in">
            <AlertCircle className="w-12 h-12 text-saffron" />
            <div>
              <p className="font-display text-lg font-semibold text-earth">Something went wrong</p>
              <p className="text-sm text-earth/50 font-body mt-1">{error}</p>
            </div>
            <Button onClick={reset} variant="secondary">
              <RotateCcw className="w-4 h-4" /> Try again
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
