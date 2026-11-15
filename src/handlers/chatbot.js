const { GoogleGenAI } = require("@google/genai");
const { geminiApiKey, geminiModel } = require("../config");

const ai = new GoogleGenAI({ apiKey: geminiApiKey });

const MODEL_UTAMA = geminiModel;
const MODEL_CADANGAN = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.6-flash";

const TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 12000; // batas satu panggilan
const HEDGE_MS = Number(process.env.GEMINI_HEDGE_MS) || 5000; // model cadangan ikut jalan
const NOTIF_MS = Number(process.env.GEMINI_NOTIF_MS) || 7000; // pesan "sebentar ya"
const COOLDOWN_MS = 3000; // jeda minimal antar pesan per pengguna

const PESAN_SIBUK = "Maaf, server sedang sibuk, silakan coba lagi nanti.";
const PESAN_TUNGGU = "Sebentar ya, lagi dipikirin dulu... ⏳";

const SYSTEM_PROMPT = `Kamu adalah chatbot WhatsApp untuk siswa SMK.
Jawab dalam bahasa Indonesia/bahasa inggris yang santai, natural, singkat, dan jelas.
Maksimal 2-3 kalimat. Jangan gunakan Markdown. Langsung ke inti, jangan mengulang pertanyaan.
Untuk soal sekolah beri jawaban + penjelasan singkat; untuk hitungan beri hasil + cara singkat.`;

const terakhir = new Map(); // id pengirim -> waktu pesan terakhir
const menolakThinking = new Set(); // model yang menolak pengaturan thinking

const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));

// Batasi waktu tunggu sebuah promise
function denganBatas(promise, ms) {
  let timer;
  const batas = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout setelah ${ms} ms`)), ms);
  });
  return Promise.race([promise, batas]).finally(() => clearTimeout(timer));
}

// Error sementara yang layak dicoba ulang (timeout sengaja TIDAK diulang)
function bisaDiulang(err) {
  const kode = Number(err?.status ?? err?.code);
  if ([429, 500, 502, 503, 504].includes(kode)) return true;
  return /UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded|ECONNRESET|fetch failed/i.test(
    String(err?.message || ""),
  );
}

// Satu panggilan ke Gemini (thinking dimatikan kalau model mendukung)
async function panggilGemini(model, pesan) {
  const buatConfig = (denganThinking) => ({
    systemInstruction: SYSTEM_PROMPT, // harus di dalam config
    maxOutputTokens: 400,
    temperature: 0.7,
    ...(denganThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
  });

  const coba = async (denganThinking) => {
    const res = await ai.models.generateContent({
      model,
      contents: pesan,
      config: buatConfig(denganThinking),
    });
    return res.text?.trim() || "";
  };

  if (menolakThinking.has(model)) return coba(false);

  try {
    return await coba(true);
  } catch (err) {
    const kode = Number(err?.status ?? err?.code);
    if (kode === 400 && /thinking/i.test(String(err.message))) {
      console.log(
        `[gemini] ${model} menolak pengaturan thinking, mencoba tanpa itu.`,
      );
      menolakThinking.add(model);
      return coba(false);
    }
    throw err;
  }
}

// Satu model: maksimal 2 percobaan, retry singkat hanya untuk 503/429 dkk.
async function cobaModel(model, pesan) {
  for (let i = 1; i <= 2; i++) {
    const mulai = Date.now();
    try {
      const teks = await denganBatas(panggilGemini(model, pesan), TIMEOUT_MS);
      if (!teks) throw new Error("Jawaban kosong dari Gemini");
      console.log(`[gemini] ${model} OK dalam ${Date.now() - mulai} ms`);
      return teks;
    } catch (err) {
      console.error(
        `[gemini] ${model} percobaan ${i}/2 gagal (${Date.now() - mulai} ms): ${String(err.message).slice(0, 120)}`,
      );
      if (i === 2 || !bisaDiulang(err)) throw err;
      await tunggu(600);
    }
  }
}

// Model utama jalan dulu. Cadangan ikut jalan jika utama gagal ATAU lambat
// (lewat HEDGE_MS). Jawaban yang datang pertama dipakai.
function balapan(pesan) {
  return new Promise((resolve, reject) => {
    const models = [...new Set([MODEL_UTAMA, MODEL_CADANGAN])];
    let selesai = false;
    let gagal = 0;
    let dimulai = 0;
    let errTerakhir;
    let timer;

    const mulai = (i) => {
      if (selesai || i >= models.length || dimulai > i) return;
      dimulai = i + 1;
      const model = models[i];

      cobaModel(model, pesan)
        .then((teks) => {
          if (selesai) return;
          selesai = true;
          clearTimeout(timer);
          resolve({ teks, model });
        })
        .catch((err) => {
          errTerakhir = err;
          gagal++;
          if (selesai) return;
          mulai(i + 1); // model berikutnya langsung jalan jika belum
          if (gagal >= models.length) {
            selesai = true;
            clearTimeout(timer);
            reject(errTerakhir);
          }
        });
    };

    mulai(0);
    if (models.length > 1) timer = setTimeout(() => mulai(1), HEDGE_MS);
  });
}

async function jawab(ctx, pesan) {
  if (ctx.type !== "chat" || !pesan) {
    await ctx.reply(
      'Maaf, aku cuma bisa membaca pesan teks. Ketik "bantuan" untuk melihat menu.',
    );
    return;
  }

  if (pesan.length > 1000) {
    await ctx.reply("Pesannya terlalu panjang, coba dipersingkat ya.");
    return;
  }

  const sekarang = Date.now();
  if (sekarang - (terakhir.get(ctx.from) || 0) < COOLDOWN_MS) return;
  terakhir.set(ctx.from, sekarang);

  // Indikator "sedang mengetik" jalan paralel, tidak menunda panggilan AI
  const mengetik = ctx.mengetik
    ? ctx.mengetik()
    : Promise.resolve(async () => {});

  // Satu kali pesan "sebentar ya" jika jawaban belum datang
  const notif = setTimeout(() => {
    Promise.resolve(ctx.reply(PESAN_TUNGGU)).catch(() => {});
  }, NOTIF_MS);

  let hasil = null;
  try {
    hasil = await balapan(pesan);
    console.log(`[gemini] jawaban dipakai dari model ${hasil.model}`);
  } catch (err) {
    console.error(
      "[gemini] semua model gagal:",
      String(err?.message).slice(0, 150),
    );
  } finally {
    clearTimeout(notif);
    try {
      const berhenti = await mengetik;
      await berhenti();
    } catch (_) {}
  }

  // Balasan dikirim di luar try Gemini; pengguna selalu dapat jawaban
  await ctx.reply(hasil ? hasil.teks : PESAN_SIBUK);
}

module.exports = { jawab };
