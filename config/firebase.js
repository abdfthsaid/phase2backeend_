// config/firebase.js
const admin = require("firebase-admin");

// 1️⃣ Get the Base64 string
const b64 = process.env.FIREBASE_CREDENTIALS_B64;
if (!b64) {
  console.error("Missing FIREBASE_CREDENTIALS_B64");
  process.exit(1);
}

// 2️⃣ Decode and parse
let serviceAccount;
try {
  const json = Buffer.from(b64, "base64").toString("utf8");
  serviceAccount = JSON.parse(json);
} catch (err) {
  console.error("Failed to decode/parse Base64 creds:", err.message);
  process.exit(1);
}

// 3️⃣ Initialize
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin.firestore();
