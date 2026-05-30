import { NextResponse } from "next/server";
import { getDb } from "@/src/db";
import pkg from "@/package.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Process boot time. Used to surface uptime_seconds so an operator can spot
// surprise restarts (process is fresh = ingestion just rebooted).
const BOOT_AT = Date.now();

type SourceHealth = {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  last_status: "ok" | "error" | "unknown";
  last_run_at: string | null;
};

export function GET() {
  try {
    const db = getDb();

    const alertCount = (db.prepare(`SELECT COUNT(*) AS n FROM alerts`).get() as { n: number }).n;

    // Sources currently configured. We don't yet track last-run per source —
    // the collector runs as a single agent over all sources — so for v1 we
    // report 'unknown' for any source we haven't proven is healthy.
    const sources = db
      .prepare(`SELECT id, name, kind, enabled FROM sources ORDER BY name`)
      .all() as { id: string; name: string; kind: string; enabled: number }[];

    // Last collector run gives us a proxy for source freshness until we
    // attribute runs per source.
    const lastCollector = db
      .prepare(
        `SELECT status, finished_at, started_at FROM agent_runs
         WHERE agent = 'collector' ORDER BY started_at DESC LIMIT 1`,
      )
      .get() as { status: string; finished_at: string | null; started_at: string } | undefined;

    const lastRunAt = lastCollector?.finished_at ?? lastCollector?.started_at ?? null;
    const lastStatus: SourceHealth["last_status"] = lastCollector
      ? lastCollector.status === "ok"
        ? "ok"
        : "error"
      : "unknown";

    const sourceHealth: SourceHealth[] = sources.map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      enabled: !!s.enabled,
      // Per-source attribution is a Phase-1 backlog item; until then mirror
      // the collector's last status for enabled sources only.
      last_status: s.enabled ? lastStatus : "unknown",
      last_run_at: s.enabled ? lastRunAt : null,
    }));

    const enabledSources = sourceHealth.filter((s) => s.enabled);
    const anyError = enabledSources.some((s) => s.last_status === "error");
    const overall = anyError ? "degraded" : "ok";

    return NextResponse.json({
      status: overall,
      version: pkg.version,
      uptime_seconds: Math.floor((Date.now() - BOOT_AT) / 1000),
      alerts_indexed: alertCount,
      sources: sourceHealth,
      ts: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { status: "down", error: (e as Error).message, ts: new Date().toISOString() },
      { status: 503 },
    );
  }
}
