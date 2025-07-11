import express from "express";
import db from "../config/firebase.js";
import { Timestamp } from "firebase-admin/firestore";

const router = express.Router();

// ===============================
// ✅ 1. Daily Revenue (One Station)
// ===============================
router.get("/daily/:stationCode", async (req, res) => {
  const { stationCode } = req.params;
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of the day

  try {
    const snapshot = await db
      .collection("rentals")
      .where("stationCode", "==", stationCode)
      .where("timestamp", ">=", Timestamp.fromDate(today))
      .where("status", "in", ["rented", "returned"])
      .get();

    let total = 0;
    snapshot.forEach((doc) => {
      total += parseFloat(doc.data().amount || 0);
    });

    res.json({
      stationCode,
      date: today.toISOString().split("T")[0],
      totalRevenueToday: total,
    });
  } catch (err) {
    console.error("❌ Daily revenue error:", err);
    res.status(500).json({ error: "Failed to calculate daily revenue" });
  }
});

// ===================================
// ✅ 2. Monthly Revenue (One Station)
// ===================================
router.get("/monthly/:stationCode", async (req, res) => {
  const { stationCode } = req.params;
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
    snapshot.forEach((doc) => {
      total += parseFloat(doc.data().amount || 0);
    });

    res.json({
      stationCode,
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
      totalRevenueMonthly: total,
    });
  } catch (err) {
    console.error("❌ Monthly revenue error:", err);
    res.status(500).json({ error: "Failed to calculate monthly revenue" });
  }
});

// =======================================
// ✅ 3. Total Daily Revenue (All Stations)
// =======================================
router.get("/daily-total", async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const snapshot = await db
      .collection("rentals")
      .where("timestamp", ">=", Timestamp.fromDate(today))
      .where("status", "in", ["rented", "returned"])
      .get();

    let total = 0;
    snapshot.forEach((doc) => {
      total += parseFloat(doc.data().amount || 0);
    });

    res.json({
      date: today.toISOString().split("T")[0],
      totalRevenueToday: total,
    });
  } catch (err) {
    console.error("❌ Daily total revenue error:", err);
    res.status(500).json({ error: "Failed to calculate total daily revenue" });
  }
});

// ==========================================
// ✅ 4. Total Monthly Revenue (All Stations)
// ==========================================
router.get("/monthly-total", async (req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  try {
    const snapshot = await db
      .collection("rentals")
      .where("timestamp", ">=", Timestamp.fromDate(startOfMonth))
      .where("status", "in", ["rented", "returned"])
      .get();

    let total = 0;
    snapshot.forEach((doc) => {
      total += parseFloat(doc.data().amount || 0);
    });

    res.json({
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
      totalRevenueThisMonth: total,
    });
  } catch (err) {
    console.error("❌ Monthly total revenue error:", err);
    res.status(500).json({ error: "Failed to calculate total monthly revenue" });
  }
});

export default router;
