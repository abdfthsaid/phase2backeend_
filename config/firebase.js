// config/firebase.js
const admin = require("firebase-admin");

// 1️⃣ Ensure the environment variable is set
if (!process.env.FIREBASE_CREDENTIALS) {
  console.error("Missing FIREBASE_CREDENTIALS environment variable.");
  process.exit(1);
}

// 2️⃣ Parse the JSON from the env var
let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
} catch (err) {
  console.error("Failed to parse FIREBASE_CREDENTIALS:", err.message);
  process.exit(1);
}

// 3️⃣ Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
module.exports = db;
