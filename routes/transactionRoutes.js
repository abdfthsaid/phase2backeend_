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

    // Step 2: Get unique IMEIs from the rental data
    const imeis = [...new Set(rentals.map((r) => r.imei))];

    // Step 3: Fetch stations that match those IMEIs
    const stationSnapshot = await db
      .collection("stations")
      .where("imei", "in", imeis)
      .get();

    // Step 4: Build a map of imei => station.name
    const stationMap = {};
    stationSnapshot.forEach((doc) => {
      const stationData = doc.data();
      stationMap[stationData.imei] = stationData.name || null;
    });

    // Step 5: Attach the station name to each rental
    const enrichedRentals = rentals.map((rental) => ({
      ...rental,
      stationName: stationMap[rental.imei] || null,
    }));

    res.json(enrichedRentals);
  } catch (error) {
    console.error("❌ Error fetching latest rentals with station name:", error);
    res.status(500).json({ error: "Failed to fetch enriched rentals ❌" });
  }
});

export default router;
