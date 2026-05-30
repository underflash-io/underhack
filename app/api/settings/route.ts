import { requireUser, unauthorized, ok } from "@/lib/api";
import { maskedSettings } from "@/src/services/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await requireUser();
  if (!u) return unauthorized();
  return ok(maskedSettings());
}
