import { useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Image, ScrollView,
  TextInput, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { api, type DetectResponse, type PredictResponse } from '../../lib/api';
import { Badge } from '../../components/Badge';
import { C, R } from '../../lib/theme';

type Stage = 'idle' | 'detecting' | 'questions' | 'predicting' | 'result';
const STAGES: Stage[] = ['idle','detecting','questions','predicting','result'];

function ProgressBar({ stage }: { stage: Stage }) {
  const idx = STAGES.indexOf(stage);
  return (
    <View style={pb.row}>
      {STAGES.map((s, i) => (
        <View key={s} style={[pb.dot, i < idx ? pb.done : i === idx ? pb.active : pb.idle]} />
      ))}
    </View>
  );
}
const pb = StyleSheet.create({
  row:    { flexDirection: 'row', gap: 6, marginBottom: 20 },
  dot:    { height: 5, borderRadius: 3 },
  active: { width: 28, backgroundColor: C.leaf },
  done:   { width: 14, backgroundColor: `${C.leaf}60` },
  idle:   { width: 14, backgroundColor: C.creamDk },
});

export default function ScanScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [stage, setStage]       = useState<Stage>('idle');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [detect, setDetect]     = useState<DetectResponse | null>(null);
  const [answers, setAnswers]   = useState<string[]>([]);
  const [phone, setPhone]       = useState('');
  const [result, setResult]     = useState<PredictResponse | null>(null);

  const pickImage = useCallback(async (fromCamera: boolean) => {
    const perms = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perms.status !== 'granted') {
      Alert.alert('Permission needed', `Allow ${fromCamera ? 'camera' : 'photo library'} access to scan food.`);
      return;
    }
    const r = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.85, allowsEditing: true, aspect: [4, 3] })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
    if (!r.canceled && r.assets[0]) setImageUri(r.assets[0].uri);
  }, []);

  const runDetect = useCallback(async () => {
    if (!imageUri || !token) return;
    setStage('detecting');
    try {
      const { uploadUrl, key } = await api.getUploadUrl(token, 'image/jpeg');
      const blob = await fetch(imageUri).then(r => r.blob());
      await fetch(uploadUrl, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: blob });
      const d = await api.detect(token, key);
      setDetect(d);
      setAnswers(new Array(d.questions.length).fill(''));
      if (d.status === 'NEED_INFO') setStage('questions');
      else { await doPredict(d, []); }
    } catch (e: any) {
      Alert.alert('Scan failed', e.message ?? 'Something went wrong. Try again.');
      setStage('idle');
    }
  }, [imageUri, token]);

  const doPredict = useCallback(async (d: DetectResponse, ans: string[]) => {
    if (!token) return;
    setStage('predicting');
    try {
      const ctx = d.questions
        .map((q, i) => ans[i]?.trim() ? `${q}: ${ans[i].trim()}` : null)
        .filter(Boolean).join(' | ');
      const p = await api.predict(token, {
        foodLabel: d.foodLabel, s3Key: d.s3Key,
        storageCondition: ctx || undefined,
        phoneNumber: phone.trim() || undefined,
        rekognitionConfidence: d.confidence,
        visionScore: d.vision?.score, visionTier: d.vision?.tier, visionReason: d.vision?.reason,
      });
      setResult(p); setStage('result');
    } catch (e: any) {
      Alert.alert('Prediction failed', e.message ?? 'Something went wrong.');
      setStage('idle');
    }
  }, [token, phone]);

  const reset = useCallback(() => {
    setStage('idle'); setImageUri(null); setDetect(null);
    setResult(null); setPhone(''); setAnswers([]);
  }, []);

  const expiryMs = result?.expiryAtIso ? new Date(result.expiryAtIso).getTime() - Date.now() : 0;
  const expiryH  = Math.floor(expiryMs / 3_600_000);
  const expiryD  = Math.floor(expiryH / 24);
  const expired  = expiryMs < 0;
  const urgent   = !expired && expiryH < 12;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.heading}>📷  Scan food</Text>
        <Text style={s.sub}>Take or upload a photo — AI predicts freshness</Text>
        <ProgressBar stage={stage} />

        {/* ── Idle ──────────────────────── */}
        {stage === 'idle' && (
          <>
            {imageUri ? (
              <TouchableOpacity activeOpacity={0.85} onPress={() => pickImage(false)}>
                <Image source={{ uri: imageUri }} style={s.preview} resizeMode="cover" />
              </TouchableOpacity>
            ) : (
              <View style={s.dropZone}>
                <Text style={s.dropEmoji}>📸</Text>
                <Text style={s.dropTitle}>Add a photo of your food</Text>
                <Text style={s.dropSub}>Tap a button below to get started</Text>
              </View>
            )}

            <View style={s.btnRow}>
              <TouchableOpacity style={[s.btn, s.btnGhost, { flex: 1 }]} onPress={() => pickImage(true)} activeOpacity={0.85}>
                <Text style={[s.btnTxt, { color: C.earth }]}>📸  Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, s.btnGhost, { flex: 1 }]} onPress={() => pickImage(false)} activeOpacity={0.85}>
                <Text style={[s.btnTxt, { color: C.earth }]}>🖼️  Library</Text>
              </TouchableOpacity>
            </View>

            {imageUri && (
              <>
                <Text style={s.label}>SMS reminder phone (optional, +91…)</Text>
                <TextInput
                  style={s.input} value={phone} onChangeText={setPhone}
                  placeholder="+91 98765 43210" keyboardType="phone-pad"
                  placeholderTextColor={C.faint}
                />
                <TouchableOpacity style={[s.btn, s.btnGreen]} onPress={runDetect} activeOpacity={0.88}>
                  <Text style={s.btnTxt}>✨  Analyse food</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setImageUri(null); setPhone(''); }} activeOpacity={0.7} style={{ alignItems: 'center', marginTop: 10 }}>
                  <Text style={{ fontSize: 13, color: C.muted }}>Clear image</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        {/* ── Loading ────────────────────── */}
        {(stage === 'detecting' || stage === 'predicting') && (
          <View style={s.loadBox}>
            {imageUri && <Image source={{ uri: imageUri }} style={[s.preview, { opacity: 0.45 }]} resizeMode="cover" />}
            <ActivityIndicator color={C.leaf} size="large" style={{ marginTop: 24 }} />
            <Text style={s.loadTitle}>{stage === 'detecting' ? 'Scanning with AI…' : 'Predicting freshness…'}</Text>
            <Text style={s.loadSub}>
              {stage === 'detecting' ? 'Rekognition + Bedrock Vision are analysing the image' : 'Claude is calculating the expiry date'}
            </Text>
          </View>
        )}

        {/* ── Questions ──────────────────── */}
        {stage === 'questions' && detect && (
          <>
            {/* Detection summary */}
            <View style={s.detectCard}>
              <Text style={s.detectName}>{detect.foodLabel}</Text>
              <Text style={s.detectConf}>{detect.confidence.toFixed(0)}% Rekognition · {detect.category}</Text>
              {detect.vision && (
                <View style={s.visionRow}>
                  <Text style={s.visionIcon}>{detect.vision.icon}</Text>
                  <View>
                    <Text style={s.visionTitle}>Visual: {detect.vision.tier} ({detect.vision.score}/100)</Text>
                    {detect.vision.reason && <Text style={s.visionReason}>{detect.vision.reason}</Text>}
                  </View>
                </View>
              )}
            </View>

            <Text style={s.qTitle}>A few more details</Text>
            <Text style={s.qSub}>Help us give a more accurate estimate</Text>

            {detect.questions.map((q, i) => (
              <View key={i} style={{ marginBottom: 14 }}>
                <Text style={s.label}>Q{i+1}. {q}</Text>
                <TextInput
                  style={s.input} value={answers[i] ?? ''}
                  onChangeText={t => { const a = [...answers]; a[i] = t; setAnswers(a); }}
                  placeholder="Your answer…" placeholderTextColor={C.faint}
                />
              </View>
            ))}

            <View style={s.btnRow}>
              <TouchableOpacity style={[s.btn, s.btnGhost, { flex: 1 }]} onPress={() => doPredict(detect, [])} activeOpacity={0.85}>
                <Text style={[s.btnTxt, { color: C.earth }]}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, s.btnGreen, { flex: 1 }]} onPress={() => doPredict(detect, answers)} activeOpacity={0.88}>
                <Text style={s.btnTxt}>Predict →</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── Result ─────────────────────── */}
        {stage === 'result' && result && (
          <>
            {/* Hero card */}
            <View style={[s.resultHero, expired ? s.heroExpired : urgent ? s.heroWarn : s.heroSafe]}>
              <Text style={s.heroEmoji}>{expired ? '🗑️' : urgent ? '⚠️' : '✅'}</Text>
              <Text style={s.heroFood}>{result.foodLabel}</Text>
              <Text style={[s.heroTime, expired && { color: C.red }]}>
                {expired ? 'Expired'
                  : expiryD > 0 ? `${expiryD}d ${expiryH % 24}h remaining`
                  : `${expiryH}h remaining`}
              </Text>
              <Text style={s.heroDate}>
                Best before {new Date(result.expiryAtIso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
              </Text>
            </View>

            {/* Visual freshness */}
            {detect?.vision && (
              <View style={s.visionCard}>
                <Text style={{ fontSize: 22 }}>{detect.vision.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.visionCardTitle}>Visual: {detect.vision.tier} · {detect.vision.score}/100</Text>
                  {detect.vision.reason && <Text style={s.visionCardReason}>{detect.vision.reason}</Text>}
                </View>
              </View>
            )}

            {/* AI explanation */}
            {result.model?.explanation && (
              <View style={s.explainCard}>
                <Text style={s.explainLbl}>AI explanation</Text>
                <Text style={s.explainTxt}>{result.model.explanation}</Text>
                {/* Confidence bar */}
                <View style={s.confBarBg}>
                  <View style={[s.confBarFill, { width: `${result.model.modelConfidence}%` as any }]} />
                </View>
                <Text style={s.confLbl}>{result.model.modelConfidence.toFixed(0)}% AI confidence</Text>
              </View>
            )}

            {/* Reminder note */}
            {result.hasPhoneReminder && result.reminderAtIso && !expired && (
              <View style={s.reminderCard}>
                <Text style={s.reminderTxt}>⏰  SMS reminder set for {new Date(result.reminderAtIso).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</Text>
              </View>
            )}

            {/* Actions */}
            <View style={s.btnRow}>
              <TouchableOpacity style={[s.btn, s.btnGhost, { flex: 1 }]} onPress={reset} activeOpacity={0.85}>
                <Text style={[s.btnTxt, { color: C.earth }]}>↩  Scan another</Text>
              </TouchableOpacity>
              {urgent && !expired && (
                <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: C.saffron }]} onPress={() => router.push('/(tabs)/surplus')} activeOpacity={0.88}>
                  <Text style={s.btnTxt}>List as surplus</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: C.bg },
  scroll:        { padding: 20, paddingBottom: 40 },
  heading:       { fontSize: 24, fontWeight: '800', color: C.earth, marginBottom: 4 },
  sub:           { fontSize: 13, color: C.muted, marginBottom: 20 },
  preview:       { width: '100%', height: 220, borderRadius: R.lg, marginBottom: 14, backgroundColor: C.creamDk },
  dropZone:      { borderWidth: 1.5, borderColor: C.border2, borderStyle: 'dashed', borderRadius: R.lg, padding: 36, alignItems: 'center', gap: 8, marginBottom: 14, backgroundColor: `${C.leaf}04` },
  dropEmoji:     { fontSize: 40 },
  dropTitle:     { fontSize: 15, fontWeight: '600', color: C.earth },
  dropSub:       { fontSize: 12, color: C.muted },
  btnRow:        { flexDirection: 'row', gap: 10, marginBottom: 12 },
  btn:           { borderRadius: R.md, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  btnGreen:      { backgroundColor: C.leaf, width: '100%' },
  btnGhost:      { borderWidth: 1.5, borderColor: C.border2 },
  btnTxt:        { color: C.cream, fontWeight: '700', fontSize: 15 },
  label:         { fontSize: 11, fontWeight: '600', color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 7 },
  input:         { backgroundColor: C.bgCard, borderRadius: R.sm, borderWidth: 1, borderColor: C.border2, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.earth, marginBottom: 4 },
  loadBox:       { alignItems: 'center', gap: 12, paddingVertical: 16 },
  loadTitle:     { fontSize: 16, fontWeight: '600', color: C.earth },
  loadSub:       { fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 18 },
  detectCard:    { backgroundColor: C.leafBg, borderWidth: 1, borderColor: C.leafBd, borderRadius: R.md, padding: 14, marginBottom: 20 },
  detectName:    { fontSize: 18, fontWeight: '700', color: C.earth },
  detectConf:    { fontSize: 12, color: C.leaf, marginTop: 3 },
  visionRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.leafBd },
  visionIcon:    { fontSize: 20 },
  visionTitle:   { fontSize: 13, fontWeight: '600', color: C.earth },
  visionReason:  { fontSize: 11, color: C.muted, marginTop: 2, lineHeight: 17 },
  qTitle:        { fontSize: 16, fontWeight: '700', color: C.earth, marginBottom: 4 },
  qSub:          { fontSize: 13, color: C.muted, marginBottom: 16 },
  resultHero:    { borderRadius: R.xl, padding: 24, alignItems: 'center', marginBottom: 12 },
  heroSafe:      { backgroundColor: C.leafBg, borderWidth: 1, borderColor: C.leafBd },
  heroWarn:      { backgroundColor: C.saffBg, borderWidth: 1, borderColor: C.saffBd },
  heroExpired:   { backgroundColor: C.redBg,  borderWidth: 1, borderColor: C.redBd },
  heroEmoji:     { fontSize: 48, marginBottom: 8 },
  heroFood:      { fontSize: 22, fontWeight: '800', color: C.earth },
  heroTime:      { fontSize: 18, fontWeight: '600', color: C.leaf, marginTop: 4 },
  heroDate:      { fontSize: 11, color: C.faint, marginTop: 6 },
  visionCard:    { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: C.bgCard, borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: 14, marginBottom: 10 },
  visionCardTitle: { fontSize: 13, fontWeight: '600', color: C.earth },
  visionCardReason:{ fontSize: 11, color: C.muted, marginTop: 3, lineHeight: 17 },
  explainCard:   { backgroundColor: C.bgCard, borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: 14, marginBottom: 10 },
  explainLbl:    { fontSize: 10, fontWeight: '600', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  explainTxt:    { fontSize: 13, color: C.earth, lineHeight: 20 },
  confBarBg:     { backgroundColor: C.creamDk, borderRadius: 4, height: 5, marginTop: 10, overflow: 'hidden' },
  confBarFill:   { height: 5, backgroundColor: C.leaf, borderRadius: 4 },
  confLbl:       { fontSize: 11, color: C.leaf, fontWeight: '600', marginTop: 5, textAlign: 'right' },
  reminderCard:  { backgroundColor: 'rgba(44,24,16,0.04)', borderWidth: 1, borderColor: C.border, borderRadius: R.sm, padding: 12, marginBottom: 10 },
  reminderTxt:   { fontSize: 13, color: C.muted },
});
