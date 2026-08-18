const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");

const { initDb, sequelize, User, Service, Lead, LeadNote, AiAnalysis, ActivityLog } = require("./db");
const { analyzeLead } = require("./agent/analyze");
const { analyzeLeadGraph, agentChat } = require("./agent/graph");
const { onNewLead, startDailyReportJob } = require("./automation");
const { sendTelegram, telegramEnabled } = require("./telegram");
const { Op } = require("sequelize");

const app = express();
const port = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";
const isProd = process.env.NODE_ENV === "production";

app.set("trust proxy", 1); // behind Nginx/Cloudflare

// ---------- Security headers ----------
// CSP is tailored to what the site actually loads: inline scripts/styles, Google
// Fonts, images over https, and the HaveIBeenPwned API used by the security demo.
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https:",
  "connect-src 'self' https://api.pwnedpasswords.com",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "manifest-src 'self'",
  "worker-src 'self'"
].join("; ");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Content-Security-Policy", CSP);
  next();
});
// ---------- CORS ----------
// The front-end is served from the SAME origin as the API, so cross-origin
// access is locked to an explicit allowlist — never "*". Because the app uses
// cookies, the allowed origin is reflected (a wildcard can't be used with
// credentials) and preflight requests are answered.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://shop.cookblog.net,http://localhost:8090")
  .split(",").map((s) => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(cookieParser());
app.use(express.json({ limit: "200kb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

// ---------- Rate limiting (login + public lead form) ----------
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: "Too many attempts. Please wait a few minutes." } });
const leadLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: "Too many submissions from this network. Please try again later." } });

// ---------- Sessions (signed cookie token) ----------
function sign(v) { return crypto.createHmac("sha256", SESSION_SECRET).update(v).digest("hex"); }
function makeToken(userId) {
  const payload = Buffer.from(JSON.stringify({ userId, t: Date.now() })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
async function getSessionUser(req) {
  const token = req.cookies.session;
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (sign(payload) !== sig) return null;
  try {
    const { userId } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const user = await User.findByPk(userId);
    return user ? { id: user.id, username: user.username, role: user.role } : null;
  } catch { return null; }
}
function setSession(res, userId) {
  res.cookie("session", makeToken(userId), { httpOnly: true, sameSite: "lax", secure: isProd, maxAge: 30 * 24 * 3600 * 1000 });
}
async function requireAuth(req, res, next) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Please log in." });
  req.user = user;
  next();
}
// Staff-only (ADMIN or SALES) — protects the CRM from customer accounts.
async function requireStaff(req, res, next) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Please log in." });
  if (user.role !== "ADMIN" && user.role !== "SALES") return res.status(403).json({ error: "Staff only." });
  req.user = user;
  next();
}
async function logActivity(userId, action, detail, leadId) {
  try { await ActivityLog.create({ userId: userId || null, action, detail: String(detail).slice(0, 300), leadId: leadId || null }); } catch {}
}

// ================= AUTH =================
app.post("/api/auth/register", loginLimiter, async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  if (username.length < 3 || username.length > 32) return res.status(400).json({ error: "Username must be 3-32 characters." });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  if (await User.findOne({ where: { username } })) return res.status(409).json({ error: "That username is already taken." });
  // Public signups are CUSTOMERS. Staff (ADMIN/SALES) come from the seed.
  const user = await User.create({ username, passwordHash: await bcrypt.hash(password, 10), role: "CUSTOMER" });
  setSession(res, user.id);
  await logActivity(user.id, "REGISTER", `${username} (CUSTOMER)`);
  res.status(201).json({ user: { id: user.id, username, role: "CUSTOMER" } });
});

app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  const user = await User.findOne({ where: { username } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid username or password." });
  }
  setSession(res, user.id);
  await logActivity(user.id, "LOGIN", username);
  res.json({ user: { id: user.id, username: user.username, role: user.role } });
});

app.post("/api/auth/logout", (_req, res) => { res.clearCookie("session"); res.json({ ok: true }); });
app.get("/api/auth/me", async (req, res) => { res.json({ user: await getSessionUser(req) }); });

