import { requireUser, unauthorized, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await requireUser();
  if (!u) return unauthorized();
  return ok({ user: u });
}
