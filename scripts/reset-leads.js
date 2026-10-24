// Reset leads — wipes all test lead data while KEEPING the schema, the service
// catalog, and staff accounts (ADMIN / SALES). Use this to clear the test data
// before going live with real customers.
//
// What it DELETES:   leads, lead notes, AI analyses, activity logs, and every
//                    CUSTOMER account (the public signups used for testing).
// What it KEEPS:     all tables/columns (schema), the services catalog, and
//                    every ADMIN and SALES user.
//
// Safety: this is destructive, so it refuses to run unless you confirm.
//   docker compose exec app node scripts/reset-leads.js --yes
//   (or set CONFIRM=yes in the environment)
//
// Run it INSIDE the app container on the VPS so it uses the production database.

const { initDb, sequelize, User, Lead, LeadNote, AiAnalysis, ActivityLog, LeadMessage } = require("../src/db");

const confirmed = process.argv.includes("--yes") || String(process.env.CONFIRM || "").toLowerCase() === "yes";

async function main() {
  await initDb();

  const before = {
    leads: await Lead.count(),
    notes: await LeadNote.count(),
    analyses: await AiAnalysis.count(),
    logs: await ActivityLog.count(),
    customers: await User.count({ where: { role: "CUSTOMER" } }),
    staff: await User.count({ where: { role: ["ADMIN", "SALES"] } }),
    services: await (require("../src/db").Service).count()
  };

  console.log("\nCurrent data:");
  console.log(`  leads: ${before.leads}  ·  notes: ${before.notes}  ·  AI analyses: ${before.analyses}`);
  console.log(`  activity logs: ${before.logs}  ·  customer accounts: ${before.customers}`);
  console.log(`  KEEPING -> staff accounts: ${before.staff}  ·  services: ${before.services}\n`);

  if (!confirmed) {
    console.log("Nothing deleted. Re-run with --yes to confirm the wipe:");
    console.log("  docker compose exec app node scripts/reset-leads.js --yes\n");
    return;
  }

  // Delete in FK-safe order (children first). Lead cascades to notes/analyses,
  // but we delete them explicitly so the script is clear and order-independent.
  await AiAnalysis.destroy({ where: {}, truncate: false });
  await LeadNote.destroy({ where: {}, truncate: false });
  await LeadMessage.destroy({ where: {}, truncate: false });
  await Lead.destroy({ where: {}, truncate: false });
  await ActivityLog.destroy({ where: {}, truncate: false });
  const removedCustomers = await User.destroy({ where: { role: "CUSTOMER" } });

  console.log("✅ Reset complete.");
  console.log(`   Removed ${before.leads} leads, ${before.notes} notes, ${before.analyses} analyses, ${before.logs} logs, ${removedCustomers} customer accounts.`);
  console.log(`   Kept ${before.staff} staff accounts and ${before.services} services. Schema untouched.\n`);
}

main()
  .then(() => sequelize.close())
  .catch((e) => { console.error("reset-leads failed:", e.message); sequelize.close(); process.exit(1); });
