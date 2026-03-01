import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Firebase Admin
const serviceAccountBase64 = process.env.FIREBASE_CREDENTIALS_B64;
if (!serviceAccountBase64) {
  console.error('❌ FIREBASE_CREDENTIALS_B64 not found in environment variables');
  process.exit(1);
}

const serviceAccount = JSON.parse(
  Buffer.from(serviceAccountBase64, 'base64').toString('utf-8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Function to identify and remove fake/spam data
async function cleanupFakeData() {
  console.log('🧹 Starting cleanup of fake data...\n');

  // 1. Clean up system_users table
  console.log('📋 Checking system_users...');
  const usersSnapshot = await db.collection('system_users').get();
  let deletedUsers = 0;
  let keptUsers = 0;

  for (const doc of usersSnapshot.docs) {
    const data = doc.data();
    
    // Criteria for fake users:
    // - Missing required fields (username, password, role, email)
    // - Invalid role (not 'admin' or 'user')
    // - Suspicious patterns (random strings, test data, etc.)
    
    const isFake = 
      !data.username || 
      !data.password || 
      !data.role || 
      !data.email ||
      !['admin', 'user'].includes(data.role) ||
      data.username.includes('test') ||
      data.username.includes('fake') ||
      data.email.includes('test') ||
      data.email.includes('fake');

    if (isFake) {
      console.log(`  ❌ Deleting fake user: ${data.username || 'unknown'} (${doc.id})`);
      await doc.ref.delete();
      deletedUsers++;
    } else {
      console.log(`  ✅ Keeping valid user: ${data.username}`);
      keptUsers++;
    }
  }

  console.log(`\n📊 system_users: Deleted ${deletedUsers}, Kept ${keptUsers}\n`);

  // 2. Clean up blacklistnumbers table
  console.log('📋 Checking blacklistnumbers...');
  const blacklistSnapshot = await db.collection('blacklistnumbers').get();
  let deletedBlacklist = 0;
  let keptBlacklist = 0;

  for (const doc of blacklistSnapshot.docs) {
    const data = doc.data();
    
    // Criteria for fake blacklist entries:
    // - Missing required fields (phoneNumber, normalizedPhone)
    // - Invalid phone format (not 9 digits)
    // - Suspicious patterns
    
    const normalizedPhone = data.normalizedPhone || '';
    const isFake = 
      !data.phoneNumber || 
      !data.normalizedPhone ||
      normalizedPhone.length < 8 ||
      normalizedPhone.length > 9 ||
      !/^\d+$/.test(normalizedPhone);

    if (isFake) {
      console.log(`  ❌ Deleting fake blacklist: ${data.phoneNumber || 'unknown'} (${doc.id})`);
      await doc.ref.delete();
      deletedBlacklist++;
    } else {
      console.log(`  ✅ Keeping valid blacklist: ${data.phoneNumber}`);
      keptBlacklist++;
    }
  }

  console.log(`\n📊 blacklistnumbers: Deleted ${deletedBlacklist}, Kept ${keptBlacklist}\n`);

  console.log('✅ Cleanup complete!');
  console.log(`\nTotal deleted: ${deletedUsers + deletedBlacklist}`);
  console.log(`Total kept: ${keptUsers + keptBlacklist}`);
}

// Run cleanup
cleanupFakeData()
  .then(() => {
    console.log('\n✅ Script finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  });
