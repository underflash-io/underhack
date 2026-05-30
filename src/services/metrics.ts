// User-facing security metrics. Single source of truth (spec 04 §8).
// Surfaces from /api/v1/metrics and the /insights page must call this — never
// query the DB directly — so display and API never diverge.

import { getDb } from "../db";

export type MetricsRange = "24h" | "7d" | "30d" | "90d";

const RANGE_MS: Record<MetricsRange, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
};

const BUCKET_MS: Record<MetricsRange, number> = {
  "24h": 60 * 60 * 1000, // hourly
  "7d": 24 * 60 * 60 * 1000, // daily
  "30d": 24 * 60 * 60 * 1000, // daily
  "90d": 7 * 24 * 60 * 60 * 1000, // weekly
};

const BANDS = ["critical", "high", "low", "info"] as const;
type Band = (typeof BANDS)[number];

// Internal severity → public band. Matches lib/api-v1.ts bandOut so chart
// labels stay in sync with /api/v1/alerts output.
function toBand(sev: string): Band {
  if (sev === "critical") return "critical";
  if (sev === "high") return "high";
  if (sev === "info") return "info";
  return "low";
}

export type MetricsSnapshot = {
  range: MetricsRange;
  generated_at: string;
  totals: {
    open: number;
    open_critical: number;
    open_high: number;
    new_in_range: number;
    resolved_in_range: number;
    oldest_unresolved_at: string | null;
  };
  mtta_seconds: number | null;
  mttr_seconds: number | null;
  volume: { bucket: string; band: Band; count: number }[];
  per_asset: { asset_id: string; asset_name: string; count: number }[];
  per_source: { source: string; count: number }[];
  severity_split: Record<Band, number>;
  aging: { band: Band; over_7d: number; over_14d: number; over_30d: number }[];
};

