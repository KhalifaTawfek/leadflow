// LeadFlow AI Agent — a rule-based "agent flow" (no external API key required).
// It runs a lead's raw request through 6 steps and returns a structured analysis,
// mirroring the LangGraph flow in the brief:
//   1. Classify service   2. Score priority (1-10)   3. Summarize
//   4. Follow-up questions 5. Draft reply             6. Hours estimate

// Service catalog with the keywords the classifier looks for.
const SERVICE_RULES = [
  {
    category: "Account Security",
    keywords: ["login", "hacked", "2fa", "two-factor", "password", "phishing", "gmail", "facebook", "instagram", "account", "breach", "compromise", "secure my"],
    estimate: "2-4 hours",
    questions: [
      "Have you lost access to the account, or do you still have it?",
      "Have you changed the password recently?",
      "Do you see any unfamiliar devices or login locations?"
    ]
  },
  {
    category: "Servers / RDP",
    keywords: ["server", "rdp", "remote desktop", "vps", "windows server", "linux server", "ssh", "hosting", "downtime", "reboot"],
    estimate: "3-6 hours",
    questions: [
      "Which operating system is the server running?",
      "Is the server currently reachable at all?",
      "How many users need access?"
    ]
  },
  {
    category: "Automation",
    keywords: ["automate", "automation", "workflow", "script", "bot", "integrate", "zapier", "n8n", "repetitive", "scrape"],
    estimate: "6-12 hours",
    questions: [
      "Which task would you like to automate, step by step?",
      "Which tools or apps are involved?",
      "How often does this task run today?"
    ]
  },
  {
    category: "Docker / DevOps",
    keywords: ["docker", "container", "kubernetes", "ci/cd", "pipeline", "deploy", "compose", "image"],
    estimate: "6-10 hours",
    questions: [
      "What are you trying to containerize or deploy?",
      "Do you already have a Dockerfile or compose file?",
      "Where should this run — your own server or a cloud provider?"
    ]
  },
  {
    category: "Cloudflare / Network",
    keywords: ["cloudflare", "dns", "ssl", "waf", "firewall", "domain", "cdn", "ddos", "proxy", "certificate"],
    estimate: "1-3 hours",
    questions: [
      "What is the domain name involved?",
      "Who is your current DNS or hosting provider?",
      "Are you seeing an SSL error or an attack, or setting this up fresh?"
    ]
  },
  {
    category: "Monitoring",
    keywords: ["monitor", "monitoring", "uptime", "alert", "grafana", "prometheus", "logs", "health", "netdata", "status"],
    estimate: "3-5 hours",
    questions: [
      "What would you like to monitor — a website, a server, or an API?",
      "How would you like to be alerted (email, Telegram, SMS)?",
      "Do you have any monitoring in place today?"
    ]
  },
  {
    category: "Website + Domain + Protection",
    keywords: ["website", "web site", "domain", "hosting", "landing page", "build my site", "online store", "wordpress", "web presence", "subscription", "make me a site", "e-commerce"],
    estimate: "3-7 days setup",
    questions: [
      "Do you already have a domain, or do you need one registered?",
      "What kind of site — business, portfolio, or shop?",
      "Any specific pages or features you need?"
    ]
  }
];

const GENERIC = {
  category: "General IT Services",
  estimate: "2-5 hours",
  questions: [
    "Could you describe the problem in a bit more detail?",
    "How urgent is this for you?",
    "What outcome would make this a success?"
  ]
};

function scoreText(text, keywords) {
  const t = text.toLowerCase();
  let hits = 0;
  for (const k of keywords) if (t.includes(k)) hits++;
  return hits;
}

// Step 1 — classify the requested service by keyword overlap.
function classify(text) {
  let best = null;
  let bestHits = 0;
  for (const rule of SERVICE_RULES) {
    const hits = scoreText(text, rule.keywords);
    if (hits > bestHits) { bestHits = hits; best = rule; }
  }
  return best && bestHits > 0 ? best : GENERIC;
}

