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

/* ------------------------------------------------------------------ */
/* 📌 Station-level counts                                             */
/* ------------------------------------------------------------------ */

// ✅ Daily UNIQUE customer count for one station (by IMEI)
router.get("/daily-by-imei/:imei", async (req, res) => {
  const { imei } = req.params;
  const { startTs, dateStr } = getDayBounds();

  try {
    // Query rentals from today onwards with valid status
    const snapshot = await db
      .collection("rentals")
      .where("imei", "==", imei)
      .where("timestamp", ">=", startTs)
      .where("status", "in", ["rented", "returned"])
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
      uniqueCustomersToday: uniquePhones.size,
      totalRentalsToday: snapshot.size,
    });
  } catch (err) {
    console.error("❌ Error calculating daily rentals:", err);
    res.status(500).json({ error: "Failed to fetch daily customer count" });
  }
});

// ✅ Monthly UNIQUE customer count for one station (by IMEI)
router.get("/monthly-by-imei/:imei", async (req, res) => {
  const { imei } = req.params;
  const { startTs, monthKey } = getMonthBounds();

  try {
    const snapshot = await db
      .collection("rentals")
      .where("imei", "==", imei)
      .where("timestamp", ">=", startTs)
      .where("status", "in", ["rented", "returned"])
      .get();

    const phones = new Set();
    snapshot.forEach((doc) => {
      const num = doc.data().phoneNumber;
      if (num) phones.add(num);
    });

    res.json({
      imei,
      month: monthKey,
      uniqueCustomersThisMonth: phones.size,
      totalRentalsThisMonth: snapshot.size,
    });
  } catch (err) {
    console.error("❌ Monthly customer error:", err);
    res.status(500).json({ error: "Failed to fetch monthly customer count" });
  }
});

/* ------------------------------------------------------------------ */
/* 📌 Global totals (all stations)                                    */
/* ------------------------------------------------------------------ */

// ✅ Daily total across ALL stations
router.get("/daily-total", async (req, res) => {
  const { startTs, dateStr } = getDayBounds();
  try {
    const snapshot = await db
      .collection("rentals")
      .where("timestamp", ">=", startTs)
      .where("status", "in", ["rented", "returned"])
      .get();

    const uniqueCustomers = new Set();
    const stationSet = new Set();
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.phoneNumber) {
        uniqueCustomers.add(data.phoneNumber);
      }
      if (data.imei) {
        stationSet.add(data.imei);
      }
    });

    res.json({
      date: dateStr,
      uniqueCustomersToday: uniqueCustomers.size,
      totalRentalsToday: snapshot.size,
      stationsActive: stationSet.size,
    });
  } catch (err) {
    console.error("❌ Daily-total error:", err);
    res.status(500).json({ error: "Failed to fetch daily totals" });
  }
});

// ✅ Monthly total across ALL stations
router.get("/monthly-total", async (req, res) => {
  const { startTs, monthKey } = getMonthBounds();
  try {
    const snapshot = await db
      .collection("rentals")
      .where("timestamp", ">=", startTs)
      .where("status", "in", ["rented", "returned"])
      .get();

    const uniqueCustomers = new Set();
    const stationSet = new Set();
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.phoneNumber) {
        uniqueCustomers.add(data.phoneNumber);
      }
      if (data.imei) {
        stationSet.add(data.imei);
      }
    });

    res.json({
      month: monthKey,
      uniqueCustomersThisMonth: uniqueCustomers.size,
      totalRentalsThisMonth: snapshot.size,
      stationsActive: stationSet.size,
    });
  } catch (err) {
    console.error("❌ Monthly-total error:", err);
    res.status(500).json({ error: "Failed to fetch monthly totals" });
  }
});

export default router;
