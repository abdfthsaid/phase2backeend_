import express from "express";
import db from "../config/firebase.js";
import { Timestamp } from "firebase-admin/firestore";

const router = express.Router();

// ✅ IMEI to stationCode mapping
const imeiToStationCode = {
  "WSEP161721195358": "58",
  "WSEP161741066504": "04",
  "WSEP161741066505": "05",
  "WSEP161741066502": "02",
  "WSEP161741066503": "03",
};

// ✅ Helper to calculate revenue after Waafi cut
function netRevenue(amount) {
  if (amount === 1) return amount - 0.02;   // $1 payment, 2% cut
  if (amount === 0.5) return amount - 0.01; // $0.5 payment, 2% cut
  return amount; // fallback for other amounts
}

// ✅ Helper: get UTC start of day/month
function getUTCStartOfDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}
function getUTCStartOfMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

// ✅ DAILY REVENUE FOR SINGLE STATION (by IMEI)
router.get("/daily/:imei", async (req, res) => {
  const imei = req.params.imei;
  const stationCode = imeiToStationCode[imei];

  if (!stationCode) return res.status(400).json({ error: `Unknown IMEI ${imei}` });

  const todayUTC = getUTCStartOfDay();

  try {
    const snapshot = await db
      .collection("rentals")
      .where("stationCode", "==", stationCode)
      .where("timestamp", ">=", Timestamp.fromDate(todayUTC))
      .where("status", "in", ["rented", "returned"])
      .get();

    let total = 0;
    let count = 0;

    snapshot.forEach((doc) => {
      const data = doc.data();
      const amount = parseFloat(data.amount || 0);
      if (!isNaN(amount)) {
        total += netRevenue(amount);
        count++;
      }
    });

    res.json({
      imei,
      stationCode,
      totalRevenueToday: total,
      totalRentalsToday: count,
      date: todayUTC.toISOString().split("T")[0], // UTC date
    });
  } catch (error) {
    console.error("❌ Error calculating daily revenue:", error);
    res.status(500).json({ error: "Failed to calculate daily revenue ❌" });
  }
});

// ✅ DAILY REVENUE FOR ALL STATIONS
router.get("/daily", async (req, res) => {
  const todayUTC = getUTCStartOfDay();

  try {
    const snapshot = await db
      .collection("rentals")
      .where("timestamp", ">=", Timestamp.fromDate(todayUTC))
      .where("status", "in", ["rented", "returned"])
      .get();

    let total = 0;
    let count = 0;

    snapshot.forEach((doc) => {
      const data = doc.data();
      const amount = parseFloat(data.amount || 0);
      if (!isNaN(amount)) {
        total += netRevenue(amount);
        count++;
      }
    });

    res.json({
      totalRevenueToday: total,
      totalRentalsToday: count,
      date: todayUTC.toISOString().split("T")[0], // UTC date
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

  if (!stationCode) return res.status(400).json({ error: `Unknown IMEI ${imei}` });

  const now = new Date();
  const startOfMonthUTC = getUTCStartOfMonth(now);

  try {
    const snapshot = await db
      .collection("rentals")
      .where("stationCode", "==", stationCode)
      .where("timestamp", ">=", Timestamp.fromDate(startOfMonthUTC))
      .where("status", "in", ["rented", "returned"])
      .get();

    let total = 0;
    let count = 0;

    snapshot.forEach((doc) => {
      const data = doc.data();
      const amount = parseFloat(data.amount || 0);
      if (!isNaN(amount)) {
        total += netRevenue(amount);
        count++;
      }
    });

    res.json({
      imei,
      stationCode,
      totalRevenueMonthly: total,
      totalRentalsThisMonth: count,
      month: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`, // UTC month
    });
  } catch (error) {
    console.error("❌ Error calculating monthly revenue:", error);
    res.status(500).json({ error: "Failed to calculate monthly revenue ❌" });
  }
});

// ✅ MONTHLY REVENUE FOR ALL STATIONS
router.get("/monthly", async (req, res) => {
  const now = new Date();
  const startOfMonthUTC = getUTCStartOfMonth(now);

  try {
    const snapshot = await db
      .collection("rentals")
      .where("timestamp", ">=", Timestamp.fromDate(startOfMonthUTC))
      .where("status", "in", ["rented", "returned"])
      .get();

    let total = 0;
    let count = 0;

    snapshot.forEach((doc) => {
      const data = doc.data();
      const amount = parseFloat(data.amount || 0);
      if (!isNaN(amount)) {
        total += netRevenue(amount);
        count++;
      }
    });

    res.json({
      totalRevenueMonthly: total,
      totalRentalsThisMonth: count,
      month: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`, // UTC month
    });
  } catch (error) {
    console.error("❌ Error calculating total monthly revenue:", error);
    res.status(500).json({ error: "Failed to calculate total monthly revenue ❌" });
  }
});

export default router;
