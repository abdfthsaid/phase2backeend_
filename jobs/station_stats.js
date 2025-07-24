// 📦 updateStationStats.js
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

export async function updateStationStats() {
  const now = Timestamp.now();

  for (const imei of stations) {
    try {
      const url = `${HEYCHARGE_DOMAIN}/v1/station/${imei}`;
      const response = await axios.get(url, {
        auth: { username: HEYCHARGE_API_KEY, password: "" },
      });

      const data = response.data;
      const rawBatteries = data.batteries || [];
      const station_status =
        data.station_status === "Offline" ? "Offline" : "Online";

      let stationData = stationCache[imei];
      if (!stationData) {
        const doc = await db.collection("stations").doc(imei).get();
        stationData = doc.exists ? doc.data() : {};
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
            station_status,
            totalSlots: 0,
            availableCount: 0,
            rentedCount: 0,
            timestamp: now,
            batteries: [],
            message: "❌ Station marked offline by HeyCharge",
          });
        continue;
      }

      const presentBatteryIds = new Set(rawBatteries.map((b) => b.battery_id));
      const slotMap = new Map();

      // Raw batteries from station
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

      const rentalSnapshot = await db
        .collection("rentals")
        .where("imei", "==", imei)
        .where("status", "==", "rented")
        .get();

      let rentedCount = 0;

      for (const doc of rentalSnapshot.docs) {
        const rental = doc.data();
        const batteryId = rental.battery_id;

        // If rental battery is physically returned
        if (presentBatteryIds.has(batteryId)) {
          await doc.ref.update({ status: "returned", returnedAt: now });
        } else {
          rentedCount++;
          slotMap.set(rental.slot_id, {
            slot_id: rental.slot_id,
            battery_id: batteryId,
            level: null,
            status: "Rented",
            rented: true,
            phoneNumber: rental.phoneNumber,
            rentedAt: rental.timestamp,
            amount: rental.amount || 0,
          });
        }
      }

      // Safety: trim to max 8 slots
      const slotTemplate = Array.from(slotMap.values())
        .sort((a, b) => parseInt(a.slot_id) - parseInt(b.slot_id))
        .slice(0, 8);

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
          ...(availableCount === 0 && {
            message: "❌ No available battery ≥ 60%",
          }),
        });
    } catch (err) {
      let stationData = stationCache[imei] || {};
      const doc = await db.collection("stations").doc(imei).get();
      if (doc.exists) stationData = doc.data();

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
          message: "❌ Failed to fetch station info",
        });
    }
  }
}

export default updateStationStats;
