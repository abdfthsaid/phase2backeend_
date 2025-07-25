import express from "express";
import db from "../config/firebase.js";

const router = express.Router();

router.get("/latest", async (req, res) => {
  try {
    // Step 1: Fetch latest 10 rented transactions
    const rentalsSnapshot = await db
      .collection("rentals")
      .where("status", "==", "rented")
      .orderBy("timestamp", "desc")
      .limit(10)
      .get();

    const rentals = rentalsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Step 2: Get unique IMEIs (filter out null/undefined)
    const imeis = [
      ...new Set(rentals.map((r) => r.imei).filter(Boolean)),
    ];

    // Early return if no valid IMEIs
    if (imeis.length === 0) {
      return res.json(
        rentals.map((r) => ({ ...r, stationName: null }))
      );
    }

    // Limit to max 10 imeis to satisfy Firestore's .where("in") limit
    const limitedImeis = imeis.slice(0, 10);

    // Step 3: Fetch stations for those imeis
    const stationSnapshot = await db
      .collection("stations")
      .where("imei", "in", limitedImeis)
      .get();

    // Step 4: Build imei => name map
    const stationMap = {};
    stationSnapshot.forEach((doc) => {
      const stationData = doc.data();
      stationMap[stationData.imei] = stationData.name || null;
    });

    // Step 5: Enrich
    const enrichedRentals = rentals.map((r) => ({
      ...r,
      stationName: stationMap[r.imei] || null,
    }));

    res.json(enrichedRentals);
  } catch (error) {
    console.error("❌ Error fetching latest rentals with station name:", error);
    res.status(500).json({ error: "Failed to fetch enriched rentals ❌" });
  }
});



export default router;
