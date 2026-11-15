const config = require("../config");
const kegiatan = require("./kegiatan");
const chatbot = require("./chatbot");

// Daftar izin: toleran terhadap bentuk apa pun (array, Set, atau teks)
const mentah =
  config.allowedNumbers ??
  config.ALLOWED_NUMBERS ??
  process.env.ALLOWED_NUMBERS ??
  "";

const daftarIzin = new Set(
  (typeof mentah === "string" ? mentah.split(",") : Array.from(mentah))
    .map((n) => String(n).trim())
    .filter(Boolean),
);
console.log("Daftar izin aktif:", [...daftarIzin]);

const cacheIzin = new Map();

// Status, broadcast, dan Channel (newsletter) selalu diabaikan
function chatDiabaikan(id) {
  return (
    id === "status@broadcast" ||
    id.endsWith("@broadcast") ||
    id.endsWith("@newsletter")
  );
}

// Apakah bot di-tag di dalam pesan grup?
async function dibaratagBot(client, message) {
  try {
    const idBot = client.info?.wid?._serialized;
    if (
      idBot &&
      (message.mentionedIds || []).some((x) => (x._serialized || x) === idBot)
    ) {
      return true;
    }
    const mentions = await message.getMentions();
    return mentions.some((c) => c.isMe);
  } catch (e) {
    console.error("Gagal membaca mention:", e.message);
    return false;
  }
}

// Ambil nama dan nomor pengirim (bukan nomor grup)
async function ambilInfo(message, pengirimId) {
  let nama = message._data?.notifyName || "Tidak diketahui";
  let nomor = null;

  try {
    const c = await message.getContact();
    nama = c.name || c.pushname || nama;
    nomor = c.number || c.id?.user || null;
  } catch (e) {
    console.error("getContact gagal:", e.message);
  }

  if (!nomor && pengirimId.endsWith("@c.us")) {
    nomor = pengirimId.replace("@c.us", "");
  }
  return { nama, nomor: nomor || pengirimId.split("@")[0] };
}

function cekIzin(pengirimId, nomor) {
  if (cacheIzin.get(pengirimId)) return true;

  const ok =
    daftarIzin.has(String(nomor)) || daftarIzin.has(pengirimId.split("@")[0]);

  if (ok) cacheIzin.set(pengirimId, true);
  return ok;
}

// Kirim balasan: coba sendMessage dulu, kalau gagal pakai message.reply
async function kirim(client, message, chatId, teks) {
  try {
    await client.sendMessage(chatId, teks, { sendSeen: false });
    console.log("[balasan] terkirim via sendMessage");
  } catch (e1) {
    console.error("[balasan] sendMessage gagal:", e1.message);
    try {
      await message.reply(teks);
      console.log("[balasan] terkirim via message.reply");
    } catch (e2) {
      console.error("[balasan] message.reply juga gagal:", e2.message);
      throw e2;
    }
  }
}
// Indikator "sedang mengetik...". Mengembalikan fungsi untuk menghentikannya.
async function mulaiMengetik(client, chatId) {
  let chat;
  try {
    chat = await client.getChatById(chatId);
    await chat.sendStateTyping();
  } catch (e) {
    console.error("[mengetik] gagal (diabaikan):", e.message);
    return async () => {};
  }

  // Status mengetik kedaluwarsa sekitar 25 detik, jadi diperbarui tiap 20 detik
  const timer = setInterval(() => {
    chat.sendStateTyping().catch(() => {});
  }, 20000);

  return async () => {
    clearInterval(timer);
    try {
      await chat.clearState();
    } catch (_) {}
  };
}

async function bantuan(ctx) {
  await ctx.reply(
    `Menu bot:

• tambah kegiatan - catat tugas/kegiatan baru
• lihat kegiatan - tampilkan daftar kegiatan
• selesai <ID> - tandai kegiatan selesai
• hapus <ID> - hapus kegiatan
• bantuan - tampilkan menu ini

Selain itu, kamu bisa bertanya apa saja dan aku akan menjawabnya.`,
  );
}

const perintah = {
  "tambah kegiatan": kegiatan.mulaiTambah,
  "lihat kegiatan": kegiatan.lihat,
  "daftar kegiatan": kegiatan.lihat,
  bantuan: bantuan,
  menu: bantuan,
  help: bantuan,
};

async function onMessage(client, message) {
  const chatId = message.from; // tempat membalas (chat pribadi atau grup)

  // ---------- Filter paling awal ----------
  if (message.fromMe) return;
  if (chatDiabaikan(chatId)) return;

  const grup = chatId.endsWith("@g.us");
  if (grup && !(await dibaratagBot(client, message))) return;

  const pengirimId = message.author || message.from; // pengirim sebenarnya
  let pesan = (message.body || "").trim();
  if (grup) pesan = pesan.replace(/@\d+/g, "").trim(); // buang teks tag

  // Konteks untuk handler lain
  const ctx = {
    from: pengirimId,
    type: message.type,
    reply: (teks) => kirim(client, message, chatId, teks),
    mengetik: () => mulaiMengetik(client, chatId), // <-- baris baru
  };

  try {
    const { nama, nomor } = await ambilInfo(message, pengirimId);

    if (!cekIzin(pengirimId, nomor)) {
      console.log(`[ditolak] ${nomor} (${grup ? "grup" : "pribadi"})`);
      return;
    }

    console.log("------------------------------");
    console.log(`Nama Kontak: ${nama}`);
    console.log(`Nomor: ${nomor}`);
    console.log(`Pesan: ${pesan}`);
    console.log("------------------------------");

    const kunci = pesan.toLowerCase();

    // 1. Mulai tambah kegiatan
    if (kunci === "tambah kegiatan") return await kegiatan.mulaiTambah(ctx);

    // 2. Sedang mengisi form
    if (kegiatan.modeAktif(ctx.from)) {
      return await kegiatan.prosesForm(ctx, pesan);
    }

    // 3. Perintah dengan ID
    const mSelesai = kunci.match(/^selesai\s+(\d+)$/);
    if (mSelesai) return await kegiatan.selesai(ctx, Number(mSelesai[1]));

    const mHapus = kunci.match(/^hapus\s+(\d+)$/);
    if (mHapus) return await kegiatan.hapus(ctx, Number(mHapus[1]));

    // 4. Perintah tabel
    const handler = perintah[kunci];
    if (handler) return await handler(ctx);

    // 5. Selain itu -> Gemini (sudah punya retry dan fallback sendiri)
    await chatbot.jawab(ctx, pesan);
  } catch (error) {
    console.error("Terjadi kesalahan:", error);
    try {
      await ctx.reply(
        "Maaf, saya mengalami kendala teknis. Coba lagi sebentar ya.",
      );
    } catch (e) {
      console.error("Gagal mengirim pesan error:", e.message);
    }
  }
}

module.exports = onMessage;
