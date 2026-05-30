import OpenAI from "openai";

// Requesty router (OpenAI-compatible). Lazy so the worker/UI boot without a key.
let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.REQUESTY_API_KEY,
      baseURL: process.env.REQUESTY_BASE_URL ?? "https://router.requesty.ai/v1",
    });
  }
  return _client;
}

export function hasLLM(): boolean {
  return !!process.env.REQUESTY_API_KEY;
}

const DEFAULT_MODEL = process.env.LLM_MODEL ?? "openai/gpt-4o-mini";

// Single-shot JSON completion. Returns parsed object of type T.
// Throws if no key is configured or the model returns non-JSON.
export async function callJSON<T = unknown>(
  system: string,
  user: string,
  opts: { model?: string; temperature?: number } = {}
): Promise<T> {
  if (!hasLLM()) throw new Error("LLM not configured (REQUESTY_API_KEY missing)");
  const res = await getClient().chat.completions.create({
    model: opts.model ?? DEFAULT_MODEL,
    temperature: opts.temperature ?? 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  const text = res.choices[0]?.message?.content ?? "{}";
  return JSON.parse(text) as T;
}

// Free-text chat completion (no JSON forcing). Used by the intake chatbot.
export interface ChatMsg {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function callText(
  system: string,
  messages: ChatMsg[],
  opts: { model?: string; temperature?: number } = {}
): Promise<string> {
  if (!hasLLM()) throw new Error("LLM not configured (REQUESTY_API_KEY missing)");
  const res = await getClient().chat.completions.create({
    model: opts.model ?? DEFAULT_MODEL,
    temperature: opts.temperature ?? 0.5,
    messages: [{ role: "system", content: system }, ...messages],
  });
  return res.choices[0]?.message?.content?.trim() ?? "";
}