// ================= SERVICES (public) =================
app.get("/api/services", async (_req, res) => {
  const services = await Service.findAll({ order: [["name", "ASC"]] });
  res.json({ services });
});

// ================= LEADS =================
const URGENCY = ["low", "normal", "high", "urgent"];
const STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL_SENT", "WON", "LOST"];

// Customer: place a service request (must be logged in). Validated, then AI analysis.
app.post("/api/leads", leadLimiter, requireAuth, async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || "").trim();
  const phone = String(b.phone || "").trim();
  const email = String(b.email || "").trim();
  const serviceType = String(b.serviceType || "").trim();
  const problem = String(b.problem || "").trim();
  const urgency = String(b.urgency || "normal").trim().toLowerCase();
  const budget = String(b.budget || "").trim();

  const errors = [];
  if (name.length < 2) errors.push("Please enter your name.");
  if (!/^[0-9+()\-\s]{6,20}$/.test(phone)) errors.push("Please enter a valid phone number.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push("Please enter a valid email address.");
  if (!serviceType) errors.push("Please choose a service.");
  if (problem.length < 10) errors.push("Please describe your problem (at least 10 characters).");
  if (!URGENCY.includes(urgency)) errors.push("Please choose an urgency level.");
  if (errors.length) return res.status(400).json({ error: errors[0], errors });

  const lead = await Lead.create({ name, phone, email, serviceType, problem, urgency, budget: budget || "Not stated", customerId: req.user.id });

  // Run the AI agent flow and store the result.
  const analysis = await analyzeLeadGraph(lead);
  await AiAnalysis.create({ leadId: lead.id, ...analysis });

  // The agent's reply is sent to the customer automatically (visible in "My Requests").
  if (analysis.draftReply) {
    lead.reply = String(analysis.draftReply).slice(0, 4000);
    lead.repliedAt = new Date();
    await lead.save();
  }

  await logActivity(req.user.id, "NEW_LEAD", `${name} · ${analysis.category} · P${analysis.priority}`, lead.id);

  // Fire automations (webhook + high-priority alert + email) without blocking the response.
  onNewLead(lead, analysis).catch(() => {});

  res.status(201).json({
    ok: true,
    message: "Your request has been received — our AI has already sent you a reply, and our team will follow up.",
    lead: { id: lead.id },
    analysis: {
      category: analysis.category,
      estimateHours: analysis.estimateHours,
      urgencyLabel: analysis.urgencyLabel,
      questions: analysis.questions,
      reply: lead.reply
    }
  });
});

// Live AI chat for the request page (LangGraph + LangChain).
const chatLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false, message: { error: "Too many messages — please wait a moment." } });
app.post("/api/agent/chat", chatLimiter, requireAuth, async (req, res) => {
  const history = Array.isArray(req.body.messages) ? req.body.messages : [];
  const clean = history
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-12)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 1000) }));
  if (!clean.length || clean[clean.length - 1].role !== "user") {
    return res.status(400).json({ error: "Send a message to the assistant." });
  }
  const out = await agentChat(clean);
  res.json({ reply: out.reply, engine: out.engine });
});

// Customer: my own requests, with a friendly status.
const CUSTOMER_STATUS = {
  NEW: "Received", CONTACTED: "In progress", QUALIFIED: "In progress",
  PROPOSAL_SENT: "Quote sent", WON: "Completed", LOST: "Closed"
};
app.get("/api/my/leads", requireAuth, async (req, res) => {
  const leads = await Lead.findAll({
    where: { customerId: req.user.id },
    order: [["createdAt", "DESC"]],
    include: [{ model: AiAnalysis, as: "analysis" }]
  });
  const out = leads.map((l) => {
    const j = l.toJSON();
    j.statusLabel = CUSTOMER_STATUS[j.status] || j.status;
    return j;
  });
  res.json({ leads: out });
});

