import { View, ViewStyle, StyleSheet } from 'react-native';
import { C, R } from '../lib/theme';

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}
const s = StyleSheet.create({
  card: { backgroundColor: C.bgCard, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: 14 },
});
