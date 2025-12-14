import express from "express";
import db from "../config/firebase.js";
import { Timestamp } from "firebase-admin/firestore";

const router = express.Router();

// ✅✅
// 🔐 POST: Save rental log & update daily + monthly customer stats

// router.post("/log", async (req, res) => {
//   console.log("📥 /log route hit:", req.body);

//   const { imei, battery_id, slot_id, amount, phoneNumber } = req.body;

//   try {
//     // 🔍 Look up station using IMEI as the document ID
//     const stationDoc = await db.collection("stations").doc(imei).get();

//     if (!stationDoc.exists) {
//       return res.status(404).json({ error: "Station not found ❌" });
//     }

//     // ✅ Save rental with IMEI
//     await db.collection("rentals").add({
//       stationCode: imei, // ✅ still store as stationCode field
//       imei,
//       battery_id,
//       slot_id,
//       amount,
//       phoneNumber,
//       status: "rented",
//       timestamp: Timestamp.now(),
//     });

//     const now = new Date();

//     // 📆 DAILY CUSTOMER COUNTER
//     const todayKey = now.toISOString().split("T")[0];
//     const dailyId = `${imei}_${todayKey}`;
//     const dailyRef = db.collection("daily_customer_stats").doc(dailyId);

//     await db.runTransaction(async (t) => {
//       const dailyDoc = await t.get(dailyRef);
//       if (dailyDoc.exists) {
//         t.update(dailyRef, { count: (dailyDoc.data().count || 0) + 1 });
//       } else {
//         t.set(dailyRef, {
//           stationCode: imei,
//           date: todayKey,
//           count: 1,
//         });
//       }
//     });

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

export default router;
