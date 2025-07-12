import express from "express";
import db from "../config/firebase.js";

const router = express.Router();

// 🧾 Get last 10 transactions (with optional status filter)
router.get("/latest", async (req, res) => {
  const { status } = req.query;

  try {
    let query = db.collection("rentals").orderBy("timestamp", "desc").limit(10);

    if (status) {
      query = db
        .collection("rentals")
        .where("status", "==", status)
        .orderBy("timestamp", "desc")
        .limit(10);
    }

    const snapshot = await query.get();

    const transactions = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json(transactions);
  } catch (error) {
    console.error("❌ Error fetching filtered transactions:", error);
    res.status(500).json({ error: "Failed to fetch transactions ❌" });
  }
});

export default router;
