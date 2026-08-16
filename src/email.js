// Real email sending via SMTP (nodemailer).
// Configure with env vars (see .env.example). If SMTP isn't configured, every
// call is a no-op that just logs — so the app still works without email set up.

const nodemailer = require("nodemailer");

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const MAIL_FROM = process.env.MAIL_FROM || SMTP_USER;
const MAIL_TO = process.env.MAIL_TO || SMTP_USER;                 // shop owner inbox
const AUTO_REPLY = String(process.env.AUTO_REPLY || "true") === "true";

let transporter = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // 465 = implicit TLS; 587 = STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  transporter.verify().then(() => console.log("[email] SMTP ready:", SMTP_HOST)).catch((e) => console.error("[email] SMTP verify failed:", e.message));
} else {
  console.log("[email] SMTP not configured — emails will be logged, not sent.");
}

const emailEnabled = () => !!transporter;

async function sendMail({ to, subject, text, replyTo }) {
  if (!transporter) { console.log(`[email] (SMTP off) would send to ${to}: ${subject}`); return false; }
  if (!to) return false;
  try {
    await transporter.sendMail({ from: MAIL_FROM, to, subject, text, replyTo });
    console.log(`[email] sent to ${to}: ${subject}`);
    return true;
  } catch (err) {
    console.error("[email] send failed:", err.message);
    return false;
  }
}

// Notify the shop owner that a new enquiry arrived, with the AI analysis attached.
async function notifyOwnerOfLead(lead, analysis) {
  const subject = `${analysis.priority >= 8 ? "🚨 HIGH-PRIORITY " : ""}New enquiry: ${lead.name} — ${analysis.category} (P${analysis.priority})`;
  const text = [
    `New enquiry from your website:`,
    ``,
    `Name:     ${lead.name}`,
    `Email:    ${lead.email}`,
    `Phone:    ${lead.phone}`,
    `Service:  ${analysis.category}`,
    `Urgency:  ${analysis.urgencyLabel}`,
    `Budget:   ${lead.budget}`,
    `Lead time:${analysis.estimateHours}`,
    ``,
    `Their message:`,
    lead.problem,
    ``,
    `— AI summary —`,
    analysis.summary,
    ``,
    `Suggested reply:`,
    analysis.draftReply,
    ``,
    `(Reply directly to this email to reach the customer.)`
  ].join("\n");
  return sendMail({ to: MAIL_TO, subject, text, replyTo: lead.email });
}

// Send the customer an automatic acknowledgement with the drafted reply.
async function autoReplyToCustomer(lead, analysis) {
  if (!AUTO_REPLY) return false;
  return sendMail({
    to: lead.email,
    subject: "Thanks for your request — LeadFlow AI",
    text: analysis.draftReply,
    replyTo: MAIL_TO
  });
}

module.exports = { sendMail, notifyOwnerOfLead, autoReplyToCustomer, emailEnabled };
