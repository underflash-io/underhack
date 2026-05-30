import { getMetricsSnapshot, type MetricsRange } from "@/src/services/metrics";
import { currentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Insights — Underhack" };

const RANGES: { value: MetricsRange; label: string }[] = [
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

function fmtDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

function fmtRel(ts: string | null): string {
  if (!ts) return "—";
  const diff = Date.now() - new Date(ts).getTime();
  const days = diff / 86400000;
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  return `${Math.floor(days)}d ago`;
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/insights");

  const sp = await searchParams;
  const rangeParam = sp.range && RANGES.some((r) => r.value === sp.range) ? (sp.range as MetricsRange) : "30d";
  const m = getMetricsSnapshot(rangeParam);

  const totalNew = m.severity_split.critical + m.severity_split.high + m.severity_split.low + m.severity_split.info;
  const bandPct = (n: number) => (totalNew > 0 ? Math.round((n / totalNew) * 100) : 0);

  // Volume sparkline: collapse to one count per bucket (sum across bands).
  const sparkBuckets = new Map<string, number>();
  for (const v of m.volume) {
    sparkBuckets.set(v.bucket, (sparkBuckets.get(v.bucket) ?? 0) + v.count);
  }
  const sparkValues = Array.from(sparkBuckets.values());
  const sparkMax = Math.max(1, ...sparkValues);

  return (
    <main className="insights">
      <header className="page-head insights-head">
        <div>
          <p className="kicker">Insights</p>
          <h1>Posture over the last {RANGES.find((r) => r.value === rangeParam)?.label}</h1>
          <p className="muted">
            Calm view of what's open, how fast you're responding, and where the noise is coming from.
            No security score — just the numbers that matter.
          </p>
        </div>
        <div className="range-tabs" role="tablist" aria-label="Date range">
          {RANGES.map((r) => (
            <Link
              key={r.value}
              href={`/insights?range=${r.value}`}
              className={`range-tab ${r.value === rangeParam ? "active" : ""}`}
              role="tab"
              aria-selected={r.value === rangeParam}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </header>

      {/* ---------- top-line posture ---------- */}
      <section className="metric-grid">
        <MetricCard
          label="Open critical"
          value={m.totals.open_critical}
          tone={m.totals.open_critical > 0 ? "crit" : "ok"}
          help="Critical alerts still in open or ack state."
        />
        <MetricCard
          label="Open high"
          value={m.totals.open_high}
          tone={m.totals.open_high > 0 ? "high" : "ok"}
          help="High-severity alerts still in open or ack state."
        />
        <MetricCard
          label="New this period"
          value={m.totals.new_in_range}
          help={`${m.totals.resolved_in_range} resolved in the same window.`}
        />
        <MetricCard
          label="Oldest unresolved"
          value={fmtRel(m.totals.oldest_unresolved_at)}
          help={
            m.totals.oldest_unresolved_at
              ? new Date(m.totals.oldest_unresolved_at).toLocaleString()
              : "Nothing pending."
          }
        />
      </section>

      {/* ---------- response speed ---------- */}
      <section className="metric-grid response-grid">
        <MetricCard
          label="MTTA"
          value={fmtDuration(m.mtta_seconds)}
          help="Mean time to acknowledge. Tracks how fast alerts get attention."
        />
        <MetricCard
          label="MTTR"
          value={fmtDuration(m.mttr_seconds)}
          help="Mean time to resolve. Acknowledge → resolved on alerts that completed in this window."
        />
        <MetricCard
          label="Backlog"
          value={m.totals.open}
          help="Total open + acknowledged alerts right now."
        />
      </section>

      {/* ---------- volume sparkline ---------- */}
      <section className="panel insights-panel">
        <header className="panel-head">
          <h2 className="kicker">Alert volume</h2>
          <p className="muted">{m.totals.new_in_range} new across the period</p>
        </header>
        {sparkValues.length > 0 ? (
          <div className="sparkline" role="img" aria-label={`Alert volume over time, peak ${sparkMax}`}>
            {sparkValues.map((v, i) => (
              <span
                key={i}
                className="spark-bar"
                style={{ height: `${(v / sparkMax) * 100}%` }}
                title={`${v} alerts`}
              />
            ))}
          </div>
        ) : (
          <p className="muted">No alerts in this range.</p>
        )}
      </section>

      {/* ---------- severity split ---------- */}
      <section className="panel insights-panel">
        <header className="panel-head">
          <h2 className="kicker">Severity mix</h2>
          <p className="muted">Where the noise is concentrated.</p>
        </header>
        <div className="band-bars">
          <BandBar label="Critical" count={m.severity_split.critical} pct={bandPct(m.severity_split.critical)} tone="crit" />
          <BandBar label="High" count={m.severity_split.high} pct={bandPct(m.severity_split.high)} tone="high" />
          <BandBar label="Low" count={m.severity_split.low} pct={bandPct(m.severity_split.low)} tone="low" />
          <BandBar label="Info" count={m.severity_split.info} pct={bandPct(m.severity_split.info)} tone="info" />
        </div>
      </section>

      {/* ---------- per-asset + per-source side-by-side ---------- */}
      <section className="insights-cols">
        <article className="panel insights-panel">
          <header className="panel-head">
            <h2 className="kicker">Top assets by exposure</h2>
            <p className="muted">Watchlist items receiving the most alerts.</p>
          </header>
          {m.per_asset.length === 0 ? (
            <p className="muted">No matches yet. Add items in <Link href="/onboarding">onboarding</Link>.</p>
          ) : (
            <ul className="bar-list">
              {m.per_asset.map((a) => (
                <li key={a.asset_id || a.asset_name}>
                  <div className="bar-row">
                    <span className="bar-label">{a.asset_name}</span>
                    <span className="bar-count">{a.count}</span>
                  </div>
                  <div
                    className="bar-fill"
                    style={{ width: `${(a.count / m.per_asset[0].count) * 100}%` }}
                  />
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel insights-panel">
          <header className="panel-head">
            <h2 className="kicker">Top sources</h2>
            <p className="muted">Where alerts originated. Helps tune noisy feeds.</p>
          </header>
          {m.per_source.length === 0 ? (
            <p className="muted">No alerts ingested yet.</p>
          ) : (
            <ul className="bar-list">
              {m.per_source.map((s) => (
                <li key={s.source}>
                  <div className="bar-row">
                    <span className="bar-label">{s.source}</span>
                    <span className="bar-count">{s.count}</span>
                  </div>
                  <div
                    className="bar-fill"
                    style={{ width: `${(s.count / m.per_source[0].count) * 100}%` }}
                  />
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      {/* ---------- aging ---------- */}
      <section className="panel insights-panel">
        <header className="panel-head">
          <h2 className="kicker">Open alerts by age</h2>
          <p className="muted">Anything sitting in critical for more than a week is worth a glance.</p>
        </header>
        <table className="aging-table">
          <thead>
            <tr>
              <th>Band</th>
              <th>&gt; 7 days</th>
              <th>&gt; 14 days</th>
              <th>&gt; 30 days</th>
            </tr>
          </thead>
          <tbody>
            {m.aging.map((row) => (
              <tr key={row.band}>
                <td><span className={`band-pill band-${row.band}`}>{row.band}</span></td>
                <td>{row.over_7d}</td>
                <td>{row.over_14d}</td>
                <td>{row.over_30d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="insights-foot">
        <p className="muted">
          Generated {new Date(m.generated_at).toLocaleString()}. Same data lives at{" "}
          <Link href="/docs/api">GET /api/v1/metrics</Link> if you want to graph it elsewhere.
        </p>
      </footer>
    </main>
  );
}

function MetricCard({
  label,
  value,
  tone,
  help,
}: {
  label: string;
  value: string | number;
  tone?: "crit" | "high" | "ok";
  help?: string;
}) {
  return (
    <article className={`metric-card ${tone ? `tone-${tone}` : ""}`}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
      {help && <span className="metric-help">{help}</span>}
    </article>
  );
}

function BandBar({
  label,
  count,
  pct,
  tone,
}: {
  label: string;
  count: number;
  pct: number;
  tone: "crit" | "high" | "low" | "info";
}) {
  return (
    <div className="band-row">
      <span className="band-label">{label}</span>
      <div className="band-track">
        <span className={`band-fill band-fill-${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="band-count">{count} ({pct}%)</span>
    </div>
  );
}
