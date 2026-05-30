import { requireUser, unauthorized, ok } from "@/lib/api";
import { listSessions } from "@/src/chat/repo";
import { newSession, ensureGreeting } from "@/src/chat/intake";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await requireUser();
  if (!u) return unauthorized();
  return ok({ sessions: listSessions(30) });
}

export async function POST(req: Request) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const b = await req.json().catch(() => ({}));
  const s = newSession({ title: b.title, createdBy: u.email });
  await ensureGreeting(s.id);
  return ok({ session: s });
}
