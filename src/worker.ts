import "dotenv/config";
import { migrate } from "./db/index";
import { seedDefaults } from "./db/seed";
import { seedBaseAdmin } from "./services/auth";
import { runCollector } from "./agents/collector";
import { runTriage } from "./agents/triage";
import { getSettings } from "./services/settings";

let running = true;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cycle(n: number): Promise<void> {
  const started = Date.now();
  console.log(`\n=== cycle #${n} @ ${new Date().toISOString()} ===`);
  try {
    const c = await runCollector();
    console.log(`  collector: +${c.inserted} findings from ${c.results.length} sources`);
  } catch (err) {
    console.error("  collector failed:", (err as Error).message);
  }
  try {
    const t = await runTriage();
    console.log(`  triage: ${t.alerts} alerts from ${t.processed} findings`);
  } catch (err) {
    console.error("  triage failed:", (err as Error).message);
  }
  console.log(`  cycle done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

async function main() {
  console.log("=== UNDERHACK — security monitoring worker ===");
  migrate();
  seedDefaults();
  seedBaseAdmin();

  process.on("SIGINT", () => {
    console.log("\nshutting down after current cycle...");
    running = false;
  });
  process.on("SIGTERM", () => {
    running = false;
  });

  let n = 0;
  while (running) {
    await cycle(++n);
    if (!running) break;
    // Re-read interval each cycle so admin changes take effect live.
    const intervalSec = getSettings().alerting.pollIntervalSec;
    console.log(`  sleeping ${intervalSec}s...`);
    // Sleep in 1s slices so SIGINT is responsive.
    for (let i = 0; i < intervalSec && running; i++) await sleep(1000);
  }
  console.log("worker stopped.");
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
