require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const bodyParser = require("body-parser");
const { v4: uuidv4 } = require("uuid");

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

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ✅ Map station code to IMEI
const stationImeisByCode = {
  "58": STATION_CASTELLO_TALEEX,
  "02": STATION_CASTELLO_BOONDHERE,
  "03": STATION_JAVA_TALEEX,
  "04": STATION_JAVA_AIRPORT,
  "05": STATION_DILEK_SOMALIA,
};

// ✅ Get the best battery ≥ 60%
async function getAvailableBattery(imei) {
  const url = `${HEYCHARGE_DOMAIN}/v1/station/${imei}`;
  const response = await axios.get(url, {
    auth: { username: HEYCHARGE_API_KEY, password: "" },
  });

  const batteries = response.data.batteries.filter(
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

// ✅ Unlock the battery slot
async function releaseBattery(imei, battery_id, slot_id) {
  const url = `${HEYCHARGE_DOMAIN}/v1/station/${imei}`;
  const response = await axios.post(url, null, {
    auth: { username: HEYCHARGE_API_KEY, password: "" },
    params: { battery_id, slot_id },
  });
  return response.data;
}

// ✅ Handle payment + unlock
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
    const battery = await getAvailableBattery(imei);
    if (!battery) {
      return res.status(400).json({ error: "No available battery ≥ 60%" });
    }

    const { battery_id, slot_id } = battery;

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
        error: "Payment not approved",
        details: waafiRes.data,
      });
    }

    const unlockRes = await releaseBattery(imei, battery_id, slot_id);

    res.json({
      success: true,
      battery_id,
      slot_id,
      unlock: unlockRes,
    });
  } catch (err) {
    console.error("Error:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// ✅ Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
