import { createHash } from "crypto";
import Parser from "rss-parser";
import {
  listEnabledSources,
  insertFinding,
  markSourcePolled,
  startRun,
  finishRun,
} from "../db/repo";
import type { SourceRow } from "../db/index";

const rss = new Parser({
  timeout: 15_000,
  headers: { "User-Agent": "underhack-secmon/1.0" },
});

function hashOf(...parts: (string | null | undefined)[]): string {
  return createHash("sha256").update(parts.filter(Boolean).join("|")).digest("hex");
}

export function severityFromCvss(score: number | null | undefined): string | null {
  if (score == null) return null;
  if (score >= 9) return "critical";
  if (score >= 7) return "high";
  if (score >= 4) return "medium";
  return "low";
}

interface CollectResult {
  source: string;
  fetched: number;
  inserted: number;
  error?: string;
}

// CISA Known Exploited Vulnerabilities catalog (JSON).
async function collectKev(src: SourceRow): Promise<number> {
  const res = await fetch(src.url, { headers: { "User-Agent": "underhack-secmon/1.0" } });
  if (!res.ok) throw new Error(`KEV HTTP ${res.status}`);
  const data = (await res.json()) as {
    vulnerabilities?: Array<{
      cveID: string;
      vendorProject?: string;
      product?: string;
      vulnerabilityName?: string;
      shortDescription?: string;
      dateAdded?: string;
    }>;
  };
  let inserted = 0;
  for (const v of data.vulnerabilities ?? []) {
    const url = `https://nvd.nist.gov/vuln/detail/${v.cveID}`;
    const row = insertFinding({
      sourceId: src.id,
      externalId: v.cveID,
      title: v.vulnerabilityName || v.cveID,
      summary: v.shortDescription ?? null,
      url,
      vendor: v.vendorProject ?? null,
      product: v.product ?? null,
      cvss: null,
      rawSeverity: "high", // KEV = actively exploited; treat as high baseline
      publishedAt: v.dateAdded ?? null,
      hash: hashOf("kev", v.cveID),
    });
    if (row) inserted++;
  }
  return inserted;
}

// NVD CVE API 2.0 (recently published/modified CVEs).
async function collectNvd(src: SourceRow): Promise<number> {
  const res = await fetch(src.url, { headers: { "User-Agent": "underhack-secmon/1.0" } });
  if (!res.ok) throw new Error(`NVD HTTP ${res.status}`);
  const data = (await res.json()) as {
    vulnerabilities?: Array<{
      cve: {
        id: string;
        published?: string;
        descriptions?: Array<{ lang: string; value: string }>;
        metrics?: {
          cvssMetricV31?: Array<{ cvssData?: { baseScore?: number } }>;
          cvssMetricV30?: Array<{ cvssData?: { baseScore?: number } }>;
        };
      };
    }>;
  };
  let inserted = 0;
  for (const item of data.vulnerabilities ?? []) {
    const cve = item.cve;
    const desc = cve.descriptions?.find((d) => d.lang === "en")?.value ?? null;
    const score =
      cve.metrics?.cvssMetricV31?.[0]?.cvssData?.baseScore ??
      cve.metrics?.cvssMetricV30?.[0]?.cvssData?.baseScore ??
      null;
    const row = insertFinding({
      sourceId: src.id,
      externalId: cve.id,
      title: cve.id,
      summary: desc,
      url: `https://nvd.nist.gov/vuln/detail/${cve.id}`,
      cvss: score,
      rawSeverity: severityFromCvss(score),
      publishedAt: cve.published ?? null,
      hash: hashOf("nvd", cve.id),
    });
    if (row) inserted++;
  }
  return inserted;
}

// Generic security advisory RSS feed.
async function collectRss(src: SourceRow): Promise<number> {
  const feed = await rss.parseURL(src.url);
  let inserted = 0;
  for (const item of feed.items ?? []) {
    const url = item.link ?? null;
    const title = item.title ?? "(untitled)";
    const row = insertFinding({
      sourceId: src.id,
      title,
      summary: (item.contentSnippet ?? item.content ?? "").slice(0, 500) || null,
      url,
      publishedAt: item.isoDate ?? item.pubDate ?? null,
      hash: hashOf("rss", url ?? title),
    });
    if (row) inserted++;
  }
  return inserted;
}

async function collectOne(src: SourceRow): Promise<CollectResult> {
  try {
    let inserted = 0;
    if (src.kind === "kev") inserted = await collectKev(src);
    else if (src.kind === "nvd") inserted = await collectNvd(src);
    else inserted = await collectRss(src);
    markSourcePolled(src.id, `ok (+${inserted})`);
    return { source: src.name, fetched: 1, inserted };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    markSourcePolled(src.id, `error: ${msg}`);
    return { source: src.name, fetched: 0, inserted: 0, error: msg };
  }
}

// Run the collector across all enabled sources. Resilient per-source.
export async function runCollector(): Promise<{ inserted: number; results: CollectResult[] }> {
  const runId = startRun("collector");
  const sources = listEnabledSources();
  const results: CollectResult[] = [];
  let inserted = 0;
  for (const src of sources) {
    const r = await collectOne(src);
    results.push(r);
    inserted += r.inserted;
  }
  const errors = results.filter((r) => r.error).length;
  finishRun(
    runId,
    errors === sources.length && sources.length > 0 ? "error" : "ok",
    sources.length,
    inserted,
    errors ? `${errors} source error(s)` : undefined
  );
  return { inserted, results };
}
