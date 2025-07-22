import express from "express";
import db from "../config/firebase.js";

const router = express.Router();

// 🧾 Get last 10 rented transactions with station name & IMEI
router.get("/latest", async (req, res) => {
  try {
    const snapshot = await db
      .collection("rentals")
      .where("status", "==", "rented")
      .orderBy("timestamp", "desc")
      .limit(10)
      .get();

    const rentals = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const rentalData = doc.data();
        const stationId = rentalData.stationId;

        let stationData = { name: null, imei: null };

        if (stationId) {
          const stationDoc = await db
            .collection("stations")
            .doc(stationId)
            .get();
          if (stationDoc.exists) {
            const stationInfo = stationDoc.data();
            stationData = {
              name: stationInfo.name || null,
              imei: stationInfo.imei || null,
            };
          }
        }

        return {
          id: doc.id,
          ...rentalData,
          stationName: stationData.name,
          stationIMEI: stationData.imei,
        };
      })
    );

    res.json(rentals);
  } catch (error) {
    console.error("❌ Error fetching latest rented transactions:", error);
    res.status(500).json({ error: "Failed to fetch transactions ❌" });
  }
});

export default router;
