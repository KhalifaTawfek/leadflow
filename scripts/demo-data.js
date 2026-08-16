// Demo data — adds a batch of realistic service requests spread over the last
// ~14 days, each run through the AI agent, with varied categories, urgencies,
// budgets and statuses so the CRM, stats chart and Alerts page look real.
//
// Populates the database directly (does NOT fire Telegram) so it won't spam
// your phone. Test the live Telegram path by submitting one request on the site.
//
// Usage:  docker compose exec app node scripts/demo-data.js [count]
//   count defaults to 12. Re-running ADDS more (it doesn't wipe anything).

const bcrypt = require("bcryptjs");
const { initDb, sequelize, User, Lead, AiAnalysis, ActivityLog } = require("../src/db");
const { analyzeLead } = require("../src/agent/analyze");

const REQUESTS = [
  { serviceType: "Account Security", problem: "I keep getting login attempts on my Gmail and Facebook and I want to secure my accounts and set up 2FA.", urgency: "urgent", budget: "$300" },
  { serviceType: "Servers / RDP", problem: "Our Windows RDP server is unreachable this morning and 4 staff can't work. Need it back up.", urgency: "urgent", budget: "$800" },
  { serviceType: "Automation", problem: "I copy orders from emails into a spreadsheet every day, about 40 a day. Can this be automated?", urgency: "normal", budget: "$1200" },
  { serviceType: "Docker / DevOps", problem: "Need help containerizing a Node app and setting up a docker-compose with postgres for deployment.", urgency: "high", budget: "$1500" },
  { serviceType: "Cloudflare / Network", problem: "Getting SSL cipher errors after moving nameservers to Cloudflare, site won't load on https.", urgency: "high", budget: "$250" },
  { serviceType: "Monitoring", problem: "I want uptime monitoring on my two websites with a Telegram alert if they go down.", urgency: "normal", budget: "$200" },
  { serviceType: "Website + Domain + Protection", problem: "I need a small business website plus a domain and ongoing protection, monthly subscription is fine.", urgency: "normal", budget: "$5/mo" },
  { serviceType: "Account Security", problem: "My Instagram was hacked and the email was changed, I lost access completely. Help recover it.", urgency: "urgent", budget: "$400" },
  { serviceType: "Automation", problem: "We send the same onboarding emails manually to every new client. Want a workflow to do it automatically.", urgency: "low", budget: "$600" },
  { serviceType: "Docker / DevOps", problem: "Our CI pipeline is flaky and deploys fail randomly, need someone to stabilise GitHub Actions.", urgency: "high", budget: "$900" },
  { serviceType: "Cloudflare / Network", problem: "Want to add a WAF and rate limiting rule to stop bots hitting our login page.", urgency: "normal", budget: "$350" },
  { serviceType: "Servers / RDP", problem: "Need a fresh Ubuntu VPS set up with a non-root user, firewall and SSH keys, hardened properly.", urgency: "normal", budget: "$500" },
  { serviceType: "Monitoring", problem: "Set up a status page my clients can see, showing whether our API and database are healthy.", urgency: "low", budget: "$300" },
  { serviceType: "Website + Domain + Protection", problem: "Portfolio site with a domain, and please keep it backed up and protected. Ongoing plan preferred.", urgency: "low", budget: "$5/mo" },
];

const NAMES = ["Alex Turner","Priya Shah","Mohammed Ali","Sara Lopez","Chen Wei","Tom Becker","Lena Novak","Omar Farouk","Grace Kim","Diego Ruiz","Yara Haddad","Nina Petrova","Sam Okafor","Ivy Nguyen"];
const STATUSES = ["NEW","NEW","NEW","CONTACTED","CONTACTED","QUALIFIED","PROPOSAL_SENT","WON","WON","LOST"];

function pick(arr, i) { return arr[i % arr.length]; }

async function main() {
  await initDb();
  const count = Math.max(1, Math.min(40, parseInt(process.argv[2] || "12", 10)));

  // A demo customer to own the requests.
  let customer = await User.findOne({ where: { username: "demo_customer" } });
  if (!customer) {
    customer = await User.create({ username: "demo_customer", passwordHash: await bcrypt.hash("demo1234", 10), role: "CUSTOMER" });
    console.log("Created demo customer: demo_customer / demo1234");
  }

  let made = 0;
  for (let i = 0; i < count; i++) {
    const req = pick(REQUESTS, i);
    const name = pick(NAMES, i);
    const status = pick(STATUSES, i);
    // Spread createdAt across the last 14 days.
    const daysAgo = i % 14;
    const created = new Date();
    created.setDate(created.getDate() - daysAgo);
    created.setHours(9 + (i % 8), (i * 7) % 60, 0, 0);

    const lead = await Lead.create({
      name,
      phone: "+1 555 " + String(1000 + i),
      email: name.toLowerCase().replace(/[^a-z]+/g, ".") + "@example.com",
      serviceType: req.serviceType,
      problem: req.problem,
      urgency: req.urgency,
      budget: req.budget,
      status,
      customerId: customer.id
    });

    const analysis = analyzeLead(lead);
    await AiAnalysis.create({ leadId: lead.id, ...analysis });
    await ActivityLog.create({ userId: customer.id, action: "NEW_LEAD", detail: `${name} · ${analysis.category} · P${analysis.priority}` });

    // Backdate created_at (and the log) so the 14-day chart shows a trend.
    await sequelize.query("UPDATE leads SET created_at = :d WHERE id = :id", { replacements: { d: created, id: lead.id } });
    await sequelize.query("UPDATE ai_analysis SET created_at = :d WHERE lead_id = :id", { replacements: { d: created, id: lead.id } });
    made++;
  }

  const total = await Lead.count();
  console.log(`\n✅ Added ${made} demo requests. Total leads now: ${total}.`);
  console.log("   View them in the CRM: /admin  ·  stats chart and Alerts page will now be populated.");
  process.exit(0);
}

main().catch((e) => { console.error("demo-data failed:", e.message); process.exit(1); });
