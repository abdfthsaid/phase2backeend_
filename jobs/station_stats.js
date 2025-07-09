// jobs/station_stats.js
import db from "../config/firebase.js";
import axios from "axios";
import dotenv from "dotenv";
import { Timestamp } from "firebase-admin/firestore";

dotenv.config();

const {
  HEYCHARGE_API_KEY,
  HEYCHARGE_DOMAIN,
  STATION_CASTELLO_TALEEX,
  STATION_CASTELLO_BOONDHERE,
  STATION_JAVA_TALEEX,
  STATION_JAVA_AIRPORT,
  STATION_DILEK_SOMALIA,
} = process.env;

const stations = {
  "58": STATION_CASTELLO_TALEEX,
  "02": STATION_CASTELLO_BOONDHERE,
  "03": STATION_JAVA_TALEEX,
  "04": STATION_JAVA_AIRPORT,
  "05": STATION_DILEK_SOMALIA,
};

async function updateStationStats() {
  const now = Timestamp.now();

  for (const [stationCode, imei] of Object.entries(stations)) {
    try {
      const url = `${HEYCHARGE_DOMAIN}/v1/station/${imei}`;
      const response = await axios.get(url, {
        auth: { username: HEYCHARGE_API_KEY, password: "" },
      });

      const batteries = response.data.batteries || [];
      const station_status = batteries.length > 0 ? "Online" : "Offline";

      let availableCount = 0;
      let rentedCount = 0;
      let batteryInfo = [];

      if (station_status === "Online") {
        availableCount = batteries.filter(
          (b) =>
            b.lock_status === "1" &&
            parseInt(b.battery_capacity) >= 60 &&
            b.battery_abnormal === "0" &&
            b.cable_abnormal === "0"
        ).length;

        rentedCount = batteries.length - availableCount;

        batteryInfo = batteries.map((b) => ({
          battery_id: b.battery_id,
          slot_id: b.slot_id?.toString() || "",
          level: parseInt(b.battery_capacity),
          status: b.lock_status === "1" ? "Online" : "Offline",
          rented: false,
          phoneNumber: "",
          rentedAt: null,
          amount: 0,
        }));
      }

      // 🔁 Merge rental info if available
      const rentalSnapshot = await db
        .collection("rentals")
        .where("stationCode", "==", stationCode)
        .where("status", "==", "rented")
        .get();

      const rentedMap = {};
      rentalSnapshot.forEach((doc) => {
        const data = doc.data();
        rentedMap[data.battery_id] = {
          rented: true,
          phoneNumber: data.phoneNumber,
          rentedAt: data.timestamp.toDate().toISOString(),
          amount: data.amount,
        };
      });

      batteryInfo = batteryInfo.map((b) =>
        rentedMap[b.battery_id] ? { ...b, ...rentedMap[b.battery_id] } : b
      );

      await db.collection("station_stats").doc(stationCode).set({
        stationCode,
        imei,
        availableCount,
        rentedCount,
        station_status,
        timestamp: now,
        batteries: batteryInfo,
      });

      console.log(`✅ ${stationCode}: ${availableCount} available, ${rentedCount} rented`);

      // 🔁 Detect returned batteries
      const rentedSnapshot = await db
        .collection("rentals")
        .where("stationCode", "==", stationCode)
        .where("status", "==", "rented")
        .get();

      for (const doc of rentedSnapshot.docs) {
        const rented = doc.data();
        const isBack = batteries.find((b) => b.battery_id === rented.battery_id);

        if (isBack) {
          await doc.ref.update({
            status: "returned",
            returnedAt: Timestamp.now(),
          });
          console.log(`🔁 Battery returned: ${rented.battery_id}`);
        }
      }
    } catch (err) {
      console.error(`❌ Failed for ${stationCode}:`, err.message);
    }
  }
}

export default updateStationStats;
