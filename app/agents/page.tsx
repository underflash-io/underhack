"use client";

import { useEffect, useState, useCallback } from "react";
import { rel } from "@/lib/format";

type Run = {
  id: string;
  agent: string;
  status: string;
  items_in: number;
  items_out: number;
  started_at: string;
  finished_at: string | null;
  note: string | null;
};

export default function AgentsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/agents", { cache: "no-store" });
    if (r.ok) setRuns((await r.json()).runs);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [load]);

  async function runNow() {
    setRunning(true);
    setResult(null);
    try {
      const r = await fetch("/api/agents/run", { method: "POST" });
      const d = await r.json();
      if (r.ok) {
        setResult(
          `Collected ${d.collected} new findings · created ${d.alerts} alerts from ${d.processed} processed.`
        );
      } else {
        setResult(d.error || "Run failed.");
      }
    } catch (e) {
      setResult((e as Error).message);
    }
    setRunning(false);
    load();
  }

  return (
    <main className="container">
      <header className="page-head">
        <h1>Agents</h1>
        <p className="muted">
          The collector pulls from enabled sources; the triage agent matches findings to systems and
          scores severity. The worker process runs this loop continuously.
        </p>
      </header>

      <section className="panel">
        <div className="panel-head">
          <h2>Manual run</h2>
          <button onClick={runNow} disabled={running}>
            {running ? "Running…" : "Run collector + triage now"}
          </button>
        </div>
        {result && <p className="pad result">{result}</p>}
      </section>

      <section className="panel">
        <h2 className="pad-h">Recent activity</h2>
        <table className="runs">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Status</th>
              <th>In</th>
              <th>Out</th>
              <th>When</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>{r.agent}</td>
                <td>
                  <span className={`badge ${r.status === "ok" ? "ok" : "err"}`}>{r.status}</span>
                </td>
                <td>{r.items_in}</td>
                <td>{r.items_out}</td>
                <td className="muted">{rel(r.finished_at || r.started_at)}</td>
                <td className="muted note">{r.note || "—"}</td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={6} className="muted pad">
                  No runs yet. Trigger one above or start the worker.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
