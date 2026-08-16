# LeadFlow AI — Smart Lead Management System

A complete, **deployed and working** lead-management platform for an **IT / Cyber / Automation
services** business. A visitor describes a problem on the website → the backend saves it → an
**AI Agent** reads it and determines the service type, priority, a summary, follow-up questions,
an hours estimate, and a ready-to-send reply → the lead appears in an **admin CRM** where it moves
through stages (New → Contacted → Qualified → Proposal Sent → Won / Lost). New leads also fire an
**instant Telegram alert** to the owner's phone.

Built to the LeadFlow AI internship brief. **The whole system starts with one command**, is
**deployed to a real VPS behind Cloudflare + Nginx + SSL**, and **auto-deploys via GitHub Actions**
on every push to `main`.

**Live:** <https://shop.cookblog.net> · Admin CRM: <https://shop.cookblog.net/admin>

---

## The idea in short

1. **Visitor registers and fills the lead form** — name, phone, email, service, problem, urgency, budget.
2. **Backend saves the lead** (validated & stored in PostgreSQL).
3. **AI Agent analyzes it** — category · priority 1–10 · summary · questions · draft reply · estimate.
4. **Owner is alerted** — an instant Telegram message with the lead + AI analysis.
5. **Lead appears in the CRM** — the team changes status, adds notes, assigns it, and tracks stats.
6. **Customer tracks progress** — a "My Requests" portal shows each request's live status.

---

## Architecture

```
        ┌──────────────────────┐        ┌──────────────────────┐
        │  Public Website      │        │  Admin Dashboard /   │
        │  Landing · Services  │        │  Mini-CRM (SPA)      │
        │  Pricing · Demos ·   │        │  Leads · AI · Stats  │
        │  Lead Form · Portal  │        │  Notes · Alerts      │
        └──────────┬───────────┘        └──────────┬───────────┘
                   │            HTTP (JSON)          │
                   └───────────────┬─────────────────┘
                                   ▼
                     ┌──────────────────────────┐
                     │   Backend API (Express)  │
                     │  Auth · Leads CRUD ·     │
                     │  Notes · Stats · Health  │
                     │  Validation · Rate limit │
                     │  Security headers (CSP…) │
                     └───┬───────────┬───────┬──┘
                         ▼           ▼       ▼
             ┌────────────────┐ ┌─────────┐ ┌───────────────────┐
             │ PostgreSQL     │ │AI Agent │ │ Automations       │
             │ (Sequelize ORM)│ │(rule    │ │ Telegram · Alerts │
             │ 6 tables       │ │ flow)   │ │ Daily report      │
             └────────────────┘ └─────────┘ └───────────────────┘

 Production path:
   Client → Cloudflare (DNS · SSL · DDoS) → Nginx (reverse proxy + SSL) → Docker (app + db)
 Monitoring:  Uptime Kuma → Telegram alerts · internal /status page (API · DB · Agent + live counts)
 CI/CD:       git push main → GitHub Actions → SSH deploy → docker compose up -d --build
```

---

## Tech stack

| Layer        | Choice                                   |
|--------------|------------------------------------------|
| Backend      | Node.js + Express                        |
| Database     | PostgreSQL via **Sequelize ORM** (parameterized queries → SQL-injection safe) |
| AI Agent     | Rule-based "agent flow" in plain JS — **no API key or cost** |
| Auth         | Session cookie (HMAC-signed, httpOnly) + **bcrypt** hashing · roles ADMIN / SALES / CUSTOMER |
| Frontend     | Vanilla HTML/CSS/JS (public site + admin SPA) · **installable PWA** |
| Infra        | Docker Compose · Nginx · Cloudflare · Certbot SSL · Ubuntu VPS (non-root `deploy` user, ufw, SSH keys) |
| Automation   | **Telegram** new-lead alerts · high-priority alert · scheduled daily report |
| Monitoring   | Uptime Kuma + Telegram · `/status` health page with live counts |
| CI/CD        | GitHub + **GitHub Actions** (push to `main` auto-deploys) |

---

## What's implemented

