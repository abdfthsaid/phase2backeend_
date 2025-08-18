// 📦 jobs/updateStationStats.js
import db from "../config/firebase.js";
import axios from "axios";
import dotenv from "dotenv";
import { Timestamp } from "firebase-admin/firestore";

dotenv.config();

const { HEYCHARGE_API_KEY, HEYCHARGE_DOMAIN } = process.env;

// Machine capacity per station
const MACHINE_CAPACITY = 8;
// List of station IMEIs to track
const stations = [
  "WSEP161721195358",
  "WSEP161741066504",
  "WSEP161741066505",
  "WSEP161741066502",
  "WSEP161741066503",
];

// Cache station metadata to reduce reads
const stationCache = {};

/**
 * Update all station stats with full battery reconciliation
 */
export async function updateStationStats() {
  const now = Timestamp.now();
  const nowDate = now.toDate();

  try {
    // 1️⃣ Fetch all rentals with status "rented" (across all stations)
    const rentalsSnap = await db
      .collection("rentals")
      .where("status", "==", "rented")
      .get();

    const allRentals = rentalsSnap.docs.map((doc) => ({
      id: doc.id,
      ref: doc.ref,
      ...doc.data(),
    }));

    // 2️⃣ Fetch all stations' HeyCharge batteries
    const globalBatteryMap = new Map(); // battery_id → station_imei
    const stationHeyChargeMap = {};

    for (const imei of stations) {
      try {
        const url = `${HEYCHARGE_DOMAIN}/v1/station/${imei}`;
        const { data } = await axios.get(url, {
          auth: { username: HEYCHARGE_API_KEY, password: "" },
        });

        const batteries = data.batteries || [];
        stationHeyChargeMap[imei] = batteries;
        batteries.forEach((b) => {
          if (b.battery_id) globalBatteryMap.set(b.battery_id, imei);
        });

        // Cache station metadata
        const doc = await db.collection("stations").doc(imei).get();
        const meta = doc.exists ? doc.data() : {};
        stationCache[imei] = { ...stationCache[imei], ...meta };
      } catch (err) {
        console.error(`❌ Error fetching HeyCharge data for ${imei}:`, err.message);
        stationHeyChargeMap[imei] = [];
      }
    }

    // 3️⃣ Reconcile rentals: mark returned if battery physically exists
    for (const rental of allRentals) {
      if (globalBatteryMap.has(rental.battery_id)) {
        await rental.ref.update({ status: "returned", returnedAt: now });
        console.log(`↩️ Auto-returned ${rental.battery_id} (found in another station)`);
      }
    }

    // 4️⃣ Compute each station stats
    for (const imei of stations) {
      const batteries = stationHeyChargeMap[imei] || [];
      const station_status = batteries.length === 0 ? "Offline" : "Online";

      // Build slot map
      const slotMap = new Map();
      for (let slot = 1; slot <= MACHINE_CAPACITY; slot++) {
        slotMap.set(String(slot), {
          slot_id: String(slot),
          battery_id: null,
          level: null,
          status: "Empty",
          rented: false,
          phoneNumber: "",
          rentedAt: null,
          amount: 0,
        });
      }

      // Overlay HeyCharge data
      batteries.forEach((b) => {
        slotMap.set(b.slot_id, {
          slot_id: b.slot_id,
          battery_id: b.battery_id,
          level: parseInt(b.battery_capacity) || null,
          status: b.lock_status === "1" ? "Online" : "Offline",
          rented: false,
          phoneNumber: "",
          rentedAt: null,
          amount: 0,
        });
      });

      // Overlay rentals still valid for this station
      let rentedCount = 0;
      let overdueCount = 0;

      for (const rental of allRentals) {
        // Only consider rentals still not returned
        if (rental.status !== "rented") continue;

        // If rental battery belongs to this station
        const inThisStation = globalBatteryMap.get(rental.battery_id) === imei;
        if (!inThisStation) continue;

        rentedCount++;
        const diffH = (nowDate - rental.timestamp.toDate()) / 36e5;
        if ((rental.amount === 0.5 && diffH > 2) || (rental.amount === 1 && diffH > 12)) {
          overdueCount++;
        }

        slotMap.set(rental.slot_id, {
          slot_id: rental.slot_id,
          battery_id: rental.battery_id,
          level: null,
          status: "Rented",
          rented: true,
          phoneNumber: rental.phoneNumber,
          rentedAt: rental.timestamp,
          amount: rental.amount,
        });
      }

      const slots = Array.from(slotMap.values()).sort(
        (a, b) => parseInt(a.slot_id) - parseInt(b.slot_id)
      );
      const totalSlots = slots.length;
      const availableCount = slots.filter((s) => s.status === "Online").length;

      const meta = stationCache[imei] || {};

      await db.collection("station_stats").doc(imei).set({
        id: imei,
        stationCode: imei,
        imei,
        name: meta.name || "",
        location: meta.location || "",
        iccid: meta.iccid || "",
        station_status,
        totalSlots,
        availableCount,
        rentedCount,
        overdueCount,
        timestamp: now,
        batteries: slots,
      });

      console.log(
        `✅ Updated ${imei}: total=${totalSlots} avail=${availableCount} rented=${rentedCount} overdue=${overdueCount}`
      );
    }
  } catch (err) {
    console.error("❌ Failed to update station stats:", err.message);
  }
}

export default updateStationStats;
