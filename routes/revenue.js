import express from "express";
import db from "../config/firebase.js";
import { Timestamp } from "firebase-admin/firestore";

const router = express.Router();

// ✅ IMEI to stationCode mapping
const imeiToStationCode = {
  "WSEP161721195358": "01",
  "WSEP161741066504": "02",
  "WSEP161741066505": "04",
  "WSEP161741066502": "02",
  "WSEP161741066503": "03",
};

// ✅ DAILY REVENUE FOR SINGLE STATION (by IMEI)
router.get("/daily/:imei", async (req, res) => {
  const imei = req.params.imei;
  const stationCode = imeiToStationCode[imei];

  if (!stationCode) {
    return res.status(400).json({ error: `Unknown IMEI ${imei}` });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const snapshot = await db
      .collection("rentals")
      .where("stationCode", "==", stationCode)
      .where("timestamp", ">=", Timestamp.fromDate(today))
      .where("status", "in", ["rented", "returned"])
      .get();

    let total = 0;
    let count = 0;

    snapshot.forEach((doc) => {
      const data = doc.data();
      const amount = parseFloat(data.amount || 0);
      if (!isNaN(amount)) {
        total += amount;
        count++;
      }
    });

    res.json({
      imei,
      stationCode,
      totalRevenueToday: total,
      totalRentalsToday: count,
      date: today.toISOString().split("T")[0],
    });
  } catch (error) {
    console.error("❌ Error calculating daily revenue:", error);
    res.status(500).json({ error: "Failed to calculate daily revenue ❌" });
  }
});

// ✅ DAILY REVENUE FOR ALL STATIONS
router.get("/daily", async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const snapshot = await db
      .collection("rentals")
      .where("timestamp", ">=", Timestamp.fromDate(today))
      .where("status", "in", ["rented", "returned"])
      .get();

    let total = 0;
    let count = 0;

    snapshot.forEach((doc) => {
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
    console.error("❌ Error calculating total daily revenue:", error);
    res.status(500).json({ error: "Failed to calculate total daily revenue ❌" });
  }
});

// ✅ MONTHLY REVENUE FOR SINGLE STATION (by IMEI)
router.get("/monthly/:imei", async (req, res) => {
  const imei = req.params.imei;
  const stationCode = imeiToStationCode[imei];

  if (!stationCode) {
    return res.status(400).json({ error: `Unknown IMEI ${imei}` });
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  try {
    const snapshot = await db
      .collection("rentals")
      .where("stationCode", "==", stationCode)
      .where("timestamp", ">=", Timestamp.fromDate(startOfMonth))
      .where("status", "in", ["rented", "returned"])
      .get();

    let total = 0;
    let count = 0;

    snapshot.forEach((doc) => {
      const data = doc.data();
      const amount = parseFloat(data.amount || 0);
      if (!isNaN(amount)) {
        total += amount;
        count++;
      }
    });

    res.json({
      imei,
      stationCode,
      totalRevenueMonthly: total,
      totalRentalsThisMonth: count,
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    });
  } catch (error) {
    console.error("❌ Error calculating monthly revenue:", error);
    res.status(500).json({ error: "Failed to calculate monthly revenue ❌" });
  }
});

// ✅ MONTHLY REVENUE FOR ALL STATIONS
router.get("/monthly", async (req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  try {
    const snapshot = await db
      .collection("rentals")
      .where("timestamp", ">=", Timestamp.fromDate(startOfMonth))
      .where("status", "in", ["rented", "returned"])
      .get();

    let total = 0;
    let count = 0;

    snapshot.forEach((doc) => {
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
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    });
  } catch (error) {
    console.error("❌ Error calculating total monthly revenue:", error);
    res.status(500).json({ error: "Failed to calculate total monthly revenue ❌" });
  }
});

export default router;
