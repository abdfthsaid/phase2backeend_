// routes/customerRoutes.js
import express from "express";
import db from "../config/firebase.js";
import { Timestamp } from "firebase-admin/firestore";

const router = express.Router();

/* ------------------------------------------------------------------ */
/* 🧠 Helpers: day & month timestamp ranges                           */
/* ------------------------------------------------------------------ */
function getDayBounds(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    startTs: Timestamp.fromDate(start),
    endTs: Timestamp.fromDate(end),
    dateStr: start.toISOString().split("T")[0],
  };
}

function getMonthBounds(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return {
    startTs: Timestamp.fromDate(start),
    endTs: Timestamp.fromDate(end),
    monthKey: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(
      2,
      "0"
    )}`,
  };
}

/* ------------------------------------------------------------------ */
/* 📌 Station-level unique customers (by referenceId)                 */
/* ------------------------------------------------------------------ */

// Daily unique customers for a station
router.get("/daily-by-imei/:imei", async (req, res) => {
  const { imei } = req.params;
  const { startTs, endTs, dateStr } = getDayBounds();

  try {
    const snapshot = await db
      .collection("rentals")
      .where("imei", "==", imei)
      .where("timestamp", ">=", startTs)
      .where("timestamp", "<", endTs)
      .get();

    // ✅ Only include docs with referenceId
    const filteredDocs = snapshot.docs.filter(d => d.data().referenceId);
    const uniqueRefs = new Set(filteredDocs.map(d => d.data().referenceId));

    res.json({
      imei,
      date: dateStr,
      totalCustomersToday: uniqueRefs.size,
    });
  } catch (err) {
    console.error("❌ daily-by-imei error:", err);
    res.status(500).json({ error: "Failed to fetch daily customers by station" });
  }
});

// Monthly unique customers for a station
router.get("/monthly/:imei", async (req, res) => {
  const { imei } = req.params;
  const { startTs, endTs, monthKey } = getMonthBounds();

  try {
    const snapshot = await db
      .collection("rentals")
      .where("imei", "==", imei)
      .where("timestamp", ">=", startTs)
      .where("timestamp", "<", endTs)
      .get();

    const filteredDocs = snapshot.docs.filter(d => d.data().referenceId);
    const uniqueRefs = new Set(filteredDocs.map(d => d.data().referenceId));

    res.json({
      stationIMEI: imei,
      month: monthKey,
      totalCustomersThisMonth: uniqueRefs.size,
    });
  } catch (err) {
    console.error("❌ monthly/:imei error:", err);
    res.status(500).json({ error: "Failed to fetch monthly customers by station" });
  }
});

/* ------------------------------------------------------------------ */
/* 📌 Global totals (all stations, unique referenceId only)           */
/* ------------------------------------------------------------------ */

// Daily total across all stations
router.get("/daily-total", async (req, res) => {
  const { startTs, endTs, dateStr } = getDayBounds();

  try {
    const snapshot = await db
      .collection("rentals")
      .where("timestamp", ">=", startTs)
      .where("timestamp", "<", endTs)
      .get();

    const filteredDocs = snapshot.docs.filter(d => d.data().referenceId);
    const uniqueRefs = new Set(filteredDocs.map(d => d.data().referenceId));
    const uniqueStations = new Set(filteredDocs.map(d => d.data().imei));

    res.json({
      date: dateStr,
      totalCustomersToday: uniqueRefs.size,
      stations: uniqueStations.size,
    });
  } catch (err) {
    console.error("❌ daily-total error:", err);
    res.status(500).json({ error: "Failed to fetch daily totals" });
  }
});

// Monthly total across all stations
router.get("/monthly-total", async (req, res) => {
  const { startTs, endTs, monthKey } = getMonthBounds();

  try {
    const snapshot = await db
      .collection("rentals")
      .where("timestamp", ">=", startTs)
      .where("timestamp", "<", endTs)
      .get();

    const filteredDocs = snapshot.docs.filter(d => d.data().referenceId);
    const uniqueRefs = new Set(filteredDocs.map(d => d.data().referenceId));
    const uniqueStations = new Set(filteredDocs.map(d => d.data().imei));

    res.json({
      month: monthKey,
      totalCustomersThisMonth: uniqueRefs.size,
      stations: uniqueStations.size,
    });
  } catch (err) {
    console.error("❌ monthly-total error:", err);
    res.status(500).json({ error: "Failed to fetch monthly totals" });
  }
});

export default router;
