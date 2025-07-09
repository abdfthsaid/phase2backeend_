import express from "express";
import db from "../config/firebase.js";
import { Timestamp } from "firebase-admin/firestore";

const router = express.Router();


// 🔐 POST: Save rental log & update daily + monthly customer stats
router.post("/log", async (req, res) => {
  const { stationCode, battery_id, slot_id, amount, phoneNumber } = req.body;

  try {
    const stationDoc = await db.collection("stations").doc(stationCode).get();
    if (!stationDoc.exists) {
      return res.status(404).json({ error: "Station not found ❌" });
    }

    // ✅ Save rental
    await db.collection("rentals").add({
      stationCode,
      battery_id,
      slot_id,
      amount,
      phoneNumber,
      status: "rented",
      timestamp: Timestamp.now(),
    });

    const now = new Date();

    // ========== 📆 DAILY CUSTOMER COUNTER ==========
    const todayKey = now.toISOString().split("T")[0]; // e.g. "2025-07-09"
    const dailyId = `${stationCode}_${todayKey}`;
    const dailyRef = db.collection("daily_customer_stats").doc(dailyId);

    await db.runTransaction(async (t) => {
      const dailyDoc = await t.get(dailyRef);
      if (dailyDoc.exists) {
        t.update(dailyRef, { count: (dailyDoc.data().count || 0) + 1 });
      } else {
        t.set(dailyRef, {
          stationCode,
          date: todayKey,
          count: 1,
        });
      }
    });

    // ========== 📅 MONTHLY CUSTOMER COUNTER ==========
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; // e.g. "2025-07"
    const monthlyId = `${stationCode}_${monthKey}`;
    const monthlyRef = db.collection("monthly_customer_stats").doc(monthlyId);

    await db.runTransaction(async (t) => {
      const monthlyDoc = await t.get(monthlyRef);
      if (monthlyDoc.exists) {
        t.update(monthlyRef, { count: (monthlyDoc.data().count || 0) + 1 });
      } else {
        t.set(monthlyRef, {
          stationCode,
          month: monthKey,
          count: 1,
        });
      }
    });

    res.status(201).json({ message: "Rental logged successfully ✅" });
  } catch (error) {
    console.error("Log Error:", error);
    res.status(500).json({ error: "Rental log failed ❌" });
  }
});




// 📅 GET: Daily revenue
router.get("/revenue/daily/:stationCode", async (req, res) => {
  const { stationCode } = req.params;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const snapshot = await db.collection("rentals")
      .where("stationCode", "==", stationCode)
      .where("timestamp", ">=", Timestamp.fromDate(today))
      .get();

    let total = 0;
    snapshot.forEach(doc => {
      total += parseFloat(doc.data().amount || 0);
    });

    res.json({ stationCode, totalRevenueToday: total });
  } catch (error) {
    console.error("Daily revenue error:", error);
    res.status(500).json({ error: "Failed to calculate daily revenue" });
  }
});

// 📆 GET: Monthly revenue
router.get("/revenue/monthly/:stationCode", async (req, res) => {
  const { stationCode } = req.params;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  try {
    const snapshot = await db.collection("rentals")
      .where("stationCode", "==", stationCode)
      .where("timestamp", ">=", Timestamp.fromDate(startOfMonth))
      .get();

    let total = 0;
    snapshot.forEach(doc => {
      total += parseFloat(doc.data().amount || 0);
    });

    res.json({ stationCode, totalRevenueMonthly: total });
  } catch (error) {
    console.error("Monthly revenue error:", error);
    res.status(500).json({ error: "Failed to calculate monthly revenue" });
  }
});

// 🕒 GET: Latest 10 rentals
router.get("/recent", async (req, res) => {
  try {
    const snapshot = await db.collection("rentals")
      .orderBy("timestamp", "desc")
      .limit(10)
      .get();

    const recentRentals = snapshot.docs.map(doc => doc.data());

    res.status(200).json({ recentRentals });
  } catch (error) {
    console.error("Recent rentals error:", error);
    res.status(500).json({ error: "Failed to fetch recent rentals" });
  }
});

// 📄 GET: Rentals for today
router.get("/daily/:stationCode", async (req, res) => {
  const { stationCode } = req.params;

  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const snapshot = await db.collection("rentals")
      .where("stationCode", "==", stationCode)
      .where("timestamp", ">=", Timestamp.fromDate(start))
      .where("timestamp", "<", Timestamp.fromDate(end))
      .get();

    const rentals = snapshot.docs.map(doc => doc.data());

    res.status(200).json({ total: rentals.length, rentals });
  } catch (err) {
    console.error("Daily rentals error:", err);
    res.status(500).json({ error: "Failed to fetch daily rentals" });
  }
});

// 🔁 PUT: Return battery
router.put("/return", async (req, res) => {
  const { battery_id, stationCode } = req.body;

  if (!battery_id || !stationCode) {
    return res.status(400).json({ error: "Missing battery_id or stationCode" });
  }

  try {
    const snapshot = await db.collection("rentals")
      .where("battery_id", "==", battery_id)
      .where("stationCode", "==", stationCode)
      .where("status", "==", "rented")
      .orderBy("timestamp", "desc")
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ error: "Rental not found or already returned" });
    }

    const rentalDoc = snapshot.docs[0].ref;

    await rentalDoc.update({
      status: "returned",
      returnedAt: Timestamp.now(),
    });

    res.status(200).json({ success: true, message: "Battery marked as returned" });
  } catch (err) {
    console.error("Return error:", err);
    res.status(500).json({ error: "Failed to mark as returned" });
  }
});

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



export default router;
