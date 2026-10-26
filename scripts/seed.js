// Seed: service catalog, an admin + sales user, and demo leads (each analyzed).
const bcrypt = require("bcryptjs");
const { initDb, sequelize, User, Service, Lead, AiAnalysis } = require("../src/db");
const { analyzeLead } = require("../src/agent/analyze");

const SERVICES = [
  { name: "Website + Domain + Protection", description: "We build your website, set up your domain, and keep it fast, secure and backed up, all in one monthly plan.", basePrice: "from €39 / month", keywords: "website,domain,hosting,subscription,monthly,protection,managed,build my site,landing page" },
  { name: "Website Care & Maintenance", description: "Updates, backups, security checks and small edits for your existing website, so it never breaks or slows down.", basePrice: "from €39 / month", keywords: "maintenance,care plan,updates,wordpress updates,backups,small edits,website support" },
  { name: "Hacked Website Recovery", description: "Site hacked, defaced or full of spam? We clean it up, close the hole and get you back online fast.", basePrice: "Quote after a call", keywords: "hacked,malware,virus,defaced,spam,blacklisted,cleanup,infected" },
  { name: "Account Security", description: "Lost access or worried about hackers? We secure your email and social media accounts and turn on extra login protection.", basePrice: "Quote after a call", keywords: "login,2fa,password,phishing,account,hacked" },
  { name: "Managed IT for Small Offices", description: "Laptops, email, Wi-Fi, accounts and backups for your team, set up properly and looked after, with someone to call when things go wrong.", basePrice: "Quote after a call", keywords: "office,it support,laptops,wifi,printer,computers,employees,onboarding,helpdesk" },
  { name: "Ongoing Tech Support", description: "A tech partner on call for all the small jobs: changes, fixes and questions, scoped to what you need each month.", basePrice: "Quote after a call", keywords: "ongoing,support,retainer,regular help,small tasks,on demand,it guy" },
  { name: "Chatbots & Integrations", description: "Bots for Discord, Telegram and WhatsApp, a smart assistant for your website, and connections between the tools you use.", basePrice: "Quote after a call", keywords: "chatbot,bot,telegram,whatsapp,discord,integration,integrate,api,webhook" },
  { name: "Task Automation", description: "Stop doing the same job by hand every day. We automate repetitive work like copying orders, sending emails or updating spreadsheets.", basePrice: "Quote after a call", keywords: "automation,workflow,integrate,script,zapier,spreadsheet" },
  { name: "CRM & Business Software", description: "We set up, host and look after software for your team: customer lists and sales pipeline, invoicing, stock and a support inbox, hosted in the EU.", basePrice: "Quote after a call", keywords: "crm,erp,business software,invoicing,inventory,helpdesk,sales pipeline,customer database" },
  { name: "Website Speed & Protection", description: "Make your site load fast everywhere and shield it from attacks and spam bots, with a secure padlock (HTTPS) included.", basePrice: "Quote after a call", keywords: "cloudflare,dns,ssl,waf,firewall,ddos,slow website,speed" },
  { name: "Domain & Business Email", description: "Register or move your domain and set up professional email (you@yourbusiness.com) that lands in inboxes, not spam.", basePrice: "Quote after a call", keywords: "domain,transfer,registrar,email,business email,spf,dmarc,nameserver" },
  { name: "Cloud Hosting & Servers", description: "Reliable servers in the EU for your website, apps or remote desktop, set up securely and kept up to date.", basePrice: "Quote after a call", keywords: "server,rdp,vps,cloud,aws,hetzner,hosting,ssh,remote desktop" },
  { name: "App Deployment", description: "We package your app so it runs the same everywhere, with easy updates and a quick undo if something goes wrong.", basePrice: "Quote after a call", keywords: "docker,container,ci/cd,deploy,pipeline,app" },
  { name: "Uptime Monitoring", description: "We watch your website around the clock and alert you, and act, the moment something goes down.", basePrice: "Quote after a call", keywords: "monitor,uptime,alert,status,down" },
  { name: "Website & App Prompt Engineering", description: "We turn any website or app into a build-ready prompt and design spec (colours, type, layout, components) for your team or AI site builders like Lovable, v0 and Claude.", basePrice: "Quote after a call", keywords: "prompt,prompt engineering,lovable,v0,bolt,cursor,design spec,design system" }
];
// Old service names replaced by the plain-English ones above; removed on seed.
const RETIRED = ["Servers / RDP", "Cloud Infrastructure", "Docker / DevOps", "Automation", "Cloudflare / Network", "Domain Transfer & Setup", "Monitoring", "Tech on Demand"];

const DEMO_LEADS = [
  { name: "Sara Cohen", phone: "+1 555 0101", email: "sara@example.com", serviceType: "Account Security", problem: "I keep getting login attempts on my Gmail and Facebook and I want to secure my accounts.", urgency: "urgent", budget: "$300" },
  { name: "David Levi", phone: "+1 555 0102", email: "david@example.com", serviceType: "Servers / RDP", problem: "Our Windows RDP server keeps disconnecting and three staff cannot work. Need help urgently.", urgency: "high", budget: "$900" },
  { name: "Noa Adar", phone: "+1 555 0103", email: "noa@example.com", serviceType: "Automation", problem: "I want to automate copying orders from our email into a spreadsheet every morning.", urgency: "normal", budget: "$500" },
  { name: "Omar Haddad", phone: "+1 555 0104", email: "omar@example.com", serviceType: "Cloudflare / Network", problem: "Getting an SSL certificate error on our domain and Cloudflare is showing errors.", urgency: "high", budget: "$150" },
  { name: "Mia Fischer", phone: "+1 555 0105", email: "mia@example.com", serviceType: "Docker / DevOps", problem: "We need our Node app containerized with Docker and deployed to our VPS.", urgency: "normal", budget: "$600" }
];

async function main() {
  await initDb(); // authenticate + create tables if missing

  // Services (and drop retired names)
  await Service.destroy({ where: { name: RETIRED } });
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

  // Demo leads — only when explicitly requested (SEED_DEMO=1), so production
  // stays clean after you wipe test data with scripts/reset-leads.js.
  if (process.env.SEED_DEMO === "1" && (await Lead.count()) === 0) {
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
