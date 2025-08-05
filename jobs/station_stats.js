// 📦 jobs/updateStationStats.js
import db from "../config/firebase.js";
import axios from "axios";
import dotenv from "dotenv";
import { Timestamp } from "firebase-admin/firestore";

dotenv.config();

const { HEYCHARGE_API_KEY, HEYCHARGE_DOMAIN } = process.env;

// Machine capacity (slots per station)
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
 * Fetches station status from HeyCharge, merges with rental info,
 * computes counts (totalSlots, availableCount, rentedCount, overdueCount),
 * and writes a consolidated snapshot to Firestore.
 */
export async function updateStationStats() {
  const now = Timestamp.now();

  for (const imei of stations) {
    try {
      // 1. Fetch live station data from HeyCharge
      const url = `${HEYCHARGE_DOMAIN}/v1/station/${imei}`;
      const { data } = await axios.get(url, {
        auth: { username: HEYCHARGE_API_KEY, password: "" },
      });

      const rawBatteries = data.batteries || [];
      const station_status =
        data.station_status === "Offline" ? "Offline" : "Online";

      // 2. Load station metadata (name, location, iccid)
      let meta = stationCache[imei];
      if (!meta) {
        const doc = await db.collection("stations").doc(imei).get();
        meta = doc.exists ? doc.data() : {};
        stationCache[imei] = meta;
      }

      // 3. If offline, write offline snapshot and continue
      if (station_status === "Offline") {
        console.log(`⚠️ Station ${imei} is offline`);
        await db
          .collection("station_stats")
          .doc(imei)
          .set({
            id: imei,
            stationCode: imei,
            imei,
            name: meta.name || "",
            location: meta.location || "",
            iccid: meta.iccid || "",
            station_status,
            totalSlots: 0,
            availableCount: 0,
            rentedCount: 0,
            overdueCount: 0,
            timestamp: now,
            batteries: [],
            message: "❌ Station offline",
          });
        continue;
      }

      // 4. Prepare lookup of present batteries
      const presentIds = new Set(rawBatteries.map((b) => b.battery_id));

      // 5. Build initial slot map with empty entries
      const slotMap = new Map();
      for (let slot = 1; slot <= MACHINE_CAPACITY; slot++) {
        const id = String(slot);
        slotMap.set(id, {
          slot_id: id,
          battery_id: null,
          level: null,
          status: "Empty",
          rented: false,
          phoneNumber: "",
          rentedAt: null,
          amount: 0,
        });
      }

      // 6. Overlay HeyCharge data
      rawBatteries.forEach((b) => {
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

      // 7. Fetch ongoing rentals
      const rentalsSnap = await db
        .collection("rentals")
        .where("imei", "==", imei)
        .where("status", "==", "rented")
        .get();

      let rentedCount = 0;
      let overdueCount = 0;
      const nowDate = now.toDate();

      // 8. Merge rental data
      rentalsSnap.forEach((doc) => {
        const r = doc.data();
        if (presentIds.has(r.battery_id)) {
          // Auto-return
          doc.ref.update({ status: "returned", returnedAt: now });
          console.log(`↩️ Auto-returned ${r.battery_id}`);
        } else {
          rentedCount++;
          // Overdue logic: $0.5 → >2h, $1 → >12h
          const diffH = (nowDate - r.timestamp.toDate()) / 36e5;
          if (
            (r.amount === 0.5 && diffH > 2) ||
            (r.amount === 1 && diffH > 12)
          ) {
            overdueCount++;
          }
          // Overlay rental
          slotMap.set(r.slot_id, {
            slot_id: r.slot_id,
            battery_id: r.battery_id,
            level: null,
            status: "Rented",
            rented: true,
            phoneNumber: r.phoneNumber,
            rentedAt: r.timestamp,
            amount: r.amount,
          });
        }
      });

      // 9. Finalize slots and counts
      const slots = Array.from(slotMap.values()).sort(
        (a, b) => parseInt(a.slot_id) - parseInt(b.slot_id)
      );
      const totalSlots = slots.length; // always MACHINE_CAPACITY
      const availableCount = slots.filter((s) => s.status === "Online").length;

      // 10. Write consolidated stats
      await db
        .collection("station_stats")
        .doc(imei)
        .set({
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
    } catch (err) {
      console.error(`❌ Error for station ${imei}:`, err.message);
      // On error, mark offline
      const errMeta = stationCache[imei] || {};
      await db
        .collection("station_stats")
        .doc(imei)
        .set({
          id: imei,
          stationCode: imei,
          imei,
          name: errMeta.name || "",
          location: errMeta.location || "",
          iccid: errMeta.iccid || "",
          station_status: "Offline",
          totalSlots: 0,
          availableCount: 0,
          rentedCount: 0,
          overdueCount: 0,
          timestamp: Timestamp.now(),
          batteries: [],
          message: "❌ Failed to fetch station info",
        });
    }
  }
}

export default updateStationStats;
