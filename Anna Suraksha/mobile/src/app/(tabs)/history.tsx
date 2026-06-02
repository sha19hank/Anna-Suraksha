import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { api, type Analysis } from '../../lib/api';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { timeLeft, fmtDate } from '../../lib/utils';
import { C, R } from '../../lib/theme';
import { useRouter } from 'expo-router';

function AnalysisRow({ a }: { a: Analysis }) {
  const [open, setOpen] = useState(false);
  const { label, variant } = timeLeft(a.expiryAtIso);
  const emoji = variant === 'expired' ? '🗑️' : variant === 'warn' ? '⚠️' : '✅';

  return (
    <TouchableOpacity style={s.row} onPress={() => setOpen(v => !v)} activeOpacity={0.75}>
      <View style={s.rowTop}>
        <Text style={s.rowEmoji}>{emoji}</Text>
        <View style={s.rowBody}>
          <Text style={s.rowName}>{a.foodType}</Text>
          <Text style={s.rowDate}>{fmtDate(a.createdAtIso, { dateStyle: 'medium' })}</Text>
        </View>
        <Badge label={label} variant={variant} />
        <Text style={[s.chevron, open && s.chevronOpen]}>›</Text>
      </View>

      {open && (
        <View style={s.detail}>
          {a.visionTier != null && a.visionScore != null && (
            <View style={s.detailRow}>
              <Text style={s.detailKey}>Visual freshness</Text>
              <Text style={s.detailVal}>{a.visionTier} ({a.visionScore}/100)</Text>
            </View>
          )}
          {a.modelConfidence != null && (
            <View style={s.detailRow}>
              <Text style={s.detailKey}>AI confidence</Text>
              <Text style={[s.detailVal, { color: C.leaf }]}>{a.modelConfidence.toFixed(0)}%</Text>
            </View>
          )}
          {a.storageCondition && (
            <View style={s.detailRow}>
              <Text style={s.detailKey}>Context</Text>
              <Text style={s.detailVal}>{a.storageCondition}</Text>
            </View>
          )}
          {a.modelExplanation && (
            <Text style={s.detailExplain}>{a.modelExplanation}</Text>
          )}
          <View style={s.detailRow}>
            <Text style={s.detailKey}>Expires</Text>
            <Text style={s.detailVal}>{fmtDate(a.expiryAtIso)}</Text>
          </View>
          {a.hasPhoneReminder && a.reminderAtIso && (
            <View style={s.detailRow}>
              <Text style={s.detailKey}>Reminder</Text>
              <Text style={s.detailVal}>{fmtDate(a.reminderAtIso)}</Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function HistoryScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [analyses, setAnalyses]   = useState<Analysis[]>([]);
  const [nextToken, setNextToken] = useState<string | undefined>();
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (nt?: string, quiet = false) => {
    if (!token) return;
    if (!quiet) setLoading(true);
    try {
      const r = await api.listAnalyses(token, nt);
      setAnalyses(prev => nt ? [...prev, ...r.analyses] : r.analyses);
      setNextToken(r.nextToken);
    } finally {
      setLoading(false); setRefreshing(false); setLoadingMore(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(undefined, true); };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <FlatList
        data={analyses}
        keyExtractor={a => a.analysisId}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.leaf} />}
        ListHeaderComponent={
          <View style={s.header}>
            <Text style={s.heading}>🕐  History</Text>
            <Text style={s.sub}>{analyses.length} total scan{analyses.length !== 1 ? 's' : ''}</Text>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ gap: 8 }}>
              {[0,1,2].map(i => <View key={i} style={s.skeleton} />)}
            </View>
          ) : (
            <EmptyState
              emoji="🕐" title="No scans yet"
              sub="Your past analyses will appear here"
              actionLabel="Scan now" onAction={() => router.push('/(tabs)/scan')}
            />
          )
        }
        ListFooterComponent={
          nextToken ? (
            <TouchableOpacity
              style={s.loadMoreBtn}
              onPress={() => { setLoadingMore(true); load(nextToken, true); }}
              disabled={loadingMore}
              activeOpacity={0.8}
            >
              {loadingMore
                ? <ActivityIndicator color={C.leaf} />
                : <Text style={s.loadMoreTxt}>Load more</Text>}
            </TouchableOpacity>
          ) : null
        }
        renderItem={({ item }) => <AnalysisRow a={item} />}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  list:        { padding: 20, paddingBottom: 40 },
  header:      { marginBottom: 16 },
  heading:     { fontSize: 24, fontWeight: '800', color: C.earth },
  sub:         { fontSize: 13, color: C.muted, marginTop: 3 },
  skeleton:    { height: 62, borderRadius: R.md, backgroundColor: C.creamDk },
  row:         { backgroundColor: C.bgCard, borderWidth: 1, borderColor: C.border, borderRadius: R.md, marginBottom: 8, overflow: 'hidden' },
  rowTop:      { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  rowEmoji:    { fontSize: 22 },
  rowBody:     { flex: 1 },
  rowName:     { fontSize: 14, fontWeight: '600', color: C.earth },
  rowDate:     { fontSize: 11, color: C.faint, marginTop: 2 },
  chevron:     { fontSize: 20, color: C.faint, transform: [{ rotate: '90deg' }] },
  chevronOpen: { transform: [{ rotate: '-90deg' }] },
  detail:      { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: C.border, gap: 8 },
  detailRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 8 },
  detailKey:   { fontSize: 12, color: C.muted, flex: 1 },
  detailVal:   { fontSize: 12, fontWeight: '600', color: C.earth, flex: 2, textAlign: 'right' },
  detailExplain: { fontSize: 12, color: C.earth60, lineHeight: 19, paddingTop: 8 },
  loadMoreBtn: { alignItems: 'center', paddingVertical: 16 },
  loadMoreTxt: { fontSize: 14, fontWeight: '600', color: C.leaf },
});
