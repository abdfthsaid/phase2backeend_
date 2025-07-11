import express from "express";
import db from "../config/firebase.js";
import { Timestamp } from "firebase-admin/firestore";

const router = express.Router();

// GET: Daily customer count
router.get("/daily/:stationCode", async (req, res) => {
  const { stationCode } = req.params;
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const docId = `${stationCode}_${dateStr}`;

  try {
    const doc = await db.collection("daily_customer_stats").doc(docId).get();

    if (!doc.exists) {
      return res.json({ stationCode, date: dateStr, count: 0 });
    }

    const data = doc.data();
    res.json({ stationCode, date: dateStr, count: data.count || 0 });
  } catch (err) {
    console.error("Error fetching daily customer:", err);
    res.status(500).json({ error: "Failed to fetch daily customer count" });
  }
});

router.get("/monthly/:stationCode", async (req, res) => {
  const { stationCode } = req.params;

  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}`;
  const monthlyDocId = `${stationCode}_${yearMonth}`;

  try {
    const doc = await db
      .collection("monthly_customer_stats")
      .doc(monthlyDocId)
      .get();

    res.status(200).json({
      imei: stationCode,
      month: yearMonth,
      count: doc.exists ? doc.data().count : 0,
    });
  } catch (err) {
    console.error("Monthly customer fetch error:", err);
    res.status(500).json({ error: "Failed to get monthly customer stats" });
  }
});

// 📊 GET: Total Daily Customers (All Stations)
router.get("/daily-total", async (req, res) => {
  const today = new Date().toISOString().split("T")[0]; // e.g. "2025-07-11"

  try {
    const snapshot = await db
      .collection("daily_customer_stats")
      .where("date", "==", today)
      .get();

    let total = 0;

    snapshot.forEach((doc) => {
      total += doc.data().count || 0;
    });

    res.json({
      date: today,
      totalCustomersToday: total,
      stations: snapshot.size,
    });
  } catch (error) {
    console.error("❌ Failed to fetch daily totals:", error);
    res.status(500).json({ error: "Failed to fetch daily totals ❌" });
  }
});

// 📊 GET: Total Monthly Customers (All Stations)
router.get("/monthly-total", async (req, res) => {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}`;

  try {
    const snapshot = await db
      .collection("monthly_customer_stats")
      .where("month", "==", monthKey)
      .get();

    let total = 0;

    snapshot.forEach((doc) => {
      total += doc.data().count || 0;
    });

    res.json({
      month: monthKey,
      totalCustomersThisMonth: total,
      stations: snapshot.size,
    });
  } catch (error) {
    console.error("❌ Failed to fetch monthly totals:", error);
    res.status(500).json({ error: "Failed to fetch monthly totals ❌" });
  }
});

export default router;
