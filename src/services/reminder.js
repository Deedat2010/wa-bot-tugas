const cron = require("node-cron");
const repo = require("../repositories/tugasRepo");
const { formatTanggal, waktuKegiatan } = require("../utils/tanggal");
const { timezone, tzOffset } = require("../config");

let sedangJalan = false; // cegah proses tumpang tindih
let sudahDijadwalkan = false; // cegah jadwal ganda jika "ready" terpicu ulang

async function cekReminder(client) {
  if (sedangJalan) return;
  sedangJalan = true;

  try {
    const sekarang = Date.now();

    for (const d of repo.kandidatReminder()) {
      try {
        const sisa = Math.floor(
          (waktuKegiatan(d.tanggal, d.jam, tzOffset).getTime() - sekarang) /
            1000,
        );
        if (sisa <= 0) continue; // sudah lewat

        const info =
          `Kegiatan: ${d.kegiatan}\n` +
          `Mapel: ${d.mapel || "-"}\n` +
          `Tanggal: ${formatTanggal(d.tanggal)}\n` +
          `Jam: ${d.jam}`;

        if (!d.reminder_1jam && sisa <= 3600) {
          await client.sendMessage(
            d.nomor_whatsapp,
            `⏰ Pengingat 1 Jam Lagi\n\n${info}\n\nKegiatannya dimulai sekitar 1 jam lagi.`,
          );
          repo.tandaiReminderSemua(d.id); // H-1 ikut ditandai agar tidak dobel
          console.log("Reminder 1 jam dikirim:", d.kegiatan);
        } else if (!d.reminder_h1 && sisa > 3600 && sisa <= 86400) {
          await client.sendMessage(
            d.nomor_whatsapp,
            `⏰ Pengingat H-1\n\n${info}\n\nKurang dari 24 jam lagi ada kegiatan ini. Jangan lupa dipersiapkan.`,
          );
          repo.tandaiReminderH1(d.id);
          console.log("Reminder H-1 dikirim:", d.kegiatan);
        }
      } catch (err) {
        // Satu tugas gagal tidak menghentikan tugas lain
        console.error(`Reminder gagal untuk tugas ${d.id}:`, err.message);
      }
    }
  } catch (error) {
    console.error("Error reminder:", error);
  } finally {
    sedangJalan = false;
  }
}

function mulaiReminder(client) {
  if (sudahDijadwalkan) return;
  sudahDijadwalkan = true;

  cron.schedule("* * * * *", () => cekReminder(client), { timezone });
  console.log("Scheduler reminder aktif.");
}

module.exports = { mulaiReminder };
