// Instant answers for the site chatbot. Used on their own when no LLM key is set,
// and as the fact sheet the LLM is given when one is.
const rules = require("./analyze");

const PLANS_TEXT = "Starter €19/mo (hosting, SSL, Cloudflare protection, weekly backups, uptime monitoring), " +
  "Business €39/mo (adds a domain, about an hour of edits a month and a monthly report) and " +
  "Pro €79/mo (priority fixes, security hardening, business email and more edit time)";

const serviceNames = (services) => services.map((s) => s.name).join(", ");
function cheapest(services) {
  const nums = services.filter((s) => !/month|\/mo/i.test(s.basePrice)).map((s) => parseInt(String(s.basePrice).replace(/[^0-9]/g, ""), 10)).filter((n) => n > 0);
  return nums.length ? `€${Math.min(...nums)}` : "a small fixed price";
}
function findService(services, category) {
  const c = String(category).toLowerCase();
  return services.find((s) => s.name.toLowerCase() === c) ||
    services.find((s) => c.split(/[\s/&+]+/).some((w) => w.length > 3 && s.name.toLowerCase().includes(w)));
}

// Ordered: the first matching intent wins.
const INTENTS = [
  { re: /\b(thanks|thank you|thx|cheers|bye|goodbye|see you)\b/i,
    reply: () => "You're welcome! Whenever you're ready, hit \"Request a service\" and we'll take it from there." },
  { re: /\b(call|meeting|meet|zoom|discord|video|talk to (someone|you|a person)|speak to)\b/i,
    reply: () => "Happy to talk it through. Send a request first, then in My Requests we'll agree a time and send you a Google Meet or Discord link." },
  { re: /\b(pay|payment|invoice|card|paypal|refund|deposit|vat)\b/i,
    reply: () => "Nothing is charged up front. We send you an offer first and you only pay once you accept it. Monthly plans are billed in advance and you can cancel any time." },
  { re: /\b(how long|how fast|how quickly|response time|turnaround|reply time)\b/i,
    reply: () => "We usually reply within one business day, and urgent problems are moved to the front of the queue. Small fixes are often done the same day." },
  { re: /\b(where are you|located|location|which country|based in|remote)\b/i,
    reply: () => "We work fully remote and help businesses anywhere, mostly small companies in Europe." },
  { re: /\b(contact|e-?mail you|reach you|phone number|whatsapp|get in touch)\b/i,
    reply: () => "The quickest way to reach us is to send a request from your account. We reply within one business day, and you can message the team there any time." },
  { re: /\b(human|real person|agent|operator|someone real)\b/i,
    reply: () => "A real person on our team reviews every request. Send one and we'll get back to you within a business day." },
  { re: /\b(demo|demos|tools?|reverse.?engineer|analy[sz]e (a|my) (site|website)|check my (site|domain|email))\b/i,
    reply: () => "Try our live tools under \"Live Demos\": reverse-engineer any website's design and tech stack, check a domain's email and SSL setup, or scan a site's security headers." },
  { re: /\b(price|prices|pricing|cost|costs|how much|plans?|subscription|monthly|per month|cheap|budget|quote)\b/i,
    reply: (s) => `Our monthly plans are ${PLANS_TEXT}. One-off projects start from ${cheapest(s)}, and you get an exact offer after you send a request.` },
  { re: /\b(who are you|what (do|can) you do|what (services|do you offer)|your services|services)\b/i,
    reply: (s) => `We help small businesses with ${serviceNames(s)}. Tell me what you need and I'll point you to the right one.` },
  { re: /^\s*(hi|hello|hey|hiya|yo|salut|buna|hola|good (morning|afternoon|evening))\b[\s!.?]*$/i,
    reply: () => "Hi! I can help you pick a service, explain our plans, or get a request started. What are you working on?" }
];

function faqReply(text, services = []) {
  const t = String(text || "").trim();
  if (!t) return null;
  for (const it of INTENTS) if (it.re.test(t)) return it.reply(services);
  return null;
}

// No-LLM answer: FAQ first, otherwise match the problem to a service.
function ruleReply(text, services = []) {
  const faq = faqReply(text, services);
  if (faq) return faq;
  const rule = rules.classify(String(text || ""));
  if (rule.category === "General IT Services") {
    return "Could you tell me a bit more? For example: securing an account, hosting a website, automating a task, or setting up a chatbot.";
  }
  const svc = findService(services, rule.category);
  const q = (rule.questions && rule.questions[0]) || "";
  return `That sounds like our ${svc ? svc.name : rule.category} service${svc ? ` (${svc.basePrice})` : ""}. ${q} ` +
    `When you're ready, hit "Request a service" and we'll send you an offer.`.trim();
}

// Facts handed to the LLM so it answers like the team, not like a generic bot.
function factSheet(services = []) {
  return [
    "You are the website assistant for LeadFlow, a small IT, cyber, cloud and automation services team.",
    `Services and starting prices: ${services.map((s) => `${s.name} (${s.basePrice})`).join("; ")}.`,
    `Monthly plans: ${PLANS_TEXT}.`,
    "How it works: the customer creates an account and sends a request, we reply with an offer within one business day, nothing is paid up front, and calls happen on Google Meet or Discord after the request is in.",
    "Live tools on the site (Live Demos): website reverse-engineer (design system + tech stack), domain & email health check, security header scanner, password breach checker, live status.",
    "Style: friendly, plain and short (2-4 sentences), no markdown, no bullet lists. Only quote the prices above; for anything else say the team will confirm in the offer.",
    "Never describe yourself as AI or a bot; you are the LeadFlow assistant. If they seem ready, invite them to click \"Request a service\"."
  ].join(" ");
}

module.exports = { faqReply, ruleReply, factSheet };
