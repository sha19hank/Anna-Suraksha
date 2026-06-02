import { Text, StyleSheet } from 'react-native';
import { C } from '../lib/theme';

type Variant = 'safe' | 'warn' | 'expired' | 'claimed' | 'neutral';

export function Badge({ label, variant }: { label: string; variant: Variant }) {
  return <Text style={[s.base, s[variant]]}>{label}</Text>;
}
const s = StyleSheet.create({
  base:    { fontSize: 10, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  safe:    { backgroundColor: C.leafBg,  color: C.leaf },
  warn:    { backgroundColor: C.saffBg,  color: C.saffDark },
  expired: { backgroundColor: C.redBg,   color: C.red },
  claimed: { backgroundColor: 'rgba(44,24,16,0.06)', color: C.faint },
  neutral: { backgroundColor: C.creamDk, color: C.muted },
});
