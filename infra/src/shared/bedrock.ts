import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

export type ExpiryPrediction = {
  expiryAtIso: string;
  confidence: number;
  explanation: string;
};

const client = new BedrockRuntimeClient({});

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function predictExpiry(params: {
  modelId: string;
  foodType: string;
  storageCondition?: string;
  preparationTime?: string;
  currentTemperatureC?: number;
}): Promise<ExpiryPrediction> {
  const { modelId, foodType, storageCondition, preparationTime, currentTemperatureC } = params;

  const system = `You are Anna Suraksha, a food-safety assistant.
You must output ONLY a single JSON object (no markdown, no prose).

Output schema (strict):
{
  "expiryAtIso": "<ISO 8601 timestamp in UTC>",
  "confidence": <number between 0 and 1>,
  "explanation": "<one short sentence>"
}

Rules:
- expiryAtIso must be a valid ISO 8601 timestamp.
- Use conservative assumptions if data is missing.
- If the food is likely unsafe now, set expiryAtIso to the current time (UTC) and explain.
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

  const resp = await client.send(
    new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: new TextEncoder().encode(JSON.stringify(prompt)),
    })
  );

  const raw = new TextDecoder().decode(resp.body);
  const parsed = safeJsonParse<any>(raw);

  // Bedrock responses sometimes wrap content; attempt to unwrap.
  const text =
    (parsed?.content?.[0]?.text as string | undefined) ??
    (parsed?.output_text as string | undefined) ??
    raw;

  const json = safeJsonParse<{
    expiryAtIso: string;
    confidence: number;
    explanation: string;
  }>(text);

  if (!json?.expiryAtIso) {
    // Fallback: 24h conservative if parsing fails.
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    return {
      expiryAtIso: expiry,
      confidence: 0.4,
      explanation: 'Fallback expiry used due to model output parsing issue.',
    };
  }

  return {
    expiryAtIso: json.expiryAtIso,
    confidence: Math.max(0, Math.min(1, Number(json.confidence ?? 0.5))),
    explanation: String(json.explanation ?? ''),
  };
}
