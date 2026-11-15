const db = require("../db");

const stmtTambah = db.prepare(`
  INSERT INTO tugas (nomor_whatsapp, kegiatan, mapel, deskripsi, tanggal, jam)
  VALUES (@nomor, @kegiatan, @mapel, @deskripsi, @tanggal, @jam)
`);

const stmtDaftar = db.prepare(`
  SELECT id, kegiatan, mapel, deskripsi, tanggal, jam
  FROM tugas
  WHERE nomor_whatsapp = ? AND selesai = 0
  ORDER BY (tanggal IS NULL), tanggal ASC, jam ASC
  LIMIT 30
`);

const stmtSelesai = db.prepare(
  "UPDATE tugas SET selesai = 1 WHERE id = ? AND nomor_whatsapp = ?",
);

const stmtHapus = db.prepare(
  "DELETE FROM tugas WHERE id = ? AND nomor_whatsapp = ?",
);

const stmtKandidat = db.prepare(`
  SELECT id, nomor_whatsapp, kegiatan, mapel, tanggal, jam,
         reminder_h1, reminder_1jam
  FROM tugas
  WHERE selesai = 0
    AND tanggal IS NOT NULL
    AND jam IS NOT NULL
    AND (reminder_h1 = 0 OR reminder_1jam = 0)
    AND tanggal BETWEEN date('now', '-1 day') AND date('now', '+2 day')
`);

const stmtTandaiH1 = db.prepare(
  "UPDATE tugas SET reminder_h1 = 1 WHERE id = ?",
);
const stmtTandaiSemua = db.prepare(
  "UPDATE tugas SET reminder_h1 = 1, reminder_1jam = 1 WHERE id = ?",
);

module.exports = {
  tambahTugas: (data) => Number(stmtTambah.run(data).lastInsertRowid),
  daftarAktif: (nomor) => stmtDaftar.all(nomor),
  tandaiSelesai: (id, nomor) => Number(stmtSelesai.run(id, nomor).changes) > 0,
  hapusTugas: (id, nomor) => Number(stmtHapus.run(id, nomor).changes) > 0,
  kandidatReminder: () => stmtKandidat.all(),
  tandaiReminderH1: (id) => stmtTandaiH1.run(id),
  tandaiReminderSemua: (id) => stmtTandaiSemua.run(id),
};