// Admin: list leads with filters (status, serviceType, minPriority).
app.get("/api/leads", requireStaff, async (req, res) => {
  const where = {};
  if (req.query.status) where.status = String(req.query.status);
  if (req.query.serviceType) where.serviceType = String(req.query.serviceType);
  const minPriority = Number(req.query.minPriority || 0);

  let leads = await Lead.findAll({
    where,
    order: [["createdAt", "DESC"]],
    include: [
      { model: AiAnalysis, as: "analysis" },
      { model: User, as: "assignedTo", attributes: ["id", "username"] },
      { model: LeadNote, as: "notes", attributes: ["id"] }
    ]
  });
  let out = leads.map((l) => {
    const j = l.toJSON();
    j.noteCount = (j.notes || []).length;
    delete j.notes;
    return j;
  });
  if (minPriority > 0) out = out.filter((l) => (l.analysis?.priority || 0) >= minPriority);
  res.json({ leads: out });
});

// Admin: full lead detail.
app.get("/api/leads/:id", requireStaff, async (req, res) => {
  const lead = await Lead.findByPk(req.params.id, {
    include: [
      { model: AiAnalysis, as: "analysis" },
      { model: User, as: "assignedTo", attributes: ["id", "username"] },
      { model: LeadNote, as: "notes", include: [{ model: User, as: "author", attributes: ["username"] }] }
    ],
    order: [[{ model: LeadNote, as: "notes" }, "createdAt", "ASC"]]
  });
  if (!lead) return res.status(404).json({ error: "Lead not found." });
  res.json({ lead });
});

// Admin: update status / assignment.
app.patch("/api/leads/:id", requireStaff, async (req, res) => {
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) return res.status(404).json({ error: "Lead not found." });
  if (req.body.status !== undefined) {
    if (!STATUSES.includes(req.body.status)) return res.status(400).json({ error: "Invalid status." });
    lead.status = req.body.status;
  }
  if (req.body.assignedToId !== undefined) lead.assignedToId = req.body.assignedToId || null;
  await lead.save();
  await logActivity(req.user.id, "UPDATE_LEAD", `${lead.id} -> ${lead.status}`);
  res.json({ lead });
});

// Admin: add an internal note.
app.post("/api/leads/:id/notes", requireStaff, async (req, res) => {
  const text = String(req.body.text || "").trim();
  if (text.length < 1) return res.status(400).json({ error: "Note cannot be empty." });
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) return res.status(404).json({ error: "Lead not found." });
  const note = await LeadNote.create({ leadId: lead.id, authorId: req.user.id, text: text.slice(0, 1000) });
  res.status(201).json({ note });
});

// Staff: send a reply to the customer (stored on the lead, visible in their portal).
app.post("/api/leads/:id/reply", requireStaff, async (req, res) => {
  const text = String(req.body.text || "").trim();
  if (text.length < 1) return res.status(400).json({ error: "Reply cannot be empty." });
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) return res.status(404).json({ error: "Lead not found." });
  lead.reply = text.slice(0, 4000);
  lead.repliedAt = new Date();
  if (lead.status === "NEW") lead.status = "CONTACTED";   // replying moves it along the pipeline
  await lead.save();
  await logActivity(req.user.id, "REPLY_SENT", `${lead.name} · reply sent to customer`, lead.id);
  res.json({ ok: true, lead: { id: lead.id, reply: lead.reply, repliedAt: lead.repliedAt, status: lead.status } });
});

// Admin: re-run the AI analysis for a lead.
app.post("/api/leads/:id/analyze", requireStaff, async (req, res) => {
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) return res.status(404).json({ error: "Lead not found." });
  const analysis = await analyzeLeadGraph(lead);
  const existing = await AiAnalysis.findOne({ where: { leadId: lead.id } });
  const saved = existing ? await existing.update(analysis) : await AiAnalysis.create({ leadId: lead.id, ...analysis });
  res.json({ analysis: saved });
});

// Admin: list team members (for the assignment dropdown).
app.get("/api/users", requireStaff, async (_req, res) => {
  const users = await User.findAll({ attributes: ["id", "username", "role"], order: [["username", "ASC"]] });
  res.json({ users });
});

