const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Store DB in user data directory for Electron, or project root for server mode
function getDbPath() {
  try {
    const { app } = require('electron');
    const dir = app.getPath('userData');
    return path.join(dir, 'progresklima.db');
  } catch (e) {
    return path.join(__dirname, 'progresklima.db');
  }
}

let db;

function init() {
  db = new Database(getDbPath());
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS objednavky (
      id TEXT PRIMARY KEY,
      cislo TEXT NOT NULL,
      zakaznik TEXT,
      kontakt TEXT,
      popis TEXT,
      castka REAL DEFAULT 0,
      stav TEXT DEFAULT 'nová',
      created_at TEXT,
      termin TEXT,
      created_by TEXT,
      poznamka TEXT,
      polozky TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS faktury (
      id TEXT PRIMARY KEY,
      cislo TEXT NOT NULL,
      zakaznik TEXT,
      ico TEXT,
      dic TEXT,
      adresa TEXT,
      castka_bez_dph REAL DEFAULT 0,
      dph_sazba REAL DEFAULT 21,
      castka REAL DEFAULT 0,
      vs TEXT,
      platba TEXT DEFAULT 'převodem',
      stav TEXT DEFAULT 'vystavená',
      splatnost TEXT,
      created_at TEXT,
      created_by TEXT,
      poznamka TEXT,
      polozky TEXT DEFAULT '[]',
      objednavka_id TEXT,
      zakazka_id TEXT
    );

    CREATE TABLE IF NOT EXISTS zakazky (
      id TEXT PRIMARY KEY,
      cislo TEXT NOT NULL,
      zakaznik TEXT,
      kontakt TEXT,
      adresa TEXT,
      technik TEXT,
      stav TEXT DEFAULT 'nová',
      created_at TEXT,
      popis TEXT,
      termin TEXT,
      priorita TEXT DEFAULT 'normální'
    );

    CREATE TABLE IF NOT EXISTS prijemky (
      id TEXT PRIMARY KEY,
      cislo TEXT NOT NULL,
      objednavka_id TEXT,
      zakaznik TEXT,
      datum_prijmu TEXT,
      stav TEXT DEFAULT 'nová',
      created_at TEXT,
      created_by TEXT,
      poznamka TEXT,
      polozky TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      changes TEXT,
      user_name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      entity_type TEXT,
      entity_id TEXT,
      target_user TEXT,
      read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cislovani (
      prefix TEXT PRIMARY KEY,
      rok INTEGER NOT NULL,
      posledni INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS zakaznici (
      id TEXT PRIMARY KEY,
      nazev TEXT NOT NULL,
      ico TEXT,
      dic TEXT,
      adresa TEXT,
      kontakt TEXT,
      email TEXT,
      telefon TEXT,
      poznamka TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cenik (
      id TEXT PRIMARY KEY,
      nazev TEXT NOT NULL,
      kategorie TEXT DEFAULT 'jiné',
      jednotka TEXT DEFAULT 'ks',
      cena REAL DEFAULT 0,
      popis TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sablony (
      id TEXT PRIMARY KEY,
      nazev TEXT NOT NULL,
      typ TEXT NOT NULL,
      data TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Add columns if they don't exist (migration for existing DBs)
  try { db.exec('ALTER TABLE zakazky ADD COLUMN termin TEXT'); } catch(e) {}
  try { db.exec('ALTER TABLE zakazky ADD COLUMN priorita TEXT DEFAULT \'normální\''); } catch(e) {}
  try { db.exec('ALTER TABLE faktury ADD COLUMN zakazka_id TEXT'); } catch(e) {}

  return db;
}

// Generic CRUD helpers
function getAll(table) {
  const rows = db.prepare(`SELECT * FROM ${table} ORDER BY created_at DESC`).all();
  return rows.map(parseRow);
}

function getById(table, id) {
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  return row ? parseRow(row) : null;
}

function insert(table, data) {
  const cols = Object.keys(data);
  const placeholders = cols.map(() => '?').join(',');
  const vals = cols.map(c => {
    if (c === 'polozky' || c === 'changes') return JSON.stringify(data[c] || []);
    return data[c] != null ? data[c] : null;
  });
  db.prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`).run(...vals);
  return getById(table, data.id);
}

function update(table, id, data) {
  const sets = Object.keys(data).map(c => `${c} = ?`).join(', ');
  const vals = Object.keys(data).map(c => {
    if (c === 'polozky' || c === 'changes') return JSON.stringify(data[c] || []);
    return data[c] != null ? data[c] : null;
  });
  vals.push(id);
  db.prepare(`UPDATE ${table} SET ${sets} WHERE id = ?`).run(...vals);
  return getById(table, id);
}

function remove(table, id) {
  db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
}

function parseRow(row) {
  if (row.polozky && typeof row.polozky === 'string') {
    try { row.polozky = JSON.parse(row.polozky); } catch (e) { row.polozky = []; }
  }
  if (row.changes && typeof row.changes === 'string') {
    try { row.changes = JSON.parse(row.changes); } catch (e) { row.changes = {}; }
  }
  return row;
}

// Column name mapping (camelCase <-> snake_case)
const colMap = {
  createdAt: 'created_at', createdBy: 'created_by',
  castkaBezDph: 'castka_bez_dph', dphSazba: 'dph_sazba',
  objednavkaId: 'objednavka_id', datumPrijmu: 'datum_prijmu',
  zakazkaId: 'zakazka_id', entityType: 'entity_type',
  entityId: 'entity_id', userName: 'user_name',
  targetUser: 'target_user'
};
const colMapReverse = {};
Object.keys(colMap).forEach(k => { colMapReverse[colMap[k]] = k; });

function toDb(obj) {
  const out = {};
  Object.keys(obj).forEach(k => { out[colMap[k] || k] = obj[k]; });
  return out;
}

function fromDb(obj) {
  if (!obj) return obj;
  const out = {};
  Object.keys(obj).forEach(k => { out[colMapReverse[k] || k] = obj[k]; });
  return out;
}

function getAllMapped(table) {
  return getAll(table).map(fromDb);
}

function insertMapped(table, data) {
  return fromDb(insert(table, toDb(data)));
}

function updateMapped(table, id, data) {
  return fromDb(update(table, id, toDb(data)));
}

// ===== NEXT NUMBER (auto-incrementing) =====
function getNextNumber(prefix) {
  const year = new Date().getFullYear();
  const row = db.prepare('SELECT * FROM cislovani WHERE prefix = ?').get(prefix);
  let num;
  if (!row || row.rok !== year) {
    num = 1;
    db.prepare('INSERT OR REPLACE INTO cislovani (prefix, rok, posledni) VALUES (?, ?, ?)').run(prefix, year, num);
  } else {
    num = row.posledni + 1;
    db.prepare('UPDATE cislovani SET posledni = ? WHERE prefix = ?').run(num, prefix);
  }
  return `${prefix}-${year}-${String(num).padStart(4, '0')}`;
}

// ===== FULLTEXT SEARCH =====
function search(query) {
  const q = `%${query}%`;
  const results = [];

  const objs = db.prepare(`SELECT *, 'objednavky' as _type FROM objednavky
    WHERE cislo LIKE ? OR zakaznik LIKE ? OR popis LIKE ? OR poznamka LIKE ?`).all(q, q, q, q);
  objs.forEach(r => { r._type = 'objednavky'; results.push(fromDb(parseRow(r))); });

  const faks = db.prepare(`SELECT *, 'faktury' as _type FROM faktury
    WHERE cislo LIKE ? OR zakaznik LIKE ? OR ico LIKE ? OR vs LIKE ? OR poznamka LIKE ?`).all(q, q, q, q, q);
  faks.forEach(r => { r._type = 'faktury'; results.push(fromDb(parseRow(r))); });

  const zaks = db.prepare(`SELECT *, 'zakazky' as _type FROM zakazky
    WHERE cislo LIKE ? OR zakaznik LIKE ? OR adresa LIKE ? OR technik LIKE ? OR popis LIKE ?`).all(q, q, q, q, q);
  zaks.forEach(r => { r._type = 'zakazky'; results.push(fromDb(parseRow(r))); });

  const pris = db.prepare(`SELECT *, 'prijemky' as _type FROM prijemky
    WHERE cislo LIKE ? OR zakaznik LIKE ? OR poznamka LIKE ?`).all(q, q, q);
  pris.forEach(r => { r._type = 'prijemky'; results.push(fromDb(parseRow(r))); });

  return results;
}

// ===== AUDIT LOG =====
function addAuditLog(entityType, entityId, action, changes, userName) {
  db.prepare(`INSERT INTO audit_log (entity_type, entity_id, action, changes, user_name, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))`).run(
    entityType, entityId, action, JSON.stringify(changes || {}), userName || 'System'
  );
}

function getAuditLog(entityType, entityId) {
  const params = [];
  let sql = 'SELECT * FROM audit_log WHERE 1=1';
  if (entityType) { sql += ' AND entity_type = ?'; params.push(entityType); }
  if (entityId) { sql += ' AND entity_id = ?'; params.push(entityId); }
  sql += ' ORDER BY created_at DESC LIMIT 200';
  return db.prepare(sql).all(params).map(r => {
    if (r.changes && typeof r.changes === 'string') {
      try { r.changes = JSON.parse(r.changes); } catch(e) { r.changes = {}; }
    }
    return r;
  });
}

// ===== NOTIFICATIONS =====
function addNotification(type, title, message, entityType, entityId, targetUser) {
  db.prepare(`INSERT INTO notifications (type, title, message, entity_type, entity_id, target_user, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`).run(
    type, title, message || '', entityType || null, entityId || null, targetUser || null
  );
}

function getNotifications(unreadOnly) {
  let sql = 'SELECT * FROM notifications';
  if (unreadOnly) sql += ' WHERE read = 0';
  sql += ' ORDER BY created_at DESC LIMIT 50';
  return db.prepare(sql).all();
}

function markNotificationRead(id) {
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id);
}

function markAllNotificationsRead() {
  db.prepare('UPDATE notifications SET read = 1 WHERE read = 0').run();
}

// ===== DASHBOARD STATS =====
function getDashboardStats() {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const today = now.toISOString().split('T')[0];

  const objNove = db.prepare("SELECT COUNT(*) as c FROM objednavky WHERE stav = 'nová'").get().c;
  const objRealizace = db.prepare("SELECT COUNT(*) as c FROM objednavky WHERE stav = 'v realizaci'").get().c;
  const objMesic = db.prepare("SELECT COUNT(*) as c FROM objednavky WHERE created_at >= ?").get(monthStart).c;

  const fakNezaplacene = db.prepare("SELECT COUNT(*) as c FROM faktury WHERE stav IN ('vystavená','odeslaná')").get().c;
  const fakPoSplatnosti = db.prepare("SELECT COUNT(*) as c FROM faktury WHERE stav IN ('vystavená','odeslaná') AND splatnost < ?").get(today).c;
  const fakCelkem = db.prepare("SELECT COALESCE(SUM(castka),0) as s FROM faktury").get().s;
  const fakMesic = db.prepare("SELECT COALESCE(SUM(castka),0) as s FROM faktury WHERE created_at >= ?").get(monthStart).s;

  const zakAktivni = db.prepare("SELECT COUNT(*) as c FROM zakazky WHERE stav NOT IN ('dokončená','uzavřená','zrušená','fakturovaná')").get().c;
  const zakCelkem = db.prepare("SELECT COUNT(*) as c FROM zakazky").get().c;

  const priNove = db.prepare("SELECT COUNT(*) as c FROM prijemky WHERE stav = 'nová'").get().c;

  const unreadNotif = db.prepare("SELECT COUNT(*) as c FROM notifications WHERE read = 0").get().c;

  // Overdue invoices detail
  const overdueInvoices = db.prepare("SELECT id, cislo, zakaznik, castka, splatnost FROM faktury WHERE stav IN ('vystavená','odeslaná') AND splatnost < ? ORDER BY splatnost ASC").all(today);

  // Monthly revenue for last 6 months
  const monthlyRevenue = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ms = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const me = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const meStr = `${me.getFullYear()}-${String(me.getMonth() + 1).padStart(2, '0')}-${String(me.getDate()).padStart(2, '0')}`;
    const rev = db.prepare("SELECT COALESCE(SUM(castka),0) as s FROM faktury WHERE created_at >= ? AND created_at <= ?").get(ms, meStr + 'T23:59:59').s;
    monthlyRevenue.push({ month: ms, revenue: rev });
  }

  return {
    objNove, objRealizace, objMesic,
    fakNezaplacene, fakPoSplatnosti, fakCelkem, fakMesic,
    zakAktivni, zakCelkem, priNove,
    unreadNotif, overdueInvoices, monthlyRevenue
  };
}

// ===== BACKUP =====
function backupDatabase() {
  const dbPath = getDbPath();
  const data = fs.readFileSync(dbPath);
  return data;
}

function getExportData() {
  return {
    objednavky: getAll('objednavky').map(fromDb),
    faktury: getAll('faktury').map(fromDb),
    zakazky: getAll('zakazky').map(fromDb),
    prijemky: getAll('prijemky').map(fromDb),
    audit_log: getAuditLog(),
    exportedAt: new Date().toISOString()
  };
}

function importData(data) {
  const tables = ['objednavky', 'faktury', 'zakazky', 'prijemky'];
  let count = 0;
  tables.forEach(t => {
    if (data[t]) {
      data[t].forEach(item => {
        insert(t, toDb(item));
        count++;
      });
    }
  });
  return count;
}

module.exports = {
  init, getAll: getAllMapped, getById: (t, id) => fromDb(getById(t, id)),
  insert: insertMapped, update: updateMapped, remove,
  getNextNumber, search,
  addAuditLog, getAuditLog,
  addNotification, getNotifications, markNotificationRead, markAllNotificationsRead,
  getDashboardStats,
  backupDatabase, getExportData, importData
};
