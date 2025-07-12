import express from "express";
import db from "../config/firebase.js";

const router = express.Router();

// 🧾 Get last 10 transactions
router.get("/latest", async (req, res) => {
  try {
    const snapshot = await db
      .collection("rentals")
      .orderBy("timestamp", "desc")
      .limit(10)
      .get();

    const transactions = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json(transactions);
  } catch (error) {
    console.error("❌ Error fetching latest transactions:", error);
    res.status(500).json({ error: "Failed to fetch latest transactions ❌" });
  }
});

export default router;
