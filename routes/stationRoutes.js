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

// // 🔌 HeyCharge API integration

// routes/stationRoutes.js

// /routes/stationRoutes.js
router.get("/by-imei/:imei", async (req, res) => {
  const { imei } = req.params;

  try {
    // 1️⃣ Get Firestore station
    const stationSnap = await db
      .collection("stations")
      .where("imei", "==", imei)
      .get();
    if (stationSnap.empty) {
      return res
        .status(404)
        .json({ error: "Station not found in Firestore ❌" });
    }

    const stationDoc = stationSnap.docs[0];
    const stationCode = stationDoc.id;
    const base = stationDoc.data();

    // 2️⃣ Get LIVE DATA from HeyCharge API
    const heychargeRes = await axios.get(
      `${process.env.HEYCHARGE_DOMAIN}/v1/station/${imei}`,
      {
        auth: {
          username: process.env.HEYCHARGE_API_KEY,
          password: "",
        },
      }
    );

    const batteries = heychargeRes.data?.batteries || [];
    const station_status = batteries.length > 0 ? "Online" : "Offline";

    // 3️⃣ Calculate available & rented count
    let availableCount = batteries.filter(
      (b) =>
        b.lock_status === "1" &&
        parseInt(b.battery_capacity) >= 60 &&
        b.battery_abnormal === "0" &&
        b.cable_abnormal === "0"
    ).length;

    let rentedCount = batteries.length - availableCount;

    // 4️⃣ Add rental info from Firestore if exists
    let batteryInfo = batteries.map((b) => ({
      battery_id: b.battery_id,
      slot_id: b.slot_id?.toString() || "",
      level: parseInt(b.battery_capacity),
      status: b.lock_status === "1" ? "Online" : "Offline",
    }));

    const rentalSnap = await db
      .collection("rentals")
      .where("stationCode", "==", stationCode)
      .where("status", "==", "rented")
      .get();

    const rentedMap = {};
    rentalSnap.forEach((doc) => {
      const data = doc.data();
      rentedMap[data.battery_id] = {
        rented: true,
        phoneNumber: data.phoneNumber,
        rentedAt: data.timestamp?.toDate().toISOString() || null,
        amount: data.amount,
      };
    });

    batteryInfo = batteryInfo.map((b) =>
      rentedMap[b.battery_id] ? { ...b, ...rentedMap[b.battery_id] } : b
    );

    // 5️⃣ Response = Firestore + HeyCharge
    res.json({
      id: stationCode,
      stationCode,
      imei,
      name: base.name || "",
      iccid: base.iccid || "",
      location: base.location || "",
      totalSlots: batteries.length,
      availableCount,
      rentedCount,
      station_status,
      timestamp: new Date().toISOString(),
      batteries: batteryInfo,
    });
  } catch (error) {
    console.error("❌ Error:", error.message);
    res.status(500).json({
      error: "Failed to fetch station info",
      details: error.message,
    });
  }
});

// all
const { HEYCHARGE_API_KEY, HEYCHARGE_DOMAIN } = process.env;

router.get("/full", async (req, res) => {
  try {
    const stationsSnap = await db.collection("stations").get();
    const stations = [];

    for (const doc of stationsSnap.docs) {
      const base = doc.data();
      const stationCode = doc.id;
      const imei = base.imei;

      let batteries = [];
      let station_status = "Offline";
      let availableCount = 0;
      let rentedCount = 0;
      let batteryInfo = [];

      try {
        // 🔌 Get live battery data from HeyCharge
        const heychargeRes = await axios.get(
          `${HEYCHARGE_DOMAIN}/v1/station/${imei}`,
          {
            auth: { username: HEYCHARGE_API_KEY, password: "" },
          }
        );

        batteries = heychargeRes.data?.batteries || [];
        station_status = batteries.length > 0 ? "Online" : "Offline";

        availableCount = batteries.filter(
          (b) =>
            b.lock_status === "1" &&
            parseInt(b.battery_capacity) >= 60 &&
            b.battery_abnormal === "0" &&
            b.cable_abnormal === "0"
        ).length;

        rentedCount = batteries.length - availableCount;

        batteryInfo = batteries.map((b) => ({
          battery_id: b.battery_id,
          slot_id: b.slot_id?.toString() || "",
          level: parseInt(b.battery_capacity),
          status: b.lock_status === "1" ? "Online" : "Offline",
        }));

        // 🔁 Merge with rentals
        const rentalsSnap = await db
          .collection("rentals")
          .where("stationCode", "==", stationCode)
          .where("status", "==", "rented")
          .get();

        const rentedMap = {};
        rentalsSnap.forEach((r) => {
          const data = r.data();
          rentedMap[data.battery_id] = {
            rented: true,
            phoneNumber: data.phoneNumber,
            rentedAt: data.timestamp?.toDate().toISOString() || null,
            amount: data.amount || 0,
          };
        });

        batteryInfo = batteryInfo.map((b) =>
          rentedMap[b.battery_id] ? { ...b, ...rentedMap[b.battery_id] } : b
        );
      } catch (err) {
        console.error(
          `⚠️ Failed HeyCharge fetch for IMEI ${imei}:`,
          err.message
        );
      }

      stations.push({
        id: stationCode,
        stationCode,
        imei,
        name: base.name || "",
        iccid: base.iccid || "",
        location: base.location || "",
        totalSlots: batteries.length || base.totalSlots || 6,
        availableCount,
        rentedCount,
        station_status,
        timestamp: new Date().toISOString(),
        batteries: batteryInfo,
      });
    }

    res.status(200).json({ stations });
  } catch (err) {
    console.error("❌ Error fetching full stations:", err.message);
    res.status(500).json({ error: "Failed to fetch full stations" });
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

export default router;
