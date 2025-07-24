import dotenv from "dotenv";
dotenv.config();

import express from "express";
import db from "../config/firebase.js";
import { imeiToStationCode } from "../utils/imeiMap.js";
import axios from "axios";

const router = express.Router();

// 📍 Add new station to Firestore (with uniqueness check)
router.post("/add", async (req, res) => {
  const { imei, name, iccid, location = "", totalSlots = 6 } = req.body;

  if (!imei || !name || !iccid) {
    return res
      .status(400)
      .json({ error: "imei, name, and iccid are required ❌" });
  }

  try {
    // 🔍 Check IMEI uniqueness
    const imeiSnap = await db
      .collection("stations")
      .where("imei", "==", imei)
      .get();
    if (!imeiSnap.empty) {
      return res
        .status(409)
        .json({ error: "Station with this IMEI already exists ❌" });
    }

    // 🔍 Check Name uniqueness
    const nameSnap = await db
      .collection("stations")
      .where("name", "==", name)
      .get();
    if (!nameSnap.empty) {
      return res
        .status(409)
        .json({ error: "Station with this Name already exists ❌" });
    }

    // 🔍 Check ICCID uniqueness
    const iccidSnap = await db
      .collection("stations")
      .where("iccid", "==", iccid)
      .get();
    if (!iccidSnap.empty) {
      return res
        .status(409)
        .json({ error: "Station with this ICCID already exists ❌" });
    }

    // ✅ Add new station
    await db.collection("stations").doc(imei).set({
      imei,
      name,
      iccid,
      location,
      totalSlots,
      createdAt: new Date(),
    });

    res.status(201).json({ message: "Station added ✅" });
  } catch (error) {
    console.error("Error adding station:", error);
    res.status(500).json({ error: "Failed to add station ❌" });
  }
});

// 📍 Update station by IMEI — partial update allowed, keeps others from Firestore
router.put("/update/:imei", async (req, res) => {
  const { imei } = req.params;
  const updates = req.body;

  try {
    const stationRef = db.collection("stations").doc(imei);
    const doc = await stationRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Station not found ❌" });
    }

    // ✅ Only update provided fields — others stay as-is
    await stationRef.update({
      ...updates,
      updatedAt: new Date(),
    });

    res.status(200).json({ message: "Station updated successfully ✅" });
  } catch (error) {
    console.error("Update Error:", error);
    res.status(500).json({ error: "Failed to update station ❌" });
  }
});

// 🗑️ Delete station by IMEI
router.delete("/delete/:imei", async (req, res) => {
  const { imei } = req.params;

  try {
    const stationRef = db.collection("stations").doc(imei);
    const doc = await stationRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Station not found ❌" });
    }

    await stationRef.delete();

    res.status(200).json({ message: "Station deleted successfully 🗑️✅" });
  } catch (error) {
    console.error("Delete Error:", error);
    res.status(500).json({ error: "Failed to delete station ❌" });
  }
});

// // // 🔌 HeyCharge API integration

// // routes/stationRoutes.js

// // one sation🫡
// // GET station by IMEI
// // GET /api/stations/stats/:imei
// router.get("/stats/:imei", async (req, res) => {
//   const { imei } = req.params;

//   try {
//     const stationSnap = await db
//       .collection("stations")
//       .where("imei", "==", imei)
//       .get();

//     if (stationSnap.empty) {
//       return res.status(404).json({ error: "Station not found" });
//     }

//     const stationDoc = stationSnap.docs[0];
//     const stationData = stationDoc.data();

//     const statDoc = await db
//       .collection("station_stats")
//       .doc(stationDoc.id)
//       .get();
//     const stats = statDoc.exists ? statDoc.data() : {};

//     res.status(200).json({
//       ...stats,
//       name: stationData.name || "",
//       location: stationData.location || "",
//       iccid: stationData.iccid || "",
//     });
//   } catch (err) {
//     console.error("Get Station Error:", err.message);
//     res.status(500).json({ error: "Failed to fetch station" });
//   }
// });

