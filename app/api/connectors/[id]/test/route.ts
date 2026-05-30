import { requireUser, unauthorized, ok } from "@/lib/api";
import { testConnector } from "@/src/connectors/dispatch";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const { id } = await params;
  const result = await testConnector(id);
  return ok({ result });
}
