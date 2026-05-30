import { requireUser, unauthorized, ok, bad } from "@/lib/api";
import { extractSuggestions } from "@/src/chat/intake";
import { createSystem } from "@/src/db/repo";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET: derive suggestions from the conversation.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const { id } = await params;
  const suggestions = await extractSuggestions(id);
  return ok({ suggestions });
}

// POST: apply a single suggestion as a real Monitored System.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (!u) return unauthorized();
  await params; // session id (unused for the create — we just need auth + body)
  const b = await req.json().catch(() => ({}));
  if (!b.name || !b.keywords) return bad("name and keywords required");
  const sys = createSystem({
    name: String(b.name),
    vendor: b.vendor ? String(b.vendor) : undefined,
    keywords: Array.isArray(b.keywords) ? b.keywords.join(",") : String(b.keywords),
    criticality: ["low", "medium", "high"].includes(b.criticality) ? b.criticality : "medium",
    severityThreshold: ["low", "medium", "high", "critical"].includes(b.severityThreshold)
      ? b.severityThreshold
      : "high",
  });
  return ok({ system: sys });
}
