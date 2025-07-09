// firebase.js
const admin = require("firebase-admin");
const serviceAccount = require("../danab-project-firebase-adminsdk.json"); // Download from Firebase Console

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
module.exports = db;
