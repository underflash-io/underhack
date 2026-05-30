// Public watchlist (a.k.a. monitored systems). Each entry tells the worker
// which products/keywords to watch in incoming feeds. Read with
// 'watchlist:read', mutate with 'watchlist:write'.

import { type NextRequest } from "next/server";
import { authenticate, errors, listResponse, objectResponse } from "@/lib/api-v1";
import { createSystem, deleteSystem, listSystems, updateSystem } from "@/src/db/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Entry = {
  id: string;
  name: string;
  vendor: string | null;
  keywords: string[];
  criticality: string;
  enabled: boolean;
  created_at: string;
};

function toEntry(row: Awaited<ReturnType<typeof listSystems>>[number]): Entry {
  return {
    id: row.id,
    name: row.name,
    vendor: row.vendor,
    keywords: (row.keywords || "")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean),
    criticality: row.criticality,
    enabled: !!row.enabled,
    created_at: new Date(row.created_at).toISOString(),
  };
}

export function GET(req: NextRequest) {
  const auth = authenticate(req, "watchlist:read");
  if (!auth.ok) return auth.response;
  const rows = listSystems().map(toEntry);
  return listResponse(rows, null);
}

export async function POST(req: NextRequest) {
  const auth = authenticate(req, "watchlist:write");
  if (!auth.ok) return auth.response;

  type Body = {
    name?: string;
    vendor?: string;
    keywords?: string[];
    criticality?: "low" | "medium" | "high" | "critical";
  };
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return errors.badRequest("Body must be JSON");
  }
  if (!body.name) return errors.badRequest("Field 'name' is required");
  const crit = body.criticality ?? "medium";
  const valid = ["low", "medium", "high", "critical"] as const;
  if (!valid.includes(crit)) return errors.badRequest("Invalid criticality");
  const keywords = Array.isArray(body.keywords) ? body.keywords.join(",") : "";

  const row = createSystem({
    name: body.name,
    vendor: body.vendor ?? undefined,
    keywords,
    criticality: crit,
    severityThreshold: "medium",
  });
  return objectResponse(toEntry(row), { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = authenticate(req, "watchlist:write");
  if (!auth.ok) return auth.response;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return errors.badRequest("Query param 'id' is required");
  const existing = listSystems().find((s) => s.id === id);
  if (!existing) return errors.notFound(`No watchlist entry with id ${id}`);
  deleteSystem(id);
  return new Response(null, { status: 204 });
}

export async function PATCH(req: NextRequest) {
  const auth = authenticate(req, "watchlist:write");
  if (!auth.ok) return auth.response;

  type Body = {
    id?: string;
    name?: string;
    vendor?: string;
    keywords?: string[];
    criticality?: "low" | "medium" | "high" | "critical";
    enabled?: boolean;
  };
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return errors.badRequest("Body must be JSON");
  }
  if (!body.id) return errors.badRequest("Field 'id' is required");
  const current = listSystems().find((s) => s.id === body.id);
  if (!current) return errors.notFound(`No watchlist entry with id ${body.id}`);

  updateSystem(body.id, {
    name: body.name ?? current.name,
    vendor: body.vendor ?? current.vendor ?? undefined,
    keywords:
      body.keywords !== undefined
        ? body.keywords.join(",")
        : current.keywords,
    criticality: body.criticality ?? current.criticality,
    enabled: body.enabled ?? !!current.enabled,
  });
  const refreshed = listSystems().find((s) => s.id === body.id)!;
  return objectResponse(toEntry(refreshed));
}
