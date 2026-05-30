import { requireUser, unauthorized, ok } from "@/lib/api";
import {
  setAuthProvider,
  setBaseUrl,
  maskedSettings,
  type AuthProviderId,
} from "@/src/services/settings";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const b = await req.json().catch(() => ({}));
  if (typeof b.baseUrl === "string" && b.baseUrl) setBaseUrl(b.baseUrl);
  const id = b.id as AuthProviderId;
  if (id && ["google", "x"].includes(id)) {
    setAuthProvider(id, {
      clientId: typeof b.clientId === "string" ? b.clientId : undefined,
      clientSecret: typeof b.clientSecret === "string" ? b.clientSecret : undefined,
    });
  }
  return ok(maskedSettings());
}
