import express from "express";
import db from "../config/firebase.js";
import { Timestamp } from "firebase-admin/firestore";

const router = express.Router();

// ✅ DAILY REVENUE FOR SINGLE STATION (rented only)
// 🧮 Daily revenue (only "rented" status):
router.get("/daily/:stationCode", async (req, res) => {
  const { stationCode } = req.params;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  console.log(`[Revenue] Fetching daily revenue for ${stationCode} from`, today);

  try {
    const snap = await db
      .collection("rentals")
      .where("stationCode", "==", stationCode)
      .where("timestamp", ">=", Timestamp.fromDate(today))
      .where("status", "==", "rented")
      .get();

    console.log(`[Revenue] Found ${snap.size} rentals`);

    let total = 0;
    let count = 0;

    snap.forEach((doc) => {
      const { amount } = doc.data();
      total += parseFloat(amount || 0);
      count++;
    });

    console.log(`[Revenue] total=${total}, count=${count}`);

    return res.json({
      stationCode,
      totalRevenueToday: total,
      totalRentalsToday: count,
      date: today.toISOString().split("T")[0],
    });
  } catch (err) {
    console.error("❌ Error calculating daily revenue:", err);
    return res.status(500).json({ error: "Failed to calculate daily revenue ❌" });
  }
});

// ✅ MONTHLY REVENUE FOR SINGLE STATION
router.get("/monthly/:stationCode", async (req, res) => {
  const { stationCode } = req.params;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  try {
    const rentedSnap = await db
      .collection("rentals")
      .where("stationCode", "==", stationCode)
      .where("timestamp", ">=", Timestamp.fromDate(startOfMonth))
      .where("status", "==", "rented")
      .get();

    const returnedSnap = await db
      .collection("rentals")
      .where("stationCode", "==", stationCode)
      .where("timestamp", ">=", Timestamp.fromDate(startOfMonth))
      .where("status", "==", "returned")
      .get();

    const allDocs = [...rentedSnap.docs, ...returnedSnap.docs];

    let total = 0;
    let count = 0;

    allDocs.forEach((doc) => {
      const data = doc.data();
      const amount = parseFloat(data.amount || 0);
      if (!isNaN(amount)) {
        total += amount;
        count++;
      }
    });

    res.json({
      stationCode,
      totalRevenueMonthly: total,
      totalRentalsThisMonth: count,
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
        2,
        "0"
      )}`,
    });
  } catch (error) {
    console.error("❌ Monthly revenue error:", error);
    res.status(500).json({ error: "Failed to calculate monthly revenue ❌" });
  }
});

// ✅ DAILY REVENUE FOR ALL STATIONS
router.get("/daily", async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const rentedSnap = await db
      .collection("rentals")
      .where("timestamp", ">=", Timestamp.fromDate(today))
      .where("status", "==", "rented")
      .get();

    const returnedSnap = await db
      .collection("rentals")
      .where("timestamp", ">=", Timestamp.fromDate(today))
      .where("status", "==", "returned")
      .get();

    const allDocs = [...rentedSnap.docs, ...returnedSnap.docs];

    let total = 0;
    let count = 0;

    allDocs.forEach((doc) => {
      const data = doc.data();
      const amount = parseFloat(data.amount || 0);
      if (!isNaN(amount)) {
        total += amount;
        count++;
      }
    });

    res.json({
      totalRevenueToday: total,
      totalRentalsToday: count,
      date: today.toISOString().split("T")[0],
    });
  } catch (error) {
    console.error("❌ All stations daily revenue error:", error);
    res.status(500).json({ error: "Failed to calculate daily revenue ❌" });
  }
});

// ✅ MONTHLY REVENUE FOR ALL STATIONS
router.get("/monthly", async (req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  try {
    const rentedSnap = await db
      .collection("rentals")
      .where("timestamp", ">=", Timestamp.fromDate(startOfMonth))
      .where("status", "==", "rented")
      .get();

    const returnedSnap = await db
      .collection("rentals")
      .where("timestamp", ">=", Timestamp.fromDate(startOfMonth))
      .where("status", "==", "returned")
      .get();

    const allDocs = [...rentedSnap.docs, ...returnedSnap.docs];

    let total = 0;
    let count = 0;

    allDocs.forEach((doc) => {
      const data = doc.data();
      const amount = parseFloat(data.amount || 0);
      if (!isNaN(amount)) {
        total += amount;
        count++;
      }
    });

    res.json({
      totalRevenueMonthly: total,
      totalRentalsThisMonth: count,
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
        2,
        "0"
      )}`,
    });
  } catch (error) {
    console.error("❌ All stations monthly revenue error:", error);
    res.status(500).json({ error: "Failed to calculate monthly revenue ❌" });
  }
});

export default router;
