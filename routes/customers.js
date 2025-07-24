import express from "express";
import db from "../config/firebase.js";
import { Timestamp } from "firebase-admin/firestore";

const router = express.Router();

// 📆 GET: Daily customer count (computed live)
// Returns number of distinct customers (phoneNumber) who rented today
tooltip:
router.get("/daily/:stationCode", async (req, res) => {
  const { stationCode } = req.params;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  try {
    const snapshot = await db.collection("rentals")
      .where("stationCode", "==", stationCode)
      .where("timestamp", ">=", Timestamp.fromDate(start))
      .where("timestamp", "<", Timestamp.fromDate(end))
      .get();

    // count unique phone numbers
    const phones = new Set(snapshot.docs.map(doc => doc.data().phoneNumber));
    res.json({ stationCode, date: start.toISOString().split("T")[0], count: phones.size });
  } catch (err) {
    console.error("Error fetching daily customer count:", err);
    res.status(500).json({ error: "Failed to fetch daily customer count" });
  }
});

// 📅 GET: Monthly customer count (computed live)
router.get("/monthly/:stationCode", async (req, res) => {
  const { stationCode } = req.params;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  try {
    const snapshot = await db.collection("rentals")
      .where("stationCode", "==", stationCode)
      .where("timestamp", ">=", Timestamp.fromDate(start))
      .where("timestamp", "<", Timestamp.fromDate(end))
      .get();

    const phones = new Set(snapshot.docs.map(doc => doc.data().phoneNumber));
    res.json({ stationCode, month: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`, count: phones.size });
  } catch (err) {
    console.error("Error fetching monthly customer count:", err);
    res.status(500).json({ error: "Failed to fetch monthly customer count" });
  }
});

// 🏢 GET: Total daily customers across all stations
router.get("/daily-total", async (_req, res) => {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  try {
    const snapshot = await db.collection("rentals")
      .where("timestamp", ">=", Timestamp.fromDate(start))
      .where("timestamp", "<", Timestamp.fromDate(end))
      .get();

    const phones = new Set(snapshot.docs.map(doc => doc.data().phoneNumber));
    res.json({ date: start.toISOString().split("T")[0], totalCustomersToday: phones.size });
  } catch (err) {
    console.error("Error fetching total daily customers:", err);
    res.status(500).json({ error: "Failed to fetch total daily customers" });
  }
});

// 🏢 GET: Total monthly customers across all stations
router.get("/monthly-total", async (_req, res) => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  try {
    const snapshot = await db.collection("rentals")
      .where("timestamp", ">=", Timestamp.fromDate(start))
      .where("timestamp", "<", Timestamp.fromDate(end))
      .get();

    const phones = new Set(snapshot.docs.map(doc => doc.data().phoneNumber));
    res.json({ month: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`, totalCustomersThisMonth: phones.size });
  } catch (err) {
    console.error("Error fetching total monthly customers:", err);
    res.status(500).json({ error: "Failed to fetch total monthly customers" });
  }
});

export default router;
