// Telegram notifications via the Bot API.
// Configure with env vars TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.
// If either is missing, every call is a no-op that just logs - so the app
// still runs fine without Telegram set up.
//
// Unlike a generic webhook, Telegram's sendMessage needs a specific shape:
//   POST https://api.telegram.org/bot<TOKEN>/sendMessage
//   { chat_id, text, parse_mode }
// so this is a dedicated sender rather than the generic postWebhook.

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

const telegramEnabled = () => !!(BOT_TOKEN && CHAT_ID);

// Escape the handful of characters that break Telegram HTML parse_mode.
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendTelegram(text) {
  if (!telegramEnabled()) {
    console.log("[telegram] (not configured) would send:", String(text).split("\n")[0]);
    return false;
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true
      }),
      signal: AbortSignal.timeout(6000)
    });
    const data = await r.json().catch(() => ({}));
    if (!data.ok) {
      console.error("[telegram] send failed:", data.description || r.status);
      return false;
    }
    console.log("[telegram] sent:", String(text).split("\n")[0]);
    return true;
  } catch (err) {
    console.error("[telegram] send error:", err.message);
    return false;
  }
}

// Formatted new-lead alert for the shop owner's phone.
async function notifyLeadTelegram(lead, analysis) {
  const high = analysis.priority >= 8 ? "🚨 <b>HIGH PRIORITY request</b>\n" : "🟢 <b>New request</b>\n";
  const text = [
    high,
    `<b>${esc(lead.name)}</b> - ${esc(lead.serviceType || analysis.category)}`,
    `Priority ${analysis.priority}/10 · ${esc(analysis.urgencyLabel)}`,
    `📞 ${esc(lead.phone)}  ✉️ ${esc(lead.email)}`,
    ``,
    `“${esc(String(lead.problem).slice(0, 700))}”`,
    ``,
    `Reply from the admin panel: /admin`
  ].join("\n");
  return sendTelegram(text);
}

// A customer wrote a new message on one of their requests.
async function notifyMessageTelegram(lead, text) {
  return sendTelegram([
    `💬 <b>New message from ${esc(lead.name)}</b>`,
    `On: ${esc(lead.serviceType || "their request")} · ✉️ ${esc(lead.email)}`,
    ``,
    `“${esc(String(text).slice(0, 700))}”`,
    ``,
    `Reply from the admin panel: /admin`
  ].join("\n"));
}

module.exports = { sendTelegram, notifyLeadTelegram, notifyMessageTelegram, telegramEnabled };
