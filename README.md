# LeadFlow AI — Smart Lead Management System

A complete, working lead-management system for an **IT / Cyber / Automation services** company.
A visitor describes a problem on the website → the backend saves it → an **AI Agent** reads it and
determines the service type, priority, a summary, follow-up questions, an hours estimate, and a
ready-to-send reply → the lead appears in an **admin CRM** where it moves through stages
(New → Contacted → Qualified → Proposal Sent → Won / Lost). New leads also trigger **real email**
notifications (owner alert + customer auto-reply) and an optional webhook.

Built to the LeadFlow AI internship brief. **The whole system starts with one command.**

---

## The idea in short

1. **Visitor fills the lead form** — name, phone, email, service, problem, urgency, budget.
2. **Backend saves the lead** (validated & stored in PostgreSQL).
3. **AI Agent analyzes it** — category · priority 1–10 · summary · questions · draft reply · estimate.
4. **Lead appears in the CRM** — the team sees it instantly, with the AI analysis attached.
5. **Follow-up** — change status, add notes, assign, and track stats & conversion.

---

## Architecture

```
        ┌──────────────────────┐        ┌──────────────────────┐
        │  Public Website      │        │  Admin Dashboard /   │
        │  Landing · Services  │        │  Mini-CRM (SPA)      │
        │  Pricing · Lead Form │        │  Leads · AI · Stats  │
        └──────────┬───────────┘        └──────────┬───────────┘
                   │            HTTP (JSON)          │
                   └───────────────┬─────────────────┘
                                   ▼
                     ┌──────────────────────────┐
                     │   Backend API (Express)  │
                     │  Auth · Leads CRUD ·     │
                     │  Notes · Stats · Health  │
                     │  Validation · Rate limit │
                     └───┬───────────┬───────┬──┘
                         ▼           ▼       ▼
             ┌────────────────┐ ┌─────────┐ ┌───────────────────┐
             │ PostgreSQL     │ │AI Agent │ │ Automations       │
             │ (Sequelize ORM)│ │(rule    │ │ Webhook · Alerts  │
             │ 6 tables       │ │ flow)   │ │ Daily report      │
             └────────────────┘ └─────────┘ └───────────────────┘

   Production path:  Client → Cloudflare (DNS·SSL·WAF) → Nginx → Docker (app + db)
```

---

## Tech stack

| Layer        | Choice                                   |
|--------------|------------------------------------------|
| Backend      | Node.js + Express                        |
| Database     | PostgreSQL via **Sequelize ORM** (parameterized queries → SQL-injection safe) |
| AI Agent     | Rule-based "agent flow" in plain JS — **no API key or cost** |
| Auth         | Session cookie (HMAC-signed) + **bcrypt** password hashing |
| Frontend     | Vanilla HTML/CSS/JS (public site + admin SPA) |
| Infra        | Docker Compose · Nginx · Cloudflare · Certbot SSL |
| Automation   | Outbound webhook (Slack/Discord/Telegram) + scheduled daily report |

---

## What's implemented

- ✅ Company website: landing, services, pricing, and the **lead form**
- ✅ Strict server-side validation with clear error messages
- ✅ **AI Agent** — 6-step flow (classify → priority → summary → questions → draft reply → estimate)
- ✅ Admin **CRM**: login, lead list, detail, status pipeline, internal notes, assignment
- ✅ Filters: by status, service, and minimum priority
- ✅ **Stats page**: total / high-value / urgent / won / lost / conversion + a 14-day leads line chart
- ✅ Backend API with a **health check** (API / DB / agent)
- ✅ **Automation**: new-lead webhook, high-priority alert, daily report job
- ✅ Security: bcrypt hashing, rate limiting (login + lead form), ORM, secrets via env
- ✅ **Docker Compose** — one command brings up app + database
- ✅ Seed data: services, an admin + sales account, and 5 demo leads (already analyzed)
- ✅ Backup script + Nginx config + this README

---

## Run it — locally with Docker (recommended, one command)

```bash
cp .env.example .env        # then edit POSTGRES_PASSWORD and SESSION_SECRET
docker compose up -d --build
```

Then open:
- Website: <http://localhost:8090>
- Admin:   <http://localhost:8090/admin>  (demo login **admin / admin1234**)

That's it — the app container seeds the database (tables + demo data) on first boot.

## Run it — locally without Docker

```bash
# needs a running PostgreSQL and a 'leadflow' database
npm install
export DATABASE_URL="postgresql://USER:PASS@127.0.0.1:5432/leadflow"
export SESSION_SECRET="dev-secret"
npm run seed     # creates tables + demo data
npm start        # http://localhost:3000
```

## Deploy on a VPS

```bash
# 1. Copy the project to the server
scp -r leadflow root@YOUR_SERVER:/opt/leadflow

# 2. Configure secrets
cd /opt/leadflow && cp .env.example .env && nano .env   # set strong values

# 3. Start everything
docker compose up -d --build

# 4. Reverse proxy + HTTPS
sudo cp deploy/nginx.leadflow.conf /etc/nginx/sites-available/leadflow
sudo ln -s /etc/nginx/sites-available/leadflow /etc/nginx/sites-enabled/leadflow
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d shop.cookblog.net

# 5. Point the (sub)domain at the server in Cloudflare (A record), enable SSL/TLS + a WAF/rate rule.
```

