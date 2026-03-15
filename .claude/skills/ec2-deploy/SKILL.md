---
name: ec2-deploy
description: Deploy to EC2 production server. Use when deploying new code, rebuilding Docker images, wiping and reseeding the database, checking container health, or managing the EC2 instance via AWS CLI.
---

# EC2 Deploy Skill

Manage EC2 instances and Docker Compose services using the AWS CLI and SSH.

**Use this skill when asked to:**
- Deploy new code to production
- Wipe and reseed the production database
- Restart/rebuild containers
- Check container health, logs, or DB state
- Find the EC2 instance IP or connection info

---

## Config

Configure these values based on your deployment environment. All commands below reference them by name.

| Variable | Description | Example |
|----------|-------------|---------|
| `INSTANCE_NAME` | EC2 instance name tag | `my-app-prod` |
| `SSH_KEY` | Local SSH private key | `~/.ssh/my-app-prod-key.pem` |
| `SSH_USER` | OS user on instance | `ubuntu` (or `ec2-user`) |
| `PROJECT_DIR` | Git repo root on instance | `/home/ubuntu/my-project` |
| `COMPOSE_FILE` | Docker Compose config | `docker-compose.prod.yml` |
| `DB_USER` | Database username | `appuser` |
| `DB_NAME` | Database name | `app_db` |

Get your `INSTANCE_ID` from AWS console or `aws ec2 describe-instances --filters "Name=tag:Name,Values=$INSTANCE_NAME"`.

Shorthand for SSH commands:
```bash
SSH="ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SSH_USER@<IP>"
```

---

## Instance Discovery

**ALWAYS start here.** Never hardcode IPs — use AWS CLI to get the current public IP:

```bash
aws ec2 describe-instances \
  --filters "Name=instance-state-name,Values=running" \
  --query "Reservations[*].Instances[*].{ID:InstanceId,Name:Tags[?Key=='Name']|[0].Value,IP:PublicIpAddress,Type:InstanceType,State:State.Name}" \
  --output table
```

Find your instance name from the output above. If its public IP has changed, this command will always show the current one.

---

## SSH Connection

```bash
ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SSH_USER@<PUBLIC_IP>
```

- **Key file**: `$SSH_KEY` (configure before use)
- **Username**: `$SSH_USER` (typically `ubuntu` for Ubuntu, `ec2-user` for Amazon Linux)
- **Project root**: `$PROJECT_DIR` (your git repo path)

**Verify key name before SSHing** (avoids guessing the username):
```bash
aws ec2 describe-instances \
  --instance-ids $INSTANCE_ID \
  --query "Reservations[0].Instances[0].KeyName" \
  --output text
```

**Determine OS username from AMI**:
```bash
aws ec2 describe-images \
  --image-ids <AMI_ID> \
  --query "Images[0].Name" \
  --output text
```
(Ubuntu images use `ubuntu`, Amazon Linux uses `ec2-user`)

---

## Container Architecture

Five Docker containers managed via `docker-compose.prod.yml`:

| Container | Image | Purpose |
|-----------|-------|---------|
| `dr_postgres` | timescale/timescaledb:latest-pg16 | PostgreSQL + TimescaleDB |
| `dr_redis` | redis:7-alpine | BullMQ job queue |
| `dr_api` | deep-research-api (local build) | Hono API + Python workers |
| `dr_web` | deep-research-web (local build) | Next.js frontend |
| `dr_caddy` | caddy:2-alpine | Reverse proxy (80/443) |

**Key facts:**
- `postgres` container does NOT expose a host port in prod — only accessible via `docker exec` or within the Docker network
- Internal DATABASE_URL: `postgres://deepresearch:<password>@postgres:5432/deep_research`
- `.env` file is at `/home/ubuntu/deep-research/.env` (not in the Docker image)
- API runtime is **bun** (not node) — use `bun run <script>.ts` inside the api container
- Web runtime is **node** — Next.js production server

---

## Routine Deployment (no DB wipe)

When only code changes (no schema or seed changes):

```bash
ssh -i ~/.ssh/volatio-prod-key.pem ubuntu@<IP> "
  cd ~/deep-research
  git pull origin main
  docker compose -f docker-compose.prod.yml build api web
  docker compose -f docker-compose.prod.yml up -d
"
```

The `up -d` command replaces only the containers whose images changed.

---

## Full Wipe + Reseed Deployment

When schema changed, seed data changed, or a clean slate is needed. This is the procedure verified on 2026-02-28.

### Step 1: Ensure local commit is pushed

```bash
cd /Users/adamsohn/Projects/deep-research
git push origin main
```

### Step 2: Pull on EC2

```bash
ssh -i ~/.ssh/volatio-prod-key.pem ubuntu@<IP> "
  cd ~/deep-research && git pull origin main && git log --oneline -3
"
```

### Step 3: Drop and recreate the database

**Critical**: Terminate all existing connections first, or DROP DATABASE will hang.

