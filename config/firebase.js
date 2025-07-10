// // firebase.js
const admin = require("firebase-admin");

let serviceAccount;

try {
  if (process.env.FIREBASE_CREDENTIALS) {
    serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
  } else {
    throw new Error("Missing FIREBASE_CREDENTIALS");
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

} catch (err) {
  console.error("Firebase init failed:", err.message);
  process.exit(1); // Stop the app with error
}

const db = admin.firestore();
module.exports = db;




// const admin = require("firebase-admin");
// const serviceAccount = require("../danab-project-firebase-adminsdk.json"); // Download from Firebase Console

// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
// });

// const db = admin.firestore();
// module.exports = db;
