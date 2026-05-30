import "dotenv/config";
import { migrate } from "./db/index";
import { seedDefaults } from "./db/seed";
import { seedBaseAdmin } from "./services/auth";
import { runCollector } from "./agents/collector";
import { runTriage } from "./agents/triage";

// One-shot: collect + triage once, then exit. Useful for cron or manual fills.
async function main() {
  migrate();
  seedDefaults();
  seedBaseAdmin();
  const c = await runCollector();
  console.log(`collector: +${c.inserted} findings from ${c.results.length} sources`);
  for (const r of c.results)
    console.log(`  - ${r.source}: ${r.error ? "error: " + r.error : "+" + r.inserted}`);
  const t = await runTriage();
  console.log(`triage: ${t.alerts} alerts from ${t.processed} findings`);
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
