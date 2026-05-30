import { requireUser, unauthorized, ok, bad } from "@/lib/api";
import { getSession, listMessages, deleteSession } from "@/src/chat/repo";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const { id } = await params;
  const s = getSession(id);
  if (!s) return bad("not found", 404);
  return ok({ session: s, messages: listMessages(id) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const { id } = await params;
  deleteSession(id);
  return ok({ ok: true });
}