- ✅ Company website: landing, services, **approximate pricing**, contact, and the **lead form** (7 fields)
- ✅ **Customer accounts** — register / log in, submit requests, track them in a **"My Requests"** portal
- ✅ **AI Agent** — 6-step flow (classify → priority → summary → questions → draft reply → estimate)
- ✅ Admin **CRM**: login, lead list, detail, status pipeline, internal notes, assignment
- ✅ Filters: by status, service, and minimum priority
- ✅ **Stats page**: total / high-value / urgent / won / lost / conversion + a 14-day leads line chart
- ✅ Backend API with a **health check** (API / DB / agent) and strict input validation
- ✅ **Automation**: instant **Telegram** new-lead alert, high-priority alert, daily report job (stored in DB)
- ✅ **Live demos** on the site: password-breach checker, AI triage, data extraction, website scanner, live status
- ✅ **7 services** incl. a **$5/mo Website + Domain + Protection** subscription
- ✅ **Installable PWA** (manifest + service worker + icons) with an in-app **Alerts** page
- ✅ **Security headers**: HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, **Content-Security-Policy**
- ✅ Security: bcrypt hashing, rate limiting (login + lead form), ORM, secrets via env, SSRF-guarded scanner
- ✅ **Docker Compose** — one command brings up app + database
- ✅ **Deployed to a VPS** — Ubuntu, non-root `deploy` user, SSH keys, ufw firewall, Nginx + Certbot SSL, Cloudflare
- ✅ **Monitoring** — Uptime Kuma with Telegram down/up alerts + internal `/status` page with **live counts**
- ✅ **CI/CD** — GitHub repo + GitHub Actions; a push to `main` builds and deploys automatically
- ✅ Backup script, `.env.example`, and this README

---

## Screenshots

> Drop the images into `docs/screenshots/` with these names and they'll render here.

| View | File | What it shows |
|------|------|---------------|
| Homepage | `docs/screenshots/01-home.png` | Landing page, services, hero |
| Lead form | `docs/screenshots/02-request.png` | The 7-field service request form |
| AI result | `docs/screenshots/03-ai-analysis.png` | Category · priority · questions · draft reply |
| Admin CRM | `docs/screenshots/04-crm.png` | Lead list + metrics + stats chart |
| Lead detail | `docs/screenshots/05-lead-detail.png` | Status pipeline, notes, assignment |
| Telegram alert | `docs/screenshots/06-telegram.png` | New-lead ping on the phone |
| Status page | `docs/screenshots/07-status.png` | API/DB/Agent health + live counts |
| GitHub Actions | `docs/screenshots/08-cicd.png` | A green auto-deploy run |

<!--
![Homepage](docs/screenshots/01-home.png)
![Lead form](docs/screenshots/02-request.png)
![AI analysis](docs/screenshots/03-ai-analysis.png)
![Admin CRM](docs/screenshots/04-crm.png)
![Lead detail](docs/screenshots/05-lead-detail.png)
![Telegram alert](docs/screenshots/06-telegram.png)
![Status page](docs/screenshots/07-status.png)
![CI/CD](docs/screenshots/08-cicd.png)
-->

---

## Run it — locally with Docker (recommended, one command)

```bash
cp .env.example .env        # then edit POSTGRES_PASSWORD and SESSION_SECRET
docker compose up -d --build
```

Then open:
- Website: <http://localhost:8090>
- Admin:   <http://localhost:8090/admin>  (demo login **admin / admin1234**)

The app container seeds the database (tables + demo data) on first boot.

## Run it — locally without Docker

```bash
# needs a running PostgreSQL and a 'leadflow' database
npm install
export DATABASE_URL="postgresql://USER:PASS@127.0.0.1:5432/leadflow"
export SESSION_SECRET="dev-secret"
npm run seed     # creates tables + demo data
npm start        # http://localhost:3000
```

---

## Deploy on a VPS (production, as actually done)

**1. Harden the server** (Ubuntu): create a non-root `deploy` user with sudo + docker groups,
add your SSH public key, and enable the firewall:

```bash
adduser deploy && usermod -aG sudo,docker deploy
# add your key to /home/deploy/.ssh/authorized_keys
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
```

**2. Deploy the app** (owned by `deploy`, port bound to localhost):