```bash
ssh -i ~/.ssh/volatio-prod-key.pem ubuntu@<IP> "
  # Kill connections
  docker exec dr_postgres psql -U deepresearch -d postgres \
    -c \"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='deep_research' AND pid<>pg_backend_pid();\"
  # Drop
  docker exec dr_postgres psql -U deepresearch -d postgres \
    -c 'DROP DATABASE IF EXISTS deep_research;'
  # Recreate
  docker exec dr_postgres psql -U deepresearch -d postgres \
    -c 'CREATE DATABASE deep_research OWNER deepresearch;'
"
```

### Step 4: Stop api and web (keep postgres + redis running)

```bash
ssh -i ~/.ssh/volatio-prod-key.pem ubuntu@<IP> "
  cd ~/deep-research
  docker compose -f docker-compose.prod.yml stop api web
"
```

### Step 5: Rebuild images

This bakes in new code and seed SQL files:

```bash
ssh -i ~/.ssh/volatio-prod-key.pem ubuntu@<IP> "
  cd ~/deep-research
  docker compose -f docker-compose.prod.yml build api web
"
```

Takes 3–8 minutes. The API image installs Python, pip packages (pandas, numpy, psycopg2), and all npm deps.

### Step 6: Run migrations + hypertables + seed-data + admin user

All in one `docker compose run` command. Uses `--no-deps` because postgres is already running as `dr_postgres`.

```bash
ssh -i ~/.ssh/volatio-prod-key.pem ubuntu@<IP> "
  cd ~/deep-research
  docker compose -f docker-compose.prod.yml run --rm --no-deps api \
    sh -c 'cd /app/packages/db && bun run src/migrate.ts && bun run scripts/setup/setup-hypertables.ts && bun run scripts/setup/seed-data.ts && bun run scripts/setup/seed.ts'
"
```

Expected output:
```
Running migrations...
Migrations complete.
Converting 'daily_bars' to hypertable...
Seeding historical baseline data...
  0011_seed_daily_bars.sql: 9 statement(s)...  done (1.1s)
  0012_seed_portfolio_signals.sql: 2 statement(s)...  done
  0013_seed_portfolio_history.sql: 2 statement(s)...  done
Verified seed data:
  daily_bars (through 2024):       3,012 rows
  portfolio_signals (through 2024): 743 rows
  portfolio_trades:                 258 rows
Admin user created: admin@deep-research.dev / Admin123!
```

### Step 7: Import flow_daily (volume mount required)

`data/seed/app/flow_daily_2022_2024.csv.gz` is in the git repo but NOT inside the Docker image (turbo prune excludes non-workspace directories). Mount the host `data/` directory as a read-only volume:

```bash
ssh -i ~/.ssh/volatio-prod-key.pem ubuntu@<IP> "
  cd ~/deep-research
  docker compose -f docker-compose.prod.yml run --rm --no-deps \
    -v /home/ubuntu/deep-research/data:/app/data:ro \
    api \
    sh -c 'cd /app/packages/db && bun run scripts/setup/import-flow-daily.ts'
"
```

Expected: `Imported 65,501 flow_daily rows in 3.2s`

### Step 8: Start all containers

```bash
ssh -i ~/.ssh/volatio-prod-key.pem ubuntu@<IP> "
  cd ~/deep-research
  docker compose -f docker-compose.prod.yml up -d
"
```

### Step 9: Verify

```bash
# Container health
ssh -i ~/.ssh/volatio-prod-key.pem ubuntu@<IP> \
  "docker ps --format 'table {{.Names}}\t{{.Status}}'"

# DB row counts
ssh -i ~/.ssh/volatio-prod-key.pem ubuntu@<IP> "
  docker exec dr_postgres psql -U deepresearch -d deep_research -c \"
    SELECT
      (SELECT COUNT(*) FROM daily_bars WHERE (time AT TIME ZONE 'America/New_York')::date <= '2024-12-31') AS daily_bars,
      (SELECT COUNT(*) FROM portfolio_signals WHERE date <= '2024-12-31') AS portfolio_signals,
      (SELECT COUNT(*) FROM portfolio_trades) AS portfolio_trades,
      (SELECT COUNT(*) FROM flow_daily WHERE date <= '2024-12-31') AS flow_daily;
  \"
"

# Public API health
curl -s https://volat.io/api/health

# Portfolio data
curl -s "https://volat.io/api/portfolio/runs" -H "X-Test-User: admin"
```

Expected DB counts: `3012 | 743 | 258 | 65501`
Expected P&L: `+$157,171.59`

---

## Running Ad-Hoc Commands

### Execute SQL in the DB

```bash
# Interactive query
ssh -i ~/.ssh/volatio-prod-key.pem ubuntu@<IP> \
  "docker exec dr_postgres psql -U deepresearch -d deep_research -c 'SELECT COUNT(*) FROM portfolio_trades;'"

# Pipe a SQL file
ssh -i ~/.ssh/volatio-prod-key.pem ubuntu@<IP> \
  "docker exec -i dr_postgres psql -U deepresearch -d deep_research" \
  < /local/path/to/file.sql
```

