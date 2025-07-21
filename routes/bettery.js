import express from "express";
import db from "../config/firebase.js";

const router = express.Router();

router.get("/missing-batteries", async (req, res) => {
  try {
    const snapshot = await db.collection("rentals").get();

    const missingBatteries = [];

    snapshot.forEach((doc) => {
      const data = doc.data();

      // Check if battery is missing (not returned)
      if (
        !data.batteryReturned ||
        data.batteryReturned === false ||
        data.batteryReturned === "no"
      ) {
        missingBatteries.push({
          id: doc.id,
          stationId: data.stationId || "Unknown",
          customer: data.customer || "Unknown",
          phone: data.phoneNumber || "Unknown",
          timestamp: data.timestamp?.toDate() || "Unknown",
        });
      }
    });

    res.status(200).json({
      totalMissing: missingBatteries.length,
      missingBatteries,
    });
  } catch (error) {
    console.error("Error checking missing batteries:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
