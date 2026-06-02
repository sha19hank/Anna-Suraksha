import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { C, R } from '../lib/theme';

type Props = { emoji: string; title: string; sub: string; actionLabel?: string; onAction?: () => void };
export function EmptyState({ emoji, title, sub, actionLabel, onAction }: Props) {
  return (
    <View style={s.wrap}>
      <Text style={s.emoji}>{emoji}</Text>
      <Text style={s.title}>{title}</Text>
      <Text style={s.sub}>{sub}</Text>
      {actionLabel && onAction && (
        <TouchableOpacity style={s.btn} onPress={onAction} activeOpacity={0.85}>
          <Text style={s.btnTxt}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  wrap:   { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emoji:  { fontSize: 48, marginBottom: 12 },
  title:  { fontSize: 17, fontWeight: '700', color: C.earth, marginBottom: 6 },
  sub:    { fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  btn:    { backgroundColor: C.leaf, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 24 },
  btnTxt: { color: C.cream, fontWeight: '700', fontSize: 14 },
});
