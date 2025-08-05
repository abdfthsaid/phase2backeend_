const fs = require("fs");
const path = "C:\\Users\\Abdifth\\Downloads\\dll\\payment-backend\\danab-project-firebase-adminsdk.json";

try {
  const content = fs.readFileSync(path, "utf8");
  const encoded = Buffer.from(content).toString("base64");
  console.log("✅ COPY this base64 string below:\n");
  console.log(encoded);
} catch (err) {
  console.error("❌ Error reading file:", err.message);
}
