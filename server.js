import dotenv from "dotenv";
dotenv.config();

import express from "express";
import axios from "axios";
import cors from "cors";
import bodyParser from "body-parser";
import { v4 as uuidv4 } from "uuid";
import { Timestamp } from "firebase-admin/firestore";

// 🔗 Route imports
import stationRoutes from "./routes/stationRoutes.js";
// import rentalRoutes from "./routes/rentalRoutes.js"; // ❌ Not needed
import statsRoutes from "./routes/statsRoutes.js";
import updateStationStats from "./jobs/station_stats.js";
import customerRoutes from "./routes/customers.js";
import revenueRoutes from "./routes/revenue.js";
import userRoutes from "./routes/userRoutes.js";
import transactionRoutes from "./routes/transactionRoutes.js";
import chartsRoute from "./routes/charts.js";
import chartsAll from "./routes/chartsAll.js";
import blacklistRoutes, {
  isPhoneBlacklisted,
} from "./routes/blacklistRoutes.js";

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

// 🕐 Server timezone info
app.get("/api/timezone", (req, res) => {
  const now = new Date();
  res.json({
    serverTime: now.toISOString(),
    serverTimeLocal: now.toString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffset: now.getTimezoneOffset(),
    offsetHours: -now.getTimezoneOffset() / 60,
  });
});

// 💳 Payment + rental logging + unlock battery
app.post("/api/pay/:stationCode", async (req, res) => {
  const { stationCode } = req.params;
  const { phoneNumber, amount } = req.body;

  if (!phoneNumber || !amount) {
    return res.status(400).json({ error: "Missing phoneNumber or amount" });
  }

  // 🚫 Check if user is blacklisted
  try {
    const blacklisted = await isPhoneBlacklisted(phoneNumber);
    if (blacklisted) {
      return res.status(403).json({
        error: "You are blocked from renting. Please contact support.",
      });
    }
  } catch (err) {
    console.error("❌ Blacklist check failed:", err);
  }

  const imei = stationImeisByCode[stationCode];
  if (!imei) {
    return res.status(404).json({ error: "Invalid station code" });
  }

  try {
    const battery = await getAvailableBattery(imei);
    if (!battery) {
      return res.status(400).json({ error: "No available battery ≥ 60%" });
    }

    const { battery_id, slot_id } = battery;

    //  Step 1: WAAFI payment request
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
      waafiRes.data.responseCode === "2001" ||
      waafiRes.data.responseCode == 2001;

    if (!approved) {
      return res.status(400).json({
        error: "Payment not approved ❌",
        waafiResponse: waafiRes.data,
      });
    }

    // 🔒 DUPLICATE PREVENTION: Check by Waafi transactionId
    const { transactionId, issuerTransactionId, referenceId } =
      waafiRes.data.params || {};

    if (transactionId) {
      const existingTx = await db
        .collection("rentals")
        .where("transactionId", "==", transactionId)
        .limit(1)
        .get();

      if (!existingTx.empty) {
        console.log(`⚠️ Duplicate Waafi transaction blocked: ${transactionId}`);
        return res.json({
          success: true,
          message: "Payment already processed",
          transactionId,
        });
      }
    }

    // 📝 Step 2: Log rental to Firestore (with transactionId to prevent duplicates)
    const rentalRef = await db.collection("rentals").add({
      imei,
      stationCode,
      battery_id,
      slot_id,
      phoneNumber,
      amount: parseFloat(amount) || 0,
      status: "rented",
      transactionId: transactionId || null,
      issuerTransactionId: issuerTransactionId || null,
      referenceId: referenceId || null,
      timestamp: Timestamp.now(),
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
// app.use("/api/rentals", rentalRoutes); // ❌ Not needed
app.use("/api/stats", statsRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/revenue", revenueRoutes);
app.use("/api/users", userRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/charts", chartsRoute);
app.use("/api/chartsAll", chartsAll);
app.use("/api/blacklist", blacklistRoutes);

// 🔁 : Auto update station stats every 5 minutes
setInterval(() => {
  console.log("⏱️ Updating station stats...");
  updateStationStats();
}, 15 * 60 * 1000);

// 🧹 STARTUP CLEANUP: Delete rentals from today after 12:00pm (Dec 24, 2025)
async function cleanupTodayRentals() {
  console.log("🧹 Running cleanup - deleting rentals after 12:00pm today...");

  // Dec 24, 2025 from 12:00pm (noon) UTC+3 to now
  const startTime = new Date("2025-12-24T12:00:00.000+03:00");
  const now = new Date();

  try {
    const snapshot = await db
      .collection("rentals")
      .where("timestamp", ">=", Timestamp.fromDate(startTime))
      .where("timestamp", "<=", Timestamp.fromDate(now))
      .get();

    if (snapshot.empty) {
      console.log("✅ No rentals found after 12:00pm");
      return;
    }

    console.log(
      `📊 Found ${snapshot.size} rentals after 12:00pm - DELETING ALL`
    );

    let deletedCount = 0;
    for (const doc of snapshot.docs) {
      await doc.ref.delete();
      deletedCount++;
      console.log(`🗑️ Deleted: ${doc.id}`);
    }

    console.log(`✅ Cleanup complete! Deleted ${deletedCount} rentals`);
  } catch (err) {
    console.error("❌ Cleanup error:", err.message);
  }
}

// 🚀 Server start
app.listen(PORT, async () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);

  // Run cleanup on startup
  await cleanupTodayRentals();
});

// god makes
