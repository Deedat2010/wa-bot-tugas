const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { dbPath } = require("./config");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
  CREATE TABLE IF NOT EXISTS tugas (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    nomor_whatsapp TEXT    NOT NULL,
    kegiatan       TEXT    NOT NULL,
    mapel          TEXT,
    deskripsi      TEXT,
    tanggal        TEXT,
    jam            TEXT,
    reminder_h1    INTEGER NOT NULL DEFAULT 0,
    reminder_1jam  INTEGER NOT NULL DEFAULT 0,
    selesai        INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tugas_user
    ON tugas (nomor_whatsapp, selesai);

  CREATE INDEX IF NOT EXISTS idx_tugas_reminder
    ON tugas (selesai, tanggal);
`);

module.exports = db;
