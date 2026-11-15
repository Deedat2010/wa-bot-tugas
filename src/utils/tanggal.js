const pad = (n) => String(n).padStart(2, "0");

// "21-11-2026" -> "2026-11-21" (format SQLite). Melempar Error jika tidak valid.
function parseTanggal(input) {
  if (!input) return null;

  const m = input.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
  if (!m) {
    throw new Error("Format tanggal harus DD-MM-YYYY, contoh: 21-11-2026");
  }

  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);

  const dt = new Date(y, mo - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo - 1 ||
    dt.getDate() !== d
  ) {
    throw new Error("Tanggal tidak valid.");
  }

  return `${y}-${pad(mo)}-${pad(d)}`;
}

// "20:00" atau "20.00" -> "20:00"
function parseJam(input) {
  if (!input) return null;

  const m = input.match(/^([01]?\d|2[0-3])[:.]([0-5]\d)$/);
  if (!m) throw new Error("Format jam harus HH:MM, contoh: 20:00");

  return `${pad(m[1])}:${m[2]}`;
}

// "2026-11-21" -> "21-11-2026"
function formatTanggal(sqlDate) {
  if (!sqlDate) return "-";
  const [y, m, d] = sqlDate.split("-");
  return `${d}-${m}-${y}`;
}

// Gabungkan tanggal + jam + offset zona waktu menjadi objek Date yang akurat.
function waktuKegiatan(tanggal, jam, offset) {
  return new Date(`${tanggal}T${jam}:00${offset}`);
}

module.exports = { parseTanggal, parseJam, formatTanggal, waktuKegiatan };