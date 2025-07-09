// routes/stationEvents.js
import express from "express";
import db from "../config/firebase.js";
import { Timestamp } from "firebase-admin/firestore";

const router = express.Router();

// MARK: Register station
router.post("/register", async (req, res) => {
  const { imei, iccid, batteries = [] } = req.body;

  const available = batteries.filter(
    b => b.lock_status === "1" &&
         parseInt(b.battery_capacity) >= 60 &&
         b.battery_abnormal === "0" &&
         b.cable_abnormal === "0"
  ).length;

  const rented = batteries.length - available;

  const batteryData = batteries.map(b => ({
    battery_id: b.battery_id,
    slot_id: b.slot_id?.toString() || "",
    level: parseInt(b.battery_capacity),
    status: b.lock_status === "1" ? "Online" : "Offline",
    rented: false,
    phoneNumber: "",
    rentedAt: null,
    amount: 0,
  }));

  await db.collection("station_stats").doc(imei).set({
    stationCode: imei,
    imei,
    iccid,
    availableCount: available,
    rentedCount: rented,
    station_status: "Online",
    timestamp: Timestamp.now(),
    batteries: batteryData,
  });

  console.log(`✅ Registered station ${imei}`);
  res.status(200).json({ code: 0, message: "success" });
});

// MARK: Battery return
router.post("/return", async (req, res) => {
  const { battery_id } = req.body;

  const rentalSnap = await db.collection("rentals")
    .where("battery_id", "==", battery_id)
    .where("status", "==", "rented")
    .limit(1)
    .get();

  if (!rentalSnap.empty) {
    const doc = rentalSnap.docs[0];
    await doc.ref.update({
      status: "returned",
      returnedAt: Timestamp.now(),
    });
    console.log(`🔁 Returned battery: ${battery_id}`);
  }

  res.status(200).json({ code: 0, message: "success" });
});

// MARK: Offline status
router.post("/status", async (req, res) => {
  const { imei, status } = req.body;

  if (status === "0") {
    await db.collection("station_stats").doc(imei).update({
      station_status: "Offline",
      timestamp: Timestamp.now(),
    });
    console.warn(`⚠️ Station ${imei} offline`);
  }

  res.status(200).json({ code: 0, message: "success" });
});

export default router;
