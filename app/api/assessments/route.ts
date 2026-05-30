import { requireUser, unauthorized, ok, bad } from "@/lib/api";
import { getAuthorization, isUsable } from "@/src/assessment/authz";
import { isInScope } from "@/src/assessment/scope";
import { createAssessment, listAssessments } from "@/src/assessment/repo";
import { runAssessment } from "@/src/assessment/engine";
import { INTENSITY_RANK, type Intensity } from "@/src/assessment/constants";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await requireUser();
  if (!u) return unauthorized();
  return ok({ assessments: listAssessments(60) });
}

export async function POST(req: Request) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const b = await req.json().catch(() => ({}));

  const authz = getAuthorization(String(b.authorizationId ?? ""));
  if (!authz) return bad("authorization not found", 404);

  // Hard gate: only verified, unexpired, untampered authorizations. (§5A/§8)
  const usable = isUsable(authz);
  if (!usable.ok) return bad(`authorization not usable: ${usable.reason}`, 403);

  const target = String(b.target ?? "").trim();
  if (!target) return bad("target host is required");

  // The target must be inside the authorized scope.
  const sc = isInScope(`https://${target}`, authz);
  if (!sc.ok) return bad(`target out of scope: ${sc.reason}`, 403);

  const intensity = (["passive", "baseline", "thorough"].includes(b.intensity) ? b.intensity : "baseline") as Intensity;
  if (INTENSITY_RANK[intensity] > INTENSITY_RANK[authz.intensity_max as Intensity]) {
    return bad(`intensity '${intensity}' exceeds authorized max '${authz.intensity_max}'`, 403);
  }
  // Thorough tier requires explicit per-run operator opt-in. (§5B production caution)
  if (intensity === "thorough" && b.confirm !== true) {
    return bad("thorough-tier runs require explicit confirmation (confirm: true)", 412);
  }

  const job = createAssessment({
    authorizationId: authz.id,
    target,
    intensity,
    createdBy: u.email,
  });

  // Fire-and-forget on the long-running server; the UI polls job status.
  runAssessment(job.id).catch((err) => console.error("assessment failed:", err));

  return ok({ assessment: job });
}
