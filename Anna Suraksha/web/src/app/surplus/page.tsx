'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, MapPin, Clock, CheckCircle, X } from 'lucide-react';
import { Navbar } from '@/components/ui/Navbar';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { api, type SurplusListing } from '@/lib/api';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const REGIONS = ['Mumbai','Delhi','Bangalore','Chennai','Hyderabad','Pune','Kolkata','Bhubaneswar','Patna','Ahmedabad','Jaipur','Surat'];

function hoursLeft(iso: string) { return (new Date(iso).getTime() - Date.now()) / 3_600_000; }

function ListingCard({ l, onClaim }: { l: SurplusListing; onClaim: (id: string) => void }) {
  const h       = hoursLeft(l.pickupByIso);
  const expired = h < 0;
  const urgent  = !expired && h < 3;

  return (
    <div className={cn(
      'bg-white/60 border rounded-2xl p-5 transition-all hover:shadow-sm',
      l.status === 'CLAIMED' ? 'border-earth/8 opacity-60'
        : urgent ? 'border-saffron/30'
        : 'border-earth/8'
    )}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="font-display font-semibold text-earth">{l.restaurantName}</p>
          <div className="flex items-center gap-2 mt-1">
            <MapPin className="w-3 h-3 text-earth/30" />
            <span className="text-xs text-earth/50 font-body">{l.region}</span>
            <span className="text-earth/20">·</span>
            <span className="text-xs text-earth/50 font-mono">{l.quantity}</span>
          </div>
        </div>
        <span className={cn(
          'flex-shrink-0 text-xs font-mono px-2.5 py-1 rounded-lg',
          l.status === 'CLAIMED' ? 'bg-earth/5 text-earth/40'
            : expired ? 'bg-red-50 text-red-500'
            : urgent ? 'bg-saffron/10 text-saffron-dark'
            : 'bg-leaf/10 text-leaf'
        )}>
          {l.status === 'CLAIMED' ? 'Claimed'
            : expired ? 'Expired'
            : h < 24 ? `${Math.floor(h)}h left`
            : `${Math.floor(h/24)}d left`}
        </span>
      </div>

      <p className="text-sm text-earth font-body mb-3 bg-earth/3 rounded-lg px-3 py-2 border border-earth/6 leading-relaxed">
        🍱 {l.foodSummary}
      </p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs text-earth/40 font-mono">
          <Clock className="w-3 h-3" />
          <span>Pickup by {new Date(l.pickupByIso).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</span>
        </div>
        {l.status === 'OPEN' && !expired && (
          <Button size="sm" onClick={() => onClaim(l.listingId)}>Claim</Button>
        )}
        {l.status === 'CLAIMED' && (
          <div className="flex items-center gap-1 text-xs text-leaf font-medium">
            <CheckCircle className="w-3.5 h-3.5" /> Claimed
          </div>
        )}
      </div>
    </div>
  );
}

function CreateModal({ onClose, onCreated, token }: {
  onClose: () => void; onCreated: () => void; token: string;
}) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    restaurantName: '', region: 'Mumbai', foodSummary: '',
    quantity: '', pickupByIso: '', contactPhone: '',
  });

  const set = (k: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm(f => ({ ...f, [k]: e.target.value }));

  // Compute min datetime for the picker (now + 15 min)
  const minDatetime = new Date(Date.now() + 15 * 60_000).toISOString().slice(0, 16);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.pickupByIso) { toast.error('Set a pickup deadline'); return; }
    if (new Date(form.pickupByIso) < new Date()) { toast.error('Pickup time must be in the future'); return; }
    setBusy(true);
    try {
      await api.createSurplus(token, {
        ...form,
        pickupByIso: new Date(form.pickupByIso).toISOString(),
      });
      toast.success('Listing created — NGOs in your area have been notified!');
      onCreated(); onClose();
    } catch (err: any) { toast.error(err.message ?? 'Failed to create listing'); }
    finally { setBusy(false); }
  };

  const inp = "w-full px-4 py-2.5 rounded-xl bg-cream border border-earth/15 text-earth font-body text-sm placeholder:text-earth/30 focus:outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/15 transition-all";
  const lbl = "block text-xs uppercase tracking-widest text-earth/40 font-body mb-1.5";

  return (
    <div className="fixed inset-0 bg-earth/30 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-cream w-full max-w-lg rounded-2xl shadow-2xl animate-fade-up max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-earth/8 flex-shrink-0">
          <h2 className="font-display text-lg font-semibold text-earth">List surplus food</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-earth/8 text-earth/40 hover:text-earth transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className={lbl}>Restaurant / Kitchen name</label>
            <input required value={form.restaurantName} onChange={set('restaurantName')} placeholder="Sharma's Dhaba" className={inp} />
          </div>

          <div>
            <label className={lbl}>Region</label>
            <div className="flex flex-wrap gap-2">
              {REGIONS.map(r => (
                <button key={r} type="button" onClick={() => setForm(f => ({ ...f, region: r }))}
                  className={cn('px-3 py-1.5 rounded-xl text-sm font-body transition-all border',
                    form.region === r ? 'bg-leaf text-cream border-leaf' : 'border-earth/15 text-earth/60 hover:border-leaf/40')}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={lbl}>Food summary</label>
            <textarea required value={form.foodSummary}
              onChange={e => setForm(f => ({ ...f, foodSummary: e.target.value }))}
              placeholder="e.g. Dal makhani, rice, 4 chapatis — cooked today, vegetarian"
              rows={3} className={cn(inp, 'resize-none')} />
          </div>

          <div>
            <label className={lbl}>Quantity</label>
            <input required value={form.quantity} onChange={set('quantity')} placeholder="e.g. 10 meals / 5 kg" className={inp} />
          </div>

          <div>
            <label className={lbl}>Pickup deadline</label>
            <input required type="datetime-local" value={form.pickupByIso} onChange={set('pickupByIso')}
              min={minDatetime} className={inp} />
            <p className="text-xs text-earth/30 mt-1">Select the latest time someone can pick up the food</p>
          </div>

          <div>
            <label className={lbl}>Contact phone (E.164 format)</label>
            <input required value={form.contactPhone} onChange={set('contactPhone')}
              placeholder="+919876543210" pattern="^\+[1-9]\d{1,14}$"
              title="Enter a phone number in E.164 format, e.g. +919876543210" className={inp} />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" loading={busy} className="flex-1">Create &amp; notify NGOs</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SurplusPage() {
  const { user, token, loading } = useAuth();
  const router = useRouter();
  const [listings, setListings]     = useState<SurplusListing[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [region, setRegion]         = useState('');
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => { if (!loading && !user) router.push('/auth/login'); }, [loading, user, router]);

  const load = useCallback(async () => {
    if (!token) return;
    setDataLoading(true);
    try {
      const r = await api.listSurplus(token, region || undefined);
      setListings(r.listings);
    } finally { setDataLoading(false); }
  }, [token, region]);

  useEffect(() => { if (token) load(); }, [token, load]);

  const claim = async (listingId: string) => {
    if (!token) return;
    const listing = listings.find(l => l.listingId === listingId);
    try {
      await api.claimSurplus(token, listingId);
      toast.success(
        listing ? `Claimed! Contact ${listing.restaurantName} at ${listing.contactPhone}` : 'Listing claimed!'
      );
      load();
    } catch (e: any) { toast.error(e.message ?? 'Claim failed'); }
  };

  return (
    <div className="min-h-screen bg-cream">
      <Navbar />
      {showCreate && token && (
        <CreateModal token={token} onClose={() => setShowCreate(false)} onCreated={load} />
      )}
      <main className="max-w-3xl mx-auto px-4 py-8 pb-24 sm:pb-8">
        <div className="flex items-start justify-between mb-8 animate-fade-up">
          <div>
            <p className="text-xs uppercase tracking-widest text-earth/40 font-body mb-1">Food rescue</p>
            <h1 className="font-display text-4xl font-bold text-earth">Surplus board</h1>
            <p className="text-earth/50 font-body mt-1">Connect excess food with NGOs who need it</p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="flex-shrink-0 mt-2">
            <Plus className="w-4 h-4" /> List surplus
          </Button>
        </div>

        {/* Region filter */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1 animate-fade-up" style={{ animationDelay: '0.1s' }}>
          <button onClick={() => setRegion('')}
            className={cn('flex-shrink-0 px-3 py-1.5 rounded-xl text-sm font-body transition-all',
              region === '' ? 'bg-leaf text-cream' : 'bg-white/60 border border-earth/8 text-earth/60 hover:text-earth')}>
            All India
          </button>
          {REGIONS.map(r => (
            <button key={r} onClick={() => setRegion(r)}
              className={cn('flex-shrink-0 px-3 py-1.5 rounded-xl text-sm font-body transition-all',
                region === r ? 'bg-leaf text-cream' : 'bg-white/60 border border-earth/8 text-earth/60 hover:text-earth')}>
              {r}
            </button>
          ))}
        </div>

        {dataLoading ? (
          <div className="space-y-3">
            {[0,1,2].map(i => <div key={i} className="h-40 rounded-2xl shimmer" />)}
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-earth/15 rounded-2xl">
            <p className="text-4xl mb-3">🍱</p>
            <p className="font-display text-earth/40 font-medium">No open listings{region ? ` in ${region}` : ''}</p>
            <p className="text-sm text-earth/30 font-body mb-4">Be the first to list surplus food in your area</p>
            <Button size="sm" onClick={() => setShowCreate(true)}>Create listing</Button>
          </div>
        ) : (
          <div className="space-y-3 animate-fade-up">
            {listings.map(l => <ListingCard key={l.listingId} l={l} onClaim={claim} />)}
          </div>
        )}
      </main>
    </div>
  );
}
