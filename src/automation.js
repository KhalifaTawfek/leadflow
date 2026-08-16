// Automation / integration layer.
// - New lead        -> webhook notification (Telegram/Slack/Discord/generic)
// - High priority    -> extra alert
// - Daily report     -> scheduled job writing a summary to activity_logs
//
// All outbound calls are best-effort: if no webhook URL is configured, or the
// call fails, it's logged and ignored so it never blocks a lead being saved.

const { Lead, ActivityLog } = require("./db");
const { Op } = require("sequelize");
const { notifyOwnerOfLead, autoReplyToCustomer } = require("./email");
const { notifyLeadTelegram } = require("./telegram");

const WEBHOOK_URL = process.env.WEBHOOK_URL || "";
const HIGH_PRIORITY_THRESHOLD = Number(process.env.HIGH_PRIORITY_THRESHOLD || 8);

async function postWebhook(text) {
  if (!WEBHOOK_URL) { console.log("[automation] (no WEBHOOK_URL) would send:", text.split("\n")[0]); return; }
  try {
    // Generic JSON — works with Slack/Discord ("content"/"text") and custom endpoints.
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, content: text }),
      signal: AbortSignal.timeout(6000)
    });
  } catch (err) {
    console.error("[automation] webhook failed:", err.message);
  }
}

async function onNewLead(lead, analysis) {
  const lines = [
    `🟢 New lead: ${lead.name}`,
    `Service: ${analysis.category} · Priority ${analysis.priority}/10 (${analysis.urgencyLabel})`,
    `Budget: ${lead.budget || "—"} · Estimate: ${analysis.estimateHours}`,
    `"${lead.problem.slice(0, 140)}"`
  ];
  await postWebhook(lines.join("\n"));

  if (analysis.priority >= HIGH_PRIORITY_THRESHOLD) {
    await postWebhook(`🚨 HIGH-PRIORITY lead (${analysis.priority}/10): ${lead.name} — ${analysis.category}. Contact ASAP.`);
  }

  // Instant Telegram alert to the owner's phone (best-effort).
  await notifyLeadTelegram(lead, analysis);

  // Real email: notify the owner, and auto-acknowledge the customer.
  await Promise.allSettled([
    notifyOwnerOfLead(lead, analysis),
    autoReplyToCustomer(lead, analysis)
  ]);
}

// Build and store a daily summary. Safe to call repeatedly.
async function runDailyReport() {
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const [total, todays, won] = await Promise.all([
      Lead.count(),
      Lead.count({ where: { createdAt: { [Op.gte]: since } } }),
      Lead.count({ where: { status: "WON" } })
    ]);
    const detail = `24h leads: ${todays} · total: ${total} · won: ${won}`;
    await ActivityLog.create({ action: "DAILY_REPORT", detail });
    await postWebhook(`📊 Daily report — ${detail}`);
    console.log("[automation] daily report:", detail);
  } catch (err) {
    console.error("[automation] daily report failed:", err.message);
  }
}

// Fire the daily report every 24h (and once ~10s after boot for demо visibility).
function startDailyReportJob() {
  setTimeout(runDailyReport, 10000);
  setInterval(runDailyReport, 24 * 3600 * 1000);
}

module.exports = { onNewLead, runDailyReport, startDailyReportJob };
