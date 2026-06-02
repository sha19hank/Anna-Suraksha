import { Tabs } from 'expo-router';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../../lib/theme';

type IconProps = { focused: boolean; emoji: string; label: string };
function TabIcon({ focused, emoji, label }: IconProps) {
  return (
    <View style={[ti.wrap, focused && ti.wrapActive]}>
      <Text style={ti.emoji}>{emoji}</Text>
      <Text style={[ti.lbl, focused && ti.lblActive]}>{label}</Text>
    </View>
  );
}
const ti = StyleSheet.create({
  wrap:      { alignItems: 'center', justifyContent: 'center', paddingVertical: 4, paddingHorizontal: 12, borderRadius: 12, gap: 2 },
  wrapActive:{ backgroundColor: C.leafBg },
  emoji:     { fontSize: 18 },
  lbl:       { fontSize: 10, color: C.faint, fontWeight: '500' },
  lblActive: { color: C.leaf, fontWeight: '600' },
});

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: C.bg,
          borderTopColor: C.border,
          borderTopWidth: 1,
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 6,
          elevation: 0,
          shadowOpacity: 0,
        },
      }}
    >
      <Tabs.Screen name="index"
        options={{ tabBarIcon: ({ focused }) => <TabIcon focused={focused} emoji="🏠" label="Home" /> }} />
      <Tabs.Screen name="scan"
        options={{ tabBarIcon: ({ focused }) => <TabIcon focused={focused} emoji="📷" label="Scan" /> }} />
      <Tabs.Screen name="history"
        options={{ tabBarIcon: ({ focused }) => <TabIcon focused={focused} emoji="🕐" label="History" /> }} />
      <Tabs.Screen name="surplus"
        options={{ tabBarIcon: ({ focused }) => <TabIcon focused={focused} emoji="🍱" label="Surplus" /> }} />
    </Tabs>
  );
}
