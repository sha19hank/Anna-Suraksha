import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { C } from '../../lib/theme';

export default function LoginScreen() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState(false);
  const { login }               = useAuth();
  const router                  = useRouter();

  const submit = async () => {
    if (!email.trim() || !password) { setError('Enter your email and password'); return; }
    setError(''); setBusy(true);
    try {
      await login(email.trim(), password);
      // AuthGate in _layout.tsx handles redirect automatically
    } catch (e: any) {
      setError(e.message?.replace('UserNotConfirmedException', 'Please verify your email first') ?? 'Login failed');
    } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Logo */}
        <View style={s.logoBox}>
          <View style={s.logoCircle}><Text style={s.logoLeaf}>🌿</Text></View>
          <Text style={s.logoTitle}>Anna Suraksha</Text>
          <Text style={s.logoSub}>Food intelligence for India</Text>
        </View>

        {/* Card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Sign in</Text>

          <Text style={s.label}>Email</Text>
          <TextInput
            style={s.input} value={email} onChangeText={setEmail}
            placeholder="you@example.com" keyboardType="email-address"
            autoCapitalize="none" autoCorrect={false} returnKeyType="next"
            placeholderTextColor={C.faint}
          />

          <Text style={s.label}>Password</Text>
          <View style={s.pwWrap}>
            <TextInput
              style={[s.input, { flex: 1, marginBottom: 0 }]}
              value={password} onChangeText={setPassword}
              placeholder="••••••••" secureTextEntry={!showPw}
              returnKeyType="done" onSubmitEditing={submit}
              placeholderTextColor={C.faint}
            />
            <TouchableOpacity style={s.eye} onPress={() => setShowPw(v => !v)}>
              <Text style={s.eyeTxt}>{showPw ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          {!!error && <Text style={s.error}>{error}</Text>}

          <TouchableOpacity style={[s.btn, busy && s.btnDisabled]} onPress={submit} disabled={busy} activeOpacity={0.85}>
            {busy ? <ActivityIndicator color={C.cream} /> : <Text style={s.btnTxt}>Sign in</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/(auth)/signup')} activeOpacity={0.7}>
            <Text style={s.link}>New here? <Text style={s.linkBold}>Create an account</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: C.bg },
  scroll:     { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoBox:    { alignItems: 'center', marginBottom: 36 },
  logoCircle: { width: 64, height: 64, borderRadius: 18, backgroundColor: C.leaf, alignItems: 'center', justifyContent: 'center', marginBottom: 12, shadowColor: C.leaf, shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  logoLeaf:   { fontSize: 32 },
  logoTitle:  { fontSize: 28, fontWeight: '800', color: C.earth, letterSpacing: -0.5 },
  logoSub:    { fontSize: 14, color: C.muted, marginTop: 4 },
  card:       { backgroundColor: C.bgCard, borderRadius: 24, padding: 24, borderWidth: 1, borderColor: C.border },
  cardTitle:  { fontSize: 22, fontWeight: '700', color: C.earth, marginBottom: 20 },
  label:      { fontSize: 11, fontWeight: '600', color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 7 },
  input:      { backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border2, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: C.earth, marginBottom: 14 },
  pwWrap:     { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  eye:        { paddingHorizontal: 10 },
  eyeTxt:     { fontSize: 18 },
  error:      { fontSize: 13, color: C.saffron, marginBottom: 12, lineHeight: 18 },
  btn:        { backgroundColor: C.leaf, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 4, marginBottom: 18, shadowColor: C.leaf, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  btnDisabled:{ opacity: 0.65 },
  btnTxt:     { color: C.cream, fontWeight: '700', fontSize: 16 },
  link:       { textAlign: 'center', fontSize: 14, color: C.muted },
  linkBold:   { color: C.leaf, fontWeight: '600' },
});
