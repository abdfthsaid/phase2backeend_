import db from "../config/firebase.js";
import axios from "axios";
import dotenv from "dotenv";
import { Timestamp } from "firebase-admin/firestore";

dotenv.config();

const { HEYCHARGE_API_KEY, HEYCHARGE_DOMAIN } = process.env;

const stations = [
  "WSEP161721195358",
  "WSEP161741066504",
  "WSEP161741066505",
  "WSEP161741066502",
  "WSEP161741066503",
];

// 🧠 Local in-memory cache for station metadata
const stationCache = {};

function isToday(timestamp) {
  const now = new Date();
  const date = timestamp.toDate();
  return now.toDateString() === date.toDateString();
}

export async function updateStationStats() {
  const now = Timestamp.now();

  for (const imei of stations) {
    try {
      const url = `${HEYCHARGE_DOMAIN}/v1/station/${imei}`;
      const response = await axios.get(url, {
        auth: { username: HEYCHARGE_API_KEY, password: "" },
      });

      const rawBatteries = response.data.batteries || [];
      const station_status = rawBatteries.length > 0 ? "Online" : "Offline";

      // 🟡 Use cached station data if available
      let stationData = stationCache[imei];
      if (!stationData) {
        const stationDoc = await db.collection("stations").doc(imei).get();
        stationData = stationDoc.exists ? stationDoc.data() : {};
        stationCache[imei] = stationData;
      }

      if (station_status === "Offline") {
        await db
          .collection("station_stats")
          .doc(imei)
          .set({
            id: imei,
            stationCode: imei,
            imei,
            name: stationData.name || "",
            location: stationData.location || "",
            iccid: stationData.iccid || "",
            station_status: "Offline",
            totalSlots: 0,
            availableCount: 0,
            rentedCount: 0,
            timestamp: now,
            batteries: [],
          });

        console.log(`⚠️ Station ${imei} is offline. Stats saved as Offline.`);
        continue;
      }

      const slotMap = new Map();
      for (const battery of rawBatteries) {
        const sid = battery.slot_id;
        slotMap.set(sid, {
          slot_id: sid,
          battery_id: battery.battery_id,
          level: parseInt(battery.battery_capacity),
          status: battery.lock_status === "1" ? "Online" : "Offline",
          rented: false,
          phoneNumber: "",
          rentedAt: null,
          amount: 0,
        });
      }

      const rentalSnapshot = await db
        .collection("rentals")
        .where("stationCode", "==", imei)
        .where("status", "==", "rented")
        .get();

      let rentedCount = 0;
      const presentBatteryIds = new Set(rawBatteries.map((b) => b.battery_id));

      for (const doc of rentalSnapshot.docs) {
        const rental = doc.data();

        // ✅ Auto-return if battery is now physically present
        if (presentBatteryIds.has(rental.battery_id)) {
          await doc.ref.update({
            status: "returned",
            returnedAt: now,
          });
          console.log(`✅ Battery ${rental.battery_id} marked returned.`);
          continue;
        }

        // ✅ Log today's rentals only
        if (!rental.timestamp || !isToday(rental.timestamp)) continue;

        rentedCount++;

        slotMap.set(rental.slot_id, {
          slot_id: rental.slot_id,
          battery_id: rental.battery_id,
          level: null,
          status: "Rented",
          rented: true,
          phoneNumber: rental.phoneNumber,
          rentedAt: rental.timestamp,
          amount: rental.amount || 0,
        });
      }

      const slotTemplate = Array.from(slotMap.values()).sort(
        (a, b) => parseInt(a.slot_id) - parseInt(b.slot_id)
      );

      const totalSlots = slotTemplate.length;
      const availableCount = slotTemplate.filter(
        (s) => s.status === "Online"
      ).length;

      await db
        .collection("station_stats")
        .doc(imei)
        .set({
          id: imei,
          stationCode: imei,
          imei,
          name: stationData.name || "",
          location: stationData.location || "",
          iccid: stationData.iccid || "",
          station_status,
          totalSlots,
          availableCount,
          rentedCount,
          timestamp: now,
          batteries: slotTemplate,
        });

      console.log(`✅ Updated stats for station ${imei}`);
    } catch (err) {
      console.error(`❌ Failed to fetch station ${imei}:`, err.message);

      let stationData = stationCache[imei];
      if (!stationData) {
        const stationDoc = await db.collection("stations").doc(imei).get();
        stationData = stationDoc.exists ? stationDoc.data() : {};
        stationCache[imei] = stationData;
      }

      await db
        .collection("station_stats")
        .doc(imei)
        .set({
          id: imei,
          stationCode: imei,
          imei,
          name: stationData.name || "",
          location: stationData.location || "",
          iccid: stationData.iccid || "",
          station_status: "Offline",
          totalSlots: 0,
          availableCount: 0,
          rentedCount: 0,
          timestamp: now,
          batteries: [],
        });

      console.warn(`⚠️ Station ${imei} marked as Offline due to fetch error.`);
    }
  }
}

export default updateStationStats;
