// jobs/stationStats.js (Option B - Safe version)

import db from "../config/firebase.js";
import axios from "axios";
import dotenv from "dotenv";
import { Timestamp } from "firebase-admin/firestore";

dotenv.config();

const { HEYCHARGE_API_KEY, HEYCHARGE_DOMAIN } = process.env;

// Map your stations
const stations = {
  "58": "WSEP161721195358",
  "02": "WSEP161741066502",
  // Add more stationCode: imei pairs as needed
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
      const url = `${HEYCHARGE_DOMAIN}/v1/station/${imei}`;
      const response = await axios.get(url, {
        auth: { username: HEYCHARGE_API_KEY, password: "" },
      });

      const rawBatteries = response.data.batteries || [];
      const station_status = rawBatteries.length > 0 ? "Online" : "Offline";

      // Prepare 8 slots default
      const slotTemplate = Array.from({ length: 8 }, (_, i) => ({
        slot_id: (i + 1).toString(),
        battery_id: null,
        level: 0,
        status: "Empty",
        rented: false,
        phoneNumber: "",
        rentedAt: null,
        amount: 0,
      }));

      // Fill batteries from HeyCharge
      for (const battery of rawBatteries) {
        const index = parseInt(battery.slot_id) - 1;
        if (slotTemplate[index]) {
          slotTemplate[index] = {
            ...slotTemplate[index],
            battery_id: battery.battery_id,
            level: parseInt(battery.battery_capacity),
            status: battery.lock_status === "1" ? "Online" : "Offline",
            rented: false,
          };
        }
      }

      // Fetch today rentals not returned
      const rentalSnapshot = await db.collection("rentals")
        .where("stationCode", "==", stationCode)
        .where("status", "==", "rented")
        .get();

      for (const doc of rentalSnapshot.docs) {
        const rental = doc.data();
        if (!isToday(rental.timestamp)) continue;

        const batteryAlreadyInside = slotTemplate.some(s => s.battery_id === rental.battery_id);
        if (!batteryAlreadyInside) {
          // Leave the slot empty — do not guess anything (Option B)
          console.log(`ℹ️ Skipping battery ${rental.battery_id} (not inside station)`);
        }
      }

      const availableCount = slotTemplate.filter(s => s.status === "Online").length;
      const rentedCount = rentalSnapshot.docs.filter(doc => isToday(doc.data().timestamp)).length;

      // Save to station_stats
      await db.collection("station_stats").doc(stationCode).set({
        id: stationCode,
        stationCode,
        imei,
        station_status,
        totalSlots: 8,
        availableCount,
        rentedCount,
        timestamp: now,
        batteries: slotTemplate,
      });

      console.log(`✅ Updated ${stationCode}: ${availableCount} available, ${rentedCount} rented`);
    } catch (err) {
      console.error(`❌ Error updating ${stationCode}:`, err.message);
    }
  }
}

export default updateStationStats;
