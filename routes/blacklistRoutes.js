import express from "express";
import db from "../config/firebase.js";

const router = express.Router();

// 🚫 GET all blacklisted users
router.get("/", async (req, res) => {
  try {
    const snapshot = await db.collection("blacklist").get();
    const blacklist = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json(blacklist);
  } catch (err) {
    console.error("❌ Error fetching blacklist:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🚫 ADD user to blacklist
router.post("/", async (req, res) => {
  const { phoneNumber, reason, customerName } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ error: "Phone number is required" });
  }

  try {
    // Check if already blacklisted
    const existing = await db
      .collection("blacklist")
      .where("phoneNumber", "==", phoneNumber)
      .get();

    if (!existing.empty) {
      return res
        .status(400)
        .json({ error: "Phone number already blacklisted" });
    }

    const docRef = await db.collection("blacklist").add({
      phoneNumber,
      reason: reason || "Did not return battery",
      customerName: customerName || "",
      createdAt: new Date(),
    });

    res.json({
      success: true,
      message: "User added to blacklist",
      id: docRef.id,
    });
  } catch (err) {
    console.error("❌ Error adding to blacklist:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🚫 CHECK if phone number is blacklisted (checks ALL blacklist entries)
router.get("/check/:phoneNumber", async (req, res) => {
  const { phoneNumber } = req.params;

  // Clean the input phone number - get just digits
  const inputDigits = phoneNumber.replace(/\D/g, "");
  // Get last 9 digits (core number without country code)
  const inputCore = inputDigits.slice(-9);

  console.log(`🔍 Checking blacklist for: ${phoneNumber}, core: ${inputCore}`);

  try {
    // Get ALL blacklist entries and compare
    const snapshot = await db.collection("blacklist").get();

    for (const doc of snapshot.docs) {
      const blacklistedPhone = doc.data().phoneNumber || "";
      // Clean blacklisted phone - get just digits
      const blacklistDigits = blacklistedPhone.replace(/\D/g, "");
      // Get last 9 digits
      const blacklistCore = blacklistDigits.slice(-9);

      console.log(
        `🔍 Comparing: input="${inputCore}" vs blacklist="${blacklistCore}" (${blacklistedPhone})`
      );

      // Compare core numbers (last 9 digits)
      if (inputCore === blacklistCore && inputCore.length >= 8) {
        console.log(`🚫 Blacklisted found! ${blacklistedPhone}`);
        return res.json({ phoneNumber, isBlacklisted: true });
      }
    }

    console.log(`✅ Not blacklisted: ${phoneNumber}`);
    res.json({ phoneNumber, isBlacklisted: false });
  } catch (err) {
    console.error("❌ Error checking blacklist:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🚫 REMOVE user from blacklist
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    await db.collection("blacklist").doc(id).delete();
    res.json({ success: true, message: "User removed from blacklist" });
  } catch (err) {
    console.error("❌ Error removing from blacklist:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🔧 Helper function to check blacklist (exported for use in other routes)
export async function isPhoneBlacklisted(phoneNumber) {
  const snapshot = await db
    .collection("blacklist")
    .where("phoneNumber", "==", phoneNumber)
    .get();
  return !snapshot.empty;
}

export default router;
