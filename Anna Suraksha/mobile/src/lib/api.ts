const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

async function apiFetch<T>(path: string, options: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = options;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers['authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { ...rest, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? `API error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────

export type UploadUrlResponse = { uploadUrl: string; key: string };

// BUG FIX: Added VisionResult type — was missing, vision data was silently dropped
export type VisionResult = {
  score: number;
  tier: string;
  icon: string;
  reason: string;
};

export type DetectResponse = {
  status: 'OK' | 'NEED_INFO';
  s3Key: string;
  foodLabel: string;
  confidence: number;
  category: string;
  questions: string[];
  vision: VisionResult | null;  // ← was missing
};

export type PredictResponse = {
  status: 'OK' | 'FAILED';
  analysisId: string;
  foodLabel: string;
  expiryAtIso: string;
  reminderAtIso: string;
  hasPhoneReminder: boolean;    // ← was missing
  model: { modelConfidence: number; explanation: string };
  message?: string;
};

export type Analysis = {
  analysisId: string;
  createdAtIso: string;
  foodType: string;
  expiryAtIso: string;
  storageCondition?: string;
  modelConfidence?: number;
  modelExplanation?: string;
  rekognitionConfidence?: number;
  visionScore?: number;
  visionTier?: string;
  hasPhoneReminder?: boolean;
  reminderAtIso?: string;
};

export type SurplusListing = {
  listingId: string;
  restaurantName: string;
  region: string;
  foodSummary: string;
  quantity: string;
  pickupByIso: string;
  contactPhone: string;
  status: 'OPEN' | 'CLAIMED';
  createdAtIso: string;
};

// ── API calls ─────────────────────────────────────────────────────────────

export const api = {
  getUploadUrl: (token: string, contentType: string) =>
    apiFetch<UploadUrlResponse>('/v1/upload-url', {
      method: 'POST', token,
      body: JSON.stringify({ contentType }),
    }),

  detect: (token: string, key: string) =>
    apiFetch<DetectResponse>('/v1/detect', {
      method: 'POST', token,
      body: JSON.stringify({ key }),
    }),

  predict: (token: string, payload: {
    foodLabel: string;
    s3Key?: string;
    storageCondition?: string;
    phoneNumber?: string;
    rekognitionConfidence?: number;
    visionScore?: number;
    visionTier?: string;
    visionReason?: string;
  }) =>
    apiFetch<PredictResponse>('/v1/predict', {
      method: 'POST', token,
      body: JSON.stringify(payload),
    }),

  listAnalyses: (token: string, nextToken?: string) =>
    apiFetch<{ analyses: Analysis[]; nextToken?: string }>(
      `/v1/analyses${nextToken ? `?nextToken=${encodeURIComponent(nextToken)}` : ''}`,
      { token }
    ),

  listSurplus: (token: string, region?: string) =>
    apiFetch<{ listings: SurplusListing[] }>(
      `/v1/surplus?status=OPEN${region ? `&region=${encodeURIComponent(region)}` : ''}`,
      { token }
    ),

  claimSurplus: (token: string, listingId: string) =>
    apiFetch<{ status: string }>(`/v1/surplus/${listingId}/claim`, { method: 'PATCH', token }),

  createSurplus: (token: string, payload: {
    restaurantName: string;
    region: string;
    foodSummary: string;
    quantity: string;
    pickupByIso: string;
    contactPhone: string;
  }) =>
    apiFetch<{ status: string; listingId: string }>('/v1/surplus', {
      method: 'POST', token,
      body: JSON.stringify(payload),
    }),
};
