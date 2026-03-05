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

    CREATE TABLE IF NOT EXISTS sklad (
      id TEXT PRIMARY KEY,
      nazev TEXT NOT NULL,
      kod TEXT,
      kategorie TEXT DEFAULT 'jiné',
      jednotka TEXT DEFAULT 'ks',
      mnozstvi REAL DEFAULT 0,
      min_mnozstvi REAL DEFAULT 0,
      cena_nakup REAL DEFAULT 0,
      cena_prodej REAL DEFAULT 0,
      umisteni TEXT,
      poznamka TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sklad_pohyby (
      id TEXT PRIMARY KEY,
      sklad_id TEXT NOT NULL,
      typ TEXT NOT NULL,
      mnozstvi REAL NOT NULL,
      zakazka_id TEXT,
      poznamka TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS servis_historie (
      id TEXT PRIMARY KEY,
      zakaznik_id TEXT,
      zakazka_id TEXT,
      zarizeni TEXT,
      typ_zasahu TEXT DEFAULT 'servis',
      popis TEXT,
      technik TEXT,
      datum TEXT,
      naklady REAL DEFAULT 0,
      poznamka TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dochazka (
      id TEXT PRIMARY KEY,
      technik TEXT NOT NULL,
      zakazka_id TEXT,
      datum TEXT NOT NULL,
      hodiny REAL DEFAULT 0,
      popis TEXT,
      typ TEXT DEFAULT 'práce',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pravidelne_zakazky (
      id TEXT PRIMARY KEY,
      zakaznik_id TEXT,
      zakaznik TEXT,
      nazev TEXT NOT NULL,
      popis TEXT,
      technik TEXT,
      interval_mesice INTEGER DEFAULT 12,
      posledni_datum TEXT,
      pristi_datum TEXT,
      aktivni INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS upominky (
      id TEXT PRIMARY KEY,
      faktura_id TEXT NOT NULL,
      cislo_upominky INTEGER DEFAULT 1,
      datum TEXT,
      castka REAL DEFAULT 0,
      stav TEXT DEFAULT 'vytvořena',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workflow_rules (
      id TEXT PRIMARY KEY,
      nazev TEXT NOT NULL,
      trigger_entity TEXT NOT NULL,
      trigger_action TEXT NOT NULL,
      trigger_condition TEXT,
      action_type TEXT NOT NULL,
      action_data TEXT DEFAULT '{}',
      aktivni INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS fotodokumentace (
      id TEXT PRIMARY KEY,
      zakazka_id TEXT NOT NULL,
      nazev TEXT,
      typ TEXT DEFAULT 'foto',
      data TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS zalohove_faktury (
      id TEXT PRIMARY KEY,
      cislo TEXT NOT NULL,
      faktura_id TEXT,
      zakaznik TEXT,
      castka REAL DEFAULT 0,
      stav TEXT DEFAULT 'vystavená',
      splatnost TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      poznamka TEXT
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
    if (c === 'polozky' || c === 'changes' || c === 'data') return typeof data[c] === 'object' ? JSON.stringify(data[c] || {}) : (data[c] || null);
    return data[c] != null ? data[c] : null;
  });
  db.prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`).run(...vals);
  return getById(table, data.id);
}

function update(table, id, data) {
  const sets = Object.keys(data).map(c => `${c} = ?`).join(', ');
  const vals = Object.keys(data).map(c => {
    if (c === 'polozky' || c === 'changes' || c === 'data') return typeof data[c] === 'object' ? JSON.stringify(data[c] || {}) : (data[c] || null);
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
  if (row.data && typeof row.data === 'string') {
    try { row.data = JSON.parse(row.data); } catch (e) {}
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
  targetUser: 'target_user',
  minMnozstvi: 'min_mnozstvi', cenaNakup: 'cena_nakup',
  cenaProdej: 'cena_prodej', skladId: 'sklad_id',
  zakaznikId: 'zakaznik_id', typZasahu: 'typ_zasahu',
  intervalMesice: 'interval_mesice', posledniDatum: 'posledni_datum',
  pristiDatum: 'pristi_datum', triggerEntity: 'trigger_entity',
  triggerAction: 'trigger_action', triggerCondition: 'trigger_condition',
  actionType: 'action_type', actionData: 'action_data',
  cisloUpominky: 'cislo_upominky', fakturaId: 'faktura_id'
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

// ===== SKLAD (inventory) =====
function skladPohyb(skladId, typ, mnozstvi, zakazkaId, poznamka, createdBy) {
  const id = require('crypto').randomUUID();
  db.prepare(`INSERT INTO sklad_pohyby (id, sklad_id, typ, mnozstvi, zakazka_id, poznamka, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`).run(id, skladId, typ, mnozstvi, zakazkaId || null, poznamka || '', createdBy || 'System');
  const sign = typ === 'příjem' ? 1 : -1;
  db.prepare('UPDATE sklad SET mnozstvi = mnozstvi + ? WHERE id = ?').run(sign * mnozstvi, skladId);
  return id;
}

function getSkladPohyby(skladId) {
  let sql = 'SELECT * FROM sklad_pohyby';
  const params = [];
  if (skladId) { sql += ' WHERE sklad_id = ?'; params.push(skladId); }
  sql += ' ORDER BY created_at DESC LIMIT 200';
  return db.prepare(sql).all(...params);
}

function getSkladLowStock() {
  return db.prepare('SELECT * FROM sklad WHERE mnozstvi <= min_mnozstvi AND min_mnozstvi > 0 ORDER BY nazev').all();
}

// ===== UPOMÍNKY (reminders) =====
function generateUpominky() {
  const today = new Date().toISOString().split('T')[0];
  const overdue = db.prepare("SELECT * FROM faktury WHERE stav IN ('vystavená','odeslaná') AND splatnost < ?").all(today);
  const created = [];
  overdue.forEach(f => {
    const existing = db.prepare('SELECT MAX(cislo_upominky) as mx FROM upominky WHERE faktura_id = ?').get(f.id);
    const next = (existing && existing.mx ? existing.mx : 0) + 1;
    if (next <= 3) {
      const id = require('crypto').randomUUID();
      db.prepare('INSERT INTO upominky (id, faktura_id, cislo_upominky, datum, castka, stav, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'))').run(
        id, f.id, next, today, f.castka || 0, 'vytvořena'
      );
      addNotification('upominka', `${next}. upomínka: ${f.cislo}`, `Faktura ${f.cislo} - ${f.zakaznik || ''} je po splatnosti.`, 'faktury', f.id);
      created.push({ id, faktura: f.cislo, cisloUpominky: next });
    }
  });
  return created;
}

// ===== CASH-FLOW =====
function getCashFlow() {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= -3; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ms = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const me = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const meStr = `${me.getFullYear()}-${String(me.getMonth() + 1).padStart(2, '0')}-${String(me.getDate()).padStart(2, '0')}`;

    const prijmy = db.prepare("SELECT COALESCE(SUM(castka),0) as s FROM faktury WHERE stav='zaplacená' AND created_at >= ? AND created_at <= ?").get(ms, meStr + 'T23:59:59').s;
    const vydaje = db.prepare("SELECT COALESCE(SUM(cena_nakup * mnozstvi),0) as s FROM sklad_pohyby sp JOIN sklad s ON sp.sklad_id=s.id WHERE sp.typ='příjem' AND sp.created_at >= ? AND sp.created_at <= ?").get(ms, meStr + 'T23:59:59').s;

    // Future: expected from unpaid invoices
    const ocekavane = i < 0 ? db.prepare("SELECT COALESCE(SUM(castka),0) as s FROM faktury WHERE stav IN ('vystavená','odeslaná') AND splatnost >= ? AND splatnost <= ?").get(ms, meStr).s : 0;

    months.push({ month: ms, prijmy, vydaje, ocekavane, saldo: prijmy - vydaje });
  }
  return months;
}

// ===== PRAVIDELNÉ ZAKÁZKY =====
function checkPravidelneZakazky() {
  const today = new Date().toISOString().split('T')[0];
  const due = db.prepare("SELECT * FROM pravidelne_zakazky WHERE aktivni = 1 AND (pristi_datum IS NULL OR pristi_datum <= ?)").all(today);
  const created = [];
  due.forEach(pz => {
    const cislo = getNextNumber('ZAK');
    const zakId = require('crypto').randomUUID();
    insert('zakazky', {
      id: zakId, cislo, zakaznik: pz.zakaznik || '', kontakt: '', adresa: '',
      technik: pz.technik || '', stav: 'nová', created_at: new Date().toISOString(),
      popis: pz.popis || pz.nazev, termin: null, priorita: 'normální'
    });
    // Update next date
    const nextDate = new Date();
    nextDate.setMonth(nextDate.getMonth() + (pz.interval_mesice || 12));
    db.prepare('UPDATE pravidelne_zakazky SET posledni_datum = ?, pristi_datum = ? WHERE id = ?').run(today, nextDate.toISOString().split('T')[0], pz.id);
    addNotification('pravidelna_zakazka', `Pravidelná zakázka: ${pz.nazev}`, `Vytvořena zakázka ${cislo} pro ${pz.zakaznik || ''}`, 'zakazky', zakId);
    created.push({ id: zakId, cislo, nazev: pz.nazev });
  });
  return created;
}

// ===== WORKFLOW ENGINE =====
function executeWorkflow(entityType, action, entityData) {
  const rules = db.prepare("SELECT * FROM workflow_rules WHERE trigger_entity = ? AND trigger_action = ? AND aktivni = 1").all(entityType, action);
  const results = [];
  rules.forEach(rule => {
    try {
      let condOk = true;
      if (rule.trigger_condition) {
        const cond = JSON.parse(rule.trigger_condition);
        Object.keys(cond).forEach(k => {
          if (entityData[k] !== cond[k]) condOk = false;
        });
      }
      if (!condOk) return;
      const actionData = JSON.parse(rule.action_data || '{}');
      if (rule.action_type === 'create_zakazka') {
        const cislo = getNextNumber('ZAK');
        const zakId = require('crypto').randomUUID();
        insert('zakazky', {
          id: zakId, cislo, zakaznik: entityData.zakaznik || '', kontakt: entityData.kontakt || '',
          adresa: actionData.adresa || '', technik: actionData.technik || '',
          stav: 'nová', created_at: new Date().toISOString(),
          popis: actionData.popis || entityData.popis || '', termin: null, priorita: actionData.priorita || 'normální'
        });
        results.push({ rule: rule.nazev, action: 'created_zakazka', id: zakId, cislo });
      } else if (rule.action_type === 'create_faktura') {
        const cislo = getNextNumber('FAK');
        const fakId = require('crypto').randomUUID();
        insert('faktury', {
          id: fakId, cislo, zakaznik: entityData.zakaznik || '', ico: entityData.ico || '',
          dic: entityData.dic || '', adresa: entityData.adresa || '',
          castka_bez_dph: entityData.castka || 0, dph_sazba: 21,
          castka: Math.round((entityData.castka || 0) * 1.21),
          vs: cislo.replace(/\D/g, ''), platba: 'převodem',
          stav: 'vystavená', splatnost: null,
          created_at: new Date().toISOString(), created_by: 'Workflow',
          poznamka: 'Automaticky vytvořeno workflow', polozky: '[]',
          objednavka_id: entityData.id || null, zakazka_id: null
        });
        results.push({ rule: rule.nazev, action: 'created_faktura', id: fakId, cislo });
      } else if (rule.action_type === 'notification') {
        addNotification('workflow', actionData.title || rule.nazev, actionData.message || '', entityType, entityData.id);
        results.push({ rule: rule.nazev, action: 'notification' });
      } else if (rule.action_type === 'change_stav') {
        if (actionData.target_entity && actionData.new_stav) {
          update(actionData.target_entity, entityData.id, { stav: actionData.new_stav });
          results.push({ rule: rule.nazev, action: 'changed_stav', stav: actionData.new_stav });
        }
      }
    } catch (e) { /* skip broken rules */ }
  });
  return results;
}

module.exports = {
  init, getAll: getAllMapped, getById: (t, id) => fromDb(getById(t, id)),
  insert: insertMapped, update: updateMapped, remove,
  getNextNumber, search,
  addAuditLog, getAuditLog,
  addNotification, getNotifications, markNotificationRead, markAllNotificationsRead,
  getDashboardStats,
  backupDatabase, getExportData, importData,
  skladPohyb, getSkladPohyby, getSkladLowStock,
  generateUpominky, getCashFlow,
  checkPravidelneZakazky, executeWorkflow
};
