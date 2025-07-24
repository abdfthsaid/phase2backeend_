// routes/customerRoutes.js
import express from "express";
import db from "../config/firebase.js";
import { Timestamp } from "firebase-admin/firestore";

const router = express.Router();

/**
 * Helper to compute Firestore Timestamp bounds for a given Date
 */
function getDayBounds(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    startTs: Timestamp.fromDate(start),
    endTs: Timestamp.fromDate(end),
    dateStr: start.toISOString().split("T")[0],
  };
}

function getMonthBounds(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return {
    startTs: Timestamp.fromDate(start),
    endTs: Timestamp.fromDate(end),
    monthKey: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(
      2,
      "0"
    )}`,
  };
}

// GET /api/customers/daily/:stationCode
// Returns number of unique phoneNumbers in rentals for that station today
// 📅 GET: Daily unique customer count from rentals (live)
router.get("/daily/:stationCode", async (req, res) => {
  const { stationCode } = req.params;
  const now = new Date();

  // Start and end of today
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  try {
    const snapshot = await db
      .collection("rentals")
      .where("imei", "==", stationCode)
      .where("timestamp", ">=", Timestamp.fromDate(startOfDay))
      .where("timestamp", "<=", Timestamp.fromDate(endOfDay))
      .get();

    // Use a Set to collect unique phone numbers
    const uniquePhones = new Set();
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.phoneNumber) {
        uniquePhones.add(data.phoneNumber);
      }
    });

    res.status(200).json({
      stationCode,
      date: now.toISOString().split("T")[0],
      count: uniquePhones.size,
    });
  } catch (err) {
    console.error("❌ Error calculating daily rentals:", err);
    res.status(500).json({ error: "Failed to fetch daily customer count" });
  }
});

// GET /api/customers/monthly/:stationCode
// Returns number of unique phoneNumbers in rentals for that station this month
router.get("/monthly/:stationCode", async (req, res) => {
  const { stationCode } = req.params;
  const { startTs, endTs, monthKey } = getMonthBounds();

  try {
    const snap = await db
      .collection("rentals")
      .where("stationCode", "==", stationCode)
      .where("timestamp", ">=", startTs)
      .where("timestamp", "<", endTs)
      .get();

    const phones = new Set();
    snap.forEach((doc) => {
      const num = doc.data().phoneNumber;
      if (num) phones.add(num);
    });

    res.json({
      stationCode,
      month: monthKey,
      count: phones.size,
    });
  } catch (err) {
    console.error("❌ Monthly customer error:", err);
    res.status(500).json({ error: "Failed to fetch monthly customer count" });
  }
});

// GET /api/customers/daily-total
// Sum of unique customers across all stations today
router.get("/daily-total", async (req, res) => {
  const { startTs, endTs, dateStr } = getDayBounds();
  try {
    const snap = await db
      .collection("rentals")
      .where("timestamp", ">=", startTs)
      .where("timestamp", "<", endTs)
      .get();

    const phones = new Set();
    snap.forEach((doc) => {
      const num = doc.data().phoneNumber;
      if (num) phones.add(`${doc.data().stationCode}::${num}`); // ensure per‑station uniqueness
    });

    res.json({
      date: dateStr,
      totalCustomersToday: phones.size,
      stations: new Set(snap.docs.map((d) => d.data().stationCode)).size,
    });
  } catch (err) {
    console.error("❌ Daily-total error:", err);
    res.status(500).json({ error: "Failed to fetch daily total customers" });
  }
});

// GET /api/customers/monthly-total
// Sum of unique customers across all stations this month
router.get("/monthly-total", async (req, res) => {
  const { startTs, endTs, monthKey } = getMonthBounds();
  try {
    const snap = await db
      .collection("rentals")
      .where("timestamp", ">=", startTs)
      .where("timestamp", "<", endTs)
      .get();

    const phones = new Set();
    snap.forEach((doc) => {
      const { stationCode, phoneNumber } = doc.data();
      if (phoneNumber) phones.add(`${stationCode}::${phoneNumber}`);
    });

    res.json({
      month: monthKey,
      totalCustomersThisMonth: phones.size,
      stations: new Set(snap.docs.map((d) => d.data().stationCode)).size,
    });
  } catch (err) {
    console.error("❌ Monthly-total error:", err);
    res.status(500).json({ error: "Failed to fetch monthly total customers" });
  }
});

export default router;
