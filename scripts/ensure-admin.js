// Ensure an ADMIN account exists (safe to run any time).
// - No args:            creates/repairs admin / admin1234 (role ADMIN).
// - node ensure-admin.js <username>:            promotes that existing user to ADMIN.
// - node ensure-admin.js <username> <password>: creates that user as ADMIN (or resets it).
//
// Unlike the seed, this does NOT skip when other users already exist — so it
// works even after customers have registered.

const bcrypt = require("bcryptjs");
const { initDb, User } = require("../src/db");

async function main() {
  await initDb();

  const [, , argUser, argPass] = process.argv;

  // Show current users first (handy for diagnosing login issues).
  const all = await User.findAll({ attributes: ["username", "role"], order: [["role", "ASC"]] });
  console.log("Existing users:");
  all.forEach((u) => console.log(`  - ${u.username} (${u.role})`));

  const username = argUser || "admin";
  const password = argPass || "admin1234";

  let user = await User.findOne({ where: { username } });
  if (user) {
    user.role = "ADMIN";
    // Only reset the password when one was explicitly provided, or for the default admin.
    if (argPass || (!argUser && username === "admin")) {
      user.passwordHash = await bcrypt.hash(password, 10);
    }
    await user.save();
    console.log(`\n✅ '${username}' is now ADMIN${(argPass || (!argUser)) ? ` (password: ${password})` : ""}.`);
  } else {
    user = await User.create({ username, passwordHash: await bcrypt.hash(password, 10), role: "ADMIN" });
    console.log(`\n✅ Created ADMIN '${username}' with password: ${password}`);
  }
  process.exit(0);
}

main().catch((e) => { console.error("ensure-admin failed:", e.message); process.exit(1); });
