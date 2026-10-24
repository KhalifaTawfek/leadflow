// Firebase Admin — verifies Firebase ID tokens sent by the browser.
//
// This is OPTIONAL and dual-mode: if no Firebase service account is configured,
// firebaseEnabled() is false and the app falls back to its built-in signed-cookie
// auth, so the site keeps working. The moment you provide credentials, Firebase
// sign-in becomes the primary login — no code change needed.
//
// Configure ONE of these (see .env.example and README):
//   FIREBASE_SERVICE_ACCOUNT_B64   base64 of the service-account JSON (easiest for env/CI)
//   FIREBASE_SERVICE_ACCOUNT       the raw service-account JSON string
//   GOOGLE_APPLICATION_CREDENTIALS path to the service-account JSON file

let admin = null;
try {
  admin = require("firebase-admin");
} catch {
  // Package not installed yet — stay in fallback (cookie) mode without crashing.
  admin = null;
}

let enabled = false;

function loadCredential() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  try {
    if (b64) return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error("[firebase] Could not parse service account JSON:", e.message);
  }
  return null;
}

(function init() {
  if (!admin) return;
  try {
    const cred = loadCredential();
    if (cred) {
      admin.initializeApp({ credential: admin.credential.cert(cred) });
      enabled = true;
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp();
      enabled = true;
    }
    if (enabled) console.log("[firebase] Admin initialised — Firebase sign-in is active.");
  } catch (e) {
    console.error("[firebase] Admin init failed, staying in fallback auth:", e.message);
    enabled = false;
  }
})();

function firebaseEnabled() { return enabled; }

async function verifyIdToken(idToken) {
  if (!enabled || !idToken) return null;
  try {
    return await admin.auth().verifyIdToken(idToken);
  } catch {
    return null;
  }
}

module.exports = { firebaseEnabled, verifyIdToken };
