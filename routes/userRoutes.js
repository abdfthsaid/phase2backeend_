import express from "express";
import db from "../config/firebase.js";

const router = express.Router();

// Add a new user with unique username and role validation
router.post("/add", async (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ error: "username, password, and role are required ❌" });
  }

  if (!["admin", "user"].includes(role)) {
    return res.status(400).json({ error: "Role must be 'admin' or 'user' only ❌" });
  }

  try {
    const existingUserSnap = await db
      .collection("system_users")
      .where("username", "==", username)
      .get();

    if (!existingUserSnap.empty) {
      return res.status(409).json({ error: "Username already exists ❌" });
    }

    const newUserRef = await db.collection("system_users").add({
      username,
      password,
      role,
      createdAt: new Date(),
    });

    res.status(201).json({ message: "User added ✅", id: newUserRef.id });
  } catch (error) {
    console.error("Add user error:", error);
    res.status(500).json({ error: "Failed to add user ❌" });
  }
});

// Update user by id or username (partial updates allowed)
router.put("/update", async (req, res) => {
  const { id, username } = req.query;
  const updates = req.body;

  if (!id && !username) {
    return res.status(400).json({ error: "Provide 'id' or 'username' to update user ❌" });
  }

  if (updates.role && !["admin", "user"].includes(updates.role)) {
    return res.status(400).json({ error: "Role must be 'admin' or 'user' only ❌" });
  }

  try {
    let userDocRef;
    if (id) {
      userDocRef = db.collection("system_users").doc(id);
      const doc = await userDocRef.get();
      if (!doc.exists) {
        return res.status(404).json({ error: "User not found ❌" });
      }
    } else {
      const snap = await db.collection("system_users").where("username", "==", username).limit(1).get();
      if (snap.empty) {
        return res.status(404).json({ error: "User not found ❌" });
      }
      userDocRef = snap.docs[0].ref;
    }

    await userDocRef.update({
      ...updates,
      updatedAt: new Date(),
    });

    res.json({ message: "User updated successfully ✅" });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({ error: "Failed to update user ❌" });
  }
});

// Delete user by id or username
router.delete("/delete", async (req, res) => {
  const { id, username } = req.query;

  if (!id && !username) {
    return res.status(400).json({ error: "Provide 'id' or 'username' to delete user ❌" });
  }

  try {
    if (id) {
      const docRef = db.collection("system_users").doc(id);
      const doc = await docRef.get();
      if (!doc.exists) {
        return res.status(404).json({ error: "User not found ❌" });
      }
      await docRef.delete();
    } else {
      const snap = await db.collection("system_users").where("username", "==", username).limit(1).get();
      if (snap.empty) {
        return res.status(404).json({ error: "User not found ❌" });
      }
      await snap.docs[0].ref.delete();
    }

    res.json({ message: "User deleted successfully ✅" });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ error: "Failed to delete user ❌" });
  }
});

// Get all users
router.get("/all", async (req, res) => {
  try {
    const snapshot = await db.collection("system_users").get();
    const users = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json(users);
  } catch (err) {
    console.error("Fetch all users error:", err);
    res.status(500).json({ error: "Failed to fetch users ❌" });
  }
});

// Get one user by id or username
router.get("/one", async (req, res) => {
  const { id, username } = req.query;

  if (!id && !username) {
    return res.status(400).json({ error: "Provide 'id' or 'username' to fetch user ❌" });
  }

  try {
    let doc;

    if (id) {
      doc = await db.collection("system_users").doc(id).get();
      if (!doc.exists) {
        return res.status(404).json({ error: "User not found ❌" });
      }
      return res.json({ id: doc.id, ...doc.data() });
    } else {
      const snap = await db.collection("system_users").where("username", "==", username).limit(1).get();

      if (snap.empty) {
        return res.status(404).json({ error: "User not found ❌" });
      }

      const found = snap.docs[0];
      return res.json({ id: found.id, ...found.data() });
    }
  } catch (err) {
    console.error("Fetch one user error:", err);
    res.status(500).json({ error: "Failed to fetch user ❌" });
  }
});

export default router;
