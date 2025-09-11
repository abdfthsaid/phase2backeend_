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
      const doc = await db.collection("stations").doc(imei).get();
      let meta = doc.exists ? doc.data() : {};

      stationCache[imei] = {
        ...stationCache[imei],
        iccid: meta.iccid || stationCache[imei]?.iccid || "",
      };

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

      // 4. Prepare lookup of present batteries (to auto-return)
      const presentIds = new Set(rawBatteries.map((b) => b.battery_id));

      // 5. Build initial slot map with empty entries — these are VIRTUAL SLOTS
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

      // 6. Overlay HeyCharge data (live batteries) — these take priority
      rawBatteries.forEach((b) => {
        if (!b.slot_id || typeof b.slot_id !== "string") return;
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

      // 8. First, close duplicate battery rentals — keep only latest
      const seenBatteries = new Set();
      const validRentals = [];

      for (const rentalDoc of rentalsSnap.docs) {
        const r = rentalDoc.data();
        const { battery_id } = r;

        // Close duplicates — keep latest per battery_id
        const duplicateSnap = await db
          .collection("rentals")
          .where("battery_id", "==", battery_id)
          .where("status", "==", "rented")
          .orderBy("timestamp", "desc")
          .get();

        if (duplicateSnap.docs.length > 1) {
          const [latest, ...old] = duplicateSnap.docs;
          for (const oldDoc of old) {
            await oldDoc.ref.update({
              status: "returned",
              returnedAt: now,
              note: "Auto-closed: duplicate battery rental",
            });
            console.log(`🛑 Closed duplicate rental for battery ${battery_id}`);
          }
          if (rentalDoc.id !== latest.id) continue;
        }

        // Auto-return if battery is physically present
        if (presentIds.has(battery_id)) {
          await rentalDoc.ref.update({
            status: "returned",
            returnedAt: now,
            note: "Auto-returned: battery physically present",
          });
          console.log(`↩️ Auto-returned ${battery_id}`);
          continue;
        }

        // Add to valid rentals
        validRentals.push({ doc: rentalDoc, data: r });
      }

      // 9. Assign each valid rental to first available VIRTUAL slot (ignore rental's slot_id)
      for (const { doc, data: r } of validRentals) {
        const { battery_id, amount, timestamp, phoneNumber } = r;

        // Find first empty virtual slot
        let assignedSlot = null;
        for (let slot = 1; slot <= MACHINE_CAPACITY; slot++) {
          const slotId = String(slot);
          const slotData = slotMap.get(slotId);
          // Only assign to slots that are truly empty (not occupied by live battery or another rental)
          if (
            slotData.status === "Empty" &&
            !slotData.rented &&
            !slotData.battery_id
          ) {
            assignedSlot = slotId;
            break;
          }
        }

        // If no slot available → skip (shouldn’t happen unless >8 rentals — log it)
        if (!assignedSlot) {
          console.log(
            `⚠️ No virtual slot available for rental ${doc.id}, battery ${battery_id}`
          );
          continue;
        }

        // Validate data
        if (!timestamp || !amount) {
          console.log(`⚠️ Skipping rental ${doc.id}: missing timestamp or amount`);
          continue;
        }

        // Calculate overdue
        const diffMs = nowDate - timestamp.toDate();
        const diffH = diffMs / 3600000; // ms → hours
        let isOverdue = false;
        if (amount === 0.5 && diffH > 2) isOverdue = true;
        else if (amount === 1 && diffH > 12) isOverdue = true;

        // Assign to virtual slot
        slotMap.set(assignedSlot, {
          slot_id: assignedSlot, // ← VIRTUAL SLOT, not from rental
          battery_id,
          level: null,
          status: "Rented",
          rented: true,
          phoneNumber: phoneNumber || "",
          rentedAt: timestamp,
          amount: amount || 0,
        });

        rentedCount++;
        if (isOverdue) overdueCount++;
      }

      // 10. Finalize slots and counts
      const slots = Array.from(slotMap.values()).sort(
        (a, b) => parseInt(a.slot_id) - parseInt(b.slot_id)
      );
      const totalSlots = slots.length;
      const availableCount = slots.filter((s) => s.status === "Online").length;

      // 11. Write consolidated stats
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

// 👇 Helper for correctMismatches.js (optional)
export async function updateStationStatsForStation(imei) {
  // ... same as before — or you can remove if not used
  // For brevity, I’ll omit here — let me know if you need it
}

export default updateStationStats;