// Rough budget parsing so a bigger budget nudges priority up.
function budgetWeight(budget) {
  const num = parseInt(String(budget).replace(/[^0-9]/g, ""), 10);
  if (!num || isNaN(num)) return 0;
  if (num >= 2000) return 3;
  if (num >= 800) return 2;
  if (num >= 200) return 1;
  return 0;
}

const URGENCY_WEIGHT = { urgent: 4, high: 3, normal: 1, low: 0 };
const URGENCY_LABEL = { urgent: "Urgent", high: "High", normal: "Normal", low: "Low" };

// Step 2 — priority 1-10 from urgency + budget + security sensitivity + detail.
// Returns both the score and a human-readable breakdown of how it was reached,
// so the CRM can show WHY the agent chose the number (not the customer).
function explainPriority(lead, category) {
  const factors = [];
  let score = 3;
  factors.push("base 3");

  const uw = URGENCY_WEIGHT[String(lead.urgency).toLowerCase()] ?? 1;
  score += uw;
  const uLabel = URGENCY_LABEL[String(lead.urgency).toLowerCase()] || "Normal";
  factors.push(`${uLabel} urgency ${uw >= 0 ? "+" : ""}${uw}`);

  const bw = budgetWeight(lead.budget);
  if (bw > 0) factors.push(`budget ${lead.budget} +${bw}`);
  score += bw;

  if (category === "Account Security" || category === "Cloudflare / Network") {
    score += 1;
    factors.push("security-sensitive +1");
  }
  if (String(lead.problem).length > 160) {
    score += 1;
    factors.push("detailed description +1");
  }

  const clamped = Math.max(1, Math.min(10, score));
  const reason = `${clamped}/10 — ${factors.join(", ")}`;
  return { score: clamped, reason };
}

// Backwards-compatible helper that returns just the number.
function scorePriority(lead, category) {
  return explainPriority(lead, category).score;
}

// Step 3 — a one-line summary a busy salesperson can scan.
function summarize(lead, category) {
  const problem = String(lead.problem).trim().replace(/\s+/g, " ");
  const shortProblem = problem.length > 120 ? problem.slice(0, 117) + "…" : problem;
  return `${lead.name} needs help with ${category.toLowerCase()} — "${shortProblem}" (urgency: ${URGENCY_LABEL[String(lead.urgency).toLowerCase()] || "Normal"}, budget: ${lead.budget || "not stated"}).`;
}

// Step 5 — a ready-to-send professional reply draft.
function draftReply(lead, category, estimate, questions) {
  const firstName = String(lead.name).trim().split(/\s+/)[0] || "there";
  return [
    `Hi ${firstName},`,
    ``,
    `Thanks for reaching out about ${category.toLowerCase()}. I've reviewed your request and we can definitely help.`,
    ``,
    `Based on what you've described, this typically takes around ${estimate}. To give you an accurate quote and timeline, could you help me with a couple of quick details:`,
    ...questions.map((q) => `  • ${q}`),
    ``,
    `Once I have those, I'll send over a clear proposal. If it's urgent, reply "urgent" and I'll prioritise it today.`,
    ``,
    `Best regards,`,
    `The Team`
  ].join("\n");
}

// The full agent flow.
function analyzeLead(lead) {
  const text = `${lead.serviceType || ""} ${lead.problem || ""}`;
  const rule = classify(text);                       // 1
  const { score: priority, reason: priorityReason } = explainPriority(lead, rule.category); // 2
  const summary = summarize(lead, rule.category);      // 3
  const questions = rule.questions;                    // 4
  const estimateHours = rule.estimate;                 // 6
  const reply = draftReply(lead, rule.category, estimateHours, questions); // 5

  return {
    category: rule.category,
    priority,
    priorityReason,
    urgencyLabel: URGENCY_LABEL[String(lead.urgency).toLowerCase()] || "Normal",
    estimateHours,
    summary,
    questions: questions.join("\n"),
    draftReply: reply
  };
}

module.exports = { analyzeLead, classify, scorePriority, explainPriority };
