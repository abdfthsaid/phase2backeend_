const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");
const db = admin.firestore();

const imeiToStationCode = {
  WSEP161721195358: "58",
  WSEP161741066504: "04",
  WSEP161741066505: "05",
  WSEP161741066502: "02",
  WSEP161741066503: "03",
};

const formatDate = (date) => date.toISOString().split("T")[0];

router.get("/charts", async (req, res) => {
  try {
    const rentalsSnapshot = await db.collection("rentals").get();
    const dailyRevenue = {};
    const weeklyRevenue = {};
    const monthlyRevenue = {};
    const dailyCustomers = {};
    const weeklyCustomers = {};
    const monthlyCustomers = {};

    rentalsSnapshot.forEach((doc) => {
      const rental = doc.data();
      const timestamp = rental.timestamp?.toDate();
      const amount = rental.amount || 0;

      if (!timestamp) return;

      const date = formatDate(timestamp); // e.g., "2025-07-17"
      const week = `Week ${Math.ceil(timestamp.getDate() / 7)}`;
      const month = timestamp.toLocaleString("default", { month: "long" });

      // Revenue
      dailyRevenue[date] = (dailyRevenue[date] || 0) + amount;
      weeklyRevenue[week] = (weeklyRevenue[week] || 0) + amount;
      monthlyRevenue[month] = (monthlyRevenue[month] || 0) + amount;

      // Customers (count)
      dailyCustomers[date] = (dailyCustomers[date] || new Set()).add(
        rental.phoneNumber
      );
      weeklyCustomers[week] = (weeklyCustomers[week] || new Set()).add(
        rental.phoneNumber
      );
      monthlyCustomers[month] = (monthlyCustomers[month] || new Set()).add(
        rental.phoneNumber
      );
    });

    const convertToChart = (obj, isSet = false) => {
      const labels = Object.keys(obj).sort();
      const data = labels.map((key) => (isSet ? obj[key].size : obj[key]));
      return { labels, data };
    };

    const response = {
      dailyRevenue: convertToChart(dailyRevenue),
      weeklyRevenue: convertToChart(weeklyRevenue),
      monthlyRevenue: convertToChart(monthlyRevenue),
      dailyCustomers: convertToChart(dailyCustomers, true),
      weeklyCustomers: convertToChart(weeklyCustomers, true),
      monthlyCustomers: convertToChart(monthlyCustomers, true),
    };

    res.json(response);
  } catch (error) {
    console.error("Error generating charts:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
