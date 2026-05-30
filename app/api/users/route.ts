import { requireUser, unauthorized, ok, bad } from "@/lib/api";
import { listUsers, createUser } from "@/src/services/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await requireUser();
  if (!u) return unauthorized();
  return ok({ users: listUsers() });
}

export async function POST(req: Request) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const b = await req.json().catch(() => ({}));
  if (!b.email || !String(b.email).trim()) return bad("email required");
  try {
    const user = createUser({
      email: b.email,
      password: b.password || undefined,
      xHandle: b.xHandle || undefined,
    });
    return ok({ user });
  } catch (err) {
    return bad((err as Error).message);
  }
}
