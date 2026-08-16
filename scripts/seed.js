// Seed: service catalog, an admin + sales user, and demo leads (each analyzed).
const bcrypt = require("bcryptjs");
const { initDb, sequelize, User, Service, Lead, AiAnalysis } = require("../src/db");
const { analyzeLead } = require("../src/agent/analyze");

const SERVICES = [
  { name: "Account Security", description: "Secure hacked or at-risk accounts, set up 2FA, stop phishing.", basePrice: "from $120", keywords: "login,2fa,password,phishing,account,hacked" },
  { name: "Servers / RDP", description: "Server setup, remote desktop, VPS management and recovery.", basePrice: "from $180", keywords: "server,rdp,vps,ssh,hosting" },
  { name: "Automation", description: "Automate repetitive workflows, bots, and integrations.", basePrice: "from $300", keywords: "automation,workflow,bot,integrate,script" },
  { name: "Docker / DevOps", description: "Containerize apps, CI/CD pipelines, and clean deployments.", basePrice: "from $280", keywords: "docker,container,ci/cd,deploy,pipeline" },
  { name: "Cloudflare / Network", description: "DNS, SSL, WAF, DDoS protection and domain setup.", basePrice: "from $90", keywords: "cloudflare,dns,ssl,waf,firewall,domain" },
  { name: "Monitoring", description: "Uptime monitoring, alerts, logging and dashboards.", basePrice: "from $150", keywords: "monitor,uptime,alert,grafana,logs" },
  { name: "Website + Domain + Protection", description: "A complete managed web presence — we build your website, set up your domain and SSL, and protect it with Cloudflare. All-in-one, monthly.", basePrice: "$5 / month", keywords: "website,domain,hosting,subscription,monthly,protection,managed,build my site,landing page" }
];

const DEMO_LEADS = [
  { name: "Sara Cohen", phone: "+1 555 0101", email: "sara@example.com", serviceType: "Account Security", problem: "I keep getting login attempts on my Gmail and Facebook and I want to secure my accounts.", urgency: "urgent", budget: "$300" },
  { name: "David Levi", phone: "+1 555 0102", email: "david@example.com", serviceType: "Servers / RDP", problem: "Our Windows RDP server keeps disconnecting and three staff cannot work. Need help urgently.", urgency: "high", budget: "$900" },
  { name: "Noa Adar", phone: "+1 555 0103", email: "noa@example.com", serviceType: "Automation", problem: "I want to automate copying orders from our email into a spreadsheet every morning.", urgency: "normal", budget: "$500" },
  { name: "Omar Haddad", phone: "+1 555 0104", email: "omar@example.com", serviceType: "Cloudflare / Network", problem: "Getting an SSL certificate error on our domain and Cloudflare is showing errors.", urgency: "high", budget: "$150" },
  { name: "Mia Fischer", phone: "+1 555 0105", email: "mia@example.com", serviceType: "Docker / DevOps", problem: "We need our Node app containerized with Docker and deployed to our VPS.", urgency: "normal", budget: "$600" }
];

async function main() {
  await initDb(); // authenticate + create tables if missing

  // Services
  for (const s of SERVICES) {
    const existing = await Service.findOne({ where: { name: s.name } });
    if (existing) await existing.update(s); else await Service.create(s);
  }

  // Users (admin + one sales) — only if none exist
  if ((await User.count()) === 0) {
    await User.create({ username: "admin", passwordHash: await bcrypt.hash("admin1234", 10), role: "ADMIN" });
    await User.create({ username: "sales", passwordHash: await bcrypt.hash("sales1234", 10), role: "SALES" });
    console.log("Created users: admin/admin1234 (ADMIN), sales/sales1234 (SALES)");
  }

  // Demo leads (only if none exist)
  if ((await Lead.count()) === 0) {
    for (const l of DEMO_LEADS) {
      const lead = await Lead.create({ ...l });
      const analysis = analyzeLead(lead);
      await AiAnalysis.create({ leadId: lead.id, ...analysis });
    }
    console.log(`Created ${DEMO_LEADS.length} demo leads with AI analysis.`);
  }

  console.log("Seed complete.");
}

main().then(() => sequelize.close()).catch((e) => { console.error(e); sequelize.close(); process.exit(1); });
