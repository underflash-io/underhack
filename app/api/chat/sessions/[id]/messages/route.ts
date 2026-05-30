import { requireUser, unauthorized, ok, bad } from "@/lib/api";
import { handleUserMessage } from "@/src/chat/intake";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const text = String(b.content ?? "").trim();
  if (!text) return bad("content required");
  const r = await handleUserMessage(id, text);
  return ok(r);
}
