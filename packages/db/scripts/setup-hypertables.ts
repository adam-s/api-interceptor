/**
 * Post-migration script: enable TimescaleDB extension and convert tables to hypertables.
 *
 * Idempotent — safe to run multiple times.
 * Run after migrations: `pnpm run setup` chains migrate → this script.
 */

import * as dotenv from "dotenv";
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

const HYPERTABLES = [
	{
		table: "daily_bars",
		timeColumn: "time",
		chunkInterval: "1 month",
	},
];

const sql = postgres(dbUrl, { max: 1 });

console.log("Enabling TimescaleDB extension...");
await sql`CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE`;

for (const { table, timeColumn, chunkInterval } of HYPERTABLES) {
	// Check if the table exists before converting
	const [exists] = await sql`
		SELECT EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE table_name = ${table}
		) AS exists
	`;

	if (!exists?.exists) {
		console.log(`Table '${table}' does not exist, skipping.`);
		continue;
	}

	// Check if already a hypertable
	const hypertables = await sql`
		SELECT hypertable_name FROM timescaledb_information.hypertables
		WHERE hypertable_name = ${table}
	`;

	if (hypertables.length > 0) {
		console.log(`'${table}' is already a hypertable.`);
		continue;
	}

	console.log(
		`Converting '${table}' to hypertable (chunk: ${chunkInterval})...`,
	);
	await sql.unsafe(`
		SELECT create_hypertable(
			'${table}', '${timeColumn}',
			chunk_time_interval => INTERVAL '${chunkInterval}',
			if_not_exists => TRUE,
			migrate_data => TRUE
		)
	`);
	console.log(`'${table}' converted.`);
}

console.log("Hypertable setup complete.");
await sql.end();
