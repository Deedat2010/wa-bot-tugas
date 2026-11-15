const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

require("./config"); // validasi .env lebih awal
const db = require("./db");
const onMessage = require("./handlers/message");
const { mulaiReminder } = require("./services/reminder");

const client = new Client({
  authStrategy: new LocalAuth(),
  authTimeoutMs: 120000,
  webVersionCache: {
    type: "remote",
    remotePath:
      "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html",
  },
  puppeteer: {
    headless: true,
    protocolTimeout: 120000,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  },
});

client.on("loading_screen", (persen, pesan) =>
  console.log("Loading:", persen, pesan),
);
client.on("authenticated", () => console.log("Terautentikasi"));

client.on("qr", (qr) => {
  console.log("Silakan scan QR Code berikut:");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("=================================");
  console.log("WhatsApp Bot berhasil terhubung!");
  console.log("=================================");
  mulaiReminder(client); // aman walau "ready" terpicu dua kali
});

client.on("auth_failure", (msg) => console.error("Autentikasi gagal:", msg));

client.on("disconnected", (reason) => {
  console.error("WhatsApp terputus:", reason);
  process.exit(1);
});

// PENTING: kirim client DAN message ke handler
client.on("message", (message) => onMessage(client, message));

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
});

process.on("SIGINT", async () => {
  console.log("\nMenutup bot...");
  try {
    await client.destroy();
  } catch (_) {}
  db.close();
  process.exit(0);
});

client.initialize().catch((err) => {
  console.error("Gagal inisialisasi:", err.message);
  process.exit(1);
});
