import {
  listEnabledSystems,
  untriagedFindings,
  markFindingTriaged,
  insertAlert,
  startRun,
  finishRun,
  SEVERITY_RANK,
} from "../db/repo";
import type { FindingRow, SystemRow } from "../db/index";
import { getSettings } from "../services/settings";
import { hasLLM, callJSON } from "../llm";
import { severityFromCvss } from "./collector";
import { notifyAlert } from "./notifier";

function searchText(f: FindingRow): string {
  return [f.title, f.summary, f.vendor, f.product, f.external_id]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function parseKeywords(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
}

// Which monitored systems does this finding plausibly affect?
function matchSystems(f: FindingRow, systems: SystemRow[]): SystemRow[] {
  const text = searchText(f);
  return systems.filter((s) =>
    parseKeywords(s.keywords).some((kw) => text.includes(kw))
  );
}

function baseSeverity(f: FindingRow): string {
  return f.raw_severity || severityFromCvss(f.cvss) || "medium";
}

interface LlmTriage {
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  affected_apis: string[];
  recommendation: string;
}

const TRIAGE_SYS = `You are a security triage analyst for an enterprise monitoring platform.
Given a vulnerability/advisory and the monitored system it may affect, assess impact.
Return JSON: {"severity":"low|medium|high|critical","confidence":0-1,"affected_apis":["..."],"recommendation":"one sentence remediation"}.
Be precise. affected_apis = enterprise API surfaces/endpoints/components at risk (empty array if unclear).`;

async function llmTriage(f: FindingRow, system: SystemRow | null): Promise<LlmTriage> {
  const user = JSON.stringify({
    finding: {
      title: f.title,
      summary: f.summary,
      vendor: f.vendor,
      product: f.product,
      cvss: f.cvss,
      raw_severity: f.raw_severity,
    },
    monitored_system: system
      ? { name: system.name, vendor: system.vendor, keywords: system.keywords }
      : null,
  });
  return callJSON<LlmTriage>(TRIAGE_SYS, user);
}

// Heuristic fallback when no LLM key is configured.
function heuristicTriage(f: FindingRow, system: SystemRow | null): LlmTriage {
  const sev = baseSeverity(f) as LlmTriage["severity"];
  const apis: string[] = [];
  if (f.product) apis.push(f.product);
  if (system?.vendor) apis.push(`${system.vendor} API`);
  return {
    severity: sev,
    confidence: system ? 0.6 : 0.4,
    affected_apis: apis,
    recommendation: f.url
      ? "Review the advisory and apply vendor patches/mitigations."
      : "Investigate and confirm exposure across affected components.",
  };
}

export async function runTriage(): Promise<{ alerts: number; processed: number }> {
  const runId = startRun("triage");
  const systems = listEnabledSystems();
  const findings = untriagedFindings(40);
  const globalThreshold = getSettings().alerting.defaultSeverityThreshold;
  const useLlm = hasLLM();

  let alertsCreated = 0;
  for (const f of findings) {
    try {
      const matched = matchSystems(f, systems);
      // Decide which (system, threshold) pairs warrant an alert.
      const targets: Array<{ system: SystemRow | null; threshold: string }> =
        matched.length
          ? matched.map((s) => ({ system: s, threshold: s.severity_threshold }))
          : [{ system: null, threshold: globalThreshold }];

      for (const t of targets) {
        const triage = useLlm
          ? await llmTriage(f, t.system).catch(() => heuristicTriage(f, t.system))
          : heuristicTriage(f, t.system);

        // Only alert when severity meets the target's threshold.
        if (SEVERITY_RANK[triage.severity] < SEVERITY_RANK[t.threshold]) continue;
        // Unmatched findings only alert at high/critical to avoid noise.
        if (!t.system && SEVERITY_RANK[triage.severity] < SEVERITY_RANK.high) continue;

        const alert = insertAlert({
          findingId: f.id,
          systemId: t.system?.id ?? null,
          severity: triage.severity,
          confidence: triage.confidence,
          title: t.system ? `${t.system.name}: ${f.title}` : f.title,
          summary: f.summary,
          recommendation: triage.recommendation,
          affectedApis: triage.affected_apis?.length
            ? JSON.stringify(triage.affected_apis)
            : null,
          triageMethod: useLlm ? "llm" : "heuristic",
        });
        await notifyAlert(alert);
        alertsCreated++;
      }
    } finally {
      markFindingTriaged(f.id);
    }
  }

  finishRun(runId, "ok", findings.length, alertsCreated, useLlm ? "llm" : "heuristic");
  return { alerts: alertsCreated, processed: findings.length };
}
