// Identifiable, contactable marker on all assessment + verification traffic so a
// target operator can attribute and, if needed, block the activity. (§5B "no evasion")
export const USER_AGENT =
  "BreachSentinel-Assessment/1.0 (+authorized non-destructive scan; contact: security-ops)";

export const DNS_CHALLENGE_PREFIX = "_breachsentinel-challenge";
export const HTTP_CHALLENGE_PATH = "/.well-known/breachsentinel-challenge";

export const DEFAULT_AUTH_TTL_DAYS = 30;

export type Intensity = "passive" | "baseline" | "thorough";
export const INTENSITY_RANK: Record<Intensity, number> = {
  passive: 1,
  baseline: 2,
  thorough: 3,
};
