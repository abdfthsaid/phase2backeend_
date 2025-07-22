import express from "express";
import db from "../config/firebase.js";

const router = express.Router();

// Map IMEIs to station names
const imeiToStationName = {
  WSEP161721195358: "Station 01",
  WSEP161741066504: "Station 02",
  WSEP161741066505: "Station 04",
  WSEP161741066502: "Station 02",
  WSEP161741066503: "Station 03",
  // Add more if needed
};

// ✅ Get the latest 10 rented transactions (accurate & with station name)
router.get("/latest", async (req, res) => {
  try {
    const snapshot = await db
      .collection("rentals")
      .where("status", "==", "rented")
      .orderBy("timestamp", "desc") // 🕓 Sort by newest
      .limit(10) // 📦 Only get the last 10
      .get();

    const transactions = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        stationName: imeiToStationName[data.imei] || null, // ✅ Match imei to station name
      };
    });

    res.json(transactions);
  } catch (error) {
    console.error("❌ Error fetching latest rented transactions:", error);
    res.status(500).json({ error: "Failed to fetch transactions ❌" });
  }
});

export default router;