### Run a TypeScript script in the api container

```bash
ssh -i ~/.ssh/volatio-prod-key.pem ubuntu@<IP> "
  cd ~/deep-research
  docker compose -f docker-compose.prod.yml run --rm --no-deps api \
    sh -c 'cd /app && bun run scripts/my-script.ts'
"
```

**Important**: Use `bun run` not `node --import tsx`. The api runner is `oven/bun:1.2-alpine` — node is not installed.

### View container logs

```bash
ssh -i ~/.ssh/volatio-prod-key.pem ubuntu@<IP> \
  "docker logs dr_api --tail 50 -f"
```

### Redis CLI

```bash
ssh -i ~/.ssh/volatio-prod-key.pem ubuntu@<IP> \
  "docker exec dr_redis redis-cli KEYS 'bull:*' | head -20"
```

---

## Debugging Common Failures

### `docker exec dr_postgres psql` auth failures

```bash
# No password needed — postgres uses trust for local unix socket connections
# This works without PGPASSWORD:
docker exec dr_postgres psql -U deepresearch -d deep_research -c 'SELECT 1;'
```

### `DROP DATABASE` hangs

Always terminate connections first:
```sql
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname='deep_research' AND pid<>pg_backend_pid();
```

### `docker compose run` can't reach postgres

Use `--no-deps` only when postgres/redis are already running. Without `--no-deps`, compose starts dependencies first. With `--no-deps`, existing running containers (`dr_postgres`) are still reachable via the Docker network.

### turbo prune excludes repo root directories

`turbo prune @volat/api --docker` only includes workspace packages. Root-level directories like `data/` or `scripts/` are NOT baked into the Docker image. Use `-v /host/path:/app/path:ro` volume mounts when running scripts that need them.

### Port 3001 already in use (local dev)

```bash
kill $(lsof -t -iTCP:3001 -sTCP:LISTEN) 2>/dev/null
```

### API container shows "Already up to date" in git but old code running

The Docker image is not automatically rebuilt on `git pull`. Must explicitly rebuild:
```bash
docker compose -f docker-compose.prod.yml build api web
docker compose -f docker-compose.prod.yml up -d
```

### SSH "Permission denied (publickey)"

Tried wrong username. Ubuntu 24.04 → `ubuntu`, Amazon Linux → `ec2-user`, older Ubuntu → `ubuntu`. Check the AMI name:
```bash
aws ec2 describe-images --image-ids <AMI_ID> --query "Images[0].Name" --output text
```

---

## Instance Management (AWS CLI)

### Start/stop instance

```bash
aws ec2 stop-instances --instance-ids i-0b13dfa79999cc0b1
aws ec2 start-instances --instance-ids i-0b13dfa79999cc0b1
aws ec2 describe-instance-status --instance-ids i-0b13dfa79999cc0b1
```

### Check instance type / resize

```bash
# Current type
aws ec2 describe-instances \
  --instance-ids i-0b13dfa79999cc0b1 \
  --query "Reservations[0].Instances[0].InstanceType" \
  --output text

# Resize (instance must be stopped first)
aws ec2 stop-instances --instance-ids i-0b13dfa79999cc0b1
aws ec2 modify-instance-attribute \
  --instance-id i-0b13dfa79999cc0b1 \
  --instance-type "{\"Value\":\"t4g.large\"}"
aws ec2 start-instances --instance-ids i-0b13dfa79999cc0b1
```

### View security groups / open ports

```bash
aws ec2 describe-instances \
  --instance-ids i-0b13dfa79999cc0b1 \
  --query "Reservations[0].Instances[0].SecurityGroups"

# List inbound rules
SG_ID=$(aws ec2 describe-instances \
  --instance-ids i-0b13dfa79999cc0b1 \
  --query "Reservations[0].Instances[0].SecurityGroups[0].GroupId" \
  --output text)
aws ec2 describe-security-groups --group-ids $SG_ID \
  --query "SecurityGroups[0].IpPermissions"
```

### Check CloudWatch for CPU / memory

```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 \
  --metric-name CPUUtilization \
  --dimensions Name=InstanceId,Value=i-0b13dfa79999cc0b1 \
  --start-time $(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 300 \
  --statistics Average \
  --output table
```

---

## Key Instance Details (as of 2026-03-04)

See **Config** section at top for `INSTANCE_ID`, `SSH_KEY`, `SSH_USER`, `PROJECT_DIR`, `COMPOSE_FILE`, `DB_USER`, `DB_NAME`.

| Property | Value |
|----------|-------|
| Name | `volatio-prod` |
| Type | `t4g.medium` (ARM64) |
| AMI | Ubuntu 24.04 arm64 |
| Public URL | `https://volat.io` |
| DB host (internal) | `postgres:5432` |
| DB host (external) | NOT exposed in prod (no host port mapping) |

