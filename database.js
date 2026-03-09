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

    CREATE TABLE IF NOT EXISTS upominky (
      id TEXT PRIMARY KEY,
      faktura_id TEXT NOT NULL,
      cislo_upominky INTEGER DEFAULT 1,
      datum TEXT,
      castka REAL DEFAULT 0,
      stav TEXT DEFAULT 'vytvořena',
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

    CREATE TABLE IF NOT EXISTS vydejky (
      id TEXT PRIMARY KEY,
      cislo TEXT NOT NULL,
      objednavka_id TEXT,
      faktura_id TEXT,
      zakaznik TEXT,
      datum_vydeje TEXT,
      stav TEXT DEFAULT 'nová',
      created_at TEXT,
      created_by TEXT,
      poznamka TEXT,
      polozky TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS nabidky (
      id TEXT PRIMARY KEY,
      cislo TEXT NOT NULL,
      zakaznik TEXT,
      kontakt TEXT,
      adresa TEXT,
      popis TEXT,
      polozky TEXT DEFAULT '[]',
      castka REAL DEFAULT 0,
      platnost_do TEXT,
      stav TEXT DEFAULT 'nová',
      poznamka TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reklamace (
      id TEXT PRIMARY KEY,
      cislo TEXT NOT NULL,
      zakaznik TEXT,
      zakazka_id TEXT,
      faktura_id TEXT,
      zarizeni TEXT,
      popis_zavady TEXT,
      datum_prijmu TEXT,
      datum_vyreseni TEXT,
      stav TEXT DEFAULT 'přijatá',
      reseni TEXT,
      zaruka_do TEXT,
      naklady REAL DEFAULT 0,
      technik TEXT,
      poznamka TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dodavatele (
      id TEXT PRIMARY KEY,
      nazev TEXT NOT NULL,
      ico TEXT,
      dic TEXT,
      adresa TEXT,
      kontakt TEXT,
      email TEXT,
      telefon TEXT,
      web TEXT,
      kategorie TEXT DEFAULT 'jiné',
      hodnoceni INTEGER DEFAULT 3,
      poznamka TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vozidla (
      id TEXT PRIMARY KEY,
      spz TEXT NOT NULL,
      nazev TEXT,
      typ TEXT DEFAULT 'osobní',
      technik TEXT,
      stav TEXT DEFAULT 'aktivní',
      km_stav REAL DEFAULT 0,
      stk_do TEXT,
      pojisteni_do TEXT,
      poznamka TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vozidla_tankovani (
      id TEXT PRIMARY KEY,
      vozidlo_id TEXT NOT NULL,
      datum TEXT,
      litry REAL DEFAULT 0,
      cena REAL DEFAULT 0,
      km_stav REAL DEFAULT 0,
      poznamka TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS crm_zaznamy (
      id TEXT PRIMARY KEY,
      zakaznik_id TEXT NOT NULL,
      typ TEXT DEFAULT 'poznámka',
      predmet TEXT,
      obsah TEXT,
      datum TEXT,
      autor TEXT,
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
  datumVydeje: 'datum_vydeje', fakturaId: 'faktura_id',
  minMnozstvi: 'min_mnozstvi', cenaNakup: 'cena_nakup',
  cenaProdej: 'cena_prodej', skladId: 'sklad_id',
  zakaznikId: 'zakaznik_id', typZasahu: 'typ_zasahu',
  cisloUpominky: 'cislo_upominky', fakturaId: 'faktura_id',
  platnostDo: 'platnost_do', opisZavady: 'popis_zavady',
  datumVyreseni: 'datum_vyreseni', zarukaDo: 'zaruka_do',
  vozidloId: 'vozidlo_id', kmStav: 'km_stav',
  stkDo: 'stk_do', pojisteniDo: 'pojisteni_do'
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

// ===== ISDOC EXPORT (for accounting software) =====
function generateIsdoc(fakturaId) {
  const f = fromDb(getById('faktury', fakturaId));
  if (!f) return null;
  const polozky = f.polozky || [];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:isdoc:invoice:6.0.1" version="6.0.1">
  <DocumentType>1</DocumentType>
  <ID>${escXml(f.cislo)}</ID>
  <IssueDate>${f.createdAt ? f.createdAt.split('T')[0] : ''}</IssueDate>
  <TaxPointDate>${f.createdAt ? f.createdAt.split('T')[0] : ''}</TaxPointDate>
  <VATApplicable>true</VATApplicable>
  <Note>${escXml(f.poznamka || '')}</Note>
  <LocalCurrencyCode>CZK</LocalCurrencyCode>
  <LegalMonetaryTotal>
    <TaxExclusiveAmount>${f.castkaBezDph || 0}</TaxExclusiveAmount>
    <TaxInclusiveAmount>${f.castka || 0}</TaxInclusiveAmount>
    <AlreadyClaimedTaxExclusiveAmount>0</AlreadyClaimedTaxExclusiveAmount>
    <AlreadyClaimedTaxInclusiveAmount>0</AlreadyClaimedTaxInclusiveAmount>
    <DifferenceTaxExclusiveAmount>${f.castkaBezDph || 0}</DifferenceTaxExclusiveAmount>
    <DifferenceTaxInclusiveAmount>${f.castka || 0}</DifferenceTaxInclusiveAmount>
    <PayableRoundingAmount>0</PayableRoundingAmount>
    <PaidDepositsAmount>0</PaidDepositsAmount>
    <PayableAmount>${f.castka || 0}</PayableAmount>
  </LegalMonetaryTotal>
  <PaymentMeans>
    <Payment>
      <PaidAmount>${f.castka || 0}</PaidAmount>
      <PaymentMeansCode>42</PaymentMeansCode>
      <Details><PaymentDueDate>${f.splatnost ? f.splatnost.split('T')[0] : ''}</PaymentDueDate>
        <ID>${f.vs || ''}</ID>
      </Details>
    </Payment>
  </PaymentMeans>
  <AccountingSupplierParty>
    <Party><PartyName><Name>AC EURO servis s.r.o.</Name></PartyName></Party>
  </AccountingSupplierParty>
  <AccountingCustomerParty>
    <Party>
      <PartyIdentification><ID>${escXml(f.ico || '')}</ID></PartyIdentification>
      <PartyName><Name>${escXml(f.zakaznik || '')}</Name></PartyName>
      <PostalAddress><StreetName>${escXml(f.adresa || '')}</StreetName></PostalAddress>
    </Party>
  </AccountingCustomerParty>
  <InvoiceLines>
${polozky.map((p, i) => `    <InvoiceLine>
      <ID>${i + 1}</ID>
      <InvoicedQuantity>${p.mnozstvi || 1}</InvoicedQuantity>
      <LineExtensionAmount>${(p.mnozstvi || 1) * (p.cena || 0)}</LineExtensionAmount>
      <LineExtensionAmountTaxInclusive>${Math.round((p.mnozstvi || 1) * (p.cena || 0) * 1.21)}</LineExtensionAmountTaxInclusive>
      <Item><Description>${escXml(p.nazev || '')}</Description></Item>
    </InvoiceLine>`).join('\n')}
  </InvoiceLines>
</Invoice>`;
  return xml;
}

function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ===== AUTO BACKUP =====
function autoBackup() {
  const backupDir = path.join(path.dirname(getDbPath()), 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(backupDir, `progresklima-${ts}.json`);
  const data = getExportData();
  fs.writeFileSync(dest, JSON.stringify(data, null, 2));
  // Keep only last 10 backups
  const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json')).sort();
  while (files.length > 10) {
    fs.unlinkSync(path.join(backupDir, files.shift()));
  }
  return dest;
}

// ===== NABÍDKA → OBJEDNÁVKA =====
function convertNabidkaToObj(nabidkaId) {
  const n = fromDb(getById('nabidky', nabidkaId));
  if (!n) return null;
  const cislo = getNextNumber('OBJ');
  const objId = require('crypto').randomUUID();
  insertMapped('objednavky', {
    id: objId, cislo, zakaznik: n.zakaznik || '', kontakt: n.kontakt || '',
    popis: n.popis || '', castka: n.castka || 0,
    polozky: n.polozky || [], stav: 'nová',
    createdAt: new Date().toISOString(), createdBy: 'Z nabídky ' + n.cislo,
    poznamka: 'Vytvořeno z nabídky ' + n.cislo
  });
  updateMapped('nabidky', nabidkaId, { stav: 'přijatá' });
  return { id: objId, cislo };
}

module.exports = {
  init, getAll: getAllMapped, getById: (t, id) => fromDb(getById(t, id)),
  insert: insertMapped, update: updateMapped, remove,
  getNextNumber, search,
  addNotification, getNotifications, markNotificationRead, markAllNotificationsRead,
  getDashboardStats,
  backupDatabase, getExportData, importData,
  skladPohyb, getSkladPohyby, getSkladLowStock,
  generateUpominky, getCashFlow,
  generateIsdoc, autoBackup, convertNabidkaToObj
};
