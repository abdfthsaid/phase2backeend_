const admin = require("firebase-admin");

if (!process.env.FIREBASE_CREDENTIALS) {
  console.error("Missing FIREBASE_CREDENTIALS environment variable.");
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
} catch (err) {
  console.error("Failed to parse FIREBASE_CREDENTIALS:", err.message);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
module.exports = db;
