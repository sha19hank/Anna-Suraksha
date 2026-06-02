import { Stack } from 'expo-router';
import { C } from '../../lib/theme';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
      <Stack.Screen name="login"  options={{ animation: 'fade' }} />
      <Stack.Screen name="signup" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}
