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
      objednavka_id TEXT
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
      popis TEXT
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
  `);

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
    if (c === 'polozky') return JSON.stringify(data[c] || []);
    return data[c] != null ? data[c] : null;
  });
  db.prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`).run(...vals);
  return getById(table, data.id);
}

function update(table, id, data) {
  const sets = Object.keys(data).map(c => `${c} = ?`).join(', ');
  const vals = Object.keys(data).map(c => {
    if (c === 'polozky') return JSON.stringify(data[c] || []);
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
  return row;
}

// Column name mapping (camelCase <-> snake_case)
const colMap = {
  createdAt: 'created_at', createdBy: 'created_by',
  castkaBezDph: 'castka_bez_dph', dphSazba: 'dph_sazba',
  objednavkaId: 'objednavka_id', datumPrijmu: 'datum_prijmu'
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

module.exports = {
  init, getAll: getAllMapped, getById: (t, id) => fromDb(getById(t, id)),
  insert: insertMapped, update: updateMapped, remove
};