```bash
sudo chown -R deploy:deploy /opt/leadflow
cd /opt/leadflow && cp .env.example .env && nano .env   # set strong secrets + Telegram token/chat id
docker compose up -d --build
```

**3. Reverse proxy + HTTPS:**

```bash
sudo cp deploy/nginx.leadflow.conf /etc/nginx/sites-available/leadflow
sudo ln -s /etc/nginx/sites-available/leadflow /etc/nginx/sites-enabled/leadflow
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d shop.cookblog.net
```

**4. DNS + protection (Cloudflare):** point the (sub)domain at the server (A record, proxied),
set SSL/TLS to **Full (strict)**, which enables DDoS protection; optionally add a Rate-Limiting / WAF rule.

**5. Create the admin account** (works even after customers have registered):

```bash
docker compose exec app node scripts/ensure-admin.js          # admin / admin1234
# or promote your own account:
docker compose exec app node scripts/ensure-admin.js YOURNAME YOURPASSWORD
```

## CI/CD — auto-deploy on push

`.github/workflows/deploy.yml` runs on every push to `main`: it SSHes to the VPS (key stored in the
`VPS_SSH_KEY` GitHub secret, host/user in `VPS_HOST` / `VPS_USER`), copies the code, and runs
`docker compose up -d --build`. Day-to-day deploys are just:

```bash
git add . && git commit -m "…" && git push
```

---

## API endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/auth/register` | – | Register a **customer** account |
| POST | `/api/auth/login` | – | Log in |
| POST | `/api/auth/logout` | – | Log out |
| GET  | `/api/auth/me` | – | Current user |
| GET  | `/api/services` | – | Service catalog (public) |
| POST | `/api/leads` | customer | **Submit a request** → runs AI analysis + alerts |
| GET  | `/api/my/leads` | customer | The signed-in customer's own requests + status |
| GET  | `/api/leads` | staff | List leads (`?status=&serviceType=&minPriority=`) |
| GET  | `/api/leads/:id` | staff | Lead detail + analysis + notes |
| PATCH| `/api/leads/:id` | staff | Update status / assignment |
| POST | `/api/leads/:id/notes` | staff | Add internal note |
| POST | `/api/leads/:id/analyze` | staff | Re-run the AI analysis |
| GET  | `/api/users` | staff | Team members (for assignment) |
| GET  | `/api/stats` | staff | Metrics + per-day + breakdowns |
| GET  | `/api/alerts` | staff | Recent new-lead / daily-report alerts |
| POST | `/api/telegram/test` | staff | Send a test Telegram message |
| GET  | `/api/tools/scan` | – | Website security scanner (SSRF-guarded) |
| GET  | `/api/tools/status` | – | Live up/down of monitored sites |
| GET  | `/api/health` | – | Health of API / DB / agent + live counts |

---

## Database schema (6 tables)

- **users** — id, username, passwordHash (bcrypt), **role (ADMIN / SALES / CUSTOMER)**, timestamps
- **services** — id, name, description, basePrice, keywords (used by the agent)
- **leads** — id, name, phone, email, serviceType, problem, urgency, budget, status, assignedToId, **customerId**, timestamps
- **lead_notes** — id, leadId, authorId, text, createdAt
- **ai_analysis** — id, leadId, category, priority, urgencyLabel, estimateHours, summary, questions, draftReply
- **activity_logs** — id, userId, action, detail, createdAt

Relations: a lead has one analysis, many notes, an optional assignee (staff) and an optional owner
(the customer who placed it). Defined in `src/db.js`.

---

## AI Agent flow

The agent (`src/agent/analyze.js`) is a deterministic rule-based flow — no external API, no key, no
cost — that mirrors the LangGraph flow in the brief:

1. **Classify service** — keyword overlap against the catalog (Account Security, Servers/RDP, Automation, Docker/DevOps, Cloudflare/Network, Monitoring, Website+Domain+Protection).
2. **Score priority (1–10)** — from urgency + budget + security-sensitivity + description detail.
3. **Summarize** — a one-line summary for the salesperson.
4. **Follow-up questions** — tailored to the detected service.
5. **Draft reply** — a ready-to-send professional response.
6. **Hours estimate** — a range based on the service type.

