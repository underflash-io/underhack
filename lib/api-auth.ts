import type { NextRequest } from "next/server";
import { findApiKeyByToken, type ApiKeyRow } from "@/src/db/api-keys";

export function extractBearer(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export function requireApiKey(req: NextRequest): ApiKeyRow | null {
  const token = extractBearer(req);
  if (!token) return null;
  return findApiKeyByToken(token);
}
