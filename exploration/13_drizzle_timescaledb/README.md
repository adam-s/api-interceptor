# TimescaleDB Is Just Postgres

I needed timeseries storage. Stock prices, daily bars, the kind of data where you query by time range and symbol. TimescaleDB seemed like a big decision — a specialized database, a different stack, a commitment.

It isn't. It's one line.

```sql
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
```

---

TimescaleDB runs inside Postgres. The Docker image is `postgres:16` with an extension pre-installed. Every Postgres query works. Every ORM works. Every migration tool works. `psql` connects the same way, `pg_dump` backs it up the same way, Drizzle generates schemas the same way.

The only thing TimescaleDB adds is `create_hypertable()`, which turns a regular table into a time-partitioned table with automatic chunk management and time-series-specific query optimizations. You call it once per table, after creating the table with normal DDL. Everything else is standard Postgres.

```yaml
# docker-compose.yml
postgres:
  image: timescale/timescaledb:latest-pg16  # not postgres:16
```

That's the whole migration. Same ports, same credentials, same everything.

---

On a previous project I started with `postgres:16` and added TimescaleDB later. It meant a second database package, a second connection string, a second set of migrations — then eventually merging them back into one. All during development, not a production crisis, but an unnecessary detour. Starting with `timescale/timescaledb:latest-pg16` costs nothing — it runs plain Postgres queries identically — and saves you a step if you ever need hypertables.

---

The database itself was the easy part. The tooling around it had more surprises.

`drizzle-kit push` prompts interactively. "Are you sure you want to apply these changes?" That works in a terminal. In Docker, in CI, in any non-interactive context, it hangs. I tried piping `yes`. Setting `CI=true`. Setting `TERM=dumb`. Using `drizzle-kit migrate` instead. Seven attempts before I found the fix: drop from the CLI to the programmatic API.

```typescript
import { migrate } from "drizzle-orm/postgres-js/migrator";
await migrate(db, { migrationsFolder });
```

Four lines. No prompts. No hanging.

Add `strict: true` to `drizzle.config.ts` and the generate step won't prompt either. That one flag would have saved me an afternoon.

---

In a monorepo, importing your database package from another package executes the module. If the module has a top-level `postgres(DATABASE_URL)` call, it opens a database connection on import. If `DATABASE_URL` isn't set — like in API tests that don't need the database — the import throws.

This is a general JavaScript problem, not a Drizzle problem. Module-level side effects cascade through transitive imports. Package A imports Package B which imports the database package which calls `postgres()` which reads an environment variable that doesn't exist.

The fix is a JavaScript Proxy. The exported `db` object looks like a Drizzle client, but it doesn't connect until you actually query through it.

```typescript
export const db = new Proxy({} as DbType, {
  get(_target, prop) {
    return (getDb() as Record<string | symbol, unknown>)[prop];
  },
});
```

Safe to import anywhere. Crashes only if you actually try to query without a database URL, which is the right behavior.

---

TimescaleDB warned me during hypertable setup.

```
WARNING: column type "timestamp without time zone" used for "time"
         does not follow best practices
HINT:    Use datatype TIMESTAMPTZ instead.
```

In Drizzle, the difference is `timestamp("time")` versus `timestamp("time", { withTimezone: true })`. Both compile. Both create valid SQL. Both create valid hypertables. But `timestamp` stores wall-clock time without timezone context, which means your 3:30 PM close price is ambiguous — EST? EDT? UTC? Financial data crosses timezones constantly, and `timestamptz` makes the conversion explicit.

I caught this during setup and fixed it before shipping. On the previous project, it wasn't caught until much later.

---

One more. Every database script — migration runners, setup scripts, seed scripts — needs an explicit `await client.end()` at the end. The postgres.js connection pool stays open, and Node won't exit while it has active handles. Your script finishes its work, prints "done," and then sits there forever.

The temptation is `process.exit(0)`. That works, but it also swallows errors from pending async operations. Close the connection properly.

```typescript
await migrate(db, { migrationsFolder });
console.log("Migrations complete.");
await client.end();  // without this, the script hangs
```

---

Six specific lessons, all from building real systems. The defaults are wrong in predictable ways. Plain postgres when you'll want timescaledb. CLI when you need programmatic. Eager connection when you need lazy. `timestamp` when you need `timestamptz`. Implicit cleanup when you need explicit.

Fix them at the start and they never come up again.
