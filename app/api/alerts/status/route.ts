import { requireUser, unauthorized, ok, bad } from "@/lib/api";
import { setAlertStatus } from "@/src/db/repo";

export const dynamic = "force-dynamic";

const VALID = ["open", "ack", "resolved", "dismissed"];

export async function POST(req: Request) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const b = await req.json().catch(() => ({}));
  if (!b.id || !VALID.includes(b.status)) return bad("id and valid status required");
  setAlertStatus(b.id, b.status);
  return ok({ ok: true });
}
