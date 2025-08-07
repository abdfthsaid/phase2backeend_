import dotenv from "dotenv";
dotenv.config();

import express from "express";
import axios from "axios";
import cors from "cors";
import bodyParser from "body-parser";
import { v4 as uuidv4 } from "uuid";

// 🔗 Route imports
import stationRoutes from "./routes/stationRoutes.js";
import rentalRoutes from "./routes/rentalRoutes.js";
import statsRoutes from "./routes/statsRoutes.js";
import updateStationStats from "./jobs/station_stats.js";
import customerRoutes from "./routes/customers.js";
import revenueRoutes from "./routes/revenue.js";
import userRoutes from "./routes/userRoutes.js";
import transactionRoutes from "./routes/transactionRoutes.js";
import chartsRoute from "./routes/charts.js";
import chartsAll from "./routes/chartsAll.js";

// ...
import db from "./config/firebase.js";

// 🌍 ENV
const {
  PORT = 3000,
  HEYCHARGE_API_KEY,
  HEYCHARGE_DOMAIN,
  WAAFI_API_KEY,
  WAAFI_MERCHANT_UID,
  WAAFI_API_USER_ID,
  WAAFI_URL,
  STATION_CASTELLO_TALEEX,
  STATION_CASTELLO_BOONDHERE,
  STATION_JAVA_TALEEX,
  STATION_JAVA_AIRPORT,
  STATION_DILEK_SOMALIA,
} = process.env;

// 🛠️ App setup
const app = express();
app.use(cors());
app.use(bodyParser.json());

// 🏷️ Station code to IMEI map
const stationImeisByCode = {
  58: STATION_CASTELLO_TALEEX,
  "02": STATION_CASTELLO_BOONDHERE,
  "03": STATION_JAVA_TALEEX,
  "04": STATION_JAVA_AIRPORT,
  "05": STATION_DILEK_SOMALIA,
};
//

// 🔋 Get available battery
async function getAvailableBattery(imei) {
  const url = `${HEYCHARGE_DOMAIN}/v1/station/${imei}`;
  const res = await axios.get(url, {
    auth: { username: HEYCHARGE_API_KEY, password: "" },
  });

  const batteries = res.data.batteries.filter(
    (b) =>
      b.lock_status === "1" &&
      parseInt(b.battery_capacity) >= 60 &&
      b.battery_abnormal === "0" &&
      b.cable_abnormal === "0"
  );

  batteries.sort(
    (a, b) => parseInt(b.battery_capacity) - parseInt(a.battery_capacity)
  );

  return batteries[0];
}

// 🔓 Unlock battery
async function releaseBattery(imei, battery_id, slot_id) {
  const url = `${HEYCHARGE_DOMAIN}/v1/station/${imei}`;
  const res = await axios.post(url, null, {
    auth: { username: HEYCHARGE_API_KEY, password: "" },
    params: { battery_id, slot_id },
  });
  return res.data;
}

// 🌐 Home route
app.get("/", (req, res) => {
  res.send("🚀 Waafi backend is running!");
});

// 💳 Payment + rental logging + unlock battery
app.post("/api/pay/:stationCode", async (req, res) => {
  const { stationCode } = req.params;
  const { phoneNumber, amount } = req.body;

  if (!phoneNumber || !amount) {
    return res.status(400).json({ error: "Missing phoneNumber or amount" });
  }

  const imei = stationImeisByCode[stationCode];
  if (!imei) {
    return res.status(404).json({ error: "Invalid station code" });
  }

  try {
    // ✅ Check station online status before proceeding
    const statsDoc = await db.collection("station_stats").doc(imei).get();
    if (!statsDoc.exists) {
      return res.status(404).json({ error: "Station stats not found ❌" });
    }
    const isOnline = statsDoc.data().station_status === "Online";
    if (!isOnline) {
      return res.status(403).json({ error: "Station is currently offline ⛔" });
    }

    const battery = await getAvailableBattery(imei);
    if (!battery) {
      return res.status(400).json({ error: "No available battery ≥ 60%" });
    }

    const { battery_id, slot_id } = battery;

    // 🔐 Step 1: WAAFI payment request
    const waafiPayload = {
      schemaVersion: "1.0",
      requestId: uuidv4(),
      timestamp: new Date().toISOString(),
      channelName: "WEB",
      serviceName: "API_PURCHASE",
      serviceParams: {
        merchantUid: WAAFI_MERCHANT_UID,
        apiUserId: WAAFI_API_USER_ID,
        apiKey: WAAFI_API_KEY,
        paymentMethod: "MWALLET_ACCOUNT",
        payerInfo: { accountNo: phoneNumber },
        transactionInfo: {
          referenceId: "ref-" + Date.now(),
          invoiceId: "inv-" + Date.now(),
          amount: parseFloat(amount).toFixed(2),
          currency: "USD",
          description: "Powerbank rental",
        },
      },
    };

    const waafiRes = await axios.post(WAAFI_URL, waafiPayload, {
      headers: { "Content-Type": "application/json" },
    });

    const approved =
      waafiRes.data.responseCode === "2001" &&
      waafiRes.data.params?.state === "APPROVED";

    if (!approved) {
      return res.status(400).json({
        error: "Payment not approved ❌",
        waafiResponse: waafiRes.data,
      });
    }

    // // // 📝 Step 2: Log rental to Firestore
    const rentalRef = await db.collection("rentals").add({
      imei,
      stationCode,
      battery_id,
      slot_id,
      phoneNumber,
      amount,
      status: "rented",
      timestamp: new Date(),
    });

    // 🔓 Step 3: Unlock battery
    let unlockRes;
    try {
      unlockRes = await releaseBattery(imei, battery_id, slot_id);
    } catch (unlockError) {
      await rentalRef.delete(); // Rollback if unlock fails
      return res.status(500).json({
        error: "Battery unlock failed ❌",
        details: unlockError.response?.data || unlockError.message,
      });
    }

    res.json({
      success: true,
      battery_id,
      slot_id,
      unlock: unlockRes,
    });
  } catch (err) {
    console.error("❌ General error:", err);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// 📦 Routes
app.use("/api/stations", stationRoutes);
app.use("/api/rentals", rentalRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/revenue", revenueRoutes);
app.use("/api/users", userRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/charts", chartsRoute);
app.use("/api/chartsAll", chartsAll);

// 🔁 : Auto update station stats every 5 minutes
setInterval(() => {
  console.log("⏱️ Updating station stats...");
  updateStationStats();
}, 13 * 60 * 1000);

// 🚀 Server start
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});

// god makes
