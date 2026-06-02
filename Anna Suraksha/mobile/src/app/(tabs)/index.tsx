import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { api, type Analysis } from '../../lib/api';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { timeLeft } from '../../lib/utils';
import { C, R } from '../../lib/theme';

function StatCard({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <View style={s.statCard}>
      <Text style={[s.statVal, color ? { color } : {}]}>{value}</Text>
      <Text style={s.statLbl}>{label}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const { user, token, loading, logout } = useAuth();
  const router = useRouter();
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);

  const load = useCallback(async (quiet = false) => {
    if (!token) return;
    if (!quiet) setDataLoading(true);
    try {
      const r = await api.listAnalyses(token);
      setAnalyses(r.analyses);
    } catch {}
    finally { setDataLoading(false); setRefreshing(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(true); };

  const handleLogout = () =>
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => { logout(); } },
    ]);

  const expiringCount = analyses.filter(a => {
    const h = (new Date(a.expiryAtIso).getTime() - Date.now()) / 3_600_000;
    return h > 0 && h < 24;
  }).length;
  const expiredCount = analyses.filter(a => new Date(a.expiryAtIso) < new Date()).length;
  const safeCount    = analyses.length - expiringCount - expiredCount;

  const firstName = user?.signInDetails?.loginId?.split('@')[0] ?? 'there';

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.leaf} />}
      >
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.greetLbl}>Good day 👋</Text>
            <Text style={s.greetName}>{firstName}</Text>
          </View>
          <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
            <Text style={s.logoutTxt}>Sign out</Text>
          </TouchableOpacity>
        </View>

        {/* Alert banner */}
        {expiringCount > 0 && (
          <View style={s.alertBar}>
            <Text style={s.alertTxt}>
              ⚠️  {expiringCount} item{expiringCount > 1 ? 's' : ''} expiring within 24h — use or donate now
            </Text>
          </View>
        )}

        {/* Stats grid */}
        <View style={s.statsGrid}>
          <StatCard value={analyses.length} label="Total scans" />
          <StatCard value={safeCount}        label="Safe"         color={C.leaf} />
          <StatCard value={expiringCount}    label="Expiring"     color={C.saffDark} />
          <StatCard value={expiredCount}     label="Expired"      color={C.red} />
        </View>

        {/* Quick actions */}
        <TouchableOpacity style={[s.action, s.actionGreen]} onPress={() => router.push('/(tabs)/scan')} activeOpacity={0.88}>
          <View>
            <Text style={s.actionTitle}>Scan food</Text>
            <Text style={s.actionSub}>Check freshness with AI</Text>
          </View>
          <View style={s.actionIcon}><Text style={{ fontSize: 26 }}>📷</Text></View>
        </TouchableOpacity>

        <TouchableOpacity style={[s.action, s.actionOrange]} onPress={() => router.push('/(tabs)/surplus')} activeOpacity={0.88}>
          <View>
            <Text style={s.actionTitle}>Surplus board</Text>
            <Text style={s.actionSub}>List or claim food near you</Text>
          </View>
          <View style={s.actionIcon}><Text style={{ fontSize: 26 }}>🍱</Text></View>
        </TouchableOpacity>

        {/* Recent scans */}
        <Text style={s.sectionTitle}>Recent scans</Text>

        {dataLoading ? (
          [0,1,2].map(i => <View key={i} style={s.skeleton} />)
        ) : analyses.length === 0 ? (
          <EmptyState
            emoji="📷" title="No scans yet"
            sub="Scan your first food item to get started"
            actionLabel="Scan now" onAction={() => router.push('/(tabs)/scan')}
          />
        ) : (
          analyses.slice(0, 6).map(a => {
            const { label, variant } = timeLeft(a.expiryAtIso);
            return (
              <TouchableOpacity
                key={a.analysisId} style={s.scanRow}
                onPress={() => router.push('/(tabs)/history')} activeOpacity={0.75}
              >
                <Text style={s.scanEmoji}>
                  {variant === 'expired' ? '🗑️' : variant === 'warn' ? '⚠️' : '✅'}
                </Text>
                <View style={s.scanBody}>
                  <Text style={s.scanName}>{a.foodType}</Text>
                  <Text style={s.scanDate}>{new Date(a.createdAtIso).toLocaleDateString('en-IN')}</Text>
                </View>
                <Badge label={label} variant={variant} />
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  scroll:      { padding: 20, paddingBottom: 32 },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  greetLbl:    { fontSize: 13, color: C.muted, marginBottom: 2 },
  greetName:   { fontSize: 26, fontWeight: '800', color: C.earth, letterSpacing: -0.3 },
  logoutBtn:   { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: C.border2 },
  logoutTxt:   { fontSize: 12, color: C.muted, fontWeight: '500' },
  alertBar:    { backgroundColor: C.saffBg, borderWidth: 1, borderColor: C.saffBd, borderRadius: R.sm, padding: 12, marginBottom: 16 },
  alertTxt:    { fontSize: 13, color: C.saffDark, lineHeight: 20 },
  statsGrid:   { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statCard:    { flex: 1, backgroundColor: C.bgCard, borderRadius: R.md, borderWidth: 1, borderColor: C.border, padding: 12, alignItems: 'center' },
  statVal:     { fontSize: 22, fontWeight: '700', color: C.earth },
  statLbl:     { fontSize: 9, color: C.muted, marginTop: 2, textAlign: 'center' },
  action:      { borderRadius: R.lg, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  actionGreen: { backgroundColor: C.leaf },
  actionOrange:{ backgroundColor: C.saffron },
  actionTitle: { fontSize: 17, fontWeight: '700', color: C.cream },
  actionSub:   { fontSize: 12, color: 'rgba(250,247,240,0.70)', marginTop: 3 },
  actionIcon:  { width: 44, height: 44, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sectionTitle:{ fontSize: 16, fontWeight: '700', color: C.earth, marginTop: 8, marginBottom: 12 },
  skeleton:    { height: 62, borderRadius: R.md, backgroundColor: C.creamDk, marginBottom: 8 },
  scanRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bgCard, borderRadius: R.md, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 8, gap: 12 },
  scanEmoji:   { fontSize: 22 },
  scanBody:    { flex: 1 },
  scanName:    { fontSize: 14, fontWeight: '600', color: C.earth },
  scanDate:    { fontSize: 11, color: C.faint, marginTop: 2 },
});
