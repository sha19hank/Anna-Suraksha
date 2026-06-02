/**
 * Bedrock vision freshness scorer.
 * Uses Claude 3.5 Sonnet's vision capability to score food freshness
 * from the uploaded image. Runs in detect-food Lambda alongside Rekognition.
 * Falls back gracefully on any error — never blocks the main scan flow.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { warn } from './logger';

// BUG FIX: Use env var instead of hardcoded model ID
const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? 'anthropic.claude-3-5-sonnet-20240620-v1:0';

const client = new BedrockRuntimeClient({});

export type VisionFreshnessResult =
  | { ok: true;  score: number; reason: string; foodLabel: string }
  | { ok: false; error: string };

type RawScore = { score: number; reason: string; foodLabel: string };

const SYSTEM_PROMPT = `You are a food freshness analyst with expert-level visual inspection skills.
Assess the freshness of the food in this image based only on what you can see:
- Colour (natural vs dull/browning/yellowing)
- Surface texture (firm vs slimy/mushy/wrinkled)
- Visible moisture or liquid pooling
- Any mold, spots, dark patches, or unusual growth
- Wilting, shrivelling, or bruising (for produce)

Respond ONLY with a single JSON object on one line — no markdown fences, no explanation:
{"score":<0-100>,"reason":"<one short sentence>","foodLabel":"<best guess at the food name>"}

score 100 = perfectly fresh. score 0 = completely inedible/rotten. Be strict.`;

export async function scoreFreshnessFromImage(params: {
  bucketName: string;
  s3Key: string;
  mediaType?: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
}): Promise<VisionFreshnessResult> {
  const { bucketName, s3Key, mediaType = 'image/jpeg' } = params;

  // Fetch image bytes from S3 via presigned URL
  // The detect Lambda's IAM role has s3:GetObject on the uploads bucket (fixed in CDK stack)
  let imageBase64: string;
  let resolvedMediaType = mediaType;
  try {
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl }              = await import('@aws-sdk/s3-request-presigner');
    const s3Client = new S3Client({});
    const presignedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: bucketName, Key: s3Key }),
      { expiresIn: 60 }
    );
    const res = await fetch(presignedUrl);
    if (!res.ok) return { ok: false, error: `S3 fetch failed: HTTP ${res.status}` };
    const buf = await res.arrayBuffer();
    imageBase64 = Buffer.from(buf).toString('base64');
    const ct = res.headers.get('content-type');
    if (ct && ct.startsWith('image/')) {
      resolvedMediaType = ct as typeof resolvedMediaType;
    }
  } catch (e: any) {
    return { ok: false, error: `Image fetch error: ${e.message}` };
  }

  try {
    const requestBody = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: resolvedMediaType, data: imageBase64 },
            },
            { type: 'text', text: 'Analyse the freshness of the food in this image.' },
          ],
        },
      ],
    });

    const cmd = new InvokeModelCommand({
      modelId: MODEL_ID,
      body: requestBody,
      contentType: 'application/json',
      accept: 'application/json',
    });

    const raw  = await client.send(cmd);
    const text = (JSON.parse(new TextDecoder().decode(raw.body)).content?.[0]?.text ?? '') as string;

    // Strip any accidental markdown fences
    const clean  = text.replace(/```json\s*|\s*```/g, '').trim();
    const parsed = JSON.parse(clean) as RawScore;

    if (typeof parsed.score !== 'number' || !parsed.reason) {
      return { ok: false, error: 'Unexpected model output shape' };
    }

    return {
      ok: true,
      score: Math.max(0, Math.min(100, Math.round(parsed.score))),
      reason: parsed.reason.trim(),
      foodLabel: (parsed.foodLabel ?? 'Unknown').trim(),
    };
  } catch (e: any) {
    warn('bedrockVision.error', { s3Key, error: e.message });
    return { ok: false, error: e.message ?? 'Vision scoring failed' };
  }
}

export function freshnessLabel(score: number): string {
  if (score >= 85) return 'Very fresh';
  if (score >= 70) return 'Fresh';
  if (score >= 50) return 'Acceptable';
  if (score >= 30) return 'Use soon';
  if (score >= 10) return 'Nearly expired';
  return 'Discard';
}

export function freshnessEmoji(score: number): string {
  if (score >= 85) return '🟢';
  if (score >= 70) return '🟡';
  if (score >= 50) return '🟠';
  return '🔴';
}
