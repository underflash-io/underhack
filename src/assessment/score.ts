export type FindingSeverity = "info" | "low" | "medium" | "high" | "critical";

const BASE: Record<FindingSeverity, number> = {
  info: 5,
  low: 22,
  medium: 50,
  high: 74,
  critical: 90,
};

function levelFor(score: number): FindingSeverity {
  if (score >= 85) return "critical";
  if (score >= 65) return "high";
  if (score >= 40) return "medium";
  if (score >= 15) return "low";
  return "info";
}

// Explainable scorer: every finding stores its contributing factors so a
// consumer can audit WHY the number was assigned. (§4.5)
export function scoreFinding(
  hint: FindingSeverity,
  factors: string[] = []
): { severity: FindingSeverity; score: number; factors: string[] } {
  let score = BASE[hint];
  const applied = [...factors];
  if (factors.includes("kev_listed")) score += 12;
  if (factors.includes("related_cve")) score += 6;
  if (factors.includes("expired")) score += 8;
  if (factors.includes("exposed_secret_path")) score += 10;
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { severity: levelFor(score), score, factors: applied };
}
