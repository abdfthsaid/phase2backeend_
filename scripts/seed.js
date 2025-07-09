import db from "../config/firebase.js";
import { Timestamp } from "firebase-admin/firestore";

const rentals = [
  {
    stationCode: "WSEP161721195358",
    battery_id: "BAT001",
    slot_id: "3",
    amount: 1,
    phoneNumber: "252610000000",
    status: "rented",
    timestamp: Timestamp.now(),
    rentedAt: Timestamp.now(),
  },
  {
    stationCode: "WSEP161721195358",
    battery_id: "BAT002",
    slot_id: "1",
    amount:1,
    phoneNumber: "252611111111",
    status: "rented",
    timestamp: Timestamp.now(),
    rentedAt: Timestamp.now(),
  }
];

async function seedRentals() {
  for (const rental of rentals) {
    await db.collection("rentals").add(rental);
    console.log("✅ Seeded rental:", rental.battery_id);
  }

  process.exit();
}

seedRentals();
