import { requireUser, unauthorized, ok, bad } from "@/lib/api";
import { listSources, createSource } from "@/src/db/repo";

export const dynamic = "force-dynamic";

const KINDS = ["kev", "nvd", "rss"];

export async function GET() {
  const u = await requireUser();
  if (!u) return unauthorized();
  return ok({ sources: listSources() });
}

export async function POST(req: Request) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const b = await req.json().catch(() => ({}));
  if (!b.name || !b.url) return bad("name and url required");
  if (!KINDS.includes(b.kind)) return bad("kind must be kev, nvd, or rss");
  const row = createSource({ name: b.name, kind: b.kind, url: b.url });
  return ok({ source: row });
}