Example — input *"I keep getting login attempts on my Gmail and Facebook and I want to secure my
accounts"* → **Account Security · Priority 8 · Urgent · 2–4 hours** + tailored questions + a drafted
reply. The result is saved to `ai_analysis` and shown in the CRM. (Swappable for a real LLM later —
same `analyzeLead()` interface.)

---

## Security

- Passwords hashed with **bcrypt**; sessions are HMAC-signed httpOnly cookies (30-day expiry).
- **Roles** — CUSTOMER (portal only) vs staff ADMIN/SALES (CRM); `requireAuth` vs `requireStaff` guards.
- **Sequelize ORM** → all queries parameterized (no string-built SQL).
- **Rate limiting** on login (20 / 15 min) and the lead form (30 / hour).
- **Security headers** on every response: HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, and a tailored **Content-Security-Policy**.
- The website-scanner endpoint is **SSRF-guarded** (blocks localhost / private IPs).
- Secrets (DB password, session secret, Telegram token) come from **environment variables**, never committed (`.env` is git-ignored).

## Monitoring & backups

- `GET /api/health` returns the status of API, DB, and agent, plus live counts (leads, today, open, customers) and DB latency.
- Internal **`/status`** page renders that health + live numbers, auto-refreshing.
- **Uptime Kuma** monitors the public sites and sends **Telegram** alerts on down → up transitions.
- `deploy/backup-db.sh` — gzipped `pg_dump`, timestamped, auto-prunes after 14 days (cron-ready).

## Automation

- New lead → instant **Telegram** alert to the owner (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`).
- Priority ≥ threshold → an extra **high-priority alert**.
- **Daily report** job writes a summary to `activity_logs` and posts it to Telegram.
- Optional generic `WEBHOOK_URL` (Slack/Discord/custom) and optional SMTP email (owner notify + customer auto-reply).

---

## Problems hit & how they were solved

- **Prisma engine binaries were blocked in the build environment**, which would have left the DB
  layer untested. Switched to **Sequelize** — still an ORM (SQL-injection safe per the brief), but
  pure-JavaScript, so the whole stack could be tested end-to-end against a real Postgres.
- **Express 5 wildcard routes crashed** (`app.get("*")` throws with the new path-to-regexp). Replaced
  the SPA fallback with a `app.use()` middleware that serves `index.html` for GET requests.
- **Telegram alerts didn't fire during a redeploy.** Uptime Kuma only alerts after several consecutive
  failed checks and only on an **up → down transition**, so a 3-second restart never registered. Fixed
  the test by lowering the monitor's interval/retries and forcing a real transition (stopping the
  container), not by "fixing" a non-bug.
- **New-lead alerts needed a real Telegram sender.** A generic webhook won't work — Telegram's
  `sendMessage` needs `chat_id` + `text` to `api.telegram.org` — so a dedicated `src/telegram.js`
  reads the token/chat id from env and posts the formatted alert.
- **GitHub Actions deploy failed with "can't connect without a private SSH key."** A dedicated deploy
  keypair was generated, its public half added to the `deploy` user, and the private half stored as
  the `VPS_SSH_KEY` repo secret (host/user as `VPS_HOST` / `VPS_USER`).
- **`scp`/deploy hit "Permission denied" on `/opt`.** The app folders were root-owned; `chown`-ing
  them to the `deploy` user made key-based, password-less deploys work.
- **Admin login failed on the live DB.** The seed only creates the admin when the DB is empty, so once
  customers had registered it skipped it. Added `scripts/ensure-admin.js` to create/repair an admin
  regardless of existing users.
- **certbot couldn't find the server block** — the `sites-enabled` symlink was missing; writing the
  Nginx config and symlinking it fixed SSL issuance.

## What's next

- Swap the rule-based agent for a real LLM (OpenAI/Anthropic) behind the same `analyzeLead()` interface.
- Customer email auto-replies via a transactional provider (Brevo) from a domain mailbox.
- Push notifications from the PWA; an audit-log page; PDF quote generation.
- A Cloudflare WAF / rate-limit rule and a scheduled DB-backup cron.

---

## Demo accounts (seeded)

- **admin / admin1234** — ADMIN
- **sales / sales1234** — SALES

Change these before any real use.
