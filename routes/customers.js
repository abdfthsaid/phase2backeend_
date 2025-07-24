// routes/customerRoutes.js
import express from "express";
import db from "../config/firebase.js";
import { Timestamp } from "firebase-admin/firestore";

const router = express.Router();

// 🧠 Helpers to compute Timestamp bounds for today/month
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

// ✅ Daily unique customer count for station (by IMEI)
// Change route path to be clearer
router.get("/daily-by-imei/:imei", async (req, res) => {
  const { imei } = req.params;

  const { startTs, endTs, dateStr } = getDayBounds();

  try {
    const snapshot = await db
      .collection("rentals")
      .where("imei", "==", imei)
      .where("timestamp", ">=", startTs)
      .where("timestamp", "<=", endTs)
      .get();

    const uniquePhones = new Set();
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.phoneNumber) {
        uniquePhones.add(data.phoneNumber);
      }
    });

    res.status(200).json({
      imei,
      date: dateStr,
      count: uniquePhones.size,
    });
  } catch (err) {
    console.error("❌ Error calculating daily rentals:", err);
    res.status(500).json({ error: "Failed to fetch daily customer count" });
  }
});

// ✅ Monthly unique customer count for station (by IMEI)
router.get("/monthly/:imei", async (req, res) => {
  const { imei } = req.params;
  const { startTs, endTs, monthKey } = getMonthBounds();

  try {
    const snap = await db
      .collection("rentals")
      .where("imei", "==", imei)
      .where("timestamp", ">=", startTs)
      .where("timestamp", "<", endTs)
      .get();

    const phones = new Set();
    snap.forEach((doc) => {
      const num = doc.data().phoneNumber;
      if (num) phones.add(num);
    });

    res.json({
      stationIMEI: imei,
      month: monthKey,
      count: phones.size,
    });
  } catch (err) {
    console.error("❌ Monthly customer error:", err);
    res.status(500).json({ error: "Failed to fetch monthly customer count" });
  }
});

// ✅ Daily total (across all stations)
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
      const imei = doc.data().imei;
      if (num && imei) phones.add(`${imei}::${num}`);
    });

    res.json({
      date: dateStr,
      totalCustomersToday: phones.size,
      stations: new Set(snap.docs.map((d) => d.data().imei)).size,
    });
  } catch (err) {
    console.error("❌ Daily-total error:", err);
    res.status(500).json({ error: "Failed to fetch daily total customers" });
  }
});

// ✅ Monthly total (across all stations)
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
      const num = doc.data().phoneNumber;
      const imei = doc.data().imei;
      if (num && imei) phones.add(`${imei}::${num}`);
    });

    res.json({
      month: monthKey,
      totalCustomersThisMonth: phones.size,
      stations: new Set(snap.docs.map((d) => d.data().imei)).size,
    });
  } catch (err) {
    console.error("❌ Monthly-total error:", err);
    res.status(500).json({ error: "Failed to fetch monthly total customers" });
  }
});

export default router;
