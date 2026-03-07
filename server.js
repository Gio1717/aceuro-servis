const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database
db.init();

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mode: 'server' });
});

// ===== DASHBOARD STATS =====
app.get('/api/dashboard', (req, res) => {
  try {
    res.json(db.getDashboardStats());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== FULLTEXT SEARCH =====
app.get('/api/search', (req, res) => {
  try {
    const q = req.query.q || '';
    if (q.length < 2) return res.json([]);
    res.json(db.search(q));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== AUTO-NUMBERING =====
app.get('/api/next-number/:prefix', (req, res) => {
  try {
    res.json({ cislo: db.getNextNumber(req.params.prefix) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== NOTIFICATIONS =====
app.get('/api/notifications', (req, res) => {
  try {
    res.json(db.getNotifications(req.query.unread === '1'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/notifications/:id/read', (req, res) => {
  try {
    db.markNotificationRead(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/notifications/read-all', (req, res) => {
  try {
    db.markAllNotificationsRead();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== BACKUP & RESTORE =====
app.get('/api/backup/json', (req, res) => {
  try {
    const data = db.getExportData();
    res.setHeader('Content-Disposition', 'attachment; filename=progresklima-backup-' + new Date().toISOString().split('T')[0] + '.json');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/restore/json', (req, res) => {
  try {
    const count = db.importData(req.body);
    res.json({ ok: true, imported: count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== SKLAD POHYBY =====
app.post('/api/sklad/:id/pohyb', (req, res) => {
  try {
    const { typ, mnozstvi, zakazkaId, poznamka, createdBy } = req.body;
    const pid = db.skladPohyb(req.params.id, typ, mnozstvi, zakazkaId, poznamka, createdBy);
    res.json({ ok: true, id: pid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/sklad/:id/pohyby', (req, res) => {
  try { res.json(db.getSkladPohyby(req.params.id)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/sklad-low-stock', (req, res) => {
  try { res.json(db.getSkladLowStock()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== UPOMÍNKY (auto-generate) =====
app.post('/api/upominky/generate', (req, res) => {
  try { res.json(db.generateUpominky()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== CASH FLOW =====
app.get('/api/cashflow', (req, res) => {
  try { res.json(db.getCashFlow()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== FIO BANKA =====
app.post('/api/fio/check', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });
    const today = new Date();
    const from = new Date(today.getTime() - 30*24*60*60*1000).toISOString().split('T')[0];
    const to = today.toISOString().split('T')[0];
    const url = `https://fioapi.fio.cz/v1/rest/periods/${token}/${from}/${to}/transactions.json`;
    const https = require('https');
    const data = await new Promise((resolve, reject) => {
      https.get(url, r => {
        let d = ''; r.on('data', c => d += c); r.on('end', () => resolve(d));
      }).on('error', reject);
    });
    const json = JSON.parse(data);
    const txs = json.accountStatement && json.accountStatement.transactionList && json.accountStatement.transactionList.transaction || [];
    // Try to match with invoices by VS
    const matched = [];
    txs.forEach(tx => {
      const vs = tx.column5 ? String(tx.column5.value) : '';
      const amount = tx.column1 ? tx.column1.value : 0;
      if (vs && amount > 0) {
        matched.push({ vs, amount, date: tx.column0 ? tx.column0.value : '', counterparty: tx.column10 ? tx.column10.value : '' });
      }
    });
    res.json({ transactions: matched, total: txs.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/fio/match', (req, res) => {
  try {
    const { matches } = req.body; // [{fakturaId, vs, amount}]
    const results = [];
    (matches || []).forEach(m => {
      const fak = db.getById('faktury', m.fakturaId);
      if (fak) {
        db.update('faktury', m.fakturaId, { stav: 'zaplacená' });
        results.push({ fakturaId: m.fakturaId, status: 'matched' });
      }
    });
    res.json({ matched: results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== FOTODOKUMENTACE =====
app.post('/api/fotodokumentace/upload', (req, res) => {
  try {
    const { zakazkaId, nazev, typ, data } = req.body;
    const id = require('crypto').randomUUID();
    db.insert('fotodokumentace', { id, zakazka_id: zakazkaId, nazev: nazev || 'foto', typ: typ || 'foto', data, created_at: new Date().toISOString() });
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/fotodokumentace/zakazka/:id', (req, res) => {
  try {
    const rows = db.getAll('fotodokumentace').filter(f => f.zakazkaId === req.params.id || f.zakazka_id === req.params.id);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== XLSX IMPORT =====
app.post('/api/import/xlsx', (req, res) => {
  try {
    const { entity, rows } = req.body;
    if (!entity || !rows || !Array.isArray(rows)) return res.status(400).json({ error: 'entity and rows required' });
    let count = 0;
    rows.forEach(row => {
      row.id = row.id || require('crypto').randomUUID();
      row.created_at = row.created_at || new Date().toISOString();
      db.insert(entity, row);
      count++;
    });
    res.json({ ok: true, imported: count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== ISDOC EXPORT =====
app.get('/api/faktury/:id/isdoc', (req, res) => {
  try {
    const xml = db.generateIsdoc(req.params.id);
    if (!xml) return res.status(404).json({ error: 'Faktura not found' });
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename=faktura-${req.params.id}.isdoc`);
    res.send(xml);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== AUTO BACKUP =====
app.post('/api/backup/auto', (req, res) => {
  try {
    const dest = db.autoBackup();
    res.json({ ok: true, path: dest });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== NABÍDKA → OBJEDNÁVKA =====
app.post('/api/nabidky/:id/convert', (req, res) => {
  try {
    const result = db.convertNabidkaToObj(req.params.id);
    if (!result) return res.status(404).json({ error: 'Nabídka not found' });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== VOZIDLA TANKOVÁNÍ =====
app.get('/api/vozidla/:id/tankovani', (req, res) => {
  try {
    const all = db.getAll('vozidla_tankovani').filter(t => t.vozidloId === req.params.id);
    res.json(all);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== CRM ZÁZNAMY =====
app.get('/api/crm/:zakaznikId', (req, res) => {
  try {
    const all = db.getAll('crm_zaznamy').filter(c => c.zakaznikId === req.params.zakaznikId);
    res.json(all);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== QR KÓDY SKLADU =====
app.get('/api/sklad/:id/qr', (req, res) => {
  try {
    const item = db.getById('sklad', req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    // Return data for QR code generation on client side
    res.json({ text: `SKLAD|${item.id}|${item.kod || ''}|${item.nazev}|${item.mnozstvi}${item.jednotka || 'ks'}`, item });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Generic CRUD routes for each entity
const entities = ['objednavky', 'faktury', 'zakazky', 'prijemky', 'zakaznici', 'cenik', 'sablony',
  'sklad', 'sklad_pohyby', 'servis_historie', 'upominky', 'fotodokumentace', 'zalohove_faktury',
  'nabidky', 'reklamace', 'dodavatele', 'vozidla', 'vozidla_tankovani', 'crm_zaznamy'];

entities.forEach(entity => {
  // List all
  app.get(`/api/${entity}`, (req, res) => {
    try {
      res.json(db.getAll(entity));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get one
  app.get(`/api/${entity}/:id`, (req, res) => {
    try {
      const item = db.getById(entity, req.params.id);
      if (!item) return res.status(404).json({ error: 'Not found' });
      res.json(item);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Create
  app.post(`/api/${entity}`, (req, res) => {
    try {
      const item = db.insert(entity, req.body);
      res.status(201).json(item);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Update
  app.put(`/api/${entity}/:id`, (req, res) => {
    try {
      const item = db.update(entity, req.params.id, req.body);
      res.json(item);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Delete
  app.delete(`/api/${entity}/:id`, (req, res) => {
    try {
      db.remove(entity, req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

// Bulk import (for initial data migration)
app.post('/api/import', (req, res) => {
  try {
    const { objednavky, faktury, zakazky, prijemky } = req.body;
    let count = 0;
    if (objednavky) objednavky.forEach(o => { db.insert('objednavky', o); count++; });
    if (faktury) faktury.forEach(f => { db.insert('faktury', f); count++; });
    if (zakazky) zakazky.forEach(z => { db.insert('zakazky', z); count++; });
    if (prijemky) prijemky.forEach(p => { db.insert('prijemky', p); count++; });
    res.json({ ok: true, imported: count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Only start listening if not required by Electron
if (!module.parent && require.main === module) {
  app.listen(PORT, () => {
    console.log(`Progresklima server běží na http://localhost:${PORT}`);
  });
}

module.exports = app;
