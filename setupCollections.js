// setupCollections.js
const db = require("./config/firebase");

async function setup() {
  // 1. Station
  await db.collection("stations").doc("WSEP161721195358").set({
    imei: "WSEP161721195358",
    name: "Danab Station KM4",
    location: "Mogadishu KM4",
    iccid: "8944501205200846772",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // 2. Slots
  await db.collection("slots").doc("WSEP161721195358_slot1").set({
    stationId: "WSEP161721195358",
    slot_id: "1",
    battery_id: "F30001E622",
    battery_capacity: 90,
    soh: 100,
    lock_status: "locked",
    battery_abnormal: false,
    cable_abnormal: false,
    taken: false,
    updatedAt: new Date(),
  });

  // 3. Rentals
  await db.collection("rentals").add({
    stationId: "WSEP161721195358",
    slot_id: "1",
    battery_id: "F30001E622",
    userPhone: "615123456",
    amount: 1,
    payment_status: "APPROVED",
    waafi_reference: "ref-12345",
    rentedAt: new Date(),
    returnedAt: null,
  });

  // 4. Returns
  await db.collection("returns").add({
    stationId: "WSEP161721195358",
    battery_id: "F30001E622",
    slot_id: "1",
    battery_capacity: 70,
    lock_status: "locked",
    returnedAt: new Date(),
  });

  // 5. Admins
  await db.collection("admins").doc("admin1").set({
    name: "Admin KM4",
    email: "admin@danab.so",
    role: "superadmin",
    createdAt: new Date(),
  });

  // 6. Stats
  await db.collection("stats").doc("WSEP161721195358").set({
    stationId: "WSEP161721195358",
    dailyRevenue: 3,
    monthlyRevenue: 45,
    rentedToday: 2,
    availableNow: 5,
    lastUpdated: new Date(),
  });

  console.log("🔥 Collections and documents created successfully!");
}

setup();