// ================= STATS =================
app.get("/api/stats", requireStaff, async (_req, res) => {
  const leads = await Lead.findAll({ include: [{ model: AiAnalysis, as: "analysis" }] });
  const total = leads.length;
  const won = leads.filter((l) => l.status === "WON").length;
  const lost = leads.filter((l) => l.status === "LOST").length;
  const highValue = leads.filter((l) => (l.analysis?.priority || 0) >= 8).length;
  const urgent = leads.filter((l) => ["high", "urgent"].includes(String(l.urgency).toLowerCase())).length;
  const conversion = total ? Math.round((won / total) * 100) : 0;

  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const next = new Date(d); next.setDate(d.getDate() + 1);
    const count = leads.filter((l) => new Date(l.createdAt) >= d && new Date(l.createdAt) < next).length;
    days.push({ date: d.toISOString().slice(0, 10), count });
  }

  const byStatus = {};
  for (const s of STATUSES) byStatus[s] = leads.filter((l) => l.status === s).length;
  const byCategory = {};
  for (const l of leads) { const c = l.analysis?.category || "Uncategorized"; byCategory[c] = (byCategory[c] || 0) + 1; }

  res.json({ metrics: { total, won, lost, highValue, urgent, conversion }, perDay: days, byStatus, byCategory });
});

