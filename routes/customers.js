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

// ✅ Daily customer count for station (by IMEI) → NOW raw rentals
router.get("/daily-by-imei/:imei", async (req, res) => {
  const { imei } = req.params;
  const { startTs, endTs, dateStr } = getDayBounds();

  try {
    const snapshot = await db
      .collection("rentals")
      .where("imei", "==", imei)
      .where("timestamp", ">=", startTs)
      .where("timestamp", "<", endTs)
      .get();

    res.status(200).json({
      imei,
      date: dateStr,
      count: snapshot.size, // 👈 raw doc count
    });
  } catch (err) {
    console.error("❌ Error calculating daily rentals:", err);
    res.status(500).json({ error: "Failed to fetch daily customer count" });
  }
});

// ✅ Monthly customer count for station (by IMEI) → NOW raw rentals
router.get("/monthly/:imei", async (req, res) => {
  const { imei } = req.params;
  const { startTs, endTs, monthKey } = getMonthBounds();

  try {
    const snapshot = await db
      .collection("rentals")
      .where("imei", "==", imei)
      .where("timestamp", ">=", startTs)
      .where("timestamp", "<", endTs)
      .get();

    res.json({
      stationIMEI: imei,
      month: monthKey,
      count: snapshot.size, // 👈 raw doc count
    });
  } catch (err) {
    console.error("❌ Monthly customer error:", err);
    res.status(500).json({ error: "Failed to fetch monthly customer count" });
  }
});

// ✅ Daily total (across all stations) → NOW raw rentals
router.get("/daily-total", async (req, res) => {
  const { startTs, endTs, dateStr } = getDayBounds();
  try {
    const snapshot = await db
      .collection("rentals")
      .where("timestamp", ">=", startTs)
      .where("timestamp", "<", endTs)
      .get();

    res.json({
      date: dateStr,
      totalCustomersToday: snapshot.size, // 👈 raw doc count
      stations: new Set(snapshot.docs.map((d) => d.data().imei)).size,
    });
  } catch (err) {
    console.error("❌ Daily-total error:", err);
    res.status(500).json({ error: "Failed to fetch daily total customers" });
  }
});

// ✅ Monthly total (across all stations) → NOW raw rentals
router.get("/monthly-total", async (req, res) => {
  const { startTs, endTs, monthKey } = getMonthBounds();
  try {
    const snapshot = await db
      .collection("rentals")
      .where("timestamp", ">=", startTs)
      .where("timestamp", "<", endTs)
      .get();

    res.json({
      month: monthKey,
      totalCustomersThisMonth: snapshot.size, // 👈 raw doc count
      stations: new Set(snapshot.docs.map((d) => d.data().imei)).size,
    });
  } catch (err) {
    console.error("❌ Monthly-total error:", err);
    res.status(500).json({ error: "Failed to fetch monthly total customers" });
  }
});

export default router;
