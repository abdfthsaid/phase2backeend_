import db from "../config/firebase.js";
import axios from "axios";
import dotenv from "dotenv";
import { Timestamp } from "firebase-admin/firestore";

dotenv.config();

const { HEYCHARGE_API_KEY, HEYCHARGE_DOMAIN } = process.env;

// Your station IMEIs as in Firestore document IDs
const stations = [
  "WSEP161721195358",
  "WSEP161741066504",
  "WSEP161741066505",
  "WSEP161741066502",
  "WSEP161741066503",
];

function isToday(timestamp) {
  const now = new Date();
  const date = timestamp.toDate();
  return now.toDateString() === date.toDateString();
}

export async function updateStationStats() {
  const now = Timestamp.now();

  for (const imei of stations) {
    try {
      // Fetch live batteries data from HeyCharge API
      const url = `${HEYCHARGE_DOMAIN}/v1/station/${imei}`;
      const response = await axios.get(url, {
        auth: { username: HEYCHARGE_API_KEY, password: "" },
      });

      const rawBatteries = response.data.batteries || [];
      const station_status = rawBatteries.length > 0 ? "Online" : "Offline";

      if (station_status === "Offline") {
        console.log(`Skipping offline station ${imei}`);
        continue; // skip offline station — don't save stats
      }

      // Build a map of slot_id -> battery info from HeyCharge
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

      // Fetch all rentals with status "rented" for this station (IMEI)
      const rentalSnapshot = await db
        .collection("rentals")
        .where("stationCode", "==", imei)
        .where("status", "==", "rented")
        .get();

      let rentedCount = 0;

      // Create a Set of battery_ids physically present (from HeyCharge)
      const presentBatteryIds = new Set(rawBatteries.map((b) => b.battery_id));

      for (const doc of rentalSnapshot.docs) {
        const rental = doc.data();

        // Check if the battery rented is now physically present => returned
        if (presentBatteryIds.has(rental.battery_id)) {
          // Update rental status to returned
          await doc.ref.update({
            status: "returned",
            returnedAt: now,
          });
          console.log(
            `Rental for battery ${rental.battery_id} marked returned.`
          );
          continue; // skip counting this rental as currently rented
        }

        // Only count rentals for today
        if (!rental.timestamp || !isToday(rental.timestamp)) continue;

        rentedCount++;

        // Override slot info with rental data (battery currently rented out)
        slotMap.set(rental.slot_id, {
          slot_id: rental.slot_id,
          battery_id: rental.battery_id,
          level: null, // unknown while rented
          status: "Rented",
          rented: true,
          phoneNumber: rental.phoneNumber,
          rentedAt: rental.timestamp,
          amount: rental.amount || 0,
        });
      }

      // Convert map to sorted array by slot_id
      const slotTemplate = Array.from(slotMap.values()).sort(
        (a, b) => parseInt(a.slot_id) - parseInt(b.slot_id)
      );

      const totalSlots = slotTemplate.length;
      const availableCount = slotTemplate.filter(
        (s) => s.status === "Online"
      ).length;

      // Get station metadata from Firestore (doc ID = IMEI)
      const stationDoc = await db.collection("stations").doc(imei).get();
      const stationData = stationDoc.exists ? stationDoc.data() : {};

      // Save merged data to station_stats collection, doc ID = IMEI
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
      console.error(`❌ Failed to update ${imei}:`, err.message);
    }
  }
}

// 100% from God — God
export default updateStationStats;