// ================= LIVE DEMO TOOLS =================
// Server-side URL checks power the "Website Scanner" and "Live Status" demos.
// An SSRF guard blocks private/loopback hosts so the scanner can't be abused.
const net = require("net");
const dnsp = require("dns").promises;
function isPrivateIp(ip) {
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (net.isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const v6 = ip.toLowerCase();
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}
async function assertPublicHost(host) {
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("blocked");
  const addrs = net.isIP(host) ? [host] : (await dnsp.lookup(host, { all: true })).map((a) => a.address);
  if (!addrs.length || addrs.some(isPrivateIp)) throw new Error("blocked");
}

async function probe(rawUrl) {
  let url;
  try { url = new URL(/^https?:\/\//.test(rawUrl) ? rawUrl : "https://" + rawUrl); } catch { throw new Error("Enter a valid domain, e.g. example.com"); }
  if (!/^https?:$/.test(url.protocol)) throw new Error("Only http/https URLs are supported.");
  await assertPublicHost(url.hostname);
  const started = Date.now();
  const r = await fetch(url.toString(), { redirect: "follow", signal: AbortSignal.timeout(8000), headers: { "user-agent": "LeadFlow-Scanner/1.0" } });
  const ms = Date.now() - started;
  const h = {}; r.headers.forEach((v, k) => { h[k] = v; });
  const cloudflare = !!(h["cf-ray"] || String(h["server"] || "").toLowerCase().includes("cloudflare"));
  return {
    url: url.toString(), finalUrl: r.url, status: r.status, https: r.url.startsWith("https:"),
    responseMs: ms, server: h["server"] || "unknown", cloudflare,
    securityHeaders: {
      "HSTS (Strict-Transport-Security)": !!h["strict-transport-security"],
      "X-Content-Type-Options": !!h["x-content-type-options"],
      "X-Frame-Options": !!h["x-frame-options"],
      "Content-Security-Policy": !!h["content-security-policy"]
    }
  };
}

app.get("/api/tools/scan", async (req, res) => {
  try {
    const data = await probe(String(req.query.url || ""));
    res.json({ ok: true, ...data });
  } catch (e) {
    const msg = e.message === "blocked" ? "That host isn't allowed." : (e.name === "TimeoutError" ? "The site took too long to respond." : (e.message || "Could not reach the site."));
    res.status(400).json({ ok: false, error: msg });
  }
});

// Live status of our own hosted sites (proof of monitoring + multi-site hosting).
const MONITOR_SITES = (process.env.MONITOR_SITES || "https://cookblog.net,https://shop.cookblog.net,https://google.com,https://github.com,https://cloudflare.com")
  .split(",").map((s) => s.trim()).filter(Boolean);
app.get("/api/tools/status", async (_req, res) => {
  const sites = await Promise.all(MONITOR_SITES.map(async (u) => {
    const s = Date.now();
    try {
      const r = await fetch(u, { redirect: "follow", signal: AbortSignal.timeout(6000), headers: { "user-agent": "LeadFlow-Monitor/1.0" } });
      return { url: u, up: r.status < 500, status: r.status, ms: Date.now() - s };
    } catch (e) {
      return { url: u, up: false, status: 0, ms: Date.now() - s, error: e.name === "TimeoutError" ? "timeout" : "unreachable" };
    }
  }));
  res.json({ sites, checkedAt: new Date().toISOString() });
});

// ================= HEALTH =================
app.get("/api/health", async (_req, res) => {
  let db = "ok";
  let dbMs = null;
  const t0 = Date.now();
  try { await sequelize.query("SELECT 1"); dbMs = Date.now() - t0; } catch { db = "down"; }

  // Live counts for the status page (best-effort; never fail the health check on them).
  let counts = null;
  if (db === "ok") {
    try {
      const since = new Date(); since.setHours(0, 0, 0, 0);
      const [leads, leadsToday, customers, openLeads] = await Promise.all([
        Lead.count(),
        Lead.count({ where: { createdAt: { [Op.gte]: since } } }),
        User.count({ where: { role: "CUSTOMER" } }),
        Lead.count({ where: { status: { [Op.in]: ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL_SENT"] } } })
      ]);
      counts = { leads, leadsToday, customers, openLeads };
    } catch { counts = null; }
  }

  res.status(db === "ok" ? 200 : 503).json({
    status: db === "ok" ? "ok" : "degraded",
    uptime: Math.round(process.uptime()),
    services: { api: "ok", db, agent: "ok" },
    dbLatencyMs: dbMs,
    counts,
    time: new Date().toISOString()
  });
});

// ================= ALERTS (staff) =================
// Recent notable events (new leads, high-priority, daily reports) — powers the
// in-app Alerts page and demonstrates the notification pipeline.
app.get("/api/alerts", requireStaff, async (_req, res) => {
  const logs = await ActivityLog.findAll({
    where: { action: { [Op.in]: ["NEW_LEAD", "DAILY_REPORT", "REPLY_SENT"] } },
    order: [["createdAt", "DESC"]],
    limit: 40
  });
  const alerts = logs.map((l) => ({
    id: l.id,
    action: l.action,
    detail: l.detail,
    at: l.createdAt,
    leadId: l.leadId,
    high: l.action === "NEW_LEAD" && /P(?:8|9|10)\b/.test(l.detail || "")
  }));
  res.json({ alerts, telegram: telegramEnabled() });
});

// Staff: send a test Telegram message to confirm the bot is wired up.
app.post("/api/telegram/test", requireStaff, async (req, res) => {
  if (!telegramEnabled()) return res.status(400).json({ ok: false, error: "Telegram is not configured on the server (set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID)." });
  const ok = await sendTelegram(`✅ <b>LeadFlow test</b>\nTelegram alerts are working — sent by ${req.user.username} at ${new Date().toLocaleString()}.`);
  res.status(ok ? 200 : 502).json({ ok, message: ok ? "Test message sent — check your Telegram." : "Telegram rejected the message. Check the token and chat ID." });
});

// ---------- Admin SPA ----------
app.get(["/admin", "/admin/*"], (_req, res) => res.sendFile(path.join(__dirname, "..", "public", "admin.html")));
app.get("/status", (_req, res) => res.sendFile(path.join(__dirname, "..", "public", "status.html")));
app.get("/alerts", (_req, res) => res.sendFile(path.join(__dirname, "..", "public", "alerts.html")));

// ---------- Fallback (public site) ----------
app.use((req, res, next) => { if (req.method !== "GET") return next(); res.sendFile(path.join(__dirname, "..", "public", "index.html")); });

initDb()
  .then(() => {
    app.listen(port, () => { console.log(`LeadFlow AI running on ${port}`); startDailyReportJob(); });
  })
  .catch((err) => { console.error("DB init failed:", err.message); process.exit(1); });
