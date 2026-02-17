import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

export type ExpiryPrediction = {
  expiryTimestamp: string;
  modelConfidence: number;
  explanation: string;
};

export type BedrockPredictionResult =
  | { ok: true; value: ExpiryPrediction; rawText: string }
  | { ok: false; error: { message: string; rawText?: string; details?: unknown } };

const client = new BedrockRuntimeClient({});

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function isIsoDateString(value: string): boolean {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) && value.includes('T');
}

function validatePredictionShape(input: unknown): { ok: true; value: ExpiryPrediction } | { ok: false; details: unknown } {
  if (!input || typeof input !== 'object') return { ok: false, details: 'not an object' };
  const obj = input as any;

  const expiryTimestamp = obj.expiryTimestamp;
  const modelConfidence = obj.modelConfidence;
  const explanation = obj.explanation;

  const errors: string[] = [];

  if (typeof expiryTimestamp !== 'string' || !isIsoDateString(expiryTimestamp)) {
    errors.push('expiryTimestamp must be an ISO 8601 string');
  }
  if (typeof modelConfidence !== 'number' || !Number.isFinite(modelConfidence) || modelConfidence < 0 || modelConfidence > 100) {
    errors.push('modelConfidence must be a number between 0 and 100');
  }
  if (typeof explanation !== 'string' || explanation.trim().length === 0) {
    errors.push('explanation must be a non-empty string');
  }

  if (errors.length) return { ok: false, details: errors };
  return { ok: true, value: { expiryTimestamp, modelConfidence, explanation } };
}

export async function predictExpiry(params: {
  modelId: string;
  foodType: string;
  storageCondition?: string;
  preparationTime?: string;
  currentTemperatureC?: number;
}): Promise<BedrockPredictionResult> {
  const { modelId, foodType, storageCondition, preparationTime, currentTemperatureC } = params;

  const system = `You are Anna Suraksha, a food-safety assistant.
You must output ONLY a single JSON object (no markdown, no prose).

  Output schema (strict):
{
  "expiryTimestamp": "<ISO 8601 timestamp in UTC>",
  "modelConfidence": <number 0-100>,
  "explanation": "<one short sentence>"
}

Rules:
- expiryTimestamp must be a valid ISO 8601 timestamp.
- Use conservative assumptions if data is missing.
- If the food is likely unsafe now, set expiryTimestamp to the current time (UTC) and explain.
`;

  const userText = `Inputs:
foodType: ${foodType}
storageCondition: ${storageCondition ?? 'unknown'}
preparationTime: ${preparationTime ?? 'unknown'}
currentTemperatureC: ${currentTemperatureC ?? 'unknown'}
`;

  const prompt = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 300,
    temperature: 0,
    system,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: userText }],
      },
    ],
  };

  let raw = '';
  try {
    const resp = await client.send(
      new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: new TextEncoder().encode(JSON.stringify(prompt)),
      })
    );
    raw = new TextDecoder().decode(resp.body);
  } catch (e) {
    return {
      ok: false,
      error: {
        message: 'Bedrock invoke failed',
        details: e instanceof Error ? { name: e.name, message: e.message } : e,
      },
    };
  }

  const parsed = safeJsonParse<any>(raw);

  // Bedrock responses sometimes wrap content; attempt to unwrap.
  const text =
    (parsed?.content?.[0]?.text as string | undefined) ??
    (parsed?.output_text as string | undefined) ??
    raw;

  const json = safeJsonParse<unknown>(text);
  if (!json) {
    return {
      ok: false,
      error: {
        message: 'Model output was not valid JSON',
        rawText: text,
      },
    };
  }

  const validated = validatePredictionShape(json);
  if (!validated.ok) {
    return {
      ok: false,
      error: {
        message: 'Model JSON failed schema validation',
        rawText: text,
        details: validated.details,
      },
    };
  }

  return { ok: true, value: validated.value, rawText: text };
}
