import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, RefreshControl, Modal, TextInput, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { api, type SurplusListing } from '../../lib/api';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { C, R } from '../../lib/theme';

const REGIONS = ['All India','Mumbai','Delhi','Bangalore','Chennai','Hyderabad','Pune','Kolkata','Bhubaneswar','Patna','Ahmedabad','Jaipur'];

function hoursLeft(iso: string) { return (new Date(iso).getTime() - Date.now()) / 3_600_000; }

function ListingCard({ l, onClaim }: { l: SurplusListing; onClaim: () => void }) {
  const h = hoursLeft(l.pickupByIso);
  const expired = h < 0;
  const variant = l.status === 'CLAIMED' ? 'claimed' : expired ? 'expired' : h < 3 ? 'warn' : 'safe';
  const badge   = l.status === 'CLAIMED' ? 'Claimed' : expired ? 'Expired' : h < 24 ? `${Math.floor(h)}h left` : `${Math.floor(h/24)}d left`;

  return (
    <View style={[s.card, variant === 'warn' && s.cardWarn]}>
      <View style={s.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={s.cardName}>{l.restaurantName}</Text>
          <Text style={s.cardMeta}>📍 {l.region}  ·  {l.quantity}</Text>
        </View>
        <Badge label={badge} variant={variant} />
      </View>
      <View style={s.foodBox}>
        <Text style={s.foodTxt}>🍱  {l.foodSummary}</Text>
      </View>
      <View style={s.cardBottom}>
        <Text style={s.pickupTxt}>
          ⏰  Pickup by {new Date(l.pickupByIso).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
        </Text>
        {l.status === 'OPEN' && !expired && (
          <TouchableOpacity style={s.claimBtn} onPress={onClaim} activeOpacity={0.85}>
            <Text style={s.claimTxt}>Claim</Text>
          </TouchableOpacity>
        )}
        {l.status === 'CLAIMED' && (
          <Text style={s.claimedLbl}>✅ Claimed</Text>
        )}
      </View>
    </View>
  );
}

// ── Create listing modal ────────────────────────────────────────────────────
type CreateForm = {
  restaurantName: string; region: string; foodSummary: string;
  quantity: string; pickupDate: string; pickupTime: string; contactPhone: string;
};

function CreateModal({ visible, onClose, onCreated, token }: {
  visible: boolean; onClose: () => void; onCreated: () => void; token: string;
}) {
  const [form, setForm] = useState<CreateForm>({
    restaurantName: '', region: 'Mumbai', foodSummary: '',
    quantity: '', pickupDate: '', pickupTime: '', contactPhone: '',
  });
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<'details' | 'region'>('details');

  const set = (k: keyof CreateForm) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const buildPickupIso = (): string | null => {
    if (!form.pickupDate || !form.pickupTime) return null;
    // Accept dd/mm/yyyy or yyyy-mm-dd
    let date = form.pickupDate.trim();
    if (date.includes('/')) {
      const [d, m, y] = date.split('/');
      date = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
    const iso = `${date}T${form.pickupTime.trim()}:00`;
    return isNaN(Date.parse(iso)) ? null : new Date(iso).toISOString();
  };

  const submit = async () => {
    const { restaurantName, foodSummary, quantity, contactPhone } = form;
    if (!restaurantName.trim()) { Alert.alert('Missing field', 'Enter the restaurant or kitchen name'); return; }
    if (!foodSummary.trim())    { Alert.alert('Missing field', 'Describe the surplus food'); return; }
    if (!quantity.trim())       { Alert.alert('Missing field', 'Specify the quantity'); return; }
    if (!contactPhone.trim())   { Alert.alert('Missing field', 'Enter a contact phone number'); return; }
    const pickupByIso = buildPickupIso();
    if (!pickupByIso)           { Alert.alert('Invalid date/time', 'Enter pickup date as DD/MM/YYYY and time as HH:MM'); return; }
    if (new Date(pickupByIso) < new Date()) { Alert.alert('Invalid date/time', 'Pickup time must be in the future'); return; }

    setBusy(true);
    try {
      await api.createSurplus(token, {
        restaurantName: restaurantName.trim(),
        region: form.region,
        foodSummary: foodSummary.trim(),
        quantity: quantity.trim(),
        pickupByIso,
        contactPhone: contactPhone.trim(),
      });
      Alert.alert('Listed! 🎉', 'NGOs in your area have been notified via SMS.');
      setForm({ restaurantName: '', region: 'Mumbai', foodSummary: '', quantity: '', pickupDate: '', pickupTime: '', contactPhone: '' });
      onCreated();
      onClose();
    } catch (e: any) {
      Alert.alert('Failed to create listing', e.message ?? 'Something went wrong');
    } finally { setBusy(false); }
  };

  const inputStyle = s.modalInput;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={s.modalRoot} edges={['top','bottom']}>
          {/* Modal header */}
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>List surplus food</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn} activeOpacity={0.7}>
              <Text style={s.closeTxt}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={s.mlabel}>Restaurant / Kitchen name</Text>
            <TextInput style={inputStyle} value={form.restaurantName} onChangeText={set('restaurantName')}
              placeholder="e.g. Sharma's Dhaba" placeholderTextColor={C.faint} />

            <Text style={s.mlabel}>Region</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {REGIONS.filter(r => r !== 'All India').map(r => (
                  <TouchableOpacity
                    key={r} onPress={() => setForm(f => ({ ...f, region: r }))}
                    style={[s.regionChip, form.region === r && s.regionChipActive]}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.regionChipTxt, form.region === r && s.regionChipTxtActive]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={s.mlabel}>Food summary</Text>
            <TextInput style={[inputStyle, { height: 80, textAlignVertical: 'top' }]}
              value={form.foodSummary} onChangeText={set('foodSummary')} multiline numberOfLines={3}
              placeholder="e.g. Dal makhani, rice, 4 chapatis — cooked today, vegetarian"
              placeholderTextColor={C.faint} />

            <Text style={s.mlabel}>Quantity</Text>
            <TextInput style={inputStyle} value={form.quantity} onChangeText={set('quantity')}
              placeholder="e.g. 10 meals / 5 kg" placeholderTextColor={C.faint} />

            <Text style={s.mlabel}>Pickup date (DD/MM/YYYY)</Text>
            <TextInput style={inputStyle} value={form.pickupDate} onChangeText={set('pickupDate')}
              placeholder="20/05/2026" keyboardType="numbers-and-punctuation" placeholderTextColor={C.faint} />

            <Text style={s.mlabel}>Pickup time (HH:MM, 24-hour)</Text>
            <TextInput style={inputStyle} value={form.pickupTime} onChangeText={set('pickupTime')}
              placeholder="20:00" keyboardType="numbers-and-punctuation" placeholderTextColor={C.faint} />

            <Text style={s.mlabel}>Contact phone (E.164)</Text>
            <TextInput style={inputStyle} value={form.contactPhone} onChangeText={set('contactPhone')}
              placeholder="+919876543210" keyboardType="phone-pad" placeholderTextColor={C.faint} />

            <TouchableOpacity style={[s.submitBtn, busy && { opacity: 0.65 }]} onPress={submit} disabled={busy} activeOpacity={0.88}>
              {busy ? <ActivityIndicator color={C.cream} /> : <Text style={s.submitTxt}>Create listing &amp; notify NGOs</Text>}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main screen ─────────────────────────────────────────────────────────────
export default function SurplusScreen() {
  const { token } = useAuth();
  const [listings, setListings]     = useState<SurplusListing[]>([]);
  const [region, setRegion]         = useState('All India');
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!token) return;
    if (!quiet) setLoading(true);
    try {
      const r = await api.listSurplus(token, region === 'All India' ? undefined : region);
      setListings(r.listings);
    } finally { setLoading(false); setRefreshing(false); }
  }, [token, region]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(true); };

  const claim = (l: SurplusListing) => {
    if (!token) return;
    Alert.alert(
      'Claim listing?',
      `Claim "${l.restaurantName}"? Contact them at ${l.contactPhone} to arrange pickup.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Claim', onPress: async () => {
          try {
            await api.claimSurplus(token, l.listingId);
            Alert.alert('Claimed! 🎉', `Contact ${l.restaurantName} at ${l.contactPhone} to arrange pickup before ${new Date(l.pickupByIso).toLocaleString('en-IN', { timeStyle: 'short', dateStyle: 'short' })}.`);
            load(true);
          } catch (e: any) { Alert.alert('Claim failed', e.message ?? 'Try again'); }
        }},
      ]
    );
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {token && (
        <CreateModal
          visible={showCreate} token={token}
          onClose={() => setShowCreate(false)}
          onCreated={() => load(true)}
        />
      )}

      <FlatList
        data={listings}
        keyExtractor={l => l.listingId}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.leaf} />}
        ListHeaderComponent={
          <>
            {/* Header row */}
            <View style={s.headerRow}>
              <View>
                <Text style={s.heading}>🍱  Surplus board</Text>
                <Text style={s.sub}>Rescue food, reduce waste</Text>
              </View>
              <TouchableOpacity style={s.createBtn} onPress={() => setShowCreate(true)} activeOpacity={0.85}>
                <Text style={s.createTxt}>+ List food</Text>
              </TouchableOpacity>
            </View>

            {/* Region filter chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {REGIONS.map(r => (
                  <TouchableOpacity
                    key={r} onPress={() => setRegion(r)}
                    style={[s.filterChip, region === r && s.filterChipActive]}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.filterTxt, region === r && s.filterTxtActive]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </>
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ gap: 10 }}>
              {[0,1,2].map(i => <View key={i} style={s.skeleton} />)}
            </View>
          ) : (
            <EmptyState
              emoji="🍱" title={`No listings${region !== 'All India' ? ` in ${region}` : ''}`}
              sub="Be the first to list surplus food in your area"
              actionLabel="List food" onAction={() => setShowCreate(true)}
            />
          )
        }
        renderItem={({ item }) => <ListingCard l={item} onClaim={() => claim(item)} />}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  list:        { padding: 20, paddingBottom: 40 },
  headerRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  heading:     { fontSize: 24, fontWeight: '800', color: C.earth },
  sub:         { fontSize: 13, color: C.muted, marginTop: 3 },
  createBtn:   { backgroundColor: C.leaf, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 12 },
  createTxt:   { color: C.cream, fontWeight: '700', fontSize: 13 },
  filterChip:  { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: C.border2, backgroundColor: C.bgCard },
  filterChipActive: { backgroundColor: C.leaf, borderColor: C.leaf },
  filterTxt:   { fontSize: 12, color: C.muted, fontWeight: '500' },
  filterTxtActive: { color: C.cream, fontWeight: '600' },
  skeleton:    { height: 120, borderRadius: R.lg, backgroundColor: C.creamDk },
  card:        { backgroundColor: C.bgCard, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, padding: 14, marginBottom: 10 },
  cardWarn:    { borderColor: C.saffBd },
  cardTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  cardName:    { fontSize: 15, fontWeight: '700', color: C.earth },
  cardMeta:    { fontSize: 11, color: C.muted, marginTop: 3 },
  foodBox:     { backgroundColor: `${C.earth}05`, borderRadius: R.xs, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  foodTxt:     { fontSize: 13, color: C.earth, lineHeight: 20 },
  cardBottom:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickupTxt:   { fontSize: 11, color: C.faint },
  claimBtn:    { backgroundColor: C.leaf, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10 },
  claimTxt:    { color: C.cream, fontWeight: '700', fontSize: 13 },
  claimedLbl:  { fontSize: 12, color: C.leaf, fontWeight: '600' },
  // Modal
  modalRoot:   { flex: 1, backgroundColor: C.bg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  modalTitle:  { fontSize: 18, fontWeight: '700', color: C.earth },
  closeBtn:    { width: 32, height: 32, borderRadius: 8, backgroundColor: C.creamDk, alignItems: 'center', justifyContent: 'center' },
  closeTxt:    { fontSize: 14, color: C.muted, fontWeight: '600' },
  modalBody:   { padding: 20, paddingBottom: 40 },
  mlabel:      { fontSize: 11, fontWeight: '600', color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 7 },
  modalInput:  { backgroundColor: C.bgCard, borderRadius: 12, borderWidth: 1, borderColor: C.border2, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, color: C.earth, marginBottom: 16 },
  regionChip:  { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: C.border2, backgroundColor: C.bgCard },
  regionChipActive: { backgroundColor: C.leaf, borderColor: C.leaf },
  regionChipTxt: { fontSize: 13, color: C.muted },
  regionChipTxtActive: { color: C.cream, fontWeight: '600' },
  submitBtn:   { backgroundColor: C.leaf, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  submitTxt:   { color: C.cream, fontWeight: '700', fontSize: 16 },
});
