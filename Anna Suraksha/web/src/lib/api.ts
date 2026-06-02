const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, ...rest } = options;
  const headers: HeadersInit = { 'content-type': 'application/json' };
  if (token) headers['authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...rest, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    // BUG FIX: Surface a clear "session expired" message on 401
    if (res.status === 401) throw new Error('Session expired — please sign in again');
    throw new Error(err.message ?? `API error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Types ──────────────────────────────────────────────────────────────────

export type UploadUrlResponse = { uploadUrl: string; key: string };

// BUG FIX: Added vision field — was missing, caused TypeScript error and silently dropped vision data
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
  vision: VisionResult | null;   // ← was missing
};

export type PredictResponse = {
  status: 'OK' | 'FAILED';
  analysisId: string;
  foodLabel: string;
  expiryAtIso: string;
  reminderAtIso: string;
  hasPhoneReminder: boolean;     // ← new field from fixed lambda
  model: { modelConfidence: number; explanation: string };
  errorCode?: string;
  message?: string;
};

export type Analysis = {
  analysisId: string;
  createdAtIso: string;
  foodType: string;
  category?: string;
  expiryAtIso: string;
  reminderAtIso: string;
  storageCondition?: string;
  preparationTime?: string;
  modelConfidence?: number;
  modelExplanation?: string;
  rekognitionConfidence?: number;
  visionScore?: number;
  visionTier?: string;
  visionReason?: string;
  hasPhoneReminder?: boolean;
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
  claimedByEmail?: string;
  claimedAtIso?: string;
};

// ── API calls ──────────────────────────────────────────────────────────────

export const api = {
  health: () =>
    apiFetch<{ status: string }>('/v1/health'),

  getUploadUrl: (token: string, contentType: string) =>
    apiFetch<UploadUrlResponse>('/v1/upload-url', {
      method: 'POST', token,
      body: JSON.stringify({ contentType }),
    }),

  uploadToS3: (uploadUrl: string, file: File) =>
    fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'content-type': file.type } }),

  detect: (token: string, key: string) =>
    apiFetch<DetectResponse>('/v1/detect', {
      method: 'POST', token,
      body: JSON.stringify({ key }),
    }),

  predict: (
    token: string,
    payload: {
      foodLabel: string;
      s3Key?: string;
      storageCondition?: string;
      preparationTime?: string;
      phoneNumber?: string;
      rekognitionConfidence?: number;
      // BUG FIX: Pass vision data through so it gets stored without a second Bedrock call
      visionScore?: number;
      visionTier?: string;
      visionReason?: string;
    }
  ) =>
    apiFetch<PredictResponse>('/v1/predict', {
      method: 'POST', token,
      body: JSON.stringify(payload),
    }),

  listAnalyses: (token: string, nextToken?: string) =>
    apiFetch<{ analyses: Analysis[]; nextToken?: string; count: number }>(
      `/v1/analyses${nextToken ? `?nextToken=${encodeURIComponent(nextToken)}` : ''}`,
      { token }
    ),

  getAnalysis: (token: string, analysisId: string) =>
    apiFetch<{ analysis: Analysis }>(`/v1/analyses/${analysisId}`, { token }),

  listSurplus: (token: string, region?: string, status = 'OPEN') =>
    apiFetch<{ listings: SurplusListing[]; count: number }>(
      `/v1/surplus?status=${status}${region ? `&region=${encodeURIComponent(region)}` : ''}`,
      { token }
    ),

  createSurplus: (
    token: string,
    payload: {
      restaurantName: string;
      region: string;
      foodSummary: string;
      quantity: string;
      pickupByIso: string;
      contactPhone: string;
    }
  ) =>
    apiFetch<{ status: string; listingId: string }>('/v1/surplus', {
      method: 'POST', token,
      body: JSON.stringify(payload),
    }),

  claimSurplus: (token: string, listingId: string) =>
    apiFetch<{ status: string; listingId: string; claimedAtIso: string }>(
      `/v1/surplus/${listingId}/claim`,
      { method: 'PATCH', token }
    ),
};
