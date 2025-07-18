// routes/charts.js
import express from "express";
import db from "../config/firebase.js";
import { Timestamp } from "firebase-admin/firestore";

const router = express.Router();

// Map IMEI -> stationCode
const imeiToStationCode = {
  "WSEP161721195358": "58",
  "WSEP161741066504": "04",
  "WSEP161741066505": "05",
  "WSEP161741066502": "02",
  "WSEP161741066503": "03",
};

// Helper: get ISO date string for day
function isoDate(d) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Helper: ISO week number (Mon–Sun)
function getWeekNumber(d) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil(((dt - yearStart) / 86400000 + 1) / 7);
}

// GET /api/charts/:stationCode
router.get("/:stationCode", async (req, res) => {
  try {
    const { stationCode } = req.params;
    if (!stationCode) return res.status(400).json({ error: "stationCode is required" });

    const rentalsRef = db.collection("rentals");
    const snapshot = await rentalsRef
      .where("stationCode", "==", stationCode)
      .where("status", "in", ["rented", "returned"])
      .get();

    // initialize aggregators
    const dailyRev = {}, weeklyRev = {}, monthlyRev = {};
    const dailyCust = {}, weeklyCust = {}, monthlyCust = {};

    snapshot.forEach(doc => {
      const r = doc.data();
      if (!r.timestamp) return;
      const ts = r.timestamp.toDate();
      const day = isoDate(ts);
      const week = `Week ${getWeekNumber(ts)}`;
      const month = ts.toLocaleString("default", { year: "numeric", month: "long" });
      const amt = parseFloat(r.amount) || 0;
      const phone = r.phoneNumber || "";

      // Revenue
      dailyRev[day] = (dailyRev[day] || 0) + amt;
      weeklyRev[week] = (weeklyRev[week] || 0) + amt;
      monthlyRev[month] = (monthlyRev[month] || 0) + amt;

      // Unique customer count
      dailyCust[day] = dailyCust[day] || new Set();
      weeklyCust[week] = weeklyCust[week] || new Set();
      monthlyCust[month] = monthlyCust[month] || new Set();

      dailyCust[day].add(phone);
      weeklyCust[week].add(phone);
      monthlyCust[month].add(phone);
    });

    const build = (rev, cust) => ({
      labels: Object.keys(rev).sort(),
      data: Object.keys(rev).sort().map(k => rev[k]),
      customers: Object.keys(cust).sort().map(k => cust[k].size)
    });

    res.json({
      daily: build(dailyRev, dailyCust),
      weekly: build(weeklyRev, weeklyCust),
      monthly: build(monthlyRev, monthlyCust),
    });

  } catch (err) {
    console.error("Charts error:", err);
    res.status(500).json({ error: "Failed to calculate charts" });
  }
});

export default router;