export function getMetricsSnapshot(range: MetricsRange = "30d"): MetricsSnapshot {
  const db = getDb();
  const now = Date.now();
  const since = new Date(now - RANGE_MS[range]).toISOString();
  const bucketMs = BUCKET_MS[range];

  // ---------------- totals ----------------
  const open = (db
    .prepare(`SELECT COUNT(*) AS n FROM alerts WHERE status IN ('open','ack')`)
    .get() as { n: number }).n;

  const openCrit = (db
    .prepare(
      `SELECT COUNT(*) AS n FROM alerts WHERE status IN ('open','ack') AND severity = 'critical'`,
    )
    .get() as { n: number }).n;

  const openHigh = (db
    .prepare(
      `SELECT COUNT(*) AS n FROM alerts WHERE status IN ('open','ack') AND severity = 'high'`,
    )
    .get() as { n: number }).n;

  const newInRange = (db
    .prepare(`SELECT COUNT(*) AS n FROM alerts WHERE created_at >= ?`)
    .get(since) as { n: number }).n;

  const resolvedInRange = (db
    .prepare(
      `SELECT COUNT(*) AS n FROM alerts
       WHERE status = 'resolved' AND resolved_at IS NOT NULL AND resolved_at >= ?`,
    )
    .get(since) as { n: number }).n;

  const oldest = db
    .prepare(
      `SELECT created_at FROM alerts WHERE status IN ('open','ack')
       ORDER BY created_at ASC LIMIT 1`,
    )
    .get() as { created_at: string } | undefined;

  // ---------------- MTTA / MTTR ----------------
  // Mean time to ack/resolve, averaged over alerts that landed inside the
  // range — caps recency bias on instances with months of historical data.
  const mttaRow = db
    .prepare(
      `SELECT AVG((julianday(acknowledged_at) - julianday(created_at)) * 86400) AS s
       FROM alerts
       WHERE acknowledged_at IS NOT NULL AND created_at >= ?`,
    )
    .get(since) as { s: number | null };

  const mttrRow = db
    .prepare(
      `SELECT AVG((julianday(resolved_at) - julianday(created_at)) * 86400) AS s
       FROM alerts
       WHERE resolved_at IS NOT NULL AND created_at >= ?`,
    )
    .get(since) as { s: number | null };

  // ---------------- volume by band over time ----------------
  const volumeRows = db
    .prepare(
      `SELECT severity, created_at FROM alerts WHERE created_at >= ? ORDER BY created_at`,
    )
    .all(since) as { severity: string; created_at: string }[];

  // Pre-seed every bucket × band combination so the chart has a stable
  // x-axis even when a band is empty for the range.
  const buckets: Map<string, Map<Band, number>> = new Map();
  const startBucket = Math.floor(new Date(since).getTime() / bucketMs) * bucketMs;
  for (let t = startBucket; t <= now; t += bucketMs) {
    const key = new Date(t).toISOString();
    const m = new Map<Band, number>();
    for (const b of BANDS) m.set(b, 0);
    buckets.set(key, m);
  }
  for (const row of volumeRows) {
    const t = new Date(row.created_at).getTime();
    const key = new Date(Math.floor(t / bucketMs) * bucketMs).toISOString();
    const bucket = buckets.get(key);
    if (!bucket) continue;
    const band = toBand(row.severity);
    bucket.set(band, (bucket.get(band) ?? 0) + 1);
  }
  const volume: MetricsSnapshot["volume"] = [];
  for (const [bucket, m] of buckets) {
    for (const band of BANDS) {
      volume.push({ bucket, band, count: m.get(band) ?? 0 });
    }
  }

  // ---------------- per-asset exposure ----------------
  const perAsset = db
    .prepare(
      `SELECT a.system_id AS asset_id, COALESCE(s.name, '(unassigned)') AS asset_name,
              COUNT(*) AS count
       FROM alerts a LEFT JOIN systems s ON s.id = a.system_id
       WHERE a.created_at >= ?
       GROUP BY a.system_id
       ORDER BY count DESC
       LIMIT 10`,
    )
    .all(since) as { asset_id: string | null; asset_name: string; count: number }[];

  // ---------------- per-source contribution ----------------
  const perSource = db
    .prepare(
      `SELECT COALESCE(src.name, '(unknown)') AS source, COUNT(*) AS count
       FROM alerts a
       LEFT JOIN findings f ON f.id = a.finding_id
       LEFT JOIN sources src ON src.id = f.source_id
       WHERE a.created_at >= ?
       GROUP BY src.name
       ORDER BY count DESC
       LIMIT 10`,
    )
    .all(since) as { source: string; count: number }[];

  // ---------------- severity split ----------------
  const splitRows = db
    .prepare(
      `SELECT severity, COUNT(*) AS n FROM alerts WHERE created_at >= ? GROUP BY severity`,
    )
    .all(since) as { severity: string; n: number }[];
  const severitySplit: Record<Band, number> = { critical: 0, high: 0, low: 0, info: 0 };
  for (const r of splitRows) severitySplit[toBand(r.severity)] += r.n;

  // ---------------- aging buckets (open + ack only) ----------------
  const agingRows = db
    .prepare(
      `SELECT severity,
              SUM(CASE WHEN (julianday('now') - julianday(created_at)) > 7  THEN 1 ELSE 0 END) AS over_7d,
              SUM(CASE WHEN (julianday('now') - julianday(created_at)) > 14 THEN 1 ELSE 0 END) AS over_14d,
              SUM(CASE WHEN (julianday('now') - julianday(created_at)) > 30 THEN 1 ELSE 0 END) AS over_30d
       FROM alerts
       WHERE status IN ('open','ack')
       GROUP BY severity`,
    )
    .all() as { severity: string; over_7d: number; over_14d: number; over_30d: number }[];

  const agingByBand: Record<Band, { over_7d: number; over_14d: number; over_30d: number }> = {
    critical: { over_7d: 0, over_14d: 0, over_30d: 0 },
    high: { over_7d: 0, over_14d: 0, over_30d: 0 },
    low: { over_7d: 0, over_14d: 0, over_30d: 0 },
    info: { over_7d: 0, over_14d: 0, over_30d: 0 },
  };
  for (const r of agingRows) {
    const b = toBand(r.severity);
    agingByBand[b].over_7d += r.over_7d ?? 0;
    agingByBand[b].over_14d += r.over_14d ?? 0;
    agingByBand[b].over_30d += r.over_30d ?? 0;
  }
  const aging = BANDS.map((b) => ({ band: b, ...agingByBand[b] }));

  return {
    range,
    generated_at: new Date().toISOString(),
    totals: {
      open,
      open_critical: openCrit,
      open_high: openHigh,
      new_in_range: newInRange,
      resolved_in_range: resolvedInRange,
      oldest_unresolved_at: oldest?.created_at ?? null,
    },
    mtta_seconds: mttaRow.s !== null ? Math.round(mttaRow.s) : null,
    mttr_seconds: mttrRow.s !== null ? Math.round(mttrRow.s) : null,
    volume,
    per_asset: perAsset.map((r) => ({
      asset_id: r.asset_id ?? "",
      asset_name: r.asset_name,
      count: r.count,
    })),
    per_source: perSource,
    severity_split: severitySplit,
    aging,
  };
}
