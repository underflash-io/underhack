// Next.js startup hook — runs once when the server boots (dev and prod).
// Ensures the DB schema, default sources/systems, and a base admin all exist so
// the app is usable even if the worker hasn't been started yet.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { migrate } = await import("./src/db/index");
  const { seedDefaults } = await import("./src/db/seed");
  const { seedBaseAdmin } = await import("./src/services/auth");
  migrate();
  seedDefaults();
  seedBaseAdmin();
}
