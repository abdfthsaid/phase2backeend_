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
      batteries.forEach(b => {
        all[b.battery_id] = { imei, slot_id: b.slot_id };
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

  const rentalsSnap = await db
    .collection("rentals")
    .where("status", "==", "rented")
    .get();

  for (const doc of rentalsSnap.docs) {
    const rental = doc.data();
    const { battery_id, imei } = rental;

    if (liveMap[battery_id]) {
      const realStation = liveMap[battery_id].imei;

      if (realStation !== imei) {
        // Battery is in another station physically
        console.log(
          `🔄 Battery ${battery_id} mismatch: rented in ${imei}, found in ${realStation}`
        );

        // Auto-return the old rental
        await doc.ref.update({
          status: "returned",
          returnedAt: now,
          corrected: true,
          correctionNote: `Returned automatically (found in ${realStation})`,
        });

        // Optional: You could also create a new record at realStation
        // await db.collection("rentals").add({ ...rental, imei: realStation, status: "corrected" });
      }
    }
  }

  console.log("✅ Correction job finished");
}

export default correctMismatches;
