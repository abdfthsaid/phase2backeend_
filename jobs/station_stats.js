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

const stationCache = {};

// Check if Firestore timestamp is from today
function isToday(timestamp) {
  const now = new Date();
  const date = timestamp.toDate();
  return now.toDateString() === date.toDateString();
}

export async function updateStationStats() {
  const now = Timestamp.now();

  for (const imei of stations) {
    try {
      // Fetch HeyCharge station data
      const url = `${HEYCHARGE_DOMAIN}/v1/station/${imei}`;
      const response = await axios.get(url, {
        auth: { username: HEYCHARGE_API_KEY, password: "" },
      });

      const data = response.data;
      const rawBatteries = data.batteries || [];
      const heyStatus = data.station_status || "Online";
      const station_status = heyStatus === "Offline" ? "Offline" : "Online";

      console.log(`🛰️ ${imei} HeyCharge says: ${heyStatus}`);

      // Load station metadata (cache or Firestore)
      let stationData = stationCache[imei];
      if (!stationData) {
        const doc = await db.collection("stations").doc(imei).get();
        stationData = doc.exists ? doc.data() : {};
        stationCache[imei] = stationData;
      }

      // If station offline per HeyCharge, set offline and continue
      if (station_status === "Offline") {
        await db.collection("station_stats").doc(imei).set({
          id: imei,
          stationCode: imei,
          imei,
          name: stationData.name || "",
          location: stationData.location || "",
          iccid: stationData.iccid || "",
          station_status,
          totalSlots: 0,
          availableCount: 0,
          rentedCount: 0,
          timestamp: now,
          batteries: [],
          message: "❌ Station marked offline by HeyCharge",
        });
        console.warn(`⚠️ Station ${imei} is Offline by HeyCharge`);
        continue;
      }

      // Build slot map from HeyCharge batteries
      const slotMap = new Map();
      for (const battery of rawBatteries) {
        slotMap.set(battery.slot_id, {
          slot_id: battery.slot_id,
          battery_id: battery.battery_id,
          level: parseInt(battery.battery_capacity),
          status: battery.lock_status === "1" ? "Online" : "Offline",
          rented: false,
          phoneNumber: "",
          rentedAt: null,
          amount: 0,
        });
      }

      // Get rentals with status rented for this station
      const rentalSnapshot = await db
        .collection("rentals")
        .where("stationCode", "==", imei)
        .where("status", "==", "rented")
        .get();

      let rentedCount = 0;
      const presentBatteryIds = new Set(rawBatteries.map((b) => b.battery_id));

      for (const doc of rentalSnapshot.docs) {
        const rental = doc.data();

        // Auto-return if battery physically present again
        if (presentBatteryIds.has(rental.battery_id)) {
          await doc.ref.update({ status: "returned", returnedAt: now });
          console.log(`↩️ Auto-returned ${rental.battery_id}`);
          continue;
        }

        // Only consider rentals from today
        if (!rental.timestamp || !isToday(rental.timestamp)) continue;

        rentedCount++;

        // Override slot info with rental info
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

      // Sort slots by slot_id ascending
      const slotTemplate = Array.from(slotMap.values()).sort(
        (a, b) => parseInt(a.slot_id) - parseInt(b.slot_id)
      );

      const totalSlots = slotTemplate.length;
      const availableCount = slotTemplate.filter((s) => s.status === "Online").length;

      // Update Firestore with combined station stats
      await db.collection("station_stats").doc(imei).set({
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
        ...(availableCount === 0 && {
          message: "❌ No available battery ≥ 60%",
        }),
      });

      console.log(`✅ Updated stats for station ${imei}`);
    } catch (err) {
      console.error(`❌ Failed to fetch station ${imei}:`, err.message);

      let stationData = stationCache[imei];
      if (!stationData) {
        const doc = await db.collection("stations").doc(imei).get();
        stationData = doc.exists ? doc.data() : {};
        stationCache[imei] = stationData;
      }

      // Mark station offline on error
      await db.collection("station_stats").doc(imei).set({
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
        message: "❌ Failed to fetch station info",
      });

      console.warn(`⚠️ Station ${imei} marked Offline due to error.`);
    }
  }
}

export default updateStationStats;