// all🫡
const { HEYCHARGE_API_KEY, HEYCHARGE_DOMAIN } = process.env;

// GET all stations with full data
// GET /api/stations/stats
router.get("/stats", async (req, res) => {
  try {
    const snap = await db.collection("station_stats").get();
    const stations = [];

    for (const doc of snap.docs) {
      const stat = doc.data();

      const stationDoc = await db
        .collection("stations")
        .doc(stat.stationCode)
        .get();
      const meta = stationDoc.exists ? stationDoc.data() : {};

      stations.push({
        ...stat,
        name: meta.name || "",
        location: meta.location || "",
        iccid: meta.iccid || "",
      });
    }

    res.status(200).json({ stations });
  } catch (err) {
    console.error("Get All Station Stats Error:", err.message);
    res.status(500).json({ error: "Failed to fetch all station stats" });
  }
});

router.get("/basic", async (req, res) => {
  try {
    const stationsSnap = await db.collection("stations").get();

    if (stationsSnap.empty) {
      return res.status(404).json({ error: "No stations found ❌" });
    }

    const stations = stationsSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id, // Document ID
        imei: data.imei || "",
        name: data.name || "Unnamed Station",
        iccid: data.iccid || "Unknown",
        location: data.location || "Not Set",
        totalSlots: data.totalSlots || 0, // ✅ Add totalSlots
      };
    });

    res.status(200).json({ stations });
  } catch (error) {
    console.error("❌ Error fetching basic station info:", error.message);
    res.status(500).json({ error: "Failed to fetch station basics ❌" });
  }
});

// 📡 GET /api/stations/:stationCode

const stationImeisByCode = {
  "58": "WSEP161721195358",
  "04": "WSEP161741066504",
  "05": "WSEP161741066505",
  "02": "WSEP161741066502",
  "03": "WSEP161741066503",
};

router.get("/api/stations/:stationCode", async (req, res) => {
  const { stationCode } = req.params;
  const imei = stationImeisByCode[stationCode];

  if (!imei) return res.status(404).json({ error: "Invalid station code" });

  try {
    const heyRes = await axios.get(
      `${process.env.HEYCHARGE_DOMAIN}/station/status?imei=${imei}`,
      { headers: { "x-api-key": process.env.HEYCHARGE_API_KEY } }
    );

    const heyBatteries = heyRes.data?.batteries || [];
    const physicalBatteryIds = heyBatteries.map((b) => b.battery_id);

    const rentalsSnap = await db
      .collection("rentals")
      .where("stationCode", "==", stationCode)
      .where("status", "==", "rented")
      .get();

    const validRented = [];
    let conflictCount = 0;

    for (const doc of rentalsSnap.docs) {
      const data = doc.data();

      if (physicalBatteryIds.includes(data.battery_id)) {
        conflictCount++;

        await db.collection("rentals").doc(doc.id).update({
          status: "returned",
          returnedAt: Timestamp.now(),
        });
      } else {
        validRented.push({
          battery_id: data.battery_id,
          slot_id: data.slot_id,
          phoneNumber: data.phoneNumber,
          status: "Rented",
          level: null,
        });
      }
    }

    const merged = [...heyBatteries, ...validRented];

    if (merged.length > 8) {
      return res.status(400).json({
        error: "❌ Total batteries (physical + rented) exceed 8!",
        details: {
          stationCode,
          total: merged.length,
          physicalCount: heyBatteries.length,
          rentedCount: validRented.length,
        },
        conflictCount,
      });
    }

    return res.json({
      stationCode,
      imei,
      physicalCount: heyBatteries.length,
      rentedCount: validRented.length,
      totalCount: merged.length,
      conflictCount,
      batteries: merged,
    });
  } catch (err) {
    return res.status(500).json({ error: "Station fetch failed" });
  }
});

export default router;
