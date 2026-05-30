import { NextResponse, type NextRequest } from "next/server";
import { requireUser, unauthorized, bad } from "@/lib/api";
import { createApiKey, listApiKeys, revokeApiKey } from "@/src/db/api-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  return NextResponse.json({
    object: "list",
    data: listApiKeys().map((k) => ({
      id: k.id,
      label: k.label,
      prefix: k.prefix,
      scopes: k.scopes.split(",").filter(Boolean),
      created_at: k.created_at,
      last_used_at: k.last_used_at,
      revoked_at: k.revoked_at,
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return unauthorized();
  let body: { label?: string; scopes?: string[] } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("invalid_json");
  }
  if (!body.label || typeof body.label !== "string") return bad("label_required");
  const { row, token } = createApiKey({
    label: body.label,
    createdBy: user.email,
    scopes: body.scopes,
  });
  return NextResponse.json({
    id: row.id,
    label: row.label,
    prefix: row.prefix,
    scopes: row.scopes.split(",").filter(Boolean),
    created_at: row.created_at,
    token,
    notice: "Store this token securely — it will not be shown again.",
  });
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return bad("missing_id");
  return NextResponse.json({ ok: revokeApiKey(id) });
}
