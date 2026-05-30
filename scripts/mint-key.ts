// Mint an API key for the first existing user. Run with:
//   npx tsx scripts/mint-key.ts [label]
// Prints JSON with id, token, and owner email. The raw token is only
// shown here — keep it.
import { getDb } from "../src/db";
import { createApiKey } from "../src/db/api-keys";

const label = process.argv[2] ?? "cli";
const users = getDb()
  .prepare("SELECT id, email FROM users LIMIT 1")
  .all() as { id: string; email: string }[];

if (!users.length) {
  console.error("No users in DB. Start the app once to seed the admin user.");
  process.exit(1);
}

const { row, token } = createApiKey({
  label,
  scopes: [
    "alerts:read",
    "alerts:write",
    "watchlist:read",
    "watchlist:write",
    "subscriptions:read",
    "subscriptions:write",
    "webhooks:read",
    "webhooks:write",
    "metrics:read",
  ],
  createdBy: users[0].id,
});

console.log(JSON.stringify({ id: row.id, token, owner: users[0].email }, null, 2));
