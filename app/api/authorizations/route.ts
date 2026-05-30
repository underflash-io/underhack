import { requireUser, unauthorized, ok, bad } from "@/lib/api";
import { createAuthorization, listAuthorizations, challengeFor } from "@/src/assessment/authz";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await requireUser();
  if (!u) return unauthorized();
  const rows = listAuthorizations().map((a) => ({ ...a, challenge: challengeFor(a) }));
  return ok({ authorizations: rows });
}

export async function POST(req: Request) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const b = await req.json().catch(() => ({}));
  const hosts = String(b.hosts ?? "")
    .split(/[\s,]+/)
    .map((s: string) => s.trim())
    .filter(Boolean);
  if (!hosts.length) return bad("at least one scope host is required");
  if (!["dns", "http"].includes(b.verifyMethod)) return bad("verifyMethod must be dns or http");
  try {
    const authz = createAuthorization({
      label: String(b.label ?? hosts[0]),
      basis: b.basis === "engagement" ? "engagement" : "ownership",
      contact: b.contact ? String(b.contact) : undefined,
      scope: {
        hosts,
        ports: Array.isArray(b.ports) ? b.ports.map(Number).filter(Boolean) : [],
        path_prefixes: Array.isArray(b.pathPrefixes) ? b.pathPrefixes.map(String) : [],
      },
      exclusions: Array.isArray(b.exclusions) ? b.exclusions.map(String) : [],
      intensityMax: ["passive", "baseline", "thorough"].includes(b.intensityMax) ? b.intensityMax : "baseline",
      verifyMethod: b.verifyMethod,
      createdBy: u.email,
    });
    return ok({ authorization: authz, challenge: challengeFor(authz) });
  } catch (err) {
    return bad((err as Error).message);
  }
}
