import express from "express";
import db from "../config/firebase.js";
import { Timestamp } from "firebase-admin/firestore";

const router = express.Router();

// ✅✅
// 🔐 POST: Save rental log & update daily + monthly customer stats

router.post("/log", async (req, res) => {
  console.log("📥 /log route hit:", req.body);

  const { imei, battery_id, slot_id, amount, phoneNumber } = req.body;

  try {
    // 🔍 Look up station using IMEI as the document ID
    const stationDoc = await db.collection("stations").doc(imei).get();

    if (!stationDoc.exists) {
      return res.status(404).json({ error: "Station not found ❌" });
    }

    // ✅ Save rental with IMEI
    await db.collection("rentals").add({
      stationCode: imei, // ✅ still store as stationCode field
      imei,
      battery_id,
      slot_id,
      amount,
      phoneNumber,
      status: "rented",
      timestamp: Timestamp.now(),
    });

    const now = new Date();

    // 📆 DAILY CUSTOMER COUNTER
    const todayKey = now.toISOString().split("T")[0];
    const dailyId = `${imei}_${todayKey}`;
    const dailyRef = db.collection("daily_customer_stats").doc(dailyId);

    await db.runTransaction(async (t) => {
      const dailyDoc = await t.get(dailyRef);
      if (dailyDoc.exists) {
        t.update(dailyRef, { count: (dailyDoc.data().count || 0) + 1 });
      } else {
        t.set(dailyRef, {
          stationCode: imei,
          date: todayKey,
          count: 1,
        });
      }
    });

    // 📅 MONTHLY CUSTOMER COUNTER
    const monthKey = `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, "0")}`;
    const monthlyId = `${imei}_${monthKey}`;
    const monthlyRef = db.collection("monthly_customer_stats").doc(monthlyId);

    await db.runTransaction(async (t) => {
      const monthlyDoc = await t.get(monthlyRef);
      if (monthlyDoc.exists) {
        t.update(monthlyRef, { count: (monthlyDoc.data().count || 0) + 1 });
      } else {
        t.set(monthlyRef, {
          stationCode: imei,
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

// ✅✅
// 📅 GET: Daily revenue
router.get("/revenue/daily/:stationCode", async (req, res) => {
  const { stationCode } = req.params;
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
      stationCode,
      totalRevenueToday: total,
      totalRentalsToday: count,
      date: today.toISOString().split("T")[0],
    });
  } catch (error) {
    console.error("❌ Daily revenue error:", error);
    res.status(500).json({ error: "Failed to calculate daily revenue ❌" });
  }
});

// ✅✅
// 📆 GET: Monthly revenue
router.get("/revenue/monthly/:stationCode", async (req, res) => {
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

// ✅✅
// GET: Today’s rented
router.get("/today/rented", async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const endOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1
    );

    const startTimestamp = Timestamp.fromDate(startOfDay);
    const endTimestamp = Timestamp.fromDate(endOfDay);

    const snapshot = await db
      .collection("rentals")
      .where("timestamp", ">=", startTimestamp)
      .where("timestamp", "<", endTimestamp)
      .where("status", "==", "rented")
      .orderBy("timestamp", "desc")
      .limit(10)
      .get();

    const rentals = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json({ rentals });
  } catch (error) {
    console.error("❌ Error fetching today rented rentals:", error.message);
    res
      .status(500)
      .json({ error: "Failed to fetch today's rented rentals ❌" });
  }
});

// ✅✅
// GET: Daily customer count
router.get("/daily/:stationCode", async (req, res) => {
  const { stationCode } = req.params;
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
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