The **first account you register** on `/admin` becomes the ADMIN (the seed also creates `admin/admin1234` for the demo — change or remove it in production).

---

## API endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/auth/register` | – | Register (first user = admin) |
| POST | `/api/auth/login` | – | Log in |
| POST | `/api/auth/logout` | – | Log out |
| GET  | `/api/auth/me` | – | Current user |
| GET  | `/api/services` | – | Service catalog (public) |
| POST | `/api/leads` | – | **Submit a lead** (public form) → runs AI analysis |
| GET  | `/api/leads` | ✔ | List leads (`?status=&serviceType=&minPriority=`) |
| GET  | `/api/leads/:id` | ✔ | Lead detail + analysis + notes |
| PATCH| `/api/leads/:id` | ✔ | Update status / assignment |
| POST | `/api/leads/:id/notes` | ✔ | Add internal note |
| POST | `/api/leads/:id/analyze` | ✔ | Re-run the AI analysis |
| GET  | `/api/users` | ✔ | Team members (for assignment) |
| GET  | `/api/stats` | ✔ | Metrics + per-day + breakdowns |
| GET  | `/api/health` | – | Health of API / DB / agent |

---

## Database schema (6 tables)

- **users** — id, username, passwordHash (bcrypt), role (ADMIN/SALES), createdAt
- **services** — id, name, description, basePrice, keywords (used by the agent)
- **leads** — id, name, phone, email, serviceType, problem, urgency, budget, status, assignedToId, timestamps
- **lead_notes** — id, leadId, authorId, text, createdAt
- **ai_analysis** — id, leadId, category, priority, urgencyLabel, estimateHours, summary, questions, draftReply
- **activity_logs** — id, userId, action, detail, createdAt

Relations: a lead has one analysis, many notes, and an optional assignee. Defined in `src/db.js`.

---

## AI Agent flow

The agent (`src/agent/analyze.js`) is a deterministic rule-based flow — no external API, no key, no cost — that mirrors the LangGraph flow in the brief:

1. **Classify service** — keyword overlap against the service catalog (Account Security, Servers/RDP, Automation, Docker/DevOps, Cloudflare/Network, Monitoring).
2. **Score priority (1–10)** — from urgency + budget + security-sensitivity + description detail.
3. **Summarize** — a one-line summary for the salesperson.
4. **Follow-up questions** — tailored to the detected service.
5. **Draft reply** — a ready-to-send professional response.
6. **Hours estimate** — a range based on the service type.

Example — input *"I keep getting login attempts on my Gmail and Facebook and I want to secure my accounts"* → **Account Security · Priority 9 · Urgent · 2–4 hours** + tailored questions + a drafted reply. (Swappable for a real LLM later — see "What's next".)

---

## Security

- Passwords hashed with **bcrypt**; sessions are HMAC-signed httpOnly cookies (30-day expiry).
- **Sequelize ORM** → all queries parameterized (no string-built SQL).
- **Rate limiting** on login (20 / 15 min) and the public lead form (30 / hour), plus an optional Nginx rate rule.
- Secrets (DB password, session secret, webhook) come from **environment variables**, never committed.
- Security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`.

## Monitoring & backups

- `GET /api/health` returns the status of API, DB, and agent (use with Uptime Kuma / a status check).
- `deploy/backup-db.sh` — gzipped `pg_dump`, timestamped, auto-prunes after 14 days (cron-ready).

## Automation

- New lead → webhook notification (works with Slack/Discord/Telegram/custom — set `WEBHOOK_URL`).
- Priority ≥ threshold → extra **high-priority alert**.
- **Daily report** job writes a summary to `activity_logs` and posts it to the webhook.

---

## Problems hit & how they were solved

- **Prisma engine binaries were blocked in the build environment**, which would have left the DB layer untested. Switched to **Sequelize** — also an ORM (so still SQL-injection safe per the brief), but pure-JavaScript, which let the whole stack be tested end-to-end against a real Postgres.
- **Clean-looking priority scoring** — combined urgency, budget, security-sensitivity and description length so security incidents and big-budget requests correctly float to the top.
- **One-command startup** — the container runs an idempotent seed (creates tables + demo data only if missing) before starting, so `docker compose up` just works on a fresh machine.

## What's next

- Swap the rule-based agent for a real LLM (OpenAI/Anthropic) behind the same `analyzeLead()` interface.
- Mobile PWA wrapper over the admin app (add a manifest + service worker).
- GitHub Actions CI to build/test/deploy on push to main.
- Multi-user roles (Admin vs Sales permissions), audit-log page, PDF quote generation.

---

## Demo accounts (seeded)

- **admin / admin1234** — ADMIN
- **sales / sales1234** — SALES

Change these before any real use.
