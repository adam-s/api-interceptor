import * as dotenv from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hash } from "bcryptjs";
import { db, eq, closeDb } from "../src/index";
import { users } from "../src/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../../../.env") });

async function seed() {
	const email = "admin@deep-research.dev";
	const password = "Admin123!";

	const existing = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, email))
		.limit(1);

	if (existing.length > 0) {
		console.log(`Admin user already exists (${email}), skipping.`);
	} else {
		const passwordHash = await hash(password, 12);
		await db.insert(users).values({
			email,
			passwordHash,
			name: "Admin",
			role: "admin",
		});
		console.log(`Admin user created: ${email} / ${password}`);
	}

	await closeDb();
}

seed().catch((err) => {
	console.error("Seed failed:", err);
	process.exit(1);
});
