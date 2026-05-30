import { requireUser, unauthorized, ok, bad } from "@/lib/api";
import { listConnectors, createConnector, toPublic } from "@/src/connectors/repo";

export const dynamic = "force-dynamic";

const SEV = ["low", "medium", "high", "critical"];

export async function GET() {
  const u = await requireUser();
  if (!u) return unauthorized();
  return ok({ connectors: listConnectors().map(toPublic) });
}

export async function POST(req: Request) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const b = await req.json().catch(() => ({}));
  if (!["slack", "email"].includes(b.kind)) return bad("kind must be slack or email");
  if (!b.name || !String(b.name).trim()) return bad("name required");
  const minSeverity = SEV.includes(b.minSeverity) ? b.minSeverity : "high";

  let cfg: Record<string, unknown> = {};
  if (b.kind === "slack") {
    if (!b.config?.webhookUrl || !/^https:\/\/hooks\.slack\.com\//.test(b.config.webhookUrl)) {
      return bad("slack webhookUrl required (https://hooks.slack.com/...)");
    }
    cfg = { webhookUrl: String(b.config.webhookUrl) };
  } else {
    const c = b.config ?? {};
    if (!c.host || !c.user || !c.pass || !c.from || !c.to) {
      return bad("email config requires host, user, pass, from, to");
    }
    cfg = {
      host: String(c.host),
      port: Number(c.port) || 465,
      secure: c.secure === undefined ? true : Boolean(c.secure),
      user: String(c.user),
      pass: String(c.pass),
      from: String(c.from),
      to: String(c.to),
    };
  }

  const row = createConnector({
    kind: b.kind,
    name: String(b.name),
    config: cfg,
    minSeverity,
  });
  return ok({ connector: toPublic(row) });
}
