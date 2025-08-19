// 📦 jobs/correctMismatches.js
import db from "../config/firebase.js";
import axios from "axios";
import dotenv from "dotenv";
import { Timestamp } from "firebase-admin/firestore";

dotenv.config();

const { HEYCHARGE_API_KEY, HEYCHARGE_DOMAIN } = process.env;

// Stations you want to track
const stations = [
  "WSEP161721195358",
  "WSEP161741066504",
  "WSEP161741066505",
  "WSEP161741066502",
  "WSEP161741066503",
];

// Step 1: Fetch live batteries from HeyCharge
async function fetchAllBatteries() {
  const all = {};
  for (const imei of stations) {
    try {
      const url = `${HEYCHARGE_DOMAIN}/v1/station/${imei}`;
      const { data } = await axios.get(url, {
        auth: { username: HEYCHARGE_API_KEY, password: "" },
      });

      const batteries = data.batteries || [];
      batteries.forEach((b) => {
        if (b.battery_id) {
          all[b.battery_id] = { stationId: imei, slot_id: b.slot_id };
        }
      });
    } catch (err) {
      console.error(`❌ Failed to fetch station ${imei}:`, err.message);
    }
  }
  return all;
}

// Step 2: Correct mismatches
export async function correctMismatches() {
  const now = Timestamp.now();
  const liveMap = await fetchAllBatteries();

  // Rentals still open
  const rentalsSnap = await db
    .collection("rentals")
    .where("status", "==", "rented")
    .get();

  // Auxiliary data builder
  const stationAux = {}; // imei -> { activeRentalsCount, overdueActiveRentalsCount, ghostRentals }

  for (const doc of rentalsSnap.docs) {
    const rental = doc.data();
    const rentalId = doc.id;
    const { battery_id, imei, rentedAt, amount, phoneNumber } = rental;

    // Normalize amount to number
    const amt = Number(amount) || 0;
    const start = rentedAt?._seconds || 0;
    const ageSec = Math.floor(Date.now() / 1000) - start;

    // Overdue calculation: 0.5 USD → 2h, 1 USD → 12h
    let overdue = false;
    if ((amt === 0.5 && ageSec > 2 * 3600) || (amt === 1 && ageSec > 12 * 3600)) {
      overdue = true;
    }

    // Init station aux stats
    if (!stationAux[imei]) {
      stationAux[imei] = {
        activeRentalsCount: 0,
        overdueActiveRentalsCount: 0,
        ghostRentals: [],
      };
    }

    stationAux[imei].activeRentalsCount++;
    if (overdue) stationAux[imei].overdueActiveRentalsCount++;

    // --- Ghost/moved rental check ---
    const physical = liveMap[battery_id];
    if (physical && physical.stationId !== imei) {
      console.log(
        `👻 Ghost rental: battery ${battery_id} rented at ${imei}, found at ${physical.stationId}`
      );

      // Add to ghost list
      stationAux[imei].ghostRentals.push({
        rentalId,
        battery_id,
        rentedAt: start,
        phone: phoneNumber || "",
        foundAt: physical.stationId,
        slot_id: physical.slot_id,
        overdue,
      });

      // Auto-close rental
      await doc.ref.update({
        status: "returned",
        returnedAt: now,
        corrected: true,
        correctionNote: `Auto-closed (battery physically at ${physical.stationId})`,
      });
    }

    // --- Overdue rental handling ---
    if (!physical && overdue) {
      console.log(
        `⏰ Overdue rental: battery ${battery_id} rented at ${imei} is overdue`
      );

      // Auto-close overdue rental
      await doc.ref.update({
        status: "returned",
        returnedAt: now,
        corrected: true,
        correctionNote: `Auto-closed (overdue rental)`,
      });
    }
  }

  // Step 3: Write auxiliary stats
  for (const [stationId, data] of Object.entries(stationAux)) {
    await db.collection("station_stats_aux").doc(stationId).set({
      ...data,
      updatedAt: new Date(),
    });
  }

  console.log("✅ Correction job finished");
}

// Run once on import if desired
correctMismatches().catch((err) => console.error(err));

export default correctMismatches;
