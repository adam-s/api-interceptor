/**
 * Programmatic migration runner.
 *
 * Uses drizzle-orm's migrate() function instead of drizzle-kit CLI.
 * The CLI prompts interactively and breaks in CI/Docker.
 * This runs non-interactively and exits cleanly.
 */

import * as dotenv from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: join(__dirname, "../../../.env") });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
	console.error("DATABASE_URL is not set");
	process.exit(1);
}

const migrationsFolder = join(__dirname, "../drizzle");

if (!existsSync(migrationsFolder)) {
	console.log("No migrations directory found. Run 'pnpm run generate' first.");
	process.exit(0);
}

const client = postgres(dbUrl, { max: 1 });
const db = drizzle(client);

console.log("Running migrations...");
await migrate(db, { migrationsFolder });
console.log("Migrations complete.");

await client.end();
