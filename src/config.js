require("dotenv").config();

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY belum diisi di file .env");
}
console.log(
  "ALLOWED_NUMBERS terbaca:",
  JSON.stringify(
    (process.env.ALLOWED_NUMBERS || "")
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean),
  ),
);
module.exports = {
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.7-flash-lite",
  allowedNumbers: (
    process.env.ALLOWED_NUMBERS ||
    "62895414179023,6281369292009,244130823286829,200609668005947"
  )
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean),
  dbPath: process.env.DB_PATH || "./data/bot.db",
  timezone: "Asia/Jakarta",
  tzOffset: "+07:00", // WIB, dipakai untuk menghitung waktu kegiatan
  modeTtlMs: 10 * 60 * 1000, // mode input kegiatan kedaluwarsa setelah 10 menit
};
