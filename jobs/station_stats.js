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

      const data = response.data;
      const rawBatteries = data.batteries || [];
      const heyStatus = data.station_status || "Online";
      const station_status = heyStatus === "Offline" ? "Offline" : "Online";

      console.log(`🛰️ ${imei} HeyCharge says: ${heyStatus}`);
      console.log(`📦 Batteries from HeyCharge: ${rawBatteries.length}`);

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
        console.warn(`⚠️ Station ${imei} is Offline by HeyCharge`);
        continue;
      }

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

      const rentalSnapshot = await db
        .collection("rentals")
        .where("imei", "==", imei)
        .where("status", "==", "rented")
        .get();

      console.log(
        `📄 Rentals from Firestore (status='rented'): ${rentalSnapshot.size}`
      );

      let rentedCount = 0;
      const presentBatteryIds = new Set(rawBatteries.map((b) => b.battery_id));

      // Check which rented batteries are missing from HeyCharge
      const missingBatteryIds = [];

      for (const doc of rentalSnapshot.docs) {
        const rental = doc.data();
        const batteryId = rental.battery_id;

        if (!presentBatteryIds.has(batteryId)) {
          missingBatteryIds.push(batteryId);
        }

        console.log(
          `📄 Rental doc: ${doc.id}, timestamp: ${rental.timestamp?.toDate()}`
        );
        console.log(
          `📅 Is today: ${rental.timestamp && isToday(rental.timestamp)}`
        );

        if (presentBatteryIds.has(batteryId)) {
          const batterySlot = Array.from(slotMap.values()).find(
            (slot) => slot.battery_id === batteryId
          );
          const isActuallyAvailable =
            batterySlot && batterySlot.status === "Online";

          if (isActuallyAvailable) {
            await doc.ref.update({ status: "returned", returnedAt: now });
            console.log(`↩️ Auto-returned ${batteryId}`);
            continue;
          }
        }

        if (!rental.timestamp || !isToday(rental.timestamp)) continue;

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

      if (missingBatteryIds.length > 0) {
        console.warn(
          `❗ Missing batteries (rented but not in HeyCharge): ${missingBatteryIds.length}`
        );
        console.warn(`⚠️ IDs:`, missingBatteryIds);
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

      console.warn(`⚠️ Station ${imei} marked Offline due to error.`);
    }
  }
}

export default updateStationStats;
