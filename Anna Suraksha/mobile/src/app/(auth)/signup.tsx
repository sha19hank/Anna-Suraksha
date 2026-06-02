import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { C } from '../../lib/theme';

type Step = 'register' | 'confirm';

export default function SignupScreen() {
  const [step, setStep]         = useState<Step>('register');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode]         = useState('');
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState(false);
  const { register, confirm, login } = useAuth();
  const router = useRouter();

  const submitRegister = async () => {
    if (!email.trim() || password.length < 8) {
      setError('Enter a valid email and a password of at least 8 characters');
      return;
    }
    setError(''); setBusy(true);
    try {
      await register(email.trim(), password);
      setStep('confirm');
    } catch (e: any) {
      setError(e.message ?? 'Registration failed');
    } finally { setBusy(false); }
  };

  const submitConfirm = async () => {
    if (code.length !== 6) { setError('Enter the 6-digit code'); return; }
    setError(''); setBusy(true);
    try {
      await confirm(email.trim(), code);
      await login(email.trim(), password);
    } catch (e: any) {
      setError(e.message ?? 'Verification failed');
    } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={s.logoBox}>
          <View style={s.logoCircle}><Text style={{ fontSize: 32 }}>🌿</Text></View>
          <Text style={s.logoTitle}>Anna Suraksha</Text>
          <Text style={s.logoSub}>Food intelligence for India</Text>
        </View>

        <View style={s.card}>
          {step === 'register' ? (
            <>
              <Text style={s.cardTitle}>Create account</Text>
              <Text style={s.label}>Email</Text>
              <TextInput
                style={s.input} value={email} onChangeText={setEmail}
                placeholder="you@example.com" keyboardType="email-address"
                autoCapitalize="none" autoCorrect={false} returnKeyType="next"
                placeholderTextColor={C.faint}
              />
              <Text style={s.label}>Password (min 8 characters)</Text>
              <TextInput
                style={s.input} value={password} onChangeText={setPassword}
                placeholder="••••••••" secureTextEntry
                returnKeyType="done" onSubmitEditing={submitRegister}
                placeholderTextColor={C.faint}
              />
              {!!error && <Text style={s.error}>{error}</Text>}
              <TouchableOpacity style={[s.btn, busy && s.btnDim]} onPress={submitRegister} disabled={busy} activeOpacity={0.85}>
                {busy ? <ActivityIndicator color={C.cream} /> : <Text style={s.btnTxt}>Create account</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={s.cardTitle}>Verify email</Text>
              <Text style={s.sub}>We sent a 6-digit code to{'\n'}<Text style={s.subBold}>{email}</Text></Text>
              <TextInput
                style={[s.input, s.codeInput]} value={code} onChangeText={t => setCode(t.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456" keyboardType="number-pad" maxLength={6}
                returnKeyType="done" onSubmitEditing={submitConfirm}
                placeholderTextColor={C.faint}
              />
              {!!error && <Text style={s.error}>{error}</Text>}
              <TouchableOpacity style={[s.btn, busy && s.btnDim]} onPress={submitConfirm} disabled={busy} activeOpacity={0.85}>
                {busy ? <ActivityIndicator color={C.cream} /> : <Text style={s.btnTxt}>Verify & sign in</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setStep('register')} activeOpacity={0.7}>
                <Text style={s.link}>← Change email</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'register' && (
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
              <Text style={s.link}>Already have an account? <Text style={s.linkBold}>Sign in</Text></Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: C.bg },
  scroll:    { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoBox:   { alignItems: 'center', marginBottom: 36 },
  logoCircle:{ width: 64, height: 64, borderRadius: 18, backgroundColor: C.leaf, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  logoTitle: { fontSize: 28, fontWeight: '800', color: C.earth, letterSpacing: -0.5 },
  logoSub:   { fontSize: 14, color: C.muted, marginTop: 4 },
  card:      { backgroundColor: C.bgCard, borderRadius: 24, padding: 24, borderWidth: 1, borderColor: C.border },
  cardTitle: { fontSize: 22, fontWeight: '700', color: C.earth, marginBottom: 20 },
  sub:       { fontSize: 14, color: C.muted, marginBottom: 18, lineHeight: 22 },
  subBold:   { color: C.leaf, fontWeight: '600' },
  label:     { fontSize: 11, fontWeight: '600', color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 7 },
  input:     { backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border2, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: C.earth, marginBottom: 14 },
  codeInput: { fontSize: 30, textAlign: 'center', letterSpacing: 14, fontWeight: '700' },
  error:     { fontSize: 13, color: C.saffron, marginBottom: 12, lineHeight: 18 },
  btn:       { backgroundColor: C.leaf, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 18, shadowColor: C.leaf, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  btnDim:    { opacity: 0.65 },
  btnTxt:    { color: C.cream, fontWeight: '700', fontSize: 16 },
  link:      { textAlign: 'center', fontSize: 14, color: C.muted },
  linkBold:  { color: C.leaf, fontWeight: '600' },
});
