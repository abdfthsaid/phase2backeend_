// 📁 jobs/stationStats.js

import db from "../config/firebase.js";
import axios from "axios";
import dotenv from "dotenv";
import { Timestamp } from "firebase-admin/firestore";

dotenv.config();

const { HEYCHARGE_API_KEY, HEYCHARGE_DOMAIN } = process.env;

// 🔐 Map of stationCode → imei
const stations = {
  "58": "WSEP161721195358",
  "02": "WSEP161741066502",
  "03": "WSEP161741066503",
  "04": "WSEP161741066504",
  "05": "WSEP161741066505",
};

function isToday(timestamp) {
  const now = new Date();
  const date = timestamp.toDate();
  return now.toDateString() === date.toDateString();
}

async function updateStationStats() {
  const now = Timestamp.now();

  for (const [stationCode, imei] of Object.entries(stations)) {
    try {
      // 📡 GET data from HeyCharge
      const url = `${HEYCHARGE_DOMAIN}/v1/station/${imei}`;
      const response = await axios.get(url, {
        auth: { username: HEYCHARGE_API_KEY, password: "" },
      });

      const rawBatteries = response.data.batteries || [];
      const station_status = rawBatteries.length > 0 ? "Online" : "Offline";

      const filledSlots = [];

      // 🔋 Add batteries from HeyCharge
      for (const battery of rawBatteries) {
        filledSlots.push({
          slot_id: battery.slot_id,
          battery_id: battery.battery_id,
          level: parseInt(battery.battery_capacity),
          status: battery.lock_status === "1" ? "Online" : "Offline",
          rented: false,
          phoneNumber: "",
          rentedAt: null,
          amount: 0
        });
      }

      // 📦 Fetch today's 'rented' rentals from Firestore
      const rentalSnapshot = await db.collection("rentals")
        .where("stationCode", "==", stationCode)
        .where("status", "==", "rented")
        .get();

      for (const doc of rentalSnapshot.docs) {
        const rental = doc.data();
        if (!isToday(rental.timestamp)) continue;

        const alreadyInSlots = filledSlots.some(b => b.battery_id === rental.battery_id);
        if (!alreadyInSlots) {
          filledSlots.push({
            slot_id: null, // not from HeyCharge
            battery_id: rental.battery_id,
            level: 0,
            status: "Rented",
            rented: true,
            phoneNumber: rental.phoneNumber,
            rentedAt: rental.timestamp.toDate().toISOString(),
            amount: rental.amount || 0
          });
        }
      }

      // 🏷️ Get station metadata (name, location, etc.)
      const stationDoc = await db.collection("stations").doc(stationCode).get();
      const stationData = stationDoc.exists ? stationDoc.data() : {};

      const availableCount = filledSlots.filter(s => s.status === "Online").length;
      const rentedCount = filledSlots.filter(s => s.rented).length;

      // 🧾 Save to station_stats collection
      await db.collection("station_stats").doc(stationCode).set({
        id: stationCode,
        stationCode,
        imei,
        name: stationData.name || "",
        location: stationData.location || "",
        iccid: stationData.iccid || "",
        station_status,
        totalSlots: filledSlots.length,
        availableCount,
        rentedCount,
        timestamp: now,
        batteries: filledSlots,
      });

      console.log(`✅ Updated ${stationCode}: ${availableCount} available, ${rentedCount} rented`);
    } catch (err) {
      console.error(`❌ Error updating ${stationCode}:`, err.message);
    }
  }
}

export default updateStationStats;


