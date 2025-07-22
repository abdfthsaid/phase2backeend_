import express from "express";
import db from "../config/firebase.js";

const router = express.Router();

// 🧾 Get last 10 rented transactions with station name
router.get("/latest", async (req, res) => {
  try {
    const snapshot = await db
      .collection("rentals")
      .where("status", "==", "rented")
      .orderBy("timestamp", "desc")
      .limit(10)
      .get();

    const rentals = [];

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const imei = data.imei;

      let stationName = null;

      if (imei) {
        // Find station where imei matches
        const stationQuery = await db
          .collection("stations")
          .where("imei", "==", imei)
          .limit(1)
          .get();

        if (!stationQuery.empty) {
          stationName = stationQuery.docs[0].data().stationName || null;
        }
      }

      rentals.push({
        id: doc.id,
        ...data,
        stationName, // ✅ Add stationName to response
      });
    }

    res.json(rentals);
  } catch (error) {
    console.error("❌ Error fetching latest rented transactions:", error);
    res.status(500).json({ error: "Failed to fetch transactions ❌" });
  }
});

export default router;
