// Legacy alias for /api/v1/subscriptions — kept so older clients keep working.
import * as subs from "../subscriptions/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = subs.GET;
export const POST = subs.POST;
export const DELETE = subs.DELETE;
