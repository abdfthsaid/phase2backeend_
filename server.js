require("dotenv").config(); // Load .env variables

const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const {
  WAAFI_URL,
  STATION_IMEI,
  HEYCHARGE_API_KEY,
  HEYCHARGE_DOMAIN,
  WAAFI_API_KEY,
  WAAFI_MERCHANT_UID,
  WAAFI_API_USER_ID,
} = process.env;

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ✅ Get Available Battery
async function getAvailableBattery() {
  const url = `${HEYCHARGE_DOMAIN}/v1/station/${STATION_IMEI}`;
  const response = await axios.get(url, {
    auth: {
      username: HEYCHARGE_API_KEY,
      password: "",
    },
  });

  const batteries = response.data.batteries;

  return batteries.find(
    (b) =>
      b.lock_status === "1" &&
      b.battery_capacity !== "0" &&
      b.battery_abnormal === "0" &&
      b.cable_abnormal === "0"
  );
}

// ✅ Unlock a Battery
async function releaseBattery(battery_id, slot_id) {
  const url = `${HEYCHARGE_DOMAIN}/v1/station/${STATION_IMEI}`;
  const response = await axios.post(url, null, {
    auth: {
      username: HEYCHARGE_API_KEY,
      password: "",
    },
    params: { battery_id, slot_id },
  });

  return response.data;
}

// ✅ Payment Route
app.post("/api/pay", async (req, res) => {
  const { phoneNumber, amount } = req.body;

  if (!phoneNumber || !amount) {
    return res.status(400).json({ error: "Missing phoneNumber or amount" });
  }

  try {
    const battery = await getAvailableBattery();
    if (!battery) {
      return res.status(400).json({ error: "No available powerbanks found." });
    }

    const { battery_id, slot_id } = battery;

    const paymentPayload = {
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

    const waafiRes = await axios.post(WAAFI_URL, paymentPayload, {
      headers: { "Content-Type": "application/json" },
    });

    const approved =
      waafiRes.data.responseCode === "2001" &&
      waafiRes.data.params?.state === "APPROVED";

    if (!approved) {
      return res
        .status(400)
        .json({ error: "Payment not approved", details: waafiRes.data });
    }

    const unlockRes = await releaseBattery(battery_id, slot_id);

    res.json({
      success: true,
      battery_id,
      slot_id,
      unlock: unlockRes,
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// ✅ Start the server with Render-compatible port
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
