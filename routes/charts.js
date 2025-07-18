const express = require("express");
const router = express.Router();
const { getFirestore } = require("firebase-admin/firestore");
const db = getFirestore();

// Mapping IMEI to station codes
const imeiToStationCode = {
  "WSEP161721195358": "58",
  "WSEP161741066504": "04",
  "WSEP161741066505": "05",
  "WSEP161741066502": "02",
  "WSEP161741066503": "03",
};

// Helper to get week number
function getWeekNumber(date) {
  const temp = new Date(date);
  temp.setHours(0, 0, 0, 0);
  temp.setDate(temp.getDate() + 4 - (temp.getDay() || 7));
  const yearStart = new Date(temp.getFullYear(), 0, 1);
  return Math.ceil((((temp - yearStart) / 86400000) + 1) / 7);
}

router.post("/charts", async (req, res) => {
  const { imei } = req.body;
  const stationCode = imeiToStationCode[imei];

  if (!stationCode) {
    return res.status(400).json({ error: "Invalid IMEI or station not found." });
  }

  try {
    const snapshot = await db.collection("payment")
      .where("station", "==", stationCode)
      .get();

    const dailyMap = {};
    const weeklyMap = {};
    const monthlyMap = {};

    snapshot.forEach(doc => {
      const data = doc.data();
      const dateObj = new Date(data.timestamp._seconds * 1000); // Firestore timestamp
      const dateStr = dateObj.toISOString().split("T")[0];
      const week = "Week " + getWeekNumber(dateObj);
      const month = dateObj.toLocaleString("default", { month: "long" });

      // Revenue
      dailyMap[dateStr] = (dailyMap[dateStr] || 0) + data.amount;
      weeklyMap[week] = (weeklyMap[week] || 0) + data.amount;
      monthlyMap[month] = (monthlyMap[month] || 0) + data.amount;

      // Customers (count per date/week/month)
      dailyMap[`${dateStr}_count`] = (dailyMap[`${dateStr}_count`] || 0) + 1;
      weeklyMap[`${week}_count`] = (weeklyMap[`${week}_count`] || 0) + 1;
      monthlyMap[`${month}_count`] = (monthlyMap[`${month}_count`] || 0) + 1;
    });

    const formatData = (map, isCustomer = false) => {
      const labelSet = new Set();
      const dataArr = [];

      Object.keys(map).forEach(key => {
        if (!key.includes("_count")) {
          labelSet.add(key);
        }
      });

      const labels = Array.from(labelSet).sort();
      labels.forEach(label => {
        const value = isCustomer ? map[`${label}_count`] : map[label];
        dataArr.push(value);
      });

      return { labels, data: dataArr };
    };

    res.json({
      dailyRevenue: formatData(dailyMap),
      weeklyRevenue: formatData(weeklyMap),
      monthlyRevenue: formatData(monthlyMap),
      dailyCustomers: formatData(dailyMap, true),
      weeklyCustomers: formatData(weeklyMap, true),
      monthlyCustomers: formatData(monthlyMap, true),
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong." });
  }
});

module.exports = router;
