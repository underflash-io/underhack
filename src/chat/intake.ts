import { callText, callJSON, hasLLM, type ChatMsg } from "../llm";
import { MAJOR_BREACHES, type MajorBreach } from "./breaches";
import {
  addMessage,
  createSession,
  getSession,
  listMessages,
  touchSession,
} from "./repo";
import type { ChatSessionRow } from "../db/index";

const SYSTEM_PROMPT = `You are BreachSentinel's intake assistant. Your job is to quickly learn what enterprise systems the operator runs so the platform can monitor breaches and CVEs that matter to them.

Walk the operator through some of the most consequential publicly disclosed incidents from the last decade. For each, ask a short, plain question like "Do you run X?" or "Are any of these in your stack?". Group related ones. Keep replies short (1–3 sentences) and ask exactly ONE thing at a time.

Reference these major incidents (use freely — pick relevance to the conversation; you do NOT have to cover all):
${MAJOR_BREACHES.map((b) => `- ${b.name} (${b.year}, ${b.vendor}${b.cve ? ", " + b.cve : ""}) — ${b.summary}`).join("\n")}

When the operator confirms a system, restate the keywords you'll use to track it. After 6–8 exchanges, propose a summary and stop asking. NEVER invent breaches that aren't in the list above. Don't lecture; sound like a quick, practical security partner.`;

const SUGGEST_SYS = `From the conversation, extract enterprise systems the operator confirmed using (or showed concern about). Return JSON: {"suggestions":[{"name":"...", "vendor":"...", "keywords":["..."], "criticality":"low|medium|high", "severityThreshold":"low|medium|high|critical", "rationale":"why this matters"}]}. Only include items the operator actually confirmed. Empty array is fine.`;

function buildGreeting(): string {
  return [
    "Hi — I'm the BreachSentinel intake assistant.",
    "I'll ask a few short questions about your stack so we can track breaches that actually matter to you.",
    "First: do you run any Microsoft on-prem services (Exchange, Active Directory, SharePoint)?",
  ].join("\n\n");
}

// Heuristic deterministic walkthrough when no LLM is configured.
function heuristicReply(session: ChatSessionRow, userText: string): { reply: string; metaPatch: Record<string, unknown>; done: boolean } {
  const meta = JSON.parse(session.meta ?? "{}") as { index?: number; answers?: Record<string, boolean> };
  const idx = meta.index ?? 0;
  const answers = meta.answers ?? {};
  const yes = /\b(yes|yeah|yep|y|use|using|run|deploy|have|deployed|affected)\b/i.test(userText) && !/\b(no|not|never|don.?t)\b/i.test(userText);
  // Record answer for the breach we just asked about
  if (idx > 0 && idx <= MAJOR_BREACHES.length) {
    answers[MAJOR_BREACHES[idx - 1].key] = yes;
  }
  if (idx >= MAJOR_BREACHES.length) {
    const usedKeys = Object.entries(answers).filter(([, v]) => v).map(([k]) => k);
    const used = MAJOR_BREACHES.filter((b) => usedKeys.includes(b.key));
    const summary = used.length
      ? `Got it. I'll suggest monitored systems for:\n${used.map((b) => `- ${b.vendor} (${b.monitor_keywords.slice(0, 3).join(", ")})`).join("\n")}\n\nClick "Apply suggestions" to add them.`
      : "Got it — nothing flagged for now. You can come back any time as your stack grows.";
    return { reply: summary, metaPatch: { index: idx + 1, answers, done: true }, done: true };
  }
  const next = MAJOR_BREACHES[idx];
  const reply = `Do you use or run anything from **${next.vendor}** (e.g., ${next.monitor_keywords.slice(0, 3).join(", ")})? — relevant because of *${next.name}* (${next.year}).`;
  return { reply, metaPatch: { index: idx + 1, answers }, done: false };
}

export async function ensureGreeting(sessionId: string): Promise<void> {
  const msgs = listMessages(sessionId);
  if (msgs.length > 0) return;
  const session = getSession(sessionId);
  if (!session) return;
  const text = hasLLM()
    ? await callText(SYSTEM_PROMPT, [{ role: "user", content: "Please start by introducing yourself and asking your first question." }]).catch(buildGreeting)
    : buildGreeting();
  addMessage({ sessionId, role: "assistant", content: text });
  if (!hasLLM()) touchSession(sessionId, { index: 1 });
}

export async function handleUserMessage(
  sessionId: string,
  userContent: string
): Promise<{ reply: string; done: boolean }> {
  const session = getSession(sessionId);
  if (!session) throw new Error("session not found");
  addMessage({ sessionId, role: "user", content: userContent });

  if (!hasLLM()) {
    const { reply, metaPatch, done } = heuristicReply(session, userContent);
    addMessage({ sessionId, role: "assistant", content: reply });
    touchSession(sessionId, metaPatch);
    return { reply, done };
  }

  const history = listMessages(sessionId).map<ChatMsg>((m) => ({
    role: m.role === "system" ? "system" : m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));
  let reply: string;
  try {
    reply = await callText(SYSTEM_PROMPT, history);
  } catch {
    reply = "I'm having trouble reaching the model right now — could you try again?";
  }
  addMessage({ sessionId, role: "assistant", content: reply });
  touchSession(sessionId);
  return { reply, done: false };
}

export interface Suggestion {
  name: string;
  vendor?: string;
  keywords: string[];
  criticality?: "low" | "medium" | "high";
  severityThreshold?: "low" | "medium" | "high" | "critical";
  rationale?: string;
}

// Extract structured Systems suggestions from the conversation. Uses the LLM
// when available; otherwise reads the heuristic-walkthrough answers.
export async function extractSuggestions(sessionId: string): Promise<Suggestion[]> {
  const session = getSession(sessionId);
  if (!session) return [];

  if (!hasLLM()) {
    const meta = JSON.parse(session.meta ?? "{}") as { answers?: Record<string, boolean> };
    const ans = meta.answers ?? {};
    const out: Suggestion[] = [];
    const used = new Set<string>();
    for (const b of MAJOR_BREACHES) {
      if (!ans[b.key]) continue;
      if (used.has(b.vendor)) continue; // dedupe by vendor
      used.add(b.vendor);
      out.push({
        name: b.vendor,
        vendor: b.vendor,
        keywords: b.monitor_keywords,
        criticality: "medium",
        severityThreshold: "high",
        rationale: `Mentioned in conversation (re: ${b.name})`,
      });
    }
    touchSession(sessionId, { suggestions: out });
    return out;
  }

  const history = listMessages(sessionId).map<ChatMsg>((m) => ({
    role: m.role === "system" ? "system" : m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));
  if (history.length < 2) return [];
  try {
    const data = await callJSON<{ suggestions: Suggestion[] }>(
      SUGGEST_SYS,
      JSON.stringify(history)
    );
    const out = Array.isArray(data?.suggestions) ? data.suggestions.filter((s) => s.name && s.keywords?.length) : [];
    touchSession(sessionId, { suggestions: out });
    return out;
  } catch {
    return [];
  }
}

export function newSession(input: { title?: string; createdBy?: string }) {
  return createSession(input);
}
