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

// 🛠️ Unified response sender
function sendResponse(res, success, data = null, error = null, status = 200) {
  return res.status(status).json({ success, data, error });
}

// 🔋 Get available battery
async function getAvailableBattery(imei) {
  try {
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
  } catch (err) {
    throw { code: "API_UNREACHABLE", message: "HEYCHARGE API is not working" };
  }
}

// 🔓 Unlock battery
async function releaseBattery(imei, battery_id, slot_id) {
  try {
    const url = `${HEYCHARGE_DOMAIN}/v1/station/${imei}`;
    const res = await axios.post(url, null, {
      auth: { username: HEYCHARGE_API_KEY, password: "" },
      params: { battery_id, slot_id },
    });
    return res.data;
  } catch (err) {
    throw {
      code: "BATTERY_UNLOCK_FAILED",
      message:
        err.response?.data?.params?.description ||
        err.response?.data?.responseMsg ||
        err.message ||
        "Battery unlock failed",
    };
  }
}

// 🌐 Home route
app.get("/", (req, res) => {
  sendResponse(res, true, { message: "🚀 Waafi backend is running!" });
});

// 💳 Payment + rental logging + unlock battery
app.post("/api/pay/:stationCode", async (req, res) => {
  const { stationCode } = req.params;
  const { phoneNumber, amount } = req.body;

  if (!phoneNumber || !amount) {
    return sendResponse(
      res,
      false,
      null,
      { code: "MISSING_INPUT", message: "Missing phoneNumber or amount" }
    );
  }

  const imei = stationImeisByCode[stationCode];
  if (!imei) {
    return sendResponse(
      res,
      false,
      null,
      { code: "INVALID_STATION", message: "Invalid station code" },
      404
    );
  }

  try {
    // Check station online status
    let statsDoc;
    try {
      statsDoc = await db.collection("station_stats").doc(imei).get();
    } catch {
      return sendResponse(
        res,
        false,
        null,
        { code: "API_UNREACHABLE", message: "Database/API is not working" },
        503
      );
    }

    if (!statsDoc.exists) {
      return sendResponse(
        res,
        false,
        null,
        { code: "STATION_STATS_NOT_FOUND", message: "Station stats not found" },
        404
      );
    }

    if (statsDoc.data().station_status !== "Online") {
      return sendResponse(
        res,
        false,
        null,
        { code: "STATION_OFFLINE", message: "Station is currently offline" },
        403
      );
    }

    const battery = await getAvailableBattery(imei);
    if (!battery) {
      return sendResponse(
        res,
        false,
        null,
        { code: "NO_BATTERY_AVAILABLE", message: "No available battery ≥ 60%" }
      );
    }

    const { battery_id, slot_id } = battery;

    // WAAFI payment request
    let waafiRes;
    try {
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

      waafiRes = await axios.post(WAAFI_URL, waafiPayload, {
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      return sendResponse(
        res,
        false,
        null,
        { code: "API_UNREACHABLE", message: "WAAFI API is not working" },
        503
      );
    }

    const approved =
      waafiRes.data.responseCode === "2001" &&
      waafiRes.data.params?.state === "APPROVED";

    if (!approved) {
      return sendResponse(
        res,
        false,
        null,
        {
          code: "PAYMENT_FAILED",
          message:
            waafiRes.data.params?.description ||
            waafiRes.data.responseMsg ||
            "Payment not approved",
        }
      );
    }

    // Log rental to Firestore
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

    // Unlock battery
    try {
      const unlockRes = await releaseBattery(imei, battery_id, slot_id);
      return sendResponse(res, true, {
        battery_id,
        slot_id,
        unlock: unlockRes,
      });
    } catch (unlockErr) {
      await rentalRef.delete(); // rollback
      return sendResponse(
        res,
        false,
        null,
        { code: unlockErr.code, message: unlockErr.message },
        500
      );
    }
  } catch (err) {
    console.error("❌ General error:", err);
    return sendResponse(
      res,
      false,
      null,
      { code: err.code || "SERVER_ERROR", message: err.message || "Unexpected server error" },
      500
    );
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

// 🔁 Auto update station stats every 13 minutes
setInterval(() => {
  console.log("⏱️ Updating station stats...");
  updateStationStats();
}, 13 * 60 * 1000);

// 🚀 Server start
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
