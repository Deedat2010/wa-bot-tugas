const repo = require("../repositories/tugasRepo");
const { parseTanggal, parseJam, formatTanggal } = require("../utils/tanggal");
const { modeTtlMs } = require("../config");

// ---------- Mode input kegiatan (dengan timeout) ----------
const modeKegiatan = new Map(); // id pengirim -> timestamp aktif

function aktifkanMode(id) {
  modeKegiatan.set(id, Date.now());
}

function matikanMode(id) {
  modeKegiatan.delete(id);
}

function modeAktif(id) {
  const t = modeKegiatan.get(id);
  if (!t) return false;
  if (Date.now() - t > modeTtlMs) {
    modeKegiatan.delete(id);
    return false;
  }
  return true;
}

// ---------- Tambah kegiatan ----------
const PETUNJUK = `Silakan isi kegiatan dengan format berikut:

Kegiatan:
Mapel:
Deskripsi:
Tanggal:
Jam:

Contoh:

Kegiatan: Tugas matematika
Mapel: Matematika
Deskripsi: Mengerjakan halaman 50
Tanggal: 21-11-2026
Jam: 20:00

Kegiatan wajib diisi. Bagian lain boleh dikosongkan.
Pengingat hanya aktif jika Tanggal dan Jam diisi.
Ketik "batal" untuk membatalkan.`;

async function mulaiTambah(message) {
  aktifkanMode(message.from);
  await message.reply(PETUNJUK);
}

function parseForm(teks) {
  const hasil = {
    kegiatan: null,
    mapel: null,
    deskripsi: null,
    tanggal: null,
    jam: null,
  };

  for (const baris of teks.split(/\r?\n/)) {
    const idx = baris.indexOf(":");
    if (idx === -1) continue;

    const label = baris.slice(0, idx).trim().toLowerCase();
    const nilai = baris.slice(idx + 1).trim(); // jam "20:00" aman

    if (Object.hasOwn(hasil, label)) {
      hasil[label] = nilai || null;
    }
  }
  return hasil;
}

async function prosesForm(message, pesan) {
  const id = message.from;

  if (pesan.toLowerCase() === "batal") {
    matikanMode(id);
    await message.reply("Input kegiatan dibatalkan.");
    return;
  }

  const form = parseForm(pesan);

  if (!form.kegiatan) {
    await message.reply(
      `Nama kegiatan belum diisi.\n\nContoh:\nKegiatan: Tugas matematika\n\nKirim ulang formnya, atau ketik "batal".`,
    );
    return;
  }

  let tanggalSql, jamSql;
  try {
    tanggalSql = parseTanggal(form.tanggal);
    jamSql = parseJam(form.jam);
  } catch (err) {
    await message.reply(
      `${err.message}\n\nKirim ulang formnya, atau ketik "batal".`,
    );
    return; // mode tetap aktif
  }

  const idBaru = repo.tambahTugas({
    nomor: id,
    kegiatan: form.kegiatan,
    mapel: form.mapel,
    deskripsi: form.deskripsi,
    tanggal: tanggalSql,
    jam: jamSql,
  });

  matikanMode(id);

  let balasan =
    `Kegiatan berhasil disimpan (ID: ${idBaru}).\n\n` +
    `Kegiatan: ${form.kegiatan}\n` +
    `Mapel: ${form.mapel || "-"}\n` +
    `Deskripsi: ${form.deskripsi || "-"}\n` +
    `Tanggal: ${formatTanggal(tanggalSql)}\n` +
    `Jam: ${jamSql || "-"}`;

  if (!tanggalSql || !jamSql) {
    balasan +=
      "\n\nCatatan: tanpa Tanggal dan Jam, pengingat tidak akan aktif.";
  }

  await message.reply(balasan);
}

// ---------- Lihat / selesai / hapus ----------
async function lihat(message) {
  const rows = repo.daftarAktif(message.from);

  if (rows.length === 0) {
    await message.reply("Belum ada kegiatan aktif.");
    return;
  }

  let hasil = "Daftar kegiatan kamu:\n\n";
  rows.forEach((d, i) => {
    hasil += `${i + 1}. ${d.kegiatan} (ID: ${d.id})\n`;
    hasil += `Mapel: ${d.mapel || "-"}\n`;
    hasil += `Deskripsi: ${d.deskripsi || "-"}\n`;
    hasil += `Tanggal: ${formatTanggal(d.tanggal)}\n`;
    hasil += `Jam: ${d.jam || "-"}\n\n`;
  });
  hasil += 'Ketik "selesai <ID>" atau "hapus <ID>".';

  await message.reply(hasil);
}

async function selesai(message, idTugas) {
  const ok = repo.tandaiSelesai(idTugas, message.from);
  await message.reply(
    ok ? "Kegiatan ditandai selesai ✅" : "ID tidak ditemukan.",
  );
}

async function hapus(message, idTugas) {
  const ok = repo.hapusTugas(idTugas, message.from);
  await message.reply(ok ? "Kegiatan dihapus 🗑️" : "ID tidak ditemukan.");
}

module.exports = { mulaiTambah, prosesForm, modeAktif, lihat, selesai, hapus };
